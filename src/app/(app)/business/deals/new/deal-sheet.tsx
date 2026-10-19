"use client";

import {AssignedTo} from "../assigned-to";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createDealDocument, saveDealCustomer } from "../actions";
import {useRouter,useSearchParams} from "next/navigation";
import {useSheetAutosave} from "./use-sheet-autosave";
import {terminalSheet} from "./autosave-actions";
import { searchCustomers, type CustomerMatch } from "../../customers/actions";
import {DealFinancialSummary,DealNegotiationHighlight} from "../deal-workspace";
import {DealSheetContent,DealSheetSurface} from "../deal-sheet-view";
import { TradeInWizard } from "./trade-in-wizard";
import {DealPaymentEntry} from "../deal-payment-entry";
import { tradeInEquity, type TradeInInput } from "@/lib/trade-ins";
import {calcVehicleTax} from "@/lib/deals";

export interface Opt {
  id: string;
  label: string;
}

export interface VehicleOpt extends Opt {
  vatScheme?: string | null;
  vatRate?:number;imported?:boolean;vrtAmount?:number;vrtVatTreatment?:"included"|"excluded";
  price?: number;
  make?: string;
  model?: string;
  year?: number;
  km?: number;
  registration?: string;
  fuel?:string|null;body?:string|null;colour?:string|null;
}
export interface QuotePrefill {
  id:string;number:string;validUntil:string;customerId:string;vehicleId:string;
  salespersonId:string;locationId:string;leadId:string;source:string;
  salePrice:number;vatScheme:string;priceReason:string;quoteTerms:string;notes:string;
  financeTerms:string;warrantyId:string;
}

const SOURCES = [
  ["", "—"], ["donedeal", "DoneDeal"], ["facebook", "Facebook"], ["instagram", "Instagram"],
  ["recommendation", "Recommendation"], ["walk_in", "Walk-in"], ["phone", "Phone"], ["website", "Website"], ["other", "Other"],
];
const CONSENTS = [
  ["", "Not asked"], ["consented", "Consented"], ["refused", "Refused"], ["verbal", "Verbal"],
];
const COUNTRIES = [
  ["IE", "IE - Ireland"], ["GB", "GB - United Kingdom"], ["OTHER", "Other"],
];

const STEPS = ["Contact", "Source & salesperson", "Car & deposit"];

export type DraftDealSheetProps=Parameters<typeof DealSheetForm>[0];

export function DraftDealSheet(props:DraftDealSheetProps) {
  const params=useSearchParams();
  // Native replaceState updates these params even when the server page is not rerendered.
  // In particular, a fresh link to the same /new route must not reuse the previous form.
  const entry=[params.get("draft"),params.get("vehicleId"),params.get("leadId"),params.get("quoteId")];
  return <DealSheetForm key={JSON.stringify(entry)} {...props}/>;
}

function DealSheetForm({
  recoveryScope,
  vehicles,
  leads,
  staff,
  locations,
  initialVehicleId,
  defaultSalespersonId,
  initialLeadId = "",
  initialSource = "",
  initialCustomer,
  lockVehicle = false,
  canEditPrice = false,
  canAssign = false,
  warranties,
  initialQuote,
}: {
  recoveryScope: string;
  vehicles: VehicleOpt[];
  leads: Opt[];
  staff: Opt[];
  locations:Opt[];
  initialVehicleId: string;
  defaultSalespersonId: string;
  initialLeadId?: string;
  initialSource?: string;
  initialCustomer?: CustomerMatch;
  lockVehicle?: boolean;
  canEditPrice?: boolean;
  canAssign?: boolean;
  warranties:{id:string;name:string;terms:string}[];
  initialQuote?:QuotePrefill;
}) {
  const [step, setStep] = useState(0);
  const [openingSaved,setOpeningSaved]=useState(false);
  const handoffStarted=useRef(false);
  const [editingPrice,setEditingPrice]=useState(false);
  const [priceReason,setPriceReason]=useState(initialQuote?.priceReason??"");
  const requestId=useRef<string>("");


  // Customer (CRM contact)
  const [customerId, setCustomerId] = useState<string | null>(initialQuote?.customerId??initialCustomer?.id ?? null);
  const [title, setTitle] = useState("");
  const [firstName, setFirstName] = useState(initialCustomer?.type === "business" ? "" : initialCustomer?.name ?? "");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState(initialCustomer?.type === "business" ? initialCustomer.name : "");
  const [jobTitle, setJobTitle] = useState("");
  const [dataConsent, setDataConsent] = useState("");
  const [mainPhone, setMainPhone] = useState(initialCustomer?.phone ?? "");
  const [ddiPhone, setDdiPhone] = useState("");
  const [fax, setFax] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [address, setAddress] = useState("");
  const [town, setTown] = useState("");
  const [county, setCounty] = useState("");
  const [postCode, setPostCode] = useState("");
  const [country, setCountry] = useState("IE");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const searchSeq = useRef(0);
  const customerRequestId=useRef("");
  const [customerSavedAt,setCustomerSavedAt]=useState("");

  // Source & salesperson
  const [source, setSource] = useState(initialQuote?.source??initialSource);
  const [leadId, setLeadId] = useState(initialQuote?.leadId??initialLeadId);
  const [salespersonId, setSalespersonId] = useState(initialQuote?.salespersonId??defaultSalespersonId);
  const assignedSalespersonId=canAssign?salespersonId:(initialQuote?.salespersonId??defaultSalespersonId);
  const assignedSalespersonLabel=staff.find(person=>person.id===assignedSalespersonId)?.label??"Not assigned";
  const [locationId,setLocationId]=useState(initialQuote?.locationId??locations[0]?.id??"");

  // Sale
  const [vehicleId, setVehicleId] = useState(initialQuote?.vehicleId??initialVehicleId);
  const priceFor = (id: string) => vehicles.find((v) => v.id === id)?.price ?? 0;
  const [salePrice, setSalePrice] = useState(String(initialQuote?.salePrice??(priceFor(initialVehicleId)||"")));
  const purchaseTax=vehicles.find(v=>v.id===vehicleId);
  const purchaseVatScheme = purchaseTax?.vatScheme;
  const vatScheme = purchaseVatScheme ?? "margin";
  const vehicleTax=calcVehicleTax(Number(salePrice)||0,vatScheme,purchaseTax?.vatRate??23,purchaseTax?.vrtAmount??0,purchaseTax?.vrtVatTreatment??"included");
  const [deposit, setDeposit] = useState("");
  const [depositMethod, setDepositMethod] = useState("");
  const [depositDate, setDepositDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [depositReference, setDepositReference] = useState("");
  const [depositConfirmed, setDepositConfirmed] = useState(false);
  const [deposits, setDeposits] = useState<{amount:number;method:string;paidOn?:string;reference?:string;fundsConfirmed?:boolean}[]>([]);
  const [tradeIns,setTradeIns]=useState<TradeInInput[]>([]);
  const [tradeEditorOpen,setTradeEditorOpen]=useState(false);
  const router=useRouter();
  const [notes, setNotes] = useState("");
  const [notesOpen,setNotesOpen]=useState(false);
  const [explicitAgreement,setExplicitAgreement]=useState(false);
  const [quoteTerms]=useState(initialQuote?.quoteTerms??"");const [dealComments,setDealComments]=useState(initialQuote?.notes??"");
  const [financeTerms]=useState(initialQuote?.financeTerms??"");const [warrantyId,setWarrantyId]=useState(initialQuote?.warrantyId??"");

  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [confirmTerminal,setConfirmTerminal]=useState<"remove"|"cancel"|null>(null);

  // A history entry owns its draft. Back/reload resumes it; a fresh New Deal link does not.
  const [draftToken,setDraftToken]=useState("");
  const [draftReady,setDraftReady]=useState(false);
  useEffect(()=>{
    if(!draftToken||recoveryClosed.current)return;
    const url=new URL(window.location.href);
    if(url.pathname.endsWith("/business/deals/new")&&!url.searchParams.has("draft")){
      url.searchParams.set("draft",draftToken);
      window.history.replaceState(window.history.state,"",url);
    }
  });
  useEffect(()=>{
    const url=new URL(window.location.href);
    const supplied=url.searchParams.get("draft");
    const token=supplied&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplied)?supplied:crypto.randomUUID();
    if(supplied!==token){url.searchParams.set("draft",token);window.history.replaceState(window.history.state,"",url);}
    // Hydrate this browser history entry; neither the URL nor sessionStorage exists during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftToken(token);
  },[]);
  const recoveryKey = draftToken?`autonexus:new-deal:${recoveryScope}:${initialQuote?.id??initialVehicleId}:${initialLeadId}:${initialCustomer?.id??""}:${draftToken}`:"";
  const recoverySnapshot = {step,editingPrice,priceReason,customerId,title,firstName,lastName,company,jobTitle,dataConsent,mainPhone,ddiPhone,fax,mobile,email,address,town,county,postCode,country,customerSavedAt,source,leadId,salespersonId,locationId,vehicleId,salePrice,deposit,depositMethod,depositDate,depositReference,depositConfirmed,deposits,tradeIns,notes,notesOpen,dealComments,warrantyId,explicitAgreement};
  const latestRecovery = useRef(recoverySnapshot);
  const recoveryReady=useRef(false);
  const recoveryClosed=useRef(false);
  const terminalRequest=useRef<{mode:"remove"|"cancel";requestId:string}|null>(null);
  useEffect(() => {
    latestRecovery.current = recoverySnapshot;
    if(recoveryReady.current&&!recoveryClosed.current)try{sessionStorage.setItem(recoveryKey,JSON.stringify({version:1,at:Date.now(),data:recoverySnapshot,requestId:requestId.current,customerRequestId:customerRequestId.current}));}catch{}
  });
  useEffect(() => {
    if(!recoveryKey)return;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version === 1 && saved.data && [0,1,2].includes(saved.data.step)) {
          const draft = saved.data as typeof latestRecovery.current;
          requestId.current = typeof saved.requestId === "string" ? saved.requestId : "";
          customerRequestId.current = typeof saved.customerRequestId === "string" ? saved.customerRequestId : "";
          // Browser session restoration happens once after hydration.
          /* eslint-disable react-hooks/set-state-in-effect */
          setStep(draft.step);
          setEditingPrice(draft.editingPrice);
          setPriceReason(draft.priceReason);
          setCustomerId(draft.customerId);
          setTitle(draft.title);
          setFirstName(draft.firstName);
          setLastName(draft.lastName);
          setCompany(draft.company);
          setJobTitle(draft.jobTitle);
          setDataConsent(draft.dataConsent);
          setMainPhone(draft.mainPhone);
          setDdiPhone(draft.ddiPhone);
          setFax(draft.fax);
          setMobile(draft.mobile);
          setEmail(draft.email);
          setAddress(draft.address);
          setTown(draft.town);
          setCounty(draft.county);
          setPostCode(draft.postCode);
          setCountry(draft.country);
          setCustomerSavedAt(draft.customerSavedAt);
          setSource(draft.source);
          setLeadId(draft.leadId);
          setSalespersonId(canAssign?draft.salespersonId:(initialQuote?.salespersonId??defaultSalespersonId));
          setLocationId(draft.locationId);
          setVehicleId(draft.vehicleId);
          setSalePrice(draft.salePrice);
          setDeposit(draft.deposit);
          setDepositMethod(draft.depositMethod);
          setDepositDate(draft.depositDate);
          setDepositReference(draft.depositReference);
          setDepositConfirmed(draft.depositConfirmed);
          setDeposits(draft.deposits);
          setTradeIns(draft.tradeIns);
          setNotes(draft.notes);
          setNotesOpen(draft.notesOpen);
          setDealComments(draft.dealComments);
          setWarrantyId(draft.warrantyId);
          setExplicitAgreement(draft.explicitAgreement === true);
          /* eslint-enable react-hooks/set-state-in-effect */
        }
      }
    } catch { /* A blocked or invalid browser store must not prevent a new Deal. */ }
    const retainForReload = () => {
      if(recoveryClosed.current)return;
      try { sessionStorage.setItem(recoveryKey, JSON.stringify({version:1,at:Date.now(),data:latestRecovery.current,requestId:requestId.current,customerRequestId:customerRequestId.current})); } catch { /* Storage may be unavailable. */ }
    };
    recoveryReady.current=true;
    setDraftReady(true);
    window.addEventListener("pagehide", retainForReload);
    return () => window.removeEventListener("pagehide", retainForReload);
  }, [recoveryKey,canAssign,defaultSalespersonId,initialQuote?.salespersonId]);

  const searchTerm = `${firstName} ${lastName}`.trim() || company.trim();

  // Live contact autocomplete.
  useEffect(() => {
    if (customerId) return; // already picked an existing party
    const q = searchTerm;
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    let active=true;
    const t = setTimeout(async () => {
      const res = await searchCustomers(q);
      if (active && seq === searchSeq.current) { setMatches(res); setShowMatches(true); }
    }, 220);
    return () => { clearTimeout(t); active=false; };
  }, [searchTerm, customerId]);

  const confirmedDeposits=useMemo(()=>deposits.reduce((sum,item)=>sum+(["bank","eft","cheque","draft"].includes(item.method)&&!item.fundsConfirmed?0:item.amount),0),[deposits]);
  const pendingDeposits=useMemo(()=>deposits.reduce((sum,item)=>sum+(["bank","eft","cheque","draft"].includes(item.method)&&!item.fundsConfirmed?item.amount:0),0),[deposits]);
  const tradeEquity=useMemo(()=>tradeInEquity(tradeIns),[tradeIns]);
  const balance = useMemo(() => Math.max((Number(salePrice) || 0) - tradeEquity - confirmedDeposits,0), [salePrice, tradeEquity, confirmedDeposits]);
  const eur = (n: number) => new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR"}).format(n);
  const displayDate=(value?:string)=>value?value.split("-").reverse().join("/"):"Today";
  const sv = vehicles.find((v) => v.id === vehicleId);

  const contactName = company.trim() || `${firstName} ${lastName}`.trim();
  const customerOk = contactName.length >= 2;
  const validSalePrice=Number.isFinite(Number(salePrice))&&Number(salePrice)>0;
  const validVrt=Number(purchaseTax?.vrtAmount??0)<=Number(salePrice);
  const priceChanged=validSalePrice&&sv?.price!=null&&Number(salePrice)!==sv.price;
  const saleOk = !!vehicleId && validSalePrice && validVrt && (!priceChanged || canEditPrice && priceReason.trim().length>=3);
  const autosaveBlockers=[
    !customerOk?"Enter the customer’s name in Contact.":"",
    !customerId?"Save or select the customer in Contact.":"",
    !vehicleId?"Select the vehicle for this Deal.":"",
    !validSalePrice?(canEditPrice?"Enter a customer selling price greater than zero using Edit Deal.":"A customer selling price is required. An authorized price editor must set it before this Deal can be saved."):"",
    priceChanged&&!canEditPrice?"The changed selling price requires price-editing permission.":"",
    !validVrt?"VRT is included in the selling price and cannot exceed it. Review the purchase VRT or selling price.":"",
    priceChanged&&canEditPrice&&priceReason.trim().length<3?"Enter a price change reason of at least 3 characters.":"",
  ].filter(Boolean);

  const clearIfPicked = () => undefined;

  function pickMatch(m: CustomerMatch) {
    setCustomerId(m.id);
    setShowMatches(false);
    const isBiz = m.type === "business";
    const parts = (m.name || "").trim().split(/\s+/);
    setTitle(m.title ?? "");
    setCompany(m.company ?? (isBiz ? m.name : ""));
    setFirstName(m.first_name ?? (isBiz ? "" : parts[0] ?? ""));
    setLastName(m.last_name ?? (isBiz ? "" : parts.slice(1).join(" ")));
    setJobTitle(m.job_title ?? "");
    setDataConsent(m.data_consent ?? "");
    setMainPhone(m.phone ?? "");
    setDdiPhone(m.ddi_phone ?? "");
    setFax(m.fax ?? "");
    setMobile(m.mobile ?? "");
    setEmail(m.email ?? "");
    setAddress(m.address ?? "");
    setTown(m.town ?? "");
    setCounty(m.county ?? "");
    setPostCode(m.post_code ?? "");
    setCountry(m.country ?? "IE");
  }
  function clearPick() {
    setCustomerId(null);
    setCustomerSavedAt("");
    setTitle("");setFirstName("");setLastName("");setCompany("");setJobTitle("");setDataConsent("");
    setMainPhone("");setDdiPhone("");setFax("");setMobile("");setEmail("");setAddress("");setTown("");setCounty("");setPostCode("");setCountry("IE");
    setShowMatches(false);
  }

  function continueFlow(){
    if(!draftReady)return;
    if(step!==0){setStep(step+1);return;}
    if(initialQuote){setStep(1);return;}
    setError("");
    start(async()=>{
      customerRequestId.current||=crypto.randomUUID();
      // Persist before sending: a navigation/network interruption must retry this same contact save.
      try{sessionStorage.setItem(recoveryKey,JSON.stringify({version:1,at:Date.now(),data:latestRecovery.current,requestId:requestId.current,customerRequestId:customerRequestId.current}));}catch{}
      const result=await saveDealCustomer({customerId:customerId??undefined,name:contactName,type:company.trim()?"business":"individual",title:title||undefined,
        firstName:firstName||undefined,lastName:lastName||undefined,company:company||undefined,jobTitle:jobTitle||undefined,dataConsent:dataConsent||undefined,
        phone:mainPhone||undefined,ddiPhone:ddiPhone||undefined,fax:fax||undefined,mobile:mobile||undefined,email:email||undefined,address:address||undefined,
        town:town||undefined,county:county||undefined,postCode:postCode||undefined,country:country||undefined,requestId:customerRequestId.current||=crypto.randomUUID()});
      if(result.error){setError(result.error);return;}
      latestRecovery.current={...latestRecovery.current,customerId:result.id??null,customerSavedAt:result.savedAt??new Date().toISOString(),step:1};
      try{sessionStorage.setItem(recoveryKey,JSON.stringify({version:1,at:Date.now(),data:latestRecovery.current,requestId:requestId.current,customerRequestId:""}));}catch{}
      setCustomerId(result.id??null);setCustomerSavedAt(result.savedAt??new Date().toISOString());customerRequestId.current="";setStep(1);
    });
  }

  function selectCar(id: string) {
    setVehicleId(id);
    setSalePrice(String(priceFor(id) || ""));
  }

  const hasQualifyingOpeningEntry=tradeIns.length>0||deposits.some(item=>Number.isFinite(item.amount)&&item.amount>0&&["cash","card","bank","eft","cheque","draft","finance"].includes(item.method)&&(!["bank","eft","cheque","draft"].includes(item.method)||item.fundsConfirmed)&&(!["cheque","draft"].includes(item.method)||(item.reference?.trim().length??0)>=2));
  const auto=useSheetAutosave(recoveryKey,{
    sale:{customerId:customerId??"",vehicleId,salespersonId:assignedSalespersonId,locationId,leadId,source,salePrice:Number(salePrice),vatScheme,priceReason,notes,sourceQuoteId:initialQuote?.id},
    terms:{quoteTerms,notes:dealComments,financeTerms,warrantyId},deposits,trades:tradeIns,agreement:explicitAgreement,
  },draftReady&&(step===2||hasQualifyingOpeningEntry)&&customerOk&&saleOk&&Boolean(customerId));
  useEffect(()=>{if(auto.existingDeal)router.replace(`/business/deals/${auto.existingDeal.id}`);},[auto.existingDeal,router]);
  const {dirty:sheetDirty,busy:sheetBusy,error:sheetError,stopAndDrain}=auto;
  const savedId=auto.saved?.id;
  useEffect(()=>{
    if(!savedId||step!==2||sheetDirty||sheetBusy||sheetError||pending||deposit||tradeEditorOpen||editingPrice||notesOpen||handoffStarted.current)return;
    handoffStarted.current=true;
    // Lock the entry while its acknowledged snapshot hands over to the same saved sheet.
    setOpeningSaved(true);
    void stopAndDrain().then(()=>{recoveryClosed.current=true;router.replace(`/business/deals/${savedId}`);});
  },[savedId,step,sheetDirty,sheetBusy,sheetError,stopAndDrain,pending,deposit,tradeEditorOpen,editingPrice,notesOpen,router]);
  const agreementReady=auto.saved?.status==="agreed"||auto.saved?.status==="finance";
  const savedDealLabel=auto.saved?.stage==="closing"&&agreementReady?"Closing · Agreement · car reserved":agreementReady?"Agreement · car reserved":"Vehicle Interest · car stays available";
  const agreementDocumentExpected=agreementReady||hasQualifyingOpeningEntry;
  function openDocument(){start(async()=>{
    const saved=await auto.flush();if(!saved)return;
    const kind=saved.status==="agreed"||saved.status==="finance"?"agreement":"quote";
    if(agreementDocumentExpected&&kind!=="agreement"){setError("The Agreement has not been confirmed by the saved Deal. Retry automatic saving before printing.");return;}
    if(kind==="agreement"&&saved.documentId){router.push(`/deal-doc/${saved.id}/${saved.documentId}`);return;}
    const result=await createDealDocument(saved.id,kind);
    if(result.error)setError(result.error);else if(result.id)router.push(`/deal-doc/${saved.id}/${result.id}`);
  });}
  function finish(){start(async()=>{const saved=await auto.flush();if(saved)router.push(`/business/deals/${saved.id}/finish`);});}
  function closeNegotiation(mode:"remove"|"cancel"){
    try{const stored=sessionStorage.getItem(`${recoveryKey}:terminal-request`);if(stored&&!terminalRequest.current)terminalRequest.current=JSON.parse(stored);}catch{}
    if(terminalRequest.current&&terminalRequest.current.mode!==mode){setError(`Retry ${terminalRequest.current.mode==="remove"?"Remove":"Cancel"} to confirm the interrupted request first.`);return;}
    setError("");
    start(async()=>{
      const identity=await auto.stopAndDrain();
      terminalRequest.current??={mode,requestId:crypto.randomUUID()};
      try{sessionStorage.setItem(`${recoveryKey}:terminal-request`,JSON.stringify(terminalRequest.current));}catch{}
      try{
        const result=await terminalSheet({...identity,dealId:identity.dealId??null,mode,requestId:terminalRequest.current.requestId});
        if(result.error||!result.saved){setError(result.error??"The Deal could not be closed.");if(!result.uncertain){terminalRequest.current=null;try{sessionStorage.removeItem(`${recoveryKey}:terminal-request`);}catch{}auto.resume();}return;}
        recoveryClosed.current=true;
        auto.completeTerminal();
        try{sessionStorage.removeItem(recoveryKey);}catch{}
        router.replace(mode==="cancel"&&identity.dealId?`/business/deals/${identity.dealId}`:"/business/deals");
      }catch{
        setError("Connection interrupted. Automatic saving is paused. Retry Remove or Cancel to confirm the result safely.");
      }
    });
  }

  const inp = "mt-1 studio-input";

  if(auto.terminal)return <div className="studio-surface p-6"><h2 className="text-lg font-semibold text-slate-100">This negotiation is closed</h2><p className="mt-2 text-sm text-slate-400">This browser draft will not create another Deal.</p><Link href="/business/deals" className="btn-outline mt-4 inline-block">Back to Deals</Link></div>;

  return (
    <DealSheetSurface>
      <fieldset disabled={openingSaved} aria-busy={openingSaved} className="min-w-0 border-0 p-0">
      {initialQuote&&<div className="mb-5 border-l-2 border-sky-300 bg-sky-300/[0.06] px-4 py-3 text-sm text-slate-200">Creating a Deal from quote <Link href={`/business/quotes/${initialQuote.id}`} className="font-mono font-semibold text-sky-200 underline">{initialQuote.number}</Link> · valid until {initialQuote.validUntil}. Review the price and terms before saving.</div>}
      <DealNegotiationHighlight enabled={step===2}>
      {/* Car banner — the vehicle being sold */}


      {/* Stepper header */}
      <ol aria-label="Deal steps" className="deal-stepper mb-6 flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : undefined)}
              aria-current={i === step ? "step" : undefined}
              style={{backgroundColor:i===step?"#252a25":"#eceeeb",color:i===step?"#ffffff":"#373d35",border:"1px solid",borderColor:i===step?"#252a25":"#b8bdb6"}}
              className="deal-step flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold transition-colors"
            >
              <span style={{backgroundColor:i===step?"#ffffff":"#d9ddd6",color:"#252a25"}} className="deal-step-number grid h-5 w-5 place-items-center rounded-full text-[11px]">{i + 1}</span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="text-slate-700">→</span>}
          </li>
        ))}
      </ol>

      {/* Step 1 — Contact (search or create) */}
      {step===0&&initialQuote&&<section className="border border-white/10 bg-white/[0.025] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Customer from quote</p><p className="mt-2 text-lg font-semibold text-slate-100">{contactName}</p><p className="mt-1 text-sm text-slate-400">{mainPhone||mobile||email||"Contact details in the customer record"}</p><p className="mt-3 text-xs text-slate-500">The quote remains linked to this customer. To sell to another customer, start a new Deal.</p></section>}
      {step === 0 && !initialQuote && (
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Search or create contact</h2>
            {customerId && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
                Existing contact
                <button type="button" onClick={clearPick} className="text-emerald-300/70 hover:text-white">✕</button>
              </span>
            )}
          </div>
          {customerSavedAt&&<p className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-200">Customer saved to CRM · {new Date(customerSavedAt).toLocaleString("en-IE")}. This customer can be selected automatically in a future Deal.</p>}
          <p className="mt-1 text-xs text-slate-500">Start typing a name or company — we&apos;ll find existing contacts as you go.</p>

          {/* Identity */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_80px_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="text-sm sm:col-span-2 xl:col-span-1"><span className="text-slate-300">Company name</span>
              <input value={company} onChange={(e) => { setCompany(e.target.value); clearIfPicked(); }} className={inp} placeholder="Business (leave blank for a private buyer)" autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="Mr" autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">First name</span>
              <input value={firstName} onChange={(e) => { setFirstName(e.target.value); clearIfPicked(); }} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Last name</span>
              <input value={lastName} onChange={(e) => { setLastName(e.target.value); clearIfPicked(); }} className={inp} autoComplete="off" /></label>
          </div>

          {showMatches && searchTerm.length >= 2 && !customerId && matches.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-1">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500">Existing contacts</p>
              <ul>
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => pickMatch(m)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5">
                      <span className="text-slate-100">{m.company || m.name}</span>
                      <span className="text-xs text-slate-500">{m.phone ?? m.mobile ?? m.email ?? m.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Details */}
          <div className="mt-5 grid gap-4 border-t border-white/5 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm"><span className="text-slate-300">Job title</span>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Data consent</span>
              <select value={dataConsent} onChange={(e) => setDataConsent(e.target.value)} className={inp}>
                {CONSENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm"><span className="text-slate-300">Main phone</span>
              <input value={mainPhone} onChange={(e) => setMainPhone(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">DDI phone</span>
              <input value={ddiPhone} onChange={(e) => setDdiPhone(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Fax</span>
              <input value={fax} onChange={(e) => setFax(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Mobile</span>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm sm:col-span-2"><span className="text-slate-300">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm sm:col-span-2"><span className="text-slate-300">Address</span>
              <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Town</span>
              <input value={town} onChange={(e) => setTown(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">County</span>
              <input value={county} onChange={(e) => setCounty(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Post code</span>
              <input value={postCode} onChange={(e) => setPostCode(e.target.value)} className={inp} autoComplete="off" /></label>
            <label className="text-sm"><span className="text-slate-300">Country</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className={inp}>
                {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
        </section>
      )}

      {/* Step 2 — Source & salesperson */}
      {step === 1 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Source &amp; salesperson</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm"><span className="text-slate-300">Lead source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inp}>
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <AssignedTo title="Salesperson" value={assignedSalespersonId} label={assignedSalespersonLabel} options={staff} canEdit={canAssign} onChange={setSalespersonId}/>
            <label className="text-sm"><span className="text-slate-300">Store / location</span><select value={locationId} onChange={e=>setLocationId(e.target.value)} className={inp}>{locations.map(location=><option key={location.id} value={location.id}>{location.label}</option>)}</select></label>
            {leads.length > 0 && (
              <label className="text-sm sm:col-span-2 xl:col-span-1"><span className="text-slate-300">From lead <span className="text-slate-500">(optional)</span></span>
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={inp}>
                  <option value="">—</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select></label>
            )}
          </div>
        </section>
      )}

      {/* Step 3 — Car & deposit */}
      {step === 2 && (
        <section className="space-y-5">
          {autosaveBlockers.length>0&&<div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">{auto.saved?"Changes are not saved yet":"This Deal has not been saved"}</p><ul className="mt-2 list-disc space-y-1 pl-5">{autosaveBlockers.map(message=><li key={message}>{message}</li>)}</ul><p className="mt-2">Automatic saving resumes when these fields are complete. Added payments and trade-ins are kept in this form.</p></div>}
          <DealSheetContent
            customer={{id:customerId,name:contactName,email:email.trim(),phone:mainPhone.trim()||mobile.trim(),source,status:auto.saved?savedDealLabel:auto.error||autosaveBlockers.length?"Not saved":"Deal · automatic saving",assignedTo:<AssignedTo value={assignedSalespersonId} label={assignedSalespersonLabel} options={staff} canEdit={canAssign} onChange={setSalespersonId}/>}}
            vehicle={sv?{name:[sv.year,sv.make,sv.model].filter(Boolean).join(" "),href:`/inventory/${sv.id}`,price:sv.price==null?"—":eur(sv.price),edit:(auto.saved||canEditPrice)&&<button type="button" disabled={pending||auto.busy} onClick={()=>{if(!auto.saved){setEditingPrice(value=>!value);return;}start(async()=>{const saved=await auto.flush();if(saved)router.push(`/business/deals/${saved.id}/edit`);});}} className="deal-edit-cta inline-flex rounded-xl border px-5 py-2.5 text-sm font-semibold disabled:opacity-50" style={{backgroundColor:"#243b32",color:"#fff",WebkitTextFillColor:"#fff"}}>Edit Deal</button>,fields:[{label:"Reg",value:sv.registration??"—"},{label:"Km",value:sv.km?.toLocaleString("en-IE")??"—"},{label:"Year",value:sv.year??"—"},{label:"Fuel",value:sv.fuel??"—"},{label:"Body",value:sv.body??"—"},{label:"Colour",value:sv.colour??"—"}]}:undefined}
            saleControls={<>
            {editingPrice&&canEditPrice&&<div className="mt-3 grid gap-2"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-300">Selling price</p><button type="button" onClick={()=>setEditingPrice(false)} className="text-xs font-semibold underline">Close price editor</button></div><label className="text-xs text-slate-300">New selling price (€)<input aria-label="Sale price" type="number" min="0.01" step="0.01" value={salePrice} onChange={e=>setSalePrice(e.target.value)} className="studio-input mt-1"/></label><label className="text-xs text-slate-300">Price change reason<input value={priceReason} onChange={e=>setPriceReason(e.target.value)} minLength={3} maxLength={500} className="studio-input mt-1"/></label></div>}
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {!lockVehicle&&<label className="text-sm sm:col-span-2 xl:col-span-1"><span className="text-slate-300">Select vehicle</span>
                <select disabled={lockVehicle||agreementReady||auto.busy} aria-label="Vehicle" value={vehicleId} onChange={(e) => selectCar(e.target.value)} className={inp}>
                  {vehicles.length === 0 && <option value="">No cars in stock</option>}
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select></label>}
            </div>
            </>}
            warranty={{name:warranties.find(w=>w.id===warrantyId)?.name,terms:warranties.find(w=>w.id===warrantyId)?.terms,quoteTerms,comments:dealComments,control:<label className="text-sm text-slate-200">Warranty<select value={warrantyId} onChange={e=>setWarrantyId(e.target.value)} className={inp}><option value="">No warranty selected</option>{warranties.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}}
            payments={<div className="border-t border-white/5 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Payments</h2>
            <p className="mt-1 text-xs text-slate-500">Record each payment separately. You can mix cash, card, transfer, cheque or draft on the same day.</p>
            <DealPaymentEntry amount={deposit} method={depositMethod} date={depositDate} reference={depositReference} confirmed={depositConfirmed} onAmount={setDeposit} onMethod={value=>{setDepositMethod(value);setDepositConfirmed(false);}} onDate={setDepositDate} onReference={setDepositReference} onConfirmed={setDepositConfirmed} onAdd={()=>{if(!deposit||!depositMethod)return;setDeposits(current=>[...current,{amount:Number(deposit),method:depositMethod,paidOn:depositDate||undefined,reference:depositReference||undefined,fundsConfirmed:depositConfirmed}]);setDeposit("");setDepositMethod("");setDepositDate(new Date().toISOString().slice(0,10));setDepositReference("");setDepositConfirmed(false);}} disabled={auto.busy||pending||Number(deposit)<=0||!deposit||!depositMethod||(["cheque","draft"].includes(depositMethod)&&depositReference.trim().length<2)} buttonLabel="Add this deposit payment"/>
            <button type="button" onClick={()=>setNotesOpen(!notesOpen)} aria-expanded={notesOpen} aria-controls="deal-notes" className="mt-3 block border border-slate-400/40 px-3 py-2 text-xs font-semibold text-slate-200">{notesOpen?"Hide notes":notes?"Edit notes":"Add notes"}</button>
            {deposits.length>0&&<div className="mt-3 space-y-2">{deposits.map((item,index)=><div key={`${item.method}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs"><div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"><div><span className="font-mono text-slate-300">{displayDate(item.paidOn)}</span><span className="ml-3 capitalize text-slate-300">Deposit · {item.method}</span></div><strong className="tabular-nums text-slate-100">€{item.amount.toFixed(2)}</strong></div><p className={`mt-1 break-words ${["bank","eft","cheque","draft"].includes(item.method)&&!item.fundsConfirmed?"text-amber-300":"text-emerald-300"}`}>{item.reference||"No reference"} · {["bank","eft","cheque","draft"].includes(item.method)?item.fundsConfirmed?"confirmed":"awaiting bank confirmation":"confirmed"}</p><div className="mt-2 text-right">{index<auto.recordedDeposits?<Link href={`/business/deals/${auto.saved?.id}`} className="underline">View / reverse</Link>:<button type="button" disabled={auto.busy||auto.uncertain} onClick={()=>setDeposits(current=>current.filter((_,i)=>i!==index))} className="text-xs underline">Remove unsaved entry</button>}</div></div>)}</div>}
            {notesOpen&&<div id="deal-notes" className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-sm"><span className="text-slate-300">Internal notes</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} /></label><label className="text-sm text-slate-200">Additional notes printed on documents<textarea value={dealComments} onChange={e=>setDealComments(e.target.value)} maxLength={2000} rows={2} className={inp}/></label></div>}
          </div>}
            trades={<TradeInWizard trades={tradeIns} onChange={setTradeIns} onEditingChange={setTradeEditorOpen} lockedCount={auto.recordedTrades} disabled={auto.busy||auto.uncertain} recordedHref={auto.saved?`/business/deals/${auto.saved.id}#trade-in`:undefined}/>}
            figures={<DealFinancialSummary rows={[{label:"Retail Price",value:validSalePrice?eur(Number(salePrice)):"—"},...(purchaseVatScheme?(vatScheme==="standard"?[{label:`Vehicle VAT (${vehicleTax.vatRate}%)`,value:validSalePrice?eur(vehicleTax.vat):"—"},{label:"Vehicle price excluding VAT",value:validSalePrice?eur(vehicleTax.net):"—"}]:[{label:"VAT scheme",value:vehicleTax.vatLabel}]):[{label:"VAT scheme",value:"Margin scheme · pending purchase order"}]),...(purchaseTax?.imported?[{label:"Vehicle source",value:"Imported"}]:[]),...(vehicleTax.vrtAmount>0?[{label:"VRT (included in price)",value:eur(vehicleTax.vrtAmount)}]:[]),{label:"PAX SIV",value:eur(tradeEquity)},{label:"To Change",value:validSalePrice?eur(Number(salePrice)-tradeEquity):"—"},{label:"Confirmed payments",value:eur(confirmedDeposits),accent:"text-emerald-300"},{label:"Balance To Pay",value:validSalePrice?eur(balance):"—"},...(pendingDeposits?[{label:"Awaiting clearance",value:eur(pendingDeposits),accent:"text-amber-300"}]:[])]}/>}/>


        </section>
      )}

      </DealNegotiationHighlight>
      {/* Nav */}
      <div className="mt-6 flex items-center gap-3 border-t border-white/5 pt-6">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Back</button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={continueFlow}
            disabled={!draftReady||(step === 0 && !customerOk)||pending}
            className="btn-gradient ml-auto disabled:opacity-50"
          >
            {pending&&step===0?"Saving customer…":"Continue →"}
          </button>
        ) : (<div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <p role="status" className="text-xs text-slate-500">{autosaveBlockers.length?"Not saved · complete the required fields above":auto.busy?"Saving automatically…":auto.error?"Not saved":auto.dirty?"Waiting to save…":savedDealLabel}{auto.saved&&<> · <Link href={`/business/deals/${auto.saved.id}`} className="font-mono font-semibold underline">Deal {auto.saved.number}</Link></>}</p>
          <button type="button" onClick={openDocument} disabled={!auto.saved||pending||!saleOk||Boolean(deposit)||tradeEditorOpen} className="btn-outline">{agreementDocumentExpected?"Print Agreement":"Print Quote"}</button>
          {!agreementDocumentExpected&&<button type="button" onClick={()=>setExplicitAgreement(true)} disabled={!customerOk||!saleOk||pending||auto.busy||explicitAgreement} className="btn-gradient">Agreement without deposit</button>}
          <button type="button" onClick={()=>setConfirmTerminal("cancel")} disabled={!auto.saved||pending} className="btn-outline disabled:opacity-50">Cancel</button>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={finish} disabled={!auto.saved||!saleOk||pending||auto.busy||Boolean(deposit)||tradeEditorOpen||auto.dirty} className="btn-gradient disabled:opacity-50" style={{background:"#17594e",color:"#fff"}}>Finish Deal</button>
            <button type="button" onClick={()=>setConfirmTerminal("remove")} disabled={!auto.saved||pending} className="rounded-xl border border-rose-400/30 bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50">Remove</button>
          </div>
        </div>)}
      </div>
      {confirmTerminal&&<section role="dialog" aria-labelledby="terminal-confirm-title" aria-describedby="terminal-confirm-description" aria-busy={pending} className="mt-4 rounded-xl border border-rose-300/25 bg-rose-950/20 p-4">
        <h2 id="terminal-confirm-title" className="text-sm font-semibold text-slate-100">{confirmTerminal==="remove"?"Remove this Deal?":"Cancel this Deal?"}</h2>
        <p id="terminal-confirm-description" className="mt-2 text-sm text-slate-300">{confirmTerminal==="remove"?"This permanently removes the negotiation. No Deal record will remain. The customer and vehicle will be kept.":"This removes the negotiation from the active list and preserves it in history as cancelled."}</p>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={pending} onClick={()=>setConfirmTerminal(null)} className="btn-outline disabled:opacity-50">Keep negotiation</button><button type="button" disabled={pending} onClick={()=>closeNegotiation(confirmTerminal)} className="rounded-xl border border-rose-400/30 bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50">{pending?"Closing negotiation…":confirmTerminal==="remove"?"Confirm Remove":"Confirm Cancel"}</button></div>
      </section>}
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      {auto.error&&<div role="alert" className="mt-3 text-sm text-rose-700">{auto.error}<button type="button" onClick={auto.retry} disabled={auto.busy} className="btn-outline ml-3">Retry automatic save</button></div>}
      {openingSaved&&<p role="status" className="mt-4 text-xs text-slate-500">Deal saved.</p>}
      </fieldset>
    </DealSheetSurface>
  );
}
