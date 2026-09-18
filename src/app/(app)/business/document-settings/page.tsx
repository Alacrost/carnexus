import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { DocumentSettingsForm } from "./settings-form";
export default async function DocumentSettingsPage(){
  const session=await requireSession();
  if(!["owner","admin"].includes(session.role))return <p>Only owner/admin can configure company documents.</p>;
  let values:Record<string,string>={legal_name:session.dealer.name};
  if(!isDemoMode()){
    const db=await createClient();const {data,error}=await db.from("document_settings").select("legal_name,address,vat_number,company_number,phone,email,bank_details,agreement_terms,invoice_notes").eq("dealer_id",session.dealer.id).maybeSingle();
    if(error)return <p role="alert">Document settings could not load. Apply the commercial migration and retry.</p>;
    if(data)values=data;
  }
  return <div><Link href="/business/deals" className="text-sm text-sky-300">← Deals</Link><h1 className="mt-3 text-3xl font-semibold text-gradient">Company documents</h1><p className="mt-2 text-sm text-slate-400">Company details, agreement terms and invoice instructions are frozen into each issued document. {isDemoMode()?"Preview — changes are not saved.":""}</p><DocumentSettingsForm values={values}/></div>;
}
