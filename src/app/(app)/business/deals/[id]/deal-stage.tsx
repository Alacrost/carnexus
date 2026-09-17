"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, STAGE_ACCENT, stageLabel } from "@/lib/deals";
import { setDealStage } from "../actions";

export function DealStage({ dealId, stage }: { dealId: string; stage: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={stage}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setDealStage(dealId, e.target.value);
          router.refresh();
        })
      }
      className={`rounded-full border bg-white/[0.03] px-2.5 py-1 text-xs ${STAGE_ACCENT[stage]} disabled:opacity-50`}
    >
      {DEAL_STAGES.map((s) => (
        <option key={s} value={s}>{stageLabel(s)}</option>
      ))}
    </select>
  );
}
