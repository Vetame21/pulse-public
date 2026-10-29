// Goals: money, habits, number targets and milestones. Pure rules for progress,
// streaks and pace, shared by the pages, Today and the morning briefing.

import { type ISODate, addDays, diffDays, parseISODate } from "./dates";
import { type HomeCurrency, formatMoney } from "./money";

export type GoalKind = "money" | "habit" | "number" | "milestone";
export type MoneySource = "manual" | "savings" | "main_account";

export type Goal = {
  id: string;
  title: string;
  kind: GoalKind;
  dueDate: ISODate | null;
  createdDate: ISODate;
  completed: boolean; // marked done, or archived from the list
  targetFen: number | null; // money
  moneySource: MoneySource | null;
  baselineFen: number; // money: balance when the goal started, if you chose to count from then
  habitPeriod: "day" | "week" | null; // habit
  habitTimes: number | null;
  targetValue: number | null; // number
  startValue: number | null;
  unit: string | null;
  numberMode: "add" | "set" | null; // add up entries, or each entry is the latest value
};

export type GoalEntry = { id?: string; goalId: string; date: ISODate; value: number | null; amountFen: number | null; createdAt: string };
export type GoalStep = { id: string; goalId: string; title: string; position: number; done: boolean };
export type GoalData = {
  entries: GoalEntry[];
  checkins: { goalId: string; date: ISODate }[];
  steps: GoalStep[];
  balances: { savings: number | null; mainAccount: number | null };
  currency?: HomeCurrency; // money goals are shown in this (default ¥)
};

export type GoalProgress = {
  fraction: number; // 0..1 for the progress bar
  text: string; // "¥2,100 / ¥5,000", "1 / 3 this week", "820 / 1,200 words", "2 / 5 steps"
  reached: boolean;
  pace: "ahead" | "on" | "behind" | null; // only with a due date
  daysLeft: number | null;
  doneToday?: boolean; // habits
  streak?: number; // habits: days (daily) or weeks (weekly) in a row
  nextStep?: { id: string; title: string }; // milestones
};

const clamp = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const mondayOf = (date: ISODate) => {
  const { year, month, day } = parseISODate(date);
  return addDays(date, -((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7));
};

function pace(goal: Goal, fraction: number, today: ISODate): Pick<GoalProgress, "pace" | "daysLeft"> {
  if (!goal.dueDate) return { pace: null, daysLeft: null };
  const daysLeft = diffDays(today, goal.dueDate);
  if (fraction >= 1) return { pace: "ahead", daysLeft };
  const total = Math.max(1, diffDays(goal.createdDate, goal.dueDate));
  const expected = clamp(diffDays(goal.createdDate, today) / total);
  const gap = fraction - expected;
  return { pace: gap > 0.05 ? "ahead" : gap < -0.05 ? "behind" : "on", daysLeft };
}

export function goalProgress(goal: Goal, data: GoalData, today: ISODate): GoalProgress {
  const entries = data.entries.filter((e) => e.goalId === goal.id);

  if (goal.kind === "money") {
    const target = goal.targetFen ?? 0;
    const balance = goal.moneySource === "savings" ? data.balances.savings : goal.moneySource === "main_account" ? data.balances.mainAccount : null;
    const current = goal.moneySource === "manual" || balance === null ? entries.reduce((s, e) => s + (e.amountFen ?? 0), 0) : balance - goal.baselineFen;
    const fraction = clamp(target > 0 ? current / target : 0);
    return { fraction, text: `${formatMoney(Math.max(0, current), data.currency ?? "CNY")} / ${formatMoney(target, data.currency ?? "CNY")}`, reached: target > 0 && current >= target, ...pace(goal, fraction, today) };
  }

  if (goal.kind === "number") {
    const start = goal.startValue ?? 0;
    const target = goal.targetValue ?? 0;
    const latest = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).pop();
    const current = goal.numberMode === "set" ? (latest?.value ?? start) : start + entries.reduce((s, e) => s + (e.value ?? 0), 0);
    const fraction = clamp(target === start ? (current === target ? 1 : 0) : (current - start) / (target - start));
    const unit = goal.unit ? ` ${goal.unit}` : "";
    return { fraction, text: `${fmt(current)} / ${fmt(target)}${unit}`, reached: fraction >= 1, ...pace(goal, fraction, today) };
  }

  if (goal.kind === "milestone") {
    const steps = data.steps.filter((s) => s.goalId === goal.id).sort((a, b) => a.position - b.position);
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);
    const fraction = clamp(steps.length ? done / steps.length : 0);
    return {
      fraction,
      text: steps.length ? `${done} / ${steps.length} steps` : "No steps yet",
      reached: steps.length > 0 && done === steps.length,
      nextStep: next && { id: next.id, title: next.title },
      ...pace(goal, fraction, today),
    };
  }

  // Habit
  const days = new Set(data.checkins.filter((c) => c.goalId === goal.id).map((c) => c.date));
  const doneToday = days.has(today);
  const week = mondayOf(today);
  const thisWeek = [...days].filter((d) => d >= week && d <= today).length;
  if (goal.habitPeriod === "day") {
    let streak = 0;
    for (let d = doneToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak++;
    const elapsed = diffDays(week, today) + 1;
    return { fraction: clamp(thisWeek / 7), text: `${thisWeek} / ${elapsed} days this week`, reached: false, pace: null, daysLeft: null, doneToday, streak };
  }
  const times = goal.habitTimes ?? 1;
  let streak = thisWeek >= times ? 1 : 0;
  for (let w = addDays(week, -7); ; w = addDays(w, -7)) {
    const count = [...days].filter((d) => d >= w && d <= addDays(w, 6)).length;
    if (count < times) break;
    streak++;
  }
  return { fraction: clamp(thisWeek / times), text: `${thisWeek} / ${times} this week`, reached: false, pace: null, daysLeft: null, doneToday, streak };
}

/** One line for the morning briefing: habits still to do, then goals that are behind. */
export function goalsBriefingLine(goals: Goal[], data: GoalData, today: ISODate): string | null {
  const active = goals.filter((g) => !g.completed);
  if (active.length === 0) return null;
  const parts: string[] = [];
  for (const g of active) {
    if (g.kind !== "habit") continue;
    const p = goalProgress(g, data, today);
    if (g.habitPeriod === "day" ? !p.doneToday : p.fraction < 1) parts.push(`${g.title} ${p.text.replace(" days this week", "").replace(" this week", "")}`);
  }
  for (const g of active) {
    if (g.kind === "habit") continue;
    // A balance we couldn't read (the notification job skips the bank balance) says nothing about pace.
    if (g.kind === "money" && g.moneySource !== "manual" && (g.moneySource === "savings" ? data.balances.savings : data.balances.mainAccount) === null) continue;
    const p = goalProgress(g, data, today);
    if (p.pace === "behind") parts.push(`${g.title} ${Math.round(p.fraction * 100)}% (behind)`);
  }
  if (parts.length === 0) return `🎯 ${active.length} goal${active.length > 1 ? "s" : ""} on track`;
  return `🎯 ${parts.slice(0, 2).join(" · ")}${parts.length > 2 ? ` +${parts.length - 2}` : ""}`;
}
