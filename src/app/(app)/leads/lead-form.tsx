"use client";

import { useActionState, useState, useTransition } from "react";
import { CRM_STAGES, CRM_SOURCES, type CrmLead, type CrmOption } from "@/lib/crm";
import { saveLead, recordActivity } from "./crm-actions";
import { searchCustomers } from "../business/customers/actions";

export function LeadForm({ lead, customers, vehicles, team, canAssign, userId }: {
  lead?: CrmLead; customers: CrmOption[]; vehicles: CrmOption[]; team: CrmOption[]; canAssign: boolean; userId: string;
}) {
  const [state, action, pending] = useActionState(saveLead, {});
  const [matches, setMatches] = useState(customers);
  const [search, setSearch] = useState("");
  const [searching, startSearch] = useTransition();
  return <form action={action} className="studio-surface space-y-5 p-6">
    <input type="hidden" name="id" value={lead?.id ?? ""} />
    <input type="hidden" name="version" value={lead?.version ?? 0} />
    <label className="block text-sm">Enquiry title<input name="title" defaultValue={lead?.title} required minLength={2} maxLength={160} className="studio-input mt-2" placeholder="Interested in the Golf — part exchange" /></label>
    {lead ? <>
      <input type="hidden" name="customer_id" value={lead.customer_id ?? ""} />
      <input type="hidden" name="customer_name" value="" /><input type="hidden" name="email" value="" /><input type="hidden" name="phone" value="" />
    </> : <fieldset className="space-y-3 rounded-xl border border-white/10 p-4">
      <legend className="px-2 text-sm text-sky-300">Contact</legend>
      <div className="flex items-end gap-3"><label className="flex-1 text-sm">Find an existing contact<input value={search} onChange={e=>setSearch(e.target.value)} maxLength={120} className="studio-input mt-2" placeholder="Name, phone or email" /></label><button type="button" disabled={searching || search.trim().length<2} className="btn-gradient disabled:opacity-50" onClick={()=>startSearch(async()=>setMatches(await searchCustomers(search)))}>{searching ? "Searching…" : "Search"}</button></div>
      <label className="block text-sm">Existing contact
        <select name="customer_id" className="studio-input mt-2" defaultValue=""><option value="">Create a new contact below</option>{matches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">New contact name<input name="customer_name" maxLength={120} className="studio-input mt-2" /></label>
        <label className="text-sm">Email<input name="email" type="email" maxLength={254} className="studio-input mt-2" /></label>
        <label className="text-sm">Phone<input name="phone" type="tel" maxLength={40} className="studio-input mt-2" /></label>
      </div>
      <p className="text-xs text-slate-400">New contact details are used only if you have not selected an existing contact. This does not record marketing consent.</p>
    </fieldset>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Vehicle (100 most recent)<select name="vehicle_id" defaultValue={lead?.vehicle_id ?? ""} className="studio-input mt-2"><option value="">Not yet selected</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label className="text-sm">Source<select name="source" defaultValue={lead?.source ?? "other"} className="studio-input mt-2">{CRM_SOURCES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      {lead ? <label className="text-sm">Stage<select name="stage" defaultValue={lead.stage} className="studio-input mt-2">{CRM_STAGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label> : <input type="hidden" name="stage" value="new" />}
      <label className="text-sm">Priority<select name="score" defaultValue={lead?.score ?? ""} className="studio-input mt-2"><option value="">Not scored</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></label>
      {canAssign ? <label className="text-sm">Responsible salesperson<select name="assigned_to" defaultValue={lead ? lead.assigned_to ?? "" : userId} className="studio-input mt-2"><option value="">Unassigned</option>{team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        : <input type="hidden" name="assigned_to" value={lead ? lead.assigned_to ?? "" : userId} />}
      <label className="text-sm">Next action<input name="next_action" defaultValue={lead?.next_action ?? ""} maxLength={300} className="studio-input mt-2" placeholder="Call to confirm the test drive" /></label>
      <label className="text-sm">Follow-up date and time (UTC)<input name="next_action_at" type="datetime-local" defaultValue={lead?.next_action_at ? new Date(lead.next_action_at).toISOString().slice(0,16) : ""} className="studio-input mt-2" /></label>
    </div>
    <label className="block text-sm">Reason if lost<input name="lost_reason" defaultValue={lead?.lost_reason ?? ""} maxLength={500} className="studio-input mt-2" /></label>
    <label className="block text-sm">Enquiry notes<textarea name="notes" defaultValue={lead?.notes ?? ""} rows={3} maxLength={4000} className="studio-input mt-2" /></label>
    <p className="text-xs text-slate-400">Sold and after-sales require a completed linked deal. Closed leads have their follow-up cleared. Selecting Meta Ads records the source; automatic lead collection is planned.</p>
    {state.error && <p role="alert" className="text-sm text-rose-300">{state.error}</p>}
    <button disabled={pending} className="btn-gradient disabled:opacity-50">{pending ? "Saving…" : lead ? "Save changes" : "Create lead"}</button>
  </form>;
}

export function ActivityForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(recordActivity, {});
  return <form action={action} className="space-y-3">
    <input type="hidden" name="lead_id" value={leadId} />
    <label className="block text-sm">Activity type<select name="type" className="studio-input mt-2"><option value="note">Note</option><option value="call">Call</option><option value="email">Email logged</option><option value="whatsapp">WhatsApp logged</option></select></label>
    <label className="block text-sm">What happened?<textarea name="body" required maxLength={4000} rows={3} className="studio-input mt-2" /></label>
    <p className="text-xs text-slate-400">Records an activity only. No message is sent. Entries cannot be edited or deleted.</p>
    {state.error && <p role="alert" className="text-rose-300">{state.error}</p>}
    {state.saved && <p role="status" className="text-emerald-300">Activity recorded.</p>}
    <button disabled={pending} className="btn-gradient disabled:opacity-50">{pending ? "Saving…" : "Record activity"}</button>
  </form>;
}
