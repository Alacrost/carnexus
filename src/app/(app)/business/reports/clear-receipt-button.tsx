"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearReceipt, rejectReceipt } from "../deals/actions";

export function ClearReceiptButton({ paymentId, status }: { paymentId: string; status: "pending" | "cleared" }) {
  const router = useRouter();
  const requestId = useRef("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [clearedOn,setClearedOn]=useState(()=>new Date().toISOString().slice(0,10));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function clear() {
    setError("");
    start(async () => {
      const result = await clearReceipt({ paymentId, reference, clearedOn, requestId: requestId.current ||= crypto.randomUUID() });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function reject() {
    if (reason.trim().length < 3) { setError("Add the bank rejection reason."); return; }
    setError("");
    start(async () => {
      const result = await rejectReceipt({ paymentId, reason, reference, requestId: crypto.randomUUID() });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return <div className="flex min-w-[310px] flex-col items-end gap-1">
    <div className="flex gap-1">
      <input aria-label="Bank reconciliation reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank ref (optional)" maxLength={120} className="w-32 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200" />
      <input aria-label="Confirmation date" type="date" max={new Date().toISOString().slice(0,10)} value={clearedOn} onChange={event=>setClearedOn(event.target.value)} className="w-32 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200"/>
      {status === "pending" && <button type="button" onClick={clear} disabled={pending} className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-40">{pending ? "Saving…" : "Mark cleared"}</button>}
    </div>
    <div className="flex gap-1"><input aria-label="Rejection reason" value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Reason if rejected" maxLength={500} className="w-44 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200"/><button type="button" onClick={reject} disabled={pending} className="rounded-md border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-400/15 disabled:opacity-40">Reject / bounced</button></div>
    {error && <span role="alert" className="max-w-[230px] text-right text-[10px] text-rose-300">{error}</span>}
  </div>;
}
