"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {savePurchaseTaxDetails} from "./actions";
import {ImportVrtFields} from "./import-vrt-fields";

export interface PurchaseTaxValues {vatScheme:string;vatRate:number;imported:boolean;vrtAmount:number;vrtVatTreatment:"included"|"excluded"}

export function PurchaseTaxForm({poId,values}:{poId:string;values:PurchaseTaxValues}){
  const router=useRouter();const[pending,start]=useTransition();const[error,setError]=useState("");const[saved,setSaved]=useState(false);
  const[scheme,setScheme]=useState(values.vatScheme);const[rate,setRate]=useState(String(values.vatRate));
  const[imported,setImported]=useState(values.imported);const[vrt,setVrt]=useState(String(values.vrtAmount));const[treatment,setTreatment]=useState(values.vrtVatTreatment);
  return <form className="mt-4 space-y-3" onSubmit={event=>{event.preventDefault();setError("");setSaved(false);start(async()=>{
    const result=await savePurchaseTaxDetails({poId,vatScheme:scheme,vatRate:Number(rate),imported,vrtAmount:Number(vrt),vrtVatTreatment:treatment});
    if(result.error)setError(result.error);else{setSaved(true);router.refresh();}
  });}}>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Purchase VAT scheme<select value={scheme} onChange={event=>setScheme(event.target.value)} className="studio-input mt-1"><option value="none">No VAT</option><option value="standard">Standard</option><option value="margin">Margin scheme</option></select></label>{scheme==="standard"&&<label className="text-sm">VAT rate (%)<input required className="studio-input mt-1" type="number" min="0" max="100" step="0.01" value={rate} onChange={event=>setRate(event.target.value)}/></label>}</div>
    <ImportVrtFields imported={imported} vrtAmount={vrt} vrtVatTreatment={treatment} onImported={setImported} onAmount={setVrt} onTreatment={setTreatment}/>
    <p className="text-xs text-slate-400">Changes apply to the linked open Deal and newly issued documents. Existing document snapshots stay unchanged. The supplier balance remains separate from VRT.</p>
    <button className="btn-gradient" disabled={pending||rate===""||!Number.isFinite(Number(rate))||Number(rate)<0||Number(rate)>100||!Number.isFinite(Number(vrt))||Number(vrt)<0}>{pending?"Saving…":"Save purchase tax details"}</button>
    {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}{saved&&<p role="status" className="text-sm text-emerald-300">Purchase tax details saved.</p>}
  </form>;
}
