"use client";
import Link from "next/link";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveDealTerms} from "../actions";

export interface WarrantyChoice{id:string;name:string;terms:string}
export function DealTermsEditor({dealId,version,quoteTerms,notes,financeTerms,warrantyName,warranties}:{dealId:string;version:number;quoteTerms:string;notes:string;financeTerms:string;warrantyName:string|null;warranties:WarrantyChoice[]}){
  const router=useRouter();const [pending,start]=useTransition();const [terms,setTerms]=useState(quoteTerms);const [comments,setComments]=useState(notes);const [finance,setFinance]=useState(financeTerms);
  const [warrantyId,setWarrantyId]=useState(warranties.find(w=>w.name===warrantyName)?.id??"");const [error,setError]=useState("");const [saved,setSaved]=useState(false);
  function save(){setError("");setSaved(false);start(async()=>{const result=await saveDealTerms({dealId,expectedVersion:version,quoteTerms:terms,notes:comments,financeTerms:finance,warrantyId});if(result.error)setError(result.error);else{setSaved(true);router.refresh();}});}
  return <section className="studio-surface p-5"><div className="border-b border-white/10 pb-3"><h2 className="text-base font-semibold text-slate-100">Quote, warranty &amp; customer notes</h2><p className="mt-1 text-xs text-slate-400">The selected wording appears on new quotes, agreements and invoices. Previously issued documents stay unchanged.</p></div>
    <div className="mt-4 grid gap-4"><label className="text-sm text-slate-200">Quote terms<input value={terms} onChange={e=>setTerms(e.target.value)} maxLength={500} placeholder="For example: Quote valid for 7 days" className="studio-input mt-1"/></label>
    <label className="text-sm text-slate-200">Warranty<select value={warrantyId} onChange={e=>setWarrantyId(e.target.value)} className="studio-input mt-1"><option value="">No warranty selected</option>{warranties.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    {warrantyId&&<p className="border-l-2 border-slate-500 bg-white/[0.03] px-3 py-2 text-xs whitespace-pre-line text-slate-300">{warranties.find(w=>w.id===warrantyId)?.terms}</p>}
    {warrantyName&&!warranties.some(w=>w.name===warrantyName)&&<p className="text-xs text-amber-300">Current warranty “{warrantyName}” is no longer active. Choose a new option before saving.</p>}
    <label className="text-sm text-slate-200">Finance terms (if applicable)<textarea value={finance} onChange={e=>setFinance(e.target.value)} maxLength={1000} rows={3} placeholder="Payment schedule, APR or other agreed finance details" className="studio-input mt-1"/></label>
    <label className="text-sm text-slate-200">Additional notes printed on the customer document<textarea value={comments} onChange={e=>setComments(e.target.value)} maxLength={2000} rows={4} className="studio-input mt-1"/></label></div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={pending} className="btn-gradient text-xs disabled:opacity-40">{pending?"Saving…":"Save deal wording"}</button><Link href="/business/document-settings" className="text-xs text-sky-300">Manage warranties →</Link></div>{error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}{saved&&<p role="status" className="mt-2 text-xs text-emerald-300">Saved. Generate a new document to use these terms.</p>}
  </section>;
}
