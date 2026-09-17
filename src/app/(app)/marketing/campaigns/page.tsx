import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoPromotions, demoCampaignTemplates } from "@/lib/demo";
import { can } from "@/lib/types";
import {
  CampaignComposer,
  type VehicleOption,
  type CampaignTemplate,
} from "./campaign-composer";

export default async function CampaignsPage() {
  const session = await requireSession();

  if (!can.useMarketing(session.role)) {
    return (
      <div>
        <Link
          href="/marketing"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeftIcon size={14} /> Marketing
        </Link>
        <p className="mt-6 text-sm text-slate-400">
          Your role does not include the marketing module.
        </p>
      </div>
    );
  }

  let vehicles: VehicleOption[];
  let promotions: { id: string; title: string }[];
  let templates: CampaignTemplate[];
  let credits = 200;

  if (isDemoMode()) {
    vehicles = demoVehicles
      .filter((v) => v.status !== "sold")
      .map((v) => ({
        id: v.id,
        label: `${v.year} ${v.make} ${v.model}`,
        price: v.sale_price,
        coverUrl: null,
        coverPath: null,
      }));
    promotions = demoPromotions
      .filter((p) => p.status === "active")
      .map((p) => ({ id: p.id, title: p.title }));
    templates = demoCampaignTemplates;
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: p }, { data: dealer }, { data: t }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, make, model, year, sale_price")
        .eq("dealer_id", session.dealer.id)
        .neq("status", "sold")
        .order("created_at", { ascending: false }),
      supabase
        .from("promotions")
        .select("id, title")
        .eq("dealer_id", session.dealer.id)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("dealers")
        .select("ai_credits")
        .eq("id", session.dealer.id)
        .maybeSingle(),
      supabase
        .from("campaign_templates")
        .select("id, name, config")
        .eq("dealer_id", session.dealer.id)
        .order("created_at", { ascending: false }),
    ]);

    const vlist = v ?? [];
    // Cover photo per vehicle, signed for preview + AI editing.
    const covers = new Map<string, { path: string; url: string | null }>();
    if (vlist.length) {
      const { data: photos } = await supabase
        .from("vehicle_photos")
        .select("vehicle_id, storage_path, is_cover")
        .in(
          "vehicle_id",
          vlist.map((x) => x.id)
        )
        .eq("is_cover", true);
      const paths = (photos ?? []).map((ph) => ph.storage_path);
      const signed = paths.length
        ? (await supabase.storage.from("vehicle-photos").createSignedUrls(paths, 3600))
            .data ?? []
        : [];
      (photos ?? []).forEach((ph, i) => {
        covers.set(ph.vehicle_id, {
          path: ph.storage_path,
          url: signed[i]?.signedUrl ?? null,
        });
      });
    }

    vehicles = vlist.map((x) => ({
      id: x.id,
      label: `${x.year} ${x.make} ${x.model}`,
      price: x.sale_price,
      coverUrl: covers.get(x.id)?.url ?? null,
      coverPath: covers.get(x.id)?.path ?? null,
    }));
    promotions = (p ?? []).map((x) => ({ id: x.id, title: x.title }));
    credits = dealer?.ai_credits ?? 0;
    templates = (t ?? []) as CampaignTemplate[];
  }

  return (
    <div>
      <Link
        href="/marketing"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Marketing
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">
        Campaign Composer
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        One car → ready-to-post text and sized images for every channel. We plan it with you,
        suggest angles, then you confirm before anything is generated.
      </p>

      <div className="mt-6">
        <CampaignComposer
          vehicles={vehicles}
          promotions={promotions}
          templates={templates}
          dealerName={session.dealer.name.replace(" (Preview)", "")}
          credits={credits}
        />
      </div>
    </div>
  );
}
