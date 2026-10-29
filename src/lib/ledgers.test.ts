import { describe, expect, it } from "vitest";
import { spentInMonth } from "./budget";
import {
  canPayFromHeld,
  familyPeople,
  familyTotals,
  loanFen,
  myMoney,
  savingsBalance,
  splitRestaurantBill,
  summarizePerson,
  summarizeWallet,
} from "./ledgers";

describe("restaurant wallet", () => {
  it("spec example: pay ¥500 for ¥600 credit, eat ¥80 → ¥520 left", () => {
    const s = summarizeWallet([
      { kind: "topup", cashPaidFen: 50000, creditDeltaFen: 60000 },
      { kind: "usage", cashPaidFen: 0, creditDeltaFen: -8000 },
    ]);
    expect(s).toEqual({
      cashPaidFen: 50000,
      creditReceivedFen: 60000,
      bonusFen: 10000,
      creditUsedFen: 8000,
      adjustmentsFen: 0,
      balanceFen: 52000,
    });
  });

  it("splits a bill larger than the balance into credit + cash", () => {
    expect(splitRestaurantBill(8000, 11000)).toEqual({ creditFen: 8000, cashFen: 3000 });
    expect(splitRestaurantBill(52000, 8000)).toEqual({ creditFen: 8000, cashFen: 0 });
    expect(splitRestaurantBill(0, 5000)).toEqual({ creditFen: 0, cashFen: 5000 });
  });
});

describe("one person's money", () => {
  it("spec example: +800 −800 +1,200 −700 → ¥500", () => {
    const s = summarizePerson([
      { kind: "received", amountFen: 80000 },
      { kind: "paid", amountFen: 80000 },
      { kind: "received", amountFen: 120000 },
      { kind: "paid", amountFen: 70000 },
    ]);
    expect(s).toEqual({ receivedFen: 200000, paidFen: 150000, keptFen: 0, balanceFen: 50000 });
  });

  it("blocks paying more than they sent", () => {
    expect(canPayFromHeld(50000, 50000)).toBe(true);
    expect(canPayFromHeld(50000, 50001)).toBe(false);
    expect(canPayFromHeld(50000, 0)).toBe(false);
  });
});

describe("accounts stay separate (spec rule 50)", () => {
  it("personal spending stays ¥500 despite apartment, family and credit activity", () => {
    // Only personal_expenses feed the budget. Rent (¥2,000), a family payment
    // (¥800) and ¥100 of restaurant credit use live in other ledgers entirely.
    const personal = [
      { txnDate: "2026-10-03", amountFen: 50000, kind: "expense" as const, fundedBy: "budget" as const },
    ];
    expect(spentInMonth(personal, "2026-10-01")).toBe(50000);
  });
});

describe("Savings Box and My Money", () => {
  it("sums savings entries, including withdrawals", () => {
    expect(savingsBalance([{ amountFen: 31000 }, { amountFen: 26300 }, { amountFen: -20000 }])).toBe(37300);
  });

  it("subtracts family money from real balances", () => {
    expect(myMoney(892000, 50000)).toEqual({ yoursFen: 842000, heldFen: 50000 });
    expect(myMoney(892000, 0)).toEqual({ yoursFen: 892000, heldFen: 0 });
  });
});

describe("family loans", () => {
  it("lends only the part above their balance", () => {
    expect(loanFen(50000, 30000)).toBe(0);
    expect(loanFen(50000, 80000)).toBe(30000);
    expect(loanFen(0, 80000)).toBe(80000);
    expect(loanFen(-20000, 10000)).toBe(10000); // already owes: all of it is lent
  });
  it("money they send repays the loan first", () => {
    const after = summarizePerson([
      { kind: "paid", amountFen: 50000 }, // ¥500 lent
      { kind: "received", amountFen: 100000 }, // they send ¥1,000
    ]);
    expect(after.balanceFen).toBe(50000); // loan cleared, ¥500 left to pass on
  });
});

describe("Family Money", () => {
  const alex = { from: "Alex", keepRest: false };
  it("keeps each person's balance apart", () => {
    const people = familyPeople([
      { ...alex, kind: "received", amountFen: 100000 },
      { from: "Sam", keepRest: false, kind: "paid", amountFen: 20000 }, // lent ¥200 to Sam
      { ...alex, kind: "paid", amountFen: 30000 },
    ]);
    expect(people.map((p) => [p.name, p.balanceFen])).toEqual([["Alex", 70000], ["Sam", -20000]]);
    // Sam's loan doesn't eat into what you hold for Alex
    expect(familyTotals(people)).toEqual({ heldFen: 70000, owedFen: 20000 });
  });
  it("'rest is mine' comes from the latest money received", () => {
    const [p] = familyPeople([
      { ...alex, kind: "received", amountFen: 50000 },
      { ...alex, keepRest: true, kind: "received", amountFen: 100000 },
      { ...alex, kind: "paid", amountFen: 120000 },
    ]);
    expect(p.keepRest).toBe(true);
    expect(p.balanceFen).toBe(30000);
  });
  it("keeping the rest brings their balance to zero", () => {
    const [p] = familyPeople([
      { ...alex, keepRest: true, kind: "received", amountFen: 100000 },
      { ...alex, kind: "paid", amountFen: 60000 },
      { ...alex, kind: "kept", amountFen: 40000 },
    ]);
    expect(p).toMatchObject({ receivedFen: 100000, paidFen: 60000, keptFen: 40000, balanceFen: 0 });
  });
});
