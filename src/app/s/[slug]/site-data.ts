import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoSession, demoWebsiteSettings, demoVehicles } from "@/lib/demo";

export interface SiteCar {
  id: string;
  make: string;
  model: string;
  year: number;
  km: number;
  price: number | null;
  registration: string | null;
  fuel: string | null;
  transmission: string | null;
  status: string;
}

export interface SiteData {
  dealer: { name: string; slug: string };
  settings: {
    headline: string | null;
    subheadline: string | null;
    about: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    theme_color: string | null;
    last_synced_at: string | null;
  };
  cars: SiteCar[];
}

// Loads a dealer's public site by slug. Returns null if the site is disabled / not found.
export async function loadSite(slug: string): Promise<SiteData | null> {
  if (isDemoMode()) {
    if (slug !== demoSession.dealer.slug) return null;
    const cars = demoVehicles
      .filter((v) => (v.stock_class ?? "main") === "main" && ["ready_for_sale", "reserved"].includes(v.status))
      .map((v) => ({ id: v.id, make: v.make, model: v.model, year: v.year, km: v.km, price: v.sale_price, registration: v.registration ?? null, fuel: v.fuel ?? null, transmission: v.transmission ?? null, status: v.status }));
    return { dealer: { name: demoSession.dealer.name, slug: demoSession.dealer.slug }, settings: demoWebsiteSettings, cars };
  }

  const supabase = await createClient();
  const { data: dealer } = await supabase.rpc("public_dealer", { p_slug: slug }).returns<{ id: string; name: string; slug: string }[]>().maybeSingle();
  if (!dealer) return null;
  const { data: settings } = await supabase.from("website_settings").select("enabled, headline, subheadline, about, phone, whatsapp, email, theme_color, last_synced_at").eq("dealer_id", dealer.id).maybeSingle();
  if (!settings || !settings.enabled) return null;
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, make, model, year, km, sale_price, registration, fuel, transmission, status")
    .eq("dealer_id", dealer.id)
    .eq("stock_class", "main")
    .eq("website_visible", true)
    .in("status", ["ready_for_sale", "reserved"])
    .order("created_at", { ascending: false });
  const cars = (vehicles ?? []).map((v) => ({ id: v.id, make: v.make, model: v.model, year: v.year, km: v.km, price: v.sale_price, registration: v.registration, fuel: v.fuel, transmission: v.transmission, status: v.status }));
  return { dealer: { name: dealer.name, slug: dealer.slug }, settings, cars };
}
