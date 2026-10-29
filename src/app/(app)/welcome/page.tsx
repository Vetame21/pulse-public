import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome · Pulse" };

export default async function WelcomePage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  if (settings.onboarded) redirect("/");
  return (
    <>
      <PageHeader title="Welcome to Pulse" eyebrow="Two quick questions" />
      <p className="-mt-2 text-sm text-muted">Your day, money and plans in one place. Set it up for where you live.</p>
      <WelcomeForm />
    </>
  );
}
