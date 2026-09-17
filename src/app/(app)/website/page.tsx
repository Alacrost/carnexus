import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoWebsiteSettings, demoVehicles } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { WebsiteForm } from "./website-form";
import { syncFromDoneDeal } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(iso: string | null) {
  if (!iso) return "never";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}

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
          <p className="mt-1 text-sm text-slate-400">A public car-listing site, served live from your stock and refreshed hourly.</p>
        </div>
        <Link href={siteUrl} target="_blank" className="btn-gradient text-sm">View public site ↗</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p><p className={`mt-0.5 text-base font-semibold ${values.enabled ? "text-emerald-300" : "text-slate-400"}`}>{values.enabled ? "Published" : "Draft"}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Cars live</p><p className="mt-0.5 text-base font-semibold text-slate-100">{carCount}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Public URL</p><p className="mt-0.5 truncate text-sm font-medium text-sky-300">{siteUrl}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Last synced</p><p className="mt-0.5 text-sm font-medium text-slate-200">{fmt(values.last_synced_at)}</p></div>
      </div>

      <section className="studio-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-slate-100">DoneDeal sync</h2>
            <p className="mt-1 text-sm text-slate-400">Your stock is served live and revalidated hourly. Pull the latest from DoneDeal on demand.</p>
          </div>
          <form action={syncFromDoneDeal}><button type="submit" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 hover:border-white/25">Sync now</button></form>
        </div>
      </section>

      <section className="studio-surface p-5">
        <h2 className="font-medium text-slate-100">Site settings</h2>
        <WebsiteForm values={values} />
      </section>
    </div>
  );
}
