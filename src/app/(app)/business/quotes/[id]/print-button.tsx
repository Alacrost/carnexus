"use client";

export function PrintQuoteButton(){
  return <button type="button" onClick={()=>window.print()} className="border border-white/25 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200">Print quote / PDF</button>;
}
