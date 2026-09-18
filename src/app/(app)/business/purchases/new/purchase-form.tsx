"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchCustomers, type CustomerMatch } from "../../customers/actions";
import { createPurchaseAndGo } from "../actions";

const SCHEMES = [
  ["none", "No VAT (private / trade)"],
  ["standard", "Standard (23%)"],
  ["margin", "Margin scheme"],
];

export function PurchaseForm() {
  // Vendor
  const [vendorName, setVendorName] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const seq = useRef(0);

  // Vehicle + money
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registration, setRegistration] = useState("");
  const [km, setKm] = useState("");
  const [price, setPrice] = useState("");
  const [vatScheme, setVatScheme] = useState("none");
  const [invRef, setInvRef] = useState("");
  const [notes, setNotes] = useState("");

  const requestId=useRef("");
  const [settlement,setSettlement]=useState(""); const [provider,setProvider]=useState(""); const [reference,setReference]=useState(""); const [validUntil,setValidUntil]=useState(""); const [dueOn,setDueOn]=useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (vendorId) return;
    const q = vendorName.trim();
    if (q.length < 2) return;
    const s = ++seq.current;
    let active=true;
    const t = setTimeout(async () => {
      const res = await searchCustomers(q);
      if (active && s === seq.current) { setMatches(res); setShowMatches(true); }
    }, 220);
    return () => {clearTimeout(t);active=false;};
  }, [vendorName, vendorId]);

  const canSave = vendorName.trim().length >= 2 && make.trim() && model.trim() && year && registration.trim() && Number(price) > 0;
  const inp = "mt-1 studio-input";

  function pick(m: CustomerMatch) {
    setVendorId(m.id);
    setVendorName(m.company || m.name);
    setVendorPhone(m.phone ?? "");
    setVendorEmail(m.email ?? "");
    setShowMatches(false);
  }

  function save() {
    setError("");
    start(async () => {
      const res = await createPurchaseAndGo({
        vendorId: vendorId || undefined,
        newVendor: vendorId ? undefined : { name: vendorName, phone: vendorPhone || undefined, email: vendorEmail || undefined },
        make, model, year: Number(year), registration, km: km ? Number(km) : undefined,
        price: Number(price), settlement:Number(settlement)||0,settlementProvider:provider,settlementReference:reference,settlementValidUntil:validUntil,dueOn,requestId:requestId.current ||= crypto.randomUUID(),vatScheme, invRef: invRef || undefined, notes: notes || undefined,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#0b0f17]/60 p-6 sm:p-8">
      {/* Vendor */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Vendor</h2>
        <p className="mt-1 text-xs text-slate-500">Who you&apos;re buying from — search an existing party or type a new one.</p>
        <div className="relative mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-sm sm:col-span-3"><span className="text-slate-300">Name / company</span>
            <input value={vendorName} onChange={(e) => { setVendorName(e.target.value); if (vendorId) setVendorId(null); }} className={inp} placeholder="Vendor name" autoComplete="off" />
            {vendorId && <span className="absolute right-2 top-8 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">Existing</span>}
          </label>
          {showMatches && vendorName.trim().length >= 2 && !vendorId && matches.length > 0 && (
            <ul className="absolute z-20 top-16 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0b0f17] shadow-xl">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => pick(m)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/5">
                    <span className="text-slate-100">{m.company || m.name}</span>
                    <span className="text-xs text-slate-500">{m.phone ?? m.email ?? m.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="text-sm"><span className="text-slate-300">Phone</span>
            <input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} disabled={!!vendorId} className={`${inp} disabled:opacity-60`} /></label>
          <label className="text-sm sm:col-span-2"><span className="text-slate-300">Email</span>
            <input value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} disabled={!!vendorId} className={`${inp} disabled:opacity-60`} /></label>
        </div>
      </section>

      {/* Vehicle */}
      <section className="mt-6 border-t border-white/5 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Vehicle</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-sm"><span className="text-slate-300">Make</span><input value={make} onChange={(e) => setMake(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Model</span><input value={model} onChange={(e) => setModel(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Year</span><input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Registration</span><input value={registration} onChange={(e) => setRegistration(e.target.value)} className={inp} placeholder="212C4187" /></label>
          <label className="text-sm"><span className="text-slate-300">Km</span><input type="number" value={km} onChange={(e) => setKm(e.target.value)} className={inp} /></label>
        </div>
      </section>

      {/* Purchase */}
      <section className="mt-6 border-t border-white/5 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Purchase</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-sm"><span className="text-slate-300">Price (€)</span><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">VAT</span>
            <select value={vatScheme} onChange={(e) => setVatScheme(e.target.value)} className={inp}>{SCHEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm"><span className="text-slate-300">Supplier invoice ref</span><input value={invRef} onChange={(e) => setInvRef(e.target.value)} className={inp} /></label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Outstanding lender settlement (€)<input type="number" min="0" step="0.01" value={settlement} onChange={e=>setSettlement(e.target.value)} className={inp}/></label><label className="text-sm">Finance company<input value={provider} onChange={e=>setProvider(e.target.value)} className={inp}/></label><label className="text-sm">Loan reference<input value={reference} onChange={e=>setReference(e.target.value)} className={inp}/></label><label className="text-sm">Settlement valid until<input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} className={inp}/></label><label className="text-sm">Payment due date<input type="date" value={dueOn} onChange={e=>setDueOn(e.target.value)} className={inp}/></label></div><p className="mt-2 text-xs text-slate-400">The purchase price includes the lender settlement. The remainder is owed to the vendor.</p>
        <label className="mt-4 block text-sm"><span className="text-slate-300">Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} /></label>
      </section>

      <div className="mt-6 flex items-center gap-3 border-t border-white/5 pt-6">
        <button type="button" onClick={save} disabled={!canSave || pending} className="btn-gradient ml-auto disabled:opacity-50">{pending ? "Saving…" : "Create purchase"}</button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
