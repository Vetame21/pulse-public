"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/actions";
import { safeCall } from "@/lib/safe-call";

/** A small button that needs a second tap, then runs a server action with an id. */
export function ConfirmButton({
  action,
  id,
  label = "Delete",
  confirmLabel = "Tap again",
  className = "",
}: {
  action: (id: string) => Promise<ActionState>;
  id: string;
  label?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          startTransition(async () => {
            const res = await safeCall(() => action(id), "Couldn't reach the app. Try again.");
            setError(res.ok ? null : res.message);
            setConfirming(false);
          });
        }}
        className={`text-xs font-semibold ${confirming ? "text-danger" : "text-muted"} ${className}`}
      >
        {pending ? "…" : confirming ? confirmLabel : label}
      </button>
      {error && <span className="mt-0.5 max-w-48 text-right text-xs text-danger">{error}</span>}
    </span>
  );
}
