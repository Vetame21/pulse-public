"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "../actions";

/** Turn per-account features on or off (Family Money, Apartment). */
export async function saveFeatures(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("settings")
      .update({ family_enabled: fd.get("family") === "on", rent_enabled: fd.get("rent") === "on" })
      .eq("user_id", user.id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("saveFeatures failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}
