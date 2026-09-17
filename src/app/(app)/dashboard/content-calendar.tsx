"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface CalendarItem {
  id: string;
  channel: string;
  kind: string;
  status: string;
  scheduled_for: string | null;
}

const STATUS_DOT: Record<string, string> = {
  draft: "bg-slate-400",
  scheduled: "bg-sky-400",
  posted: "bg-emerald-400",
  late: "bg-amber-400",
  cancelled: "bg-rose-400",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
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

export function ContentCalendar({ items }: { items: CalendarItem[] }) {
  const [view, setView] = useState<"week" | "month">("month");
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const todayISO = toISO(new Date());

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (!it.scheduled_for) continue;
      const arr = m.get(it.scheduled_for) ?? [];
      arr.push(it);
      m.set(it.scheduled_for, arr);
    }
    return m;
  }, [items]);

  // Days shown: month = 6-week grid from the Monday before the 1st; week = current week.
  const days = useMemo(() => {
    if (view === "week") {
      const start = mondayOf(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  // Status overview for the visible range.
  const overview = useMemo(() => {
    const set = new Set(days.map(toISO));
    const counts: Record<string, number> = { planned: 0, posted: 0, late: 0, cancelled: 0 };
    for (const it of items) {
      if (!it.scheduled_for || !set.has(it.scheduled_for)) continue;
      if (it.status === "draft" || it.status === "scheduled") counts.planned++;
      else if (it.status in counts) counts[it.status]++;
    }
    return counts;
  }, [days, items]);

  const label =
    view === "week"
      ? `${MONTHS[days[0].getMonth()].slice(0, 3)} ${days[0].getDate()} – ${MONTHS[days[6].getMonth()].slice(0, 3)} ${days[6].getDate()}`
      : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  function step(dir: number) {
    if (view === "week") setCursor((c) => addDays(mondayOf(c), dir * 7));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  }

  return (
    <div className="studio-surface animate-rise p-6" style={{ animationDelay: "120ms" }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-slate-200">Content calendar</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 capitalize transition ${view === v ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-300 hover:bg-white/10">←</button>
          <button type="button" onClick={() => { const t = new Date(); t.setHours(0,0,0,0); setCursor(t); }} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">Today</button>
          <button type="button" onClick={() => step(1)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-300 hover:bg-white/10">→</button>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-400">{label}</p>

      {/* Status overview */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> {overview.planned} planned</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> {overview.posted} posted</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> {overview.late} late</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> {overview.cancelled} cancelled</span>
      </div>

      {/* Weekday header */}
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wider text-slate-500">
        {DAY_NAMES.map((d) => <span key={d}>{d}</span>)}
      </div>

      {/* Day grid */}
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const iso = toISO(d);
          const dayItems = byDay.get(iso) ?? [];
          const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
          const isToday = iso === todayISO;
          return (
            <Link
              key={iso}
              href="/marketing/social"
              title={`${dayItems.length} planned — open the Social Media Studio`}
              className={`group flex ${view === "week" ? "min-h-[92px]" : "min-h-[62px]"} flex-col rounded-lg border p-1.5 transition ${
                inMonth ? "border-white/10 bg-white/[0.02] hover:border-sky-400/40 hover:bg-white/[0.05]" : "border-transparent bg-transparent opacity-40"
              }`}
            >
              <span className={`text-[11px] ${isToday ? "grid h-5 w-5 place-items-center rounded-full bg-sky-500 font-medium text-white" : "text-slate-400"}`}>
                {d.getDate()}
              </span>
              <div className="mt-1 flex flex-1 flex-wrap content-start gap-1">
                {dayItems.slice(0, view === "week" ? 6 : 4).map((it) => (
                  <span key={it.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[it.status] ?? "bg-slate-400"}`} title={`${it.channel} · ${it.kind} · ${it.status}`} />
                ))}
                {dayItems.length > (view === "week" ? 6 : 4) && (
                  <span className="text-[9px] text-slate-500">+{dayItems.length - (view === "week" ? 6 : 4)}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <Link href="/marketing/social" className="mt-4 inline-block text-xs text-sky-400 hover:text-sky-300">
        Plan &amp; create content →
      </Link>
    </div>
  );
}
