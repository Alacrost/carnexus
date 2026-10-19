"use client";

import {useRouter} from "next/navigation";
import {useState,useTransition} from "react";
import {confirmVehicleHistoryDisclosure} from "../actions";

const LABELS:{key:"accident"|"writeOff"|"stolen"|"mileageDiscrepancy";label:string}[]=[
  {key:"accident",label:"Accident history"},{key:"writeOff",label:"Write-off history"},
  {key:"stolen",label:"Stolen vehicle history"},{key:"mileageDiscrepancy",label:"Mileage discrepancy"},
];
export interface VehicleFindings{accident:boolean;writeOff:boolean;stolen:boolean;mileageDiscrepancy:boolean;reportIds:string[]}

export function VehicleHistoryDisclosure({dealId,findings,confirmed,canConfirm}:{dealId:string;findings:VehicleFindings;confirmed:boolean;canConfirm:boolean}){
  const router=useRouter();const[method,setMethod]=useState<"verbal"|"written">("written");const[reference,setReference]=useState("");const[checked,setChecked]=useState(false);const[error,setError]=useState("");const[pending,start]=useTransition();
  const positives=LABELS.filter(item=>findings[item.key]);
  if(!positives.length)return null;
  function save(){if(!checked)return;setError("");start(async()=>{const result=await confirmVehicleHistoryDisclosure({dealId,method,reference});if(result.error)setError(result.error);else router.refresh();});}
  return <section className="studio-surface border-amber-300/30 p-4"><h2 className="text-sm font-semibold text-amber-100">Vehicle history · buyer disclosure required</h2><p className="mt-1 text-xs text-slate-300">The car has reported findings. Explain every finding to the buyer and record their confirmation before issuing an invoice.</p><ul className="mt-3 space-y-1 border-l-2 border-amber-300/60 pl-3 text-sm text-amber-100">{positives.map(item=><li key={item.key}>{item.label}</li>)}</ul>{confirmed?<p className="mt-3 text-xs font-semibold text-emerald-200">Buyer confirmation recorded for the current reports and customer.</p>:canConfirm?<div className="mt-4 border-t border-white/10 pt-3"><label className="text-xs text-slate-200">How consent was confirmed<select value={method} onChange={event=>setMethod(event.target.value as "verbal"|"written")} className="studio-input mt-1"><option value="written">Written</option><option value="verbal">Verbal</option></select></label><label className="mt-3 block text-xs text-slate-200">Evidence or conversation reference (optional)<input value={reference} onChange={event=>setReference(event.target.value)} maxLength={200} className="studio-input mt-1"/></label><label className="mt-3 flex gap-2 text-xs text-slate-100"><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/> I explained all listed findings to the buyer and they confirmed they understand.</label><button type="button" onClick={save} disabled={!checked||pending} className="btn-gradient mt-3 px-4 py-2 text-xs disabled:opacity-40">{pending?"Recording…":"Record buyer disclosure"}</button>{error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}</div>:<p className="mt-3 text-xs text-amber-200">Awaiting buyer confirmation. Invoice generation is blocked.</p>}</section>;
}
