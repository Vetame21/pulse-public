import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Birthday } from "@/lib/briefing";
import type { CalendarEvent } from "@/lib/china-calendar";
import type { ClassRow, Semester } from "@/lib/timetable";

type Row = {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  kind: "event" | "deadline";
  lead_days: number | null;
  done_at: string | null;
};

const SELECT = "id, title, date, end_date, start_time, end_time, location, notes, kind, lead_days, done_at";
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null); // Postgres "14:00:00" → "14:00"

function toEvent(r: Row): CalendarEvent {
  return { id: r.id, title: r.title, date: r.date, endDate: r.end_date, startTime: hhmm(r.start_time), endTime: hhmm(r.end_time), location: r.location, notes: r.notes, kind: r.kind, leadDays: r.lead_days, done: r.done_at !== null };
}

/** Events that touch the range [from, to] (multi-day events included). */
export async function listEvents(supabase: SupabaseClient, from: string, to: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select(SELECT)
    .lte("date", to)
    .or(`end_date.gte.${from},and(end_date.is.null,date.gte.${from})`)
    .order("date")
    .order("start_time", { nullsFirst: true })
    .limit(1000);
  if (error) throw new Error(`Couldn't load your calendar: ${error.message}`);
  return (data as Row[]).map(toEvent);
}

export async function getEvent(supabase: SupabaseClient, id: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase.from("calendar_events").select(SELECT).eq("id", id).maybeSingle<Row>();
  if (error) throw new Error(`Couldn't load the event: ${error.message}`);
  return data ? toEvent(data) : null;
}

/** Deadlines not yet done, due up to 90 days ahead (overdue ones included). */
export async function listOpenDeadlines(supabase: SupabaseClient, until: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select(SELECT)
    .eq("kind", "deadline")
    .is("done_at", null)
    .lte("date", until)
    .order("date")
    .limit(200);
  if (error) throw new Error(`Couldn't load your deadlines: ${error.message}`);
  return (data as Row[]).map(toEvent);
}

export async function listSemesters(supabase: SupabaseClient): Promise<Semester[]> {
  const { data, error } = await supabase.from("semesters").select("id, name, start_date, weeks").order("start_date", { ascending: false });
  if (error) throw new Error(`Couldn't load your semesters: ${error.message}`);
  return data.map((r) => ({ id: r.id, name: r.name, startDate: r.start_date, weeks: r.weeks }));
}

export async function listClasses(supabase: SupabaseClient, id?: string): Promise<ClassRow[]> {
  let query = supabase.from("classes").select("id, semester_id, title, title_zh, teacher, room, weekday, start_time, end_time, weeks");
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("weekday").order("start_time");
  if (error) throw new Error(`Couldn't load your timetable: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    semesterId: r.semester_id,
    title: r.title,
    titleZh: r.title_zh,
    teacher: r.teacher,
    room: r.room,
    weekday: r.weekday,
    startTime: hhmm(r.start_time)!,
    endTime: hhmm(r.end_time)!,
    weeks: r.weeks,
  }));
}

export async function getClass(supabase: SupabaseClient, id: string): Promise<ClassRow | null> {
  return (await listClasses(supabase, id))[0] ?? null;
}

export async function getBirthday(supabase: SupabaseClient, id: string): Promise<Birthday | null> {
  return (await listBirthdays(supabase, id))[0] ?? null;
}

export async function listBirthdays(supabase: SupabaseClient, id?: string): Promise<Birthday[]> {
  let query = supabase.from("birthdays").select("id, name, month, day, year, in_memory");
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("month").order("day");
  if (error) throw new Error(`Couldn't load birthdays: ${error.message}`);
  return data.map((r) => ({ id: r.id, name: r.name, month: r.month, day: r.day, year: r.year, inMemory: r.in_memory }));
}

export { holidayYears, regionHolidays } from "@/lib/holidays";
