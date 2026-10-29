// Spending calendar: a month grid (weeks start Monday) and heat levels based on
// how a day's personal spending compares with the daily allowance.

import { type ISODate, addDays, monthEnd, monthStart, parseISODate } from "./dates";

/** Weeks of the month, Monday first; null pads days outside the month. */
export function monthGrid(month: ISODate): (ISODate | null)[][] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const { year, month: m, day } = parseISODate(first);
  const lead = (new Date(Date.UTC(year, m - 1, day)).getUTCDay() + 6) % 7; // Monday = 0
  const cells: (ISODate | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * 0 = nothing spent · 1 = up to half the daily allowance · 2 = up to the
 * allowance · 3 = up to 1.5× · 4 = more than 1.5×.
 */
export function heatLevel(spentFen: number, allowanceFen: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (spentFen <= 0) return 0;
  if (allowanceFen <= 0) return 2;
  const r = spentFen / allowanceFen;
  if (r <= 0.5) return 1;
  if (r <= 1) return 2;
  if (r <= 1.5) return 3;
  if (r <= 2) return 4;
  return 5;
}

/** Sum of signed amounts dated on or before a date: a ledger's balance "as of" that day. */
export function balanceAsOf(rows: { date: ISODate; deltaFen: number }[], date: ISODate): number {
  return rows.filter((r) => r.date <= date).reduce((s, r) => s + r.deltaFen, 0);
}

/** "¥1.2k" style label for small calendar cells. */
export function compactYuan(fen: number): string {
  const yuan = fen / 100;
  if (yuan >= 1000) return `${(yuan / 1000).toFixed(yuan >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return yuan >= 100 ? Math.round(yuan).toString() : yuan.toFixed(yuan % 1 === 0 ? 0 : 1).replace(/\.0$/, "");
}
