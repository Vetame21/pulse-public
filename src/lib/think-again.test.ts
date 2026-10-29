import { describe, expect, it } from "vitest";
import { type WaitItem, daysLeft, groupItems, savedBySkipping } from "./think-again";

const item = (id: string, decideAfter: string, status: WaitItem["status"] = "waiting", priceFen = 10000): WaitItem => ({
  id,
  priceFen,
  addedOn: "2026-10-01",
  decideAfter,
  status,
});

describe("Think Again", () => {
  it("counts days left until you can decide", () => {
    expect(daysLeft(item("a", "2026-10-15"), "2026-10-12")).toBe(3);
    expect(daysLeft(item("a", "2026-10-12"), "2026-10-12")).toBe(0);
    expect(daysLeft(item("a", "2026-10-08"), "2026-10-12")).toBe(-4);
  });

  it("groups ready, waiting and decided items", () => {
    const g = groupItems(
      [item("phone", "2026-10-08"), item("lego", "2026-10-20"), item("bag", "2026-10-12"), item("old", "2026-10-01", "skipped")],
      "2026-10-12",
    );
    expect(g.ready.map((i) => i.id)).toEqual(["phone", "bag"]);
    expect(g.waiting.map((i) => i.id)).toEqual(["lego"]);
    expect(g.decided.map((i) => i.id)).toEqual(["old"]);
  });

  it("adds up money saved by skipping", () => {
    expect(savedBySkipping([item("a", "x", "skipped", 99900), item("b", "x", "bought", 5000), item("c", "x", "skipped", 100)])).toBe(100000);
  });
});
