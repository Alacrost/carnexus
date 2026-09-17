"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";

const methods = ["cash", "bank", "card", "finance"] as const;

async function nextPoNo(supabase: Awaited<ReturnType<typeof createClient>>, dealerId: string): Promise<string> {
  const { count } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId);
  return `PO${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export interface CreatePurchaseInput {
  vendorId?: string;
  newVendor?: { name: string; phone?: string; email?: string };
  make: string;
  model: string;
  year: number;
  registration: string;
  km?: number;
  price: number;
  vatScheme: string;
  invRef?: string;
  notes?: string;
}

export async function createPurchase(input: CreatePurchaseInput): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (!can.viewFinancials(session.role)) return { error: "Your role cannot record purchases." };

  const parsed = z
    .object({
      vendorId: z.string().max(64).optional(),
      newVendor: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional(), email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional() }).optional(),
      make: z.string().trim().min(1).max(60),
      model: z.string().trim().min(1).max(80),
      year: z.coerce.number().int().min(1950).max(2100),
      registration: z.string().trim().min(1).max(15).transform((s) => s.toUpperCase()),
      km: z.coerce.number().min(0).max(2_000_000).optional(),
      price: z.coerce.number().min(0).max(100_000_000),
      vatScheme: z.enum(["standard", "margin", "none"]),
      invRef: z.string().trim().max(60).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Fill vendor, car and price." };
  const d = parsed.data;
  if (isDemoMode()) return { id: "po1" };

  const supabase = await createClient();

  // Resolve/create the vendor party.
  let vendorId = d.vendorId || null;
  if (!vendorId && d.newVendor) {
    const { data: v } = await supabase
      .from("customers")
      .insert({ dealer_id: session.dealer.id, name: d.newVendor.name, type: "business", phone: d.newVendor.phone || null, email: d.newVendor.email || null })
      .select("id")
      .single();
    vendorId = v?.id ?? null;
  }

  // Create the vehicle in stock (bought).
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .insert({ dealer_id: session.dealer.id, make: d.make, model: d.model, year: d.year, registration: d.registration, km: d.km ?? 0, status: "bought" })
    .select("id")
    .single();
  if (vErr || !vehicle) return { error: "Could not create the vehicle." };

  const gross = d.price;
  const vat = d.vatScheme === "standard" ? (gross * 0.23) / 1.23 : 0;
  const net = gross - vat;
  const poNo = await nextPoNo(supabase, session.dealer.id);

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({ dealer_id: session.dealer.id, po_no: poNo, vendor_id: vendorId, vehicle_id: vehicle.id, inv_ref: d.invRef || null, vat_scheme: d.vatScheme, notes: d.notes || null, created_by: session.userId })
    .select("id")
    .single();
  if (poErr || !po) return { error: "Could not create the purchase order." };

  await supabase.from("po_lines").insert({
    dealer_id: session.dealer.id,
    po_id: po.id,
    vehicle_id: vehicle.id,
    description: `${d.year} ${d.make} ${d.model} Reg: ${d.registration}`,
    nominal_code: "111",
    qty: 1,
    net,
    vat,
    gross,
  });

  // Reflect the purchase on the car's cost record so /business financials stay in sync.
  const { data: vendorName } = vendorId ? await supabase.from("customers").select("name").eq("id", vendorId).maybeSingle() : { data: null };
  await supabase.from("vehicle_deals").upsert({
    vehicle_id: vehicle.id,
    dealer_id: session.dealer.id,
    purchase_price: gross,
    purchase_date: new Date().toISOString().slice(0, 10),
    supplier: vendorName?.name ?? null,
    vat_scheme: d.vatScheme === "none" ? "margin" : d.vatScheme,
  });

  revalidatePath("/business/purchases");
  revalidatePath("/inventory");
  return { id: po.id };
}

export async function createPurchaseAndGo(input: CreatePurchaseInput): Promise<{ error?: string }> {
  const res = await createPurchase(input);
  if (res.error) return { error: res.error };
  redirect(isDemoMode() ? "/business/purchases" : `/business/purchases/${res.id}`);
}

// Approval before payment (owner/admin only), mirroring the CRM's PO approval process.
export async function approvePurchase(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) return;
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success || isDemoMode()) return;
  const supabase = await createClient();
  await supabase
    .from("purchase_orders")
    .update({ status: "approved", approved_by: session.userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("dealer_id", session.dealer.id)
    .eq("id", id.data)
    .eq("status", "to_be_paid");
  revalidatePath(`/business/purchases/${id.data}`);
  revalidatePath("/business/purchases");
}

export async function addVendorPayment(input: { poId: string; amount: number; method?: string; paidOn?: string; reference?: string }): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!can.viewFinancials(session.role)) return { error: "Not allowed." };
  const parsed = z
    .object({
      poId: z.string().uuid(),
      amount: z.coerce.number().min(0).max(100_000_000),
      method: z.union([z.literal(""), z.enum(methods)]).optional(),
      paidOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
      reference: z.string().trim().max(120).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Check the payment." };
  if (isDemoMode()) return {};

  const supabase = await createClient();
  const { data: po } = await supabase.from("purchase_orders").select("status").eq("dealer_id", session.dealer.id).eq("id", parsed.data.poId).maybeSingle();
  if (!po) return { error: "PO not found." };
  if (po.status === "to_be_paid") return { error: "Approve the PO before paying." };

  await supabase.from("po_payments").insert({
    dealer_id: session.dealer.id,
    po_id: parsed.data.poId,
    amount: parsed.data.amount,
    method: parsed.data.method || null,
    paid_on: parsed.data.paidOn || null,
    reference: parsed.data.reference || null,
    created_by: session.userId,
  });

  // Mark paid once the outstanding balance is cleared.
  const [{ data: lines }, { data: pays }] = await Promise.all([
    supabase.from("po_lines").select("gross").eq("dealer_id", session.dealer.id).eq("po_id", parsed.data.poId),
    supabase.from("po_payments").select("amount").eq("dealer_id", session.dealer.id).eq("po_id", parsed.data.poId),
  ]);
  const total = (lines ?? []).reduce((a, l) => a + Number(l.gross), 0);
  const paid = (pays ?? []).reduce((a, p) => a + Number(p.amount), 0);
  if (paid >= total && total > 0) {
    await supabase.from("purchase_orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("dealer_id", session.dealer.id).eq("id", parsed.data.poId);
  }
  revalidatePath(`/business/purchases/${parsed.data.poId}`);
  return {};
}
