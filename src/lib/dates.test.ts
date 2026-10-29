import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysInMonth,
  daysInclusive,
  diffDays,
  formatMonth,
  isValidISODate,
  monthEnd,
  monthStart,
  todayIn,
} from "./dates";

describe("month lengths and leap years", () => {
  it("knows every month length", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
  });

  it("handles leap years", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2027-02-29")).toBe(false);
  });

  it("rejects malformed dates", () => {
    for (const bad of ["2026-13-01", "2026-00-10", "2026-09-31", "2026-9-1", "nope"]) {
      expect(isValidISODate(bad)).toBe(false);
    }
  });
});

describe("month boundaries", () => {
  it("finds month start and end", () => {
    expect(monthStart("2026-08-29")).toBe("2026-08-01");
    expect(monthEnd("2026-09-15")).toBe("2026-09-30");
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("adds months across years", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2027-01-01", -1)).toBe("2026-12-01");
    expect(addMonths("2026-08-01", 14)).toBe("2027-10-01");
  });

  it("counts days", () => {
    expect(daysInclusive("2026-08-29", "2026-08-31")).toBe(3);
    expect(diffDays("2026-10-11", "2026-10-31")).toBe(20);
    expect(daysInclusive("2026-09-01", "2026-11-30")).toBe(91);
  });

  it("formats months", () => {
    expect(formatMonth("2026-10-11")).toBe("October 2026");
  });
});

describe("timezone", () => {
  it("uses the configured timezone, not UTC", () => {
    // 2026-10-11 17:30 UTC is already the 12th in Shanghai (UTC+8, 01:30)
    // and in Bangkok (UTC+7, 00:30), but still the 11th in UTC.
    const instant = new Date("2026-10-11T17:30:00Z");
    expect(todayIn("Asia/Shanghai", instant)).toBe("2026-10-12");
    expect(todayIn("Asia/Bangkok", instant)).toBe("2026-10-12");
    expect(todayIn("UTC", instant)).toBe("2026-10-11");
  });

  it("handles the Shanghai month boundary", () => {
    // 31 Aug 16:30 UTC = 1 Sep 00:30 in Shanghai
    expect(todayIn("Asia/Shanghai", new Date("2026-08-31T16:30:00Z"))).toBe("2026-09-01");
    expect(todayIn("Asia/Shanghai", new Date("2026-08-31T15:59:00Z"))).toBe("2026-08-31");
  });
});
