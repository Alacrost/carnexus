"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isDemoMode,
  demoVehicles,
  demoBrandKit,
  demoBusinessProfile,
  demoPromotions,
} from "@/lib/demo";
import {
  generateSocialPost as aiGenerateSocialPost,
  type SocialChannel,
  type SocialKind,
} from "@/lib/ai/social";
import { can } from "@/lib/types";

const channels = ["facebook", "instagram"] as const;
const kinds = ["tip", "info", "car_of_week", "promo", "custom"] as const;
const statuses = ["draft", "scheduled", "posted", "late", "cancelled"] as const;

function businessContextFrom(p: Record<string, unknown> | null | undefined): string | null {
  if (!p) return null;
  const rows: [string, unknown][] = [
    ["Opening hours", p.opening_hours],
    ["Warranty", p.warranty_info],
    ["Included in the deal", p.whats_included],
    ["Finance", p.finance_available ? p.finance_details || "available" : null],
    ["Phone", p.phone],
    ["Website", p.website_url],
  ];
  const lines = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${String(v).replace(/\s+/g, " ").trim()}`);
  return lines.length ? lines.join("\n") : null;
}

export interface DraftPostResult {
  body: string;
  hashtags: string;
  generator: "openai" | "mock";
  error?: string;
}

export async function draftSocialPost(input: {
  channel: SocialChannel;
  kind: SocialKind;
  vehicleId?: string;
  promotionId?: string;
  topic?: string;
}): Promise<DraftPostResult> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { body: "", hashtags: "", generator: "mock", error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      channel: z.enum(channels),
      kind: z.enum(kinds),
      vehicleId: z.string().max(64).optional(),
      promotionId: z.string().max(64).optional(),
      topic: z.string().max(200).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { body: "", hashtags: "", generator: "mock", error: "Check the post options." };
  const { channel, kind, vehicleId, promotionId, topic } = parsed.data;

  let vehicle, brandKit, business, promotions;
  if (isDemoMode()) {
    vehicle = vehicleId ? demoVehicles.find((v) => v.id === vehicleId) : null;
    brandKit = demoBrandKit;
    business = demoBusinessProfile;
    promotions = demoPromotions;
  } else {
    const supabase = await createClient();
    const [{ data: bk }, { data: bp }] = await Promise.all([
      supabase.from("brand_kits").select("tone_of_voice").eq("dealer_id", session.dealer.id).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("dealer_id", session.dealer.id).maybeSingle(),
    ]);
    brandKit = bk;
    business = bp;
    if (vehicleId) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("year, make, model, sale_price")
        .eq("dealer_id", session.dealer.id)
        .eq("id", vehicleId)
        .maybeSingle();
      vehicle = v;
    }
    if (promotionId) {
      const { data: p } = await supabase
        .from("promotions")
        .select("id, title, offer_details")
        .eq("dealer_id", session.dealer.id)
        .eq("id", promotionId)
        .maybeSingle();
      promotions = p ? [p] : [];
    }
  }

  const promo = promotionId
    ? (promotions ?? []).find((p: { id: string }) => p.id === promotionId)
    : null;

  const post = await aiGenerateSocialPost({
    channel,
    kind,
    dealerName: session.dealer.name.replace(" (Preview)", ""),
    toneOfVoice: brandKit?.tone_of_voice ?? "professional and friendly",
    businessContext: businessContextFrom(business),
    vehicle: vehicle
      ? {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          price: "sale_price" in vehicle ? (vehicle.sale_price as number | null) : null,
        }
      : null,
    promo: promo
      ? { title: promo.title, offer: (promo as { offer_details?: string | null }).offer_details ?? null }
      : null,
    topic: topic || null,
  });

  return { body: post.body, hashtags: post.hashtags, generator: post.generator };
}

export interface SaveContentResult {
  id?: string;
  error?: string;
}

export async function saveScheduledContent(input: {
  id?: string;
  channel: SocialChannel;
  kind: SocialKind;
  scheduledFor?: string | null;
  body: string;
  hashtags?: string;
  vehicleId?: string | null;
  promotionId?: string | null;
  status?: (typeof statuses)[number];
}): Promise<SaveContentResult> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return { error: "Your role does not include the marketing module." };

  const parsed = z
    .object({
      id: z.string().max(64).optional(),
      channel: z.enum(channels),
      kind: z.enum(kinds),
      scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      body: z.string().trim().max(4000),
      hashtags: z.string().max(500).optional(),
      vehicleId: z.string().max(64).optional().nullable(),
      promotionId: z.string().max(64).optional().nullable(),
      status: z.enum(statuses).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Could not save this post." };

  if (isDemoMode()) return { id: input.id ?? crypto.randomUUID() };

  const d = parsed.data;
  const row = {
    dealer_id: session.dealer.id,
    channel: d.channel,
    kind: d.kind,
    scheduled_for: d.scheduledFor ?? null,
    body: d.body,
    hashtags: d.hashtags ?? null,
    vehicle_id: d.vehicleId ?? null,
    promotion_id: d.promotionId ?? null,
    status: d.status ?? "draft",
    created_by: session.userId,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const query = d.id
    ? supabase.from("scheduled_content").update(row).eq("id", d.id).eq("dealer_id", session.dealer.id).select("id").maybeSingle()
    : supabase.from("scheduled_content").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) return { error: "Could not save this post." };

  revalidatePath("/marketing/social");
  return { id: data.id };
}

export async function setContentStatus(id: string, status: string): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(statuses) }).safeParse({ id, status });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("scheduled_content")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/marketing/social");
}

export async function deleteScheduledContent(id: string): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("scheduled_content")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);
  revalidatePath("/marketing/social");
}
