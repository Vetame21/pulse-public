import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "./csv";

describe("csvField", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvField("lunch, dinner")).toBe('"lunch, dinner"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("火锅")).toBe("火锅");
    expect(csvField(null)).toBe("");
  });

  it("neutralises formulas in text but not in numbers", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-cheap")).toBe("'-cheap");
    expect(csvField(-32.5, { text: false })).toBe("-32.5");
  });
});

describe("toCsv", () => {
  it("starts with a BOM and uses CRLF", () => {
    const csv = toCsv(["Date", "Amount RMB"], [["2026-08-29", -30]], new Set([1]));
    expect(csv).toBe("﻿Date,Amount RMB\r\n2026-08-29,-30\r\n");
  });
});
