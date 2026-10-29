import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "@/lib/dates";
import type { Notice } from "@/lib/notices";

type Row = {
  id: string;
  body: string;
  source: string | null;
  pinned: boolean;
  related_date: string | null;
  linked_event_id: string | null;
  archived_at: string | null;
  created_at: string;
};

/** Your notices, newest first. With a search, matches in the text or the source (archived ones too). */
export async function listNotices(supabase: SupabaseClient, timezone: string, search?: string): Promise<Notice[]> {
  let query = supabase.from("notices").select("id, body, source, pinned, related_date, linked_event_id, archived_at, created_at");
  const q = search?.trim().replace(/[%_,()]/g, " ").slice(0, 100);
  if (q) query = query.or(`body.ilike.%${q}%,source.ilike.%${q}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(`Couldn't load your notices: ${error.message}`);
  return (data as Row[]).map((r) => ({
    id: r.id,
    body: r.body,
    source: r.source,
    pinned: r.pinned,
    relatedDate: r.related_date,
    linkedEventId: r.linked_event_id,
    archived: r.archived_at !== null,
    createdDate: todayIn(timezone, new Date(r.created_at)),
  }));
}
