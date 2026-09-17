"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money } from "@/lib/currency";

export interface PurchaseRow {
  id: string;
  po_no: string;
  vendor: string;
  car: string;
  status: string;
  total: number;
  paid: number;
  outstanding: number;
}

const STATUS_STYLE: Record<string, string> = {
  to_be_paid: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  approved: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  paid: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  cancelled: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};
const STATUS_LABEL: Record<string, string> = {
  to_be_paid: "To be paid", approved: "Approved", paid: "Paid", cancelled: "Cancelled",
};
const TABS = [["all", "All"], ["to_be_paid", "To be paid"], ["approved", "Approved"], ["paid", "Paid"]] as const;

export function PurchasesList({ rows }: { rows: PurchaseRow[] }) {
  const [tab, setTab] = useState("all");
  const visible = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.status === tab)), [rows, tab]);
  const outstanding = rows.filter((r) => r.status !== "cancelled").reduce((a, r) => a + r.outstanding, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Purchases</h1>
        </div>
        <Link href="/business/purchases/new" className="btn-gradient text-sm">+ New purchase</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {TABS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`rounded-full px-3 py-1.5 font-medium transition ${tab === v ? "bg-gradient-to-r from-sky-500 to-sky-600 text-white" : "border border-white/10 text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}
          >
            {l}
          </button>
        ))}
        <span className="ml-auto rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-slate-400">Outstanding <b className="text-amber-300 tabular-nums">{money(outstanding, "EUR")}</b></span>
      </div>

      <div className="studio-surface overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">PO</th>
              <th className="px-3 py-2.5">Vendor</th>
              <th className="px-3 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5 text-right">Paid</th>
              <th className="px-3 py-2.5 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2"><Link href={`/business/purchases/${r.id}`} className="font-mono text-sky-400 hover:text-sky-300">{r.po_no}</Link></td>
                <td className="px-3 py-2 text-slate-200">{r.vendor}</td>
                <td className="px-3 py-2 text-slate-400">{r.car}</td>
                <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(r.total, "EUR")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(r.paid, "EUR")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">{money(r.outstanding, "EUR")}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">No purchases. Record one with “New purchase”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
