import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthsReadyToClose } from "@/lib/budget";
import { monthEnd, monthStart } from "@/lib/dates";
import { fetchAllRows } from "./backup";
import type { Settings } from "./settings";

export type SavingsTxn = {
  id: string;
  txnDate: string;
  amountFen: number;
  kind: "month_close" | "deposit" | "withdrawal" | "adjustment";
  closingId: string | null;
  personalExpenseId: string | null;
  note: string | null;
};

export type Closing = {
  id: string;
  month: string;
  budgetFen: number;
  spentFen: number;
  savedFen: number;
  overFen: number;
  isPartial: boolean;
  closedAt: string;
};

export async function listSavingsTransactions(supabase: SupabaseClient): Promise<SavingsTxn[]> {
  const rows = await fetchAllRows(supabase, "savings_transactions");
  return rows
    .map((r) => ({
      id: String(r.id),
      txnDate: String(r.txn_date),
      amountFen: Number(r.amount_fen),
      kind: r.kind as SavingsTxn["kind"],
      closingId: (r.closing_id as string) ?? null,
      personalExpenseId: (r.personal_expense_id as string) ?? null,
      note: (r.note as string) ?? null,
    }))
    .sort((a, b) => (a.txnDate === b.txnDate ? 0 : a.txnDate < b.txnDate ? 1 : -1));
}

export async function listClosings(supabase: SupabaseClient): Promise<Closing[]> {
  const { data, error } = await supabase
    .from("monthly_closings")
    .select("id, month, budget_fen, spent_fen, saved_fen, over_fen, is_partial, closed_at")
    .order("month", { ascending: true });
  if (error) throw new Error(`Couldn't load month closings: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    month: r.month,
    budgetFen: Number(r.budget_fen),
    spentFen: Number(r.spent_fen),
    savedFen: Number(r.saved_fen),
    overFen: Number(r.over_fen),
    isPartial: r.is_partial,
    closedAt: r.closed_at,
  }));
}

export async function getSavingsBalance(supabase: SupabaseClient): Promise<number> {
  const rows = await listSavingsTransactions(supabase);
  return rows.reduce((sum, t) => sum + t.amountFen, 0);
}

export type ReadyMonth = {
  month: string;
  isTrackingStartMonth: boolean; // the partial first month (August 2026)
  budgetFen: number; // what closing would use by default
  spentFen: number;
};

/** Ended months that still need closing, with a preview of each. */
export async function getMonthsReadyToClose(
  supabase: SupabaseClient,
  settings: Settings,
  today: string,
  closings: Closing[],
): Promise<ReadyMonth[]> {
  const months = monthsReadyToClose(settings.trackingStartDate, today, closings.map((c) => c.month));
  if (months.length === 0) return [];

  const first = months[0];
  const last = monthEnd(months[months.length - 1]);
  // Two queries in parallel, however many months are waiting.
  const [budgetsRes, dailyRes] = await Promise.all([
    supabase.from("monthly_budgets").select("month, budget_fen").gte("month", first).lte("month", last),
    supabase.from("daily_personal_spending").select("txn_date, spent_fen").gte("txn_date", first).lte("txn_date", last),
  ]);
  if (budgetsRes.error) throw new Error(`Couldn't load budgets: ${budgetsRes.error.message}`);
  if (dailyRes.error) throw new Error(`Couldn't load spending: ${dailyRes.error.message}`);

  const budgetByMonth = new Map(budgetsRes.data.map((b) => [b.month, Number(b.budget_fen)]));
  const spentByMonth = new Map<string, number>();
  for (const d of dailyRes.data) {
    const m = monthStart(d.txn_date);
    spentByMonth.set(m, (spentByMonth.get(m) ?? 0) + Number(d.spent_fen));
  }
  const startMonth = monthStart(settings.trackingStartDate);

  return months.map((month) => {
    const isTrackingStartMonth = month === startMonth && settings.trackingStartDate > month;
    return {
      month,
      isTrackingStartMonth,
      budgetFen: budgetByMonth.get(month) ?? (isTrackingStartMonth ? 0 : settings.defaultBudgetFen),
      spentFen: spentByMonth.get(month) ?? 0,
    };
  });
}

/** "2026-09" → "2026-09-01", or null if it isn't a valid month string. */
export function parseMonthParam(value: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return `${value}-01`;
}
