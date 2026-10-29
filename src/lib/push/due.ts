// Which notifications are due right now: the morning briefing, class and event
// reminders, and the evening heads-up for tomorrow's deadlines. Pure, so it can
// be tested and run by the scheduled job.

import { type Birthday, activeDeadlines, upcomingBirthdays } from "../briefing";
import { type CalendarEvent, type HolidayYear, holidayFor } from "../china-calendar";
import { type ISODate, addDays } from "../dates";
import { type ClassRow, type Semester, classesOn } from "../timetable";
import type { PushMessage } from "./webpush";

// The job runs every 10 minutes, so a reminder is scheduled one run early:
// class reminders arrive 15–25 min before, event reminders 30–40 min before.
export const RUN_EVERY_MIN = 10;
export const CLASS_LEAD_MIN = 15;
export const EVENT_LEAD_MIN = 30;
export const DEADLINE_HEADS_UP = "21:00";
const WINDOW_MIN = 30; // a notification can still go out up to 30 min late if a run is missed

export type NotifyPrefs = { briefingTime: string; classes: boolean; events: boolean; deadlines: boolean };
export type DueInput = {
  today: ISODate;
  nowMin: number; // minutes since local midnight
  prefs: NotifyPrefs;
  events: CalendarEvent[]; // today and tomorrow
  deadlines: CalendarEvent[]; // open deadlines
  semesters: Semester[];
  classes: ClassRow[];
  birthdays: Birthday[];
  holidays: HolidayYear[];
  goalsLine?: string | null; // "🎯 Gym 1 / 3 · Save 42% (behind)"
  newsLine?: string | null; // "📰 S&P −1.9% · HSI −0.1% · SSE +2.1%"
};
export type DueNotice = PushMessage & { key: string };

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const shortDay = (d: ISODate) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function dueNotifications(input: DueInput): DueNotice[] {
  const { today, nowMin, prefs } = input;
  const due = (t: number) => t <= nowMin && nowMin < t + WINDOW_MIN;
  const out: DueNotice[] = [];

  if (due(toMin(prefs.briefingTime))) out.push({ key: `briefing:${today}`, ...briefingMessage(input), tag: "briefing" });

  const days = [today, addDays(today, 1)];
  days.forEach((date, i) => {
    const offset = i * 1440; // tomorrow's early classes can be due late tonight
    if (prefs.classes) {
      for (const c of classesOn(date, input.semesters, input.classes, input.holidays)) {
        const start = offset + toMin(c.startTime);
        if (!due(start - CLASS_LEAD_MIN - RUN_EVERY_MIN)) continue;
        out.push({
          key: `class:${c.id}:${date}`,
          title: `🎓 ${c.title} in ${start - nowMin} min`,
          body: [`${c.startTime}–${c.endTime}`, c.room && `📍 ${c.room}`].filter(Boolean).join(" · "),
          url: "/calendar",
        });
      }
    }
    if (prefs.events) {
      for (const e of input.events) {
        if (e.kind !== "event" || !e.startTime || e.date !== date) continue;
        const start = offset + toMin(e.startTime);
        if (!due(start - EVENT_LEAD_MIN - RUN_EVERY_MIN)) continue;
        out.push({
          key: `event:${e.id}:${date}`,
          title: `📅 ${e.title} in ${start - nowMin} min`,
          body: [e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime, e.location && `📍 ${e.location}`].filter(Boolean).join(" · "),
          url: `/calendar/${e.id}`,
        });
      }
    }
  });

  if (prefs.deadlines && due(toMin(DEADLINE_HEADS_UP))) {
    for (const d of input.deadlines) {
      if (d.done || d.date !== addDays(today, 1)) continue;
      out.push({
        key: `deadline:${d.id}:${d.date}`,
        title: `📌 Due tomorrow: ${d.title}`,
        body: d.startTime ? `Due at ${d.startTime}. Mark it done in Pulse when it's in.` : "Mark it done in Pulse when it's in.",
        url: `/calendar/${d.id}`,
      });
    }
  }
  return out;
}

/** The morning briefing as one notification: holiday, classes, deadlines, events, birthdays. */
export function briefingMessage(input: DueInput): PushMessage {
  const { today } = input;
  const lines: string[] = [];

  const holiday = holidayFor(today, input.holidays);
  if (holiday) lines.push(holiday.off ? `🇨🇳 ${holiday.name} holiday` : `💼 Make-up workday for ${holiday.name} (调休)`);

  const classes = classesOn(today, input.semesters, input.classes, input.holidays);
  if (classes.length > 0) {
    const first = classes[0];
    lines.push(`🎓 ${classes.length} class${classes.length > 1 ? "es" : ""} · first ${first.title} ${first.startTime}${first.room ? ` (${first.room})` : ""}`);
  } else if (!holiday?.off) {
    lines.push("🎓 No classes today");
  }

  const todo = activeDeadlines(
    input.deadlines.map((d) => ({ id: d.id, title: d.title, date: d.date, startTime: d.startTime, leadDays: d.leadDays, done: d.done })),
    today,
  );
  if (todo.length > 0) {
    const next = todo[0];
    const when = next.daysLeft < 0 ? "overdue" : next.daysLeft === 0 ? "due today" : next.daysLeft === 1 ? "due tomorrow" : `due ${shortDay(next.date)}`;
    lines.push(`📌 ${todo.length > 1 ? `${todo.length} to work on · ` : ""}${next.title} ${when}`);
  }

  const events = input.events.filter((e) => e.kind === "event" && e.date <= today && (e.endDate ?? e.date) >= today);
  if (events.length > 0) {
    const e = events.find((x) => x.startTime) ?? events[0];
    lines.push(`📅 ${e.title}${e.startTime ? ` ${e.startTime}` : ""}${events.length > 1 ? ` +${events.length - 1} more` : ""}`);
  }

  for (const b of upcomingBirthdays(input.birthdays, today, 1)) {
    const when = b.inDays === 0 ? "today" : "tomorrow";
    lines.push(b.inMemory ? `🕯️ Remembering ${b.name} ${when}` : `🎂 ${b.name}'s birthday ${when}${b.turns !== null ? ` (${b.turns})` : ""}`);
  }

  if (input.goalsLine) lines.push(input.goalsLine);
  if (input.newsLine) lines.push(input.newsLine);

  return { title: `Good morning ☀️ · ${shortDay(today)}`, body: lines.join("\n") || "Nothing planned today.", url: "/" };
}
