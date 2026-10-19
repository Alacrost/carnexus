"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/currency";
import {
  addBankStatementLine,
  completeBankReconciliation,
  createBankAccount,
  matchBankTransaction,
  removeBankMatch,
  startBankReconciliation,
  importBankStatement,
} from "./actions";

export interface BankAccountView {
  id: string; name: string; currency: string; reference?: string | null; openingBalance: number; active: boolean;
}
export interface BankReconciliationView {
  id: string; accountId: string; account: string; periodStart: string; periodEnd: string;
  openingBalance: number; closingBalance: number; status: "draft" | "completed"; completedAt?: string | null;
}
export interface BankMatchView { id: string; sourceType: "sale_payment" | "purchase_payment"; sourceId: string; amount: number }
export interface BankLineView {
  id: string; date: string; description: string; reference?: string | null; amount: number;
  matched: number; unmatched: number; matches: BankMatchView[];
}
export interface BankCandidateView {
  sourceType: "sale_payment" | "purchase_payment"; id: string; date: string; direction: 1 | -1;
  amount: number; matched: number; available: number; label: string;
}
export interface BankOverview {
  accounts: BankAccountView[]; reconciliations: BankReconciliationView[]; lines: BankLineView[]; candidates: BankCandidateView[];
}

type Result = { error?: string; id?: string };
const NO_LINES: BankLineView[] = [];

export function BankWorkspace({ overview, selectedId, demo }: { overview: BankOverview; selectedId?: string; demo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = selectedId ? overview.reconciliations.find((item) => item.id === selectedId) : undefined;
  const lines = selected ? overview.lines : NO_LINES;
  const statementMovement = useMemo(() => lines.reduce((total, line) => total + Number(line.amount), 0), [lines]);
  const unmatched = useMemo(() => lines.reduce((total, line) => total + Number(line.unmatched), 0), [lines]);
  const computedClosing = Number(selected?.openingBalance ?? 0) + statementMovement;

  function perform(job: () => Promise<Result>, onSuccess?: (result: Result) => void) {
    setError("");
    startTransition(async () => {
      const result = await job();
      if (result.error) setError(result.error);
      else { onSuccess?.(result); router.refresh(); }
    });
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    perform(() => createBankAccount({
      name: String(form.get("name") ?? ""), currency: String(form.get("currency") ?? "EUR"),
      reference: String(form.get("reference") ?? ""), openingBalance: Number(form.get("openingBalance")), requestId: crypto.randomUUID(),
    }), () => event.currentTarget.reset());
  }

  function startPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    perform(() => startBankReconciliation({
      accountId: String(form.get("accountId")), periodStart: String(form.get("periodStart")), periodEnd: String(form.get("periodEnd")),
      openingBalance: Number(form.get("openingBalance")), closingBalance: Number(form.get("closingBalance")), requestId: crypto.randomUUID(),
    }), (result) => { if (result.id) router.push(`/business/bank?reconciliation=${result.id}`); });
  }

  function addLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const target = event.currentTarget; const form = new FormData(target);
    perform(() => addBankStatementLine({
      reconciliationId: selected.id, transactionDate: String(form.get("transactionDate")), description: String(form.get("description")),
      reference: String(form.get("reference") ?? ""), amount: Number(form.get("amount")), requestId: crypto.randomUUID(),
    }), () => target.reset());
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form=new FormData(event.currentTarget);const file=form.get("statement");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) { setError("Choose a CSV statement file."); return; }
    try {
      const rows=parseStatementCsv(await file.text());
      perform(()=>importBankStatement({reconciliationId:selected.id,fileName:file.name,lines:rows,requestId:crypto.randomUUID()}));
    } catch (caught) { setError(caught instanceof Error?caught.message:"The CSV file could not be read."); }
  }

  return <div className="space-y-5">
    {demo && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Preview only. Connect the hosted database to create accounts and reconcile live transactions.</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="studio-surface overflow-hidden">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Statement control room</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Reconciliation periods</h2>
        </div>
        {overview.reconciliations.length === 0 ? <p className="p-5 text-sm text-slate-500">Create an account and its first statement period.</p> : <div className="divide-y divide-white/5">
          {overview.reconciliations.map((reconciliation) => <Link key={reconciliation.id} href={`/business/bank?reconciliation=${reconciliation.id}`} className={`grid gap-3 px-5 py-4 transition hover:bg-white/[0.035] sm:grid-cols-[1fr_auto_auto] ${selected?.id === reconciliation.id ? "bg-sky-400/[0.06]" : ""}`}>
            <div><p className="font-medium text-slate-200">{reconciliation.account}</p><p className="mt-0.5 text-xs text-slate-500">{reconciliation.periodStart} → {reconciliation.periodEnd}</p></div>
            <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-slate-500">Statement close</p><p className="text-sm tabular-nums text-slate-200">{money(Number(reconciliation.closingBalance), accountCurrency(overview.accounts, reconciliation.accountId))}</p></div>
            <span className={`self-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${reconciliation.status === "completed" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/10 text-amber-200"}`}>{reconciliation.status}</span>
          </Link>)}
        </div>}
      </section>

      <div className="space-y-4">
        <details className="studio-surface p-4" open={overview.accounts.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Add bank account</summary>
          <form onSubmit={createAccount} className="mt-4 grid gap-3">
            <label className="text-xs text-slate-400">Account name<input name="name" required minLength={2} maxLength={100} placeholder="Main current account" className="studio-input" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Currency<input name="currency" defaultValue="EUR" maxLength={3} required className="studio-input uppercase" /></label><label className="text-xs text-slate-400">Opening balance<input name="openingBalance" type="number" step="0.01" defaultValue="0.00" required className="studio-input" /></label></div>
            <label className="text-xs text-slate-400">Account reference<input name="reference" maxLength={80} placeholder="IBAN ending / nickname" className="studio-input" /></label>
            <button disabled={demo || pending} className="btn-gradient justify-center disabled:opacity-40">Create account</button>
          </form>
        </details>
        <details className="studio-surface p-4" open={overview.reconciliations.length === 0 && overview.accounts.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Start statement period</summary>
          <form onSubmit={startPeriod} className="mt-4 grid gap-3">
            <label className="text-xs text-slate-400">Bank account<select name="accountId" required className="studio-input"><option value="">Choose…</option>{overview.accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">From<input name="periodStart" type="date" required className="studio-input" /></label><label className="text-xs text-slate-400">To<input name="periodEnd" type="date" required className="studio-input" /></label></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Opening<input name="openingBalance" type="number" step="0.01" required className="studio-input" /></label><label className="text-xs text-slate-400">Statement close<input name="closingBalance" type="number" step="0.01" required className="studio-input" /></label></div>
            <button disabled={demo || pending || overview.accounts.length === 0} className="btn-gradient justify-center disabled:opacity-40">Open period</button>
          </form>
        </details>
      </div>
    </div>

    {selected && <>
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Metric label="Opening" value={money(Number(selected.openingBalance), accountCurrency(overview.accounts, selected.accountId))} />
        <Metric label="Statement movement" value={money(statementMovement, accountCurrency(overview.accounts, selected.accountId))} accent={statementMovement >= 0 ? "text-emerald-300" : "text-rose-300"} />
        <Metric label="Calculated close" value={money(computedClosing, accountCurrency(overview.accounts, selected.accountId))} />
        <Metric label="Statement close" value={money(Number(selected.closingBalance), accountCurrency(overview.accounts, selected.accountId))} accent={computedClosing === Number(selected.closingBalance) ? "text-emerald-300" : "text-amber-300"} />
        <Metric label="Unmatched" value={money(unmatched, accountCurrency(overview.accounts, selected.accountId))} accent={unmatched === 0 ? "text-emerald-300" : "text-amber-300"} />
      </section>

      {selected.status === "draft" && <><form onSubmit={importCsv} className="studio-surface flex flex-wrap items-end gap-3 p-4"><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-200">Import bank CSV</h2><p className="mt-1 text-xs text-slate-500">Header: Date, Description, Reference, Amount. Amount must be signed: positive for money in, negative for money out. Maximum 1,000 rows.</p></div><input name="statement" type="file" accept=".csv,text/csv" required className="max-w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-200"/><button disabled={demo||pending} className="rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-200 disabled:opacity-40">Import atomically</button></form><form onSubmit={addLine} className="studio-surface grid gap-3 p-4 lg:grid-cols-[150px_1fr_180px_150px_auto] lg:items-end">
        <label className="text-xs text-slate-400">Statement date<input name="transactionDate" type="date" min={selected.periodStart} max={selected.periodEnd} required className="studio-input" /></label>
        <label className="text-xs text-slate-400">Description<input name="description" required maxLength={300} placeholder="Statement narrative" className="studio-input" /></label>
        <label className="text-xs text-slate-400">Reference<input name="reference" maxLength={120} className="studio-input" /></label>
        <label className="text-xs text-slate-400">Amount<input name="amount" type="number" step="0.01" required placeholder="+ receipt / − paid" className="studio-input" /></label>
        <button disabled={demo || pending} className="btn-gradient h-[42px] justify-center disabled:opacity-40">Add line</button>
      </form></>}

      <section className="studio-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Statement matching</h2><p className="mt-1 text-xs text-slate-500">Positive lines match receipts. Negative lines match supplier or lender payments. Split matching is supported.</p></div>{selected.status === "draft" && <button type="button" disabled={demo || pending || lines.length === 0} onClick={() => perform(() => completeBankReconciliation({ id: selected.id, requestId: crypto.randomUUID() }))} className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-300/15 disabled:opacity-40">Complete reconciliation</button>}</div>
        {lines.length === 0 ? <p className="p-5 text-sm text-slate-500">No statement lines recorded for this period.</p> : <div className="divide-y divide-white/5">{lines.map((line) => <StatementLine key={line.id} line={line} currency={accountCurrency(overview.accounts, selected.accountId)} candidates={overview.candidates} closed={selected.status === "completed"} disabled={demo || pending} perform={perform} />)}</div>}
      </section>
    </>}
  </div>;
}

function StatementLine({ line, currency, candidates, closed, disabled, perform }: { line: BankLineView; currency: string; candidates: BankCandidateView[]; closed: boolean; disabled: boolean; perform: (job: () => Promise<Result>, success?: (result: Result) => void) => void }) {
  const suitable = candidates.filter((candidate) => candidate.direction === (Number(line.amount) > 0 ? 1 : -1));
  function match(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const raw = String(form.get("candidate")); const [sourceType, sourceId] = raw.split(":");
    perform(() => matchBankTransaction({ lineId: line.id, sourceType: sourceType as BankCandidateView["sourceType"], sourceId, amount: Number(form.get("amount")), requestId: crypto.randomUUID() }));
  }
  return <article className="px-5 py-4">
    <div className="grid gap-3 lg:grid-cols-[120px_1fr_140px_130px] lg:items-start">
      <div><p className="font-mono text-xs text-slate-400">{line.date}</p><p className="mt-1 text-[10px] text-slate-600">{line.reference || "No reference"}</p></div>
      <div><p className="text-sm text-slate-200">{line.description}</p><div className="mt-2 flex flex-wrap gap-1">{line.matches.map((match) => <span key={match.id} className="inline-flex items-center gap-1 rounded-full border border-sky-300/15 bg-sky-300/[0.07] px-2 py-1 text-[10px] text-sky-200">{match.sourceType === "sale_payment" ? "Sale receipt" : "Purchase payment"} · {money(Number(match.amount), currency)}{!closed && <button type="button" aria-label="Remove match" disabled={disabled} onClick={() => perform(() => removeBankMatch({ id: match.id, requestId: crypto.randomUUID() }))} className="ml-1 text-slate-500 hover:text-rose-300">×</button>}</span>)}</div></div>
      <div className="text-right"><p className={`text-base font-semibold tabular-nums ${Number(line.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(Number(line.amount), currency)}</p><p className="text-[10px] text-slate-500">Matched {money(Number(line.matched), currency)}</p></div>
      <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-slate-500">Remaining</p><p className={`mt-1 font-semibold tabular-nums ${Number(line.unmatched) === 0 ? "text-emerald-300" : "text-amber-300"}`}>{money(Number(line.unmatched), currency)}</p></div>
    </div>
    {!closed && Number(line.unmatched) > 0 && <form onSubmit={match} className="mt-3 grid gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-2 sm:grid-cols-[1fr_140px_auto]">
      <select name="candidate" required className="studio-input text-xs"><option value="">Choose an unmatched {Number(line.amount) > 0 ? "receipt" : "payment"}…</option>{suitable.map((candidate) => <option key={`${candidate.sourceType}:${candidate.id}`} value={`${candidate.sourceType}:${candidate.id}`}>{candidate.date} · {candidate.label} · {money(Number(candidate.available), currency)} available</option>)}</select>
      <input name="amount" type="number" min="0.01" max={Number(line.unmatched)} step="0.01" defaultValue={Number(line.unmatched).toFixed(2)} required className="studio-input text-xs" />
      <button disabled={disabled || suitable.length === 0} className="rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 text-xs font-semibold text-sky-200 hover:bg-sky-300/15 disabled:opacity-40">Match</button>
    </form>}
  </article>;
}

function Metric({ label, value, accent = "text-slate-100" }: { label: string; value: string; accent?: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>{value}</p></div>;
}

function accountCurrency(accounts: BankAccountView[], accountId: string) {
  return accounts.find((account) => account.id === accountId)?.currency ?? "EUR";
}

function parseStatementCsv(text:string) {
  const records:string[][]=[];let row:string[]=[];let field="";let quoted=false;
  for(let index=0;index<text.length;index++){const char=text[index];if(char==='"'){if(quoted&&text[index+1]==='"'){field+='"';index++;}else quoted=!quoted;}else if(char===','&&!quoted){row.push(field);field="";}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[index+1]==='\n')index++;row.push(field);if(row.some(value=>value.trim()))records.push(row);row=[];field="";}else field+=char;}
  row.push(field);if(row.some(value=>value.trim()))records.push(row);if(records.length<2)throw new Error("The CSV must include a header and at least one row.");
  const headers=records[0].map(value=>value.trim().toLowerCase().replace(/^\ufeff/,""));const date=headers.indexOf("date"),description=headers.indexOf("description"),reference=headers.indexOf("reference"),amount=headers.indexOf("amount");
  if(date<0||description<0||amount<0)throw new Error("Required CSV headers: Date, Description and Amount.");
  if(records.length-1>1000)throw new Error("A statement import is limited to 1,000 rows.");
  return records.slice(1).map((values,index)=>{const rawDate=(values[date]??"").trim();const match=rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);const normalized=match?`${match[3]}-${match[2]}-${match[1]}`:rawDate;const rawAmount=(values[amount]??"").trim().replace(/[€\s]/g,"").replace(/,/g,"");const numeric=Number(rawAmount);if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized)||!(values[description]??"").trim()||!Number.isFinite(numeric)||numeric===0)throw new Error(`Invalid statement data on CSV row ${index+2}.`);return {date:normalized,description:(values[description]??"").trim(),reference:reference>=0?(values[reference]??"").trim():"",amount:numeric};});
}
