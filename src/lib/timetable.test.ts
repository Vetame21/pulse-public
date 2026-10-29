import { describe, expect, it } from "vitest";
import holidays2026 from "../data/holidays/2026.json";
import { type ClassRow, classStatus, classesOn, currentWeek, formatWeeks, parseWeeks, weekOf } from "./timetable";

const sem = { id: "s", name: "2026-2027 1", startDate: "2026-08-31", weeks: 18 };
const cls = (id: string, weekday: number, startTime: string, weeks: number[], extra: Partial<ClassRow> = {}): ClassRow => ({
  id, semesterId: "s", title: id, titleZh: null, teacher: null, room: null, weekday, startTime, endTime: "23:00", weeks, ...extra,
});

describe("parseWeeks / formatWeeks", () => {
  it("reads ranges and lists the way timetables write them", () => {
    expect(parseWeeks("1-7, 9-17")).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parseWeeks("1-4")).toEqual([1, 2, 3, 4]);
    expect(parseWeeks("3，5")).toEqual([3, 5]);
  });
  it("rejects nonsense", () => {
    expect(parseWeeks("")).toBeNull();
    expect(parseWeeks("7-1")).toBeNull();
    expect(parseWeeks("0-3")).toBeNull();
    expect(parseWeeks("abc")).toBeNull();
  });
  it("writes weeks back compactly", () => {
    expect(formatWeeks([1, 2, 3, 4, 5, 6, 7, 9, 10, 11])).toBe("1–7, 9–11");
    expect(formatWeeks([3])).toBe("3");
  });
});

describe("weekOf", () => {
  it("counts teaching weeks from the semester start", () => {
    expect(weekOf(sem, "2026-08-31")).toBe(1);
    expect(weekOf(sem, "2026-09-06")).toBe(1);
    expect(weekOf(sem, "2026-10-17")).toBe(7);
    expect(weekOf(sem, "2026-08-30")).toBeNull();
    expect(weekOf(sem, "2027-01-04")).toBeNull(); // week 19
    expect(currentWeek([sem], "2026-10-17")?.week).toBe(7);
  });
});

describe("classesOn", () => {
  const classes = [cls("db", 1, "08:50", [1, 2, 3, 4]), cls("stats", 1, "14:00", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), cls("prob", 4, "14:00", [1, 2, 3, 4, 5, 6, 7, 9])];
  const h = [holidays2026];
  it("shows a class only in its weeks, in time order", () => {
    expect(classesOn("2026-08-31", [sem], classes, h).map((c) => c.id)).toEqual(["db", "stats"]);
    expect(classesOn("2026-10-12", [sem], classes, h).map((c) => c.id)).toEqual(["stats"]); // week 7: Databases is over
  });
  it("skips weeks a class doesn't run", () => {
    expect(classesOn("2026-10-22", [sem], classes, h).map((c) => c.id)).toEqual([]); // Thu of week 8
    expect(classesOn("2026-10-29", [sem], classes, h).map((c) => c.id)).toEqual(["prob"]);
  });
  it("cancels classes on official days off", () => {
    expect(classesOn("2026-10-05", [sem], classes, h)).toEqual([]); // 国庆 Monday
  });
});

describe("back-to-back sessions", () => {
  const h = [holidays2026];
  const stats = (id: string, startTime: string, endTime: string, weeks: number[], room = "B102") =>
    cls(id, 1, startTime, weeks, { title: "Statistics", room, endTime });
  it("merges one class split by a short break into one entry", () => {
    const merged = classesOn("2026-10-12", [sem], [stats("a", "14:00", "15:35", [7]), stats("b", "15:45", "16:30", [7])], h);
    expect(merged.map((c) => [c.id, c.startTime, c.endTime])).toEqual([["a", "14:00", "16:30"]]);
  });
  it("keeps sessions apart when only one runs that week, the room differs, or the gap is long", () => {
    expect(classesOn("2026-10-12", [sem], [stats("a", "14:00", "15:35", [7]), stats("b", "15:45", "16:30", [8])], h)).toHaveLength(1);
    expect(classesOn("2026-10-12", [sem], [stats("a", "14:00", "15:35", [7]), stats("b", "15:45", "16:30", [7], "B101")], h)).toHaveLength(2);
    expect(classesOn("2026-10-12", [sem], [stats("a", "08:00", "09:00", [7]), stats("b", "10:00", "11:00", [7])], h)).toHaveLength(2);
  });
});

describe("classStatus", () => {
  it("says why a class isn't on this week", () => {
    expect(classStatus([1, 2, 3, 4], 7)).toEqual({ running: false, label: "Finished (week 4)" });
    expect(classStatus([3, 4, 5], 1)).toEqual({ running: false, label: "Starts week 3" });
    expect(classStatus([1, 2, 3, 4, 5, 6, 7, 9], 8)).toEqual({ running: false, label: "No class this week" });
    expect(classStatus([1, 2, 3], 2)).toEqual({ running: true, label: null });
    expect(classStatus([1, 2, 3], null)).toEqual({ running: true, label: null });
  });
});
