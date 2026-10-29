// Calendar-date helpers. Transaction dates are plain "YYYY-MM-DD" strings
// (matching Postgres `date`), so they never shift a day because of UTC.
// Date objects are only used internally in UTC for day arithmetic.

export type ISODate = string; // "YYYY-MM-DD"

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const match = ISO_RE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid date: ${date}`);
  }
  return { year, month, day };
}

export function isValidISODate(date: string): boolean {
  try {
    parseISODate(date);
    return true;
  } catch {
    return false;
  }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** month is 1–12 */
export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function toISO(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today's calendar date in an IANA timezone, e.g. todayIn("Asia/Shanghai"). */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return toISO(get("year"), get("month"), get("day"));
}

/** First day of the month containing date: "2026-10-11" → "2026-10-01". */
export function monthStart(date: ISODate): ISODate {
  const { year, month } = parseISODate(date);
  return toISO(year, month, 1);
}

/** Last day of the month containing date: "2028-02-10" → "2028-02-29". */
export function monthEnd(date: ISODate): ISODate {
  const { year, month } = parseISODate(date);
  return toISO(year, month, daysInMonth(year, month));
}

export function daysInMonthOf(date: ISODate): number {
  const { year, month } = parseISODate(date);
  return daysInMonth(year, month);
}

export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Shift a month start by n months: addMonths("2026-12-01", 1) → "2027-01-01". */
export function addMonths(monthStartDate: ISODate, months: number): ISODate {
  const { year, month } = parseISODate(monthStartDate);
  const index = year * 12 + (month - 1) + months;
  return toISO(Math.floor(index / 12), (index % 12) + 1, 1);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000,
  );
}

/** Days from a to b counting both ends. */
export function daysInclusive(a: ISODate, b: ISODate): number {
  return diffDays(a, b) + 1;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

/** "2026-10-01" → "October 2026" */
export function formatMonth(date: ISODate): string {
  const { year, month } = parseISODate(date);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
