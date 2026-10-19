"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveTaxSettings} from "../business/accounting/tax-actions";

export function FinancialTaxForm({defaultVatScheme,standardVatRate}:{defaultVatScheme:string;standardVatRate:number}){
  const router=useRouter();const[scheme,setScheme]=useState(defaultVatScheme);const[rate,setRate]=useState(String(standardVatRate));const[pending,start]=useTransition();const[error,setError]=useState("");const[saved,setSaved]=useState(false);
  return <form className="mt-4 space-y-3" onSubmit={event=>{event.preventDefault();setError("");setSaved(false);start(async()=>{
    const result=await saveTaxSettings({defaultVatScheme:scheme,standardVatRate:Number(rate)});
    if(result.error)setError(result.error);else{setSaved(true);router.refresh();}
  });}}>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Default purchase VAT scheme<select value={scheme} onChange={event=>setScheme(event.target.value)} className="studio-input mt-1"><option value="none">No VAT</option><option value="standard">Standard</option><option value="margin">Margin scheme</option></select></label><label className="text-sm">Standard VAT rate (%)<input className="studio-input mt-1" required type="number" min="0" max="100" step="0.01" value={rate} onChange={event=>setRate(event.target.value)}/></label></div>
    <p className="text-xs text-slate-400">Defaults apply to new purchase orders. Each purchase keeps its selected scheme and rate for the sale; issued documents retain their original figures.</p>
    <button className="btn-gradient" disabled={pending||rate===""||!Number.isFinite(Number(rate))||Number(rate)<0||Number(rate)>100}>{pending?"Saving…":"Save financial settings"}</button>
    {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}{saved&&<p role="status" className="text-sm text-emerald-300">Financial defaults saved.</p>}
  </form>;
}
