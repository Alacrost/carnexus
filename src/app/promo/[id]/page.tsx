import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoPromotions } from "@/lib/demo";

interface PublicPromo {
  title: string;
  brief: string | null;
  starts_on: string | null;
  ends_on: string | null;
  offer_details: string | null;
  included: string | null;
  excluded: string | null;
  terms: string | null;
  status: string;
  dealer_id?: string;
  approved_by: string | null;
  approved_role: string | null;
  approved_at: string | null;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PublicPromoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let promo: PublicPromo | null;
  let dealerName = "Demo Motors";
  if (isDemoMode()) {
    promo = (demoPromotions.find((p) => p.id === id) as PublicPromo) ?? null;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("promotions")
      .select(
        "title, brief, starts_on, ends_on, offer_details, included, excluded, terms, status, dealer_id, approved_by, approved_role, approved_at"
      )
      .eq("id", id)
      .maybeSingle();
    promo = data as PublicPromo | null;
    if (promo?.status === "active" && promo.dealer_id) {
      const { data: dealer } = await supabase
        .rpc("public_dealer", { p_id: promo.dealer_id })
        .returns<{ id: string; name: string; slug: string }[]>()
        .maybeSingle();
      dealerName = dealer?.name ?? "";
    }
  }

  // Only active promotions are shareable.
  if (!promo || promo.status !== "active") notFound();

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      {/* Dealer wordmark */}
      {dealerName && (
        <p className="mb-6 text-center text-lg font-semibold tracking-tight text-gradient">
          {dealerName}
        </p>
      )}

      <article className="studio-surface animate-rise p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          Terms &amp; conditions
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">
          {promo.title}
        </h1>

        {promo.brief && <p className="mt-3 text-sm text-slate-400">{promo.brief}</p>}

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-slate-300">
          <span className="text-slate-500">Valid</span>
          {fmt(promo.starts_on)} <span className="text-slate-600">→</span> {fmt(promo.ends_on)}
        </div>

        {promo.offer_details && (
          <p className="mt-6 text-lg text-slate-100">{promo.offer_details}</p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {promo.included && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
              <h2 className="text-sm font-semibold text-emerald-300">What&apos;s included</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                {promo.included}
              </p>
            </div>
          )}
          {promo.excluded && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-sm font-semibold text-slate-300">What&apos;s not included</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">
                {promo.excluded}
              </p>
            </div>
          )}
        </div>

        {promo.terms && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Full terms
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
              {promo.terms}
            </p>
          </div>
        )}

        {promo.approved_by && (
          <div className="mt-8 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
            <p className="text-sm font-medium text-emerald-300">
              ✓ Terms approved &amp; signed
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {promo.approved_by}
              {promo.approved_role ? ` · ${promo.approved_role}` : ""}
              {promo.approved_at ? ` · ${fmt(promo.approved_at)}` : ""}
            </p>
          </div>
        )}

        <p className="mt-8 border-t border-white/5 pt-4 text-xs text-slate-500">
          Offer subject to availability and to the dealer&apos;s discretion. Please confirm
          details with the dealership before relying on this promotion.
        </p>
      </article>
    </main>
  );
}
