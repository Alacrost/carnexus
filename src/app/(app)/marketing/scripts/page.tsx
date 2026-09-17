import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoAdScripts } from "@/lib/demo";
import { can } from "@/lib/types";
import { ScriptsManager, type Script } from "./scripts-manager";

export default async function ScriptsPage() {
  const session = await requireSession();

  if (!can.useMarketing(session.role)) {
    return (
      <p className="text-sm text-slate-400">
        Your role does not include the marketing module.
      </p>
    );
  }

  let scripts: Script[];
  if (isDemoMode()) {
    scripts = demoAdScripts;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ad_scripts")
      .select("id, name, channel, body")
      .eq("dealer_id", session.dealer.id)
      .order("created_at", { ascending: false });
    scripts = data ?? [];
  }

  return (
    <div>
      <Link
        href="/marketing"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Marketing
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">Ad Scripts</h1>
      <p className="mt-1 text-sm text-slate-400">
        Reusable description templates the AI follows when writing ads. Save your
        preferred generic layout once, then pick it in the Ad Creator.
      </p>

      <div className="mt-6">
        <ScriptsManager scripts={scripts} demo={isDemoMode()} />
      </div>
    </div>
  );
}
