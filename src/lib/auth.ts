import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer entry point: every page and server action that touches
// financial data calls this first. Row Level Security in the database is the
// second, independent guard.
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    redirect("/login");
  }
  return {
    supabase,
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null },
  };
}
