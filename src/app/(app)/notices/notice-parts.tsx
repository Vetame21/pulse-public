"use client";

import { useRef, useState, useTransition } from "react";
import { safeCall } from "@/lib/safe-call";
import { useSafeForm } from "@/lib/use-safe-form";
import { deleteNotice, saveNotice, setNoticeArchived, setNoticePinned } from "./actions";

const input = "min-w-0 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";

/** Paste a group message (or type your own note) and save it to the board. */
export function NoticeComposer({ sources, autoFocus }: { sources: string[]; autoFocus: boolean }) {
  const { state, formAction, pending, formRef } = useSafeForm(saveNotice);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (bodyRef.current) {
        bodyRef.current.value = text;
        bodyRef.current.focus();
      }
      setPasteError(null);
    } catch {
      setPasteError("Couldn't read the clipboard. Tap in the box and paste instead.");
    }
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="notice-body" className="sr-only">
          Notice text
        </label>
        <textarea
          id="notice-body"
          ref={bodyRef}
          name="body"
          required
          maxLength={5000}
          rows={4}
          autoFocus={autoFocus}
          placeholder="Paste a group message, or write a note…"
          className={`${input} w-full py-3`}
        />
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <button type="button" onClick={paste} className="h-11 rounded-xl border border-line px-4 text-sm font-semibold">
          Paste
        </button>
        <label className="flex min-w-0">
          <span className="sr-only">From (optional)</span>
          <input name="source" list="notice-sources" maxLength={100} placeholder="From, e.g. CS class group" className={`${input} h-11 w-full`} />
          <datalist id="notice-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="pinned" className="h-5 w-5 accent-[var(--color-accent)]" />
          Pin to Today
        </label>
        <button type="submit" disabled={pending} className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent shadow-card disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {(pasteError || state.message) && (
        <p className={`text-sm ${pasteError || !state.ok ? "text-danger" : "text-accent"}`} role={state.ok ? "status" : "alert"}>
          {pasteError ?? state.message}
        </p>
      )}
    </form>
  );
}

/** Pin, archive and delete for one notice. */
export function NoticeActions({ id, pinned, archived }: { id: string; pinned: boolean; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string | null }>) =>
    startTransition(async () => {
      const res = await safeCall(fn, "Couldn't reach the app. Try again.");
      setError(res.ok ? null : res.message);
    });
  const btn = "h-11 px-2 text-xs font-semibold disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-1">
      {error && <span className="mr-auto text-xs text-danger">{error}</span>}
      {!archived && (
        <button type="button" disabled={pending} onClick={() => run(() => setNoticePinned(id, !pinned))} className={`${btn} ${pinned ? "text-accent" : "text-muted"}`}>
          {pinned ? "Unpin" : "Pin"}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => run(() => setNoticeArchived(id, !archived))} className={`${btn} text-muted`}>
        {archived ? "Restore (pin)" : "Archive"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          setConfirming(false);
          run(() => deleteNotice(id));
        }}
        className={`${btn} ${confirming ? "text-danger" : "text-muted"}`}
      >
        {confirming ? "Tap again" : "Delete"}
      </button>
    </div>
  );
}
