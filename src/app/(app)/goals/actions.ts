"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { moneySourceBalance } from "@/lib/data/goals";
import { getSettings } from "@/lib/data/settings";
import { isValidISODate, todayIn } from "@/lib/dates";
import { normalizeDecimal, parseYuan } from "@/lib/money";
import type { ActionState } from "../actions";

const GoalSchema = z.object({
  id: z.uuid(),
  mode: z.enum(["create", "edit"]),
  title: z.string().trim().min(1, "Give the goal a name.").max(100),
  kind: z.enum(["money", "habit", "number", "milestone"]),
  dueDate: z.union([z.string().refine(isValidISODate, "Pick a valid date."), z.literal("")]),
  target: z.string().trim().max(30),
  moneySource: z.enum(["manual", "savings", "main_account", ""]),
  countExisting: z.enum(["on", ""]),
  habitPeriod: z.enum(["day", "week", ""]),
  habitTimes: z.string().trim().max(2),
  start: z.string().trim().max(30),
  unit: z.string().trim().max(20),
  numberMode: z.enum(["add", "set", ""]),
  steps: z.string().max(4000),
});

const KEYS = ["id", "mode", "title", "kind", "dueDate", "target", "moneySource", "countExisting", "habitPeriod", "habitTimes", "start", "unit", "numberMode", "steps"];
const toNumber = (s: string) => (s === "" ? null : Number(normalizeDecimal(s)));

export async function saveGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = GoalSchema.safeParse(Object.fromEntries(KEYS.map((k) => [k, fd.get(k) ?? (k === "mode" ? "create" : "")])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  const values: Record<string, unknown> = { title: f.title, kind: f.kind, due_date: f.dueDate || null };

  try {
    const { supabase, user } = await requireUser();
    if (f.kind === "money") {
      const targetFen = parseYuan(f.target);
      if (targetFen === null || targetFen <= 0) return { ok: false, message: "Enter a target amount, like 5000." };
      if (!f.moneySource) return { ok: false, message: "Choose where the money is tracked." };
      values.target_fen = targetFen;
      values.money_source = f.moneySource;
      if (f.mode === "create") {
        // "Count from now": remember today's balance so only new money counts.
        const balance = f.moneySource === "manual" || f.countExisting === "on" ? null : await moneySourceBalance(supabase, await getSettings(supabase, user.id), f.moneySource);
        values.baseline_fen = balance ?? 0;
      }
    } else if (f.kind === "habit") {
      const times = f.habitPeriod === "day" ? 1 : Number(f.habitTimes);
      if (!f.habitPeriod) return { ok: false, message: "Choose daily or weekly." };
      if (!Number.isInteger(times) || times < 1 || times > 7) return { ok: false, message: "Times per week should be 1 to 7." };
      values.habit_period = f.habitPeriod;
      values.habit_times = times;
    } else if (f.kind === "number") {
      const target = toNumber(f.target);
      const start = toNumber(f.start) ?? 0;
      if (target === null || !Number.isFinite(target) || !Number.isFinite(start)) return { ok: false, message: "Enter a target number (and a start, if not 0)." };
      if (target === start) return { ok: false, message: "The target is the same as the start." };
      if (!f.numberMode) return { ok: false, message: "Choose how you'll log progress." };
      values.target_value = target;
      values.start_value = start;
      values.unit = f.unit || null;
      values.number_mode = f.numberMode;
    }

    const { error } = f.mode === "edit" ? await supabase.from("goals").update(values).eq("id", f.id) : await supabase.from("goals").insert({ id: f.id, ...values });
    if (error && error.code !== "23505") throw error;

    if (f.mode === "create" && f.kind === "milestone") {
      const steps = f.steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      if (steps.length > 0) {
        const { error: stepError } = await supabase.from("goal_steps").insert(steps.map((title, i) => ({ goal_id: f.id, title: title.slice(0, 200), position: i + 1 })));
        if (stepError) throw stepError;
      }
    }
    refresh();
  } catch (error) {
    console.error("saveGoal failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
  redirect(f.mode === "edit" ? `/goals/${f.id}` : "/goals");
}

async function run(what: string, fn: (supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], today: string) => PromiseLike<{ error: unknown }>, okMessage: string | null = null): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const today = todayIn((await getSettings(supabase, user.id)).timezone);
    const { error } = await fn(supabase, today);
    if (error) throw error;
    refresh();
    return { ok: true, message: okMessage };
  } catch (error) {
    console.error(`${what} failed`, error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

const isId = (id: string) => z.uuid().safeParse(id).success;
const bad = { ok: false, message: "Invalid goal." };

/** Tick or untick a habit for today. */
export async function toggleHabitToday(goalId: string, done: boolean): Promise<ActionState> {
  if (!isId(goalId)) return bad;
  return run("toggleHabitToday", async (supabase, today) =>
    done
      ? supabase.from("goal_checkins").upsert({ goal_id: goalId, date: today }, { onConflict: "goal_id,date", ignoreDuplicates: true })
      : supabase.from("goal_checkins").delete().eq("goal_id", goalId).eq("date", today),
  );
}

/** Add progress to a number goal (a value) or a manual money goal (yuan, saved as fen). */
export async function addGoalEntry(goalId: string, kind: "money" | "number", amount: string, note = ""): Promise<ActionState> {
  if (!isId(goalId)) return bad;
  const row: Record<string, unknown> = { goal_id: goalId, note: note.trim().slice(0, 200) || null };
  if (kind === "money") {
    const fen = parseYuan(amount);
    if (fen === null || fen === 0) return { ok: false, message: "Enter an amount, like 200." };
    row.amount_fen = fen;
  } else {
    const value = toNumber(amount.trim());
    if (value === null || !Number.isFinite(value)) return { ok: false, message: "Enter a number." };
    row.value = value;
  }
  return run("addGoalEntry", (supabase, today) => supabase.from("goal_entries").insert({ ...row, date: today }), "Added.");
}

export async function deleteGoalEntry(id: string): Promise<ActionState> {
  if (!isId(id)) return bad;
  return run("deleteGoalEntry", (supabase) => supabase.from("goal_entries").delete().eq("id", id));
}

export async function addGoalStep(goalId: string, title: string): Promise<ActionState> {
  if (!isId(goalId)) return bad;
  const t = title.trim().slice(0, 200);
  if (!t) return { ok: false, message: "Write the step first." };
  return run("addGoalStep", async (supabase) => {
    const { data } = await supabase.from("goal_steps").select("position").eq("goal_id", goalId).order("position", { ascending: false }).limit(1);
    return supabase.from("goal_steps").insert({ goal_id: goalId, title: t, position: (data?.[0]?.position ?? 0) + 1 });
  });
}

export async function setGoalStepDone(id: string, done: boolean): Promise<ActionState> {
  if (!isId(id)) return bad;
  return run("setGoalStepDone", (supabase) => supabase.from("goal_steps").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id));
}

export async function deleteGoalStep(id: string): Promise<ActionState> {
  if (!isId(id)) return bad;
  return run("deleteGoalStep", (supabase) => supabase.from("goal_steps").delete().eq("id", id));
}

export async function setGoalCompleted(id: string, completed: boolean): Promise<ActionState> {
  if (!isId(id)) return bad;
  return run("setGoalCompleted", (supabase) => supabase.from("goals").update({ completed_at: completed ? new Date().toISOString() : null }).eq("id", id), completed ? "Done 🎉" : null);
}

export async function deleteGoal(id: string): Promise<ActionState> {
  if (!isId(id)) return bad;
  const res = await run("deleteGoal", (supabase) => supabase.from("goals").delete().eq("id", id));
  if (res.ok) redirect("/goals");
  return res;
}
