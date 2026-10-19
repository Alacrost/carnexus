"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchCustomers, type CustomerMatch } from "../../customers/actions";
import { createPurchaseAndGo } from "../actions";
import {ImportVrtFields} from "../import-vrt-fields";
import { emptyPurchaseVendor, PurchaseVendorFields, type PurchaseVendorValues } from "./purchase-vendor-fields";

const SCHEMES = [
  ["none", "No VAT (private / trade)"],
  ["standard", "Standard"],
  ["margin", "Margin scheme"],
];

type ExistingVehicle={id:string;make:string;model:string;year:number;registration:string;km:number;status:string};
export function PurchaseForm({existingVehicle,taxSettings}:{existingVehicle?:ExistingVehicle|null;taxSettings:{defaultVatScheme:string;standardVatRate:number}}) {
  // Vendor
  const [vendor, setVendor] = useState<PurchaseVendorValues>(emptyPurchaseVendor);
  const vendorName = vendor.name;
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const seq = useRef(0);

  // Vehicle + money
  const [make, setMake] = useState(existingVehicle?.make??"");
  const [model, setModel] = useState(existingVehicle?.model??"");
  const [year, setYear] = useState(existingVehicle?String(existingVehicle.year):"");
  const [registration, setRegistration] = useState(existingVehicle?.registration??"");
  const [km, setKm] = useState(existingVehicle?String(existingVehicle.km):"");
  const [price, setPrice] = useState("");
  const [vatScheme, setVatScheme] = useState(taxSettings.defaultVatScheme);
  const [vatRate,setVatRate]=useState(String(taxSettings.standardVatRate));
  const [imported,setImported]=useState(false);const[vrtAmount,setVrtAmount]=useState("0");const[vrtVatTreatment,setVrtVatTreatment]=useState<"included"|"excluded">("included");
  const [invRef, setInvRef] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [receivedOn, setReceivedOn] = useState(today);
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

  const canSave = vendorName.trim().length >= 2 && make.trim() && model.trim() && year && registration.trim() && km !== "" && Number(km) >= 0 && invRef.trim() && purchaseDate && receivedOn&&vatRate!==""&&Number.isFinite(Number(vatRate))&&Number(vatRate)>=0&&Number(vatRate)<=100&&Number.isFinite(Number(vrtAmount))&&Number(vrtAmount)>=0;
  const inp = "mt-1 studio-input";

  function pick(m: CustomerMatch) {
    setVendorId(m.id);
    setVendor({
      name: m.company || m.name, type: m.type === "business" || m.company ? "business" : "individual",
      business_name: m.company ?? "", title: m.title ?? "", first_name: m.first_name ?? "", last_name: m.last_name ?? "", job_title: m.job_title ?? "",
      phone: m.phone ?? "", mobile: m.mobile ?? "", ddi_phone: m.ddi_phone ?? "", fax: m.fax ?? "", email: m.email ?? "",
      address_line1: m.address ?? "", address_line2: m.address2 ?? "", city: m.town ?? "", county: m.county ?? "", eircode: m.post_code ?? "", country: m.country ?? "",
      vat_number: m.vat_number ?? "", notes: m.notes ?? "",
    });
    setShowMatches(false);
  }

  function changeVendor() {
    setVendorId(null);
    setVendor(emptyPurchaseVendor);
    setMatches([]);
    setShowMatches(false);
  }

  function save() {
    setError("");
    start(async () => {
      const res = await createPurchaseAndGo({
        existingVehicleId:existingVehicle?.id,
        vendorId: vendorId || undefined,
        newVendor: vendorId ? undefined : { ...vendor, country: vendor.country === "IE" || vendor.country === "GB" || vendor.country === "CA" ? vendor.country : undefined },
        make, model, year: Number(year), registration, km: Number(km),
        price: price === "" ? undefined : Number(price), purchaseDate, receivedOn,
        settlement:Number(settlement)||0,settlementProvider:provider,settlementReference:reference,settlementValidUntil:validUntil,dueOn,requestId:requestId.current ||= crypto.randomUUID(),vatScheme,vatRate:Number(vatRate),imported,vrtAmount:Number(vrtAmount),vrtVatTreatment, invRef, notes: notes || undefined,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-[#0b0f17]/60 p-6 sm:p-8">
      {/* Vendor */}
      <PurchaseVendorFields
        value={vendor}
        onChange={patch => { setVendor(current => ({ ...current, ...patch })); if (patch.name !== undefined) setShowMatches(false); }}
        existing={!!vendorId}
        onChangeVendor={changeVendor}
        matches={matches}
        showMatches={showMatches}
        onPick={pick}
      />

      {/* Vehicle */}
      <section className="mt-6 border-t border-white/5 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Vehicle</h2>
        {existingVehicle&&<p className="mt-1 text-xs text-slate-400">Existing car · {existingVehicle.registration} · {existingVehicle.make} {existingVehicle.model}. Vehicle identity is locked here; edit it on the car page.</p>}
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-sm"><span className="text-slate-300">Make</span><input value={make} onChange={(e) => setMake(e.target.value)} readOnly={!!existingVehicle} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Model</span><input value={model} onChange={(e) => setModel(e.target.value)} readOnly={!!existingVehicle} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Year</span><input type="number" value={year} onChange={(e) => setYear(e.target.value)} readOnly={!!existingVehicle} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Registration</span><input value={registration} onChange={(e) => setRegistration(e.target.value)} readOnly={!!existingVehicle} className={inp} placeholder="212C4187" /></label>
          <label className="text-sm"><span className="text-slate-300">Km <b className="text-rose-300">*</b></span><input required min="0" type="number" value={km} onChange={(e) => setKm(e.target.value)} readOnly={!!existingVehicle} className={inp} /></label>
        </div>
      </section>

      {/* Purchase */}
      <section className="mt-6 border-t border-white/5 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Purchase</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-sm"><span className="text-slate-300">Purchase price (€) <span className="text-slate-500">optional</span></span><input min="0" step="0.01" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">VAT</span>
            <select value={vatScheme} onChange={(e) => setVatScheme(e.target.value)} className={inp}>{SCHEMES.map(([v, l]) => <option key={v} value={v}>{v==="standard"?`${l} (${vatRate}%)`:l}</option>)}</select></label>
          {vatScheme==="standard"&&<label className="text-sm">VAT rate (%)<input required min="0" max="100" step="0.01" type="number" value={vatRate} onChange={event=>setVatRate(event.target.value)} className={inp}/></label>}
          <label className="text-sm"><span className="text-slate-300">Supplier invoice ref <b className="text-rose-300">*</b></span><input required value={invRef} onChange={(e) => setInvRef(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Purchase date <b className="text-rose-300">*</b></span><input required max={today} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inp} /></label>
          <label className="text-sm"><span className="text-slate-300">Arrived at dealership <b className="text-rose-300">*</b></span><input required min={purchaseDate} max={today} type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={inp} /></label>
        </div>
        <ImportVrtFields imported={imported} vrtAmount={vrtAmount} vrtVatTreatment={vrtVatTreatment} onImported={setImported} onAmount={setVrtAmount} onTreatment={setVrtVatTreatment}/>
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
