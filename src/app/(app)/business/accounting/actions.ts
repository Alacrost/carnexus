"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

const errors: Record<string, string> = {
  accounting_not_allowed: "Your role does not allow accounting period control.",
  invalid_accounting_period: "Enter a valid label and date range.",
  accounting_period_overlap: "An accounting period already overlaps these dates.",
  accounting_period_closed_or_missing: "This period is unavailable or already closed.",
  accounting_close_exceptions: "Resolve every accounting exception before closing the period.",
  trial_balance_not_balanced: "The trial balance is not balanced. Review source transactions.",
  accounting_reopen_owner_only: "Only the dealership owner can reopen a closed period.",
  accounting_reopen_reason_required: "Enter a clear reason for reopening the period.",
  accounting_period_open_or_missing: "This period is unavailable or already open.",
  invoice_policy_not_allowed: "Only an owner or admin can change the invoice-date policy.",
  invalid_invoice_policy: "Choose a backdate allowance between 0 and 365 days.",
  invalid_journal: "Enter a valid date, reference, description and at least two lines.",
  journal_account_invalid: "Choose active nominal accounts.",
  invalid_journal_line: "Each journal line must contain either a debit or a credit.",
  journal_not_balanced: "Journal debits and credits must be equal.",
  journal_not_draft: "Only a draft journal can be posted.",
  journal_independent_review_required: "A non-owner journal must be posted by a different finance user.",
  journal_not_posted: "Only a posted journal can be reversed.",
  journal_reversal_reason_required: "Explain the journal reversal.",
  request_reused: "This submission changed after an earlier attempt. Refresh and retry.",
};

async function run(command: string, id: string | null, input: object, requestId: string) {
  const session = await requireSession();
  if (isDemoMode()) return { error: "Preview only — connect Supabase to manage accounting periods." };
  const db = await createClient();
  const { data, error } = await db.rpc("accounting_command", { p_dealer: session.dealer.id, p_command: command, p_id: id, p_input: input, p_request: requestId });
  if (error) return { error: errors[error.message] ?? "The accounting operation could not be saved." };
  revalidatePath("/business/accounting");
  return data as { id: string; status: string };
}

const periodSchema = z.object({ label: z.string().trim().min(2).max(80), periodStart: z.iso.date(), periodEnd: z.iso.date(), requestId: z.string().uuid() }).refine((value) => value.periodStart <= value.periodEnd);
export async function createAccountingPeriod(input: z.infer<typeof periodSchema>) {
  const parsed = periodSchema.safeParse(input); if (!parsed.success) return { error: "Enter a valid period label and dates." };
  const { requestId, ...data } = parsed.data; return run("create_period", null, data, requestId);
}
const idSchema = z.object({ id: z.string().uuid(), requestId: z.string().uuid() });
export async function closeAccountingPeriod(input: z.infer<typeof idSchema>) {
  const parsed = idSchema.safeParse(input); if (!parsed.success) return { error: "Invalid accounting period." };
  return run("close_period", parsed.data.id, {}, parsed.data.requestId);
}
const reopenSchema = idSchema.extend({ reason: z.string().trim().min(5).max(500) });
export async function reopenAccountingPeriod(input: z.infer<typeof reopenSchema>) {
  const parsed = reopenSchema.safeParse(input); if (!parsed.success) return { error: "Enter a reason of at least five characters." };
  return run("reopen_period", parsed.data.id, { reason: parsed.data.reason }, parsed.data.requestId);
}
const policySchema = z.object({ maxBackdateDays: z.number().int().min(0).max(365), requestId: z.string().uuid() });
export async function setInvoiceDatePolicy(input: z.infer<typeof policySchema>) {
  const parsed = policySchema.safeParse(input); if (!parsed.success) return { error: "Choose between 0 and 365 days." };
  return run("set_invoice_policy", null, { maxBackdateDays: parsed.data.maxBackdateDays }, parsed.data.requestId);
}
const journalLine=z.object({accountCode:z.string().trim().min(1).max(20),description:z.string().trim().max(300).optional(),debit:z.number().nonnegative().multipleOf(0.01),credit:z.number().nonnegative().multipleOf(0.01)}).refine(line=>(line.debit>0)!==(line.credit>0));
const journalSchema=z.object({effectiveDate:z.iso.date(),reference:z.string().trim().min(1).max(80),description:z.string().trim().min(3).max(500),lines:z.array(journalLine).min(2).max(50),requestId:z.string().uuid()});
export async function createManualJournal(input:z.infer<typeof journalSchema>){const parsed=journalSchema.safeParse(input);if(!parsed.success)return{error:"Review the journal date, reference and debit/credit lines."};const{requestId,...data}=parsed.data;return run("create_journal",null,data,requestId);}
export async function postManualJournal(input:z.infer<typeof idSchema>){const parsed=idSchema.safeParse(input);if(!parsed.success)return{error:"Invalid journal."};return run("post_journal",parsed.data.id,{},parsed.data.requestId);}
const reverseJournalSchema=idSchema.extend({reason:z.string().trim().min(5).max(500)});
export async function reverseManualJournal(input:z.infer<typeof reverseJournalSchema>){const parsed=reverseJournalSchema.safeParse(input);if(!parsed.success)return{error:"Enter a reversal reason."};return run("reverse_journal",parsed.data.id,{reason:parsed.data.reason},parsed.data.requestId);}
