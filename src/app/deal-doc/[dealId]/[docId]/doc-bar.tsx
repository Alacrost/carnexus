"use client";

import Link from "next/link";

export function DocBar({ dealId }: { dealId: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur">
      <Link href={`/business/deals/${dealId}`} className="text-sm text-slate-500 hover:text-slate-900">← Back to deal</Link>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Print / PDF
        </button>
      </div>
    </div>
  );
}
