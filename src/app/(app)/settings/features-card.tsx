"use client";

import { useSafeForm } from "@/lib/use-safe-form";
import { saveFeatures } from "./feature-actions";

/** Which parts of the app this account uses. Saves on every change. */
export function FeaturesCard({
  family,
  rent,
}: {
  family: boolean;
  rent: boolean;
}) {
  const { state, formAction, pending, formRef } = useSafeForm(saveFeatures, { withId: false, resetOnSuccess: false });
  const save = () => formRef.current?.requestSubmit();
  const box = "h-5 w-5 shrink-0 accent-[var(--color-accent)]";
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="family" defaultChecked={family} onChange={save} className={box} />
        <span>
          Family Money
          <span className="block text-xs text-muted">Money someone sends you to pass on, and loans to them</span>
        </span>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="rent" defaultChecked={rent} onChange={save} className={box} />
        <span>
          Apartment
          <span className="block text-xs text-muted">Monthly rent and utility bills</span>
        </span>
      </label>
      <p className={`min-h-5 text-xs ${state.ok ? "text-muted" : "text-danger"}`} aria-live="polite">
        {pending ? "Saving…" : state.message}
      </p>
    </form>
  );
}
