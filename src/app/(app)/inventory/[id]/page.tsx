import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoViewings } from "@/lib/demo";
import { can } from "@/lib/types";
import { PhotosUploader, type Photo } from "./photos-uploader";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${m}`;
}

const statusLabels: Record<string, string> = {
  bought: "Bought",
  preparation: "Preparation",
  ready_for_sale: "Ready for Sale",
  reserved: "Reserved",
  sold: "Sold",
};

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const canManage = can.manageVehicles(session.role);
  const canDeals = can.manageDeals(session.role);
  const demo = isDemoMode();

  let vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    km: number;
    fuel: string;
    transmission: string;
    sale_price: number | null;
    status: string;
    registration?: string | null;
  } | null = null;
  let photos: Photo[] = [];

  if (demo) {
    vehicle = (demoVehicles.find((v) => v.id === id) as unknown as typeof vehicle) ?? null;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vehicles")
      .select("id, make, model, year, km, fuel, transmission, sale_price, status, registration")
      .eq("dealer_id", session.dealer.id)
      .eq("id", id)
      .maybeSingle();
    vehicle = data;

    if (vehicle) {
      const { data: rows } = await supabase
        .from("vehicle_photos")
        .select("id, storage_path, is_cover")
        .eq("dealer_id", session.dealer.id)
        .eq("vehicle_id", id)
        .order("position", { ascending: true });

      const paths = (rows ?? []).map((r) => r.storage_path);
      const signed = paths.length
        ? (await supabase.storage.from("vehicle-photos").createSignedUrls(paths, 3600)).data ?? []
        : [];
      const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
      photos = (rows ?? []).map((r) => ({
        id: r.id,
        url: urlByPath.get(r.storage_path) ?? "",
        is_cover: r.is_cover,
      }));
    }
  }

  if (!vehicle) notFound();

  // Upcoming viewings for this car (demo data only — viewings are not persisted yet).
  const upcomingViewings = demo
    ? demoViewings.filter((v) => v.vehicle_id === id)
    : [];

  // Open deal on this car.
  let openDeal: { id: string; deal_no: string; status: string; customer: string } | null = null;
  let buyingPo: { id: string; po_no: string; status: string } | null = null;
  if (canDeals && !demo) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("deal_orders")
      .select("deal:deals(id, deal_no, status, customer:customers(name))")
      .eq("dealer_id", session.dealer.id)
      .eq("vehicle_id", id)
      .limit(1);
    const row = (data?.[0] as { deal?: { id: string; deal_no: string; status: string; customer?: { name?: string } } } | undefined)?.deal;
    if (row && !["completed", "cancelled"].includes(row.status)) {
      openDeal = { id: row.id, deal_no: row.deal_no, status: row.status, customer: row.customer?.name ?? "—" };
    }
    // Buying info — the purchase order this car came in on (cost side).
    if (can.viewFinancials(session.role)) {
      const { data: po } = await supabase.from("purchase_orders").select("id, po_no, status").eq("dealer_id", session.dealer.id).eq("vehicle_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (po) buyingPo = po;
    }
  }

  const canSell = canDeals && !["sold"].includes(vehicle.status);

  return (
    <div>
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Inventory
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gradient">
            {vehicle.make} {vehicle.model}
          </h1>
          {vehicle.registration && (
            <span className="mt-2 inline-block rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-sm tracking-wider text-slate-200">
              {vehicle.registration}
            </span>
          )}
          <p className="mt-1 text-sm text-slate-400">
            {vehicle.year} · {vehicle.km.toLocaleString()} km ·{" "}
            {vehicle.sale_price ? `€${Number(vehicle.sale_price).toLocaleString()}` : "—"} ·{" "}
            {statusLabels[vehicle.status] ?? vehicle.status}
          </p>
        </div>
        {canSell && (
          openDeal ? (
            <Link
              href={`/business/deals/${openDeal.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/15"
            >
              Open deal · {openDeal.deal_no}
            </Link>
          ) : (
            <Link
              href={`/business/deals/new?vehicleId=${vehicle.id}`}
              className="btn-gradient inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              Sell this car →
            </Link>
          )
        )}
      </div>

      {(openDeal || upcomingViewings.length > 0 || buyingPo) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {buyingPo && (
            <div className="studio-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Buying info</p>
              <Link href={`/business/purchases/${buyingPo.id}`} className="mt-2 inline-block font-mono text-sm text-sky-400 hover:text-sky-300">{buyingPo.po_no}</Link>
              <span className="ml-2 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-400">{buyingPo.status.replace(/_/g, " ")}</span>
            </div>
          )}
          {openDeal && (
            <div className="studio-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Open deal</p>
              <p className="mt-2 text-sm text-slate-100">{openDeal.deal_no} · {openDeal.customer}</p>
              <span className="mt-2 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-400">{openDeal.status}</span>
            </div>
          )}
          {upcomingViewings.length > 0 && (
            <div className="studio-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Upcoming viewings</p>
              <ul className="mt-2 space-y-1.5">
                {upcomingViewings.map((v) => (
                  <li key={v.id} className="text-sm text-slate-300">
                    <span className="text-slate-100">{v.lead_name}</span> · {fmtDateTime(v.scheduled_for)}
                    <span className="text-slate-500"> · {v.responsible}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <h2 className="mt-8 text-sm font-medium">Photos</h2>
      <div className="mt-3">
        {canManage ? (
          <PhotosUploader
            dealerId={demo ? null : session.dealer.id}
            vehicleId={vehicle.id}
            initialPhotos={photos}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.url}
                alt=""
                className="aspect-video w-full rounded-lg border border-slate-800 object-cover"
              />
            ))}
            {photos.length === 0 && (
              <p className="text-sm text-slate-500">No photos yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
