"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { commercialPermission } from "@/lib/commercial-server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

async function editableDealer() {
  const session = await requireSession();
  if (!can.manageDeals(session.role) || !(await commercialPermission("work")) || isDemoMode()) return null;
  return session;
}

export async function createContactGroup(name: string): Promise<{ error?: string }> {
  const parsed = z.string().trim().min(2).max(80).safeParse(name);
  if (!parsed.success) return { error: "Enter a group name (2–80 characters)." };
  const session = await editableDealer();
  if (!session) return { error: "Contact groups cannot be changed here." };
  const db = await createClient();
  const { error } = await db.from("contact_groups").insert({ dealer_id: session.dealer.id, name: parsed.data, created_by: session.userId });
  if (error) return { error: error.code === "23505" ? "A group with this name already exists." : "Could not create the group." };
  revalidatePath("/business/customers/groups");
  return {};
}

export async function setContactGroupMembership(input: { groupId: string; customerId: string; included: boolean }): Promise<{ error?: string }> {
  const parsed = z.object({ groupId: z.string().uuid(), customerId: z.string().uuid(), included: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Choose a valid contact and group." };
  const session = await editableDealer();
  if (!session) return { error: "Contact groups cannot be changed here." };
  const db = await createClient();
  const [{ data: group }, { data: contact }] = await Promise.all([
    db.from("contact_groups").select("id,system_key").eq("dealer_id", session.dealer.id).eq("id", parsed.data.groupId).maybeSingle(),
    db.from("customers").select("id,type,address_line1").eq("dealer_id", session.dealer.id).eq("id", parsed.data.customerId).is("deleted_at", null).maybeSingle(),
  ]);
  if (!group || !contact) return { error: "Contact or group not found." };
  if (group.system_key === "customers" && !parsed.data.included) return { error: "The All contacts group includes every active contact automatically." };
  if (parsed.data.included && group.system_key === "finance_companies" && (contact.type !== "business" || (contact.address_line1 ?? "").trim().length < 5)) {
    return { error: "A finance company must be a business contact with an invoice address." };
  }
  const result = parsed.data.included
    ? await db.from("contact_group_members").upsert({ dealer_id: session.dealer.id, group_id: group.id, customer_id: contact.id, created_by: session.userId }, { onConflict: "group_id,customer_id" })
    : await db.from("contact_group_members").delete().eq("dealer_id", session.dealer.id).eq("group_id", group.id).eq("customer_id", contact.id);
  if (result.error) return { error: "Could not update the group. Check the database migration and your access." };
  revalidatePath("/business/customers/groups");
  revalidatePath("/business/deals", "layout");
  return {};
}
