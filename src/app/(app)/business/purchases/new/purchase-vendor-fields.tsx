import type { CustomerMatch } from "../../customers/actions";
import type { PurchaseVendorInput } from "@/lib/purchase-vendor";

export type PurchaseVendorValues = {
  [Key in keyof Required<PurchaseVendorInput>]: Key extends "type" ? "individual" | "business" : string;
};

export const emptyPurchaseVendor: PurchaseVendorValues = {
  name: "", type: "individual", business_name: "", title: "", first_name: "", last_name: "", job_title: "",
  phone: "", mobile: "", ddi_phone: "", fax: "", email: "", address_line1: "", address_line2: "",
  city: "", county: "", eircode: "", country: "IE", vat_number: "", notes: "",
};

const countries = [["IE", "Ireland"], ["GB", "United Kingdom"], ["CA", "Canada"]] as const;
const inputClass = "mt-1 w-full studio-input read-only:bg-[#f3f0e8] disabled:opacity-70";

type Props = {
  value: PurchaseVendorValues;
  onChange: (patch: Partial<PurchaseVendorValues>) => void;
  existing: boolean;
  onChangeVendor: () => void;
  matches: CustomerMatch[];
  showMatches: boolean;
  onPick: (match: CustomerMatch) => void;
};

export function PurchaseVendorFields({ value, onChange, existing, onChangeVendor, matches, showMatches, onPick }: Props) {
  const company = value.type === "business";
  const countyLabel = value.country === "CA" ? "Province / territory" : value.country === "GB" ? "County / region" : "County";
  const postCodeLabel = value.country === "IE" ? "Eircode" : value.country === "GB" ? "Postcode" : "Postal code";

  return <section aria-labelledby="purchase-vendor-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="purchase-vendor-heading" className="text-sm font-semibold uppercase tracking-wider text-slate-300">Vendor</h2>
      {existing && <button type="button" onClick={onChangeVendor} className="btn-outline text-xs">Change vendor</button>}
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-500">{existing ? "Existing contact selected. These details are shown for reference and will not be changed by this purchase." : "Search your contacts by name, or enter a new vendor. Only the name is required for the contact; other details are optional."}</p>

    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm"><span className="text-slate-300">Contact type</span>
        <select value={value.type} disabled={existing} onChange={event => {
          const type = event.target.value as PurchaseVendorValues["type"];
          onChange({ type, business_name: type === "business" ? value.name : "" });
        }} className={inputClass}><option value="individual">Person</option><option value="business">Company</option></select>
      </label>
      <label className="text-sm"><span className="text-slate-300">Country</span>
        <select value={value.country} disabled={existing} onChange={event => onChange({ country: event.target.value })} className={inputClass}>
          {existing && !countries.some(([code]) => code === value.country) && <option value={value.country}>{value.country || "Not recorded"}</option>}
          {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </label>
      <div className="relative sm:col-span-2">
        <label className="block text-sm"><span className="text-slate-300">{company ? "Company name" : "Full name"} <span className="text-xs text-slate-500">required</span></span>
          <input required minLength={2} maxLength={120} value={value.name} readOnly={existing} onChange={event => onChange({ name: event.target.value, ...(company ? { business_name: event.target.value } : {}) })} className={inputClass} placeholder={company ? "Search or enter company name" : "Search or enter full name"} autoComplete="off" aria-controls={showMatches ? "purchase-vendor-matches" : undefined} />
        </label>
        {showMatches && value.name.trim().length >= 2 && !existing && matches.length > 0 && <ul id="purchase-vendor-matches" aria-label="Matching contacts" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded border border-[#c9c8bc] bg-[#fffdf7] shadow-lg">
          {matches.map(match => <li key={match.id}><button type="button" onClick={() => onPick(match)} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-[#f3f0e8]">
            <span className="font-medium text-slate-100">{match.company || match.name}</span><span className="text-xs text-slate-500">{match.phone ?? match.email ?? match.type}</span>
          </button></li>)}
        </ul>}
      </div>
    </div>

    <fieldset className="mt-5 border-t border-[#d3cfc3] pt-4">
      <legend className="px-2 text-xs font-semibold text-slate-300">{company ? "Contact person" : "Personal details"} · optional</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm"><span className="text-slate-300">Title</span><input maxLength={20} value={value.title} readOnly={existing} onChange={event => onChange({ title: event.target.value })} className={inputClass} placeholder="e.g. Mr, Ms, Dr" /></label>
        <label className="text-sm"><span className="text-slate-300">First name</span><input maxLength={80} value={value.first_name} readOnly={existing} onChange={event => onChange({ first_name: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">Last name</span><input maxLength={80} value={value.last_name} readOnly={existing} onChange={event => onChange({ last_name: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">Job title</span><input maxLength={80} value={value.job_title} readOnly={existing} onChange={event => onChange({ job_title: event.target.value })} className={inputClass} /></label>
      </div>
    </fieldset>

    <fieldset className="mt-5 border-t border-[#d3cfc3] pt-4">
      <legend className="px-2 text-xs font-semibold text-slate-300">Contact details · optional</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm"><span className="text-slate-300">Phone</span><input type="tel" maxLength={40} value={value.phone} readOnly={existing} onChange={event => onChange({ phone: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">Mobile</span><input type="tel" maxLength={40} value={value.mobile} readOnly={existing} onChange={event => onChange({ mobile: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">Email</span><input type="email" maxLength={200} value={value.email} readOnly={existing} onChange={event => onChange({ email: event.target.value })} className={inputClass} /></label>
      </div>
      <details className="mt-4" open={Boolean(existing && (value.ddi_phone || value.fax)) || undefined}>
        <summary className="w-fit cursor-pointer py-1 text-xs font-medium text-slate-400">Direct dial &amp; fax</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm"><span className="text-slate-300">Direct dial (DDI)</span><input type="tel" maxLength={40} value={value.ddi_phone} readOnly={existing} onChange={event => onChange({ ddi_phone: event.target.value })} className={inputClass} /></label>
          <label className="text-sm"><span className="text-slate-300">Fax</span><input type="tel" maxLength={40} value={value.fax} readOnly={existing} onChange={event => onChange({ fax: event.target.value })} className={inputClass} /></label>
        </div>
      </details>
    </fieldset>

    <fieldset className="mt-5 border-t border-[#d3cfc3] pt-4">
      <legend className="px-2 text-xs font-semibold text-slate-300">Address · optional</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm sm:col-span-2 lg:col-span-3"><span className="text-slate-300">Address line 1</span><input maxLength={500} value={value.address_line1} readOnly={existing} onChange={event => onChange({ address_line1: event.target.value })} className={inputClass} /></label>
        <label className="text-sm sm:col-span-2 lg:col-span-3"><span className="text-slate-300">Address line 2</span><input maxLength={160} value={value.address_line2} readOnly={existing} onChange={event => onChange({ address_line2: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">Town / city</span><input maxLength={80} value={value.city} readOnly={existing} onChange={event => onChange({ city: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">{countyLabel}</span><input maxLength={80} value={value.county} readOnly={existing} onChange={event => onChange({ county: event.target.value })} className={inputClass} /></label>
        <label className="text-sm"><span className="text-slate-300">{postCodeLabel}</span><input maxLength={16} value={value.eircode} readOnly={existing} onChange={event => onChange({ eircode: event.target.value })} className={inputClass} /></label>
      </div>
    </fieldset>

    <div className="mt-5 grid gap-4 border-t border-[#d3cfc3] pt-4 sm:grid-cols-3">
      <label className="text-sm"><span className="text-slate-300">{value.country === "CA" ? "Tax registration number" : "VAT number"} <span className="text-xs text-slate-500">optional</span></span><input maxLength={40} value={value.vat_number} readOnly={existing} onChange={event => onChange({ vat_number: event.target.value })} className={inputClass} /></label>
      <label className="text-sm sm:col-span-2"><span className="text-slate-300">Contact notes <span className="text-xs text-slate-500">optional</span></span><textarea rows={2} maxLength={2000} value={value.notes} readOnly={existing} onChange={event => onChange({ notes: event.target.value })} className={inputClass} /></label>
    </div>
  </section>;
}
