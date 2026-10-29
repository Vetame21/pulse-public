import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ArcKey, arcForPace, flavourFor, isComeback, noSpendDays, paceRatio, withinStreak } from "@/lib/arc";
import type { PersonalExpense } from "@/lib/budget";
import { type CategoryKey, CATEGORY_KEYS } from "@/lib/categories";
import { addMonths, daysInclusive, daysInMonthOf, maxDate, minDate, monthEnd, monthStart } from "@/lib/dates";
import { getDailyTotals } from "./history";
import type { Settings } from "./settings";

export type MonthArc = { month: string; arc: ArcKey; pace: number | null; spentFen: number; partial: boolean };

export type ArcState = {
  arc: ArcKey;
  pace: number | null;
  flavour: CategoryKey | null;
  comeback: boolean;
  streak: number;
  noSpendThisMonth: number;
  months: MonthArc[]; // oldest first, current month last
};

/** Spending pace and arc for every tracked month, plus streaks, from daily totals. */
export async function getArcState(
  supabase: SupabaseClient,
  settings: Settings,
  today: string,
  currentMonthExpenses: (PersonalExpense & { category: string })[],
): Promise<ArcState> {
  const start = settings.trackingStartDate;
  const [daily, budgetsRes] = await Promise.all([
    getDailyTotals(supabase, start, today),
    supabase.from("monthly_budgets").select("month, budget_fen"),
  ]);
  if (budgetsRes.error) throw new Error(`Couldn't load budgets: ${budgetsRes.error.message}`);
  const budgetByMonth = new Map(budgetsRes.data.map((b) => [b.month, Number(b.budget_fen)]));

  const months: MonthArc[] = [];
  const current = monthStart(today);
  for (let m = monthStart(start); m <= current; m = addMonths(m, 1)) {
    const first = maxDate(m, start);
    const last = minDate(monthEnd(m), today);
    const counted = daysInclusive(first, last);
    const trackedInMonth = daysInclusive(first, monthEnd(m));
    let spent = 0;
    for (const [d, fen] of daily) if (d >= first && d <= last) spent += fen;
    // Allowance per day: this month's budget over its tracked days; a "tracking only"
    // month (budget ¥0) is judged against the default budget instead.
    const budget = budgetByMonth.get(m) ?? settings.defaultBudgetFen;
    const allowance = budget > 0 ? budget / trackedInMonth : settings.defaultBudgetFen / daysInMonthOf(m);
    const pace = paceRatio(spent, allowance, counted);
    const isCurrent = m === current;
    months.push({
      month: m,
      pace,
      spentFen: spent,
      partial: trackedInMonth < daysInMonthOf(m),
      arc: arcForPace(pace, {
        overBudget: budget > 0 && spent > budget,
        earlyInMonth: isCurrent && counted < 3,
      }),
    });
  }

  const now = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const byCategory = CATEGORY_KEYS.map((key) => ({
    key,
    fen: currentMonthExpenses
      .filter((e) => e.category === key && e.fundedBy === "budget")
      .reduce((s, e) => s + (e.kind === "refund" ? -e.amountFen : e.amountFen), 0),
  }));

  return {
    arc: now.arc,
    pace: now.pace,
    flavour: flavourFor(byCategory),
    comeback: isComeback(prev?.pace ?? null, now.pace),
    streak: withinStreak(daily, today, start, settings.defaultBudgetFen),
    noSpendThisMonth: noSpendDays(daily, current, today, start),
    months,
  };
}
