import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { commercialPermission } from "@/lib/commercial-server";
import { hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { PurchasesList, type PurchaseRow } from "./purchases-list";
import { vehicleReference } from "@/components/entity-link";

export default async function PurchasesPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!(await commercialPermission("purchase"))) {
    return <p className="text-sm text-slate-400">Your role does not include purchases.</p>;
  }

  let rows: PurchaseRow[] = [];

  {
    const supabase = await createClient();
    const {data,error}=await supabase.rpc("purchase_balances",{p_dealer:session.dealer.id});
    if(error)return <p role="alert">Purchase balances could not load. Check the connection and commercial migrations.</p>;
    rows=(data??[]) as PurchaseRow[];
    const vehicleIds = rows.map((row) => row.vehicle_id).filter(Boolean) as string[];
    if (vehicleIds.length) {
      const { data: vehicles,error:vehicleError } = await supabase.from("vehicles").select("id,vehicle_no,registration").eq("dealer_id", session.dealer.id).in("id", vehicleIds);
      if(vehicleError)return <p role="alert">Purchase vehicles could not load. Retry before opening the purchase.</p>;
      const numbers = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicleReference(vehicle.vehicle_no)]));
      const registrations = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle.registration]));
      rows = rows.map((row) => ({ ...row, vehicle_reference: row.vehicle_id ? numbers.get(row.vehicle_id) ?? null : null, vehicle_registration: row.vehicle_id ? registrations.get(row.vehicle_id) ?? null : null }));
    }
  }

  return <PurchasesList rows={rows} />;
}
