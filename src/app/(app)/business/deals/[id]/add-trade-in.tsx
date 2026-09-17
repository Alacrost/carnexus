"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTradeIn } from "../actions";

export function AddTradeIn({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registration, setRegistration] = useState("");
  const [km, setKm] = useState("");
  const [allowance, setAllowance] = useState("");
  const [settlement, setSettlement] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const netEquity = Math.max(0, (Number(allowance) || 0) - (Number(settlement) || 0));
  const canSave = make.trim() && model.trim() && year && registration.trim() && Number(allowance) > 0;
  const inp = "mt-1 studio-input";

  function save() {
    setError("");
    start(async () => {
      const res = await addTradeIn({
        dealId, make, model, year: Number(year), registration,
        km: km ? Number(km) : undefined, allowance: Number(allowance),
        settlement: settlement ? Number(settlement) : undefined,
      });
      if (res.error) setError(res.error);
      else { setOpen(false); router.refresh(); }
    });
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 hover:border-white/25">+ Add trade-in</button>;
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className={inp} />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className={inp} />
        <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className={inp} />
        <input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="Reg" className={inp} />
        <input type="number" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Km" className={inp} />
        <div />
        <label className="text-xs text-slate-400">Allowance (€)<input type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} className={inp} /></label>
        <label className="text-xs text-slate-400">Settlement (€)<input type="number" value={settlement} onChange={(e) => setSettlement(e.target.value)} className={inp} /></label>
      </div>
      <p className="text-[11px] text-slate-500">Net equity toward the car: <span className="text-slate-300 tabular-nums">€{netEquity.toLocaleString("en-IE")}</span></p>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={!canSave || pending} className="btn-gradient text-xs disabled:opacity-50">{pending ? "…" : "Save trade-in"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
