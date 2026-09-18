"use server";
import { redirect } from "next/navigation";
import { commercialCommand } from "@/lib/commercial-server";
export interface NewContact {
  name: string; type?: string; title?: string; firstName?: string; lastName?: string;
  company?: string; jobTitle?: string; dataConsent?: string; phone?: string;
  ddiPhone?: string; fax?: string; mobile?: string; email?: string; address?: string;
  town?: string; county?: string; postCode?: string; country?: string;
}
export interface CreateDealInput {
  customerId?: string; newCustomer?: NewContact; leadId?: string; source?: string;
  salespersonId?: string; vehicleId: string; salePrice: number; vatScheme: string;
  depositAmount?: number; depositMethod?: string; depositDate?: string; notes?: string;
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
export async function addPayment(input: { dealId: string; kind: string; method?: string; amount: number; paidOn?: string; reference?: string; requestId?: string }) {
  const { dealId, requestId, ...data } = input;
  return commercialCommand("payment", dealId, data, requestId);
}
export async function changeDealStatus(id: string, status: string) { return commercialCommand("status", id, { status }); }
export async function setDealStage(id: string, stage: string) { return commercialCommand("stage", id, { stage }); }
export async function createDealDocument(id: string, kind: string) { return commercialCommand("document", id, { kind }); }
export async function addTradeIn(input: { dealId: string; make: string; model: string; year: number; registration: string; km?: number; allowance: number; settlement?: number; settlementProvider?: string; settlementReference?: string; settlementValidUntil?: string; requestId?: string }) {
  const { dealId, requestId, ...data } = input;
  return commercialCommand("trade", dealId, data, requestId);
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
  const data = Object.fromEntries(form);
  const res = await commercialCommand("finance", String(data.id), { ...data, invoice_to_finance: data.invoice_to_finance === "on" });
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
