import { describe, expect, it } from "vitest";
import { type MoneyEvent, isAfterCheck, runningBalance } from "./my-money";

// Balance checked on 12 Oct at 13:17 Shanghai time (05:17 UTC).
const check = { balanceFen: 131700, checkedAt: "2026-10-12T05:17:00Z", checkDate: "2026-10-12" };

const ev = (key: string, date: string, recordedAt: string, deltaFen: number, kind: MoneyEvent["kind"] = "expense"): MoneyEvent => ({
  key,
  date,
  recordedAt,
  deltaFen,
  label: key,
  kind,
});

describe("isAfterCheck", () => {
  it("your example: checked at 13:17, expense added at 13:18 → it counts", () => {
    expect(isAfterCheck(ev("lunch", "2026-10-12", "2026-10-12T05:18:00Z", -1318), check)).toBe(true);
  });

  it("same day but recorded before the check → already in the balance", () => {
    expect(isAfterCheck(ev("breakfast", "2026-10-12", "2026-10-12T01:00:00Z", -800), check)).toBe(false);
  });

  it("backdated entry typed in after the check → already in the balance", () => {
    expect(isAfterCheck(ev("old", "2026-10-05", "2026-10-12T06:00:00Z", -5000), check)).toBe(false);
  });

  it("anything dated after the check day counts", () => {
    expect(isAfterCheck(ev("tomorrow", "2026-10-13", "2026-10-13T02:00:00Z", -100), check)).toBe(true);
  });
});

describe("runningBalance", () => {
  it("subtracts money out and adds money in recorded after the check", () => {
    const r = runningBalance(check, [
      ev("lunch", "2026-10-12", "2026-10-12T05:18:00Z", -1318),
      ev("breakfast", "2026-10-12", "2026-10-12T01:00:00Z", -800),
      ev("rent", "2026-10-13", "2026-10-13T03:00:00Z", -200000, "rent"),
      ev("allowance", "2026-10-13", "2026-10-13T04:00:00Z", 300000, "income"),
      ev("family", "2026-10-14", "2026-10-14T04:00:00Z", 80000, "family_in"),
      ev("family friend", "2026-10-14", "2026-10-14T05:00:00Z", -80000, "family_out"),
    ]);
    expect(r.outFen).toBe(1318 + 200000 + 80000);
    expect(r.inFen).toBe(300000 + 80000);
    expect(r.balanceFen).toBe(131700 - 1318 - 200000 + 300000);
    expect(r.counted.map((e) => e.key)).toEqual(["lunch", "rent", "allowance", "family", "family friend"]);
  });
});
