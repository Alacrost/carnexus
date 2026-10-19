import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoVehicles, demoWebsiteSettings } from "@/lib/demo";
import { vehicleReference } from "@/components/entity-link";
import { VehiclePrintDocument } from "./vehicle-print-document";
import "./print.css";

export default async function VehiclePrintPage({params}:{params:Promise<{id:string;kind:string}>}) {
  const {id,kind}=await params;
  if(!["window-sign","asset-tag","label"].includes(kind))notFound();
  const session=await requireSession();
  let vehicle:{id:string;vehicle_no:number|null;make:string;model:string;year:number;km:number;registration:string|null;fuel:string;transmission:string;sale_price:number|null;status:string;stock_class:string;website_visible:boolean;donedeal_ad_id:string|null}|null=null;
  let detail:{trim?:string|null;co2_g_km?:number|null;service_history?:string|null}|null=null;
  let contact:{phone?:string|null;email?:string|null;enabled?:boolean}|null=null;
  if(isDemoMode()) {
    const index=demoVehicles.findIndex(item=>item.id===id);
    if(index>=0){const item=demoVehicles[index];vehicle={...item,vehicle_no:index+1,registration:item.registration??null,stock_class:item.stock_class??"main",website_visible:true,donedeal_ad_id:null};}
    contact=demoWebsiteSettings;
  } else {
    const db=await createClient();
    const [{data:car},{data:spec},{data:settings}]=await Promise.all([
      db.from("vehicles").select("id,vehicle_no,make,model,year,km,registration,fuel,transmission,sale_price,status,stock_class,website_visible,donedeal_ad_id").eq("dealer_id",session.dealer.id).eq("id",id).maybeSingle(),
      db.from("vehicle_details").select("trim,co2_g_km,service_history").eq("dealer_id",session.dealer.id).eq("vehicle_id",id).maybeSingle(),
      db.from("website_settings").select("phone,email,enabled").eq("dealer_id",session.dealer.id).maybeSingle(),
    ]);
    vehicle=car;detail=spec;contact=settings;
  }
  if(!vehicle)notFound();
  const reference=vehicleReference(vehicle.vehicle_no)??"Vehicle";
  const sitePath=contact?.enabled&&vehicle.website_visible&&vehicle.stock_class==="main"&&["ready_for_sale","reserved"].includes(vehicle.status)?`/s/${session.dealer.slug}/car/${id}`:null;
  return <VehiclePrintDocument kind={kind as "window-sign"|"asset-tag"|"label"} vehicleId={id} vehicle={vehicle} reference={reference} dealerName={session.dealer.name} contact={contact} detail={detail} sitePath={sitePath} doneDealAdId={vehicle.donedeal_ad_id}/>;
}
