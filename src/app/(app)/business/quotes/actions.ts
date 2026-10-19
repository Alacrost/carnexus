"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireSession} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {isDemoMode} from "@/lib/demo";
import {can} from "@/lib/types";

const quoteSchema=z.object({
  requestId:z.string().uuid(),customerId:z.string().uuid(),vehicleId:z.string().uuid(),
  salespersonId:z.string().uuid(),locationId:z.string().uuid().optional(),leadId:z.string().uuid().optional(),
  source:z.string().max(80).optional(),salePrice:z.number().positive().multipleOf(0.01),
  vatScheme:z.enum(["standard","margin","none"]),priceReason:z.string().max(500),
  validDays:z.number().int().min(1).max(365),quoteTerms:z.string().max(500),
  notes:z.string().max(2000),financeTerms:z.string().max(1000),
  warrantyId:z.union([z.literal(""),z.string().uuid()]),
  financeCompanyId:z.union([z.literal(""),z.string().uuid()]),invoiceToFinance:z.boolean(),
});
export type CreateQuoteInput=z.infer<typeof quoteSchema>;

export async function createSalesQuote(input:CreateQuoteInput):Promise<{error?:string}>{
  const session=await requireSession();
  if(!can.manageDeals(session.role))return{error:"Your role cannot issue sales quotes."};
  if(isDemoMode())return{error:"Preview only — connect Supabase to issue a quote."};
  const parsed=quoteSchema.safeParse(input);
  if(!parsed.success)return{error:"Review the quote price, customer, car and validity period."};
  const {requestId,...data}=parsed.data;
  const db=await createClient();
  const {data:result,error}=await db.rpc("create_sales_quote",{p_dealer:session.dealer.id,p_input:data,p_request:requestId});
  if(error){
    const message=error.message;
    return{error:message.includes("document_settings_required")?"Set the company name and address in Business document settings first.":
      message.includes("price_permission_reason_required")?"A changed price requires permission and a reason.":
      message.includes("warranty_preset_missing")?"The selected warranty is no longer active.":
      message.includes("finance_company_missing")?"Select an active saved finance company.":
      message.includes("vehicle_unavailable")?"The selected vehicle is no longer available.":
      message.includes("commercial_not_allowed")?"Your role cannot issue this quote.":
      "Could not issue the quote. Check the details and apply migration 074; nothing was saved."};
  }
  revalidatePath("/business/quotes");
  redirect(`/business/quotes/${(result as {id:string}).id}`);
}
