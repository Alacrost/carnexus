import Link from "next/link";
import { notFound } from "next/navigation";
import { crmContext } from "@/lib/crm-server";
import { crmLabel, type CrmLead } from "@/lib/crm";
import { crmOptions, demoCrmLeads } from "../crm-data";
import { LeadForm, ActivityForm } from "../lead-form";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; activityPage?: string }> }) {
  const ctx = await crmContext();
  if (ctx.error || !ctx.permissions.includes("read")) return <p role="alert">{ctx.error ?? "Your CRM profile cannot view leads."}</p>;
  const { id } = await params;
  const query = await searchParams;
  const page = Math.min(10000,Math.max(1,parseInt(query.activityPage ?? "1",10)||1));
  let lead: CrmLead | undefined;
  let activities: { id: string; body: string; type: string; created_at: string; created_by: string | null; detail: Record<string, unknown> }[] = [];
  let activityCount = 0;
  let contact: { name: string; email: string | null; phone: string | null } | null = null;
  if (!ctx.supabase) lead = demoCrmLeads.find(l => l.id === id);
  else {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const result = await ctx.supabase.from("leads").select("*").eq("dealer_id",ctx.session.dealer.id).eq("id",id).maybeSingle();
    if (result.error) return <p role="alert">Could not load this lead. Please retry.</p>;
    lead = result.data as CrmLead | undefined;
    if (lead) {
      const events = await ctx.supabase.from("lead_activities").select("id,body,type,created_at,created_by,detail",{count:"exact"}).eq("dealer_id",ctx.session.dealer.id).eq("lead_id",id).order("created_at",{ascending:false}).order("id").range((page-1)*25,page*25-1);
      if (events.error) return <p role="alert">Could not load the audit history. Please retry.</p>;
      activities = events.data ?? []; activityCount = events.count ?? 0;
      if (lead.customer_id) {
        const customer = await ctx.supabase.from("customers").select("name,email,phone").eq("dealer_id",ctx.session.dealer.id).eq("id",lead.customer_id).is("deleted_at",null).maybeSingle();
        if (customer.error) return <p role="alert">Could not load the contact.</p>;
        contact = customer.data;
      }
    }
  }
  if (!lead) notFound();
  const options = await crmOptions(ctx, lead);
  const names = new Map(options.team.map(m => [m.id,m.name]));
  return <div className="space-y-6">
    <Link href="/leads" className="text-sky-300 text-sm">← Leads</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div>
      <p className="text-xs uppercase tracking-widest text-sky-400">{crmLabel(lead.stage)} · {crmLabel(lead.source)}</p>
      <h1 className="mt-2 text-3xl font-semibold">{lead.title}</h1>
      <p className="mt-2 text-slate-400">{contact?.name ?? "Contact"}{contact?.phone ? ` · ${contact.phone}` : ""}{contact?.email ? ` · ${contact.email}` : ""}</p>
    </div><Link href={`/business/deals/new?leadId=${encodeURIComponent(id)}${lead.vehicle_id ? `&vehicleId=${encodeURIComponent(lead.vehicle_id)}` : ""}`} className="btn-gradient">Continue to deal</Link></header>
    {!ctx.supabase && <p className="text-amber-300">Preview — changes are not saved.</p>}
    {query.saved === "1" && <p role="status" className="text-emerald-300">Lead saved. The change is recorded below.</p>}
    {options.error && <p role="alert">{options.error}</p>}
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <section>{ctx.permissions.includes("work") && !options.error ? <LeadForm key={lead.version} lead={lead} {...options} canAssign={ctx.permissions.includes("assign")} userId={ctx.session.userId} /> : <div className="studio-surface space-y-3 p-6"><p>{lead.notes ?? "No notes"}</p><p>Next: {lead.next_action ?? "No follow-up"}</p><p>{lead.next_action_at ? new Date(lead.next_action_at).toUTCString() : ""}</p><p>{lead.lost_reason}</p></div>}</section>
      <section className="studio-surface space-y-6 p-6">
        <h2 className="text-xl font-semibold">Activity & audit trail</h2>
        {ctx.permissions.includes("work") && <ActivityForm leadId={lead.id} />}
        {activities.length === 0 && <p className="text-sm text-slate-400">No recorded activity{ctx.supabase ? " yet" : " in preview"}.</p>}
        <ol className="space-y-4">{activities.map(a => <li key={a.id} className="border-l-2 border-sky-400/30 pl-4">
          <p className="text-xs text-slate-400">{new Date(a.created_at).toUTCString()} · {a.created_by ? names.get(a.created_by) ?? a.created_by : "System"}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
          {a.detail && Object.keys(a.detail).length > 0 && <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">View recorded changes</summary><pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(a.detail,null,2)}</pre></details>}
        </li>)}</ol>
        <div className="flex gap-4 text-sm text-sky-300">{page>1 && <Link href={`/leads/${id}?activityPage=${page-1}`}>Newer</Link>}{page*25<activityCount && <Link href={`/leads/${id}?activityPage=${page+1}`}>Older</Link>}</div>
      </section>
    </div>
  </div>;
}
