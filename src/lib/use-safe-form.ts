"use client";

import { useActionState, useRef } from "react";
import type { ActionState } from "@/app/(app)/actions";
import { safeCall } from "./safe-call";
import { uuid } from "./uuid";

/**
 * useActionState for create forms: adds an "id" field that stays the same
 * across retries (so a resubmit after a dropped connection can't create a
 * duplicate), turns network failures into a message, and resets the form on success.
 */
export function useSafeForm<S extends ActionState>(
  action: (prev: S, fd: FormData) => Promise<S>,
  options: { withId?: boolean; resetOnSuccess?: boolean } = {},
) {
  const { withId = true, resetOnSuccess = true } = options;
  const pendingId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<S, FormData>(
    async (prev, fd) => {
      if (withId) fd.set("id", (pendingId.current ??= uuid()));
      const res = (await safeCall(() => action(prev, fd))) as S;
      if (res.ok) {
        pendingId.current = null;
        if (resetOnSuccess) formRef.current?.reset();
      }
      return res;
    },
    { ok: false, message: null } as Awaited<S>,
  );
  return { state, formAction, pending, formRef };
}
