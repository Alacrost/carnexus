"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/types";
import { isDemoMode } from "@/lib/demo";
import { enhanceCarImage, IMAGE_OP_COST, type ImageOp } from "@/lib/ai/image";

// Geometry stored per overlay item — the PNG itself lives in brand-assets storage.
export interface PatternItem {
  path: string;
  ratio: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  opacity: number;
}

// Border/frame baked into a saved template (drawn over the swapped-in car photo).
export interface PatternFrame {
  style: string;
  color: string;
}

const itemSchema = z.object({
  path: z.string().min(1).max(300),
  ratio: z.number().positive().max(100),
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  widthPct: z.number().min(0.01).max(1),
  opacity: z.number().min(0).max(1),
});

const frameSchema = z.object({
  style: z.enum(["none", "solid", "double", "rounded", "corners", "banner"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  items: z.array(itemSchema).min(1).max(30),
  frame: frameSchema.optional(),
});

export interface SavePatternResult {
  error?: string;
  id?: string;
}

export async function saveOverlayPattern(input: {
  id?: string;
  name: string;
  items: PatternItem[];
  frame?: PatternFrame;
}): Promise<SavePatternResult> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid pattern data." };

  // Paths must stay inside this dealer's storage folder.
  const prefix = `${session.dealer.id}/`;
  if (parsed.data.items.some((it) => !it.path.startsWith(prefix))) {
    return { error: "Overlay files must belong to your dealer." };
  }

  const supabase = await createClient();
  const row = {
    dealer_id: session.dealer.id,
    name: parsed.data.name,
    items: parsed.data.items,
    frame: parsed.data.frame ?? {},
  };

  const query = parsed.data.id
    ? supabase.from("overlay_patterns").update(row).eq("id", parsed.data.id).eq("dealer_id", session.dealer.id).select("id").maybeSingle()
    : supabase.from("overlay_patterns").insert(row).select("id").single();

  const { data, error } = await query;
  if (error || !data) return { error: "Could not save the pattern." };

  revalidatePath("/marketing/photos");
  return { id: data.id };
}

export async function deleteOverlayPattern(id: string): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;

  // Storage files are left in place — an item may be shared with another pattern.
  const supabase = await createClient();
  await supabase
    .from("overlay_patterns")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);

  revalidatePath("/marketing/photos");
}

/* ---- Saved background templates (dealer's standard backdrops) ---- */

export interface BackgroundTemplate {
  id: string;
  name: string;
  prompt: string;
}

export async function saveBackgroundTemplate(input: {
  name: string;
  prompt: string;
}): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      prompt: z.string().trim().min(3).max(300),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Give the background a name and a short description." };

  // Demo: hand back a throwaway id so the session can use it immediately.
  if (isDemoMode()) return { id: crypto.randomUUID() };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("background_templates")
    .insert({ dealer_id: session.dealer.id, name: parsed.data.name, prompt: parsed.data.prompt })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the background." };

  revalidatePath("/marketing/photos");
  return { id: data.id };
}

export async function deleteBackgroundTemplate(id: string): Promise<void> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) return;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("background_templates")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);

  revalidatePath("/marketing/photos");
}

/* ---- AI photo improvement (preset buttons, costs credits) ---- */

export interface EnhanceCoverState {
  url?: string;
  remaining?: number;
  note?: string;
  error?: string;
}

const COVER_BACKGROUNDS: Record<string, string> = {
  white: "clean bright white studio backdrop",
  showroom: "modern car showroom interior with soft even lighting",
  outdoor: "tidy dealership forecourt outdoors on a clear day",
};

export async function enhanceCoverImage(
  _prev: EnhanceCoverState,
  formData: FormData
): Promise<EnhanceCoverState> {
  const session = await requireSession();
  if (!can.useMarketing(session.role)) {
    return { error: "Your role does not include the marketing module." };
  }

  const preset = String(formData.get("preset") ?? "");
  const op: ImageOp = preset === "enhance" ? "enhance" : "background";
  // A saved background template passes its own prompt; the 3 quick presets are built-in.
  const bgPrompt =
    op === "background"
      ? preset === "template"
        ? String(formData.get("bgPrompt") ?? "").trim().slice(0, 300)
        : COVER_BACKGROUNDS[preset]
      : undefined;
  if (op === "background" && !bgPrompt) return { error: "Unknown option." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "No image to improve." };
  if (file.size > 12 * 1024 * 1024) return { error: "Image is too large (max 12 MB)." };
  if (!file.type.startsWith("image/")) return { error: "That file is not an image." };

  // Demo or no AI key: never spend, just tell the user it's a no-op.
  if (isDemoMode() || !process.env.OPENAI_API_KEY) {
    return { note: "AI image improvements need an API key — nothing was charged." };
  }

  const cost = IMAGE_OP_COST[op];
  const supabase = await createClient();

  // Fail-closed: charge before doing any AI work.
  const { data: remaining, error: spendError } = await supabase.rpc("spend_ai_credits", {
    p_dealer_id: session.dealer.id,
    p_amount: cost,
  });
  if (spendError) return { error: "Not enough AI credits for this improvement." };

  try {
    const source = Buffer.from(await file.arrayBuffer());
    const result = await enhanceCarImage(source, file.type, op, bgPrompt);
    const path = `${session.dealer.id}/covers/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(path, result.bytes, { contentType: result.contentType, upsert: false });
    if (upErr) return { error: "Could not store the improved image.", remaining: remaining ?? undefined };
    const { data: signed } = await supabase.storage
      .from("brand-assets")
      .createSignedUrl(path, 3600);
    return {
      url: signed?.signedUrl,
      remaining: remaining ?? undefined,
      note:
        result.generator === "mock"
          ? "AI is unavailable right now — the original image was kept."
          : undefined,
    };
  } catch {
    return { error: "The AI improvement failed. Please try again.", remaining: remaining ?? undefined };
  }
}

/* ---- Set the composed image as a vehicle's cover (owner/admin only) ---- */

export interface AttachCoverState {
  saved?: boolean;
  error?: string;
}

export async function attachCoverToVehicle(
  _prev: AttachCoverState,
  formData: FormData
): Promise<AttachCoverState> {
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) {
    return { error: "Only owners and admins can set a vehicle's cover." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().uuid(),
      path: z.string().min(1).max(300),
    })
    .safeParse({
      vehicleId: formData.get("vehicleId"),
      path: formData.get("path"),
    });
  if (!parsed.success) return { error: "Pick a vehicle first." };

  if (isDemoMode()) return { saved: true };

  const { vehicleId, path } = parsed.data;
  // The uploaded file must live under this dealer + vehicle folder.
  if (!path.startsWith(`${session.dealer.id}/${vehicleId}/`)) {
    return { error: "That image does not belong to this vehicle." };
  }

  const supabase = await createClient();
  // One cover per vehicle: clear the old flag, then add the new cover on top.
  await supabase
    .from("vehicle_photos")
    .update({ is_cover: false })
    .eq("dealer_id", session.dealer.id)
    .eq("vehicle_id", vehicleId);
  const { error } = await supabase.from("vehicle_photos").insert({
    dealer_id: session.dealer.id,
    vehicle_id: vehicleId,
    storage_path: path,
    is_cover: true,
    position: 0,
  });
  if (error) return { error: "Could not set the cover photo." };

  revalidatePath("/inventory");
  revalidatePath("/marketing/campaigns");
  return { saved: true };
}
