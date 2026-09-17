import { crmContext } from "@/lib/crm-server";
import { demoCustomers, demoVehicles, demoLeads } from "@/lib/demo";
import type { CrmLead, CrmOption, CrmTeamMember } from "@/lib/crm";

export const demoCrmLeads: CrmLead[] = demoLeads.map((lead, index) => ({
  ...lead, title: lead.notes, customer_id: demoCustomers[0]?.id ?? null, vehicle_id: demoVehicles[0]?.id ?? null,
  assigned_to: "00000000-0000-0000-0000-000000000001", score: "warm", next_action: index === 0 ? "Call to arrange a viewing" : null,
  next_action_at: index === 0 ? "2026-09-16T10:00:00Z" : null, lost_reason: null, version: 1, created_at: "2026-09-15T10:00:00Z",
}));

export async function crmOptions(ctx: Awaited<ReturnType<typeof crmContext>>, lead?: CrmLead) {
  if (!ctx.supabase) return {
    customers: demoCustomers.map(c => ({ id: c.id, name: c.name })),
    vehicles: demoVehicles.map(v => ({ id: v.id, name: `${v.year} ${v.make} ${v.model}` })),
    team: [{ id: ctx.session.userId, name: "Preview owner", base_role: "owner", crm_role_id: null }] as CrmTeamMember[], error: null,
  };
  const dealerId = ctx.session.dealer.id;
  const [c, v, t] = await Promise.all([
    ctx.supabase.from("customers").select("id,name").eq("dealer_id",dealerId).is("deleted_at",null).order("created_at",{ascending:false}).limit(100),
    ctx.supabase.from("vehicles").select("id,year,make,model").eq("dealer_id",dealerId).order("created_at",{ascending:false}).limit(100),
    ctx.supabase.rpc("crm_team", { p_dealer_id: dealerId }),
  ]);
  const vehicles: CrmOption[] = (v.data ?? []).map(v => ({ id: v.id, name: `${v.year} ${v.make} ${v.model}` }));
  if (lead?.vehicle_id && !vehicles.some(v => v.id === lead.vehicle_id)) {
    const extra = await ctx.supabase.from("vehicles").select("id,year,make,model").eq("dealer_id",dealerId).eq("id",lead.vehicle_id).maybeSingle();
    if (extra.data) vehicles.push({ id: extra.data.id, name: `${extra.data.year} ${extra.data.make} ${extra.data.model}` });
    else vehicles.push({ id: lead.vehicle_id, name: "Previously selected vehicle" });
  }
  const team = (t.data ?? []) as CrmTeamMember[];
  if (lead?.assigned_to && !team.some(m => m.id === lead.assigned_to)) team.push({ id: lead.assigned_to, name: "Inactive member — reassign", base_role: "sales", crm_role_id: null });
  return { customers: (c.data ?? []) as CrmOption[], vehicles, team, error: c.error || v.error || t.error ? "Some CRM options could not be loaded. Please retry before saving." : null };
}
