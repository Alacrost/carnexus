import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoBrandKit, demoTemplates } from "@/lib/demo";
import { BrandKitForm } from "./brand-kit-form";
import { BlocksManager } from "./blocks-manager";

export default async function BrandKitPage() {
  const session = await requireSession();

  let kit, templates;
  if (isDemoMode()) {
    kit = demoBrandKit;
    templates = demoTemplates;
  } else {
    const supabase = await createClient();
    const [{ data: bk }, { data: tpl }] = await Promise.all([
      supabase
        .from("brand_kits")
        .select("*")
        .eq("dealer_id", session.dealer.id)
        .maybeSingle(),
      supabase
        .from("description_templates")
        .select("id, name, kind, body, is_default")
        .eq("dealer_id", session.dealer.id)
        .order("position"),
    ]);
    kit = bk;
    templates = tpl ?? [];
  }

  return (
    <div>
      <Link
        href="/marketing"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Marketing
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">Brand Kit</h1>
      <p className="mt-1 text-sm text-slate-400">
        Your identity applied to every photo, ad and post.
      </p>

      <div className="mt-6">
        <BrandKitForm
          initial={{
            tone_of_voice: kit?.tone_of_voice ?? "professional and friendly",
            website_url: kit?.website_url ?? "",
            primary_color: kit?.primary_color ?? "#0ea5e9",
            logo_position: kit?.logo_position ?? "bottom_right",
            logo_size_pct: kit?.logo_size_pct ?? 12,
            logo_opacity_pct: kit?.logo_opacity_pct ?? 90,
            frame_style: kit?.frame_style ?? "none",
          }}
        />
      </div>

      <h2 className="mt-8 font-medium">Standard description blocks</h2>
      <p className="mt-1 text-sm text-slate-400">
        Appended automatically to every generated ad.
      </p>
      <div className="mt-3">
        <BlocksManager blocks={templates ?? []} demo={isDemoMode()} />
      </div>
    </div>
  );
}
