"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { computeDeal, type VatScheme } from "@/lib/finance";
import { saveDeal, addCost, deleteCost, type CostRow } from "../actions";

export interface DealValues {
  purchase_price: number | null;
  purchase_date: string | null;
  supplier: string | null;
  source: string | null;
  vat_scheme: string;
  sale_price: number | null;
  deposit_amount: number | null;
  deposit_date: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  payment_method: string | null;
  finance_provider: string | null;
  part_exchange_value: number | null;
  salesperson: string | null;
  sale_status: string;
  sold_date: string | null;
  delivered_date: string | null;
  notes: string | null;
}
export interface CostItem {
  id: string;
  kind: string;
  amount: number;
  cost_date: string | null;
  notes: string | null;
}

const s = (v: unknown) => (v == null ? "" : String(v));
const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-IE");

const SOURCES = [
  ["", "—"], ["trade", "Trade"], ["auction", "Auction"], ["private", "Private"],
  ["part_exchange", "Part-exchange"], ["other", "Other"],
];
const SCHEMES = [
  ["standard", "Normal (23% on price)"], ["margin", "Margin scheme (23% on profit)"], ["none", "No VAT"],
];
const PAYMENTS = [
  ["", "—"], ["cash", "Cash"], ["bank", "Bank transfer"], ["finance", "Finance"], ["card", "Card"], ["mixed", "Mixed"],
];
const SALE_STATUS = [
  ["none", "In stock"], ["reserved", "Reserved"], ["deposit_paid", "Deposit paid"], ["sold", "Sold"], ["delivered", "Delivered"],
];
const COST_KINDS = [
  ["prep", "Prep"], ["nct", "NCT"], ["valet", "Valet"], ["parts", "Parts"],
  ["transport", "Transport"], ["advertising", "Advertising"], ["other", "Other"],
];

export function DealEditor({
  vehicleId,
  initialDeal,
  initialCosts,
  canManage,
  demo,
}: {
  vehicleId: string;
  initialDeal: DealValues | null;
  initialCosts: CostItem[];
  canManage: boolean;
  demo: boolean;
}) {
  const [f, setF] = useState(() => ({
    purchase_price: s(initialDeal?.purchase_price),
    purchase_date: s(initialDeal?.purchase_date),
    supplier: s(initialDeal?.supplier),
    source: s(initialDeal?.source),
    vat_scheme: initialDeal?.vat_scheme || "standard",
    sale_price: s(initialDeal?.sale_price),
    deposit_amount: s(initialDeal?.deposit_amount),
    deposit_date: s(initialDeal?.deposit_date),
    buyer_name: s(initialDeal?.buyer_name),
    buyer_phone: s(initialDeal?.buyer_phone),
    payment_method: s(initialDeal?.payment_method),
    finance_provider: s(initialDeal?.finance_provider),
    part_exchange_value: s(initialDeal?.part_exchange_value),
    salesperson: s(initialDeal?.salesperson),
    sale_status: initialDeal?.sale_status || "none",
    sold_date: s(initialDeal?.sold_date),
    delivered_date: s(initialDeal?.delivered_date),
    notes: s(initialDeal?.notes),
  }));
  const [costs, setCosts] = useState<CostItem[]>(initialCosts);
  const [cKind, setCKind] = useState("prep");
  const [cAmount, setCAmount] = useState("");
  const [cDate, setCDate] = useState("");
  const [cNotes, setCNotes] = useState("");

  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [remindWithdraw, setRemindWithdraw] = useState(false);
  const [saving, startSave] = useTransition();
  const [addingCost, startCost] = useTransition();

  const set = (k: string, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const costTotal = useMemo(() => costs.reduce((a, c) => a + Number(c.amount), 0), [costs]);
  const fin = useMemo(
    () =>
      computeDeal({
        purchasePrice: Number(f.purchase_price) || 0,
        costs: costTotal,
        salePrice: Number(f.sale_price) || 0,
        vatScheme: (f.vat_scheme as VatScheme) || "standard",
      }),
    [f.purchase_price, f.sale_price, f.vat_scheme, costTotal]
  );

  const soldButOnline =
    f.sale_status === "deposit_paid" ||
    (Number(f.deposit_amount) > 0 && f.sale_status !== "sold" && f.sale_status !== "delivered");

  function save() {
    setError("");
    setSaved(false);
    startSave(async () => {
      const res = await saveDeal({ vehicleId, ...f });
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  function onAddCost() {
    if (!cAmount) return;
    startCost(async () => {
      const res = await addCost({ vehicleId, kind: cKind, amount: Number(cAmount), cost_date: cDate || undefined, notes: cNotes || undefined });
      if (res.error) setError(res.error);
      else if (res.cost) {
        setCosts((prev) => [...prev, res.cost as CostRow]);
        setCAmount("");
        setCDate("");
        setCNotes("");
      }
    });
  }

  function removeCost(id: string) {
    setCosts((prev) => prev.filter((c) => c.id !== id));
    deleteCost(id);
  }

  const input = "mt-1 studio-input";
  const dis = !canManage;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {/* Sold-but-online alert */}
        {soldButOnline && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.08] p-4">
            <p className="text-sm font-semibold text-amber-200">⚠ Sold pending — may still be online</p>
            <p className="mt-1 text-sm text-slate-300">
              This car has a deposit but could still be live on DoneDeal. Update the cover or withdraw the ad.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link href="/marketing/photos" className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 font-medium text-sky-300 hover:bg-sky-500/20">
                Add “DEPOSIT PAID” banner
              </Link>
              <button
                type="button"
                onClick={() => setRemindWithdraw(true)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-medium text-slate-200 hover:bg-white/10"
              >
                Remind me to withdraw
              </button>
              {remindWithdraw && <span className="self-center text-emerald-400">Reminder noted ✓</span>}
            </div>
          </div>
        )}

        {/* Purchase */}
        <section className="studio-surface p-6">
          <h2 className="font-medium text-slate-100">Purchase</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm"><span className="text-slate-300">Purchase price (€)</span>
              <input type="number" value={f.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Purchase date</span>
              <input type="date" value={f.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Supplier</span>
              <input value={f.supplier} onChange={(e) => set("supplier", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Source</span>
              <select value={f.source} onChange={(e) => set("source", e.target.value)} disabled={dis} className={input}>
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm sm:col-span-2"><span className="text-slate-300">VAT scheme</span>
              <select value={f.vat_scheme} onChange={(e) => set("vat_scheme", e.target.value)} disabled={dis} className={input}>
                {SCHEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
        </section>

        {/* Costs */}
        <section className="studio-surface p-6">
          <h2 className="font-medium text-slate-100">Costs</h2>
          <div className="mt-3 space-y-2">
            {costs.length === 0 && <p className="text-sm text-slate-500">No costs added yet.</p>}
            {costs.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                <span className="w-24 shrink-0 capitalize text-slate-300">{c.kind}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500">{c.notes ?? c.cost_date ?? ""}</span>
                <span className="tabular-nums text-slate-200">{eur(Number(c.amount))}</span>
                {canManage && <button type="button" onClick={() => removeCost(c.id)} className="text-xs text-slate-500 hover:text-rose-400">Remove</button>}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[110px_110px_1fr_auto]">
              <select value={cKind} onChange={(e) => setCKind(e.target.value)} className="studio-input">
                {COST_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input type="number" value={cAmount} onChange={(e) => setCAmount(e.target.value)} placeholder="€" className="studio-input" />
              <input value={cNotes} onChange={(e) => setCNotes(e.target.value)} placeholder="Notes (optional)" className="studio-input" />
              <button type="button" onClick={onAddCost} disabled={addingCost || !cAmount} className="rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40">Add</button>
            </div>
          )}
        </section>

        {/* Sale */}
        <section className="studio-surface p-6">
          <h2 className="font-medium text-slate-100">Sale</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm"><span className="text-slate-300">Sale price (€)</span>
              <input type="number" value={f.sale_price} onChange={(e) => set("sale_price", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Status</span>
              <select value={f.sale_status} onChange={(e) => set("sale_status", e.target.value)} disabled={dis} className={input}>
                {SALE_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-slate-300">Deposit (€)</span>
              <input type="number" value={f.deposit_amount} onChange={(e) => set("deposit_amount", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Deposit date</span>
              <input type="date" value={f.deposit_date} onChange={(e) => set("deposit_date", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Buyer name</span>
              <input value={f.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Buyer phone</span>
              <input value={f.buyer_phone} onChange={(e) => set("buyer_phone", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Payment</span>
              <select value={f.payment_method} onChange={(e) => set("payment_method", e.target.value)} disabled={dis} className={input}>
                {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-slate-300">Finance provider</span>
              <input value={f.finance_provider} onChange={(e) => set("finance_provider", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Part-exchange value (€)</span>
              <input type="number" value={f.part_exchange_value} onChange={(e) => set("part_exchange_value", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Salesperson</span>
              <input value={f.salesperson} onChange={(e) => set("salesperson", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Sold date</span>
              <input type="date" value={f.sold_date} onChange={(e) => set("sold_date", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm"><span className="text-slate-300">Delivered date</span>
              <input type="date" value={f.delivered_date} onChange={(e) => set("delivered_date", e.target.value)} disabled={dis} className={input} /></label>
            <label className="text-sm sm:col-span-2"><span className="text-slate-300">Notes</span>
              <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={dis} className={input} /></label>
          </div>
        </section>
      </div>

      {/* Financial summary + save */}
      <aside className="lg:sticky lg:top-6 h-fit space-y-4">
        <div className="studio-surface p-6">
          <h2 className="text-sm font-medium text-slate-200">Financials</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row label="Purchase" value={eur(Number(f.purchase_price) || 0)} />
            <Row label="Costs" value={eur(costTotal)} />
            <Row label="Total cost" value={eur(fin.totalCost)} strong />
            <Row label="Sale price" value={eur(Number(f.sale_price) || 0)} />
            <Row label="Gross margin" value={eur(fin.grossMargin)} />
            <Row label="VAT" value={eur(fin.vat)} />
            <div className="border-t border-white/10 pt-2.5">
              <Row label="Net profit" value={eur(fin.netProfit)} strong accent={fin.netProfit >= 0} />
            </div>
          </dl>
        </div>

        {canManage && (
          <div className="space-y-2">
            <button type="button" onClick={save} disabled={saving} className="btn-gradient w-full disabled:opacity-50">
              {saving ? "Saving…" : "Save deal"}
            </button>
            {saved && <p className="text-sm text-emerald-400">Saved{demo ? " (demo)" : ""} ✓</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-base font-semibold" : ""} ${accent === undefined ? "text-slate-200" : accent ? "text-emerald-300" : "text-rose-400"}`}>
        {value}
      </dd>
    </div>
  );
}
