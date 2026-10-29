import "server-only";
import { createClient } from "@/lib/supabase/server";

/** For route handlers: the signed-in user's client, or null (respond 401). */
export async function userForRoute() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { supabase, userId: sub };
}

export function unauthorized() {
  return Response.json({ error: "Sign in first." }, { status: 401 });
}
