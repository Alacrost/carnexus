export type RefundMethod = "cash" | "bank" | "eft" | "cheque" | "draft" | "card";

export interface PendingDealReceipt {
  id: string; dealId: string; dealNo: string; customerName: string;
  currency: string; amount: number; method: string; reference: string | null;
  paidOn: string | null; kind: string;
}

export interface DealRefundObligation {
  id: string; dealId: string; dealNo: string; customerName: string;
  currency: string; amount: number; paidAmount: number; remaining: number;
  recipient: "customer" | "finance_company";
  status: "pending" | "partially_paid" | "paid" | "resolved";
  reason: string; createdAt: string;
}

export interface DealFinancialPending {
  receipts: PendingDealReceipt[];
  refunds: DealRefundObligation[];
  error?: string;
}
