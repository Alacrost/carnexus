"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {saveDealTerms} from "./actions";

export function DealWarrantySelect({dealId,version,name,choices,quoteTerms,comments,financeTerms,canEdit,loadError}:{dealId:string;version:number;name:string|null;choices:{id:string;name:string;terms:string}[];quoteTerms:string;comments:string;financeTerms:string;canEdit:boolean;loadError:boolean}){
  const currentId=choices.find(choice=>choice.name===name)?.id??(name?"current":"");
  const [value,setValue]=useState(currentId);
  const [error,setError]=useState("");
  const [pending,start]=useTransition();
  const router=useRouter();
  function change(next:string){
    setValue(next);setError("");
    start(async()=>{
      const result=await saveDealTerms({dealId,expectedVersion:version,warrantyId:next,quoteTerms,notes:comments,financeTerms});
      if(result.error){setValue(currentId);setError(result.error);return;}
      router.refresh();
    });
  }
  return <div><label className="text-sm text-slate-200">Warranty<select value={value} onChange={event=>change(event.target.value)} disabled={!canEdit||pending||loadError} className="studio-input mt-1"><option value="">No warranty selected</option>{currentId==="current"&&<option value="current" disabled>{name}</option>}{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>{pending&&<p role="status" className="mt-1 text-xs text-slate-400">Saving warranty…</p>}{(error||loadError)&&<p role="alert" className="mt-1 text-xs text-rose-300">{error||"Warranty options could not load. Retry before changing the warranty."}</p>}</div>;
}
