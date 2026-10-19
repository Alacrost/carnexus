"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, STAGE_ACCENT, stageLabel } from "@/lib/deals";
import { setDealStage } from "../actions";

export function DealStage({ dealId, stage }: { dealId: string; stage: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(stage);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing?<><select
      aria-label="Deal stage"
      value={selected}
      disabled={pending}
      onChange={(e) => setSelected(e.target.value)}
      className={`rounded-full border bg-white/[0.03] px-2.5 py-1 text-xs ${STAGE_ACCENT[selected]} disabled:opacity-50`}>
      {DEAL_STAGES.map((s) => (
        <option key={s} value={s}>{stageLabel(s)}</option>
      ))}
    </select><button type="button" disabled={pending} className="btn-gradient px-3 py-1.5 text-xs disabled:opacity-50" onClick={()=>{setError("");start(async()=>{const result=await setDealStage(dealId,selected);if(result.error){setError(result.error);return;}setEditing(false);router.refresh();});}}>{pending?"Updating…":"Update"}</button><button type="button" disabled={pending} className="btn-outline px-3 py-1.5 text-xs" onClick={()=>{setEditing(false);setError("");}}>Cancel</button></>:<><span className={`rounded-full border bg-white/[0.03] px-2.5 py-1 text-xs ${STAGE_ACCENT[stage]}`}>{stageLabel(stage)}</span><button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={()=>{setSelected(stage);setError("");setEditing(true);}}>Edit status</button></>}
      {error&&<p role="alert" className="w-full text-xs text-rose-400">{error}</p>}
    </div>
  );
}
