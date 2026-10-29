import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_VERSION, BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, BACKUP_TABLES, type BackupTable } from "@/lib/backup";

const PAGE = 1000; // Supabase returns at most 1000 rows per request, so read in pages.

export async function fetchAllRows(supabase: SupabaseClient, table: string, orderBy = "id") {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Everything you own, as one portable object. user_id is left out; restore assigns it. */
export async function buildBackup(supabase: SupabaseClient, timezone: string) {
  const entries = await Promise.all(
    BACKUP_TABLES.map(async (table) => {
      const rows = await fetchAllRows(supabase, table, table === "settings" ? "user_id" : "id");
      return [table, rows.map((r) => Object.fromEntries(Object.entries(r).filter(([key]) => key !== "user_id")))] as const;
    }),
  );
  return {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    app_version: APP_VERSION,
    exported_at: new Date().toISOString(),
    timezone,
    tables: Object.fromEntries(entries) as Record<BackupTable, Record<string, unknown>[]>,
  };
}
