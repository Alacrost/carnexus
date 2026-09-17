"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { REQUIRED_DOCS } from "@/lib/deals";
import { toggleRequiredDoc } from "../actions";

export function RequiredDocs({ dealId, docs }: { dealId: string; docs: Record<string, boolean> }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(docs);
  const [, start] = useTransition();

  function toggle(key: string) {
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    start(async () => {
      await toggleRequiredDoc(dealId, key, next);
      router.refresh();
    });
  }

  const got = REQUIRED_DOCS.filter((d) => state[d.key]).length;

  return (
    <section className="studio-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Required documents</h2>
        <span className="text-[11px] text-slate-500">{got}/{REQUIRED_DOCS.length}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {REQUIRED_DOCS.map((d) => (
          <li key={d.key}>
            <button type="button" onClick={() => toggle(d.key)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-sm hover:bg-white/[0.03]">
              <span className={`grid h-4 w-4 place-items-center rounded border ${state[d.key] ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300" : "border-white/20"}`}>{state[d.key] ? "✓" : ""}</span>
              <span className={state[d.key] ? "text-slate-300" : "text-slate-400"}>{d.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
