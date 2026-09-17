"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crmContext } from "@/lib/crm-server";
import { CRM_ERRORS, CRM_PERMISSIONS } from "@/lib/crm";

export interface CrmState { error?: string; saved?: boolean }
const optionalId = z.union([z.literal(""), z.string().uuid()]);
const leadSchema = z.object({
  id: optionalId, version: z.coerce.number().int().min(0),
  title: z.string().trim().min(2).max(160), customer_id: optionalId,
  customer_name: z.string().trim().max(120), email: z.union([z.literal(""), z.string().email().max(254)]),
  phone: z.string().trim().max(40), vehicle_id: optionalId, assigned_to: optionalId,
  stage: z.enum(["new","contacted","appointment","test_drive","finance_applied","sold","after_sales","lost"]),
  source: z.enum(["website","donedeal","facebook","instagram","whatsapp","walk_in","phone","other"]),
  score: z.enum(["","hot","warm","cold"]), notes: z.string().trim().max(4000),
  next_action: z.string().trim().max(300), next_action_at: z.string().max(30),
  lost_reason: z.string().trim().max(500),
});

export async function saveLead(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await crmContext();
  if (ctx.error || !ctx.permissions.includes("work")) return { error: ctx.error ?? CRM_ERRORS.crm_not_allowed };
  if (!ctx.supabase) return { error: "Preview only. Connect Supabase to save leads." };
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the lead fields, contact details and dates." };
  const { id, version, ...input } = parsed.data;
  if (input.next_action_at) {
    const raw = input.next_action_at;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return { error: "Enter a valid follow-up date (UTC)." };
    const date = new Date(raw + ":00Z");
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 16) !== raw) return { error: "Enter a valid date." };
    input.next_action_at = date.toISOString();
  }
  const { data, error } = await ctx.supabase.rpc("save_crm_lead", {
    p_dealer_id: ctx.session.dealer.id, p_id: id || null, p_expected_version: version, p_input: input,
  });
  if (error || !data) return { error: CRM_ERRORS[error?.message ?? ""] ?? "Could not save this lead. No partial changes were saved." };
  revalidatePath("/leads"); revalidatePath("/leads/reports"); revalidatePath(`/leads/${data}`);
  redirect(`/leads/${data}?saved=1`);
}

export async function recordActivity(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await crmContext();
  if (ctx.error || !ctx.permissions.includes("work")) return { error: ctx.error ?? CRM_ERRORS.crm_not_allowed };
  if (!ctx.supabase) return { error: "Preview only. Connect Supabase to record activity." };
  const parsed = z.object({ lead_id: z.string().uuid(), type: z.enum(["note","call","email","whatsapp"]), body: z.string().trim().min(1).max(4000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose an activity and add a description." };
  const { error } = await ctx.supabase.rpc("record_crm_activity", { p_dealer_id: ctx.session.dealer.id, p_lead_id: parsed.data.lead_id, p_type: parsed.data.type, p_body: parsed.data.body });
  if (error) return { error: CRM_ERRORS[error.message] ?? "Activity was not saved. Try again." };
  revalidatePath(`/leads/${parsed.data.lead_id}`);
  return { saved: true };
}

export async function saveCrmRole(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await crmContext();
  if (ctx.session.role !== "owner" || ctx.error) return { error: "Only the owner can configure CRM profiles." };
  if (!ctx.supabase) return { error: "Preview only. Connect Supabase to configure profiles." };
  const parsed = z.object({ id: optionalId, name: z.string().trim().min(2).max(60), permissions: z.array(z.enum(CRM_PERMISSIONS)) }).safeParse({ id: formData.get("id") ?? "", name: formData.get("name"), permissions: formData.getAll("permissions") });
  if (!parsed.success) return { error: "Enter a profile name and valid permissions." };
  const d = parsed.data;
  if (d.permissions.length && !d.permissions.includes("read")) return { error: "Enable Read leads before enabling other CRM permissions." };
  const row = { dealer_id: ctx.session.dealer.id, name: d.name, permissions: d.permissions };
  const result = d.id
    ? await ctx.supabase.from("crm_roles").update(row).eq("id", d.id).eq("dealer_id", ctx.session.dealer.id).select("id").single()
    : await ctx.supabase.from("crm_roles").insert(row).select("id").single();
  if (result.error) return { error: "Could not save the profile. Check that its name is unique." };
  revalidatePath("/leads/team");
  return { saved: true };
}

export async function assignCrmRole(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const ctx = await crmContext();
  if (ctx.session.role !== "owner" || ctx.error) return { error: "Only the owner can assign CRM profiles." };
  if (!ctx.supabase) return { error: "Preview only. Connect Supabase to assign profiles." };
  const parsed = z.object({ user_id: z.string().uuid(), role_id: optionalId }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a team member and profile." };
  const { data, error } = await ctx.supabase.from("dealer_members").update({ crm_role_id: parsed.data.role_id || null })
    .eq("dealer_id", ctx.session.dealer.id).eq("user_id", parsed.data.user_id).eq("role", "sales").eq("status", "active").select("user_id").single();
  if (error || !data) return { error: "Could not assign the profile. It must belong to this dealer and the member must be an active salesperson." };
  revalidatePath("/leads/team");
  return { saved: true };
}
