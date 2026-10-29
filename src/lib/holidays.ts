// China's official holiday schedule. Plain module (no Next.js imports) so the
// scheduled notification job can use it too.

import type { HolidayYear } from "./china-calendar";
import holidays2026 from "../data/holidays/2026.json";

const BUNDLED: HolidayYear[] = [holidays2026 as HolidayYear];

function isHolidayYear(x: unknown): x is HolidayYear {
  const y = x as HolidayYear;
  return !!y && typeof y.year === "number" && Array.isArray(y.days) && y.days.every((d) => typeof d.date === "string" && typeof d.name === "string" && typeof d.isOffDay === "boolean");
}

/**
 * China's official holiday schedule for the given years. Published years are
 * bundled; newer ones (the State Council announces next year around November)
 * are fetched from the holiday-cn dataset and cached for a day. Never throws:
 * a missing year just shows no holidays.
 */
export async function holidayYears(years: number[]): Promise<HolidayYear[]> {
  const result: HolidayYear[] = [];
  for (const year of [...new Set(years)]) {
    const bundled = BUNDLED.find((y) => y.year === year);
    if (bundled) {
      result.push(bundled);
      continue;
    }
    try {
      // `next` caches the file for a day inside Next.js; elsewhere (the notification job) it's ignored.
      const init: RequestInit & { next?: { revalidate: number } } = { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) };
      const res = await fetch(`https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`, init);
      const json: unknown = res.ok ? await res.json() : null;
      if (isHolidayYear(json) && json.days.length > 0) result.push(json);
    } catch {
      // offline or not published yet: no holidays for that year
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hong Kong public holidays (official list from the HK government's 1823 service)
// ---------------------------------------------------------------------------

const HK_URL = "https://www.1823.gov.hk/common/ical/en.json";

/** The 1823 JSON (an iCalendar in JSON) → one HolidayYear per year. No make-up workdays in Hong Kong. */
export function parseHkHolidays(json: unknown): HolidayYear[] {
  try {
    const events = (json as { vcalendar: { vevent: { dtstart: [string, unknown]; summary: string }[] }[] }).vcalendar[0].vevent;
    const byYear = new Map<number, HolidayYear>();
    for (const e of events) {
      const d = String(e.dtstart?.[0] ?? "");
      if (!/^\d{8}$/.test(d) || typeof e.summary !== "string") continue;
      const year = Number(d.slice(0, 4));
      if (!byYear.has(year)) byYear.set(year, { year, days: [] });
      byYear.get(year)!.days.push({ name: e.summary, date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, isOffDay: true });
    }
    return [...byYear.values()];
  } catch {
    return [];
  }
}

async function hkHolidayYears(years: number[]): Promise<HolidayYear[]> {
  try {
    const init: RequestInit & { next?: { revalidate: number } } = { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(5000) };
    const res = await fetch(HK_URL, init);
    if (!res.ok) return [];
    const text = (await res.text()).replace(/^﻿/, ""); // the file starts with a byte-order mark
    return parseHkHolidays(JSON.parse(text)).filter((y) => years.includes(y.year));
  } catch {
    return []; // offline: no holidays shown
  }
}

/** Holidays for your region: mainland China (with 调休 make-up days) or Hong Kong. */
export function regionHolidays(region: "mainland" | "hk", years: number[]): Promise<HolidayYear[]> {
  return region === "hk" ? hkHolidayYears(years) : holidayYears(years);
}
