"use client";

import { useState } from "react";
import { useSafeForm } from "@/lib/use-safe-form";
import { finishWelcome } from "./actions";

const REGIONS = [
  { id: "hk", flag: "🇭🇰", name: "Hong Kong, China", money: "HK$ Hong Kong dollar", note: "Hong Kong public holidays" },
  { id: "mainland", flag: "🇨🇳", name: "Mainland China", money: "¥ RMB", note: "Mainland holidays and 调休 make-up days" },
] as const;

export function WelcomeForm() {
  const { state, formAction, pending } = useSafeForm(finishWelcome, { withId: false, resetOnSuccess: false });
  const [region, setRegion] = useState<"hk" | "mainland" | null>(null);
  const symbol = region === "hk" ? "HK$" : "¥";
  const box = "h-5 w-5 shrink-0 accent-[var(--color-accent)]";
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="region" value={region ?? ""} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Where do you live?</legend>
        <div className="flex flex-col gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={region === r.id}
              onClick={() => setRegion(r.id)}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${region === r.id ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
            >
              <span className="text-3xl" aria-hidden>
                {r.flag}
              </span>
              <span>
                <span className="block font-semibold">{r.name}</span>
                <span className="block text-sm text-muted">
                  {r.money} · {r.note}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">This sets your currency for good: every amount is saved in it.</p>
      </fieldset>

      {region && (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">Monthly budget for your own spending</span>
            <span className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-muted">{symbol}</span>
              <input name="budget" inputMode="decimal" required placeholder={region === "hk" ? "5000" : "2000"} className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-lg outline-none focus:border-accent" />
            </span>
            <span className="text-xs text-muted">Food, transport, shopping… You can change it later on the Money page.</span>
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium text-muted">Extras (you can change these in Settings)</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="rent" className={box} />
              I pay rent (track rent and utility bills)
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="family" className={box} />
              I keep money for family (money they send me to pass on)
            </label>
          </fieldset>
        </>
      )}

      {state.message && !state.ok && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending || !region} className="h-14 rounded-2xl bg-accent text-base font-semibold text-on-accent shadow-card disabled:opacity-50">
        {pending ? "Setting up…" : "Start using Pulse"}
      </button>
    </form>
  );
}
