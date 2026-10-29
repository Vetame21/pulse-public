// Demo mode (PULSE_DEMO=1): no Supabase at all. The app runs real Postgres in memory
// (see lib/demo-db), each visitor gets their own sandbox with made-up data, the
// login page only offers "Try the demo", and things that cost money or need real
// accounts (AI photo reading, restoring backups, sign-up) are off.

export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.PULSE_DEMO === "1";
}

/** The visitor's sandbox id. Random and unguessable; it only unlocks made-up data. */
export const DEMO_COOKIE = "pulse-demo";
export const DEMO_COOKIE_HOURS = 12;

export const DEMO_BLOCKED = "This is turned off in the demo. Run your own copy to try it.";
