"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addPayment } from "../actions";
import {DealPaymentEntry} from "../deal-payment-entry";

const KINDS = [["balance", "Balance"], ["deposit", "Deposit"], ["finance_payout", "Lender payout"]];


export function AddPayment({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("balance");
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const requestId=useRef("");
  const [reference,setReference]=useState("");
  const [paidOn,setPaidOn]=useState(()=>new Date().toISOString().slice(0,10));
  const bankControlled=["bank","eft","cheque","draft"].includes(method);
  const [fundsConfirmed,setFundsConfirmed]=useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!amount) return;
    setError("");
    start(async () => {
      const res = await addPayment({ dealId, kind, method: method || undefined, amount: Number(amount), reference, paidOn, fundsConfirmed:bankControlled&&fundsConfirmed, requestId: requestId.current ||= crypto.randomUUID() });
      if (res.error) setError(res.error);
      else {
        setAmount(""); requestId.current=""; setReference("");setFundsConfirmed(false);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <DealPaymentEntry amount={amount} method={method} date={paidOn} reference={reference} confirmed={fundsConfirmed} onAmount={setAmount} onMethod={value=>{setMethod(value);setFundsConfirmed(false);}} onDate={setPaidOn} onReference={setReference} onConfirmed={setFundsConfirmed} onAdd={add} disabled={pending||!amount} buttonLabel={pending?"Recording payment…":"Record payment"} maxDate={new Date().toISOString().slice(0,10)}/>
      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer">Payment options{kind!=="balance"?` · ${KINDS.find(([value])=>value===kind)?.[1]}`:""}</summary>
        <label className="mt-3 block max-w-xs text-sm text-slate-300">Payment type<select aria-label="Payment type" value={kind} onChange={e=>setKind(e.target.value)} className="studio-input mt-1">{KINDS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </details>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
