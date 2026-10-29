// Electricity + water bills (roughly every 3 months) and housing cost.

import { type ISODate, addDays, addMonths, daysInclusive, monthEnd, monthStart, parseISODate } from "./dates";
import { percentChange, roundDiv } from "./money";

export type UtilityBill = {
  periodStart: ISODate;
  periodEnd: ISODate;
  totalFen: number;
};

/** Average days per month (365.25 ÷ 12 = 30.4375 = 487/16). */
const AVG_MONTH_NUM = 487;
const AVG_MONTH_DEN = 16;

/**
 * Number of whole calendar months a bill covers, when it runs from the 1st of
 * a month to the last day of a month (e.g. 1 Sep – 30 Nov → 3). Otherwise null.
 */
export function wholeMonthsCovered(periodStart: ISODate, periodEnd: ISODate): number | null {
  const s = parseISODate(periodStart);
  if (s.day !== 1 || monthEnd(periodEnd) !== periodEnd) return null;
  const e = parseISODate(periodEnd);
  return (e.year - s.year) * 12 + (e.month - s.month) + 1;
}

/**
 * Monthly average of a bill: total ÷ months for whole-month periods
 * (¥320 over Sep–Nov → ¥106.67), otherwise total ÷ days × 30.4375.
 */
export function monthlyAverageFen(bill: UtilityBill): number {
  const months = wholeMonthsCovered(bill.periodStart, bill.periodEnd);
  if (months !== null) return roundDiv(bill.totalFen, months);
  const days = daysInclusive(bill.periodStart, bill.periodEnd);
  return roundDiv(bill.totalFen * AVG_MONTH_NUM, days * AVG_MONTH_DEN);
}

export type BillComparison = {
  totalDiffFen: number; // raw bill difference
  monthlyDiffFen: number; // difference in monthly average (fair when periods differ in length)
  percent: number | null; // based on monthly averages
  direction: "up" | "down" | "same";
};

export function compareBills(previous: UtilityBill, current: UtilityBill): BillComparison {
  const prevAvg = monthlyAverageFen(previous);
  const currAvg = monthlyAverageFen(current);
  const monthlyDiffFen = currAvg - prevAvg;
  return {
    totalDiffFen: current.totalFen - previous.totalFen,
    monthlyDiffFen,
    percent: percentChange(prevAvg, currAvg),
    direction: monthlyDiffFen > 0 ? "up" : monthlyDiffFen < 0 ? "down" : "same",
  };
}

export type UtilityInsights = {
  latest: UtilityBill;
  previous: UtilityBill | null;
  comparison: BillComparison | null;
  latestMonthlyFen: number;
  historicalMonthlyFen: number; // average of all bills' monthly averages
  highest: UtilityBill;
  lowest: UtilityBill;
  nextPeriod: { start: ISODate; end: ISODate }; // the period the next bill will likely cover
};

/**
 * The period the next bill will probably cover: same length, starting the day
 * after the latest one ends (Jun–Aug → Sep–Nov).
 */
export function nextBillPeriod(latest: UtilityBill): { start: ISODate; end: ISODate } {
  const start = addDays(latest.periodEnd, 1);
  const months = wholeMonthsCovered(latest.periodStart, latest.periodEnd);
  if (months !== null) return { start, end: monthEnd(addMonths(start, months - 1)) };
  return { start, end: addDays(start, daysInclusive(latest.periodStart, latest.periodEnd) - 1) };
}

/** Insights across bills (any order). Highest/lowest compare monthly averages. */
export function utilityInsights(bills: UtilityBill[]): UtilityInsights | null {
  if (bills.length === 0) return null;
  const sorted = [...bills].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const withAvg = sorted.map((bill) => ({ bill, avg: monthlyAverageFen(bill) }));
  const byAvg = [...withAvg].sort((a, b) => a.avg - b.avg);
  return {
    latest,
    previous,
    comparison: previous ? compareBills(previous, latest) : null,
    latestMonthlyFen: monthlyAverageFen(latest),
    historicalMonthlyFen: roundDiv(withAvg.reduce((sum, x) => sum + x.avg, 0), withAvg.length),
    highest: byAvg[byAvg.length - 1].bill,
    lowest: byAvg[0].bill,
    nextPeriod: nextBillPeriod(latest),
  };
}

/** Housing cost per month = rent + utilities monthly average. */
export function housingMonthlyFen(rentFen: number, bill: UtilityBill | null): number {
  return rentFen + (bill ? monthlyAverageFen(bill) : 0);
}

/** Months rent is due: from the first rent month up to and including the current month. */
export function rentMonths(startsMonth: ISODate, today: ISODate): ISODate[] {
  const months: ISODate[] = [];
  const current = monthStart(today);
  for (let m = monthStart(startsMonth); m <= current; m = addMonths(m, 1)) months.push(m);
  return months;
}

/**
 * Rent per month during a bill period: the average of rent actually paid for
 * months in that period, or the given fallback if none was recorded. Keeps old
 * housing-cost comparisons on the rent of that time, even after rent changes.
 */
export function rentForPeriod(
  payments: { month: ISODate; amountFen: number }[],
  periodStart: ISODate,
  periodEnd: ISODate,
  fallbackFen: number,
): number {
  const inPeriod = payments.filter((p) => p.month >= monthStart(periodStart) && p.month <= periodEnd);
  if (inPeriod.length === 0) return fallbackFen;
  return roundDiv(inPeriod.reduce((sum, p) => sum + p.amountFen, 0), inPeriod.length);
}

/** Two bill periods overlap (a day counted twice would double-count utilities). */
export function periodsOverlap(a: { periodStart: ISODate; periodEnd: ISODate }, b: { periodStart: ISODate; periodEnd: ISODate }) {
  return a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;
}
