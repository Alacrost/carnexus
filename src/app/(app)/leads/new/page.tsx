import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import { crmOptions } from "../crm-data";
import { LeadForm } from "../lead-form";

export default async function NewLeadPage() {
  const ctx = await crmContext();
  if (ctx.error || !ctx.permissions.includes("work")) return <p role="alert">{ctx.error ?? "Your CRM profile cannot create leads."}</p>;
  const options = await crmOptions(ctx);
  return <div className="space-y-6 max-w-4xl">
    <Link href="/leads" className="text-sm text-sky-300">← Leads</Link>
    <div><p className="text-xs uppercase tracking-widest text-sky-400">Sales CRM</p><h1 className="mt-2 text-3xl font-semibold">New enquiry</h1><p className="mt-2 text-slate-400">Capture the contact, interest and next step.</p></div>
    {!ctx.supabase && <p className="text-amber-300">Preview — changes are not saved.</p>}
    {options.error ? <p role="alert">{options.error}</p> : <LeadForm {...options} canAssign={ctx.permissions.includes("assign")} userId={ctx.session.userId} />}
  </div>;
}
