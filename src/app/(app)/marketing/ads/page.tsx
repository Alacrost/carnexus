import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoAdScripts, demoPromotions } from "@/lib/demo";
import { AdGenerator } from "./ad-generator";

export default async function AdsPage() {
  const session = await requireSession();

  let vehicles, scripts, promotions;
  if (isDemoMode()) {
    vehicles = demoVehicles;
    scripts = demoAdScripts;
    promotions = demoPromotions.filter((p) => p.status === "active");
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: s }, { data: p }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, make, model, year")
        .eq("dealer_id", session.dealer.id)
        .neq("status", "sold")
        .order("created_at", { ascending: false }),
      supabase
        .from("ad_scripts")
        .select("id, name")
        .eq("dealer_id", session.dealer.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("promotions")
        .select("id, title")
        .eq("dealer_id", session.dealer.id)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
    ]);
    vehicles = v ?? [];
    scripts = s ?? [];
    promotions = p ?? [];
  }

  const options = vehicles.map((v) => ({
    id: v.id,
    label: `${v.year} ${v.make} ${v.model}`,
  }));
  const scriptOptions = scripts.map((s) => ({ id: s.id, name: s.name }));
  const promoOptions = promotions.map((p) => ({ id: p.id, title: p.title }));

  return (
    <div>
      <Link
        href="/marketing"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Marketing
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">Ad Creator</h1>
      <p className="mt-1 text-sm text-slate-400">
        Per-channel ad copy with your standard blocks. Pick a saved{" "}
        <Link href="/marketing/scripts" className="text-sky-400 hover:text-sky-300">
          script
        </Link>{" "}
        to control the description layout. Photo enhancement joins this screen next.
      </p>

      <div className="mt-6">
        <AdGenerator vehicles={options} scripts={scriptOptions} promotions={promoOptions} />
      </div>
    </div>
  );
}
