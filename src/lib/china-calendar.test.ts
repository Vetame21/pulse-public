import { describe, expect, it } from "vitest";
import { type CalendarEvent, eventsOnDay, holidayFor, lunarInfo, upNext } from "./china-calendar";
import holidays2026 from "../data/holidays/2026.json";

describe("lunarInfo", () => {
  it("names lunar days the traditional way", () => {
    expect(lunarInfo("2026-10-17")).toMatchObject({ monthName: "九月", day: 8, dayName: "初八", label: "初八" });
    expect(lunarInfo("2026-10-31").dayName).toMatch(/^(廿|二十|三十)/);
  });

  it("shows the month name on the 1st of a lunar month", () => {
    expect(lunarInfo("2026-02-17")).toMatchObject({ day: 1, label: "正月" });
  });

  it("knows the traditional festivals", () => {
    expect(lunarInfo("2026-02-17").festival).toBe("春节");
    expect(lunarInfo("2026-03-03").festival).toBe("元宵节");
    expect(lunarInfo("2026-06-19").festival).toBe("端午节");
    expect(lunarInfo("2026-08-19").festival).toBe("七夕");
    expect(lunarInfo("2026-09-25").festival).toBe("中秋节");
    expect(lunarInfo("2026-10-18").festival).toBe("重阳节");
  });

  it("finds 除夕 as the day before 春节, even when 腊月 has only 29 days", () => {
    expect(lunarInfo("2026-02-16")).toMatchObject({ monthName: "腊月", day: 29, festival: "除夕" });
    expect(lunarInfo("2026-02-15").festival).toBeUndefined();
  });
});

describe("holidayFor (State Council schedule)", () => {
  const map = [holidays2026];
  it("marks official days off", () => {
    expect(holidayFor("2026-10-01", map)).toEqual({ name: "国庆节", off: true });
    expect(holidayFor("2026-02-17", map)).toEqual({ name: "春节", off: true });
  });
  it("marks 调休 make-up workdays", () => {
    expect(holidayFor("2026-01-04", map)).toEqual({ name: "元旦", off: false });
  });
  it("returns null on normal days", () => {
    expect(holidayFor("2026-10-17", map)).toBeNull();
  });
});

const ev = (id: string, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  date,
  endDate: null,
  startTime: null,
  endTime: null,
  location: null,
  notes: null,
  kind: "event",
  leadDays: null,
  done: false,
  ...extra,
});

describe("eventsOnDay", () => {
  it("includes multi-day events on every day they cover, all-day first then by time", () => {
    const events = [ev("class", "2026-10-17", { startTime: "10:00" }), ev("trip", "2026-10-16", { endDate: "2026-10-18" }), ev("gym", "2026-10-17", { startTime: "08:00" }), ev("other", "2026-10-19")];
    expect(eventsOnDay(events, "2026-10-17").map((e) => e.id)).toEqual(["trip", "gym", "class"]);
    expect(eventsOnDay(events, "2026-10-19").map((e) => e.id)).toEqual(["other"]);
  });
});

describe("upNext", () => {
  const events = [
    ev("morning", "2026-10-17", { startTime: "08:00", endTime: "09:00" }),
    ev("class", "2026-10-17", { startTime: "14:00", endTime: "15:30" }),
    ev("allday", "2026-10-17"),
    ev("tomorrow", "2026-10-18", { startTime: "10:00" }),
    ev("later", "2026-10-25"),
  ];
  it("skips what already ended today and shows what's left, then the coming days", () => {
    expect(upNext(events, "2026-10-17", "13:00", 3).map((e) => e.id)).toEqual(["allday", "class", "tomorrow"]);
  });
  it("keeps an event that's happening right now", () => {
    expect(upNext(events, "2026-10-17", "14:30", 1).map((e) => e.id)).toEqual(["allday"]);
    expect(upNext(events, "2026-10-17", "14:30", 2).map((e) => e.id)).toEqual(["allday", "class"]);
  });
  it("looks only 7 days ahead", () => {
    expect(upNext(events, "2026-10-17", "23:00", 10).map((e) => e.id)).toEqual(["allday", "tomorrow"]);
  });
});
