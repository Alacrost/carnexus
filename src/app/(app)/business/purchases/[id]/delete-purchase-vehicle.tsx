"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePurchaseVehicle } from "../actions";

export function DeletePurchaseVehicle({ poId, poNo }: { poId: string; poNo: string }) {
  const router = useRouter();
  const requestId = useRef("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function remove() {
    setError("");
    start(async () => {
      const result = await deletePurchaseVehicle(poId, requestId.current ||= crypto.randomUUID());
      if (result.error) return setError(result.error);
      router.push("/inventory");
      router.refresh();
    });
  }

  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border border-rose-400/25 px-3 py-2 text-xs text-rose-300 hover:bg-rose-400/10">Delete PO &amp; vehicle</button>;
  return <div className="max-w-md rounded-md border border-rose-400/25 bg-rose-500/10 p-4 text-xs leading-relaxed text-rose-100"><p className="text-sm font-semibold">Permanently delete {poNo} and its vehicle?</p><p className="mt-2">This removes the purchase order, its payment records, preparation data and linked vehicle assets. A record of the deletion is kept for audit. Deleting payment records does not return money.</p><p className="mt-2">A vehicle already used by a Deal cannot be deleted. You cannot undo this in the app.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={remove} className="rounded-md bg-rose-700 px-3 py-2 font-semibold text-white hover:bg-rose-600 disabled:opacity-50">{pending ? "Deleting…" : "Delete PO & vehicle"}</button><button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md border border-white/15 px-3 py-2 font-medium">Keep PO & vehicle</button></div>{error && <p role="alert" className="mt-3 text-rose-200">{error}</p>}</div>;
}
