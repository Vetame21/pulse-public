import type { Metadata } from "next";
import { ArcSpectrum } from "@/components/arc-card";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { ARCS, type ArcKey, FLAVOURS } from "@/lib/arc";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { getArcState } from "@/lib/data/arc";
import { listExpenses } from "@/lib/data/expenses";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, monthStart, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";

export const metadata: Metadata = { title: "Your arc · Pulse" };

const ORDER: ArcKey[] = ["monk", "frugal", "balanced", "hedon", "chaos", "fresh"];

export default async function ArcPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const expenses = await listExpenses(supabase, { month: monthStart(today) });
  const state = await getArcState(supabase, settings, today, expenses);
  const a = ARCS[state.arc];
  const flavour = state.flavour ? FLAVOURS[state.flavour] : null;
  const seen = new Set(state.months.map((m) => m.arc));

  return (
    <>
      <BackLink href="/money" label="Money" />
      <PageHeader title="Your arc" eyebrow="Spending game" />

      <Card>
        <p className="text-5xl" aria-hidden>
          {a.emoji}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {flavour && state.arc !== "fresh" ? `${flavour.name} ` : ""}
          {a.name}
        </p>
        <p className="mt-1 text-sm text-muted">{a.line}</p>
        {state.pace !== null && state.arc !== "fresh" && (
          <p className="mt-2 text-sm">
            You&apos;re spending at <span className="font-semibold">{Math.round(state.pace * 100)}%</span> of your planned pace.
          </p>
        )}
        <div className="mt-4">
          <ArcSpectrum pace={state.pace} arc={state.arc} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-track/60 p-3">
            <p className="text-xl font-semibold">🔥 {state.streak}</p>
            <p className="text-[11px] text-muted">days in a row within your daily allowance</p>
          </div>
          <div className="rounded-xl bg-track/60 p-3">
            <p className="text-xl font-semibold">🚫💸 {state.noSpendThisMonth}</p>
            <p className="text-[11px] text-muted">no-spend days this month</p>
          </div>
          <div className="rounded-xl bg-track/60 p-3">
            <p className="text-xl font-semibold">{state.comeback ? "📈" : "—"}</p>
            <p className="text-[11px] text-muted">{state.comeback ? "Comeback: hot last month, calm now" : "No comeback needed"}</p>
          </div>
        </div>
      </Card>

      <Card>
        <Label>All arcs</Label>
        <ul className="mt-3 flex flex-col gap-2">
          {ORDER.map((k) => (
            <li
              key={k}
              className={`flex items-start gap-3 rounded-xl p-3 ${k === state.arc ? "bg-accent-soft" : seen.has(k) ? "bg-track/60" : "border border-dashed border-line"}`}
            >
              <span className="text-2xl" aria-hidden>
                {ARCS[k].emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {ARCS[k].name}
                  {k === state.arc ? " · now" : seen.has(k) ? " · unlocked" : ""}
                </span>
                <span className="block text-xs text-muted">{ARCS[k].howTo}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Pace = what you&apos;ve spent so far ÷ what your budget allows for the days so far. 100% means exactly on plan.
        </p>
      </Card>

      <Card>
        <Label>Flavours</Label>
        <p className="mt-1 text-xs text-muted">When one category is at least 45% of your month&apos;s spending (and at least 100), it flavours your arc.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {CATEGORIES.map((c) => (
            <div key={c.key} className={`rounded-xl px-3 py-2 ${state.flavour === c.key ? "bg-accent-soft font-semibold" : "bg-track/60"}`}>
              {FLAVOURS[c.key].emoji} {FLAVOURS[c.key].name} <span className="text-xs text-muted">· {c.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Label>Your arcs by month</Label>
        <ul className="mt-2 divide-y divide-line">
          {[...state.months].reverse().map((m) => (
            <li key={m.month} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">
                  {formatMonth(m.month)}
                  {m.partial && <span className="text-muted"> · partial</span>}
                  {m.month === monthStart(today) && <span className="text-muted"> · so far</span>}
                </span>
                <span className="tabular block text-xs text-muted">
                  {fmt(m.spentFen)}
                  {m.pace !== null && ` · ${Math.round(m.pace * 100)}% of pace`}
                </span>
              </span>
              <span className="text-sm font-medium">
                {ARCS[m.arc].emoji} {ARCS[m.arc].name}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
