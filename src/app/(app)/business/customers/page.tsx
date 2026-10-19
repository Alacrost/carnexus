import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { isDemoMode } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { CreateCustomer } from "./create-customer";
import Link from "next/link";
import { EntityLink } from "@/components/entity-link";

export default async function CustomersPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role)) {
    return <p className="text-sm text-slate-400">Your role does not include contacts.</p>;
  }

  interface C { id: string; name: string; type: string; phone: string | null; email: string | null; business_name?: string | null }
  let customers: C[] = [];
  let canExport = false;
  let canOpenTimeline = isDemoMode();
  if (isDemoMode()) {
    const db=await createClient();
    const result=await db.from("customers").select("id,name,type,phone,email,business_name").eq("dealer_id",session.dealer.id).is("deleted_at",null).order("name");
    if(result.error)return <p role="alert">Local demo contacts could not load.</p>;
    customers=result.data??[];
  } else {
    const supabase = await createClient();
    const [{ data }, customerPermission, timelinePermission, exportPermission] = await Promise.all([supabase.from("customers").select("id, name, type, phone, email, business_name").eq("dealer_id", session.dealer.id).is("deleted_at", null).order("name"),supabase.rpc("commercial_allowed",{p_dealer_id:session.dealer.id,p_permission:"read"}),supabase.rpc("crm_allowed",{p_dealer_id:session.dealer.id,p_permission:"read"}),supabase.rpc("crm_allowed",{p_dealer_id:session.dealer.id,p_permission:"report"})]);
    if (customerPermission.data !== true) return <p className="text-sm text-slate-400">Your role does not include contacts.</p>;
    customers = (data ?? []) as C[];
    canOpenTimeline = timelinePermission.data === true;
    canExport = exportPermission.data === true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Contacts</h1>
          <p className="mt-1 text-sm text-slate-400">People and businesses you buy from and sell to.</p>
        </div>
        <div className="ml-auto flex items-center gap-4"><Link href="/business/customers/groups" className="border border-white/20 px-3 py-2 text-sm text-slate-100 hover:bg-white/5">Contact groups</Link>{canExport && <Link href="/leads/export?type=customers" className="text-sm text-sky-300">Export CSV</Link>}<CreateCustomer /></div>
      </div>

      <div className="studio-surface overflow-x-auto p-2">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="p-3">Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Email</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-white/5">
                <td className="p-3 text-slate-100">
                  {canOpenTimeline && <EntityLink kind="customer" id={c.id} href={`/business/customers/${c.id}`} />}
                  <span className={canOpenTimeline ? "ml-2" : ""}>{c.name}{c.business_name ? ` · ${c.business_name}` : ""}</span>
                </td>
                <td className="p-3"><span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-400">{c.type}</span></td>
                <td className="p-3 text-slate-400">{c.phone ?? "—"}</td>
                <td className="p-3 text-slate-400">{c.email ?? "—"}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-sm text-slate-500">No contacts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
