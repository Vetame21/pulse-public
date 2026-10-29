"use client";

import { useState, useTransition } from "react";
import { setDeadlineDone } from "@/app/(app)/calendar/actions";
import { safeCall } from "@/lib/safe-call";

/** One tap marks a deadline done (it then leaves the briefing). */
export function DoneButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await safeCall(() => setDeadlineDone(id, true), "Couldn't reach the app. Try again.");
            setError(res.ok ? null : res.message);
          })
        }
        className="h-8 rounded-full border border-line px-3 text-xs font-semibold text-accent disabled:opacity-60"
      >
        {pending ? "…" : "✓ Done"}
      </button>
      {error && <span className="mt-0.5 max-w-40 text-right text-xs text-danger">{error}</span>}
    </span>
  );
}
