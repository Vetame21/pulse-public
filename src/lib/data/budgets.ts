import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthStart } from "@/lib/dates";
import type { Settings } from "./settings";

export type MonthBudgetRow = { month: string; budgetFen: number; isPartial: boolean };

/**
 * The budget for a month, creating its row the first time the month is used.
 * The month tracking began in (August 2026) starts as "tracking only" (¥0,
 * partial) until you decide otherwise when closing it. Later months copy the
 * default budget at creation, so changing Settings never rewrites history.
 */
export async function ensureMonthBudget(
  supabase: SupabaseClient,
  settings: Settings,
  month: string,
): Promise<MonthBudgetRow> {
  const start = monthStart(month);
  const isTrackingStartMonth = start === monthStart(settings.trackingStartDate) && settings.trackingStartDate > start;

  const { data: existing, error } = await supabase
    .from("monthly_budgets")
    .select("month, budget_fen, is_partial")
    .eq("month", start)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the budget: ${error.message}`);

  let row = existing;
  if (!row) {
    const { data: inserted, error: insertError } = await supabase
      .from("monthly_budgets")
      .upsert(
        {
          month: start,
          budget_fen: isTrackingStartMonth ? 0 : settings.defaultBudgetFen,
          is_partial: isTrackingStartMonth,
        },
        { onConflict: "user_id,month", ignoreDuplicates: true },
      )
      .select("month, budget_fen, is_partial")
      .maybeSingle();
    if (insertError) throw new Error(`Couldn't create the budget: ${insertError.message}`);
    row = inserted ?? (await supabase.from("monthly_budgets").select("month, budget_fen, is_partial").eq("month", start).single()).data;
  }
  if (!row) throw new Error("Couldn't create the budget.");
  return { month: row.month, budgetFen: Number(row.budget_fen), isPartial: row.is_partial };
}

export async function isMonthClosed(supabase: SupabaseClient, month: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("monthly_closings")
    .select("id")
    .eq("month", monthStart(month))
    .maybeSingle();
  if (error) throw new Error(`Couldn't check the month: ${error.message}`);
  return Boolean(data);
}
