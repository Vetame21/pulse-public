import { describe, expect, it } from "vitest";
import { parseHkHolidays } from "./holidays";

describe("parseHkHolidays", () => {
  it("turns the HK government's list into days off per year", () => {
    const json = {
      vcalendar: [
        {
          vevent: [
            { dtstart: ["20261001", { value: "DATE" }], summary: "National Day" },
            { dtstart: ["20261019", { value: "DATE" }], summary: "The day following Chung Yeung Festival" },
            { dtstart: ["20270101", { value: "DATE" }], summary: "The first day of January" },
          ],
        },
      ],
    };
    const years = parseHkHolidays(json);
    expect(years.map((y) => y.year)).toEqual([2026, 2027]);
    expect(years[0].days).toEqual([
      { name: "National Day", date: "2026-10-01", isOffDay: true },
      { name: "The day following Chung Yeung Festival", date: "2026-10-19", isOffDay: true },
    ]);
  });
  it("returns nothing for unexpected data", () => {
    expect(parseHkHolidays({})).toEqual([]);
  });
});
