"use client";

import {useState, type ReactNode} from "react";

export function DealEventLog({rows}:{rows:ReactNode[]}){
  const [visible,setVisible]=useState(3);
  return <section className="crm-event-log crm-document-section studio-surface p-4 sm:p-5">
    <h2 className="crm-section-title">Event Log</h2>
    <div className="mt-4 overflow-x-auto rounded-sm border border-[#c9c8bc]"><table className="w-full text-left text-sm leading-relaxed">
      <thead><tr className="border-y border-white/15">{["Timestamp","Employee","Event","Details","Linked"].map(label=><th key={label} scope="col" className="px-3 py-3 text-xs font-semibold">{label}</th>)}</tr></thead>
      <tbody>{rows.slice(0,visible)}{!rows.length&&<tr><td colSpan={5} className="p-4 text-slate-500">No events recorded yet.</td></tr>}</tbody>
    </table></div>
    {visible<rows.length&&<button type="button" onClick={()=>setVisible(count=>count+10)} className="mt-3 min-h-10 rounded-sm px-1 text-sm font-semibold text-slate-400 underline underline-offset-4 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#203449]">View more</button>}
  </section>;
}
