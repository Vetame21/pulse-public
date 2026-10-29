// Timetable: weekly classes in a semester's teaching weeks, minus official days off.

import { type ISODate, diffDays, parseISODate } from "./dates";
import { type HolidayYear, holidayFor } from "./china-calendar";

export type Semester = { id: string; name: string; startDate: ISODate; weeks: number };
export type ClassRow = {
  id: string;
  semesterId: string;
  title: string;
  titleZh: string | null;
  teacher: string | null;
  room: string | null;
  weekday: number; // 1 = Monday … 7 = Sunday
  startTime: string; // "HH:MM"
  endTime: string;
  weeks: number[];
};
export type ClassOnDay = ClassRow & { date: ISODate; week: number };

/** "1-7, 9-17" → [1..7, 9..17]. Returns null if the text isn't a valid list of weeks (1–30). */
export function parseWeeks(text: string): number[] | null {
  const weeks = new Set<number>();
  const parts = text.split(/[,，\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const m = part.match(/^(\d{1,2})(?:[-–~](\d{1,2}))?$/);
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2] ?? m[1]);
    if (from < 1 || to > 30 || to < from) return null;
    for (let w = from; w <= to; w++) weeks.add(w);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** [1..7, 9..17] → "1–7, 9–17" */
export function formatWeeks(weeks: number[]): string {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    ranges.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j;
  }
  return ranges.join(", ");
}

/** Teaching week number of a date (week 1 starts on the semester's start date), or null outside the semester. */
export function weekOf(semester: Semester, date: ISODate): number | null {
  const d = diffDays(semester.startDate, date);
  if (d < 0) return null;
  const week = Math.floor(d / 7) + 1;
  return week <= semester.weeks ? week : null;
}

const weekdayOf = (date: ISODate) => {
  const { year, month, day } = parseISODate(date);
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1; // Monday = 1
};

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const MERGE_GAP_MIN = 20;

/**
 * One class split by a short break (Statistics 14:00–15:35 + 15:45–16:30) becomes one
 * entry (14:00–16:30): same title and room, at most 20 minutes apart.
 */
export function mergeBackToBack(sorted: ClassOnDay[]): ClassOnDay[] {
  const out: ClassOnDay[] = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.title === c.title && prev.room === c.room && toMin(c.startTime) - toMin(prev.endTime) <= MERGE_GAP_MIN && c.startTime >= prev.endTime) {
      out[out.length - 1] = { ...prev, endTime: c.endTime > prev.endTime ? c.endTime : prev.endTime };
    } else out.push(c);
  }
  return out;
}

/** Classes on a date, by start time, with back-to-back sessions merged. Official days off cancel classes. */
export function classesOn(date: ISODate, semesters: Semester[], classes: ClassRow[], holidays: HolidayYear[]): ClassOnDay[] {
  if (holidayFor(date, holidays)?.off) return [];
  const weekday = weekdayOf(date);
  const result: ClassOnDay[] = [];
  for (const s of semesters) {
    const week = weekOf(s, date);
    if (week === null) continue;
    for (const c of classes) {
      if (c.semesterId === s.id && c.weekday === weekday && c.weeks.includes(week)) result.push({ ...c, date, week });
    }
  }
  return mergeBackToBack(result.sort((a, b) => a.startTime.localeCompare(b.startTime)));
}

/** How a class stands in a given teaching week, for the timetable list. */
export function classStatus(weeks: number[], week: number | null): { running: boolean; label: string | null } {
  if (week === null) return { running: true, label: null };
  const first = Math.min(...weeks);
  const last = Math.max(...weeks);
  if (week > last) return { running: false, label: `Finished (week ${last})` };
  if (week < first) return { running: false, label: `Starts week ${first}` };
  if (!weeks.includes(week)) return { running: false, label: "No class this week" };
  return { running: true, label: null };
}

/** The semester running on a date, with its week number. */
export function currentWeek(semesters: Semester[], date: ISODate): { semester: Semester; week: number } | null {
  for (const s of semesters) {
    const week = weekOf(s, date);
    if (week !== null) return { semester: s, week };
  }
  return null;
}

