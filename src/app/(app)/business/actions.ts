"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";

const sources = ["trade", "auction", "private", "part_exchange", "other"] as const;
const schemes = ["standard", "margin", "none"] as const;
const payments = ["cash", "bank", "finance", "card", "mixed"] as const;
const saleStatuses = ["none", "reserved", "deposit_paid", "sold", "delivered"] as const;
const costKinds = ["prep", "nct", "valet", "parts", "transport", "advertising", "other"] as const;

const num = z.union([z.literal("").transform(() => null), z.coerce.number().min(0).max(100_000_000)]).nullable();
const dateOrNull = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => v || null);
const textOrNull = (max: number) => z.union([z.literal(""), z.string().trim().max(max)]).transform((v) => v || null);

export interface DealState {
  saved?: boolean;
  error?: string;
}

export async function saveDeal(input: Record<string, unknown>): Promise<DealState> {
  const session = await requireSession();
  if (!can.viewFinancials(session.role)) {
    return { error: "Your role cannot manage deal records." };
  }

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      purchase_price: num,
      purchase_date: dateOrNull,
      supplier: textOrNull(120),
      source: z.union([z.literal(""), z.enum(sources)]).transform((v) => v || null),
      vat_scheme: z.enum(schemes),
      sale_price: num,
      deposit_amount: num,
      deposit_date: dateOrNull,
      buyer_name: textOrNull(120),
      buyer_phone: textOrNull(40),
      payment_method: z.union([z.literal(""), z.enum(payments)]).transform((v) => v || null),
      finance_provider: textOrNull(120),
      part_exchange_value: num,
      salesperson: textOrNull(120),
      sale_status: z.enum(saleStatuses),
      sold_date: dateOrNull,
      delivered_date: dateOrNull,
      notes: textOrNull(1000),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Check the deal figures and dates." };

  const d = parsed.data;

  // Deposit auto-flags the sale as pending unless a later status is chosen.
  let saleStatus = d.sale_status;
  if (saleStatus === "none" && (d.deposit_amount ?? 0) > 0) saleStatus = "deposit_paid";

  if (isDemoMode()) return { saved: true };

  const supabase = await createClient();
  const { vehicleId, ...rest } = d;
  const { error } = await supabase.from("vehicle_deals").upsert({
    vehicle_id: vehicleId,
    dealer_id: session.dealer.id,
    ...rest,
    sale_status: saleStatus,
    created_by: session.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Could not save the deal." };

  // Auto-move the inventory status: deposit/reserved → reserved; sold/delivered → sold.
  const nextVehicleStatus =
    saleStatus === "sold" || saleStatus === "delivered"
      ? "sold"
      : saleStatus === "deposit_paid" || saleStatus === "reserved"
        ? "reserved"
        : null;
  if (nextVehicleStatus) {
    await supabase
      .from("vehicles")
      .update({ status: nextVehicleStatus })
      .eq("dealer_id", session.dealer.id)
      .eq("id", vehicleId);
  }

  revalidatePath("/business");
  revalidatePath(`/business/${vehicleId}`);
  revalidatePath("/inventory");
  return { saved: true };
}

export interface CostRow {
  id: string;
  kind: string;
  amount: number;
  cost_date: string | null;
  notes: string | null;
}

export async function addCost(input: {
  vehicleId: string;
  kind: string;
  amount: number;
  cost_date?: string;
  notes?: string;
}): Promise<{ cost?: CostRow; error?: string }> {
  const session = await requireSession();
  if (!can.viewFinancials(session.role)) return { error: "Your role cannot manage costs." };

  const parsed = z
    .object({
      vehicleId: z.string().min(1).max(64),
      kind: z.enum(costKinds),
      amount: z.coerce.number().min(0).max(100_000_000),
      cost_date: dateOrNull,
      notes: textOrNull(300),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Add a cost type and amount." };

  const row: CostRow = {
    id: crypto.randomUUID(),
    kind: parsed.data.kind,
    amount: parsed.data.amount,
    cost_date: parsed.data.cost_date,
    notes: parsed.data.notes,
  };

  if (isDemoMode()) return { cost: row };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_costs")
    .insert({
      dealer_id: session.dealer.id,
      vehicle_id: parsed.data.vehicleId,
      kind: parsed.data.kind,
      amount: parsed.data.amount,
      cost_date: parsed.data.cost_date,
      notes: parsed.data.notes,
      created_by: session.userId,
    })
    .select("id, kind, amount, cost_date, notes")
    .single();
  if (error || !data) return { error: "Could not add the cost." };

  revalidatePath(`/business/${parsed.data.vehicleId}`);
  revalidatePath("/business");
  return { cost: data as CostRow };
}

export async function deleteCost(id: string): Promise<void> {
  const session = await requireSession();
  if (!can.viewFinancials(session.role)) return;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  await supabase
    .from("vehicle_costs")
    .delete()
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data);
  revalidatePath("/business");
}
