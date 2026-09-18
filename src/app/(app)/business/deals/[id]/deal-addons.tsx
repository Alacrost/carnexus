"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@/lib/currency";
import { ADDON_KINDS, addonKindLabel } from "@/lib/deals";
import { addDealAddon, removeDealAddon } from "../actions";

export interface Addon { id: string; kind: string; name: string; price: number; cost: number }

export function DealAddons({ dealId, addons, currency, showProfit }: { dealId: string; addons: Addon[]; currency: string; showProfit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("warranty");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [vatRate,setVatRate]=useState("23");
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setError("");
    start(async () => {
      const res = await addDealAddon({ dealId, kind, name, price: Number(price), vatRate:Number(vatRate),cost: cost ? Number(cost) : undefined });
      if (res.error) setError(res.error);
      else { setOpen(false); setName(""); setPrice(""); setCost(""); router.refresh(); }
    });
  }

  const inp = "mt-1 studio-input";
  const total = addons.reduce((a, x) => a + Number(x.price), 0);

  return (
    <section className="studio-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Add-ons &amp; extras</h2>
        <span className="text-xs tabular-nums text-slate-300">{money(total, currency)}</span>
      </div>

      <ul className="mt-2 space-y-1.5">
        {addons.length === 0 && <li className="text-sm text-slate-500">No add-ons yet.</li>}
        {addons.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
            <span className="text-slate-200">{a.name} <span className="text-[11px] text-slate-500">· {addonKindLabel(a.kind)}</span></span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums text-slate-200">{money(Number(a.price), currency)}</span>
              {showProfit && <span className="text-[11px] text-emerald-400">+{money(Number(a.price) - Number(a.cost), currency)}</span>}
              <form action={removeDealAddon}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="dealId" value={dealId} />
                <button type="submit" className="text-slate-500 hover:text-rose-400">✕</button>
              </form>
            </span>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-400">Type
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={inp}>{ADDON_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-400">Name
              <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="12-month warranty" /></label>
            <label className="text-xs text-slate-400">Price (€)
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inp} /></label>
            {showProfit && <label className="text-xs text-slate-400">Cost (€)
              <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className={inp} /></label>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending || name.trim().length < 2 || Number(price) <= 0} className="btn-gradient text-xs disabled:opacity-50">{pending ? "…" : "Add"}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
          </div>
          {open && <label className="mt-2 block text-xs">Add-on VAT rate (confirm the correct treatment)<select value={vatRate} onChange={e=>setVatRate(e.target.value)} className="studio-input">{[0,9,13.5,23].map(r=><option key={r} value={r}>{r}%</option>)}</select></label>}
      {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 hover:border-white/25">+ Add item</button>
      )}
    </section>
  );
}
