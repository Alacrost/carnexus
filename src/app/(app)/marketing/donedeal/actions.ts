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
} from "@/lib/demo";
import { generateAdCopy } from "@/lib/ai/adcopy";
import { carTypeLabel } from "@/lib/car-types";
import { can } from "@/lib/types";

// Compact Business Setup context for the AI (mirrors marketing/actions.ts).
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
    ["Finance", p.finance_available ? p.finance_details || "available" : null],
  ];
  const lines = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${String(v).replace(/\s+/g, " ").trim()}`);
  return lines.length ? lines.join("\n") : null;
}

export interface DoneDealDraftInput {
  vehicleId: string;
  carType: string;
  emphasis?: string;
  scriptBody?: string;
  blocks?: string[];
}

export interface DoneDealResult {
  title: string;
  body: string;
  generator: "openai" | "mock";
  error?: string;
}

export async function draftDoneDealListing(
  input: DoneDealDraftInput
): Promise<DoneDealResult> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { title: "", body: "", generator: "mock", error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      carType: z.string().max(40),
      emphasis: z.string().max(200).optional(),
      scriptBody: z.string().max(4000).optional(),
      blocks: z.array(z.string().max(2000)).max(20).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { title: "", body: "", generator: "mock", error: "Pick a vehicle first." };
  }
  const { vehicleId, carType, emphasis, scriptBody, blocks } = parsed.data;

  let vehicle, brandKit, business;
  if (isDemoMode()) {
    vehicle = demoVehicles.find((v) => v.id === vehicleId);
    brandKit = demoBrandKit;
    business = demoBusinessProfile;
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: bk }, { data: bp }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("make, model, year, km, fuel, transmission, sale_price, nct_expiry, warranty_months")
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
    ]);
    vehicle = v;
    brandKit = bk;
    business = bp;
  }
  if (!vehicle) return { title: "", body: "", generator: "mock", error: "Vehicle not found." };

  const emphasisLine = [
    `Vehicle type: ${carTypeLabel(carType)}`,
    emphasis ? `Listing emphasis: ${emphasis}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const businessContext = [businessContextFrom(business), emphasisLine]
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
      standardBlocks: blocks ?? [],
      businessContext: businessContext || null,
    },
    "donedeal",
    scriptBody || null
  );

  return { title: copy.title, body: copy.body, generator: copy.generator };
}

export interface DoneDealSaveInput {
  vehicleId: string;
  title: string;
  body: string;
}

export interface DoneDealSaveResult {
  saved?: boolean;
  error?: string;
}

export async function saveDoneDealListing(
  input: DoneDealSaveInput
): Promise<DoneDealSaveResult> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(6000),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Nothing to save yet." };

  if (isDemoMode()) return { saved: true };

  const supabase = await createClient();
  const { error } = await supabase.from("generated_descriptions").insert({
    dealer_id: session.dealer.id,
    vehicle_id: parsed.data.vehicleId,
    channel: "donedeal",
    title: parsed.data.title,
    body: parsed.data.body,
    hashtags: "",
    created_by: session.userId,
  });
  if (error) return { error: "Could not save the listing." };

  // The DoneDeal listing becomes the car's stored description.
  await supabase
    .from("vehicles")
    .update({ description: parsed.data.body })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.vehicleId);

  revalidatePath("/inventory");
  return { saved: true };
}
