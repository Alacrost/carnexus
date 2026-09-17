"use client";

import { useMemo, useState, useTransition } from "react";
import { StudioShell, StudioProperties } from "@/components/studio-shell";
import { MarketingIcon, WriteIcon, SparkIcon } from "@/components/icons";
import {
  draftSocialPost,
  saveScheduledContent,
  setContentStatus,
  deleteScheduledContent,
} from "./actions";

export interface SocialVehicleOpt {
  id: string;
  label: string;
}
export interface SocialPromoOpt {
  id: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
}
export interface ScheduledItem {
  id: string;
  channel: string;
  kind: string;
  status: string;
  scheduled_for: string | null;
  body: string;
  hashtags: string | null;
  vehicle_id: string | null;
  promotion_id: string | null;
}

const KIND_LABELS: Record<string, string> = {
  tip: "Tip",
  info: "Info",
  car_of_week: "Car of the week",
  promo: "Promotion",
  custom: "Custom",
};
const STATUS_STYLES: Record<string, string> = {
  draft: "border-white/15 bg-white/5 text-slate-300",
  scheduled: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  posted: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  late: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  cancelled: "border-rose-400/30 bg-rose-500/10 text-rose-300 line-through",
};

function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

// --- date helpers ---
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const tools = [
  { key: "calendar", label: "Calendar", icon: CalendarIcon },
  { key: "create", label: "Create", icon: WriteIcon },
];

export function SocialStudio({
  vehicles,
  promotions,
  initialItems,
  demo,
}: {
  vehicles: SocialVehicleOpt[];
  promotions: SocialPromoOpt[];
  initialItems: ScheduledItem[];
  demo: boolean;
}) {
  const [activeTool, setActiveTool] = useState("calendar");
  const [items, setItems] = useState<ScheduledItem[]>(initialItems);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  // Create form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channel, setChannel] = useState<"facebook" | "instagram">("facebook");
  const [kind, setKind] = useState<"tip" | "info" | "car_of_week" | "promo" | "custom">("tip");
  const [vehicleId, setVehicleId] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const [topic, setTopic] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [body, setBody] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [generator, setGenerator] = useState<"openai" | "mock" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();
  const [planning, startPlan] = useTransition();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  function itemsOn(iso: string) {
    return items.filter((it) => it.scheduled_for === iso);
  }
  function promosOn(iso: string) {
    return promotions.filter(
      (p) => p.starts_on && p.ends_on && p.starts_on <= iso && iso <= p.ends_on
    );
  }

  function resetForm() {
    setEditingId(null);
    setChannel("facebook");
    setKind("tip");
    setVehicleId("");
    setPromotionId("");
    setTopic("");
    setBody("");
    setHashtags("");
    setGenerator(null);
    setError("");
  }

  function newPost(iso?: string) {
    resetForm();
    setScheduledFor(iso ?? "");
    setActiveTool("create");
  }

  function editItem(it: ScheduledItem) {
    setEditingId(it.id);
    setChannel(it.channel as "facebook" | "instagram");
    setKind(it.kind as typeof kind);
    setVehicleId(it.vehicle_id ?? "");
    setPromotionId(it.promotion_id ?? "");
    setScheduledFor(it.scheduled_for ?? "");
    setBody(it.body ?? "");
    setHashtags(it.hashtags ?? "");
    setGenerator(null);
    setError("");
    setActiveTool("create");
  }

  function generate() {
    setError("");
    startGenerate(async () => {
      const res = await draftSocialPost({
        channel,
        kind,
        vehicleId: vehicleId || undefined,
        promotionId: promotionId || undefined,
        topic: topic || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody(res.body);
      setHashtags(res.hashtags);
      setGenerator(res.generator);
    });
  }

  function persist(status: "draft" | "scheduled") {
    setError("");
    startSave(async () => {
      const res = await saveScheduledContent({
        id: editingId ?? undefined,
        channel,
        kind,
        scheduledFor: scheduledFor || null,
        body,
        hashtags,
        vehicleId: vehicleId || null,
        promotionId: promotionId || null,
        status,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Could not save.");
        return;
      }
      const saved: ScheduledItem = {
        id: res.id,
        channel,
        kind,
        status,
        scheduled_for: scheduledFor || null,
        body,
        hashtags,
        vehicle_id: vehicleId || null,
        promotion_id: promotionId || null,
      };
      setItems((prev) => {
        const without = prev.filter((p) => p.id !== res.id);
        return [...without, saved];
      });
      setNote(status === "scheduled" ? "Scheduled as a draft — nothing is published." : "Saved to drafts.");
      setActiveTool("calendar");
      resetForm();
    });
  }

  function changeStatus(id: string, status: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    setContentStatus(id, status);
  }
  function remove(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    deleteScheduledContent(id);
  }

  // Recommend a mix across the week, generate each, and save as drafts.
  function planWeek() {
    setNote("");
    startPlan(async () => {
      const plan: {
        offset: number;
        channel: "facebook" | "instagram";
        kind: typeof kind;
        vehicleId?: string;
        promotionId?: string;
      }[] = [
        { offset: 0, channel: "facebook", kind: "tip" },
        { offset: 2, channel: "instagram", kind: "car_of_week", vehicleId: vehicles[0]?.id },
        promotions[0]
          ? { offset: 4, channel: "facebook", kind: "promo", promotionId: promotions[0].id }
          : { offset: 4, channel: "instagram", kind: "car_of_week", vehicleId: vehicles[1]?.id },
      ];
      const created: ScheduledItem[] = [];
      for (const p of plan) {
        const iso = toISO(addDays(weekStart, p.offset));
        const draft = await draftSocialPost({
          channel: p.channel,
          kind: p.kind,
          vehicleId: p.vehicleId,
          promotionId: p.promotionId,
        });
        const res = await saveScheduledContent({
          channel: p.channel,
          kind: p.kind,
          scheduledFor: iso,
          body: draft.body,
          hashtags: draft.hashtags,
          vehicleId: p.vehicleId ?? null,
          promotionId: p.promotionId ?? null,
          status: "draft",
        });
        if (res.id) {
          created.push({
            id: res.id,
            channel: p.channel,
            kind: p.kind,
            status: "draft",
            scheduled_for: iso,
            body: draft.body,
            hashtags: draft.hashtags,
            vehicle_id: p.vehicleId ?? null,
            promotion_id: p.promotionId ?? null,
          });
        }
      }
      setItems((prev) => [...prev, ...created]);
      setNote(`Planned ${created.length} posts this week — open any to review & edit.`);
    });
  }

  const selectCls = "mt-1 studio-input";

  // ---- properties (right panel) ----
  const properties =
    activeTool === "create" ? (
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-slate-300">Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as "facebook" | "instagram")} className={selectCls}>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-300">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={selectCls}>
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>

        {kind === "car_of_week" && (
          <label className="block">
            <span className="text-slate-300">Vehicle</span>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={selectCls}>
              <option value="">Pick a car</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </label>
        )}
        {kind === "promo" && (
          <label className="block">
            <span className="text-slate-300">Promotion</span>
            <select value={promotionId} onChange={(e) => setPromotionId(e.target.value)} className={selectCls}>
              <option value="">Pick a promotion</option>
              {promotions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        )}
        {(kind === "custom" || kind === "tip") && (
          <label className="block">
            <span className="text-slate-300">Topic <span className="text-slate-500">(optional)</span></span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. winter tyre check" className={selectCls} />
          </label>
        )}

        <label className="block">
          <span className="text-slate-300">Date <span className="text-slate-500">(optional)</span></span>
          <input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={selectCls} />
        </label>

        <button type="button" onClick={generate} disabled={generating} className="btn-gradient w-full disabled:opacity-50">
          {generating ? "Writing…" : body ? "Regenerate" : "Generate post"}
        </button>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    ) : (
      // calendar properties
      <div className="space-y-4 text-sm">
        <button type="button" onClick={planWeek} disabled={planning} className="btn-gradient w-full disabled:opacity-50">
          {planning ? "Planning…" : "Plan my week"}
        </button>
        <p className="text-xs text-slate-500">
          Suggests a mix (tip · car of the week · promo), writes each post and drops them
          in as drafts. Nothing is published — review and edit before posting.
        </p>
        {note && <p className="text-xs text-emerald-400">{note}</p>}
        <div className="border-t border-white/5 pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(STATUS_STYLES).map((s) => (
              <span key={s} className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${STATUS_STYLES[s]}`}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    );

  return (
    <StudioShell
      title="Social Media Studio"
      subtitle="Plan your week and generate ready-to-post Facebook & Instagram content."
      backHref="/marketing"
      icon={MarketingIcon}
      tools={tools}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      rightActions={
        activeTool === "create" ? (
          <>
            {generator && body && (
              <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 sm:inline-flex">
                <SparkIcon size={13} />
                {generator === "openai" ? "Drafted by AI" : "Template engine"}
              </span>
            )}
            <button type="button" onClick={() => persist("draft")} disabled={!body || saving} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-40">
              Save draft
            </button>
            <button type="button" onClick={() => persist("scheduled")} disabled={!body || !scheduledFor || saving} className="btn-gradient disabled:opacity-50">
              {saving ? "Saving…" : "Schedule"}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => newPost()} className="btn-gradient">
            + New post
          </button>
        )
      }
    >
      {/* Workspace */}
      {activeTool === "create" ? (
        <div className="min-w-0 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.05),transparent_60%)] p-4 lg:p-8">
          {body ? (
            <div className="mx-auto max-w-2xl">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs capitalize text-slate-300">{channel}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-400">{KIND_LABELS[kind]}</span>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="studio-input leading-relaxed" />
              <label className="mt-3 block text-xs uppercase tracking-wider text-slate-500">Hashtags</label>
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#usedcars #irishmotoring" className="studio-input mt-1" />
            </div>
          ) : (
            <div className="grid h-full min-h-[50vh] place-items-center text-center">
              <div className="max-w-sm">
                <span className="studio-tile mx-auto grid h-14 w-14 place-items-center rounded-xl text-sky-300"><WriteIcon size={26} /></span>
                <h2 className="mt-4 text-lg font-semibold text-slate-100">Create a post</h2>
                <p className="mt-1 text-sm text-slate-400">Pick a channel and type on the right, then generate. Everything stays editable before you save.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="min-w-0 overflow-y-auto p-4 lg:p-6">
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-slate-300 hover:bg-white/10">←</button>
            <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 hover:bg-white/10">This week</button>
            <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-slate-300 hover:bg-white/10">→</button>
            <span className="ml-2 text-sm text-slate-400">
              {fmtShort(weekDays[0])} – {fmtShort(weekDays[6])}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
            {weekDays.map((d, i) => {
              const iso = toISO(d);
              const dayItems = itemsOn(iso);
              const dayPromos = promosOn(iso);
              return (
                <div key={iso} className="min-h-[140px] rounded-xl border border-white/10 bg-white/[0.02] p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">{DAY_NAMES[i]} {d.getDate()}</span>
                    <button type="button" onClick={() => newPost(iso)} title="Add post" className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-white/10 hover:text-white">+</button>
                  </div>
                  {dayPromos.map((p) => (
                    <div key={p.id} className="mb-1 truncate rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200" title={p.title}>★ {p.title}</div>
                  ))}
                  <div className="space-y-1">
                    {dayItems.map((it) => (
                      <button key={it.id} type="button" onClick={() => editItem(it)} className={`block w-full truncate rounded border px-1.5 py-1 text-left text-[11px] ${STATUS_STYLES[it.status]}`} title={it.body}>
                        <span className="capitalize">{it.channel[0]}</span> · {KIND_LABELS[it.kind]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming list with quick status actions */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-100">This week&apos;s posts</h2>
            {weekDays.flatMap((d) => itemsOn(toISO(d))).length === 0 && (
              <p className="mt-2 text-sm text-slate-500">Nothing planned yet — hit “Plan my week”.</p>
            )}
            <div className="mt-2 space-y-2">
              {weekDays.flatMap((d) => itemsOn(toISO(d))).map((it) => (
                <div key={it.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${STATUS_STYLES[it.status]}`}>{it.status}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">
                    <span className="capitalize text-slate-400">{it.channel}</span> · {KIND_LABELS[it.kind]} — {it.body}
                  </span>
                  <button type="button" onClick={() => editItem(it)} className="text-xs text-sky-400 hover:text-sky-300">Edit</button>
                  {it.status !== "posted" && (
                    <button type="button" onClick={() => changeStatus(it.id, "posted")} className="text-xs text-emerald-400 hover:text-emerald-300">Mark posted</button>
                  )}
                  {!demo && (
                    <button type="button" onClick={() => remove(it.id)} className="text-xs text-slate-500 hover:text-rose-400">Delete</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <StudioProperties>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            {activeTool === "create" ? (editingId ? "Edit post" : "New post") : "Weekly plan"}
          </h2>
        </div>
        {properties}
      </StudioProperties>
    </StudioShell>
  );
}
