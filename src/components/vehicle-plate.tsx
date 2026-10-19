export function VehiclePlate({registration,compact=false}:{registration:string|null|undefined;compact?:boolean}){
  if(!registration)return <span className="text-sm font-semibold text-[#595955]">Not recorded</span>;

  return <span role="img" aria-label={`Vehicle registration ${registration}`} className={`inline-flex max-w-full items-stretch overflow-hidden rounded-[5px] border-[3px] border-[#202322] bg-[#fafbf9] text-[#161817] shadow-[0_2px_3px_rgba(0,0,0,0.2),inset_0_0_0_1px_#c9cdc8] ${compact?"min-h-9":"min-h-12"}`}>
    <span aria-hidden="true" className={`flex shrink-0 flex-col items-center justify-center bg-[#164685] text-white ${compact?"w-7":"w-9"}`}>
      <span className="text-[10px] leading-none text-[#f6d44e]">✦</span>
      <span className="mt-0.5 text-[8px] font-bold leading-none tracking-wide">IRL</span>
    </span>
    <span aria-hidden="true" className={`min-w-0 self-center whitespace-nowrap font-sans font-extrabold leading-none tracking-[0.06em] tabular-nums ${compact?"px-2.5 text-base":"px-3 py-2 text-xl sm:text-2xl"}`}>{registration}</span>
  </span>;
}
