import Link from "next/link";
import {notFound} from "next/navigation";
import {requireSession} from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import {commercialPermission} from "@/lib/commercial-server";
import {isDemoMode,demoSalesDeals,demoVehicles} from "@/lib/demo";
import {money} from "@/lib/currency";
import {PriceEditor,FinancePanel} from "../commercial-panels";
import {DealTermsEditor,type WarrantyChoice} from "../deal-terms-editor";
import {InternalNotesForm} from "./internal-notes-form";

export default async function EditDealPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const session=await requireSession();
  const [canWork,canPrice]=await Promise.all([commercialPermission("work"),commercialPermission("price")]);
  if(!canWork)return <p>No access to edit this Deal.</p>;
  let deal:{notes:string|null;deal_no:string;status:string;version:number;retail_price:number;quote_terms:string|null;deal_comments:string|null;finance_terms:string|null;warranty_name:string|null;finance_company:string|null;finance_reference:string|null;finance_expected:number;finance_status:string;finance_address:string|null;invoice_to_finance:boolean}|null=null;
  let warranties:WarrantyChoice[]=[];let financeCompanies:{id:string;name:string;invoice_address:string}[]=[];
  let windowPrice:number|null=null;
  if(isDemoMode() && !/^[0-9a-f-]{36}$/i.test(id)){
    const row=demoSalesDeals.find(d=>d.id===id);if(!row)notFound();
    deal={notes:null,deal_no:row.deal_no,status:row.status,version:1,retail_price:row.retail_price??row.order.price,quote_terms:null,deal_comments:null,finance_terms:null,warranty_name:null,finance_company:null,finance_reference:null,finance_expected:0,finance_status:"none",finance_address:null,invoice_to_finance:false};
    windowPrice=demoVehicles.find(vehicle=>row.order.vehicle_label.startsWith(`${vehicle.year} ${vehicle.make} ${vehicle.model}`))?.sale_price??null;
  }else{
    const db=await createClient();const [dealResult,warrantyResult,groupResult]=await Promise.all([
      db.from("deals").select("notes,deal_no,status,version,retail_price,quote_terms,deal_comments,finance_terms,warranty_name,finance_company,finance_reference,finance_expected,finance_status,finance_address,invoice_to_finance").eq("dealer_id",session.dealer.id).eq("id",id).maybeSingle(),
      db.from("dealer_warranty_presets").select("id,name,terms").eq("dealer_id",session.dealer.id).eq("active",true).order("name"),
      db.from("contact_groups").select("id").eq("dealer_id",session.dealer.id).eq("system_key","finance_companies").maybeSingle(),
    ]);
    if(dealResult.error||warrantyResult.error||groupResult.error||!groupResult.data)return <p role="alert">Deal editing could not load. Apply migrations 073 and 075 and retry.</p>;
    deal=dealResult.data;warranties=warrantyResult.data??[];
    const {data:members,error:membersError}=await db.from("contact_group_members").select("customer_id").eq("dealer_id",session.dealer.id).eq("group_id",groupResult.data.id);
    if(membersError)return <p role="alert">Finance company contacts could not load.</p>;
    const contactIds=(members??[]).map(member=>member.customer_id);
    if(contactIds.length){
      const {data:contacts,error:contactsError}=await db.from("customers").select("id,name,type,address_line1").eq("dealer_id",session.dealer.id).is("deleted_at",null).eq("type","business").in("id",contactIds).order("name");
      if(contactsError)return <p role="alert">Finance company contacts could not load.</p>;
      financeCompanies=(contacts??[]).filter(contact=>(contact.address_line1??"").trim().length>=5).map(contact=>({id:contact.id,name:contact.name,invoice_address:contact.address_line1!}));
    }
    const {data:order}=await db.from("deal_orders").select("vehicle_id").eq("dealer_id",session.dealer.id).eq("deal_id",id).eq("kind","sale").maybeSingle();
    if(order?.vehicle_id){const {data:vehicle}=await db.from("vehicles").select("sale_price").eq("dealer_id",session.dealer.id).eq("id",order.vehicle_id).maybeSingle();windowPrice=vehicle?.sale_price??null;}
  }
  if(!deal)notFound();const closed=["completed","cancelled","reversed"].includes(deal.status);
  return <div className="mx-auto max-w-4xl space-y-4"><Link href={`/business/deals/${id}`} className="text-sm text-slate-400 hover:text-white">← Deal {deal.deal_no}</Link><div className="border-b border-white/10 pb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Deal {deal.deal_no} · edit</p><h1 className="mt-1 text-3xl font-semibold text-slate-100">Edit Deal</h1><p className="mt-2 text-sm text-slate-400">Adjust customer price, quotation wording, warranty and invoice recipient before issuing the final invoice.</p></div>
    {closed?<p className="studio-surface p-5 text-sm text-amber-200">This Deal is closed. Issued documents are immutable; use the correction flow on the Deal page.</p>:<>
      <section className="studio-surface p-5"><h2 className="text-base font-semibold text-slate-100">Selling price</h2><p className="mt-1 text-xs text-slate-400">Lowering the selling price creates a discount against the vehicle window price. Record a reason for audit.</p><div className="mt-3 flex flex-wrap gap-8 border-y border-white/10 py-3"><p className="text-xs text-slate-400">Window price<span className="block text-lg font-semibold tabular-nums text-slate-200">{windowPrice==null?"Not set":money(windowPrice,"EUR")}</span></p><p className="text-xs text-slate-400">Customer selling price<span className="block text-lg font-semibold tabular-nums text-white">{money(deal.retail_price,"EUR")}</span></p><p className="text-xs text-slate-400">Discount<span className="block text-lg font-semibold tabular-nums text-emerald-300">{windowPrice==null?"—":money(Math.max(windowPrice-deal.retail_price,0),"EUR")}</span></p></div>{canPrice?<PriceEditor id={id} version={deal.version} price={deal.retail_price}/>:<p className="mt-3 text-xs text-amber-300">Your role cannot change the selling price.</p>}</section>
      <InternalNotesForm dealId={id} version={deal.version} notes={deal.notes??""}/>
      <DealTermsEditor dealId={id} version={deal.version} quoteTerms={deal.quote_terms??""} notes={deal.deal_comments??""} financeTerms={deal.finance_terms??""} warrantyName={deal.warranty_name} warranties={warranties}/>
      <div><FinancePanel id={id} values={deal} closed={false} companies={financeCompanies}/><Link href="/business/customers/groups" className="mt-2 inline-block text-xs text-sky-300">Manage finance company contacts →</Link></div>
      <section className="studio-surface p-5"><h2 className="text-base font-semibold text-slate-100">Trade-in</h2><p className="mt-1 text-sm text-slate-400">Add the part-exchange vehicle and lender settlement on the Deal page. The balance updates there.</p><Link href={`/business/deals/${id}#trade-in`} className="mt-3 inline-block border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">Open trade-in →</Link></section>
    </>}
  </div>;
}
