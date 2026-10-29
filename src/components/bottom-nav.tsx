"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DeadlineIcon, EventIcon, ExpenseIcon, NoticeIcon } from "./icons";

// Money covers every finance page; More covers settings and the rest.
const MONEY_PATHS = ["/money", "/transactions", "/history", "/recap", "/arc", "/savings", "/accounts"];

const TABS = [
  { href: "/", label: "Today", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon, match: (p: string) => p.startsWith("/calendar") },
  { href: "/add", label: "Add", icon: PlusIcon, primary: true, match: (p: string) => p.startsWith("/add") },
  { href: "/money", label: "Money", icon: WalletIcon, match: (p: string) => MONEY_PATHS.some((m) => p.startsWith(m)) },
  { href: "/more", label: "More", icon: MoreIcon, match: (p: string) => p.startsWith("/more") || p.startsWith("/settings") || p.startsWith("/notices") || p.startsWith("/goals") || p.startsWith("/news") },
];

const ADD_CHOICES = [
  { href: "/add", label: "Expense", hint: "Money you spent", icon: ExpenseIcon },
  { href: "/calendar/new", label: "Event", hint: "Class, exam, dinner…", icon: EventIcon },
  { href: "/calendar/new?kind=deadline", label: "Deadline", hint: "Homework, submission", icon: DeadlineIcon },
  { href: "/notices?new=1", label: "Notice", hint: "Paste a group message or a note", icon: NoticeIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);
  // Close the chooser after navigating (state reset during render, no effect needed).
  if (adding && openedOn !== pathname) setAdding(false);

  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAdding(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding]);

  return (
    <>
      {adding && (
        <div className="fixed inset-0 z-30" onClick={() => setAdding(false)}>
          <div className="absolute inset-0 bg-foreground/20" aria-hidden />
          <div
            id="add-menu"
            role="menu"
            aria-label="Add"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] mx-auto max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
          >
            {ADD_CHOICES.map(({ href, label, hint, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setAdding(false)}
                className="flex min-h-14 items-center gap-3 border-b border-line px-4 last:border-b-0 active:bg-track"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {TABS.map(({ href, label, icon: Icon, primary, match }) => (
          <li key={href} className="flex-1">
            {primary ? (
              <button
                type="button"
                onClick={() => {
                  setOpenedOn(pathname);
                  setAdding((a) => !a);
                }}
                aria-expanded={adding}
                aria-controls="add-menu"
                aria-label={adding ? "Close add menu" : "Add"}
                className="flex h-16 w-full items-center justify-center"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-card transition-transform duration-150 ${adding ? "rotate-45" : ""}`}
                >
                  <Icon />
                </span>
              </button>
            ) : (
            <Link
              href={href}
              aria-current={match(pathname) ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                match(pathname) ? "text-accent" : "text-muted"
              }`}
            >
              <Icon />
              {label}
            </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
    </>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...iconProps} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a2 2 0 0 1 2-2h13v4" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" />
      <path d="M16 14.5h.01" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}
