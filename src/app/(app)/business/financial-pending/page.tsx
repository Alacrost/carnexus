import Link from "next/link";
import {requireSession} from "@/lib/auth";
import {can,hasModule} from "@/lib/types";
import {money} from "@/lib/currency";
import {listDealFinancialPending} from "@/lib/deal-refunds-server";
import {ModuleUpsell} from "@/components/module-upsell";
import {EntityLink} from "@/components/entity-link";

function totals(rows:{currency:string;amount:number}[]){
  const values=new Map<string,number>();
  for(const row of rows)values.set(row.currency,(values.get(row.currency)??0)+Number(row.amount));
  return [...values].map(([currency,amount])=>money(amount,currency)).join(" · ")||"—";
}

export default async function FinancialPendingPage(){
  const session=await requireSession();
  if(!hasModule(session.dealer.modules,"sales"))return <ModuleUpsell product="Sales CRM"/>;
  if(!can.viewFinancials(session.role))return <p className="text-sm text-slate-400">Your role does not include financial controls.</p>;
  const overview=await listDealFinancialPending();
  return <div className="space-y-5">
    <header><p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Pending payments &amp; refunds</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Track unconfirmed receipts and cancellation refunds. Review the linked Deal to confirm funds or record money actually returned.</p></header>
    {overview.error?<p role="alert" className="studio-surface p-4 text-sm text-rose-300">{overview.error}</p>:<>
      <div className="studio-surface grid gap-5 p-5 sm:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Awaiting receipt confirmation · {overview.receipts.length}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{totals(overview.receipts)}</p><p className="mt-1 text-xs text-slate-500">Pending receipts are not confirmed funds.</p></div>
        <div className="sm:border-l sm:border-white/10 sm:pl-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Refund obligations · {overview.refunds.filter(refund=>refund.remaining>0).length}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{totals(overview.refunds.filter(refund=>refund.remaining>0).map(refund=>({currency:refund.currency,amount:refund.remaining})))}</p><p className="mt-1 text-xs text-slate-500">Refunds due are liabilities until paid.</p></div>
      </div>
      <section className="studio-surface overflow-hidden"><h2 className="text-sm font-semibold">Financial pending items</h2>
        {overview.receipts.length===0&&overview.refunds.length===0?<p className="p-5 text-sm text-slate-500">No pending receipts or refund obligations.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-white/10 text-xs text-slate-500">{["Deal / customer","Type","Amount","State","Origin","Resolve"].map(label=><th key={label} className="p-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>
            {overview.receipts.map(receipt=><tr key={`receipt-${receipt.id}`} className="border-b border-white/10 align-top">
              <td className="p-3"><EntityLink kind="deal" id={receipt.dealId} reference={receipt.dealNo} href={`/business/deals/${receipt.dealId}`}/><p className="mt-1 text-xs text-slate-500">{receipt.customerName}</p></td>
              <td className="p-3">Receipt · {receipt.kind.replaceAll("_"," ")}</td><td className="p-3 font-semibold tabular-nums">{money(Number(receipt.amount),receipt.currency)}</td><td className="p-3 text-amber-300">PENDING · awaiting confirmation</td>
              <td className="p-3 text-xs text-slate-500">Registered payment · {receipt.method}<p>{receipt.paidOn??"—"} · {receipt.reference??"No reference"}</p></td>
              <td className="p-3"><Link href={`/business/deals/${receipt.dealId}#payment-${receipt.id}`} className="font-semibold text-sky-300 underline underline-offset-4">Review receipt →</Link></td>
            </tr>)}
            {overview.refunds.map(refund=><tr key={`refund-${refund.id}`} className="border-b border-white/10 align-top">
              <td className="p-3"><EntityLink kind="deal" id={refund.dealId} reference={refund.dealNo} href={`/business/deals/${refund.dealId}`}/><p className="mt-1 text-xs text-slate-500">{refund.customerName}</p></td>
              <td className="p-3">Refund · {refund.recipient==="finance_company"?"finance company":"customer"}</td><td className="p-3 font-semibold tabular-nums">{money(Number(refund.remaining),refund.currency)}<p className="mt-1 text-xs font-normal text-slate-500">Paid {money(Number(refund.paidAmount),refund.currency)} of {money(Number(refund.amount),refund.currency)}</p></td><td className="p-3 capitalize text-amber-300">{refund.status.replaceAll("_"," ")}{refund.recipient==="finance_company"&&<p className="text-xs">Lender review required</p>}</td>
              <td className="p-3 text-xs text-slate-500">Deal cancellation<p>{refund.reason}</p></td>
              <td className="p-3"><Link href={`/business/deals/${refund.dealId}#refund-${refund.id}`} className="font-semibold text-sky-300 underline underline-offset-4">{refund.recipient==="finance_company"?"Review obligation":"Review refund"} →</Link></td>
            </tr>)}
          </tbody>
        </table></div>}
      </section>
    </>}
  </div>;
}
