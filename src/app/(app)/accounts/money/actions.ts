"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureAccounts } from "@/lib/data/my-money";
import { getSettings } from "@/lib/data/settings";
import { isValidISODate, todayIn } from "@/lib/dates";
import { moneyFormat, parseYuan } from "@/lib/money";
import type { ActionState } from "../../actions";

const OFFLINE = "Couldn't reach the database. Nothing was saved; try again.";

/** Record what an account holds right now. Everything recorded after this moment moves it. */
export async function recordBalance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const accountId = String(fd.get("accountId") ?? "");
  if (!z.uuid().safeParse(accountId).success) return { ok: false, message: "Pick an account." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    const account = (await ensureAccounts(supabase)).find((a) => a.id === accountId);
    if (!account) return { ok: false, message: "Account not found." };

    const raw = String(fd.get("amount") ?? "");
    const minor = parseYuan(raw);
    if (minor === null) return { ok: false, message: "Enter an amount like 1317 or 1317.50." };
    const now = new Date();
    const { error } = await supabase.from("balance_checks").insert({
      account_id: account.id,
      checked_on: todayIn(settings.timezone, now),
      checked_at: now.toISOString(),
      balance_minor: minor,
      note: String(fd.get("note") ?? "").trim().slice(0, 500) || null,
    });
    if (error) throw error;
    refresh();
    return { ok: true, message: `${account.name} balance saved: ${fmt(minor)}.` };
  } catch (error) {
    console.error("recordBalance failed", error);
    return { ok: false, message: OFFLINE };
  }
}

const IncomeSchema = z.object({
  id: z.uuid(),
  date: z.string().refine(isValidISODate, "Pick a valid date."),
  amount: z.string(),
  source: z.string().trim().max(100),
  note: z.string().trim().max(500),
});

/** Money coming into your main account (allowance, salary, transfers). */
export async function addIncome(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = IncomeSchema.safeParse(Object.fromEntries(["id", "date", "amount", "source", "note"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const amountFen = parseYuan(parsed.data.amount);
  if (!amountFen) return { ok: false, message: "Enter an amount like 3000." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    if (parsed.data.date > todayIn(settings.timezone)) return { ok: false, message: "That date is in the future." };
    const accounts = await ensureAccounts(supabase);
    const main = accounts.find((a) => a.isMain);
    if (!main) return { ok: false, message: "No main account set up." };
    const { error } = await supabase.from("income_transactions").insert({
      id: parsed.data.id,
      account_id: main.id,
      txn_date: parsed.data.date,
      amount_fen: amountFen,
      source: parsed.data.source || null,
      note: parsed.data.note || null,
    });
    if (error && error.code !== "23505") throw error;
    refresh();
    return { ok: true, message: `Added +${fmt(amountFen)} to ${main.name}.` };
  } catch (error) {
    console.error("addIncome failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function deleteIncome(id: string): Promise<ActionState> {
  return deleteRow("income_transactions", id);
}

export async function deleteBalanceCheck(id: string): Promise<ActionState> {
  return deleteRow("balance_checks", id);
}

async function deleteRow(table: "income_transactions" | "balance_checks", id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid entry." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error(`delete ${table} failed`, error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

export async function addAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name || name.length > 100) return { ok: false, message: "Give the account a name, e.g. Cash or WeChat." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const currency = settings.homeCurrency;
    const accounts = await ensureAccounts(supabase);
    const { error } = await supabase
      .from("money_accounts")
      .insert({ name, currency, sort_order: Math.max(0, ...accounts.map((a) => a.sortOrder)) + 1 });
    if (error) throw error;
    refresh();
    return { ok: true, message: `Added ${name}. Record its balance below.` };
  } catch (error) {
    console.error("addAccount failed", error);
    return { ok: false, message: OFFLINE };
  }
}

/** Move money between two of your accounts (e.g. top up Alipay from your bank). */
export async function addTransfer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "");
  const date = String(fd.get("date") ?? "");
  const amountFen = parseYuan(String(fd.get("amount") ?? ""));
  const note = String(fd.get("note") ?? "").trim().slice(0, 200) || null;
  if (!z.uuid().safeParse(from).success || !z.uuid().safeParse(to).success) return { ok: false, message: "Pick both accounts." };
  if (from === to) return { ok: false, message: "Pick two different accounts." };
  if (!amountFen) return { ok: false, message: "Enter an amount like 500." };
  if (!isValidISODate(date)) return { ok: false, message: "Pick a valid date." };
  try {
    const { supabase, user } = await requireUser();
    const [settings, accounts] = await Promise.all([getSettings(supabase, user.id), ensureAccounts(supabase)]);
    const fmt = moneyFormat(settings.homeCurrency);
    if (date > todayIn(settings.timezone)) return { ok: false, message: "That date is in the future." };
    const a = accounts.find((x) => x.id === from);
    const b = accounts.find((x) => x.id === to);
    if (!a || !b) return { ok: false, message: "That account no longer exists. Reload the page." };
    if (a.currency !== settings.homeCurrency || b.currency !== settings.homeCurrency) {
      return { ok: false, message: `Moving money works between your ${settings.homeCurrency} accounts.` };
    }
    const { error } = await supabase.from("account_transfers").insert({ id: fd.get("id"), from_account: from, to_account: to, txn_date: date, amount_fen: amountFen, note });
    if (error && error.code !== "23505") throw error;
    refresh();
    return { ok: true, message: `Moved ${fmt(amountFen)}: ${a.name} → ${b.name}.` };
  } catch (error) {
    console.error("addTransfer failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function deleteTransfer(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid transfer." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("account_transfers").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteTransfer failed", error);
    return { ok: false, message: OFFLINE };
  }
}

/**
 * Remove an account added by mistake. One with money in, transfers or expenses paid
 * from it is hidden instead, so other balances and history stay right.
 */
export async function deleteAccount(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid account." };
  try {
    const { supabase } = await requireUser();
    const account = (await ensureAccounts(supabase)).find((a) => a.id === id);
    if (!account) return { ok: false, message: "That account no longer exists. Reload the page." };
    if (account.isMain) return { ok: false, message: "Your main account can't be deleted." };
    const used = await Promise.all([
      supabase.from("income_transactions").select("id", { head: true, count: "exact" }).eq("account_id", id),
      supabase.from("account_transfers").select("id", { head: true, count: "exact" }).or(`from_account.eq.${id},to_account.eq.${id}`),
      supabase.from("personal_expenses").select("id", { head: true, count: "exact" }).eq("paid_from_account", id),
    ]);
    const failed = used.find((r) => r.error);
    if (failed) throw failed.error;
    const inUse = used.some((r) => (r.count ?? 0) > 0);
    const { error } = inUse
      ? await supabase.from("money_accounts").update({ archived: true }).eq("id", id)
      : await supabase.from("money_accounts").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: inUse ? `${account.name} is hidden (it has history).` : `Deleted ${account.name}.` };
  } catch (error) {
    console.error("deleteAccount failed", error);
    return { ok: false, message: OFFLINE };
  }
}
