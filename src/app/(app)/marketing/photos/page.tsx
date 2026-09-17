import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoBackgrounds } from "@/lib/demo";
import { can } from "@/lib/types";
import { OverlayStudio, type Pattern, type VehicleOption } from "./overlay-studio";
import type { PatternItem, PatternFrame, BackgroundTemplate } from "./actions";

export default async function PhotosPage() {
  const session = await requireSession();

  if (!can.useMarketing(session.role)) {
    return (
      <p className="text-sm text-slate-400">
        Your role does not include the marketing module.
      </p>
    );
  }

  // Demo mode keeps the local-only editor (patterns in the browser).
  const demo = isDemoMode();
  let patterns: Pattern[] = [];
  let vehicles: VehicleOption[] = [];
  let credits = 200;
  let backgrounds: BackgroundTemplate[] = [];

  if (demo) {
    vehicles = demoVehicles
      .filter((v) => v.status !== "sold")
      .map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}` }));
    backgrounds = demoBackgrounds;
  } else {
    const supabase = await createClient();
    const [{ data }, { data: v }, { data: dealer }, { data: bg }] = await Promise.all([
      supabase
        .from("overlay_patterns")
        .select("id, name, items, frame")
        .eq("dealer_id", session.dealer.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vehicles")
        .select("id, make, model, year")
        .eq("dealer_id", session.dealer.id)
        .neq("status", "sold")
        .order("created_at", { ascending: false }),
      supabase
        .from("dealers")
        .select("ai_credits")
        .eq("id", session.dealer.id)
        .maybeSingle(),
      supabase
        .from("background_templates")
        .select("id, name, prompt")
        .eq("dealer_id", session.dealer.id)
        .order("created_at", { ascending: false }),
    ]);
    backgrounds = (bg ?? []) as BackgroundTemplate[];

    const rows = (data ?? []) as {
      id: string;
      name: string;
      items: PatternItem[];
      frame: PatternFrame | null;
    }[];
    const paths = rows.flatMap((r) => r.items.map((i) => i.path));
    const signed = paths.length
      ? (await supabase.storage.from("brand-assets").createSignedUrls(paths, 3600)).data ?? []
      : [];
    const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

    patterns = rows.map((r) => ({
      id: r.id,
      name: r.name,
      frame: r.frame ?? null,
      items: r.items.map((it) => ({
        id: crypto.randomUUID(),
        src: urlByPath.get(it.path) ?? "",
        path: it.path,
        ratio: it.ratio,
        xPct: it.xPct,
        yPct: it.yPct,
        widthPct: it.widthPct,
        opacity: it.opacity,
      })),
    }));

    vehicles = (v ?? []).map((x) => ({
      id: x.id,
      label: `${x.year} ${x.make} ${x.model}`,
    }));
    credits = dealer?.ai_credits ?? 0;
  }

  return (
    <div className="-mx-6 -my-6 lg:-mx-8 lg:-my-8">
      <OverlayStudio
        dealerId={demo ? null : session.dealer.id}
        initialPatterns={patterns}
        vehicles={vehicles}
        credits={credits}
        canSetCover={can.manageVehicles(session.role)}
        backgrounds={backgrounds}
      />
    </div>
  );
}
