"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createDealDocument, forceDealAgreement } from "../actions";

export interface DocRow { id: string; kind: string; number: string; status: string; date: string }

const STATUS_STYLE: Record<string, string> = {
  draft: "text-slate-400",
  printed: "text-sky-300",
  paid: "text-emerald-300",
  void: "text-rose-300",
};

export function DealDocuments({ dealId, docs, status, version,hasDepositOrTrade,leadingActions }: { dealId: string; docs: DocRow[]; status:string;version:number;hasDepositOrTrade:boolean;leadingActions?:ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  function gen(kind: string) {
    setErr("");
    setBusy(kind);
    start(async () => {
      const res = await createDealDocument(dealId, kind);
      setBusy("");
      if (res.error) setErr(res.error);
      else if (res.id) router.push(`/deal-doc/${dealId}/${res.id}`);
    });
  }

  function forceAgreement(){setErr("");setBusy("agreement");start(async()=>{const res=await forceDealAgreement(dealId,version);setBusy("");if(res.error)setErr(res.error);else router.refresh();});}
  const agreement=docs.find(d=>d.kind==="agreement"&&d.status!=="void");
  const agreementReady=Boolean(agreement)||["agreed","finance","completed"].includes(status)||hasDepositOrTrade;

  const btn = "btn-outline disabled:opacity-50";

  return (
    <section className="min-w-0">
      <h2 className="text-base font-semibold text-slate-100">Actions</h2>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {leadingActions}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={() => agreement?router.push(`/deal-doc/${dealId}/${agreement.id}`):gen(agreementReady?"agreement":"quote")} disabled={pending || ["cancelled","reversed"].includes(status)} className={btn}>{busy ? "…" : agreementReady?"Print Agreement":"Print Quote"}</button>
        {!agreementReady&&<button type="button" onClick={forceAgreement} disabled={pending || ["completed","cancelled","reversed"].includes(status)} className="btn-gradient disabled:opacity-40">{busy === "agreement" ? "…" : "Agreement without deposit"}</button>}
        {! ["completed","cancelled","reversed"].includes(status)&&<Link href={`/business/deals/${dealId}/edit`} className={btn}>Edit Deal</Link>}
        <button type="button" onClick={() => gen("invoice")} disabled={pending || status !== "completed"} className={btn}>{busy === "invoice" ? "…" : "Open final invoice"}</button>
        {! ["completed","cancelled","reversed"].includes(status)&&<Link href={`/business/deals/${dealId}/finish`} className="btn-gradient" style={{background:"#17594e",color:"#fff"}}>Finish Deal</Link>}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Vehicle Interest does not reserve the car. A confirmed deposit entry, trade-in or explicit agreement reserves it. Finish Deal opens invoice review; it does not record a payment.</p>
      {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}

      {docs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/deal-doc/${dealId}/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm hover:border-white/20">
                <span className="capitalize text-slate-200">{d.kind} · <span className="font-mono text-slate-400">{d.number}</span></span>
                <span className={`text-[11px] capitalize ${STATUS_STYLE[d.status] ?? "text-slate-400"}`}>{d.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
