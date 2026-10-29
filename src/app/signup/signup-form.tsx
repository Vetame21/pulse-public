"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "./actions";

const initialState: SignupState = { error: null, sent: false };
const input = "h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.sent) {
    return (
      <div className="flex flex-col gap-2 text-sm" role="status">
        <p className="text-base font-semibold">Check your email 📬</p>
        <p className="text-muted">We sent a link to confirm your address. Open it to finish creating your account, then you&apos;ll set up Pulse.</p>
        <p className="text-xs text-muted">Nothing there? Check spam, or wait a minute: confirmation emails can take a moment.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Email</span>
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Password (at least 8 characters)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Password again</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={input} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="mt-2 h-12 rounded-xl bg-accent text-base font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
