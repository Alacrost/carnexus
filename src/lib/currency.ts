// Single per-dealer currency (configured in Settings). EUR default.

export const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "Pound (£)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
];

export function currencySymbol(code: string | null | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "€";
}

export function money(n: number, code?: string | null): string {
  return currencySymbol(code) + Math.round(n).toLocaleString("en-IE");
}
