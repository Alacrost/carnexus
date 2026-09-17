import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoWebsiteSettings, demoVehicles } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { WebsiteForm } from "./website-form";

export default async function WebsitePage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "website")) return <ModuleUpsell product="Dealer Website" />;
  if (!can.manageMembers(session.role)) return <p className="text-sm text-slate-400">Only owners and admins manage the website.</p>;

  const demo = isDemoMode();
  let values = { enabled: false, headline: "", subheadline: "", about: "", phone: "", whatsapp: "", email: "", theme_color: "#0ea5e9", donedeal_seller_url: "", last_synced_at: null as string | null };
  let carCount = 0;

  if (demo) {
    values = { ...demoWebsiteSettings } as typeof values;
    carCount = demoVehicles.filter((v) => (v.stock_class ?? "main") === "main" && ["ready_for_sale", "reserved"].includes(v.status)).length;
  } else {
    const supabase = await createClient();
    const [{ data: s }, { count }] = await Promise.all([
      supabase.from("website_settings").select("*").eq("dealer_id", session.dealer.id).maybeSingle(),
      supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("dealer_id", session.dealer.id).eq("stock_class", "main").in("status", ["ready_for_sale", "reserved"]),
    ]);
    if (s) values = { ...values, ...s };
    carCount = count ?? 0;
  }

  const siteUrl = `/s/${session.dealer.slug}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Website</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Dealer Website</h1>
          <p className="mt-1 text-sm text-slate-400">Your public car-listing site, powered by the stock recorded in Autonexus.</p>
        </div>
        <Link href={siteUrl} target="_blank" className="btn-gradient text-sm">View public site ↗</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p><p className={`mt-0.5 text-base font-semibold ${values.enabled ? "text-emerald-300" : "text-slate-400"}`}>{values.enabled ? "Published" : "Draft"}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Cars live</p><p className="mt-0.5 text-base font-semibold text-slate-100">{carCount}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Public URL</p><p className="mt-0.5 truncate text-sm font-medium text-sky-300">{siteUrl}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Stock source</p><p className="mt-0.5 text-sm font-medium text-slate-200">Autonexus inventory</p></div>
      </div>

      <section className="studio-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-slate-100">DoneDeal sync</h2>
            <p className="mt-1 text-sm text-slate-400">Planned integration, subject to DoneDeal API or feed access. Saving a seller URL does not import stock.</p>
          </div>
          <span className="text-xs text-amber-300">Not connected</span>
        </div>
      </section>

      <section className="studio-surface p-5">
        <h2 className="font-medium text-slate-100">Site settings</h2>
        <WebsiteForm values={values} />
      </section>
    </div>
  );
}
