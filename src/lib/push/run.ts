// The scheduled notification job (runs every 10 minutes on Netlify).
// It uses the server-only Supabase secret key, which bypasses row-level
// security, so EVERY query below filters by user_id explicitly.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "../china-calendar";
import { addDays, todayIn } from "../dates";
import { type Goal, goalsBriefingLine } from "../goals";
import { regionHolidays } from "../holidays";
import { loadIndices } from "../news/load";
import { newsBriefingLine } from "../news/markets";
import { type DueNotice, type NotifyPrefs, dueNotifications } from "./due";
import { type StoredSubscription, type VapidKeys, sendPush } from "./webpush";

type EventRow = {
  id: string; title: string; date: string; end_date: string | null; start_time: string | null; end_time: string | null;
  location: string | null; notes: string | null; kind: "event" | "deadline"; lead_days: number | null; done_at: string | null;
};
const EVENT_COLS = "id, title, date, end_date, start_time, end_time, location, notes, kind, lead_days, done_at";
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const toEvent = (r: EventRow): CalendarEvent => ({
  id: r.id, title: r.title, date: r.date, endDate: r.end_date, startTime: hhmm(r.start_time), endTime: hhmm(r.end_time),
  location: r.location, notes: r.notes, kind: r.kind, leadDays: r.lead_days, done: r.done_at !== null,
});

function localClock(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { today: todayIn(timeZone, now), nowMin: get("hour") * 60 + get("minute") };
}

async function noticesFor(db: SupabaseClient, userId: string, now: Date): Promise<DueNotice[]> {
  const { data: s, error } = await db
    .from("settings")
    .select("timezone, notify_briefing_time, notify_classes, notify_events, notify_deadlines, region")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const timezone = s?.timezone ?? "Asia/Shanghai";
  const prefs: NotifyPrefs = {
    briefingTime: hhmm(s?.notify_briefing_time ?? "07:00")!,
    classes: s?.notify_classes ?? true,
    events: s?.notify_events ?? true,
    deadlines: s?.notify_deadlines ?? true,
  };
  const { today, nowMin } = localClock(timezone, now);
  const tomorrow = addDays(today, 1);

  const [events, deadlines, semesters, classes, birthdays, holidays] = await Promise.all([
    db.from("calendar_events").select(EVENT_COLS).eq("user_id", userId).eq("kind", "event").lte("date", tomorrow).gte("date", addDays(today, -60)).limit(500),
    db.from("calendar_events").select(EVENT_COLS).eq("user_id", userId).eq("kind", "deadline").is("done_at", null).lte("date", addDays(today, 90)).limit(200),
    db.from("semesters").select("id, name, start_date, weeks").eq("user_id", userId),
    db.from("classes").select("id, semester_id, title, title_zh, teacher, room, weekday, start_time, end_time, weeks").eq("user_id", userId),
    db.from("birthdays").select("id, name, month, day, year, in_memory").eq("user_id", userId),
    regionHolidays(s?.region === "hk" ? "hk" : "mainland", [Number(today.slice(0, 4)), Number(tomorrow.slice(0, 4))]),
  ]);
  for (const r of [events, deadlines, semesters, classes, birthdays]) if (r.error) throw r.error;

  // Goals only matter for the morning briefing, so load them only around that time.
  const briefingMin = Number(prefs.briefingTime.slice(0, 2)) * 60 + Number(prefs.briefingTime.slice(3, 5));
  const briefingSoon = nowMin >= briefingMin && nowMin < briefingMin + 30;
  const [goalsLine, newsLine] = briefingSoon
    ? await Promise.all([goalsLineFor(db, userId, timezone, today), loadIndices(0).then(newsBriefingLine).catch(() => null)])
    : [null, null];

  return dueNotifications({
    goalsLine,
    newsLine,
    today,
    nowMin,
    prefs,
    events: (events.data as EventRow[]).map(toEvent).filter((e) => (e.endDate ?? e.date) >= today),
    deadlines: (deadlines.data as EventRow[]).map(toEvent),
    semesters: semesters.data!.map((r) => ({ id: r.id, name: r.name, startDate: r.start_date, weeks: r.weeks })),
    classes: classes.data!.map((r) => ({
      id: r.id, semesterId: r.semester_id, title: r.title, titleZh: r.title_zh, teacher: r.teacher, room: r.room,
      weekday: r.weekday, startTime: hhmm(r.start_time)!, endTime: hhmm(r.end_time)!, weeks: r.weeks,
    })),
    birthdays: birthdays.data!.map((r) => ({ id: r.id, name: r.name, month: r.month, day: r.day, year: r.year, inMemory: r.in_memory })),
    holidays,
  });
}

async function goalsLineFor(db: SupabaseClient, userId: string, timezone: string, today: string): Promise<string | null> {
  const { data: rows, error } = await db
    .from("goals")
    .select("id, title, kind, due_date, target_fen, money_source, baseline_fen, habit_period, habit_times, target_value, start_value, unit, number_mode, completed_at, created_at")
    .eq("user_id", userId)
    .is("completed_at", null);
  if (error) throw error;
  if (rows.length === 0) return null;
  const goals: Goal[] = rows.map((r) => ({
    id: r.id, title: r.title, kind: r.kind, dueDate: r.due_date, createdDate: todayIn(timezone, new Date(r.created_at)), completed: false,
    targetFen: r.target_fen === null ? null : Number(r.target_fen), moneySource: r.money_source, baselineFen: Number(r.baseline_fen),
    habitPeriod: r.habit_period, habitTimes: r.habit_times, targetValue: r.target_value === null ? null : Number(r.target_value),
    startValue: r.start_value === null ? null : Number(r.start_value), unit: r.unit, numberMode: r.number_mode,
  }));
  const ids = goals.map((g) => g.id);
  const [entries, checkins, steps, savings] = await Promise.all([
    db.from("goal_entries").select("goal_id, date, value, amount_fen, created_at").eq("user_id", userId).in("goal_id", ids).limit(5000),
    db.from("goal_checkins").select("goal_id, date").eq("user_id", userId).in("goal_id", ids).gte("date", addDays(today, -70)),
    db.from("goal_steps").select("id, goal_id, title, position, done_at").eq("user_id", userId).in("goal_id", ids),
    goals.some((g) => g.moneySource === "savings")
      ? db.from("savings_transactions").select("amount_fen").eq("user_id", userId).then((r) => (r.error ? null : r.data.reduce((s, t) => s + Number(t.amount_fen), 0)))
      : Promise.resolve(null),
  ]);
  for (const r of [entries, checkins, steps]) if (r.error) throw r.error;
  return goalsBriefingLine(
    goals,
    {
      entries: entries.data!.map((e) => ({ goalId: e.goal_id, date: e.date, value: e.value === null ? null : Number(e.value), amountFen: e.amount_fen === null ? null : Number(e.amount_fen), createdAt: e.created_at })),
      checkins: checkins.data!.map((c) => ({ goalId: c.goal_id, date: c.date })),
      steps: steps.data!.map((x) => ({ id: x.id, goalId: x.goal_id, title: x.title, position: x.position, done: x.done_at !== null })),
      // The bank balance needs the full My Money calculation; the briefing skips goals that follow it.
      balances: { savings, mainAccount: null },
    },
    today,
  );
}

export async function runNotifications(db: SupabaseClient, keys: VapidKeys, now = new Date()) {
  const summary = { users: 0, sent: 0, failed: 0, removed: 0, errors: 0 };
  const { data: subs, error } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) throw error;

  const byUser = new Map<string, (StoredSubscription & { id: string })[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  for (const [userId, devices] of byUser) {
    summary.users++;
    try {
      for (const notice of await noticesFor(db, userId, now)) {
        // Claim the notice first: if it's already logged, another run sent it.
        const { data: claimed, error: logError } = await db
          .from("push_log")
          .upsert({ user_id: userId, key: notice.key }, { onConflict: "user_id,key", ignoreDuplicates: true })
          .select("key");
        if (logError) throw logError;
        if (!claimed || claimed.length === 0) continue;

        const { key, ...message } = notice;
        const results = await Promise.all(devices.map((d) => sendPush(d, message, keys).then((r) => ({ d, r }))));
        for (const { d, r } of results) {
          if (r.ok) summary.sent++;
          else if (r.gone) {
            summary.removed++;
            await db.from("push_subscriptions").delete().eq("id", d.id).eq("user_id", userId);
          } else {
            summary.failed++;
            console.error("push not delivered", r.status, r.error);
          }
        }
        // Nothing got through (e.g. a network blip): unclaim so the next run retries.
        if (!results.some(({ r }) => r.ok)) await db.from("push_log").delete().eq("user_id", userId).eq("key", key);
      }
    } catch (e) {
      summary.errors++;
      console.error("notifications failed for a user", e);
    }
  }

  await db.from("push_log").delete().lt("sent_at", new Date(now.getTime() - 3 * 86_400_000).toISOString());
  return summary;
}
