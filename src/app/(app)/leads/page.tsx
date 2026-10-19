import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import { CRM_STAGES, crmLabel, type CrmLead } from "@/lib/crm";
import { demoCrmLeads } from "./crm-data";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; page?: string; mine?: string; overdue?: string }> }) {
  const ctx = await crmContext();
  if (ctx.error || !ctx.permissions.includes("read")) return <p role="alert">{ctx.error ?? "Your CRM profile does not include leads."}</p>;
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0,120);
  const stage = CRM_STAGES.some(([s]) => s === params.stage) ? params.stage! : "";
  const page = Math.min(10000,Math.max(1,parseInt(params.page ?? "1",10)||1));
  const mine = params.mine === "1", overdue = params.overdue === "1";
  const now = new Date().toISOString();
  let rows: CrmLead[] = []; let count = 0;
  let names = new Map<string,string>();
  if (!ctx.supabase) {
    const filtered = demoCrmLeads.filter(l => (!q || l.title.toLowerCase().includes(q.toLowerCase())) && (!stage || l.stage === stage) && (!mine || l.assigned_to === ctx.session.userId) && (!overdue || (!!l.next_action_at && l.next_action_at<now && !["sold","after_sales","lost"].includes(l.stage))));
    rows = filtered.slice((page-1)*30,page*30); count = filtered.length;
    names.set(ctx.session.userId,"Preview owner");
  } else {
    let query = ctx.supabase.from("leads").select("*",{count:"exact"}).eq("dealer_id",ctx.session.dealer.id);
    if (q) query = query.ilike("title",`%${q.replace(/[\\%_]/g,"\\$&")}%`);
    if (stage) query = query.eq("stage",stage);
    if (mine) query = query.eq("assigned_to",ctx.session.userId);
    if (overdue) query = query.lt("next_action_at",now).not("stage","in","(sold,after_sales,lost)");
    const [result, team] = await Promise.all([
      query.order("created_at",{ascending:false}).order("id").range((page-1)*30,page*30-1),
      ctx.supabase.rpc("crm_team",{p_dealer_id:ctx.session.dealer.id}),
    ]);
    if (result.error || team.error) return <p role="alert">Could not load leads. Please retry; this is not an empty pipeline.</p>;
    rows = (result.data ?? []) as CrmLead[]; count = result.count ?? 0;
    names = new Map((team.data ?? []).map((m: {id:string;name:string}) => [m.id,m.name]));
  }
  const link = (next: number) => "/leads?" + new URLSearchParams({q,stage,page:String(next),mine:mine?"1":"",overdue:overdue?"1":""});
  const exportHref = "/leads/export?" + new URLSearchParams({type:"leads",q,stage,mine:mine?"true":"false",overdue:overdue?"true":"false"});
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-sky-400">Sales workspace</p><h1 className="mt-2 text-3xl font-semibold text-gradient">Every enquiry. A clear next step.</h1><p className="mt-2 text-slate-400">{count} matching leads · ownership, follow-up and history in one place.</p></div>
      {ctx.permissions.includes("work") && <Link href="/leads/new" className="btn-gradient">New lead</Link>}
    </header>
    <nav className="flex flex-wrap gap-5 text-sm text-sky-300"><Link href="/leads/tasks">Tasks</Link><Link href="/leads/viewings">Appointments</Link>{ctx.permissions.includes("report") && <><Link href="/leads/reports">Pipeline reports</Link><Link href={exportHref}>Export filtered CSV</Link></>}{ctx.session.role === "owner" && <Link href="/leads/team">CRM profiles & team</Link>}<Link href="/business/deals">Deals</Link></nav>
    {!ctx.supabase && <p className="rounded-xl border border-amber-400/20 p-3 text-sm text-amber-200">Sample pipeline — connect Supabase to work with real leads.</p>}
    <form className="studio-surface flex flex-wrap items-end gap-4 p-4">
      <label className="min-w-52 flex-1 text-xs text-slate-400">Search enquiry title<input name="q" defaultValue={q} maxLength={120} className="studio-input mt-2" placeholder="Vehicle or enquiry…" /></label>
      <label className="text-xs text-slate-400">Stage<select name="stage" defaultValue={stage} className="studio-input mt-2"><option value="">All stages</option>{CRM_STAGES.map(([s,l]) => <option key={s} value={s}>{l}</option>)}</select></label>
      <label className="pb-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={mine} className="mr-2" />Assigned to me</label>
      <label className="pb-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={overdue} className="mr-2" />Overdue</label>
      <button className="btn-gradient">Filter</button><Link href="/leads" className="pb-2 text-sm text-slate-400">Reset</Link>
    </form>
    <div className="studio-surface overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400"><tr>{["Enquiry","Stage / source","Responsible","Next action"].map(h=><th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>
      {rows.map(l => <tr key={l.id} className="border-b border-white/5 hover:bg-white/[.02]"><td className="p-4"><Link href={`/leads/${l.id}`} className="font-medium text-sky-200 hover:underline">{l.title}</Link>{l.score && <p className="mt-1 text-xs capitalize text-slate-400">{l.score}</p>}</td><td className="p-4">{crmLabel(l.stage)}<p className="mt-1 text-xs text-slate-400">{crmLabel(l.source)}</p></td><td className="p-4">{l.assigned_to ? names.get(l.assigned_to) ?? "Inactive member" : "Unassigned"}</td><td className="p-4">{l.next_action ?? "—"}{l.next_action_at && <p className={`mt-1 text-xs ${l.next_action_at<now ? "text-amber-300" : "text-slate-400"}`}>{new Date(l.next_action_at).toUTCString()}</p>}</td></tr>)}
      {!rows.length && <tr><td colSpan={4} className="p-10 text-center text-slate-400">No leads match these filters. Create an enquiry or adjust your filters.</td></tr>}
    </tbody></table></div>
    <div className="flex justify-between text-sm text-slate-400"><span>Page {page} · 30 per page</span><div className="flex gap-5 text-sky-300">{page>1 && <Link href={link(page-1)}>Previous</Link>}{page*30<count && <Link href={link(page+1)}>Next</Link>}</div></div>
  </div>;
}
