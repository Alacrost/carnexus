import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoPromotions } from "@/lib/demo";
import { can } from "@/lib/types";
import { PromotionsManager, type PromotionRow } from "./promotions-manager";

export default async function PromotionsPage() {
  const session = await requireSession();
  const canEdit = can.useMarketing(session.role);

  let promotions: PromotionRow[];
  if (isDemoMode()) {
    promotions = demoPromotions as PromotionRow[];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("promotions")
      .select(
        "id, title, kind, brief, offer_details, included, excluded, starts_on, ends_on, terms, status, submitted_for_approval, approved_by, approved_role, approved_at"
      )
      .eq("dealer_id", session.dealer.id)
      .order("created_at", { ascending: false });
    promotions = (data ?? []) as PromotionRow[];
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
        Promotions &amp; Events
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Spin up a seasonal sale or event. The AI drafts campaign angles and ready-to-edit
        terms &amp; conditions from your brief and business setup. Set one live to get a
        shareable public page for socials and your website.
      </p>

      <div className="mt-8">
        {canEdit ? (
          <PromotionsManager promotions={promotions} canApprove={can.approvePromotions(session.role)} />
        ) : (
          <p className="studio-surface p-5 text-sm text-slate-400">
            Only owners, admins and agency users can manage promotions.
          </p>
        )}
      </div>
    </div>
  );
}
