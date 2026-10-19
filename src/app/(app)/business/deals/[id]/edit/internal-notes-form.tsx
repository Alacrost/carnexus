"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveInternalNotes} from "./internal-notes-actions";
export function InternalNotesForm({dealId,version,notes}:{dealId:string;version:number;notes:string}){
  const[value,setValue]=useState(notes);const[error,setError]=useState("");const[message,setMessage]=useState("");const[pending,start]=useTransition();const router=useRouter();
  return <section className="studio-surface p-5"><h2>Additional Notes</h2><p className="my-3 text-xs text-slate-500">Internal Deal notes. Not printed on the customer’s quote, agreement or invoice.</p><form onSubmit={e=>{e.preventDefault();start(async()=>{setError("");setMessage("");const r=await saveInternalNotes({dealId,version,notes:value});if(r.error)setError(r.error);else{setMessage("Notes saved.");router.refresh();}});}}><label className="sr-only" htmlFor="deal-internal-notes">Additional Notes</label><textarea id="deal-internal-notes" rows={4} maxLength={4000} value={value} onChange={e=>setValue(e.target.value)} className="studio-input"/><button disabled={pending} className="btn-gradient mt-3">{pending?"Saving…":"Save notes"}</button>{error&&<p role="alert" className="mt-2 text-rose-300">{error}</p>}{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</form></section>;
}
