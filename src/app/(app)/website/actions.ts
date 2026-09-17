"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";

export interface WebsiteState {
  error?: string;
  saved?: boolean;
}

const text = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]);

export async function saveWebsiteSettings(_prev: WebsiteState, formData: FormData): Promise<WebsiteState> {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) return { error: "Only owners and admins can manage the website." };
  const parsed = z
    .object({
      enabled: z.string().optional(),
      headline: text(120),
      subheadline: text(160),
      about: text(2000),
      phone: text(40),
      whatsapp: text(40),
      email: z.union([z.literal(""), z.string().trim().email().max(200)]),
      theme_color: z.union([z.literal(""), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/)]),
      donedeal_seller_url: z.union([z.literal(""), z.string().trim().url().max(300)]),
    })
    .safeParse({
      enabled: formData.get("enabled") ?? undefined,
      headline: formData.get("headline") ?? "",
      subheadline: formData.get("subheadline") ?? "",
      about: formData.get("about") ?? "",
      phone: formData.get("phone") ?? "",
      whatsapp: formData.get("whatsapp") ?? "",
      email: formData.get("email") ?? "",
      theme_color: formData.get("theme_color") ?? "",
      donedeal_seller_url: formData.get("donedeal_seller_url") ?? "",
    });
  if (!parsed.success) return { error: "Check the website fields." };
  if (isDemoMode()) return { saved: true };

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("website_settings").upsert({
    dealer_id: session.dealer.id,
    enabled: d.enabled === "on",
    headline: d.headline || null,
    subheadline: d.subheadline || null,
    about: d.about || null,
    phone: d.phone || null,
    whatsapp: d.whatsapp || null,
    email: d.email || null,
    theme_color: d.theme_color || "#0ea5e9",
    donedeal_seller_url: d.donedeal_seller_url || null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Could not save the website." };
  revalidatePath("/website");
  revalidatePath(`/s/${session.dealer.slug}`);
  return { saved: true };
}

// Pull the latest stock from DoneDeal. The live API integration lands later; for now this
// marks the site as synced (the site already serves live from your own stock hourly).
export async function syncFromDoneDeal(): Promise<void> {
  const session = await requireSession();
  if (!can.manageMembers(session.role) || isDemoMode()) return;
  const supabase = await createClient();
  await supabase.from("website_settings").update({ last_synced_at: new Date().toISOString() }).eq("dealer_id", session.dealer.id);
  revalidatePath("/website");
}
