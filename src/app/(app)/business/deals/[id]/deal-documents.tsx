"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createDealDocument } from "../actions";

export interface DocRow { id: string; kind: string; number: string; status: string; date: string }

const STATUS_STYLE: Record<string, string> = {
  draft: "text-slate-400",
  printed: "text-sky-300",
  paid: "text-emerald-300",
  void: "text-rose-300",
};

export function DealDocuments({ dealId, docs }: { dealId: string; docs: DocRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  function gen(kind: string) {
    setErr("");
    setBusy(kind);
    start(async () => {
      const res = await createDealDocument(dealId, kind);
      setBusy("");
      if (res.error) setErr(res.error);
      else if (res.id) router.push(`/deal-doc/${dealId}/${res.id}`);
    });
  }

  const btn = "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 disabled:opacity-50";

  return (
    <section className="studio-surface p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Documents</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => gen("quote")} disabled={pending} className={btn}>{busy === "quote" ? "…" : "Quote"}</button>
        <button type="button" onClick={() => gen("agreement")} disabled={pending} className={btn}>{busy === "agreement" ? "…" : "Print Agreement"}</button>
        <button type="button" onClick={() => gen("invoice")} disabled={pending} className="btn-gradient text-xs">{busy === "invoice" ? "…" : "Create Invoice"}</button>
      </div>
      {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}

      {docs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/deal-doc/${dealId}/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm hover:border-white/20">
                <span className="capitalize text-slate-200">{d.kind} · <span className="font-mono text-slate-400">{d.number}</span></span>
                <span className={`text-[11px] capitalize ${STATUS_STYLE[d.status] ?? "text-slate-400"}`}>{d.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
