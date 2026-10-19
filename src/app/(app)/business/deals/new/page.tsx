import { commercialPermission } from "@/lib/commercial-server";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import { isDemoMode } from "@/lib/demo";
import { demoEntityId } from "@/lib/demo-ids";
import { can } from "@/lib/types";
import {DealSheet} from "../deal-sheet";
import {type Opt,type VehicleOpt,type QuotePrefill} from "./deal-sheet";
import type { CustomerMatch } from "../../customers/actions";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; leadId?: string; quoteId?:string; draft?:string }>;
}) {
  const session = await requireSession();
  if (!can.manageDeals(session.role) || !(await commercialPermission("work"))) {
    return <p className="text-sm text-slate-400">Your role does not include the sales process.</p>;
  }
  const canEditPrice = await commercialPermission("price");
  const assignmentClient = await createClient();
  const assignmentPermission = await assignmentClient.rpc("commercial_allowed", { p_dealer_id: session.dealer.id, p_permission: "assign" });
  const canAssign = !assignmentPermission.error && assignmentPermission.data === true;
  const { vehicleId: vehicleParam, leadId: leadParam, quoteId: requestedQuoteId, draft } = await searchParams;
  const preVehicleId=isDemoMode()?demoEntityId(vehicleParam):vehicleParam;
  const requestedLeadId=isDemoMode()?demoEntityId(leadParam):leadParam;
  let initialLeadId = "", initialSource = "";
  let initialCustomer: CustomerMatch | undefined;
  let initialQuote:QuotePrefill|undefined;

  let vehicles: VehicleOpt[] = [];
  let leads: Opt[] = [];
  let staff: Opt[] = [];
  let locations: Opt[]=[];
  let warranties:{id:string;name:string;terms:string}[]=[];

  {
    const supabase = await createClient();
    const [{ data: v }, { data: l }, { data: members }] = await Promise.all([
      supabase.from("vehicles").select("id, make, model, year, km, registration, sale_price, fuel").eq("dealer_id", session.dealer.id).not("status","in","(sold,returned_to_customer)").order("created_at", { ascending: false }),
      supabase.from("leads").select("id, title").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("dealer_members").select("role, user_id").eq("dealer_id", session.dealer.id).eq("status", "active").in("role", ["owner", "admin", "sales"]),
    ]);
    vehicles = (v ?? []).map((x) => ({ id: x.id, label: `${x.year} ${x.make} ${x.model}`, price: x.sale_price == null ? undefined : Number(x.sale_price), make: x.make, model: x.model, year: x.year, km: x.km, registration: x.registration, fuel:x.fuel }));
    const {data:displayDetails}=await supabase.from("vehicle_details").select("vehicle_id,body_style,colour").eq("dealer_id",session.dealer.id).in("vehicle_id",vehicles.map(vehicle=>vehicle.id));
    const displayByVehicle=new Map((displayDetails??[]).map(details=>[details.vehicle_id,details]));
    vehicles=vehicles.map(vehicle=>({...vehicle,body:displayByVehicle.get(vehicle.id)?.body_style??null,colour:displayByVehicle.get(vehicle.id)?.colour??null}));
    leads = (l ?? []).map((x) => ({ id: x.id, label: x.title ?? "Lead" }));
    if (requestedLeadId && /^[0-9a-f-]{36}$/i.test(requestedLeadId)) {
      const { data: selected, error } = await supabase.from("leads").select("id,title,source,customer_id").eq("dealer_id",session.dealer.id).eq("id",requestedLeadId).maybeSingle();
      if (error || !selected) return <p role="alert">The selected lead could not be loaded. Return to the lead and retry.</p>;
      initialLeadId = selected.id; initialSource = selected.source;
      if (!leads.some(l => l.id === selected.id)) leads.unshift({id:selected.id,label:selected.title});
      if (selected.customer_id) {
        const customer = await supabase.from("customers").select("id,name,type,phone,email").eq("dealer_id",session.dealer.id).eq("id",selected.customer_id).is("deleted_at",null).maybeSingle();
        if (customer.error || !customer.data) return <p role="alert">The lead contact is unavailable. Resolve the contact before creating a deal.</p>;
        initialCustomer = customer.data;
      }
    }
    const ids = (members ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    staff = (members ?? []).map((m) => ({ id: m.user_id, label: nameById.get(m.user_id) ?? "Team member" }));
    if (!staff.some((s) => s.id === session.userId)) staff.unshift({ id: session.userId, label: "You" });
    const {data:locationRows}=await supabase.from("dealer_locations").select("id,name").eq("dealer_id",session.dealer.id).eq("active",true).order("is_primary",{ascending:false}).order("name");
    locations=(locationRows??[]).map(location=>({id:location.id,label:location.name}));
    const warrantyResult=await supabase.from("dealer_warranty_presets").select("id,name,terms").eq("dealer_id",session.dealer.id).eq("active",true).order("name");
    if(warrantyResult.error)return <p role="alert">Deal options could not load. Apply migration 073 and retry.</p>;
    warranties=warrantyResult.data??[];
    if(requestedQuoteId){
      if(!/^[0-9a-f-]{36}$/i.test(requestedQuoteId))return <p role="alert">Invalid quote reference.</p>;
      const {data:quote,error}=await supabase.from("sales_quotes").select("id,quote_no,status,valid_until,customer_id,vehicle_id,salesperson_id,location_id,lead_id,source,sale_price,vat_scheme,price_reason,snapshot").eq("dealer_id",session.dealer.id).eq("id",requestedQuoteId).maybeSingle();
      if(error||!quote)return <p role="alert">Quote not found. Apply migration 074 and retry.</p>;
      if(quote.status!=="open"||quote.valid_until<new Date().toISOString().slice(0,10))return <p role="alert">This quote is no longer open. Open it from the Quotes list to review its status.</p>;
      if(!vehicles.some(vehicle=>vehicle.id===quote.vehicle_id))return <p role="alert">This quote&apos;s car is no longer available for a new Deal.</p>;
      const customer=await supabase.from("customers").select("id,name,type,phone,email").eq("dealer_id",session.dealer.id).eq("id",quote.customer_id).is("deleted_at",null).maybeSingle();
      if(customer.error||!customer.data)return <p role="alert">The quote customer is unavailable.</p>;
      initialCustomer=customer.data;
      const snapshot=quote.snapshot as {quote_terms?:string|null;deal_comments?:string|null;finance_terms?:string|null;warranty?:{name:string}|null};
      initialQuote={id:quote.id,number:quote.quote_no,validUntil:quote.valid_until,customerId:quote.customer_id,vehicleId:quote.vehicle_id,
        salespersonId:staff.some(person=>person.id===quote.salesperson_id)?quote.salesperson_id:session.userId,
        locationId:quote.location_id??"",leadId:quote.lead_id??"",source:quote.source??"",
        salePrice:Number(quote.sale_price),vatScheme:quote.vat_scheme,priceReason:quote.price_reason??"",
        quoteTerms:snapshot.quote_terms??"",notes:snapshot.deal_comments??"",financeTerms:snapshot.finance_terms??"",
        warrantyId:warranties.find(warranty=>warranty.name===snapshot.warranty?.name)?.id??"",
      };
      initialLeadId=initialQuote.leadId;initialSource=initialQuote.source;
      if(initialLeadId&&!leads.some(lead=>lead.id===initialLeadId))leads.unshift({id:initialLeadId,label:`Linked lead ${initialLeadId.slice(0,8)}`});
    }
  }

  {
    const db=await createClient();
    const taxes=await Promise.all(vehicles.map(v=>db.rpc("vehicle_purchase_tax",{p_dealer:session.dealer.id,p_vehicle:v.id})));
    if(taxes.some(result=>result.error))return <p role="alert">Purchase tax profiles could not load. Check the financial database update before opening this Deal.</p>;
    vehicles=vehicles.map((v,index)=>{const tax=taxes[index].data as {scheme:string;vatRate:number;imported:boolean;vrtAmount:number;vrtVatTreatment:"included"|"excluded"}|null;return {...v,vatScheme:tax?.scheme??null,vatRate:tax?.vatRate,imported:tax?.imported,vrtAmount:tax?.vrtAmount,vrtVatTreatment:tax?.vrtVatTreatment};});
  }
  const initialVehicleId = initialQuote?.vehicleId??(preVehicleId && vehicles.some((v) => v.id === preVehicleId) ? preVehicleId : vehicles[0]?.id ?? "");

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Deal</h1>
      <p className="mt-1 text-sm text-slate-400">Walk through the sale — customer, source, then the car and deposit.</p>
      {isDemoMode()&&<p className="mt-3 border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-950">Local demo · customers, Deals and documents are saved on this computer only. Test data — not connected to real sales.</p>}
      <div className="mt-6">
        <DealSheet
          key={`${session.dealer.id}:${session.userId}:${vehicleParam??""}:${leadParam??""}:${requestedQuoteId??""}:${draft??""}`}
          recoveryScope={`${isDemoMode()?"local-demo:":"remote:"}${session.dealer.id}:${session.userId}`}
          vehicles={vehicles}
          canEditPrice={canEditPrice}
          canAssign={canAssign}
          lockVehicle={Boolean(preVehicleId||initialQuote)}
          leads={leads}
          staff={staff}
          locations={locations}
          initialVehicleId={initialVehicleId}
          defaultSalespersonId={session.userId}
          initialLeadId={initialLeadId}
          initialSource={initialSource}
          initialCustomer={initialCustomer}
          warranties={warranties}
          initialQuote={initialQuote}
        />
      </div>
    </div>
  );
}
