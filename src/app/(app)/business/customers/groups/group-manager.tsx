"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { createContactGroup, setContactGroupMembership } from "./actions";

export interface ContactGroup { id: string; name: string; system_key: string | null }
export interface GroupContact { id: string; name: string; type: string; address_line1: string | null }

export function GroupManager({ groups, contacts, membership }: { groups: ContactGroup[]; contacts: GroupContact[]; membership: { group_id: string; customer_id: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(groups[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const group = groups.find(item => item.id === selected);
  const ids = new Set(membership.filter(item => item.group_id === selected).map(item => item.customer_id));
  const assigned = contacts.filter(item => ids.has(item.id));
  const available = contacts.filter(item => !ids.has(item.id) && (group?.system_key !== "finance_companies" || item.type === "business" && (item.address_line1 ?? "").trim().length >= 5));

  function create() {
    setError("");
    start(async () => {
      const result = await createContactGroup(newName);
      if (result.error) setError(result.error);
      else { setNewName(""); router.refresh(); }
    });
  }
  function change(customerId: string, included: boolean) {
    if (!group) return;
    setError("");
    start(async () => {
      const result = await setContactGroupMembership({ groupId: group.id, customerId, included });
      if (result.error) setError(result.error);
      else { setContactId(""); router.refresh(); }
    });
  }

  return <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="studio-surface p-4">
      <h2 className="border-b border-white/10 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-200">Contact groups</h2>
      <div className="mt-3 space-y-1">{groups.map(item => <button key={item.id} type="button" onClick={() => { setSelected(item.id); setContactId(""); setError(""); }} className={`flex w-full items-center justify-between border px-3 py-2 text-left text-sm ${selected === item.id ? "border-slate-400 bg-white/10 text-white" : "border-transparent text-slate-300 hover:bg-white/5"}`}><span>{item.system_key === "customers" ? "All contacts" : item.name}</span><span className="text-xs text-slate-400">{membership.filter(member => member.group_id === item.id).length}</span></button>)}</div>
      <div className="mt-5 border-t border-white/10 pt-4"><label className="text-xs text-slate-300">New group<input value={newName} onChange={event => setNewName(event.target.value)} maxLength={80} className="studio-input mt-1" placeholder="e.g. Fleet customers" /></label><button type="button" onClick={create} disabled={pending || newName.trim().length < 2} className="mt-2 border border-white/20 bg-white/10 px-3 py-2 text-xs text-white disabled:opacity-40">Create group</button></div>
    </aside>
    <section className="studio-surface min-w-0 p-5"><div className="border-b border-white/10 pb-4"><h2 className="text-lg font-semibold text-white">{group?.system_key === "customers" ? "All contacts" : group?.name ?? "Select a group"}</h2><p className="mt-1 text-xs text-slate-400">{group?.system_key === "finance_companies" ? "Only business contacts with an invoice address can be selected in Edit Deal as finance companies." : group?.system_key === "customers" ? "Every active contact is included automatically." : "Assign contacts to organise your CRM."}</p></div>
      {group?.system_key !== "customers" && <div className="mt-4 flex flex-wrap items-end gap-2"><label className="min-w-56 flex-1 text-xs text-slate-300">Add existing contact<select value={contactId} onChange={event => setContactId(event.target.value)} className="studio-input mt-1"><option value="">Choose a contact…</option>{available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" onClick={() => change(contactId, true)} disabled={pending || !contactId} className="border border-white/20 bg-white/10 px-4 py-2.5 text-xs text-white disabled:opacity-40">Add to group</button></div>}
      <div className="mt-5 divide-y divide-white/10">{assigned.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div><Link href={`/business/customers/${item.id}`} className="text-sm font-medium text-white hover:underline">{item.name}</Link><p className="text-xs text-slate-400">{item.type === "business" ? "Business" : "Individual"}{item.address_line1 ? ` · ${item.address_line1}` : ""}</p></div>{group?.system_key !== "customers" && <button type="button" onClick={() => change(item.id, false)} disabled={pending} className="border border-white/15 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">Remove</button>}</div>)}{assigned.length === 0 && <p className="py-6 text-sm text-slate-400">No contacts in this group yet.</p>}</div>
      {group?.system_key === "finance_companies" && <p className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400">Need a new finance company? <Link href="/business/customers" className="text-sky-300 hover:underline">Create a business contact</Link> with its invoice address, then add it here.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </section>
  </div>;
}
