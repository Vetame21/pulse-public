// Server-only environment variables (deliberately not NEXT_PUBLIC_*), so they
// are never bundled into browser JavaScript.
export function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.",
    );
  }
  return { url, key };
}
