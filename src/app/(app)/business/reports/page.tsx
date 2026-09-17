import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoSalesDeals, demoPurchases, demoDeals, demoCosts, demoVehicles } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { computeDeal, type VatScheme } from "@/lib/finance";
import { money } from "@/lib/currency";
import { ModuleUpsell } from "@/components/module-upsell";
import { CsvButton } from "./csv-button";

interface Line { ref: string; party: string; car: string; amount: number }
interface SaleLine { car: string; sale: number; cost: number; profit: number }

export default async function ReportsPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.viewFinancials(session.role)) return <p className="text-sm text-slate-400">Your role does not include reports.</p>;

  let debtors: Line[] = [];
  let creditors: Line[] = [];
  let sales: SaleLine[] = [];

  if (isDemoMode()) {
    debtors = demoSalesDeals
      .map((d) => {
        const costToChange = (d.retail_price ?? d.order.price) - (d.siv_total ?? 0);
        const addons = (d.addons ?? []).reduce((a, x) => a + x.price, 0);
        const deposits = d.payments.filter((p) => p.kind === "deposit").reduce((a, p) => a + p.amount, 0);
        return { ref: d.deal_no, party: d.customer.name, car: d.order.vehicle_label, amount: costToChange + addons - deposits };
      })
      .filter((x) => x.amount > 0);
    creditors = demoPurchases
      .map((p) => {
        const total = p.lines.reduce((a, l) => a + l.gross, 0);
        const paid = p.payments.reduce((a, x) => a + x.amount, 0);
        return { ref: p.po_no, party: p.vendor.name, car: p.car, amount: total - paid };
      })
      .filter((x) => x.amount > 0);
    sales = demoDeals
      .filter((d) => (d.sale_price ?? 0) > 0)
      .map((d) => {
        const costs = demoCosts.filter((c) => c.vehicle_id === d.vehicle_id).reduce((a, c) => a + c.amount, 0);
        const r = computeDeal({ purchasePrice: d.purchase_price ?? 0, costs, salePrice: d.sale_price ?? 0, vatScheme: (d.vat_scheme ?? "standard") as VatScheme });
        const v = demoVehicles.find((x) => x.id === d.vehicle_id);
        return { car: v ? `${v.year} ${v.make} ${v.model}` : d.vehicle_id, sale: d.sale_price ?? 0, cost: r.totalCost, profit: r.netProfit };
      });
  } else {
    const supabase = await createClient();
    const [{ data: deals }, { data: orders }, { data: pays }, { data: addons }, { data: customers }, { data: vehicles }, { data: pos }, { data: poLines }, { data: poPays }, { data: vdeals }, { data: vcosts }] = await Promise.all([
      supabase.from("deals").select("id, deal_no, retail_price, siv_total, customer_id, status").eq("dealer_id", session.dealer.id).neq("status", "cancelled"),
      supabase.from("deal_orders").select("deal_id, vehicle_id, price, kind").eq("dealer_id", session.dealer.id).eq("kind", "sale"),
      supabase.from("payments").select("deal_id, kind, amount").eq("dealer_id", session.dealer.id).eq("kind", "deposit"),
      supabase.from("deal_addons").select("deal_id, price").eq("dealer_id", session.dealer.id),
      supabase.from("customers").select("id, name").eq("dealer_id", session.dealer.id),
      supabase.from("vehicles").select("id, make, model, year, status").eq("dealer_id", session.dealer.id),
      supabase.from("purchase_orders").select("id, po_no, vendor_id, vehicle_id, status").eq("dealer_id", session.dealer.id).in("status", ["to_be_paid", "approved"]),
      supabase.from("po_lines").select("po_id, gross").eq("dealer_id", session.dealer.id),
      supabase.from("po_payments").select("po_id, amount").eq("dealer_id", session.dealer.id),
      supabase.from("vehicle_deals").select("vehicle_id, purchase_price, sale_price, vat_scheme").eq("dealer_id", session.dealer.id),
      supabase.from("vehicle_costs").select("vehicle_id, amount").eq("dealer_id", session.dealer.id),
    ]);
    const cName = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const vLabel = new Map((vehicles ?? []).map((v) => [v.id, `${v.year} ${v.make} ${v.model}`]));
    const saleOrder = new Map((orders ?? []).map((o) => [o.deal_id, o]));
    const depByDeal = new Map<string, number>();
    for (const p of pays ?? []) depByDeal.set(p.deal_id, (depByDeal.get(p.deal_id) ?? 0) + Number(p.amount));
    const addonByDeal = new Map<string, number>();
    for (const a of addons ?? []) addonByDeal.set(a.deal_id, (addonByDeal.get(a.deal_id) ?? 0) + Number(a.price));

    debtors = (deals ?? [])
      .map((d) => {
        const o = saleOrder.get(d.id);
        const retail = Number(d.retail_price ?? o?.price ?? 0);
        const costToChange = retail - Number(d.siv_total ?? 0);
        return { ref: d.deal_no, party: d.customer_id ? cName.get(d.customer_id) ?? "—" : "—", car: o?.vehicle_id ? vLabel.get(o.vehicle_id) ?? "—" : "—", amount: costToChange + (addonByDeal.get(d.id) ?? 0) - (depByDeal.get(d.id) ?? 0) };
      })
      .filter((x) => x.amount > 0);

    const poTotal = new Map<string, number>();
    for (const l of poLines ?? []) poTotal.set(l.po_id, (poTotal.get(l.po_id) ?? 0) + Number(l.gross));
    const poPaid = new Map<string, number>();
    for (const p of poPays ?? []) poPaid.set(p.po_id, (poPaid.get(p.po_id) ?? 0) + Number(p.amount));
    creditors = (pos ?? [])
      .map((p) => ({ ref: p.po_no, party: p.vendor_id ? cName.get(p.vendor_id) ?? "—" : "—", car: p.vehicle_id ? vLabel.get(p.vehicle_id) ?? "—" : "—", amount: (poTotal.get(p.id) ?? 0) - (poPaid.get(p.id) ?? 0) }))
      .filter((x) => x.amount > 0);

    const costByVeh = new Map<string, number>();
    for (const c of vcosts ?? []) costByVeh.set(c.vehicle_id, (costByVeh.get(c.vehicle_id) ?? 0) + Number(c.amount));
    const soldIds = new Set((vehicles ?? []).filter((v) => v.status === "sold").map((v) => v.id));
    sales = (vdeals ?? [])
      .filter((d) => soldIds.has(d.vehicle_id) && Number(d.sale_price ?? 0) > 0)
      .map((d) => {
        const r = computeDeal({ purchasePrice: Number(d.purchase_price ?? 0), costs: costByVeh.get(d.vehicle_id) ?? 0, salePrice: Number(d.sale_price ?? 0), vatScheme: (d.vat_scheme ?? "standard") as VatScheme });
        return { car: vLabel.get(d.vehicle_id) ?? d.vehicle_id, sale: Number(d.sale_price ?? 0), cost: r.totalCost, profit: r.netProfit };
      });
  }

  const totalDebtors = debtors.reduce((a, x) => a + x.amount, 0);
  const totalCreditors = creditors.reduce((a, x) => a + x.amount, 0);
  const salesRevenue = sales.reduce((a, x) => a + x.sale, 0);
  const salesProfit = sales.reduce((a, x) => a + x.profit, 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Reports</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Aged debtors" value={money(totalDebtors, "EUR")} accent="text-amber-300" />
        <Kpi label="Aged creditors" value={money(totalCreditors, "EUR")} accent="text-amber-300" />
        <Kpi label="Sales revenue" value={money(salesRevenue, "EUR")} />
        <Kpi label="Sales profit" value={money(salesProfit, "EUR")} accent={salesProfit >= 0 ? "text-emerald-300" : "text-rose-300"} />
      </div>

      <Report
        title="Aged debtors — money owed by customers"
        headers={["Ref", "Customer", "Vehicle", "Outstanding"]}
        rows={debtors.map((d) => [d.ref, d.party, d.car, Math.round(d.amount)])}
        render={debtors.map((d) => [d.ref, d.party, d.car, money(d.amount, "EUR")])}
        empty="No outstanding customer balances."
      />
      <Report
        title="Aged creditors — money owed to vendors"
        headers={["PO", "Vendor", "Vehicle", "Outstanding"]}
        rows={creditors.map((d) => [d.ref, d.party, d.car, Math.round(d.amount)])}
        render={creditors.map((d) => [d.ref, d.party, d.car, money(d.amount, "EUR")])}
        empty="No outstanding vendor balances."
      />
      <Report
        title="Detailed sales — sold vehicles & profit"
        headers={["Vehicle", "Sale", "Cost", "Profit"]}
        rows={sales.map((s) => [s.car, Math.round(s.sale), Math.round(s.cost), Math.round(s.profit)])}
        render={sales.map((s) => [s.car, money(s.sale, "EUR"), money(s.cost, "EUR"), money(s.profit, "EUR")])}
        empty="No sales recorded yet."
      />
    </div>
  );
}

function Kpi({ label, value, accent = "text-slate-100" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

function Report({ title, headers, rows, render, empty }: { title: string; headers: string[]; rows: (string | number)[][]; render: string[][]; empty: string }) {
  return (
    <section className="studio-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-200">{title}</h2>
        {rows.length > 0 && <CsvButton filename={`${title.split(" —")[0].toLowerCase().replace(/\s+/g, "-")}.csv`} headers={headers} rows={rows} />}
      </div>
      {render.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                {headers.map((h, i) => <th key={h} className={`px-3 py-2 ${i >= headers.length - (headers.length > 2 ? 1 : 0) ? "text-right" : ""}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {render.map((r, ri) => (
                <tr key={ri} className="border-t border-white/5">
                  {r.map((c, ci) => <td key={ci} className={`px-3 py-2 ${ci === 0 ? "text-slate-200" : "text-slate-300"} ${ci === r.length - 1 ? "text-right tabular-nums" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
