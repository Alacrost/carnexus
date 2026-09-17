"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createDealAndGo } from "../actions";
import { searchCustomers, type CustomerMatch } from "../../customers/actions";

export interface Opt {
  id: string;
  label: string;
}

export interface VehicleOpt extends Opt {
  price?: number;
  make?: string;
  model?: string;
  year?: number;
  km?: number;
  registration?: string;
}

const SCHEMES = [
  ["standard", "Normal (23% on price)"],
  ["margin", "Margin scheme (23% on profit)"],
  ["none", "No VAT"],
];
const METHODS = [
  ["", "—"], ["cash", "Cash"], ["bank", "Bank"], ["card", "Card"], ["finance", "Finance"], ["part_exchange", "Part-exchange"],
];
const SOURCES = [
  ["", "—"], ["donedeal", "DoneDeal"], ["facebook", "Facebook"], ["instagram", "Instagram"],
  ["recommendation", "Recommendation"], ["walk_in", "Walk-in"], ["phone", "Phone"], ["website", "Website"], ["other", "Other"],
];
const CONSENTS = [
  ["", "Not asked"], ["consented", "Consented"], ["refused", "Refused"], ["verbal", "Verbal"],
];
const COUNTRIES = [
  ["IE", "IE - Ireland"], ["GB", "GB - United Kingdom"], ["OTHER", "Other"],
];

const STEPS = ["Contact", "Source & salesperson", "Car & deposit"];

export function DealSheet({
  vehicles,
  leads,
  staff,
  initialVehicleId,
  defaultSalespersonId,
  initialLeadId = "",
  initialSource = "",
  initialCustomer,
}: {
  vehicles: VehicleOpt[];
  leads: Opt[];
  staff: Opt[];
  initialVehicleId: string;
  defaultSalespersonId: string;
  initialLeadId?: string;
  initialSource?: string;
  initialCustomer?: CustomerMatch;
}) {
  const [step, setStep] = useState(0);

  // Customer (CRM contact)
  const [customerId, setCustomerId] = useState<string | null>(initialCustomer?.id ?? null);
  const [title, setTitle] = useState("");
  const [firstName, setFirstName] = useState(initialCustomer?.type === "business" ? "" : initialCustomer?.name ?? "");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState(initialCustomer?.type === "business" ? initialCustomer.name : "");
  const [jobTitle, setJobTitle] = useState("");
  const [dataConsent, setDataConsent] = useState("");
  const [mainPhone, setMainPhone] = useState(initialCustomer?.phone ?? "");
  const [ddiPhone, setDdiPhone] = useState("");
  const [fax, setFax] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [address, setAddress] = useState("");
  const [town, setTown] = useState("");
  const [county, setCounty] = useState("");
  const [postCode, setPostCode] = useState("");
  const [country, setCountry] = useState("IE");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const searchSeq = useRef(0);

  // Source & salesperson
  const [source, setSource] = useState(initialSource);
  const [leadId, setLeadId] = useState(initialLeadId);
  const [salespersonId, setSalespersonId] = useState(defaultSalespersonId);

  // Sale
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const priceFor = (id: string) => vehicles.find((v) => v.id === id)?.price ?? 0;
  const [salePrice, setSalePrice] = useState(String(priceFor(initialVehicleId) || ""));
  const [vatScheme, setVatScheme] = useState("standard");
  const [deposit, setDeposit] = useState("");
  const [depositMethod, setDepositMethod] = useState("");
  const [depositDate, setDepositDate] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const searchTerm = `${firstName} ${lastName}`.trim() || company.trim();

  // Live contact autocomplete.
  useEffect(() => {
    if (customerId) return; // already picked an existing party
    const q = searchTerm;
    if (q.length < 2) { setMatches([]); return; }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await searchCustomers(q);
      if (seq === searchSeq.current) { setMatches(res); setShowMatches(true); }
    }, 220);
    return () => clearTimeout(t);
  }, [searchTerm, customerId]);

  const balance = useMemo(() => (Number(salePrice) || 0) - (Number(deposit) || 0), [salePrice, deposit]);
  const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-IE");
  const sv = vehicles.find((v) => v.id === vehicleId);

  const contactName = company.trim() || `${firstName} ${lastName}`.trim();
  const customerOk = contactName.length >= 2;
  const saleOk = !!vehicleId && Number(salePrice) > 0;

  const clearIfPicked = () => { if (customerId) setCustomerId(null); };

  function pickMatch(m: CustomerMatch) {
    setCustomerId(m.id);
    setShowMatches(false);
    const isBiz = m.type === "business";
    const parts = (m.name || "").trim().split(/\s+/);
    setTitle(m.title ?? "");
    setCompany(m.company ?? (isBiz ? m.name : ""));
    setFirstName(m.first_name ?? (isBiz ? "" : parts[0] ?? ""));
    setLastName(m.last_name ?? (isBiz ? "" : parts.slice(1).join(" ")));
    setJobTitle(m.job_title ?? "");
    setDataConsent(m.data_consent ?? "");
    setMainPhone(m.phone ?? "");
    setDdiPhone(m.ddi_phone ?? "");
    setFax(m.fax ?? "");
    setMobile(m.mobile ?? "");
    setEmail(m.email ?? "");
    setAddress(m.address ?? "");
    setTown(m.town ?? "");
    setCounty(m.county ?? "");
    setPostCode(m.post_code ?? "");
    setCountry(m.country ?? "IE");
  }
  function clearPick() {
    setCustomerId(null);
    setShowMatches(false);
  }

  function selectCar(id: string) {
    setVehicleId(id);
    setSalePrice(String(priceFor(id) || ""));
  }

  function save() {
    setError("");
    start(async () => {
      const res = await createDealAndGo({
        customerId: customerId || undefined,
        newCustomer: customerId
          ? undefined
          : {
              name: contactName,
              type: company.trim() ? "business" : "individual",
              title: title || undefined,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              company: company || undefined,
              jobTitle: jobTitle || undefined,
              dataConsent: dataConsent || undefined,
              phone: mainPhone || undefined,
              ddiPhone: ddiPhone || undefined,
              fax: fax || undefined,
              mobile: mobile || undefined,
              email: email || undefined,
              address: address || undefined,
              town: town || undefined,
              county: county || undefined,
              postCode: postCode || undefined,
              country: country || undefined,
            },
        leadId: leadId || undefined,
        source: source || undefined,
        salespersonId: salespersonId || undefined,
        vehicleId,
        salePrice: Number(salePrice),
        vatScheme,
        depositAmount: deposit ? Number(deposit) : undefined,
        depositMethod: depositMethod || undefined,
        depositDate: depositDate || undefined,
        notes: notes || undefined,
      });
      if (res?.error) setError(res.error);
    });
  }

  const inp = "mt-1 studio-input";

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#0b0f17]/60 p-6 sm:p-8">
      {/* Car banner — the vehicle being sold */}
      {sv && (
        <div className="mb-6 rounded-xl border border-white/10 bg-gradient-to-r from-white/[0.05] to-transparent p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sky-400/80">Selling</p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-100">
                {[sv.year, sv.make, sv.model].filter(Boolean).join(" ")}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Window price</p>
              <p className="text-lg font-semibold tabular-nums text-slate-100">{sv.price ? eur(sv.price) : "—"}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <div><span className="text-slate-500">Reg </span><span className="font-mono text-slate-300">{sv.registration ?? "—"}</span></div>
            <div><span className="text-slate-500">Year </span><span className="text-slate-300">{sv.year ?? "—"}</span></div>
            <div><span className="text-slate-500">Km </span><span className="text-slate-300">{sv.km != null ? sv.km.toLocaleString("en-IE") : "—"}</span></div>
            <div><span className="text-slate-500">VAT </span><span className="text-slate-300">{SCHEMES.find(([v]) => v === vatScheme)?.[1].split(" ")[0]}</span></div>
          </div>
        </div>
      )}

      {/* Stepper header */}
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : undefined)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition ${
                i === step ? "bg-white/10 text-white" : i < step ? "text-sky-300 hover:bg-white/5" : "text-slate-500"
              }`}
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${i <= step ? "bg-gradient-to-br from-sky-400 to-violet-500 text-white" : "border border-white/15"}`}>{i + 1}</span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="text-slate-700">→</span>}
          </li>
        ))}
      </ol>

      {/* Step 1 — Contact (search or create) */}
      {step === 0 && (
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Search or create contact</h2>
            {customerId && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
                Existing contact
                <button type="button" onClick={clearPick} className="text-emerald-300/70 hover:text-white">✕</button>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">Start typing a name or company — we&apos;ll find existing contacts as you go.</p>

          {/* Identity */}
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_90px]">
            <label className="text-sm"><span className="text-slate-300">Company name</span>
              <input value={company} onChange={(e) => { setCompany(e.target.value); clearIfPicked(); }} className={inp} placeholder="Business (leave blank for a private buyer)" autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="Mr" autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">First name</span>
              <input value={firstName} onChange={(e) => { setFirstName(e.target.value); clearIfPicked(); }} className={inp} autoComplete="off" /></label>
            <label className="text-sm sm:col-start-1"><span className="text-slate-300">Last name</span>
              <input value={lastName} onChange={(e) => { setLastName(e.target.value); clearIfPicked(); }} className={inp} autoComplete="off" /></label>
          </div>

          {showMatches && !customerId && matches.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-1">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500">Existing contacts</p>
              <ul>
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => pickMatch(m)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5">
                      <span className="text-slate-100">{m.company || m.name}</span>
                      <span className="text-xs text-slate-500">{m.phone ?? m.mobile ?? m.email ?? m.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Details */}
          <div className="mt-5 grid gap-4 border-t border-white/5 pt-5 sm:grid-cols-2">
            <label className="text-sm"><span className="text-slate-300">Job title</span>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Data consent</span>
              <select value={dataConsent} onChange={(e) => setDataConsent(e.target.value)} className={inp}>
                {CONSENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-slate-300">Main phone</span>
              <input value={mainPhone} onChange={(e) => setMainPhone(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">DDI phone</span>
              <input value={ddiPhone} onChange={(e) => setDdiPhone(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Fax</span>
              <input value={fax} onChange={(e) => setFax(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Mobile</span>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm sm:col-span-2"><span className="text-slate-300">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm sm:col-span-2"><span className="text-slate-300">Address</span>
              <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Town</span>
              <input value={town} onChange={(e) => setTown(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">County</span>
              <input value={county} onChange={(e) => setCounty(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Post code</span>
              <input value={postCode} onChange={(e) => setPostCode(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Country</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className={inp}>
                {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
        </section>
      )}

      {/* Step 2 — Source & salesperson */}
      {step === 1 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Source &amp; salesperson</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-sm"><span className="text-slate-300">Lead source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inp}>
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-slate-300">Salesperson</span>
              <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className={inp}>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select></label>
            {leads.length > 0 && (
              <label className="text-sm sm:col-span-2"><span className="text-slate-300">From lead <span className="text-slate-500">(optional)</span></span>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={inp}>
                  <option value="">—</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select></label>
            )}
          </div>
        </section>
      )}

      {/* Step 3 — Car & deposit */}
      {step === 2 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Sale</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2"><span className="text-slate-300">Car</span>
                <select value={vehicleId} onChange={(e) => selectCar(e.target.value)} className={inp}>
                  {vehicles.length === 0 && <option value="">No cars in stock</option>}
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select></label>
              <div className="text-sm"><span className="text-slate-300">Sale price</span>
                <div className="mt-1 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <span className="text-lg font-semibold tabular-nums text-slate-100">{Number(salePrice) > 0 ? eur(Number(salePrice)) : "—"}</span>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">from listing</span>
                </div></div>
              <label className="text-sm"><span className="text-slate-300">VAT scheme</span>
                <select value={vatScheme} onChange={(e) => setVatScheme(e.target.value)} className={inp}>
                  {SCHEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></label>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Deposit</h2>
            <p className="mt-1 text-xs text-slate-500">A deposit reserves the car and moves it to &ldquo;reserved&rdquo;.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="text-sm"><span className="text-slate-300">Amount (€)</span>
                <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inp} /></label>
              <label className="text-sm"><span className="text-slate-300">Method</span>
                <select value={depositMethod} onChange={(e) => setDepositMethod(e.target.value)} className={inp}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></label>
              <label className="text-sm"><span className="text-slate-300">Date</span>
                <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className={inp} /></label>
            </div>
            <label className="mt-4 block text-sm"><span className="text-slate-300">Notes</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-6">
            <div className="text-sm">
              <span className="text-slate-400">Balance due </span>
              <span className="text-lg font-semibold tabular-nums text-slate-100">{eur(balance)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Nav */}
      <div className="mt-6 flex items-center gap-3 border-t border-white/5 pt-6">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Back</button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !customerOk}
            className="btn-gradient ml-auto disabled:opacity-50"
          >
            Continue →
          </button>
        ) : (
          <button type="button" onClick={save} disabled={!customerOk || !saleOk || pending} className="btn-gradient ml-auto disabled:opacity-50">
            {pending ? "Saving…" : "Create deal"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
