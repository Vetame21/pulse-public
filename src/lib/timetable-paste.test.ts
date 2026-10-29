import { describe, expect, it } from "vitest";
import { parseTimetablePaste } from "./timetable-paste";

describe("parseTimetablePaste", () => {
  it("reads English, Chinese and Indonesian day names, rooms and weeks", () => {
    const r = parseTimetablePaste(
      ["Mon 08:50-10:25 Databases | B101 | 1-17", "周三 14:00–15:35 线性代数 | B204 | weeks 2-17", "Jumat 9:00 - 10:30 Kalkulus", ""].join("\n"),
    );
    expect(r.errors).toEqual([]);
    expect(r.classes).toEqual([
      { weekday: 1, startTime: "08:50", endTime: "10:25", title: "Databases", room: "B101", weeks: Array.from({ length: 17 }, (_, i) => i + 1) },
      { weekday: 3, startTime: "14:00", endTime: "15:35", title: "线性代数", room: "B204", weeks: Array.from({ length: 16 }, (_, i) => i + 2) },
      { weekday: 5, startTime: "09:00", endTime: "10:30", title: "Kalkulus", room: null, weeks: null },
    ]);
  });
  it("reports lines it can't read, with their line numbers", () => {
    const r = parseTimetablePaste("Mon 08:50-10:25 OK class\nsomeday 10:00-11:00 X\nTue 11:00-10:00 Backwards\nWed 08:00-09:00 Bad weeks | A1 | abc");
    expect(r.classes).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });
});
