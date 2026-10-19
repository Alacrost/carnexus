import type {ReactNode} from "react";
import Link from "next/link";
import {DealVehicleHeader,DealWorkspace} from "./deal-workspace";

export interface DealSheetContentProps {
  customer:{id?:string|null;name:string;email?:string|null;phone?:string|null;source?:string|null;status:ReactNode;assignedTo:ReactNode};
  vehicle?:{name:string;href?:string;price:ReactNode;edit?:ReactNode;fields:{label:string;value:ReactNode}[]};
  saleControls?:ReactNode;
  flatSaleVehicle?:boolean;
  warranty:{name?:string|null;terms?:string|null;quoteTerms?:string|null;comments?:string|null;control?:ReactNode};
  payments:ReactNode;
  paymentNotice?:ReactNode;
  trades:ReactNode;
  figures:ReactNode;
  supplementary?:ReactNode;
  requiredDocuments?:ReactNode;
  invoiceCustomer?:{name:string;address?:string|null};
}

const SOURCE_LABELS:Record<string,string>={donedeal:"DoneDeal",facebook:"Facebook",instagram:"Instagram",recommendation:"Recommendation",walk_in:"Walk-in",phone:"Phone",website:"Website",other:"Other"};

export function DealSheetSurface({children}:{children:ReactNode}){
  return <div className="crm-deal-sheet w-full rounded-md border border-[#c9c8bc] bg-[#fffdf7] p-3 text-[#203449] shadow-[0_2px_0_#e2ded3] sm:p-5 xl:p-6">{children}</div>;
}

// The same sheet renders before and after saving. Only its data and available actions change.
export function DealSheetContent({customer,vehicle,saleControls,flatSaleVehicle=false,warranty,payments,paymentNotice,trades,figures,supplementary,requiredDocuments,invoiceCustomer}:DealSheetContentProps){
  const saleContent=<>
    {vehicle&&<DealVehicleHeader name={vehicle.name} href={vehicle.href} price={vehicle.price} actions={vehicle.edit} fields={vehicle.fields} priceBesideName flat={flatSaleVehicle}/>}
    {saleControls}
  </>;
  const warrantyContent=<>
    <p className="mt-1 text-xs leading-relaxed text-slate-400">Configure finance and the invoice recipient in Edit Deal.</p>
    <div className="mt-3 grid gap-3">
      {warranty.control??<div className="text-sm text-slate-200"><p className="text-xs text-slate-500">Warranty</p><p className="mt-1 font-medium">{warranty.name||"No warranty selected"}</p></div>}
      {warranty.terms&&<p className="border-l-2 border-slate-500 bg-white/[0.03] px-3 py-2 text-xs whitespace-pre-line text-slate-300">{warranty.terms}</p>}
    </div>
    <Link href="/business/document-settings" className="mt-3 inline-block text-xs text-sky-300">Configure warranties →</Link>
    <section aria-label="Terms" className="mt-3 border-t border-white/10 pt-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Terms</h3><p className="mt-1 whitespace-pre-line text-xs text-slate-300">{warranty.quoteTerms||"Not set"}</p>{warranty.comments&&<p className="mt-2 whitespace-pre-line text-xs text-slate-300">{warranty.comments}</p>}</section>
  </>;
  return <section className="space-y-5">
    <div className={requiredDocuments?"grid gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]":"min-w-0"}>
    <section aria-labelledby="deal-contact-summary" className="crm-document-section studio-surface min-w-0 overflow-hidden">
      <h2 id="deal-contact-summary" className="crm-section-title text-sm font-semibold">{invoiceCustomer?"Customer & delivery":"Customer summary"}</h2>
      {invoiceCustomer&&<div className="grid gap-6 border-b border-white/10 p-5 sm:grid-cols-2">
        <section className="min-w-0"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer · Invoice to</h3><p className="mt-3 break-words text-lg font-semibold text-slate-100">{invoiceCustomer.name}</p>{invoiceCustomer.address&&<p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">{invoiceCustomer.address}</p>}</section>
        <section className="min-w-0 sm:border-l sm:border-white/10 sm:pl-6"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery to</h3><p className="mt-3 break-words text-lg font-semibold text-slate-100">{customer.id?<Link href={`/business/customers/${customer.id}`} className="underline underline-offset-4">{customer.name}</Link>:customer.name}</p><p className="mt-2 break-words text-sm leading-relaxed text-slate-300">{[customer.phone,customer.email].filter(Boolean).join(" · ")}</p></section>
      </div>}
      <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {!invoiceCustomer&&<div className="min-w-0 border-b border-white/10 pb-3"><dt className="text-xs font-semibold text-slate-500">Name</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-100">{customer.id?<Link href={`/business/customers/${customer.id}`} className="underline underline-offset-4">{customer.name||"Not provided"}</Link>:customer.name||"Not provided"}</dd></div>}
        {!invoiceCustomer&&<div className="min-w-0 border-b border-white/10 pb-3"><dt className="text-xs font-semibold text-slate-500">Email</dt><dd className="mt-1 break-words text-sm text-slate-200">{customer.email||"Not provided"}</dd></div>}
        <div className="min-w-0 border-b border-white/10 pb-3"><dt className="text-xs font-semibold text-slate-500">Referred by <span className="font-normal">· Lead source</span></dt><dd className="mt-1 break-words text-sm text-slate-200">{customer.source?(SOURCE_LABELS[customer.source]??customer.source):"Not provided"}</dd></div>
        <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">Current status</dt><dd className="mt-1 text-sm font-semibold text-slate-200">{customer.status}</dd></div>
        {!invoiceCustomer&&<div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">Phone</dt><dd className="mt-1 break-words text-sm text-slate-200">{customer.phone||"Not provided"}</dd></div>}
        <div className="min-w-0"><dt className="sr-only">Assigned to</dt><dd>{customer.assignedTo}</dd></div>
      </dl>
    </section>
    {requiredDocuments&&<div className="min-w-0 [&>.studio-surface]:h-full">{requiredDocuments}</div>}
    </div>
    <DealWorkspace widerSale sale={<div className={flatSaleVehicle?"deal-flat-sale min-w-0":"min-w-0"}>
      <h2 className={flatSaleVehicle?"deal-money-heading":"text-sm font-semibold uppercase tracking-wider text-slate-300"}>Sale</h2>
      {flatSaleVehicle?<div className="p-5">{saleContent}</div>:saleContent}
    </div>} warranty={<div className={flatSaleVehicle?"deal-flat-warranty min-w-0":"min-w-0"}>
      <h2 className={flatSaleVehicle?"deal-money-heading":"text-sm font-semibold uppercase tracking-wider text-slate-200"}>Warranty</h2>
      {flatSaleVehicle?<div className="p-5">{warrantyContent}</div>:warrantyContent}
    </div>} payments={payments} paymentNotice={paymentNotice} trades={trades} figures={figures} supplementary={supplementary}/>
  </section>;
}
