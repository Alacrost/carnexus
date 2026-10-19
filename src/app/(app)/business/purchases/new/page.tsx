import { requireSession } from "@/lib/auth";
import { commercialPermission } from "@/lib/commercial-server";
import { hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { PurchaseForm } from "./purchase-form";
import { isDemoMode, demoVehicles } from "@/lib/demo";
import {demoEntityId} from "@/lib/demo-ids";
import { notFound } from "next/navigation";
import {createSalesClient} from "@/lib/sales-client";

export default async function NewPurchasePage({searchParams}:{searchParams:Promise<{vehicleId?:string}>}) {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!(await commercialPermission("purchase"))) {
    return <p className="text-sm text-slate-400">Your role does not include purchases.</p>;
  }
  const {vehicleId}=await searchParams;
  const taxDb=await createSalesClient();const taxResult=await taxDb.rpc("financial_tax_settings",{p_dealer:session.dealer.id});
  const taxSettings=taxResult.data as {defaultVatScheme:string;standardVatRate:number}|null;
  let existingVehicle:{id:string;make:string;model:string;year:number;registration:string;km:number;originating_po_id:string|null;status:string}|null=null;
  if(vehicleId){
    const canonicalVehicleId=isDemoMode()&&demoVehicles.some(vehicle=>vehicle.id===vehicleId)?demoEntityId(vehicleId)!:vehicleId;
    const {data,error}=await taxDb.from("vehicles").select("id,make,model,year,registration,km,originating_po_id,status").eq("dealer_id",session.dealer.id).eq("id",canonicalVehicleId).maybeSingle();
    if(error)return <p role="alert">The selected vehicle could not load. Retry before creating its purchase.</p>;
    if(!data)notFound();
    existingVehicle=data;
  }
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">New purchase</h1>
      <p className="mt-1 text-sm text-slate-400">{existingVehicle?"Record the acquisition for this existing vehicle. Its vehicle record will be kept; a new PO will be linked to it.":"Buy a vehicle from a vendor — creates the PO and adds the car to stock."}</p>
      {existingVehicle?.originating_po_id&&<p role="alert" className="mt-4 border border-amber-700/40 p-3 text-sm text-amber-800">This vehicle already has a purchase order. Open its current PO instead.</p>}
      <div className="mt-6">
        {taxResult.error||!taxSettings?<p role="alert" className="text-sm text-rose-300">Financial tax defaults could not load. Check the financial settings and database update before creating this purchase.</p>:(!existingVehicle||!existingVehicle.originating_po_id)&&<PurchaseForm existingVehicle={existingVehicle} taxSettings={taxSettings}/>}
      </div>
    </div>
  );
}
