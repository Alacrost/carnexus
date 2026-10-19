"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { REQUIRED_DOCS } from "@/lib/deals";
import { toggleRequiredDoc } from "../actions";

export function RequiredDocs({ dealId, docs }: { dealId: string; docs: Record<string, boolean> }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(docs);
  const [pending, start] = useTransition();
  const busy=useRef(false);
  const [error,setError]=useState("");

  function toggle(key: string) {
    if(busy.current)return;
    busy.current=true;
    const previous=Boolean(state[key]);
    const next = !previous;
    setError("");
    setState((s) => ({ ...s, [key]: next }));
    start(async () => {
      try{
        const result=await toggleRequiredDoc(dealId, key, next);
        if(result.error){setState(s=>({...s,[key]:previous}));setError(result.error);}
        else router.refresh();
      }catch{
        setState(s=>({...s,[key]:previous}));
        setError("The required document could not be saved. Retry.");
      }finally{busy.current=false;}
    });
  }

  const got = REQUIRED_DOCS.filter((d) => state[d.key]).length;

  return (
    <section className="crm-checklist crm-document-section studio-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="crm-section-title text-sm font-semibold text-slate-500">Required documents</h2>
        <span className="rounded-sm border border-[#c9c8bc] bg-[#f3f0e8] px-2 py-1 text-xs font-semibold tabular-nums text-[#203449]">{got}/{REQUIRED_DOCS.length}</span>
      </div>
      <ul className="mt-3 divide-y divide-[#c9c8bc]/60">
        {REQUIRED_DOCS.map((d) => (
          <li key={d.key}>
            <button type="button" disabled={pending} aria-pressed={Boolean(state[d.key])} onClick={() => toggle(d.key)} className="flex min-h-11 w-full items-start gap-2.5 rounded-sm px-1.5 py-3 text-left text-sm leading-relaxed hover:bg-[#f3f0e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#203449] disabled:cursor-wait disabled:opacity-60">
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${state[d.key] ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300" : "border-[#8b928e] bg-[#fffdf7]"}`}>{state[d.key] ? "✓" : ""}</span>
              <span className={state[d.key] ? "text-slate-300" : "text-slate-400"}>{d.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    </section>
  );
}
