import { describe, expect, it } from "vitest";
import { type Goal, type GoalData, goalProgress, goalsBriefingLine } from "./goals";

const today = "2026-10-17"; // Saturday; week started Mon 12 Oct
const goal = (extra: Partial<Goal>): Goal => ({
  id: "g", title: "Goal", kind: "number", dueDate: null, createdDate: "2026-10-01", completed: false,
  targetFen: null, moneySource: null, baselineFen: 0, habitPeriod: null, habitTimes: null,
  targetValue: null, startValue: null, unit: null, numberMode: null, ...extra,
});
const data = (extra: Partial<GoalData> = {}): GoalData => ({ entries: [], checkins: [], steps: [], balances: { savings: null, mainAccount: null }, ...extra });
const entry = (value: number | null, date = today, amountFen: number | null = null) => ({ goalId: "g", date, value, amountFen, createdAt: `${date}T10:00:00Z` });

describe("money goals", () => {
  it("adds up manual amounts", () => {
    const p = goalProgress(goal({ kind: "money", targetFen: 500000, moneySource: "manual" }), data({ entries: [entry(null, today, 100000), entry(null, today, 110000)] }), today);
    expect(p).toMatchObject({ text: "¥2,100 / ¥5,000", reached: false });
    expect(p.fraction).toBeCloseTo(0.42);
  });
  it("follows the Savings Box, counting from a baseline", () => {
    const g = goal({ kind: "money", targetFen: 300000, moneySource: "savings", baselineFen: 100000 });
    expect(goalProgress(g, data({ balances: { savings: 250000, mainAccount: null } }), today).fraction).toBeCloseTo(0.5);
  });
});

describe("number goals", () => {
  it("adds up entries from a start value", () => {
    const p = goalProgress(goal({ targetValue: 1200, startValue: 800, unit: "words", numberMode: "add" }), data({ entries: [entry(20), entry(30)] }), today);
    expect(p.text).toBe("850 / 1,200 words");
  });
  it("uses the latest value, including goals that go down", () => {
    const g = goal({ targetValue: 72, startValue: 80, unit: "kg", numberMode: "set" });
    const p = goalProgress(g, data({ entries: [entry(78, "2026-10-10"), entry(76, "2026-10-16")] }), today);
    expect(p.text).toBe("76 / 72 kg");
    expect(p.fraction).toBeCloseTo(0.5);
  });
  it("judges pace against the time elapsed", () => {
    const g = goal({ targetValue: 100, startValue: 0, numberMode: "add", createdDate: "2026-10-01", dueDate: "2026-11-02" }); // 32 days, half elapsed
    expect(goalProgress(g, data({ entries: [entry(50)] }), today)).toMatchObject({ pace: "on", daysLeft: 16 });
    expect(goalProgress(g, data({ entries: [entry(20)] }), today).pace).toBe("behind");
    expect(goalProgress(g, data({ entries: [entry(80)] }), today).pace).toBe("ahead");
  });
});

describe("habits", () => {
  const checkins = (...dates: string[]) => dates.map((date) => ({ goalId: "g", date }));
  it("counts this week against a weekly target, with a streak of full weeks", () => {
    const g = goal({ kind: "habit", habitPeriod: "week", habitTimes: 3 });
    const d = data({ checkins: checkins("2026-10-13", "2026-10-06", "2026-10-07", "2026-10-09", "2026-09-29") });
    expect(goalProgress(g, d, today)).toMatchObject({ text: "1 / 3 this week", streak: 1, doneToday: false });
  });
  it("tracks today and the daily streak", () => {
    const g = goal({ kind: "habit", habitPeriod: "day", habitTimes: 1 });
    expect(goalProgress(g, data({ checkins: checkins("2026-10-15", "2026-10-16") }), today)).toMatchObject({ doneToday: false, streak: 2, text: "2 / 6 days this week" });
    expect(goalProgress(g, data({ checkins: checkins("2026-10-16", "2026-10-17") }), today)).toMatchObject({ doneToday: true, streak: 2 });
  });
});

describe("milestones", () => {
  it("counts steps and points at the next one", () => {
    const steps = [
      { id: "1", goalId: "g", title: "CV", position: 1, done: true },
      { id: "2", goalId: "g", title: "Apply to 10", position: 2, done: false },
      { id: "3", goalId: "g", title: "Interview", position: 3, done: false },
    ];
    expect(goalProgress(goal({ kind: "milestone" }), data({ steps }), today)).toMatchObject({ text: "1 / 3 steps", nextStep: { id: "2", title: "Apply to 10" } });
  });
});

describe("goalsBriefingLine", () => {
  it("lists habits still to do and goals behind pace", () => {
    const goals = [
      goal({ id: "gym", title: "Gym", kind: "habit", habitPeriod: "week", habitTimes: 3 }),
      goal({ id: "hsk", title: "HSK words", targetValue: 100, startValue: 0, numberMode: "add", dueDate: "2026-11-02" }),
    ];
    const d = data({ checkins: [{ goalId: "gym", date: "2026-10-13" }], entries: [{ ...entry(10), goalId: "hsk" }] });
    expect(goalsBriefingLine(goals, d, today)).toBe("🎯 Gym 1 / 3 · HSK words 10% (behind)");
  });
  it("says all is well, or nothing without goals", () => {
    expect(goalsBriefingLine([goal({ targetValue: 10, startValue: 0, numberMode: "add" })], data(), today)).toBe("🎯 1 goal on track");
    expect(goalsBriefingLine([], data(), today)).toBeNull();
  });
});
