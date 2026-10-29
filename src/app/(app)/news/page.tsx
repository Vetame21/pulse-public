import type { Metadata } from "next";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { loadFx, loadHeadlines, loadIndices } from "@/lib/news/load";
import { signedPct } from "@/lib/news/markets";

export const metadata: Metadata = { title: "News · Pulse" };

const ago = (d: Date | null, now: Date) => {
  if (!d) return "";
  const min = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  return min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
};

export default async function NewsPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const now = new Date();
  const [indices, fx, sections] = await Promise.all([loadIndices(), loadFx(todayIn(settings.timezone, now)), loadHeadlines(now)]);
  const tone = (n: number | null) => (n === null ? "text-muted" : n > 0 ? "text-accent" : n < 0 ? "text-danger" : "text-muted");

  return (
    <>
      <BackLink href="/" label="Today" />
      <PageHeader title="News" eyebrow="Markets and headlines" />

      <Card>
        <Label>Markets</Label>
        {indices.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Market data isn&apos;t available right now.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {indices.map((q) => (
              <li key={q.symbol} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{q.name}</span>
                <span className={`tabular shrink-0 font-semibold ${tone(q.changePct)}`}>
                  {q.changePct > 0 ? "▲" : q.changePct < 0 ? "▼" : ""} {signedPct(q.changePct)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {fx.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            {fx.map((r) => (
              <li key={r.code} className="flex items-baseline justify-between gap-2">
                <span className="tabular">{`1 ${r.code} = ¥${r.perUnit.toFixed(r.perUnit < 1 ? 3 : 2)}`}</span>
                {r.changePct !== null && <span className="tabular text-xs text-muted">{signedPct(r.changePct)}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Daily change vs the previous close. Rates: ECB reference.</p>
      </Card>

      {sections.map((s) => (
        <section key={s.id}>
          <h2 className="text-sm font-semibold text-muted">{s.label}</h2>
          {s.items.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No new headlines right now.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
              {s.items.map((i) => (
                <li key={i.link}>
                  <a href={i.link} target="_blank" rel="noopener noreferrer" className="block px-4 py-3">
                    <span className="block text-sm font-medium [overflow-wrap:anywhere]">{i.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {i.source}
                      {i.published && ` · ${ago(i.published, now)} ago`}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="text-center text-xs text-muted">Headlines from each publisher&apos;s public feed, refreshed every 30 minutes. AI summaries (Qwen) come later.</p>
    </>
  );
}
