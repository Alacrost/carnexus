"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addVendorPayment } from "../actions";

const METHODS = [["", "—"], ["cash", "Cash"], ["bank", "Bank"], ["card", "Card"], ["finance", "Finance"]];

export function AddVendorPayment({ poId }: { poId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const requestId=useRef(""); const [recipient,setRecipient]=useState("vendor");const [reference,setReference]=useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    setError("");
    start(async () => {
      const res = await addVendorPayment({ poId, amount: Number(amount), method: method || undefined, paidOn: paidOn || undefined,recipient,reference,requestId:requestId.current ||= crypto.randomUUID() });
      if (res.error) setError(res.error);
      else { requestId.current=""; setAmount(""); setMethod(""); setPaidOn(""); router.refresh(); }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs">Payee<select value={recipient} onChange={e=>setRecipient(e.target.value)} className="studio-input"><option value="vendor">Vendor</option><option value="finance">Existing finance company</option></select></label><label className="text-xs">Reference<input value={reference} onChange={e=>setReference(e.target.value)} className="studio-input"/></label>
      <input aria-label="Payment amount" min="0.01" step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount €" className="studio-input w-28" />
      <select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} className="studio-input w-28">{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input aria-label="Payment date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="studio-input w-40" />
      <button type="button" onClick={submit} disabled={pending || Number(amount) <= 0} className="btn-gradient text-xs disabled:opacity-50">{pending ? "…" : "Add payment"}</button>
      {error && <p className="w-full text-xs text-rose-400">{error}</p>}
    </div>
  );
}
