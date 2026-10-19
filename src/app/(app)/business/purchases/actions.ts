"use server";
import { redirect } from "next/navigation";
import { commercialCommand } from "@/lib/commercial-server";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createSalesClient } from "@/lib/sales-client";
import { isDemoMode, demoVehicles } from "@/lib/demo";
import { demoEntityId } from "@/lib/demo-ids";
import { revalidatePath } from "next/cache";
import { purchaseVendorSchema, type PurchaseVendorInput } from "@/lib/purchase-vendor";
export interface CreatePurchaseInput {
  existingVehicleId?: string;
  vendorId?: string; newVendor?: PurchaseVendorInput;
  make: string; model: string; year: number; registration: string; km: number;
  price?: number; vatScheme: string; invRef: string; purchaseDate: string; receivedOn: string; notes?: string; dueOn?: string;
  settlement?: number; settlementProvider?: string; settlementReference?: string;
  settlementValidUntil?: string; requestId?: string;
  vatRate?: number; imported?: boolean; vrtAmount?: number; vrtVatTreatment?: "included" | "excluded";
}
export async function savePurchaseTaxDetails(input: { poId: string; vatScheme: string; vatRate: number; imported: boolean; vrtAmount: number; vrtVatTreatment: "included" | "excluded" }) {
  const { poId, ...data } = input;
  return commercialCommand("purchase_tax_details", poId, data);
}
export async function createPurchase(input: CreatePurchaseInput) {
  const session = await requireSession();
  const db = await createSalesClient();
  const { data: taxSettings, error } = await db.rpc("financial_tax_settings", { p_dealer: session.dealer.id });
  if (error || !taxSettings || typeof taxSettings !== "object" || !("standardVatRate" in taxSettings) || !("defaultVatScheme" in taxSettings)) {
    return { error: "VAT settings could not load. Check access and migration 094 before creating the PO; nothing was saved." };
  }
  const { requestId, ...data } = input;
  if (!data.vendorId) {
    const vendor = purchaseVendorSchema.safeParse(data.newVendor);
    if (!vendor.success) return { error: "Review the vendor name, contact details and country before saving the purchase." };
    const vendorSchema = await db.rpc("purchase_vendor_schema_version", { p_dealer: session.dealer.id });
    if (vendorSchema.error || vendorSchema.data !== 1) {
      return { error: "Complete vendor details cannot be saved yet. Ask an administrator to check the purchase vendor database update and your purchase access. Nothing was saved." };
    }
    data.newVendor = vendor.data;
  }
  if (isDemoMode() && data.existingVehicleId && demoVehicles.some(vehicle => vehicle.id === data.existingVehicleId)) {
    data.existingVehicleId = demoEntityId(data.existingVehicleId);
  }
  return commercialCommand(input.existingVehicleId?"purchase_existing":"purchase", null, data, requestId);
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
export async function deletePurchaseVehicle(poId: string, requestId: string) {
  const session = await requireSession();
  let paths: string[] = [];
  if (!isDemoMode()) {
    const db = await createClient();
    const { data: po } = await db.from("purchase_orders").select("vehicle_id").eq("dealer_id", session.dealer.id).eq("id", poId).maybeSingle();
    if (po?.vehicle_id) {
      const { data: photos } = await db.from("vehicle_photos").select("storage_path").eq("dealer_id", session.dealer.id).eq("vehicle_id", po.vehicle_id);
      paths = (photos ?? []).map((photo) => photo.storage_path);
    }
  }
  const result = await commercialCommand("delete_purchase_vehicle", poId, {}, requestId);
  if (!result.error && paths.length) {
    const db = await createClient();
    await db.storage.from("vehicle-photos").remove(paths);
  }
  return result;
}

export async function fillPurchaseIntakeAction(_previous:{saved?:boolean;error?:string},form:FormData):Promise<{saved?:boolean;error?:string}>{
  const session=await requireSession();
  if(isDemoMode())return {error:"Preview only — connect Supabase to save."};
  const poId=String(form.get("po_id")??"");
  if(!/^[0-9a-f-]{36}$/i.test(poId))return {error:"Invalid purchase order."};
  const db=await createClient();
  const {error}=await db.rpc("fill_purchase_intake",{p_dealer:session.dealer.id,p_po:poId,p_data:{invRef:String(form.get("inv_ref")??""),purchaseDate:String(form.get("purchase_date")??""),receivedOn:String(form.get("received_on")??"")}});
  if(error){
    const messages:Record<string,string>={supplier_invoice_required:"Enter the supplier invoice reference.",purchase_date_required:"Enter the purchase date.",vehicle_received_date_required:"Enter the dealership arrival date.",vehicle_received_before_purchase:"Arrival cannot be before purchase.",purchase_dates_in_future:"Dates cannot be in the future.",purchase_intake_complete:"This PO is already complete. Refresh the page.",purchase_intake_not_editable:"This PO cannot be edited in this intake form.",accounting_period_closed:"This date belongs to a closed accounting period. Ask the owner to review it.",commercial_not_allowed:"Your role cannot edit this PO."};
    return {error:messages[error.message]??"Could not complete the PO. Check the dates and try again."};
  }
  revalidatePath(`/business/purchases/${poId}`);
  revalidatePath("/inventory","layout");
  revalidatePath("/pending","layout");
  return {saved:true};
}
