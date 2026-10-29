"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/actions";
import { deleteEvent, saveEvent, setDeadlineDone } from "@/app/(app)/calendar/actions";
import { LEAD_DAYS } from "@/lib/briefing";
import { DeadlineIcon, EventIcon } from "./icons";
import { safeCall } from "@/lib/safe-call";
import { uuid } from "@/lib/uuid";

type Values = {
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  kind: "event" | "deadline";
  leadDays: string;
  done: boolean;
};

const input = "h-12 min-w-0 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent";

type CreateProps = { mode: "create"; date: string; kind?: "event" | "deadline"; title?: string; time?: string; noticeId?: string };

export function EventForm(props: CreateProps | { mode: "edit"; id: string; values: Values }) {
  const router = useRouter();
  const initial: Values =
    props.mode === "edit" ? props.values : {
          title: props.title ?? "",
          date: props.date,
          endDate: "",
          allDay: false,
          startTime: props.time ?? "",
          endTime: "",
          location: "",
          notes: "",
          kind: props.kind ?? "event",
          leadDays: String(LEAD_DAYS.normal),
          done: false,
        };
  const [v, setV] = useState(initial);
  const [multiDay, setMultiDay] = useState(initial.endDate !== "");
  const [result, setResult] = useState<ActionState | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // Kept across retries so a resubmit after a network error can't create a duplicate.
  const pendingId = useRef<string | null>(null);
  const deadline = v.kind === "deadline";
  const size = v.leadDays === String(LEAD_DAYS.big) ? "big" : v.leadDays === String(LEAD_DAYS.normal) ? "normal" : "custom";
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((o) => ({ ...o, [k]: value }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();
    fd.set("id", props.mode === "edit" ? props.id : (pendingId.current ??= uuid()));
    fd.set("mode", props.mode);
    fd.set("title", v.title);
    fd.set("date", v.date);
    fd.set("endDate", multiDay && !deadline ? v.endDate : "");
    fd.set("allDay", deadline ? (v.startTime ? "" : "on") : v.allDay ? "on" : "");
    fd.set("startTime", !deadline && v.allDay ? "" : v.startTime);
    fd.set("endTime", deadline || v.allDay ? "" : v.endTime);
    fd.set("kind", v.kind);
    fd.set("leadDays", deadline ? v.leadDays : "");
    if (props.mode === "create" && props.noticeId) fd.set("noticeId", props.noticeId);
    fd.set("location", v.location);
    fd.set("notes", v.notes);
    startTransition(async () => setResult(await safeCall(() => saveEvent({ ok: false, message: null }, fd))));
  }

  function remove() {
    if (props.mode !== "edit") return;
    if (!confirmingDelete) return setConfirmingDelete(true);
    const { id } = props;
    startTransition(async () => {
      const res = await safeCall(() => deleteEvent(id), "Couldn't reach the app. Try again.");
      if (res.ok) router.push(`/calendar?month=${v.date.slice(0, 7)}&day=${v.date}`);
      else setResult(res);
      setConfirmingDelete(false);
    });
  }

  function toggleDone() {
    if (props.mode !== "edit") return;
    const { id } = props;
    startTransition(async () => {
      const res = await safeCall(() => setDeadlineDone(id, !v.done), "Couldn't reach the app. Try again.");
      if (res.ok) set("done", !v.done);
      setResult(res);
    });
  }

  const chip = (on: boolean) =>
    `flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-medium ${on ? "border-accent bg-accent-soft" : "border-line bg-surface text-muted"}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!deadline} onClick={() => set("kind", "event")} className={chip(!deadline)}>
            <EventIcon /> Event
          </button>
          <button type="button" aria-pressed={deadline} onClick={() => set("kind", "deadline")} className={chip(deadline)}>
            <DeadlineIcon /> Deadline
          </button>
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Title</span>
        <input
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          required
          maxLength={200}
          placeholder={deadline ? "Databases homework 3…" : "Exam, dinner, meeting…"}
          className={input}
          autoFocus={props.mode === "create"}
        />
      </label>

      {deadline ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-medium text-muted">Due date</span>
              <input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} required className={input} />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-medium text-muted">Due time (optional)</span>
              <input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} className={input} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">How big is it?</legend>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" aria-pressed={size === "big"} onClick={() => set("leadDays", String(LEAD_DAYS.big))} className={chip(size === "big")}>
                Big · 2 wk
              </button>
              <button type="button" aria-pressed={size === "normal"} onClick={() => set("leadDays", String(LEAD_DAYS.normal))} className={chip(size === "normal")}>
                Normal · 1 wk
              </button>
              <button type="button" aria-pressed={size === "custom"} onClick={() => set("leadDays", "3")} className={chip(size === "custom")}>
                Custom
              </button>
            </div>
            {size === "custom" && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                Start reminding me
                <input type="number" inputMode="numeric" min={1} max={90} value={v.leadDays} onChange={(e) => set("leadDays", e.target.value)} required className="h-11 w-20 rounded-xl border border-line bg-surface px-3 text-base" />
                days before
              </label>
            )}
            <p className="mt-2 text-xs text-muted">It shows in your Today briefing every day from then until you mark it done.</p>
          </fieldset>
        </>
      ) : (
        <>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium text-muted">{multiDay ? "From" : "Date"}</span>
          <input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} required className={input} />
        </label>
        <label className="flex h-12 items-center gap-2 text-sm">
          <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
          Several days
        </label>
      </div>
      {multiDay && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Until</span>
          <input type="date" value={v.endDate} min={v.date} onChange={(e) => set("endDate", e.target.value)} required className={input} />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
        All day
      </label>
      {!v.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium text-muted">Starts</span>
            <input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} required className={input} />
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium text-muted">Ends (optional)</span>
            <input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} className={input} />
          </label>
        </div>
      )}

        </>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Where (optional)</span>
        <input value={v.location} onChange={(e) => set("location", e.target.value)} maxLength={200} placeholder="Room, building, restaurant…" className={input} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Notes (optional)</span>
        <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} rows={3} className="rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent" />
      </label>

      {result && !result.ok && result.message && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {result.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="h-14 rounded-2xl bg-accent text-base font-semibold text-on-accent shadow-card disabled:opacity-60">
        {pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Add to calendar"}
      </button>
      {props.mode === "edit" && deadline && (
        <button type="button" onClick={toggleDone} disabled={pending} className="h-12 rounded-2xl border border-line text-sm font-semibold disabled:opacity-60">
          {v.done ? "↩︎ Mark as not done" : "✓ Mark as done"}
        </button>
      )}
      {props.mode === "edit" && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className={`h-12 rounded-2xl border text-sm font-semibold disabled:opacity-60 ${confirmingDelete ? "border-danger bg-danger-soft text-danger" : "border-line text-muted"}`}
        >
          {confirmingDelete ? "Tap again to delete" : "Delete event"}
        </button>
      )}
    </form>
  );
}
