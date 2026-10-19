"use client";

import { useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { doneDealVehicleUrl, publicVehicleUrl } from "@/lib/vehicle-public-links";
import { PrintControls } from "./print-controls";

type PrintKind = "window-sign" | "asset-tag" | "label";
type PrintVehicle = {
  id:string; make:string; model:string; year:number; km:number; registration:string|null;
  fuel:string; transmission:string; sale_price:number|null;
};

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";
const euro=(amount:number|null)=>amount==null?"Price on application":new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(amount);

export function VehiclePrintDocument({kind,vehicleId,vehicle,reference,dealerName,contact,detail,sitePath,doneDealAdId}:{
  kind:PrintKind;vehicleId:string;vehicle:PrintVehicle;reference:string;dealerName:string;
  contact:{phone?:string|null;email?:string|null}|null;
  detail:{trim?:string|null;co2_g_km?:number|null;service_history?:string|null}|null;
  sitePath:string|null;doneDealAdId:string|null;
}) {
  const origin=useSyncExternalStore(subscribe,browserOrigin,serverOrigin);
  const websiteUrl=publicVehicleUrl(origin,sitePath);
  const [source,setSource]=useState<"website"|"donedeal">(sitePath?"website":"donedeal");
  const [manualDoneDeal,setManualDoneDeal]=useState("");
  const doneDealUrl=doneDealVehicleUrl(manualDoneDeal);
  const qrUrl=source==="website"?websiteUrl:doneDealUrl;
  const needsQr=kind!=="label";
  const canPrint=!needsQr||!!qrUrl;

  return <div className="vehicle-print mx-auto max-w-[1120px] bg-white p-5 text-[#171717]">
    <PrintControls vehicleId={vehicleId} canPrint={canPrint}/>
    {needsQr&&<div className="vehicle-print-toolbar mb-5 border border-black/15 bg-[#f7f7f5] p-4 text-sm text-[#242423]">
      <p className="font-semibold">QR code destination</p>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="radio" name="qr-source" checked={source==="website"} onChange={()=>setSource("website")}/>Dealer website</label>
        <label className="flex items-center gap-2"><input type="radio" name="qr-source" checked={source==="donedeal"} onChange={()=>setSource("donedeal")}/>DoneDeal vehicle ad</label>
      </div>
      {source==="website"?<p className="mt-3 text-xs text-[#52524e]">{websiteUrl?"Uses this vehicle’s live public page.":sitePath?"Open the hosted app to print a public QR; localhost links cannot be scanned by customers.":"Publish the dealer site and make this car visible before using its website link."}</p>:<div className="mt-3">
        <label className="block text-xs font-semibold" htmlFor="donedeal-vehicle-url">Specific DoneDeal listing URL</label>
        <input id="donedeal-vehicle-url" type="url" inputMode="url" autoComplete="url" placeholder="https://www.donedeal.ie/cars-for-sale/..." value={manualDoneDeal} onChange={event=>setManualDoneDeal(event.target.value)} className="mt-1 w-full max-w-xl border border-black/25 bg-white px-3 py-2 text-sm text-[#191918]"/>
        <p className="mt-1 text-xs text-[#52524e]">{doneDealAdId?`Ad ID ${doneDealAdId} is recorded, but its public URL is not synced yet. Paste and verify the live listing link.`:"Paste and verify the live vehicle listing link. The seller profile URL is not enough."}</p>
      </div>}
      {qrUrl?<p className="mt-3 break-all text-xs font-medium text-[#1f1f1d]">Printing QR for: {qrUrl}</p>:<p role="status" className="mt-3 text-xs font-semibold text-[#8b4b00]">A valid public vehicle link is required before printing this QR.</p>}
    </div>}
    {kind==="window-sign"?<article className="vehicle-print-sheet min-h-[650px] border border-black/10 p-8 sm:p-10">
      <header className="flex items-start justify-between gap-8 border-b-[3px] border-black pb-5"><div><p className="text-3xl font-bold tracking-tight">{dealerName}</p><p className="mt-3 text-sm text-[#444440]">{[contact?.phone,contact?.email].filter(Boolean).join(" · ")}</p></div><div className="bg-[#f2f2ef] px-5 py-4 text-sm"><p><b>Ref:</b> {reference}</p><p className="mt-1"><b>Plate:</b> {vehicle.registration??"—"}</p></div></header>
      <div className="mt-8"><p className="text-sm uppercase tracking-[0.2em] text-[#52524e]">Vehicle details</p><h1 className="mt-2 text-5xl font-bold tracking-tight">{vehicle.make} {vehicle.model}</h1><p className="mt-2 text-2xl font-semibold text-[#444440]">{detail?.trim??vehicle.year}</p></div>
      <div className="mt-8 grid grid-cols-2 gap-x-12 gap-y-3 border-y border-black/10 py-6 text-lg">
        <p><span className="text-[#52524e]">Year</span><br/><b>{vehicle.year}</b></p><p><span className="text-[#52524e]">Odometer</span><br/><b>{vehicle.km.toLocaleString("en-IE")} km</b></p>
        <p><span className="text-[#52524e]">Fuel</span><br/><b className="capitalize">{vehicle.fuel}</b></p><p><span className="text-[#52524e]">Transmission</span><br/><b className="capitalize">{vehicle.transmission}</b></p>
        <p><span className="text-[#52524e]">Service history</span><br/><b className="capitalize">{detail?.service_history?.replaceAll("_"," ")??"Not recorded"}</b></p><p><span className="text-[#52524e]">CO₂ emissions</span><br/><b>{detail?.co2_g_km!=null?`${detail.co2_g_km} g/km`:"Not recorded"}</b></p>
      </div>
      <div className="mt-6 flex items-end justify-between gap-6"><div><p className="text-5xl font-bold tracking-tight">{euro(vehicle.sale_price)}</p><p className="mt-2 text-xs text-[#52524e]">Scan to view the current vehicle listing</p></div><QrBox url={qrUrl} size={145}/></div>
    </article>:kind==="asset-tag"?<article className="vehicle-print-sheet mx-auto max-w-xl border-2 border-black p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em]">Vehicle asset tag</p>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5"><div><h1 className="font-mono text-5xl font-bold tracking-tight">{reference}</h1><p className="mt-4 text-xl font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</p><p className="mt-4 font-mono text-lg">Plate: {vehicle.registration??"—"}</p><p className="mt-4 text-xs text-[#52524e]">{dealerName}</p></div><QrBox url={qrUrl} size={205}/></div>
      <p className="mt-5 border-t border-black/20 pt-3 text-xs font-semibold">Scan for the vehicle listing</p>
    </article>:<article className="vehicle-print-sheet mx-auto max-w-xl border-2 border-black p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em]">Stock label</p>
      <h1 className="mt-4 font-mono text-5xl font-bold tracking-tight">{reference}</h1>
      <p className="mt-3 text-xl font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</p>
      <p className="mt-5 border-t border-black pt-4 font-mono text-xl">Plate: {vehicle.registration??"—"}</p>
      <p className="mt-3 text-xs text-[#52524e]">{dealerName}</p>
    </article>}
  </div>;
}

function QrBox({url,size}:{url:string|null;size:number}) {
  return <div className="shrink-0 border border-black/15 bg-white p-2">{url?<QRCodeSVG value={url} size={size} level="M" marginSize={4} bgColor="#ffffff" fgColor="#111111" title="Public vehicle listing QR code"/>:<div style={{width:size,height:size}} className="grid place-items-center bg-[#f2f2ef] p-3 text-center text-xs text-[#595955]">QR available after selecting a public vehicle URL</div>}</div>;
}
