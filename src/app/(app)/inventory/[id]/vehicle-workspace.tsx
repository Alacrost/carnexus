"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import {
  closeVehicleActivity, recordVehicleActivity, saveVehicleCheck,
  type WorkspaceActionState,
} from "./workspace-actions";
import { money } from "@/lib/currency";
import { PrivatePrice, type VehicleDetails } from "./vehicle-details";
import { EntityLink, vehicleReference } from "@/components/entity-link";
import { VehiclePlate } from "@/components/vehicle-plate";
import { BusinessIcon, CalendarIcon, HoldIcon, InventoryIcon, MessageIcon, PrintIcon, ReadyIcon, SearchIcon, TagIcon, ToolsIcon, WriteIcon } from "@/components/icons";
import { VehicleEditPanels } from "./vehicle-edit-panels";

export interface WorkspaceVehicle {
  id: string; make: string; model: string; year: number; km: number; registration: string | null;
  fuel: string; transmission: string; sale_price: number | null; stock_class: string | null;
  website_visible: boolean; featured: boolean; location_id: string | null; description: string | null;
}
export interface WorkspaceDeal { id: string; deal_no: string }
export interface WorkspaceSaleRecord extends WorkspaceDeal {
  so_no:string|null;status:string;stage:string|null;finance_status:string;finance_company:string|null;
  customer:string;customerId:string|null;customerPhone:string|null;salesperson:string|null;
  createdAt:string;currency:string;price:number;paid:number|null;pending:number|null;balance:number|null;
  invoice:{id:string;number:string;date:string|null}|null;
}
export interface WorkspaceDetails extends VehicleDetails {
  first_registered_on?: string | null; local_registered_on?: string | null; original_registration?: string | null;
  tax_expiry?: string | null; co2_g_km?: number | null; gross_weight_kg?: number | null;
  body_length_mm?: number | null; engine_no?: string | null; doors?: string | null;
  metallic_paint?: boolean; key_peg_ref?: string | null; hp_check_status?: string | null;
  vlc_status?: string | null; vlc_number?: string | null; repair_notes?: string | null;
  internal_notes?: string | null; yard?: string | null; tags?: string[];
}
export interface VehicleActivity {
  id: string; kind: string; title: string; note: string | null; status: string;
  starts_at: string | null; ends_at: string | null; created_at: string;
  actor?: string | null; closed_at?: string | null;
}
export interface VehicleCheck { code: string; status: string; note: string | null; checked_at: string | null; actor?: string | null }
export interface RecordAudit {createdBy:string;updatedBy:string;createdAt:string|null;updatedAt:string|null}

const checkNames: Record<string,string> = {
  identity:"Identity / VIN", finance:"Finance / HP", mechanical:"Mechanical", documents:"Documents / VRC",
  photos:"Photos", road_test:"Road test",
};
const activityNames: Record<string,string> = {
  hold:"Hold",loan:"Loan vehicle",external_repair:"External repair",event:"Event",workshop_request:"Workshop request",
};
const actionClass = "inline-flex items-center justify-center gap-2 border border-[#171717] bg-[#171717] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#363636] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800";
const quietActionClass = "inline-flex items-center justify-center gap-2 border border-black/80 bg-black/80 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800";

function Field({ name,label,value,type="text",hint,required }: {
  name:string;label:string;value?:string|number|null;type?:string;hint?:string;required?:boolean;
}) {
  return <label className="block text-xs font-medium text-slate-600">{label}
    <input name={name} type={type} required={required} min={type==="number"?0:undefined}
      step={type==="number"?"any":undefined} defaultValue={value??""}
      className="studio-input mt-1 w-full text-sm" />
    {hint&&<span className="mt-1 block font-normal text-slate-500">{hint}</span>}
  </label>;
}

function SaleFact({label,value}:{label:string;value:ReactNode}) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">{label}</dt><dd className="mt-1 text-sm font-semibold capitalize text-[#191918]">{value??"—"}</dd></div>;
}

function auditDate(value:string|null){
  if(!value)return "Not recorded";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Not recorded":new Intl.DateTimeFormat("en-IE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Dublin"}).format(date);
}
function dealUpdateDate(value:string|null){
  if(!value)return "Not recorded";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Not available":new Intl.DateTimeFormat("en-IE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"Europe/Dublin"}).format(date);
}
function AuditDetails({audit}:{audit:RecordAudit}){
  return <dl className="mt-3 grid gap-3 border border-black/10 bg-[#f5f5f2] p-4 sm:grid-cols-2 lg:grid-cols-4">
    <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">Created by</dt><dd className="mt-1 text-sm font-semibold text-[#191918]">{audit.createdBy}</dd></div>
    <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">Updated by</dt><dd className="mt-1 text-sm font-semibold text-[#191918]">{audit.updatedBy}</dd></div>
    <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">Created on</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-[#191918]">{auditDate(audit.createdAt)}</dd></div>
    <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">Updated on</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-[#191918]">{auditDate(audit.updatedAt)}</dd></div>
  </dl>;
}

export function VehicleWorkspace({ vehicle, vehicleNo, status, openDeal, saleRecord, activeDeals, sellingLoadError, canSell, hasOriginPo, originatingPoId, canCreatePo, purchaseLoadError, details, tradePrice, purchase, purchasePrice, purchaseTotal, vendorName, buyerName, canCost, audit, purchaseAudit, locations, activities, checks, canManage }: {
  activeDeals:{id:string;deal_no:string;status:string;stage:string|null;finance_status:string;customer:string;customerId:string|null;employee:string|null;updatedAt:string|null;amount:number|null;currency:string;hasTradeIn:boolean|null}[]; sellingLoadError:boolean;
  vehicle:WorkspaceVehicle; details:WorkspaceDetails; tradePrice:number|null;
  purchase:{id:string;po_no:string;status:string;deal_id?:string|null;vendor_id?:string|null;purchase_date?:string|null;received_on?:string|null;inv_ref?:string|null;vat_scheme?:string|null;vat_rate?:number|null;imported?:boolean;vrt_amount?:number|null;vrt_vat_treatment?:"included"|"excluded";finance_company?:string|null;purchase_amount_known?:boolean}|null;
  purchasePrice:number|null;purchaseTotal:number|null;vendorName:string|null;buyerName:string|null;canCost:boolean;
  audit:RecordAudit;purchaseAudit:RecordAudit|null;
  vehicleNo:number|null; status:string; openDeal:WorkspaceDeal|null; saleRecord:WorkspaceSaleRecord|null; canSell:boolean;hasOriginPo:boolean;originatingPoId:string|null;canCreatePo:boolean;purchaseLoadError:boolean;
  locations:{id:string;name:string}[]; activities:VehicleActivity[]; checks:VehicleCheck[]; canManage:boolean;
}) {
  const [panel,setPanel]=useState<"edit"|"activity"|"checks"|null>(null);
  const [activityKind,setActivityKind]=useState("hold");
  const [activityState,activityAction,activityPending]=useActionState(recordVehicleActivity,{} as WorkspaceActionState);
  const [checkState,checkAction,checkPending]=useActionState(saveVehicleCheck,{} as WorkspaceActionState);
  const hold=activities.find((item)=>item.kind==="hold"&&item.status==="open");
  const hasReservedDeal=activeDeals.some(deal=>deal.status!=="vehicle_interest");
  const canStartSale=canSell&&!sellingLoadError&&!hasReservedDeal;
  const sellingStatus=hold?"On hold":saleRecord&&!["completed","cancelled","reversed","vehicle_interest"].includes(saleRecord.status)?"Reserved":status.replaceAll("_"," ");
  const purchaseIncomplete=!!purchase&&!purchase.deal_id&&(!purchase.inv_ref?.trim()||!purchase.purchase_date||!purchase.received_on);

  const openActivity=(kind:string)=>{setActivityKind(kind);setPanel("activity");};
  return <div className="mt-2 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gradient">Vehicle details</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xl font-semibold tracking-tight text-[#191918]">{vehicle.make} {vehicle.model}</p>
          {canManage&&<button type="button" onClick={()=>setPanel(panel==="edit"?null:"edit")} className={quietActionClass} aria-expanded={panel==="edit"} aria-controls="vehicle-edit"><WriteIcon size={16}/>Edit car</button>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <EntityLink kind="vehicle" id={vehicle.id} reference={vehicleReference(vehicleNo)} href={`/inventory/${vehicle.id}`}/>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#595955]">Plate</span>
          <VehiclePlate registration={vehicle.registration}/>
        </div>
        <div className="mt-4 border-l-[3px] border-[#171717] pl-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595955]">Asking price</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-[#171717] sm:text-5xl">{vehicle.sale_price!=null?new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(vehicle.sale_price):"Price not set"}</p>
          <p className="mt-2 text-xs font-medium text-[#464642]">{vehicle.year} · {vehicle.km.toLocaleString("en-IE")} km · <span className="capitalize">{status.replaceAll("_"," ")}</span></p>
        </div>
      </div>
      <div className="flex min-w-44 flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link href="/inventory#stock-search" className={quietActionClass}><SearchIcon size={16}/>Search</Link>
          {canStartSale&&!openDeal&&<Link href={`/business/deals/new?vehicleId=${vehicle.id}`} className="inline-flex items-center gap-3 border border-black bg-[#101010] px-5 py-3 text-sm font-bold tracking-wide text-white shadow-[0_10px_22px_-11px_rgba(0,0,0,0.85)] ring-2 ring-black ring-offset-2 ring-offset-[#ececea] transition hover:bg-[#303030] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"><BusinessIcon size={19}/>Sell this car<span className="border-l border-white/35 pl-3 text-lg leading-none">→</span></Link>}
        </div>
        {canManage&&<button type="button" onClick={()=>hold?void closeVehicleActivity(vehicle.id,hold.id):openActivity("hold")} className={quietActionClass}><HoldIcon size={16}/>{hold?"Release hold":"Hold vehicle"}</button>}
        {hold&&<span className="text-xs font-semibold text-amber-900">Sale paused — vehicle on hold</span>}
      </div>
    </header>
    <nav aria-label="Vehicle actions" className="studio-surface flex flex-wrap gap-2 p-3">
      <Link href={`/inventory/${vehicle.id}/print/window-sign`} target="_blank" className={actionClass}><PrintIcon size={16}/>Window sign ↗</Link>
      <Link href={`/inventory/${vehicle.id}/print/asset-tag`} target="_blank" className={actionClass}><TagIcon size={16}/>Asset tag ↗</Link>
      <Link href={`/inventory/${vehicle.id}/print/label`} target="_blank" className={actionClass}><PrintIcon size={16}/>Label ↗</Link>
      {canManage&&<>
        <button type="button" onClick={()=>openActivity("loan")} className={actionClass}><InventoryIcon size={16}/>Loan / external repair</button>
        <button type="button" onClick={()=>setPanel(panel==="checks"?null:"checks")} className={actionClass}><ReadyIcon size={16}/>Checks</button>
        <button type="button" onClick={()=>openActivity("event")} className={actionClass}><CalendarIcon size={16}/>Create event</button>
        <button type="button" onClick={()=>openActivity("workshop_request")} className={actionClass}><ToolsIcon size={16}/>Workshop request</button>
      </>}
      <Link href={`/messages?contextType=vehicle&contextId=${vehicle.id}&contextLabel=${encodeURIComponent(vehicle.registration??vehicle.make+" "+vehicle.model)}`} className={actionClass}><MessageIcon size={16}/>Message team</Link>
    </nav>
    <section aria-labelledby="vehicle-selling-info" className="studio-surface border-l-[4px] border-l-[#252524] p-5">
      <div className="crm-section-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595955]">Sales</p>
          <h2 id="vehicle-selling-info" className="mt-1 text-lg font-semibold text-[#191918]">Selling info</h2>
        </div>
        <span className="border border-[#d2d2cc] bg-[#f2f2ee] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#353532]">{sellingLoadError?"Sale status unavailable":sellingStatus}</span>
      </div>
      {sellingLoadError?<p role="alert" className="mt-4 border border-amber-700/30 bg-amber-50 p-3 text-sm text-amber-950">Could not check this car’s Deals. Refresh before treating it as available.</p>:activeDeals.length>0?<div className="mt-4 border border-[#b8b8b2] bg-[#f1f1ed]">
        <h3 className="border-b border-[#b8b8b2] bg-[#deded8] px-4 py-3 text-sm font-bold text-[#191918]">Open negotiations · {activeDeals.length}</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs">
          <thead className="border-b border-black/10 text-[#595955]"><tr>{["Deal","Employee","Contact","Status","Last update","Amount","Trade-in"].map(label=><th key={label} className="px-4 py-2 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/10">{activeDeals.map(deal=><tr key={deal.id} className="align-top text-[#353532]">
            <td className="whitespace-nowrap px-4 py-3"><Link href={`/business/deals/${deal.id}`} className="font-semibold underline underline-offset-2">{deal.deal_no}</Link></td>
            <td className="px-4 py-3">{deal.employee??"Not available"}</td>
            <td className="px-4 py-3 font-semibold">{deal.customerId?<Link href={`/business/customers/${deal.customerId}`} className="underline underline-offset-2">{deal.customer}</Link>:deal.customer}</td>
            <td className="px-4 py-3"><span className="capitalize">{deal.status==="vehicle_interest"?"Vehicle interest / quote":deal.status.replaceAll("_"," ")}</span>{deal.stage&&<span className="mt-1 block capitalize text-[#595955]">{deal.stage.replaceAll("_"," ")}</span>}{deal.finance_status==="pending"&&<span className="mt-1 block">Awaiting finance approval</span>}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dealUpdateDate(deal.updatedAt)}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{deal.amount==null?"Not recorded":new Intl.NumberFormat("en-IE",{style:"currency",currency:deal.currency||"EUR"}).format(deal.amount)}</td>
            <td className="px-4 py-3">{deal.hasTradeIn==null?"Not available":deal.hasTradeIn?"Yes":"No"}</td>
          </tr>)}</tbody>
        </table></div>
      </div>:<div className="mt-4 text-sm text-[#353532]">
        <p className="font-semibold">No open negotiations</p>
        {saleRecord&&<p className="mt-2">Last Deal: <Link href={`/business/deals/${saleRecord.id}`} className="underline underline-offset-2">{saleRecord.deal_no}</Link> · {saleRecord.customer} · <span className="capitalize">{saleRecord.status.replaceAll("_"," ")}</span></p>}
        {!canSell&&<p className="mt-2">{hold?"Vehicle on hold":status==="sold"?"Vehicle sold":status.replaceAll("_"," ")}</p>}
        {canSell&&!hasOriginPo&&<p className="mt-2 text-xs">A verified PO is required before finishing and invoicing a Deal.</p>}
      </div>}
      {canStartSale&&<div aria-label="New negotiation actions" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
        {activeDeals.length>0&&<p className="text-xs text-[#595955]">This car is not reserved by these negotiations.</p>}
        <Link href={`/business/deals/new?vehicleId=${vehicle.id}`} className={actionClass}><BusinessIcon size={16}/>{activeDeals.length>0?"New negotiation with another customer →":"Start new sale →"}</Link>
      </div>}
    </section>
    <section aria-labelledby="vehicle-buying-info" className="studio-surface p-5">
      <div className="crm-section-header flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595955]">Acquisition</p><h2 id="vehicle-buying-info" className="mt-1 text-lg font-semibold text-[#191918]">Buying info</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`border px-2.5 py-1 text-xs font-bold ${purchaseLoadError?"border-[#b67d22] bg-[#fff2cb] text-[#654809]":hasOriginPo?"border-[#84a68a] bg-[#eaf4e9] text-[#285534]":"border-[#c78389] bg-[#fff0f0] text-[#8b1c2a]"}`}>{purchaseLoadError?"PO status unavailable":hasOriginPo?"PO verified":purchase||originatingPoId?"PO needs attention":"No PO linked"}</span>
          {purchase&&<EntityLink kind="po" id={purchase.id} reference={purchase.po_no} href={`/business/purchases/${purchase.id}`}/>}
        </div>
      </div>
      {purchaseLoadError?<div role="alert" className="mt-4 border border-[#d5a047] border-l-[4px] border-l-[#ae7414] bg-[#fff5dc] p-4 text-sm font-medium text-[#654809]">Could not verify this car’s PO right now. Refresh the page or contact an administrator; do not treat it as purchase-ready.</div>:!hasOriginPo?<div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-4 border border-[#dba3a7] border-l-[4px] border-l-[#a52633] bg-[#fff0f0] p-4 text-[#721c27]">
        <div><p className="text-sm font-bold">Purchase order pending — invoice blocked</p><p className="mt-1 text-xs">{purchaseIncomplete?"The linked PO is missing its supplier invoice reference or purchase/arrival date. Complete those fields before finishing the Deal.":purchase||originatingPoId?"A PO exists but is not verified as this car’s originating PO. Review its acquisition before finishing the Deal.":"The Deal can be opened and deposits recorded, but it cannot be finished or invoiced until this car has a verified PO."}</p></div>
        {purchaseIncomplete?<Link href={`/business/purchases/${purchase!.id}#complete-intake`} className="inline-flex items-center border border-[#a52633] bg-[#a52633] px-3 py-2 text-xs font-bold text-white hover:bg-[#801d29]">Complete {purchase!.po_no} →</Link>:purchase?<EntityLink kind="po" id={purchase.id} reference={purchase.po_no} href={`/business/purchases/${purchase.id}`}/>:originatingPoId?<span className="text-xs font-semibold">Ask an administrator to review the linked PO.</span>:canCreatePo?<Link href={`/business/purchases/new?vehicleId=${vehicle.id}`} className="inline-flex items-center border border-[#a52633] bg-[#a52633] px-3 py-2 text-xs font-bold text-white hover:bg-[#801d29]">Create PO for this car →</Link>:<span className="text-xs font-semibold">Ask the purchasing team to create the PO.</span>}
      </div>:null}
      {purchase?<>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,15rem)_minmax(0,15rem)_1fr]">
          {canCost&&purchasePrice!==null?<PrivatePrice value={purchasePrice}/>:<div className="flex min-h-20 items-center border border-[#d5d5d0] bg-[#f5f5f2] px-4 text-xs font-medium text-[#595955]">{canCost?"Purchase price not recorded":"Purchase price restricted"}</div>}
          {canCost&&purchaseTotal!==null?<PrivatePrice value={purchaseTotal} label="Total PO costs"/>:<div className="flex min-h-20 items-center border border-[#d5d5d0] bg-[#f5f5f2] px-4 text-xs font-medium text-[#595955]">{canCost?"Total costs pending":"PO costs restricted"}</div>}
          <div className="border border-[#d5d5d0] bg-[#f5f5f2] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#595955]">PO status</p><p className="mt-1 text-base font-semibold capitalize text-[#191918]">{purchase.status.replaceAll("_"," ")}</p><p className="mt-2 text-xs text-[#595955]">{purchase.deal_id?"Trade-in acquisition":"Direct purchase"}</p></div>
        </div>
        <dl className="mt-4 grid gap-x-5 gap-y-4 border-t border-black/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <SaleFact label="Bought from" value={purchase.vendor_id?<><EntityLink kind="customer" id={purchase.vendor_id} href={`/business/customers/${purchase.vendor_id}`}/><span className="ml-2">{vendorName??"—"}</span></>:vendorName}/>
          <SaleFact label="Bought by" value={buyerName}/>
          <SaleFact label="Supplier invoice ref" value={purchase.inv_ref}/>
          <SaleFact label="Purchase date" value={purchase.purchase_date}/>
          <SaleFact label="Collected / arrived" value={purchase.received_on}/>
          <SaleFact label="VAT scheme" value={purchase.vat_scheme?.replaceAll("_"," ")}/>
          {purchase.vat_scheme==="standard"&&<SaleFact label="VAT rate" value={`${purchase.vat_rate??23}%`}/>}
          <SaleFact label="Import status" value={purchase.imported?"Imported":"Domestic"}/>
          {!!purchase.vrt_amount&&<><SaleFact label="VRT (included in selling price)" value={money(Number(purchase.vrt_amount),"EUR")}/><SaleFact label="VRT VAT treatment" value={purchase.vrt_vat_treatment==="excluded"?"Qualifying disbursement excluded":"Full vehicle price"}/></>}
          <SaleFact label="Finance company" value={purchase.finance_company}/>
          <SaleFact label="Car source" value={purchase.deal_id?"Trade-in":"Direct purchase"}/>
        </dl>
        {purchaseAudit&&<div className="mt-5 border-t border-black/10 pt-4"><h3 className="text-sm font-semibold text-[#191918]">PO date information</h3><AuditDetails audit={purchaseAudit}/></div>}
      </>:hasOriginPo?<p className="mt-4 border-t border-black/10 pt-4 text-sm text-[#464642]">A verified purchase order is linked to this vehicle. Your role does not include its financial details.</p>:!purchaseLoadError?<p className="mt-4 border-t border-black/10 pt-4 text-sm font-medium text-[#721c27]">{originatingPoId?"A PO is linked, but its details are unavailable to your role or it needs correction.":"No purchase order is linked to this car yet."} Its sale can be prepared, but the final invoice remains blocked.</p>:null}
    </section>
    <section aria-labelledby="vehicle-date-information" className="studio-surface p-5">
      <div className="crm-section-header"><p className="text-[10px] font-bold uppercase tracking-[0.18em]">Audit</p>
      <h2 id="vehicle-date-information" className="mt-1 text-lg font-semibold">Date information</h2></div>
      <AuditDetails audit={audit}/>
    </section>
    {hold&&<p className="border-l-[3px] border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">On hold: {hold.title}{hold.note?` · ${hold.note}`:""}</p>}
    {panel==="activity"&&canManage&&<section className="studio-surface p-5">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{activityNames[activityKind]??"Vehicle event"}</h2><button type="button" onClick={()=>setPanel(null)} className="text-sm text-slate-500">Close</button></div>
      <form action={activityAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="vehicle_id" value={vehicle.id}/><input type="hidden" name="kind" value={activityKind}/>
        {["loan","external_repair"].includes(activityKind)&&<label className="text-xs font-medium text-slate-600">Type<select className="studio-input mt-1" value={activityKind} onChange={event=>setActivityKind(event.target.value)}><option value="loan">Loan vehicle</option><option value="external_repair">External repair</option></select></label>}
        <Field name="title" label={activityKind==="hold"?"Reason for hold":activityKind==="workshop_request"?"Requested work":"Title / responsible person"} required/>
        <Field name="starts_at" label="Starts" type="datetime-local"/>
        <Field name="ends_at" label="Expected end" type="datetime-local"/>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">Notes<textarea name="note" rows={3} maxLength={2000} className="studio-input mt-1 w-full text-sm"/></label>
        <div className="sm:col-span-2 flex items-center gap-3"><button disabled={activityPending} className="btn-gradient text-xs">Record {activityNames[activityKind]?.toLowerCase()}</button>{activityState.error&&<span role="alert" className="text-xs text-rose-700">{activityState.error}</span>}{activityState.saved&&<span role="status" className="text-xs text-emerald-700">Recorded. Close this panel to see the activity log.</span>}</div>
      </form>
    </section>}
    {panel==="checks"&&canManage&&<section id="vehicle-checks" className="studio-surface p-5">
      <h2 className="text-lg font-semibold">Vehicle checks</h2><p className="mt-1 text-xs text-slate-500">Each result keeps the checker and timestamp for audit.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(checkNames).map(([code,label])=>{const row=checks.find((item)=>item.code===code);return <div key={code} className="border border-black/10 p-3 text-xs"><span className="font-semibold">{label}</span><span className="ml-2 capitalize text-slate-500">{row?.status??"pending"}</span>{row?.note&&<p className="mt-1 text-slate-600">{row.note}</p>}</div>})}</div>
      <form action={checkAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <input type="hidden" name="vehicle_id" value={vehicle.id}/>
        <label className="text-xs text-slate-600">Check<select name="code" className="studio-input mt-1">{Object.entries(checkNames).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
        <label className="text-xs text-slate-600">Result<select name="status" className="studio-input mt-1"><option value="pending">Pending</option><option value="passed">Passed</option><option value="attention">Needs attention</option></select></label>
        <Field name="note" label="Note"/>
        <button disabled={checkPending} className="btn-gradient text-xs">Save check</button>
      </form>{checkState.error&&<p role="alert" className="mt-2 text-xs text-rose-700">{checkState.error}</p>}{checkState.saved&&<p role="status" className="mt-2 text-xs text-emerald-700">Check saved.</p>}
    </section>}
    {panel==="edit"&&canManage&&<section id="vehicle-edit" className="studio-surface p-5">
      <div className="mb-5 flex items-center justify-between border-b border-[#d3d3ce] pb-4"><div><h2 className="text-xl font-bold text-[#191918]">Edit car</h2><p className="mt-1 text-xs text-[#555550]">Choose a section. Each edit is saved and audited separately.</p></div><button type="button" onClick={()=>setPanel(null)} className="border border-[#b5b5af] bg-white px-3 py-2 text-xs font-semibold text-[#292928] hover:bg-[#f0f0ed]">Close</button></div>
      <VehicleEditPanels canEditPurchase={canCreatePo} vehicle={vehicle} details={details} tradePrice={tradePrice} purchase={purchase} purchasePrice={purchasePrice} locations={locations}/>
    </section>}
    <section className="studio-surface p-5"><h2 className="text-sm font-semibold uppercase tracking-widest text-slate-600">Operational history</h2>{activities.length===0?<p className="mt-3 text-sm text-slate-500">No holds, loans, events or workshop requests.</p>:<div className="mt-3 space-y-2">{activities.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 py-2 text-sm"><div><b>{activityNames[item.kind]??item.kind}</b> · {item.title}<p className="text-xs text-slate-500">{item.note}{item.actor?` · ${item.actor}`:""} · {new Date(item.created_at).toLocaleString("en-IE")}</p></div><div className="flex items-center gap-2 text-xs"><span className="capitalize text-slate-500">{item.status}</span>{canManage&&item.status==="open"&&<button type="button" className={actionClass} onClick={()=>void closeVehicleActivity(vehicle.id,item.id)}>Close</button>}</div></div>)}</div>}</section>
  </div>;
}
