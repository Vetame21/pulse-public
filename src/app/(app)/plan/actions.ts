"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { mergeItems, splitPlan, type PlanItem } from "@/lib/day-plan";
import { getDayPlan } from "@/lib/data/day-plans";
import { isValidISODate } from "@/lib/dates";
import type { ActionState } from "../actions";

const PlanSchema = z.object({
  date: z.string().refine(isValidISODate, "Invalid day."),
  body: z.string().max(10000, "That's a lot! 10,000 characters max."),
});

/** Save the day's brain dump; the list is rebuilt from it, keeping ticks on unchanged items. */
export async function saveDayPlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = PlanSchema.safeParse({ date: fd.get("date"), body: fd.get("body") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { date, body } = parsed.data;
  try {
    const { supabase, user } = await requireUser();
    const previous = await getDayPlan(supabase, date);
    const items = mergeItems(previous?.items ?? [], splitPlan(body));
    const { error } = await supabase.from("day_plans").upsert({ user_id: user.id, date, body: body.trim(), items }, { onConflict: "user_id,date" });
    if (error) throw error;
    refresh();
    return { ok: true, message: null };
  } catch (error) {
    console.error("saveDayPlan failed", error);
    return { ok: false, message: "Couldn't reach the database. Your text is still here; try again." };
  }
}

/** Tick or untick one item. */
export async function setPlanItemDone(date: string, index: number, done: boolean): Promise<ActionState> {
  if (!isValidISODate(date) || !Number.isInteger(index) || index < 0) return { ok: false, message: "Invalid item." };
  try {
    const { supabase } = await requireUser();
    const plan = await getDayPlan(supabase, date);
    if (!plan || index >= plan.items.length) return { ok: false, message: "That item changed. Refresh and try again." };
    const items: PlanItem[] = plan.items.map((it, i) => (i === index ? { ...it, done } : it));
    const { error } = await supabase.from("day_plans").update({ items }).eq("date", date);
    if (error) throw error;
    refresh();
    return { ok: true, message: null };
  } catch (error) {
    console.error("setPlanItemDone failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}
