"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  type ActionState,
  type DeletedExpense,
  deleteExpenses,
  moveExpensesToCategory,
  undoDeleteExpenses,
} from "@/app/(app)/actions";
import { Amount } from "@/components/amount";
import { CATEGORIES } from "@/lib/categories";
import { type HomeCurrency, moneyFormat } from "@/lib/money";
import { safeCall } from "@/lib/safe-call";

export type ListItem = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  signedFen: number;
  href: string;
  locked: string | null; // why it can't be changed here (closed month / linked), or null
};

export type DayGroup = { day: string; label: string; totalFen: number; items: ListItem[] };

export function TransactionList({ days, currency }: { days: DayGroup[]; currency: HomeCurrency }) {
  const fmt = moneyFormat(currency);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<ActionState | null>(null);
  const [undoRows, setUndoRows] = useState<DeletedExpense[] | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleIds = new Set(days.flatMap((d) => d.items.map((i) => i.id)));
  const chosen = [...selected].filter((id) => visibleIds.has(id));

  function toggle(id: string) {
    setConfirmDelete(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
    setConfirmDelete(false);
  }

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await safeCall(() => deleteExpenses(chosen), "Couldn't reach the app. Nothing was deleted; try again.");
      setMessage(res);
      const deleted = "deleted" in res ? (res as { deleted?: DeletedExpense[] }).deleted : undefined;
      setUndoRows(deleted && deleted.length ? deleted : null);
      if (res.ok) exitSelect();
      setConfirmDelete(false);
    });
  }

  function undo() {
    if (!undoRows) return;
    const rows = undoRows;
    startTransition(async () => {
      const res = await safeCall(() => undoDeleteExpenses(rows), "Couldn't reach the app. Tap Undo again.");
      setMessage(res);
      if (res.ok) setUndoRows(null);
    });
  }

  function move(categoryKey: string) {
    if (!categoryKey) return;
    startTransition(async () => {
      const res = await safeCall(() => moveExpensesToCategory(chosen, categoryKey), "Couldn't reach the app. Nothing was moved; try again.");
      setMessage(res);
      setUndoRows(null);
      if (res.ok) exitSelect();
    });
  }

  return (
    <>
      <div className="flex items-center justify-between px-1">
        {message?.message ? (
          <p role="status" className={`text-sm ${message.ok ? "text-accent" : "text-danger"}`}>
            {message.message}
            {undoRows && (
              <button type="button" onClick={undo} disabled={pending} className="ml-2 font-semibold underline">
                Undo
              </button>
            )}
          </p>
        ) : (
          <span />
        )}
        {days.length > 0 && (
          <button
            type="button"
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            className="h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-accent"
          >
            {selecting ? "Cancel" : "Select"}
          </button>
        )}
      </div>

      {days.map((d) => (
        <section key={d.day} className="rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3 text-xs font-semibold text-muted">
            <span>{d.label}</span>
            <span className="tabular">{fmt(d.totalFen)}</span>
          </div>
          <ul className="divide-y divide-line">
            {d.items.map((e) => {
              const isSel = selected.has(e.id);
              const body = (
                <>
                  <span className="flex min-w-0 items-center gap-3">
                    {selecting && (
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                          isSel ? "border-accent bg-accent text-on-accent" : "border-line"
                        } ${e.locked ? "opacity-30" : ""}`}
                      >
                        {isSel ? "✓" : ""}
                      </span>
                    )}
                    <span className="text-xl" aria-hidden>
                      {e.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{e.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.subtitle}
                        {selecting && e.locked && ` · ${e.locked}`}
                      </span>
                    </span>
                  </span>
                  <Amount
                    fen={e.signedFen}
                    currency={currency}
                    className="text-right text-sm font-semibold"
                  />
                </>
              );
              return (
                <li key={e.id}>
                  {selecting ? (
                    <button
                      type="button"
                      disabled={Boolean(e.locked)}
                      onClick={() => toggle(e.id)}
                      aria-pressed={isSel}
                      className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left disabled:opacity-60 ${
                        isSel ? "bg-accent-soft" : ""
                      }`}
                    >
                      {body}
                    </button>
                  ) : (
                    <Link href={e.href} className="flex items-center justify-between gap-3 px-5 py-3">
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <span className="tabular min-w-0 flex-1 text-sm font-medium">{chosen.length} selected</span>
            <select
              aria-label="Move to category"
              disabled={pending || chosen.length === 0}
              value=""
              onChange={(e) => move(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-2 text-sm disabled:opacity-40"
            >
              <option value="">Move to…</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || chosen.length === 0}
              onClick={remove}
              className={`h-10 rounded-xl px-3 text-sm font-semibold disabled:opacity-40 ${
                confirmDelete ? "bg-danger text-white" : "border border-line text-danger"
              }`}
            >
              {pending ? "…" : confirmDelete ? `Tap again: delete ${chosen.length}` : "Delete"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
