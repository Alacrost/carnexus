"use client";

export function ImportVrtFields({imported,vrtAmount,vrtVatTreatment,onImported,onAmount,onTreatment}:{imported:boolean;vrtAmount:string;vrtVatTreatment:"included"|"excluded";onImported:(value:boolean)=>void;onAmount:(value:string)=>void;onTreatment:(value:"included"|"excluded")=>void}){
  return <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={imported} onChange={event=>{onImported(event.target.checked);if(!event.target.checked){onAmount("0");onTreatment("included");}}}/>Imported vehicle</label>
    {imported&&<>
      <label className="block text-sm">VRT amount (€)<input className="studio-input mt-1 max-w-xs" type="number" min="0" step="0.01" value={vrtAmount} onChange={event=>onAmount(event.target.value)}/></label>
      <p className="text-xs text-slate-400">VRT is tracked separately from the supplier debt. It is already included in the selling price and will be disclosed without adding it to the sale total.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={vrtVatTreatment==="excluded"} onChange={event=>onTreatment(event.target.checked?"excluded":"included")}/><span>Eligible VRT disbursement: I confirm the authorised TAN arrangement and sale before registration in the customer&apos;s name.<span className="mt-1 block text-xs text-slate-400">Only select this when the qualifying conditions are met. Otherwise VRT remains in the full selling-price VAT base.</span></span></label>
    </>}
  </div>;
}
