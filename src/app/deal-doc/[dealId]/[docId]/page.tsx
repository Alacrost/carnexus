import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  trade_ins?: { allowance:number; settlement:number; provider:string; equity:number }[];
  payments?: { kind:string;method:string;amount:number;date:string;reference:string }[];
  dealer: { name?: string; legal_name?:string; address?:string; vat_number?:string;company_number?:string;phone?:string;email?:string;bank_details?:string;agreement_terms?:string;invoice_notes?:string };
  customer: { name: string; company?: string | null; address?: string | null; phone?: string | null; email?: string | null; vat_number?: string | null } | null;
  vehicle: { label: string; reg?: string | null } | null;
  lines?: { description: string; gross: number;vat_rate?:number|null;vat?:number }[];
  retail: number;
  siv: number;
  sale: number;
  scheme: string;
  figures: ReturnType<typeof docFigures>;
  deposits: number;
}

const KIND_TITLE: Record<string, string> = { agreement: "Sales Agreement", invoice: "Invoice", quote: "Quotation" };
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isInvoice && !snap.finance?.invoice_to_finance ? "Invoice to" : "Customer / vehicle recipient"}</p>
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
            <Row label="Less trade-in (SIV)" value={`− ${money(snap.siv, c)}`} />
            <Row label="Cost to change" value={money(f.costToChange, c)} strong />
          </div>
        )}

        {/* Totals */}
        <div className="mt-4 ml-auto w-72 space-y-1 border-t border-slate-200 pt-3 text-sm">
          {(snap.scheme !== "margin" || f.vat > 0) && <Row label={`VAT (${f.vatLabel})`} value={money(f.vat, c)} />}
          <Row label={isInvoice ? "Invoice total" : "Sub total"} value={money(f.invoiceTotal, c)} strong />
          {snap.deposits > 0 && <Row label="Net receipts (after refunds)" value={`− ${money(snap.deposits, c)}`} />}
          <Row label="Balance due" value={money(isAgreement ? f.balanceAgreement : f.balanceInvoice, c)} strong />
        </div>

        {snap.trade_ins?.map((t,i)=><div key={i} className="mt-5 border-t border-slate-200 pt-3 text-sm"><p className="font-semibold">Trade-in settlement</p><p>Allowance {money(t.allowance,c)} · Lender settlement {money(t.settlement,c)} · Net equity {money(t.equity,c)}</p><p>Lender: {t.provider || "None"}</p></div>)}
        {snap.payments && snap.payments.length>0 && <section className="mt-5 text-xs"><h2 className="font-semibold">Payment record</h2>{snap.payments.map((p,i)=><p key={i}>{p.date} · {p.kind} · {p.method} · {money(p.kind==="refund"?-p.amount:p.amount,c)} · {p.reference}</p>)}</section>}
        {/* Footer / terms */}
        <div className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
          {snap.scheme === "margin" && <p>Margin scheme — second-hand goods. VAT on the vehicle is not separately disclosed.</p>}
          {isAgreement && <p className="mt-1">This agreement confirms the vehicle, price and any trade-in. A deposit reserves the vehicle. Balance due on collection.</p>}
          <p className="mt-3 whitespace-pre-line">{isAgreement?snap.dealer.agreement_terms:snap.dealer.invoice_notes}</p><p className="mt-3 whitespace-pre-line">{snap.dealer.bank_details}</p>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
