"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureRentBill, listUtilityBills } from "@/lib/data/apartment";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, isValidISODate, todayIn } from "@/lib/dates";
import { moneyFormat, plainAmount, parseYuan } from "@/lib/money";
import { periodsOverlap } from "@/lib/utilities";
import type { ActionState } from "../../actions";

const OFFLINE = "Couldn't reach the database. Nothing was changed; try again.";
const date = z.string().refine(isValidISODate, "Pick a valid date.");

// ---------------------------------------------------------------------------
// Rent
// ---------------------------------------------------------------------------

const RentPaymentSchema = z.object({
  id: z.uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  amount: z.string(),
  paidDate: date,
});

export async function markRentPaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = RentPaymentSchema.safeParse({
    id: formData.get("id"),
    month: formData.get("month"),
    amount: formData.get("amount"),
    paidDate: formData.get("paidDate"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const amountFen = parseYuan(parsed.data.amount);
  if (!amountFen) return { ok: false, message: "Enter the amount, like 2000." };

  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    if (parsed.data.paidDate > todayIn(settings.timezone)) return { ok: false, message: "The payment date is in the future." };
    const bill = await ensureRentBill(supabase, settings);
    const { error } = await supabase.from("bill_payments").insert({
      id: parsed.data.id,
      bill_id: bill.id,
      month: parsed.data.month,
      amount_fen: amountFen,
      paid_date: parsed.data.paidDate,
    });
    if (error?.code === "23505") {
      refresh();
      return { ok: true, message: `${formatMonth(parsed.data.month)} rent is already marked as paid.` };
    }
    if (error) throw error;
    refresh();
    return { ok: true, message: `${formatMonth(parsed.data.month)} rent paid: ${fmt(amountFen)}.` };
  } catch (error) {
    console.error("markRentPaid failed", error);
    return { ok: false, message: OFFLINE };
  }
}

export async function undoRentPayment(paymentId: string): Promise<ActionState> {
  if (!z.uuid().safeParse(paymentId).success) return { ok: false, message: "Invalid payment." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("bill_payments").delete().eq("id", paymentId);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Marked as unpaid." };
  } catch (error) {
    console.error("undoRentPayment failed", error);
    return { ok: false, message: OFFLINE };
  }
}

/** Change the rent for months not yet paid. Paid months keep the amount they were paid at. */
export async function setRentAmount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amountFen = parseYuan(String(formData.get("amount") ?? ""));
  if (!amountFen) return { ok: false, message: "Enter your rent, like 2000." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    const bill = await ensureRentBill(supabase, settings);
    const { error } = await supabase.from("recurring_bills").update({ default_amount_fen: amountFen }).eq("id", bill.id);
    if (error) throw error;
    refresh();
    return { ok: true, message: `Rent is now ${fmt(amountFen)} for months not yet paid. Past payments keep their amounts.` };
  } catch (error) {
    console.error("setRentAmount failed", error);
    return { ok: false, message: OFFLINE };
  }
}

// ---------------------------------------------------------------------------
// Electricity + water
// ---------------------------------------------------------------------------

const UtilitySchema = z.object({
  id: z.uuid(),
  mode: z.enum(["create", "edit"]),
  periodStart: date,
  periodEnd: date,
  paidDate: z.union([date, z.literal("")]),
  electricity: z.string(),
  water: z.string(),
  total: z.string(),
  note: z.string().trim().max(500),
});

export async function saveUtilityBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = UtilitySchema.safeParse(Object.fromEntries(["id", "mode", "periodStart", "periodEnd", "paidDate", "electricity", "water", "total", "note"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  if (f.periodEnd < f.periodStart) return { ok: false, message: "The period must end after it starts." };

  const parse = (v: string) => (v.trim() === "" ? null : parseYuan(v));
  const electricityFen = parse(f.electricity);
  const waterFen = parse(f.water);
  const enteredTotal = parse(f.total);
  if ([f.electricity, f.water, f.total].some((v, i) => v.trim() !== "" && [electricityFen, waterFen, enteredTotal][i] === null)) {
    return { ok: false, message: "Amounts must look like 320 or 320.50." };
  }

  let totalFen: number;
  if (electricityFen !== null && waterFen !== null) {
    totalFen = electricityFen + waterFen;
    if (enteredTotal !== null && enteredTotal !== totalFen) {
      // Checked before loading your settings, so plain numbers (no currency symbol).
      return { ok: false, message: `Electricity + water = ${plainAmount(totalFen)}, but the total says ${plainAmount(enteredTotal)}. Fix one of them.` };
    }
  } else {
    totalFen = enteredTotal ?? electricityFen ?? waterFen ?? 0;
  }
  if (totalFen <= 0) return { ok: false, message: "Enter the bill amount (a combined total, or electricity and/or water)." };

  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    if (f.paidDate && f.paidDate > todayIn(settings.timezone)) return { ok: false, message: "The payment date is in the future." };

    const others = (await listUtilityBills(supabase)).filter((b) => b.id !== f.id);
    const clash = others.find((b) => periodsOverlap(b, f));
    if (clash) {
      return {
        ok: false,
        message: `This period overlaps the bill for ${clash.periodStart} – ${clash.periodEnd}. Each day should be in only one bill.`,
      };
    }

    const values = {
      period_start: f.periodStart,
      period_end: f.periodEnd,
      electricity_fen: electricityFen,
      water_fen: waterFen,
      total_fen: totalFen,
      paid_date: f.paidDate || null,
      note: f.note || null,
    };
    if (f.mode === "edit") {
      const { error } = await supabase.from("utility_bills").update(values).eq("id", f.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("utility_bills")
        .insert({ id: f.id, ...values });
      if (error && error.code !== "23505") throw error;
    }
    refresh();
  } catch (error) {
    console.error("saveUtilityBill failed", error);
    return { ok: false, message: OFFLINE };
  }
  redirect("/accounts/apartment");
}

export async function deleteUtilityBill(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid bill." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("utility_bills").delete().eq("id", id);
    if (error) throw error;
    refresh();
  } catch (error) {
    console.error("deleteUtilityBill failed", error);
    return { ok: false, message: OFFLINE };
  }
  redirect("/accounts/apartment");
}

export async function markUtilityPaid(id: string, paidDate: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success || !isValidISODate(paidDate)) return { ok: false, message: "Invalid date." };
  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    if (paidDate > todayIn(settings.timezone)) return { ok: false, message: "The payment date is in the future." };
    const { error } = await supabase.from("utility_bills").update({ paid_date: paidDate }).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Marked as paid." };
  } catch (error) {
    console.error("markUtilityPaid failed", error);
    return { ok: false, message: OFFLINE };
  }
}
