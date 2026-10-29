import Link from "next/link";
import { redirect } from "next/navigation";
import { DoneButton } from "@/components/done-button";
import { GoalCard } from "@/components/goal-card";
import { CakeIcon, ClassIcon, EventIcon, PinIcon, WalletIcon } from "@/components/icons";
import { Card, Label, ProgressBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { computeMonthBudget } from "@/lib/budget";
import { activeDeadlines, upcomingBirthdays } from "@/lib/briefing";
import { type CalendarEvent, holidayFor, upNext } from "@/lib/china-calendar";
import { ensureRentBill, listRentPayments } from "@/lib/data/apartment";
import { ensureMonthBudget } from "@/lib/data/budgets";
import { listBirthdays, listClasses, listEvents, listOpenDeadlines, listSemesters, regionHolidays } from "@/lib/data/calendar";
import { DayPlanCard } from "./plan/day-plan-card";
import { getDayPlan } from "@/lib/data/day-plans";
import { listGoals, loadGoalData } from "@/lib/data/goals";
import { listNotices } from "@/lib/data/notices";
import { loadIndices } from "@/lib/news/load";
import { INDICES, signedPct } from "@/lib/news/markets";
import { listExpenses } from "@/lib/data/expenses";
import { getMonthsReadyToClose, listClosings } from "@/lib/data/savings";
import { getSettings } from "@/lib/data/settings";
import { listThinkAgain } from "@/lib/data/think-again";
import { addDays, monthStart, parseISODate, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { groupItems } from "@/lib/think-again";
import { goalProgress } from "@/lib/goals";
import { noticesForToday } from "@/lib/notices";
import { classesOn } from "@/lib/timetable";
import { attentionItems, greeting } from "@/lib/today";

// Today: the front page of your day. What's next, what needs doing, how you're tracking.
export default async function TodayPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  // New accounts set up their region, currency and budget first.
  if (!settings.onboarded) redirect("/welcome");
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const month = monthStart(today);

  // One parallel round of queries (each round trip is a network hop to the database).
  // Apartment is a per-account feature: no rent bill (or reminder) unless it's on.
  const rentBillP = settings.features.rent ? ensureRentBill(supabase, settings) : Promise.resolve(null);
  const weekEnd = addDays(today, 7);
  const [budgetRow, expenses, readyToClose, rentPayments, thinkItems, events, holidays, deadlines, semesters, classes, birthdays, notices, goals, plan] = await Promise.all([
    ensureMonthBudget(supabase, settings, month),
    listExpenses(supabase, { month, sort: "newest" }),
    listClosings(supabase).then((c) => getMonthsReadyToClose(supabase, settings, today, c)),
    rentBillP.then((b) => (b ? listRentPayments(supabase, b.id) : [])),
    listThinkAgain(supabase),
    listEvents(supabase, today, weekEnd),
    regionHolidays(settings.region, [parseISODate(today).year, parseISODate(weekEnd).year]),
    listOpenDeadlines(supabase, addDays(today, 90)),
    listSemesters(supabase),
    listClasses(supabase),
    listBirthdays(supabase),
    listNotices(supabase, settings.timezone),
    listGoals(supabase, settings.timezone),
    getDayPlan(supabase, today),
  ]);
  const indicesP = loadIndices(900, 2500); // cached 15 min; never holds Today up more than 2.5 s
  const activeGoals = goals.filter((g) => !g.completed);
  const [goalData, indices] = await Promise.all([loadGoalData(supabase, settings, activeGoals), indicesP]);

  const b = computeMonthBudget({ month, budgetFen: budgetRow.budgetFen, today, trackingStart: settings.trackingStartDate, expenses });
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: settings.timezone }).format(new Date()));
  const nowTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: settings.timezone }).format(new Date());
  // Classes become dated entries so they line up with events in "Up next".
  const classEntries: CalendarEvent[] = Array.from({ length: 8 }, (_, i) => addDays(today, i)).flatMap((date) =>
    classesOn(date, semesters, classes, holidays).map((c) => ({
      id: `class:${c.id}:${date}`,
      title: c.title,
      date,
      endDate: null,
      startTime: c.startTime,
      endTime: c.endTime,
      location: c.room,
      notes: null,
      kind: "event" as const,
      leadDays: null,
      done: false,
    })),
  );
  const next = upNext([...events.filter((e) => e.kind === "event"), ...classEntries], today, nowTime, 6);
  // Grouped by day so each date is shown once.
  const nextByDay: { day: string; items: CalendarEvent[] }[] = [];
  for (const e of next) {
    const day = e.date < today ? today : e.date;
    const group = nextByDay.find((g) => g.day === day);
    if (group) group.items.push(e);
    else nextByDay.push({ day, items: [e] });
  }
  const todo = activeDeadlines(
    deadlines.map((d) => ({ id: d.id, title: d.title, date: d.date, startTime: d.startTime, leadDays: d.leadDays, done: d.done })),
    today,
  );
  const bdays = upcomingBirthdays(birthdays, today, 7);
  const classesToday = classEntries.filter((c) => c.date === today).length;
  const todayNotices = noticesForToday(notices, today);
  // The first official holiday or 调休 workday in the coming week.
  const holidayNotice = Array.from({ length: 8 }, (_, i) => addDays(today, i))
    .map((date) => ({ date, h: holidayFor(date, holidays) }))
    .find((x) => x.h);
  const dayName = (d: string) =>
    d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dateLine = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const attention = attentionItems({
    currency: settings.homeCurrency,
    overBudgetFen: b.budgetFen > 0 ? Math.max(0, b.spentFen - b.budgetFen) : 0,
    monthsToClose: readyToClose.map((r) => r.month),
    rentUnpaidThisMonth: settings.features.rent && !rentPayments.some((p) => p.month === month),
    dayOfMonth: parseISODate(today).day,
    thinkAgainReady: groupItems(thinkItems, today).ready.map((i) => i.name),
    backupAgeDays: settings.backupAgeDays,
    hasAnyData: expenses.length > 0,
  });

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-accent">{greeting(hour)}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{dateLine}</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
          </svg>
        </Link>
      </header>

      {/* BRIEFING */}
      <section aria-labelledby="briefing">
        <h2 id="briefing" className="text-lg font-semibold">Briefing</h2>
        <p className="text-sm text-muted">
          {classesToday === 0 ? "No classes today" : `${classesToday} class${classesToday > 1 ? "es" : ""} today`}
          {todo.length > 0 && ` · ${todo.length} deadline${todo.length > 1 ? "s" : ""} to work on`}
        </p>
        <Card className="mt-2">
          {bdays.map((b) => (
            <p key={b.id} className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${b.inDays === 0 ? "bg-accent-soft font-medium" : "bg-track/60"}`}>
              {b.inMemory ? (
                `🕯️ ${dayName(b.date)}: remembering ${b.name}`
              ) : (
                <>
                  <CakeIcon className="text-warning" />
                  {`${dayName(b.date)}: ${b.name}'s birthday${b.turns !== null ? ` (${b.turns})` : ""}${b.inDays === 0 ? " 🎉" : ""}`}
                </>
              )}
            </p>
          ))}
          {holidayNotice?.h && (
            <p className={`mb-3 rounded-xl px-3 py-2 text-sm ${holidayNotice.h.off ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
              {holidayNotice.h.off
                ? `🇨🇳 ${dayName(holidayNotice.date)}: ${holidayNotice.h.name} holiday`
                : `💼 ${dayName(holidayNotice.date)}: make-up workday for ${holidayNotice.h.name} (调休)`}
            </p>
          )}
          {todo.length > 0 && (
            <div className="mb-3">
              <Label>Work on</Label>
              <ul className="mt-1 divide-y divide-line">
                {todo.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/calendar/${d.id}`} className="min-w-0">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className={`block text-xs ${d.daysLeft < 0 ? "font-semibold text-danger" : d.daysLeft <= 2 ? "text-warning" : "text-muted"}`}>
                        {d.daysLeft < 0
                          ? `Overdue by ${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"}`
                          : d.daysLeft === 0
                            ? `Due today${d.startTime ? ` at ${d.startTime}` : ""}`
                            : `Due ${dayName(d.date)} · ${d.daysLeft} day${d.daysLeft > 1 ? "s" : ""} left`}
                      </span>
                    </Link>
                    <DoneButton id={d.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {todo.length > 0 && <Label>Up next</Label>}
          {next.length === 0 ? (
            <p className="text-sm text-muted">Nothing planned for the next 7 days.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {nextByDay.map((g) => (
                <div key={g.day}>
                  <p className="text-xs font-semibold text-muted">{dayName(g.day)}</p>
                  <ul className="divide-y divide-line">
                    {g.items.map((e) => {
                      const isClass = e.id.startsWith("class:");
                      const Icon = isClass ? ClassIcon : EventIcon;
                      return (
                        <li key={e.id}>
                          <Link href={isClass ? "/calendar/timetable" : `/calendar/${e.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                            <span className="flex min-w-0 items-start gap-2">
                              <Icon className="mt-0.5 text-accent" />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{e.title}</span>
                                {e.location && (
                                  <span className="flex items-center gap-1 text-xs text-muted">
                                    <PinIcon size={12} /> {e.location}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="tabular shrink-0 text-xs text-muted">
                              {e.startTime ? (e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime) : "All day"}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <Link href="/calendar" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
            Open Calendar →
          </Link>
        </Card>
      </section>

      {/* TODAY'S PLAN */}
      <section aria-labelledby="plan">
        <h2 id="plan" className="text-lg font-semibold">Today&apos;s plan</h2>
        <Card className="mt-2">
          <DayPlanCard date={today} body={plan?.body ?? ""} items={plan?.items ?? []} />
        </Card>
      </section>

      {/* MARKETS */}
      <Link href="/news" className="block">
        <Card>
          <div className="flex items-baseline justify-between">
            <Label>Markets &amp; news</Label>
            <span className="text-sm text-muted" aria-hidden>
              ›
            </span>
          </div>
          {indices.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Headlines for China, HK, Singapore, Indonesia, US, Europe, AI and chips.</p>
          ) : (
            <p className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {indices.slice(0, 5).map((q) => (
                <span key={q.symbol}>
                  {INDICES.find((i) => i.symbol === q.symbol)?.short}{" "}
                  <span className={q.changePct > 0 ? "text-accent" : q.changePct < 0 ? "text-danger" : "text-muted"}>{signedPct(q.changePct)}</span>
                </span>
              ))}
            </p>
          )}
        </Card>
      </Link>

      {/* NOTICES */}
      {todayNotices.length > 0 && (
        <section aria-labelledby="notices">
          <h2 id="notices" className="text-lg font-semibold">Notices</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
            {todayNotices.map((n) => (
              <li key={n.id}>
                <Link href="/notices" className="block px-5 py-3 text-sm">
                  <span className="block text-xs font-semibold text-muted">
                    {n.pinned && <span className="text-accent">Pinned · </span>}
                    {n.source ?? "My note"}
                  </span>
                  <span className="mt-0.5 line-clamp-2 whitespace-pre-line [overflow-wrap:anywhere]">{n.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* NEEDS ATTENTION */}
      {attention.length > 0 && (
        <section aria-labelledby="attention">
          <h2 id="attention" className="text-lg font-semibold">Needs attention</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                  <span className="min-w-0">
                    <span aria-hidden>{a.emoji}</span> {a.text}
                  </span>
                  <span className="text-muted" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PROGRESS */}
      <section aria-labelledby="progress">
        <h2 id="progress" className="text-lg font-semibold">Progress</h2>
        <div className="mt-2 flex flex-col gap-3">
          <Link href="/money" className="block">
            <Card>
              <div className="flex items-baseline justify-between">
                <Label>
                  <span className="inline-flex items-center gap-1.5">
                    <WalletIcon size={14} /> Money
                  </span>
                </Label>
                <span className="text-sm text-muted" aria-hidden>
                  ›
                </span>
              </div>
              <p className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-semibold tracking-tight ${b.remainingFen < 0 ? "text-danger" : ""}`}>
                  {fmt(Math.abs(b.remainingFen))}
                </span>
                <span className="text-sm text-muted">{b.remainingFen < 0 ? "over budget" : "left this month"}</span>
              </p>
              <div className="mt-3">
                <ProgressBar value={b.progress} tone={b.status === "over_budget" ? "danger" : b.status === "above_pace" ? "warning" : "accent"} />
              </div>
              <p className="tabular mt-2 text-sm text-muted">
                {fmt(b.safeDailyFen ?? 0)}/day safe · {fmt(b.spentTodayFen ?? 0)} spent today
              </p>
            </Card>
          </Link>
          {activeGoals.map((g) => (
            <GoalCard key={g.id} goal={g} progress={goalProgress(g, goalData, today)} />
          ))}
          <Link href={activeGoals.length ? "/goals" : "/goals/new"} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">
            {activeGoals.length ? "All goals →" : "＋ Add a goal"}
          </Link>
        </div>
      </section>
    </>
  );
}
