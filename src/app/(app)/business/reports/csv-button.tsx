"use client";

// Client CSV export for a report table (headers + rows already computed on the server).
export function CsvButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  function download() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
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
