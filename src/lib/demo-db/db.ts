// Demo mode's database: real Postgres (PGlite, compiled to WebAssembly) running
// inside the app's server, in memory. It loads the same schema as Supabase and the
// demo seed, so Row Level Security and every database rule work as they do in
// production. Nothing is saved: a server restart starts from fresh demo data.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// What Supabase provides before our schema runs: the API roles, a minimal auth
// schema (auth.uid() reads the user id the adapter sets per query) and the default
// grants that the schema's revokes assume.
const SUPABASE_STANDIN = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

/** Demo sandboxes older than this are deleted (with all their rows) when a new one starts. */
export const SANDBOX_HOURS = 12;

const sql = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** A fresh database with the schema and the demo seed function loaded. */
export async function createDemoDb(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STANDIN);
  await db.exec(sql("supabase/migrations/0001_schema.sql"));
  await db.exec(sql("supabase/demo/seed.sql"));
  return db;
}

// One database per server process, created on first use.
let shared: Promise<PGlite> | null = null;
export function getDemoDb(): Promise<PGlite> {
  shared ??= createDemoDb().catch((error) => {
    shared = null; // let the next request try again
    throw error;
  });
  return shared;
}

const emailFor = (userId: string) => `demo-${userId.slice(0, 8)}@example.com`;

/** A new visitor's own demo user, filled with made-up data. Clears out old sandboxes. */
export async function createSandbox(db: PGlite): Promise<string> {
  const userId = crypto.randomUUID();
  await db.query(`delete from auth.users where created_at < now() - make_interval(hours => $1)`, [SANDBOX_HOURS]);
  await ensureSandbox(db, userId);
  return userId;
}

/**
 * Make sure this visitor's sandbox exists. A visitor can arrive at a server that
 * never saw them (a restart, or another instance): they get fresh demo data.
 */
export async function ensureSandbox(db: PGlite, userId: string): Promise<{ email: string }> {
  const email = emailFor(userId);
  const inserted = await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing returning id`, [userId, email]);
  if (inserted.rows.length > 0) await db.query(`select public.reset_demo($1)`, [email]);
  return { email };
}
