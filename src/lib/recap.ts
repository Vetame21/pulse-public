// Monthly recap ("October Wrapped"): one month's story across all accounts,
// each kept separate. Pure: the page loads rows, this does the arithmetic.

import { arcForPace, paceRatio, type ArcKey } from "./arc";
import type { PersonalExpense } from "./budget";
import { spentInMonth } from "./budget";
import { balanceAsOf } from "./calendar";
import type { CategoryKey } from "./categories";
import { type ISODate, addMonths, daysInclusive, daysInMonthOf, maxDate, minDate, monthEnd, monthStart } from "./dates";
import { percentChange, roundDiv } from "./money";

type Expense = PersonalExpense & { category: CategoryKey };

export type RecapInput = {
  month: ISODate;
  today: ISODate;
  trackingStart: ISODate;
  defaultBudgetFen: number;
  budgetFen: number; // this month's budget (closing snapshot if closed)
  previousBudgetFen: number | null;
  closing: { savedFen: number; overFen: number } | null;
  expenses: Expense[]; // at least this month and the previous one
  savings: { date: ISODate; deltaFen: number }[];
  walletTxns: { date: ISODate; kind: "topup" | "usage" | "adjustment"; creditDeltaFen: number; cashPaidFen: number }[];
  family: { date: ISODate; kind: "received" | "paid" | "kept"; amountFen: number }[];
};

function trackedWindow(month: ISODate, today: ISODate, trackingStart: ISODate) {
  const first = maxDate(monthStart(month), trackingStart);
  const last = minDate(monthEnd(month), today);
  return { first, last, counted: first > last ? 0 : daysInclusive(first, last), tracked: daysInclusive(first, monthEnd(month)) };
}

export function monthRecap(input: RecapInput) {
  const { month, today, trackingStart } = input;
  const start = monthStart(month);
  const end = monthEnd(month);
  const w = trackedWindow(start, today, trackingStart);
  const isCurrent = today <= end;

  const spentFen = spentInMonth(input.expenses, start);
  const fromSavingsFen = input.expenses
    .filter((e) => e.fundedBy === "savings" && e.txnDate >= start && e.txnDate <= end)
    .reduce((s, e) => s + e.amountFen, 0);
  const avgPerDayFen = w.counted > 0 ? roundDiv(spentFen, w.counted) : 0;

  // Categories and biggest day (budget-funded spending only)
  const inMonth = input.expenses.filter((e) => e.fundedBy === "budget" && e.txnDate >= start && e.txnDate <= end);
  const signed = (e: Expense) => (e.kind === "refund" ? -e.amountFen : e.amountFen);
  const byCat = new Map<CategoryKey, number>();
  const byDay = new Map<ISODate, number>();
  for (const e of inMonth) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + signed(e));
    byDay.set(e.txnDate, (byDay.get(e.txnDate) ?? 0) + signed(e));
  }
  const categories = [...byCat.entries()].map(([key, fen]) => ({ key, fen })).filter((c) => c.fen > 0).sort((a, b) => b.fen - a.fen);
  const biggestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const noSpendDays = w.counted - [...byDay.values()].filter((v) => v > 0).length;

  // Saved: the closing if closed, otherwise what closing now would save
  const wouldSaveFen = Math.max(0, input.budgetFen - spentFen);
  const overFen = Math.max(0, spentFen - input.budgetFen);

  // Arc for the month
  const allowance = input.budgetFen > 0 ? input.budgetFen / w.tracked : input.defaultBudgetFen / daysInMonthOf(start);
  const pace = paceRatio(spentFen, allowance, w.counted);
  const arc: ArcKey = arcForPace(pace, { overBudget: input.budgetFen > 0 && spentFen > input.budgetFen, earlyInMonth: isCurrent && w.counted < 3 });

  // Month vs month
  const prevStart = addMonths(start, -1);
  const pw = trackedWindow(prevStart, today, trackingStart);
  const prevSpentFen = pw.counted > 0 ? spentInMonth(input.expenses, prevStart) : null;
  const prevAvgFen = prevSpentFen !== null && pw.counted > 0 ? roundDiv(prevSpentFen, pw.counted) : null;

  // Other accounts, each on its own
  const walletIn = input.walletTxns.filter((t) => t.date >= start && t.date <= end);
  const familyIn = input.family.filter((m) => m.date >= start && m.date <= end);
  const familyDelta = input.family.map((m) => ({ date: m.date, deltaFen: m.kind === "received" ? m.amountFen : -m.amountFen }));

  return {
    isCurrent,
    countedDays: w.counted,
    isPartial: w.tracked < daysInMonthOf(start),
    budgetFen: input.budgetFen,
    spentFen,
    fromSavingsFen,
    avgPerDayFen,
    categories,
    biggestDay: biggestDay ? { date: biggestDay[0], fen: biggestDay[1] } : null,
    noSpendDays,
    closed: input.closing !== null,
    savedFen: input.closing ? input.closing.savedFen : wouldSaveFen,
    overFen: input.closing ? input.closing.overFen : overFen,
    pace,
    arc,
    previous:
      prevSpentFen === null
        ? null
        : {
            month: prevStart,
            spentFen: prevSpentFen,
            avgPerDayFen: prevAvgFen ?? 0,
            totalDiffFen: spentFen - prevSpentFen,
            totalChange: percentChange(prevSpentFen, spentFen),
            avgChange: prevAvgFen ? percentChange(prevAvgFen, avgPerDayFen) : null,
            samePeriodLength: pw.counted === w.counted,
          },
    savingsBoxFen: balanceAsOf(input.savings, end),
    restaurant: {
      creditFen: balanceAsOf(input.walletTxns.map((t) => ({ date: t.date, deltaFen: t.creditDeltaFen })), end),
      toppedUpCashFen: walletIn.filter((t) => t.kind === "topup").reduce((s, t) => s + t.cashPaidFen, 0),
      creditUsedFen: -walletIn.filter((t) => t.kind === "usage").reduce((s, t) => s + t.creditDeltaFen, 0),
    },
    family: {
      remainingFen: balanceAsOf(familyDelta, end),
      receivedFen: familyIn.filter((m) => m.kind === "received").reduce((s, m) => s + m.amountFen, 0),
      paidFen: familyIn.filter((m) => m.kind === "paid").reduce((s, m) => s + m.amountFen, 0),
    },
  };
}

export type MonthRecap = ReturnType<typeof monthRecap>;
