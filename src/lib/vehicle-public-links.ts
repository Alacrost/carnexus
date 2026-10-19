export function publicVehicleUrl(origin: string, path: string | null): string | null {
  if (!path || !/^\/s\/[a-z0-9-]+\/car\/[0-9a-f-]{36}$/i.test(path)) return null;
  try {
    const base = new URL(origin);
    if (base.protocol !== "https:" || !base.hostname || base.username || base.password) return null;
    if (base.hostname === "localhost" || base.hostname.endsWith(".localhost") || base.hostname === "127.0.0.1") return null;
    return new URL(path, base.origin).toString();
  } catch { return null; }
}

export function doneDealVehicleUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "donedeal.ie" && !host.endsWith(".donedeal.ie"))) return null;
    if (url.username || url.password || url.pathname === "/" || /^\/dealer(?:\/|$)/i.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}
