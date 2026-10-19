"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

const bankErrors: Record<string, string> = {
  bank_not_allowed: "Your role does not allow bank reconciliation.",
  invalid_request: "Review the information and try again.",
  request_reused: "This submission changed after an earlier attempt. Refresh and retry.",
  invalid_bank_account: "Enter a valid account name and three-letter currency.",
  bank_account_missing: "The bank account is unavailable or inactive.",
  invalid_reconciliation_period: "Enter a valid statement period.",
  reconciliation_period_overlap: "This account already has an overlapping reconciliation period.",
  reconciliation_closed_or_missing: "This reconciliation is unavailable or already completed.",
  invalid_statement_line: "Review the date, description and non-zero statement amount.",
  statement_line_missing: "The statement line is unavailable.",
  invalid_bank_match: "Enter a valid positive match amount.",
  bank_source_missing: "The selected transaction is unavailable.",
  bank_match_direction_mismatch: "Money received can only match a deposit; money paid can only match a withdrawal.",
  bank_match_exceeds_available: "The match exceeds the remaining statement or transaction amount.",
  bank_match_missing_or_closed: "This match is unavailable or belongs to a completed period.",
  bank_closing_balance_mismatch: "Opening balance plus statement movements does not equal the closing balance.",
  bank_unmatched_lines: "Every statement line must be fully matched before completion.",
  invalid_bank_import: "Choose a CSV file containing between 1 and 1,000 rows.",
  invalid_bank_import_row: "A CSV row has an invalid date, description or signed amount.",
  bank_import_duplicate: "This statement file content was already imported into the period.",
};

async function command(commandName: string, id: string | null, input: object, requestId: string) {
  const session = await requireSession();
  if (isDemoMode()) return { error: "Preview only — connect Supabase to reconcile a bank account." };
  const db = await createClient();
  const { data, error } = await db.rpc("bank_command", {
    p_dealer: session.dealer.id,
    p_command: commandName,
    p_id: id,
    p_input: input,
    p_request: requestId,
  });
  if (error) return { error: bankErrors[error.message] ?? "The bank operation could not be saved." };
  revalidatePath("/business/bank");
  revalidatePath("/business/reports");
  return data as { id: string; status?: string; removed?: boolean };
}

const money = z.coerce.number().finite().multipleOf(0.01);
const request = z.string().uuid();

const accountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  reference: z.string().trim().max(80).optional(),
  openingBalance: money,
  requestId: request,
});
export async function createBankAccount(input: z.infer<typeof accountSchema>) {
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { error: "Review the account name, currency and opening balance." };
  const { requestId, ...data } = parsed.data;
  return command("create_account", null, data, requestId);
}

const reconciliationSchema = z.object({
  accountId: z.string().uuid(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  openingBalance: money,
  closingBalance: money,
  requestId: request,
}).refine((value) => value.periodStart <= value.periodEnd, { message: "Invalid period" });
export async function startBankReconciliation(input: z.infer<typeof reconciliationSchema>) {
  const parsed = reconciliationSchema.safeParse(input);
  if (!parsed.success) return { error: "Review the account, dates and statement balances." };
  const { accountId, requestId, ...data } = parsed.data;
  return command("start_reconciliation", accountId, data, requestId);
}

const lineSchema = z.object({
  reconciliationId: z.string().uuid(),
  transactionDate: z.iso.date(),
  description: z.string().trim().min(1).max(300),
  reference: z.string().trim().max(120).optional(),
  amount: money.refine((value) => value !== 0),
  requestId: request,
});
export async function addBankStatementLine(input: z.infer<typeof lineSchema>) {
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a statement date, description and non-zero amount." };
  const { reconciliationId, requestId, ...data } = parsed.data;
  return command("add_line", reconciliationId, data, requestId);
}

const matchSchema = z.object({
  lineId: z.string().uuid(),
  sourceType: z.enum(["sale_payment", "purchase_payment"]),
  sourceId: z.string().uuid(),
  amount: money.positive(),
  requestId: request,
});
export async function matchBankTransaction(input: z.infer<typeof matchSchema>) {
  const parsed = matchSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a transaction and enter a positive match amount." };
  const { lineId, requestId, ...data } = parsed.data;
  return command("match", lineId, data, requestId);
}

const idSchema = z.object({ id: z.string().uuid(), requestId: request });
export async function removeBankMatch(input: z.infer<typeof idSchema>) {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid bank match." };
  return command("unmatch", parsed.data.id, {}, parsed.data.requestId);
}

export async function completeBankReconciliation(input: z.infer<typeof idSchema>) {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid reconciliation." };
  return command("complete", parsed.data.id, {}, parsed.data.requestId);
}

const importSchema = z.object({
  reconciliationId: z.string().uuid(), fileName: z.string().trim().min(1).max(180), requestId: request,
  lines: z.array(z.object({ date: z.iso.date(), description: z.string().trim().min(1).max(300), reference: z.string().trim().max(120).optional(), amount: money.refine((value) => value !== 0) })).min(1).max(1000),
});
export async function importBankStatement(input: z.infer<typeof importSchema>) {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { error: "Use Date, Description, Reference and signed Amount columns; maximum 1,000 valid rows." };
  const { reconciliationId, requestId, ...data } = parsed.data;
  return command("import_lines", reconciliationId, data, requestId);
}
