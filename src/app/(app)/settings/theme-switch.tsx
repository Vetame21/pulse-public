"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

function read(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function apply(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // Private mode: the choice just won't be remembered.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  listeners.forEach((l) => l());
}

/** Appearance, remembered on this device only. */
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-track p-1">
      {(
        [
          ["system", "Auto"],
          ["light", "☀️ Light"],
          ["dark", "🌙 Dark"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => apply(value)}
          aria-pressed={theme === value}
          className={`h-9 rounded-lg text-sm font-semibold ${theme === value ? "bg-surface shadow-card" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
