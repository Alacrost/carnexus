"use client";

import type {ReactNode} from "react";
import {DraftDealSheet,type DraftDealSheetProps} from "./new/deal-sheet";
import {DealSheetContent,DealSheetSurface,type DealSheetContentProps} from "./deal-sheet-view";
import {DealNegotiationHighlight} from "./deal-workspace";

export function DealSheet(props:DraftDealSheetProps|{saved:DealSheetContentProps;children:ReactNode}){
  if(!("saved" in props))return <DraftDealSheet {...props}/>;
  return <DealSheetSurface>
    <DealNegotiationHighlight><DealSheetContent {...props.saved} flatSaleVehicle/></DealNegotiationHighlight>
    <div className="mt-6 space-y-5">{props.children}</div>
  </DealSheetSurface>;
}
