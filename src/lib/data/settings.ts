import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Settings = {
  timezone: string;
  trackingStartDate: string;
  defaultBudgetFen: number;
  thinkAgainDays: number;
  lastBackupAt: string | null;
  backupAgeDays: number | null; // whole days since the last backup, null if never
  notify: { briefingTime: string; classes: boolean; events: boolean; deadlines: boolean };
  features: { family: boolean; rent: boolean };
  region: "mainland" | "hk"; // decides holidays and the home currency
  homeCurrency: "CNY" | "HKD"; // all *_fen amounts are cents of this currency
  onboarded: boolean; // finished the welcome screen
};

/** Read the user's settings, creating the default row on first use. */
export async function getSettings(supabase: SupabaseClient, userId: string): Promise<Settings> {
  const select = "timezone, tracking_start_date, default_budget_fen, think_again_days, last_backup_at, notify_briefing_time, notify_classes, notify_events, notify_deadlines, family_enabled, rent_enabled, region, home_currency, onboarded";
  let { data, error } = await supabase.from("settings").select(select).maybeSingle();
  if (!error && !data) {
    ({ data, error } = await supabase
      .from("settings")
      .upsert({ user_id: userId }, { onConflict: "user_id" })
      .select(select)
      .single());
  }
  if (error || !data) throw new Error(`Couldn't load settings: ${error?.message ?? "no row"}`);
  return {
    timezone: data.timezone,
    trackingStartDate: data.tracking_start_date,
    defaultBudgetFen: Number(data.default_budget_fen),
    thinkAgainDays: data.think_again_days,
    lastBackupAt: data.last_backup_at,
    backupAgeDays: data.last_backup_at
      ? Math.floor((Date.now() - new Date(data.last_backup_at).getTime()) / 86_400_000)
      : null,
    notify: {
      briefingTime: String(data.notify_briefing_time).slice(0, 5),
      classes: data.notify_classes,
      events: data.notify_events,
      deadlines: data.notify_deadlines,
    },
    features: { family: data.family_enabled, rent: data.rent_enabled },
    region: data.region === "hk" ? "hk" : "mainland",
    homeCurrency: data.home_currency === "HKD" ? "HKD" : "CNY",
    onboarded: data.onboarded,
  };
}
