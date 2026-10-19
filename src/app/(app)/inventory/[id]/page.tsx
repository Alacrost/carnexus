import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoViewings } from "@/lib/demo";
import { demoEntityId } from "@/lib/demo-ids";
import { createSalesClient } from "@/lib/sales-client";
import { loadVehicleSales, isOpenVehicleDeal } from "@/lib/vehicle-sales";
import { can } from "@/lib/types";
import { commercialPermission } from "@/lib/commercial-server";
import { ServiceEntryForm } from "./vehicle-details";
import { PhotosUploader, type Photo } from "./photos-uploader";
import { EntityLink } from "@/components/entity-link";
import { VehiclePlate } from "@/components/vehicle-plate";
import { VehicleWorkspace, type WorkspaceDetails, type VehicleActivity, type VehicleCheck } from "./vehicle-workspace";
import {VehicleHistoryReportForm} from "./history-report-form";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function daysSince(iso?: string | null) {
  return iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${m}`;
}

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const canManage = can.manageVehicles(session.role);
  const canDeals = can.manageDeals(session.role);
  const demo = isDemoMode();
  let details:WorkspaceDetails={}; let cost:number|null=null; let tradePrice:number|null=null; let detailsError=false;
  let activities:VehicleActivity[]=[];let checks:VehicleCheck[]=[];
  let poReady=false;
  let purchaseLoadError=false;
  let locations:{id:string;name:string}[]=[];let locationName="Main location";
  let services:{id:string;serviced_on:string;km:number|null;description:string;provider:string|null;reference:string|null}[]=[];
  let historyReports:{id:string;source:string;report_reference:string|null;reported_on:string;accident_status:string;write_off_status:string;stolen_status:string;mileage_discrepancy_status:string;notes:string|null}[]=[];
  let historyLoadError=false;
  const canCost=await commercialPermission("cost");
  const canReadHistory=await commercialPermission("read");
  const canCreatePo=await commercialPermission("purchase");
  const canEditVehicle=canManage&&await commercialPermission("work");

  let vehicle: {
    id: string;
    vehicle_no?: number | null;
    make: string;
    model: string;
    year: number;
    km: number;
    fuel: string;
    transmission: string;
    sale_price: number | null;
    status: string;
    registration?: string | null;
    stock_class?: string | null; website_visible?: boolean; featured?: boolean;
    location_id?: string | null; description?: string | null;
    originating_po_id?: string | null;
    created_by?:string|null;updated_by?:string|null;
    created_at?: string; updated_at?: string;
  } | null = null;
  let photos: Photo[] = [];

  if (demo) {
    const demoIndex = demoVehicles.findIndex((v) => v.id === id || demoEntityId(v.id) === id);
    vehicle = demoIndex >= 0 ? ({ ...demoVehicles[demoIndex], vehicle_no: demoIndex + 1,
      stock_class: demoVehicles[demoIndex].stock_class??"main",website_visible:true,featured:false,
      location_id:null,description:null } as unknown as typeof vehicle) : null;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vehicles")
      .select("id, vehicle_no, make, model, year, km, fuel, transmission, sale_price, status, registration, stock_class, website_visible, featured, location_id, description, originating_po_id, created_by, updated_by, created_at, updated_at")
      .eq("dealer_id", session.dealer.id)
      .eq("id", id)
      .maybeSingle();
    vehicle = data;

    if (vehicle) {
      const { data: rows } = await supabase
        .from("vehicle_photos")
        .select("id, storage_path, is_cover")
        .eq("dealer_id", session.dealer.id)
        .eq("vehicle_id", id)
        .order("position", { ascending: true });

      const paths = (rows ?? []).map((r) => r.storage_path);
      const signed = paths.length
        ? (await supabase.storage.from("vehicle-photos").createSignedUrls(paths, 3600)).data ?? []
        : [];
      const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
      photos = (rows ?? []).map((r) => ({
        id: r.id,
        url: urlByPath.get(r.storage_path) ?? "",
        is_cover: r.is_cover,
      }));
    }
  }

  if (!vehicle) notFound();

  // Upcoming viewings for this car (demo data only — viewings are not persisted yet).
  const upcomingViewings = demo
    ? demoViewings.filter((v) => v.vehicle_id === id)
    : [];

  // Open deal on this car.
  let sellingLoadError=false;
  let activeDeals:{id:string;deal_no:string;status:string;stage:string|null;finance_status:string;customer:string;customerId:string|null;employee:string|null;updatedAt:string|null;amount:number|null;currency:string;hasTradeIn:boolean|null}[]=[];
  let openDeal: { id: string; deal_no: string; status: string; customer: string } | null = null;
  let saleRecord: { id:string;deal_no:string;so_no:string|null;status:string;stage:string|null;finance_status:string;finance_company:string|null;customer:string;customerId:string|null;customerPhone:string|null;salesperson:string|null;createdAt:string;currency:string;price:number;paid:number|null;pending:number|null;balance:number|null;invoice:{id:string;number:string;date:string|null}|null } | null = null;
  let buyingPo: { id: string; po_no: string; status: string; vendor_id?:string|null; purchase_date?:string|null; received_on?:string|null; inv_ref?:string|null; vat_scheme?:string|null;vat_rate?:number|null;imported?:boolean;vrt_amount?:number|null;vrt_vat_treatment?:"included"|"excluded"; finance_company?:string|null; deal_id?:string|null; created_by?:string|null; updated_by?:string|null;created_at?:string|null;updated_at?:string|null;purchase_amount_known?:boolean } | null = null;
  let poTotal:number|null=null;
  let vendorName:string|null=null;
  let buyerName:string|null=null;
  if (canDeals) {
    const supabase = await createSalesClient();
    const saleResult=await loadVehicleSales(supabase,session.dealer.id,demo?demoEntityId(id)!:id).then(rows=>({rows,error:false})).catch(()=>({rows:[],error:true}));
    sellingLoadError=saleResult.error;
    const saleRows=saleResult.rows;
    activeDeals=saleRows.filter(deal=>isOpenVehicleDeal(deal.status)).map(deal=>({id:deal.id,deal_no:deal.deal_no,status:deal.status,stage:deal.stage,finance_status:deal.finance_status,customer:deal.customer?.name??"—",customerId:deal.customer?.id??null,employee:deal.employee,updatedAt:deal.updated_at??null,amount:deal.retail_price==null?null:Number(deal.retail_price),currency:deal.currency,hasTradeIn:deal.hasTradeIn}));
    const row=saleRows.find(deal=>isOpenVehicleDeal(deal.status)&&deal.status!=="vehicle_interest")??saleRows.find(deal=>isOpenVehicleDeal(deal.status))??saleRows[0];
    if(row){
      const [sellerResult,balanceResult,invoiceResult]=await Promise.all([
        row.salesperson_id?supabase.from("profiles").select("full_name").eq("id",row.salesperson_id).maybeSingle():Promise.resolve({data:null}),
        supabase.rpc("deal_balances",{p_dealer:session.dealer.id,p_deal:row.id}),
        supabase.from("deal_documents").select("id,number,effective_date,created_at").eq("dealer_id",session.dealer.id).eq("deal_id",row.id).eq("kind","invoice").neq("status","void").order("created_at",{ascending:false}).limit(1).maybeSingle(),
      ]);
      const balance=balanceResult.data as {paid?:number;pending?:number;balance?:number}|null;
      const invoice=invoiceResult.data;
      saleRecord={id:row.id,deal_no:row.deal_no,so_no:row.so_no,status:row.status,stage:row.stage,finance_status:row.finance_status,finance_company:row.finance_company,customer:row.customer?.name??"—",customerId:row.customer?.id??null,customerPhone:row.customer?.phone??null,salesperson:sellerResult.data?.full_name??null,createdAt:row.created_at,currency:row.currency,price:Number(row.retail_price??0),paid:balance?.paid==null?null:Number(balance.paid),pending:balance?.pending==null?null:Number(balance.pending),balance:balance?.balance==null?null:Number(balance.balance),invoice:invoice?{id:invoice.id,number:invoice.number,date:invoice.effective_date??invoice.created_at}:null};
    }
    if (row && !["completed", "cancelled", "reversed", "vehicle_interest"].includes(row.status)) {
      openDeal = { id: row.id, deal_no: row.deal_no, status: row.status, customer: row.customer?.name ?? "—" };
    }
  }

  // Acquisition is independent of whether this user can open or manage sales.
  // Financial roles see the PO details; other roles still get the safe readiness signal below.
  if(!demo&&can.viewFinancials(session.role)){
    const db=await createClient();
    const poSelect="id, po_no, status, vendor_id, purchase_date, received_on, inv_ref, vat_scheme, vat_rate, imported, vrt_amount, vrt_vat_treatment, finance_company, deal_id, created_by, updated_by, created_at, updated_at, purchase_amount_known";
    const linked=vehicle.originating_po_id
      ?await db.from("purchase_orders").select(poSelect).eq("dealer_id",session.dealer.id).eq("id",vehicle.originating_po_id).maybeSingle()
      :null;
    const candidate=linked?.data?linked:await db.from("purchase_orders").select(poSelect).eq("dealer_id",session.dealer.id).eq("vehicle_id",id).neq("status","cancelled").order("created_at",{ascending:false}).limit(1).maybeSingle();
    purchaseLoadError=!!(linked?.error||candidate.error);
    const po=candidate.data;
    if(po){
      buyingPo=po;
      if(po.vendor_id){const {data:vendor}=await db.from("customers").select("name").eq("dealer_id",session.dealer.id).eq("id",po.vendor_id).maybeSingle();vendorName=vendor?.name??null;}
      if(canCost&&po.purchase_amount_known){const {data:lines}=await db.from("po_lines").select("gross").eq("dealer_id",session.dealer.id).eq("po_id",po.id);if(lines)poTotal=lines.reduce((sum,line)=>sum+Number(line.gross??0),0);}
    }
  }

  if(!demo){
    const db=await createClient();
    if(canReadHistory){const history=await db.from("vehicle_history_reports").select("id,source,report_reference,reported_on,accident_status,write_off_status,stolen_status,mileage_discrepancy_status,notes").eq("dealer_id",session.dealer.id).eq("vehicle_id",id).order("created_at",{ascending:false});historyReports=history.data??[];historyLoadError=!!history.error;}
    const [detailResult,historyResult,activityResult,checkResult,locationResult,poGateResult]=await Promise.all([
      db.from("vehicle_details").select("vin,trim,body_style,colour,engine_cc,keys_count,previous_owners,service_history,last_service_on,last_service_km,timing_belt_on,nct_expiry,warranty_months,has_logbook,equipment,condition_notes,first_registered_on,local_registered_on,original_registration,tax_expiry,co2_g_km,gross_weight_kg,body_length_mm,engine_no,doors,metallic_paint,key_peg_ref,hp_check_status,vlc_status,vlc_number,repair_notes,internal_notes,yard,tags").eq("dealer_id",session.dealer.id).eq("vehicle_id",id).maybeSingle(),
      db.from("vehicle_service_history").select("id,serviced_on,km,description,provider,reference").eq("dealer_id",session.dealer.id).eq("vehicle_id",id).order("serviced_on",{ascending:false}),
      db.from("vehicle_workspace_events").select("id,kind,title,note,status,starts_at,ends_at,created_at,created_by,closed_at").eq("dealer_id",session.dealer.id).eq("vehicle_id",id).order("created_at",{ascending:false}),
      db.from("vehicle_checks").select("code,status,note,checked_at,checked_by").eq("dealer_id",session.dealer.id).eq("vehicle_id",id),
      db.from("dealer_locations").select("id,name").eq("dealer_id",session.dealer.id).eq("active",true).order("name"),
      db.rpc("vehicle_purchase_ready",{p_dealer:session.dealer.id,p_vehicle:id}),
    ]);
    poReady=!poGateResult.error&&poGateResult.data===true;
    purchaseLoadError=purchaseLoadError||!!poGateResult.error;
    detailsError=!!(detailResult.error||historyResult.error||activityResult.error||checkResult.error);
    details=detailResult.data??{};services=historyResult.data??[];
    locations=locationResult.data??[];locationName=locations.find(x=>x.id===vehicle.location_id)?.name??"Main location";
    const actorIds=[...new Set([...(activityResult.data??[]).map(x=>x.created_by),...(checkResult.data??[]).map(x=>x.checked_by)].filter(Boolean))] as string[];
    const {data:actors}=actorIds.length?await db.from("profiles").select("id,full_name").in("id",actorIds):{data:[] as {id:string;full_name:string|null}[]};
    const actorNames=new Map((actors??[]).map(x=>[x.id,x.full_name]));
    activities=(activityResult.data??[]).map(x=>({...x,actor:x.created_by?actorNames.get(x.created_by)??null:null}));
    checks=(checkResult.data??[]).map(x=>({...x,actor:x.checked_by?actorNames.get(x.checked_by)??null:null}));
    if(canCost){const [res,trade]=await Promise.all([db.rpc("vehicle_purchase_cost",{p_dealer:session.dealer.id,p_vehicle:id}),db.from("vehicle_trade_prices").select("trade_price").eq("dealer_id",session.dealer.id).eq("vehicle_id",id).maybeSingle()]);if(!res.error&&res.data!==null)cost=Number(res.data);tradePrice=trade.data?.trade_price??null;}
  }
  const held=activities.some(x=>x.kind==="hold"&&x.status==="open");
  const auditIds=[...new Set([vehicle.created_by,vehicle.updated_by,buyingPo?.created_by,buyingPo?.updated_by].filter(Boolean))] as string[];
  const auditActors=new Map<string,string>();
  if(!demo&&auditIds.length){
    const db=await createClient();
    const {data:profiles}=await db.from("profiles").select("id,full_name").in("id",auditIds);
    for(const profile of profiles??[])auditActors.set(profile.id,profile.full_name||"Unnamed user");
  }
  const actorLabel=(actorId?:string|null)=>actorId?auditActors.get(actorId)??"Former or unavailable user":"Not recorded";
  buyerName=buyingPo?.created_by?actorLabel(buyingPo.created_by):null;
  const hasOriginPo=poReady;
  const canSell = canDeals && !["sold","returned_to_customer"].includes(vehicle.status) && !held;
  const daysInStock=vehicle.status==="sold"?null:daysSince(buyingPo?.received_on??vehicle.created_at);

  return (
    <div>
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-950"
      >
        <ArrowLeftIcon size={14} /> Inventory
      </Link>
      <VehicleWorkspace
        vehicle={{id:vehicle.id,make:vehicle.make,model:vehicle.model,year:vehicle.year,km:vehicle.km,
          registration:vehicle.registration??null,fuel:vehicle.fuel,transmission:vehicle.transmission,
          sale_price:vehicle.sale_price,stock_class:vehicle.stock_class??"main",
          website_visible:vehicle.website_visible??true,featured:vehicle.featured??false,
          location_id:vehicle.location_id??null,description:vehicle.description??null}}
        vehicleNo={vehicle.vehicle_no??null} status={vehicle.status} openDeal={openDeal} saleRecord={saleRecord} activeDeals={activeDeals} sellingLoadError={sellingLoadError} canSell={canSell} hasOriginPo={hasOriginPo} originatingPoId={vehicle.originating_po_id??null} canCreatePo={canCreatePo} purchaseLoadError={purchaseLoadError}
        details={details} tradePrice={tradePrice} purchase={buyingPo} purchasePrice={cost} purchaseTotal={poTotal} vendorName={vendorName} buyerName={buyerName} canCost={canCost} locations={locations}
        audit={{createdBy:actorLabel(vehicle.created_by),updatedBy:actorLabel(vehicle.updated_by),createdAt:vehicle.created_at??null,updatedAt:vehicle.updated_at??null}}
        purchaseAudit={buyingPo?{createdBy:actorLabel(buyingPo.created_by),updatedBy:actorLabel(buyingPo.updated_by),createdAt:buyingPo.created_at??null,updatedAt:buyingPo.updated_at??null}:null}
        activities={activities} checks={checks} canManage={canEditVehicle}
      />

      <section className="studio-surface mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595955]">Vehicle record</p><h2 className="mt-1 text-lg font-semibold text-[#191918]">At a glance</h2></div><span className="text-xs font-medium text-[#464642]">{locationName}{details.yard?` · ${details.yard}`:""}</span></div>
        <dl className="mt-4 grid gap-x-5 gap-y-4 border border-black/10 bg-[#f5f5f3] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">Plate</dt><dd className="mt-1"><VehiclePlate registration={vehicle.registration} compact/></dd></div>
          <Spec prominent label="Asking price" value={vehicle.sale_price!=null?new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR"}).format(vehicle.sale_price):"Not set"}/>
          <Spec prominent label="Mileage" value={`${vehicle.km.toLocaleString("en-IE")} km`}/>
          <Spec prominent label="Stock location" value={locationName}/>
          <Spec prominent label="Variant" value={details.trim}/>
          <Spec prominent label="VIN / chassis" value={details.vin}/>
          <Spec prominent label="NCT" value={details.nct_expiry}/>
          <Spec prominent label="Days in stock" value={daysInStock}/>
        </dl>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="studio-surface p-5">
          <SectionHeading eyebrow="Identity" title="Registration & vehicle"/>
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <Spec label="Year" value={vehicle.year}/><Spec label="First registered" value={details.first_registered_on}/>
            <Spec label="Current plate" value={vehicle.registration}/><Spec label="Original plate" value={details.original_registration}/>
            <Spec label="Local registration" value={details.local_registered_on}/><Spec label="VIN / chassis" value={details.vin}/>
            <Spec label="Previous owners" value={details.previous_owners}/><Spec label="Colour" value={details.colour}/>
          </dl>
        </section>
        <section className="studio-surface p-5">
          <SectionHeading eyebrow="Specification" title="Technical details"/>
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <Spec label="Fuel / transmission" value={`${vehicle.fuel} / ${vehicle.transmission}`}/><Spec label="Body / doors" value={[details.body_style,details.doors].filter(Boolean).join(" · ")}/>
            <Spec label="Engine" value={details.engine_cc?`${details.engine_cc} cc`:null}/><Spec label="Engine no." value={details.engine_no}/>
            <Spec label="CO₂" value={details.co2_g_km!=null?`${details.co2_g_km} g/km`:null}/><Spec label="Gross weight" value={details.gross_weight_kg!=null?`${details.gross_weight_kg} kg`:null}/>
            <Spec label="Body length" value={details.body_length_mm!=null?`${details.body_length_mm} mm`:null}/><Spec label="Tax expiry" value={details.tax_expiry}/>
          </dl>
        </section>
        <section className="studio-surface p-5 xl:col-span-2">
          <SectionHeading eyebrow="Availability" title="Stock & presentation"/>
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Spec label="Location" value={locationName}/><Spec label="Yard" value={details.yard}/><Spec label="Stock class" value={vehicle.stock_class}/><Spec label="Days in stock" value={daysInStock}/>
            <Spec label="Website" value={vehicle.website_visible?"Visible":"Hidden"}/><Spec label="Featured" value={vehicle.featured?"Yes":"No"}/><Spec label="Service history" value={details.service_history?.replaceAll("_"," ")}/><Spec label="Record created" value={vehicle.created_at?new Date(vehicle.created_at).toLocaleString("en-IE"):null}/>
          </dl>
          {vehicle.description&&<p className="mt-4 border-t border-black/10 pt-3 text-sm text-[#464642]">{vehicle.description}</p>}
          {details.equipment?.length?<div className="mt-4 flex flex-wrap gap-1.5">{details.equipment.map(item=><span key={item} className="border border-black/10 bg-[#f5f5f2] px-2 py-1 text-[11px] text-[#353532]">{item.replaceAll("_"," ")}</span>)}</div>:null}
          {details.tags?.length?<p className="mt-3 text-xs text-[#595955]">Tags: {details.tags.join(", ")}</p>:null}
          <p className="mt-4 border-t border-black/10 pt-3 text-[11px] text-[#676761]">Last updated {vehicle.updated_at?new Date(vehicle.updated_at).toLocaleString("en-IE"):"—"}</p>
        </section>
      </div>

      {canReadHistory&&<section className="studio-surface mt-5 p-5"><SectionHeading eyebrow="Due diligence" title="Vehicle history & buyer disclosure"/><p className="mt-3 text-xs text-[#55554f]">Reports are retained with this car for future resale. “Unknown” means no determination has been recorded; it does not mean clear.</p>{historyLoadError?<p role="alert" className="mt-3 text-sm text-rose-700">Vehicle history could not load.</p>:historyReports.length===0?<p className="mt-3 text-sm text-[#55554f]">No vehicle history report recorded.</p>:<div className="mt-4 space-y-3">{historyReports.map(report=><article key={report.id} className="border border-black/10 bg-[#f5f5f3] p-4"><div className="flex flex-wrap justify-between gap-2 text-xs"><b className="capitalize text-[#191918]">{report.source.replaceAll("_"," ")}</b><span className="text-[#55554f]">{report.reported_on}{report.report_reference?` · Ref ${report.report_reference}`:""}</span></div><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">{[["Accident",report.accident_status],["Write-off",report.write_off_status],["Stolen",report.stolen_status],["Mileage discrepancy",report.mileage_discrepancy_status]].map(([label,status])=><div key={label} className={`border-l-2 pl-2 ${status==="yes"?"border-amber-600 text-amber-900":"border-black/15 text-[#454540]"}`}><dt className="font-semibold">{label}</dt><dd className="mt-1 capitalize">{status==="yes"?"Reported finding":status==="no"?"No reported issue":"Unknown / not checked"}</dd></div>)}</dl>{report.notes&&<p className="mt-3 border-t border-black/10 pt-2 text-xs text-[#454540]">{report.notes}</p>}</article>)}</div>}{canEditVehicle&&!demo&&<VehicleHistoryReportForm vehicleId={id}/>}</section>}

      <section className="studio-surface mt-5 p-5">
        <h2 className="text-lg font-semibold">Checks & extra information</h2>
        <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Spec label="HP check" value={details.hp_check_status?.replaceAll("_"," ")}/><Spec label="VRC / VLC status" value={details.vlc_status}/><Spec label="VRC / VLC no." value={details.vlc_number}/><Spec label="Logbook" value={details.has_logbook?"Available":"Not confirmed"}/>
          <Spec label="Keys" value={details.keys_count}/><Spec label="Key peg" value={details.key_peg_ref}/><Spec label="Metallic paint" value={details.metallic_paint?"Yes":"No"}/><Spec label="Warranty" value={details.warranty_months!=null?`${details.warranty_months} months`:null}/>
          <Spec label="Last service" value={details.last_service_on}/><Spec label="Service mileage" value={details.last_service_km!=null?`${details.last_service_km} km`:null}/><Spec label="Timing belt" value={details.timing_belt_on}/>
        </dl>
        {checks.length>0&&<div className="mt-4 grid gap-2 sm:grid-cols-3">{checks.map(check=><div key={check.code} className="border border-black/10 p-3 text-xs"><b className="capitalize">{check.code.replaceAll("_"," ")}</b><span className="ml-2 capitalize text-slate-500">{check.status}</span>{check.note&&<p className="mt-1 text-slate-600">{check.note}</p>}{check.checked_at&&<p className="mt-1 text-slate-500">{check.actor??"Team"} · {new Date(check.checked_at).toLocaleString("en-IE")}</p>}</div>)}</div>}
        {details.condition_notes&&<p className="mt-4 text-sm text-slate-600"><b>Condition:</b> {details.condition_notes}</p>}
        {details.repair_notes&&<p className="mt-2 text-sm text-slate-600"><b>Repairs:</b> {details.repair_notes}</p>}
        {details.internal_notes&&<p className="mt-2 text-sm text-slate-600"><b>Internal notes:</b> {details.internal_notes}</p>}
      </section>

      {(openDeal || upcomingViewings.length > 0) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {openDeal && (
            <div className="studio-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Open deal</p>
              <p className="mt-2 text-sm text-slate-800"><EntityLink kind="deal" id={openDeal.id} reference={openDeal.deal_no} href={`/business/deals/${openDeal.id}`} /> <span className="ml-2">{openDeal.customer}</span></p>
              <span className="mt-2 inline-block border border-black/10 bg-slate-50 px-2 py-0.5 text-[11px] capitalize text-slate-600">{openDeal.status}</span>
            </div>
          )}
          {upcomingViewings.length > 0 && (
            <div className="studio-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Upcoming viewings</p>
              <ul className="mt-2 space-y-1.5">
                {upcomingViewings.map((v) => (
                  <li key={v.id} className="text-sm text-slate-600">
                    <span className="text-slate-900">{v.lead_name}</span> · {fmtDateTime(v.scheduled_for)}
                    <span className="text-slate-500"> · {v.responsible}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {detailsError?<p role="alert" className="mt-5 text-rose-700">Vehicle details could not load. Check the connection and vehicle workspace migration.</p>:<section className="studio-surface mt-5 p-5"><h2 className="text-lg font-semibold">Maintenance history</h2>{services.length===0&&<p className="mt-2 text-sm text-slate-500">No maintenance entries recorded.</p>}<ol className="mt-3 space-y-3">{services.map(x=><li key={x.id} className="border-t border-black/10 pt-3"><p className="text-sm">{x.serviced_on} · {x.km??"—"} km · {x.provider}</p><p className="mt-1 text-sm text-slate-700">{x.description}</p><p className="text-xs text-slate-500">{x.reference}</p></li>)}</ol>{canManage&&<ServiceEntryForm id={id}/>}</section>}
      <h2 className="mt-8 text-sm font-medium">Photos</h2>
      <div className="mt-3">
        {canManage ? (
          <PhotosUploader
            dealerId={demo ? null : session.dealer.id}
            vehicleId={vehicle.id}
            initialPhotos={photos}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.url}
                alt=""
                className="aspect-video w-full rounded-lg border border-slate-800 object-cover"
              />
            ))}
            {photos.length === 0 && (
              <p className="text-sm text-slate-500">No photos yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Spec({label,value,prominent=false}:{label:string;value:string|number|null|undefined;prominent?:boolean}) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-wider text-[#595955]">{label}</dt><dd className={`mt-1 font-semibold text-[#191918] ${prominent?"text-base":"text-sm"}`}>{value===null||value===undefined||value===""?"—":value}</dd></div>;
}

function SectionHeading({eyebrow,title}:{eyebrow:string;title:string}) {
  return <div className="crm-section-header"><p className="text-[10px] font-bold uppercase tracking-[0.18em]">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold">{title}</h2></div>;
}
