"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { loanFen } from "@/lib/ledgers";
import { type HomeCurrency, moneyFormat, parseYuan } from "@/lib/money";
import { useSafeForm } from "@/lib/use-safe-form";
import { addFamilyEntry, keepFamilyRest } from "./actions";

const input = "h-11 rounded-xl border border-line bg-surface px-3 text-sm";
const toggle = (on: boolean) => `min-h-9 rounded-lg px-2 py-1.5 text-sm font-semibold ${on ? "bg-surface shadow-card" : "text-muted"}`;

type Person = { name: string; balanceFen: number; keepRest: boolean };

export function FamilyForm({ today, people, payees, currency }: { today: string; people: Person[]; payees: string[]; currency: HomeCurrency }) {
  const fmt = moneyFormat(currency);
  const holding = people.filter((p) => p.balanceFen > 0).sort((a, b) => b.balanceFen - a.balanceFen);
  const [kind, setKind] = useState<"received" | "paid">(holding.length ? "paid" : "received");
  const [from, setFrom] = useState(holding[0]?.name ?? people.at(-1)?.name ?? "");
  const [keepRest, setKeepRest] = useState(false);
  const [askFor, setAskFor] = useState<string | null>(null);
  const { state, formAction, pending, formRef } = useSafeForm(addFamilyEntry);
  const [amount, setAmount] = useState("");
  const person = people.find((p) => p.name === from.trim());
  const balanceFen = person?.balanceFen ?? 0;
  const lentFen = kind === "paid" && from.trim() ? loanFen(balanceFen, parseYuan(amount) ?? 0) : 0;
  // After a payment from money where "the rest is mine": ask whether the rest is yours now.
  const ask = state.ok && !pending ? people.find((p) => p.name === askFor && p.keepRest && p.balanceFen > 0) : undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setAskFor(kind === "paid" ? from.trim() : null)}
      onReset={() => setAmount("")}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
        {(
          [
            ["received", "⬇️ Money received"],
            ["paid", "⬆️ Money paid"],
          ] as const
        ).map(([k, text]) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={toggle(kind === k)}>
            {text}
          </button>
        ))}
      </div>
      <input
        name="from"
        list="family-names"
        required
        maxLength={60}
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        aria-label={kind === "received" ? "From" : "Whose money"}
        placeholder={kind === "received" ? "From, e.g. Alex" : "Whose money, e.g. Alex"}
        className={input}
      />
      <datalist id="family-names">
        {people.map((p) => (
          <option key={p.name} value={p.name} />
        ))}
      </datalist>
      <div className="flex gap-2">
        <input name="amount" inputMode="decimal" required placeholder="Amount" onChange={(e) => setAmount(e.target.value)} className={`${input} min-w-0 flex-1`} />
        <input name="date" type="date" defaultValue={today} max={today} aria-label="Date" className={input} />
      </div>
      {kind === "received" && (
        <>
          {keepRest && <input type="hidden" name="keepRest" value="on" />}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
            <button type="button" onClick={() => setKeepRest(false)} aria-pressed={!keepRest} className={toggle(!keepRest)}>
              All of it to pass on
            </button>
            <button type="button" onClick={() => setKeepRest(true)} aria-pressed={keepRest} className={toggle(keepRest)}>
              Part to pass on, rest is mine
            </button>
          </div>
          <p className="text-xs text-muted">
            {keepRest
              ? "After each payment, Pulse asks if the rest is yours now or another payment is coming."
              : "You only hold it. None of it is yours."}
          </p>
        </>
      )}
      {kind === "paid" && (
        <>
          <input name="person" list="family-payees" maxLength={100} placeholder="Paid to (optional), e.g. a relative" className={input} />
          <datalist id="family-payees">
            {payees.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {from.trim() && (
            <p className="text-xs text-muted">
              {balanceFen >= 0 ? `Available from ${from.trim()}: ${fmt(balanceFen)}` : `${from.trim()} already owes you ${fmt(-balanceFen)}`}
            </p>
          )}
          {lentFen > 0 && (
            <label className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
              <input type="checkbox" name="confirmLoan" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
              <span>
                Lend the rest: <strong>{fmt(lentFen)}</strong> from your own money. {from.trim()} will owe you; money they send later pays it back first.
              </span>
            </label>
          )}
        </>
      )}
      <input name="purpose" maxLength={200} placeholder="Purpose (optional)" className={input} />
      <input name="note" maxLength={500} placeholder="Note (optional)" className={input} />
      {state.message && <p className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>{state.message}</p>}
      {ask && (
        <div className="rounded-xl border border-line p-3 text-sm" aria-live="polite">
          <p>
            <strong>{fmt(ask.balanceFen)}</strong> of {ask.name}&apos;s money is left. Is the rest yours now?
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setAskFor(null)} className="text-sm font-semibold text-muted">
              Another payment is coming
            </button>
            <ConfirmButton action={keepFamilyRest} id={ask.name} label="Yes, it's mine" />
          </div>
        </div>
      )}
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Saving…" : kind === "received" ? "Save money received" : "Save payment"}
      </button>
    </form>
  );
}
