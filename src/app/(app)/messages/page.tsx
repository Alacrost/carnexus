import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { MessageCentre, type MessageOverview } from "./message-centre";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const rawThread = typeof params.thread === "string" ? params.thread : "";
  const threadId = uuid.test(rawThread) ? rawThread : null;
  const contextType = typeof params.contextType === "string" && ["deal","lead","customer","vehicle"].includes(params.contextType) ? params.contextType as "deal"|"lead"|"customer"|"vehicle" : undefined;
  const rawContextId = typeof params.contextId === "string" ? params.contextId : "";
  const contextId = contextType && uuid.test(rawContextId) ? rawContextId : undefined;
  const contextLabel = typeof params.contextLabel === "string" ? params.contextLabel.slice(0, 180) : undefined;
  let overview: MessageOverview = { threads: [], messages: [], members: [], unreadTotal: 0 };
  let loadError = "";
  if (isDemoMode()) {
    overview = {
      threads: [{ id: "demo-assignments", kind: "system", title: "Assignments", lastBody: "A Deal was assigned to you", lastAt: new Date().toISOString(), unread: 1 }],
      messages: [], members: [], unreadTotal: 1,
    };
  } else {
    const db = await createClient();
    const { data, error } = await db.rpc("message_centre_overview", { p_dealer: session.dealer.id, p_thread: threadId });
    if (error) loadError = "Message Centre could not load. Apply migration 055 and retry.";
    else overview = data as unknown as MessageOverview;
  }
  return <MessageCentre overview={overview} activeThreadId={threadId} currentUserId={session.userId} context={contextType && contextId ? { type: contextType, id: contextId, label: contextLabel ?? "Linked record" } : undefined} loadError={loadError} />;
}
