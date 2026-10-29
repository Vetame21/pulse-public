"use client";

import { useActionState } from "react";
import { demoLogin, login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-12 rounded-xl bg-accent text-base font-semibold text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** One tap into the shared demo account. */
export function DemoButton() {
  const [state, formAction, pending] = useActionState(demoLogin, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button disabled={pending} className="h-12 rounded-xl bg-accent text-base font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Opening the demo…" : "Try the demo"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
