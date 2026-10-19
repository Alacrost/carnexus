"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money } from "@/lib/currency";
import { EntityLink } from "@/components/entity-link";

export interface PurchaseRow {
  id: string;
  po_no: string;
  vendor: string;
  car: string;
  vehicle_id?: string | null;
  vehicle_reference?: string | null;
  vehicle_registration?: string | null;
  status: string;
  total: number | null;
  paid: number;
  outstanding: number;
  finance_outstanding?: number;
  vendor_outstanding?: number;
  to_be_paid?: number;
  payment_state?: string;
  amount_known?: boolean;
  due_on?: string;
  finance_company?: string;
  finance_reference?: string;
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
const PAYMENT_STYLE: Record<string, string> = {
  unpaid: "text-amber-300", partially_paid: "text-sky-300", paid: "text-emerald-300", overdue: "text-rose-300", reversed: "text-slate-500", amount_pending: "text-violet-300",
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid", partially_paid: "Part paid", paid: "Paid", overdue: "Overdue", reversed: "Reversed", amount_pending: "Purchase price pending",
};
const TABS = [["all", "All"], ["lender", "Finance outstanding"], ["amount_pending", "Price pending"], ["unpaid", "Unpaid"], ["partially_paid", "Part paid"], ["overdue", "Overdue"], ["paid", "Paid"]] as const;

export function PurchasesList({ rows }: { rows: PurchaseRow[] }) {
  const [tab, setTab] = useState("all");
  const visible = useMemo(() => (tab === "all" ? rows : rows.filter((r) => tab === "lender" ? Number(r.finance_outstanding ?? 0) > 0 : r.payment_state === tab)), [rows, tab]);
  const outstanding = rows.filter((r) => r.status !== "cancelled").reduce((a, r) => a + Number(r.to_be_paid ?? r.outstanding), 0);
  const vendorOutstanding = rows.reduce((a, r) => a + Number(r.vendor_outstanding ?? 0), 0);
  const lenderOutstanding = rows.reduce((a, r) => a + Number(r.finance_outstanding ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Purchases</h1>
        </div>
        <Link href="/business/purchases/new" className="btn-gradient text-sm">+ New purchase</Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {TABS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`rounded-[3px] border px-3 py-1.5 font-medium transition-colors ${tab === v ? "border-[#1c1c1e] bg-[#1c1c1e] text-white" : "border-black/[0.10] bg-white text-slate-400 hover:border-black/[0.22] hover:bg-black/[0.035] hover:text-slate-100"}`}
          >
            {l}
          </button>
        ))}
        <span className="ml-auto rounded-[3px] border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-slate-400">To be paid <b className="text-amber-300 tabular-nums">{money(outstanding, "EUR")}</b></span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Balance label="Total to be paid" value={outstanding} accent="text-amber-300" />
        <Balance label="Due to vendors" value={vendorOutstanding} />
        <Balance label="Due to lenders" value={lenderOutstanding} accent="text-sky-300" />
      </div>

      <section className="studio-surface p-4"><h2 className="font-semibold">Lender settlements outstanding</h2><p className="mt-1 text-xs text-slate-400">Separate from customer finance payouts. These are debts the dealer must settle on purchased stock and trade-ins.</p>{rows.filter(r=>Number(r.finance_outstanding??0)>0).map(r=><div key={r.id} className="mt-3 border-t border-white/10 pt-3 text-sm"><EntityLink kind="po" id={r.id} reference={r.po_no} href={`/business/purchases/${r.id}`} />{r.vehicle_id&&<EntityLink kind="vehicle" id={r.vehicle_id} reference={r.vehicle_reference} href={`/inventory/${r.vehicle_id}`} className="ml-2"/>}<span className="ml-2">{r.car}</span>{r.vehicle_registration&&<span className="ml-2 font-mono font-semibold text-slate-700">Plate {r.vehicle_registration}</span>}<br/>{r.finance_company} · {r.finance_reference} · {money(Number(r.finance_outstanding),"EUR")} · Due {r.due_on??"not set"}</div>)}</section>
      <div className="studio-surface overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">PO</th>
              <th className="px-3 py-2.5">Vendor</th>
              <th className="px-3 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5">Plate</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5 text-right">Vendor due</th>
              <th className="px-3 py-2.5 text-right">Lender due</th>
              <th className="px-3 py-2.5 text-right">To be paid</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2"><EntityLink kind="po" id={r.id} reference={r.po_no} href={`/business/purchases/${r.id}`} /></td>
                <td className="px-3 py-2 text-slate-200">{r.vendor}</td>
                <td className="px-3 py-2 text-slate-400">{r.vehicle_id&&<EntityLink kind="vehicle" id={r.vehicle_id} reference={r.vehicle_reference} href={`/inventory/${r.vehicle_id}`} />}<span className="ml-2">{r.car}</span></td>
                <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{r.vehicle_registration ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status] ?? r.status}</span><span className={`ml-2 text-[10px] ${PAYMENT_STYLE[r.payment_state ?? ""] ?? "text-slate-400"}`}>{PAYMENT_LABEL[r.payment_state ?? ""] ?? r.payment_state}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{r.amount_known === false ? "Pending" : money(Number(r.total), "EUR")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(Number(r.vendor_outstanding ?? 0), "EUR")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-300">{money(Number(r.finance_outstanding ?? 0), "EUR")}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-200">{money(Number(r.to_be_paid ?? r.outstanding), "EUR")}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">No purchases. Record one with “New purchase”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Balance({ label, value, accent = "text-slate-100" }: { label: string; value: number; accent?: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-0.5 text-lg font-semibold tabular-nums ${accent}`}>{money(value, "EUR")}</p></div>;
}
