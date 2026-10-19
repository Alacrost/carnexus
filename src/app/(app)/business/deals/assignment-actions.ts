"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createSalesClient } from "@/lib/sales-client";

export async function setDealSalesperson(input: { dealId: string; salespersonId: string; version: number; requestId: string }): Promise<{ saved?: { id: string; version: number; salespersonId: string }; error?: string; uncertain?: boolean }> {
  const session = await requireSession();
  const parsed = z.object({ dealId: z.uuid(), salespersonId: z.uuid(), version: z.number().int().positive(), requestId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Choose a valid team member and refresh the Deal before retrying." };
  const db = await createSalesClient();
  const { data, error } = await db.rpc("assign_deal_salesperson", { p_dealer: session.dealer.id, p_deal: parsed.data.dealId, p_salesperson: parsed.data.salespersonId, p_version: parsed.data.version, p_request: parsed.data.requestId });
  if (error) {
    if (!error.code) return { uncertain: true, error: "The assignment could not be confirmed. Retry the same change safely." };
    const messages: Record<string, string> = {
      assignment_not_allowed: "Your permissions do not allow changing Assigned to.",
      commercial_not_allowed: "Your permissions do not allow changing Assigned to.",
      invalid_assignee: "Choose an active sales team member from this dealership.",
      stale_deal: "This Deal changed elsewhere. Refresh before changing Assigned to.",
      deal_closed: "This Deal is closed and its assignment cannot be changed.",
      request_reused: "This request changed after an earlier attempt. Refresh and retry.",
    };
    return { error: messages[error.message] ?? "Could not change Assigned to. No partial change was saved." };
  }
  const result = z.object({ id: z.uuid(), version: z.number().int().positive(), salespersonId: z.uuid() }).safeParse(data);
  if (!result.success) return { uncertain: true, error: "The assignment could not be confirmed. Retry the same change safely." };
  for (const path of ["/business/deals", `/business/deals/${parsed.data.dealId}`, `/business/deals/${parsed.data.dealId}/edit`, "/business", "/pending"]) revalidatePath(path);
  return { saved: result.data };
}
