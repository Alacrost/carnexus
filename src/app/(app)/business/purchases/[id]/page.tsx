import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { commercialPermission } from "@/lib/commercial-server";
import { can, hasModule } from "@/lib/types";
import { money } from "@/lib/currency";
import { ModuleUpsell } from "@/components/module-upsell";
import { approvePurchase } from "../actions";
import { AddVendorPayment } from "./add-vendor-payment";
import { DeletePurchaseVehicle } from "./delete-purchase-vehicle";
import { CompletePurchaseIntake } from "./complete-purchase-intake";
import { EntityLink, vehicleReference } from "@/components/entity-link";
import {PurchaseTaxForm} from "../purchase-tax-form";

interface Line { description: string; nominal_code: string | null; qty: number; net: number; vat: number; gross: number }
interface Pay { recipient?:string; reference?:string; amount: number; method: string | null; paid_on: string | null }
interface POView {
  id: string; po_no: string; status: string; vat_scheme: string; inv_ref: string | null;
  vendor: string; vendorContact: string; car: string; reg: string | null;
  vendorId?: string | null; vehicleId?: string | null; vehicleReference?: string | null;
  lines: Line[]; payments: Pay[];
  trade_credit?:number;settlement_due?:number;finance_company?:string;finance_reference?:string;due_on?:string;
  purchase_date?: string; received_on?: string; purchase_amount_known?: boolean;
  deal_id?: string | null;
  vat_rate?:number;imported?:boolean;vrt_amount?:number;vrt_vat_treatment?:"included"|"excluded";
}

const STATUS_STYLE: Record<string, string> = {
  to_be_paid: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  approved: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  paid: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  cancelled: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};
const STATUS_LABEL: Record<string, string> = { to_be_paid: "To be paid", approved: "Approved", paid: "Paid", cancelled: "Cancelled" };

export default async function PurchaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!(await commercialPermission("purchase"))) return <p className="text-sm text-slate-400">No access.</p>;
  const canApprove = can.manageMembers(session.role);

  let po: POView | null = null;
  let summary:{total:number;paid:number;outstanding:number;finance_outstanding:number;vendor_outstanding:number}|null=null;

  {
    const supabase = await createClient();
    const { data: row,error:poError } = await supabase.from("purchase_orders").select("id, po_no, status, vat_scheme, vat_rate, imported, vrt_amount, vrt_vat_treatment, inv_ref, vendor_id, vehicle_id, trade_credit, settlement_due, finance_company, finance_reference, due_on, purchase_date, received_on, purchase_amount_known, deal_id").eq("dealer_id", session.dealer.id).eq("id", id).maybeSingle();
    if(poError)return <p role="alert">Purchase tax details could not load. Check access and the financial database update.</p>;
    if (!row) notFound();
    const aggregate=await supabase.rpc("purchase_balances",{p_dealer:session.dealer.id});
    if(aggregate.error||!aggregate.data)return <p role="alert">The authoritative purchase balance could not load.</p>;
    summary=(aggregate.data as {id:string;total:number;paid:number;outstanding:number;finance_outstanding:number;vendor_outstanding:number}[]).find(p=>p.id===id)??null;
    if(!summary)return <p role="alert">The authoritative purchase balance could not load.</p>;
    const results = await Promise.all([
      supabase.from("po_lines").select("description, nominal_code, qty, net, vat, gross").eq("dealer_id", session.dealer.id).eq("po_id", id).order("created_at"),
      supabase.from("po_payments").select("amount, method, paid_on,recipient,reference").eq("dealer_id", session.dealer.id).eq("po_id", id).order("created_at"),
      row.vendor_id ? supabase.from("customers").select("name, phone, email").eq("id", row.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if(results.some(r=>"error" in r && r.error))return <p role="alert">Purchase data could not load. Retry before entering payments.</p>;
    const [{ data: lines }, { data: pays }, { data: vendor }]=results;
    let car = "—"; let reg: string | null = null; let vehicleNo: number | null = null;
    if (row.vehicle_id) {
      const { data: v,error:vehicleError } = await supabase.from("vehicles").select("vehicle_no, make, model, year, registration").eq("dealer_id",session.dealer.id).eq("id", row.vehicle_id).maybeSingle();
      if(vehicleError||!v)return <p role="alert">Purchase vehicle could not load. Retry before entering payments.</p>;
      if (v) { car = `${v.year} ${v.make} ${v.model}`; reg = v.registration; vehicleNo = v.vehicle_no; }
    }
    po = {
      ...row, id: row.id, po_no: row.po_no, status: row.status, vat_scheme: row.vat_scheme, inv_ref: row.inv_ref,
      vendor: vendor?.name ?? "—", vendorContact: [vendor?.phone, vendor?.email].filter(Boolean).join(" · "), vendorId: row.vendor_id, vehicleId: row.vehicle_id, vehicleReference: vehicleReference(vehicleNo),
      car, reg, lines: (lines ?? []) as Line[], payments: (pays ?? []) as Pay[],
    };
  }

  const total = summary ? Number(summary.total) : po.lines.reduce((a, l) => a + Number(l.gross), 0);
  const paid = summary ? Number(summary.paid) : po.payments.reduce((a, p) => a + Number(p.amount), 0);
  const outstanding = total - Number(po.trade_credit??0) - paid;
  const financeOutstanding=summary ? Number(summary.finance_outstanding) : Number(po.settlement_due??0)-po.payments.filter(p=>p.recipient==="finance").reduce((n,p)=>n+Number(p.amount),0);
  const vendorOutstanding=outstanding-financeOutstanding;
  const intakeIncomplete=!po.deal_id&&po.status!=="cancelled"&&(!po.inv_ref?.trim()||!po.purchase_date||!po.received_on);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/business/purchases" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeftIcon size={14} /> Purchases</Link>
        <EntityLink kind="po" id={po.id} reference={po.po_no} href={`/business/purchases/${po.id}`} />
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[po.status]}`}>{STATUS_LABEL[po.status] ?? po.status}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {po.status === "to_be_paid" && canApprove && (
            <form action={approvePurchase}>
              <input type="hidden" name="id" value={po.id} />
              <button type="submit" className="btn-gradient text-xs">Approve</button>
            </form>
          )}
          {canApprove && <DeletePurchaseVehicle poId={po.id} poNo={po.po_no} />}
        </div>
      </div>

      {intakeIncomplete&&<CompletePurchaseIntake poId={po.id} invoiceRef={po.inv_ref} purchaseDate={po.purchase_date??null} receivedOn={po.received_on??null}/>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Total" value={money(total, "EUR")} />
        <Kpi label="Paid" value={money(paid, "EUR")} accent="text-emerald-300" />
        <Kpi label="Outstanding" value={money(outstanding, "EUR")} accent={outstanding > 0 ? "text-amber-300" : "text-emerald-300"} />
        <Kpi label="VAT" value={po.vat_scheme === "none" ? "No VAT" : po.vat_scheme === "margin" ? "Margin" : `${po.vat_rate??23}%`} />
      </div>

      <section className="studio-surface p-4"><h2 className="font-semibold">Payment obligations</h2><p className="mt-2 text-sm">Vendor remaining: {money(vendorOutstanding,"EUR")} · Finance remaining: {money(financeOutstanding,"EUR")}</p><p className="mt-1 text-sm text-slate-400">{po.finance_company} · {po.finance_reference} · Due: {po.due_on??"Not set"}</p>{Number(po.trade_credit??0)!==0&&<p className="mt-2 text-sm">Trade-in net equity applied to sale: {money(Number(po.trade_credit),"EUR")}. This is an offset, not cash paid.</p>}</section>
      <section className="studio-surface p-4"><h2 className="font-semibold">Purchase tax &amp; import</h2><p className="mt-3 text-sm">{po.imported?"Imported vehicle":"Domestic vehicle"} · VRT {money(Number(po.vrt_amount??0),"EUR")} · {po.vrt_vat_treatment==="excluded"?"Eligible VRT disbursement excluded from the selling-price VAT base":"VRT remains in the full selling-price VAT base"}</p>{po.status!=="cancelled"&&<PurchaseTaxForm key={`${po.id}:${po.vat_scheme}:${po.vat_rate}:${po.imported}:${po.vrt_amount}:${po.vrt_vat_treatment}`} poId={po.id} values={{vatScheme:po.vat_scheme,vatRate:Number(po.vat_rate??23),imported:Boolean(po.imported),vrtAmount:Number(po.vrt_amount??0),vrtVatTreatment:po.vrt_vat_treatment??"included"}}/>}</section>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="studio-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vendor</h2>
              <p className="mt-1 text-slate-100">{po.vendorId&&<EntityLink kind="customer" id={po.vendorId} href={`/business/customers/${po.vendorId}`} />}<span className="ml-2">{po.vendor}</span></p>
              {po.vendorContact && <p className="text-sm text-slate-500">{po.vendorContact}</p>}
              {po.inv_ref && <p className="mt-2 text-[11px] text-slate-500">Supplier ref: <span className="text-slate-300">{po.inv_ref}</span></p>}
              <p className="mt-2 text-[11px] text-slate-500">Purchased: <span className="text-slate-300">{po.purchase_date ?? "Legacy — not recorded"}</span> · Arrived: <span className="text-slate-300">{po.received_on ?? "Legacy — not recorded"}</span></p>
            </section>
            <section className="studio-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vehicle</h2>
              <p className="mt-1 text-slate-100">{po.vehicleId&&<EntityLink kind="vehicle" id={po.vehicleId} reference={po.vehicleReference} href={`/inventory/${po.vehicleId}`} />}<span className="ml-2">{po.car}</span></p>
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">Plate <span className="ml-2 font-mono font-semibold text-slate-700">{po.reg ?? "Not recorded"}</span></p>
            </section>
          </div>

          <section className="studio-surface overflow-x-auto p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Nom</th>
                  <th className="px-3 py-2.5 text-right">Net</th>
                  <th className="px-3 py-2.5 text-right">VAT</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-2 text-slate-200">{l.description}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{l.nominal_code ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(Number(l.net), "EUR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(Number(l.vat), "EUR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">{money(Number(l.gross), "EUR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section id="payments" className="studio-surface p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vendor payments</h2>
            <div className="mt-2 space-y-1.5">
              {po.payments.length === 0 && <p className="text-sm text-slate-500">No payments yet.</p>}
              {po.payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                  <span className="text-slate-300">{p.recipient??"vendor"} · {p.method ?? "payment"} · {p.reference}{p.paid_on ? ` · ${p.paid_on}` : ""}</span>
                  <span className="tabular-nums text-slate-200">{money(Number(p.amount), "EUR")}</span>
                </div>
              ))}
            </div>
            {po.status === "to_be_paid" ? (
              <p className="mt-3 text-xs text-amber-300/80">Approve this PO before recording a payment.</p>
            ) : po.status === "approved" ? (
              <AddVendorPayment poId={po.id} />
            ) : null}
          </section>
        </div>

        <section className="studio-surface p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Totals</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Total</dt><dd className="tabular-nums text-slate-200">{po.purchase_amount_known === false ? "Pending" : money(total, "EUR")}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Paid</dt><dd className="tabular-nums text-slate-200">{money(paid, "EUR")}</dd></div>
            <div className="flex justify-between border-t border-white/10 pt-1.5"><dt className="font-medium text-slate-300">Outstanding</dt><dd className="text-base font-semibold tabular-nums text-slate-100">{money(outstanding, "EUR")}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent = "text-slate-100" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}
