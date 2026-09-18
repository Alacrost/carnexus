"use server";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { revalidatePath } from "next/cache";
export async function saveVehicleDetails(_state:{error?:string;saved?:boolean},form:FormData):Promise<{error?:string;saved?:boolean}>{
  const session=await requireSession();
  if(!["owner","admin"].includes(session.role))return {error:"Only stock managers can edit vehicle details."};
  if(isDemoMode())return {error:"Preview only — connect Supabase to save vehicle details."};
  const id=String(form.get("vehicle_id"));
  if(!/^[0-9a-f-]{36}$/i.test(id))return {error:"Invalid vehicle."};
  const db=await createClient();
  const {error}=await db.rpc("save_vehicle_details",{p_dealer:session.dealer.id,p_vehicle:id,p_kind:form.get("kind"),p_data:{...Object.fromEntries(form),equipment:form.getAll("equipment"),has_logbook:form.get("has_logbook")==="on"}});
  if(error)return {error:"Could not save. Check dates, mileage, keys and required service details. No partial change was saved."};
  revalidatePath(`/inventory/${id}`);return {saved:true};
}
