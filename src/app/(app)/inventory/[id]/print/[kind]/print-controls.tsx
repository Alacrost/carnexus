"use client";
import Link from "next/link";
export function PrintControls({vehicleId,canPrint=true}:{vehicleId:string;canPrint?:boolean}) {
  return <div className="vehicle-print-toolbar mb-5 flex items-center justify-between gap-3 border-b border-black/10 pb-4">
    <Link href={`/inventory/${vehicleId}`} className="text-sm text-slate-600">← Vehicle details</Link>
    <button type="button" disabled={!canPrint} onClick={()=>window.print()} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-black/20 disabled:bg-black/20 disabled:text-black/50">Print / save PDF</button>
  </div>;
}
