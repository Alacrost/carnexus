import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoLeads, demoStaff } from "@/lib/demo";
import { can } from "@/lib/types";
import { DealSheet, type Opt, type VehicleOpt } from "./deal-sheet";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  const session = await requireSession();
  if (!can.manageDeals(session.role)) {
    return <p className="text-sm text-slate-400">Your role does not include the sales process.</p>;
  }
  const { vehicleId: preVehicleId } = await searchParams;

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
      supabase.from("leads").select("id, notes").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("dealer_members").select("role, user_id").eq("dealer_id", session.dealer.id).eq("status", "active").in("role", ["owner", "admin", "sales"]),
    ]);
    vehicles = (v ?? []).map((x) => ({ id: x.id, label: `${x.year} ${x.make} ${x.model}`, price: x.sale_price ?? undefined, make: x.make, model: x.model, year: x.year, km: x.km, registration: x.registration }));
    leads = (l ?? []).map((x) => ({ id: x.id, label: x.notes ?? "Lead" }));
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
        />
      </div>
    </div>
  );
}
