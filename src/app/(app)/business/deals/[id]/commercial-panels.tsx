"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelDeal, changeDealStatus, changeSalePrice, issueCreditNote, returnInvoicedVehicle, returnSaleWithTradeChoices, saveDealFinance } from "../actions";
import {payDealRefund} from "../refund-actions";
import type {DealRefundObligation,RefundMethod} from "@/lib/deal-refunds";
export function StatusButton({id,status,label}:{id:string;status:string;label:string}) {
  const [error,setError]=useState(""); const [pending,start]=useTransition(); const router=useRouter();
  const [invoiceDate,setInvoiceDate]=useState(new Date().toISOString().slice(0,10));
  return <div className="flex flex-wrap items-end justify-end gap-2">{status==="completed"&&<label className="text-[10px] uppercase tracking-wider text-slate-500">Invoice date<input aria-label="Final invoice effective date" type="date" max={new Date().toISOString().slice(0,10)} value={invoiceDate} onChange={event=>setInvoiceDate(event.target.value)} className="mt-1 block rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs normal-case tracking-normal text-slate-200"/></label>}<button className="btn-gradient text-xs" disabled={pending||!invoiceDate} onClick={()=>start(async()=>{const r=await changeDealStatus(id,status,status==="completed"?invoiceDate:undefined);setError(r.error??"");if(!r.error)router.refresh();})}>{pending?"Saving…":label}</button>{error&&<p role="alert" className="w-full max-w-sm text-right text-xs text-rose-300">{error}</p>}</div>;
}

export function CancelDealPanel({
  id, version, vehicle, netPaid, hasTradeIn, hasInvoice, documents, linkedLead, canCancel, hasConfirmedFinancePayment=false, onCancelled, pendingReceipts=0, inline=false,
}: {
  id: string; version: number; vehicle: string; netPaid: number; hasTradeIn: boolean;
  hasInvoice: boolean; documents: number; linkedLead: boolean;
  canCancel:boolean;
  hasConfirmedFinancePayment?:boolean;
  onCancelled?:()=>void;
  pendingReceipts?:number;
  inline?:boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [leadStage, setLeadStage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const blockers = [
    hasConfirmedFinancePayment?"Finance-company funds have been received. Review the lender refund before cancelling.":"",


    hasTradeIn ? "This Deal has a trade-in. Use the reversal process to resolve the trade-in and its purchase payments." : "",
    hasInvoice ? "A final invoice has been issued. Use the credit note or vehicle return process." : "",
  ].filter(Boolean);

  function confirmCancellation() {
    if(!canCancel)return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError("Add a clear cancellation reason.");
      return;
    }
    setError("");
    start(async () => {
      const result = await cancelDeal({
        dealId: id,
        expectedVersion: version,
        reason: cleanReason,
        leadStage: leadStage ? leadStage as "new" | "contacted" | "appointment" | "test_drive" | "finance_applied" : undefined,
        requestId: crypto.randomUUID(),
      });
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        onCancelled?.();
        router.refresh();
      }
    });
  }

  return (
    <section className={inline?"contents":"studio-surface overflow-hidden border-rose-400/15"}>
      <button
        type="button"
        onClick={() => {if(canCancel)setOpen((value) => !value);}}
        className={inline?"btn-outline":"flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.025]"}
        disabled={!canCancel}
        aria-expanded={canCancel&&open}
        title={!canCancel?"Cancel Deal is available when a payment, trade-in or agreement is registered.":inline?"Review what happens to the vehicle, payments and documents before cancelling.":undefined}
      >
        {inline?"Cancel Deal":<><span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-300/80">Cancel Deal</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-400">Review what happens to the vehicle, payments and documents before cancelling.</span>
        </span>
        <span className="text-lg text-slate-500" aria-hidden="true">{open ? "−" : "+"}</span>
        </>}
      </button>
      {canCancel&&open && (
        <div className={inline?"order-last w-full border-t border-white/10 px-4 py-4":"border-t border-white/10 px-4 py-4"}>
          {inline&&<p className="mb-3 text-xs leading-relaxed text-slate-400">Review what happens to the vehicle, payments and documents before cancelling.</p>}
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-semibold text-slate-200">What happens when you cancel</p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
              <li>• Release {vehicle} back to available stock.</li>
              <li>• Mark {documents} current quote/agreement document(s) as void. Saved copies remain in the history.</li>
              <li>• Keep all payment records and the Deal history.</li>
              <li>• Keep the linked lead at its current stage unless you choose another stage below.</li>
              {netPaid>0&&<li>• €{netPaid.toFixed(2)} in confirmed receipts becomes a refund due to the customer. Cancellation does not send money. Record the refund after you have paid it.</li>}
              {pendingReceipts>0&&<li>• €{pendingReceipts.toFixed(2)} in unconfirmed receipts stays pending. No refund is created until the funds are confirmed.</li>}
            </ul>
          </div>

          {blockers.length > 0 && (
            <div role="alert" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
              <p className="text-xs font-semibold text-amber-200">Cancellation is blocked</p>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-amber-100/75">
                {blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
              </ul>
            </div>
          )}

          <label className="mt-3 block text-xs text-slate-300">
            Cancellation reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              rows={3}
              placeholder="Why is this deal being cancelled?"
              className="studio-input mt-1"
            />
          </label>
          {linkedLead && (
            <label className="mt-3 block text-xs text-slate-300">
              Linked lead after cancellation
              <select value={leadStage} onChange={(event) => setLeadStage(event.target.value)} className="studio-input mt-1">
                <option value="">Keep the lead unchanged</option>
                <option value="new">Reopen as new</option>
                <option value="contacted">Reopen as contacted</option>
                <option value="appointment">Reopen at appointment</option>
                <option value="test_drive">Reopen at test drive</option>
                <option value="finance_applied">Reopen at finance applied</option>
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={confirmCancellation}
            disabled={!canCancel || pending || blockers.length > 0 || reason.trim().length < 3}
            className="mt-4 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Cancelling…" : "Confirm cancellation"}
          </button>
          {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      )}
    </section>
  );
}

export function DealRefundPanel({obligation,canPay}:{obligation:DealRefundObligation;canPay:boolean}){
  const router=useRouter();const[pending,start]=useTransition();const[error,setError]=useState("");
  const[amount,setAmount]=useState(String(obligation.remaining));const[method,setMethod]=useState<RefundMethod>("bank");
  const[paidOn,setPaidOn]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"}));
  const[reference,setReference]=useState("");const[confirmed,setConfirmed]=useState(false);
  const request=useRef<{key:string;id:string}|null>(null);
  return <section id={`refund-${obligation.id}`} className="studio-surface p-4">
    <h2 className="text-sm font-semibold">Cancellation refund · {obligation.status.replaceAll("_"," ")}</h2>
    <p className="mt-3 text-sm">Refund due: <strong>{obligation.currency} {Number(obligation.remaining).toFixed(2)}</strong></p>
    <p className="mt-1 text-xs text-slate-400">{obligation.reason}</p>
    <p className="mt-2 text-xs leading-relaxed text-slate-400">{obligation.recipient==="finance_company"?"This refund is due to the finance company. Review it with the lender; it cannot be recorded as a customer refund here.":"This is the amount still owed to the customer. Pay the customer first, then record the refund here. This form does not transfer money."}</p>
    {canPay&&obligation.remaining>0&&obligation.recipient==="customer"&&<div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Refund amount<input className="studio-input mt-1" type="number" min="0.01" step="0.01" max={obligation.remaining} value={amount} onChange={event=>setAmount(event.target.value)}/></label>
        <label className="text-xs">Actual refund method<select className="studio-input mt-1" value={method} onChange={event=>setMethod(event.target.value as RefundMethod)}>{[["bank","Bank transfer"],["eft","EFT"],["cash","Cash"],["card","Card"],["cheque","Cheque"],["draft","Bank draft"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs">Refund payment date<input className="studio-input mt-1" type="date" value={paidOn} max={new Date().toISOString().slice(0,10)} onChange={event=>setPaidOn(event.target.value)}/></label>
        <label className="text-xs">Refund reference{["cheque","draft"].includes(method)&&" (required)"}<input className="studio-input mt-1" value={reference} maxLength={120} onChange={event=>setReference(event.target.value)}/></label>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-white/10 p-3 text-sm leading-relaxed"><input className="mt-1 shrink-0" type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I have already paid this refund to the customer.</label>
      <button type="button" className="btn-outline" disabled={pending||!confirmed||!Number.isFinite(Number(amount))||Number(amount)<=0||Number(amount)>obligation.remaining||!paidOn||(["cheque","draft"].includes(method)&&reference.trim().length<2)} onClick={()=>start(async()=>{
        setError("");const data={obligationId:obligation.id,amount:Number(amount),method,paidOn,reference,confirmedPaid:true as const};
        const key=JSON.stringify(data);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
        const result=await payDealRefund({...data,requestId:request.current.id});
        if(result.error)setError(result.error);else{setConfirmed(false);request.current=null;router.refresh();}
      })}>{pending?"Recording…":"Record refund paid"}</button>
      {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}
    </div>}
  </section>;
}

export interface CreditLine {
  index: number;
  description: string;
  original: number;
  remaining: number;
}

export function PostInvoiceCorrectionPanel({
  id, version, vehicle, currency, netPaid, tradeIns, invoiceNumber, lines,
}: {
  id: string; version: number; vehicle: string; currency: string; netPaid: number;
  tradeIns: {vehicleId:string;label:string;reg:string|null;allowance:number;settlement:number}[]; invoiceNumber: string; lines: CreditLine[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"credit" | "return" | null>(null);
  const [reason, setReason] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [refundMethod, setRefundMethod] = useState<"cash" | "bank" | "card">("bank");
  const [reference, setReference] = useState("");
  const [tradeChoices,setTradeChoices]=useState<Record<string,{keep:boolean;newPurchasePrice:string;supplierReference:string}>>(()=>Object.fromEntries(tradeIns.map(trade=>[trade.vehicleId,{keep:true,newPurchasePrice:String(trade.allowance),supplierReference:""}])));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const totalRemaining = lines.reduce((sum, line) => sum + line.remaining, 0);
  const selected = lines.flatMap((line) => {
    const amount = Number(amounts[line.index] ?? 0);
    return amount > 0 ? [{ index: line.index, amount }] : [];
  });
  const creditTotal = selected.reduce((sum, line) => sum + line.amount, 0);
  const invalidCredit = selected.some((entry) => entry.amount > (lines.find((line) => line.index === entry.index)?.remaining ?? 0));
  const fullCredit = totalRemaining > 0 && creditTotal >= totalRemaining;

  function submitCredit() {
    if (reason.trim().length < 3 || selected.length === 0 || invalidCredit || fullCredit) return;
    setError("");
    start(async () => {
      const result = await issueCreditNote({ dealId: id, expectedVersion: version, reason: reason.trim(), lines: selected, requestId: crypto.randomUUID() });
      if (result.error) setError(result.error);
      else if (result.id) router.push(`/deal-doc/${id}/${result.id}`);
    });
  }

  const invalidTradePurchase=tradeIns.some(trade=>{const choice=tradeChoices[trade.vehicleId];const value=Number(choice?.newPurchasePrice);return !choice||(choice.keep&&(!Number.isFinite(value)||value<=0||value<trade.settlement));});

  function submitReturn() {
    if (reason.trim().length < 3 || invalidTradePurchase) return;
    setError("");
    start(async () => {
      const common = { dealId: id, expectedVersion: version, reason: reason.trim(), refundMethod, reference: reference.trim() || undefined, requestId: crypto.randomUUID() };
      const result = tradeIns.length
        ? await returnSaleWithTradeChoices({ ...common, tradeChoices:tradeIns.map(trade=>({vehicleId:trade.vehicleId,keep:tradeChoices[trade.vehicleId].keep,...(tradeChoices[trade.vehicleId].keep?{newPurchasePrice:Number(tradeChoices[trade.vehicleId].newPurchasePrice),supplierReference:tradeChoices[trade.vehicleId].supplierReference.trim()||undefined}:{})})) })
        : await returnInvoicedVehicle(common);
      if (result.error) setError(result.error);
      else if (result.id) router.push(`/deal-doc/${id}/${result.id}`);
    });
  }

  return (
    <section className="studio-surface overflow-hidden border-amber-300/15">
      <div className="px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Correct an invoiced sale</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">Invoice {invoiceNumber} cannot be edited. Issue a credit note to correct an amount, or record a vehicle that has been returned to the dealership.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setMode(mode === "credit" ? null : "credit"); setError(""); }} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 transition hover:bg-white/[0.06]">Credit an amount</button>
          <button type="button" onClick={() => { setMode(mode === "return" ? null : "return"); setError(""); }} className="rounded-lg border border-rose-300/20 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-400/10">Return vehicle</button>
        </div>
      </div>

      {mode === "credit" && (
        <div className="border-t border-white/10 px-4 py-4">
          <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-3 text-xs text-sky-100/80">
            A partial credit note corrects the invoice only. It does not refund money or change the vehicle status. Check the amounts before confirming: the issued credit note cannot be edited.
          </div>
          <div className="mt-3 space-y-2">
            {lines.filter((line) => line.remaining > 0).map((line) => (
              <label key={line.index} className="grid grid-cols-[1fr_7rem] items-end gap-3 rounded-lg border border-white/10 bg-black/15 p-2.5 text-xs">
                <span><span className="block text-slate-200">{line.description}</span><span className="text-slate-500">Remaining {currency} {line.remaining.toFixed(2)}</span></span>
                <input aria-label={`Credit amount for ${line.description}`} type="number" min="0" max={line.remaining} step="0.01" value={amounts[line.index] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [line.index]: event.target.value }))} className="studio-input" placeholder="0.00" />
              </label>
            ))}
          </div>
          <p className={`mt-2 text-xs ${invalidCredit || fullCredit ? "text-amber-200" : "text-slate-400"}`}>
            Credit total: {currency} {creditTotal.toFixed(2)}{fullCredit ? " · A full credit requires a confirmed vehicle return." : ""}
          </p>
          <ReasonField value={reason} onChange={setReason} label="Correction reason" />
          <button type="button" onClick={submitCredit} disabled={pending || reason.trim().length < 3 || selected.length === 0 || invalidCredit || fullCredit} className="btn-gradient mt-4 text-xs disabled:opacity-40">{pending ? "Issuing…" : "Confirm & issue credit note"}</button>
        </div>
      )}

      {mode === "return" && (
        <div className="border-t border-white/10 px-4 py-4">
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/[0.06] p-3">
            <p className="text-sm font-semibold text-rose-100">Confirm the vehicle has been returned</p>
            <p className="mt-2 text-xs leading-relaxed text-rose-100/70">Only continue once the car is physically back at the dealership and the refunds have been paid. This records the return and refund; it does not transfer money.</p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-rose-100/70">
              <li>• Credit the full remaining invoice value of {currency} {totalRemaining.toFixed(2)}.</li>
              <li>• Record {currency} {netPaid.toFixed(2)} as refunded to the original customer/finance sources.</li>
              <li>• Move {vehicle} to preparation for inspection before resale.</li>
            </ul>
          </div>
          {tradeIns.length>0&&<div className="mt-3 border border-sky-300/20 bg-sky-300/[0.05] p-3"><p className="text-xs font-semibold text-sky-100">Resolve each trade-in separately</p><p className="mt-1 text-xs text-sky-100/70">Keep: cancel its old PO and create a standalone PO at the new value. Return to customer: blocked while any PO payment remains unreversed.</p><div className="mt-3 space-y-3">{tradeIns.map(trade=>{const choice=tradeChoices[trade.vehicleId];return <div key={trade.vehicleId} className="border-t border-white/10 pt-3"><p className="text-xs font-semibold text-white">{trade.label} · Plate {trade.reg??"—"}</p><label className="mt-2 block text-xs text-slate-300">Decision<select value={choice?.keep?"keep":"return"} onChange={event=>setTradeChoices(current=>({...current,[trade.vehicleId]:{...current[trade.vehicleId],keep:event.target.value==="keep"}}))} className="studio-input mt-1"><option value="keep">Keep at dealer · new standalone PO</option><option value="return">Return this car to customer</option></select></label>{choice?.keep&&<div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-300">New PO value ({currency})<input type="number" min={trade.settlement||0.01} step="0.01" value={choice.newPurchasePrice} onChange={event=>setTradeChoices(current=>({...current,[trade.vehicleId]:{...current[trade.vehicleId],newPurchasePrice:event.target.value}}))} className="studio-input mt-1"/></label><label className="text-xs text-slate-300">Supplier reference<input value={choice.supplierReference} onChange={event=>setTradeChoices(current=>({...current,[trade.vehicleId]:{...current[trade.vehicleId],supplierReference:event.target.value}}))} maxLength={60} className="studio-input mt-1"/></label><p className="text-xs text-slate-400 sm:col-span-2">Finance owed: {currency} {trade.settlement.toFixed(2)}. New PO value must cover it.</p></div>}</div>;})}</div></div>}
          <ReasonField value={reason} onChange={setReason} label="Vehicle return reason" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-300">Customer refund method<select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as "cash" | "bank" | "card")} className="studio-input mt-1"><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option></select></label>
            <label className="text-xs text-slate-300">Refund reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} className="studio-input mt-1" /></label>
          </div>
          <button type="button" onClick={submitReturn} disabled={pending || invalidTradePurchase || reason.trim().length < 3} className="mt-4 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40">{pending ? "Recording return…" : tradeIns.length ? "Confirm return, refund & trade-in choices" : "Confirm return & record refund"}</button>
        </div>
      )}
      {error && <p role="alert" className="mx-4 mb-4 text-xs text-rose-300">{error}</p>}
    </section>
  );
}

function ReasonField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <label className="mt-3 block text-xs text-slate-300">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} minLength={3} maxLength={500} rows={3} className="studio-input mt-1" /></label>;
}
export function PriceEditor({id,version,price}:{id:string;version:number;price:number}) {
  const [open,setOpen]=useState(false); const [state,action,pending]=useActionState(changeSalePrice,{});
  return <div className="mt-3"><button type="button" onClick={()=>setOpen(!open)} className="text-sm text-sky-300">{open?"Close price editor":"Edit sale price"}</button>{open&&<form action={action} className="mt-3 space-y-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label className="block text-sm">New sale price (€)<input name="price" type="number" min="0.01" step="0.01" required defaultValue={price} className="studio-input"/></label><label className="block text-sm">Reason<input name="reason" required minLength={3} maxLength={500} className="studio-input"/></label><p className="text-xs text-slate-400">Changing the price requires a new agreement before completion.</p><button disabled={pending} className="btn-gradient">Save price</button>{state.error&&<p role="alert" className="text-rose-300">{state.error}</p>}{state.saved&&<p role="status" className="text-emerald-300">Price updated and audited.</p>}</form>}</div>;
}
export interface FinanceValues { finance_company?:string|null;finance_reference?:string|null;finance_expected?:number;finance_status?:string;finance_address?:string|null;invoice_to_finance?:boolean }
export function FinancePanel({id,values,closed,companies=[]}:{id:string;values:FinanceValues;closed:boolean;companies?:{id:string;name:string;invoice_address:string}[]}) {
  const [state,action,pending]=useActionState(saveDealFinance,{});
  const matching=companies.find(c=>c.name===values.finance_company&&c.invoice_address===values.finance_address);
  const [contactId,setContactId]=useState(matching?.id??"");
  const [invoiceToFinance,setInvoiceToFinance]=useState(values.invoice_to_finance??false);
  const selected=companies.find(c=>c.id===contactId);
  return <section className="studio-surface p-4"><h2 className="text-sm font-semibold">Finance & invoice recipient</h2><p className="my-2 text-xs text-slate-400">Choose a business in the Finance companies contact group. The invoice can be addressed to the lender while the customer remains the vehicle/delivery recipient. Expected funding is not a payment; record it only when received. Issued documents retain their original details.</p><form action={action} className="space-y-3"><input type="hidden" name="id" value={id}/><fieldset disabled={closed||pending} className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm sm:col-span-2">Finance company contact<select name="finance_contact_id" value={contactId} onChange={e=>{setContactId(e.target.value);setInvoiceToFinance(Boolean(e.target.value));}} className="studio-input"><option value="">No finance company — invoice to customer</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {values.finance_company&&!matching&&<p className="text-xs text-amber-300 sm:col-span-2">Previously saved company: {values.finance_company}. Choose an active contact from the Finance companies group before saving.</p>}
    {selected&&<p className="whitespace-pre-line border-l-2 border-slate-500 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 sm:col-span-2">Invoice address: {selected.invoice_address}</p>}
    <label className="text-sm">Agreement/reference<input name="finance_reference" defaultValue={values.finance_reference??""} maxLength={120} className="studio-input"/></label>
    <label className="text-sm">Expected payout (€)<input name="finance_expected" type="number" min="0" step="0.01" defaultValue={values.finance_expected??0} className="studio-input"/></label>
    <label className="text-sm">Approval status<select name="finance_status" defaultValue={values.finance_status??"none"} className="studio-input"><option value="none">No finance</option><option value="pending">Pending lender approval</option><option value="approved">Approved by lender (recorded manually)</option></select></label>
    <label className="text-sm sm:col-span-2"><input type="checkbox" name="invoice_to_finance" checked={invoiceToFinance} disabled={!contactId} onChange={e=>setInvoiceToFinance(e.target.checked)}/> Invoice to finance company; deliver vehicle to customer</label>
    {!closed&&<div className="flex justify-end border-t border-white/10 pt-4 sm:col-span-2"><button disabled={pending} className="btn-gradient rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50" style={{background:"#17594e",color:"#fff"}}>{pending?"Saving…":"Save finance details"}</button></div>}
  </fieldset>{state.error&&<p role="alert" className="text-rose-300">{state.error}</p>}{state.saved&&<p role="status" className="text-emerald-300">Saved. Issue a new agreement for these terms.</p>}</form></section>;
}
