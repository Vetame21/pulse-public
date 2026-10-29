"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/actions";
import type { Goal } from "@/lib/goals";
import { safeCall } from "@/lib/safe-call";
import { useSafeForm } from "@/lib/use-safe-form";
import { addGoalEntry, addGoalStep, deleteGoalEntry, deleteGoalStep, saveGoal, setGoalCompleted, setGoalStepDone, toggleHabitToday } from "./actions";

const input = "h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";
const OFFLINE = "Couldn't reach the app. Try again.";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const run = (fn: () => Promise<ActionState>, after?: (r: ActionState) => void) =>
    startTransition(async () => {
      const r = await safeCall(fn, OFFLINE);
      setResult(r);
      after?.(r);
    });
  return { pending, result, run };
}

/** The one-tap action on a goal card: tick a habit, add progress, or finish the next step. */
export function GoalQuickAction(props: {
  goalId: string;
  kind: Goal["kind"];
  manualMoney: boolean;
  numberMode: Goal["numberMode"];
  unit: string | null;
  doneToday?: boolean;
  nextStep?: { id: string; title: string };
}) {
  const { pending, result, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");

  if (props.kind === "habit") {
    return (
      <button
        type="button"
        disabled={pending}
        aria-pressed={!!props.doneToday}
        onClick={() => run(() => toggleHabitToday(props.goalId, !props.doneToday))}
        className={`h-11 shrink-0 rounded-xl px-3 text-sm font-semibold disabled:opacity-60 ${props.doneToday ? "bg-accent text-on-accent" : "border border-line text-accent"}`}
      >
        {props.doneToday ? "✓ Done today" : "Mark done"}
      </button>
    );
  }

  if (props.kind === "milestone") {
    if (!props.nextStep) return null;
    const step = props.nextStep;
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setGoalStepDone(step.id, true))}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line px-3 text-left text-sm disabled:opacity-60"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line" aria-hidden />
        <span className="min-w-0 truncate">Next: {step.title}</span>
      </button>
    );
  }

  if (props.kind === "money" && !props.manualMoney) return null; // follows a balance by itself

  const label = props.kind === "money" ? "Amount" : props.numberMode === "set" ? `New value${props.unit ? ` (${props.unit})` : ""}` : `Add${props.unit ? ` (${props.unit})` : ""}`;
  return adding ? (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addGoalEntry(props.goalId, props.kind === "money" ? "money" : "number", amount), (r) => {
          if (r.ok) {
            setAmount("");
            setAdding(false);
          }
        });
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={label} className={`${input} w-full`} />
      </label>
      <button type="submit" disabled={pending} className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-60">
        Save
      </button>
      {result && !result.ok && <span className="sr-only" role="alert">{result.message}</span>}
    </form>
  ) : (
    <button type="button" onClick={() => setAdding(true)} className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-accent">
      {props.kind === "number" && props.numberMode === "set" ? "Update" : "+ Add"}
    </button>
  );
}

const KINDS: { kind: Goal["kind"]; label: string; hint: string }[] = [
  { kind: "money", label: "Money", hint: "Save toward an amount" },
  { kind: "habit", label: "Habit", hint: "Daily or N× a week" },
  { kind: "number", label: "Number", hint: "Reach a number" },
  { kind: "milestone", label: "Milestones", hint: "A checklist of steps" },
];

/** Create a goal, or edit one when `initial` is given (the kind can't change after creating). */
export function GoalForm({ initial }: { initial?: Goal }) {
  const edit = !!initial;
  const { state, formAction, pending } = useSafeForm(saveGoal, { withId: !edit, resetOnSuccess: false });
  const [kind, setKind] = useState<Goal["kind"]>(initial?.kind ?? "habit");
  const [period, setPeriod] = useState<"day" | "week">(initial?.habitPeriod ?? "week");
  const [source, setSource] = useState<NonNullable<Goal["moneySource"]>>(initial?.moneySource ?? "savings");
  const chip = (on: boolean) => `rounded-xl border px-3 py-2 text-left ${on ? "border-accent bg-accent-soft" : "border-line bg-surface"}`;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {edit && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="mode" value="edit" />
        </>
      )}
      <input type="hidden" name="kind" value={kind} />
      {!edit && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">Kind of goal</legend>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)} className={chip(kind === k.kind)}>
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="block text-xs text-muted">{k.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Goal</span>
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={initial?.title}
          placeholder={kind === "money" ? "Trip to Bali" : kind === "habit" ? "Gym" : kind === "number" ? "HSK 4 words" : "Get an internship"}
          className={input}
        />
      </label>

      {kind === "money" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Target</span>
            <input name="target" inputMode="decimal" required defaultValue={initial?.targetFen ? String(initial.targetFen / 100) : ""} placeholder="5000" className={input} />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">Track it from</legend>
            <input type="hidden" name="moneySource" value={source} />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["savings", "Savings Box"],
                  ["main_account", "Main account"],
                  ["manual", "I'll add"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" disabled={edit} aria-pressed={source === v} onClick={() => setSource(v)} className={`${chip(source === v)} text-center text-sm font-medium disabled:opacity-60`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {!edit && source !== "manual" && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="countExisting" defaultChecked className="h-5 w-5 accent-[var(--color-accent)]" />
              Count what&apos;s already there
            </label>
          )}
        </>
      )}

      {kind === "habit" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">How often</legend>
          <input type="hidden" name="habitPeriod" value={period} />
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={period === "day"} onClick={() => setPeriod("day")} className={`${chip(period === "day")} text-sm font-medium`}>
              Every day
            </button>
            <button type="button" aria-pressed={period === "week"} onClick={() => setPeriod("week")} className={`${chip(period === "week")} text-sm font-medium`}>
              Per week
            </button>
            {period === "week" && (
              <label className="flex items-center gap-2 text-sm">
                <input name="habitTimes" type="number" inputMode="numeric" min={1} max={7} required defaultValue={initial?.habitTimes ?? 3} className={`${input} w-16`} />
                times
              </label>
            )}
          </div>
        </fieldset>
      )}

      {kind === "number" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Start</span>
              <input name="start" inputMode="decimal" defaultValue={initial?.startValue ?? 0} className={input} />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Target</span>
              <input name="target" inputMode="decimal" required defaultValue={initial?.targetValue ?? ""} className={input} />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Unit</span>
              <input name="unit" maxLength={20} defaultValue={initial?.unit ?? ""} placeholder="words" className={input} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">Each time you log</legend>
            <div className="flex flex-col gap-1">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="numberMode" value="add" defaultChecked={initial?.numberMode !== "set"} className="h-5 w-5 accent-[var(--color-accent)]" />
                Add to the total (words learned, km run)
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="numberMode" value="set" defaultChecked={initial?.numberMode === "set"} className="h-5 w-5 accent-[var(--color-accent)]" />
                Enter the latest value (weight, GPA)
              </label>
            </div>
          </fieldset>
        </>
      )}

      {kind === "milestone" && !edit && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Steps, one per line (you can add more later)</span>
          <textarea name="steps" rows={4} placeholder={"Update CV\nApply to 10 companies\nPass an interview"} className="rounded-xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent" />
        </label>
      )}

      {kind !== "habit" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">By when (optional)</span>
          <input name="dueDate" type="date" defaultValue={initial?.dueDate ?? ""} className={input} />
        </label>
      )}

      {state.message && !state.ok && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-2xl bg-accent text-sm font-semibold text-on-accent shadow-card disabled:opacity-60">
        {pending ? "Saving…" : edit ? "Save changes" : "Create goal"}
      </button>
    </form>
  );
}

/** Milestone steps: tick, delete, add. */
export function StepsEditor({ goalId, steps }: { goalId: string; steps: { id: string; title: string; done: boolean }[] }) {
  const { pending, result, run } = useAction();
  const [title, setTitle] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <ul className="divide-y divide-line">
        {steps.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={s.done}
              disabled={pending}
              onChange={(e) => run(() => setGoalStepDone(s.id, e.target.checked))}
              aria-label={`${s.title} done`}
              className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            />
            <span className={`min-w-0 flex-1 text-sm [overflow-wrap:anywhere] ${s.done ? "text-muted line-through" : ""}`}>{s.title}</span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteGoalStep(s.id))} className="h-11 px-2 text-xs font-semibold text-muted" aria-label={`Delete ${s.title}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addGoalStep(goalId, title), (r) => r.ok && setTitle(""));
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">New step</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Add a step" className={`${input} w-full`} />
        </label>
        <button type="submit" disabled={pending} className="h-11 rounded-xl border border-line px-4 text-sm font-semibold">
          Add
        </button>
      </form>
      {result && !result.ok && <p className="text-sm text-danger">{result.message}</p>}
    </div>
  );
}

export function RemoveEntryButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (confirming ? run(() => deleteGoalEntry(id)) : setConfirming(true))}
      className={`h-11 px-2 text-xs font-semibold ${confirming ? "text-danger" : "text-muted"}`}
    >
      {confirming ? "Tap again" : "Remove"}
    </button>
  );
}

export function CompleteButton({ id, completed }: { id: string; completed: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={pending} onClick={() => run(() => setGoalCompleted(id, !completed))} className="h-12 rounded-2xl border border-line text-sm font-semibold disabled:opacity-60">
        {completed ? "Reopen goal" : "✓ Mark goal as done"}
      </button>
      {result?.message && <p className={`text-sm ${result.ok ? "text-accent" : "text-danger"}`}>{result.message}</p>}
    </div>
  );
}
