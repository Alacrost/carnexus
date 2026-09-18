// Deal pipeline stages (mirrors the CRM lead pipeline). Pure, shared client + server.

export const DEAL_STAGES = [
  "initial_contact",
  "vehicle_interest",
  "test_drive",
  "proposal",
  "negotiation",
  "closing",
  "after_sales",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number] | "cancelled";

export const STAGE_LABEL: Record<string, string> = {
  initial_contact: "Initial contact",
  vehicle_interest: "Vehicle interest",
  test_drive: "Test drive",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closing: "Closing",
  after_sales: "After sales",
  cancelled: "Cancelled",
};

// Board column accent (Tailwind classes) per stage.
export const STAGE_ACCENT: Record<string, string> = {
  initial_contact: "border-slate-500/40 text-slate-300",
  vehicle_interest: "border-sky-400/40 text-sky-300",
  test_drive: "border-cyan-400/40 text-cyan-300",
  proposal: "border-violet-400/40 text-violet-300",
  negotiation: "border-amber-400/40 text-amber-300",
  closing: "border-orange-400/40 text-orange-300",
  after_sales: "border-emerald-400/40 text-emerald-300",
  cancelled: "border-rose-400/40 text-rose-300",
};

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

// KYC / paperwork checklist on a deal (received yes/no). Keys stored in deals.required_docs.
export const REQUIRED_DOCS = [
  { key: "dl_front", label: "Driver's licence — front" },
  { key: "dl_back", label: "Driver's licence — back" },
  { key: "utility_bill", label: "Utility bill (proof of address)" },
  { key: "trade_vrc", label: "Trade-in VRC / logbook" },
] as const;

// Add-ons / supplementary sales sold alongside the car.
export const ADDON_KINDS = [
  ["warranty", "Warranty"],
  ["gap", "GAP insurance"],
  ["service_plan", "Service plan"],
  ["other", "Other"],
] as const;

export function addonKindLabel(kind: string): string {
  return ADDON_KINDS.find(([k]) => k === kind)?.[1] ?? kind;
}

// Money summary of a deal: retail price, trade-in value, what the customer pays net, and balance.
export function dealMoney(input: { retailPrice: number; sivTotal: number; paid: number }) {
  const retail = input.retailPrice || 0;
  const siv = input.sivTotal || 0;
  const costToChange = retail - siv;
  const balance = costToChange - (input.paid || 0);
  return { retail, siv, costToChange, paid: input.paid || 0, balance };
}

// VAT + totals frozen onto a document (Agreement/Invoice). Marginal scheme VAT is on the
// margin (needs cost); when cost is unknown it is shown as 0 with a margin-scheme note.
export function docFigures(input: {
  scheme: string;
  sale: number;
  retail: number;
  siv: number;
  totalCost?: number | null;
  deposits: number;
}) {
  const sale = input.sale || 0;
  const costToChange = (input.retail || 0) - (input.siv || 0);
  let vat = 0;
  let vatRate = 23;
  let vatLabel = "23%";
  if (input.scheme === "standard") {
    vat = (sale * 0.23) / 1.23;
  } else if (input.scheme === "margin") {
    vatLabel = "23% (margin scheme)";
    vat = input.totalCost != null ? (Math.max(0, sale - input.totalCost) * 0.23) / 1.23 : 0;
  } else {
    vatRate = 0;
    vatLabel = "No VAT";
  }
  const net = sale - vat;
  return {
    costToChange,
    net,
    vat,
    vatRate,
    vatLabel,
    subTotal: sale,
    invoiceTotal: sale,
    balanceInvoice: sale - (input.siv || 0) - (input.deposits || 0),
    balanceAgreement: costToChange - (input.deposits || 0),
  };
}

