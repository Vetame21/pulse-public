// Spot dates (and a time) in a pasted message, in Chinese or English, so a
// notice can offer "Add as deadline · Fri 24 Oct". Heuristic on purpose: it
// only suggests; nothing is added without a tap.

import { type ISODate, addDays, isValidISODate, parseISODate } from "./dates";

export type FoundDate = { date: ISODate; text: string };
export type NoticeSuggestion = { dates: FoundDate[]; time: string | null; kind: "deadline" | "event"; title: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const weekday = (date: ISODate) => {
  const { year, month, day } = parseISODate(date);
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1; // Monday = 1
};

const CN_DAYS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const EN_DAYS: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
const EN_MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** A month/day without a year: this year, unless that was over a month ago (then next year). */
function withYear(month: number, day: number, today: ISODate): ISODate | null {
  const { year } = parseISODate(today);
  for (const y of [year, year + 1]) {
    const d = iso(y, month, day);
    if (isValidISODate(d) && d >= addDays(today, -30)) return d;
  }
  return null;
}

/** A weekday: plain = next one (today counts), 本/这 = this week, 下 / next = next week. */
function fromWeekday(target: number, which: "plain" | "this" | "next", today: ISODate): ISODate {
  const monday = addDays(today, 1 - weekday(today));
  if (which === "this") return addDays(monday, target - 1);
  if (which === "next") return addDays(monday, 7 + target - 1);
  const diff = (target - weekday(today) + 7) % 7;
  return addDays(today, diff);
}

export function findDates(text: string, today: ISODate): FoundDate[] {
  const found: (FoundDate & { at: number })[] = [];
  const add = (date: ISODate | null, match: RegExpExecArray) => {
    if (date && isValidISODate(date)) found.push({ date, text: match[0].trim(), at: match.index });
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    for (const m of text.matchAll(re)) fn(m as RegExpExecArray);
  };
  const covered = (m: RegExpExecArray) => found.some((f) => m.index >= f.at && m.index < f.at + f.text.length + 2);
  // A weekday written right next to a date ("10月25日（周日）", "Fri, 25 Oct") labels that date.
  const nextToDate = (m: RegExpExecArray) =>
    found.some((f) => {
      const end = m.index + m[0].length;
      return (m.index >= f.at + f.text.length && m.index - (f.at + f.text.length) <= 2) || (f.at >= end && f.at - end <= 2);
    });

  // 2026-10-25 · 2026/10/25 · 2026年10月25日
  each(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?/g, (m) => add(iso(+m[1], +m[2], +m[3]), m));
  // 10月25日 · 10月25号
  each(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g, (m) => !covered(m) && add(withYear(+m[1], +m[2], today), m));
  // 25号 (this month, or next month if it has passed)
  each(/(?<![\d月])(\d{1,2})\s*号/g, (m) => {
    if (covered(m)) return;
    const { year, month } = parseISODate(today);
    const d = +m[1];
    const thisMonth = iso(year, month, d);
    add(thisMonth >= today ? thisMonth : month === 12 ? iso(year + 1, 1, d) : iso(year, month + 1, d), m);
  });
  // 周五 · 星期五 · 礼拜五 · 本周五 · 下周三
  each(/(本|这|下)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/g, (m) => {
    if (!nextToDate(m)) add(fromWeekday(CN_DAYS[m[2]], m[1] === "下" ? "next" : m[1] ? "this" : "plain", today), m);
  });
  // 今天 · 今晚 · 明天 · 明晚 · 后天
  each(/今天|今晚|明天|明晚|后天/g, (m) => add(addDays(today, m[0].startsWith("今") ? 0 : m[0].startsWith("明") ? 1 : 2), m));

  // 25 Oct · 25th October
  each(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\b/gi, (m) =>
    add(withYear(EN_MONTHS[m[2].toLowerCase()], +m[1], today), m),
  );
  // Oct 25 · October 25th
  each(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi, (m) =>
    !covered(m) && add(withYear(EN_MONTHS[m[1].toLowerCase()], +m[2], today), m),
  );
  // Friday · next Friday · this Fri
  each(/\b(this|next)?\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi, (m) => {
    const word = m[0].trim().toLowerCase();
    if (!/^(this |next )?(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)$/.test(word.replace(/\s+/, " "))) return;
    if (nextToDate(m)) return;
    add(fromWeekday(EN_DAYS[m[2].toLowerCase()], m[1]?.toLowerCase() === "next" ? "next" : m[1] ? "this" : "plain", today), m);
  });
  // today · tonight · tomorrow
  each(/\b(today|tonight|tomorrow)\b/gi, (m) => add(addDays(today, m[1].toLowerCase() === "tomorrow" ? 1 : 0), m));

  // Unique dates, in the order they appear.
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .filter((f) => (seen.has(f.date) ? false : (seen.add(f.date), true)))
    .map(({ date, text }) => ({ date, text }));
}

/** A clock time if the message has exactly one: "18:00", "晚上8点", "下午3点半", "8pm". */
export function findTime(text: string): string | null {
  const times = new Set<string>();
  for (const m of text.matchAll(/\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/g)) times.add(`${pad(+m[1])}:${m[2]}`);
  for (const m of text.matchAll(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分?)?/g)) {
    let h = +m[2];
    if ((m[1] === "下午" || m[1] === "晚上") && h < 12) h += 12;
    if (h > 23) continue;
    times.add(`${pad(h)}:${m[3] === "半" ? "30" : pad(m[4] ? +m[4] : 0)}`);
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)) {
    let h = +m[1] % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    times.add(`${pad(h)}:${m[2] ?? "00"}`);
  }
  return times.size === 1 ? [...times][0] : null;
}

const DEADLINE_WORDS = /截止|截至|提交|上交|交作业|作业|报告|ddl|deadline|due|submit|hand in|turn in|homework|assignment/i;

/** What to offer under a notice: up to 3 dates, a time, deadline or event, and a short title. */
export function suggestFromNotice(body: string, today: ISODate): NoticeSuggestion {
  const firstLine = body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return {
    dates: findDates(body, today).slice(0, 3),
    time: findTime(body),
    kind: DEADLINE_WORDS.test(body) ? "deadline" : "event",
    title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine,
  };
}
