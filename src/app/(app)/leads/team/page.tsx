import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import type { CrmTeamMember } from "@/lib/crm";
import { RoleForm,AssignmentForm,type CrmRole } from "./team-forms";

export default async function TeamPage() {
  const ctx = await crmContext();
  if (ctx.error || ctx.session.role !== "owner") return <p role="alert">{ctx.error ?? "Only the owner manages CRM profiles."}</p>;
  let roles: CrmRole[] = [], team: CrmTeamMember[] = [];
  if (ctx.supabase) {
    const [r,t] = await Promise.all([ctx.supabase.from("crm_roles").select("id,name,permissions").eq("dealer_id",ctx.session.dealer.id).order("name"),ctx.supabase.rpc("crm_team",{p_dealer_id:ctx.session.dealer.id})]);
    if (r.error || t.error) return <p role="alert">Could not load team profiles. Please retry.</p>;
    roles = (r.data ?? []) as CrmRole[]; team = (t.data ?? []) as CrmTeamMember[];
  }
  return <div className="space-y-6"><Link href="/leads" className="text-sky-300 text-sm">← Leads</Link><h1 className="text-3xl font-semibold">CRM profiles & team</h1><p className="max-w-3xl text-sm text-slate-400">Owner and admin retain CRM oversight. Assign a Manager or custom profile to an existing salesperson to control lead access, editing, assignment and reporting. Price override, purchase-cost visibility, purchasing and payment permissions apply to the commercial workflow. Marketing and billing stay separate.</p>{!ctx.supabase && <p className="text-amber-300">Preview — connect Supabase to manage team access.</p>}<div className="grid gap-5 lg:grid-cols-2"><section className="space-y-5"><h2 className="text-xl">Profiles</h2><RoleForm />{roles.map(r=><RoleForm key={r.id+JSON.stringify(r.permissions)+r.name} role={r} />)}</section><section className="studio-surface p-6"><h2 className="mb-4 text-xl">Sales team</h2>{team.filter(m=>m.base_role === "sales").map(m=><AssignmentForm key={m.id+String(m.crm_role_id)} member={m} roles={roles} />)}{!team.some(m=>m.base_role === "sales") && <p className="text-sm text-slate-400">No active salespeople yet. Team onboarding is the next delivery stage.</p>}<p className="mt-4 text-xs text-slate-400">Profile and assignment changes are recorded in the dealership audit log. Profiles are retained rather than deleted so permissions never silently revert.</p></section></div></div>;
}
