import type { Metadata } from "next";
import Link from "next/link";
import { Card, Label, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "More · Pulse" };

const SECTIONS: { title: string; items: { href: string; emoji: string; label: string; hint: string }[] }[] = [
  {
    title: "Life",
    items: [
      { href: "/notices", emoji: "📢", label: "Notices", hint: "Group messages and your own notes" },
      { href: "/goals", emoji: "🎯", label: "Goals", hint: "Money, habits, numbers, milestones" },
      { href: "/news", emoji: "📰", label: "News", hint: "Markets, Asia and world headlines, AI, chips" },
      { href: "/calendar/timetable", emoji: "🎓", label: "Timetable", hint: "Your classes this semester" },
      { href: "/calendar/birthdays", emoji: "🎂", label: "Birthdays", hint: "Everyone, soonest first" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/savings", emoji: "🏦", label: "Savings", hint: "Savings Box and month closing" },
      { href: "/accounts", emoji: "💳", label: "Accounts", hint: "Apartment, restaurants, Family, My Money, Think Again" },
      { href: "/history", emoji: "📊", label: "Spending history", hint: "Week, month, 6 months, year" },
      { href: "/recap", emoji: "🎁", label: "Monthly recap", hint: "Your month, wrapped" },
      { href: "/arc", emoji: "🎮", label: "Your arc", hint: "Monk to Chaos" },
    ],
  },
  {
    title: "App",
    items: [{ href: "/settings", emoji: "⚙️", label: "Settings", hint: "Exchange rate, theme, backup, sign out" }],
  },
];

const COMING = ["🤖 AI assistant with Qwen (later)"];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <Label>{s.title}</Label>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
            {s.items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="text-xl" aria-hidden>
                    {i.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{i.label}</span>
                    <span className="block truncate text-xs text-muted">{i.hint}</span>
                  </span>
                  <span className="text-muted" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Card>
        <Label>Coming next</Label>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
          {COMING.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
