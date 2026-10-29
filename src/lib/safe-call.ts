import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/app/(app)/actions";

export const OFFLINE_MESSAGE =
  "Couldn't reach the app — check your connection or VPN. Your entry is still here; tap Save again (it won't be saved twice).";

/**
 * Run a server action from the browser. If the request itself fails (dropped
 * connection, VPN hiccup, server restarting) return an error state instead of
 * throwing, so the form keeps what was typed.
 */
export async function safeCall(action: () => Promise<ActionState>, offlineMessage = OFFLINE_MESSAGE): Promise<ActionState> {
  try {
    return await action();
  } catch (error) {
    // Let Next.js handle its own control flow (e.g. redirect() after closing a month).
    unstable_rethrow(error);
    // warn, not error: the form already shows a message, and the dev overlay pops up on console.error
    console.warn("Server action failed to complete", error);
    return { ok: false, message: offlineMessage };
  }
}
