import type { CookieOptions } from "@supabase/ssr";

/**
 * Session cookies are only ever used by this app's server (the browser never
 * talks to Supabase), so they can be locked down:
 * - httpOnly: page scripts can't read them, so even an injected script can't steal the session
 * - secure (in production): only sent over HTTPS; see secureCookies
 * - sameSite=lax: not sent on cross-site form posts
 */
export function hardenCookie(options: CookieOptions = {}, secure = process.env.NODE_ENV === "production"): CookieOptions {
  return { ...options, path: options.path ?? "/", httpOnly: true, secure, sameSite: "lax" };
}

/**
 * HTTPS-only cookies in production, except on this computer's own localhost:
 * Safari drops Secure cookies over http://localhost, which signs you out on every
 * click when testing a production build (`npm start`). Localhost never leaves the machine.
 */
export function secureCookies(host: string | null, production = process.env.NODE_ENV === "production"): boolean {
  const hostname = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  return production && !["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}
