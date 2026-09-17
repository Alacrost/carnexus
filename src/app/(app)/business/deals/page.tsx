import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoSalesDeals } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { DealsBoard, type DealRow } from "./deals-board";

export default async function DealsPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role)) {
    return <p className="text-sm text-slate-400">Your role does not include the sales process.</p>;
  }

  let rows: DealRow[] = [];

  if (isDemoMode()) {
    rows = demoSalesDeals.map((d) => ({
      id: d.id,
      deal_no: d.deal_no,
      status: d.status,
      stage: d.stage,
      currency: d.currency,
      customer: d.customer.name,
      car: d.order.vehicle_label,
      sale: d.order.price,
      deposit: d.payments.filter((p) => p.kind === "deposit").reduce((a, p) => a + p.amount, 0),
      salesperson: d.salesperson,
    }));
  } else {
    const supabase = await createClient();
    const [{ data: deals }, { data: orders }, { data: pays }, { data: vehicles }, { data: customers }] = await Promise.all([
      supabase.from("deals").select("id, deal_no, status, stage, currency, customer_id, salesperson_id").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }),
      supabase.from("deal_orders").select("deal_id, vehicle_id, price, kind").eq("dealer_id", session.dealer.id).eq("kind", "sale"),
      supabase.from("payments").select("deal_id, kind, amount").eq("dealer_id", session.dealer.id).eq("kind", "deposit"),
      supabase.from("vehicles").select("id, make, model, year").eq("dealer_id", session.dealer.id),
      supabase.from("customers").select("id, name").eq("dealer_id", session.dealer.id),
    ]);
    const orderByDeal = new Map((orders ?? []).map((o) => [o.deal_id, o]));
    const vLabel = new Map((vehicles ?? []).map((v) => [v.id, `${v.year} ${v.make} ${v.model}`]));
    const cName = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const depByDeal = new Map<string, number>();
    for (const p of pays ?? []) depByDeal.set(p.deal_id, (depByDeal.get(p.deal_id) ?? 0) + Number(p.amount));

    const spIds = [...new Set((deals ?? []).map((d) => d.salesperson_id).filter(Boolean) as string[])];
    const { data: profs } = spIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", spIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const spName = new Map((profs ?? []).map((p) => [p.id, p.full_name]));

    rows = (deals ?? []).map((d) => {
      const o = orderByDeal.get(d.id);
      return {
        id: d.id,
        deal_no: d.deal_no,
        status: d.status,
        stage: d.stage ?? "vehicle_interest",
        currency: d.currency,
        customer: d.customer_id ? cName.get(d.customer_id) ?? "—" : "—",
        car: o?.vehicle_id ? vLabel.get(o.vehicle_id) ?? "—" : "—",
        sale: Number(o?.price ?? 0),
        deposit: depByDeal.get(d.id) ?? 0,
        salesperson: d.salesperson_id ? spName.get(d.salesperson_id) ?? "—" : "—",
      };
    });
  }

  // Deals workspace = open work only; completed/cancelled live in Sales & Accounts.
  rows = rows.filter((r) => r.status !== "completed" && r.status !== "cancelled");

  return <DealsBoard rows={rows} />;
}
