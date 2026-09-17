import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadSite } from "./site-data";
import { SiteGrid } from "./site-grid";

// Refresh from the dealer's stock hourly (synced from DoneDeal in a later integration).
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  return { title: site ? `${site.dealer.name} — Used Cars` : "Dealer website" };
}

export default async function DealerSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) notFound();
  const accent = site.settings.theme_color || "#0ea5e9";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="text-lg font-bold tracking-tight text-slate-900">{site.dealer.name}</span>
          <div className="flex items-center gap-3 text-sm">
            {site.settings.phone && <a href={`tel:${site.settings.phone}`} className="text-slate-600 hover:text-slate-900">{site.settings.phone}</a>}
            {site.settings.whatsapp && (
              <a href={`https://wa.me/${site.settings.whatsapp.replace(/[^0-9]/g, "")}`} className="rounded-full px-3 py-1.5 font-medium text-white" style={{ background: accent }}>WhatsApp</a>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{site.settings.headline || "Quality used cars"}</h1>
          {site.settings.subheadline && <p className="mt-3 max-w-xl text-lg text-slate-600">{site.settings.subheadline}</p>}
          <a href="#stock" className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-medium text-white" style={{ background: accent }}>Browse stock →</a>
        </div>
      </section>

      {/* Stock */}
      <main id="stock" className="mx-auto max-w-6xl px-5 py-12">
        <SiteGrid slug={slug} cars={site.cars} accent={accent} />
      </main>

      {/* About */}
      {site.settings.about && (
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-5 py-12">
            <h2 className="text-xl font-semibold text-slate-900">About us</h2>
            <p className="mt-3 text-slate-600">{site.settings.about}</p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {site.dealer.name}</span>
          <span className="flex gap-4">
            {site.settings.phone && <a href={`tel:${site.settings.phone}`} className="hover:text-slate-800">{site.settings.phone}</a>}
            {site.settings.email && <a href={`mailto:${site.settings.email}`} className="hover:text-slate-800">{site.settings.email}</a>}
          </span>
          <span className="text-slate-400">Powered by <Link href="/" className="hover:text-slate-700">Autonexus</Link></span>
        </div>
      </footer>
    </div>
  );
}
