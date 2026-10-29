"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isMonthClosed } from "@/lib/data/budgets";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, isValidISODate, todayIn } from "@/lib/dates";
import { moneyFormat, parseYuan } from "@/lib/money";
import type { ActionState } from "../../actions";

export type WalletActionState = ActionState & { needsCash?: { creditFen: number; cashFen: number } };

const OFFLINE = "Couldn't reach the database. Nothing was changed; try again.";
const date = z.string().refine(isValidISODate, "Pick a valid date.");

/** Shared checks: signed in, date not in the future, month not closed (top-up/cash creates a Food expense). */
async function prepare(txnDate: string) {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  if (txnDate > todayIn(settings.timezone)) return { ok: false as const, error: "That date is in the future." };
  if (txnDate < settings.trackingStartDate) return { ok: false as const, error: "That's before tracking started." };
  if (await isMonthClosed(supabase, txnDate)) {
    return { ok: false as const, error: `${formatMonth(txnDate)} is closed. Reopen it on the Savings page first.` };
  }
  return { ok: true as const, supabase, fmt };
}

const CreateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Give the wallet a name, e.g. Noodle House.").max(100),
  cash: z.string(),
  credit: z.string(),
  date: z.union([date, z.literal("")]),
});

export async function createWallet(_prev: WalletActionState, fd: FormData): Promise<WalletActionState> {
  const parsed = CreateSchema.safeParse({ id: fd.get("id"), name: fd.get("name"), cash: fd.get("cash") ?? "", credit: fd.get("credit") ?? "", date: fd.get("date") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { id, name, cash, credit } = parsed.data;
  const cashFen = cash.trim() ? parseYuan(cash) : null;
  const creditFen = credit.trim() ? parseYuan(credit) : cashFen;
  if (cash.trim() && !cashFen) return { ok: false, message: "Cash paid must look like 300 or 300.50." };
  if (cashFen && (!creditFen || creditFen < cashFen)) return { ok: false, message: "Credit received must be at least the cash paid." };

  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("restaurant_wallets").insert({ id, name });
    if (error && error.code !== "23505") throw error;
    if (cashFen && creditFen) {
      const txnDate = parsed.data.date;
      if (!txnDate) return { ok: false, message: "Wallet created. Pick the top-up date and add it from the wallet page." };
      const p = await prepare(txnDate);
      if (!p.ok) return { ok: false, message: `Wallet created, but the top-up wasn't saved: ${p.error}` };
      const { error: topupError } = await p.supabase.rpc("restaurant_topup", {
        p_id: crypto.randomUUID(),
        p_wallet: id,
        p_date: txnDate,
        p_cash_fen: cashFen,
        p_credit_fen: creditFen,
        p_note: null,
      });
      if (topupError) throw topupError;
    }
    refresh();
  } catch (error) {
    console.error("createWallet failed", error);
    return { ok: false, message: OFFLINE };
  }
  redirect(`/accounts/restaurants/${id}`);
}

const TopupSchema = z.object({ id: z.uuid(), walletId: z.uuid(), date, cash: z.string(), credit: z.string(), note: z.string().trim().max(500) });

export async function topUp(_prev: WalletActionState, fd: FormData): Promise<WalletActionState> {
  const parsed = TopupSchema.safeParse(Object.fromEntries(["id", "walletId", "date", "cash", "credit", "note"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const cashFen = parseYuan(parsed.data.cash);
  const creditFen = parsed.data.credit.trim() ? parseYuan(parsed.data.credit) : cashFen;
  if (!cashFen) return { ok: false, message: "Enter the cash you paid, e.g. 300." };
  if (!creditFen || creditFen < cashFen) return { ok: false, message: "Credit received must be at least the cash paid." };

  try {
    const p = await prepare(parsed.data.date);
    if (!p.ok) return { ok: false, message: p.error };
    const { error } = await p.supabase.rpc("restaurant_topup", {
      p_id: parsed.data.id,
      p_wallet: parsed.data.walletId,
      p_date: parsed.data.date,
      p_cash_fen: cashFen,
      p_credit_fen: creditFen,
      p_note: parsed.data.note || null,
    });
    if (error) throw error;
    refresh();
    const bonus = creditFen - cashFen;
    const { fmt } = p;
    return { ok: true, message: `Topped up: paid ${fmt(cashFen)}, got ${fmt(creditFen)} credit${bonus ? ` (+${fmt(bonus)} bonus)` : ""}.` };
  } catch (error) {
    console.error("topUp failed", error);
    return { ok: false, message: OFFLINE };
  }
}

const UseSchema = z.object({ id: z.uuid(), walletId: z.uuid(), date, bill: z.string(), note: z.string().trim().max(500), allowCash: z.string() });

export async function useCredit(_prev: WalletActionState, fd: FormData): Promise<WalletActionState> {
  const parsed = UseSchema.safeParse(Object.fromEntries(["id", "walletId", "date", "bill", "note", "allowCash"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const billFen = parseYuan(parsed.data.bill);
  if (!billFen) return { ok: false, message: "Enter the bill amount, e.g. 80." };

  try {
    const p = await prepare(parsed.data.date);
    if (!p.ok) return { ok: false, message: p.error };
    const { fmt } = p;
    const { data, error } = await p.supabase.rpc("restaurant_use", {
      p_id: parsed.data.id,
      p_wallet: parsed.data.walletId,
      p_date: parsed.data.date,
      p_bill_fen: billFen,
      p_note: parsed.data.note || null,
      p_allow_cash: parsed.data.allowCash === "1",
    });
    const short = error && /INSUFFICIENT_CREDIT:(\d+)/.exec(error.message);
    if (short) {
      const creditFen = Number(short[1]);
      return {
        ok: false,
        needsCash: { creditFen, cashFen: billFen - creditFen },
        message:
          creditFen > 0
            ? `Only ${fmt(creditFen)} credit left. Pay the other ${fmt(billFen - creditFen)} in cash?`
            : `This wallet is empty. Record the whole ${fmt(billFen)} as paid in cash?`,
      };
    }
    if (error) throw error;
    refresh();
    const r = data as { credit_fen?: number; cash_fen?: number; duplicate?: boolean };
    if (r.duplicate) return { ok: true, message: "Already saved." };
    return {
      ok: true,
      message:
        (r.cash_fen ?? 0) > 0
          ? `Used ${fmt(r.credit_fen ?? 0)} credit + ${fmt(r.cash_fen ?? 0)} cash (counted as Food).`
          : `Used ${fmt(r.credit_fen ?? 0)} credit. Not counted in your budget again.`,
    };
  } catch (error) {
    console.error("useCredit failed", error);
    return { ok: false, message: OFFLINE };
  }
}

const AdjustSchema = z.object({ id: z.uuid(), walletId: z.uuid(), date, amount: z.string(), direction: z.enum(["remove", "add"]), note: z.string().trim().max(500) });

/** Correct a wallet: remove expired credit, or add credit you were given. No budget effect. */
export async function adjustWallet(_prev: WalletActionState, fd: FormData): Promise<WalletActionState> {
  const parsed = AdjustSchema.safeParse(Object.fromEntries(["id", "walletId", "date", "amount", "direction", "note"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const amountFen = parseYuan(parsed.data.amount);
  if (!amountFen) return { ok: false, message: "Enter an amount, e.g. 20." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    const { error } = await supabase.from("restaurant_wallet_transactions").insert({
      id: parsed.data.id,
      wallet_id: parsed.data.walletId,
      txn_date: parsed.data.date,
      kind: "adjustment",
      cash_paid_fen: 0,
      credit_delta_fen: parsed.data.direction === "remove" ? -amountFen : amountFen,
      note: parsed.data.note || (parsed.data.direction === "remove" ? "Credit removed (expired / correction)" : "Credit added"),
    });
    if (error && /WALLET_NEGATIVE/.test(error.message)) return { ok: false, message: "That's more credit than the wallet has." };
    if (error && error.code !== "23505") throw error;
    refresh();
    return { ok: true, message: parsed.data.direction === "remove" ? `Removed ${fmt(amountFen)} credit.` : `Added ${fmt(amountFen)} credit.` };
  } catch (error) {
    console.error("adjustWallet failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function deleteWalletTxn(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid entry." };
  try {
    const { supabase } = await requireUser();
    const { data: row } = await supabase.from("restaurant_wallet_transactions").select("txn_date, personal_expense_id").eq("id", id).maybeSingle();
    if (!row) return { ok: true, message: "Already deleted." };
    if (row.personal_expense_id && (await isMonthClosed(supabase, row.txn_date))) {
      return { ok: false, message: `${formatMonth(row.txn_date)} is closed. Reopen it on the Savings page first.` };
    }
    const { error } = await supabase.rpc("delete_restaurant_txn", { p_id: id });
    if (error && /WALLET_NEGATIVE/.test(error.message)) {
      return { ok: false, message: "Some of this credit was already used. Delete those meals first." };
    }
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteWalletTxn failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function setWalletArchived(id: string, archived: boolean): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid wallet." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("restaurant_wallets").update({ archived }).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: archived ? "Archived." : "Restored." };
  } catch (error) {
    console.error("setWalletArchived failed", error);
    return { ok: false, message: OFFLINE };
  }
}
