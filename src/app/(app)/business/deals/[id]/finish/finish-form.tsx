"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {finishDealReview} from "../../actions";

export function FinishForm({dealId,version,km,email,consent,blocked}:{dealId:string;version:number;km:number;email:string;consent:string;blocked:boolean}){
  const router=useRouter();const request=useRef("");const[pending,start]=useTransition();const[error,setError]=useState("");
  const[date,setDate]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"}));
  const[reading,setReading]=useState(String(km));const[unit,setUnit]=useState<"km"|"miles">("km");
  const[customerEmail,setEmail]=useState(email);const[choice,setChoice]=useState(consent);
  const[reviewed,setReviewed]=useState(false);
  return <form className="studio-surface p-5" onSubmit={event=>{event.preventDefault();if(blocked||!reviewed)return;start(async()=>{request.current||=crypto.randomUUID();const r=await finishDealReview({dealId,version,invoiceDate:date,odometer:Number(reading),unit,email:customerEmail.trim(),consent:choice,requestId:request.current});if(r.error){setError(r.error);request.current="";}else if(r.id)router.push(`/deal-doc/${dealId}/${r.id}`);});}}>
    <h2>Finish Deal</h2><p className="mt-3 text-sm text-slate-400">Review the customer, vehicle and balance above. Email and consent will update the customer contact only when the invoice is successfully issued.</p>
    <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm">Closing / invoice date<input required type="date" value={date} max={new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"})} onChange={e=>setDate(e.target.value)} className="studio-input mt-2"/><span className="mt-2 block text-xs text-slate-500">Existing backdating permissions and accounting-period rules apply.</span></label>
      <div><label className="text-sm">Delivery odometer reading<input required type="number" min="0" max="5000000" step="1" value={reading} onChange={e=>setReading(e.target.value)} className="studio-input mt-2"/></label><label className="mt-2 block text-xs">Unit<select aria-label="Odometer unit" value={unit} onChange={e=>{const next=e.target.value as "km"|"miles";setReading(reading===""?"":String(Math.round(Number(reading)*(next==="miles"?1/1.609344:1.609344))));setUnit(next);}} className="studio-input mt-1"><option value="km">Kilometres</option><option value="miles">Miles</option></select></label></div>
      <label className="text-sm">Customer email<input type="email" maxLength={200} value={customerEmail} onChange={e=>setEmail(e.target.value)} className="studio-input mt-2"/></label>
      <label className="text-sm">Data consent<select required value={choice} onChange={e=>setChoice(e.target.value)} className="studio-input mt-2"><option value="not_asked">Not asked</option><option value="refused">No consent given</option><option value="verbal">Verbal (over the phone)</option><option value="written">Written (signed job card or contract)</option><option value="electronic">Electronic (email or opt-in)</option></select></label>
    </div>
    <label className="my-5 flex items-center gap-3 border-y border-white/15 py-4 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I have reviewed the customer, vehicle, warranty and amounts above.</label>
    {blocked&&<p role="alert" className="mb-4 text-sm text-rose-300">Complete the vehicle’s purchase order before generating the invoice.</p>}
    {error&&<p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}
    <button type="submit" disabled={blocked||pending||!reviewed} className="deal-finish-button px-6 py-3 text-sm font-semibold disabled:opacity-40">{pending?"Issuing invoice…":"Confirm & generate invoice"}</button>
    <p className="mt-3 text-xs text-slate-500">Any outstanding balance remains due. This action does not register a payment.</p>
  </form>;
}
