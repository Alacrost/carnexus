"use client";

import { useMemo, useState, useTransition } from "react";
import { LeadsIcon, InventoryIcon } from "@/components/icons";
import {
  createViewing,
  setViewingStatus,
  deleteViewing,
  type ViewingRow,
} from "./actions";

export interface VehicleOpt {
  id: string;
  label: string;
}

export interface StaffMember {
  name: string;
  role: string;
}

const STATUS_STYLES: Record<string, string> = {
  booked: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  done: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  no_show: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  cancelled: "border-rose-400/30 bg-rose-500/10 text-rose-300 line-through",
};
const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  done: "Done",
  no_show: "No-show",
  cancelled: "Cancelled",
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300">
      {n}
    </span>
  );
}

export function ViewingsManager({
  vehicles,
  staff,
  initialViewings,
  demo,
}: {
  vehicles: VehicleOpt[];
  staff: StaffMember[];
  initialViewings: ViewingRow[];
  demo: boolean;
}) {
  const [viewings, setViewings] = useState<ViewingRow[]>(initialViewings);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  // Booking form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [carChoice, setCarChoice] = useState(""); // "" | vehicleId | "__manual__"
  const [carManual, setCarManual] = useState("");
  const [respChoice, setRespChoice] = useState(""); // "" | staff name | "__manual__"
  const [respManual, setRespManual] = useState("");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [savedTick, setSavedTick] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const byDay = useMemo(() => {
    const m = new Map<string, ViewingRow[]>();
    for (const v of viewings) {
      const k = dayKey(new Date(v.scheduled_for));
      const arr = m.get(k) ?? [];
      arr.push(v);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    return m;
  }, [viewings]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return viewings
      .filter((v) => new Date(v.scheduled_for).getTime() >= now - 3600_000 && v.status !== "cancelled")
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
      .slice(0, 8);
  }, [viewings]);

  // Warn when the chosen car already has a (non-cancelled) viewing booked.
  const carConflict = useMemo(() => {
    if (!carChoice || carChoice === "__manual__") return null;
    return (
      viewings
        .filter((v) => v.vehicle_id === carChoice && v.status !== "cancelled")
        .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0] ?? null
    );
  }, [carChoice, viewings]);

  function resetForm() {
    setName("");
    setPhone("");
    setCarChoice("");
    setCarManual("");
    setRespChoice("");
    setRespManual("");
    setWhen("");
    setNotes("");
  }

  function book() {
    setError("");
    setSavedTick(false);
    const vehicleId = carChoice && carChoice !== "__manual__" ? carChoice : undefined;
    const vehicleLabel =
      carChoice === "__manual__"
        ? carManual.trim() || undefined
        : vehicles.find((v) => v.id === carChoice)?.label;
    const responsible = respChoice === "__manual__" ? respManual.trim() : respChoice;

    startSave(async () => {
      const res = await createViewing({
        lead_name: name,
        phone: phone || undefined,
        vehicleId,
        vehicleLabel,
        scheduledFor: when,
        responsible,
        notes: notes || undefined,
      });
      if (res.error || !res.viewing) {
        setError(res.error ?? "Could not book the viewing.");
        return;
      }
      setViewings((prev) => [...prev, res.viewing!]);
      resetForm();
      setSavedTick(true);
      setOpen(false);
    });
  }

  function changeStatus(id: string, status: string) {
    setViewings((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)));
    setViewingStatus(id, status);
  }
  function remove(id: string) {
    setViewings((prev) => prev.filter((v) => v.id !== id));
    deleteViewing(id);
  }

  const canBook =
    name.trim().length >= 2 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) &&
    (respChoice === "__manual__" ? respManual.trim().length >= 2 : respChoice.trim().length >= 2);
  const weekLabel = `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}`;

  return (
    <>
      {/* Big separate action — opens the booking popup */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setError("");
            setSavedTick(false);
            setOpen(true);
          }}
          className="btn-gradient flex items-center justify-center gap-2 px-8 py-3 text-base"
        >
          <LeadsIcon size={18} /> Book a viewing
        </button>
        {savedTick && <span className="text-sm text-emerald-400">Viewing booked ✓</span>}
      </div>

      {/* Calendar + upcoming */}
      <div className="mt-4 space-y-4">
        <div className="studio-surface p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-slate-200">Viewings this week</h2>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-300 hover:bg-white/10">←</button>
              <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">This week</button>
              <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-300 hover:bg-white/10">→</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">{weekLabel}</p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-7">
            {weekDays.map((d, i) => {
              const dayViewings = byDay.get(dayKey(d)) ?? [];
              return (
                <div key={dayKey(d)} className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.02] p-2">
                  <p className="mb-2 text-xs font-medium text-slate-300">{DAY_NAMES[i]} {d.getDate()}</p>
                  <div className="space-y-1">
                    {dayViewings.map((v) => (
                      <div key={v.id} className={`rounded border px-1.5 py-1 text-[11px] ${STATUS_STYLES[v.status]}`} title={`${v.lead_name}${v.vehicle_label ? ` · ${v.vehicle_label}` : ""}${v.responsible ? ` · ${v.responsible}` : ""}`}>
                        <span className="tabular-nums">{fmtTime(new Date(v.scheduled_for))}</span> {v.lead_name}
                      </div>
                    ))}
                    {dayViewings.length === 0 && <span className="text-[11px] text-slate-600">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="studio-surface p-6">
          <h2 className="text-sm font-medium text-slate-200">Upcoming viewings</h2>
          {upcoming.length === 0 && <p className="mt-2 text-sm text-slate-500">No upcoming viewings booked.</p>}
          <div className="mt-3 space-y-2">
            {upcoming.map((v) => {
              const d = new Date(v.scheduled_for);
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5">
                    <LeadsIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-200">{v.lead_name}{v.phone ? ` · ${v.phone}` : ""}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                      <InventoryIcon size={12} /> {v.vehicle_label ?? "Car TBC"}
                      {v.responsible ? <span className="text-slate-600">· Rep: {v.responsible}</span> : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {MONTHS[d.getMonth()]} {d.getDate()}, {fmtTime(d)}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLES[v.status]}`}>{STATUS_LABELS[v.status]}</span>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {v.status === "booked" && (
                      <>
                        <button type="button" onClick={() => changeStatus(v.id, "done")} className="text-emerald-400 hover:text-emerald-300">Done</button>
                        <button type="button" onClick={() => changeStatus(v.id, "no_show")} className="text-amber-400 hover:text-amber-300">No-show</button>
                        <button type="button" onClick={() => changeStatus(v.id, "cancelled")} className="text-slate-400 hover:text-rose-400">Cancel</button>
                      </>
                    )}
                    {!demo && (
                      <button type="button" onClick={() => remove(v.id)} className="text-slate-500 hover:text-rose-400">Delete</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Booking popup */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f17] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-slate-100">Book a viewing</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-400">Four quick steps.</p>

            <div className="mt-5 space-y-5">
              {/* Step 1 — customer */}
              <div className="flex gap-3">
                <StepBadge n={1} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Who&apos;s coming in?</p>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" className="mt-2 studio-input" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="mt-2 studio-input" />
                </div>
              </div>

              {/* Step 2 — car (with conflict warning) */}
              <div className="flex gap-3">
                <StepBadge n={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Which car?</p>
                  <select value={carChoice} onChange={(e) => setCarChoice(e.target.value)} className="mt-2 studio-input">
                    <option value="">No specific car yet</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                    <option value="__manual__">Type it manually…</option>
                  </select>
                  {carChoice === "__manual__" && (
                    <input value={carManual} onChange={(e) => setCarManual(e.target.value)} placeholder="e.g. 2019 Ford Focus (from DoneDeal)" className="mt-2 studio-input" />
                  )}
                  {carConflict && (
                    <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                      ⚠ This car already has a viewing on{" "}
                      <span className="font-medium">
                        {MONTHS[new Date(carConflict.scheduled_for).getMonth()]} {new Date(carConflict.scheduled_for).getDate()}, {fmtTime(new Date(carConflict.scheduled_for))}
                      </span>
                      {carConflict.responsible ? ` · ${carConflict.responsible}` : ""}. You can still book another.
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3 — when + observation */}
              <div className="flex gap-3">
                <StepBadge n={3} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">When?</p>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-2 studio-input" />
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observation (optional) — e.g. wants a test drive, part-exchange" className="mt-2 studio-input" />
                </div>
              </div>

              {/* Step 4 — responsible salesperson */}
              <div className="flex gap-3">
                <StepBadge n={4} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Who&apos;s responsible?</p>
                  <select value={respChoice} onChange={(e) => setRespChoice(e.target.value)} className="mt-2 studio-input">
                    <option value="">Pick a salesperson</option>
                    {staff.map((s) => (
                      <option key={s.name} value={s.name}>{s.name} ({s.role})</option>
                    ))}
                    <option value="__manual__">Add manually…</option>
                  </select>
                  {respChoice === "__manual__" && (
                    <input value={respManual} onChange={(e) => setRespManual(e.target.value)} placeholder="Salesperson name (not in staff yet)" className="mt-2 studio-input" />
                  )}
                </div>
              </div>
            </div>

            <button type="button" onClick={book} disabled={!canBook || saving} className="btn-gradient mt-5 w-full disabled:opacity-50">
              {saving ? "Booking…" : "Book viewing"}
            </button>
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
