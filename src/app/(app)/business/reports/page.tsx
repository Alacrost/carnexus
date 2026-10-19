import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoPurchases, demoSalesDeals } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { money } from "@/lib/currency";
import { ModuleUpsell } from "@/components/module-upsell";
import { CsvButton } from "./csv-button";
import { ClearReceiptButton } from "./clear-receipt-button";
import { EntityLink, vehicleReference } from "@/components/entity-link";
import type { ReactNode } from "react";

interface PayablePosition {
  id: string; po_no: string; vendor: string; vehicle_id?: string | null; vehicleReference?: string | null; vehicleRegistration?: string | null; car: string; payment_state: string;
  vendor_outstanding: number; finance_outstanding: number; to_be_paid: number;
}
interface PayableReport {
  summary: { vendorOutstanding: number; financeOutstanding: number; toBePaid: number; overdue: number; stockUnpaidLiability: number; unknownAcquisitionValues: number };
  positions: PayablePosition[];
}
interface AgreementPosition {
  id: string; dealNo: string; agreementNo: string; customerId?: string | null; vehicleId?: string | null; vehicleReference?: string | null; vehicleRegistration?: string | null; customer: string; vehicle: string; gross: number; outstanding: number;
}
interface InvoicePosition {
  id: string; dealId: string; dealNo: string; invoiceNo: string; issuedAt: string; invoiceDate: string; dealDate: string; reportDate: string; customerId?: string | null; vehicleId?: string | null; vehicleReference?: string | null; vehicleRegistration?: string | null; customer: string; phone: string; vehicle: string;
  responsible: string; gross: number; credited: number; net: number; pendingClearance: number; outstanding: number;overpayment?:number;status?:string;location?:string;
}
interface CreditPosition {
  id: string; dealId: string; dealNo: string; creditNo: string; invoiceNo: string; customerId?: string | null; vehicleId?: string | null; vehicleReference?: string | null; vehicleRegistration?: string | null; customer: string; vehicle: string; gross: number; reason: string;
}
interface PendingReceipt {
  id: string; dealId: string; dealNo: string; invoiceNo: string; invoiceDate: string; customerId?: string | null; vehicleId?: string | null; vehicleReference?: string | null; vehicleRegistration?: string | null; customer: string; phone: string;
  vehicle: string; responsible: string; method: string; reference: string; receivedOn: string; amount: number; currency: string; clearanceStatus: "pending" | "cleared"; clearedAt?: string;
}
interface ResponsibleSales {
  responsibleId: string; responsible: string; invoices: number; gross: number; credited: number; net: number;
}
interface SalesReport {
  basis?: "deal" | "invoice";
  summary: { openDeals: number; openAgreementValue: number; invoices: number; invoicedGross: number; creditedGross: number; netInvoicedRevenue: number; pendingClearance: number; pendingReceipts: number; customerOutstanding: number;customerOverpaid?:number };
  openPositions: AgreementPosition[];
  invoicePositions: InvoicePosition[];
  creditPositions: CreditPosition[];
  pendingReceipts: PendingReceipt[];
  salesByResponsible: ResponsibleSales[];
  receiptRegister:ReceiptRegister[];
}
interface ReceiptRegister{id:string;dealId:string;dealNo:string;invoiceNo:string;customerId?:string|null;customer:string;responsible:string;location:string;kind:string;method:string;amount:number;signedAmount:number;enteredDate:string;enteredAt:string;enteredBy:string;reference?:string|null;clearanceStatus:string;clearedOn?:string|null;reason?:string|null}

const emptyPayables: PayableReport = { summary: { vendorOutstanding: 0, financeOutstanding: 0, toBePaid: 0, overdue: 0, stockUnpaidLiability: 0, unknownAcquisitionValues: 0 }, positions: [] };
const emptySales: SalesReport = { summary: { openDeals: 0, openAgreementValue: 0, invoices: 0, invoicedGross: 0, creditedGross: 0, netInvoicedRevenue: 0, pendingClearance: 0, pendingReceipts: 0, customerOutstanding: 0,customerOverpaid:0 }, openPositions: [], invoicePositions: [], creditPositions: [], pendingReceipts: [], salesByResponsible: [],receiptRegister:[] };

function safeDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function iso(date:Date){return date.toISOString().slice(0,10)}
function presetRange(period:string,now:Date){const year=now.getUTCFullYear(),month=now.getUTCMonth();if(period==="this_month")return{from:iso(new Date(Date.UTC(year,month,1))),to:iso(now)};if(period==="last_month")return{from:iso(new Date(Date.UTC(year,month-1,1))),to:iso(new Date(Date.UTC(year,month,0)))};if(period==="this_quarter"){const start=Math.floor(month/3)*3;return{from:iso(new Date(Date.UTC(year,start,1))),to:iso(now)}}return{from:`${year}-01-01`,to:iso(now)}}
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; basis?: string;status?:string;soldBy?:string;location?:string;period?:string }> }) {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.viewFinancials(session.role)) return <p className="text-sm text-slate-400">Your role does not include reports.</p>;

  const now = new Date();
  const params = await searchParams;
  const period=["custom","this_month","last_month","this_quarter","this_year"].includes(params.period??"")?params.period!:(params.from||params.to?"custom":"this_year");
  const preset=presetRange(period,now);const to = period==="custom"?safeDate(params.to,preset.to):preset.to;
  const from = period==="custom"?safeDate(params.from,preset.from):preset.from;
  const basis: "deal" | "invoice" = params.basis === "deal" ? "deal" : "invoice";
  const status=["all","open","completed","reversed","outstanding","pending_clearance","overpaid"].includes(params.status??"")?params.status!:"all";
  const soldBy=/^[0-9a-f-]{36}$/i.test(params.soldBy??"")?params.soldBy!:null;const location=/^[0-9a-f-]{36}$/i.test(params.location??"")?params.location!:null;
  let locations:{id:string;name:string}[]=[];let sellers:{id:string;name:string}[]=[];
  let payables = emptyPayables;
  let sales = emptySales;

  if (isDemoMode()) {
    const positions = demoPurchases.map((p) => {
      const total = p.lines.reduce((a, line) => a + line.gross, 0);
      const paid = p.payments.reduce((a, payment) => a + payment.amount, 0);
      const due = Math.max(total - paid, 0);
      return { id: p.id, po_no: p.po_no, vendor: p.vendor.name, car: p.car, payment_state: due ? "unpaid" : "paid", vendor_outstanding: due, finance_outstanding: 0, to_be_paid: due };
    });
    const toBePaid = positions.reduce((a, p) => a + p.to_be_paid, 0);
    payables = { summary: { ...emptyPayables.summary, vendorOutstanding: toBePaid, toBePaid, stockUnpaidLiability: toBePaid }, positions };
    const openPositions = demoSalesDeals.filter((d) => ["agreed", "finance"].includes(d.status)).map((d) => ({ id: d.id, dealNo: d.deal_no, agreementNo: "Demo agreement", customer: d.customer.name, vehicle: d.order.vehicle_label, gross: d.order.price, outstanding: d.order.price }));
    sales = { ...emptySales, summary: { ...emptySales.summary, openDeals: openPositions.length, openAgreementValue: openPositions.reduce((a, d) => a + d.gross, 0) }, openPositions };
  } else {
    const supabase = await createClient();
    const [{ data: payableData, error: payableError }, { data: salesData, error: salesError }] = await Promise.all([
      supabase.rpc("purchase_payable_report", { p_dealer: session.dealer.id, p_from: from, p_to: to }),
      supabase.rpc("sales_lifecycle_report", { p_dealer: session.dealer.id, p_from: from, p_to: to, p_basis: basis,p_status:status,p_salesperson:soldBy,p_location:location }),
    ]);
    if (payableError || salesError) return <p role="alert" className="text-sm text-rose-300">Financial reports could not load. Check the commercial reporting migrations and date range.</p>;
    payables = payableData as unknown as PayableReport;
    sales = salesData as unknown as SalesReport;
    const reportDealIds = [...new Set([
      ...sales.openPositions.map((item) => item.id), ...sales.invoicePositions.map((item) => item.dealId),
      ...sales.creditPositions.map((item) => item.dealId), ...sales.pendingReceipts.map((item) => item.dealId),
      ...sales.receiptRegister.map((item) => item.dealId),
    ].filter(Boolean))];
    if (reportDealIds.length) {
      const [{ data: reportDeals }, { data: reportOrders }] = await Promise.all([
        supabase.from("deals").select("id,customer_id").eq("dealer_id", session.dealer.id).in("id", reportDealIds),
        supabase.from("deal_orders").select("deal_id,vehicle_id").eq("dealer_id", session.dealer.id).eq("kind", "sale").in("deal_id", reportDealIds),
      ]);
      const customerByDeal = new Map((reportDeals ?? []).map((item) => [item.id, item.customer_id]));
      const vehicleByDeal = new Map((reportOrders ?? []).map((item) => [item.deal_id, item.vehicle_id]));
      const reportVehicleIds = [...new Set([...vehicleByDeal.values(), ...payables.positions.map((item) => item.vehicle_id)].filter(Boolean))] as string[];
      const { data: reportVehicles } = reportVehicleIds.length ? await supabase.from("vehicles").select("id,vehicle_no,registration").eq("dealer_id", session.dealer.id).in("id", reportVehicleIds) : { data: [] as { id: string; vehicle_no: number; registration: string | null }[] };
      const vehicleNumbers = new Map((reportVehicles ?? []).map((item) => [item.id, vehicleReference(item.vehicle_no)]));
      const vehicleRegistrations = new Map((reportVehicles ?? []).map((item) => [item.id, item.registration]));
      const refs = (dealId: string) => { const vehicleId = vehicleByDeal.get(dealId) ?? null; return { customerId: customerByDeal.get(dealId) ?? null, vehicleId, vehicleReference: vehicleId ? vehicleNumbers.get(vehicleId) ?? null : null, vehicleRegistration: vehicleId ? vehicleRegistrations.get(vehicleId) ?? null : null }; };
      sales.openPositions = sales.openPositions.map((item) => ({ ...item, ...refs(item.id) }));
      sales.invoicePositions = sales.invoicePositions.map((item) => ({ ...item, ...refs(item.dealId) }));
      sales.creditPositions = sales.creditPositions.map((item) => ({ ...item, ...refs(item.dealId) }));
      sales.pendingReceipts = sales.pendingReceipts.map((item) => ({ ...item, ...refs(item.dealId) }));
      sales.receiptRegister = sales.receiptRegister.map((item) => ({ ...item, customerId: customerByDeal.get(item.dealId) ?? null }));
      payables.positions = payables.positions.map((item) => ({ ...item, vehicleReference: item.vehicle_id ? vehicleNumbers.get(item.vehicle_id) ?? null : null, vehicleRegistration: item.vehicle_id ? vehicleRegistrations.get(item.vehicle_id) ?? null : null }));
    }
    const [{data:locationRows},{data:memberRows}]=await Promise.all([supabase.from("dealer_locations").select("id,name").eq("dealer_id",session.dealer.id).eq("active",true).order("name"),supabase.from("dealer_members").select("user_id").eq("dealer_id",session.dealer.id).eq("status","active")]);locations=locationRows??[];const ids=(memberRows??[]).map(row=>row.user_id);if(ids.length){const{data:profiles}=await supabase.from("profiles").select("id,full_name").in("id",ids);sellers=(profiles??[]).map(profile=>({id:profile.id,name:profile.full_name??"Team member"})).sort((a,b)=>a.name.localeCompare(b.name));}
  }

  const payableRows = payables.positions.filter((p) => Number(p.to_be_paid) > 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Commercial control</h1><p className="mt-1 text-sm text-slate-500">Invoice-backed revenue, current agreements and PO liabilities.</p></div>
        <form className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-2 text-xs">
          <label className="text-slate-500">Period<select name="period" defaultValue={period} className="mt-1 block rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200"><option value="this_month">This month</option><option value="last_month">Last month</option><option value="this_quarter">This quarter</option><option value="this_year">This year</option><option value="custom">Custom range</option></select></label>
          <label className="text-slate-500">Sales date basis<select name="basis" defaultValue={basis} className="mt-1 block rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200"><option value="invoice">Final invoice date</option><option value="deal">Deal opened date</option></select></label>
          <label className="text-slate-500">From<input name="from" type="date" defaultValue={from} className="mt-1 block rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-slate-200" /></label>
          <label className="text-slate-500">To<input name="to" type="date" defaultValue={to} className="mt-1 block rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-slate-200" /></label>
          <label className="text-slate-500">Status<select name="status" defaultValue={status} className="mt-1 block rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200"><option value="all">All</option><option value="open">Open agreement</option><option value="completed">Completed</option><option value="outstanding">To be paid</option><option value="pending_clearance">Funds unconfirmed</option><option value="overpaid">Overpaid</option><option value="reversed">Reversed</option></select></label>
          <label className="text-slate-500">Sold by<select name="soldBy" defaultValue={soldBy??""} className="mt-1 block rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200"><option value="">Anyone</option>{sellers.map(seller=><option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label>
          <label className="text-slate-500">Location<select name="location" defaultValue={location??""} className="mt-1 block rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200"><option value="">All locations</option>{locations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button className="rounded-md bg-white/10 px-3 py-1.5 text-slate-100 hover:bg-white/15">Apply</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label="To be paid" value={money(Number(payables.summary.toBePaid), "EUR")} accent="text-amber-300" />
        <Kpi label="Lender liability" value={money(Number(payables.summary.financeOutstanding), "EUR")} accent="text-sky-300" />
        <Kpi label="Open agreements" value={`${sales.summary.openDeals}`} detail={money(Number(sales.summary.openAgreementValue), "EUR")} accent="text-violet-300" />
        <Kpi label={basis === "deal" ? "Net sales · Deal cohort" : "Net invoiced revenue"} value={money(Number(sales.summary.netInvoicedRevenue), "EUR")} detail={`${sales.summary.invoices} completed sale${sales.summary.invoices === 1 ? "" : "s"}`} accent="text-emerald-300" />
        <Kpi label="Awaiting clearance" value={money(Number(sales.summary.pendingClearance), "EUR")} detail={`${sales.summary.pendingReceipts} unconfirmed receipt${sales.summary.pendingReceipts === 1 ? "" : "s"}`} accent="text-amber-300" />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Kpi label="Vendor outstanding" value={money(Number(payables.summary.vendorOutstanding), "EUR")} />
        <Kpi label="Overdue payables" value={money(Number(payables.summary.overdue), "EUR")} accent="text-rose-300" />
        <Kpi label="Credits in period" value={money(Number(sales.summary.creditedGross), "EUR")} />
        <Kpi label="Purchase prices pending" value={`${payables.summary.unknownAcquisitionValues}`} accent="text-violet-300" />
        <Kpi label="Customer outstanding" value={money(Number(sales.summary.customerOutstanding), "EUR")} accent="text-rose-300" />
        {Number(sales.summary.customerOverpaid)>0&&<Kpi label="Customer overpayments" value={money(Number(sales.summary.customerOverpaid),"EUR")} accent="text-violet-300"/>}
      </div>

      <Report title="To be paid — vendor and lender liabilities" headers={["PO", "Vendor", "Vehicle", "Plate", "State", "Vendor due", "Lender due", "Total due"]} rows={payableRows.map((p) => [p.po_no, p.vendor, p.car, p.vehicleRegistration??"", p.payment_state, Number(p.vendor_outstanding).toFixed(2), Number(p.finance_outstanding).toFixed(2), Number(p.to_be_paid).toFixed(2)])} render={payableRows.map((p) => [<EntityLink key="po" kind="po" id={p.id} reference={p.po_no} href={`/business/purchases/${p.id}`} />, p.vendor, p.vehicle_id?<><EntityLink kind="vehicle" id={p.vehicle_id} reference={p.vehicleReference} href={`/inventory/${p.vehicle_id}`} /><span className="ml-2">{p.car}</span></>:p.car, p.vehicleRegistration??"—", p.payment_state.replaceAll("_", " "), money(Number(p.vendor_outstanding), "EUR"), money(Number(p.finance_outstanding), "EUR"), money(Number(p.to_be_paid), "EUR")])} empty="No outstanding purchase liabilities." />
      <Report title="Open deals — current signed agreement" headers={["Deal", "Agreement", "Customer", "Vehicle", "Plate", "Agreed", "Outstanding"]} rows={sales.openPositions.map((d) => [d.dealNo, d.agreementNo, d.customer, d.vehicle, d.vehicleRegistration??"", Number(d.gross).toFixed(2), Number(d.outstanding).toFixed(2)])} render={sales.openPositions.map((d) => [<EntityLink key="deal" kind="deal" id={d.id} reference={d.dealNo} href={`/business/deals/${d.id}`} />, d.agreementNo, d.customerId?<><EntityLink kind="customer" id={d.customerId} href={`/business/customers/${d.customerId}`} /><span className="ml-2">{d.customer}</span></>:d.customer, d.vehicleId?<><EntityLink kind="vehicle" id={d.vehicleId} reference={d.vehicleReference} href={`/inventory/${d.vehicleId}`} /><span className="ml-2">{d.vehicle}</span></>:d.vehicle, d.vehicleRegistration??"—", money(Number(d.gross), "EUR"), money(Number(d.outstanding), "EUR")])} empty="No current agreements. Drafts and quotes are pipeline records, not open deals." />
      <Report title="Sales by responsible person" headers={["Responsible", "Invoices", "Gross", "Credits", "Net"]} rows={sales.salesByResponsible.map((d) => [d.responsible, d.invoices, Number(d.gross).toFixed(2), Number(d.credited).toFixed(2), Number(d.net).toFixed(2)])} render={sales.salesByResponsible.map((d) => [d.responsible, String(d.invoices), money(Number(d.gross), "EUR"), money(Number(d.credited), "EUR"), money(Number(d.net), "EUR")])} empty="No invoiced sales by responsible person in this period." />
      <Report title="Salesperson audit — commission basis" headers={["Responsible", "Location", "Status", "Invoice", "Deal opened", "Invoice date", "Buyer", "Vehicle", "Plate", "Gross", "Credits", "Net commission basis"]} rows={sales.invoicePositions.map((d) => [d.responsible, d.location??"",d.status??"", d.invoiceNo, d.dealDate, d.invoiceDate, d.customer, d.vehicle, d.vehicleRegistration??"", Number(d.gross).toFixed(2), Number(d.credited).toFixed(2), Number(d.net).toFixed(2)])} render={sales.invoicePositions.map((d) => [d.responsible,d.location??"—",d.status?.replaceAll("_"," ")??"—", d.invoiceNo, d.dealDate, d.invoiceDate, d.customerId?<><EntityLink kind="customer" id={d.customerId} href={`/business/customers/${d.customerId}`} /><span className="ml-2">{d.customer}</span></>:d.customer, d.vehicleId?<><EntityLink kind="vehicle" id={d.vehicleId} reference={d.vehicleReference} href={`/inventory/${d.vehicleId}`} /><span className="ml-2">{d.vehicle}</span></>:d.vehicle, d.vehicleRegistration??"—", money(Number(d.gross), "EUR"), money(Number(d.credited), "EUR"), money(Number(d.net), "EUR")])} empty="No completed sales for salesperson audit in this period." />
      <Report title="Invoices — buyer and sale register" headers={["Invoice", basis === "deal" ? "Deal opened" : "Invoice date", "Buyer", "Phone", "Vehicle", "Plate", "Responsible", "Gross", "Credited", "Net", "Awaiting clearance", "Outstanding"]} rows={sales.invoicePositions.map((d) => [d.invoiceNo, d.reportDate ?? d.issuedAt?.slice(0, 10) ?? "", d.customer, d.phone, d.vehicle, d.vehicleRegistration??"", d.responsible, Number(d.gross).toFixed(2), Number(d.credited).toFixed(2), Number(d.net).toFixed(2), Number(d.pendingClearance).toFixed(2), Number(d.outstanding).toFixed(2)])} render={sales.invoicePositions.map((d) => [d.invoiceNo, d.reportDate ?? d.issuedAt?.slice(0, 10) ?? "—", d.customerId?<><EntityLink kind="customer" id={d.customerId} href={`/business/customers/${d.customerId}`} /><span className="ml-2">{d.customer}</span></>:d.customer, d.phone, d.vehicleId?<><EntityLink kind="vehicle" id={d.vehicleId} reference={d.vehicleReference} href={`/inventory/${d.vehicleId}`} /><span className="ml-2">{d.vehicle}</span></>:d.vehicle, d.vehicleRegistration??"—", d.responsible, money(Number(d.gross), "EUR"), money(Number(d.credited), "EUR"), money(Number(d.net), "EUR"), money(Number(d.pendingClearance), "EUR"), money(Number(d.outstanding), "EUR")])} empty="No invoices issued in this period." />
      <PendingClearanceReport receipts={sales.pendingReceipts} />
      <Report title="Sales receipts — full audit register" headers={["Entered date","Deal","Invoice","Customer","Sold by","Location","Type","Method","Reference","Status","Entered by","Entered at","Reason","Amount"]} rows={sales.receiptRegister.map(r=>[r.enteredDate,r.dealNo,r.invoiceNo,r.customer,r.responsible,r.location,r.kind,r.method,r.reference??"",r.clearanceStatus,r.enteredBy,r.enteredAt,r.reason??"",Number(r.signedAmount)])} render={sales.receiptRegister.map(r=>[r.enteredDate,<EntityLink key="deal" kind="deal" id={r.dealId} reference={r.dealNo} href={`/business/deals/${r.dealId}`} />,r.invoiceNo,r.customerId?<><EntityLink kind="customer" id={r.customerId} href={`/business/customers/${r.customerId}`} /><span className="ml-2">{r.customer}</span></>:r.customer,r.responsible,r.location,r.kind.replaceAll("_"," "),r.method,r.reference??"—",r.clearanceStatus.replaceAll("_"," "),r.enteredBy,new Date(r.enteredAt).toLocaleString("en-IE"),r.reason??"—",money(Number(r.signedAmount),"EUR")])} empty="No receipt movements in this period." />
      <Report title="Credit notes — revenue reductions" headers={["Credit note", "Invoice", "Deal", "Customer", "Vehicle", "Plate", "Reason", "Credit"]} rows={sales.creditPositions.map((d) => [d.creditNo, d.invoiceNo, d.dealNo, d.customer, d.vehicle, d.vehicleRegistration??"", d.reason, Number(d.gross).toFixed(2)])} render={sales.creditPositions.map((d) => [d.creditNo, d.invoiceNo,<EntityLink key="deal" kind="deal" id={d.dealId} reference={d.dealNo} href={`/business/deals/${d.dealId}`} />,d.customerId?<><EntityLink kind="customer" id={d.customerId} href={`/business/customers/${d.customerId}`} /><span className="ml-2">{d.customer}</span></>:d.customer,d.vehicleId?<><EntityLink kind="vehicle" id={d.vehicleId} reference={d.vehicleReference} href={`/inventory/${d.vehicleId}`} /><span className="ml-2">{d.vehicle}</span></>:d.vehicle,d.vehicleRegistration??"—",d.reason,money(Number(d.gross), "EUR")])} empty="No credit notes issued in this period." />

      <p className="text-xs leading-5 text-slate-500">{basis === "deal" ? "Deal-date view groups completed sales by the day the Deal was opened. It is a commercial cohort view, not the legal revenue date." : "Invoice-date view uses the final document effective date, when the documentation is complete and ownership passes to the buyer."} Revenue belongs to the Deal&apos;s responsible salesperson, not the user who entered it, and is shown net of credit notes. The salesperson audit provides a commission base, but no commission is calculated until the dealer defines its rate and eligibility rules.</p>
    </div>
  );
}

function PendingClearanceReport({ receipts }: { receipts: PendingReceipt[] }) {
  const headers = ["Invoice", "Buyer", "Phone", "Vehicle", "Plate", "Responsible", "Method", "Reference", "Received", "Status", "Amount"];
  const rows = receipts.map((receipt) => [receipt.invoiceNo, receipt.customer, receipt.phone, receipt.vehicle, receipt.vehicleRegistration??"", receipt.responsible, receipt.method, receipt.reference, receipt.receivedOn, receipt.clearanceStatus, Number(receipt.amount).toFixed(2)]);
  return <section className="studio-surface p-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium text-slate-200">Unconfirmed receipt register</h2><p className="mt-0.5 text-xs text-slate-500">Confirm transfers, EFTs, cheques or drafts only after the money appears in the bank; rejection never deletes the original record.</p></div>{rows.length > 0 && <CsvButton filename="unconfirmed-receipts.csv" headers={headers} rows={rows} />}</div>
    {receipts.length === 0 ? <p className="mt-3 text-sm text-slate-500">No unconfirmed receipt is recorded in this period.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1260px] text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">{[...headers, "Bank action"].map((header) => <th key={header} className="px-3 py-2 last:text-right">{header}</th>)}</tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id} className="border-t border-white/5"><td className="px-3 py-2 font-mono text-slate-300">{receipt.invoiceNo}</td><td className="px-3 py-2 text-slate-300">{receipt.customerId&&<EntityLink kind="customer" id={receipt.customerId} href={`/business/customers/${receipt.customerId}`} />}<span className="ml-2">{receipt.customer}</span></td><td className="px-3 py-2 text-slate-400">{receipt.phone}</td><td className="px-3 py-2 text-slate-300">{receipt.vehicleId&&<EntityLink kind="vehicle" id={receipt.vehicleId} reference={receipt.vehicleReference} href={`/inventory/${receipt.vehicleId}`} />}<span className="ml-2">{receipt.vehicle}</span></td><td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{receipt.vehicleRegistration??"—"}</td><td className="px-3 py-2 text-slate-300">{receipt.responsible}</td><td className="px-3 py-2 capitalize text-slate-300">{receipt.method}</td><td className="px-3 py-2 font-mono text-slate-400">{receipt.reference}</td><td className="px-3 py-2 text-slate-400">{receipt.receivedOn}</td><td className={`px-3 py-2 capitalize ${receipt.clearanceStatus==="pending"?"text-amber-300":"text-emerald-300"}`}>{receipt.clearanceStatus}</td><td className="px-3 py-2 tabular-nums text-slate-200">{money(Number(receipt.amount), receipt.currency)}</td><td className="px-3 py-2 text-right"><ClearReceiptButton paymentId={receipt.id} status={receipt.clearanceStatus} /></td></tr>)}</tbody></table></div>}
  </section>;
}

function Kpi({ label, value, detail, accent = "text-slate-100" }: { label: string; value: string; detail?: string; accent?: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>{value}</p>{detail && <p className="text-[10px] text-slate-500">{detail}</p>}</div>;
}

function Report({ title, headers, rows, render, empty }: { title: string; headers: string[]; rows: (string | number)[][]; render: ReactNode[][]; empty: string }) {
  return <section className="studio-surface p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium text-slate-200">{title}</h2>{rows.length > 0 && <CsvButton filename={`${title.split(" —")[0].toLowerCase().replace(/\s+/g, "-")}.csv`} headers={headers} rows={rows} />}</div>{render.length === 0 ? <p className="mt-3 text-sm text-slate-500">{empty}</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">{headers.map((h) => <th key={h} className="px-3 py-2 last:text-right">{h}</th>)}</tr></thead><tbody>{render.map((row, ri) => <tr key={ri} className="border-t border-white/5">{row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-slate-300 last:text-right last:tabular-nums">{cell}</td>)}</tr>)}</tbody></table></div>}</section>;
}
