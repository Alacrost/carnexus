import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoSalesDeals } from "@/lib/demo";
import { can } from "@/lib/types";
import { money } from "@/lib/currency";
import { dealMoney } from "@/lib/deals";
import { commercialPermission } from "@/lib/commercial-server";
import { StatusButton, PriceEditor, FinancePanel, type FinanceValues } from "./commercial-panels";
import { AddPayment } from "./add-payment";
import { DealStage } from "./deal-stage";
import { DealDocuments, type DocRow } from "./deal-documents";
import { AddTradeIn } from "./add-trade-in";
import { RequiredDocs } from "./required-docs";
import { DealAddons, type Addon } from "./deal-addons";

interface Pay { kind: string; amount: number; method: string | null; paid_on: string | null }
interface Evt { kind: string; detail: string; audit?:unknown; by: string; at: string }
interface TradeIn { label: string; reg: string | null; allowance: number; settlement: number; netEquity: number }
interface DealView extends FinanceValues {
  version?: number; so_no?: string;
  id: string; deal_no: string; status: string; stage: string; currency: string;
  customer: string; customerContact: string; salesperson: string;
  car: string; sale: number; retail: number; siv: number; vat_scheme: string;
  payments: Pay[]; events: Evt[]; documents: DocRow[]; tradeIn: TradeIn | null;
  requiredDocs: Record<string, boolean>; addons: Addon[];
}

const NEXT: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "agreed", label: "Mark agreed" }, { status: "cancelled", label: "Cancel" }],
  quoted: [{ status: "agreed", label: "Mark agreed" }, { status: "cancelled", label: "Cancel" }],
  agreed: [{ status: "completed", label: "Complete sale" }, { status: "cancelled", label: "Cancel" }],
  finance: [{ status: "completed", label: "Complete sale" }, { status: "cancelled", label: "Cancel" }],
  completed: [],
  cancelled: [],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtEvent(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return <p className="text-sm text-slate-400">No access.</p>;
  const [canPrice,canPay,canWork,canRead] = await Promise.all(["price","payment","work","read"].map(commercialPermission));
  if(!canRead)return <p>No commercial access.</p>;
  const showProfit = false; // Cost fields are not selected into the sales view.

  let d: DealView | null = null;
  let summary:{total:number;paid:number;balance:number;equity:number}|null=null;

  if (isDemoMode()) {
    const x = demoSalesDeals.find((z) => z.id === id);
    if (!x) notFound();
    d = {
      id: x.id, deal_no: x.deal_no, status: x.status, stage: x.stage, currency: x.currency,
      customer: x.customer.name, customerContact: [x.customer.phone, x.customer.email].filter(Boolean).join(" · "),
      salesperson: x.salesperson, car: x.order.vehicle_label, sale: x.order.price,
      retail: x.retail_price ?? x.order.price, siv: x.siv_total ?? 0, vat_scheme: x.order.vat_scheme,
      payments: x.payments,
      events: (x.events ?? []).map((e) => ({ kind: e.kind, detail: e.detail, by: e.by, at: e.at })),
      documents: [],
      tradeIn: x.tradeIn ? { label: x.tradeIn.vehicle_label, reg: x.tradeIn.reg, allowance: x.tradeIn.allowance, settlement: x.tradeIn.settlement, netEquity: x.tradeIn.net_equity } : null,
      requiredDocs: (x.required_docs ?? {}) as Record<string, boolean>,
      addons: (x.addons ?? []) as Addon[],
    };
  } else {
    const supabase = await createClient();
    const { data: deal } = await supabase.from("deals").select("id, deal_no, status, stage, currency, customer_id, salesperson_id, retail_price, siv_total, required_docs, version, so_no, finance_company, finance_reference, finance_address, finance_expected, finance_status, invoice_to_finance").eq("dealer_id", session.dealer.id).eq("id", id).maybeSingle();
    if (!deal) notFound();
    const results = await Promise.all([
      supabase.from("deal_orders").select("vehicle_id, price, vat_scheme").eq("dealer_id", session.dealer.id).eq("deal_id", id).eq("kind", "sale").maybeSingle(),
      supabase.from("payments").select("kind, amount, method, paid_on").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at"),
      deal.customer_id ? supabase.from("customers").select("name, phone, email").eq("id", deal.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      deal.salesperson_id ? supabase.from("profiles").select("full_name").eq("id", deal.salesperson_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("deal_events").select("kind, detail, created_by, created_at").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at", { ascending: false }),
      supabase.from("deal_documents").select("id, kind, number, status, created_at").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at", { ascending: false }),
    ]);
    if(results.some(r=>"error" in r && r.error))return <p role="alert">Deal data could not load. Retry before recording payments.</p>;
    const [{ data: order }, { data: pays }, { data: customer }, { data: sp }, { data: evRows }, { data: docRows }] = results;
    const aggregate=await supabase.rpc("deal_balances",{p_dealer:session.dealer.id,p_deal:id});
    if(aggregate.error||!aggregate.data)return <p role="alert">The authoritative balance could not load.</p>;
    summary=aggregate.data as {total:number;paid:number;balance:number;equity:number};
    const { data: pxRow,error:pxError } = await supabase.from("deal_orders").select("vehicle_id, price, settlement_amount, net_equity").eq("dealer_id", session.dealer.id).eq("deal_id", id).eq("kind", "purchase").eq("is_trade_in", true).maybeSingle();
    if(pxError)return <p role="alert">Trade-in details could not load.</p>;
    let tradeIn: TradeIn | null = null;
    if (pxRow) {
      let label = "Trade-in";
      let reg: string | null = null;
      if (pxRow.vehicle_id) {
        const { data: pv } = await supabase.from("vehicles").select("make, model, year, registration").eq("id", pxRow.vehicle_id).maybeSingle();
        if (pv) { label = `${pv.year} ${pv.make} ${pv.model}`; reg = pv.registration; }
      }
      tradeIn = { label, reg, allowance: Number(pxRow.price ?? 0), settlement: Number(pxRow.settlement_amount ?? 0), netEquity: Number(pxRow.net_equity ?? 0) };
    }
    const { data: addonRows,error:addonError } = await supabase.from("deal_addons").select("id, kind, name, price").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at");
    if(addonError)return <p role="alert">Sale extras could not load.</p>;
    let car = "—";
    if (order?.vehicle_id) {
      const { data: v } = await supabase.from("vehicles").select("make, model, year").eq("id", order.vehicle_id).maybeSingle();
      if (v) car = `${v.year} ${v.make} ${v.model}`;
    }
    const evByIds = [...new Set((evRows ?? []).map((e) => e.created_by).filter(Boolean) as string[])];
    const { data: evProfs } = evByIds.length ? await supabase.from("profiles").select("id, full_name").in("id", evByIds) : { data: [] as { id: string; full_name: string | null }[] };
    const byName = new Map((evProfs ?? []).map((p) => [p.id, p.full_name]));
    d = {
      ...deal, id: deal.id, deal_no: deal.deal_no, status: deal.status, stage: deal.stage ?? "vehicle_interest", currency: deal.currency,
      customer: customer?.name ?? "—", customerContact: [customer?.phone, customer?.email].filter(Boolean).join(" · "),
      salesperson: sp?.full_name ?? "—", car, sale: Number(order?.price ?? 0),
      retail: Number(deal.retail_price ?? order?.price ?? 0), siv: Number(deal.siv_total ?? 0), vat_scheme: order?.vat_scheme ?? "standard",
      payments: (pays ?? []) as Pay[],
      events: (evRows ?? []).map((e) => ({
        kind: e.kind,
        detail: (e.detail as { message?: string } | null)?.message ?? e.kind,
        by: e.created_by ? byName.get(e.created_by) ?? "—" : "System",
        at: e.created_at, audit:e.detail,
      })),
      documents: (docRows ?? []).map((r) => ({ id: r.id, kind: r.kind, number: r.number, status: r.status, date: r.created_at })),
      tradeIn,
      requiredDocs: (deal.required_docs as Record<string, boolean> | null) ?? {},
      addons: (addonRows ?? []) as Addon[],
    };
  }

  const paid = summary ? Number(summary.paid) : d.payments.reduce((a, p) => a + (p.kind === "refund" ? -Number(p.amount) : p.kind === "trade_allowance" ? 0 : Number(p.amount)), 0);
  const closed = ["completed","cancelled"].includes(d.status);
  const m = dealMoney({ retailPrice: d.retail, sivTotal: d.siv, paid });
  const addonsTotal = summary ? Number(summary.total)-d.retail : d.addons.reduce((a, x) => a + Number(x.price), 0);
  const customerTotal = m.costToChange + addonsTotal;
  const balance = summary ? Number(summary.balance) : customerTotal - paid;
  const transitions = canWork ? NEXT[d.status] ?? [] : [];

  const kpi = (label: string, value: string, accent = "text-slate-100") => (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/business/deals" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ArrowLeftIcon size={14} /> Deals
        </Link>
        <h1 className="font-mono text-xl font-semibold text-slate-100">{d.deal_no}</h1>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs capitalize text-slate-300">{d.status}</span>
        {canWork && !closed && <DealStage dealId={d.id} stage={d.stage} />}
        <span className="font-mono text-xs text-slate-400">{d.so_no}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {transitions.map((t) => (
            <StatusButton key={t.status} id={d.id} status={t.status} label={t.label}/>
          ))}
        </div>
      </div>

      {/* Money summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {kpi("Retail price", money(m.retail, d.currency))}
        {kpi("Trade-in (SIV)", money(m.siv, d.currency))}
        {kpi("Cost to change", money(m.costToChange, d.currency))}
        {kpi("Add-ons", money(addonsTotal, d.currency))}
        {kpi("Paid", money(paid, d.currency), "text-emerald-300")}
        {kpi("Balance due", money(balance, d.currency), balance > 0 ? "text-amber-300" : "text-emerald-300")}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: working panels */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="studio-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contact</h2>
              <p className="mt-1 text-slate-100">{d.customer}</p>
              {d.customerContact && <p className="text-sm text-slate-500">{d.customerContact}</p>}
              <p className="mt-2 text-[11px] text-slate-500">Salesperson: <span className="text-slate-300">{d.salesperson}</span></p>
            </section>
            <section className="studio-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vehicle</h2>
              <p className="mt-1 text-slate-100">{d.car}</p>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs capitalize text-slate-500">{d.vat_scheme} VAT scheme</span>
                <span className="tabular-nums text-slate-200">{money(d.sale, d.currency)}</span>
              </div>
              {canPrice && !closed && <PriceEditor id={d.id} version={d.version??1} price={d.sale}/>}
            </section>
          </div>
          {canWork && <FinancePanel id={d.id} values={d} closed={closed}/>}

          <section className="studio-surface p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trade-in / part-exchange</h2>
            {d.tradeIn ? (
              <div className="mt-2">
                <p className="text-slate-100">{d.tradeIn.label}{d.tradeIn.reg ? <span className="ml-2 font-mono text-xs text-slate-500">{d.tradeIn.reg}</span> : null}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Allowance</dt><dd className="tabular-nums text-slate-200">{money(d.tradeIn.allowance, d.currency)}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Settlement</dt><dd className="tabular-nums text-slate-200">{money(d.tradeIn.settlement, d.currency)}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Net equity</dt><dd className="tabular-nums text-emerald-300">{money(d.tradeIn.netEquity, d.currency)}</dd></div>
                </dl>
              </div>
            ) : (
              <>
                <p className="mt-1 text-sm text-slate-500">No trade-in. Add the vehicle allowance and any lender settlement.</p>
                {canWork && !closed && <AddTradeIn dealId={d.id} />}
              </>
            )}
          </section>

          <section className="studio-surface p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payments</h2>
            <div className="mt-2 space-y-1.5">
              {d.payments.length === 0 && <p className="text-sm text-slate-500">No payments yet.</p>}
              {d.payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                  <span className="capitalize text-slate-300">{p.kind.replace("_", " ")}{p.method ? ` · ${p.method}` : ""}{p.paid_on ? ` · ${p.paid_on}` : ""}</span>
                  <span className="tabular-nums text-slate-200">{money(Number(p.amount), d.currency)}</span>
                </div>
              ))}
            </div>
            {canPay && !closed && <AddPayment dealId={d.id} />}
          </section>

          {canWork && !closed && <DealAddons dealId={d.id} addons={d.addons} currency={d.currency} showProfit={showProfit} />}

          <Link href="/business/document-settings" className="text-sm text-sky-300">Company document settings →</Link>
          <DealDocuments dealId={d.id} docs={d.documents} status={d.status} />
        </div>

        {/* Right: KYC + timeline */}
        <div className="space-y-4">
          {canWork && !closed && <RequiredDocs dealId={d.id} docs={d.requiredDocs} />}
          <section className="studio-surface p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Event log</h2>
            <ol className="mt-3 space-y-3">
              {d.events.length === 0 && <li className="text-sm text-slate-500">No events yet.</li>}
              {d.events.map((e, i) => (
                <li key={i} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-gradient-to-br from-sky-400 to-violet-500" />
                  {i < d.events.length - 1 && <span className="absolute left-[3px] top-3.5 h-full w-px bg-white/10" />}
                  <p className="text-sm text-slate-200">{e.detail}</p>
                  {e.audit!=null&&<details className="mt-1 text-xs text-slate-400"><summary className="cursor-pointer">Recorded details</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(e.audit,null,2)}</pre></details>}
                  <p className="text-[11px] text-slate-500">{fmtEvent(e.at)} · {e.by}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
