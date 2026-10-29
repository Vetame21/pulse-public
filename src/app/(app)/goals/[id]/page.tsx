import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { paceText } from "@/components/goal-card";
import { DeleteButton } from "@/components/timetable-forms";
import { BackLink, Card, Label, PageHeader, ProgressBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listGoals, loadGoalData } from "@/lib/data/goals";
import { getSettings } from "@/lib/data/settings";
import { addDays, todayIn } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import { moneyFormat } from "@/lib/money";
import { deleteGoal } from "../actions";
import { CompleteButton, GoalForm, GoalQuickAction, RemoveEntryButton, StepsEditor } from "../goal-parts";

export const metadata: Metadata = { title: "Goal · Pulse" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE: Record<string, string> = { savings: "Follows your Savings Box", main_account: "Follows your main account balance (My Money)", manual: "You add amounts" };

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const [goal] = await listGoals(supabase, settings.timezone, id);
  if (!goal) notFound();
  const data = await loadGoalData(supabase, settings, [goal]);
  const p = goalProgress(goal, data, today);
  const extra = paceText(p);
  const entries = data.entries.filter((e) => e.goalId === goal.id).reverse();
  const ticks = new Set(data.checkins.map((c) => c.date));
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  // Last 4 weeks of habit ticks, Monday first, ending this week.
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 4 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(monday, (w - 3) * 7 + d)));

  return (
    <>
      <BackLink href="/goals" label="Goals" />
      <PageHeader title={goal.title} eyebrow={goal.completed ? "Done" : undefined} />

      <Card>
        <ProgressBar value={p.fraction} tone={p.pace === "behind" ? "warning" : "accent"} />
        <p className="tabular mt-2 text-lg font-semibold">{p.text}</p>
        {extra && <p className={`text-sm ${p.pace === "behind" ? "font-semibold text-warning" : "text-muted"}`}>{extra}</p>}
        {goal.kind === "money" && goal.moneySource && <p className="mt-1 text-xs text-muted">{SOURCE[goal.moneySource]}</p>}
        {!goal.completed && goal.kind !== "milestone" && (
          <div className="mt-3 flex justify-end empty:hidden">
            <GoalQuickAction goalId={goal.id} kind={goal.kind} manualMoney={goal.moneySource === "manual"} numberMode={goal.numberMode} unit={goal.unit} doneToday={p.doneToday} />
          </div>
        )}
      </Card>

      {goal.kind === "milestone" && (
        <Card>
          <Label>Steps</Label>
          <div className="mt-2">
            <StepsEditor goalId={goal.id} steps={data.steps.map((s) => ({ id: s.id, title: s.title, done: s.done }))} />
          </div>
        </Card>
      )}

      {goal.kind === "habit" && (
        <Card>
          <Label>Last 4 weeks</Label>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted" aria-hidden>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1" role="list" aria-label="Days ticked in the last 4 weeks">
            {weeks.flat().map((d) => (
              <span
                key={d}
                role="listitem"
                aria-label={`${day(d)}: ${ticks.has(d) ? "done" : d > today ? "not yet" : "not done"}`}
                className={`aspect-square rounded-md ${ticks.has(d) ? "bg-accent" : d > today ? "border border-dashed border-line" : "bg-track"} ${d === today ? "ring-2 ring-foreground ring-offset-1 ring-offset-surface" : ""}`}
              />
            ))}
          </div>
        </Card>
      )}

      {(goal.kind === "number" || (goal.kind === "money" && goal.moneySource === "manual")) && entries.length > 0 && (
        <Card>
          <Label>History</Label>
          <ul className="mt-1 divide-y divide-line">
            {entries.slice(0, 50).map((e) => (
              <li key={e.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span className="text-muted">{day(e.date)}</span>
                <span className="tabular ml-auto font-medium">
                  {e.amountFen !== null ? fmt(e.amountFen, { sign: true }) : goal.numberMode === "set" ? e.value : `+${e.value}`}
                  {goal.unit && e.value !== null ? ` ${goal.unit}` : ""}
                </span>
                {e.id && <RemoveEntryButton id={e.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="rounded-2xl border border-line bg-surface shadow-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold text-accent">Edit goal</summary>
        <div className="px-4 pb-4">
          <GoalForm initial={goal} />
        </div>
      </details>
      <CompleteButton id={goal.id} completed={goal.completed} />
      <DeleteButton action={deleteGoal} id={goal.id} label="Delete goal" />
    </>
  );
}
