// The personal monthly budget: spending, safe-to-spend, projection, status,
// and month-end closing. Pure functions; amounts are integer fen.

import {
  type ISODate,
  addMonths,
  daysInMonthOf,
  daysInclusive,
  maxDate,
  monthEnd,
  monthStart,
} from "./dates";
import { roundDiv } from "./money";

export type PersonalExpense = {
  txnDate: ISODate;
  amountFen: number;
  kind: "expense" | "refund";
  fundedBy: "budget" | "savings" | "other"; // other = someone else paid: never in the budget
};

export type BudgetStatus = "on_track" | "above_pace" | "over_budget" | "no_budget";

export type MonthBudgetInput = {
  month: ISODate; // any date in the month; normalised to its first day
  budgetFen: number;
  today: ISODate;
  trackingStart: ISODate;
  expenses: PersonalExpense[];
};

export type MonthBudget = {
  month: ISODate;
  budgetFen: number;
  phase: "past" | "current" | "future";
  isPartial: boolean; // tracking began after the 1st of this month
  firstTrackedDay: ISODate;
  trackedDays: number; // days of the month that are tracked
  elapsedDays: number; // tracked days up to and including today (all of them for past months)
  spentFen: number;
  remainingFen: number; // negative when over budget
  progress: number; // spent ÷ budget, 0 when there is no budget
  avgDailyFen: number;
  // Only for the current month:
  remainingDays: number | null; // including today
  spentTodayFen: number | null;
  safeDailyFen: number | null; // stays the same all day
  leftTodayFen: number | null; // safeDaily − spent today (negative when over)
  projectedFen: number | null;
  status: BudgetStatus;
};

/**
 * Eligible personal spending for a month: expenses minus refunds, counting only
 * rows funded by the budget. Purchases paid from the Savings Box are excluded.
 */
export function spentInMonth(expenses: PersonalExpense[], month: ISODate, before?: ISODate): number {
  const start = monthStart(month);
  const end = monthEnd(month);
  let total = 0;
  for (const e of expenses) {
    if (e.fundedBy !== "budget") continue;
    if (e.txnDate < start || e.txnDate > end) continue;
    if (before !== undefined && e.txnDate >= before) continue;
    total += e.kind === "refund" ? -e.amountFen : e.amountFen;
  }
  return total;
}

export function computeMonthBudget(input: MonthBudgetInput): MonthBudget {
  const start = monthStart(input.month);
  const end = monthEnd(input.month);
  const firstTrackedDay = maxDate(start, input.trackingStart);
  const trackedDays = firstTrackedDay > end ? 0 : daysInclusive(firstTrackedDay, end);
  const isPartial = trackedDays < daysInMonthOf(start);

  const phase = input.today > end ? "past" : input.today < start ? "future" : "current";
  const elapsedDays =
    phase === "past"
      ? trackedDays
      : phase === "future" || input.today < firstTrackedDay
        ? 0
        : daysInclusive(firstTrackedDay, input.today);

  const spentFen = spentInMonth(input.expenses, start);
  const remainingFen = input.budgetFen - spentFen;
  const progress = input.budgetFen > 0 ? spentFen / input.budgetFen : 0;
  const avgDailyFen = elapsedDays > 0 ? roundDiv(spentFen, elapsedDays) : 0;

  let remainingDays: number | null = null;
  let spentTodayFen: number | null = null;
  let safeDailyFen: number | null = null;
  let leftTodayFen: number | null = null;
  let projectedFen: number | null = null;

  if (phase === "current" && elapsedDays > 0) {
    remainingDays = daysInclusive(input.today, end);
    const spentBeforeToday = spentInMonth(input.expenses, start, input.today);
    spentTodayFen = spentFen - spentBeforeToday;
    // Rounded down so following it can never push you over.
    safeDailyFen = Math.floor(Math.max(0, input.budgetFen - spentBeforeToday) / remainingDays);
    leftTodayFen = safeDailyFen - spentTodayFen;
    projectedFen = roundDiv(spentFen * trackedDays, elapsedDays);
  }

  return {
    month: start,
    budgetFen: input.budgetFen,
    phase,
    isPartial,
    firstTrackedDay,
    trackedDays,
    elapsedDays,
    spentFen,
    remainingFen,
    progress,
    avgDailyFen,
    remainingDays,
    spentTodayFen,
    safeDailyFen,
    leftTodayFen,
    projectedFen,
    status: budgetStatus(input.budgetFen, spentFen, elapsedDays, trackedDays),
  };
}

/**
 * 🟢 on_track: at or below the pace line (budget × elapsed ÷ tracked days)
 * 🟡 above_pace: above the pace line but still within budget
 * 🔴 over_budget: spent more than the budget
 */
export function budgetStatus(
  budgetFen: number,
  spentFen: number,
  elapsedDays: number,
  trackedDays: number,
): BudgetStatus {
  if (budgetFen <= 0) return "no_budget";
  if (spentFen > budgetFen) return "over_budget";
  if (trackedDays === 0) return "on_track";
  // spent ≤ budget × elapsed / tracked, compared without division
  return spentFen * trackedDays <= budgetFen * elapsedDays ? "on_track" : "above_pace";
}

/** Month-end rule: savings = max(0, budget − spent); overspending is recorded, never taken from savings. */
export function computeClosing(budgetFen: number, spentFen: number): { savedFen: number; overFen: number } {
  return {
    savedFen: Math.max(0, budgetFen - spentFen),
    overFen: Math.max(0, spentFen - budgetFen),
  };
}

/** Budget for a partial month, proportional to tracked days: 3/31 × ¥2,000 = ¥193.55. */
export function proratedBudget(fullBudgetFen: number, trackedDays: number, daysInMonth: number): number {
  return roundDiv(fullBudgetFen * trackedDays, daysInMonth);
}

/**
 * Months that have ended but aren't closed yet, oldest first: from the month
 * tracking started up to last month.
 */
export function monthsReadyToClose(trackingStart: ISODate, today: ISODate, closedMonths: ISODate[]): ISODate[] {
  const closed = new Set(closedMonths.map(monthStart));
  const current = monthStart(today);
  const result: ISODate[] = [];
  for (let m = monthStart(trackingStart); m < current; m = addMonths(m, 1)) {
    if (!closed.has(m)) result.push(m);
  }
  return result;
}
