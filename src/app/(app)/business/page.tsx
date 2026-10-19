import Link from "next/link";
import { EntityLink, vehicleReference } from "@/components/entity-link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoDeals, demoCosts } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { computeDeal, type VatScheme } from "@/lib/finance";
import { ModuleUpsell } from "@/components/module-upsell";

function eur(n: number): string {
  return "€" + Math.round(n).toLocaleString("en-IE");
}

const STATUS_STYLES: Record<string, string> = {
  none: "border-white/10 bg-white/[0.04] text-slate-400",
  reserved: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  deposit_paid: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  sold: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  delivered: "border-sky-400/30 bg-sky-400/10 text-sky-300",
};
const STATUS_LABELS: Record<string, string> = {
  none: "In stock",
  reserved: "Reserved",
  deposit_paid: "Deposit paid",
  sold: "Sold",
  delivered: "Delivered",
};

interface DealRow {
  vehicle_id: string;
  purchase_price: number | null;
  sale_price: number | null;
  vat_scheme: string;
  sale_status: string;
  deposit_amount: number | null;
}

export default async function BusinessPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.viewFinancials(session.role)) {
    return (
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gradient">Sales & Accounts</h1>
        <p className="mt-2 text-sm text-slate-400">Your role does not include financial data.</p>
      </div>
    );
  }

  interface V { id: string; vehicle_no?: number | null; make: string; model: string; year: number; status: string; registration?: string | null }
  let vehicles: V[] = [];
  let deals: DealRow[] = [];
  let costs: { vehicle_id: string; amount: number }[] = [];

  if (isDemoMode()) {
    vehicles = demoVehicles.map((vehicle,index)=>({...vehicle,vehicle_no:index+1})) as V[];
    deals = demoDeals as DealRow[];
    costs = demoCosts;
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: d }, { data: c }] = await Promise.all([
      supabase.from("vehicles").select("id, vehicle_no, make, model, year, status, registration").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }),
      supabase.from("vehicle_deals").select("vehicle_id, purchase_price, sale_price, vat_scheme, sale_status, deposit_amount").eq("dealer_id", session.dealer.id),
      supabase.from("vehicle_costs").select("vehicle_id, amount").eq("dealer_id", session.dealer.id),
    ]);
    vehicles = (v ?? []) as V[];
    deals = (d ?? []) as DealRow[];
    costs = (c ?? []) as { vehicle_id: string; amount: number }[];
  }

  const dealByVehicle = new Map(deals.map((d) => [d.vehicle_id, d]));
  const costByVehicle = new Map<string, number>();
  for (const c of costs) costByVehicle.set(c.vehicle_id, (costByVehicle.get(c.vehicle_id) ?? 0) + Number(c.amount));

  const rows = vehicles.map((v) => {
    const deal = dealByVehicle.get(v.id);
    const cost = costByVehicle.get(v.id) ?? 0;
    const fin =
      deal && (deal.sale_price || deal.purchase_price)
        ? computeDeal({
            purchasePrice: Number(deal.purchase_price ?? 0),
            costs: cost,
            salePrice: Number(deal.sale_price ?? 0),
            vatScheme: (deal.vat_scheme as VatScheme) ?? "standard",
          })
        : null;
    return { v, deal, cost, fin };
  });

  // KPIs across deals that have a sale price.
  const realized = rows.filter((r) => r.deal && Number(r.deal.sale_price ?? 0) > 0);
  const kpi = realized.reduce(
    (a, r) => {
      a.revenue += Number(r.deal!.sale_price ?? 0);
      a.cost += r.fin!.totalCost;
      a.vat += r.fin!.vat;
      a.profit += r.fin!.netProfit;
      return a;
    },
    { revenue: 0, cost: 0, vat: 0, profit: 0 }
  );

  const depositPending = rows.filter((r) => r.deal?.sale_status === "deposit_paid");

  const kpis = [
    { label: "Revenue", value: eur(kpi.revenue) },
    { label: "Total cost", value: eur(kpi.cost) },
    { label: "VAT", value: eur(kpi.vat) },
    { label: "Net profit", value: eur(kpi.profit) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Business</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Sales & Accounts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Purchase, costs, sale, margin, VAT and profit for every car.
        </p>
      </div>

      {/* Deposit-paid but still listed alert */}
      {depositPending.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-medium text-amber-200">
            {depositPending.length} car{depositPending.length > 1 ? "s" : ""} sold pending (deposit paid) — may still be online.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {depositPending.map((r) => (
              <Link key={r.v.id} href={`/inventory/${r.v.id}`} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-200 hover:bg-amber-400/20">
                {r.v.year} {r.v.make} {r.v.model} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="studio-surface p-5">
            <p className="text-sm text-slate-400">{k.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Per-car table */}
      <div className="studio-surface overflow-x-auto p-2">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="p-3">Vehicle</th>
              <th className="p-3">Plate</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Bought</th>
              <th className="p-3 text-right">Sold</th>
              <th className="p-3 text-right">Margin</th>
              <th className="p-3 text-right">Profit</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.v.id} className="border-t border-white/5">
                <td className="p-3">
                  <EntityLink kind="vehicle" id={r.v.id} reference={vehicleReference(r.v.vehicle_no)} href={`/inventory/${r.v.id}`} />
                  <span className="ml-2 text-slate-100">{r.v.year} {r.v.make} {r.v.model}</span>
                </td>
                <td className="p-3 font-mono text-xs font-semibold text-slate-700">{r.v.registration??"—"}</td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLES[r.deal?.sale_status ?? "none"]}`}>
                    {STATUS_LABELS[r.deal?.sale_status ?? "none"]}
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums text-slate-300">{r.deal?.purchase_price ? eur(Number(r.deal.purchase_price)) : "—"}</td>
                <td className="p-3 text-right tabular-nums text-slate-300">{r.deal?.sale_price ? eur(Number(r.deal.sale_price)) : "—"}</td>
                <td className="p-3 text-right tabular-nums text-slate-300">{r.fin ? eur(r.fin.grossMargin) : "—"}</td>
                <td className={`p-3 text-right tabular-nums ${r.fin && r.fin.netProfit < 0 ? "text-rose-400" : "text-emerald-300"}`}>{r.fin ? eur(r.fin.netProfit) : "—"}</td>
                <td className="p-3 text-right">
                  <Link href={`/inventory/${r.v.id}`} className="text-xs font-medium text-sky-400 hover:text-sky-300">
                    Vehicle details
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-sm text-slate-500">No vehicles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
