import type { Metadata } from "next";
import Link from "next/link";
import { DeadlineIcon, EventIcon } from "@/components/icons";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listNotices } from "@/lib/data/notices";
import { getSettings } from "@/lib/data/settings";
import { addDays, todayIn } from "@/lib/dates";
import { suggestFromNotice } from "@/lib/notice-dates";
import { isArchived } from "@/lib/notices";
import { NoticeActions, NoticeComposer } from "./notice-parts";

export const metadata: Metadata = { title: "Notices · Pulse" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function NoticesPage({ searchParams }: PageProps<"/notices">) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim() ?? "";
  const showArchived = one(sp.view) === "archived";
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const today = todayIn(settings.timezone);
  const all = await listNotices(supabase, settings.timezone, q);

  const archivedCount = all.filter((n) => isArchived(n, today)).length;
  // Searching looks everywhere; otherwise show the board or the archive.
  const shown = q ? all : all.filter((n) => isArchived(n, today) === showArchived);
  const notices = [...shown].sort((a, b) => Number(b.pinned && !showArchived) - Number(a.pinned && !showArchived));
  const sources = [...new Set(all.map((n) => n.source).filter((s): s is string => !!s))].slice(0, 20);

  const day = (d: string) =>
    d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : d === addDays(today, 1) ? "Tomorrow" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <BackLink href="/more" label="More" />
      <PageHeader title="Notices" />

      <Card>
        <NoticeComposer sources={sources} autoFocus={one(sp.new) === "1"} />
      </Card>

      <form action="/notices" className="flex gap-2" role="search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search notices</span>
          <input name="q" defaultValue={q} placeholder="Search notices" className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent" />
        </label>
        {q ? (
          <Link href="/notices" className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted">
            Clear
          </Link>
        ) : (
          <button type="submit" className="h-11 rounded-xl border border-line px-4 text-sm font-semibold">
            Search
          </button>
        )}
      </form>

      {!q && (
        <nav aria-label="Notices view" className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
          {[
            ["Board", "/notices", !showArchived],
            [`Archived (${archivedCount})`, "/notices?view=archived", showArchived],
          ].map(([label, href, on]) => (
            <Link
              key={String(href)}
              href={String(href)}
              aria-current={on ? "page" : undefined}
              className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold ${on ? "bg-surface shadow-card" : "text-muted"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      {notices.length === 0 ? (
        <p className="text-center text-sm text-muted">
          {q ? `Nothing matches "${q}".` : showArchived ? "Nothing archived yet." : "No notices. Paste a group message above to keep it here."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notices.map((n) => {
            const archived = isArchived(n, today);
            const s = suggestFromNotice(n.body, today);
            const KindIcon = s.kind === "deadline" ? DeadlineIcon : EventIcon;
            return (
              <li key={n.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <p className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="min-w-0 truncate font-semibold">
                    {n.pinned && !archived && <span className="text-accent">Pinned · </span>}
                    {n.source ?? "My note"}
                  </span>
                  <span className="shrink-0">{day(n.createdDate)}</span>
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{n.body}</p>

                {n.linkedEventId ? (
                  <Link href={`/calendar/${n.linkedEventId}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
                    ✓ In your calendar
                  </Link>
                ) : (
                  !archived &&
                  s.dates.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {s.dates.map((d) => {
                        const params = new URLSearchParams({ date: d.date, kind: s.kind, title: s.title || n.body.slice(0, 60), notice: n.id });
                        if (s.time) params.set("time", s.time);
                        return (
                          <Link
                            key={d.date}
                            href={`/calendar/new?${params}`}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-soft px-3 text-sm font-medium"
                          >
                            <KindIcon className="text-accent" />
                            Add {s.kind} · {day(d.date)}
                            {s.time && ` ${s.time}`}
                          </Link>
                        );
                      })}
                    </div>
                  )
                )}

                <div className="mt-1 border-t border-line pt-1">
                  <NoticeActions id={n.id} pinned={n.pinned} archived={n.archived || archived} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
