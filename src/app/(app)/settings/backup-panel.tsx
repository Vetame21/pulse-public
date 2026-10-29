"use client";

import { useState, useTransition } from "react";
import { type Backup, type BackupSummary, BackupSchema, summarizeBackup } from "@/lib/backup";
import { formatMonth } from "@/lib/dates";
import { type RestoreResult, restoreBackup } from "./backup-actions";

async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Download the current data first, so a Replace can always be undone. */
async function downloadSafetyBackup(): Promise<boolean> {
  const res = await fetch("/api/backup", { cache: "no-store" });
  if (!res.ok) return false;
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "pulse-backup.json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(".json", "-before-restore.json");
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

function monthLabel(m: string) {
  return formatMonth(`${m}-01`);
}

export function BackupPanel({
  lastBackupAt,
  daysSince,
  timezone,
}: {
  lastBackupAt: string | null;
  daysSince: number | null;
  timezone: string;
}) {
  const [file, setFile] = useState<{ name: string; text: string; backup: Backup; summary: BackupSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    setFile(null);
    setConfirmText("");
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = BackupSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "This file isn't a valid backup.");
        return;
      }
      setFile({ name: f.name, text, backup: parsed.data, summary: summarizeBackup(parsed.data) });
    } catch {
      setError("This file couldn't be read. Choose a .json backup exported from this app.");
    }
  }

  function restore(mode: "merge" | "replace") {
    if (!file) return;
    startTransition(async () => {
      try {
        if (mode === "replace") {
          setStatus("Downloading a safety backup of your current data…");
          if (!(await downloadSafetyBackup())) {
            setStatus(null);
            setResult({ ok: false, message: "Couldn't download a safety backup first, so nothing was replaced. Try again." });
            return;
          }
        }
        setStatus("Restoring…");
        const res = await restoreBackup(await gzipToBase64(file.text), mode);
        setResult(res);
        if (res.ok) {
          setFile(null);
          setConfirmText("");
        }
      } catch {
        setResult({ ok: false, message: "Couldn't reach the app. Nothing was changed; try again." });
      } finally {
        setStatus(null);
      }
    });
  }

  const s = file?.summary;

  return (
    <div className="flex flex-col gap-4">
      <p className={`text-sm ${daysSince === null || daysSince > 30 ? "text-warning" : "text-muted"}`}>
        Last backup:{" "}
        {lastBackupAt
          ? `${new Date(lastBackupAt).toLocaleString("en-GB", { timeZone: timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} (${daysSince === 0 ? "today" : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`})`
          : "never"}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <a href="/api/backup" className="flex h-11 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-on-accent">
          Export full backup
        </a>
        <a href="/api/export/csv" className="flex h-11 items-center justify-center rounded-xl border border-line text-sm font-semibold">
          Export CSV
        </a>
      </div>
      <p className="text-xs text-muted">
        The backup is one .json file with everything. Keep it somewhere safe (iCloud Drive, Google Drive). The free
        Supabase plan has no automatic backups.
      </p>

      <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line text-sm font-semibold">
        Import backup…
        <input type="file" accept="application/json,.json" onChange={pick} className="sr-only" />
      </label>

      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {file && s && (
        <div className="rounded-xl border border-line p-4">
          <p className="text-sm font-semibold">{file.name}</p>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-muted">Backup date</dt>
            <dd className="text-right">
              {new Date(s.exportedAt).toLocaleString("en-GB", { timeZone: timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </dd>
            <dt className="text-muted">Transactions</dt>
            <dd className="tabular text-right">{s.transactions} ({s.personalExpenses} personal)</dd>
            <dt className="text-muted">Months included</dt>
            <dd className="text-right">
              {s.months.length === 0 ? "none" : s.months.length === 1 ? monthLabel(s.months[0]) : `${monthLabel(s.months[0])} – ${monthLabel(s.months[s.months.length - 1])}`}
            </dd>
            <dt className="text-muted">Savings records</dt>
            <dd className="tabular text-right">{s.savingsRecords} ({s.closings} month closings)</dd>
            <dt className="text-muted">Family Money records</dt>
            <dd className="tabular text-right">{s.familyRecords}</dd>
            <dt className="text-muted">Restaurant wallets</dt>
            <dd className="tabular text-right">{s.restaurantWallets} ({s.restaurantTransactions} transactions)</dd>
          </dl>

          <p className="mt-4 text-sm font-semibold">Restore this backup?</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => restore("merge")}
            className="mt-2 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            Merge (add what&apos;s missing)
          </button>
          <p className="mt-1 text-xs text-muted">Keeps everything you have now. Records already here are skipped, so nothing is duplicated.</p>

          <div className="mt-4 rounded-xl bg-danger-soft p-3">
            <p className="text-sm font-semibold text-danger">Replace everything</p>
            <p className="mt-1 text-xs text-danger">
              Deletes all your current data and loads this backup instead. A safety backup of your current data downloads
              first. Type REPLACE to confirm.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="REPLACE"
                autoCapitalize="characters"
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
              />
              <button
                type="button"
                disabled={pending || confirmText !== "REPLACE"}
                onClick={() => restore("replace")}
                className="h-10 rounded-lg bg-danger px-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {status && <p className="text-sm text-muted">{status}</p>}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${result.ok ? "bg-accent-soft" : "bg-danger-soft text-danger"}`}>
          {result.ok
            ? result.added === 0
              ? "Everything in this backup was already here. Nothing was added."
              : `Restored: ${result.added} record${result.added === 1 ? "" : "s"} added${result.alreadyThere ? `, ${result.alreadyThere} already here (skipped)` : ""}.`
            : result.message}
        </p>
      )}
    </div>
  );
}
