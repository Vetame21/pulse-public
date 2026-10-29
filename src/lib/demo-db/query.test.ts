import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDemoClient, execAs } from "./client";
import { createDemoDb, ensureSandbox } from "./db";
import { Query, logicToSql } from "./query";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
let db: PGlite;
const as = (user: string | null) => createDemoClient(db, user, () => {});

beforeAll(async () => {
  db = await createDemoDb();
  await ensureSandbox(db, A);
  await ensureSandbox(db, B);
}, 60_000);

describe("filters", () => {
  it("turns PostgREST or()/and() text into SQL", () => {
    const params: unknown[] = [];
    const sql = logicToSql("end_date.gte.2026-10-01,and(end_date.is.null,date.gte.2026-10-01)", "or", (c) => c, (v) => `$${params.push(v)}`);
    expect(sql).toBe("end_date >= $1 or (end_date is null and date >= $2)");
    expect(params).toEqual(["2026-10-01", "2026-10-01"]);
  });

  it("refuses names that aren't plain columns", () => {
    expect(() => new Query("settings; drop table x", async () => [])).toThrow();
    expect(() => new Query("settings", async () => []).eq("id = id or true", 1)).toThrow();
  });
});

describe("demo database", () => {
  it("returns rows shaped like Supabase's (dates as strings, money as numbers)", async () => {
    const { data, error } = await as(A).from("personal_expenses").select("txn_date, amount_fen, category").order("txn_date", { ascending: false }).range(0, 2);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data[0].txn_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof data[0].amount_fen).toBe("number");
    expect(data[0].txn_date >= data[1].txn_date).toBe(true);
  });

  it("shows each visitor only their own rows (Row Level Security)", async () => {
    const mine = await as(A).from("money_accounts").select("id");
    const all = await db.query<{ n: number }>("select count(*)::int as n from public.money_accounts");
    expect(mine.data).toHaveLength(3);
    expect(all.rows[0].n).toBe(6); // A's three and B's three
    expect((await as(null).from("money_accounts").select("id")).error?.code).toBe("42501"); // signed out: no access at all
  });

  it("inserts with database defaults and reports duplicates like Supabase", async () => {
    const id = crypto.randomUUID();
    const row = { id, txn_date: "2026-10-05", amount_fen: 1234, category: "food", note: "Test lunch" };
    const { data, error } = await as(A).from("personal_expenses").insert(row).select("id, user_id, kind").single();
    expect(error).toBeNull();
    expect(data).toEqual({ id, user_id: A, kind: "expense" });
    expect((await as(A).from("personal_expenses").insert(row)).error?.code).toBe("23505");
  });

  it("can't write rows for someone else", async () => {
    const { error } = await as(A).from("notices").insert({ body: "Sneaky", user_id: B });
    expect(error?.code).toBe("42501");
  });

  it("upserts on a conflict target, or ignores duplicates", async () => {
    const plan = { user_id: A, date: "2030-01-01", body: "First", items: [] };
    await as(A).from("day_plans").upsert(plan, { onConflict: "user_id,date" });
    await as(A).from("day_plans").upsert({ ...plan, body: "Second" }, { onConflict: "user_id,date" });
    await as(A).from("day_plans").upsert({ ...plan, body: "Ignored" }, { onConflict: "user_id,date", ignoreDuplicates: true });
    const { data } = await as(A).from("day_plans").select("body, items").eq("date", "2030-01-01").maybeSingle();
    expect(data).toEqual({ body: "Second", items: [] });
  });

  it("updates and deletes only matching rows", async () => {
    const { data: n } = await as(A).from("notices").insert({ body: "Old text" }).select("id").single();
    await as(A).from("notices").update({ body: "New text", pinned: true }).eq("id", n.id);
    expect((await as(A).from("notices").select("body, pinned").eq("id", n.id).single()).data).toEqual({ body: "New text", pinned: true });
    await as(B).from("notices").delete().eq("id", n.id); // not B's: nothing happens
    expect((await as(A).from("notices").select("id").eq("id", n.id).maybeSingle()).data).not.toBeNull();
    await as(A).from("notices").delete().eq("id", n.id);
    expect((await as(A).from("notices").select("id").eq("id", n.id).maybeSingle()).data).toBeNull();
  });

  it("supports in, is, ilike, or and head counts", async () => {
    const c = as(A);
    expect((await c.from("personal_expenses").select("id").in("category", ["travel"]).eq("currency", "HKD")).data).toHaveLength(1);
    expect((await c.from("calendar_events").select("id").is("done_at", null)).data.length).toBeGreaterThan(0);
    expect((await c.from("personal_expenses").select("note").ilike("note", "%ferry%")).data).toEqual([{ note: "Ferry ticket" }]);
    expect((await c.from("money_accounts").select("id").or("name.eq.Alipay,name.eq.WeChat Pay")).data).toHaveLength(2);
    expect((await c.from("money_accounts").select("id", { head: true, count: "exact" })).count).toBe(3);
  });

  it("single() needs exactly one row", async () => {
    expect((await as(A).from("money_accounts").select("id").single()).error?.code).toBe("PGRST116");
  });

  it("keeps the database rules: the Savings Box can't go below zero", async () => {
    const { error } = await as(A).from("savings_transactions").insert({ txn_date: "2026-10-01", amount_fen: -99_999_999, kind: "withdrawal" });
    expect(error?.message).toMatch(/SAVINGS_NEGATIVE/);
  });

  it("calls database functions with named arguments", async () => {
    expect((await as(A).rpc("take_ai_quota", { p_kind: "test", p_limit: 1 })).data).toBe(true);
    expect((await as(A).rpc("take_ai_quota", { p_kind: "test", p_limit: 1 })).data).toBe(false);
    expect((await as(A).rpc("no_such_function")).error).not.toBeNull();
  });

  it("knows who is signed in, and gives a returning visitor fresh data on a new server", async () => {
    const C = crypto.randomUUID();
    const { data } = await as(C).auth.getClaims();
    expect(data?.claims.sub).toBe(C);
    expect((await as(C).from("money_accounts").select("id")).data).toHaveLength(3);
    expect((await as(null).auth.getClaims()).data).toBeNull();
  });

  it("runs every statement as the signed-in user", async () => {
    const [row] = await execAs(db, A)("select current_user as role, auth.uid() as uid", []);
    expect(row).toEqual({ role: "authenticated", uid: A });
  });
});
