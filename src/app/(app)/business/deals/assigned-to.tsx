"use client";

import {useEffect,useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {setDealSalesperson} from "./assignment-actions";

export function AssignedTo({value,label,options,canEdit,onChange,dealId,version=1,title="Assigned to"}:{value:string;label:string;options:{id:string;label:string}[];canEdit:boolean;onChange?:(value:string)=>void;dealId?:string;version?:number;title?:string}){
  const [editing,setEditing]=useState(false);
  const [selection,setSelection]=useState(value);
  const [confirmed,setConfirmed]=useState({id:value,label,version});
  const [error,setError]=useState("");
  const [uncertain,setUncertain]=useState(false);
  const [pending,start]=useTransition();
  const request=useRef("");
  const router=useRouter();
  useEffect(()=>{
    if(editing||pending)return;
    // Reconcile authoritative server props; a delayed refresh must not undo a newer save.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmed(current=>version<current.version||current.id===value&&current.label===label&&current.version===version?current:{id:value,label,version});
  },[value,label,version,editing,pending]);
  const shown=dealId?confirmed.label:label;
  function save(){
    if(!canEdit||pending)return;
    if(!dealId){onChange?.(selection);setEditing(false);return;}
    setError("");
    start(async()=>{
      request.current||=crypto.randomUUID();
      try{
        const result=await setDealSalesperson({dealId,salespersonId:selection,version:confirmed.version,requestId:request.current});
        if(result.error||!result.saved){setError(result.error??"Assignment could not be saved.");setUncertain(Boolean(result.uncertain));if(!result.uncertain){request.current="";router.refresh();}return;}
        setConfirmed({id:result.saved.salespersonId,label:options.find(person=>person.id===result.saved!.salespersonId)?.label??shown,version:result.saved.version});
        setUncertain(false);request.current="";setEditing(false);router.refresh();
      }catch{setError("Connection interrupted. Retry the same assignment to confirm its result.");setUncertain(true);}
    });
  }
  return <div className="min-w-0"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">{title}</span>{canEdit&&!editing&&<button type="button" aria-label={`Edit ${title.toLowerCase()}`} onClick={()=>{setSelection(dealId?confirmed.id:value);setError("");setEditing(true);}} className="rounded border border-slate-400/40 px-2 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" style={{backgroundColor:"#eef1eb",color:"#29392c",WebkitTextFillColor:"#29392c"}}>Edit</button>}</div>
    {!editing?<p className="mt-1 break-words text-sm font-semibold text-slate-200">{shown||"Not assigned"}</p>:<div className="mt-2 space-y-2"><select aria-label={title} value={selection} disabled={pending||uncertain} onChange={event=>{setSelection(event.target.value);request.current="";}} className="studio-input text-sm">{!options.some(person=>person.id===selection)&&<option value={selection}>{shown||"Not assigned"}</option>}{options.map(person=><option key={person.id} value={person.id}>{person.label}</option>)}</select><div className="flex flex-wrap gap-2"><button type="button" disabled={pending||!selection} onClick={save} className="btn-outline text-xs disabled:opacity-50">{pending?"Saving…":uncertain?"Retry assignment":"Done"}</button><button type="button" disabled={pending||uncertain} onClick={()=>{setEditing(false);setError("");}} className="btn-outline text-xs disabled:opacity-50">Cancel</button></div>{error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}</div>}
  </div>;
}
