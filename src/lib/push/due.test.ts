import { describe, expect, it } from "vitest";
import holidays2026 from "../../data/holidays/2026.json";
import type { CalendarEvent } from "../china-calendar";
import type { ClassRow } from "../timetable";
import { type DueInput, dueNotifications } from "./due";

const sem = { id: "s", name: "S1", startDate: "2026-08-31", weeks: 18 };
const cls = (id: string, weekday: number, startTime: string, endTime: string, weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]): ClassRow => ({
  id, semesterId: "s", title: id, titleZh: null, teacher: null, room: "B101", weekday, startTime, endTime, weeks,
});
const ev = (id: string, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date, endDate: null, startTime: null, endTime: null, location: null, notes: null, kind: "event", leadDays: null, done: false, ...extra,
});
const base = (over: Partial<DueInput>): DueInput => ({
  today: "2026-10-19", // Monday, week 8
  nowMin: 0,
  prefs: { briefingTime: "07:00", classes: true, events: true, deadlines: true },
  events: [],
  deadlines: [],
  semesters: [sem],
  classes: [cls("Databases", 1, "08:50", "10:25"), cls("Statistics", 1, "14:00", "15:35")],
  birthdays: [],
  holidays: [holidays2026],
  ...over,
});
const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const keys = (input: DueInput) => dueNotifications(input).map((n) => n.key);

describe("morning briefing", () => {
  it("goes out at the chosen time, and up to 30 minutes late, but not before", () => {
    expect(keys(base({ nowMin: at("06:55") }))).toEqual([]);
    expect(keys(base({ nowMin: at("07:00") }))).toEqual(["briefing:2026-10-19"]);
    expect(keys(base({ nowMin: at("07:25") }))).toEqual(["briefing:2026-10-19"]);
    expect(keys(base({ nowMin: at("07:30") }))).toEqual([]);
  });
  it("sums up the day", () => {
    const [n] = dueNotifications(
      base({
        nowMin: at("07:00"),
        deadlines: [ev("Stats HW", "2026-10-23", { kind: "deadline", leadDays: 7 })],
        events: [ev("Dinner", "2026-10-19", { startTime: "19:00" })],
        birthdays: [{ id: "b", name: "Alex", month: 10, day: 20, year: null, inMemory: false }],
      }),
    );
    expect(n.title).toBe("Good morning ☀️ · Mon, 19 Oct");
    expect(n.body.split("\n")).toEqual([
      "🎓 2 classes · first Databases 08:50 (B101)",
      "📌 Stats HW due Fri, 23 Oct",
      "📅 Dinner 19:00",
      "🎂 Alex's birthday tomorrow",
    ]);
  });
  it("adds the goals and markets lines at the end", () => {
    const [n] = dueNotifications(base({ nowMin: at("07:00"), goalsLine: "🎯 Gym 1 / 3", newsLine: "📰 S&P +0.4%" }));
    expect(n.body.split("\n").slice(-2)).toEqual(["🎯 Gym 1 / 3", "📰 S&P +0.4%"]);
  });
  it("mentions holidays and skips the no-classes line on days off", () => {
    const [n] = dueNotifications(base({ today: "2026-10-01", nowMin: at("07:00") }));
    expect(n.body).toBe("🇨🇳 国庆节 holiday");
  });
});

describe("reminders", () => {
  it("reminds 15–25 minutes before a class (the job runs every 10 minutes)", () => {
    expect(keys(base({ nowMin: at("08:20") }))).toEqual([]);
    expect(keys(base({ nowMin: at("08:30") }))).toEqual(["class:Databases:2026-10-19"]);
    expect(dueNotifications(base({ nowMin: at("08:30") }))[0]).toMatchObject({ title: "🎓 Databases in 20 min", body: "08:50–10:25 · 📍 B101" });
  });
  it("can remind tonight about a class just after midnight", () => {
    const input = base({ nowMin: at("23:40"), classes: [cls("Night", 2, "00:05", "01:00")] });
    expect(keys(input)).toEqual(["class:Night:2026-10-20"]);
  });
  it("reminds 30–40 minutes before your own timed events, not all-day ones or deadlines", () => {
    const events = [ev("Dinner", "2026-10-19", { startTime: "19:00" }), ev("Trip", "2026-10-19"), ev("HW", "2026-10-19", { kind: "deadline", startTime: "19:00" })];
    expect(keys(base({ nowMin: at("18:20"), events }))).toEqual(["event:Dinner:2026-10-19"]);
    expect(dueNotifications(base({ nowMin: at("18:20"), events }))[0].title).toBe("📅 Dinner in 40 min");
  });
  it("gives a 21:00 heads-up for deadlines due tomorrow that aren't done", () => {
    const deadlines = [ev("Stats HW", "2026-10-20", { kind: "deadline", leadDays: 7 }), ev("Later", "2026-10-25", { kind: "deadline", leadDays: 7 })];
    expect(keys(base({ nowMin: at("21:00"), deadlines }))).toEqual(["deadline:Stats HW:2026-10-20"]);
  });
  it("respects the switches", () => {
    const prefs = { briefingTime: "07:00", classes: false, events: true, deadlines: true };
    expect(keys(base({ nowMin: at("08:30"), prefs }))).toEqual([]);
  });
});
