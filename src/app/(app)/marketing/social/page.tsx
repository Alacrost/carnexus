import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isDemoMode,
  demoVehicles,
  demoPromotions,
  demoScheduledContent,
} from "@/lib/demo";
import { can } from "@/lib/types";
import {
  SocialStudio,
  type SocialVehicleOpt,
  type SocialPromoOpt,
  type ScheduledItem,
} from "./social-studio";

export default async function SocialPage() {
  const session = await requireSession();

  if (!can.useMarketing(session.role)) {
    return (
      <p className="text-sm text-slate-400">
        Your role does not include the marketing module.
      </p>
    );
  }

  let vehicles: SocialVehicleOpt[] = [];
  let promotions: SocialPromoOpt[] = [];
  let items: ScheduledItem[] = [];
  const demo = isDemoMode();

  if (demo) {
    vehicles = demoVehicles
      .filter((v) => v.status !== "sold")
      .map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}` }));
    promotions = demoPromotions.map((p) => ({
      id: p.id,
      title: p.title,
      starts_on: p.starts_on ?? null,
      ends_on: p.ends_on ?? null,
    }));
    items = demoScheduledContent;
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: p }, { data: c }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, make, model, year")
        .eq("dealer_id", session.dealer.id)
        .neq("status", "sold")
        .order("created_at", { ascending: false }),
      supabase
        .from("promotions")
        .select("id, title, starts_on, ends_on")
        .eq("dealer_id", session.dealer.id)
        .eq("status", "active"),
      supabase
        .from("scheduled_content")
        .select("id, channel, kind, status, scheduled_for, body, hashtags, vehicle_id, promotion_id")
        .eq("dealer_id", session.dealer.id)
        .order("scheduled_for", { ascending: true }),
    ]);
    vehicles = (v ?? []).map((x) => ({ id: x.id, label: `${x.year} ${x.make} ${x.model}` }));
    promotions = (p ?? []) as SocialPromoOpt[];
    items = (c ?? []) as ScheduledItem[];
  }

  return (
    <div className="-mx-6 -my-6 lg:-mx-8 lg:-my-8">
      <SocialStudio
        vehicles={vehicles}
        promotions={promotions}
        initialItems={items}
        demo={demo}
      />
    </div>
  );
}
