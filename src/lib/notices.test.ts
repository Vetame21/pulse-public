import { describe, expect, it } from "vitest";
import { type Notice, isArchived, noticesForToday } from "./notices";

const n = (id: string, extra: Partial<Notice> = {}): Notice => ({
  id, body: id, source: null, pinned: false, relatedDate: null, linkedEventId: null, archived: false, createdDate: "2026-10-17", ...extra,
});
const today = "2026-10-17";

describe("isArchived", () => {
  it("archives after the day it's about", () => {
    expect(isArchived(n("a", { relatedDate: "2026-10-16" }), today)).toBe(true);
    expect(isArchived(n("a", { relatedDate: "2026-10-17" }), today)).toBe(false);
  });
  it("archives undated notices after 14 days", () => {
    expect(isArchived(n("a", { createdDate: "2026-10-03" }), today)).toBe(false);
    expect(isArchived(n("a", { createdDate: "2026-10-02" }), today)).toBe(true);
  });
  it("never auto-archives pinned ones, but respects archiving by hand", () => {
    expect(isArchived(n("a", { pinned: true, createdDate: "2026-01-01" }), today)).toBe(false);
    expect(isArchived(n("a", { archived: true, pinned: true }), today)).toBe(true);
  });
});

describe("noticesForToday", () => {
  it("shows pinned first, then the last 2 days, at most 3", () => {
    const list = [
      n("old", { createdDate: "2026-10-10" }),
      n("yesterday", { createdDate: "2026-10-16" }),
      n("today", { createdDate: "2026-10-17" }),
      n("pinned", { pinned: true, createdDate: "2026-10-01" }),
      n("gone", { archived: true }),
    ];
    expect(noticesForToday(list, today).map((x) => x.id)).toEqual(["pinned", "today", "yesterday"]);
  });
});
