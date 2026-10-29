// A stand-in for the Supabase server client in demo mode. Every query runs in its
// own transaction as the "authenticated" role with the visitor's user id set, so
// Row Level Security decides what each visitor can see, exactly as on Supabase.

import type { PGlite } from "@electric-sql/pglite";
import { ensureSandbox } from "./db";
import { type Exec, Query, rpc } from "./query";

export function execAs(db: PGlite, userId: string | null): Exec {
  return (sql, params) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
      await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
      return (await tx.query<Record<string, unknown>>(sql, params)).rows;
    });
}

const notInDemo = async () => ({ data: { user: null, session: null }, error: { message: "Not available in the demo.", status: 400, code: "demo" } });

export function createDemoClient(db: PGlite, userId: string | null, endSession: () => void) {
  const exec = execAs(db, userId);
  return {
    from: (table: string) => new Query(table, exec),
    rpc: (name: string, args?: Record<string, unknown>) => rpc(exec, name, args),
    auth: {
      async getClaims() {
        if (!userId) return { data: null, error: { message: "Not signed in." } };
        const { email } = await ensureSandbox(db, userId);
        return { data: { claims: { sub: userId, email } }, error: null };
      },
      async signOut() {
        endSession();
        return { error: null };
      },
      signInWithPassword: notInDemo,
      signUp: notInDemo,
      exchangeCodeForSession: notInDemo,
      verifyOtp: notInDemo,
    },
  };
}
