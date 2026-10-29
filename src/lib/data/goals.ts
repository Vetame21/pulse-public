import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIn } from "@/lib/dates";
import type { Goal, GoalData } from "@/lib/goals";
import { ensureAccounts, latestChecks, mainAccountBalance } from "./my-money";
import { getSavingsBalance } from "./savings";
import type { Settings } from "./settings";

const COLS =
  "id, title, kind, due_date, target_fen, money_source, baseline_fen, habit_period, habit_times, target_value, start_value, unit, number_mode, completed_at, created_at";

type Row = {
  id: string; title: string; kind: Goal["kind"]; due_date: string | null; target_fen: number | null; money_source: Goal["moneySource"];
  baseline_fen: number; habit_period: Goal["habitPeriod"]; habit_times: number | null; target_value: string | number | null;
  start_value: string | number | null; unit: string | null; number_mode: Goal["numberMode"]; completed_at: string | null; created_at: string;
};

const num = (v: string | number | null) => (v === null ? null : Number(v));

export async function listGoals(supabase: SupabaseClient, timezone: string, id?: string): Promise<Goal[]> {
  let query = supabase.from("goals").select(COLS);
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("created_at");
  if (error) throw new Error(`Couldn't load your goals: ${error.message}`);
  return (data as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    dueDate: r.due_date,
    createdDate: todayIn(timezone, new Date(r.created_at)),
    completed: r.completed_at !== null,
    targetFen: r.target_fen === null ? null : Number(r.target_fen),
    moneySource: r.money_source,
    baselineFen: Number(r.baseline_fen),
    habitPeriod: r.habit_period,
    habitTimes: r.habit_times,
    targetValue: num(r.target_value),
    startValue: num(r.start_value),
    unit: r.unit,
    numberMode: r.number_mode,
  }));
}

/** Current balance of a money source, or null if it can't be known (e.g. the bank balance never checked). */
export async function moneySourceBalance(supabase: SupabaseClient, settings: Settings, source: "savings" | "main_account"): Promise<number | null> {
  if (source === "savings") return getSavingsBalance(supabase);
  const main = (await ensureAccounts(supabase)).find((a) => a.isMain);
  if (!main) return null;
  const checks = await latestChecks(supabase, [main.id]);
  return (await mainAccountBalance(supabase, settings, main, checks.get(main.id)))?.balanceFen ?? null;
}

/** Everything needed to show progress for these goals (habit ticks from the last ~10 weeks). */
export async function loadGoalData(supabase: SupabaseClient, settings: Settings, goals: Goal[]): Promise<GoalData> {
  const ids = goals.map((g) => g.id);
  if (ids.length === 0) return { entries: [], checkins: [], steps: [], balances: { savings: null, mainAccount: null } };
  const since = addDays(todayIn(settings.timezone), -70);
  const needs = (s: Goal["moneySource"]) => goals.some((g) => g.kind === "money" && g.moneySource === s);
  const [entries, checkins, steps, savings, mainAccount] = await Promise.all([
    supabase.from("goal_entries").select("id, goal_id, date, value, amount_fen, created_at").in("goal_id", ids).order("date").limit(5000),
    supabase.from("goal_checkins").select("goal_id, date").in("goal_id", ids).gte("date", since).limit(5000),
    supabase.from("goal_steps").select("id, goal_id, title, position, done_at").in("goal_id", ids).order("position"),
    needs("savings") ? moneySourceBalance(supabase, settings, "savings") : Promise.resolve(null),
    needs("main_account") ? moneySourceBalance(supabase, settings, "main_account") : Promise.resolve(null),
  ]);
  for (const r of [entries, checkins, steps]) if (r.error) throw new Error(`Couldn't load goal progress: ${r.error.message}`);
  return {
    entries: entries.data!.map((e) => ({ goalId: e.goal_id, date: e.date, value: num(e.value), amountFen: e.amount_fen === null ? null : Number(e.amount_fen), createdAt: e.created_at, id: e.id })),
    checkins: checkins.data!.map((c) => ({ goalId: c.goal_id, date: c.date })),
    steps: steps.data!.map((s) => ({ id: s.id, goalId: s.goal_id, title: s.title, position: s.position, done: s.done_at !== null })),
    balances: { savings, mainAccount },
    currency: settings.homeCurrency,
  };
}
