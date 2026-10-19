"use client";

import type {ReactNode} from "react";

const METHODS=[["","—"],["cash","Cash"],["bank","Bank transfer"],["eft","EFT"],["cheque","Cheque"],["draft","Bank draft"],["card","Card"],["finance","Finance"]];

export function DealPaymentEntry({amount,method,date,reference,confirmed,onAmount,onMethod,onDate,onReference,onConfirmed,onAdd,disabled,buttonLabel,typeControl,maxDate}:{amount:string;method:string;date:string;reference:string;confirmed:boolean;onAmount:(value:string)=>void;onMethod:(value:string)=>void;onDate:(value:string)=>void;onReference:(value:string)=>void;onConfirmed:(value:boolean)=>void;onAdd:()=>void;disabled:boolean;buttonLabel:string;typeControl?:ReactNode;maxDate?:string}){
  return <div className="crm-payment-entry mt-4 border-t border-[#c9c8bc] pt-4">
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      <label className="text-sm"><span className="text-slate-300">Amount (€)</span><input aria-label="Payment amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>onAmount(e.target.value)} className="studio-input mt-1"/></label>
      <label className="text-sm"><span className="text-slate-300">Method</span><select aria-label="Payment method" value={method} onChange={e=>onMethod(e.target.value)} className="studio-input mt-1">{METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm"><span className="text-slate-300">Date</span><input type="date" value={date} max={maxDate} onChange={e=>onDate(e.target.value)} className="studio-input mt-1"/></label>
      <label className="text-sm"><span className="text-slate-300">Receipt reference</span><input value={reference} onChange={e=>onReference(e.target.value)} required={["cheque","draft"].includes(method)} maxLength={120} placeholder={["cheque","draft"].includes(method)?"Required":"Optional"} className="studio-input mt-1"/></label>
    </div>
    {typeControl&&<div className="mt-3 max-w-xs">{typeControl}</div>}
    {["bank","eft","cheque","draft"].includes(method)&&<label className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-amber-100"><input type="checkbox" checked={confirmed} onChange={e=>onConfirmed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#203449]"/>Already confirmed in the bank account</label>}
    <button type="button" onClick={onAdd} disabled={disabled} className="btn-gradient mt-4 min-h-10 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{buttonLabel}</button>
  </div>;
}
