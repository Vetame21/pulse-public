import { describe, expect, it } from "vitest";
import { DEMO_COOKIE_HOURS, isDemoMode } from "./demo";
import { SANDBOX_HOURS } from "./demo-db/db";

describe("demo mode", () => {
  it("is on only with PULSE_DEMO=1", () => {
    expect(isDemoMode({ PULSE_DEMO: "1" })).toBe(true);
    expect(isDemoMode({ PULSE_DEMO: "true" })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });

  it("keeps a sandbox at least as long as its cookie lasts", () => {
    expect(SANDBOX_HOURS).toBeGreaterThanOrEqual(DEMO_COOKIE_HOURS);
  });
});
