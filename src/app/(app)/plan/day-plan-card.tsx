"use client";

import { useState, useTransition } from "react";
import type { PlanItem } from "@/lib/day-plan";
import { safeCall } from "@/lib/safe-call";
import { useSafeForm } from "@/lib/use-safe-form";
import { saveDayPlan, setPlanItemDone } from "./actions";

/** Today's plan: write freely, then tick items off. */
export function DayPlanCard({ date, body, items }: { date: string; body: string; items: PlanItem[] }) {
  const [editing, setEditing] = useState(items.length === 0);
  const { state, formAction, pending } = useSafeForm(
    async (prev, fd) => {
      const res = await saveDayPlan(prev, fd);
      if (res.ok) setEditing(false);
      return res;
    },
    { withId: false, resetOnSuccess: false },
  );
  const [ticking, startTick] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = items.filter((i) => i.done).length;

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="date" value={date} />
        <label htmlFor="plan-body" className="sr-only">
          What you&apos;re going to do today
        </label>
        <textarea
          id="plan-body"
          name="body"
          rows={5}
          defaultValue={body}
          maxLength={10000}
          placeholder={"What are you going to do today? Write it however you like.\nGym at 7. Finish stats homework. Call home…"}
          className="rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
        />
        {state.message && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
        <div className="flex justify-end gap-2">
          {items.length > 0 && (
            <button type="button" onClick={() => setEditing(false)} className="h-11 px-3 text-sm font-semibold text-muted">
              Cancel
            </button>
          )}
          <button type="submit" disabled={pending} className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent shadow-card disabled:opacity-60">
            {pending ? "Saving…" : "Save plan"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((it, i) => (
          <li key={`${i}-${it.text}`}>
            <label className="flex min-h-11 items-center gap-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={it.done}
                disabled={ticking}
                onChange={(e) =>
                  startTick(async () => {
                    const res = await safeCall(() => setPlanItemDone(date, i, e.target.checked), "Couldn't reach the app. Try again.");
                    setError(res.ok ? null : res.message);
                  })
                }
                className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
              />
              <span className={`[overflow-wrap:anywhere] ${it.done ? "text-muted line-through" : ""}`}>{it.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-muted">
          {done} / {items.length} done
        </span>
        <button type="button" onClick={() => setEditing(true)} className="h-11 px-1 text-sm font-semibold text-accent">
          Edit plan
        </button>
      </div>
    </div>
  );
}
