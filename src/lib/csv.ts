// CSV helpers for the transaction export (opens cleanly in Excel / Numbers / Sheets).

/** Quote a field when needed, and neutralise spreadsheet formulas in text (=, +, -, @). */
export function csvField(value: string | number | null | undefined, { text = true } = {}): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM + CRLF lines, so Excel shows Chinese notes correctly. */
export function toCsv(header: string[], rows: (string | number | null)[][], numericColumns: Set<number>): string {
  const lines = [header.map((h) => csvField(h)).join(",")];
  for (const r of rows) lines.push(r.map((v, i) => csvField(v, { text: !numericColumns.has(i) })).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
