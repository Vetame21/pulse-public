import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account · Pulse" };

export default function SignupPage() {
  if (isDemoMode()) redirect("/login"); // the demo site has no sign-up
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-sm font-medium text-accent">Pulse</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-muted">Your day, money and plans in one private place.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <SignupForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
