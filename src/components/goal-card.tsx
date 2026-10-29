import Link from "next/link";
import { GoalQuickAction } from "@/app/(app)/goals/goal-parts";
import type { Goal, GoalProgress } from "@/lib/goals";
import { ProgressBar } from "./ui";

const KIND_LABEL: Record<Goal["kind"], string> = { money: "Money", habit: "Habit", number: "Number", milestone: "Milestones" };

export function paceText(p: GoalProgress): string | null {
  if (p.reached) return "Reached 🎉";
  const left = p.daysLeft === null ? null : p.daysLeft < 0 ? `${-p.daysLeft} days late` : p.daysLeft === 0 ? "due today" : `${p.daysLeft} days left`;
  const pace = p.pace === "ahead" ? "Ahead" : p.pace === "on" ? "On pace" : p.pace === "behind" ? "Behind" : null;
  const streak = p.streak ? `${p.streak} in a row` : null;
  return [pace, left, streak].filter(Boolean).join(" · ") || null;
}

/** A goal with its progress bar and one-tap action. */
export function GoalCard({ goal, progress }: { goal: Goal; progress: GoalProgress }) {
  const extra = paceText(progress);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <Link href={`/goals/${goal.id}`} className="block">
        <p className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-semibold">{goal.title}</span>
          <span className="shrink-0 text-xs text-muted">{KIND_LABEL[goal.kind]}</span>
        </p>
        <div className="mt-2">
          <ProgressBar value={progress.fraction} tone={progress.pace === "behind" ? "warning" : "accent"} />
        </div>
        <p className="tabular mt-1.5 flex flex-wrap justify-between gap-x-2 text-xs text-muted">
          <span>{progress.text}</span>
          {extra && <span className={progress.pace === "behind" ? "font-semibold text-warning" : ""}>{extra}</span>}
        </p>
      </Link>
      {!goal.completed && (
        <div className="mt-3 flex justify-end empty:hidden">
          <GoalQuickAction
            goalId={goal.id}
            kind={goal.kind}
            manualMoney={goal.moneySource === "manual"}
            numberMode={goal.numberMode}
            unit={goal.unit}
            doneToday={progress.doneToday}
            nextStep={progress.nextStep}
          />
        </div>
      )}
    </div>
  );
}
