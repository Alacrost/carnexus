"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";

export interface CreateVehicleState {
  error?: string;
}

export async function createVehicle(
  prev: CreateVehicleState,
  formData: FormData
): Promise<CreateVehicleState> {
  void prev;
  void formData;
  const session = await requireSession();
  if (!can.manageVehicles(session.role)) {
    return { error: "Your role cannot manage vehicles." };
  }
  return { error: "Vehicles must be acquired through a Purchase Order." };
}

export async function setVehicleStatus(id: string, status: string): Promise<void> {
  void id;
  void status;
  await requireSession();
}

export async function deleteVehicle(id: string): Promise<void> {
  void id;
  await requireSession();
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
