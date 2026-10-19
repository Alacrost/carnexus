"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fillPurchaseIntakeAction } from "../actions";

export function CompletePurchaseIntake({poId,invoiceRef,purchaseDate,receivedOn}:{poId:string;invoiceRef:string|null;purchaseDate:string|null;receivedOn:string|null}){
  const router=useRouter();
  const [state,action,pending]=useActionState(fillPurchaseIntakeAction,{});
  useEffect(()=>{if(state.saved)router.refresh();},[state.saved,router]);
  const today=new Date().toISOString().slice(0,10);
  return <section id="complete-intake" className="studio-surface border-l-4 border-l-amber-600 p-4">
    <h2 className="text-base font-semibold text-[#191918]">Complete purchase order details</h2>
    <p className="mt-1 text-xs text-[#595955]">Only missing intake fields can be filled here. Existing values remain unchanged; the correction is audited.</p>
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="po_id" value={poId}/>
      <label className="text-xs font-semibold text-[#464642]">Supplier invoice reference<input name="inv_ref" required maxLength={80} defaultValue={invoiceRef??""} readOnly={!!invoiceRef?.trim()} className="studio-input mt-1 w-full text-sm"/></label>
      <label className="text-xs font-semibold text-[#464642]">Purchase date<input name="purchase_date" type="date" required max={today} defaultValue={purchaseDate??""} readOnly={!!purchaseDate} className="studio-input mt-1 w-full text-sm"/></label>
      <label className="text-xs font-semibold text-[#464642]">Arrived at dealership<input name="received_on" type="date" required max={today} defaultValue={receivedOn??""} readOnly={!!receivedOn} className="studio-input mt-1 w-full text-sm"/></label>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3"><button disabled={pending} className="border border-[#171717] bg-[#171717] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#353535] disabled:opacity-50">{pending?"Saving…":"Complete PO details"}</button>{state.error&&<p role="alert" className="text-xs font-semibold text-rose-700">{state.error}</p>}{state.saved&&<p role="status" className="text-xs font-semibold text-emerald-700">Saved. The pending item will clear.</p>}</div>
    </form>
  </section>;
}
