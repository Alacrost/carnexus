import Link from "next/link";
import {notFound} from "next/navigation";
import {requireSession} from "@/lib/auth";
import {commercialPermission} from "@/lib/commercial-server";
import { createSalesClient as createClient } from "@/lib/sales-client";
import {isDemoMode,demoSalesDeals,demoVehicles,demoCustomers} from "@/lib/demo";
import {FinishForm} from "./finish-form";

export default async function FinishDealPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const session=await requireSession();
  if(!await commercialPermission("work"))return <p>No access to complete Deals.</p>;
  let view:{number:string;version:number;status:string;customerId:string;customer:string;email:string;consent:string;invoiceTo:string;vehicleId:string;vehicleNo:string;car:string;plate:string;originalPlate?:string|null;km:number;fuel:string;colour:string;warranty:string;scheme:string;vatRate?:number;imported?:boolean;vrtAmount?:number;vrtVatTreatment?:"included"|"excluded";sale:number;equity:number;paid:number;pending:number;balance:number;ready:boolean;currency:string};
  if(isDemoMode() && !/^[0-9a-f-]{36}$/i.test(id)){
    const d=demoSalesDeals.find(d=>d.id===id);if(!d)notFound();
    const v=demoVehicles.find(v=>d.order.vehicle_label.startsWith(`${v.year} ${v.make} ${v.model}`));
    const paid=d.payments.reduce((s,p)=>s+(p.kind==="refund"?-p.amount:p.amount),0);
    view={number:d.deal_no,version:1,status:d.status,customerId:demoCustomers.find(c=>c.name===d.customer.name)?.id??"",customer:d.customer.name,email:d.customer.email??"",consent:"not_asked",invoiceTo:"As above",vehicleId:v?.id??"",vehicleNo:String(demoVehicles.findIndex(x=>x.id===v?.id)+1),car:d.order.vehicle_label,plate:v?.registration??"—",km:v?.km??0,fuel:v?.fuel??"—",colour:"—",warranty:"No warranty selected",scheme:d.order.vat_scheme,sale:d.order.price,equity:d.siv_total??0,paid,pending:0,balance:d.order.price-(d.siv_total??0)-paid,ready:true,currency:d.currency};
  }else{
    const db=await createClient();const {data:d,error}=await db.from("deals").select("id,deal_no,version,status,customer_id,currency,invoice_to_finance,finance_company,warranty_name,warranty_terms").eq("dealer_id",session.dealer.id).eq("id",id).maybeSingle();
    if(error)return <p role="alert">Could not load Deal.</p>;if(!d)notFound();
    const [{data:c,error:ce},{data:o,error:oe},{data:b,error:be}]=await Promise.all([
      db.from("customers").select("id,name,email,data_consent").eq("dealer_id",session.dealer.id).eq("id",d.customer_id).maybeSingle(),
      db.from("deal_orders").select("vehicle_id,vat_scheme").eq("dealer_id",session.dealer.id).eq("deal_id",id).eq("kind","sale").maybeSingle(),
      db.rpc("deal_balances",{p_dealer:session.dealer.id,p_deal:id})]);
    if(ce||oe||be||!c||!o||!b)return <p role="alert">Customer, vehicle or balance could not load. Retry before finishing.</p>;
    const [{data:v,error:ve},{data:detail,error:de},{data:ready,error:re},{data:scheme,error:se}]=await Promise.all([
      db.from("vehicles").select("id,vehicle_no,year,make,model,registration,km,fuel").eq("dealer_id",session.dealer.id).eq("id",o.vehicle_id).maybeSingle(),
      db.from("vehicle_details").select("colour,original_registration").eq("dealer_id",session.dealer.id).eq("vehicle_id",o.vehicle_id).maybeSingle(),
      db.rpc("vehicle_purchase_ready",{p_dealer:session.dealer.id,p_vehicle:o.vehicle_id}),
      db.rpc("vehicle_purchase_tax",{p_dealer:session.dealer.id,p_vehicle:o.vehicle_id})]);
    if(ve||de||re||se||!v)return <p role="alert">Invoice review is unavailable. Check the vehicle, purchase tax profile and database update.</p>;
    const totals=b as {total:number;equity:number;paid:number;pending:number;balance:number};
    const tax=scheme as {scheme:string;vatRate:number;imported:boolean;vrtAmount:number;vrtVatTreatment:"included"|"excluded"}|null;
    const consent=["not_asked","refused","verbal","written","electronic"].includes(c.data_consent)?c.data_consent:"not_asked";
    view={number:d.deal_no,version:d.version,status:d.status,customerId:c.id,customer:c.name,email:c.email??"",consent,invoiceTo:d.invoice_to_finance?d.finance_company??"Finance company":"As above",vehicleId:v.id,vehicleNo:String(v.vehicle_no??"—"),car:`${v.year} ${v.make} ${v.model}`,plate:v.registration??"—",originalPlate:detail?.original_registration??null,km:v.km??0,fuel:v.fuel,colour:detail?.colour??"—",warranty:[d.warranty_name,d.warranty_terms].filter(Boolean).join(" — ")||"No warranty selected",scheme:tax?.scheme??"Pending PO",vatRate:tax?.vatRate,imported:tax?.imported,vrtAmount:tax?.vrtAmount,vrtVatTreatment:tax?.vrtVatTreatment,sale:Number(totals.total),equity:Number(totals.equity),paid:Number(totals.paid),pending:Number(totals.pending),balance:Number(totals.balance),ready:ready===true,currency:d.currency};
  }
  const eur=(n:number)=>new Intl.NumberFormat("en-IE",{style:"currency",currency:view.currency}).format(n);
  if(["completed","cancelled","reversed"].includes(view.status))return <div><h1>Deal is closed</h1><Link href={`/business/deals/${id}`} className="btn-outline">Return to {view.number}</Link></div>;
  return <div className="space-y-5"><Link href={`/business/deals/${id}`} className="btn-outline inline-flex text-sm">← {view.number}</Link><div><p className="text-xs uppercase tracking-widest text-slate-500">Final review</p><h1 className="mt-1 text-3xl font-semibold">Finish Deal · {view.number}</h1></div>
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="studio-surface p-5"><h2>Customer Info</h2><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-slate-500">Customer name</dt><dd className="mt-1"><Link className="btn-outline inline-flex font-semibold" href={`/business/customers/${view.customerId}`}>{view.customer}</Link></dd></div><div className="border-t border-white/10 pt-3"><dt className="text-slate-500">Invoice to</dt><dd className="mt-1 font-semibold">{view.invoiceTo}</dd></div></dl></section>
      <section className="studio-surface p-5"><h2>Outgoing vehicle</h2><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">{view.car}</h3><Link className="btn-outline font-mono" href={`/inventory/${view.vehicleId}`}>ID: {view.vehicleNo} · {view.plate}</Link></div><dl className="mt-4 grid grid-cols-2 gap-4 border-y border-white/10 py-4 text-sm"><div><dt className="text-slate-500">Odometer</dt><dd>{view.km.toLocaleString()} km / {Math.round(view.km/1.609344).toLocaleString()} miles</dd></div><div><dt className="text-slate-500">Fuel / colour</dt><dd>{view.fuel} · {view.colour}</dd></div><div><dt className="text-slate-500">VAT from purchase</dt><dd>{view.scheme}{view.scheme==="standard"&&` (${view.vatRate??23}%)`}</dd></div>{view.imported&&<div><dt className="text-slate-500">Vehicle source</dt><dd>Imported</dd></div>}{view.originalPlate&&<div><dt className="text-slate-500">Original / overseas plate</dt><dd>{view.originalPlate}</dd></div>}{Number(view.vrtAmount??0)>0&&<div><dt className="text-slate-500">VRT (included in selling price)</dt><dd>{eur(Number(view.vrtAmount))} · {view.vrtVatTreatment==="excluded"?"eligible disbursement excluded from VAT base":"included in VAT base"}</dd></div>}</dl><p className="mt-4 text-sm"><b>Warranty:</b> {view.warranty}</p></section>
    </div>
    <section className="studio-surface p-5"><h2>Deal balance</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["Price / extras",view.sale],["To change",view.sale-view.equity],["Confirmed payments",view.paid],["Awaiting clearance",view.pending],["Balance to pay",view.balance]].map(([label,value])=><div key={label} className="border-l-2 border-slate-400 pl-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{eur(Number(value))}</p></div>)}</div></section>
    <FinishForm dealId={id} version={view.version} km={view.km} email={view.email} consent={view.consent} blocked={!view.ready}/>
  </div>;
}
