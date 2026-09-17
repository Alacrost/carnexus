import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSite } from "../../site-data";

export const revalidate = 3600;

const money = (n: number | null) => (n ? "€" + Math.round(n).toLocaleString("en-IE") : "POA");

export default async function SiteCarPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const site = await loadSite(slug);
  if (!site) notFound();
  const car = site.cars.find((c) => c.id === id);
  if (!car) notFound();
  const accent = site.settings.theme_color || "#0ea5e9";

  const specs: [string, string][] = [
    ["Year", String(car.year)],
    ["Mileage", `${car.km.toLocaleString("en-IE")} km`],
    ["Fuel", car.fuel ?? "—"],
    ["Transmission", car.transmission ?? "—"],
    ["Registration", car.registration ?? "—"],
    ["Status", car.status === "reserved" ? "Reserved" : "Available"],
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href={`/s/${slug}`} className="text-lg font-bold tracking-tight text-slate-900">{site.dealer.name}</Link>
          {site.settings.phone && <a href={`tel:${site.settings.phone}`} className="text-sm text-slate-600 hover:text-slate-900">{site.settings.phone}</a>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <Link href={`/s/${slug}`} className="text-sm text-slate-500 hover:text-slate-800">← Back to stock</Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex h-72 items-center justify-center overflow-hidden rounded-2xl border border-slate-200" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}05)` }}>
            <span className="text-6xl font-black tracking-tight text-slate-900/10">{car.make}</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">{car.year}</p>
            <h1 className="text-2xl font-bold text-slate-900">{car.make} {car.model}</h1>
            <p className="mt-3 text-3xl font-bold" style={{ color: accent }}>{money(car.price)}</p>
            <div className="mt-5 flex flex-col gap-2">
              {site.settings.whatsapp && (
                <a href={`https://wa.me/${site.settings.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hi, I'm interested in the ${car.year} ${car.make} ${car.model}`)}`} className="rounded-full px-5 py-3 text-center text-sm font-medium text-white" style={{ background: accent }}>Enquire on WhatsApp</a>
              )}
              {site.settings.phone && <a href={`tel:${site.settings.phone}`} className="rounded-full border border-slate-300 px-5 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">Call {site.settings.phone}</a>}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Specification</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
    </div>
  );
}
