import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoLeads, demoVehicles, demoViewings, demoStaff } from "@/lib/demo";
import { can, type LeadStage } from "@/lib/types";
import { ViewingsManager, type VehicleOpt, type StaffMember } from "../viewings-manager";
import type { ViewingRow } from "../actions";

const stages: { key: LeadStage; label: string }[] = [
  { key: "new", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "appointment", label: "Appointment" },
  { key: "test_drive", label: "Test Drive" },
  { key: "finance_applied", label: "Finance Applied" },
  { key: "sold", label: "Sold" },
  { key: "after_sales", label: "After Sales" },
];

export default async function LeadsPage() {
  const session = await requireSession();
  const canSee = can.viewCustomerData(session.role);

  // Agency has no access to customer data (leads / viewings).
  if (!canSee) {
    return (
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gradient">Leads</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your role does not include customer data.
        </p>
      </div>
    );
  }

  let leads: { stage: string }[] = [];
  let vehicles: VehicleOpt[] = [];
  let viewings: ViewingRow[] = [];
  let staff: StaffMember[] = [];

  if (isDemoMode()) {
    leads = demoLeads;
    vehicles = demoVehicles
      .filter((v) => v.status !== "sold")
      .map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}` }));
    viewings = demoViewings as ViewingRow[];
    staff = demoStaff;
  } else {
    const supabase = await createClient();
    const [{ data: l }, { data: v }, { data: vw }, { data: members }] = await Promise.all([
      supabase.from("leads").select("stage").eq("dealer_id", session.dealer.id),
      supabase
        .from("vehicles")
        .select("id, make, model, year")
        .eq("dealer_id", session.dealer.id)
        .neq("status", "sold")
        .order("created_at", { ascending: false }),
      supabase
        .from("viewings")
        .select("id, lead_name, phone, vehicle_id, vehicle_label, scheduled_for, status, notes, responsible")
        .eq("dealer_id", session.dealer.id)
        .order("scheduled_for", { ascending: true }),
      supabase
        .from("dealer_members")
        .select("role, user_id")
        .eq("dealer_id", session.dealer.id)
        .eq("status", "active")
        .in("role", ["owner", "admin", "sales"]),
    ]);
    leads = l ?? [];
    vehicles = (v ?? []).map((x) => ({ id: x.id, label: `${x.year} ${x.make} ${x.model}` }));
    viewings = (vw ?? []) as ViewingRow[];

    const ids = (members ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    staff = (members ?? []).map((m) => ({
      name: nameById.get(m.user_id) ?? "Team member",
      role: m.role,
    }));
  }

  const byStage = new Map<string, number>();
  for (const l of leads) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          Pipeline
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Leads</h1>
        <p className="mt-1 text-sm text-slate-400">
          {leads.length} lead(s) in the pipeline · {viewings.length} viewing(s) booked
        </p>
      </div>

      {/* Pipeline overview */}
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className="studio-surface studio-interactive studio-edge animate-rise p-4 text-center"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{byStage.get(s.key) ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Viewings */}
      <ViewingsManager vehicles={vehicles} staff={staff} initialViewings={viewings} demo={isDemoMode()} initialNow={new Date().getTime()} />
    </div>
  );
}

