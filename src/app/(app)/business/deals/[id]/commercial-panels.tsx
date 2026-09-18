"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeDealStatus, changeSalePrice, saveDealFinance } from "../actions";
export function StatusButton({id,status,label}:{id:string;status:string;label:string}) {
  const [error,setError]=useState(""); const [pending,start]=useTransition(); const router=useRouter();
  return <div><button className="btn-gradient text-xs" disabled={pending} onClick={()=>start(async()=>{const r=await changeDealStatus(id,status);setError(r.error??"");if(!r.error)router.refresh();})}>{pending?"Saving…":label}</button>{error&&<p role="alert" className="mt-2 max-w-sm text-xs text-rose-300">{error}</p>}</div>;
}
export function PriceEditor({id,version,price}:{id:string;version:number;price:number}) {
  const [open,setOpen]=useState(false); const [state,action,pending]=useActionState(changeSalePrice,{});
  return <div className="mt-3"><button type="button" onClick={()=>setOpen(!open)} className="text-sm text-sky-300">{open?"Close price editor":"Edit sale price"}</button>{open&&<form action={action} className="mt-3 space-y-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label className="block text-sm">New sale price (€)<input name="price" type="number" min="0.01" step="0.01" required defaultValue={price} className="studio-input"/></label><label className="block text-sm">Reason<input name="reason" required minLength={3} maxLength={500} className="studio-input"/></label><p className="text-xs text-slate-400">Changing the price requires a new agreement before completion.</p><button disabled={pending} className="btn-gradient">Save price</button>{state.error&&<p role="alert" className="text-rose-300">{state.error}</p>}{state.saved&&<p role="status" className="text-emerald-300">Price updated and audited.</p>}</form>}</div>;
}
export interface FinanceValues { finance_company?:string|null;finance_reference?:string|null;finance_expected?:number;finance_status?:string;finance_address?:string|null;invoice_to_finance?:boolean }
export function FinancePanel({id,values,closed}:{id:string;values:FinanceValues;closed:boolean}) {
  const [state,action,pending]=useActionState(saveDealFinance,{});
  return <section className="studio-surface p-4"><h2 className="text-sm font-semibold">Finance & invoice recipient</h2><p className="my-2 text-xs text-slate-400">Expected funding is not a payment. Record the lender payout only when received. Issued documents retain their original details.</p><form action={action} className="space-y-3"><input type="hidden" name="id" value={id}/><fieldset disabled={closed||pending} className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Finance company<input name="finance_company" defaultValue={values.finance_company??""} maxLength={120} className="studio-input"/></label>
    <label className="text-sm">Agreement/reference<input name="finance_reference" defaultValue={values.finance_reference??""} maxLength={120} className="studio-input"/></label>
    <label className="text-sm">Expected payout (€)<input name="finance_expected" type="number" min="0" step="0.01" defaultValue={values.finance_expected??0} className="studio-input"/></label>
    <label className="text-sm">Approval status<select name="finance_status" defaultValue={values.finance_status??"none"} className="studio-input"><option value="none">No finance</option><option value="pending">Pending lender approval</option><option value="approved">Approved by lender (recorded manually)</option></select></label>
    <label className="text-sm sm:col-span-2">Finance company invoice address<textarea name="finance_address" maxLength={500} defaultValue={values.finance_address??""} className="studio-input"/></label>
    <label className="text-sm sm:col-span-2"><input type="checkbox" name="invoice_to_finance" defaultChecked={values.invoice_to_finance}/> Invoice to finance company; retain customer as vehicle recipient</label>
    {!closed&&<button className="btn-gradient">Save finance details</button>}
  </fieldset>{state.error&&<p role="alert" className="text-rose-300">{state.error}</p>}{state.saved&&<p role="status" className="text-emerald-300">Saved. Issue a new agreement for these terms.</p>}</form></section>;
}
