"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidISODate } from "@/lib/dates";
import { parseWeeks } from "@/lib/timetable";
import { parseTimetablePaste } from "@/lib/timetable-paste";
import { readTimetablePhoto } from "@/lib/ai/gemini";
import { DEMO_BLOCKED, isDemoMode } from "@/lib/demo";
import { toPasteLines } from "@/lib/ai/timetable-photo";
import type { ActionState } from "../actions";

const time = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 14:30."), z.literal("")]);

const EventSchema = z.object({
  id: z.uuid(),
  mode: z.enum(["create", "edit"]),
  title: z.string().trim().min(1, "Give the event a title.").max(200),
  date: z.string().refine(isValidISODate, "Pick a date."),
  endDate: z.union([z.string().refine(isValidISODate, "Pick a valid end date."), z.literal("")]),
  allDay: z.enum(["on", ""]),
  startTime: time,
  endTime: time,
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  kind: z.enum(["event", "deadline"]),
  noticeId: z.union([z.uuid(), z.literal("")]),
  leadDays: z.union([z.coerce.number().int().min(1, "Remind at least 1 day before.").max(90, "90 days ahead at most."), z.literal("")]),
});

export async function saveEvent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = EventSchema.safeParse(
    Object.fromEntries(["id", "mode", "title", "date", "endDate", "allDay", "startTime", "endTime", "location", "notes", "kind", "leadDays", "noticeId"].map((k) => [k, fd.get(k) ?? ""])),
  );
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  const allDay = f.allDay === "on";
  const deadline = f.kind === "deadline";
  if (deadline && f.leadDays === "") return { ok: false, message: "Choose when to start reminding you." };
  if (f.endDate && f.endDate < f.date) return { ok: false, message: "The end date is before the start date." };
  if (!allDay && !deadline && !f.startTime) return { ok: false, message: "Add a start time, or tick All day." };
  const singleDay = !f.endDate || f.endDate === f.date;
  if (!allDay && f.endTime && singleDay && f.endTime <= f.startTime) return { ok: false, message: "The end time is before the start time." };

  const values: Record<string, string | number | null> = {
    title: f.title,
    date: f.date,
    end_date: f.endDate && f.endDate !== f.date ? f.endDate : null,
    start_time: allDay ? null : f.startTime,
    end_time: allDay || !f.endTime ? null : f.endTime,
    location: f.location || null,
    notes: f.notes || null,
    kind: f.kind,
    lead_days: deadline ? Number(f.leadDays) : null,
  };
  if (deadline) {
    values.end_date = null; // a deadline is a single due date, optionally with a due time
    values.end_time = null;
    values.start_time = allDay ? null : f.startTime || null;
  }
  try {
    const { supabase } = await requireUser();
    const { error } =
      f.mode === "edit"
        ? await supabase.from("calendar_events").update(values).eq("id", f.id)
        : await supabase.from("calendar_events").insert({ id: f.id, ...values });
    if (error && error.code !== "23505") throw error;
    if (f.mode === "create" && f.noticeId) {
      // Made from a notice: remember the link and the day the notice is about.
      await supabase.from("notices").update({ linked_event_id: f.id, related_date: f.date }).eq("id", f.noticeId);
    }
    refresh();
  } catch (error) {
    console.error("saveEvent failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
  redirect(`/calendar?month=${f.date.slice(0, 7)}&day=${f.date}`);
}

export async function deleteEvent(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid event." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteEvent failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

export async function setDeadlineDone(id: string, done: boolean): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid deadline." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("calendar_events")
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("kind", "deadline");
    if (error) throw error;
    refresh();
    return { ok: true, message: done ? "Done 🎉" : "Marked not done." };
  } catch (error) {
    console.error("setDeadlineDone failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

const SemesterSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name the semester.").max(100),
  startDate: z.string().refine(isValidISODate, "Pick the first day of week 1."),
  weeks: z.coerce.number().int().min(1, "At least 1 week.").max(30, "30 weeks at most."),
});

export async function saveSemester(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = SemesterSchema.safeParse({ id: fd.get("id"), name: fd.get("name"), startDate: fd.get("startDate"), weeks: fd.get("weeks") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  if (new Date(`${f.startDate}T00:00:00Z`).getUTCDay() !== 1) return { ok: false, message: "Week 1 should start on a Monday." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("semesters").insert({ id: f.id, name: f.name, start_date: f.startDate, weeks: f.weeks });
    if (error && error.code !== "23505") throw error;
    refresh();
    return { ok: true, message: "Semester added." };
  } catch (error) {
    console.error("saveSemester failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
}

const ClassSchema = z.object({
  id: z.uuid(),
  mode: z.enum(["create", "edit"]),
  semesterId: z.uuid("Add a semester first."),
  title: z.string().trim().min(1, "Give the class a name.").max(200),
  titleZh: z.string().trim().max(200),
  teacher: z.string().trim().max(100),
  room: z.string().trim().max(50),
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Add a start time."),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Add an end time."),
  weeks: z.string().trim(),
});

export async function saveClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = ClassSchema.safeParse(
    Object.fromEntries(["id", "mode", "semesterId", "title", "titleZh", "teacher", "room", "weekday", "startTime", "endTime", "weeks"].map((k) => [k, fd.get(k) ?? (k === "mode" ? "create" : "")])),
  );
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  if (f.endTime <= f.startTime) return { ok: false, message: "The class ends before it starts." };
  const weeks = parseWeeks(f.weeks);
  if (!weeks) return { ok: false, message: "Write the weeks like 1-17 or 1-7, 9-17." };
  const values = {
    semester_id: f.semesterId,
    title: f.title,
    title_zh: f.titleZh || null,
    teacher: f.teacher || null,
    room: f.room || null,
    weekday: f.weekday,
    start_time: f.startTime,
    end_time: f.endTime,
    weeks,
  };
  try {
    const { supabase } = await requireUser();
    const { error } =
      f.mode === "edit" ? await supabase.from("classes").update(values).eq("id", f.id) : await supabase.from("classes").insert({ id: f.id, ...values });
    if (error && error.code !== "23505") throw error;
    refresh();
  } catch (error) {
    console.error("saveClass failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
  if (f.mode === "edit") redirect("/calendar/timetable");
  return { ok: true, message: "Class added." };
}

export async function deleteClass(id: string): Promise<ActionState> {
  const res = await deleteRow("classes", id);
  if (res.ok) redirect("/calendar/timetable");
  return res;
}

// ---------------------------------------------------------------------------
// Birthdays
// ---------------------------------------------------------------------------

const BirthdaySchema = z.object({
  id: z.uuid(),
  mode: z.enum(["create", "edit"]),
  name: z.string().trim().min(1, "Add a name.").max(100),
  month: z.coerce.number().int().min(1, "Pick a month.").max(12),
  day: z.coerce.number().int().min(1, "Pick a day.").max(31),
  year: z.union([z.coerce.number().int().min(1900).max(2100), z.literal("")]),
  inMemory: z.enum(["on", ""]),
});

export async function saveBirthday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = BirthdaySchema.safeParse(
    Object.fromEntries(["id", "mode", "name", "month", "day", "year", "inMemory"].map((k) => [k, fd.get(k) ?? (k === "mode" ? "create" : "")])),
  );
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  const check = new Date(Date.UTC(2000, f.month - 1, f.day)); // 2000 is a leap year, so 29 Feb is allowed
  if (check.getUTCMonth() !== f.month - 1) return { ok: false, message: "That month doesn't have that many days." };
  const values = { name: f.name, month: f.month, day: f.day, year: f.year === "" ? null : f.year, in_memory: f.inMemory === "on" };
  try {
    const { supabase } = await requireUser();
    const { error } =
      f.mode === "edit" ? await supabase.from("birthdays").update(values).eq("id", f.id) : await supabase.from("birthdays").insert({ id: f.id, ...values });
    if (error?.code === "23505") return { ok: f.mode === "create", message: `${f.name} on that date is already on the list.` };
    if (error) throw error;
    refresh();
  } catch (error) {
    console.error("saveBirthday failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
  if (f.mode === "edit") redirect("/calendar/birthdays");
  return { ok: true, message: `Added ${f.name}.` };
}

export async function deleteBirthday(id: string): Promise<ActionState> {
  const res = await deleteRow("birthdays", id);
  if (res.ok) redirect("/calendar/birthdays");
  return res;
}

async function deleteRow(table: "classes" | "birthdays", id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid item." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error(`delete from ${table} failed`, error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

/** Add many classes at once from pasted text (one per line). Lines it can't read are listed back. */
export async function addPastedClasses(semesterId: string, text: string): Promise<ActionState & { errors?: { line: number; text: string }[] }> {
  if (!z.uuid().safeParse(semesterId).success) return { ok: false, message: "Add a semester first." };
  const { classes, errors } = parseTimetablePaste(text.slice(0, 20000));
  if (classes.length === 0) return { ok: false, message: "Couldn't read any classes. Use one line per class, like: Mon 08:50-10:25 Databases | B101 | 1-17", errors };
  try {
    const { supabase } = await requireUser();
    const { data: semester, error: semError } = await supabase.from("semesters").select("weeks").eq("id", semesterId).maybeSingle();
    if (semError) throw semError;
    if (!semester) return { ok: false, message: "That semester no longer exists. Reload the page." };
    const everyWeek = Array.from({ length: semester.weeks }, (_, i) => i + 1);
    const { error } = await supabase.from("classes").insert(
      classes.map((c) => ({
        semester_id: semesterId,
        title: c.title,
        room: c.room,
        weekday: c.weekday,
        start_time: c.startTime,
        end_time: c.endTime,
        weeks: (c.weeks ?? everyWeek).filter((w) => w <= 30),
      })),
    );
    if (error) throw error;
    refresh();
    return { ok: true, message: `Added ${classes.length} class${classes.length === 1 ? "" : "es"}.${errors.length ? ` ${errors.length} line${errors.length === 1 ? "" : "s"} skipped.` : ""}`, errors };
  } catch (error) {
    console.error("addPastedClasses failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
}

const PHOTOS_PER_DAY = 5;

/** Read a timetable photo with AI into the paste format, for the person to check before adding. */
export async function readTimetableFromPhoto(fd: FormData): Promise<ActionState & { text?: string }> {
  const file = fd.get("photo");
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, message: "Choose a photo or screenshot of your timetable." };
  if (file.size > 4_000_000) return { ok: false, message: "That photo is too big. Try a screenshot instead." };
  try {
    const { supabase } = await requireUser();
    if (isDemoMode()) return { ok: false, message: DEMO_BLOCKED };
    const { data: allowed, error } = await supabase.rpc("take_ai_quota", { p_kind: "timetable_photo", p_limit: PHOTOS_PER_DAY });
    if (error) throw error;
    if (!allowed) return { ok: false, message: `You've used today's ${PHOTOS_PER_DAY} photo reads. Paste the classes as text, or try again tomorrow.` };

    const result = await readTimetablePhoto(Buffer.from(await file.arrayBuffer()).toString("base64"), file.type);
    if (!result.ok) {
      const message =
        result.reason === "not_configured"
          ? "Reading photos isn't set up on this server yet."
          : result.reason === "timeout"
            ? "The AI took too long. Try a clearer or smaller screenshot."
            : "Couldn't read the photo. Try again, or paste the classes as text.";
      return { ok: false, message };
    }
    const text = toPasteLines(result.classes);
    if (!text) return { ok: false, message: "No classes found in that photo. Try a clearer screenshot." };
    return { ok: true, message: `Found ${text.split("\n").length} classes. Check them, then add.`, text };
  } catch (error) {
    console.error("readTimetableFromPhoto failed", error);
    return { ok: false, message: "Couldn't reach the server. Try again." };
  }
}
