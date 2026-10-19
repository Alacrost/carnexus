"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {loadTradeInForEdit,editTradeIn} from "../actions";
import {TradeInWizard} from "../new/trade-in-wizard";
import type {TradeInInput} from "@/lib/trade-ins";

export function EditTradeIn({dealId,vehicleId,version}:{dealId:string;vehicleId:string;version:number}){
  const router=useRouter();const[trades,setTrades]=useState<TradeInInput[]|null>(null);const[editing,setEditing]=useState(true);const[error,setError]=useState("");const[pending,start]=useTransition();
  function open(){setError("");start(async()=>{const result=await loadTradeInForEdit(dealId,vehicleId);if(result.error)setError(result.error);else if(result.trade){setTrades([result.trade]);setEditing(true);}});}
  function save(){if(!trades?.[0]||editing)return;setError("");start(async()=>{const result=await editTradeIn({dealId,vehicleId,version,trade:trades[0],requestId:crypto.randomUUID()});if(result.error)setError(result.error);else{setTrades(null);router.refresh();}});}
  return <div className="mt-3">{trades?<div className="border border-slate-400/30 p-4"><p className="mb-3 text-xs text-slate-300">Changes update this trade-in&apos;s PO and Deal balance. Generate a new agreement after saving. Previously recorded history findings remain in the audit record.</p><TradeInWizard trades={trades} onChange={setTrades} onEditingChange={setEditing} maxTrades={1} startEditing/><div className="mt-3 flex gap-2"><button type="button" onClick={save} disabled={pending||editing||!trades.length} className="btn-gradient px-3 py-2 text-xs disabled:opacity-40">{pending?"Saving…":"Confirm changes to Deal"}</button><button type="button" onClick={()=>setTrades(null)} disabled={pending} className="border border-slate-400/40 px-3 py-2 text-xs">Cancel edit</button></div></div>:<button type="button" onClick={open} disabled={pending} className="border border-slate-400/40 px-3 py-2 text-xs font-semibold text-slate-200">{pending?"Loading…":"Edit trade-in"}</button>}{error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}</div>;
}
