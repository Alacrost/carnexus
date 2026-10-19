"use client";

import {csvFromRows} from "@/lib/csv";

// Client CSV export for a report table (headers + rows already computed on the server).
export function CsvButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  function download() {
    const columns=headers.map((label,index)=>({key:String(index),label}));
    const csv=csvFromRows(columns,rows.map(row=>Object.fromEntries(row.map((value,index)=>[String(index),value]))));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" onClick={download} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 hover:border-white/25">
      Download CSV
    </button>
  );
}
