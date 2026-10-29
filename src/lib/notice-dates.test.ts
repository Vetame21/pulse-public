import { describe, expect, it } from "vitest";
import { findDates, findTime, suggestFromNotice } from "./notice-dates";

const today = "2026-10-17"; // Saturday
const dates = (t: string) => findDates(t, today).map((d) => d.date);

describe("findDates — Chinese", () => {
  it("reads full and month-day dates", () => {
    expect(dates("请于2026年10月25日前提交")).toEqual(["2026-10-25"]);
    expect(dates("10月25号交作业")).toEqual(["2026-10-25"]);
    expect(dates("1月10日期末考试")).toEqual(["2027-01-10"]); // January has passed this year → next year
  });
  it("reads day-of-month", () => {
    expect(dates("25号之前交")).toEqual(["2026-10-25"]);
    expect(dates("3号开会")).toEqual(["2026-11-03"]); // the 3rd has passed this month
  });
  it("reads weekdays, this week and next week", () => {
    expect(dates("周五前交作业")).toEqual(["2026-10-23"]);
    expect(dates("星期六")).toEqual(["2026-10-17"]); // today counts
    expect(dates("下周三上课")).toEqual(["2026-10-21"]);
    expect(dates("本周日")).toEqual(["2026-10-18"]);
  });
  it("reads today / tomorrow / the day after", () => {
    expect(dates("明天交")).toEqual(["2026-10-18"]);
    expect(dates("今晚8点")).toEqual(["2026-10-17"]);
    expect(dates("后天考试")).toEqual(["2026-10-19"]);
  });
});

describe("findDates — English", () => {
  it("reads day-month and month-day", () => {
    expect(dates("Submit by 25 Oct")).toEqual(["2026-10-25"]);
    expect(dates("due October 30th")).toEqual(["2026-10-30"]);
  });
  it("reads weekdays and relative days", () => {
    expect(dates("Quiz next Friday")).toEqual(["2026-10-23"]); // Friday of next week (like 下周五)
    expect(dates("meeting friday")).toEqual(["2026-10-23"]);
    expect(dates("due tomorrow")).toEqual(["2026-10-18"]);
  });
  it("ignores words that only look like weekdays or months", () => {
    expect(dates("Monitor the sunlight, may be fine")).toEqual([]);
  });
});

describe("findDates — mixed", () => {
  it("keeps each date once, in order", () => {
    expect(dates("10月25日（周日）交报告，10月25日截止")).toEqual(["2026-10-25"]);
    expect(dates("周一开会，周五交作业")).toEqual(["2026-10-19", "2026-10-23"]);
    expect(dates("Fri, 30 Oct: project demo")).toEqual(["2026-10-30"]);
  });
});

describe("findTime", () => {
  it("finds one clock time in common formats", () => {
    expect(findTime("截止时间 23:59")).toBe("23:59");
    expect(findTime("晚上8点在A1503")).toBe("20:00");
    expect(findTime("下午3点半")).toBe("15:30");
    expect(findTime("starts 7pm")).toBe("19:00");
  });
  it("gives up when there are several times or none", () => {
    expect(findTime("8:00 or 10:00")).toBeNull();
    expect(findTime("no time here")).toBeNull();
  });
});

describe("suggestFromNotice", () => {
  it("suggests a deadline for homework messages, with a short title from the first line", () => {
    const s = suggestFromNotice("数据结构作业3\n请于10月25日23:59前提交到学习通", today);
    expect(s).toEqual({ dates: [{ date: "2026-10-25", text: "10月25日" }], time: "23:59", kind: "deadline", title: "数据结构作业3" });
  });
  it("suggests an event otherwise", () => {
    expect(suggestFromNotice("班会 下周三 晚上7点 A1503", today).kind).toBe("event");
  });
});
