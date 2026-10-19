import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { isDemoMode, demoCustomers } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { EntityLink } from "@/components/entity-link";

type TimelineItem = {
  id: string;
  occurredAt: string;
  category: "activity" | "task" | "appointment" | "deal" | "document" | "payment";
  kind: string;
  title: string;
  detail: Record<string, string | number | null>;
  href: string;
};

type TimelineResult = {
  items: TimelineItem[];
  nextCursor: { before: string; id: string } | null;
};

type CustomerSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  business_name?: string | null;
};

const FILTERS = [
  ["all", "All"],
  ["activity", "Activities"],
  ["task", "Tasks"],
  ["appointment", "Appointments"],
  ["deal", "Deals"],
  ["document", "Documents"],
  ["payment", "Payments"],
] as const;

const CATEGORY_STYLE: Record<TimelineItem["category"], string> = {
  activity: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  task: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  appointment: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  deal: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  document: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  payment: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

function prettyDetail(detail: TimelineItem["detail"]) {
  const parts: string[] = [];
  if (detail.status) parts.push(String(detail.status).replaceAll("_", " "));
  if (detail.before && detail.after) parts.push(`${String(detail.before).replaceAll("_", " ")} → ${String(detail.after).replaceAll("_", " ")}`);
  if (detail.priority) parts.push(`${detail.priority} priority`);
  if (detail.dealNo) parts.push(`Deal ${detail.dealNo}`);
  if (detail.number) parts.push(String(detail.number));
  if (detail.amount !== undefined && detail.amount !== null) {
    parts.push(new Intl.NumberFormat("en-IE", { style: "currency", currency: String(detail.currency ?? "EUR") }).format(Number(detail.amount)));
  }
  if (detail.scheduledFor) parts.push(`Scheduled ${new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(String(detail.scheduledFor)))}`);
  if (detail.dueAt) parts.push(`Due ${new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(String(detail.dueAt)))}`);
  if (detail.body) parts.push(String(detail.body));
  return parts.join(" · ");
}

export default async function CustomerTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; before?: string; cursorId?: string }>;
}) {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role)) return <p className="text-sm text-slate-400">Your role does not include contacts.</p>;

  const { id } = await params;
  const query = await searchParams;
  const selected = FILTERS.some(([value]) => value === query.kind) ? query.kind! : "all";
  const kinds = selected === "all" ? null : [selected];
  let customer: CustomerSummary | null = null;
  let timeline: TimelineResult = { items: [], nextCursor: null };
  let loadError: string | null = null;

  if (isDemoMode() && !/^[0-9a-f-]{36}$/i.test(id)) {
    customer = (demoCustomers as CustomerSummary[]).find((item) => item.id === id) ?? null;
  } else {
    const supabase = await createClient();
    const [timelinePermission, { data: customerData }, { data: timelineData, error }] = await Promise.all([
      supabase.rpc("crm_allowed", { p_dealer_id: session.dealer.id, p_permission: "read" }),
      supabase.from("customers").select("id,name,email,phone,business_name").eq("dealer_id", session.dealer.id).eq("id", id).is("deleted_at", null).maybeSingle(),
      supabase.rpc("customer_timeline", {
        p_dealer: session.dealer.id,
        p_customer: id,
        p_before: query.before ?? null,
        p_before_id: query.cursorId ?? null,
        p_limit: 30,
        p_kinds: kinds,
      }),
    ]);
    if (timelinePermission.data !== true) return <p className="text-sm text-slate-400">Your CRM profile does not include contact history.</p>;
    customer = customerData;
    if (error) loadError = "The contact history could not be loaded.";
    else if (timelineData && typeof timelineData === "object") timeline = timelineData as unknown as TimelineResult;
  }

  if (!customer) notFound();
  const next = timeline.nextCursor;
  const nextHref = next
    ? `/business/customers/${id}?kind=${selected}&before=${encodeURIComponent(next.before)}&cursorId=${encodeURIComponent(next.id)}`
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_38%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="flex items-center justify-between gap-3"><Link href="/business/customers" className="text-sm text-sky-300 transition-colors hover:text-sky-200">← Contacts</Link><Link href={`/messages?contextType=customer&contextId=${id}&contextLabel=${encodeURIComponent(customer.name)}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">Message team</Link></div>
        <div className="mt-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">Contact record</p>
          <EntityLink kind="customer" id={customer.id} href={`/business/customers/${customer.id}`} className="mt-3" />
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{customer.name}</h1>
          {customer.business_name && <p className="mt-2 text-base text-slate-300">{customer.business_name}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
            <span>{customer.email ?? "No email"}</span><span>{customer.phone ?? "No phone"}</span>
          </div>
        </div>
      </header>

      <section aria-labelledby="timeline-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales CRM</p><h2 id="timeline-heading" className="mt-1 text-2xl font-semibold text-white">Sales &amp; follow-up history</h2></div>
          <nav aria-label="Filter sales and follow-up history" className="flex flex-wrap gap-2">
            {FILTERS.map(([value, label]) => <Link key={value} href={`/business/customers/${id}?kind=${value}`} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${selected === value ? "border-sky-400/40 bg-sky-400/15 text-sky-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200"}`}>{label}</Link>)}
          </nav>
        </div>

        {loadError && <p role="alert" className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{loadError}</p>}
        <div className="relative mt-6 space-y-3 before:absolute before:bottom-6 before:left-[1.15rem] before:top-6 before:w-px before:bg-gradient-to-b before:from-sky-400/40 before:via-white/10 before:to-transparent">
          {timeline.items.map((item) => {
            const detail = prettyDetail(item.detail ?? {});
            return <article key={item.id} className="studio-surface relative ml-10 p-4 sm:p-5"><span className="absolute -left-[2.05rem] top-6 h-3 w-3 rounded-full border-2 border-slate-950 bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.65)]" /><div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_STYLE[item.category]}`}>{item.category}</span><h3 className="mt-2 font-medium text-slate-100">{item.title}</h3>{detail && <p className="mt-1 max-w-3xl text-sm text-slate-400">{detail}</p>}</div><time className="shrink-0 text-xs text-slate-500" dateTime={item.occurredAt}>{new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(item.occurredAt))}</time></div><Link href={item.href} className="mt-3 inline-flex text-xs font-medium text-sky-300 hover:text-sky-200">Open record →</Link></article>;
          })}
          {!loadError && timeline.items.length === 0 && <div className="studio-surface ml-10 p-8 text-center text-sm text-slate-500">No history in this view yet.</div>}
        </div>
        {nextHref && <div className="mt-6 text-center"><Link href={nextHref} className="inline-flex rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10">Load older history</Link></div>}
      </section>
    </div>
  );
}
