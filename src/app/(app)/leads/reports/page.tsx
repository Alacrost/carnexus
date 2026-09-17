import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import { conversionRate, crmLabel, reportPeriod, type CrmReport, type CrmBreakdown } from "@/lib/crm";

function Breakdown({ title, rows, total }: { title: string; rows: CrmBreakdown[]; total: number }) {
  return <section className="studio-surface space-y-4 p-6"><h2 className="text-lg font-semibold">{title}</h2>{rows.length ? rows.map(r => <div key={r.label}><div className="mb-2 flex justify-between gap-3 text-sm"><span>{crmLabel(r.label)}</span><span className="tabular-nums text-slate-400">{r.count}{r.won != null ? ` · ${r.won} won` : ""}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-400" style={{width:`${conversionRate(r.count,total)}%`}} /></div></div>) : <p className="text-sm text-slate-400">No leads in this period.</p>}</section>;
}

export default async function CrmReportsPage({ searchParams }: { searchParams: Promise<{from?:string;to?:string}> }) {
  const ctx = await crmContext();
  if (ctx.error || !ctx.permissions.includes("report")) return <p role="alert">{ctx.error ?? "Your CRM profile does not include reports."}</p>;
  const query = await searchParams;
  const period = reportPeriod(query.from,query.to);
  if (!period) return <div><p role="alert">The start date must be on or before the end date.</p><Link href="/leads/reports" className="text-sky-300">Reset period</Link></div>;
  let report: CrmReport = { total:0,won:0,lost:0,open:0,overdue:0,unassigned:0,stages:[],sources:[],assignees:[] };
  if (ctx.supabase) {
    const {data,error} = await ctx.supabase.rpc("crm_report",{p_dealer_id:ctx.session.dealer.id,p_from:period.start,p_to:period.end});
    if (error || !data) return <p role="alert">Could not calculate the report. Please retry; no zero totals have been substituted.</p>;
    report = data as CrmReport;
  }
  const stats = [["Enquiries",report.total],["Open",report.open],["Won",report.won],["Lost",report.lost],["Overdue",report.overdue],["Unassigned",report.unassigned],["Lead-to-sale",`${conversionRate(report.won,report.total)}%`]];
  return <div className="space-y-6"><Link href="/leads" className="text-sm text-sky-300">← Leads</Link><header><p className="text-xs uppercase tracking-widest text-sky-400">Sales intelligence</p><h1 className="mt-2 text-3xl font-semibold">Pipeline performance</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Current status of leads created during the selected period (UTC). Won = sold or after-sales. Conversion = won ÷ all enquiries; this is not a revenue or advertising attribution report.</p></header>
    {!ctx.supabase && <p className="text-amber-300">Preview — reports require a connected database. These are empty report placeholders, not sample performance.</p>}
    <form className="flex flex-wrap items-end gap-4"><label className="text-sm">Created from<input name="from" type="date" defaultValue={period.from} required className="studio-input mt-2" /></label><label className="text-sm">Through<input name="to" type="date" defaultValue={period.to} required className="studio-input mt-2" /></label><button className="btn-gradient">Update report</button></form>
    <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">{stats.map(([label,value])=><div key={label} className="studio-surface p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{ctx.supabase ? value : "—"}</p></div>)}</div>
    <div className="grid gap-6 lg:grid-cols-3"><Breakdown title="Pipeline stages" rows={report.stages} total={report.total} /><Breakdown title="Lead sources" rows={report.sources} total={report.total} /><Breakdown title="Responsible salesperson" rows={report.assignees} total={report.total} /></div>
    <p className="text-xs text-slate-500">Meta Ads imports and campaign spend reporting are planned. Manually recorded sources are included here.</p>
  </div>;
}
