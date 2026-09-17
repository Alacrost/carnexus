"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/currency";
import { DEAL_STAGES, STAGE_ACCENT, stageLabel } from "@/lib/deals";
import { setDealStage } from "./actions";

export interface DealRow {
  id: string;
  deal_no: string;
  status: string;
  stage: string;
  currency: string;
  customer: string;
  car: string;
  sale: number;
  deposit: number;
  salesperson: string;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "—";
}

export function DealsBoard({ rows }: { rows: DealRow[] }) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");
  const [rep, setRep] = useState("all");
  const [, start] = useTransition();

  const reps = useMemo(() => [...new Set(rows.map((r) => r.salesperson).filter((s) => s && s !== "—"))].sort(), [rows]);
  const visible = rep === "all" ? rows : rows.filter((r) => r.salesperson === rep);

  const currency = rows[0]?.currency ?? "EUR";
  const totalValue = visible.reduce((a, r) => a + r.sale, 0);
  const totalDeposits = visible.reduce((a, r) => a + r.deposit, 0);

  function move(id: string, stage: string) {
    start(async () => {
      await setDealStage(id, stage);
      router.refresh();
    });
  }

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        value={rep}
        onChange={(e) => setRep(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-slate-300"
      >
        <option value="all">All salespeople</option>
        {reps.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">Deals <b className="text-slate-200">{visible.length}</b></span>
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">Pipeline <b className="text-slate-200 tabular-nums">{money(totalValue, currency)}</b></span>
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-slate-400">Deposits <b className="text-emerald-300 tabular-nums">{money(totalDeposits, currency)}</b></span>
      <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-white/10">
        {(["board", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 capitalize transition ${view === v ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Sales</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Deals pipeline</h1>
        </div>
        <Link href="/business/deals/new" className="btn-gradient text-sm">+ New deal</Link>
      </div>

      {filterBar}

      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {DEAL_STAGES.map((stage) => {
            const items = visible.filter((r) => r.stage === stage);
            const sum = items.reduce((a, r) => a + r.sale, 0);
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className={`mb-2 flex items-center justify-between rounded-lg border-l-2 bg-white/[0.03] px-2.5 py-1.5 ${STAGE_ACCENT[stage]}`}>
                  <span className="text-xs font-semibold">{stageLabel(stage)}</span>
                  <span className="text-[11px] text-slate-500">{items.length} · {money(sum, currency)}</span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <div key={r.id} className="group rounded-xl border border-white/10 bg-[#0b0f17]/70 p-2.5 transition hover:border-white/20">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/business/deals/${r.id}`} className="font-mono text-[11px] text-sky-400 hover:text-sky-300">{r.deal_no}</Link>
                        <span title={r.salesperson} className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-sky-500/70 to-violet-500/70 text-[9px] font-semibold text-white">{initials(r.salesperson)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-100">{r.customer}</p>
                      <p className="truncate text-[11px] text-slate-500">{r.car}</p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium tabular-nums text-slate-200">{money(r.sale, currency)}</span>
                        {r.deposit > 0 && <span className="text-[10px] text-emerald-400">dep {money(r.deposit, currency)}</span>}
                      </div>
                      <select
                        value={r.stage}
                        onChange={(e) => move(r.id, e.target.value)}
                        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[11px] text-slate-400 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                      >
                        {DEAL_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
                      </select>
                    </div>
                  ))}
                  {items.length === 0 && <div className="rounded-lg border border-dashed border-white/5 p-3 text-center text-[11px] text-slate-600">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="studio-surface overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5">Deal</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Car</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Rep</th>
                <th className="px-3 py-2.5 text-right">Sale</th>
                <th className="px-3 py-2.5 text-right">Deposit</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2"><Link href={`/business/deals/${r.id}`} className="font-mono text-sky-400 hover:text-sky-300">{r.deal_no}</Link></td>
                  <td className="px-3 py-2 text-slate-200">{r.customer}</td>
                  <td className="px-3 py-2 text-slate-400">{r.car}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] ${STAGE_ACCENT[r.stage]}`}>{stageLabel(r.stage)}</span></td>
                  <td className="px-3 py-2 text-slate-400">{r.salesperson}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(r.sale, currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{money(r.deposit, currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{money(r.sale - r.deposit, currency)}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">No open deals.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
