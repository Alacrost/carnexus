import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { can, hasModule } from "@/lib/types";
import { commercialPermission } from "@/lib/commercial-server";
import { getPendingActions, type PendingKind } from "@/lib/pending-actions";
import { EntityLink } from "@/components/entity-link";

const sections:{kind:PendingKind;label:string;hint:string}[]=[
  {kind:"missing_po",label:"Purchase order",hint:"Resolve acquisition provenance before the final invoice."},
  {kind:"po_details",label:"PO information",hint:"Complete required supplier and purchase dates."},
  {kind:"asking_price",label:"Asking price",hint:"Set the public/window price for stock."},
  {kind:"vendor_payment",label:"Vendor payments",hint:"Record money actually paid to the supplier."},
  {kind:"finance_payment",label:"Finance settlements",hint:"Track outstanding lender obligations."},
];

export default async function PendingPage(){
  const session=await requireSession();
  if(!hasModule(session.dealer.modules,"sales"))return <p className="text-sm">This workspace does not include Sales CRM.</p>;
  const canPurchase=await commercialPermission("purchase");
  const {items,error}=await getPendingActions(session.dealer.id,canPurchase,can.manageVehicles(session.role));
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6a665a]">Operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#191918]">Pending actions</h1><p className="mt-2 text-sm text-[#555550]">Live issues across vehicles and purchases. Resolved items disappear automatically.</p></div><div className={`border px-4 py-3 text-sm font-bold tabular-nums ${items.length>0?"border-[#c89a2e] bg-[#fff4c7] text-[#654809]":"border-[#cbd5c5] bg-[#f0f7ed] text-[#315632]"}`}>{error?"Status unavailable":`${items.length} pending`}</div></header>
    {error?<div role="alert" className="border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">Pending actions could not load. Refresh the page; do not assume the list is empty.</div>:items.length===0?<div className="studio-surface border-l-4 border-l-[#3e7048] p-6"><p className="text-lg font-semibold text-[#191918]">All clear</p><p className="mt-1 text-sm text-[#595955]">No missing asking prices, PO gaps or outstanding purchase payments are currently recorded.</p></div>:sections.map(section=>{
      const rows=items.filter(item=>item.kind===section.kind);
      if(rows.length===0)return null;
      return <section key={section.kind} className="studio-surface overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 bg-[#f1f1ed] px-5 py-4"><div><h2 className="text-base font-bold text-[#191918]">{section.label}</h2><p className="mt-1 text-xs text-[#595955]">{section.hint}</p></div><span className="border border-black/15 bg-white px-2 py-1 text-xs font-semibold tabular-nums text-[#363633]">{rows.length}</span></div><div className="divide-y divide-black/10">{rows.map(item=><article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><h3 className="text-sm font-bold text-[#191918]">{item.title}</h3><p className="mt-1 text-xs leading-5 text-[#555550]">{item.detail}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#555550]">{item.vehicleId&&<EntityLink kind="vehicle" id={item.vehicleId} reference={item.vehicleNo} href={`/inventory/${item.vehicleId}`}/>}<span>Plate: <b className="font-mono text-[#242422]">{item.plate??"—"}</b></span>{item.poId&&item.poNo&&<span className="inline-flex items-center gap-1">PO: <EntityLink kind="po" id={item.poId} reference={item.poNo} href={`/business/purchases/${item.poId}`}/></span>}{item.amount!==null&&<span className="font-bold tabular-nums text-[#80520e]">{item.amount.toLocaleString("en-IE",{style:"currency",currency:"EUR"})} outstanding</span>}</div></div><Link href={item.href} className="inline-flex items-center justify-center gap-2 self-start border border-[#171717] bg-[#171717] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#363636] lg:self-center">{item.actionLabel}<span aria-hidden="true">→</span></Link></article>)}</div></section>;
    })}
  </div>;
}
