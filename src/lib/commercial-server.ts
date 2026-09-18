import "server-only";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { revalidatePath } from "next/cache";
export async function commercialPermission(permission: string) {
  const session = await requireSession();
  if (isDemoMode()) return true;
  const db = await createClient();
  const { data, error } = await db.rpc("commercial_allowed", { p_dealer_id: session.dealer.id, p_permission: permission });
  return !error && data === true;
}
const errors: Record<string, string> = {
  customer_address_required: "Add the customer address in Customers before issuing the invoice.",
  vat_registration_required: "Set your VAT registration number in Document settings before issuing a taxable invoice.",
  commercial_not_allowed: "Your role does not permit this action.",
  trade_acquisition_pending: "Complete the originating sale before selling this trade-in.",
  vehicle_unavailable: "This vehicle is unavailable.", vehicle_has_open_deal: "This car already has an open deal. Open that deal instead.",
  price_permission_reason_required: "A price change requires permission and a reason (at least 3 characters).",
  agreement_status_required: "Mark the deal agreed before completing the sale.",
  current_agreement_required: "Issue an agreement for the current deal terms before completing the sale.",
  document_settings_required: "Configure the company name and address in Document settings first.",
  clear_balance_first: "Record all funds received and clear the balance before completing the sale.",
  finance_payout_pending: "The expected finance payout has not been fully received.",
  finance_not_approved: "Check the finance approval and remaining lender payout.",
  finance_invoice_details_required: "Enter the finance company name and invoice address.",
  finance_details_required: "Enter the finance company.", finance_below_received: "Finance expected cannot be below funds already received.",
  complete_sale_first: "The final invoice is issued when the sale completes.",
  payment_exceeds_balance: "This amount exceeds the remaining balance or refundable receipts.",
  invalid_payment: "Choose a payment method and a positive amount with at most two decimals.",
  invalid_amount: "Enter a valid positive amount with at most two decimals.", invalid_deposit: "The deposit must not exceed the sale price.",
  deal_closed: "This deal is closed. Issued invoices cannot be edited.", stale_deal: "This deal changed. Refresh and review it before saving.",
  settlement_details_required: "Enter the lender and settlement quote validity date.",
  invalid_settlement: "Check the settlement amount. A normal purchase settlement cannot exceed its price.",
  trade_already_exists: "This deal already has a trade-in.", duplicate_registration: "This registration is already in unsold stock.",
  purchase_not_approved: "The purchase must be approved and have an outstanding balance.", approval_not_allowed: "Only an owner or admin can approve a pending purchase.",
  refund_or_resolve_trade_first: "Refund receipts before cancellation. Deals with a trade-in require a reviewed reversal and cannot be cancelled here.",
  request_reused: "This submission changed after an earlier attempt. Refresh to start a new entry.",
};
export async function commercialCommand(command: string, id: string | null, input: object, requestId?: string): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (isDemoMode()) return { error: "Preview only — connect Supabase to save. No payment or document was recorded." };
  if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Invalid submission. Refresh and retry." };
  const db = await createClient();
  const { data, error } = await db.rpc("commercial_command", { p_dealer: session.dealer.id, p_command: command, p_id: id, p_input: input, p_request: requestId ?? crypto.randomUUID() });
  if (error) return { error: errors[error.message] ?? "Could not save. Check the details, permissions and database migration; no partial change was saved." };
  for (const path of ["/business", "/business/deals", "/business/purchases", "/inventory", "/leads"]) revalidatePath(path, "layout");
  return data as { id?: string };
}
