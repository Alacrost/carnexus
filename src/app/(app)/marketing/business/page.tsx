import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoBusinessProfile } from "@/lib/demo";
import { can } from "@/lib/types";
import { BusinessForm, type BusinessValues } from "./business-form";

const empty: BusinessValues = {
  opening_hours: "",
  warranty_info: "",
  whats_included: "",
  extra_services: "",
  phone: "",
  whatsapp: "",
  email: "",
  website_url: "",
  social_links: "",
  finance_available: false,
  finance_details: "",
};

export default async function BusinessSetupPage() {
  const session = await requireSession();
  const canEdit = can.useMarketing(session.role);

  let profile: Partial<BusinessValues> | null;
  if (isDemoMode()) {
    profile = demoBusinessProfile;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("dealer_id", session.dealer.id)
      .maybeSingle();
    profile = data;
  }

  const initial: BusinessValues = { ...empty, ...(profile ?? {}) };

  return (
    <div>
      <Link
        href="/marketing"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Marketing
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">
        Business Setup
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Tell Autonexus about your dealership once. The AI uses these details in every
        ad and description it writes — so your warranty, finance, opening hours and
        contact channels are always correct and on-brand.
      </p>

      <div className="mt-8">
        {canEdit ? (
          <BusinessForm initial={initial} />
        ) : (
          <p className="studio-surface p-5 text-sm text-slate-400">
            Only owners, admins and agency users can edit the business setup.
          </p>
        )}
      </div>
    </div>
  );
}
