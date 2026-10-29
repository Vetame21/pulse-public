"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { findDates } from "@/lib/notice-dates";
import type { ActionState } from "../actions";

const NoticeSchema = z.object({
  id: z.uuid(),
  body: z.string().trim().min(1, "Paste or type the notice first.").max(5000, "That's too long (5,000 characters max)."),
  source: z.string().trim().max(100),
  pinned: z.enum(["on", ""]),
});

export async function saveNotice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = NoticeSchema.safeParse(Object.fromEntries(["id", "body", "source", "pinned"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  try {
    const { supabase, user } = await requireUser();
    const today = todayIn((await getSettings(supabase, user.id)).timezone);
    // The last date it mentions decides when it's archived (see lib/notices.ts).
    const dates = findDates(f.body, today).map((d) => d.date).sort();
    const { error } = await supabase.from("notices").insert({
      id: f.id,
      body: f.body,
      source: f.source || null,
      pinned: f.pinned === "on",
      related_date: dates.length > 0 ? dates[dates.length - 1] : null,
    });
    if (error && error.code !== "23505") throw error;
    refresh();
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("saveNotice failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
}

async function updateNotice(id: string, values: Record<string, unknown>, what: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid notice." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("notices").update(values).eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: null };
  } catch (error) {
    console.error(`${what} failed`, error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

export async function setNoticePinned(id: string, pinned: boolean): Promise<ActionState> {
  return updateNotice(id, { pinned }, "setNoticePinned");
}

export async function setNoticeArchived(id: string, archived: boolean): Promise<ActionState> {
  // Restoring pins it, so it doesn't fall straight back into the archive (old or past-date notices would).
  return updateNotice(id, archived ? { archived_at: new Date().toISOString(), pinned: false } : { archived_at: null, pinned: true }, "setNoticeArchived");
}

export async function deleteNotice(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid notice." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteNotice failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}
