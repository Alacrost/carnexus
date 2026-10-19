import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { vehicleReference } from "@/components/entity-link";

export type PendingKind="asking_price"|"missing_po"|"po_details"|"vendor_payment"|"finance_payment";
export interface PendingAction {
  id:string;kind:PendingKind;title:string;detail:string;
  vehicleId:string|null;vehicleNo:string|null;plate:string|null;
  poId:string|null;poNo:string|null;amount:number|null;href:string;actionLabel:string;
}
export interface PendingResult {items:PendingAction[];error:boolean}

interface VehicleRow {id:string;vehicle_no:number|null;make:string;model:string;year:number;registration:string|null;sale_price:number|null;status:string;originating_po_id:string|null}
interface PayableRow {id:string;po_no:string;status:string;source:string;vehicle_id:string|null;car:string|null;vendor:string;vendor_outstanding:number|null;finance_outstanding:number|null;amount_known:boolean;purchase_date:string|null;received_on:string|null;inv_ref:string|null}

export async function getPendingActions(dealerId:string,canPurchase:boolean,canEditVehicle:boolean):Promise<PendingResult>{
  if(isDemoMode())return {items:[],error:false};
  const db=await createClient();
  const vehicles:VehicleRow[]=[];
  for(let start=0;;start+=500){
    const {data,error}=await db.from("vehicles")
      .select("id,vehicle_no,make,model,year,registration,sale_price,status,originating_po_id")
      .eq("dealer_id",dealerId).order("id").range(start,start+499);
    if(error)return {items:[],error:true};
    vehicles.push(...((data??[]) as VehicleRow[]));
    if((data??[]).length<500)break;
  }
  let payables:PayableRow[]=[];
  if(canPurchase){
    const {data,error}=await db.rpc("purchase_balances",{p_dealer:dealerId});
    if(error)return {items:[],error:true};
    payables=(data??[]) as PayableRow[];
  }
  const activePoByVehicle=new Map(payables.filter(po=>po.vehicle_id&&po.status!=="cancelled").map(po=>[po.vehicle_id!,po]));
  const activePoIds=new Set(payables.filter(po=>po.status!=="cancelled").map(po=>po.id));
  const vehicleById=new Map(vehicles.map(vehicle=>[vehicle.id,vehicle]));
  const items:PendingAction[]=[];
  for(const vehicle of vehicles){
    const label=`${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const vehicleNo=vehicleReference(vehicle.vehicle_no);
    const base={vehicleId:vehicle.id,vehicleNo,plate:vehicle.registration,poId:null,poNo:null,amount:null};
    if(vehicle.status!=="sold"&&(vehicle.sale_price===null||Number(vehicle.sale_price)<=0)){
      items.push({...base,id:`${vehicle.id}:asking`,kind:"asking_price",title:`Asking price missing · ${label}`,detail:canEditVehicle?"Set the window/asking price in the car's Selling prices editor.":"Ask a stock manager to set the window/asking price.",href:`/inventory/${vehicle.id}`,actionLabel:canEditVehicle?"Set asking price":"Review car"});
    }
    if(!vehicle.originating_po_id||(canPurchase&&!activePoIds.has(vehicle.originating_po_id))){
      const existing=activePoByVehicle.get(vehicle.id);
      items.push({...base,id:`${vehicle.id}:po`,kind:"missing_po",title:`Purchase order pending · ${label}`,
        detail:vehicle.originating_po_id?"The originating PO is cancelled or unavailable. Review the car's acquisition before invoicing.":existing?"A PO exists, but it is not verified as this car's originating PO. Review the acquisition before invoicing.":"Create the acquisition PO. Deals may be opened, but final invoicing is blocked until this is resolved.",
        poId:existing?.id??null,poNo:existing?.po_no??null,href:vehicle.originating_po_id?`/inventory/${vehicle.id}`:existing?`/business/purchases/${existing.id}`:canPurchase?`/business/purchases/new?vehicleId=${vehicle.id}`:`/inventory/${vehicle.id}`,
        actionLabel:vehicle.originating_po_id?"Review car":existing?"Review PO":canPurchase?"Create PO":"Ask purchasing team"});
    }
  }
  for(const po of payables){
    if(po.status==="cancelled"||!po.vehicle_id)continue;
    const vehicle=po.vehicle_id?vehicleById.get(po.vehicle_id):null;
    const base={vehicleId:po.vehicle_id,vehicleNo:vehicle?vehicleReference(vehicle.vehicle_no):null,plate:vehicle?.registration??null,poId:po.id,poNo:po.po_no};
    if(po.source==="direct"&&(!po.inv_ref?.trim()||!po.purchase_date||!po.received_on)){
      const missing=[!po.inv_ref?.trim()?"supplier invoice reference":null,!po.purchase_date?"purchase date":null,!po.received_on?"arrival date":null].filter(Boolean).join(", ");
      items.push({...base,id:`${po.id}:details`,kind:"po_details",title:`PO details incomplete · ${po.po_no}`,detail:`Add ${missing} to the purchase order.`,amount:null,href:`/business/purchases/${po.id}#complete-intake`,actionLabel:"Complete PO"});
    }
    if(po.amount_known&&Number(po.vendor_outstanding??0)>0.005){
      items.push({...base,id:`${po.id}:vendor`,kind:"vendor_payment",title:`Vendor payment outstanding · ${po.po_no}`,detail:`${po.vendor||"Vendor"} is still owed for this car. Record each actual payment with its date and method.`,amount:Number(po.vendor_outstanding),href:`/business/purchases/${po.id}#payments`,actionLabel:po.status==="to_be_paid"?"Review & approve PO":"Record vendor payment"});
    }
    if(Number(po.finance_outstanding??0)>0.005){
      items.push({...base,id:`${po.id}:finance`,kind:"finance_payment",title:`Finance settlement outstanding · ${po.po_no}`,detail:"The existing lender balance is still pending. Record the lender payment when made.",amount:Number(po.finance_outstanding),href:`/business/purchases/${po.id}#payments`,actionLabel:po.status==="to_be_paid"?"Review & approve PO":"Record finance payment"});
    }
  }
  return {items,error:false};
}
