"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SiteCar } from "./site-data";

const money = (n: number | null) => (n ? "€" + Math.round(n).toLocaleString("en-IE") : "POA");

// Caches the car list in localStorage so a return visit paints instantly, and provides
// client-side search. (Cookies are capped at ~4KB, so the full list lives in localStorage.)
export function SiteGrid({ slug, cars, accent }: { slug: string; cars: SiteCar[]; accent: string }) {
  const [list, setList] = useState<SiteCar[]>(cars);
  const [q, setQ] = useState("");

  useEffect(() => {
    try {
      if (cars.length) {
        localStorage.setItem(`autonexus_site_${slug}`, JSON.stringify({ at: Date.now(), cars }));
        setList(cars);
      } else {
        const cached = localStorage.getItem(`autonexus_site_${slug}`);
        if (cached) setList((JSON.parse(cached).cars as SiteCar[]) ?? []);
      }
    } catch {
      /* storage unavailable */
    }
  }, [slug, cars]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => `${c.make} ${c.model} ${c.year} ${c.fuel ?? ""}`.toLowerCase().includes(s));
  }, [list, q]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-slate-900">{list.length} cars in stock</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search make, model…"
          className="w-56 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-slate-400"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <Link key={c.id} href={`/s/${slug}/car/${c.id}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <div className="relative flex h-44 items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}05)` }}>
              <span className="text-5xl font-black tracking-tight text-slate-900/10">{c.make}</span>
              {c.status === "reserved" && <span className="absolute right-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">Reserved</span>}
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500">{c.year} · {c.km.toLocaleString("en-IE")} km{c.fuel ? ` · ${c.fuel}` : ""}</p>
              <h3 className="mt-0.5 font-semibold text-slate-900">{c.make} {c.model}</h3>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-bold" style={{ color: accent }}>{money(c.price)}</span>
                <span className="text-sm font-medium text-slate-400 transition group-hover:text-slate-700">View →</span>
              </div>
            </div>
          </Link>
        ))}
        {visible.length === 0 && <p className="col-span-full py-12 text-center text-slate-500">No cars match your search.</p>}
      </div>
    </div>
  );
}
