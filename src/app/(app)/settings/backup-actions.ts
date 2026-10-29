"use server";

import { gunzipSync } from "node:zlib";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { BACKUP_TABLES, BackupSchema } from "@/lib/backup";
import { DEMO_BLOCKED, isDemoMode } from "@/lib/demo";

export type RestoreResult =
  | { ok: true; added: number; alreadyThere: number; perTable: Record<string, { in_backup: number; added: number }> }
  | { ok: false; message: string };

const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;

/**
 * Restore a backup. The browser sends the file gzip-compressed (base64) so
 * large backups stay under upload limits. Everything happens in one database
 * transaction: it fully succeeds or changes nothing.
 */
export async function restoreBackup(gzippedBase64: string, mode: "merge" | "replace"): Promise<RestoreResult> {
  if (mode !== "merge" && mode !== "replace") return { ok: false, message: "Unknown restore mode." };

  let parsedJson: unknown;
  try {
    const text = gunzipSync(Buffer.from(gzippedBase64, "base64"), { maxOutputLength: MAX_UNZIPPED_BYTES }).toString("utf8");
    parsedJson = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file couldn't be read. Is it a backup exported from this app?" };
  }

  const parsed = BackupSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `This backup isn't valid: ${issue?.message ?? "unknown problem"}${issue?.path.length ? ` (${issue.path.join(" → ")})` : ""}.` };
  }

  try {
    const { supabase } = await requireUser();
    if (isDemoMode()) return { ok: false, message: DEMO_BLOCKED };
    const { data, error } = await supabase.rpc("restore_backup", { payload: parsed.data, mode });
    if (error) {
      console.error("restore_backup failed", error);
      return {
        ok: false,
        message:
          mode === "merge"
            ? `Nothing was changed. The backup conflicts with your current data (${error.message}). Try "Replace" instead.`
            : `Nothing was changed. The database rejected the backup: ${error.message}`,
      };
    }
    const perTable = data as Record<string, { in_backup: number; added: number }>;
    let added = 0;
    let inBackup = 0;
    for (const t of BACKUP_TABLES) {
      added += perTable[t]?.added ?? 0;
      inBackup += perTable[t]?.in_backup ?? 0;
    }
    refresh();
    return { ok: true, added, alreadyThere: inBackup - added, perTable };
  } catch (error) {
    console.error("restoreBackup failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was changed; try again." };
  }
}
