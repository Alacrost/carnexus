"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";

const statuses = [
  "bought",
  "preparation",
  "ready_for_sale",
  "reserved",
  "sold",
] as const;

const vehicleSchema = z.object({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  year: z.coerce.number().int().min(1950).max(2100),
  km: z.coerce.number().int().min(0).max(2_000_000),
  registration: z.string().trim().min(1).max(15).transform((s) => s.toUpperCase()),
  fuel: z.enum(["petrol", "diesel", "hybrid", "electric", "other"]),
  transmission: z.enum(["manual", "automatic"]),
  sale_price: z.coerce.number().min(0).max(10_000_000).optional(),
  source_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export interface CreateVehicleState {
  error?: string;
}

export async function createVehicle(
  _prev: CreateVehicleState,
  formData: FormData
): Promise<CreateVehicleState> {
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) {
    return { error: "Your role cannot manage vehicles." };
  }

  const parsed = vehicleSchema.safeParse({
    make: formData.get("make"),
    model: formData.get("model"),
    year: formData.get("year"),
    km: formData.get("km"),
    registration: formData.get("registration"),
    fuel: formData.get("fuel"),
    transmission: formData.get("transmission"),
    sale_price: formData.get("sale_price") || undefined,
    source_url: formData.get("source_url") || undefined,
  });
  if (!parsed.success) return { error: "Please check the vehicle details (registration is required)." };

  if (!isDemoMode()) {
    const supabase = await createClient();
    const { error } = await supabase.from("vehicles").insert({
      dealer_id: session.dealer.id,
      created_by: session.userId,
      make: parsed.data.make,
      model: parsed.data.model,
      year: parsed.data.year,
      km: parsed.data.km,
      registration: parsed.data.registration,
      fuel: parsed.data.fuel,
      transmission: parsed.data.transmission,
      sale_price: parsed.data.sale_price ?? null,
      source_url: parsed.data.source_url || null,
    });
    if (error) return { error: "Could not save the vehicle." };
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function setVehicleStatus(id: string, status: string): Promise<void> {
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) return;
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(statuses) })
    .safeParse({ id, status });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("vehicles")
    .update({ status: parsed.data.status })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/inventory");
}

export async function deleteVehicle(id: string): Promise<void> {
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) return;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("vehicles")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);
  revalidatePath("/inventory");
}

export interface AddPhotoResult {
  error?: string;
  id?: string;
  isCover?: boolean;
}

// The file itself is uploaded from the browser; here we only record the row.
export async function addVehiclePhoto(
  vehicleId: string,
  path: string
): Promise<AddPhotoResult> {
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) return { error: "Not allowed." };
  const parsed = z
    .object({ vehicleId: z.string().uuid(), path: z.string().min(1).max(400) })
    .safeParse({ vehicleId, path });
  if (!parsed.success || isDemoMode()) return { error: "Invalid photo." };

  if (!parsed.data.path.startsWith(`${session.dealer.id}/${vehicleId}/`)) {
    return { error: "Photo must belong to this vehicle." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("vehicle_photos")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", session.dealer.id)
    .eq("vehicle_id", vehicleId);

  const position = count ?? 0;
  const isCover = position === 0; // first photo becomes the cover
  const { data, error } = await supabase
    .from("vehicle_photos")
    .insert({
      dealer_id: session.dealer.id,
      vehicle_id: vehicleId,
      storage_path: parsed.data.path,
      position,
      is_cover: isCover,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the photo." };

  revalidatePath(`/inventory/${vehicleId}`);
  return { id: data.id, isCover };
}

export async function deleteVehiclePhoto(photoId: string): Promise<void> {
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) return;
  const parsed = z.string().uuid().safeParse(photoId);
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  // Look up the row (dealer-scoped) so we never trust a client-supplied path.
  const { data: row } = await supabase
    .from("vehicle_photos")
    .select("storage_path, vehicle_id")
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data)
    .maybeSingle();
  if (!row) return;

  await supabase.storage.from("vehicle-photos").remove([row.storage_path]);
  await supabase
    .from("vehicle_photos")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);
  revalidatePath(`/inventory/${row.vehicle_id}`);
}
