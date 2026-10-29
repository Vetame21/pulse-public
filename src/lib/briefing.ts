// Morning briefing: deadlines to work on and birthdays coming up.

import { type ISODate, addDays, diffDays, parseISODate } from "./dates";

export const LEAD_DAYS = { big: 14, normal: 7 } as const;

export type Deadline = { id: string; title: string; date: ISODate; startTime: string | null; leadDays: number | null; done: boolean };

/** Deadlines to be working on today: from leadDays before the due date until it's done (overdue ones stay). */
export function activeDeadlines(deadlines: Deadline[], today: ISODate) {
  return deadlines
    .filter((d) => !d.done && addDays(d.date, -(d.leadDays ?? LEAD_DAYS.normal)) <= today)
    .map((d) => ({ ...d, daysLeft: diffDays(today, d.date) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export type Birthday = { id: string; name: string; month: number; day: number; year: number | null; inMemory: boolean };

/** Next date of a yearly birthday on or after today (29 Feb falls on 28 Feb in other years). */
export function nextOccurrence(b: { month: number; day: number }, today: ISODate): ISODate {
  const { year } = parseISODate(today);
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = b.month === 2 && b.day === 29 && !leap ? 28 : b.day;
    return `${y}-${String(b.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  return on(year) >= today ? on(year) : on(year + 1);
}

/** Birthdays in the next `days` days (0 = today only), soonest first, with the age they turn when the year is known. */
export function upcomingBirthdays(list: Birthday[], today: ISODate, days: number) {
  return list
    .map((b) => {
      const date = nextOccurrence(b, today);
      return { ...b, date, inDays: diffDays(today, date), turns: b.year ? parseISODate(date).year - b.year : null };
    })
    .filter((b) => b.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}
