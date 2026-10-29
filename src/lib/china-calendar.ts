// Calendar helpers: lunar dates (农历), China's official holidays and 调休
// make-up workdays, and which of your events come next.

import { type ISODate, addDays } from "./dates";

// ---------------------------------------------------------------------------
// Lunar calendar (uses the Chinese calendar built into Intl, no lookup table)
// ---------------------------------------------------------------------------

const lunarFormat = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { timeZone: "UTC", month: "long", day: "numeric" });

const DAY_NAMES = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

// Traditional festivals by lunar "month-day" (除夕 is handled separately).
const FESTIVALS: Record<string, string> = {
  "正月-1": "春节",
  "正月-15": "元宵节",
  "二月-2": "龙抬头",
  "五月-5": "端午节",
  "七月-7": "七夕",
  "七月-15": "中元节",
  "八月-15": "中秋节",
  "九月-9": "重阳节",
  "腊月-8": "腊八节",
  "腊月-23": "小年",
};

export type LunarInfo = {
  monthName: string; // 九月, 闰六月…
  day: number;
  dayName: string; // 初八
  label: string; // what to show in a calendar cell: month name on the 1st, otherwise the day name
  festival?: string;
};

function rawLunar(date: ISODate) {
  const parts = lunarFormat.formatToParts(new Date(`${date}T00:00:00Z`));
  return {
    monthName: parts.find((p) => p.type === "month")?.value ?? "",
    day: Number(parts.find((p) => p.type === "day")?.value ?? 0),
  };
}

export function lunarInfo(date: ISODate): LunarInfo {
  const { monthName, day } = rawLunar(date);
  const tomorrow = rawLunar(addDays(date, 1));
  const festival =
    tomorrow.monthName === "正月" && tomorrow.day === 1 ? "除夕" : monthName.startsWith("闰") ? undefined : FESTIVALS[`${monthName}-${day}`];
  return { monthName, day, dayName: DAY_NAMES[day - 1] ?? String(day), label: day === 1 ? monthName : DAY_NAMES[day - 1] ?? String(day), festival };
}

// ---------------------------------------------------------------------------
// Official holidays (State Council schedule, via holiday-cn)
// ---------------------------------------------------------------------------

export type HolidayYear = { year: number; days: { name: string; date: string; isOffDay: boolean }[] };
export type Holiday = { name: string; off: boolean }; // off=false means a 调休 make-up workday

export function holidayFor(date: ISODate, years: HolidayYear[]): Holiday | null {
  for (const y of years) {
    const d = y.days.find((x) => x.date === date);
    if (d) return { name: d.name, off: d.isOffDay };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Your events
// ---------------------------------------------------------------------------

export type CalendarEvent = {
  id: string;
  title: string;
  date: ISODate; // first day
  endDate: ISODate | null; // last day for multi-day events
  startTime: string | null; // "HH:MM", null = all day
  endTime: string | null;
  location: string | null;
  notes: string | null;
  kind: "event" | "deadline";
  leadDays: number | null; // deadlines: start reminding this many days before
  done: boolean;
};

const covers = (e: CalendarEvent, date: ISODate) => e.date <= date && (e.endDate ?? e.date) >= date;
const byTime = (a: CalendarEvent, b: CalendarEvent) => (a.startTime ?? "").localeCompare(b.startTime ?? "");

/** Events on a day: all-day ones first, then by start time. */
export function eventsOnDay(events: CalendarEvent[], date: ISODate): CalendarEvent[] {
  return events.filter((e) => covers(e, date)).sort(byTime);
}

/** What's next: today's events that haven't ended yet, then the next 7 days, in order. */
export function upNext(events: CalendarEvent[], today: ISODate, nowTime: string, limit: number): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (let d = today; d <= addDays(today, 7) && result.length < limit; d = addDays(d, 1)) {
    for (const e of eventsOnDay(events, d)) {
      if (seen.has(e.id)) continue;
      if (d === today && e.startTime && (e.endTime ?? e.startTime) <= nowTime && (e.endDate ?? e.date) === today) continue;
      seen.add(e.id);
      result.push(e);
      if (result.length >= limit) break;
    }
  }
  return result;
}
