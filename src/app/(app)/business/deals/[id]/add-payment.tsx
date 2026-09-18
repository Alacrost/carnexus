"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addPayment } from "../actions";

const KINDS = [["balance", "Balance"], ["deposit", "Deposit"], ["finance_payout", "Lender payout"], ["refund", "Refund"]];
const METHODS = [["", "—"], ["cash", "Cash"], ["bank", "Bank"], ["card", "Card"], ["finance", "Finance"]];

export function AddPayment({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("balance");
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const requestId=useRef("");
  const [reference,setReference]=useState("");
  const [paidOn,setPaidOn]=useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!amount) return;
    setError("");
    start(async () => {
      const res = await addPayment({ dealId, kind, method: method || undefined, amount: Number(amount), reference, paidOn, requestId: requestId.current ||= crypto.randomUUID() });
      if (res.error) setError(res.error);
      else {
        setAmount(""); requestId.current=""; setReference("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3">
      <div className="grid gap-2 sm:grid-cols-[110px_110px_1fr_auto]">
        <select aria-label="Payment type" value={kind} onChange={(e) => setKind(e.target.value)} className="studio-input">
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} className="studio-input">
          {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input aria-label="Payment amount" min="0.01" step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€" className="studio-input" />
        <button type="button" onClick={add} disabled={pending || !amount} className="rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40">Add</button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs">Received / refunded on<input type="date" value={paidOn} onChange={e=>setPaidOn(e.target.value)} className="studio-input"/></label><label className="text-xs">Bank / receipt reference<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={120} className="studio-input"/></label></div><p className="mt-2 text-xs text-slate-400">Record confirmed receipts only. Add separate entries for mixed methods. Refunds reduce the paid total.</p>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
