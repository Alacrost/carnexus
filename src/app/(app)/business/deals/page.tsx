import Link from "next/link";
import { commercialPermission } from "@/lib/commercial-server";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { DealsBoard, type DealRow } from "./deals-board";
import { vehicleReference } from "@/components/entity-link";

export default async function DealsPage({searchParams}:{searchParams:Promise<{closed?:string}>}) {
  const showClosed=(await searchParams).closed==="1";
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role) || !(await commercialPermission("read"))) {
    return <p className="text-sm text-slate-400">Your role does not include the sales process.</p>;
  }

  let rows: DealRow[] = [];

  {
    const supabase = await createClient();
    const [{ data: deals }, { data: orders }, { data: pays }, { data: vehicles }, { data: customers }, { data: agreements }] = await Promise.all([
      supabase.from("deals").select("id, deal_no, status, stage, version, currency, customer_id, salesperson_id").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }),
      supabase.from("deal_orders").select("deal_id, vehicle_id, price, kind").eq("dealer_id", session.dealer.id).eq("kind", "sale"),
      supabase.from("payments").select("deal_id, kind, amount").eq("dealer_id", session.dealer.id).eq("kind", "deposit"),
      supabase.from("vehicles").select("id, vehicle_no, make, model, year, registration").eq("dealer_id", session.dealer.id),
      supabase.from("customers").select("id, name").eq("dealer_id", session.dealer.id),
      supabase.from("deal_documents").select("deal_id, deal_version").eq("dealer_id", session.dealer.id).eq("kind", "agreement").neq("status", "void"),
    ]);
    const orderByDeal = new Map((orders ?? []).map((o) => [o.deal_id, o]));
    const vLabel = new Map((vehicles ?? []).map((v) => [v.id, `${v.year} ${v.make} ${v.model}`]));
    const vReference = new Map((vehicles ?? []).map((v) => [v.id, vehicleReference(v.vehicle_no)]));
    const vRegistration = new Map((vehicles ?? []).map((v) => [v.id, v.registration]));
    const cName = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const depByDeal = new Map<string, number>();
    for (const p of pays ?? []) depByDeal.set(p.deal_id, (depByDeal.get(p.deal_id) ?? 0) + Number(p.amount));
    const currentAgreements = new Set((agreements ?? []).map((a) => `${a.deal_id}:${a.deal_version}`));

    const spIds = [...new Set((deals ?? []).map((d) => d.salesperson_id).filter(Boolean) as string[])];
    const { data: profs } = spIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", spIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const spName = new Map((profs ?? []).map((p) => [p.id, p.full_name]));

    rows = (deals ?? []).map((d) => {
      const o = orderByDeal.get(d.id);
      return {
        id: d.id,
        deal_no: d.deal_no,
        status: d.status,
        stage: d.stage ?? "vehicle_interest",
        currency: d.currency,
        customer: d.customer_id ? cName.get(d.customer_id) ?? "—" : "—",
        customerId: d.customer_id,
        car: o?.vehicle_id ? vLabel.get(o.vehicle_id) ?? "—" : "—",
        vehicleId: o?.vehicle_id ?? null,
        vehicleReference: o?.vehicle_id ? vReference.get(o.vehicle_id) ?? null : null,
        vehicleRegistration: o?.vehicle_id ? vRegistration.get(o.vehicle_id) ?? null : null,
        sale: Number(o?.price ?? 0),
        deposit: depByDeal.get(d.id) ?? 0,
        salesperson: d.salesperson_id ? spName.get(d.salesperson_id) ?? "—" : "—",
        agreement_current: currentAgreements.has(`${d.id}:${d.version}`) && !["completed", "cancelled", "reversed"].includes(d.status),
      };
    });
  }

  // Deals workspace = open work only; completed/cancelled live in Sales & Accounts.
  rows = rows.filter((r) => showClosed ? ["completed","cancelled","reversed"].includes(r.status) : !["completed","cancelled","reversed"].includes(r.status));

  return <><div className="mb-4 flex flex-wrap gap-4 text-sm text-sky-300"><Link href="/business/quotes">Quotes · open &amp; expired</Link><Link href={showClosed?"/business/deals":"/business/deals?closed=1"}>{showClosed?"Active pipeline":"Completed / cancelled / reversed deals"}</Link><Link href="/business/document-settings">Document settings</Link><Link href="/business/purchases">Purchases & lender settlements</Link></div><DealsBoard rows={rows}/></>;
}
