"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addVendorPayment } from "../actions";

const METHODS = [["", "—"], ["cash", "Cash"], ["bank", "Bank"], ["card", "Card"], ["finance", "Finance"]];

export function AddVendorPayment({ poId }: { poId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    setError("");
    start(async () => {
      const res = await addVendorPayment({ poId, amount: Number(amount), method: method || undefined, paidOn: paidOn || undefined });
      if (res.error) setError(res.error);
      else { setAmount(""); setMethod(""); setPaidOn(""); router.refresh(); }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount €" className="studio-input w-28" />
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="studio-input w-28">{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="studio-input w-40" />
      <button type="button" onClick={submit} disabled={pending || Number(amount) <= 0} className="btn-gradient text-xs disabled:opacity-50">{pending ? "…" : "Add payment"}</button>
      {error && <p className="w-full text-xs text-rose-400">{error}</p>}
    </div>
  );
}
