import "server-only";
import { requireSession } from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
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
  invalid_purchase_tax: "Check the VAT scheme, rate and import/VRT details. VRT requires an imported vehicle and a non-negative amount.",
  vrt_exceeds_sale_price: "The included VRT amount cannot exceed the vehicle selling price.",
  purchase_tax_locked: "VAT and VRT cannot be changed after a final invoice or completed sale.",
  tax_settings_not_allowed: "Only an owner or admin can change VAT defaults.",
  vehicle_interest_requires_activation: "This is still a vehicle interest. Use Remove; cancellation becomes available after a registered payment, trade-in or agreement.",
  agreement_required: "This Deal has an agreement. Print Agreement instead of creating a new quote.",
  refund_exceeds_remaining:"The refund exceeds confirmed money still refundable. Refresh the Deal before recording another refund.",
  refund_confirmation_required:"Confirm that this refund was actually paid and enter its method, date and reason.",
  pending_receipts_require_resolution:"Resolve pending transfers, cheques or drafts before cancelling. Unconfirmed funds must not be refunded as received money.",
  lender_refund_review_required:"A lender payout is present. Review repayment to the lender before recording a customer refund.",
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
  invoice_date_future: "The invoice date cannot be in the future.",
  invoice_date_outside_policy: "The invoice date is outside the dealership's allowed backdate window.",
  invoice_backdate_not_allowed: "Only an owner, admin or accountant can use a prior invoice date.",
  accounting_period_closed: "That date belongs to a closed accounting period.",
  payment_exceeds_balance: "This amount exceeds the remaining balance or refundable receipts.",
  invalid_payment: "Choose a payment method and a positive amount with at most two decimals.",
  receipt_reference_required: "Enter the cheque or bank draft reference.",
  receipt_clearance_not_allowed: "Only an owner, admin or accountant can clear a bank receipt.",
  receipt_missing: "This receipt no longer exists.",
  receipt_clearance_not_required: "This payment does not require bank clearance.",
  receipt_not_pending: "This receipt is not awaiting clearance.",
  receipt_rejection_not_allowed: "Only an owner, admin or accountant can reject a bank instrument.",
  receipt_rejection_reason_required: "Explain why the cheque or draft was rejected.",
  receipt_rejection_not_required: "This payment is not a cheque or bank draft.",
  receipt_not_rejectable: "This receipt is already rejected or cannot be reversed.",
  receipt_already_rejected: "This receipt was already reversed.",
  receipt_not_reversible: "Only a confirmed receipt can be reversed.",
  reversal_reason_required: "Explain why this receipt is being reversed.",
  payment_date_future: "A payment or confirmation date cannot be in the future.",
  pending_receipts_resolve_first: "Confirm or reject every pending receipt before cancelling or returning this sale.",
  explicit_agreement_required: "Use Create agreement to deliberately move this quote into agreement.",
  bank_source_not_realised: "Only money confirmed through the bank can be reconciled.",
  invalid_amount: "Enter a valid positive amount with at most two decimals.", invalid_deposit: "The deposit must not exceed the sale price.",
  deal_closed: "This deal is closed. Issued invoices cannot be edited.", stale_deal: "This deal changed. Refresh and review it before saving.",
  settlement_details_required: "Enter the lender and settlement quote validity date.",
  invalid_settlement: "Check the settlement amount. A normal purchase settlement cannot exceed its price.",
  trade_already_exists: "This deal already has a trade-in.", duplicate_registration: "This registration is already in unsold stock.",
  purchase_not_approved: "The purchase must be approved and have an outstanding balance.", approval_not_allowed: "Only an owner or admin can approve a pending purchase.",
  refund_or_resolve_trade_first: "Refund receipts before cancellation. Deals with a trade-in require a reviewed reversal and cannot be cancelled here.",
  reviewed_cancellation_required: "Use the reviewed cancellation flow and record a reason.",
  cancellation_reason_required: "Add a cancellation reason between 3 and 500 characters.",
  refund_receipts_first: "Refund all recorded receipts before cancelling this deal.",
  trade_in_requires_reversal: "This deal has a trade-in. Use the reviewed trade-in reversal flow when it is available.",
  invoiced_deal_requires_reversal: "An invoice was issued. This deal requires a credit note/reversal, not cancellation.",
  invalid_lead_stage: "Choose a valid stage for the linked lead.",
  linked_lead_missing: "The linked lead is unavailable. Leave it unchanged and retry.",
  financial_reversal_not_allowed: "Only an owner, admin or accountant can issue credit notes or reverse an invoiced sale.",
  credit_reason_required: "Add a correction reason between 3 and 500 characters.",
  invoice_required: "The final invoice is unavailable. Review the document history first.",
  invoice_snapshot_invalid: "The original invoice cannot be corrected automatically. Review it manually.",
  credit_lines_required: "Choose at least one invoiced line to credit.",
  invalid_credit_line: "Review the selected credit amounts.",
  duplicate_credit_line: "Each invoiced line can appear only once in a credit note.",
  credit_exceeds_remaining: "The credit exceeds the amount remaining on the original invoice.",
  invoice_fully_credited: "The original invoice has already been fully credited.",
  full_credit_requires_return: "A full credit is available only through the confirmed vehicle-return flow.",
  completed_invoice_required: "Only a completed, invoiced sale can use this correction flow.",
  refund_allocation_mismatch: "The recorded receipts cannot be allocated safely. Review the payment history before returning the vehicle.",
  trade_reversal_not_allowed: "Only an owner or admin can reverse a sale while retaining its trade-in purchase.",
  trade_return_policy_required: "Confirm that the dealership will retain the trade-in as a standalone purchase.",
  trade_in_missing: "The linked trade-in could not be found.",
  trade_vehicle_has_downstream_deal: "The trade-in is already reserved or sold in another deal and cannot be converted automatically.",
  purchase_below_settlement: "The new purchase value cannot be below the recorded lender settlement. Resolve customer negative equity separately.",
  replacement_purchase_overpaid: "Recorded payments exceed the new purchase value. Review the lender/vendor movements before continuing.",
  purchase_line_missing: "The original trade-in PO has no vehicle line and cannot be converted automatically.",
  purchase_km_required: "Enter the vehicle mileage. Use 0 only for a genuinely unregistered/new vehicle.",
  supplier_invoice_required: "Enter the supplier invoice reference.",
  purchase_date_required: "Enter the purchase date.",
  vehicle_received_date_required: "Enter the date the vehicle arrived at the dealership.",
  vehicle_received_before_purchase: "The dealership arrival date cannot be before the purchase date.",
  purchase_dates_in_future: "Purchase and dealership arrival dates cannot be in the future.",
  invalid_purchase_amount: "The optional purchase price must be zero or a positive amount with at most two decimals.",
  purchase_delete_not_allowed: "Only an owner or admin can delete a PO and its vehicle.",
  purchase_missing: "This purchase order no longer exists.",
  purchase_vehicle_origin_mismatch: "The vehicle and originating PO do not match. Review provenance before deletion.",
  purchase_vehicle_in_use: "This vehicle has Deal, trade-in or replacement-PO history and cannot be deleted. Use cancellation or reversal.",
  vehicle_missing: "This vehicle no longer exists. Return to inventory and refresh.",
  vehicle_already_has_po: "This vehicle already has a purchase order. Open the linked PO instead.",
  purchase_order_required_for_completion: "You can keep working on this Deal, but its final invoice requires a verified purchase order for the car.",
  vehicle_history_disclosure_required: "Explain the vehicle history findings to the buyer and record their confirmation before issuing the invoice.",
  vehicle_has_sale_history: "This vehicle has a sale or deal history. Review it before creating a PO.",
  vehicle_changed_refresh: "Vehicle details changed. Refresh the car and start the PO again.",
  legacy_financial_review_required: "This vehicle already has legacy financial values. Review them before creating a PO to avoid duplicate costs.",
  request_reused: "This submission changed after an earlier attempt. Refresh to start a new entry.",
};
export async function commercialCommand(command: string, id: string | null, input: object, requestId?: string): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();

  if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Invalid submission. Refresh and retry." };
  const db = await createClient();
  const { data, error } = await db.rpc("commercial_command", { p_dealer: session.dealer.id, p_command: command, p_id: id, p_input: input, p_request: requestId ?? crypto.randomUUID() });
  if (error) return { error: errors[error.message] ?? "Could not save. Check the details, permissions and database migration; no partial change was saved." };
  for (const path of ["/business", "/business/deals", "/business/purchases", "/inventory", "/pending", "/leads"]) revalidatePath(path, "layout");
  return data as { id?: string };
}
