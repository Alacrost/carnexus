import Link from "next/link";
import {notFound} from "next/navigation";
import {requireSession} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {isDemoMode} from "@/lib/demo";
import {can} from "@/lib/types";
import {commercialPermission} from "@/lib/commercial-server";
import {money} from "@/lib/currency";
import {PrintQuoteButton} from "./print-button";

interface QuoteSnapshot {
  number:string;date:string;valid_days:number;valid_until:string;currency:string;
  dealer:{legal_name?:string;address?:string;phone?:string;email?:string;vat_number?:string};
  customer:{name:string;company?:string|null;address?:string;phone?:string;email?:string};
  salesperson:{name:string};vehicle:{label:string;reg?:string;km?:number};
  sale_price:number;window_price?:number|null;scheme:string;
  quote_terms?:string|null;deal_comments?:string|null;finance_terms?:string|null;
  warranty?:{name:string;terms:string}|null;
  finance?:{company:string;address:string;invoice_to_finance:boolean}|null;
  vehicle_history_report?:{accident:boolean;writeOff:boolean;stolen:boolean;mileageDiscrepancy:boolean};
}
const dateLabel=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString("en-IE",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"});

export default async function QuoteSummary({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const session=await requireSession();
  if(!can.manageDeals(session.role)||!(await commercialPermission("read")))return <p>No access to this quote.</p>;
  if(isDemoMode())notFound();
  const db=await createClient();
  const {data:row,error}=await db.from("sales_quotes").select("id,quote_no,valid_until,status,deal_id,customer_id,vehicle_id,snapshot").eq("dealer_id",session.dealer.id).eq("id",id).maybeSingle();
  if(error||!row)notFound();
  const quote=row.snapshot as QuoteSnapshot;const expired=row.status==="open"&&row.valid_until<new Date().toISOString().slice(0,10);
  const label=row.status==="converted"?"Converted to Deal":expired?"Expired":"Open quote";
  return <div className="quote-print mx-auto max-w-5xl space-y-6"><div className="quote-print-toolbar flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5"><div><Link href="/business/quotes" className="text-xs text-slate-400 hover:text-white">← All quotes</Link><p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Quotation summary</p><h1 className="mt-1 font-mono text-3xl font-semibold text-white">{row.quote_no}</h1><p className="mt-2 text-sm text-slate-400">{label} · issued {dateLabel(quote.date)} · valid until {dateLabel(row.valid_until)}</p></div><div className="flex flex-wrap gap-2"><PrintQuoteButton/>{row.status==="open"&&!expired&&<Link href={`/business/deals/new?quoteId=${id}`} className="btn-gradient text-sm">Create Deal from quote →</Link>}{row.deal_id&&<Link href={`/business/deals/${row.deal_id}`} className="border border-white/20 px-4 py-2 text-sm font-semibold text-white">Open linked Deal →</Link>}</div></div>
    {expired&&<div className="quote-print-toolbar border-l-2 border-amber-300 bg-amber-300/[0.08] px-4 py-3 text-sm text-amber-100">This quote expired on {dateLabel(row.valid_until)}. Issue a new quote to confirm current price and availability.</div>}
    <article className="quote-print-sheet bg-white p-6 text-[#1c2521] shadow-[0_22px_60px_-32px_rgba(0,0,0,0.65)] sm:p-10"><header className="flex flex-wrap justify-between gap-8 border-b-2 border-[#25302a] pb-7"><div><p className="text-xl font-semibold tracking-tight">{quote.dealer.legal_name??session.dealer.name}</p><p className="mt-2 max-w-xs whitespace-pre-line text-xs leading-5 text-[#55615a]">{quote.dealer.address}</p><p className="mt-1 text-xs text-[#55615a]">{[quote.dealer.phone,quote.dealer.email].filter(Boolean).join(" · ")}</p></div><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637069]">Quotation</p><p className="mt-1 font-mono text-xl font-bold">{row.quote_no}</p><p className="mt-2 text-xs text-[#55615a]">Issued {dateLabel(quote.date)}</p><p className="text-xs font-semibold">Valid through {dateLabel(row.valid_until)}</p></div></header>
      <div className="grid gap-7 border-b border-[#d8ddd8] py-7 sm:grid-cols-2"><section><h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#56625b]">Customer</h2><p className="mt-2 text-base font-semibold">{quote.customer.company||quote.customer.name}</p>{quote.customer.company&&<p className="text-sm">{quote.customer.name}</p>}<p className="mt-1 whitespace-pre-line text-sm text-[#536057]">{quote.customer.address}</p><p className="text-sm text-[#536057]">{[quote.customer.phone,quote.customer.email].filter(Boolean).join(" · ")}</p></section><section><h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#56625b]">Responsible salesperson</h2><p className="mt-2 text-base font-semibold">{quote.salesperson.name}</p><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#56625b]">Validity</p><p className="mt-1 text-sm">{quote.valid_days} day{quote.valid_days===1?"":"s"} · until {dateLabel(quote.valid_until)}</p></section></div>
      <section className="border-b border-[#d8ddd8] py-7"><h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#56625b]">Vehicle quoted</h2><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><p className="text-lg font-semibold">{quote.vehicle.label}</p><p className="mt-1 font-mono text-sm text-[#56625b]">Plate {quote.vehicle.reg||"—"}{quote.vehicle.km!=null?` · ${Number(quote.vehicle.km).toLocaleString("en-IE")} km`:""}</p></div><p className="text-3xl font-semibold tabular-nums">{money(Number(quote.sale_price),quote.currency)}</p></div>{quote.window_price!=null&&Number(quote.window_price)>Number(quote.sale_price)&&<p className="mt-3 text-sm text-[#526258]">Window price {money(Number(quote.window_price),quote.currency)} · quoted reduction {money(Number(quote.window_price)-Number(quote.sale_price),quote.currency)}</p>}</section>
      <div className="grid gap-6 py-7 sm:grid-cols-2"><section><h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#56625b]">Quote terms</h2><p className="mt-2 whitespace-pre-line text-sm leading-6">{quote.quote_terms||"Price and availability subject to confirmation before a Deal is created."}</p>{quote.deal_comments&&<p className="mt-4 whitespace-pre-line text-sm leading-6"><b>Additional notes:</b> {quote.deal_comments}</p>}</section><section><h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#56625b]">Warranty &amp; finance</h2>{quote.warranty?<><p className="mt-2 font-semibold">{quote.warranty.name}</p><p className="mt-1 whitespace-pre-line text-sm leading-6">{quote.warranty.terms}</p></>:<p className="mt-2 text-sm">No warranty selected.</p>}{quote.finance&&<p className="mt-4 text-sm">Finance company: <b>{quote.finance.company}</b>{quote.finance.invoice_to_finance?" · invoice recipient if a sale is agreed":""}</p>}{quote.finance_terms&&<p className="mt-2 whitespace-pre-line text-sm">{quote.finance_terms}</p>}</section></div>
      {quote.vehicle_history_report&&Object.entries({"Accident history":quote.vehicle_history_report.accident,"Write-off history":quote.vehicle_history_report.writeOff,"Stolen vehicle history":quote.vehicle_history_report.stolen,"Mileage discrepancy":quote.vehicle_history_report.mileageDiscrepancy}).some(([,value])=>value)&&<section className="border-t border-[#d8ddd8] py-4 text-sm"><h2 className="font-semibold">Reported vehicle history</h2><p className="mt-1">{Object.entries({"Accident history":quote.vehicle_history_report.accident,"Write-off history":quote.vehicle_history_report.writeOff,"Stolen vehicle history":quote.vehicle_history_report.stolen,"Mileage discrepancy":quote.vehicle_history_report.mileageDiscrepancy}).filter(([,value])=>value).map(([label])=>label).join(", ")}. Buyer disclosure and confirmation are required before an invoice is issued.</p></section>}
      <footer className="border-t border-[#d8ddd8] pt-5 text-xs leading-5 text-[#5b665e]"><p>This is a quotation, not a sales agreement or invoice. No deposit or vehicle reservation is recorded by issuing it.</p><p className="mt-2">Quote {row.quote_no} · {quote.dealer.legal_name??session.dealer.name}</p></footer>
    </article>
  </div>;
}
