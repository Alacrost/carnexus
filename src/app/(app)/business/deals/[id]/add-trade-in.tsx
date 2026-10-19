"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { TradeInWizard } from "../new/trade-in-wizard";
import type { TradeInInput } from "@/lib/trade-ins";
import { addTradeIn } from "../actions";

export function AddTradeIn({ dealId }: { dealId: string }) {
  const router=useRouter();
  const [trades,setTrades]=useState<TradeInInput[]>([]);
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState("");
  const [pending,start]=useTransition();
  const request=useRef("");
  function save(){
    if(trades.length!==1)return;
    setError("");
    start(async()=>{
      const result=await addTradeIn({dealId,trade:trades[0],requestId:request.current||=crypto.randomUUID()});
      if(result.error){setError(result.error);return;}
      request.current="";setTrades([]);router.refresh();
    });
  }
  return <div>
    <TradeInWizard trades={trades} onChange={next=>{request.current="";setTrades(next);}} onEditingChange={setEditing} maxTrades={1}/>
    {trades.length===1&&<button type="button" onClick={save} disabled={pending||editing} className="btn-gradient mt-4 px-4 py-2 text-xs disabled:opacity-40">{pending?"Saving…":"Confirm trade-in on this Deal"}</button>}
    {error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
  </div>;
}
