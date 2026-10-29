import { describe, expect, it } from "vitest";
import { balanceAsOf, compactYuan, heatLevel, monthGrid } from "./calendar";

describe("monthGrid", () => {
  it("lays October 2026 out Monday-first (1 Oct is a Thursday)", () => {
    const weeks = monthGrid("2026-10-11");
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks).toHaveLength(5);
    expect(weeks[4].slice(0, 6)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("handles February in a leap year", () => {
    const days = monthGrid("2028-02-01").flat().filter(Boolean);
    expect(days).toHaveLength(29);
  });
});

describe("heatLevel", () => {
  it("compares a day with the daily allowance (¥48.38 in October)", () => {
    expect(heatLevel(0, 4838)).toBe(0);
    expect(heatLevel(2000, 4838)).toBe(1);
    expect(heatLevel(4838, 4838)).toBe(2);
    expect(heatLevel(7000, 4838)).toBe(3);
    expect(heatLevel(9000, 4838)).toBe(4);
    expect(heatLevel(30000, 4838)).toBe(5);
  });
});

describe("balanceAsOf", () => {
  it("adds up a ledger to a date", () => {
    const rows = [
      { date: "2026-09-29", deltaFen: 80000 },
      { date: "2026-09-30", deltaFen: -80000 },
      { date: "2026-10-05", deltaFen: 120000 },
    ];
    expect(balanceAsOf(rows, "2026-09-30")).toBe(0);
    expect(balanceAsOf(rows, "2026-10-31")).toBe(120000);
  });
});

describe("compactYuan", () => {
  it("keeps cell labels short", () => {
    expect(compactYuan(3200)).toBe("32");
    expect(compactYuan(4250)).toBe("42.5");
    expect(compactYuan(19990)).toBe("200");
    expect(compactYuan(186000)).toBe("1.9k");
    expect(compactYuan(2000000)).toBe("20k");
  });
});
