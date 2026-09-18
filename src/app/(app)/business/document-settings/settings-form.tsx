"use client";
import { useActionState } from "react";
import { saveDocumentSettings } from "../deals/actions";
export function DocumentSettingsForm({values}:{values:Record<string,string>}) {
  const [state,action,pending]=useActionState(saveDocumentSettings,{});
  return <form action={action} className="studio-surface mt-6 grid max-w-3xl gap-4 p-6 sm:grid-cols-2">{[
    ["legal_name","Registered / trading name"],["address","Full business address"],["vat_number","VAT number"],["company_number","Company registration number"],["phone","Telephone"],["email","Email"],["bank_details","Payment / bank instructions"],["agreement_terms","Agreement terms"],["invoice_notes","Invoice notes"],
  ].map(([name,label])=><label key={name} className="text-sm">{label}{["address","bank_details","agreement_terms","invoice_notes"].includes(name)?<textarea name={name} defaultValue={values[name]??""} rows={name==="agreement_terms"?8:3} required={name==="address"} maxLength={name==="agreement_terms"?5000:2000} className="studio-input mt-1"/>:<input name={name} defaultValue={values[name]??""} required={name==="legal_name"} maxLength={200} className="studio-input mt-1"/>}</label>)}<div className="sm:col-span-2"><button disabled={pending} className="btn-gradient">Save document settings</button>{state.error&&<p role="alert" className="mt-2 text-rose-300">{state.error}</p>}{state.saved&&<p role="status" className="mt-2 text-emerald-300">Saved. Previously issued documents remain unchanged.</p>}</div></form>;
}
