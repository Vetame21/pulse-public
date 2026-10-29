import { describe, expect, it } from "vitest";
import { formatMinor, parseMinor, parseRate, suggestRate, toFen } from "./currency";

describe("parseMinor", () => {
  it("reads amounts in each currency's smallest unit", () => {
    expect(parseMinor("120", "HKD")).toBe(12000);
    expect(parseMinor("120.5", "HKD")).toBe(12050);
    expect(parseMinor("1,250.75", "HKD")).toBe(125075);
    expect(parseMinor("15000", "IDR")).toBe(15000);
    expect(parseMinor("980", "JPY")).toBe(980);
    expect(parseMinor("15.000", "IDR")).toBe(15000);
    expect(parseMinor("120,5", "HKD")).toBe(12050); // decimal comma from the phone keypad
  });
  it("rejects invalid amounts", () => {
    expect(parseMinor("0", "HKD")).toBeNull();
    expect(parseMinor("12.345", "HKD")).toBeNull();
    expect(parseMinor("12.5", "IDR")).toBeNull();
    expect(parseMinor("abc", "HKD")).toBeNull();
  });
});

describe("conversion and formatting", () => {
  it("converts to yuan fen, rounded", () => {
    expect(toFen(12000, "HKD", 0.852)).toBe(10224); // HK$120 → ¥102.24
    expect(toFen(15000, "IDR", 1 / 2697)).toBe(556); // Rp15,000 → ¥5.56
  });
  it("formats with the right symbol and decimals", () => {
    expect(formatMinor(12000, "HKD")).toBe("HK$120");
    expect(formatMinor(12050, "HKD")).toBe("HK$120.50");
    expect(formatMinor(15000, "IDR")).toBe("Rp15,000");
  });
  it("accepts sensible rates only", () => {
    expect(parseRate("0.852")).toBe(0.852);
    expect(parseRate("0")).toBeNull();
    expect(parseRate("x")).toBeNull();
  });
});

describe("suggestRate", () => {
  it("prefers your own recent rate, then the ECB rate", () => {
    expect(suggestRate({ rate: 0.86, date: "2026-11-01" }, 0.852, "2026-11-10")).toEqual({ rate: 0.86, source: "last" });
    expect(suggestRate({ rate: 0.86, date: "2026-08-01" }, 0.852, "2026-11-10")).toEqual({ rate: 0.852, source: "ecb" });
    expect(suggestRate(null, null, "2026-11-10")).toBeNull();
  });
});
