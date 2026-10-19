"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

const errors: Record<string, string> = {
  message_not_allowed: "Your active dealership membership is required.",
  invalid_message_recipient: "Choose another active team member.",
  message_thread_missing: "This conversation is unavailable.",
  invalid_message: "Write a message between 1 and 4,000 characters.",
  invalid_message_context: "The linked record is invalid.",
  message_context_not_allowed: "You do not have access to link that record.",
  message_context_missing: "The linked record no longer exists.",
  request_reused: "This submission changed after an earlier attempt. Refresh and retry.",
};

async function run(command: string, id: string | null, input: object, requestId: string) {
  const session = await requireSession();
  if (isDemoMode()) return { error: "Preview only — connect Supabase to send internal messages." };
  const db = await createClient();
  const { data, error } = await db.rpc("message_command", {
    p_dealer: session.dealer.id, p_command: command, p_id: id, p_input: input, p_request: requestId,
  });
  if (error) return { error: errors[error.message] ?? "The message could not be saved." };
  revalidatePath("/messages");
  revalidatePath("/", "layout");
  return data as { id: string; threadId?: string; read?: boolean };
}

const directSchema = z.object({ targetId: z.string().uuid(), requestId: z.string().uuid() });
export async function startDirectConversation(input: z.infer<typeof directSchema>) {
  const parsed = directSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid team member." };
  return run("start_direct", null, { targetId: parsed.data.targetId }, parsed.data.requestId);
}

const sendSchema = z.object({
  threadId: z.string().uuid(), body: z.string().trim().min(1).max(4000),
  contextType: z.enum(["deal","lead","customer","vehicle"]).optional(), contextId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
}).refine((value) => Boolean(value.contextType) === Boolean(value.contextId));
export async function sendInternalMessage(input: z.infer<typeof sendSchema>) {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "Write a message and review the linked record." };
  const { threadId, requestId, ...data } = parsed.data;
  return run("send", threadId, data, requestId);
}

const readSchema = z.object({ threadId: z.string().uuid(), requestId: z.string().uuid() });
export async function markConversationRead(input: z.infer<typeof readSchema>) {
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid conversation." };
  return run("mark_read", parsed.data.threadId, {}, parsed.data.requestId);
}
