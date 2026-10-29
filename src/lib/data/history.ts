import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyTotals } from "@/lib/history";

/** Daily personal spending between two dates, from the daily_personal_spending view. */
export async function getDailyTotals(supabase: SupabaseClient, start: string, end: string): Promise<DailyTotals> {
  const totals: DailyTotals = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("daily_personal_spending")
      .select("txn_date, spent_fen")
      .gte("txn_date", start)
      .lte("txn_date", end)
      .order("txn_date")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't load spending history: ${error.message}`);
    for (const row of data) totals.set(row.txn_date, Number(row.spent_fen));
    if (data.length < PAGE) return totals;
  }
}
