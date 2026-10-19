import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { BankWorkspace, type BankOverview } from "./bank-workspace";

const emptyOverview: BankOverview = { accounts: [], reconciliations: [], lines: [], candidates: [] };

export default async function BankPage({ searchParams }: { searchParams: Promise<{ reconciliation?: string }> }) {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.viewFinancials(session.role)) return <p className="text-sm text-slate-400">Your role does not include financial controls.</p>;

  const { reconciliation } = await searchParams;
  const selectedId = reconciliation && /^[0-9a-f-]{36}$/i.test(reconciliation) ? reconciliation : undefined;
  let overview = emptyOverview;
  let loadError = "";
  const demo = isDemoMode();
  if (!demo) {
    const db = await createClient();
    const { data, error } = await db.rpc("bank_reconciliation_overview", { p_dealer: session.dealer.id, p_reconciliation: selectedId ?? null });
    if (error) loadError = "Bank reconciliation could not load. Apply migration 057 and check your financial permissions.";
    else overview = data as unknown as BankOverview;
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance studio</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gradient">Bank reconciliation</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Match every bank statement movement to customer receipts, refunds, supplier payments and lender settlements before locking the period.</p>
      </div>
      <Link href="/business/reports" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.07] hover:text-white">View financial reports</Link>
    </header>
    {loadError ? <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{loadError}</div> : <BankWorkspace overview={overview} selectedId={selectedId} demo={demo} />}
  </div>;
}
