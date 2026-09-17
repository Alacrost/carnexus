"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/types";
import { isDemoMode } from "@/lib/demo";
import { encryptSecret, secretStorageEnabled } from "@/lib/crypto";

export interface IntegrationsState {
  error?: string;
  saved?: boolean;
}

const urlField = z.union([z.literal(""), z.string().trim().url().max(300)]);

export async function saveIntegrations(
  _prev: IntegrationsState,
  formData: FormData
): Promise<IntegrationsState> {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) {
    return { error: "Only owners and admins can manage integrations." };
  }

  const parsed = z
    .object({
      facebook_url: urlField,
      instagram_url: urlField,
      website_url: urlField,
      donedeal_api_key: z.string().trim().max(400),
    })
    .safeParse({
      facebook_url: formData.get("facebook_url") ?? "",
      instagram_url: formData.get("instagram_url") ?? "",
      website_url: formData.get("website_url") ?? "",
      donedeal_api_key: formData.get("donedeal_api_key") ?? "",
    });

  if (!parsed.success) {
    return { error: "Check the link formats — Facebook, Instagram and website must be full URLs." };
  }

  if (isDemoMode()) {
    return { saved: true }; // demo: pretend-save so the flow is testable
  }

  const { facebook_url, instagram_url, website_url, donedeal_api_key } = parsed.data;
  const row: Record<string, unknown> = {
    dealer_id: session.dealer.id,
    facebook_url: facebook_url || null,
    instagram_url: instagram_url || null,
    website_url: website_url || null,
    updated_at: new Date().toISOString(),
  };

  // Only touch the secret when a new value is typed; encrypt server-side. Blank = keep.
  if (donedeal_api_key) {
    if (!secretStorageEnabled()) {
      return {
        error: "Set INTEGRATIONS_ENCRYPTION_KEY on the server before storing the DoneDeal API key.",
      };
    }
    row.donedeal_api_key = encryptSecret(donedeal_api_key);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dealer_integrations").upsert(row);
  if (error) return { error: "Could not save integrations." };

  revalidatePath("/settings");
  return { saved: true };
}

// Dealer-wide currency (owner only; dealers RLS already restricts updates to the owner).
export async function setDealerCurrency(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role !== "owner" || isDemoMode()) return;
  const currency = String(formData.get("currency") ?? "EUR");
  if (!["EUR", "GBP", "USD"].includes(currency)) return;
  const supabase = await createClient();
  await supabase.from("dealers").update({ currency }).eq("id", session.dealer.id);
  revalidatePath("/settings");
}

// Toggle which products the dealer subscribes to (owner only). Separates Sales CRM / Marketing / Website.
export async function setDealerModules(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role !== "owner" || isDemoMode()) return;
  const modules = {
    sales: formData.get("sales") === "on",
    marketing: formData.get("marketing") === "on",
    website: formData.get("website") === "on",
  };
  const supabase = await createClient();
  await supabase.from("dealers").update({ modules }).eq("id", session.dealer.id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}
