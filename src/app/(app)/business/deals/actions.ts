"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";
import { vatOn, type VatScheme } from "@/lib/finance";
import { DEAL_STAGES, stageLabel, docFigures } from "@/lib/deals";

const schemes = ["standard", "margin", "none"] as const;
const methods = ["cash", "bank", "card", "finance", "part_exchange"] as const;
const statuses = ["draft", "quoted", "agreed", "finance", "completed", "cancelled"] as const;

async function nextDealNo(supabase: Awaited<ReturnType<typeof createClient>>, dealerId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId)
    .gte("created_at", `${today}T00:00:00Z`);
  const seq = (count ?? 0) + 1;
  return `${today.replace(/-/g, "")}-${String(seq).padStart(3, "0")}`;
}

export interface NewContact {
  name: string;
  type?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  dataConsent?: string;
  phone?: string;
  ddiPhone?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  address?: string;
  town?: string;
  county?: string;
  postCode?: string;
  country?: string;
}

export interface CreateDealInput {
  customerId?: string;
  newCustomer?: NewContact;
  leadId?: string;
  source?: string;
  salespersonId?: string;
  vehicleId: string;
  salePrice: number;
  vatScheme: string;
  depositAmount?: number;
  depositMethod?: string;
  depositDate?: string;
  notes?: string;
}

export async function createDeal(input: CreateDealInput): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Your role cannot create deals." };

  const parsed = z
    .object({
      customerId: z.string().max(64).optional(),
      newCustomer: z
        .object({
          name: z.string().trim().min(2).max(120),
          type: z.enum(["individual", "business"]).optional(),
          title: z.string().trim().max(20).optional(),
          firstName: z.string().trim().max(80).optional(),
          lastName: z.string().trim().max(80).optional(),
          company: z.string().trim().max(120).optional(),
          jobTitle: z.string().trim().max(80).optional(),
          dataConsent: z.string().trim().max(40).optional(),
          phone: z.string().trim().max(40).optional(),
          ddiPhone: z.string().trim().max(40).optional(),
          fax: z.string().trim().max(40).optional(),
          mobile: z.string().trim().max(40).optional(),
          email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional(),
          address: z.string().trim().max(400).optional(),
          town: z.string().trim().max(80).optional(),
          county: z.string().trim().max(80).optional(),
          postCode: z.string().trim().max(16).optional(),
          country: z.string().trim().max(4).optional(),
        })
        .optional(),
      leadId: z.string().max(64).optional(),
      source: z.string().trim().max(40).optional(),
      salespersonId: z.string().uuid().optional(),
      vehicleId: z.string().min(1).max(64),
      salePrice: z.coerce.number().min(0).max(100_000_000),
      vatScheme: z.enum(schemes),
      depositAmount: z.coerce.number().min(0).max(100_000_000).optional(),
      depositMethod: z.union([z.literal(""), z.enum(methods)]).optional(),
      depositDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Pick a customer, a car and a sale price." };
  const d = parsed.data;

  const deposit = d.depositAmount ?? 0;
  const vatAmount = vatOn(d.salePrice, d.salePrice, d.vatScheme as VatScheme); // gross margin unknown here; scheme handles it

  if (isDemoMode()) return { id: crypto.randomUUID() };

  const supabase = await createClient();

  // Resolve customer (existing or create a new party).
  let customerId = d.customerId || null;
  if (d.leadId) {
    const { data: lead, error } = await supabase.from("leads").select("customer_id,source").eq("dealer_id",session.dealer.id).eq("id",d.leadId).maybeSingle();
    if (error || !lead) return { error: "The selected lead is unavailable or outside your CRM access." };
    if (lead.customer_id && customerId !== lead.customer_id) return { error: "Use the contact linked to this lead, or create a separate deal without the lead." };
    d.source = lead.source;
  }
  if (!customerId && d.newCustomer) {
    const nc = d.newCustomer;
    const { data: c } = await supabase
      .from("customers")
      .insert({
        dealer_id: session.dealer.id,
        name: nc.name,
        type: nc.type || (nc.company ? "business" : "individual"),
        title: nc.title || null,
        first_name: nc.firstName || null,
        last_name: nc.lastName || null,
        business_name: nc.company || null,
        job_title: nc.jobTitle || null,
        data_consent: nc.dataConsent || null,
        phone: nc.phone || null,
        ddi_phone: nc.ddiPhone || null,
        fax: nc.fax || null,
        mobile: nc.mobile || null,
        email: nc.email || null,
        address_line1: nc.address || null,
        city: nc.town || null,
        county: nc.county || null,
        eircode: nc.postCode || null,
        country: nc.country || null,
      })
      .select("id")
      .single();
    customerId = c?.id ?? null;
  }

  const { data: dealer } = await supabase.from("dealers").select("currency").eq("id", session.dealer.id).maybeSingle();
  const currency = dealer?.currency ?? "EUR";
  const dealNo = await nextDealNo(supabase, session.dealer.id);

  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      dealer_id: session.dealer.id,
      deal_no: dealNo,
      customer_id: customerId,
      status: deposit > 0 ? "agreed" : "draft",
      stage: deposit > 0 ? "closing" : "vehicle_interest",
      retail_price: d.salePrice,
      salesperson_id: d.salespersonId || session.userId,
      lead_id: d.leadId || null,
      source: d.source || null,
      currency,
      notes: d.notes || null,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (dealErr || !deal) return { error: "Could not create the deal." };

  await supabase.from("deal_events").insert({
    dealer_id: session.dealer.id,
    deal_id: deal.id,
    kind: "created",
    detail: { message: `Deal ${dealNo} created` },
    created_by: session.userId,
  });

  await supabase.from("deal_orders").insert({
    dealer_id: session.dealer.id,
    deal_id: deal.id,
    kind: "sale",
    vehicle_id: d.vehicleId,
    price: d.salePrice,
    vat_scheme: d.vatScheme,
    vat_amount: vatAmount,
  });

  if (deposit > 0) {
    await supabase.from("payments").insert({
      dealer_id: session.dealer.id,
      deal_id: deal.id,
      kind: "deposit",
      method: d.depositMethod || null,
      amount: deposit,
      currency,
      paid_on: d.depositDate || null,
      created_by: session.userId,
    });
    await supabase.from("deal_events").insert({
      dealer_id: session.dealer.id,
      deal_id: deal.id,
      kind: "deposit",
      detail: { message: `Deposit of ${deposit} taken`, amount: deposit },
      created_by: session.userId,
    });
    // Deposit reserves the car.
    await supabase.from("vehicles").update({ status: "reserved" }).eq("dealer_id", session.dealer.id).eq("id", d.vehicleId);
  }

  revalidatePath("/business/deals");
  revalidatePath("/inventory");
  return { id: deal.id };
}

export async function addPayment(input: {
  dealId: string;
  kind: string;
  method?: string;
  amount: number;
  paidOn?: string;
  reference?: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Not allowed." };
  const parsed = z
    .object({
      dealId: z.string().uuid(),
      kind: z.enum(["deposit", "balance", "trade_allowance", "finance_payout", "refund"]),
      method: z.union([z.literal(""), z.enum(methods)]).optional(),
      amount: z.coerce.number().min(0).max(100_000_000),
      paidOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
      reference: z.string().trim().max(120).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Check the payment." };
  if (isDemoMode()) return {};

  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("currency").eq("dealer_id", session.dealer.id).eq("id", parsed.data.dealId).maybeSingle();
  const { error } = await supabase.from("payments").insert({
    dealer_id: session.dealer.id,
    deal_id: parsed.data.dealId,
    kind: parsed.data.kind,
    method: parsed.data.method || null,
    amount: parsed.data.amount,
    currency: deal?.currency ?? "EUR",
    paid_on: parsed.data.paidOn || null,
    reference: parsed.data.reference || null,
    created_by: session.userId,
  });
  if (error) return { error: "Could not record the payment." };
  revalidatePath(`/business/deals/${parsed.data.dealId}`);
  return {};
}

export async function setDealStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return;
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(statuses) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success || isDemoMode()) return;

  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: parsed.data.status, updated_at: new Date().toISOString() };
  if (parsed.data.status === "completed" || parsed.data.status === "cancelled") patch.closed_at = new Date().toISOString();
  await supabase.from("deals").update(patch).eq("dealer_id", session.dealer.id).eq("id", parsed.data.id);

  // Completing the sale marks the car sold; cancelling frees it back to ready.
  if (parsed.data.status === "completed" || parsed.data.status === "cancelled") {
    const { data: order } = await supabase.from("deal_orders").select("vehicle_id").eq("dealer_id", session.dealer.id).eq("deal_id", parsed.data.id).eq("kind", "sale").maybeSingle();
    if (order?.vehicle_id) {
      await supabase
        .from("vehicles")
        .update({ status: parsed.data.status === "completed" ? "sold" : "ready_for_sale" })
        .eq("dealer_id", session.dealer.id)
        .eq("id", order.vehicle_id);
    }
  }
  revalidatePath("/business/deals");
  revalidatePath(`/business/deals/${parsed.data.id}`);
  revalidatePath("/inventory");
}

// Used by the client sheet: create then redirect to the deal.
export async function createDealAndGo(input: CreateDealInput): Promise<{ error?: string }> {
  const res = await createDeal(input);
  if (res.error) return { error: res.error };
  redirect(isDemoMode() ? "/business/deals" : `/business/deals/${res.id}`);
}

// Move a deal along the pipeline (board drag / ficha) and log the change.
export async function setDealStage(dealId: string, stage: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Not allowed." };
  const parsed = z
    .object({ dealId: z.string().uuid(), stage: z.enum(DEAL_STAGES) })
    .safeParse({ dealId, stage });
  if (!parsed.success) return { error: "Invalid stage." };
  if (isDemoMode()) return {};

  const supabase = await createClient();
  await supabase
    .from("deals")
    .update({ stage: parsed.data.stage, updated_at: new Date().toISOString() })
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.dealId);
  await supabase.from("deal_events").insert({
    dealer_id: session.dealer.id,
    deal_id: parsed.data.dealId,
    kind: "stage_changed",
    detail: { message: `Moved to ${stageLabel(parsed.data.stage)}`, stage: parsed.data.stage },
    created_by: session.userId,
  });
  revalidatePath("/business/deals");
  revalidatePath(`/business/deals/${parsed.data.dealId}`);
  return {};
}

// Generate an Agreement or Invoice: freeze an immutable snapshot + assign a document number.
async function nextDocNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealerId: string,
  kind: string,
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const startIso = `${now.getFullYear()}-${mm}-${dd}T00:00:00Z`;
  const { count } = await supabase
    .from("deal_documents")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId)
    .eq("kind", kind)
    .gte("created_at", startIso);
  const seq = (count ?? 0) + 1;
  if (kind === "invoice") return `${yy}${mm}${dd}${String(seq).padStart(2, "0")}`;
  return `${kind === "agreement" ? "AGR" : "QUO"}-${now.getFullYear()}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

export async function createDealDocument(dealId: string, kind: string): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Not allowed." };
  const parsed = z.object({ dealId: z.string().min(1).max(64), kind: z.enum(["agreement", "invoice", "quote"]) }).safeParse({ dealId, kind });
  if (!parsed.success) return { error: "Invalid document." };
  // Demo: previews are built on the fly from demo data, nothing persisted.
  if (isDemoMode()) return { id: parsed.data.kind };

  const supabase = await createClient();
  const { data: deal } = await supabase
    .from("deals")
    .select("id, deal_no, currency, customer_id, retail_price, siv_total")
    .eq("dealer_id", session.dealer.id)
    .eq("id", parsed.data.dealId)
    .maybeSingle();
  if (!deal) return { error: "Deal not found." };

  const [{ data: order }, { data: pays }, { data: customer }] = await Promise.all([
    supabase.from("deal_orders").select("vehicle_id, price, vat_scheme").eq("dealer_id", session.dealer.id).eq("deal_id", deal.id).eq("kind", "sale").maybeSingle(),
    supabase.from("payments").select("kind, amount").eq("dealer_id", session.dealer.id).eq("deal_id", deal.id),
    deal.customer_id ? supabase.from("customers").select("name, business_name, address_line1, city, county, eircode, phone, email, vat_number").eq("id", deal.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  let vehicle: { make: string; model: string; year: number; registration: string | null } | null = null;
  if (order?.vehicle_id) {
    const { data: v } = await supabase.from("vehicles").select("make, model, year, registration").eq("id", order.vehicle_id).maybeSingle();
    vehicle = v;
  }

  // Cost is sensitive — only pull it for a correct margin-scheme VAT when allowed.
  let totalCost: number | null = null;
  if (can.viewFinancials(session.role) && order?.vehicle_id) {
    const [{ data: vd }, { data: costs }] = await Promise.all([
      supabase.from("vehicle_deals").select("purchase_price").eq("dealer_id", session.dealer.id).eq("vehicle_id", order.vehicle_id).maybeSingle(),
      supabase.from("vehicle_costs").select("amount").eq("dealer_id", session.dealer.id).eq("vehicle_id", order.vehicle_id),
    ]);
    if (vd?.purchase_price != null) {
      totalCost = Number(vd.purchase_price) + (costs ?? []).reduce((a, c) => a + Number(c.amount), 0);
    }
  }

  const sale = Number(order?.price ?? deal.retail_price ?? 0);
  const scheme = order?.vat_scheme ?? "standard";
  const deposits = (pays ?? []).filter((p) => p.kind === "deposit").reduce((a, p) => a + Number(p.amount), 0);

  // Add-ons (warranty/GAP/…) become extra invoice lines.
  const { data: addons } = await supabase.from("deal_addons").select("name, price").eq("dealer_id", session.dealer.id).eq("deal_id", deal.id);
  const addonsTotal = (addons ?? []).reduce((a, x) => a + Number(x.price), 0);
  const saleTotal = sale + addonsTotal;

  const fig = docFigures({ scheme, sale: saleTotal, retail: Number(deal.retail_price ?? sale) + addonsTotal, siv: Number(deal.siv_total ?? 0), totalCost, deposits });
  const number = await nextDocNo(supabase, session.dealer.id, parsed.data.kind);

  const lines = [
    { description: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.registration ? ` (${vehicle.registration})` : ""}` : "Vehicle", gross: sale },
    ...(addons ?? []).map((x) => ({ description: x.name, gross: Number(x.price) })),
  ];

  const snapshot = {
    kind: parsed.data.kind,
    number,
    date: new Date().toISOString().slice(0, 10),
    currency: deal.currency,
    deal_no: deal.deal_no,
    dealer: { name: session.dealer.name },
    customer: customer
      ? { name: customer.name, company: customer.business_name, address: [customer.address_line1, customer.city, customer.county, customer.eircode].filter(Boolean).join(", "), phone: customer.phone, email: customer.email, vat_number: customer.vat_number }
      : null,
    vehicle: vehicle ? { label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, reg: vehicle.registration } : null,
    lines,
    retail: Number(deal.retail_price ?? sale),
    siv: Number(deal.siv_total ?? 0),
    sale: saleTotal,
    scheme,
    figures: fig,
    deposits,
  };

  const status = parsed.data.kind === "invoice" && fig.balanceInvoice <= 0 ? "paid" : "printed";
  const { data: doc, error } = await supabase
    .from("deal_documents")
    .insert({
      dealer_id: session.dealer.id,
      deal_id: deal.id,
      kind: parsed.data.kind,
      number,
      status,
      snapshot,
      printed_at: new Date().toISOString(),
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !doc) return { error: "Could not create the document." };

  if (parsed.data.kind === "agreement") {
    await supabase.from("deals").update({ agreement_printed_at: new Date().toISOString() }).eq("dealer_id", session.dealer.id).eq("id", deal.id);
  } else if (parsed.data.kind === "quote") {
    await supabase.from("deals").update({ quote_printed_at: new Date().toISOString() }).eq("dealer_id", session.dealer.id).eq("id", deal.id);
  }
  await supabase.from("deal_events").insert({
    dealer_id: session.dealer.id,
    deal_id: deal.id,
    kind: parsed.data.kind === "invoice" ? "invoice_created" : "agreement_printed",
    detail: { message: `${parsed.data.kind === "invoice" ? "Invoice" : parsed.data.kind === "quote" ? "Quote" : "Agreement"} ${number} generated` },
    created_by: session.userId,
  });
  revalidatePath(`/business/deals/${deal.id}`);
  return { id: doc.id };
}

// Part-exchange: add a trade-in vehicle to the deal. Creates a vehicle in TRADE stock, a
// purchase order line on the deal, and sets the deal's SIV (net equity) to reduce cost to change.
export async function addTradeIn(input: {
  dealId: string;
  make: string;
  model: string;
  year: number;
  registration: string;
  km?: number;
  allowance: number;
  settlement?: number;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Not allowed." };
  const parsed = z
    .object({
      dealId: z.string().uuid(),
      make: z.string().trim().min(1).max(60),
      model: z.string().trim().min(1).max(80),
      year: z.coerce.number().int().min(1950).max(2100),
      registration: z.string().trim().min(1).max(15).transform((s) => s.toUpperCase()),
      km: z.coerce.number().min(0).max(2_000_000).optional(),
      allowance: z.coerce.number().min(0).max(100_000_000),
      settlement: z.coerce.number().min(0).max(100_000_000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Fill the trade-in details." };
  const t = parsed.data;
  if (isDemoMode()) return {};

  const supabase = await createClient();
  const netEquity = Math.max(0, t.allowance - (t.settlement ?? 0));

  const { data: veh, error: vErr } = await supabase
    .from("vehicles")
    .insert({ dealer_id: session.dealer.id, make: t.make, model: t.model, year: t.year, registration: t.registration, km: t.km ?? 0, status: "bought", stock_class: "trade" })
    .select("id")
    .single();
  if (vErr || !veh) return { error: "Could not create the trade-in vehicle." };

  await supabase.from("deal_orders").insert({
    dealer_id: session.dealer.id,
    deal_id: t.dealId,
    kind: "purchase",
    is_trade_in: true,
    vehicle_id: veh.id,
    price: t.allowance,
    settlement_amount: t.settlement ?? 0,
    net_equity: netEquity,
  });

  await supabase.from("deals").update({ siv_total: netEquity, updated_at: new Date().toISOString() }).eq("dealer_id", session.dealer.id).eq("id", t.dealId);
  await supabase.from("deal_events").insert({
    dealer_id: session.dealer.id,
    deal_id: t.dealId,
    kind: "trade_in",
    detail: { message: `Trade-in ${t.year} ${t.make} ${t.model} · allowance ${t.allowance}${t.settlement ? `, settlement ${t.settlement}` : ""}` },
    created_by: session.userId,
  });
  revalidatePath(`/business/deals/${t.dealId}`);
  revalidatePath("/inventory");
  return {};
}

// KYC checklist — flip a required document's received flag (stored in deals.required_docs jsonb).
export async function toggleRequiredDoc(dealId: string, key: string, received: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Not allowed." };
  const parsed = z.object({ dealId: z.string().uuid(), key: z.enum(["dl_front", "dl_back", "utility_bill", "trade_vrc"]), received: z.boolean() }).safeParse({ dealId, key, received });
  if (!parsed.success) return { error: "Invalid document." };
  if (isDemoMode()) return {};
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("required_docs").eq("dealer_id", session.dealer.id).eq("id", parsed.data.dealId).maybeSingle();
  const docs = { ...((deal?.required_docs as Record<string, boolean> | null) ?? {}), [parsed.data.key]: parsed.data.received };
  await supabase.from("deals").update({ required_docs: docs, updated_at: new Date().toISOString() }).eq("dealer_id", session.dealer.id).eq("id", parsed.data.dealId);
  revalidatePath(`/business/deals/${parsed.data.dealId}`);
  return {};
}

export async function addDealAddon(input: { dealId: string; kind: string; name: string; price: number; cost?: number; months?: number; terms?: string }): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return { error: "Not allowed." };
  const parsed = z
    .object({
      dealId: z.string().uuid(),
      kind: z.enum(["warranty", "gap", "service_plan", "other"]),
      name: z.string().trim().min(2).max(80),
      price: z.coerce.number().min(0).max(1_000_000),
      cost: z.coerce.number().min(0).max(1_000_000).optional(),
      months: z.coerce.number().int().min(0).max(120).optional(),
      terms: z.string().trim().max(1000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Fill the add-on name and price." };
  if (isDemoMode()) return {};
  const a = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("deal_addons").insert({
    dealer_id: session.dealer.id, deal_id: a.dealId, kind: a.kind, name: a.name,
    price: a.price, cost: a.cost ?? 0, months: a.months ?? null, terms: a.terms || null, created_by: session.userId,
  });
  if (error) return { error: "Could not add the item." };
  await supabase.from("deal_events").insert({ dealer_id: session.dealer.id, deal_id: a.dealId, kind: "addon", detail: { message: `Added ${a.name} (${a.price})` }, created_by: session.userId });
  revalidatePath(`/business/deals/${a.dealId}`);
  return {};
}

export async function removeDealAddon(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return;
  const parsed = z.object({ id: z.string().uuid(), dealId: z.string().uuid() }).safeParse({ id: formData.get("id"), dealId: formData.get("dealId") });
  if (!parsed.success || isDemoMode()) return;
  const supabase = await createClient();
  await supabase.from("deal_addons").delete().eq("dealer_id", session.dealer.id).eq("id", parsed.data.id);
  revalidatePath(`/business/deals/${parsed.data.dealId}`);
}
