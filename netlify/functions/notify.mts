// Scheduled every 10 minutes: sends the morning briefing and reminders that are due.
// Scheduled functions can't be called by URL on the live site, only by Netlify's scheduler.
import { createClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "../../src/lib/push/config";
import { runNotifications } from "../../src/lib/push/run";
import { vapidKeyProblem } from "../../src/lib/push/webpush";

export default async function notify() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!url || !secretKey || !vapidPrivateKey) {
    console.error("notify: SUPABASE_URL, SUPABASE_SECRET_KEY or VAPID_PRIVATE_KEY is not set");
    return new Response("not configured", { status: 500 });
  }
  const keys = { publicKey: VAPID_PUBLIC_KEY, privateKey: vapidPrivateKey, subject: VAPID_SUBJECT };
  const problem = vapidKeyProblem(keys);
  if (problem) {
    console.error(`notify: VAPID_PRIVATE_KEY is wrong: ${problem}`);
    return new Response("misconfigured", { status: 500 });
  }
  const db = createClient(url, secretKey.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
  const summary = await runNotifications(db, keys);
  console.log("notify", JSON.stringify(summary));
  return new Response("ok");
}

export const config = { schedule: "*/10 * * * *" };
