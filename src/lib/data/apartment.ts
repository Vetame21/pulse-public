import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, monthStart } from "@/lib/dates";
import type { Settings } from "./settings";

export type RentBill = { id: string; name: string; defaultAmountFen: number; startsMonth: string };
export type RentPayment = { id: string; month: string; amountFen: number; paidDate: string; note: string | null };
export type UtilityBillRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  electricityFen: number | null;
  waterFen: number | null;
  totalFen: number;
  paidDate: string | null;
  note: string | null;
};

/**
 * The rent bill, created on first use with no amount yet (the Apartment page asks
 * for it), starting the first full month after tracking began.
 */
export async function ensureRentBill(supabase: SupabaseClient, settings: Settings): Promise<RentBill> {
  const select = "id, name, default_amount_fen, starts_month";
  const load = () =>
    supabase.from("recurring_bills").select(select).eq("kind", "rent").eq("active", true).maybeSingle();

  let { data, error } = await load();
  if (error) throw new Error(`Couldn't load rent: ${error.message}`);
  if (!data) {
    const start = monthStart(settings.trackingStartDate);
    const startsMonth = settings.trackingStartDate > start ? addMonths(start, 1) : start;
    const { error: insertError } = await supabase.from("recurring_bills").insert({
      name: "Rent + Management",
      kind: "rent",
      default_amount_fen: 0,
      starts_month: startsMonth,
    });
    // 23505: another device created it at the same moment, which is fine.
    if (insertError && insertError.code !== "23505") throw new Error(`Couldn't set up rent: ${insertError.message}`);
    ({ data, error } = await load());
    if (error || !data) throw new Error(`Couldn't load rent: ${error?.message ?? "missing"}`);
  }
  return { id: data.id, name: data.name, defaultAmountFen: Number(data.default_amount_fen), startsMonth: data.starts_month };
}

export async function listRentPayments(supabase: SupabaseClient, billId: string): Promise<RentPayment[]> {
  const { data, error } = await supabase
    .from("bill_payments")
    .select("id, month, amount_fen, paid_date, note")
    .eq("bill_id", billId)
    .order("month", { ascending: true });
  if (error) throw new Error(`Couldn't load rent payments: ${error.message}`);
  return data.map((p) => ({
    id: p.id,
    month: p.month,
    amountFen: Number(p.amount_fen),
    paidDate: p.paid_date,
    note: p.note,
  }));
}

export async function listUtilityBills(supabase: SupabaseClient): Promise<UtilityBillRow[]> {
  const { data, error } = await supabase
    .from("utility_bills")
    .select("id, period_start, period_end, electricity_fen, water_fen, total_fen, paid_date, note")
    .order("period_start", { ascending: true });
  if (error) throw new Error(`Couldn't load utility bills: ${error.message}`);
  return data.map((u) => ({
    id: u.id,
    periodStart: u.period_start,
    periodEnd: u.period_end,
    electricityFen: u.electricity_fen === null ? null : Number(u.electricity_fen),
    waterFen: u.water_fen === null ? null : Number(u.water_fen),
    totalFen: Number(u.total_fen),
    paidDate: u.paid_date,
    note: u.note,
  }));
}

export async function getUtilityBill(supabase: SupabaseClient, id: string): Promise<UtilityBillRow | null> {
  const bills = await listUtilityBills(supabase);
  return bills.find((b) => b.id === id) ?? null;
}
