import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { PreparationBoard,type PrepRow,type TeamMember } from "./preparation-board";

export default async function PreparationPage(){
  const session=await requireSession();
  if(isDemoMode())return <div className="space-y-4"><Header/><p className="studio-surface p-5 text-sm text-amber-200">Preview only. Connect Supabase to operate the preparation queue.</p><PreparationBoard rows={[]} team={[]} canManageTeam={false}/></div>;
  const db=await createClient();
  const allowed=await db.rpc("preparation_allowed",{p_dealer:session.dealer.id});
  if(allowed.error||allowed.data!==true)return <p className="text-sm text-slate-400">You are not assigned to the preparation team.</p>;
  const [{data:preps,error:prepError},{data:items,error:itemError},{data:vehicles,error:vehicleError},{data:members,error:memberError},{data:teamRows,error:teamError}]=await Promise.all([
    db.from("vehicle_preparations").select("id,vehicle_id,status,version,assigned_to").eq("dealer_id",session.dealer.id).order("updated_at",{ascending:false}),
    db.from("preparation_items").select("id,preparation_id,category,title,status,required,notes,position").eq("dealer_id",session.dealer.id).order("position"),
    db.from("vehicles").select("id,vehicle_no,make,model,year,registration").eq("dealer_id",session.dealer.id),
    db.from("dealer_members").select("user_id,status").eq("dealer_id",session.dealer.id).eq("status","active"),
    db.from("preparation_team_members").select("user_id").eq("dealer_id",session.dealer.id),
  ]);
  if(prepError||itemError||vehicleError||memberError||teamError)return <p role="alert">Preparation data could not load.</p>;
  const ids=(members??[]).map(member=>member.user_id);const {data:profiles}=ids.length?await db.from("profiles").select("id,full_name").in("id",ids):{data:[] as {id:string;full_name:string|null}[]};
  const names=new Map((profiles??[]).map(profile=>[profile.id,profile.full_name??"Team member"]));const enabled=new Set((teamRows??[]).map(row=>row.user_id));
  const team:TeamMember[]=(members??[]).map(member=>({id:member.user_id,name:names.get(member.user_id)??"Team member",enabled:enabled.has(member.user_id)}));
  const cars=new Map((vehicles??[]).map(vehicle=>[vehicle.id,vehicle]));
  const rows:PrepRow[]=(preps??[]).map(prep=>{const car=cars.get(prep.vehicle_id);return {id:prep.id,vehicleId:prep.vehicle_id,vehicleNo:car?.vehicle_no??null,label:car?`${car.year} ${car.make} ${car.model}`:"Vehicle",registration:car?.registration??null,status:prep.status,version:prep.version,assignedTo:prep.assigned_to,assignee:prep.assigned_to?names.get(prep.assigned_to)??null:null,items:(items??[]).filter(item=>item.preparation_id===prep.id).map(item=>({id:item.id,category:item.category,title:item.title,status:item.status,required:item.required,notes:item.notes}))};});
  return <div className="space-y-5"><Header/><div className="flex gap-6 text-sm"><span className="text-slate-400"><strong className="text-slate-100">{rows.filter(r=>r.status!=="completed").length}</strong> pending</span><span className="text-slate-400"><strong className="text-emerald-300">{rows.filter(r=>r.status==="completed").length}</strong> completed</span></div><PreparationBoard rows={rows} team={team} canManageTeam={["owner","admin"].includes(session.role)}/></div>;
}
function Header(){return <div><Link href="/inventory" className="text-sm text-sky-300">← Inventory</Link><p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Workshop flow</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Vehicle preparation</h1><p className="mt-1 max-w-2xl text-sm text-slate-400">See what is pending, who owns it and exactly what has been completed before a car becomes ready for sale.</p></div>}
