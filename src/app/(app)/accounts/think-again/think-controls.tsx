"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { CATEGORIES } from "@/lib/categories";
import { type HomeCurrency, moneyFormat } from "@/lib/money";
import { WAIT_CHOICES } from "@/lib/think-again";
import { useSafeForm } from "@/lib/use-safe-form";
import { addThinkItem, buyThinkItem, deleteThinkItem, skipThinkItem, undoThinkDecision, waitLonger } from "./actions";

const input = "h-11 rounded-xl border border-line bg-surface px-3 text-sm";

export function AddThinkForm({ defaultWait }: { defaultWait: number }) {
  const { state, formAction, pending, formRef } = useSafeForm(addThinkItem);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input name="name" required maxLength={200} placeholder="What do you want? e.g. spare Chinese phone" className={input} />
      <div className="flex gap-2">
        <input name="price" inputMode="decimal" required placeholder="Price" className={`${input} min-w-0 flex-1`} />
        <select name="category" defaultValue="shopping" aria-label="Category" className={input}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm text-muted">Think again in</legend>
        <div className="flex flex-wrap gap-2">
          {WAIT_CHOICES.map((d) => (
            <label key={d} className="cursor-pointer">
              <input type="radio" name="waitDays" value={d} defaultChecked={d === defaultWait} className="peer sr-only" />
              <span className="block rounded-full border border-line px-3 py-1.5 text-sm text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-foreground">
                {d} days
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <input name="note" maxLength={500} placeholder="Why do you want it? (optional)" className={input} />
      {state.message && <p className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>{state.message}</p>}
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Adding…" : "Add to waitlist"}
      </button>
    </form>
  );
}

export function DecideActions({
  itemId,
  priceFen,
  today,
  savingsBalanceFen,
  ready,
  currency,
}: {
  itemId: string;
  priceFen: number;
  today: string;
  savingsBalanceFen: number;
  ready: boolean;
  currency: HomeCurrency;
}) {
  const fmt = moneyFormat(currency);
  const [buying, setBuying] = useState(false);
  const [fundedBy, setFundedBy] = useState<"budget" | "savings">("budget");
  const { state, formAction, pending } = useSafeForm(buyThinkItem, { resetOnSuccess: false });

  return (
    <div className="mt-3">
      {!buying ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setBuying(true)} className="h-9 rounded-lg border border-line px-3 text-sm font-semibold">
            {ready ? "Buy it" : "Buy now anyway"}
          </button>
          <ConfirmButton action={skipThinkItem} id={itemId} label="Skip it 🎉" confirmLabel="Tap again to skip" className="h-9 rounded-lg bg-accent-soft px-3 text-sm text-foreground!" />
          {ready && <ConfirmButton action={waitLonger} id={itemId} label="Wait 7 more days" confirmLabel="Tap again" className="h-9 px-1 text-sm" />}
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2 rounded-xl bg-track/60 p-3">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="fundedBy" value={fundedBy} />
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
              Paid
              <input name="amount" inputMode="decimal" defaultValue={(priceFen / 100).toString()} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              On
              <input name="date" type="date" defaultValue={today} max={today} className={input} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["budget", "This month's budget"],
                ["savings", `Savings Box (${fmt(savingsBalanceFen)})`],
              ] as const
            ).map(([v, text]) => (
              <button
                key={v}
                type="button"
                disabled={v === "savings" && savingsBalanceFen <= 0}
                onClick={() => setFundedBy(v)}
                aria-pressed={fundedBy === v}
                className={`rounded-lg border px-2 py-2 text-xs font-medium disabled:opacity-40 ${fundedBy === v ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
              >
                {text}
              </button>
            ))}
          </div>
          {state.message && <p className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>{state.message}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="h-10 flex-1 rounded-lg bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
              {pending ? "Saving…" : "Save purchase"}
            </button>
            <button type="button" onClick={() => setBuying(false)} className="h-10 rounded-lg px-3 text-sm text-muted">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function DecidedActions({ itemId }: { itemId: string }) {
  return (
    <span className="flex gap-3">
      <ConfirmButton action={undoThinkDecision} id={itemId} label="Undo" confirmLabel="Tap again" />
      <ConfirmButton action={deleteThinkItem} id={itemId} label="Remove" confirmLabel="Tap again" />
    </span>
  );
}

export function RemoveItem({ itemId }: { itemId: string }) {
  return <ConfirmButton action={deleteThinkItem} id={itemId} label="Remove" confirmLabel="Tap again" />;
}
