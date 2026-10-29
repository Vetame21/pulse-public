import { describe, expect, it } from "vitest";
import { fenToDecimal, formatRMB, normalizeDecimal, parseYuan, percentChange, roundDiv } from "./money";

describe("parseYuan", () => {
  it("parses amounts into integer fen", () => {
    expect(parseYuan("12")).toBe(1200);
    expect(parseYuan("12.5")).toBe(1250);
    expect(parseYuan("10.10")).toBe(1010);
    expect(parseYuan("¥1,234.56")).toBe(123456);
    expect(parseYuan(" 0.01 ")).toBe(1);
    expect(parseYuan("12.")).toBe(1200);
  });

  it("rejects invalid input", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12..3", "¥", ".5"]) {
      expect(parseYuan(bad)).toBeNull();
    }
  });
});

describe("fen arithmetic is exact", () => {
  it("¥10.10 + ¥20.20 = ¥30.30", () => {
    const sum = parseYuan("10.10")! + parseYuan("20.20")!;
    expect(sum).toBe(3030);
    expect(formatRMB(sum)).toBe("¥30.30");
    // The float version this avoids:
    expect(10.1 + 20.2).not.toBe(30.3);
  });
});

describe("formatRMB", () => {
  it("formats fen", () => {
    expect(formatRMB(186000)).toBe("¥1,860");
    expect(formatRMB(3265)).toBe("¥32.65");
    expect(formatRMB(3260)).toBe("¥32.60");
    expect(formatRMB(105667)).toBe("¥1,056.67");
    expect(formatRMB(0)).toBe("¥0");
    expect(formatRMB(-20000)).toBe("-¥200");
    expect(formatRMB(29000, { sign: true })).toBe("+¥290");
    expect(formatRMB(200000, { alwaysDecimals: true })).toBe("¥2,000.00");
  });

  it("refuses non-integer fen", () => {
    expect(() => formatRMB(10.5)).toThrow();
  });
});

describe("roundDiv and percentChange", () => {
  it("rounds half away from zero", () => {
    expect(roundDiv(32000, 3)).toBe(10667);
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(() => roundDiv(1, 0)).toThrow();
  });

  it("computes percentages", () => {
    expect(percentChange(27000, 32000)).toBe(18.5);
    expect(percentChange(119000, 123700)).toBe(3.9);
    expect(percentChange(0, 100)).toBeNull();
  });
});

describe("fenToDecimal", () => {
  it("writes exact decimals for files", () => {
    expect(fenToDecimal(1010)).toBe("10.10");
    expect(fenToDecimal(-3250)).toBe("-32.50");
    expect(fenToDecimal(5)).toBe("0.05");
    expect(fenToDecimal(0)).toBe("0.00");
  });
});

describe("decimal comma (phones in Indonesian and other regions)", () => {
  it("reads a comma as the decimal point unless it groups thousands", () => {
    expect(normalizeDecimal("12,5")).toBe("12.5");
    expect(normalizeDecimal("0,852")).toBe("0.852");
    expect(normalizeDecimal("1,250")).toBe("1250");
    expect(normalizeDecimal("1.250,75")).toBe("1250.75");
    expect(normalizeDecimal("1,250.75")).toBe("1250.75");
    expect(parseYuan("32,50")).toBe(3250);
    expect(parseYuan("1,250")).toBe(125000);
  });
});

describe("home currency formatting", () => {
  it("uses the account's symbol with the same rules as RMB", async () => {
    const { formatMoney, moneyFormat } = await import("./money");
    expect(formatMoney(186000, "HKD")).toBe("HK$1,860");
    expect(formatMoney(-500, "HKD")).toBe("-HK$5");
    expect(moneyFormat("CNY")(3265, { sign: true })).toBe("+¥32.65");
  });
});
