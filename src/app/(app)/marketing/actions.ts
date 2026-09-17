"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoBrandKit, demoBusinessProfile, demoTemplates, demoAdScripts, demoPromotions } from "@/lib/demo";
import { generateAdCopy, type AdChannel, type AdCopy } from "@/lib/ai/adcopy";
import {
  generatePromoIdeas,
  generatePromoTerms,
  type PromoIdea,
  type PromoKind,
  type PromoTerms,
} from "@/lib/ai/promo";
import { can } from "@/lib/types";

const channels = [
  "donedeal",
  "facebook",
  "instagram_feed",
  "instagram_story",
  "google",
  "website",
] as const;

export interface GenerateAdState {
  error?: string;
  result?: AdCopy & { channel: AdChannel; vehicleName: string };
}

// Flatten the dealer's Business Setup profile into a compact context block for the AI.
function businessContextFrom(p: Record<string, unknown> | null | undefined): string | null {
  if (!p) return null;
  const rows: [string, unknown][] = [
    ["Opening hours", p.opening_hours],
    ["Warranty", p.warranty_info],
    ["Included in the deal", p.whats_included],
    ["Extra services", p.extra_services],
    ["Phone", p.phone],
    ["WhatsApp", p.whatsapp],
    ["Email", p.email],
    ["Website", p.website_url],
    ["Social", p.social_links],
    ["Finance", p.finance_available ? p.finance_details || "available" : null],
  ];
  const lines = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${String(v).replace(/\s+/g, " ").trim()}`);
  return lines.length ? lines.join("\n") : null;
}

export async function generateAd(
  _prev: GenerateAdState,
  formData: FormData
): Promise<GenerateAdState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      channel: z.enum(channels),
      scriptId: z.string().max(64).optional(),
      promotionId: z.string().max(64).optional(),
    })
    .safeParse({
      vehicleId: formData.get("vehicleId"),
      channel: formData.get("channel"),
      scriptId: formData.get("scriptId") || undefined,
      promotionId: formData.get("promotionId") || undefined,
    });
  if (!parsed.success) return { error: "Pick a vehicle and a channel." };

  const { vehicleId, channel, scriptId, promotionId } = parsed.data;

  // Load vehicle + brand kit + standard blocks + saved scripts + promotions (demo or DB).
  let vehicle, brandKit, business, templates, scripts, promotions;
  if (isDemoMode()) {
    vehicle = demoVehicles.find((v) => v.id === vehicleId);
    brandKit = demoBrandKit;
    business = demoBusinessProfile;
    templates = demoTemplates;
    scripts = demoAdScripts;
    promotions = demoPromotions;
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: bk }, { data: bp }, { data: tpl }, { data: scr }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, make, model, year, km, fuel, transmission, sale_price, nct_expiry, warranty_months")
        .eq("dealer_id", session.dealer.id)
        .eq("id", vehicleId)
        .maybeSingle(),
      supabase
        .from("brand_kits")
        .select("tone_of_voice, website_url")
        .eq("dealer_id", session.dealer.id)
        .maybeSingle(),
      supabase
        .from("business_profiles")
        .select("*")
        .eq("dealer_id", session.dealer.id)
        .maybeSingle(),
      supabase
        .from("description_templates")
        .select("id, body")
        .eq("dealer_id", session.dealer.id)
        .eq("is_default", true)
        .order("position"),
      supabase
        .from("ad_scripts")
        .select("id, body")
        .eq("dealer_id", session.dealer.id),
    ]);
    vehicle = v;
    brandKit = bk;
    business = bp;
    templates = tpl ?? [];
    scripts = scr ?? [];
    // Only active promotions can be attached to an ad.
    const { data: promo } = await supabase
      .from("promotions")
      .select("id, title, offer_details, terms")
      .eq("dealer_id", session.dealer.id)
      .eq("status", "active");
    promotions = promo ?? [];
  }

  if (!vehicle) return { error: "Vehicle not found." };

  const scriptBody = scriptId
    ? scripts.find((s: { id: string }) => s.id === scriptId)?.body ?? null
    : null;

  // Append the selected promotion's offer + T&C to the AI context block.
  const promo = promotionId
    ? promotions.find((p: { id: string }) => p.id === promotionId)
    : null;
  const promoBlock = promo
    ? `Current promotion "${promo.title}": ${promo.offer_details ?? ""}${
        promo.terms ? `\nTerms: ${promo.terms}` : ""
      }`
    : null;
  const businessContext = [businessContextFrom(business), promoBlock]
    .filter(Boolean)
    .join("\n");

  const copy = await generateAdCopy(
    {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      km: vehicle.km,
      fuel: vehicle.fuel,
      transmission: vehicle.transmission,
      sale_price: vehicle.sale_price,
      nct_expiry: "nct_expiry" in vehicle ? (vehicle.nct_expiry as string | null) : null,
      warranty_months:
        "warranty_months" in vehicle ? (vehicle.warranty_months as number | null) : null,
    },
    {
      dealerName: session.dealer.name.replace(" (Preview)", ""),
      toneOfVoice: brandKit?.tone_of_voice ?? "professional and friendly",
      websiteUrl: brandKit?.website_url,
      standardBlocks: (templates ?? []).map((t: { body: string }) => t.body),
      businessContext: businessContext || null,
    },
    channel,
    scriptBody
  );

  // Persist history (real mode only).
  if (!isDemoMode()) {
    const supabase = await createClient();
    await supabase.from("generated_descriptions").insert({
      dealer_id: session.dealer.id,
      vehicle_id: vehicleId,
      channel,
      title: copy.title,
      body: copy.body,
      hashtags: copy.hashtags,
      created_by: session.userId,
    });
  }

  return {
    result: {
      ...copy,
      channel,
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    },
  };
}

export interface BrandKitState {
  error?: string;
  saved?: boolean;
}

export async function saveBrandKit(
  _prev: BrandKitState,
  formData: FormData
): Promise<BrandKitState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      tone_of_voice: z.string().trim().min(3).max(300),
      website_url: z.union([z.literal(""), z.string().trim().url().max(300)]),
      primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      logo_position: z.enum(["top_left", "top_right", "bottom_left", "bottom_right", "center"]),
      logo_size_pct: z.coerce.number().int().min(4).max(40),
      logo_opacity_pct: z.coerce.number().int().min(10).max(100),
      frame_style: z.enum(["none", "banner_bottom", "banner_top", "border"]),
    })
    .safeParse({
      tone_of_voice: formData.get("tone_of_voice"),
      website_url: formData.get("website_url"),
      primary_color: formData.get("primary_color"),
      logo_position: formData.get("logo_position"),
      logo_size_pct: formData.get("logo_size_pct"),
      logo_opacity_pct: formData.get("logo_opacity_pct"),
      frame_style: formData.get("frame_style"),
    });

  if (!parsed.success) return { error: "Check the brand kit fields." };

  if (isDemoMode()) {
    return { saved: true }; // demo: pretend-save so the flow is testable
  }

  const supabase = await createClient();
  const { error } = await supabase.from("brand_kits").upsert({
    dealer_id: session.dealer.id,
    ...parsed.data,
    website_url: parsed.data.website_url || null,
    updated_at: new Date().toISOString(),
  });

  if (error) return { error: "Could not save the brand kit." };
  return { saved: true };
}

const channelOrAny = z.union([z.enum(channels), z.literal("")]);

export interface AdScriptState {
  error?: string;
  saved?: boolean;
}

export async function saveAdScript(
  _prev: AdScriptState,
  formData: FormData
): Promise<AdScriptState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      channel: channelOrAny,
      vehicle_type: z.string().trim().max(40).optional(),
      body: z.string().trim().min(10).max(4000),
    })
    .safeParse({
      name: formData.get("name"),
      channel: formData.get("channel") ?? "",
      vehicle_type: formData.get("vehicle_type") || undefined,
      body: formData.get("body"),
    });
  if (!parsed.success) return { error: "Give the script a name and a body (min 10 chars)." };

  if (isDemoMode()) return { saved: true };

  const supabase = await createClient();
  const { error } = await supabase.from("ad_scripts").insert({
    dealer_id: session.dealer.id,
    name: parsed.data.name,
    channel: parsed.data.channel || null,
    vehicle_type: parsed.data.vehicle_type || null,
    body: parsed.data.body,
  });

  if (error) return { error: "Could not save the script." };
  revalidatePath("/marketing/scripts");
  return { saved: true };
}

export async function deleteAdScript(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("ad_scripts")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", id.data);
  revalidatePath("/marketing/scripts");
}

export interface DescriptionBlockState {
  error?: string;
  saved?: boolean;
}

const blockKind = z.enum(["warranty", "finance", "hours", "trade_in", "custom"]);

export async function saveDescriptionBlock(
  _prev: DescriptionBlockState,
  formData: FormData
): Promise<DescriptionBlockState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      kind: blockKind,
      body: z.string().trim().min(5).max(2000),
    })
    .safeParse({
      name: formData.get("name"),
      kind: formData.get("kind") ?? "custom",
      body: formData.get("body"),
    });
  if (!parsed.success) return { error: "Give the block a name and a body (min 5 chars)." };

  if (isDemoMode()) return { saved: true };

  const supabase = await createClient();
  const { error } = await supabase.from("description_templates").insert({
    dealer_id: session.dealer.id,
    name: parsed.data.name,
    kind: parsed.data.kind,
    body: parsed.data.body,
  });

  if (error) return { error: "Could not save the block." };
  revalidatePath("/marketing/brand-kit");
  return { saved: true };
}

export async function deleteDescriptionBlock(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("description_templates")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", id.data);
  revalidatePath("/marketing/brand-kit");
}

export interface BusinessProfileState {
  error?: string;
  saved?: boolean;
}

export async function saveBusinessProfile(
  _prev: BusinessProfileState,
  formData: FormData
): Promise<BusinessProfileState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const text = (max: number) =>
    z.union([z.literal(""), z.string().trim().max(max)]);

  const parsed = z
    .object({
      opening_hours: text(600),
      warranty_info: text(1500),
      whats_included: text(1500),
      extra_services: text(1500),
      phone: text(60),
      whatsapp: text(60),
      email: z.union([z.literal(""), z.string().trim().email().max(200)]),
      website_url: z.union([z.literal(""), z.string().trim().url().max(300)]),
      social_links: text(1000),
      finance_available: z.coerce.boolean(),
      finance_details: text(1500),
    })
    .safeParse({
      opening_hours: formData.get("opening_hours") ?? "",
      warranty_info: formData.get("warranty_info") ?? "",
      whats_included: formData.get("whats_included") ?? "",
      extra_services: formData.get("extra_services") ?? "",
      phone: formData.get("phone") ?? "",
      whatsapp: formData.get("whatsapp") ?? "",
      email: formData.get("email") ?? "",
      website_url: formData.get("website_url") ?? "",
      social_links: formData.get("social_links") ?? "",
      finance_available: formData.get("finance_available") === "on",
      finance_details: formData.get("finance_details") ?? "",
    });

  if (!parsed.success) return { error: "Check the business details (email/website format)." };

  if (isDemoMode()) {
    return { saved: true }; // demo: pretend-save so the flow is testable
  }

  // Store empty strings as null to keep the AI context clean.
  const row = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
  );

  const supabase = await createClient();
  const { error } = await supabase.from("business_profiles").upsert({
    dealer_id: session.dealer.id,
    ...row,
    updated_at: new Date().toISOString(),
  });

  if (error) return { error: "Could not save the business setup." };
  revalidatePath("/marketing/business");
  return { saved: true };
}

/* ========== Events & Promotions ========== */

const promoKinds = ["seasonal", "holiday", "sale", "finance", "event", "other"] as const;
const promoStatuses = ["draft", "active", "ended"] as const;

// Load the dealer's brand tone + business facts for the AI (demo or DB).
async function promoAiContext(dealerId: string) {
  if (isDemoMode()) {
    return {
      tone: demoBrandKit.tone_of_voice,
      businessContext: businessContextFrom(demoBusinessProfile),
    };
  }
  const supabase = await createClient();
  const [{ data: bk }, { data: bp }] = await Promise.all([
    supabase.from("brand_kits").select("tone_of_voice").eq("dealer_id", dealerId).maybeSingle(),
    supabase.from("business_profiles").select("*").eq("dealer_id", dealerId).maybeSingle(),
  ]);
  return {
    tone: bk?.tone_of_voice ?? "professional and friendly",
    businessContext: businessContextFrom(bp),
  };
}

export interface PromoIdeasState {
  error?: string;
  ideas?: PromoIdea[];
}

export async function draftPromoIdeas(
  _prev: PromoIdeasState,
  formData: FormData
): Promise<PromoIdeasState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      kind: z.enum(promoKinds),
      title: z.string().trim().max(120).optional(),
      brief: z.string().trim().min(4).max(1000),
      offer_details: z.string().trim().max(1000).optional(),
      starts_on: z.string().max(20).optional(),
      ends_on: z.string().max(20).optional(),
    })
    .safeParse({
      kind: formData.get("kind"),
      title: formData.get("title") || undefined,
      brief: formData.get("brief"),
      offer_details: formData.get("offer_details") || undefined,
      starts_on: formData.get("starts_on") || undefined,
      ends_on: formData.get("ends_on") || undefined,
    });
  if (!parsed.success) return { error: "Add a short brief first (min 4 chars)." };

  const ctx = await promoAiContext(session.dealer.id);
  const ideas = await generatePromoIdeas({
    dealerName: session.dealer.name.replace(" (Preview)", ""),
    kind: parsed.data.kind as PromoKind,
    title: parsed.data.title,
    brief: parsed.data.brief,
    offerDetails: parsed.data.offer_details,
    starts: parsed.data.starts_on,
    ends: parsed.data.ends_on,
    toneOfVoice: ctx.tone,
    businessContext: ctx.businessContext,
  });
  return { ideas };
}

export interface PromoTermsState {
  error?: string;
  result?: PromoTerms;
}

export async function draftPromoTerms(
  _prev: PromoTermsState,
  formData: FormData
): Promise<PromoTermsState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      kind: z.enum(promoKinds),
      title: z.string().trim().max(120).optional(),
      brief: z.string().trim().min(4).max(1000),
      offer_details: z.string().trim().max(1000).optional(),
      starts_on: z.string().max(20).optional(),
      ends_on: z.string().max(20).optional(),
    })
    .safeParse({
      kind: formData.get("kind"),
      title: formData.get("title") || undefined,
      brief: formData.get("brief"),
      offer_details: formData.get("offer_details") || undefined,
      starts_on: formData.get("starts_on") || undefined,
      ends_on: formData.get("ends_on") || undefined,
    });
  if (!parsed.success) return { error: "Add a short brief first (min 4 chars)." };

  const ctx = await promoAiContext(session.dealer.id);
  const result = await generatePromoTerms({
    dealerName: session.dealer.name.replace(" (Preview)", ""),
    kind: parsed.data.kind as PromoKind,
    title: parsed.data.title,
    brief: parsed.data.brief,
    offerDetails: parsed.data.offer_details,
    starts: parsed.data.starts_on,
    ends: parsed.data.ends_on,
    toneOfVoice: ctx.tone,
    businessContext: ctx.businessContext,
  });
  return { result };
}

export interface PromotionState {
  error?: string;
  saved?: boolean;
}

const dateOrNull = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export async function savePromotion(
  _prev: PromotionState,
  formData: FormData
): Promise<PromotionState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const text = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]);

  const parsed = z
    .object({
      id: z.union([z.literal(""), z.string().uuid()]),
      title: z.string().trim().min(2).max(120),
      kind: z.enum(promoKinds),
      brief: text(1000),
      offer_details: text(1000),
      included: text(2000),
      excluded: text(2000),
      starts_on: dateOrNull,
      ends_on: dateOrNull,
      terms: text(6000),
      status: z.enum(promoStatuses),
    })
    .safeParse({
      id: formData.get("id") ?? "",
      title: formData.get("title"),
      kind: formData.get("kind"),
      brief: formData.get("brief") ?? "",
      offer_details: formData.get("offer_details") ?? "",
      included: formData.get("included") ?? "",
      excluded: formData.get("excluded") ?? "",
      starts_on: formData.get("starts_on") ?? "",
      ends_on: formData.get("ends_on") ?? "",
      terms: formData.get("terms") ?? "",
      status: formData.get("status") ?? "draft",
    });

  if (!parsed.success) return { error: "Give the promotion a title and check the dates." };

  if (isDemoMode()) return { saved: true };

  const { id, ...fields } = parsed.data;
  const row = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v === "" ? null : v])
  );
  row.title = parsed.data.title; // title is required, keep as-is
  row.kind = parsed.data.kind;
  row.status = parsed.data.status;

  const supabase = await createClient();
  const payload = {
    ...(id ? { id } : {}),
    dealer_id: session.dealer.id,
    ...row,
    created_by: session.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("promotions").upsert(payload);

  if (error) return { error: "Could not save the promotion." };
  revalidatePath("/marketing/promotions");
  return { saved: true };
}

export async function setPromotionStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;

  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(promoStatuses) })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("promotions")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/marketing/promotions");
}

// Send a draft into the manager approval queue (any marketing role).
export async function submitPromotion(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("promotions")
    .update({ submitted_for_approval: true, updated_at: new Date().toISOString() })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/marketing/promotions");
}

// Pull a promotion back out of the approval queue (withdraw / send back to draft).
export async function unsubmitPromotion(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("promotions")
    .update({ submitted_for_approval: false, updated_at: new Date().toISOString() })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/marketing/promotions");
}

// Approve & sign the T&C, then publish. Only a manager (owner/admin) may sign.
export async function approvePromotion(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.approvePromotions(session.role)) return;

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.userId)
    .maybeSingle();
  const approver = profile?.full_name || session.email;
  const roleLabel = session.role === "owner" ? "Owner" : "Marketing Manager";

  await supabase
    .from("promotions")
    .update({
      status: "active",
      submitted_for_approval: false,
      approved_by: approver,
      approved_role: roleLabel,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/marketing/promotions");
}
