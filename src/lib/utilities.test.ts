import { describe, expect, it } from "vitest";
import {
  compareBills,
  housingMonthlyFen,
  monthlyAverageFen,
  nextBillPeriod,
  periodsOverlap,
  rentForPeriod,
  rentMonths,
  utilityInsights,
  wholeMonthsCovered,
} from "./utilities";
import { percentChange } from "./money";

const junAug = { periodStart: "2026-06-01", periodEnd: "2026-08-31", totalFen: 27000 };
const sepNov = { periodStart: "2026-09-01", periodEnd: "2026-11-30", totalFen: 32000 };

describe("monthly average", () => {
  it("spec example: ¥320 over 3 months → ¥106.67/month", () => {
    expect(wholeMonthsCovered(sepNov.periodStart, sepNov.periodEnd)).toBe(3);
    expect(monthlyAverageFen(sepNov)).toBe(10667);
  });

  it("uses days for periods that don't align to months", () => {
    // 5 Sep – 3 Dec = 90 days; ¥300 × 30.4375 / 90 = ¥101.46
    const bill = { periodStart: "2026-09-05", periodEnd: "2026-12-03", totalFen: 30000 };
    expect(wholeMonthsCovered(bill.periodStart, bill.periodEnd)).toBeNull();
    expect(monthlyAverageFen(bill)).toBe(10146);
  });

  it("whole months across a year boundary", () => {
    expect(wholeMonthsCovered("2026-12-01", "2027-02-28")).toBe(3);
  });
});

describe("compareBills", () => {
  it("spec example: ¥270 → ¥320 is +¥50, +18.5%, higher", () => {
    const c = compareBills(junAug, sepNov);
    expect(c.totalDiffFen).toBe(5000);
    expect(c.monthlyDiffFen).toBe(1667);
    expect(c.percent).toBe(18.5);
    expect(c.direction).toBe("up");
  });

  it("a longer bill isn't 'higher' just because it covers more months", () => {
    const threeMonths = { periodStart: "2026-09-01", periodEnd: "2026-11-30", totalFen: 30000 };
    const fourMonths = { periodStart: "2026-12-01", periodEnd: "2027-03-31", totalFen: 36000 };
    const c = compareBills(threeMonths, fourMonths);
    expect(c.totalDiffFen).toBe(6000); // raw bill is higher…
    expect(c.direction).toBe("down"); // …but ¥90/month < ¥100/month
  });
});

describe("housing cost", () => {
  it("spec example: ¥2,000 + ¥106.67 = ¥2,106.67, up 0.8% from ¥2,090", () => {
    const current = housingMonthlyFen(200000, sepNov);
    const previous = housingMonthlyFen(200000, junAug);
    expect(current).toBe(210667);
    expect(previous).toBe(209000);
    expect(current - previous).toBe(1667);
    expect(percentChange(previous, current)).toBe(0.8);
  });

  it("is just rent before any utility bill", () => {
    expect(housingMonthlyFen(200000, null)).toBe(200000);
  });
});

describe("utilityInsights", () => {
  it("summarises bills in any order", () => {
    const decFeb = { periodStart: "2026-12-01", periodEnd: "2027-02-28", totalFen: 41000 };
    const insights = utilityInsights([sepNov, decFeb, junAug])!;
    expect(insights.latest).toBe(decFeb);
    expect(insights.previous).toBe(sepNov);
    expect(insights.highest).toBe(decFeb);
    expect(insights.lowest).toBe(junAug);
    expect(insights.historicalMonthlyFen).toBe(Math.round((9000 + 10667 + 13667) / 3));
    expect(insights.nextPeriod).toEqual({ start: "2027-03-01", end: "2027-05-31" });
  });

  it("returns null with no bills", () => {
    expect(utilityInsights([])).toBeNull();
  });
});

describe("nextBillPeriod", () => {
  it("handles day-based periods", () => {
    expect(nextBillPeriod({ periodStart: "2026-09-05", periodEnd: "2026-12-03", totalFen: 1 })).toEqual({
      start: "2026-12-04",
      end: "2027-03-03",
    });
  });
});

describe("rent", () => {
  it("lists rent months from the first one through the current month", () => {
    expect(rentMonths("2026-09-01", "2026-10-11")).toEqual(["2026-09-01", "2026-10-01"]);
    expect(rentMonths("2026-09-01", "2027-01-05")).toHaveLength(5);
    expect(rentMonths("2026-09-01", "2026-08-30")).toEqual([]);
  });

  it("uses rent actually paid in a period, so old comparisons survive a rent change", () => {
    const payments = [
      { month: "2026-09-01", amountFen: 200000 },
      { month: "2026-10-01", amountFen: 200000 },
      { month: "2026-11-01", amountFen: 210000 },
    ];
    expect(rentForPeriod(payments, "2026-09-01", "2026-11-30", 220000)).toBe(203333);
    expect(rentForPeriod(payments, "2026-06-01", "2026-08-31", 200000)).toBe(200000); // none recorded → fallback
  });

  it("detects overlapping bill periods", () => {
    expect(periodsOverlap(junAug, sepNov)).toBe(false);
    expect(periodsOverlap(junAug, { periodStart: "2026-08-15", periodEnd: "2026-10-31" })).toBe(true);
  });
});

describe("a three-month electricity bill", () => {
  it("¥360 over 3 months is ¥120/month; housing ¥2,120/month", () => {
    const bill = { periodStart: "2026-06-01", periodEnd: "2026-08-31", totalFen: 36000 };
    expect(monthlyAverageFen(bill)).toBe(12000);
    expect(housingMonthlyFen(200000, bill)).toBe(212000);
    expect(utilityInsights([bill])!.nextPeriod).toEqual({ start: "2026-09-01", end: "2026-11-30" });
  });
});
