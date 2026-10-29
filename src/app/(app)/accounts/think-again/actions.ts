"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CATEGORY_KEYS } from "@/lib/categories";
import { isMonthClosed } from "@/lib/data/budgets";
import { getSettings } from "@/lib/data/settings";
import { addDays, formatMonth, isValidISODate, todayIn } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import { moneyFormat, parseYuan } from "@/lib/money";
import type { ActionState } from "../../actions";

const OFFLINE = "Couldn't reach the database. Nothing was changed; try again.";

const AddSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "What do you want to buy?").max(200),
  price: z.string(),
  category: z.enum(CATEGORY_KEYS, { message: "Pick a category." }),
  waitDays: z.coerce.number().int().min(0).max(365),
  note: z.string().trim().max(500),
});

export async function addThinkItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = AddSchema.safeParse(Object.fromEntries(["id", "name", "price", "category", "waitDays", "note"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const priceFen = parseYuan(parsed.data.price);
  if (!priceFen) return { ok: false, message: "Enter the price, like 999." };
  try {
    const { supabase, user } = await requireUser();
    const today = todayIn((await getSettings(supabase, user.id)).timezone);
    const { error } = await supabase.from("think_again_items").insert({
      id: parsed.data.id,
      name: parsed.data.name,
      price_fen: priceFen,
      category: parsed.data.category,
      note: parsed.data.note || null,
      added_on: today,
      decide_after: addDays(today, parsed.data.waitDays),
    });
    if (error && error.code !== "23505") throw error;
    refresh();
    return { ok: true, message: `Added. Think again in ${parsed.data.waitDays} day${parsed.data.waitDays === 1 ? "" : "s"}.` };
  } catch (error) {
    console.error("addThinkItem failed", error);
    return { ok: false, message: OFFLINE };
  }
}

const BuySchema = z.object({
  id: z.uuid(), // becomes the expense id, so a retry can't buy twice
  itemId: z.uuid(),
  amount: z.string(),
  date: z.string().refine(isValidISODate, "Pick a valid date."),
  fundedBy: z.enum(["budget", "savings"]),
});

export async function buyThinkItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = BuySchema.safeParse(Object.fromEntries(["id", "itemId", "amount", "date", "fundedBy"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const amountFen = parseYuan(parsed.data.amount);
  if (!amountFen) return { ok: false, message: "Enter what you paid, like 999." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    if (parsed.data.date > todayIn(settings.timezone)) return { ok: false, message: "That date is in the future." };
    if (parsed.data.date < settings.trackingStartDate) return { ok: false, message: "That's before tracking started." };
    if (await isMonthClosed(supabase, parsed.data.date)) {
      return { ok: false, message: `${formatMonth(parsed.data.date)} is closed. Reopen it on the Savings page first.` };
    }
    const { error } = await supabase.rpc("think_again_buy", {
      p_item: parsed.data.itemId,
      p_expense: parsed.data.id,
      p_date: parsed.data.date,
      p_amount_fen: amountFen,
      p_funded_by: parsed.data.fundedBy,
    });
    if (error) {
      return {
        ok: false,
        message: /ALREADY_DECIDED/.test(error.message)
          ? "You already decided on this one."
          : friendlyDbError(error, OFFLINE),
      };
    }
    refresh();
    return {
      ok: true,
      message: `Bought for ${fmt(amountFen)}${parsed.data.fundedBy === "savings" ? " from the Savings Box" : ""}. It's in your expenses now.`,
    };
  } catch (error) {
    console.error("buyThinkItem failed", error);
    return { ok: false, message: OFFLINE };
  }
}

async function update(id: string, values: Record<string, unknown>, done: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid item." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("think_again_items").update(values).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: done };
  } catch (error) {
    console.error("think again update failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function skipThinkItem(id: string): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const today = todayIn((await getSettings(supabase, user.id)).timezone);
  return update(id, { status: "skipped", decided_on: today }, "Skipped. Money not spent 🎉");
}

export async function waitLonger(id: string): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const today = todayIn((await getSettings(supabase, user.id)).timezone);
  return update(id, { decide_after: addDays(today, 7) }, "OK, think again in 7 days.");
}

/** Put a decided item back on the waitlist (removes the expense if it was bought). */
export async function undoThinkDecision(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid item." };
  try {
    const { supabase } = await requireUser();
    const { data: item } = await supabase.from("think_again_items").select("status, decided_on").eq("id", id).maybeSingle();
    if (item?.status === "bought" && item.decided_on && (await isMonthClosed(supabase, item.decided_on))) {
      return { ok: false, message: `${formatMonth(item.decided_on)} is closed. Reopen it on the Savings page first.` };
    }
    const { error } = await supabase.rpc("think_again_undo", { p_item: id });
    if (error) return { ok: false, message: friendlyDbError(error, OFFLINE) };
    refresh();
    return { ok: true, message: "Back on the waitlist." };
  } catch (error) {
    console.error("undoThinkDecision failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function deleteThinkItem(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid item." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("think_again_items").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Removed from the list." };
  } catch (error) {
    console.error("deleteThinkItem failed", error);
    return { ok: false, message: OFFLINE };
  }
}
