"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/actions";
import { addPastedClasses, readTimetableFromPhoto, saveBirthday, saveClass, saveSemester } from "@/app/(app)/calendar/actions";
import { safeCall } from "@/lib/safe-call";
import type { Birthday } from "@/lib/briefing";
import { type ClassRow, formatWeeks } from "@/lib/timetable";
import { useSafeForm } from "@/lib/use-safe-form";

const input = "h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Message({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="h-12 rounded-2xl bg-accent text-sm font-semibold text-on-accent shadow-card disabled:opacity-60">
      {pending ? "Saving…" : children}
    </button>
  );
}

export function SemesterForm() {
  const { state, formAction, pending, formRef } = useSafeForm(saveSemester);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Name</span>
        <input name="name" required maxLength={100} placeholder="2026-2027 Semester 1" className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Week 1 starts (Monday)</span>
          <input name="startDate" type="date" required className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Teaching weeks</span>
          <input name="weeks" type="number" inputMode="numeric" min={1} max={30} defaultValue={18} required className={input} />
        </label>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Add semester</Submit>
    </form>
  );
}

/** Add a class, or edit one when `initial` is given. */
export function ClassForm({ semesterId, initial }: { semesterId: string; initial?: ClassRow }) {
  const edit = !!initial;
  const { state, formAction, pending, formRef } = useSafeForm(saveClass, { withId: !edit, resetOnSuccess: !edit });
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="semesterId" value={semesterId} />
      {edit && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="mode" value="edit" />
        </>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Class</span>
        <input name="title" required maxLength={200} placeholder="Databases" defaultValue={initial?.title} className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Chinese name (optional)</span>
        <input name="titleZh" maxLength={200} placeholder="数据结构" defaultValue={initial?.titleZh ?? ""} className={input} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Day</span>
          <select name="weekday" required defaultValue={initial?.weekday} className={input}>
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d.slice(0, 3)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Starts</span>
          <input name="startTime" type="time" required defaultValue={initial?.startTime} className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Ends</span>
          <input name="endTime" type="time" required defaultValue={initial?.endTime} className={input} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Weeks</span>
        <input name="weeks" required placeholder="1-17  or  1-7, 9-17" defaultValue={initial ? formatWeeks(initial.weeks) : undefined} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Room (optional)</span>
          <input name="room" maxLength={50} placeholder="A1503" defaultValue={initial?.room ?? ""} className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Teacher (optional)</span>
          <input name="teacher" maxLength={100} defaultValue={initial?.teacher ?? ""} className={input} />
        </label>
      </div>
      <Message state={state} />
      <Submit pending={pending}>{edit ? "Save changes" : "Add class"}</Submit>
    </form>
  );
}

/** Add a birthday, or edit one when `initial` is given. */
export function BirthdayForm({ initial }: { initial?: Birthday }) {
  const edit = !!initial;
  const { state, formAction, pending, formRef } = useSafeForm(saveBirthday, { withId: !edit, resetOnSuccess: !edit });
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {edit && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="mode" value="edit" />
        </>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Name</span>
        <input name="name" required maxLength={100} defaultValue={initial?.name} className={input} />
      </label>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Month</span>
          <select name="month" required className={input} defaultValue={initial?.month ?? ""}>
            <option value="" disabled>
              Month
            </option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Day</span>
          <input name="day" type="number" inputMode="numeric" min={1} max={31} required defaultValue={initial?.day} className={input} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Year (opt.)</span>
          <input name="year" type="number" inputMode="numeric" min={1900} max={2100} defaultValue={initial?.year ?? undefined} className={input} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inMemory" defaultChecked={initial?.inMemory} className="h-5 w-5 accent-[var(--color-accent)]" />
        In memory 🕯️ (remembered, not celebrated)
      </label>
      <Message state={state} />
      <Submit pending={pending}>{edit ? "Save changes" : "Add birthday"}</Submit>
    </form>
  );
}

/** Full-width delete that needs a second tap. The action goes back to the list when it's done. */
export function DeleteButton({ action, id, label }: { action: (id: string) => Promise<ActionState>; id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
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
        className={`h-12 rounded-2xl border text-sm font-semibold disabled:opacity-60 ${confirming ? "border-danger bg-danger-soft text-danger" : "border-line text-muted"}`}
      >
        {pending ? "Deleting…" : confirming ? "Tap again to delete" : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Shrink a photo on the phone before upload: smaller file, fewer AI tokens, still readable. */
async function shrinkPhoto(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("shrink failed"))), "image/jpeg", 0.85));
}

/** Paste a whole timetable: one class per line, or read it from a photo first. */
export function PasteClassesForm({ semesterId }: { semesterId: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<(ActionState & { errors?: { line: number; text: string }[] }) | null>(null);
  const [pending, startTransition] = useTransition();
  const [reading, startReading] = useTransition();

  const readPhoto = (file: File) =>
    startReading(async () => {
      setResult({ ok: true, message: "Reading your timetable… (about 10 seconds)" });
      try {
        const fd = new FormData();
        fd.set("photo", new File([await shrinkPhoto(file)], "timetable.jpg", { type: "image/jpeg" }));
        const res = (await safeCall(() => readTimetableFromPhoto(fd), "Couldn't reach the app. Try again.")) as ActionState & { text?: string };
        if (res.ok && res.text) setText(res.text);
        setResult(res);
      } catch {
        setResult({ ok: false, message: "Couldn't open that image. Try a screenshot instead." });
      }
    });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          type Result = ActionState & { errors?: { line: number; text: string }[] };
          const res = (await safeCall(() => addPastedClasses(semesterId, text), "Couldn't reach the app. Try again.")) as Result;
          setResult(res);
          if (res.ok && !res.errors?.length) setText(""); // keep the text if some lines need fixing
        });
      }}
    >
      <label className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-accent text-sm font-semibold text-accent ${reading ? "opacity-60" : ""}`}>
        📷 {reading ? "Reading…" : "Read from a photo or screenshot"}
        <input
          type="file"
          accept="image/*"
          disabled={reading}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readPhoto(f);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-muted">
        The photo is sent to Google Gemini to read it (5 a day). Then check the lines below and fix anything it misread.
      </p>
      <p className="text-xs text-muted">
        Or type one class per line: day, time, name, then optional room and weeks after a “|”. Days in English, 中文 or Indonesian.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        required
        placeholder={"Mon 08:50-10:25 Databases | B101 | 1-17\nWed 14:00-15:35 Physics | B204 | 2-17\n周五 19:50-21:35 概率论 | B310"}
        className="rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
      />
      {result?.message && <p className={`text-sm ${result.ok ? "text-accent" : "text-danger"}`}>{result.message}</p>}
      {result?.errors && result.errors.length > 0 && (
        <ul className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
          {result.errors.map((e) => (
            <li key={e.line}>
              Line {e.line} not understood: {e.text}
            </li>
          ))}
        </ul>
      )}
      <Submit pending={pending}>Add all classes</Submit>
    </form>
  );
}
