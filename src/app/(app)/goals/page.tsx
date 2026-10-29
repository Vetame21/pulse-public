import type { Metadata } from "next";
import Link from "next/link";
import { GoalCard } from "@/components/goal-card";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listGoals, loadGoalData } from "@/lib/data/goals";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";

export const metadata: Metadata = { title: "Goals · Pulse" };

export default async function GoalsPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const today = todayIn(settings.timezone);
  const goals = await listGoals(supabase, settings.timezone);
  const data = await loadGoalData(supabase, settings, goals);
  const active = goals.filter((g) => !g.completed);
  const done = goals.filter((g) => g.completed);

  return (
    <>
      <BackLink href="/" label="Today" />
      <PageHeader
        title="Goals"
        action={
          <Link href="/goals/new" className="flex h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent shadow-card">
            ＋ Goal
          </Link>
        }
      />
      {active.length === 0 ? (
        <p className="text-sm text-muted">No goals yet. Money, habits, numbers or a checklist: tap ＋ Goal to start one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((g) => (
            <GoalCard key={g.id} goal={g} progress={goalProgress(g, data, today)} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted">Done</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
            {done.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">✓ {g.title}</span>
                  <span className="text-xs text-muted">{goalProgress(g, data, today).text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
