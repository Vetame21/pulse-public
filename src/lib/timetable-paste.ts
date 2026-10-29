// Paste a whole timetable as text, one class per line:
//   Mon 08:50-10:25 Databases | B101 | 1-17
//   周三 14:00-15:35 线性代数 | B204 | 2-17
// Day and times first, then the class name; room and weeks after "|" are optional
// (weeks default to every week of the semester).

import { parseWeeks } from "./timetable";

export type PastedClass = { weekday: number; startTime: string; endTime: string; title: string; room: string | null; weeks: number[] | null };
export type PasteResult = { classes: PastedClass[]; errors: { line: number; text: string }[] };

const DAYS: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
  senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6, minggu: 7,
};

const pad = (t: string) => {
  const [h, m] = t.split(/[:：.]/);
  return `${h.padStart(2, "0")}:${m}`;
};

export function parseTimetablePaste(text: string): PasteResult {
  const result: PasteResult = { classes: [], errors: [] };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(?:周|星期|礼拜)?\s*([a-zA-Z]+|[一二三四五六日天])\.?,?\s+(\d{1,2}[:：.]\d{2})\s*[-–~至到]\s*(\d{1,2}[:：.]\d{2})\s+(.+)$/);
    const weekday = m ? DAYS[m[1].toLowerCase()] : undefined;
    if (!m || !weekday) return result.errors.push({ line: i + 1, text: line });
    const startTime = pad(m[2]);
    const endTime = pad(m[3]);
    const [title, room, weeksText] = m[4].split("|").map((p) => p.trim());
    const weeks = weeksText ? parseWeeks(weeksText.replace(/^(?:weeks?|周)\s*/i, "")) : null;
    if (!title || endTime <= startTime || startTime > "23:59" || (weeksText && !weeks)) return result.errors.push({ line: i + 1, text: line });
    result.classes.push({ weekday, startTime, endTime, title: title.slice(0, 200), room: room ? room.slice(0, 50) : null, weeks });
  });
  return result;
}
