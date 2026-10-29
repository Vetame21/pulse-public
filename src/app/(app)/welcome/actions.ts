"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { monthStart, todayIn } from "@/lib/dates";
import { parseYuan } from "@/lib/money";
import type { ActionState } from "../actions";

const REGIONS = {
  hk: { home_currency: "HKD", timezone: "Asia/Hong_Kong" },
  mainland: { home_currency: "CNY", timezone: "Asia/Shanghai" },
} as const;

/**
 * First-time setup. The region decides the home currency and the holidays; it's
 * fixed afterwards, because every amount is stored in that currency.
 */
export async function finishWelcome(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const region = fd.get("region") === "hk" ? "hk" : fd.get("region") === "mainland" ? "mainland" : null;
  if (!region) return { ok: false, message: "Pick where you live." };
  const budgetFen = parseYuan(String(fd.get("budget") ?? ""));
  if (budgetFen === null || budgetFen <= 0) return { ok: false, message: "Enter your monthly budget, like 2000." };
  const { home_currency, timezone } = REGIONS[region];

  try {
    const { supabase, user } = await requireUser();
    const { data: current, error: readError } = await supabase.from("settings").select("onboarded").eq("user_id", user.id).maybeSingle();
    if (readError) throw readError;
    if (current?.onboarded) redirect("/"); // already set up: the region can't change any more

    // Track from the 1st of this month, so the first month has a full budget.
    const firstOfMonth = monthStart(todayIn(timezone));
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        region,
        home_currency,
        timezone,
        family_enabled: fd.get("family") === "on",
        rent_enabled: fd.get("rent") === "on",
        default_budget_fen: budgetFen,
        tracking_start_date: firstOfMonth,
        onboarded: true,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;

    // A budget row made before setup (opening another page first) gets the chosen amount.
    await supabase.from("monthly_budgets").update({ budget_fen: budgetFen, is_partial: false }).eq("month", firstOfMonth);
    // Accounts made before setup were created in RMB; a Hong Kong account uses HKD.
    if (home_currency === "HKD") {
      await supabase.from("money_accounts").update({ currency: "HKD" }).eq("currency", "CNY");
    }
  } catch (error) {
    unstable_rethrow(error); // let redirect() through
    console.error("finishWelcome failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
  redirect("/");
}
