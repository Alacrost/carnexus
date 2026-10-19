export type HistoryAnswer = "unknown" | "no" | "yes";

export interface TradeInInput {
  registration: string;
  make: string;
  model: string;
  year: number;
  km: number;
  vin?: string;
  colour?: string;
  conditionNotes?: string;
  allowance: number;
  settlement: number;
  settlementProvider?: string;
  settlementReference?: string;
  settlementValidUntil?: string;
  history: {
    accident: HistoryAnswer;
    writeOff: HistoryAnswer;
    stolen: HistoryAnswer;
    mileageDiscrepancy: HistoryAnswer;
    source: "dealer_declaration" | "customer_declaration" | "vehicle_report";
    reportReference?: string;
    reportedOn?: string;
    notes?: string;
  };
}

export function tradeInEquity(trades: Pick<TradeInInput, "allowance" | "settlement">[]): number {
  return trades.reduce((total, trade) => total + trade.allowance - trade.settlement, 0);
}
