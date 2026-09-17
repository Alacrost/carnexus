import { InventoryIcon, ReadyIcon, LeadsIcon, SparkIcon } from "@/components/icons";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isDemoMode,
  demoVehicles,
  demoLeads,
  demoScheduledContent,
  demoViewings,
} from "@/lib/demo";
import { can } from "@/lib/types";
import { ContentCalendar, type CalendarItem } from "./content-calendar";

interface Viewing {
  id: string;
  lead_name: string;
  vehicle_label: string | null;
  scheduled_for: string;
  status: string;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtViewing(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
}

const STATUS_ORDER = [
  "bought",
  "preparation",
  "ready_for_sale",
  "reserved",
  "sold",
] as const;

const statusLabels: Record<string, string> = {
  bought: "Bought",
  preparation: "Preparation",
  ready_for_sale: "Ready",
  reserved: "Reserved",
  sold: "Sold",
};

interface Stats {
  vehicleCount: number;
  readyCount: number;
  leadCount: number;
  byStatus: Record<string, number>;
  stageCounts: { label: string; value: number }[];
}

async function getStats(dealerId: string): Promise<Stats> {
  let statuses: string[];
  let stages: string[];

  if (isDemoMode()) {
    statuses = demoVehicles.map((v) => v.status);
    stages = demoLeads.map((l) => l.stage);
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: l }] = await Promise.all([
      supabase.from("vehicles").select("status").eq("dealer_id", dealerId),
      supabase.from("leads").select("stage").eq("dealer_id", dealerId),
    ]);
    statuses = (v ?? []).map((r) => r.status);
    stages = (l ?? []).map((r) => r.stage);
  }

  const byStatus: Record<string, number> = {};
  for (const s of STATUS_ORDER) byStatus[s] = 0;
  for (const s of statuses) byStatus[s] = (byStatus[s] ?? 0) + 1;

  const openStages = ["new", "contacted", "appointment", "test_drive", "finance_applied"];
  const stageCounts = openStages.map((st) => ({
    label: st.replace("_", " "),
    value: stages.filter((s) => s === st).length,
  }));

  return {
    vehicleCount: statuses.length,
    readyCount: byStatus["ready_for_sale"] ?? 0,
    leadCount: stages.filter((s) => openStages.includes(s)).length,
    byStatus,
    stageCounts,
  };
}

function Donut({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? value / total : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 130 130" className="h-36 w-36 -rotate-90">
      <defs>
        <linearGradient id="donut" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(148,173,210,0.12)" strokeWidth="12" />
      <circle
        cx="65"
        cy="65"
        r={r}
        fill="none"
        stroke="url(#donut)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const stats = await getStats(session.dealer.id);
  const canSeeViewings = can.viewCustomerData(session.role);

  // Content calendar items + upcoming viewings (mini) — the command-center data.
  let content: CalendarItem[] = [];
  let viewings: Viewing[] = [];
  if (isDemoMode()) {
    content = demoScheduledContent.map((c) => ({
      id: c.id,
      channel: c.channel,
      kind: c.kind,
      status: c.status,
      scheduled_for: c.scheduled_for,
    }));
    if (canSeeViewings) viewings = demoViewings;
  } else {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const [{ data: c }, { data: vw }] = await Promise.all([
      supabase
        .from("scheduled_content")
        .select("id, channel, kind, status, scheduled_for")
        .eq("dealer_id", session.dealer.id),
      canSeeViewings
        ? supabase
            .from("viewings")
            .select("id, lead_name, vehicle_label, scheduled_for, status")
            .eq("dealer_id", session.dealer.id)
            .gte("scheduled_for", nowIso)
            .order("scheduled_for", { ascending: true })
            .limit(5)
        : Promise.resolve({ data: [] as Viewing[] }),
    ]);
    content = (c ?? []) as CalendarItem[];
    viewings = (vw ?? []) as Viewing[];
  }

  const plannedCount = content.filter((c) => c.status === "draft" || c.status === "scheduled").length;

  const readyPct =
    stats.vehicleCount > 0 ? Math.round((stats.readyCount / stats.vehicleCount) * 100) : 0;
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));
  const maxStage = Math.max(1, ...stats.stageCounts.map((s) => s.value));

  const kpis = [
    { label: "Vehicles in stock", value: stats.vehicleCount, icon: InventoryIcon },
    { label: "Ready for sale", value: stats.readyCount, icon: ReadyIcon },
    { label: "Open leads", value: stats.leadCount, icon: LeadsIcon },
    { label: "Posts planned", value: plannedCount, icon: SparkIcon },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          Studio overview
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">{session.dealer.name} at a glance.</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }, i) => (
          <div
            key={label}
            className="studio-surface studio-interactive studio-edge animate-rise overflow-hidden p-5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
              </div>
              <span className="studio-tile h-11 w-11">
                <Icon size={20} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Content calendar (hero) + upcoming viewings */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ContentCalendar items={content} />

        {canSeeViewings ? (
          <div className="studio-surface animate-rise p-6" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-200">Upcoming viewings</h2>
              <Link
                href="/leads"
                className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300 transition hover:bg-sky-500/20"
              >
                + New
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {viewings.length === 0 && (
                <p className="text-sm text-slate-500">No viewings booked yet.</p>
              )}
              {viewings.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-center">
                    <LeadsIcon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{v.lead_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {v.vehicle_label ?? "Car TBC"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {fmtViewing(v.scheduled_for)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Link
            href="/marketing"
            className="studio-surface studio-interactive studio-edge animate-rise relative flex flex-col justify-between overflow-hidden p-6"
            style={{ animationDelay: "160ms" }}
          >
            <span className="studio-tile h-11 w-11">
              <SparkIcon size={20} />
            </span>
            <div className="mt-6">
              <h2 className="font-medium text-slate-100">Open the Marketing Studio</h2>
              <p className="mt-1 text-sm text-slate-400">
                Turn your stock into branded, ready-to-publish ads and photos.
              </p>
            </div>
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Inventory by status */}
        <div className="studio-surface animate-rise p-6" style={{ animationDelay: "200ms" }}>
          <h2 className="text-sm font-medium text-slate-200">Inventory by status</h2>
          <div className="mt-5 space-y-3.5">
            {STATUS_ORDER.map((s) => {
              const val = stats.byStatus[s] ?? 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-slate-400">{statusLabels[s]}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500"
                      style={{
                        width: `${(val / maxStatus) * 100}%`,
                        transition: "width 700ms cubic-bezier(0.22,1,0.36,1)",
                      }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs tabular-nums text-slate-300">{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stock readiness donut */}
        <div
          className="studio-surface animate-rise flex flex-col items-center justify-center p-6"
          style={{ animationDelay: "240ms" }}
        >
          <h2 className="self-start text-sm font-medium text-slate-200">Stock readiness</h2>
          <div className="relative mt-3 grid place-items-center">
            <Donut value={stats.readyCount} total={stats.vehicleCount} />
            <div className="absolute text-center">
              <p className="text-3xl font-semibold tabular-nums">{readyPct}%</p>
              <p className="text-xs text-slate-400">ready</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {stats.readyCount} of {stats.vehicleCount} vehicles listed-ready
          </p>
        </div>
      </div>

      {/* Lead pipeline */}
      <div className="studio-surface animate-rise p-6" style={{ animationDelay: "280ms" }}>
        <h2 className="text-sm font-medium text-slate-200">Open lead pipeline</h2>
        <div className="mt-5 flex items-end gap-3" style={{ height: 120 }}>
          {stats.stageCounts.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-sky-500/40 to-sky-400"
                  style={{
                    height: `${(s.value / maxStage) * 100}%`,
                    minHeight: s.value > 0 ? 6 : 2,
                    transition: "height 700ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </div>
              <span className="text-[10px] capitalize text-slate-500">{s.label}</span>
              <span className="text-xs tabular-nums text-slate-300">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
