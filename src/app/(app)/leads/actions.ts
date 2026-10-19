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
  version: number;
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
  const row: ViewingRow = {
    id: crypto.randomUUID(),
    lead_name: d.lead_name,
    phone: d.phone || null,
    vehicle_id: d.vehicleId || null,
    vehicle_label: d.vehicleLabel || null,
    scheduled_for: d.scheduledFor,
    status: "booked",
    notes: d.notes || null,
    responsible: d.responsible,
    version: 1,
  };

  if (isDemoMode()) return { viewing: row };

  const supabase = await createClient();
  const { data:command,error } = await supabase.rpc("crm_work_command",{p_dealer:session.dealer.id,p_command:"create_viewing",p_id:null,p_input:{leadName:row.lead_name,phone:row.phone??"",vehicleId:row.vehicle_id??"",vehicleLabel:row.vehicle_label??"",scheduledLocal:d.scheduledFor,responsible:row.responsible,notes:row.notes??"",assignedTo:""},p_request:crypto.randomUUID()});
  if (error || !command) return { error: "Could not book the viewing." };
  const {data}=await supabase.from("viewings").select("id, lead_name, phone, vehicle_id, vehicle_label, scheduled_for, status, notes, responsible, version").eq("dealer_id",session.dealer.id).eq("id",(command as {id:string}).id).single();
  if(!data)return {error:"The appointment was saved but could not be reloaded."};

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { viewing: data as ViewingRow };
}

export async function setViewingStatus(id: string, status: string, version: number): Promise<{error?:string}> {
  const session = await requireSession();
  if (!can.viewCustomerData(session.role)) return {error:"Your role cannot manage appointments."};
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(statuses),version:z.number().int().positive() }).safeParse({ id, status,version });
  if (!parsed.success || isDemoMode()) return {};

  const supabase = await createClient();
  const {error}=await supabase.rpc("crm_work_command",{p_dealer:session.dealer.id,p_command:"viewing_status",p_id:parsed.data.id,p_input:{expectedVersion:parsed.data.version,status:parsed.data.status},p_request:crypto.randomUUID()});
  if(error)return {error:error.message==="stale_appointment"?"This appointment changed. Refresh and try again.":"Could not update the appointment."};
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return {};
}
