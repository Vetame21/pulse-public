"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CATEGORY_KEYS, category } from "@/lib/categories";
import { formatMinor, isCurrency, parseMinor, parseRate as parseFxRate, toFen } from "@/lib/currency";
import { isMonthClosed } from "@/lib/data/budgets";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, isValidISODate, monthStart, todayIn } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import { isLinkedToWallet } from "@/lib/expense-source";
import { moneyFormat, parseYuan } from "@/lib/money";

export type ActionState = { ok: boolean; message: string | null; savedId?: string };

const MAX_AMOUNT_FEN = 100_000_000; // ¥1,000,000 — anything larger is surely a typo

const ExpenseSchema = z.object({
  id: z.uuid(),
  amount: z.string(),
  category: z.enum(CATEGORY_KEYS, { message: "Pick a category." }),
  date: z.string().refine(isValidISODate, "Pick a valid date."),
  note: z.string().trim().max(500, "Note is too long (500 characters max).").optional(),
  fundedBy: z.enum(["budget", "savings", "other"]).default("budget"),
});

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Create (with a client-generated id, so retries never duplicate) or update a personal expense. */
export async function saveExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ExpenseSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    date: formData.get("date"),
    note: formData.get("note") ?? undefined,
    fundedBy: formData.get("fundedBy") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;
  const isEdit = formData.get("mode") === "edit";

  const paidWith = formData.get("paidWith") === "cash" ? "cash" : "bank";
  const paidFromRaw = String(formData.get("paidFromAccount") ?? "");
  const paidFromAccount = paidWith === "bank" && z.uuid().safeParse(paidFromRaw).success ? paidFromRaw : null;
  const paidBy = String(formData.get("paidBy") ?? "").trim().slice(0, 60) || null;

  try {
    const { supabase, user } = await requireUser();
    // Independent lookups run in parallel: each is a round trip to the database.
    const [settings, targetMonthClosed, existing] = await Promise.all([
      getSettings(supabase, user.id),
      isMonthClosed(supabase, input.date),
      isEdit
        ? supabase.from("personal_expenses").select("txn_date, source").eq("id", input.id).maybeSingle()
        : Promise.resolve(null),
    ]);
    const today = todayIn(settings.timezone);
    const home = settings.homeCurrency;
    const fmt = moneyFormat(home);

    // Paid in another currency than your home one (e.g. HKD in Hong Kong for an RMB
    // account, or RMB in Shenzhen for an HKD one): convert at the rate on the form.
    const currencyRaw = String(formData.get("currency") ?? home);
    const currency = isCurrency(currencyRaw) ? currencyRaw : home;
    let amountFen: number | null;
    let foreign: { original_minor: number; fx_rate: number; fx_source: string } | null = null;
    if (currency === home) {
      amountFen = parseYuan(input.amount);
    } else {
      const minor = parseMinor(input.amount, currency);
      const fxRate = parseFxRate(String(formData.get("fxRate") ?? ""));
      if (minor === null) return { ok: false, message: `Enter an amount in ${currency}, like 120 or 120.50.` };
      if (fxRate === null) return { ok: false, message: `Enter the rate: how much ${home} for 1 ${currency}.` };
      const src = String(formData.get("fxSource") ?? "manual");
      foreign = { original_minor: minor, fx_rate: fxRate, fx_source: ["ecb", "last", "manual"].includes(src) ? src : "manual" };
      amountFen = toFen(minor, currency, fxRate);
    }
    if (amountFen === null || amountFen <= 0) return { ok: false, message: "Enter an amount like 32 or 32.50." };
    if (amountFen > MAX_AMOUNT_FEN) return { ok: false, message: "That amount looks too large. Check it again." };
    const currencyColumns = {
      paid_with: paidWith,
      paid_from_account: paidFromAccount,
      ...(foreign ? { currency, ...foreign } : { currency: home, original_minor: null, fx_rate: null, fx_source: null }),
    };

    if (paidFromAccount) {
      // Only one of your own home-currency accounts (the database would accept any id it can see).
      const { data: acct } = await supabase.from("money_accounts").select("currency").eq("id", paidFromAccount).maybeSingle();
      if (!acct || acct.currency !== home) return { ok: false, message: "That account isn't available. Pick another." };
    }

    if (input.date < settings.trackingStartDate) {
      return { ok: false, message: `Tracking starts ${shortDate(settings.trackingStartDate)}. Pick a later date.` };
    }
    if (input.date > today) return { ok: false, message: "That date is in the future." };
    if (targetMonthClosed) {
      return { ok: false, message: `${formatMonth(input.date)} is closed. Reopen it on the Savings page to change it.` };
    }

    const note = input.note ? input.note : null;

    if (isEdit) {
      if (existing?.error) throw existing.error;
      const current = existing?.data;
      if (!current) return { ok: false, message: "This transaction no longer exists." };
      if (isLinkedToWallet(current.source)) {
        return { ok: false, message: "This expense is linked to another account. Edit it there." };
      }
      if (current.txn_date.slice(0, 7) !== input.date.slice(0, 7) && (await isMonthClosed(supabase, current.txn_date))) {
        return { ok: false, message: `${formatMonth(current.txn_date)} is closed. Reopen it on the Savings page to change it.` };
      }
      const { error } = await supabase
        .from("personal_expenses")
        .update({ amount_fen: amountFen, category: input.category, txn_date: input.date, note, ...currencyColumns })
        .eq("id", input.id);
      if (error) {
        if (error.code === "P0001") return { ok: false, message: friendlyDbError(error, "Couldn't save.") };
        throw error;
      }
    } else {
      const { error } = await supabase.from("personal_expenses").insert({
        id: input.id,
        txn_date: input.date,
        amount_fen: amountFen,
        category: input.category,
        note,
        funded_by: input.fundedBy,
        paid_by: input.fundedBy === "other" ? paidBy : null,
        ...currencyColumns,
      });
      // 23505 = this id was already saved (a retry after a slow connection): treat as success.
      if (error && error.code === "P0001") return { ok: false, message: friendlyDbError(error, "Couldn't save.") };
      if (error && error.code !== "23505") throw error;
    }

    refresh();
    const c = category(input.category);
    return {
      ok: true,
      savedId: input.id,
      message: `${isEdit ? "Updated" : "Saved"} ${foreign ? `${formatMinor(foreign.original_minor, currency)} (${fmt(amountFen)})` : fmt(amountFen)} · ${c.emoji} ${c.label} · ${shortDate(input.date)}${
        !isEdit && input.fundedBy === "savings" ? " · from Savings Box" : !isEdit && input.fundedBy === "other" ? ` · paid by ${paidBy ?? "someone else"} (not in your budget)` : ""
      }`,
    };
  } catch (error) {
    console.error("saveExpense failed", error);
    return { ok: false, message: "Couldn't save. Your entry is still here. Check your connection and try again." };
  }
}

export async function deleteExpense(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid transaction." };
  try {
    const { supabase } = await requireUser();
    const { data: existing, error: loadError } = await supabase
      .from("personal_expenses")
      .select("txn_date, source")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!existing) return { ok: true, message: "Already deleted." };
    if (isLinkedToWallet(existing.source)) {
      return { ok: false, message: "This expense is linked to another account. Delete it there." };
    }
    if (await isMonthClosed(supabase, existing.txn_date)) {
      return { ok: false, message: `${formatMonth(existing.txn_date)} is closed. Reopen it on the Savings page to change it.` };
    }
    const { error } = await supabase.from("personal_expenses").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteExpense failed", error);
    return { ok: false, message: "Couldn't delete. Check your connection and try again." };
  }
}

// ---------------------------------------------------------------------------
// Bulk actions on the Transactions page (select several → delete / move)
// ---------------------------------------------------------------------------

const IdsSchema = z.array(z.uuid()).min(1).max(500);

export type DeletedExpense = {
  id: string;
  txn_date: string;
  amount_fen: number;
  category: string;
  kind: string;
  source: string;
  funded_by: string;
  note: string | null;
  created_at: string;
};

type BulkResult = ActionState & { deleted?: DeletedExpense[] };

/** Which of these expenses may be changed: not tied to a restaurant wallet, not in a closed month. */
async function changeable(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], ids: string[]) {
  const [{ data: rows, error }, { data: closings, error: closingsError }] = await Promise.all([
    supabase
      .from("personal_expenses")
      .select("id, txn_date, amount_fen, category, kind, source, funded_by, note, created_at")
      .in("id", ids),
    supabase.from("monthly_closings").select("month"),
  ]);
  if (error) throw error;
  if (closingsError) throw closingsError;
  const closed = new Set(closings.map((c) => c.month));
  const ok = rows.filter((r) => !isLinkedToWallet(r.source) && !closed.has(monthStart(r.txn_date)));
  const inClosed = rows.filter((r) => closed.has(monthStart(r.txn_date))).length;
  const linked = rows.filter((r) => isLinkedToWallet(r.source) && !closed.has(monthStart(r.txn_date))).length;
  return { ok: ok as DeletedExpense[], inClosed, linked };
}

function skippedNote(inClosed: number, linked: number) {
  const parts = [];
  if (inClosed) parts.push(`${inClosed} in a closed month`);
  if (linked) parts.push(`${linked} linked to another account`);
  return parts.length ? ` Skipped ${parts.join(" and ")}.` : "";
}

export async function deleteExpenses(ids: string[]): Promise<BulkResult> {
  if (!IdsSchema.safeParse(ids).success) return { ok: false, message: "Nothing selected." };
  try {
    const { supabase } = await requireUser();
    const { ok, inClosed, linked } = await changeable(supabase, ids);
    if (ok.length > 0) {
      const { error } = await supabase.from("personal_expenses").delete().in("id", ok.map((r) => r.id));
      if (error) throw error;
    }
    refresh();
    return {
      ok: ok.length > 0,
      deleted: ok,
      message: `${ok.length ? `Deleted ${ok.length}.` : "Nothing deleted."}${skippedNote(inClosed, linked)}`,
    };
  } catch (error) {
    console.error("deleteExpenses failed", error);
    return { ok: false, message: "Couldn't delete. Nothing was changed; check your connection and try again." };
  }
}

const RestoreRowSchema = z.object({
  id: z.uuid(),
  txn_date: z.string().refine(isValidISODate),
  amount_fen: z.number().int().positive(),
  category: z.enum(CATEGORY_KEYS),
  kind: z.enum(["expense", "refund"]),
  source: z.enum(["manual", "think_again"]),
  funded_by: z.enum(["budget", "savings"]),
  note: z.string().max(500).nullable(),
  created_at: z.string(),
});

/** Undo a bulk delete: put the exact same rows back (same ids and amounts). */
export async function undoDeleteExpenses(rows: DeletedExpense[]): Promise<ActionState> {
  const parsed = z.array(RestoreRowSchema).min(1).max(500).safeParse(rows);
  if (!parsed.success) return { ok: false, message: "Nothing to undo." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("personal_expenses")
      .upsert(parsed.data, { onConflict: "id", ignoreDuplicates: true });
    if (error) return { ok: false, message: friendlyDbError(error, "Couldn't undo. Try again.") };
    refresh();
    return { ok: true, message: `Restored ${parsed.data.length}.` };
  } catch (error) {
    console.error("undoDeleteExpenses failed", error);
    return { ok: false, message: "Couldn't reach the app. Try Undo again." };
  }
}

/** Fix entries filed under the wrong category. */
export async function moveExpensesToCategory(ids: string[], categoryKey: string): Promise<ActionState> {
  const cat = z.enum(CATEGORY_KEYS).safeParse(categoryKey);
  if (!IdsSchema.safeParse(ids).success || !cat.success) return { ok: false, message: "Pick entries and a category." };
  try {
    const { supabase } = await requireUser();
    const { ok, inClosed, linked } = await changeable(supabase, ids);
    if (ok.length > 0) {
      const { error } = await supabase
        .from("personal_expenses")
        .update({ category: cat.data })
        .in("id", ok.map((r) => r.id));
      if (error) throw error;
    }
    refresh();
    const c = category(cat.data);
    return {
      ok: ok.length > 0,
      message: `${ok.length ? `Moved ${ok.length} to ${c.emoji} ${c.label}.` : "Nothing moved."}${skippedNote(inClosed, linked)}`,
    };
  } catch (error) {
    console.error("moveExpensesToCategory failed", error);
    return { ok: false, message: "Couldn't move. Nothing was changed; try again." };
  }
}
