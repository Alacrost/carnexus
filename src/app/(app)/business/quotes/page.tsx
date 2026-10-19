import Link from "next/link";
import {isDemoMode} from "@/lib/demo";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { can, hasModule } from "@/lib/types";
import { commercialPermission } from "@/lib/commercial-server";
import { money } from "@/lib/currency";
import { ModuleUpsell } from "@/components/module-upsell";

interface QuoteRow {
  id: string; quote_no: string; valid_until: string; status: string;
  deal_id: string | null; issued_on: string; sale_price: number; currency: string;
  snapshot: {
    customer?: { name?: string };
    vehicle?: { label?: string; reg?: string };
    salesperson?: { name?: string };
  };
}

interface HistoricalQuoteRow {
  id: string; deal_id: string; number: string; status: string;
  effective_date: string; salesperson_id: string | null;
  snapshot: {
    customer?: { name?: string };
    vehicle?: { label?: string; reg?: string };
    sale?: number; currency?: string;
  };
}

const dateLabel = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("en-IE", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });

function phase(row: QuoteRow, today: string) {
  return row.status === "converted" ? "converted" : row.valid_until < today ? "expired" : "open";
}

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role) || !(await commercialPermission("read"))) return <p>No access to sales quotes.</p>;

  let current: QuoteRow[] = [];
  let historical: HistoricalQuoteRow[] = [];
  const salespersonNames = new Map<string, string>();
  {
    const db = await createClient();
    const [currentResult, historicalResult] = await Promise.all([
      db.from("sales_quotes")
        .select("id,quote_no,valid_until,status,deal_id,issued_on,sale_price,currency,snapshot")
        .eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }),
      db.from("deal_documents")
        .select("id,deal_id,number,status,effective_date,salesperson_id,snapshot")
        .eq("dealer_id", session.dealer.id).eq("kind", "quote")
        .order("created_at", { ascending: false }),
    ]);
    if (currentResult.error || historicalResult.error) {
      return <p role="alert">Quotes could not load. Check migrations 073 and 074, then retry.</p>;
    }
    current = (currentResult.data ?? []) as QuoteRow[];
    historical = (historicalResult.data ?? []) as HistoricalQuoteRow[];
    const salespersonIds = [...new Set(historical.map((row) => row.salesperson_id).filter((id): id is string => Boolean(id)))];
    if (salespersonIds.length) {
      const { data: profiles } = await db.from("profiles").select("id,full_name").in("id", salespersonIds);
      for (const profile of profiles ?? []) {
        if (profile.full_name) salespersonNames.set(profile.id, profile.full_name);
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const counts = {
    all: current.length + historical.length,
    open: current.filter((row) => phase(row, today) === "open").length,
    expired: current.filter((row) => phase(row, today) === "expired").length,
    converted: current.filter((row) => phase(row, today) === "converted").length,
    historical: historical.length,
  };
  const requested = (await searchParams).status ?? "all";
  const selected = requested in counts ? requested : "all";
  const visibleCurrent = selected === "all" ? current : current.filter((row) => phase(row, today) === selected);
  const showHistorical = selected === "all" || selected === "historical";

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
      <div>
        <Link href="/business/deals" className="text-xs text-slate-400 hover:text-white">← Sales pipeline</Link>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Sales · quotations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Quotes</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">New quotes are separate from Deals. Historical Deal quotations have no recorded expiry date.</p>
      </div>
      <Link href="/business/deals/new" className="btn-gradient text-sm">+ Deal</Link>
    </div>

    <nav aria-label="Quote status" className="grid gap-2 sm:grid-cols-5">
      {([["all", "All quotes"], ["open", "Open"], ["expired", "Expired"], ["converted", "Converted"], ["historical", "Historical"]] as const).map(([key, label]) =>
        <Link key={key} href={key === "all" ? "/business/quotes" : "/business/quotes?status=" + key}
          aria-current={selected === key ? "page" : undefined}
          className={"border px-4 py-3 transition " + (selected === key ? "border-sky-300/50 bg-sky-300/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-white/25")}>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums text-white">{counts[key]}</span>
        </Link>)}
    </nav>

    {selected !== "historical" && <section className="studio-surface overflow-x-auto">
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">Issued quotes</h2>
      <table className="w-full min-w-[950px] text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
          <th className="px-4 py-3">Quote</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Vehicle / plate</th>
          <th className="px-4 py-3">Responsible</th><th className="px-4 py-3 text-right">Price</th>
          <th className="px-4 py-3">Issued</th><th className="px-4 py-3">Valid until</th><th className="px-4 py-3">Status</th>
        </tr></thead>
        <tbody>{visibleCurrent.map((row) => {
          const state = phase(row, today);
          return <tr key={row.id} className="border-t border-white/10 hover:bg-white/[0.03]">
            <td className="px-4 py-3"><Link href={"/business/quotes/" + row.id} className="border border-white/20 bg-slate-900 px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-slate-700">{row.quote_no}</Link></td>
            <td className="px-4 py-3 text-slate-200">{row.snapshot.customer?.name ?? "—"}</td>
            <td className="px-4 py-3 text-slate-200">{row.snapshot.vehicle?.label ?? "—"}<span className="ml-2 font-mono text-xs text-slate-400">{row.snapshot.vehicle?.reg ?? "—"}</span></td>
            <td className="px-4 py-3 text-slate-300">{row.snapshot.salesperson?.name ?? "—"}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">{money(Number(row.sale_price), row.currency)}</td>
            <td className="px-4 py-3 text-slate-400">{dateLabel(row.issued_on)}</td>
            <td className="px-4 py-3 text-slate-200">{dateLabel(row.valid_until)}</td>
            <td className="px-4 py-3"><span className={"border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider " + (state === "open" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : state === "expired" ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-sky-300/30 bg-sky-300/10 text-sky-200")}>{state}</span></td>
          </tr>;
        })}{visibleCurrent.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No issued quotes in this status.</td></tr>}</tbody>
      </table>
    </section>}

    {showHistorical && <section className="studio-surface overflow-x-auto">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Historical Deal quotations</h2>
        <p className="mt-1 text-xs text-slate-400">Original documents, including voided ones. No expiry date was recorded, so these are never marked open or expired.</p>
      </div>
      <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
          <th className="px-4 py-3">Quote</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Vehicle / plate</th>
          <th className="px-4 py-3">Responsible</th><th className="px-4 py-3 text-right">Price</th>
          <th className="px-4 py-3">Issued</th><th className="px-4 py-3">Status / Deal</th>
        </tr></thead>
        <tbody>{historical.map((row) =>
          <tr key={row.id} className="border-t border-white/10 hover:bg-white/[0.03]">
            <td className="px-4 py-3"><Link href={"/deal-doc/" + row.deal_id + "/" + row.id} className="border border-white/20 bg-slate-900 px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-slate-700">{row.number}</Link></td>
            <td className="px-4 py-3 text-slate-200">{row.snapshot.customer?.name ?? "—"}</td>
            <td className="px-4 py-3 text-slate-200">{row.snapshot.vehicle?.label ?? "—"}<span className="ml-2 font-mono text-xs text-slate-400">{row.snapshot.vehicle?.reg ?? "—"}</span></td>
            <td className="px-4 py-3 text-slate-300">{row.salesperson_id ? salespersonNames.get(row.salesperson_id) ?? "—" : "—"}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">{row.snapshot.sale == null ? "—" : money(Number(row.snapshot.sale), row.snapshot.currency ?? "EUR")}</td>
            <td className="px-4 py-3 text-slate-400">{dateLabel(row.effective_date)}</td>
            <td className="px-4 py-3"><span className="mr-2 text-xs text-slate-400">{row.status === "void" ? "Voided" : "Historical"}</span><Link href={"/business/deals/" + row.deal_id} className="text-xs font-semibold text-sky-200 underline">Open Deal</Link></td>
          </tr>)}
          {historical.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No historical Deal quotations found.</td></tr>}
        </tbody>
      </table>
    </section>}

    {isDemoMode() && <p className="text-xs text-slate-500">Local demo: Deal quotations are stored on this computer and listed under Historical because they have no expiry date.</p>}
  </div>;
}
