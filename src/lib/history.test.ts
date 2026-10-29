import { describe, expect, it } from "vitest";
import {
  type DailyTotals,
  buildHistory,
  compareWithPrevious,
  countedDaysIn,
  niceAxisMax,
  periodBounds,
  shiftAnchor,
} from "./history";

const START = "2026-08-29";
const TODAY = "2026-10-11";

const daily: DailyTotals = new Map([
  ["2026-08-29", 3000],
  ["2026-08-30", 8000],
  ["2026-08-31", 2500],
  ["2026-09-01", 4000],
  ["2026-09-15", 110000],
  ["2026-10-01", 5000],
  ["2026-10-06", 2000],
  ["2026-10-11", 3000],
]);

describe("periodBounds", () => {
  it("weeks run Monday to Sunday, across month ends", () => {
    expect(periodBounds("W", "2026-10-11")).toEqual({ start: "2026-10-05", end: "2026-10-11" }); // Sunday
    expect(periodBounds("W", "2026-09-30")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("months, 6 months and years end with the anchor's month", () => {
    expect(periodBounds("M", "2026-10-11")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(periodBounds("6M", "2026-10-11")).toEqual({ start: "2026-05-01", end: "2026-10-31" });
    expect(periodBounds("Y", "2026-10-11")).toEqual({ start: "2025-11-01", end: "2026-10-31" });
  });

  it("shifts anchors by whole periods", () => {
    expect(shiftAnchor("W", "2026-10-11", -1)).toBe("2026-10-04");
    expect(shiftAnchor("M", "2026-10-11", -1)).toBe("2026-09-01");
    expect(shiftAnchor("6M", "2026-10-11", -1)).toBe("2026-04-01");
    expect(shiftAnchor("Y", "2026-10-11", -1)).toBe("2025-10-01");
  });
});

describe("countedDaysIn", () => {
  it("ignores days before tracking and after today", () => {
    expect(countedDaysIn("2026-08-01", "2026-08-31", START, TODAY)).toBe(3);
    expect(countedDaysIn("2026-10-01", "2026-10-31", START, TODAY)).toBe(11);
    expect(countedDaysIn("2026-07-01", "2026-07-31", START, TODAY)).toBe(0);
  });
});

describe("month view (one bar per day)", () => {
  const oct = buildHistory({ range: "M", anchor: TODAY, today: TODAY, trackingStart: START, daily });

  it("has a bar for every day; days after today are 'future'", () => {
    expect(oct.bars).toHaveLength(31);
    expect(oct.bars[10]).toMatchObject({ key: "2026-10-11", totalFen: 3000, state: "data" });
    expect(oct.bars[11].state).toBe("future");
  });

  it("totals and averages over the 11 tracked days only", () => {
    expect(oct.totalFen).toBe(10000);
    expect(oct.countedDays).toBe(11);
    expect(oct.avgPerDayFen).toBe(909); // ¥100 / 11 days = ¥9.09
    expect(oct.highest?.key).toBe("2026-10-01");
  });

  it("partial August averages over its 3 tracked days", () => {
    const aug = buildHistory({ range: "M", anchor: "2026-08-15", today: TODAY, trackingStart: START, daily });
    expect(aug.bars[0].state).toBe("untracked");
    expect(aug.countedDays).toBe(3);
    expect(aug.totalFen).toBe(13500);
    expect(aug.avgPerDayFen).toBe(4500);
  });
});

describe("6-month view (one bar per month)", () => {
  const h = buildHistory({ range: "6M", anchor: TODAY, today: TODAY, trackingStart: START, daily });

  it("marks months before tracking and flags partial months", () => {
    expect(h.bars.map((b) => b.state)).toEqual(["untracked", "untracked", "untracked", "data", "data", "data"]);
    expect(h.bars[3]).toMatchObject({ key: "2026-08-01", totalFen: 13500, countedDays: 3, avgPerDayFen: 4500, partial: true });
    expect(h.bars[4]).toMatchObject({ key: "2026-09-01", totalFen: 114000, countedDays: 30, avgPerDayFen: 3800, partial: false });
    expect(h.bars[5]).toMatchObject({ key: "2026-10-01", totalFen: 10000, countedDays: 11, partial: true });
  });

  it("summarises the whole period", () => {
    expect(h.totalFen).toBe(137500);
    expect(h.countedDays).toBe(44); // 3 + 30 + 11
    expect(h.avgPerDayFen).toBe(3125);
    expect(h.avgPerMonthFen).toBe(45833);
    expect(h.highest?.key).toBe("2026-09-01");
  });
});

describe("compareWithPrevious", () => {
  it("compares October so far with September, fairly by average per day", () => {
    const oct = buildHistory({ range: "M", anchor: TODAY, today: TODAY, trackingStart: START, daily });
    const c = compareWithPrevious(oct, { anchor: TODAY, today: TODAY, trackingStart: START, daily });
    expect(c.previous.totalFen).toBe(114000);
    expect(c.previous.avgPerDayFen).toBe(3800);
    expect(c.avgPerDayChange).toBe(-76.1); // ¥9.09/day vs ¥38/day
  });

  it("has no comparison when the previous period wasn't tracked", () => {
    const aug = buildHistory({ range: "M", anchor: "2026-08-30", today: TODAY, trackingStart: START, daily });
    const c = compareWithPrevious(aug, { anchor: "2026-08-30", today: TODAY, trackingStart: START, daily });
    expect(c.avgPerDayChange).toBeNull();
    expect(c.totalChange).toBeNull();
  });
});

describe("niceAxisMax", () => {
  it("rounds up to clean yuan values", () => {
    expect(niceAxisMax(4300)).toBe(5000); // ¥43 → ¥50
    expect(niceAxisMax(110000)).toBe(200000); // ¥1,100 → ¥2,000
    expect(niceAxisMax(21000)).toBe(25000); // ¥210 → ¥250
    expect(niceAxisMax(0)).toBe(10000);
  });
});
