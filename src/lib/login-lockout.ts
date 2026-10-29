// Pure helpers for the sign-in lockout (database side: migration 0009).
// Attempts are counted per SHA-256 fingerprint, never the raw email or IP:
//   - email + IP: 5 wrong passwords in 15 minutes locks that connection for 15 minutes
//   - IP alone:  20 wrong attempts (any email) in 15 minutes locks that connection
// Counting per connection means someone attacking from elsewhere can't lock you out.

import { createHash } from "node:crypto";

export const ACCOUNT_LIMIT = 5;
export const IP_LIMIT = 20;

/** The visitor's IP as Netlify reports it; "local" when running on a laptop. */
export function clientIp(headers: Pick<Headers, "get">): string {
  const netlify = headers.get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function lockoutKeys(email: string, ip: string) {
  return {
    account: sha256(`account|${email.trim().toLowerCase()}|${ip}`),
    ip: sha256(`ip|${ip}`),
  };
}

export function lockedMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many wrong attempts. For your safety, sign-in is paused for ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export function wrongPasswordMessage(triesLeft: number): string {
  if (triesLeft <= 0) return lockedMessage(15 * 60);
  if (triesLeft <= 2) {
    return `Email or password is incorrect. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left before a 15-minute pause.`;
  }
  return "Email or password is incorrect.";
}
