import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode } from "@/lib/demo";
import { DemoButton, LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Pulse" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const confirmed = (await searchParams).confirmed === "1";
  const demo = isDemoMode();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-sm font-medium text-accent">Pulse</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Private. Sign in to see your day.</p>
        </div>
        {confirmed && (
          <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
            If you just confirmed your email, sign in here to set up Pulse.
          </p>
        )}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          {demo ? (
            <>
              <p className="mb-3 text-sm text-muted">Look around with made-up data: your own copy, no sign-up. Nothing you change is kept.</p>
              <DemoButton />
            </>
          ) : (
            <LoginForm />
          )}
        </div>
        {!demo && (
          <p className="mt-6 text-center text-sm text-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-accent">
              Create an account
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
