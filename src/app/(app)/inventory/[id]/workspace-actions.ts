"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

export type WorkspaceActionState = { error?: string; saved?: boolean };

const textFields = [
  "make","model","year","km","registration","fuel","transmission","sale_price","stock_class",
  "location_id","description","vin","trim","body_style","colour","engine_cc","keys_count",
  "previous_owners","service_history","nct_expiry","warranty_months","condition_notes",
  "first_registered_on","local_registered_on","original_registration","tax_expiry","co2_g_km",
  "gross_weight_kg","body_length_mm","engine_no","doors","trade_price","key_peg_ref",
  "hp_check_status","vlc_status","vlc_number","repair_notes","internal_notes","yard",
  "last_service_on","last_service_km","timing_belt_on",
] as const;

async function command(vehicleId: string, kind: string, data: Record<string, unknown>) {
  const session = await requireSession();
  if (!["owner","admin"].includes(session.role)) return "Only stock managers can change this vehicle.";
  if (isDemoMode()) return "Connect Supabase to save vehicle changes.";
  if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) return "Invalid vehicle.";
  const db = await createClient();
  const { error } = await db.rpc("vehicle_workspace_command", {
    p_dealer: session.dealer.id, p_vehicle: vehicleId, p_command: kind, p_data: data,
  });
  if (error) return error.message.includes("duplicate_registration")
    ? "This plate already belongs to another unsold vehicle."
    : error.message.includes("vehicle_already_on_hold")
      ? "This vehicle already has an active hold."
      : "Could not save this vehicle action. Check the fields and try again.";
  revalidatePath(`/inventory/${vehicleId}`);
  revalidatePath("/inventory");
  revalidatePath("/pending","layout");
  revalidatePath("/s");
  return null;
}

export async function saveVehicleWorkspace(_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> {
  const vehicleId = String(form.get("vehicle_id") ?? "");
  const data: Record<string, unknown> = Object.fromEntries(textFields.map((name) => [name, String(form.get(name) ?? "").trim()]));
  data.website_visible = form.get("website_visible") === "on";
  data.featured = form.get("featured") === "on";
  data.has_logbook = form.get("has_logbook") === "on";
  data.metallic_paint = form.get("metallic_paint") === "on";
  data.equipment = form.getAll("equipment").map(String);
  data.tags = String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
  const error = await command(vehicleId, "update", data);
  return error ? { error } : { saved: true };
}

const sectionFields = {
  identity: ["make","model","trim","year","registration","original_registration","first_registered_on","local_registered_on","vin","engine_no","km","stock_class","location_id","yard"],
  specs: ["fuel","transmission","body_style","doors","colour","engine_cc","co2_g_km","gross_weight_kg","body_length_mm","nct_expiry","tax_expiry"],
  pricing: ["sale_price","trade_price"],
  documents: ["previous_owners","keys_count","key_peg_ref","service_history","hp_check_status","vlc_status","vlc_number","warranty_months","last_service_on","last_service_km","timing_belt_on"],
  presentation: ["description","condition_notes","repair_notes","internal_notes"],
  purchase_price: ["purchase_price"],
} as const;

export async function saveVehicleSection(_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> {
  const vehicleId = String(form.get("vehicle_id") ?? "");
  const section = String(form.get("section") ?? "") as keyof typeof sectionFields;
  if (!(section in sectionFields)) return { error: "Invalid edit section." };
  const session = await requireSession();
  if (!["owner","admin"].includes(session.role)) return { error: "Only owners and admins can edit this vehicle." };
  if (isDemoMode()) return { error: "Connect Supabase to save vehicle changes." };
  if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) return { error: "Invalid vehicle." };
  const data: Record<string, unknown> = Object.fromEntries(sectionFields[section].map(name=>[name,String(form.get(name)??"").trim()]));
  if (section === "specs") data.metallic_paint = form.get("metallic_paint") === "on";
  if (section === "documents") data.has_logbook = form.get("has_logbook") === "on";
  if (section === "presentation") {
    data.website_visible = form.get("website_visible") === "on";
    data.featured = form.get("featured") === "on";
    data.equipment = form.getAll("equipment").map(String);
    data.tags = String(form.get("tags")??"").split(",").map(tag=>tag.trim()).filter(Boolean).slice(0,20);
  }
  const db = await createClient();
  const { error } = await db.rpc("vehicle_edit_section", {
    p_dealer: session.dealer.id, p_vehicle: vehicleId, p_section: section, p_data: data,
  });
  if (error) {
    if (error.message.includes("duplicate_registration")) return { error: "This plate already belongs to another unsold vehicle." };
    if (error.message.includes("purchase_price_locked")) return { error: "The PO is already approved, paid or linked to a deal. A reviewed purchase correction is required outside this editor." };
    if (error.message.includes("accounting_period_closed")) return { error: "The purchase belongs to a closed accounting period." };
    if (error.message.includes("purchase_below_settlement")) return { error: "Purchase price cannot be lower than the lender settlement." };
    return { error: "Could not save this section. Review its values and permissions." };
  }
  revalidatePath(`/inventory/${vehicleId}`);
  revalidatePath("/inventory");
  revalidatePath("/pending","layout");
  revalidatePath("/business/purchases");
  return { saved: true };
}

export async function recordVehicleActivity(_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> {
  const vehicleId = String(form.get("vehicle_id") ?? "");
  const kind = String(form.get("kind") ?? "");
  if (!["hold","loan","external_repair","event","workshop_request"].includes(kind)) return { error: "Invalid action." };
  const data = {
    kind, title: String(form.get("title") ?? "").trim().slice(0, 120),
    note: String(form.get("note") ?? "").trim().slice(0, 2000),
    starts_at: String(form.get("starts_at") ?? ""),
    ends_at: String(form.get("ends_at") ?? ""),
  };
  const error = await command(vehicleId, "open_activity", data);
  return error ? { error } : { saved: true };
}

export async function closeVehicleActivity(vehicleId: string, eventId: string): Promise<void> {
  await command(vehicleId, "close_activity", { event_id: eventId });
}

export async function saveVehicleCheck(_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> {
  const vehicleId = String(form.get("vehicle_id") ?? "");
  const code = String(form.get("code") ?? "");
  const status = String(form.get("status") ?? "");
  if (!["identity","finance","mechanical","documents","photos","road_test"].includes(code)
    || !["pending","passed","attention"].includes(status)) return { error: "Invalid check." };
  const error = await command(vehicleId, "check", { code, status, note: String(form.get("note") ?? "").trim().slice(0, 1000) });
  return error ? { error } : { saved: true };
}
