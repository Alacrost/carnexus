import Link from "next/link";
import { crmContext } from "@/lib/crm-server";
import { TaskQueue,type TaskRow } from "./task-queue";
export default async function TasksPage(){
  const ctx=await crmContext();if(ctx.error||!ctx.permissions.includes("read"))return <p role="alert">{ctx.error??"No CRM access."}</p>;
  let tasks:TaskRow[]=[];let leads:{id:string;title:string}[]=[];
  if(ctx.supabase){const [{data:t,error},{data:l}]=await Promise.all([ctx.supabase.from("crm_tasks").select("id,title,type,priority,status,due_at,version,lead_id").eq("dealer_id",ctx.session.dealer.id).order("due_at"),ctx.supabase.from("leads").select("id,title").eq("dealer_id",ctx.session.dealer.id).order("updated_at",{ascending:false}).limit(250)]);if(error)return <p role="alert">Tasks could not load.</p>;leads=l??[];const labels=new Map(leads.map(x=>[x.id,x.title]));tasks=(t??[]).map(x=>({...x,leadTitle:x.lead_id?labels.get(x.lead_id)??"Lead":"Linked record"})) as TaskRow[]}
  return <div className="space-y-5"><div><div className="flex items-center justify-between gap-4"><Link href="/leads" className="text-sm text-sky-300">← Leads</Link>{ctx.permissions.includes("report") && <Link href="/leads/export?type=tasks" className="text-sm text-sky-300">Export CSV</Link>}</div><p className="mt-4 text-xs uppercase tracking-[0.2em] text-sky-400/80">Daily work</p><h1 className="text-3xl font-semibold text-gradient">Tasks</h1><p className="mt-1 text-sm text-slate-400">Overdue work first, then today and upcoming follow-ups.</p></div><TaskQueue tasks={tasks} leads={leads}/></div>;
}
