"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {removePaymentEntry} from "../actions";
export function ReversePayment({paymentId}:{paymentId:string}){
  const router=useRouter();const [pending,start]=useTransition();const [error,setError]=useState("");const request=useRef("");
  return <div><button type="button" disabled={pending} title="Correct a payment entered by mistake. The balance is recalculated and the removal is recorded in the Deal log. This does not refund money." className="rounded-sm text-xs font-medium text-rose-400 underline decoration-rose-400/40 underline-offset-4 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50" onClick={()=>{setError("");request.current||=crypto.randomUUID();start(async()=>{const result=await removePaymentEntry({paymentId,requestId:request.current});if(result.error)setError(result.error);else router.refresh();});}}>{pending?"Removing…":"Remove"}</button>{error&&<p role="alert" className="mt-2 text-xs leading-relaxed text-rose-400">{error}</p>}</div>;
}
