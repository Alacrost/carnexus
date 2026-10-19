"use client";

import Link from "next/link";
import { useState } from "react";
import { EntityLink, vehicleReference } from "@/components/entity-link";

export interface VehicleRow {
  id: string;
  vehicle_no?: number | null;
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
  originating_po_id?: string | null;
  provenance_status?: "verified" | "legacy_unresolved";
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

export function InventoryTable({
  vehicles,
}: {
  vehicles: VehicleRow[];
  canManage: boolean;
}) {
  const rows = vehicles;
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

  return (
    <>
      {/* Search + status filters */}
      <div id="stock-search" className="mt-6 space-y-3">
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
              <th className="px-4 py-3 font-medium">Origin</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => (
              <tr key={v.id} className="border-t border-white/5 transition-colors hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <EntityLink kind="vehicle" id={v.id} reference={vehicleReference(v.vehicle_no)} href={`/inventory/${v.id}`} />
                  <span className="ml-2 text-slate-100">{v.make} {v.model}</span>
                  {v.stock_class === "trade" && (
                    <span className="ml-2 rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-300">Trade</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {v.registration ? (
                    <span className="font-mono text-xs font-semibold tracking-wider text-slate-700">{v.registration}</span>
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
                <td className="px-4 py-3">{v.provenance_status === "verified" && v.originating_po_id ? <Link href={`/business/purchases/${v.originating_po_id}`} className="text-xs text-emerald-300 hover:underline">Verified PO</Link> : <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-200">Legacy review</span>}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {rows.length === 0 ? (
                    <>
                      No vehicles yet.{" "}
                      <Link href="/business/purchases/new" className="text-sky-400 hover:underline">Create the first purchase order</Link>
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

    </>
  );
}
