export type MemberRole = "owner" | "admin" | "sales" | "agency" | "accountant";

export type DealerPlan = "starter" | "professional" | "dealer_group";

/** The three separately-sold products. A dealer can have any subset. */
export interface DealerModules {
  sales: boolean;
  marketing: boolean;
  website: boolean;
}

export const ALL_MODULES: DealerModules = { sales: true, marketing: true, website: true };

/** Provisioned products only; missing entitlements must not grant access. */
export function hasModule(modules: DealerModules | null | undefined, key: keyof DealerModules): boolean {
  return modules?.[key] === true;
}

export interface Dealer {
  id: string;
  name: string;
  slug: string;
  plan: DealerPlan;
  created_at: string;
  modules?: DealerModules;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
}

export interface DealerMember {
  dealer_id: string;
  user_id: string;
  role: MemberRole;
  status: "active" | "suspended";
}

export type VehicleStatus =
  | "bought"
  | "preparation"
  | "ready_for_sale"
  | "reserved"
  | "sold";

export type LeadStage =
  | "new"
  | "contacted"
  | "appointment"
  | "test_drive"
  | "finance_applied"
  | "sold"
  | "after_sales"
  | "lost";

/** Capabilities matrix — keep in sync with docs/SECURITY.md */
export const can = {
  manageMembers: (role: MemberRole) => role === "owner" || role === "admin",
  manageVehicles: (role: MemberRole) => role === "owner" || role === "admin",
  viewBuyPrices: (role: MemberRole) => role === "owner" || role === "admin",
  manageBilling: (role: MemberRole) => role === "owner",
  deleteDealer: (role: MemberRole) => role === "owner",
  /** Approve & sign promotion T&C before they go public (owner or marketing manager). */
  approvePromotions: (role: MemberRole) => role === "owner" || role === "admin",
  /** Sales & Accounting: cost/margin/VAT/profit + reports (owner/admin/accountant only). */
  viewFinancials: (role: MemberRole) =>
    role === "owner" || role === "admin" || role === "accountant",
  /** Run the sales process — deals, orders, deposits (customer-facing figures). */
  manageDeals: (role: MemberRole) =>
    role === "owner" || role === "admin" || role === "sales" || role === "accountant",
  /** Marketing & AI Studio: creatives, posts, campaigns */
  useMarketing: (role: MemberRole) =>
    role === "owner" || role === "admin" || role === "agency",
  /** Customer/lead PII — agency must never access */
  viewCustomerData: (role: MemberRole) => role !== "agency",
} as const;
