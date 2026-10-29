"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { type HomeCurrency, moneyFormat } from "@/lib/money";
import { safeCall } from "@/lib/safe-call";
import { uuid } from "@/lib/uuid";
import type { ActionState } from "../actions";
import { addSavingsEntry, closeMonthAndReturn, deleteSavingsEntry, reopenMonth } from "./actions";

const idle: ActionState = { ok: false, message: null };

export type BudgetOption = { value: "none" | "prorated" | "full" | "custom"; title: string; budgetFen: number | null; detail: string };

export function CloseMonthForm({
  month,
  monthLabel,
  spentFen,
  budgetFen,
  partialOptions,
  currency,
}: {
  month: string; // "2026-09"
  monthLabel: string;
  spentFen: number;
  budgetFen: number;
  partialOptions: BudgetOption[] | null;
  currency: HomeCurrency;
}) {
  const fmt = moneyFormat(currency);
  const [state, action, pending] = useActionState(
    (prev: ActionState, fd: FormData) =>
      safeCall(() => closeMonthAndReturn(prev, fd), "Couldn't reach the app. Nothing was changed; try again."),
    idle,
  );
  const [choice, setChoice] = useState<BudgetOption["value"]>("none");
  const [custom, setCustom] = useState("");

  const chosenBudget = partialOptions
    ? choice === "custom"
      ? Math.round(Number(custom || 0) * 100)
      : (partialOptions.find((o) => o.value === choice)?.budgetFen ?? 0)
    : budgetFen;
  const saved = Math.max(0, chosenBudget - spentFen);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="month" value={month} />

      {partialOptions && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Budget for this partial month</legend>
          {partialOptions.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${choice === o.value ? "border-accent bg-accent-soft" : "border-line"}`}
            >
              <input
                type="radio"
                name="budgetChoice"
                value={o.value}
                checked={choice === o.value}
                onChange={() => setChoice(o.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted">{o.detail}</span>
                {o.value === "custom" && choice === "custom" && (
                  <input
                    name="customBudget"
                    inputMode="decimal"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))}
                    placeholder="e.g. 145.16"
                    className="mt-2 h-10 w-36 rounded-lg border border-line bg-surface px-3 text-sm"
                  />
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="rounded-xl bg-track/60 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Budget</span>
          <span className="tabular">{fmt(chosenBudget)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Spent</span>
          <span className="tabular">{fmt(spentFen)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
          <span>To Savings Box</span>
          <span className="tabular">+{fmt(saved)}</span>
        </div>
        {spentFen > chosenBudget && chosenBudget > 0 && (
          <p className="mt-2 text-xs text-muted">
            Over budget by {fmt(spentFen - chosenBudget)}. That&apos;s recorded, but nothing is taken from your savings.
          </p>
        )}
      </div>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}

      <button
        disabled={pending}
        className="h-12 rounded-2xl bg-accent text-base font-semibold text-on-accent shadow-card disabled:opacity-60"
      >
        {pending ? "Closing…" : `Close ${monthLabel}${saved > 0 ? ` · +${fmt(saved)}` : ""}`}
      </button>
    </form>
  );
}

export function ReopenButton({ month, label }: { month: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          startTransition(async () => {
            setResult(await safeCall(() => reopenMonth(month), "Couldn't reach the app. Try again."));
            setConfirming(false);
          });
        }}
        className={`text-xs font-semibold ${confirming ? "text-danger" : "text-muted"}`}
      >
        {pending ? "…" : confirming ? `Tap again to reopen ${label}` : "Reopen"}
      </button>
      {result?.message && <p className={`mt-1 text-xs ${result.ok ? "text-accent" : "text-danger"}`}>{result.message}</p>}
    </div>
  );
}

export function SavingsEntryForm({ today, balanceFen, currency }: { today: string; balanceFen: number; currency: HomeCurrency }) {
  const fmt = moneyFormat(currency);
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const pendingId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    fd.set("id", (pendingId.current ??= uuid()));
    const res = await safeCall(() => addSavingsEntry(prev, fd), "Couldn't reach the app. Tap Save again (it won't be saved twice).");
    if (res.ok) {
      pendingId.current = null;
      formRef.current?.reset();
    }
    return res;
  }, idle);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
        {(["deposit", "withdrawal"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`h-9 rounded-lg text-sm font-semibold ${kind === k ? "bg-surface shadow-card" : "text-muted"}`}
          >
            {k === "deposit" ? "Add money" : "Take money out"}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          name="amount"
          inputMode="decimal"
          placeholder="Amount"
          required
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
        />
        <input
          name="date"
          type="date"
          defaultValue={today}
          max={today}
          required
          aria-label="Date"
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
        />
      </div>
      <input
        name="note"
        maxLength={500}
        placeholder={kind === "deposit" ? "Note (optional), e.g. birthday money" : "Note (optional), e.g. moved to bank"}
        className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
      />
      {kind === "withdrawal" && <p className="text-xs text-muted">Available: {fmt(balanceFen)}</p>}
      {state.message && <p className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>{state.message}</p>}
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function DeleteEntryButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          startTransition(async () => {
            const res = await safeCall(() => deleteSavingsEntry(id), "Couldn't reach the app. Try again.");
            if (!res.ok) setError(res.message);
            setConfirming(false);
          });
        }}
        className={`text-xs font-semibold ${confirming ? "text-danger" : "text-muted"}`}
      >
        {confirming ? "Tap again" : "Delete"}
      </button>
      {error && <span className="block text-xs text-danger">{error}</span>}
    </>
  );
}
