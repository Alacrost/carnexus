"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markConversationRead, sendInternalMessage, startDirectConversation } from "./actions";

export interface ThreadSummary { id: string; kind: string; title: string; lastBody: string; lastAt: string; unread: number }
export interface MessageRow { id: string; body: string; kind: string; createdAt: string; senderId: string | null; sender: string; mine: boolean; contextType?: "deal"|"lead"|"customer"|"vehicle"; contextId?: string; contextLabel?: string }
export interface TeamMember { id: string; name: string; role: string }
export interface MessageOverview { threads: ThreadSummary[]; messages: MessageRow[]; members: TeamMember[]; unreadTotal: number }
type Context = { type: "deal"|"lead"|"customer"|"vehicle"; id: string; label: string };

function contextHref(type: Context["type"], id: string) {
  return type === "deal" ? `/business/deals/${id}` : type === "lead" ? `/leads/${id}` : type === "customer" ? `/business/customers/${id}` : `/inventory/${id}`;
}
function time(value: string) { return new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

export function MessageCentre({ overview, activeThreadId, context, loadError }: { overview: MessageOverview; activeThreadId: string | null; currentUserId: string; context?: Context; loadError?: string }) {
  const router = useRouter();
  const active = overview.threads.find((thread) => thread.id === activeThreadId);
  const [body, setBody] = useState("");
  const [error, setError] = useState(loadError ?? "");
  const [pending, start] = useTransition();
  const sendRequest = useRef("");
  const bottom = useRef<HTMLDivElement>(null);
  const contextQuery = useMemo(() => context ? `&contextType=${context.type}&contextId=${context.id}&contextLabel=${encodeURIComponent(context.label)}` : "", [context]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [overview.messages.length, activeThreadId]);
  useEffect(() => {
    if (!activeThreadId || !active?.unread) return;
    void markConversationRead({ threadId: activeThreadId, requestId: crypto.randomUUID() }).then(() => router.refresh());
  }, [activeThreadId, active?.unread, router]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 8000);
    return () => window.clearInterval(timer);
  }, [router]);

  function startConversation(targetId: string) {
    setError("");
    start(async () => {
      const result = await startDirectConversation({ targetId, requestId: crypto.randomUUID() });
      if ("error" in result) setError(result.error);
      else router.push(`/messages?thread=${result.id}${contextQuery}`);
    });
  }
  function send() {
    if (!activeThreadId || !body.trim()) return;
    setError("");
    start(async () => {
      const result = await sendInternalMessage({ threadId: activeThreadId, body, contextType: context?.type, contextId: context?.id, requestId: sendRequest.current ||= crypto.randomUUID() });
      if ("error" in result) setError(result.error);
      else { setBody(""); sendRequest.current = ""; router.refresh(); }
    });
  }

  return <div className="space-y-4">
    <header><p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Team workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Message Centre</h1><p className="mt-1 text-sm text-slate-500">Internal conversations and assignment alerts. Messages never change record permissions.</p></header>
    {context && <div className="flex items-center justify-between rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-4 py-2 text-sm"><span className="text-violet-200">Linking your next message to <strong>{context.label}</strong></span><Link href={contextHref(context.type,context.id)} className="text-xs text-violet-300 hover:text-white">Open record</Link></div>}
    {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
    <div className="grid min-h-[680px] overflow-hidden rounded-2xl border border-white/10 bg-[#090d16]/80 lg:grid-cols-[300px_minmax(0,1fr)_250px]">
      <aside className="border-b border-white/10 lg:border-b-0 lg:border-r"><div className="border-b border-white/10 px-4 py-3"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Conversations</p><p className="mt-1 text-xs text-slate-400">{overview.unreadTotal} unread</p></div><div className="max-h-[610px] overflow-y-auto p-2">{overview.threads.length===0&&<p className="p-3 text-sm text-slate-500">Start a conversation with a colleague.</p>}{overview.threads.map((thread)=><Link key={thread.id} href={`/messages?thread=${thread.id}${contextQuery}`} className={`mb-1 block rounded-xl border px-3 py-3 transition-colors ${thread.id===activeThreadId?"border-sky-400/20 bg-sky-400/10":"border-transparent hover:bg-white/[0.04]"}`}><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-slate-200">{thread.title}</span>{thread.unread>0&&<span className="ml-auto rounded-full bg-sky-400 px-1.5 text-[10px] font-semibold text-slate-950">{thread.unread}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{thread.lastBody}</p><p className="mt-1 text-[10px] text-slate-600">{time(thread.lastAt)}</p></Link>)}</div></aside>
      <section className="flex min-w-0 flex-col bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.045),transparent_35%)]"><div className="border-b border-white/10 px-5 py-4"><h2 className="font-medium text-slate-100">{active?.title ?? "Select a conversation"}</h2><p className="text-xs text-slate-500">{active?.kind==="system"?"Automatic responsibility updates":"Private dealership conversation"}</p></div><div className="flex-1 space-y-4 overflow-y-auto p-5">{activeThreadId&&overview.messages.length===0&&<p className="text-center text-sm text-slate-500">No messages in this conversation yet.</p>}{overview.messages.map((message)=><div key={message.id} className={`flex ${message.mine?"justify-end":"justify-start"}`}><div className={`max-w-[78%] rounded-2xl border px-4 py-3 ${message.kind==="system"?"border-violet-400/20 bg-violet-400/10":message.mine?"border-sky-400/20 bg-sky-400/10":"border-white/10 bg-white/[0.04]"}`}><div className="flex items-center gap-2 text-[10px] text-slate-500"><span>{message.sender}</span><span>·</span><time>{time(message.createdAt)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{message.body}</p>{message.contextType&&message.contextId&&<Link href={contextHref(message.contextType,message.contextId)} className="mt-2 inline-flex rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-sky-300 hover:text-white">{message.contextLabel ?? "Open linked record"} →</Link>}</div></div>)}<div ref={bottom}/></div>{active&&active.kind!=="system"&&<div className="border-t border-white/10 p-4"><textarea value={body} onChange={(event)=>setBody(event.target.value)} onKeyDown={(event)=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter")send();}} rows={3} maxLength={4000} placeholder="Write a message…" className="studio-input resize-none"/><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-500">Ctrl/⌘ + Enter to send{context?` · links ${context.label}`:""}</span><button type="button" onClick={send} disabled={pending||!body.trim()} className="rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{pending?"Sending…":"Send"}</button></div></div>}</section>
      <aside className="border-t border-white/10 p-3 lg:border-l lg:border-t-0"><p className="px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Start conversation</p><div className="space-y-1">{overview.members.map((member)=><button key={member.id} type="button" onClick={()=>startConversation(member.id)} disabled={pending} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.04] disabled:opacity-40"><span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-400/20 to-violet-400/20 text-xs font-semibold text-sky-200">{member.name.slice(0,2).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm text-slate-200">{member.name}</span><span className="block text-[10px] capitalize text-slate-500">{member.role}</span></span></button>)}</div></aside>
    </div>
  </div>;
}
