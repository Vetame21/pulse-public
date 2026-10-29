// Spending history, like the iPhone Health steps chart: pick a range
// (week, month, 6 months, year), see one bar per day or per month, with the
// period's total and average per day, and compare with the previous period.
// Only tracked days count: nothing before tracking started, nothing after today.

import {
  type ISODate,
  addDays,
  addMonths,
  daysInMonthOf,
  daysInclusive,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
  parseISODate,
} from "./dates";
import { percentChange, roundDiv } from "./money";

export type HistoryRange = "W" | "M" | "6M" | "Y";
export const HISTORY_RANGES: HistoryRange[] = ["W", "M", "6M", "Y"];

/** date → spent fen (budget-funded expenses minus refunds) */
export type DailyTotals = Map<ISODate, number>;

export type Bar = {
  key: ISODate; // the day, or the first day of the month
  totalFen: number;
  avgPerDayFen: number; // for month bars; equals totalFen for day bars
  countedDays: number;
  state: "data" | "untracked" | "future";
  partial: boolean; // a month bar with fewer counted days than the month has
};

export type History = {
  range: HistoryRange;
  start: ISODate;
  end: ISODate;
  unit: "day" | "month";
  bars: Bar[];
  totalFen: number;
  countedDays: number;
  avgPerDayFen: number;
  avgPerMonthFen: number; // month views: average of the months with data
  highest: Bar | null;
};

const MONTHS_IN: Record<HistoryRange, number> = { W: 0, M: 1, "6M": 6, Y: 12 };

function weekday(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7; // Monday = 0
}

/** The period a range covers around an anchor date. Weeks start on Monday. */
export function periodBounds(range: HistoryRange, anchor: ISODate): { start: ISODate; end: ISODate } {
  if (range === "W") {
    const start = addDays(anchor, -weekday(anchor));
    return { start, end: addDays(start, 6) };
  }
  const end = monthEnd(anchor);
  return { start: addMonths(monthStart(anchor), -(MONTHS_IN[range] - 1)), end };
}

/** Move the anchor by whole periods (n = -1 for the previous period). */
export function shiftAnchor(range: HistoryRange, anchor: ISODate, n: number): ISODate {
  return range === "W" ? addDays(anchor, 7 * n) : addMonths(monthStart(anchor), MONTHS_IN[range] * n);
}

/** Tracked days within [start, end]: not before tracking began, not after today. */
export function countedDaysIn(start: ISODate, end: ISODate, trackingStart: ISODate, today: ISODate): number {
  const from = maxDate(start, trackingStart);
  const to = minDate(end, today);
  return from > to ? 0 : daysInclusive(from, to);
}

function sumDays(daily: DailyTotals, start: ISODate, end: ISODate): number {
  let total = 0;
  for (const [date, fen] of daily) if (date >= start && date <= end) total += fen;
  return total;
}

export function buildHistory(input: {
  range: HistoryRange;
  anchor: ISODate;
  today: ISODate;
  trackingStart: ISODate;
  daily: DailyTotals;
}): History {
  const { range, today, trackingStart, daily } = input;
  const { start, end } = periodBounds(range, input.anchor);
  const unit = range === "W" || range === "M" ? "day" : "month";
  const bars: Bar[] = [];

  if (unit === "day") {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const state = d < trackingStart ? "untracked" : d > today ? "future" : "data";
      const fen = state === "data" ? (daily.get(d) ?? 0) : 0;
      bars.push({ key: d, totalFen: fen, avgPerDayFen: fen, countedDays: state === "data" ? 1 : 0, state, partial: false });
    }
  } else {
    for (let m = start; m <= end; m = addMonths(m, 1)) {
      const mEnd = monthEnd(m);
      const counted = countedDaysIn(m, mEnd, trackingStart, today);
      const total = counted > 0 ? sumDays(daily, maxDate(m, trackingStart), minDate(mEnd, today)) : 0;
      bars.push({
        key: m,
        totalFen: total,
        avgPerDayFen: counted > 0 ? roundDiv(total, counted) : 0,
        countedDays: counted,
        state: counted > 0 ? "data" : mEnd < trackingStart ? "untracked" : "future",
        partial: counted > 0 && counted < daysInMonthOf(m),
      });
    }
  }

  const dataBars = bars.filter((b) => b.state === "data");
  const totalFen = dataBars.reduce((sum, b) => sum + b.totalFen, 0);
  const countedDays = countedDaysIn(start, end, trackingStart, today);
  const highest = dataBars.reduce<Bar | null>((top, b) => (b.totalFen > 0 && (!top || b.totalFen > top.totalFen) ? b : top), null);

  return {
    range,
    start,
    end,
    unit,
    bars,
    totalFen,
    countedDays,
    avgPerDayFen: countedDays > 0 ? roundDiv(totalFen, countedDays) : 0,
    avgPerMonthFen: unit === "month" && dataBars.length > 0 ? roundDiv(totalFen, dataBars.length) : 0,
    highest,
  };
}

export type Comparison = {
  previous: History;
  totalChange: number | null; // %
  avgPerDayChange: number | null; // % — the fair comparison when periods are partial
};

export function compareWithPrevious(
  current: History,
  input: { anchor: ISODate; today: ISODate; trackingStart: ISODate; daily: DailyTotals },
): Comparison {
  const previous = buildHistory({ ...input, range: current.range, anchor: shiftAnchor(current.range, input.anchor, -1) });
  return {
    previous,
    totalChange: previous.countedDays > 0 ? percentChange(previous.totalFen, current.totalFen) : null,
    avgPerDayChange: previous.countedDays > 0 ? percentChange(previous.avgPerDayFen, current.avgPerDayFen) : null,
  };
}

/** Round an axis maximum up to a clean number: 1, 2, 2.5, 5 × 10ⁿ yuan (in fen). */
export function niceAxisMax(maxFen: number): number {
  if (maxFen <= 0) return 10000; // ¥100
  const yuan = maxFen / 100;
  const magnitude = 10 ** Math.floor(Math.log10(yuan));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= yuan) ?? 10;
  return Math.round(step * magnitude * 100);
}
