import "server-only";
import { requireSession } from "@/lib/auth";
import { createSalesClient } from "@/lib/sales-client";
import type { DealFinancialPending } from "./deal-refunds";

export async function listDealFinancialPending(): Promise<DealFinancialPending> {
  const session = await requireSession();
  const db = await createSalesClient();
  const { data, error } = await db.rpc("deal_financial_pending", { p_dealer: session.dealer.id });
  if (error || !data) return { receipts: [], refunds: [], error: "Financial pending items could not be loaded. Check access and the database update; this is not an empty balance." };
  return data as DealFinancialPending;
}
