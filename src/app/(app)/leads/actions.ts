"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";

export interface ViewingRow {
  id: string;
  lead_name: string;
  phone: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  scheduled_for: string;
  status: string;
  notes: string | null;
  responsible: string | null;
}

const statuses = ["booked", "done", "no_show", "cancelled"] as const;

export async function createViewing(input: {
  lead_name: string;
  phone?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  scheduledFor: string;
  responsible: string;
  notes?: string;
}): Promise<{ viewing?: ViewingRow; error?: string }> {
  const session = await requireSession();
  if (!can.viewCustomerData(session.role)) {
    return { error: "Your role cannot manage viewings." };
  }

  const parsed = z
    .object({
      lead_name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(40).optional(),
      vehicleId: z.string().max(64).optional(),
      vehicleLabel: z.string().trim().max(120).optional(),
      // datetime-local value, e.g. "2026-09-10T14:30"
      scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      responsible: z.string().trim().min(2).max(120),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Add a name, a responsible salesperson and a date/time." };

  const d = parsed.data;
  const iso = new Date(d.scheduledFor).toISOString();

  const row: ViewingRow = {
    id: crypto.randomUUID(),
    lead_name: d.lead_name,
    phone: d.phone || null,
    vehicle_id: d.vehicleId || null,
    vehicle_label: d.vehicleLabel || null,
    scheduled_for: iso,
    status: "booked",
    notes: d.notes || null,
    responsible: d.responsible,
  };

  if (isDemoMode()) return { viewing: row };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("viewings")
    .insert({
      dealer_id: session.dealer.id,
      lead_name: row.lead_name,
      phone: row.phone,
      vehicle_id: row.vehicle_id,
      vehicle_label: row.vehicle_label,
      scheduled_for: iso,
      responsible: row.responsible,
      notes: row.notes,
      created_by: session.userId,
    })
    .select("id, lead_name, phone, vehicle_id, vehicle_label, scheduled_for, status, notes, responsible")
    .single();
  if (error || !data) return { error: "Could not book the viewing." };

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { viewing: data as ViewingRow };
}

export async function setViewingStatus(id: string, status: string): Promise<void> {
  const session = await requireSession();
  if (!can.viewCustomerData(session.role)) return;
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(statuses) }).safeParse({ id, status });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("viewings")
    .update({ status: parsed.data.status })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.id);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function deleteViewing(id: string): Promise<void> {
  const session = await requireSession();
  if (!can.viewCustomerData(session.role)) return;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("viewings")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
