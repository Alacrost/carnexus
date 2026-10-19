import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { isDemoMode, demoSalesDeals, demoSession } from "@/lib/demo";
import { can } from "@/lib/types";
import { money } from "@/lib/currency";
import { docFigures } from "@/lib/deals";
import { DocBar } from "./doc-bar";

interface Snapshot {
  kind: string;
  number: string;
  date: string;
  currency: string;
  deal_no?: string;
  so_no?: string; agreement_number?:string;
  finance?: { company?:string; address?:string; reference?:string; invoice_to_finance?:boolean };
  quote_terms?:string|null;deal_comments?:string|null;finance_terms?:string|null;warranty?:{name:string;terms:string}|null;
  trade_ins?: {label?:string;registration?:string;allowance:number; settlement:number; provider:string; equity:number }[];
  vehicle_history_report?:{accident:boolean;writeOff:boolean;stolen:boolean;mileageDiscrepancy:boolean};
  vehicle_history_disclosure?:{method:string;reference:string|null;confirmed_at:string};
  payments?: { kind:string;method:string;amount:number;date:string;reference:string;clearance_status?:string }[];
  dealer: { name?: string; legal_name?:string; address?:string; vat_number?:string;company_number?:string;phone?:string;email?:string;bank_details?:string;agreement_terms?:string;invoice_notes?:string };
  customer: { name: string; company?: string | null; address?: string | null; phone?: string | null; email?: string | null; vat_number?: string | null } | null;
  vehicle: { label: string; reg?: string | null; original_registration?:string|null } | null;
  imported?:boolean;
  lines?: { description: string; gross: number;vat_rate?:number|null;vat?:number }[];
  retail: number;
  siv: number;
  sale: number;
  scheme: string;
  figures: ReturnType<typeof docFigures>;
  deposits: number;
  original_invoice?: { id: string; number: string; date: string };
  reason?: string;
  credited_lines?: { index: number; description: string; gross: number; vat_rate?: number | null; vat?: number }[];
  gross_credit?: number;
  vat_credit?: number;
  original_consideration?: number;
  amended_consideration?: number;
  margin_note?: string | null;
}

const KIND_TITLE: Record<string, string> = { agreement: "Sales Agreement", invoice: "Invoice", quote: "Quotation", credit_note: "Credit Note" };
const LITERALS = ["agreement", "invoice", "quote"];

export default async function DealDocPage({ params }: { params: Promise<{ dealId: string; docId: string }> }) {
  const { dealId, docId } = await params;
  const session = await requireSession();
  if (!can.manageDeals(session.role)) return <p className="p-8 text-sm text-slate-500">No access.</p>;

  let snap: Snapshot | null = null;

  if (LITERALS.includes(docId)) {
    // Preview (demo, or an on-the-fly preview before persisting).
    if (isDemoMode()) {
      const x = demoSalesDeals.find((z) => z.id === dealId);
      if (!x) notFound();
      const deposits = x.payments.filter((p) => p.kind === "deposit").reduce((a, p) => a + p.amount, 0);
      const fig = docFigures({ scheme: x.order.vat_scheme, sale: x.order.price, retail: x.retail_price ?? x.order.price, siv: x.siv_total ?? 0, totalCost: null, deposits });
      snap = {
        kind: docId, number: docId === "invoice" ? "PREVIEW" : `${docId.toUpperCase()}-PREVIEW`, date: new Date().toISOString().slice(0, 10),
        currency: x.currency, deal_no: x.deal_no, dealer: { name: demoSession.dealer.name },
        customer: { name: x.customer.name, phone: x.customer.phone, email: x.customer.email },
        vehicle: { label: x.order.vehicle_label }, retail: x.retail_price ?? x.order.price, siv: x.siv_total ?? 0,
        sale: x.order.price, scheme: x.order.vat_scheme, figures: fig, deposits,
      };
    } else {
      notFound(); // real docs are always persisted with a uuid id
    }
  } else {
    const supabase = await createClient();
    const { data: doc } = await supabase.from("deal_documents").select("snapshot, deal_id").eq("dealer_id", session.dealer.id).eq("id", docId).maybeSingle();
    if (!doc || doc.deal_id !== dealId) notFound();
    snap = doc.snapshot as Snapshot;
  }

  if (!snap) notFound();
  if (snap.kind === "credit_note") return <CreditNoteDocument dealId={dealId} snap={snap} />;
  const c = snap.currency;
  const f = snap.figures;
  const isInvoice = snap.kind === "invoice";
  const isAgreement = snap.kind === "agreement";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Force a clean white sheet when printing (this route has no app chrome). */}
      <style dangerouslySetInnerHTML={{ __html: "@media print{body{background:#fff!important}.no-print{display:none!important}}" }} />
      <DocBar dealId={dealId} />

      <div className="mx-auto my-6 max-w-[820px] bg-white p-10 shadow-sm print:my-0 print:shadow-none">
        {isDemoMode()&&<p className="mb-4 border-2 border-slate-900 p-2 text-center text-xs font-bold">DEMONSTRATION · TEST DOCUMENT · NOT FOR REAL TRANSACTIONS</p>}
        {/* Letterhead */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-lg font-semibold tracking-tight">{snap.dealer.legal_name ?? snap.dealer.name}</p>
            <p className="max-w-sm whitespace-pre-line text-xs text-slate-500">{snap.dealer.address}</p><p className="text-xs text-slate-500">{snap.dealer.vat_number ? "VAT: "+snap.dealer.vat_number : ""} {snap.dealer.company_number ? " · Company: "+snap.dealer.company_number : ""}</p><p className="text-xs text-slate-500">{[snap.dealer.phone,snap.dealer.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold uppercase tracking-wide">{KIND_TITLE[snap.kind] ?? snap.kind}</h1>
            <p className="mt-1 text-sm text-slate-600">No. <span className="font-mono">{snap.number}</span></p>
            <p className="text-xs text-slate-500">Date: {snap.date}{snap.deal_no ? ` · Deal ${snap.deal_no}` : ""}{snap.so_no ? ` · ${snap.so_no}` : ""}</p>
          </div>
        </div>

        {isInvoice && snap.finance?.invoice_to_finance && <section className="mt-5 rounded border border-slate-200 p-4 text-sm"><p className="text-xs uppercase text-slate-500">Invoice recipient — finance company</p><p className="font-semibold">{snap.finance.company}</p><p className="whitespace-pre-line">{snap.finance.address}</p><p>Finance agreement: {snap.finance.reference || "—"}</p></section>}
        {/* Bill to + vehicle */}
        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isInvoice && !snap.finance?.invoice_to_finance ? "Invoice to / vehicle delivery" : isInvoice ? "Vehicle delivery to customer" : "Customer / vehicle recipient"}</p>
            <p className="mt-1 font-medium">{snap.customer?.company || snap.customer?.name || "—"}</p>
            {snap.customer?.company && snap.customer?.name && <p>{snap.customer.name}</p>}
            {snap.customer?.address && <p className="text-slate-600">{snap.customer.address}</p>}
            <p className="text-slate-600">{[snap.customer?.phone, snap.customer?.email].filter(Boolean).join(" · ")}</p>
            {snap.customer?.vat_number && <p className="text-slate-600">VAT: {snap.customer.vat_number}</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Vehicle</p>
            <p className="mt-1 font-medium">{snap.vehicle?.label ?? "—"}</p>
            {snap.vehicle?.reg && <p className="font-mono text-slate-600">{snap.vehicle.reg}</p>}
            {snap.vehicle?.original_registration && <p className="text-xs text-slate-600">Original / overseas plate: {snap.vehicle.original_registration}</p>}
            {snap.imported && <p className="text-xs text-slate-600">Imported vehicle</p>}
          </div>
        </div>

        {/* Line items */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(snap.lines && snap.lines.length > 0
              ? snap.lines
              : [{ description: `${snap.vehicle?.label ?? "Vehicle"}${snap.vehicle?.reg ? ` (${snap.vehicle.reg})` : ""}`, gross: snap.sale }]
            ).map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2.5">{l.description}{"vat_rate" in l && l.vat_rate != null && <span className="ml-2 text-xs text-slate-500">VAT {l.vat_rate}% · {money(l.vat??0,c)}</span>}</td>
                <td className="py-2.5 text-right tabular-nums">{money(l.gross, c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isInvoice && snap.agreement_number && <p className="mt-2 text-xs text-slate-500">From agreement {snap.agreement_number}</p>}

        {/* Agreement math (trade-in) */}
        {(isAgreement || isInvoice) && (
          <div className="mt-4 ml-auto w-72 space-y-1 text-sm">
            <Row label="Retail price" value={money(snap.retail, c)} />
            <Row label={snap.siv<0?"Add negative trade-in equity":"Less trade-in net equity"} value={snap.siv<0?`+ ${money(-snap.siv,c)}`:`− ${money(snap.siv,c)}`} />
            <Row label="Cost to change" value={money(f.costToChange, c)} strong />
          </div>
        )}

        {/* Totals */}
        <div className="mt-4 ml-auto w-72 space-y-1 border-t border-slate-200 pt-3 text-sm">
          {Number(f.vrtAmount??0)>0 && <Row label="VRT (included in price)" value={money(f.vrtAmount,c)} />}
          {snap.scheme === "standard" && <Row label="Total excluding VAT" value={money(f.net,c)} />}
          {(snap.scheme !== "margin" || f.vat > 0) && <Row label={`VAT (${f.vatLabel})`} value={money(f.vat, c)} />}
          <Row label={isInvoice ? "Invoice total" : "Sub total"} value={money(f.invoiceTotal, c)} strong />
          {snap.deposits > 0 && <Row label="Net receipts (after refunds)" value={`− ${money(snap.deposits, c)}`} />}
          <Row label="Balance due" value={money(isAgreement ? f.balanceAgreement : f.balanceInvoice, c)} strong />
        </div>

        {snap.trade_ins?.map((t,i)=><div key={i} className="mt-5 border-t border-slate-200 pt-3 text-sm"><p className="font-semibold">Trade-in {i+1}{t.label?` · ${t.label}`:""}{t.registration?` · Plate ${t.registration}`:""}</p><p>Allowance {money(t.allowance,c)} · Lender settlement {money(t.settlement,c)} · Net equity {money(t.equity,c)}</p><p>Lender: {t.provider || "None"}</p></div>)}
        {snap.vehicle_history_report&&Object.entries({"Accident history":snap.vehicle_history_report.accident,"Write-off history":snap.vehicle_history_report.writeOff,"Stolen vehicle history":snap.vehicle_history_report.stolen,"Mileage discrepancy":snap.vehicle_history_report.mileageDiscrepancy}).some(([,value])=>value)&&<section className="mt-5 border border-amber-400 p-3 text-sm"><h2 className="font-semibold">Vehicle history disclosed</h2><p className="mt-1">Reported findings: {Object.entries({"Accident history":snap.vehicle_history_report.accident,"Write-off history":snap.vehicle_history_report.writeOff,"Stolen vehicle history":snap.vehicle_history_report.stolen,"Mileage discrepancy":snap.vehicle_history_report.mileageDiscrepancy}).filter(([,value])=>value).map(([label])=>label).join(", ")}.</p>{snap.vehicle_history_disclosure&&<p className="mt-1 text-xs text-slate-600">Buyer confirmation: {snap.vehicle_history_disclosure.method} · {new Date(snap.vehicle_history_disclosure.confirmed_at).toLocaleString("en-IE")}{snap.vehicle_history_disclosure.reference?` · Ref ${snap.vehicle_history_disclosure.reference}`:""}</p>}</section>}
        {snap.payments && snap.payments.length>0 && <section className="mt-5 text-xs"><h2 className="font-semibold">Payment record</h2>{snap.payments.map((p,i)=><p key={i}>{p.date} · {p.kind} · {p.method} · {money(p.kind==="refund"?-p.amount:p.amount,c)} · {p.reference}{p.clearance_status==="pending"&&<strong> · PENDING</strong>}</p>)}{snap.payments.some(payment=>payment.clearance_status==="pending")&&<p className="mt-2 text-slate-500">PENDING payments await confirmation and do not reduce the confirmed balance due.</p>}</section>}
        {/* Footer / terms */}
        <div className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
          {Number(f.vrtAmount??0)>0 && <p>VRT is included in the vehicle price. {snap.scheme==="standard"&&(f.vrtVatTreatment==="excluded"?"Qualifying VRT disbursement is excluded from the vehicle VAT base.":"VAT treatment uses the full vehicle price.")}</p>}
          {snap.scheme === "margin" && <p>Margin scheme — second-hand goods. VAT on the vehicle is not separately disclosed.</p>}
          {isAgreement && <p className="mt-1">This agreement confirms the vehicle, price and any trade-in. A deposit reserves the vehicle when taken. Balance due on collection.</p>}
          {snap.quote_terms&&<p className="mt-3 whitespace-pre-line"><b>Quote terms:</b> {snap.quote_terms}</p>}
          {snap.warranty&&<div className="mt-3"><p className="font-semibold text-slate-700">Warranty · {snap.warranty.name}</p><p className="whitespace-pre-line">{snap.warranty.terms}</p></div>}
          {snap.finance_terms&&<p className="mt-3 whitespace-pre-line"><b>Finance terms:</b> {snap.finance_terms}</p>}
          {snap.deal_comments&&<p className="mt-3 whitespace-pre-line"><b>Additional notes:</b> {snap.deal_comments}</p>}
          <p className="mt-3 whitespace-pre-line">{isAgreement?snap.dealer.agreement_terms:isInvoice?snap.dealer.invoice_notes:null}</p><p className="mt-3 whitespace-pre-line">{snap.dealer.bank_details}</p>
          {isAgreement&&<div className="mt-8 grid grid-cols-2 gap-8"><p>Customer signature: __________________<br/>Date: __________________</p><p>Dealer signature: __________________<br/>Date: __________________</p></div>}
          <p className="mt-2">Thank you for your business.</p>
        </div>
      </div>

      <p className="no-print pb-8 text-center text-xs text-slate-400">
        <Link href={`/business/deals/${dealId}`} className="hover:text-slate-600">Back to deal</Link>
      </p>
    </div>
  );
}

function CreditNoteDocument({ dealId, snap }: { dealId: string; snap: Snapshot }) {
  const c = snap.currency;
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <style dangerouslySetInnerHTML={{ __html: "@media print{body{background:#fff!important}.no-print{display:none!important}}" }} />
      <DocBar dealId={dealId} />
      <div className="mx-auto my-6 max-w-[820px] bg-white p-10 shadow-sm print:my-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-lg font-semibold tracking-tight">{snap.dealer.legal_name ?? snap.dealer.name}</p>
            <p className="max-w-sm whitespace-pre-line text-xs text-slate-500">{snap.dealer.address}</p>
            <p className="text-xs text-slate-500">{snap.dealer.vat_number ? `VAT: ${snap.dealer.vat_number}` : ""}</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold uppercase tracking-wide">Credit Note</h1>
            <p className="mt-1 text-sm text-slate-600">No. <span className="font-mono">{snap.number}</span></p>
            <p className="text-xs text-slate-500">Date: {snap.date}</p>
          </div>
        </div>
        <section className="mt-5 grid grid-cols-2 gap-6 rounded border border-slate-200 p-4 text-sm">
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer</p><p className="mt-1 font-medium">{snap.customer?.company || snap.customer?.name || "—"}</p><p className="whitespace-pre-line text-slate-600">{snap.customer?.address}</p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Original invoice</p><p className="mt-1 font-mono">{snap.original_invoice?.number ?? "—"}</p><p className="text-slate-600">Issued {snap.original_invoice?.date ?? "—"}</p></div>
        </section>
        <section className="mt-5 text-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reason for correction</p><p className="mt-1">{snap.reason}</p></section>
        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="py-2">Credited item</th><th className="py-2 text-right">VAT</th><th className="py-2 text-right">Credit</th></tr></thead>
          <tbody>{(snap.credited_lines ?? []).map((line) => <tr key={line.index} className="border-b border-slate-100"><td className="py-2.5">{line.description}</td><td className="py-2.5 text-right tabular-nums">{line.vat_rate == null ? "—" : money(line.vat ?? 0, c)}</td><td className="py-2.5 text-right tabular-nums">{money(line.gross, c)}</td></tr>)}</tbody>
        </table>
        <div className="mt-4 ml-auto w-80 space-y-1 border-t border-slate-200 pt-3 text-sm">
          {(snap.vat_credit ?? 0) > 0 && <Row label="VAT included in credit" value={money(snap.vat_credit ?? 0, c)} />}
          <Row label="Credit note total" value={money(snap.gross_credit ?? 0, c)} strong />
          <Row label="Original consideration" value={money(snap.original_consideration ?? 0, c)} />
          <Row label="Amended consideration" value={money(snap.amended_consideration ?? 0, c)} strong />
        </div>
        <div className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
          {snap.margin_note && <p>{snap.margin_note}. VAT on the vehicle is not separately disclosed.</p>}
          <p className="mt-2">This credit note adjusts the original invoice shown above and preserves its audit trail.</p>
        </div>
      </div>
      <p className="no-print pb-8 text-center text-xs text-slate-400"><Link href={`/business/deals/${dealId}`} className="hover:text-slate-600">Back to deal</Link></p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
