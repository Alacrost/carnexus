import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoDeals, demoCosts } from "@/lib/demo";
import { can } from "@/lib/types";
import { DealEditor, type DealValues, type CostItem } from "./deal-editor";

export default async function DealPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const session = await requireSession();

  if (!can.viewFinancials(session.role)) {
    return <p className="text-sm text-slate-400">Your role does not include financial data.</p>;
  }

  let vehicleLabel = "";
  let deal: DealValues | null = null;
  let costs: CostItem[] = [];

  if (isDemoMode()) {
    const v = demoVehicles.find((x) => x.id === vehicleId);
    if (!v) notFound();
    vehicleLabel = `${v.year} ${v.make} ${v.model}`;
    deal = (demoDeals.find((d) => d.vehicle_id === vehicleId) as DealValues) ?? null;
    costs = demoCosts.filter((c) => c.vehicle_id === vehicleId) as CostItem[];
  } else {
    const supabase = await createClient();
    const { data: v } = await supabase
      .from("vehicles")
      .select("make, model, year")
      .eq("dealer_id", session.dealer.id)
      .eq("id", vehicleId)
      .maybeSingle();
    if (!v) notFound();
    vehicleLabel = `${v.year} ${v.make} ${v.model}`;

    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from("vehicle_deals").select("*").eq("dealer_id", session.dealer.id).eq("vehicle_id", vehicleId).maybeSingle(),
      supabase.from("vehicle_costs").select("id, kind, amount, cost_date, notes").eq("dealer_id", session.dealer.id).eq("vehicle_id", vehicleId).order("created_at"),
    ]);
    deal = (d as DealValues) ?? null;
    costs = (c ?? []) as CostItem[];
  }

  return (
    <div>
      <Link href="/business" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeftIcon size={14} /> Sales & Accounts
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">{vehicleLabel}</h1>
      <p className="mt-1 text-sm text-slate-400">Commercial record — purchase, costs, sale.</p>
      <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
        This is a read-only legacy commercial record, not the current car details page. <Link href={`/inventory/${vehicleId}`} className="font-semibold underline">Open vehicle details and Buying info →</Link> New sales run through <Link href="/business/deals" className="font-medium underline">Deals</Link> and acquisitions through <Link href="/business/purchases" className="font-medium underline">Purchase orders</Link>, preserving invoices, payments and audit history.
      </div>

      <div className="mt-6">
        <DealEditor
          vehicleId={vehicleId}
          initialDeal={deal}
          initialCosts={costs}
          canManage={false}
          demo={isDemoMode()}
        />
      </div>
    </div>
  );
}
