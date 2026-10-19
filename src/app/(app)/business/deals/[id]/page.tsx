import {DealEventLog} from "./deal-event-log";
import {AssignedTo} from "../assigned-to";
import {DealFinancialSummary} from "../deal-workspace";
import {DealSheet} from "../deal-sheet";
import {DealWarrantySelect} from "../deal-warranty-select";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { isDemoMode, demoSalesDeals, demoCustomers, demoVehicles } from "@/lib/demo";
import { can } from "@/lib/types";
import { dealMoney,calcVehicleTax } from "@/lib/deals";
import { commercialPermission } from "@/lib/commercial-server";
import { CancelDealPanel, DealRefundPanel, PostInvoiceCorrectionPanel, StatusButton, type CreditLine, type FinanceValues } from "./commercial-panels";
import {ClearReceiptButton} from "../../reports/clear-receipt-button";
import {listDealFinancialPending} from "@/lib/deal-refunds-server";
import { AddPayment } from "./add-payment";
import { DealStage } from "./deal-stage";
import { DealDocuments, type DocRow } from "./deal-documents";
import { AddTradeIn } from "./add-trade-in";
import {EditTradeIn} from "./edit-trade-in";
import type {FollowUpStep} from "./follow-up-steps";
import {RemoveInterest} from "./remove-interest";
import { RequiredDocs } from "./required-docs";
import { DealAddons, type Addon } from "./deal-addons";
import { ReversePayment } from "./reverse-payment";
import { EntityLink, vehicleReference } from "@/components/entity-link";
import {VehicleHistoryDisclosure,type VehicleFindings} from "./vehicle-history-disclosure";

function money(value:number,currency:string){
  return new Intl.NumberFormat("en-IE",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
}

interface Pay { id?:string;kind: string; amount: number; method: string | null; paid_on: string | null; clearance_status?: string;reference?:string|null;created_by?:string|null;created_at?:string;cleared_on?:string|null;rejection_reason?:string|null;reverses_payment_id?:string|null;by?:string }
interface Evt { kind: string; detail: string; audit?:unknown; by: string; at: string }
interface TradeIn { vehicleId?: string | null; vehicleReference?: string | null; label: string; reg: string | null; allowance: number; settlement: number; netEquity: number }
interface DealView extends FinanceValues {
  version?: number; so_no?: string;
  lead_id?: string | null;
  id: string; deal_no: string; status: string; stage: string; currency: string; source?:string|null;
  customer: string; customerContact: string; salesperson: string; salespersonId?:string|null;
  customerId?: string | null; vehicleId?: string | null; vehicleReference?: string | null; vehicleRegistration?: string | null;
  car: string; sale: number; retail: number; siv: number; vat_scheme: string;
  purchaseTaxVerified?:boolean;vat_rate?:number;imported?:boolean;vrt_amount?:number;vrt_vat_treatment?:"included"|"excluded";
  vehicleYear?:number|null;vehicleFuel?:string|null;vehicleBody?:string|null;vehicleColour?:string|null;
  windowPrice?:number|null; vehicleKm?:number|null; customerPhone?:string|null; customerEmail?:string|null;
  quote_terms?:string|null;warranty_name?:string|null;warranty_terms?:string|null;finance_terms?:string|null;deal_comments?:string|null;
  payments: Pay[]; events: Evt[]; documents: DocRow[]; tradeIns: TradeIn[];
  requiredDocs: Record<string, boolean>; addons: Addon[];
}

const NEXT: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "agreed", label: "Mark agreed" }],
  quoted: [{ status: "agreed", label: "Mark agreed" }],
  agreed: [{ status: "completed", label: "Complete sale" }],
  finance: [{ status: "completed", label: "Complete sale" }],
  completed: [],
  cancelled: [],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtEvent(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}
function fmtPaymentDate(value:string|null){
  if(!value)return "—";const[year,month,day]=value.split("-");return `${day}/${month}/${year}`;
}

export default async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return <p className="text-sm text-slate-400">No access.</p>;
  const [canPay,canWork,canRead] = await Promise.all(["payment","work","read"].map(commercialPermission));
  if(!canRead)return <p>No commercial access.</p>;
  const assignmentDb=await createClient();
  const assignmentPermission=await assignmentDb.rpc("commercial_allowed",{p_dealer_id:session.dealer.id,p_permission:"assign"});
  const canAssign=assignmentPermission.data===true&&!assignmentPermission.error;
  let assignmentOptions:{id:string;label:string}[]=[];
  if(canAssign){
    const {data:members,error:memberError}=await assignmentDb.from("dealer_members").select("user_id").eq("dealer_id",session.dealer.id).eq("status","active").in("role",["owner","admin","sales"]);
    const memberIds=(members??[]).map(member=>member.user_id);
    if(!memberError&&memberIds.length){const {data:profiles,error:profileError}=await assignmentDb.from("profiles").select("id,full_name").in("id",memberIds);if(!profileError)assignmentOptions=(profiles??[]).map(profile=>({id:profile.id,label:profile.full_name??"Team member"}));}
  }
  const showProfit = false; // Cost fields are not selected into the sales view.

  let d: DealView | null = null;
  let summary:{total:number;paid:number;pending:number;balance:number;outstanding:number;overpaid:number;equity:number}|null=null;
  let purchaseReady=false;
  let invoiceCorrection: { number: string; lines: CreditLine[] } | null = null;
  let vehicleFindings:VehicleFindings|null=null;
  let vehicleDisclosureConfirmed=false;
  let followUpSteps:FollowUpStep[]=[];
  let stepsLoadError=false;

  if(isDemoMode() && !/^[0-9a-f-]{36}$/i.test(id)) {
    const x = demoSalesDeals.find((z) => z.id === id);
    if (!x) notFound();
    d = {
      id: x.id, deal_no: x.deal_no, status: x.status, stage: x.stage, currency: x.currency,
      customer: x.customer.name, customerContact: [x.customer.phone, x.customer.email].filter(Boolean).join(" · "),
      customerId: demoCustomers.find((customer) => customer.name === x.customer.name)?.id ?? null,
      vehicleId: demoVehicles.find((vehicle) => x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.id ?? null,
      vehicleReference: vehicleReference(demoVehicles.findIndex((vehicle) => x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`)) + 1 || null),
      vehicleRegistration: demoVehicles.find((vehicle) => x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.registration ?? null,
      salesperson: x.salesperson, car: x.order.vehicle_label, sale: x.order.price,
      vehicleYear:demoVehicles.find(vehicle=>x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.year??null,
      vehicleFuel:demoVehicles.find(vehicle=>x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.fuel??null,
      windowPrice:demoVehicles.find(vehicle=>x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.sale_price??null,
      vehicleKm:demoVehicles.find(vehicle=>x.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.km??null,
      customerPhone:x.customer.phone,customerEmail:x.customer.email,
      quote_terms:null,warranty_name:null,warranty_terms:null,finance_terms:null,deal_comments:null,
      retail: x.retail_price ?? x.order.price, siv: x.siv_total ?? 0, vat_scheme: x.order.vat_scheme,
      payments: x.payments,
      events: (x.events ?? []).map((e) => ({ kind: e.kind, detail: e.detail, by: e.by, at: e.at })),
      documents: [],
      tradeIns: x.tradeIn ? [{ vehicleId: demoVehicles.find((vehicle) => vehicle.registration === x.tradeIn?.reg)?.id ?? null, vehicleReference: vehicleReference(demoVehicles.findIndex((vehicle) => vehicle.registration === x.tradeIn?.reg) + 1 || null), label: x.tradeIn.vehicle_label, reg: x.tradeIn.reg, allowance: x.tradeIn.allowance, settlement: x.tradeIn.settlement, netEquity: x.tradeIn.net_equity }] : [],
      requiredDocs: (x.required_docs ?? {}) as Record<string, boolean>,
      addons: (x.addons ?? []) as Addon[],
    };
  } else {
    const supabase = await createClient();
    const { data: deal } = await supabase.from("deals").select("id, deal_no, status, stage, currency, source, customer_id, salesperson_id, lead_id, retail_price, siv_total, required_docs, version, so_no, finance_company, finance_reference, finance_address, finance_expected, finance_status, invoice_to_finance, quote_terms, warranty_name, warranty_terms, finance_terms, deal_comments").eq("dealer_id", session.dealer.id).eq("id", id).maybeSingle();
    if (!deal) notFound();
    const results = await Promise.all([
      supabase.from("deal_orders").select("vehicle_id, price, vat_scheme, vat_rate, imported, vrt_amount, vrt_vat_treatment").eq("dealer_id", session.dealer.id).eq("deal_id", id).eq("kind", "sale").maybeSingle(),
      supabase.from("payments").select("id, kind, amount, method, paid_on, clearance_status, reference, created_by, created_at, cleared_on, rejection_reason, reverses_payment_id").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at"),
      deal.customer_id ? supabase.from("customers").select("name, phone, email").eq("id", deal.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      deal.salesperson_id ? supabase.from("profiles").select("full_name").eq("id", deal.salesperson_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("deal_events").select("kind, detail, created_by, created_at").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at", { ascending: false }),
      supabase.from("deal_documents").select("id, kind, number, status, created_at, original_document_id, snapshot").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at", { ascending: false }),
    ]);
    const queryLabels=["sale order","payments","customer","salesperson","events","documents"];
    const failedQueries=results.flatMap((result,index)=>"error" in result&&result.error?[{index,label:queryLabels[index],error:result.error}]:[]);
    if(failedQueries.length){
      for(const failure of failedQueries)console.error("Deal query failed",{query:failure.label,code:failure.error.code});
      const taxSchemaMissing=failedQueries.some(({index,error})=>index===0&&["42703","PGRST204"].includes(error.code)&&/\b(vat_rate|imported|vrt_amount|vrt_vat_treatment)\b/i.test(error.message));
      return <p role="alert">{taxSchemaMissing?"Deal tax data is not available yet. Reload after the local database update.":`Deal data could not load (${failedQueries.map(failure=>failure.label).join(", ")}). Retry before recording payments.`}</p>;
    }
    const [{ data: order }, { data: pays }, { data: customer }, { data: sp }, { data: evRows }, { data: docRows }] = results;
    const purchaseTax=order?.vehicle_id?await supabase.rpc("vehicle_purchase_tax",{p_dealer:session.dealer.id,p_vehicle:order.vehicle_id}):{data:null,error:null};
    if(purchaseTax.error)return <p role="alert">Purchase tax data could not load. Retry before recording payments.</p>;
    const openTax=!["completed","cancelled","reversed"].includes(deal.status);
    const taxProfile=purchaseTax.data as {scheme:string;vatRate:number;imported:boolean;vrtAmount:number;vrtVatTreatment:"included"|"excluded"}|null;
    const invoice = (docRows ?? []).find((document) => document.kind === "invoice" && document.status !== "void");
    if (invoice) {
      const snapshot = invoice.snapshot as { lines?: { description?: string; gross?: number }[] } | null;
      const creditedByLine = new Map<number, number>();
      for (const document of docRows ?? []) {
        if (document.kind !== "credit_note" || document.status === "void" || document.original_document_id !== invoice.id) continue;
        const creditSnapshot = document.snapshot as { credited_lines?: { index?: number; gross?: number }[] } | null;
        for (const line of creditSnapshot?.credited_lines ?? []) {
          if (typeof line.index !== "number") continue;
          creditedByLine.set(line.index, (creditedByLine.get(line.index) ?? 0) + Number(line.gross ?? 0));
        }
      }
      invoiceCorrection = {
        number: invoice.number,
        lines: (snapshot?.lines ?? []).map((line, index) => ({
          index,
          description: line.description ?? `Invoice line ${index + 1}`,
          original: Number(line.gross ?? 0),
          remaining: Math.max(0, Number(line.gross ?? 0) - (creditedByLine.get(index) ?? 0)),
        })),
      };
    }
    const aggregate=await supabase.rpc("deal_balances",{p_dealer:session.dealer.id,p_deal:id});
    if(aggregate.error||!aggregate.data)return <p role="alert">The authoritative balance could not load.</p>;
    summary=aggregate.data as {total:number;paid:number;pending:number;balance:number;outstanding:number;overpaid:number;equity:number};
    const { data: pxRows,error:pxError } = await supabase.from("deal_orders").select("vehicle_id, price, settlement_amount, net_equity").eq("dealer_id", session.dealer.id).eq("deal_id", id).eq("kind", "purchase").eq("is_trade_in", true);
    if(pxError)return <p role="alert">Trade-in details could not load.</p>;
    const tradeVehicleIds=(pxRows??[]).map(row=>row.vehicle_id).filter((value):value is string=>Boolean(value));
    const {data:tradeVehicles,error:tradeVehicleError}=tradeVehicleIds.length?await supabase.from("vehicles").select("id,vehicle_no,make,model,year,registration").eq("dealer_id",session.dealer.id).in("id",tradeVehicleIds):{data:[],error:null};
    if(tradeVehicleError)return <p role="alert">Trade-in vehicles could not load.</p>;
    const tradeMap=new Map((tradeVehicles??[]).map(vehicle=>[vehicle.id,vehicle]));
    const tradeIns:TradeIn[]=(pxRows??[]).map(row=>{const vehicle=tradeMap.get(row.vehicle_id);return{vehicleId:row.vehicle_id,vehicleReference:vehicleReference(vehicle?.vehicle_no),label:vehicle?`${vehicle.year} ${vehicle.make} ${vehicle.model}`:"Trade-in",reg:vehicle?.registration??null,allowance:Number(row.price??0),settlement:Number(row.settlement_amount??0),netEquity:Number(row.net_equity??0)};});
    const { data: addonRows,error:addonError } = await supabase.from("deal_addons").select("id, kind, name, price").eq("dealer_id", session.dealer.id).eq("deal_id", id).order("created_at");
    if(addonError)return <p role="alert">Sale extras could not load.</p>;
    let car = "—"; let vehicleDisplayNumber: string | null = null; let vehicleRegistration: string | null = null;
    let windowPrice:number|null=null;let vehicleKm:number|null=null;let vehicleYear:number|null=null;let vehicleFuel:string|null=null;let vehicleBody:string|null=null;let vehicleColour:string|null=null;
    if (order?.vehicle_id) {
      const { data: v } = await supabase.from("vehicles").select("vehicle_no, make, model, year, registration, sale_price, km, fuel").eq("dealer_id",session.dealer.id).eq("id", order.vehicle_id).maybeSingle();
      if (v) { car = `${v.year} ${v.make} ${v.model}`; vehicleDisplayNumber = vehicleReference(v.vehicle_no); vehicleRegistration = v.registration;windowPrice=v.sale_price==null?null:Number(v.sale_price);vehicleKm=v.km==null?null:Number(v.km);vehicleYear=v.year;vehicleFuel=v.fuel; }
    }
    if(order?.vehicle_id){const {data:details}=await supabase.from("vehicle_details").select("body_style,colour").eq("dealer_id",session.dealer.id).eq("vehicle_id",order.vehicle_id).maybeSingle();vehicleBody=details?.body_style??null;vehicleColour=details?.colour??null;}
    const evByIds = [...new Set([...(evRows ?? []).map((e) => e.created_by),...(pays??[]).map(p=>p.created_by)].filter(Boolean) as string[])];
    const { data: evProfs } = evByIds.length ? await supabase.from("profiles").select("id, full_name").in("id", evByIds) : { data: [] as { id: string; full_name: string | null }[] };
    const byName = new Map((evProfs ?? []).map((p) => [p.id, p.full_name]));
    d = {
      ...deal, id: deal.id, deal_no: deal.deal_no, status: deal.status, stage: deal.stage ?? "vehicle_interest", currency: deal.currency,
      customer: customer?.name ?? "—", customerContact: [customer?.phone, customer?.email].filter(Boolean).join(" · "),
      customerId: deal.customer_id, vehicleId: order?.vehicle_id ?? null, vehicleReference: vehicleDisplayNumber, vehicleRegistration,
      salespersonId:deal.salesperson_id, salesperson: sp?.full_name ?? "—", car, sale: Number(order?.price ?? 0),
      windowPrice,vehicleKm,vehicleYear,vehicleFuel,vehicleBody,vehicleColour,customerPhone:customer?.phone,customerEmail:customer?.email,
      retail: Number(deal.retail_price ?? order?.price ?? 0), siv: Number(deal.siv_total ?? 0), purchaseTaxVerified:!openTax||taxProfile!==null,vat_scheme:openTax?taxProfile?.scheme??"margin":order?.vat_scheme??"margin",vat_rate:openTax?Number(taxProfile?.vatRate??0):Number(order?.vat_rate??23),imported:openTax?Boolean(taxProfile?.imported):Boolean(order?.imported),vrt_amount:openTax?Number(taxProfile?.vrtAmount??0):Number(order?.vrt_amount??0),vrt_vat_treatment:openTax?taxProfile?.vrtVatTreatment??"included":order?.vrt_vat_treatment??"included",
      payments: (pays ?? []).map(p=>({...p,by:p.created_by?byName.get(p.created_by)??"—":"System"})) as Pay[],
      events: (evRows ?? []).map((e) => ({
        kind: e.kind,
        detail: (e.detail as { message?: string } | null)?.message ?? e.kind,
        by: e.created_by ? byName.get(e.created_by) ?? "—" : "System",
        at: e.created_at, audit:e.detail,
      })),
      documents: (docRows ?? []).map((r) => ({ id: r.id, kind: r.kind, number: r.number, status: r.status, date: r.created_at })),
      tradeIns,
      requiredDocs: (deal.required_docs as Record<string, boolean> | null) ?? {},
      addons: (addonRows ?? []) as Addon[],
    };
  }

  if((!isDemoMode() || /^[0-9a-f-]{36}$/i.test(id))&&d.vehicleId){
    const db=await createClient();
    const {data}=await db.rpc("vehicle_purchase_ready",{p_dealer:session.dealer.id,p_vehicle:d.vehicleId});
    purchaseReady=data===true;
    const {data:findings,error:historyError}=await db.rpc("vehicle_history_findings",{p_dealer:session.dealer.id,p_vehicle:d.vehicleId});
    if(historyError)return <p role="alert">Vehicle history could not load. Invoice review is unavailable.</p>;
    vehicleFindings=findings as VehicleFindings;
    if(vehicleFindings?.reportIds.length){
      const {data:confirmation,error:confirmationError}=await db.from("deal_vehicle_disclosures").select("report_ids,customer_id,consent_confirmed").eq("dealer_id",session.dealer.id).eq("deal_id",d.id).eq("vehicle_id",d.vehicleId).maybeSingle();
      if(confirmationError)return <p role="alert">Buyer disclosure could not load.</p>;
      vehicleDisclosureConfirmed=Boolean(confirmation?.consent_confirmed&&confirmation.customer_id===d.customerId&&JSON.stringify(confirmation.report_ids)===JSON.stringify(vehicleFindings.reportIds));
    }
  }

  const paid = summary ? Number(summary.paid) : d.payments.reduce((a, p) => a + (p.kind === "refund" ? -Number(p.amount) : p.kind === "trade_allowance" ? 0 : Number(p.amount)), 0);
  if((!isDemoMode() || /^[0-9a-f-]{36}$/i.test(id))){
    const db=await createClient();const {data,error}=await db.from("deal_follow_up_steps").select("id,event_date,follow_up_date,status,event_note,action,version").eq("dealer_id",session.dealer.id).eq("deal_id",id).order("event_date",{ascending:false}).order("created_at",{ascending:false});
    followUpSteps=data??[];stepsLoadError=Boolean(error);
  }
  // Steps are temporarily hidden; retain their loading logic.
  void followUpSteps;void stepsLoadError;
  const closed = ["completed","cancelled","reversed"].includes(d.status);
  const refundOverview=d.status==="cancelled"?await listDealFinancialPending():null;
  const refundObligations=refundOverview?.refunds.filter(obligation=>obligation.dealId===d.id)??[];
  const paymentLocked=["cancelled","reversed"].includes(d.status);
  const m = dealMoney({ retailPrice: d.retail, sivTotal: d.siv, paid });
  const vehicleTax=calcVehicleTax(d.sale,d.vat_scheme,d.vat_rate??23,d.vrt_amount??0,d.vrt_vat_treatment??"included");
  const addonsTotal = summary ? Number(summary.total)-d.retail : d.addons.reduce((a, x) => a + Number(x.price), 0);
  const customerTotal = m.costToChange + addonsTotal;
  const balance = summary ? Number(summary.balance) : customerTotal - paid;
  const pendingReceipts=summary?Number(summary.pending??0):0;
  const overpaid=summary?Number(summary.overpaid??Math.max(-balance,0)):Math.max(-balance,0);
  const hasConfirmedDeposit=d.payments.some(payment=>{
    if(payment.kind!=="deposit"||!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0||!["not_required","cleared"].includes(payment.clearance_status??""))return false;
    const reversed=payment.id?d.payments.filter(other=>other.reverses_payment_id===payment.id&&["not_required","cleared"].includes(other.clearance_status??"")).reduce((total,other)=>total+Number(other.amount),0):0;
    return Number(payment.amount)>reversed;
  });
  const hasRegisteredPayment=d.payments.some(payment=>{
    if(!["deposit","balance","finance_payout"].includes(payment.kind)||!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0||!["pending","not_required","cleared"].includes(payment.clearance_status??""))return false;
    if(payment.clearance_status==="pending")return true;
    const reversed=payment.id?d.payments.filter(other=>other.reverses_payment_id===payment.id&&(["not_required","cleared"].includes(other.clearance_status??"")||other.kind==="receipt_reversal")).reduce((total,other)=>total+Number(other.amount),0):0;
    return Number(payment.amount)>reversed;
  });
  const hasConfirmedFinancePayment=d.payments.some(payment=>{
    if(payment.kind!=="finance_payout"||!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0||!["not_required","cleared"].includes(payment.clearance_status??""))return false;
    const reversed=payment.id?d.payments.filter(other=>other.reverses_payment_id===payment.id&&(["not_required","cleared"].includes(other.clearance_status??"")||other.kind==="receipt_reversal")).reduce((total,other)=>total+Number(other.amount),0):0;
    return Number(payment.amount)>reversed;
  });
  const removedPaymentIds=new Set(d.payments.filter(p=>p.rejection_reason==="Payment removed: entered incorrectly"&&p.reverses_payment_id).map(p=>p.reverses_payment_id));
  const visiblePayments=d.payments.filter(p=>p.rejection_reason!=="Payment removed: entered incorrectly"&&!removedPaymentIds.has(p.id));
  const displayEvents=d.events.map(event=>event.audit&&typeof event.audit==="object"&&"reason" in event.audit&&event.audit.reason==="Payment removed: entered incorrectly"?{...event,kind:"payment_removed",detail:"Payment removed · entered incorrectly"}:event);
  const transitions = canWork ? (NEXT[d.status] ?? []).filter((next)=>next.status!=="completed"||purchaseReady) : [];
  const warrantyOptions=await assignmentDb.from("dealer_warranty_presets").select("id,name,terms").eq("dealer_id",session.dealer.id).eq("active",true).order("name");

  return (
    <div className="w-full">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Deal</h1>
      <p className="mt-1 text-sm text-slate-400">{d.deal_no}{d.so_no?` · ${d.so_no}`:""}</p>
      <div className="flex flex-wrap items-center gap-3 mt-5">
        <Link href="/business/deals" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeftIcon size={14} /> Deals</Link>
        {canWork && !closed && <div className="flex items-center gap-2 text-xs text-slate-400"><span>Stage</span><DealStage dealId={d.id} stage={d.stage} /></div>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/messages?contextType=deal&contextId=${d.id}&contextLabel=${encodeURIComponent(d.deal_no)}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">Message team</Link>
          {transitions.map((t) => t.status==="completed"?<Link key={t.status} href={`/business/deals/${d.id}/finish`} className="deal-finish-button px-4 py-2 text-sm font-semibold">Finish Deal / generate invoice →</Link>:<StatusButton key={t.status} id={d.id} status={t.status} label={t.label}/>)}
          {canWork&&!purchaseReady&&["agreed","finance"].includes(d.status)&&<button type="button" disabled className="cursor-not-allowed border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">Complete sale · PO required</button>}
        </div>
      </div>
      {!purchaseReady&&!closed&&<div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-rose-500/40 border-l-4 border-l-rose-500 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"><span>This car has no verified purchase order. Keep working on the Deal, but completion and final invoice are blocked until the PO is linked.</span>{d.vehicleId&&<Link href={`/inventory/${d.vehicleId}`} className="font-semibold underline underline-offset-2">Open car buying info →</Link>}</div>}
      <div className="mt-6">
      <DealSheet saved={{
        invoiceCustomer:d.invoice_to_finance&&d.finance_company?{name:d.finance_company,address:d.finance_address}:undefined,
        requiredDocuments:canWork && !closed && <RequiredDocs dealId={d.id} docs={d.requiredDocs} />,
        customer:{id:d.customerId,name:d.customer,email:d.customerEmail,phone:d.customerPhone,source:d.source,status:<span className="capitalize">{d.stage==="closing"&&["agreed","finance"].includes(d.status)?"Closing · ":""}{d.status.replaceAll("_"," ")}</span>,assignedTo:<AssignedTo key={`${d.id}:${d.version??1}`} value={d.salespersonId??""} label={d.salesperson} options={assignmentOptions} canEdit={canAssign&&!closed&&assignmentOptions.length>0&&Boolean(d.version)} dealId={d.id} version={d.version??1}/>},
        vehicle:{name:d.car,href:d.vehicleId?`/inventory/${d.vehicleId}`:undefined,price:d.windowPrice==null?"—":money(d.windowPrice,d.currency),edit:canWork&&!closed&&<Link href={`/business/deals/${d.id}/edit`} className="deal-edit-cta inline-flex rounded-xl border px-5 py-2.5 text-sm font-semibold" style={{backgroundColor:"#243b32",color:"#fff",WebkitTextFillColor:"#fff"}}>Edit Deal</Link>,fields:[{label:"Reg",value:d.vehicleRegistration??"—"},{label:"Km",value:d.vehicleKm?.toLocaleString("en-IE")??"—"},{label:"Year",value:d.vehicleYear??"—"},{label:"Fuel",value:d.vehicleFuel??"—"},{label:"Body",value:d.vehicleBody??"—"},{label:"Colour",value:d.vehicleColour??"—"}]},
        warranty:{name:d.warranty_name,terms:d.warranty_terms,quoteTerms:d.quote_terms,comments:d.deal_comments,control:<DealWarrantySelect key={`${d.id}:${d.version??1}`} dealId={d.id} version={d.version??1} name={d.warranty_name??null} choices={warrantyOptions.data??[]} quoteTerms={d.quote_terms??""} comments={d.deal_comments??""} financeTerms={d.finance_terms??""} canEdit={canWork&&!closed&&Boolean(d.version)} loadError={Boolean(warrantyOptions.error)}/>},
        payments:<div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Payments</h2>
            <p className="mt-1 text-xs text-slate-500">Record each payment separately. You can mix cash, card, transfer, cheque or draft on the same day.</p>
            {canPay && !paymentLocked && <AddPayment dealId={d.id} />}
            <div className="mt-3 space-y-2">
              {visiblePayments.length === 0 && <p className="text-sm text-slate-500">No payments yet.</p>}
              {visiblePayments.map((p, i) => (
                <div key={p.id??i} id={p.id?`payment-${p.id}`:undefined} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div><span className="font-mono text-slate-200">{fmtPaymentDate(p.paid_on)}</span><span className="ml-3 capitalize text-slate-300">{p.kind.replaceAll("_", " ")} · {p.method??"—"}</span></div>
                    <strong className={`tabular-nums ${["refund","receipt_reversal"].includes(p.kind)?"text-rose-300":p.clearance_status==="pending"?"text-amber-300":"text-slate-200"}`}>{["refund","receipt_reversal"].includes(p.kind)?"−":""}{money(Number(p.amount),d.currency)}</strong>
                  </div>
                  <p className={`mt-1 break-words ${p.clearance_status==="pending"?"text-amber-300":p.clearance_status==="rejected"?"text-rose-300":"text-emerald-300"}`}>{p.reference?`Ref ${p.reference} · `:""}{p.clearance_status==="pending"?"Funds unconfirmed":p.clearance_status==="cleared"?`Confirmed ${fmtPaymentDate(p.cleared_on??null)}`:p.clearance_status==="rejected"?"Rejected / reversed":"Confirmed"}{p.rejection_reason&&<span className="block text-rose-200">{p.rejection_reason}</span>}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>Recorded {p.created_at?fmtEvent(p.created_at):"—"} · {p.by??"System"}</span>{canPay&&!paymentLocked&&p.id&&["deposit","balance","finance_payout"].includes(p.kind)&&["not_required","cleared","pending"].includes(p.clearance_status??"not_required")&&!d.payments.some(other=>other.reverses_payment_id===p.id)&&<ReversePayment paymentId={p.id}/>}</div>
                  {canPay&&p.id&&p.clearance_status==="pending"&&["deposit","balance","finance_payout"].includes(p.kind)&&<div className="mt-3 overflow-x-auto"><ClearReceiptButton paymentId={p.id} status="pending"/></div>}
                </div>
              ))}
            </div>
          </div>,
        paymentNotice:pendingReceipts>0&&<div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">Expected receipts awaiting confirmation: <b>{money(pendingReceipts,d.currency)}</b>. They do not reduce the amount to be paid.</div>,
        trades:<section className="min-w-0">
            {(!canWork||closed)&&<h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trade-in / part-exchange</h2>}
            {d.tradeIns.length===0&&(!canWork||closed)&&<p className="mt-1 text-sm text-slate-500">No trade-ins recorded yet.</p>}
            <div className={d.tradeIns.length?"mb-4 mt-2 divide-y divide-white/10":undefined}>{d.tradeIns.map((trade,index)=><div key={trade.vehicleId??index} className="py-3 first:pt-0">
              <p className="text-slate-100">{trade.vehicleId&&<EntityLink kind="vehicle" id={trade.vehicleId} reference={trade.vehicleReference} href={`/inventory/${trade.vehicleId}`} />}<span className="ml-2">{trade.label}</span>{trade.reg&&<span className="ml-2 font-mono text-xs font-semibold text-slate-300">Plate {trade.reg}</span>}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Allowance</dt><dd className="tabular-nums text-slate-200">{money(trade.allowance,d.currency)}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Finance owed</dt><dd className="tabular-nums text-slate-200">{money(trade.settlement,d.currency)}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Net equity</dt><dd className={`tabular-nums ${trade.netEquity<0?"text-amber-200":"text-emerald-300"}`}>{money(trade.netEquity,d.currency)}</dd></div></dl>
              {canWork&&!closed&&trade.vehicleId&&<EditTradeIn dealId={d.id} vehicleId={trade.vehicleId} version={d.version??1}/>}
            </div>)}</div>
            {canWork&&!closed&&<AddTradeIn dealId={d.id}/>}
            {canWork && !closed && <DealAddons dealId={d.id} addons={d.addons} currency={d.currency} showProfit={showProfit} />}
          </section>,
        figures:<DealFinancialSummary rows={[{label:"Retail Price",value:money(m.retail,d.currency)},...(d.purchaseTaxVerified===false?[{label:"VAT scheme",value:"Margin scheme · pending purchase order"}]:d.vat_scheme==="standard"?[{label:`Vehicle VAT (${vehicleTax.vatRate}%)`,value:money(vehicleTax.vat,d.currency)},{label:"Vehicle price excluding VAT",value:money(vehicleTax.net,d.currency)}]:[{label:"VAT scheme",value:vehicleTax.vatLabel}]),...(d.purchaseTaxVerified!==false&&d.imported?[{label:"Vehicle source",value:"Imported"}]:[]),...(d.purchaseTaxVerified!==false&&vehicleTax.vrtAmount>0?[{label:"VRT (included in price)",value:money(vehicleTax.vrtAmount,d.currency)}]:[]),{label:"PAX SIV",value:money(m.siv,d.currency)},{label:"To Change",value:money(m.costToChange,d.currency)},{label:"Confirmed payments",value:money(paid,d.currency),accent:"text-emerald-300"},{label:"Balance To Pay",value:money(Math.max(balance,0),d.currency)},...(addonsTotal?[{label:"Supplementary Sales",value:money(addonsTotal,d.currency)}]:[]),...(pendingReceipts?[{label:"Awaiting clearance",value:money(pendingReceipts,d.currency),accent:"text-amber-300"}]:[]),...(overpaid?[{label:"Overpayment",value:money(overpaid,d.currency),accent:"text-violet-300"}]:[])]}/>
      }}>


      <div className="space-y-5">
          <DealDocuments dealId={d.id} docs={d.documents} status={d.status} version={d.version??1} hasDepositOrTrade={d.tradeIns.length>0||hasConfirmedDeposit} leadingActions={<>
            {canWork&&d.status==="vehicle_interest"&&<RemoveInterest id={d.id} version={d.version??1} reference={d.deal_no} inline/>}
            {canWork && !closed && <CancelDealPanel
              id={d.id}
              version={d.version ?? 1}
              vehicle={d.car}
              netPaid={paid}
              pendingReceipts={pendingReceipts}
              hasTradeIn={d.tradeIns.length>0}
              hasInvoice={d.documents.some((document) => document.kind === "invoice" && document.status !== "void")}
              documents={d.documents.filter((document) => ["quote", "agreement"].includes(document.kind) && document.status !== "void").length}
              linkedLead={Boolean(d.lead_id)}
              canCancel={hasRegisteredPayment||d.tradeIns.length>0||d.documents.some(document=>document.kind==="agreement"&&document.status!=="void")}
              hasConfirmedFinancePayment={hasConfirmedFinancePayment}
              inline
            />}
          </>} />

          {refundOverview?.error&&<p role="alert" className="text-sm text-rose-300">{refundOverview.error}</p>}
          {refundObligations.map(obligation=><DealRefundPanel key={`${obligation.id}:${obligation.paidAmount}`} obligation={obligation} canPay={canPay&&canWork}/>)}


          {vehicleFindings&&<VehicleHistoryDisclosure dealId={d.id} findings={vehicleFindings} confirmed={vehicleDisclosureConfirmed} canConfirm={canWork&&!closed}/>}

<div className="space-y-4">
          {["owner", "admin", "accountant"].includes(session.role) && d.status === "completed" && invoiceCorrection && (
            <PostInvoiceCorrectionPanel
              id={d.id}
              version={d.version ?? 1}
              vehicle={d.car}
              currency={d.currency}
              netPaid={paid}
              tradeIns={d.tradeIns.filter((trade):trade is TradeIn&{vehicleId:string}=>Boolean(trade.vehicleId)).map(trade=>({vehicleId:trade.vehicleId,label:trade.label,reg:trade.reg,allowance:trade.allowance,settlement:trade.settlement}))}
              invoiceNumber={invoiceCorrection.number}
              lines={invoiceCorrection.lines}
            />
          )}
        </div></div>
      <DealEventLog rows={[...displayEvents].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).map((e,i)=><tr key={i} className="border-b border-white/10 align-top">
            <td className="whitespace-nowrap p-3">{new Date(e.at).toLocaleString("en-IE",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</td>
            <td className="p-3">{e.by}</td><td className="p-3 capitalize">{e.kind.replaceAll("_"," ")}</td>
            <td className="max-w-lg p-3"><p>{e.detail}</p>{e.audit!=null&&<details className="mt-2 text-xs"><summary className="cursor-pointer">Recorded details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(e.audit,null,2)}</pre></details>}</td>
            <td className="p-3"><EntityLink kind="deal" id={d.id} reference={d.deal_no} href={`/business/deals/${d.id}`}/></td>
          </tr>)} />
      </DealSheet>
      </div>
    </div>
  );
}
