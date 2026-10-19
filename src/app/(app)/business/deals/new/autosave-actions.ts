"use server";
import {z} from "zod";
import {requireSession} from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import {revalidatePath} from "next/cache";
import type {TradeInInput} from "@/lib/trade-ins";
export interface SheetSnapshot {
  sale:{customerId:string;vehicleId:string;salespersonId:string;locationId:string;leadId:string;source:string;salePrice:number;vatScheme:string;priceReason:string;notes:string;sourceQuoteId?:string};
  terms:{quoteTerms:string;notes:string;financeTerms:string;warrantyId:string};
  deposits:{amount:number;method:string;paidOn?:string;reference?:string;fundsConfirmed?:boolean}[];
  trades:TradeInInput[];agreement:boolean;
}
export interface SavedSheet {id:string;number:string;status:string;stage?:string;version:number;revision:number;documentId:string|null}
export interface ExistingDeal {id:string;number:string;status:string}
export async function terminalSheet(input:{sessionId:string;dealId:string|null;mode:"remove"|"cancel";version?:number;requestId:string}):Promise<{saved?:boolean;error?:string;uncertain?:boolean}> {
  const session=await requireSession();
  const parsed=z.object({sessionId:z.uuid(),dealId:z.uuid().nullable(),mode:z.enum(["remove","cancel"]),version:z.number().int().positive().optional(),requestId:z.uuid()}).safeParse(input);
  if(!parsed.success)return{error:"This negotiation could not be identified. Reload and review it before trying again."};
  const db=await createClient();
  const {data,error}=await db.rpc("terminate_new_deal",{p_dealer:session.dealer.id,p_session:parsed.data.sessionId,p_deal:parsed.data.dealId,p_action:parsed.data.mode,p_version:parsed.data.version??null,p_request:parsed.data.requestId});
  if(error){
    if(!error.code)return{uncertain:true,error:"The result could not be confirmed. Retry the same action before leaving this page."};
    const messages:Record<string,string>={
      financial_deal_requires_review:"This negotiation has a deposit, trade-in, agreement or financial document. Open the Deal and use the existing financial review/cancellation flow; nothing was removed or cancelled here.",
      commercial_not_allowed:"You do not have permission to change this negotiation.",
      stale_deal:"This negotiation changed elsewhere. Reload and review it before trying again.",
      deal_closed:"This negotiation is already closed. Open its history to review it.",
      invalid_new_deal:"Only a negotiation created in this New Deal session can be removed or cancelled here.",
      linked_deal_requires_review:"This negotiation has linked records. Open the Deal to review them before removing it.",
    };
    return{error:messages[error.message]??"Could not remove or cancel this negotiation. Open the Deal to review its state; no partial change was saved."};
  }
  const result=z.object({status:z.enum(["removed","cancelled","discarded"])}).safeParse(data);
  if(!result.success)return{uncertain:true,error:"The result could not be confirmed. Retry the same action before leaving this page."};
  revalidatePath("/business/deals");revalidatePath("/inventory");revalidatePath("/business");revalidatePath("/pending");
  if(parsed.data.dealId)revalidatePath(`/business/deals/${parsed.data.dealId}`);
  return{saved:true};
}
export async function autosaveSheet(input:{sessionId:string;revision:number;requestId:string;snapshot:SheetSnapshot}):Promise<{saved?:SavedSheet;existingDeal?:ExistingDeal;error?:string;uncertain?:boolean}> {
  const session=await requireSession();

  const schema=z.object({sessionId:z.uuid(),requestId:z.uuid(),revision:z.number().int().min(0),snapshot:z.object({
    sale:z.object({customerId:z.uuid(),vehicleId:z.uuid(),salespersonId:z.guid(),locationId:z.union([z.literal(""),z.uuid()]),leadId:z.union([z.literal(""),z.uuid()]),source:z.string().max(40),salePrice:z.number().positive().max(100000000),vatScheme:z.enum(["standard","margin","none"]),priceReason:z.string().max(500),notes:z.string().max(4000),sourceQuoteId:z.uuid().optional()}),
    terms:z.object({quoteTerms:z.string().max(500),notes:z.string().max(2000),financeTerms:z.string().max(1000),warrantyId:z.union([z.literal(""),z.uuid()])}),
    deposits:z.array(z.object({amount:z.number().positive().multipleOf(0.01),method:z.enum(["cash","bank","eft","cheque","draft","card","finance"]),paidOn:z.iso.date().optional(),reference:z.string().max(120).optional(),fundsConfirmed:z.boolean().optional()})).max(100),
    trades:z.array(z.record(z.string(),z.unknown())).max(10),agreement:z.boolean(),
  })});
  const parsed=schema.safeParse(input);
  if(!parsed.success){
    const labels:Record<string,string>={customerId:"a saved customer",vehicleId:"a vehicle",salespersonId:"a valid Assigned to member",salePrice:"a positive sale price",locationId:"a valid location",leadId:"a valid linked lead",priceReason:"a valid price change reason"};
    const missing=[...new Set(parsed.error.issues.map(issue=>{
      const field=String(issue.path.at(-1)??"");
      return labels[field]??(issue.path.includes("deposits")?"valid deposit details":issue.path.includes("trades")?"valid trade-in details":"valid Deal details");
    }))];
    return{error:`Automatic saving needs ${missing.join(", ")}. Your entries have been kept.`};
  }
  const db=await createClient();
  const {data,error}=await db.rpc("autosave_new_deal",{p_dealer:session.dealer.id,p_session:input.sessionId,p_revision:input.revision,p_input:parsed.data.snapshot,p_request:input.requestId});
  if(error&&!error.code)return{uncertain:true,error:"The save response could not be confirmed. Retry the same operation safely before changing financial entries."};
  if(error?.message==="assignment_not_allowed")return{error:"Your permissions do not allow changing Assigned to. Keep the existing assignment before saving other details."};
  if(error?.message==="invalid_assignee")return{error:"Choose an active sales team member from this dealership."};
  if(error)return{error:error.message.includes("stale_deal")?"This Deal changed elsewhere. Open the saved Deal to review it; no changes were overwritten.":error.message.includes("document_settings_required")?"Complete company document settings before creating an agreement. This attempt was not saved.":error.message.includes("vehicle_has_open_deal")||error.message.includes("vehicle_unavailable")?"This car is no longer available for an agreement. Nothing from this attempt was saved.":`Automatic saving failed: ${error.message}. No partial changes were saved.`};
  if(data && typeof data === "object" && "existingDeal" in data){
    const existing=z.object({id:z.uuid(),number:z.string(),status:z.string()}).safeParse(data.existingDeal);
    if(existing.success)return{existingDeal:existing.data};
    return{uncertain:true,error:"The existing Deal could not be confirmed. Retry before changing financial entries."};
  }
  const saved=z.object({
    id:z.uuid(),number:z.string().min(1),
    status:z.enum(["vehicle_interest","draft","quoted","agreed","finance","completed","cancelled","reversed"]),
    stage:z.enum(["initial_contact","vehicle_interest","test_drive","proposal","negotiation","closing","after_sales","cancelled"]).optional(),
    version:z.number().int().positive(),revision:z.number().int().positive(),documentId:z.uuid().nullable(),
  }).safeParse(data);
  if(!saved.success)return{uncertain:true,error:"The save response could not be confirmed. Retry the same operation safely before changing financial entries."};
  return{saved:saved.data};
}
