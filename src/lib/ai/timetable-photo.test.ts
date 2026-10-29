import { describe, expect, it } from "vitest";
import { parseTimetablePaste } from "../timetable-paste";
import { toPasteLines } from "./timetable-photo";

describe("toPasteLines", () => {
  it("writes what the AI read in the paste format, which the paste parser accepts", () => {
    const text = toPasteLines([
      { day: "Monday", start: "08:50", end: "10:25", title: "Databases", room: "B101", weeks: "1-17" },
      { day: "wed", start: "14.00", end: "15.35", title: "线性代数 | II", room: null, weeks: "" },
      { day: "Funday", start: "08:00", end: "09:00", title: "Nope" },
    ]);
    expect(text).toBe("Mon 08:50-10:25 Databases | B101 | 1-17\nWed 14:00-15:35 线性代数 II");
    const parsed = parseTimetablePaste(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.classes).toHaveLength(2);
  });
});
