"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveDealReference} from "./reference-actions";

export interface BusinessReference {id:string;name:string;text:string;active:boolean}
export function ReferenceManager({kind,rows}:{kind:"warranty"|"finance";rows:BusinessReference[]}){
  const router=useRouter();const [pending,start]=useTransition();const [editing,setEditing]=useState<BusinessReference|null>(null);
  const [name,setName]=useState("");const [body,setBody]=useState("");const [error,setError]=useState("");
  const warranty=kind==="warranty";
  function edit(row:BusinessReference){setEditing(row);setName(row.name);setBody(row.text);setError("");}
  function clear(){setEditing(null);setName("");setBody("");setError("");}
  function save(active=true){setError("");start(async()=>{const result=await saveDealReference({kind,id:editing?.id??"",name,text:body,active});if(result.error)setError(result.error);else{clear();router.refresh();}});}
  return <section className="studio-surface p-5">
    <div className="border-b border-white/10 pb-3"><h2 className="text-base font-semibold text-slate-100">{warranty?"Warranty options":"Finance companies"}</h2><p className="mt-1 text-xs text-slate-400">{warranty?"Reusable warranty wording for quotes, agreements and invoices. A Deal stores a copy of the selected wording.":"Saved invoice recipients. A Deal stores the selected company name and invoice address."}</p></div>
    <div className="mt-3 space-y-2">{rows.length===0&&<p className="text-sm text-slate-500">No saved options yet.</p>}{rows.map(row=><div key={row.id} className="flex items-start justify-between gap-3 border-b border-white/10 py-2"><div><p className="text-sm font-medium text-slate-100">{row.name}{!row.active&&<span className="ml-2 text-xs text-amber-300">Inactive</span>}</p><p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-400">{row.text}</p></div><button type="button" onClick={()=>edit(row)} className="shrink-0 border border-white/15 px-3 py-1 text-xs text-slate-200 hover:bg-white/10">Edit</button></div>)}</div>
    <div className="mt-4 space-y-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{editing?`Edit ${editing.name}`:`Add ${warranty?"warranty":"finance company"}`}</h3><label className="block text-xs text-slate-300">Name<input value={name} onChange={e=>setName(e.target.value)} maxLength={warranty?100:120} className="studio-input mt-1"/></label><label className="block text-xs text-slate-300">{warranty?"Warranty coverage and conditions":"Invoice address"}<textarea value={body} onChange={e=>setBody(e.target.value)} rows={warranty?5:3} maxLength={warranty?3000:500} className="studio-input mt-1"/></label><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>save(true)} disabled={pending||name.trim().length<2||body.trim().length<5} className="btn-gradient text-xs disabled:opacity-40">{pending?"Saving…":editing?"Save option":"Add option"}</button>{editing&&<><button type="button" onClick={()=>save(!editing.active)} disabled={pending} className="border border-white/15 px-3 py-2 text-xs text-slate-200">{editing.active?"Deactivate":"Reactivate"}</button><button type="button" onClick={clear} className="px-3 py-2 text-xs text-slate-400">Cancel</button></>}</div>{error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}</div>
  </section>;
}
