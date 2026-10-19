// Money math for the Sales & Accounting module. Pure + deterministic.
// Irish used-car VAT: cars typically use the "normal/standard" scheme; commercial
// vehicles are 23% standard; some stock uses the margin scheme (VAT on the profit only).
// Prices are treated as VAT-inclusive (Irish retail), so VAT is extracted, not added.

export type VatScheme = "standard" | "margin" | "none";
export const VAT_RATE = 0.23;

export interface DealNumbers {
  purchasePrice: number;
  costs: number; // sum of cost line-items
  salePrice: number;
  vatScheme: VatScheme;
  vatRate?: number; // percent, frozen on the acquisition
  vrtAmount?: number; // acquisition cost; never a second customer charge
  vrtVatTreatment?: "included" | "excluded";
}

export interface DealResult {
  totalCost: number; // purchase + costs
  grossMargin: number; // sale - totalCost
  vat: number; // per scheme (VAT-inclusive extraction)
  netProfit: number; // grossMargin - vat
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function vatOn(salePrice: number, grossMargin: number, scheme: VatScheme, rate = 23): number {
  if (salePrice <= 0) return 0;
  const f = rate / (100 + rate); // extract VAT from a VAT-inclusive amount
  if (scheme === "standard") return round2(salePrice * f);
  if (scheme === "margin") return round2(Math.max(0, grossMargin) * f);
  return 0;
}

export function computeDeal(d: DealNumbers): DealResult {
  const totalCost = round2((d.purchasePrice || 0) + (d.costs || 0) + (d.vrtAmount || 0));
  const grossMargin = round2((d.salePrice || 0) - totalCost);
  const vat = vatOn((d.salePrice || 0) - (d.vrtVatTreatment === "excluded" ? d.vrtAmount || 0 : 0), (d.salePrice || 0) - (d.purchasePrice || 0), d.vatScheme, d.vatRate);
  return { totalCost, grossMargin, vat, netProfit: round2(grossMargin - vat) };
}

// One runnable check — asserts the money math holds (ponytail: keep the check with the logic).
export function financeSelfCheck(): void {
  const std = computeDeal({ purchasePrice: 10000, costs: 500, salePrice: 12300, vatScheme: "standard" });
  console.assert(std.totalCost === 10500, "totalCost");
  console.assert(std.grossMargin === 1800, "grossMargin");
  console.assert(std.vat === 2300, "standard VAT 23/123 of 12300"); // 12300*0.23/1.23
  console.assert(std.netProfit === -500, "netProfit std");

  const mar = computeDeal({ purchasePrice: 10000, costs: 0, salePrice: 12300, vatScheme: "margin" });
  console.assert(mar.vat === 430.08, "margin VAT 23/123 of 2300"); // 2300*0.23/1.23 = 430
  console.assert(mar.netProfit === 1869.92, "netProfit margin");

  const none = computeDeal({ purchasePrice: 5000, costs: 200, salePrice: 6000, vatScheme: "none" });
  console.assert(none.vat === 0 && none.netProfit === 800, "none scheme");
}
