"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_COOKIE, DEMO_COOKIE_HOURS, isDemoMode } from "@/lib/demo";
import { secureCookies } from "@/lib/supabase/cookies";
import { ACCOUNT_LIMIT, IP_LIMIT, clientIp, lockedMessage, lockoutKeys, wrongPasswordMessage } from "@/lib/login-lockout";
import { createClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginState = { error: string | null };

type LockResult = { locked_seconds: number; tries_left: number };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your email and password." };
  }
  if (isDemoMode()) return { error: "This is the demo: use Try the demo." };

  const keys = lockoutKeys(parsed.data.email, clientIp(await headers()));
  const supabase = await createClient();

  // 1. Is this connection paused after too many wrong attempts?
  const guards = await Promise.all([
    supabase.rpc("login_guard", { p_key: keys.account }),
    supabase.rpc("login_guard", { p_key: keys.ip }),
  ]);
  const guardError = guards.find((g) => g.error)?.error;
  if (guardError) {
    // Fail open: a lockout bug must never lock the owner out. Sign-in below still
    // needs the right password, and Supabase has its own rate limits.
    console.error("login_guard failed", guardError);
  } else {
    const waitSeconds = Math.max(...guards.map((g) => Number(g.data ?? 0)));
    if (waitSeconds > 0) return { error: lockedMessage(waitSeconds) };
  }

  // 2. Sign in.
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // status 0 / AuthRetryableFetchError = the request never reached Supabase
    // (offline, VPN or DNS trouble), which is not a wrong password.
    if (error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500) {
      return { error: "Can't reach the database right now (connection, VPN or DNS problem). Your password is fine; try again in a moment." };
    }
    if (error.status === 429) {
      return { error: "Too many sign-in attempts right now. Wait a few minutes and try again." };
    }
    // Right password, but the account's email isn't confirmed yet: not a failed attempt.
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first: open the link we sent you (check spam too), then sign in." };
    }

    // Wrong email or password. Supabase doesn't say which, and neither do we.
    const records = await Promise.all([
      supabase.rpc("login_record", { p_key: keys.account, p_success: false, p_limit: ACCOUNT_LIMIT }),
      supabase.rpc("login_record", { p_key: keys.ip, p_success: false, p_limit: IP_LIMIT }),
    ]);
    if (records.some((r) => r.error)) {
      console.error("login_record failed", records.find((r) => r.error)?.error);
      return { error: "Email or password is incorrect." };
    }
    const results = records.map((r) => r.data as LockResult);
    const lockedSeconds = Math.max(...results.map((r) => r.locked_seconds));
    if (lockedSeconds > 0) return { error: lockedMessage(lockedSeconds) };
    return { error: wrongPasswordMessage(Math.min(...results.map((r) => r.tries_left))) };
  }

  // 3. Signed in: clear the counters for this connection.
  const cleared = await Promise.all([
    supabase.rpc("login_record", { p_key: keys.account, p_success: true, p_limit: ACCOUNT_LIMIT }),
    supabase.rpc("login_record", { p_key: keys.ip, p_success: true, p_limit: IP_LIMIT }),
  ]);
  if (cleared.some((r) => r.error)) console.error("clearing login_attempts failed", cleared.find((r) => r.error)?.error);

  redirect("/");
}

/** "Try the demo": a fresh sandbox of made-up data, just for this visitor. */
export async function demoLogin(): Promise<LoginState> {
  if (!isDemoMode()) return { error: "This site has no demo." };
  try {
    const { createSandbox, getDemoDb } = await import("@/lib/demo-db/db");
    const userId = await createSandbox(await getDemoDb());
    const secure = secureCookies((await headers()).get("host"));
    (await cookies()).set(DEMO_COOKIE, userId, { path: "/", httpOnly: true, secure, sameSite: "lax", maxAge: DEMO_COOKIE_HOURS * 3600 });
  } catch (error) {
    console.error("demo login failed", error);
    return { error: "The demo couldn't start. Try again." };
  }
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
