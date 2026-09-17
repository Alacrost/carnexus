import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoCustomers } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { CreateCustomer } from "./create-customer";

export default async function CustomersPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role)) {
    return <p className="text-sm text-slate-400">Your role does not include customers.</p>;
  }

  interface C { id: string; name: string; type: string; phone: string | null; email: string | null; business_name?: string | null }
  let customers: C[] = [];
  if (isDemoMode()) {
    customers = demoCustomers as C[];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select("id, name, type, phone, email, business_name")
      .eq("dealer_id", session.dealer.id)
      .is("deleted_at", null)
      .order("name");
    customers = (data ?? []) as C[];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Customers</h1>
          <p className="mt-1 text-sm text-slate-400">People and businesses you buy from and sell to.</p>
        </div>
        <div className="ml-auto"><CreateCustomer /></div>
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
                <td className="p-3 text-slate-100">{c.name}{c.business_name ? ` · ${c.business_name}` : ""}</td>
                <td className="p-3"><span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-400">{c.type}</span></td>
                <td className="p-3 text-slate-400">{c.phone ?? "—"}</td>
                <td className="p-3 text-slate-400">{c.email ?? "—"}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-sm text-slate-500">No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
