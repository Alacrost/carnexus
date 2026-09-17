import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoLeads, demoStaff } from "@/lib/demo";
import { can } from "@/lib/types";
import { DealSheet, type Opt, type VehicleOpt } from "./deal-sheet";
import type { CustomerMatch } from "../../customers/actions";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; leadId?: string }>;
}) {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) {
    return <p className="text-sm text-slate-400">Your role does not include the sales process.</p>;
  }
  const { vehicleId: preVehicleId, leadId: requestedLeadId } = await searchParams;
  let initialLeadId = "", initialSource = "";
  let initialCustomer: CustomerMatch | undefined;

  let vehicles: VehicleOpt[] = [];
  let leads: Opt[] = [];
  let staff: Opt[] = [];

  if (isDemoMode()) {
    vehicles = demoVehicles.filter((v) => v.status !== "sold").map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}`, price: v.sale_price ?? undefined, make: v.make, model: v.model, year: v.year, km: v.km, registration: v.registration }));
    leads = demoLeads.slice(0, 4).map((l) => ({ id: l.id, label: l.notes }));
    staff = demoStaff.map((s, i) => ({ id: i === 0 ? session.userId : crypto.randomUUID(), label: s.name }));
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: l }, { data: members }] = await Promise.all([
      supabase.from("vehicles").select("id, make, model, year, km, registration, sale_price").eq("dealer_id", session.dealer.id).neq("status", "sold").order("created_at", { ascending: false }),
      supabase.from("leads").select("id, title").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("dealer_members").select("role, user_id").eq("dealer_id", session.dealer.id).eq("status", "active").in("role", ["owner", "admin", "sales"]),
    ]);
    vehicles = (v ?? []).map((x) => ({ id: x.id, label: `${x.year} ${x.make} ${x.model}`, price: x.sale_price ?? undefined, make: x.make, model: x.model, year: x.year, km: x.km, registration: x.registration }));
    leads = (l ?? []).map((x) => ({ id: x.id, label: x.title ?? "Lead" }));
    if (requestedLeadId && /^[0-9a-f-]{36}$/i.test(requestedLeadId)) {
      const { data: selected, error } = await supabase.from("leads").select("id,title,source,customer_id").eq("dealer_id",session.dealer.id).eq("id",requestedLeadId).maybeSingle();
      if (error || !selected) return <p role="alert">The selected lead could not be loaded. Return to the lead and retry.</p>;
      initialLeadId = selected.id; initialSource = selected.source;
      if (!leads.some(l => l.id === selected.id)) leads.unshift({id:selected.id,label:selected.title});
      if (selected.customer_id) {
        const customer = await supabase.from("customers").select("id,name,type,phone,email").eq("dealer_id",session.dealer.id).eq("id",selected.customer_id).is("deleted_at",null).maybeSingle();
        if (customer.error || !customer.data) return <p role="alert">The lead contact is unavailable. Resolve the contact before creating a deal.</p>;
        initialCustomer = customer.data;
      }
    }
    const ids = (members ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    staff = (members ?? []).map((m) => ({ id: m.user_id, label: nameById.get(m.user_id) ?? "Team member" }));
    if (!staff.some((s) => s.id === session.userId)) staff.unshift({ id: session.userId, label: "You" });
  }

  const initialVehicleId = preVehicleId && vehicles.some((v) => v.id === preVehicleId) ? preVehicleId : vehicles[0]?.id ?? "";

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">New deal</h1>
      <p className="mt-1 text-sm text-slate-400">Walk through the sale — customer, source, then the car and deposit.</p>
      <div className="mt-6">
        <DealSheet
          vehicles={vehicles}
          leads={leads}
          staff={staff}
          initialVehicleId={initialVehicleId}
          defaultSalespersonId={session.userId}
          initialLeadId={initialLeadId}
          initialSource={initialSource}
          initialCustomer={initialCustomer}
        />
      </div>
    </div>
  );
}
