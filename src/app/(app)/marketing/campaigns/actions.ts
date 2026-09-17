"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoBrandKit, demoBusinessProfile } from "@/lib/demo";
import { generateAdCopy, refineAdCopy, type AdChannel, type AdCopy } from "@/lib/ai/adcopy";
import { enhanceCarImage, IMAGE_OP_COST, type ImageOp } from "@/lib/ai/image";
import { can } from "@/lib/types";

// Channels the composer produces, each mapped to a platform image size client-side.
const CAMPAIGN_CHANNELS: AdChannel[] = [
  "donedeal",
  "facebook",
  "instagram_feed",
  "instagram_story",
  "whatsapp",
  "tiktok",
];

function businessContextFrom(p: Record<string, unknown> | null | undefined): string | null {
  if (!p) return null;
  const rows: [string, unknown][] = [
    ["Opening hours", p.opening_hours],
    ["Warranty", p.warranty_info],
    ["Included in the deal", p.whats_included],
    ["Extra services", p.extra_services],
    ["Finance", p.finance_available ? p.finance_details || "available" : null],
  ];
  const lines = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${String(v).replace(/\s+/g, " ").trim()}`);
  return lines.length ? lines.join("\n") : null;
}

/* ---- Clarify → Suggest: campaign angles ---- */

export interface CampaignIdeasState {
  error?: string;
  angles?: string[];
}

const pushLevels = ["soft", "balanced", "hard"] as const;

export async function draftCampaignIdeas(
  _prev: CampaignIdeasState,
  formData: FormData
): Promise<CampaignIdeasState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      audience: z.string().trim().max(120).optional(),
      push: z.enum(pushLevels).default("balanced"),
    })
    .safeParse({
      vehicleId: formData.get("vehicleId"),
      audience: formData.get("audience") || undefined,
      push: formData.get("push") || "balanced",
    });
  if (!parsed.success) return { error: "Pick a vehicle first." };

  const vehicle = await loadVehicle(session.dealer.id, parsed.data.vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };

  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const who = parsed.data.audience?.trim();
  const byPush: Record<(typeof pushLevels)[number], string[]> = {
    soft: [
      `${name} — just arrived`,
      `Take a closer look: ${name}`,
      `Quietly one of our best: ${name}`,
    ],
    balanced: [
      `${name} ready to drive away`,
      `Great value: ${name}`,
      `Book a test drive — ${name}`,
    ],
    hard: [
      `Won't last long — ${name}`,
      `This week only: ${name}`,
      `Move fast: ${name} priced to sell`,
    ],
  };
  const angles = byPush[parsed.data.push].map((a) =>
    who ? `${a} · for ${who}` : a
  );
  return { angles };
}

/* ---- Execute: per-channel copy ---- */

export interface CampaignChannelCopy extends AdCopy {
  channel: AdChannel;
}

export interface GenerateCampaignState {
  error?: string;
  result?: {
    angle: string;
    vehicleName: string;
    price: number | null;
    channels: CampaignChannelCopy[];
  };
}

export async function generateCampaign(
  _prev: GenerateCampaignState,
  formData: FormData
): Promise<GenerateCampaignState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      promotionId: z.string().max(64).optional(),
      angle: z.string().trim().max(200).optional(),
    })
    .safeParse({
      vehicleId: formData.get("vehicleId"),
      promotionId: formData.get("promotionId") || undefined,
      angle: formData.get("angle") || undefined,
    });
  if (!parsed.success) return { error: "Pick a vehicle first." };

  const vehicle = await loadVehicle(session.dealer.id, parsed.data.vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };

  // Brand tone + business facts + optional promotion (demo or DB).
  let brand: { tone_of_voice?: string; website_url?: string | null };
  let business: Record<string, unknown> | null;
  let promo: { title: string; offer_details: string | null; terms: string | null } | null =
    null;
  if (isDemoMode()) {
    brand = demoBrandKit;
    business = demoBusinessProfile;
  } else {
    const supabase = await createClient();
    const [{ data: bk }, { data: bp }] = await Promise.all([
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
    ]);
    brand = bk ?? {};
    business = bp;
    if (parsed.data.promotionId) {
      const { data: pr } = await supabase
        .from("promotions")
        .select("title, offer_details, terms")
        .eq("dealer_id", session.dealer.id)
        .eq("id", parsed.data.promotionId)
        .maybeSingle();
      promo = pr;
    }
  }

  const promoBlock = promo
    ? `Current promotion "${promo.title}": ${promo.offer_details ?? ""}${
        promo.terms ? `\nTerms: ${promo.terms}` : ""
      }`
    : null;
  const businessContext = [businessContextFrom(business), promoBlock]
    .filter(Boolean)
    .join("\n");

  const brandInput = {
    dealerName: session.dealer.name.replace(" (Preview)", ""),
    toneOfVoice: brand.tone_of_voice ?? "professional and friendly",
    websiteUrl: brand.website_url,
    standardBlocks: [] as string[],
    businessContext: businessContext || null,
  };
  const vehicleInput = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    km: vehicle.km,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    sale_price: vehicle.sale_price,
    nct_expiry: vehicle.nct_expiry ?? null,
    warranty_months: vehicle.warranty_months ?? null,
  };

  const channels = await Promise.all(
    CAMPAIGN_CHANNELS.map(async (channel) => ({
      channel,
      ...(await generateAdCopy(vehicleInput, brandInput, channel)),
    }))
  );

  return {
    result: {
      angle: parsed.data.angle ?? "",
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      price: vehicle.sale_price,
      channels,
    },
  };
}

/* ---- AI image (credits) ---- */

export interface EnhanceState {
  error?: string;
  url?: string;
  remaining?: number;
  note?: string;
}

export async function enhanceCampaignImage(
  _prev: EnhanceState,
  formData: FormData
): Promise<EnhanceState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      bucket: z.enum(["vehicle-photos", "brand-assets"]),
      path: z.string().min(3).max(300),
      op: z.enum(["enhance", "background"]),
      backgroundPrompt: z.string().trim().max(200).optional(),
    })
    .safeParse({
      bucket: formData.get("bucket"),
      path: formData.get("path"),
      op: formData.get("op"),
      backgroundPrompt: formData.get("backgroundPrompt") || undefined,
    });
  if (!parsed.success) return { error: "Missing image to enhance." };

  const op = parsed.data.op as ImageOp;

  // Demo or no AI configured: no spend, return the original untouched.
  if (isDemoMode() || !process.env.OPENAI_API_KEY) {
    return { note: "AI image editing isn't configured — showing the original photo." };
  }

  // The image path must belong to this dealer.
  if (!parsed.data.path.startsWith(`${session.dealer.id}/`)) {
    return { error: "That image isn't yours to edit." };
  }

  const supabase = await createClient();

  // Spend credits first — fail closed on insufficient balance.
  let remaining: number;
  const { data: spent, error: spendError } = await supabase.rpc("spend_ai_credits", {
    p_dealer_id: session.dealer.id,
    p_amount: IMAGE_OP_COST[op],
  });
  if (spendError || spent == null) {
    return { error: "Not enough credits for that. Top up to keep using AI images." };
  }
  remaining = spent as number;

  const { data: file, error: dlError } = await supabase.storage
    .from(parsed.data.bucket)
    .download(parsed.data.path);
  if (dlError || !file) return { error: "Could not load the photo.", remaining };

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await enhanceCarImage(
    bytes,
    file.type || "image/jpeg",
    op,
    parsed.data.backgroundPrompt
  );

  const outPath = `${session.dealer.id}/campaigns/${crypto.randomUUID()}.png`;
  const { error: upError } = await supabase.storage
    .from("brand-assets")
    .upload(outPath, result.bytes, { contentType: result.contentType, upsert: false });
  if (upError) return { error: "Could not save the enhanced photo.", remaining };

  const { data: signed } = await supabase.storage
    .from("brand-assets")
    .createSignedUrl(outPath, 3600);

  return {
    url: signed?.signedUrl,
    remaining,
    note: op === "background" ? "Background replaced by AI." : "Photo enhanced by AI.",
  };
}

/* ---- Save draft ---- */

export interface SaveCampaignState {
  error?: string;
  saved?: boolean;
}

export async function saveCampaign(
  _prev: SaveCampaignState,
  formData: FormData
): Promise<SaveCampaignState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().uuid(),
      promotionId: z.union([z.literal(""), z.string().uuid()]),
      assets: z.string().max(60000),
    })
    .safeParse({
      vehicleId: formData.get("vehicleId"),
      promotionId: formData.get("promotionId") ?? "",
      assets: formData.get("assets") ?? "{}",
    });
  if (!parsed.success) return { error: "Generate the campaign before saving." };

  if (isDemoMode()) return { saved: true };

  let assets: unknown;
  try {
    assets = JSON.parse(parsed.data.assets);
  } catch {
    return { error: "Could not read the campaign assets." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    dealer_id: session.dealer.id,
    vehicle_id: parsed.data.vehicleId,
    promotion_id: parsed.data.promotionId || null,
    status: "draft",
    assets,
    created_by: session.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Could not save the campaign." };
  revalidatePath("/marketing/campaigns");
  return { saved: true };
}

/* ---- Campaign recipes (reusable presets) ---- */

export interface CampaignTemplateState {
  error?: string;
  saved?: boolean;
}

export async function saveCampaignTemplate(
  _prev: CampaignTemplateState,
  formData: FormData
): Promise<CampaignTemplateState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      config: z.string().max(4000),
    })
    .safeParse({
      name: formData.get("name"),
      config: formData.get("config") ?? "{}",
    });
  if (!parsed.success) return { error: "Give the template a name (min 2 chars)." };

  if (isDemoMode()) return { saved: true };

  let config: unknown;
  try {
    config = JSON.parse(parsed.data.config);
  } catch {
    return { error: "Could not read the template settings." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaign_templates").insert({
    dealer_id: session.dealer.id,
    name: parsed.data.name,
    config,
  });
  if (error) return { error: "Could not save the template." };
  revalidatePath("/marketing/campaigns");
  return { saved: true };
}

export async function deleteCampaignTemplate(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("campaign_templates")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", id.data);
  revalidatePath("/marketing/campaigns");
}

/* ---- Micro-actions: refine a single channel's text ---- */

export interface RefineState {
  text?: string;
  error?: string;
}

export async function refineChannelCopy(
  _prev: RefineState,
  formData: FormData
): Promise<RefineState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      text: z.string().trim().min(1).max(4000),
      action: z.enum(["shorter", "punchier", "emojis", "rephrase"]),
      channel: z.enum([
        "donedeal",
        "facebook",
        "instagram_feed",
        "instagram_story",
        "whatsapp",
        "tiktok",
      ]),
    })
    .safeParse({
      text: formData.get("text"),
      action: formData.get("action"),
      channel: formData.get("channel"),
    });
  if (!parsed.success) return { error: "Nothing to refine." };

  const { text } = await refineAdCopy(
    parsed.data.text,
    parsed.data.action,
    parsed.data.channel
  );
  return { text };
}

/* ---- helpers ---- */

async function loadVehicle(dealerId: string, vehicleId: string) {
  if (isDemoMode()) {
    const v = demoVehicles.find((x) => x.id === vehicleId);
    return v
      ? { ...v, nct_expiry: null as string | null, warranty_months: null as number | null }
      : null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select(
      "make, model, year, km, fuel, transmission, sale_price, nct_expiry, warranty_months"
    )
    .eq("dealer_id", dealerId)
    .eq("id", vehicleId)
    .maybeSingle();
  return data;
}
