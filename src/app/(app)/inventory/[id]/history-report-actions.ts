"use server";

import {z} from "zod";
import {requireSession} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {isDemoMode} from "@/lib/demo";

const status=z.enum(["unknown","no","yes"]);
const historySchema=z.object({vehicleId:z.string().uuid(),source:z.enum(["dealer_declaration","customer_declaration","vehicle_report"]),reportReference:z.string().max(120),reportedOn:z.union([z.literal(""),z.iso.date()]),notes:z.string().max(2000),accident:status,writeOff:status,stolen:status,mileageDiscrepancy:status});
export type VehicleHistoryInput=z.infer<typeof historySchema>;

export async function recordVehicleHistoryReport(input:VehicleHistoryInput):Promise<{id?:string;error?:string}>{
  const parsed=historySchema.safeParse(input);
  if(!parsed.success)return{error:"Review the source, date and vehicle history findings."};
  if(isDemoMode())return{error:"Preview only — connect Supabase to save."};
  const session=await requireSession();const db=await createClient();
  const {vehicleId,...history}=parsed.data;
  const {data,error}=await db.rpc("record_vehicle_history_report",{p_dealer:session.dealer.id,p_vehicle:vehicleId,p_data:history});
  return error?{error:error.message}:{id:data as string};
}
