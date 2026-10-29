"use client";

import { useEffect } from "react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mt-10 rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
      <p className="text-3xl" aria-hidden>
        📡
      </p>
      <h1 className="mt-3 text-lg font-semibold">Couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-muted">
        The connection to the app or database dropped. Nothing you already saved is lost. Check your connection or VPN
        and try again.
      </p>
      <button onClick={() => retry()} className="mt-5 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent">
        Try again
      </button>
    </section>
  );
}
