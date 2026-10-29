import { describe, expect, it } from "vitest";
import {
  type PersonalExpense,
  budgetStatus,
  computeClosing,
  computeMonthBudget,
  monthsReadyToClose,
  proratedBudget,
  spentInMonth,
} from "./budget";

const START = "2026-08-29";
const BUDGET = 200000;

const exp = (txnDate: string, amountFen: number, extra: Partial<PersonalExpense> = {}): PersonalExpense => ({
  txnDate,
  amountFen,
  kind: "expense",
  fundedBy: "budget",
  ...extra,
});

describe("spentInMonth", () => {
  it("counts only this month's budget-funded spending, minus refunds", () => {
    const expenses = [
      exp("2026-10-01", 10000),
      exp("2026-10-15", 5000),
      exp("2026-10-20", 2000, { kind: "refund" }),
      exp("2026-10-21", 300000, { fundedBy: "savings" }), // spare phone from Savings Box
      exp("2026-09-30", 99900), // previous month
      exp("2026-11-01", 99900), // next month
    ];
    expect(spentInMonth(expenses, "2026-10-01")).toBe(13000);
  });

  it("restaurant top-up cash counts once, in the month paid", () => {
    // A ¥300 noodle-shop top-up → a ¥300 Food expense. Eating from the credit adds nothing.
    const expenses = [exp("2026-10-05", 30000, {})];
    expect(spentInMonth(expenses, "2026-10-01")).toBe(30000);
  });
});

describe("computeMonthBudget — current month", () => {
  it("matches the spec example: ¥653 left over 20 days → ¥32.65/day", () => {
    // October has 31 days; on the 12th, 20 days remain including today.
    const result = computeMonthBudget({
      month: "2026-10-01",
      budgetFen: BUDGET,
      today: "2026-10-12",
      trackingStart: START,
      expenses: [exp("2026-10-03", 134700)],
    });
    expect(result.spentFen).toBe(134700);
    expect(result.remainingFen).toBe(65300);
    expect(result.progress).toBeCloseTo(0.6735, 4);
    expect(result.remainingDays).toBe(20);
    expect(result.safeDailyFen).toBe(3265);
    expect(result.phase).toBe("current");
    expect(result.isPartial).toBe(false);
  });

  it("safe-to-spend stays the same all day; spending today reduces 'left today'", () => {
    const base = {
      month: "2026-10-01",
      budgetFen: BUDGET,
      today: "2026-10-12",
      trackingStart: START,
    };
    const morning = computeMonthBudget({ ...base, expenses: [exp("2026-10-03", 134700)] });
    const evening = computeMonthBudget({
      ...base,
      expenses: [exp("2026-10-03", 134700), exp("2026-10-12", 4250)],
    });
    expect(evening.safeDailyFen).toBe(morning.safeDailyFen);
    expect(evening.spentTodayFen).toBe(4250);
    expect(evening.leftTodayFen).toBe(3265 - 4250);
  });

  it("rounds safe-to-spend down", () => {
    const result = computeMonthBudget({
      month: "2026-10-01",
      budgetFen: 100000,
      today: "2026-10-29", // 3 days left
      trackingStart: START,
      expenses: [],
    });
    expect(result.safeDailyFen).toBe(33333); // 1000/3 = 333.333…
  });

  it("safe-to-spend is 0 when over budget", () => {
    const result = computeMonthBudget({
      month: "2026-10-01",
      budgetFen: BUDGET,
      today: "2026-10-20",
      trackingStart: START,
      expenses: [exp("2026-10-02", 220000)],
    });
    expect(result.safeDailyFen).toBe(0);
    expect(result.remainingFen).toBe(-20000);
    expect(result.status).toBe("over_budget");
  });

  it("projects the month linearly", () => {
    // ¥600 spent in 10 days of a 31-day month → ¥1,860 projected
    const result = computeMonthBudget({
      month: "2026-10-01",
      budgetFen: BUDGET,
      today: "2026-10-10",
      trackingStart: START,
      expenses: [exp("2026-10-04", 60000)],
    });
    expect(result.elapsedDays).toBe(10);
    expect(result.projectedFen).toBe(186000);
    expect(result.avgDailyFen).toBe(6000);
  });

  it("works in February of a leap year", () => {
    const result = computeMonthBudget({
      month: "2028-02-01",
      budgetFen: BUDGET,
      today: "2028-02-28",
      trackingStart: START,
      expenses: [],
    });
    expect(result.remainingDays).toBe(2); // 28th and 29th
    expect(result.safeDailyFen).toBe(100000);
  });
});

describe("computeMonthBudget — partial August 2026", () => {
  const august = computeMonthBudget({
    month: "2026-08-01",
    budgetFen: 0, // default: tracking only
    today: "2026-10-11",
    trackingStart: START,
    expenses: [exp("2026-08-29", 3200), exp("2026-08-30", 8000), exp("2026-08-31", 2500)],
  });

  it("is marked partial with 3 tracked days", () => {
    expect(august.isPartial).toBe(true);
    expect(august.firstTrackedDay).toBe("2026-08-29");
    expect(august.trackedDays).toBe(3);
    expect(august.elapsedDays).toBe(3);
    expect(august.phase).toBe("past");
  });

  it("averages over tracked days only and makes no projection", () => {
    expect(august.spentFen).toBe(13700);
    expect(august.avgDailyFen).toBe(4567); // ¥137 / 3 days
    expect(august.projectedFen).toBeNull();
    expect(august.safeDailyFen).toBeNull();
    expect(august.status).toBe("no_budget");
  });

  it("prorates the budget if you choose to: 3/31 × ¥2,000 = ¥193.55", () => {
    expect(proratedBudget(BUDGET, 3, 31)).toBe(19355);
  });
});

describe("month before tracking started", () => {
  it("has no tracked days", () => {
    const july = computeMonthBudget({
      month: "2026-07-01",
      budgetFen: BUDGET,
      today: "2026-10-11",
      trackingStart: START,
      expenses: [],
    });
    expect(july.trackedDays).toBe(0);
    expect(july.avgDailyFen).toBe(0);
  });
});

describe("budgetStatus", () => {
  it("compares against the pace line", () => {
    // Day 15 of 30: pace line is ¥1,000
    expect(budgetStatus(BUDGET, 100000, 15, 30)).toBe("on_track");
    expect(budgetStatus(BUDGET, 100001, 15, 30)).toBe("above_pace");
    expect(budgetStatus(BUDGET, 200001, 30, 30)).toBe("over_budget");
    expect(budgetStatus(0, 100, 1, 3)).toBe("no_budget");
  });
});

describe("computeClosing — month-end rule", () => {
  it("saves what is left", () => {
    expect(computeClosing(BUDGET, 169000)).toEqual({ savedFen: 31000, overFen: 0 });
    expect(computeClosing(BUDGET, 160000)).toEqual({ savedFen: 40000, overFen: 0 });
  });

  it("records overspending without taking from savings", () => {
    expect(computeClosing(BUDGET, 220000)).toEqual({ savedFen: 0, overFen: 20000 });
  });

  it("spec example: Sep ¥1,690 + Oct ¥1,737 → Savings Box ¥573", () => {
    const sep = computeClosing(BUDGET, 169000).savedFen;
    const oct = computeClosing(BUDGET, 173700).savedFen;
    expect(sep + oct).toBe(57300);
  });
});

describe("monthsReadyToClose", () => {
  it("lists ended months that aren't closed, oldest first", () => {
    expect(monthsReadyToClose(START, "2026-10-11", [])).toEqual(["2026-08-01", "2026-09-01"]);
    expect(monthsReadyToClose(START, "2026-10-11", ["2026-08-01"])).toEqual(["2026-09-01"]);
    expect(monthsReadyToClose(START, "2026-08-30", [])).toEqual([]);
  });

  it("works across a year boundary", () => {
    expect(monthsReadyToClose(START, "2027-01-02", ["2026-08-01", "2026-09-01", "2026-10-01"])).toEqual([
      "2026-11-01",
      "2026-12-01",
    ]);
  });
});
