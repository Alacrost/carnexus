import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoIntegrations } from "@/lib/demo";
import { secretStorageEnabled } from "@/lib/crypto";
import { can, hasModule } from "@/lib/types";
import { CURRENCIES } from "@/lib/currency";
import { IntegrationsForm, type IntegrationsValues } from "./integrations-form";
import { setDealerCurrency, setDealerModules } from "./actions";

export default async function SettingsPage() {
  const session = await requireSession();

  let integrations: IntegrationsValues = {
    facebook_url: "",
    instagram_url: "",
    website_url: "",
    donedealConfigured: false,
  };
  let currency = "EUR";

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
    }
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

        {session.role === "owner" && (
          <section className="studio-surface p-5">
            <h2 className="font-medium text-slate-100">Products</h2>
            <p className="mt-2 text-sm text-slate-400">Each product is billed separately. Turn a product on or off for this dealership.</p>
            <form action={setDealerModules} className="mt-3 space-y-2">
              {([
                ["sales", "Sales CRM", "Stock, deals, purchases, invoicing & reports"],
                ["marketing", "Marketing Studio", "AI photos, descriptions, social & campaigns"],
                ["website", "Dealer Website", "Public car-listing site synced from your stock"],
              ] as const).map(([key, label, desc]) => (
                <label key={key} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <input type="checkbox" name={key} defaultChecked={hasModule(session.dealer.modules, key)} className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="block text-sm text-slate-100">{label}</span>
                    <span className="block text-xs text-slate-500">{desc}</span>
                  </span>
                </label>
              ))}
              <button type="submit" className="btn-gradient">Save products</button>
              {isDemoMode() && <p className="text-xs text-slate-500">Demo mode — changes are not saved.</p>}
            </form>
          </section>
        )}

        <section className="studio-surface p-5">
          <h2 className="font-medium text-slate-100">Team</h2>
          <p className="mt-2 text-sm text-slate-400">
            {can.manageMembers(session.role)
              ? "Invite salespeople and admins. The invitation manager UI ships in Stage 1 — invitations already work via the secure API."
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
