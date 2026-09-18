"use server";
import { redirect } from "next/navigation";
import { commercialCommand } from "@/lib/commercial-server";
export interface CreatePurchaseInput {
  vendorId?: string; newVendor?: { name: string; phone?: string; email?: string };
  make: string; model: string; year: number; registration: string; km?: number;
  price: number; vatScheme: string; invRef?: string; notes?: string; dueOn?: string;
  settlement?: number; settlementProvider?: string; settlementReference?: string;
  settlementValidUntil?: string; requestId?: string;
}
export async function createPurchase(input: CreatePurchaseInput) {
  const { requestId, ...data } = input;
  return commercialCommand("purchase", null, data, requestId);
}
export async function createPurchaseAndGo(input: CreatePurchaseInput) {
  const res = await createPurchase(input);
  if (res.error) return res;
  redirect(`/business/purchases/${res.id}`);
}
export async function approvePurchase(form: FormData) {
  const res = await commercialCommand("approve_purchase", String(form.get("id")), {});
  if (res.error) throw new Error(res.error);
}
export async function addVendorPayment(input: { poId: string; amount: number; method?: string; paidOn?: string; reference?: string; recipient?: string; requestId?: string }) {
  const { poId, requestId, ...data } = input;
  return commercialCommand("vendor_payment", poId, { ...data, recipient: data.recipient ?? "vendor" }, requestId);
}
