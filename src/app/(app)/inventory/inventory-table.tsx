"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { setVehicleStatus, deleteVehicle } from "./actions";

export interface VehicleRow {
  id: string;
  make: string;
  model: string;
  year: number;
  km: number;
  fuel: string;
  transmission: string;
  sale_price: number | null;
  status: string;
  registration?: string | null;
  stock_class?: string | null;
}

const statusLabels: Record<string, string> = {
  bought: "Bought",
  preparation: "Preparation",
  ready_for_sale: "Ready for Sale",
  reserved: "Reserved",
  sold: "Sold",
};

const STATUS_TABS = [
  ["all", "All"],
  ["in_stock", "In stock"],
  ["bought", "Bought"],
  ["preparation", "Preparation"],
  ["ready_for_sale", "Ready for sale"],
  ["reserved", "Reserved"],
  ["sold", "Sold"],
] as const;

const UNDO_MS = 6000;

type Action = "sold" | "delete";

// A change is applied optimistically and only committed to the DB after the
// undo window closes, so "Undo" is a plain cancel — no re-insert gymnastics.
interface Pending {
  action: Action;
  row: VehicleRow;
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

export function InventoryTable({
  vehicles,
  canManage,
}: {
  vehicles: VehicleRow[];
  canManage: boolean;
}) {
  const [rows, setRows] = useState<VehicleRow[]>(vehicles);
  const [confirming, setConfirming] = useState<{ id: string; action: Action } | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [toast, setToast] = useState<{ label: string } | null>(null);
  const [query, setQuery] = useState("");
  const [statusTab, setStatusTab] = useState<string>("all");
  const [stockTab, setStockTab] = useState<string>("all");

  const total = rows.length;
  const inStockCount = rows.filter((r) => r.status !== "sold").length;
  const soldCount = rows.filter((r) => r.status === "sold").length;
  const mainCount = rows.filter((r) => (r.stock_class ?? "main") === "main").length;
  const tradeCount = rows.filter((r) => r.stock_class === "trade").length;

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    const statusOk =
      statusTab === "all" ? true : statusTab === "in_stock" ? r.status !== "sold" : r.status === statusTab;
    if (!statusOk) return false;
    const stockOk = stockTab === "all" ? true : (r.stock_class ?? "main") === stockTab;
    if (!stockOk) return false;
    if (!q) return true;
    return [r.make, r.model, r.registration ?? "", String(r.year)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const commit = (p: Pending) => {
    if (p.action === "delete") void deleteVehicle(p.row.id);
    else void setVehicleStatus(p.row.id, "sold");
  };

  // Flush any pending change (e.g. before starting another, or on unmount).
  const flush = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    commit(p);
    pendingRef.current = null;
    setToast(null);
  };

  useEffect(() => flush, []); // commit on unmount so changes aren't lost

  function start(action: Action, row: VehicleRow) {
    flush();
    setConfirming(null);
    const index = rows.findIndex((r) => r.id === row.id);

    setRows((prev) =>
      action === "delete"
        ? prev.filter((r) => r.id !== row.id)
        : prev.map((r) => (r.id === row.id ? { ...r, status: "sold" } : r))
    );

    const timer = setTimeout(() => {
      commit(pendingRef.current!);
      pendingRef.current = null;
      setToast(null);
    }, UNDO_MS);

    pendingRef.current = { action, row, index, timer };
    setToast({ label: action === "delete" ? "Vehicle deleted" : "Marked as sold" });
  }

  function undo() {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    setRows((prev) => {
      if (p.action === "delete") {
        const next = [...prev];
        next.splice(Math.min(p.index, next.length), 0, p.row);
        return next;
      }
      return prev.map((r) => (r.id === p.row.id ? p.row : r));
    });
    pendingRef.current = null;
    setToast(null);
  }

  return (
    <>
      {/* Search + status filters */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by reg, make, model or year…"
              className="studio-input w-full pl-9"
              autoComplete="off"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Total <b className="text-slate-200">{total}</b></span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1">In stock <b className="text-emerald-300">{inStockCount}</b></span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Sold <b className="text-slate-200">{soldCount}</b></span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusTab(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                statusTab === v
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-[0_8px_20px_-10px_var(--glow)]"
                  : "border border-white/10 text-slate-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          {([["all", `All stock`], ["main", `Main ${mainCount}`], ["trade", `Trade ${tradeCount}`]] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStockTab(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                stockTab === v
                  ? "bg-white/10 text-white"
                  : "border border-white/10 text-slate-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="studio-surface mt-4 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium">Reg</th>
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium">KM</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => (
              <tr key={v.id} className="border-t border-white/5 transition-colors hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/${v.id}`}
                    className="text-slate-100 hover:text-sky-400 hover:underline"
                  >
                    {v.make} {v.model}
                  </Link>
                  {v.stock_class === "trade" && (
                    <span className="ml-2 rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-300">Trade</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {v.registration ? (
                    <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-xs tracking-wider text-slate-200">{v.registration}</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{v.year}</td>
                <td className="px-4 py-3">{v.km.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {v.sale_price ? `€${Number(v.sale_price).toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">
                    {statusLabels[v.status] ?? v.status}
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    {confirming?.id === v.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {confirming.action === "delete" ? "Delete?" : "Mark sold?"}
                        </span>
                        <button
                          onClick={() => start(confirming.action, v)}
                          className="rounded bg-sky-500 px-2 py-1 text-xs font-medium text-white hover:bg-sky-400"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-3">
                        {v.status !== "sold" && (
                          <button
                            onClick={() => setConfirming({ id: v.id, action: "sold" })}
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                          >
                            Mark sold
                          </button>
                        )}
                        <button
                          onClick={() => setConfirming({ id: v.id, action: "delete" })}
                          className="text-xs text-slate-500 hover:text-red-400"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 7 : 6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {rows.length === 0 ? (
                    <>
                      No vehicles yet.{" "}
                      {canManage && (
                        <Link href="/inventory/new" className="text-sky-400 hover:underline">
                          Add your first vehicle
                        </Link>
                      )}
                    </>
                  ) : (
                    "No vehicles match your search."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="studio-surface animate-rise fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 px-4 py-2 text-sm">
          <span className="text-slate-200">{toast.label}</span>
          <button onClick={undo} className="font-medium text-sky-400 hover:text-sky-300">
            Undo
          </button>
        </div>
      )}
    </>
  );
}
