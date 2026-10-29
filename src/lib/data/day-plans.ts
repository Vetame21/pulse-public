import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanItem } from "@/lib/day-plan";

export type DayPlan = { date: string; body: string; items: PlanItem[] };

export async function getDayPlan(supabase: SupabaseClient, date: string): Promise<DayPlan | null> {
  const { data, error } = await supabase.from("day_plans").select("date, body, items").eq("date", date).maybeSingle();
  if (error) throw new Error(`Couldn't load your plan: ${error.message}`);
  return data ? { date: data.date, body: data.body, items: (data.items as PlanItem[]) ?? [] } : null;
}
