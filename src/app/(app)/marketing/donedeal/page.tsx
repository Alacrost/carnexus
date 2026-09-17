import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoAdScripts, demoTemplates } from "@/lib/demo";
import { can } from "@/lib/types";
import {
  DoneDealStudio,
  type DdScript,
  type DdBlock,
  type DdVehicle,
} from "./donedeal-studio";

export default async function DoneDealPage() {
  const session = await requireSession();

  if (!can.useMarketing(session.role)) {
    return (
      <p className="text-sm text-slate-400">
        Your role does not include the marketing module.
      </p>
    );
  }

  let vehicles: DdVehicle[] = [];
  let scripts: DdScript[] = [];
  let blocks: DdBlock[] = [];

  if (isDemoMode()) {
    vehicles = demoVehicles
      .filter((v) => v.status !== "sold")
      .map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}` }));
    scripts = demoAdScripts.map((s) => ({
      id: s.id,
      name: s.name,
      body: s.body,
      vehicle_type: null,
    }));
    blocks = demoTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      body: t.body,
      is_default: t.is_default,
    }));
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: s }, { data: b }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, make, model, year")
        .eq("dealer_id", session.dealer.id)
        .neq("status", "sold")
        .order("created_at", { ascending: false }),
      supabase
        .from("ad_scripts")
        .select("id, name, body, vehicle_type")
        .eq("dealer_id", session.dealer.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("description_templates")
        .select("id, name, body, is_default")
        .eq("dealer_id", session.dealer.id)
        .order("position"),
    ]);
    vehicles = (v ?? []).map((x) => ({
      id: x.id,
      label: `${x.year} ${x.make} ${x.model}`,
    }));
    scripts = (s ?? []) as DdScript[];
    blocks = (b ?? []) as DdBlock[];
  }

  return (
    <div className="-mx-6 -my-6 lg:-mx-8 lg:-my-8">
      <DoneDealStudio vehicles={vehicles} scripts={scripts} blocks={blocks} />
    </div>
  );
}
