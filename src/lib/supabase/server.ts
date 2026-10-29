import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { DEMO_COOKIE, isDemoMode } from "@/lib/demo";
import { hardenCookie, secureCookies } from "./cookies";
import { getSupabaseEnv } from "./env";

/**
 * Next.js deduplicates identical GET fetches during a render (and, in dev, keeps
 * them across hot reloads). For a database that's wrong: reading a row right
 * after creating it would return the earlier, empty answer. Giving every
 * request its own AbortSignal opts out (see next/dist/docs …/functions/fetch.md).
 */
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// All database access happens on the server. The browser only ever talks to
// this app's own domain, never to supabase.co directly.
export async function createClient(): Promise<ReturnType<typeof supabaseClient>> {
  const cookieStore = await cookies();
  const secure = secureCookies((await headers()).get("host"));
  if (isDemoMode()) {
    // Demo mode: the same client shape, backed by in-memory Postgres (lib/demo-db).
    const [{ getDemoDb }, { createDemoClient }] = await Promise.all([import("@/lib/demo-db/db"), import("@/lib/demo-db/client")]);
    const endSession = () => {
      try {
        cookieStore.delete(DEMO_COOKIE);
      } catch {
        // Read-only in Server Components; sign-out runs in a server action.
      }
    };
    const client = createDemoClient(await getDemoDb(), cookieStore.get(DEMO_COOKIE)?.value ?? null, endSession);
    return client as unknown as ReturnType<typeof supabaseClient>;
  }
  return supabaseClient(cookieStore, secure);
}

function supabaseClient(cookieStore: CookieStore, secure: boolean) {
  const { url, key } = getSupabaseEnv();
  return createServerClient(url, key, {
    global: { fetch: freshFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, hardenCookie(options, secure)),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
