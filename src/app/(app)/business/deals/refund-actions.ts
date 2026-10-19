"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createSalesClient } from "@/lib/sales-client";
import type { RefundMethod } from "@/lib/deal-refunds";

export async function payDealRefund(input: {
  obligationId: string; amount: number; method: RefundMethod; paidOn: string;
  reference: string; confirmedPaid: boolean; requestId: string;
}): Promise<{ id?: string; remaining?: number; error?: string }> {
  const parsed = z.object({
    obligationId: z.uuid(), amount: z.number().positive().multipleOf(0.01),
    method: z.enum(["cash", "bank", "eft", "cheque", "draft", "card"]),
    paidOn: z.iso.date(), reference: z.string().max(120),
    confirmedPaid: z.literal(true), requestId: z.uuid(),
  }).safeParse(input);
  if (!parsed.success) return { error: "Confirm the refund already paid, its amount, method and date." };
  const session = await requireSession();
  const db = await createSalesClient();
  const { obligationId, requestId, ...details } = parsed.data;
  const { data, error } = await db.rpc("commercial_command", {
    p_dealer: session.dealer.id, p_command: "pay_deal_refund", p_id: obligationId,
    p_input: details, p_request: requestId,
  });
  if (error) {
    const messages: Record<string, string> = {
      commercial_not_allowed: "Your role cannot record this refund.",
      refund_obligation_missing: "This refund obligation is unavailable. Refresh the Deal.",
      refund_exceeds_remaining: "The refund exceeds the amount still owed. Refresh before recording another payment.",
      refund_confirmation_required: "Confirm that this refund was already paid and check its date and method.",
      receipt_reference_required: "Add the cheque or bank draft reference.",
      lender_refund_review_required: "This money belongs to a finance company and requires the lender refund review.",
      request_reused: "This submission changed after an earlier attempt. Refresh before trying again.",
      accounting_period_closed: "The payment date falls in a closed accounting period.",
    };
    return { error: messages[error.message] ?? "Could not record the refund. Check permissions and the database update; nothing was saved." };
  }
  revalidatePath("/business", "layout");
  return data as { id: string; remaining: number };
}
