export const CRM_STAGES = [
  ["new", "New enquiry"], ["contacted", "Contacted"], ["appointment", "Appointment"],
  ["test_drive", "Test drive"], ["finance_applied", "Finance"], ["sold", "Sold"],
  ["after_sales", "After-sales"], ["lost", "Lost"],
] as const;
export const CRM_SOURCES = [
  ["website", "Website"], ["donedeal", "DoneDeal"], ["facebook", "Facebook / Meta Ads"],
  ["instagram", "Instagram"], ["whatsapp", "WhatsApp"], ["walk_in", "Walk-in"],
  ["phone", "Phone"], ["other", "Other / email"],
] as const;
export const CRM_PERMISSIONS = ["read", "work", "assign", "report"] as const;
export type CrmPermission = (typeof CRM_PERMISSIONS)[number];
export interface CrmLead {
  id: string; title: string; customer_id: string | null; vehicle_id: string | null;
  assigned_to: string | null; stage: string; source: string; score: string | null;
  notes: string | null; next_action: string | null; next_action_at: string | null;
  lost_reason: string | null; version: number; created_at: string;
}
export interface CrmOption { id: string; name: string }
export interface CrmTeamMember extends CrmOption { base_role: string; crm_role_id: string | null }
export interface CrmBreakdown { label: string; count: number; won?: number }
export interface CrmReport {
  total: number; won: number; lost: number; open: number; overdue: number; unassigned: number;
  stages: CrmBreakdown[]; sources: CrmBreakdown[]; assignees: CrmBreakdown[];
}
export function crmLabel(value: string) {
  return [...CRM_STAGES, ...CRM_SOURCES].find(([key]) => key === value)?.[1] ?? value;
}
export function conversionRate(won: number, total: number) {
  return total > 0 ? Math.round(won / total * 1000) / 10 : 0;
}
export function reportPeriod(from?: string, to?: string, now = new Date()) {
  const validDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  const end = validDate(to) ? to! : now.toISOString().slice(0, 10);
  const start = validDate(from) ? from! : end.slice(0, 8) + "01";
  if (start > end) return null;
  return { from: start, to: end, start: start + "T00:00:00Z", end: new Date(Date.parse(end) + 86400000).toISOString() };
}

export const CRM_ERRORS: Record<string, string> = {
  crm_not_allowed: "Your CRM profile does not allow this action.",
  stale_lead: "Someone updated this lead. Reload the page before saving again.",
  lead_not_found: "This lead is no longer available.",
  completed_deal_required: "Complete a linked deal before marking this lead sold or after-sales.",
  loss_reason_required: "Add a reason before marking the lead lost.",
  follow_up_requires_action_and_date: "Add both the next action and its date, or clear both.",
  assignment_not_allowed: "Your CRM profile cannot change the responsible salesperson.",
  invalid_assignee: "Choose an active salesperson from this dealership.",
  invalid_customer: "Choose a valid customer or enter the new contact details.",
  invalid_vehicle: "Choose a vehicle belonging to this dealership.",
};
