import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoIntegrations } from "@/lib/demo";
import { secretStorageEnabled } from "@/lib/crypto";
import { can, hasModule } from "@/lib/types";
import { CURRENCIES } from "@/lib/currency";
import { IntegrationsForm, type IntegrationsValues } from "./integrations-form";
import { createDealerLocation, setDealerCurrency } from "./actions";
import Link from "next/link";
import {createSalesClient} from "@/lib/sales-client";
import {FinancialTaxForm} from "./financial-tax-form";

export default async function SettingsPage() {
  const session = await requireSession();

  let integrations: IntegrationsValues = {
    facebook_url: "",
    instagram_url: "",
    website_url: "",
    donedealConfigured: false,
  };
  let currency = "EUR";
  let locations:{id:string;name:string;code:string|null;is_primary:boolean}[]=[];
  let taxSettings:{defaultVatScheme:string;standardVatRate:number}|null=null;let taxLoadError=false;

  if (can.manageMembers(session.role)) {
    if (isDemoMode()) {
      integrations = demoIntegrations;
    } else {
      const supabase = await createClient();
      const [{ data }, { data: dealer }] = await Promise.all([
        supabase
          .from("dealer_integrations")
          .select("facebook_url, instagram_url, website_url, donedeal_api_key")
          .eq("dealer_id", session.dealer.id)
          .maybeSingle(),
        supabase.from("dealers").select("currency").eq("id", session.dealer.id).maybeSingle(),
      ]);
      integrations = {
        facebook_url: data?.facebook_url ?? "",
        instagram_url: data?.instagram_url ?? "",
        website_url: data?.website_url ?? "",
        donedealConfigured: Boolean(data?.donedeal_api_key),
      };
      currency = dealer?.currency ?? "EUR";
      const {data:locationRows}=await supabase.from("dealer_locations").select("id,name,code,is_primary").eq("dealer_id",session.dealer.id).eq("active",true).order("is_primary",{ascending:false}).order("name");locations=locationRows??[];
    }
  }

  if(can.manageMembers(session.role)){
    const db=await createSalesClient();const result=await db.rpc("financial_tax_settings",{p_dealer:session.dealer.id});
    taxSettings=result.data as {defaultVatScheme:string;standardVatRate:number}|null;taxLoadError=Boolean(result.error)||!taxSettings;
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
        Account
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Settings</h1>

      <div className="mt-6 max-w-xl space-y-4">
        <section className="studio-surface p-5">
          <h2 className="font-medium text-slate-100">Dealership</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Name</dt>
              <dd>{session.dealer.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Plan</dt>
              <dd className="capitalize">{session.dealer.plan.replace("_", " ")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Your role</dt>
              <dd className="capitalize">{session.role}</dd>
            </div>
          </dl>
        </section>

        {session.role === "owner" && (
          <section className="studio-surface p-5">
            <h2 className="font-medium text-slate-100">General</h2>
            <p className="mt-2 text-sm text-slate-400">Currency used across deals and invoices.</p>
            <form action={setDealerCurrency} className="mt-3 flex items-center gap-2">
              <select name="currency" defaultValue={currency} className="studio-input max-w-xs">
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <button type="submit" className="btn-gradient">Save</button>
            </form>
          </section>
        )}

        {can.manageMembers(session.role)&&<section className="studio-surface p-5"><h2 className="font-medium text-slate-100">Stores &amp; locations</h2><p className="mt-2 text-sm text-slate-400">Locations belong to this dealership account and can be selected on Deals and reports.</p><div className="mt-3 space-y-1">{locations.map(location=><div key={location.id} className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"><span>{location.name}{location.is_primary&&<small className="ml-2 text-sky-300">Primary</small>}</span><span className="font-mono text-xs text-slate-500">{location.code}</span></div>)}</div><form action={createDealerLocation} className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_auto]"><input name="name" required minLength={2} maxLength={120} placeholder="New location name" className="studio-input"/><input name="code" maxLength={20} placeholder="Code" className="studio-input"/><button className="btn-gradient">Add location</button></form></section>}

        {can.manageMembers(session.role)&&<section className="studio-surface p-5"><h2 className="font-medium text-slate-100">Financial tax settings</h2>{taxLoadError||!taxSettings?<p role="alert" className="mt-3 text-sm text-rose-300">Financial tax defaults could not load. Check the database update and financial access.</p>:<FinancialTaxForm defaultVatScheme={taxSettings.defaultVatScheme} standardVatRate={Number(taxSettings.standardVatRate)}/>}</section>}

        {session.role === "owner" && (
          <section className="studio-surface p-5">
            <h2 className="font-medium text-slate-100">Products</h2>
            <p className="mt-2 text-sm text-slate-400">Three independently available products. Contact the platform team to change your subscription.</p>
            <div className="mt-3 space-y-2">
              {([
                ["sales", "Sales CRM", "Stock, deals, purchases, invoicing & reports"],
                ["marketing", "Marketing Support", "DoneDeal ads, promotions and reviewed terms"],
                ["website", "Dealer Website", "Public car-listing site synced from your stock"],
              ] as const).map(([key, label, desc]) => (
                <label key={key} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <span className="text-xs text-sky-300">{hasModule(session.dealer.modules, key) ? "Active" : "Not active"}</span>
                  <span>
                    <span className="block text-sm text-slate-100">{label}</span>
                    <span className="block text-xs text-slate-500">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="studio-surface p-5">
          <h2 className="font-medium text-slate-100">Team</h2>
          {can.manageMembers(session.role) && <Link href="/settings/team" className="mt-3 inline-block text-sm text-sky-300">Invitations & members →</Link>}
          {session.role === "owner" && <Link href="/leads/team" className="ml-4 mt-3 inline-block text-sm text-violet-300">CRM profiles →</Link>}
          <p className="mt-2 text-sm text-slate-400">
            {can.manageMembers(session.role)
              ? "Invite teammates, suspend access and manage roles through the audited team workflow."
              : "Only owners and admins can manage team members."}
          </p>
        </section>

        <section className="studio-surface p-5">
          <h2 className="font-medium text-slate-100">Integrations</h2>
          {can.manageMembers(session.role) ? (
            <>
              <p className="mt-2 text-sm text-slate-400">
                Connect your channels so the Marketing Studio can post to the right places
                and sync your stock. DoneDeal live sync arrives soon — you can save the key now.
              </p>
              <IntegrationsForm
                values={integrations}
                secretEnabled={isDemoMode() || secretStorageEnabled()}
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              Only owners and admins can manage integrations.
            </p>
          )}
        </section>

        <section className="studio-surface p-5">
          <h2 className="font-medium text-slate-100">Billing</h2>
          <p className="mt-2 text-sm text-slate-400">
            {can.manageBilling(session.role)
              ? "Stripe billing arrives in Stage 5. You are on the free trial."
              : "Only the owner can manage billing."}
          </p>
        </section>
      </div>
    </div>
  );
}
