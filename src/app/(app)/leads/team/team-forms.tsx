"use client";
import { useActionState } from "react";
import { CRM_PERMISSIONS, type CrmPermission, type CrmTeamMember } from "@/lib/crm";
import { saveCrmRole, assignCrmRole } from "../crm-actions";

export interface CrmRole { id: string; name: string; permissions: CrmPermission[] }
const labels = {read:"Read leads and history",work:"Create and update leads / log activity",assign:"Assign leads to other salespeople",report:"View dealership pipeline statistics"};
export function RoleForm({ role }: {role?:CrmRole}) {
  const [state,action,pending] = useActionState(saveCrmRole,{});
  return <form action={action} className="studio-surface space-y-4 p-5"><input type="hidden" name="id" value={role?.id ?? ""} /><label className="block text-sm">Profile name<input name="name" defaultValue={role?.name ?? "Manager"} minLength={2} maxLength={60} required className="studio-input mt-2" /></label><fieldset className="space-y-2"><legend className="mb-2 text-xs uppercase text-slate-400">CRM permissions</legend>{CRM_PERMISSIONS.map(p => <label key={p} className="block text-sm"><input name="permissions" value={p} type="checkbox" defaultChecked={role ? role.permissions.includes(p) : true} className="mr-2" />{labels[p]}</label>)}</fieldset><p className="text-xs text-slate-400">Clear all permissions to suspend CRM access for members using this profile.</p>{state.error && <p role="alert" className="text-rose-300">{state.error}</p>}{state.saved && <p role="status" className="text-emerald-300">Profile saved.</p>}<button disabled={pending} className="btn-gradient disabled:opacity-50">{pending ? "Saving…" : role ? "Update profile" : "Create profile"}</button></form>;
}
export function AssignmentForm({member,roles}:{member:CrmTeamMember;roles:CrmRole[]}) {
  const [state,action,pending] = useActionState(assignCrmRole,{});
  return <form action={action} className="space-y-3 border-t border-white/10 py-4"><input type="hidden" name="user_id" value={member.id} /><label className="block text-sm">{member.name}<select name="role_id" defaultValue={member.crm_role_id ?? ""} className="studio-input mt-2"><option value="">Default salesperson (read, work, reports)</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{state.error && <p role="alert" className="text-rose-300">{state.error}</p>}{state.saved && <p role="status" className="text-emerald-300">Assignment saved.</p>}<button disabled={pending} className="btn-gradient disabled:opacity-50">Assign profile</button></form>;
}
