import { describe, expect, it } from "vitest";
import { allowanceForDay, arcForPace, flavourFor, isComeback, noSpendDays, paceRatio, spectrumPosition, withinStreak } from "./arc";

describe("arcForPace", () => {
  it("maps pace to arcs", () => {
    expect(arcForPace(0.2)).toBe("monk");
    expect(arcForPace(0.6)).toBe("frugal");
    expect(arcForPace(0.8)).toBe("frugal");
    expect(arcForPace(1.0)).toBe("balanced");
    expect(arcForPace(1.2)).toBe("hedon");
    expect(arcForPace(1.5)).toBe("chaos");
  });

  it("is Chaos when over budget and Fresh Start early in the month", () => {
    expect(arcForPace(0.5, { overBudget: true })).toBe("chaos");
    expect(arcForPace(2, { earlyInMonth: true })).toBe("fresh");
    expect(arcForPace(null)).toBe("fresh");
  });
});

describe("paceRatio", () => {
  it("compares spending with the allowance so far", () => {
    // A ¥50/day allowance; ¥600 in 10 days → 1.2× pace (Hedon)
    expect(paceRatio(60000, 5000, 10)).toBeCloseTo(1.2);
    expect(paceRatio(100, 0, 10)).toBeNull();
  });
});

describe("flavourFor", () => {
  it("picks a dominant category", () => {
    expect(flavourFor([{ key: "food", fen: 50000 }, { key: "shopping", fen: 20000 }])).toBe("food");
    expect(flavourFor([{ key: "food", fen: 30000 }, { key: "shopping", fen: 30000 }, { key: "toys", fen: 20000 }])).toBeNull();
    expect(flavourFor([{ key: "toys", fen: 5000 }])).toBeNull(); // under ¥100
  });
});

describe("streaks and no-spend days", () => {
  const daily = new Map([
    ["2026-10-08", 9000], // over the ¥60/day allowance in October
    ["2026-10-09", 3000],
    ["2026-10-10", 0],
    ["2026-10-11", 4500],
    ["2026-10-12", 1000],
  ]);

  it("knows the daily allowance per month", () => {
    expect(allowanceForDay("2026-10-12", 186000)).toBe(6000);
    expect(allowanceForDay("2026-09-12", 186000)).toBe(6200);
  });

  it("counts days in a row within the allowance", () => {
    expect(withinStreak(daily, "2026-10-12", "2026-08-29", 186000)).toBe(4); // 9th–12th
    expect(withinStreak(new Map([["2026-10-12", 99999]]), "2026-10-12", "2026-08-29", 186000)).toBe(0);
  });

  it("doesn't count before tracking started", () => {
    expect(withinStreak(new Map(), "2026-08-30", "2026-08-29", 186000)).toBe(2);
  });

  it("counts no-spend days", () => {
    expect(noSpendDays(daily, "2026-10-08", "2026-10-12", "2026-08-29")).toBe(1);
  });

  it("detects a comeback", () => {
    expect(isComeback(1.3, 0.85)).toBe(true);
    expect(isComeback(1.3, 1.0)).toBe(false);
    expect(isComeback(null, 0.5)).toBe(false);
  });
});

describe("spectrumPosition", () => {
  it("places each arc in its own fifth of the bar", () => {
    expect(spectrumPosition(0.2)).toBeCloseTo(10); // middle of Monk
    expect(spectrumPosition(0.6)).toBeCloseTo(30); // middle of Frugal
    expect(spectrumPosition(1)).toBeGreaterThan(40);
    expect(spectrumPosition(1)).toBeLessThan(60); // Balanced
    expect(spectrumPosition(5)).toBe(98); // clamps
    expect(spectrumPosition(null)).toBe(50);
  });
});
