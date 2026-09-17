"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPayment } from "../actions";

const KINDS = [["balance", "Balance"], ["deposit", "Deposit"], ["refund", "Refund"]];
const METHODS = [["", "—"], ["cash", "Cash"], ["bank", "Bank"], ["card", "Card"], ["finance", "Finance"]];

export function AddPayment({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("balance");
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!amount) return;
    setError("");
    start(async () => {
      const res = await addPayment({ dealId, kind, method: method || undefined, amount: Number(amount) });
      if (res.error) setError(res.error);
      else {
        setAmount("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3">
      <div className="grid gap-2 sm:grid-cols-[110px_110px_1fr_auto]">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="studio-input">
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="studio-input">
          {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€" className="studio-input" />
        <button type="button" onClick={add} disabled={pending || !amount} className="rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40">Add</button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
