import { describe, expect, it } from "vitest";
import { monthRecap } from "./recap";

const e = (txnDate: string, amountFen: number, category: "food" | "shopping" | "transport" = "food", fundedBy: "budget" | "savings" = "budget") => ({
  txnDate,
  amountFen,
  category,
  kind: "expense" as const,
  fundedBy,
});

describe("monthRecap: the spec's October Wrapped", () => {
  const r = monthRecap({
    month: "2026-10-01",
    today: "2026-11-02",
    trackingStart: "2026-08-29",
    defaultBudgetFen: 140000,
    budgetFen: 140000,
    previousBudgetFen: 140000,
    closing: { savedFen: 16300, overFen: 0 },
    expenses: [
      e("2026-10-03", 70000, "food"),
      e("2026-10-10", 33700, "shopping"),
      e("2026-10-20", 20000, "transport"),
      e("2026-10-25", 99900, "shopping", "savings"), // spare phone from the Savings Box
      e("2026-09-05", 119000, "food"),
    ],
    savings: [
      { date: "2026-09-30", deltaFen: 21000 },
      { date: "2026-10-31", deltaFen: 16300 },
    ],
    walletTxns: [
      { date: "2026-10-05", kind: "topup", creditDeltaFen: 60000, cashPaidFen: 50000 },
      { date: "2026-10-12", kind: "usage", creditDeltaFen: -8000, cashPaidFen: 0 },
    ],
    family: [
      { date: "2026-09-29", kind: "received", amountFen: 80000 },
      { date: "2026-09-30", kind: "paid", amountFen: 80000 },
      { date: "2026-10-05", kind: "received", amountFen: 120000 },
      { date: "2026-10-07", kind: "paid", amountFen: 70000 },
    ],
  });

  it("matches the spec's numbers", () => {
    expect(r.spentFen).toBe(123700);
    expect(r.savedFen).toBe(16300);
    expect(r.avgPerDayFen).toBe(3990); // ¥39.90/day
    expect(r.categories[0].key).toBe("food");
    expect(r.savingsBoxFen).toBe(37300); // ¥373
    expect(r.restaurant.creditFen).toBe(52000); // ¥520
    expect(r.family.remainingFen).toBe(50000); // ¥500
  });

  it("keeps the Savings Box purchase out of the budget but reports it", () => {
    expect(r.fromSavingsFen).toBe(99900);
  });

  it("compares with September", () => {
    expect(r.previous?.spentFen).toBe(119000);
    expect(r.previous?.totalDiffFen).toBe(4700); // +¥47
    expect(r.previous?.totalChange).toBe(3.9); // ↑ 3.9%
  });

  it("knows the month's arc, biggest day and no-spend days", () => {
    expect(r.arc).toBe("balanced"); // ¥1,237 / ¥1,400 = 88% of pace
    expect(r.biggestDay).toEqual({ date: "2026-10-03", fen: 70000 });
    expect(r.noSpendDays).toBe(28); // 31 days, spending on 3 (the Savings Box purchase doesn't count)
  });
});
