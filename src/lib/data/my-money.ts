import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "@/lib/dates";
import { type BalanceCheck, type MoneyEvent, runningBalance } from "@/lib/my-money";
import type { Settings } from "./settings";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Read every matching row, 1000 at a time (Supabase's per-request limit). */
async function paged(
  make: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(`Couldn't load account activity: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export type MoneyAccount = { id: string; name: string; currency: "CNY" | "HKD"; isMain: boolean; sortOrder: number };

/** Your home currency (read only when accounts must be created). */
async function accountDefaults(supabase: SupabaseClient): Promise<{ home: "CNY" | "HKD" }> {
  const { data } = await supabase.from("settings").select("home_currency").maybeSingle();
  return { home: data?.home_currency === "HKD" ? "HKD" : "CNY" };
}
export type CheckRow = { id: string; accountId: string; balanceMinor: number; checkedAt: string; note: string | null };

/**
 * Your accounts, creating a main account in your home currency the first time.
 * Always returns a list that contains exactly one main account.
 */
export async function ensureAccounts(supabase: SupabaseClient): Promise<MoneyAccount[]> {
  const load = async () => {
    const { data, error } = await supabase
      .from("money_accounts")
      .select("id, name, currency, is_main, sort_order")
      .eq("archived", false)
      .order("sort_order");
    if (error || !data) throw new Error(`Couldn't load accounts: ${error?.message}`);
    return data.map((a) => ({ id: a.id, name: a.name, currency: a.currency, isMain: a.is_main, sortOrder: a.sort_order }) as MoneyAccount);
  };

  let accounts = await load();
  if (accounts.length === 0) {
    const { home } = await accountDefaults(supabase);
    const { error } = await supabase.from("money_accounts").insert([{ name: "Main account", currency: home, is_main: true, sort_order: 0 }]);
    // 23505: another request created them at the same moment.
    if (error && error.code !== "23505") throw new Error(`Couldn't create accounts: ${error.message}`);
    accounts = await load();
  }
  if (!accounts.some((a) => a.isMain)) {
    // No main account (e.g. it was archived): make the first home-currency account main, or create one.
    const { home } = await accountDefaults(supabase);
    const candidate = accounts.find((a) => a.currency === home);
    const { error } = candidate
      ? await supabase.from("money_accounts").update({ is_main: true }).eq("id", candidate.id)
      : await supabase.from("money_accounts").insert({ name: "Main account", currency: home, is_main: true, sort_order: 0 });
    if (error && error.code !== "23505") throw new Error(`Couldn't set the main account: ${error.message}`);
    accounts = await load();
  }
  if (!accounts.some((a) => a.isMain)) throw new Error("Couldn't find your main account. Reload the page.");
  return accounts;
}

export async function latestChecks(supabase: SupabaseClient, accountIds: string[]): Promise<Map<string, CheckRow>> {
  const result = new Map<string, CheckRow>();
  if (accountIds.length === 0) return result;
  const { data, error } = await supabase
    .from("balance_checks")
    .select("id, account_id, balance_minor, checked_at, note")
    .in("account_id", accountIds)
    .order("checked_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Couldn't load balances: ${error.message}`);
  for (const c of data) {
    if (!result.has(c.account_id)) {
      result.set(c.account_id, {
        id: c.id,
        accountId: c.account_id,
        balanceMinor: Number(c.balance_minor),
        checkedAt: c.checked_at,
        note: c.note,
      });
    }
  }
  return result;
}

export async function checkHistory(supabase: SupabaseClient, accountId: string, limit = 10): Promise<CheckRow[]> {
  const { data, error } = await supabase
    .from("balance_checks")
    .select("id, account_id, balance_minor, checked_at, note")
    .eq("account_id", accountId)
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load balance history: ${error.message}`);
  return data.map((c) => ({ id: c.id, accountId: c.account_id, balanceMinor: Number(c.balance_minor), checkedAt: c.checked_at, note: c.note }));
}

/**
 * Everything that moved money in or out of an account on or after a date.
 * Every account: expenses paid from it (bank-paid, not cash or someone else's money),
 * money in, and transfers. The main account also carries expenses with no
 * account set (all older ones, restaurant top-ups, Savings Box purchases), rent,
 * paid utility bills and Family Money.
 */
export async function accountEvents(supabase: SupabaseClient, accountId: string, isMain: boolean, sinceDate: string): Promise<MoneyEvent[]> {
  const none = Promise.resolve([] as never[]);
  const [expenses, rent, utilities, family, income, transfers] = await Promise.all([
    paged((a, b) => {
      const q = supabase
        .from("personal_expenses")
        .select("id, txn_date, amount_fen, kind, note, created_at")
        .neq("paid_with", "cash")
        .neq("funded_by", "other")
        .gte("txn_date", sinceDate);
      return (isMain ? q.or(`paid_from_account.is.null,paid_from_account.eq.${accountId}`) : q.eq("paid_from_account", accountId)).order("id").range(a, b);
    }),
    isMain ? paged((a, b) => supabase.from("bill_payments").select("id, month, paid_date, amount_fen, created_at").gte("paid_date", sinceDate).order("id").range(a, b)) : none,
    isMain ? paged((a, b) => supabase.from("utility_bills").select("id, paid_date, total_fen, updated_at").gte("paid_date", sinceDate).order("id").range(a, b)) : none,
    isMain ? paged((a, b) => supabase.from("family_transactions").select("id, txn_date, kind, amount_fen, person, from_person, created_at").neq("kind", "kept").gte("txn_date", sinceDate).order("id").range(a, b)) : none,
    paged((a, b) => supabase.from("income_transactions").select("id, txn_date, amount_fen, source, created_at").eq("account_id", accountId).gte("txn_date", sinceDate).order("id").range(a, b)),
    paged((a, b) =>
      supabase
        .from("account_transfers")
        .select("id, from_account, to_account, txn_date, amount_fen, note, created_at")
        .or(`from_account.eq.${accountId},to_account.eq.${accountId}`)
        .gte("txn_date", sinceDate)
        .order("id")
        .range(a, b),
    ),
  ]);

  const events: MoneyEvent[] = [];
  for (const e of expenses) {
    const refund = e.kind === "refund";
    events.push({
      key: `e-${e.id}`,
      date: e.txn_date,
      recordedAt: e.created_at,
      deltaFen: refund ? Number(e.amount_fen) : -Number(e.amount_fen),
      label: e.note || (refund ? "Refund" : "Expense"),
      kind: refund ? "refund" : "expense",
    });
  }
  for (const p of rent) {
    events.push({ key: `r-${p.id}`, date: p.paid_date, recordedAt: p.created_at, deltaFen: -Number(p.amount_fen), label: `Rent ${String(p.month).slice(0, 7)}`, kind: "rent" });
  }
  for (const u of utilities) {
    if (!u.paid_date) continue;
    events.push({ key: `u-${u.id}`, date: u.paid_date, recordedAt: u.updated_at, deltaFen: -Number(u.total_fen), label: "Electricity + water", kind: "utilities" });
  }
  for (const m of family) {
    const received = m.kind === "received";
    events.push({
      key: `m-${m.id}`,
      date: m.txn_date,
      recordedAt: m.created_at,
      deltaFen: received ? Number(m.amount_fen) : -Number(m.amount_fen),
      label: received ? `${m.from_person} sent` : `Paid ${m.person ?? `for ${m.from_person}`}`,
      kind: received ? "family_in" : "family_out",
    });
  }
  for (const i of income) {
    events.push({ key: `i-${i.id}`, date: i.txn_date, recordedAt: i.created_at, deltaFen: Number(i.amount_fen), label: i.source || "Money in", kind: "income" });
  }
  for (const t of transfers) {
    const out = t.from_account === accountId;
    events.push({
      key: `t-${t.id}`,
      date: t.txn_date,
      recordedAt: t.created_at,
      deltaFen: out ? -Number(t.amount_fen) : Number(t.amount_fen),
      label: t.note || (out ? "Moved out" : "Moved in"),
      kind: out ? "transfer_out" : "transfer_in",
    });
  }
  return events;
}

/** Calendar date of a timestamp in your timezone. */
export function dateInZone(iso: string, timezone: string): string {
  return todayIn(timezone, new Date(iso));
}

/** An RMB account's current balance: last check + everything recorded after it. Null if never checked. */
export async function accountBalance(supabase: SupabaseClient, settings: Settings, account: MoneyAccount, check: CheckRow | undefined) {
  if (!check) return null;
  const bc: BalanceCheck = { balanceFen: check.balanceMinor, checkedAt: check.checkedAt, checkDate: dateInZone(check.checkedAt, settings.timezone) };
  const events = await accountEvents(supabase, account.id, account.isMain, bc.checkDate);
  return { check: bc, ...runningBalance(bc, events) };
}

/** Current main account balance. */
export const mainAccountBalance = accountBalance;

/** Home-currency accounts you can pay from, main account first (for the expense form). */
export async function payAccounts(supabase: SupabaseClient, home: "CNY" | "HKD") {
  const accounts = await ensureAccounts(supabase);
  return accounts
    .filter((a) => a.currency === home)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder)
    .map((a) => ({ id: a.id, name: a.name, isMain: a.isMain }));
}
