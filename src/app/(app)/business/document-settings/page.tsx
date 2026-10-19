import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { DocumentSettingsForm } from "./settings-form";
import { ReferenceManager, type BusinessReference } from "./reference-manager";
export default async function DocumentSettingsPage(){
  const session=await requireSession();
  if(!["owner","admin"].includes(session.role))return <p>Only owner/admin can configure company documents.</p>;
  let values:Record<string,string>={legal_name:session.dealer.name};
  let warranties:BusinessReference[]=[];let financeCompanies:BusinessReference[]=[];
  if(!isDemoMode()){
    const db=await createClient();const [{data,error},warrantyResult,financeResult]=await Promise.all([
      db.from("document_settings").select("legal_name,address,vat_number,company_number,phone,email,bank_details,agreement_terms,invoice_notes").eq("dealer_id",session.dealer.id).maybeSingle(),
      db.from("dealer_warranty_presets").select("id,name,terms,active").eq("dealer_id",session.dealer.id).order("name"),
      db.from("dealer_finance_companies").select("id,name,invoice_address,active").eq("dealer_id",session.dealer.id).order("name"),
    ]);
    if(error)return <p role="alert">Document settings could not load. Apply the commercial migration and retry.</p>;
    if(warrantyResult.error||financeResult.error)return <p role="alert">Business options could not load. Apply migration 073 and retry.</p>;
    if(data)values=data;
    warranties=(warrantyResult.data??[]).map(row=>({id:row.id,name:row.name,text:row.terms,active:row.active}));
    financeCompanies=(financeResult.data??[]).map(row=>({id:row.id,name:row.name,text:row.invoice_address,active:row.active}));
  }
  return <div><Link href="/business/deals" className="text-sm text-sky-300">← Deals</Link><h1 className="mt-3 text-3xl font-semibold text-gradient">Business document settings</h1><p className="mt-2 text-sm text-slate-400">Company details, warranty options and finance recipients are saved here. Finance companies saved here also appear in the CRM <Link href="/business/customers/groups" className="text-sky-300 hover:underline">Finance companies contact group</Link> for Edit Deal. Issued documents retain their original details. {isDemoMode()?"Preview — changes are not saved.":""}</p><DocumentSettingsForm values={values}/><div className="mt-5 grid gap-4 xl:grid-cols-2"><ReferenceManager kind="warranty" rows={warranties}/><ReferenceManager kind="finance" rows={financeCompanies}/></div></div>;
}
