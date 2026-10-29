import { describe, expect, it } from "vitest";
import { clientIp, lockedMessage, lockoutKeys, wrongPasswordMessage } from "./login-lockout";
import { hardenCookie, secureCookies } from "./supabase/cookies";

const h = (entries: Record<string, string>) => new Headers(entries);

describe("clientIp", () => {
  it("prefers Netlify's client IP header", () => {
    expect(clientIp(h({ "x-nf-client-connection-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });
  it("falls back to the first forwarded IP, then 'local'", () => {
    expect(clientIp(h({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(h({}))).toBe("local");
  });
});

describe("lockoutKeys", () => {
  it("are 64-char hex fingerprints that ignore email case and spaces", () => {
    const a = lockoutKeys("Me@Example.com ", "1.2.3.4");
    const b = lockoutKeys("me@example.com", "1.2.3.4");
    expect(a).toEqual(b);
    expect(a.account).toMatch(/^[0-9a-f]{64}$/);
    expect(a.ip).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differ per connection, so an attacker elsewhere can't lock you out", () => {
    expect(lockoutKeys("me@example.com", "1.2.3.4").account).not.toBe(lockoutKeys("me@example.com", "5.6.7.8").account);
  });
  it("never contain the email in plain text", () => {
    expect(JSON.stringify(lockoutKeys("me@example.com", "1.2.3.4"))).not.toContain("example");
  });
});

describe("messages", () => {
  it("rounds lock time up to whole minutes", () => {
    expect(lockedMessage(900)).toContain("15 minutes");
    expect(lockedMessage(30)).toContain("1 minute.");
  });
  it("warns only when few tries are left", () => {
    expect(wrongPasswordMessage(4)).toBe("Email or password is incorrect.");
    expect(wrongPasswordMessage(2)).toContain("2 tries left");
    expect(wrongPasswordMessage(1)).toContain("1 try left");
    expect(wrongPasswordMessage(0)).toContain("paused for 15 minutes");
  });
});

describe("hardenCookie", () => {
  it("makes session cookies HttpOnly, SameSite=Lax, and Secure in production", () => {
    expect(hardenCookie({ maxAge: 100 }, true)).toEqual({ maxAge: 100, path: "/", httpOnly: true, secure: true, sameSite: "lax" });
    expect(hardenCookie({ httpOnly: false }, false)).toMatchObject({ httpOnly: true, secure: false });
  });
});

describe("secureCookies", () => {
  it("is HTTPS-only in production on the real site", () => {
    expect(secureCookies("pulse.example.app", true)).toBe(true);
    expect(secureCookies("127.159.108.28:3000", true)).toBe(true);
    expect(secureCookies(null, true)).toBe(true);
  });
  it("lets Safari keep the session on this computer's localhost", () => {
    expect(secureCookies("localhost:3000", true)).toBe(false);
    expect(secureCookies("127.0.0.1:3000", true)).toBe(false);
    expect(secureCookies("[::1]:3000", true)).toBe(false);
  });
  it("is never HTTPS-only in development", () => {
    expect(secureCookies("pulse.example.app", false)).toBe(false);
  });
});
