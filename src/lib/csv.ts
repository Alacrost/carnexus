export type CsvValue = string | number | boolean | null | undefined;

function safeCell(value: CsvValue) {
  const raw = value == null ? "" : String(value);
  if((typeof value==="number"&&Number.isFinite(value))||/^-\d+(\.\d+)?$/.test(raw))return raw;
  return /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

function quote(value: CsvValue) {
  return `"${safeCell(value).replaceAll('"', '""')}"`;
}

export function csvFromRows(columns: readonly { key: string; label: string }[], rows: Record<string, CsvValue>[]) {
  return [columns.map((column) => quote(column.label)).join(","), ...rows.map((row) => columns.map((column) => quote(row[column.key])).join(","))].join("\r\n");
}
