import { describe, expect, it } from "vitest";
import { activeDeadlines, nextOccurrence, upcomingBirthdays } from "./briefing";

describe("activeDeadlines", () => {
  const d = (id: string, date: string, leadDays: number | null, done = false) => ({ id, title: id, date, startTime: null, leadDays, done });
  it("starts showing a deadline lead days before it's due", () => {
    const list = [d("big", "2026-10-30", 14), d("small", "2026-10-30", 7), d("soon", "2026-10-20", 7)];
    expect(activeDeadlines(list, "2026-10-17").map((x) => [x.id, x.daysLeft])).toEqual([["soon", 3], ["big", 13]]);
    expect(activeDeadlines(list, "2026-10-23").map((x) => x.id)).toEqual(["soon", "big", "small"]); // "soon" is overdue: still shown
  });
  it("keeps overdue ones until done, and hides done ones", () => {
    expect(activeDeadlines([d("late", "2026-10-15", 7)], "2026-10-17")[0].daysLeft).toBe(-2);
    expect(activeDeadlines([d("ok", "2026-10-18", 7, true)], "2026-10-17")).toEqual([]);
  });
});

describe("birthdays", () => {
  it("finds the next occurrence, this year or next", () => {
    expect(nextOccurrence({ month: 10, day: 25 }, "2026-10-17")).toBe("2026-10-25");
    expect(nextOccurrence({ month: 10, day: 17 }, "2026-10-17")).toBe("2026-10-17");
    expect(nextOccurrence({ month: 1, day: 15 }, "2026-10-17")).toBe("2027-01-15");
    expect(nextOccurrence({ month: 2, day: 29 }, "2026-10-17")).toBe("2027-02-28");
  });
  it("lists birthdays within the window, soonest first, with age when the year is known", () => {
    const list = [
      { id: "1", name: "Alex", month: 3, day: 25, year: null, inMemory: false },
      { id: "2", name: "Sam", month: 3, day: 14, year: null, inMemory: false },
      { id: "3", name: "Jordan", month: 3, day: 18, year: 2000, inMemory: false },
    ];
    expect(upcomingBirthdays(list, "2026-03-17", 7).map((b) => [b.name, b.inDays, b.turns])).toEqual([["Jordan", 1, 26]]);
    expect(upcomingBirthdays(list, "2026-03-17", 8).map((b) => b.name)).toEqual(["Jordan", "Alex"]);
  });
});
