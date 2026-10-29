import { describe, expect, it } from "vitest";
import { attentionItems, greeting } from "./today";

const calm = {
  overBudgetFen: 0,
  monthsToClose: [] as string[],
  rentUnpaidThisMonth: false,
  dayOfMonth: 17,
  thinkAgainReady: [] as string[],
  backupAgeDays: 3 as number | null,
  hasAnyData: true,
};

describe("greeting", () => {
  it("follows the hour in your timezone", () => {
    expect(greeting(6)).toBe("Good morning");
    expect(greeting(13)).toBe("Good afternoon");
    expect(greeting(19)).toBe("Good evening");
    expect(greeting(1)).toBe("Still up?");
  });
});

describe("attentionItems", () => {
  it("is empty on a calm day", () => {
    expect(attentionItems(calm)).toEqual([]);
  });

  it("lists what needs doing, most urgent first", () => {
    const items = attentionItems({
      ...calm,
      overBudgetFen: 2000,
      monthsToClose: ["2026-09-01", "2026-08-01"],
      rentUnpaidThisMonth: true,
      thinkAgainReady: ["Spare phone"],
      backupAgeDays: null,
    });
    expect(items.map((i) => i.key)).toEqual(["over-budget", "close-month", "rent", "think-again", "backup"]);
    expect(items[0].text).toContain("¥20");
    expect(items[1].text).toContain("September 2026");
    expect(items[1].text).toContain("+1 more");
    expect(items[1].href).toBe("/savings/close/2026-09");
    expect(items[3].text).toContain("Spare phone");
  });

  it("only nags about rent after the 5th", () => {
    expect(attentionItems({ ...calm, rentUnpaidThisMonth: true, dayOfMonth: 3 })).toEqual([]);
    expect(attentionItems({ ...calm, rentUnpaidThisMonth: true, dayOfMonth: 6 }).map((i) => i.key)).toEqual(["rent"]);
  });

  it("asks for a backup when there's data and none for 30+ days", () => {
    expect(attentionItems({ ...calm, backupAgeDays: 31 }).map((i) => i.key)).toEqual(["backup"]);
    expect(attentionItems({ ...calm, backupAgeDays: null, hasAnyData: false })).toEqual([]);
  });
});
