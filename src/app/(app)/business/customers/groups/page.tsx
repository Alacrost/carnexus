import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { commercialPermission } from "@/lib/commercial-server";
import { isDemoMode } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { ModuleUpsell } from "@/components/module-upsell";
import { GroupManager, type ContactGroup, type GroupContact } from "./group-manager";

export default async function ContactGroupsPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.manageDeals(session.role) || !(await commercialPermission("read"))) return <p>Your role does not include contacts.</p>;
  let groups: ContactGroup[] = [];
  let contacts: GroupContact[] = [];
  let membership: { group_id: string; customer_id: string }[] = [];
  if (isDemoMode()) {
    groups = [{ id: "demo-customers", name: "Customers", system_key: "customers" }, { id: "demo-finance", name: "Finance companies", system_key: "finance_companies" }];
  } else {
    const db = await createClient();
    const [groupResult, contactResult, memberResult] = await Promise.all([
      db.from("contact_groups").select("id,name,system_key").eq("dealer_id", session.dealer.id).order("name"),
      db.from("customers").select("id,name,type,address_line1").eq("dealer_id", session.dealer.id).is("deleted_at", null).order("name"),
      db.from("contact_group_members").select("group_id,customer_id").eq("dealer_id", session.dealer.id),
    ]);
    if (groupResult.error || contactResult.error || memberResult.error) return <p role="alert">Contact groups could not load. Apply migration 075 and retry.</p>;
    groups = groupResult.data ?? []; contacts = contactResult.data ?? []; membership = memberResult.data ?? [];
  }
  return <div className="space-y-5"><header className="border-b border-white/10 pb-5"><Link href="/business/customers" className="text-sm text-sky-300">← Contacts</Link><h1 className="mt-2 text-3xl font-semibold text-white">Contact groups</h1><p className="mt-1 text-sm text-slate-400">Organise contacts and finance companies. Finance companies here are the only options in Edit Deal.</p></header><GroupManager groups={groups} contacts={contacts} membership={membership}/></div>;
}
