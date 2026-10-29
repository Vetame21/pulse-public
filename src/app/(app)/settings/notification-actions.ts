"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/push/config";
import { isPushEndpoint, sendPush, vapidKeyProblem } from "@/lib/push/webpush";
import type { ActionState } from "../actions";

const SubscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine(isPushEndpoint, "Unknown push service."),
  keys: z.object({ p256dh: z.string().min(80).max(100), auth: z.string().min(16).max(30) }),
});

/** Save this device's push address (from the browser's PushManager). */
export async function savePushSubscription(subscription: unknown, device: string): Promise<ActionState> {
  const parsed = SubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, message: "This browser gave an unexpected subscription. Try again." };
  const { endpoint, keys } = parsed.data;
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, device: device.slice(0, 200) || null }, { onConflict: "endpoint" });
    if (error) throw error;
    refresh();
    return { ok: true, message: "Notifications are on for this device." };
  } catch (error) {
    console.error("savePushSubscription failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

export async function removePushSubscription(endpoint: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Notifications are off for this device." };
  } catch (error) {
    console.error("removePushSubscription failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

/** Remove one device from the list in Settings (e.g. an old phone or browser). */
export async function removeDevice(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid device." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Removed." };
  } catch (error) {
    console.error("removeDevice failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

/** Send a test notification to every device you turned notifications on for. */
export async function sendTestNotification(): Promise<ActionState> {
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!privateKey) return { ok: false, message: "Notifications aren't set up on the server yet (VAPID_PRIVATE_KEY is missing)." };
  const keys = { publicKey: VAPID_PUBLIC_KEY, privateKey, subject: VAPID_SUBJECT };
  const problem = vapidKeyProblem(keys);
  if (problem) return { ok: false, message: `The server's VAPID_PRIVATE_KEY is wrong: ${problem}. Paste it into Netlify again.` };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (error) throw error;
    if (data.length === 0) return { ok: false, message: "No device has notifications on yet." };
    const results = await Promise.all(
      data.map((s) => sendPush(s, { title: "Pulse 👋", body: "Notifications work! Your briefing will arrive here every morning.", url: "/settings", tag: "test" }, keys)),
    );
    const gone = data.filter((_, i) => results[i].gone).map((s) => s.id);
    if (gone.length > 0) await supabase.from("push_subscriptions").delete().in("id", gone);
    const sent = results.filter((r) => r.ok).length;
    if (sent === 0) {
      console.error("test notification failed", results);
      return { ok: false, message: `Not delivered: ${results.map((r) => `${r.status || "no response"}${r.error ? ` (${r.error})` : ""}`).join("; ")}` };
    }
    return { ok: true, message: `Sent to ${sent} device${sent > 1 ? "s" : ""}. It should pop up in a few seconds.` };
  } catch (error) {
    console.error("sendTestNotification failed", error);
    return { ok: false, message: "Couldn't send. Try again." };
  }
}

const PrefsSchema = z.object({
  briefingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time for the briefing."),
  classes: z.enum(["on", ""]),
  events: z.enum(["on", ""]),
  deadlines: z.enum(["on", ""]),
});

export async function saveNotificationPrefs(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = PrefsSchema.safeParse(Object.fromEntries(["briefingTime", "classes", "events", "deadlines"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("settings")
      .update({ notify_briefing_time: f.briefingTime, notify_classes: f.classes === "on", notify_events: f.events === "on", notify_deadlines: f.deadlines === "on" })
      .eq("user_id", user.id);
    if (error) throw error;
    refresh();
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("saveNotificationPrefs failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
}
