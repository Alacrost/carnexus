import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles } from "@/lib/demo";
import { can } from "@/lib/types";
import { InventoryTable, type VehicleRow } from "./inventory-table";

export default async function InventoryPage() {
  const session = await requireSession();
  const canManage = can.manageVehicles(session.role);

  let vehicles: VehicleRow[];
  if (isDemoMode()) {
    vehicles = demoVehicles.map((vehicle, index) => ({ ...vehicle, vehicle_no: index + 1 })) as VehicleRow[];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vehicles")
      .select("id, vehicle_no, make, model, year, km, fuel, transmission, sale_price, status, registration, stock_class, originating_po_id, provenance_status")
      .eq("dealer_id", session.dealer.id)
      .neq("status","returned_to_customer")
      .order("created_at", { ascending: false });
    vehicles = (data ?? []) as VehicleRow[];
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
            Stock
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-slate-400">{vehicles.length} vehicle(s)</p>
        </div>
        {canManage && (
          <Link
            href="/business/purchases/new"
            className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:-translate-y-0.5 hover:brightness-110"
          >
            + Acquire vehicle
          </Link>
        )}
      </div>

      <div className="mt-5 mb-4"><Link href="/inventory/preparation" className="text-sm text-sky-300">Open preparation queue →</Link></div>
      <p className="mb-4 max-w-3xl text-xs text-slate-500">Vehicles enter stock only through a Purchase Order or trade-in. “Legacy review” means this older record has no single evidenced originating PO and has not been assigned invented purchase data.</p>
      <InventoryTable vehicles={vehicles} canManage={canManage} />
    </div>
  );
}
