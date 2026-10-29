"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { proratedBudget } from "@/lib/budget";
import { ensureMonthBudget } from "@/lib/data/budgets";
import { parseMonthParam } from "@/lib/data/savings";
import { getSettings } from "@/lib/data/settings";
import { daysInclusive, daysInMonthOf, formatMonth, isValidISODate, monthEnd, monthStart, todayIn } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import { moneyFormat, parseYuan } from "@/lib/money";
import type { ActionState } from "../actions";

const BUDGET_CHOICES = ["none", "prorated", "full", "custom"] as const;

/** Close an ended month: snapshot it and move what's left of the budget into the Savings Box. */
export async function closeMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const month = parseMonthParam(String(formData.get("month") ?? ""));
  if (!month) return { ok: false, message: "Invalid month." };

  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    const today = todayIn(settings.timezone);
    const isTrackingStartMonth = month === monthStart(settings.trackingStartDate) && settings.trackingStartDate > month;

    let budgetFen: number;
    if (isTrackingStartMonth) {
      const choice = String(formData.get("budgetChoice") ?? "none");
      if (!BUDGET_CHOICES.includes(choice as (typeof BUDGET_CHOICES)[number])) return { ok: false, message: "Pick a budget option." };
      const trackedDays = daysInclusive(settings.trackingStartDate, monthEnd(month));
      if (choice === "none") budgetFen = 0;
      else if (choice === "prorated") budgetFen = proratedBudget(settings.defaultBudgetFen, trackedDays, daysInMonthOf(month));
      else if (choice === "full") budgetFen = settings.defaultBudgetFen;
      else {
        const custom = parseYuan(String(formData.get("customBudget") ?? ""));
        if (custom === null) return { ok: false, message: "Enter a custom budget like 145 or 145.16." };
        budgetFen = custom;
      }
    } else {
      budgetFen = (await ensureMonthBudget(supabase, settings, month)).budgetFen;
    }

    const { data, error } = await supabase.rpc("close_month", {
      p_month: month,
      p_budget_fen: budgetFen,
      p_is_partial: isTrackingStartMonth,
      p_today: today,
    });
    if (error) return { ok: false, message: friendlyDbError(error, "Couldn't close the month. Nothing was changed; try again.") };

    refresh();
    const saved = Number((data as { saved_fen: number }).saved_fen);
    return {
      ok: true,
      message: saved > 0 ? `${formatMonth(month)} closed. +${fmt(saved)} to the Savings Box.` : `${formatMonth(month)} closed.`,
    };
  } catch (error) {
    console.error("closeMonth failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was changed; try again." };
  }
}

export async function reopenMonth(monthParam: string): Promise<ActionState> {
  const month = parseMonthParam(monthParam);
  if (!month) return { ok: false, message: "Invalid month." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("reopen_month", { p_month: month });
    if (error) {
      return {
        ok: false,
        message: /SAVINGS_NEGATIVE/.test(error.message)
          ? `Can't reopen ${formatMonth(month)}: its savings have already been spent from the Savings Box.`
          : friendlyDbError(error, "Couldn't reopen the month. Try again."),
      };
    }
    refresh();
    return { ok: true, message: `${formatMonth(month)} reopened. Its savings were removed until you close it again.` };
  } catch (error) {
    console.error("reopenMonth failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was changed; try again." };
  }
}

const EntrySchema = z.object({
  id: z.uuid(),
  kind: z.enum(["deposit", "withdrawal"]),
  amount: z.string(),
  date: z.string().refine(isValidISODate, "Pick a valid date."),
  note: z.string().trim().max(500).optional(),
});

/** Manually add money to, or take money out of, the Savings Box. */
export async function addSavingsEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = EntrySchema.safeParse({
    id: formData.get("id"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const amountFen = parseYuan(parsed.data.amount);
  if (!amountFen) return { ok: false, message: "Enter an amount like 100 or 100.50." };

  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    if (parsed.data.date > todayIn(settings.timezone)) return { ok: false, message: "That date is in the future." };
    const { error } = await supabase.from("savings_transactions").insert({
      id: parsed.data.id,
      txn_date: parsed.data.date,
      amount_fen: parsed.data.kind === "deposit" ? amountFen : -amountFen,
      kind: parsed.data.kind,
      note: parsed.data.note ?? null,
    });
    if (error && error.code !== "23505") {
      return { ok: false, message: friendlyDbError(error, "Couldn't save. Try again.") };
    }
    refresh();
    return { ok: true, message: `${parsed.data.kind === "deposit" ? "Added" : "Took out"} ${fmt(amountFen)}.` };
  } catch (error) {
    console.error("addSavingsEntry failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
}

/** Delete a manual deposit/withdrawal (month closings are undone by reopening the month). */
export async function deleteSavingsEntry(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid entry." };
  try {
    const { supabase } = await requireUser();
    const { data: row, error: loadError } = await supabase
      .from("savings_transactions")
      .select("kind, closing_id, personal_expense_id")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) return { ok: true, message: "Already deleted." };
    if (row.closing_id) return { ok: false, message: "This came from closing a month. Reopen that month instead." };
    if (row.personal_expense_id) return { ok: false, message: "This is a purchase paid from savings. Delete the expense instead." };
    const { error } = await supabase.from("savings_transactions").delete().eq("id", id);
    if (error) return { ok: false, message: friendlyDbError(error, "Couldn't delete. Try again.") };
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteSavingsEntry failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

export async function closeMonthAndReturn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await closeMonth(_prev, formData);
  if (result.ok) redirect(`/savings?closed=${encodeURIComponent(String(formData.get("month")))}`);
  return result;
}
