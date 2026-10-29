import { describe, expect, it } from "vitest";
import { mergeItems, splitPlan } from "./day-plan";

describe("splitPlan", () => {
  it("splits lines and sentences in English, Chinese and Indonesian", () => {
    expect(splitPlan("Gym at 7. Finish stats homework! Call home?\n交统计作业。去超市；\nbeli sabun dan beras")).toEqual([
      "Gym at 7",
      "Finish stats homework!",
      "Call home?",
      "交统计作业",
      "去超市",
      "beli sabun dan beras",
    ]);
  });
  it("drops bullets, numbers and empty bits", () => {
    expect(splitPlan("- buy milk\n2) laundry\n\n• 3.5 km run")).toEqual(["buy milk", "laundry", "3.5 km run"]);
  });
});

describe("mergeItems", () => {
  it("keeps ticks for unchanged items after editing", () => {
    expect(mergeItems([{ text: "Gym", done: true }, { text: "Stats", done: false }], ["Gym", "Stats homework", "Laundry"])).toEqual([
      { text: "Gym", done: true },
      { text: "Stats homework", done: false },
      { text: "Laundry", done: false },
    ]);
  });
});
