"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { type HomeCurrency, moneyFormat } from "@/lib/money";
import { safeCall } from "@/lib/safe-call";
import { uuid } from "@/lib/uuid";
import type { ActionState } from "../../actions";
import { deleteUtilityBill, markRentPaid, markUtilityPaid, saveUtilityBill, setRentAmount, undoRentPayment } from "./actions";

const idle: ActionState = { ok: false, message: null };
const input = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

export function RentRow({
  month,
  label,
  payment,
  defaultAmountFen,
  today,
  currency,
}: {
  month: string;
  label: string;
  payment: { id: string; amountFen: number; paidDate: string } | null;
  defaultAmountFen: number;
  today: string;
  currency: HomeCurrency;
}) {
  const fmt = moneyFormat(currency);
  const [open, setOpen] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const pendingId = useRef<string | null>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    fd.set("id", (pendingId.current ??= uuid()));
    const res = await safeCall(() => markRentPaid(prev, fd));
    if (res.ok) {
      pendingId.current = null;
      setOpen(false);
    }
    return res;
  }, idle);
  const [undoPending, startUndo] = useTransition();
  const [undoMsg, setUndoMsg] = useState<string | null>(null);

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted">
            {payment
              ? `Paid ${fmt(payment.amountFen)} on ${new Date(`${payment.paidDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`
              : `Due ${fmt(defaultAmountFen)}`}
          </span>
        </span>
        {payment ? (
          <span className="flex items-center gap-3">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold">✓ Paid</span>
            <button
              type="button"
              disabled={undoPending}
              onClick={() => {
                if (!confirmUndo) return setConfirmUndo(true);
                startUndo(async () => {
                  const res = await safeCall(() => undoRentPayment(payment.id), "Couldn't reach the app. Try again.");
                  if (!res.ok) setUndoMsg(res.message);
                  setConfirmUndo(false);
                });
              }}
              className={`text-xs font-semibold ${confirmUndo ? "text-danger" : "text-muted"}`}
            >
              {confirmUndo ? "Tap again" : "Undo"}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning"
          >
            Unpaid · Mark paid
          </button>
        )}
      </div>
      {undoMsg && <p className="mt-1 text-xs text-danger">{undoMsg}</p>}
      {open && !payment && (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-track/60 p-3">
          <input type="hidden" name="month" value={month} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Amount
            <input name="amount" inputMode="decimal" defaultValue={(defaultAmountFen / 100).toString()} className={`${input} w-28`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Paid on
            <input name="paidDate" type="date" defaultValue={today} max={today} className={input} />
          </label>
          <button disabled={pending} className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-60">
            {pending ? "…" : "Save"}
          </button>
        </form>
      )}
      {state.message && !state.ok && <p className="mt-1 text-xs text-danger">{state.message}</p>}
    </li>
  );
}

export function RentAmountForm({ currentFen }: { currentFen: number }) {
  const [state, action, pending] = useActionState(
    (prev: ActionState, fd: FormData) => safeCall(() => setRentAmount(prev, fd), "Couldn't reach the app. Try again."),
    idle,
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Rent + management per month
          <input name="amount" inputMode="decimal" defaultValue={currentFen ? (currentFen / 100).toString() : ""} className={input} />
        </label>
        <button disabled={pending} className="h-10 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-60">
          Update
        </button>
      </div>
      <p className="text-xs text-muted">Only changes months you haven&apos;t paid yet. Paid months keep their amount.</p>
      {state.message && <p className={`text-xs ${state.ok ? "text-accent" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}

type BillInitial = {
  id: string;
  periodStart: string;
  periodEnd: string;
  paidDate: string;
  electricity: string;
  water: string;
  total: string;
  note: string;
};

export function UtilityBillForm({ mode, initial, today }: { mode: "create" | "edit"; initial: BillInitial; today: string }) {
  const [state, action, pending] = useActionState(
    (prev: ActionState, fd: FormData) => safeCall(() => saveUtilityBill(prev, fd)),
    idle,
  );
  const [split, setSplit] = useState(Boolean(initial.electricity || initial.water));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const field = "flex flex-col gap-1 text-sm text-muted";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="mode" value={mode} />
      <div className="grid grid-cols-2 gap-3">
        <label className={field}>
          Period start
          <input name="periodStart" type="date" required defaultValue={initial.periodStart} className={input} />
        </label>
        <label className={field}>
          Period end
          <input name="periodEnd" type="date" required defaultValue={initial.periodEnd} className={input} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
        {[
          [false, "One combined amount"],
          [true, "Electricity + water"],
        ].map(([value, text]) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => setSplit(value as boolean)}
            aria-pressed={split === value}
            className={`h-9 rounded-lg text-sm font-semibold ${split === value ? "bg-surface shadow-card" : "text-muted"}`}
          >
            {text as string}
          </button>
        ))}
      </div>

      {split ? (
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            ⚡ Electricity
            <input name="electricity" inputMode="decimal" defaultValue={initial.electricity} className={input} />
          </label>
          <label className={field}>
            💧 Water
            <input name="water" inputMode="decimal" defaultValue={initial.water} className={input} />
          </label>
          <input type="hidden" name="total" value="" />
        </div>
      ) : (
        <label className={field}>
          Total
          <input name="total" inputMode="decimal" required defaultValue={initial.total} className={input} />
          <input type="hidden" name="electricity" value="" />
          <input type="hidden" name="water" value="" />
        </label>
      )}

      <label className={field}>
        Paid on (leave empty if not paid yet)
        <input name="paidDate" type="date" max={today} defaultValue={initial.paidDate} className={input} />
      </label>
      <label className={field}>
        Note (optional)
        <input name="note" maxLength={500} defaultValue={initial.note} className={input} />
      </label>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="h-12 rounded-2xl bg-accent text-base font-semibold text-on-accent shadow-card disabled:opacity-60">
        {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Add bill"}
      </button>
      {mode === "edit" && (
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            startDelete(async () => {
              const res = await safeCall(() => deleteUtilityBill(initial.id), "Couldn't reach the app. Nothing was deleted.");
              if (res && !res.ok) setDeleteMsg(res.message);
            });
          }}
          className={`h-11 rounded-2xl border text-sm font-semibold ${confirmDelete ? "border-danger bg-danger text-white" : "border-line text-danger"}`}
        >
          {confirmDelete ? "Tap again to delete this bill" : "Delete bill"}
        </button>
      )}
      {deleteMsg && <p className="text-sm text-danger">{deleteMsg}</p>}
    </form>
  );
}

export function MarkUtilityPaid({ id, today }: { id: string; today: string }) {
  const [date, setDate] = useState(today);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Paid on" className={input} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await safeCall(() => markUtilityPaid(id, date), "Couldn't reach the app. Try again.");
            setMsg(res.ok ? null : res.message);
          })
        }
        className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-60"
      >
        Mark paid
      </button>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </div>
  );
}
