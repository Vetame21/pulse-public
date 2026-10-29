"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

const SignupSchema = z
  .object({
    email: z.email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters.").max(72, "That password is too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

export type SignupState = { error: string | null; sent: boolean };

/** Create an account. Supabase emails a confirmation link that comes back to /auth/confirm. */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", sent: false };
  if (isDemoMode()) return { error: "Sign-up is off on the demo site.", sent: false };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    if (error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500) {
      return { error: "Can't reach the server right now. Check your connection and try again.", sent: false };
    }
    if (error.status === 429) return { error: "Too many sign-ups right now. Try again in a little while.", sent: false };
    if (error.code === "signup_disabled") return { error: "Sign-ups are closed at the moment.", sent: false };
    if (error.code === "weak_password") return { error: "Choose a stronger password.", sent: false };
    return { error: "Couldn't create the account. Try again.", sent: false };
  }
  // Email confirmation off: already signed in, go set up.
  if (data.session) redirect("/welcome");
  // Same answer whether or not the email already had an account, so nobody can probe emails.
  return { error: null, sent: true };
}
