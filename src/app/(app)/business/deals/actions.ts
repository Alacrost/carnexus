"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { commercialCommand } from "@/lib/commercial-server";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { can } from "@/lib/types";
import type { TradeInInput } from "@/lib/trade-ins";
export interface NewContact {
  name: string; type?: string; title?: string; firstName?: string; lastName?: string;
  company?: string; jobTitle?: string; dataConsent?: string; phone?: string;
  ddiPhone?: string; fax?: string; mobile?: string; email?: string; address?: string;
  town?: string; county?: string; postCode?: string; country?: string;
}
export interface CreateDealInput {
  customerId?: string; newCustomer?: NewContact; leadId?: string; source?: string; sourceQuoteId?:string;
  salespersonId?: string; locationId?:string;vehicleId: string; salePrice: number; vatScheme: string;
  depositAmount?: number; depositMethod?: string; depositDate?: string; depositReference?: string; fundsConfirmed?: boolean; notes?: string;
  deposits?: { amount: number; method: string; paidOn?: string; reference?: string; fundsConfirmed?: boolean }[];
  priceReason?: string; requestId?: string;
}
export async function createDeal(input: CreateDealInput) {
  const { requestId, ...data } = input;
  return commercialCommand("sale", null, data, requestId);
}
export async function createDealAndGo(input: CreateDealInput) {
  const res = await createDeal(input);
  if (res.error) return res;
  redirect(`/business/deals/${res.id}`);
}
export async function addPayment(input: { dealId: string; kind: string; method?: string; amount: number; paidOn?: string; reference?: string; fundsConfirmed?: boolean; requestId?: string }) {
  const { dealId, requestId, ...data } = input;
  return commercialCommand("payment", dealId, data, requestId);
}
const tradeInHistorySchema=z.object({accident:z.enum(["unknown","no","yes"]),writeOff:z.enum(["unknown","no","yes"]),stolen:z.enum(["unknown","no","yes"]),mileageDiscrepancy:z.enum(["unknown","no","yes"]),source:z.enum(["dealer_declaration","customer_declaration","vehicle_report"]),reportReference:z.string().max(120).optional(),reportedOn:z.union([z.literal(""),z.iso.date()]).optional(),notes:z.string().max(2000).optional()});
const tradeInSchema=z.object({registration:z.string().trim().min(4).max(20),make:z.string().trim().min(2).max(60),model:z.string().trim().min(1).max(80),year:z.number().int().min(1950).max(2100),km:z.number().int().min(0).max(5000000),vin:z.string().max(17).optional(),colour:z.string().max(40).optional(),conditionNotes:z.string().max(2000).optional(),allowance:z.number().positive().multipleOf(0.01),settlement:z.number().min(0).multipleOf(0.01),settlementProvider:z.string().max(120).optional(),settlementReference:z.string().max(120).optional(),settlementValidUntil:z.union([z.literal(""),z.iso.date()]).optional(),history:tradeInHistorySchema});
export async function createDealFromSheet(input:{sale:CreateDealInput;terms:{quoteTerms:string;notes:string;financeTerms:string;warrantyId:string};trades?:TradeInInput[];mode:"deal"|"quote"|"agreement"|"trade"|"edit"|"finish"}):Promise<{error?:string}>{
  const session=await requireSession();if(!can.manageDeals(session.role))return{error:"Not allowed."};

  const parsed=z.object({sale:z.object({vehicleId:z.string().uuid(),salePrice:z.number().positive(),requestId:z.string().uuid()}).passthrough(),
    terms:z.object({quoteTerms:z.string().max(500),notes:z.string().max(2000),financeTerms:z.string().max(1000),warrantyId:z.union([z.literal(""),z.string().uuid()])}),
    trades:z.array(tradeInSchema).max(10).optional(),mode:z.enum(["deal","quote","agreement","trade","edit","finish"])}).safeParse(input);
  if(!parsed.success)return{error:"Review the Deal details before continuing."};
  const trades=parsed.data.trades??[];
  if(trades.some(trade=>trade.settlement>0&&(!trade.settlementProvider?.trim()||!trade.settlementValidUntil)))return{error:"Add the lender and settlement validity for every financed trade-in."};
  if(new Set(trades.map(trade=>trade.registration.replace(/[^a-z0-9]/gi,"").toUpperCase())).size!==trades.length)return{error:"Each trade-in must have a different registration plate."};
  if(trades.length>0&&!(["deal","edit","agreement","finish"] as string[]).includes(input.mode))return{error:"Create a Deal before adding these trade-ins."};
  const {requestId,...sale}=input.sale;
  if(input.mode==="quote"&&(sale.deposits?.length||sale.depositAmount))return{error:"Quote and agreement without deposit require an empty deposit list."};
  const db=await createClient();
  const {data,error}=trades.length>0
    ?await db.rpc("create_deal_with_trade_ins",{p_dealer:session.dealer.id,p_sale:sale,p_terms:input.terms,p_mode:input.mode==="finish"?"deal":input.mode,p_trades:trades,p_request:requestId})
    :await db.rpc("create_deal_from_sheet",{p_dealer:session.dealer.id,p_sale:sale,p_terms:input.terms,p_finance:null,p_mode:input.mode==="finish"?"deal":input.mode,p_request:requestId});
  if(error)return{error:error.message.includes("document_settings_required")?"Set the company name and address in Business document settings before printing.":error.message.includes("warranty_preset_missing")?"The selected warranty is no longer active. Choose another one.":error.message.includes("duplicate_registration")?"A trade-in plate already exists in stock. Review the car before creating this Deal.":error.message.includes("commercial_not_allowed")?"Your role does not permit this action.":"Could not create the Deal. Review the details and database migration; no partial Deal was saved."};
  const result=data as {id:string;documentId?:string|null};
  redirect(input.mode==="finish"?`/business/deals/${result.id}/finish`:result.documentId?`/deal-doc/${result.id}/${result.documentId}`:input.mode==="edit"?`/business/deals/${result.id}/edit`:input.mode==="trade"?`/business/deals/${result.id}#trade-in`:`/business/deals/${result.id}`);
}
const dealCustomerSchema=z.object({
  customerId:z.string().uuid().optional(),name:z.string().trim().min(2).max(120),type:z.enum(["individual","business"]),
  title:z.string().max(20).optional(),firstName:z.string().max(80).optional(),lastName:z.string().max(80).optional(),company:z.string().max(120).optional(),
  jobTitle:z.string().max(80).optional(),dataConsent:z.string().max(40).optional(),phone:z.string().max(40).optional(),ddiPhone:z.string().max(40).optional(),
  fax:z.string().max(40).optional(),mobile:z.string().max(40).optional(),email:z.union([z.literal(""),z.string().email().max(200)]).optional(),
  address:z.string().max(400).optional(),town:z.string().max(80).optional(),county:z.string().max(80).optional(),postCode:z.string().max(16).optional(),country:z.string().max(4).optional(),requestId:z.string().uuid(),
});
export async function saveDealCustomer(input:z.infer<typeof dealCustomerSchema>):Promise<{id?:string;savedAt?:string;error?:string}>{
  const parsed=dealCustomerSchema.safeParse(input);if(!parsed.success)return{error:"Review the customer name and contact details."};
  const session=await requireSession();if(!can.manageDeals(session.role))return{error:"Not allowed."};

  const{requestId,...payload}=parsed.data;const supabase=await createClient();
  const{data,error}=await supabase.rpc("save_deal_customer",{p_dealer:session.dealer.id,p_input:payload,p_request:requestId});
  if(error||!data)return{error:error?.message.includes("commercial_not_allowed")?"You cannot save customers.":"The customer could not be saved. Check the details and try again."};
  return data as {id:string;savedAt:string};
}
export async function clearReceipt(input: { paymentId: string; reference?: string; clearedOn?: string; requestId?: string }) {
  const { paymentId, requestId, ...data } = input;
  return commercialCommand("clear_receipt", paymentId, data, requestId);
}
export async function reverseReceipt(input: { paymentId: string; reason: string; reversedOn?: string; reference?: string; requestId?: string }) {
  const { paymentId, requestId, ...data } = input;
  return commercialCommand("reverse_receipt", paymentId, data, requestId);
}
export async function removePaymentEntry(input:{paymentId:string;requestId:string}){
  const session=await requireSession();const db=await createClient();
  const {error}=await db.rpc("remove_deal_payment",{p_dealer:session.dealer.id,p_payment:input.paymentId,p_request:input.requestId});
  if(error)return{error:error.message.includes("not_allowed")?"Your role cannot remove payments.":error.message.includes("remove_deal_payment")?"Payment removal requires database update 091.":"Could not remove the payment. Refresh and try again."};
  return {};
}
export async function rejectReceipt(input: { paymentId: string; reason: string; reference?: string; requestId?: string }) {
  const { paymentId, requestId, ...data } = input;
  return commercialCommand("reject_receipt", paymentId, data, requestId);
}
export async function changeDealStatus(id: string, status: string, invoiceDate?: string) { return commercialCommand("status", id, { status, ...(status === "completed" ? { invoiceDate } : {}) }); }
export async function finishDealReview(input:{dealId:string;version:number;invoiceDate:string;odometer:number;unit:"km"|"miles";email:string;consent:string;requestId:string}):Promise<{id?:string;error?:string}>{
  const parsed=z.object({dealId:z.string().uuid(),version:z.number().int().positive(),invoiceDate:z.iso.date(),odometer:z.number().int().min(0).max(5000000),unit:z.enum(["km","miles"]),email:z.union([z.literal(""),z.email().max(200)]),consent:z.enum(["not_asked","refused","verbal","written","electronic"]),requestId:z.string().uuid()}).safeParse(input);

  if(!parsed.success)return{error:"Review the date, odometer, email and consent."};
  const session=await requireSession();const db=await createClient();
  const {dealId,version,requestId,...data}=parsed.data;
  const result=await db.rpc("finish_deal_review",{p_dealer:session.dealer.id,p_deal:dealId,p_version:version,p_input:data,p_request:requestId});
  if(result.error){const messages:Record<string,string>={stale_deal:"The Deal changed. Reload and review it again.",delivery_odometer_below_stock:"The delivery reading cannot be lower than the recorded mileage.",purchase_order_required_for_completion:"Complete the vehicle’s PO before issuing the invoice.",vehicle_history_disclosure_required:"Record the buyer’s acknowledgement of the vehicle history first.",invoice_date_outside_policy:"This date is outside the business’s permitted backdating period.",invoice_backdate_not_allowed:"Your role cannot backdate invoices.",accounting_period_closed:"This accounting period is closed.",invoice_date_future:"The invoice date cannot be in the future."};return{error:messages[result.error.message]??"Could not finish the Deal. Check the required documents, finance approval and database migrations. Nothing was saved."};}
  return result.data as {id:string};
}
const cancelDealSchema = z.object({
  dealId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  leadStage: z.enum(["new", "contacted", "appointment", "test_drive", "finance_applied"]).optional(),
  requestId: z.string().uuid(),
});
export async function recordCancellationRefund(input:{dealId:string;expectedVersion:number;amount:number;method:string;paidOn:string;reference:string;reason:string;confirmedPaid:boolean;requestId:string}){
  const parsed=z.object({dealId:z.uuid(),expectedVersion:z.number().int().positive(),amount:z.number().positive().multipleOf(0.01),method:z.enum(["cash","bank","eft","cheque","draft","card"]),paidOn:z.iso.date(),reference:z.string().max(120),reason:z.string().trim().min(3).max(500),confirmedPaid:z.literal(true),requestId:z.uuid()}).safeParse(input);
  if(!parsed.success)return{error:"Confirm the refund already paid, its amount, method, date and cancellation reason."};
  const{dealId,requestId,...data}=parsed.data;return commercialCommand("refund_before_cancel",dealId,data,requestId);
}
export async function cancelDeal(input: z.infer<typeof cancelDealSchema>) {
  const parsed = cancelDealSchema.safeParse(input);
  if (!parsed.success) return { error: "Review the cancellation reason and try again." };
  const { dealId, requestId, expectedVersion, reason, leadStage } = parsed.data;
  return commercialCommand("cancel_deal", dealId, { expectedVersion, reason, leadStage: leadStage ?? "" }, requestId);
}
const creditNoteSchema = z.object({
  dealId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  lines: z.array(z.object({ index: z.number().int().nonnegative(), amount: z.number().positive().multipleOf(0.01) })).min(1),
  requestId: z.string().uuid(),
});
export async function issueCreditNote(input: z.infer<typeof creditNoteSchema>) {
  const parsed = creditNoteSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose at least one line, enter valid amounts and explain the correction." };
  const { dealId, requestId, ...data } = parsed.data;
  return commercialCommand("credit_note", dealId, data, requestId);
}
const returnSaleSchema = z.object({
  dealId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  refundMethod: z.enum(["cash", "bank", "card"]),
  reference: z.string().trim().max(120).optional(),
  financeReference: z.string().trim().max(120).optional(),
  requestId: z.string().uuid(),
});
export async function returnInvoicedVehicle(input: z.infer<typeof returnSaleSchema>) {
  const parsed = returnSaleSchema.safeParse(input);
  if (!parsed.success) return { error: "Confirm the return reason and refund details." };
  const { dealId, requestId, ...data } = parsed.data;
  return commercialCommand("return_sale", dealId, data, requestId);
}
const returnTradeSaleSchema = returnSaleSchema.extend({
  keepTradeIn: z.literal(true),
  newPurchasePrice: z.number().positive().multipleOf(0.01),
  supplierReference: z.string().trim().max(60).optional(),
});
export async function returnSaleKeepingTradeIn(input: z.infer<typeof returnTradeSaleSchema>) {
  const parsed = returnTradeSaleSchema.safeParse(input);
  if (!parsed.success) return { error: "Confirm the return, the new trade-in purchase value and refund details." };
  const { dealId, requestId, ...data } = parsed.data;
  return commercialCommand("return_trade_sale", dealId, data, requestId);
}
const tradeChoiceSchema=z.object({vehicleId:z.string().uuid(),keep:z.boolean(),newPurchasePrice:z.number().positive().multipleOf(0.01).optional(),supplierReference:z.string().trim().max(60).optional()});
export async function returnSaleWithTradeChoices(input:{dealId:string;expectedVersion:number;reason:string;refundMethod:"cash"|"bank"|"card";reference?:string;financeReference?:string;tradeChoices:{vehicleId:string;keep:boolean;newPurchasePrice?:number;supplierReference?:string}[];requestId:string}):Promise<{id?:string;error?:string;status?:string}> {
  const parsed=returnSaleSchema.extend({tradeChoices:z.array(tradeChoiceSchema).min(1).max(10)}).safeParse(input);
  if(!parsed.success||parsed.data.tradeChoices.some(choice=>choice.keep&&!choice.newPurchasePrice))return{error:"Choose whether to keep or return every trade-in and enter the new PO value for cars kept."};
  const session=await requireSession();

  const {dealId,requestId,...payload}=parsed.data;
  const db=await createClient();
  const {data,error}=await db.rpc("reverse_sale_with_trade_choices",{p_dealer:session.dealer.id,p_deal:dealId,p_input:payload,p_request:requestId});
  if(error)return{error:error.message.includes("trade_return_payments_pending")?"Reverse or regularize the PO payments before returning that trade-in to the customer.":error.message.includes("replacement_purchase_overpaid")?"The new PO value must cover payments already made on that car.":error.message.includes("invalid_replacement_purchase_value")?"The new PO value must cover its outstanding finance.":error.message};
  return data as {id:string;status:string};
}
export async function confirmVehicleHistoryDisclosure(input:{dealId:string;method:"verbal"|"written";reference:string}){
  const parsed=z.object({dealId:z.string().uuid(),method:z.enum(["verbal","written"]),reference:z.string().max(200)}).safeParse(input);
  if(!parsed.success)return{error:"Review the confirmation details."};
  const session=await requireSession();
  const db=await createClient();const {error}=await db.rpc("confirm_vehicle_history_disclosure",{p_dealer:session.dealer.id,p_deal:parsed.data.dealId,p_method:parsed.data.method,p_reference:parsed.data.reference});
  return error?{error:error.message}:{saved:true};
}
export async function setDealStage(id: string, stage: string) { return commercialCommand("stage", id, { stage }); }
export async function createDealDocument(id: string, kind: string) { return commercialCommand("document", id, { kind }); }
export async function forceDealAgreement(id: string, expectedVersion: number) { return commercialCommand("force_agreement", id, { expectedVersion }); }
export async function saveDealTerms(input: {dealId:string;expectedVersion:number;quoteTerms:string;notes:string;financeTerms:string;warrantyId:string}) {
  const parsed=z.object({dealId:z.string().uuid(),expectedVersion:z.number().int().positive(),quoteTerms:z.string().max(500),notes:z.string().max(2000),financeTerms:z.string().max(1000),warrantyId:z.union([z.literal(""),z.string().uuid()])}).safeParse(input);
  if(!parsed.success)return{error:"Review the quote terms, notes and selected warranty."};
  const {dealId,...data}=parsed.data;
  return commercialCommand("deal_terms",dealId,data);
}
export async function addTradeIn(input: {dealId:string;trade:TradeInInput;requestId:string}) {
  const parsed=z.object({dealId:z.string().uuid(),trade:tradeInSchema,requestId:z.string().uuid()}).safeParse(input);
  if(!parsed.success)return{error:"Review the trade-in car, history, mileage and financial details."};
  const session=await requireSession();
  const db=await createClient();const {data,error}=await db.rpc("record_trade_in",{p_dealer:session.dealer.id,p_deal:parsed.data.dealId,p_data:parsed.data.trade,p_request:parsed.data.requestId});
  return error?{error:error.message}:{id:(data as {id:string}).id};
}
export async function loadTradeInForEdit(dealId:string,vehicleId:string):Promise<{trade?:TradeInInput;error?:string}>{
  if(!z.string().uuid().safeParse(dealId).success||!z.string().uuid().safeParse(vehicleId).success)return{error:"Preview only — saved trade-ins need a connected account."};
  const session=await requireSession();const db=await createClient();
  const [order,vehicle,details,history,po]=await Promise.all([
    db.from("deal_orders").select("price,settlement_amount,settlement_provider,settlement_valid_until").eq("dealer_id",session.dealer.id).eq("deal_id",dealId).eq("vehicle_id",vehicleId).eq("is_trade_in",true).single(),
    db.from("vehicles").select("registration,make,model,year,km").eq("dealer_id",session.dealer.id).eq("id",vehicleId).single(),
    db.from("vehicle_details").select("vin,colour,condition_notes").eq("dealer_id",session.dealer.id).eq("vehicle_id",vehicleId).maybeSingle(),
    db.from("vehicle_history_reports").select("accident_status,write_off_status,stolen_status,mileage_discrepancy_status,source,report_reference,reported_on,notes").eq("dealer_id",session.dealer.id).eq("vehicle_id",vehicleId).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle(),
    db.rpc("deal_trade_finance_reference",{p_dealer:session.dealer.id,p_deal:dealId,p_vehicle:vehicleId}),
  ]);
  if([order,vehicle,details,history,po].some(result=>result.error)||!order.data||!vehicle.data)return{error:"Could not load this trade-in for editing."};
  const h=history.data;
  return{trade:{registration:vehicle.data.registration??"",make:vehicle.data.make,model:vehicle.data.model,year:vehicle.data.year,km:vehicle.data.km,
    vin:details.data?.vin??"",colour:details.data?.colour??"",conditionNotes:details.data?.condition_notes??"",
    allowance:Number(order.data.price),settlement:Number(order.data.settlement_amount??0),settlementProvider:order.data.settlement_provider??"",
    settlementReference:typeof po.data==="string"?po.data:"",settlementValidUntil:order.data.settlement_valid_until??"",
    history:{accident:h?.accident_status??"unknown",writeOff:h?.write_off_status??"unknown",stolen:h?.stolen_status??"unknown",mileageDiscrepancy:h?.mileage_discrepancy_status??"unknown",source:h?.source??"customer_declaration",reportReference:h?.report_reference??"",reportedOn:h?.reported_on??"",notes:h?.notes??""}}};
}
export async function editTradeIn(input:{dealId:string;vehicleId:string;version:number;trade:TradeInInput;requestId:string}):Promise<{id?:string;error?:string}>{
  const parsed=z.object({dealId:z.string().uuid(),vehicleId:z.string().uuid(),version:z.number().int().positive(),trade:tradeInSchema,requestId:z.string().uuid()}).safeParse(input);
  if(!parsed.success)return{error:"Review the trade-in details."};
  const session=await requireSession();
  const db=await createClient();const value=parsed.data;
  const{data,error}=await db.rpc("edit_deal_trade_in",{p_dealer:session.dealer.id,p_deal:value.dealId,p_vehicle:value.vehicleId,p_version:value.version,p_data:value.trade,p_request:value.requestId});
  if(error)return{error:error.message.includes("stale_deal")?"The Deal changed. Refresh before editing this trade-in.":error.message.includes("trade_edit_payments_conflict")?"These changes conflict with PO payments already recorded. Regularize those payments first.":error.message.includes("deal_closed")?"Trade-ins cannot be edited after the Deal is finalized.":error.message.includes("duplicate_registration")?"This registration is already in stock.":error.message};
  return{id:(data as {id:string}).id};
}
export async function toggleRequiredDoc(id: string, key: string, received: boolean) { return commercialCommand("checklist", id, { key, received }); }
export async function addDealAddon(input: { dealId: string; kind: string; name: string; price: number; cost?: number; months?: number; terms?: string; vatRate?:number }) {
  const { dealId, ...data } = input;
  return commercialCommand("addon", dealId, data);
}
export async function removeDealAddon(form: FormData) {
  const res = await commercialCommand("remove_addon", String(form.get("dealId")), { id: form.get("id") });
  if (res.error) throw new Error(res.error);
}
export async function saveDealFinance(_state: { error?: string; saved?: boolean }, form: FormData): Promise<{error?:string;saved?:boolean}> {
  const parsed=z.object({id:z.string().uuid(),finance_contact_id:z.union([z.literal(""),z.string().uuid()]),finance_reference:z.string().trim().max(120),finance_expected:z.coerce.number().min(0).max(100000000),finance_status:z.enum(["none","pending","approved"]),invoice_to_finance:z.boolean()}).safeParse({
    id:form.get("id"),finance_contact_id:form.get("finance_contact_id")??"",finance_reference:form.get("finance_reference")??"",
    finance_expected:form.get("finance_expected")??"0",finance_status:form.get("finance_status")??"none",invoice_to_finance:form.get("invoice_to_finance")==="on",
  });
  if(!parsed.success)return{error:"Review the finance details and choose a finance company contact."};
  const data=parsed.data;
  if(!data.finance_contact_id&&(data.invoice_to_finance||data.finance_expected>0||data.finance_status!=="none"))return{error:"Choose a finance company from the Finance companies contact group."};
  const session=await requireSession();
  let company:{name:string;address_line1:string|null}|null=null;
  if(data.finance_contact_id){
    const db=await createClient();
    const {data:group}=await db.from("contact_groups").select("id").eq("dealer_id",session.dealer.id).eq("system_key","finance_companies").maybeSingle();
    if(!group)return{error:"The Finance companies contact group is unavailable. Apply migration 075."};
    const {data:member}=await db.from("contact_group_members").select("customer_id").eq("dealer_id",session.dealer.id).eq("group_id",group.id).eq("customer_id",data.finance_contact_id).maybeSingle();
    if(!member)return{error:"That contact is not in the Finance companies group."};
    const {data:contact}=await db.from("customers").select("name,type,address_line1").eq("dealer_id",session.dealer.id).eq("id",data.finance_contact_id).is("deleted_at",null).maybeSingle();
    if(!contact||contact.type!=="business"||(contact.address_line1??"").trim().length<5)return{error:"The finance company needs a business contact and invoice address."};
    company=contact;
  }
  const res = await commercialCommand("finance", data.id, {finance_company:company?.name??"",finance_address:company?.address_line1??"",finance_reference:data.finance_reference,finance_expected:data.finance_expected,finance_status:data.finance_status,invoice_to_finance:data.invoice_to_finance});
  return { error: res.error, saved: !res.error };
}
export async function changeSalePrice(_state: { error?: string; saved?: boolean }, form: FormData): Promise<{error?:string;saved?:boolean}> {
  const res = await commercialCommand("price", String(form.get("id")), Object.fromEntries(form));
  return { error: res.error, saved: !res.error };
}
export async function saveDocumentSettings(_state: { error?: string; saved?: boolean }, form: FormData): Promise<{error?:string;saved?:boolean}> {
  const res = await commercialCommand("document_settings", null, Object.fromEntries(form));
  return { error: res.error, saved: !res.error };
}
