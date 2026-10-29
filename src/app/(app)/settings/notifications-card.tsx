"use client";

import { useEffect, useState, useTransition } from "react";
import { BellIcon, ClassIcon, DeadlineIcon, EventIcon, SunIcon } from "@/components/icons";
import { VAPID_PUBLIC_KEY } from "@/lib/push/config";
import { safeCall } from "@/lib/safe-call";
import { useSafeForm } from "@/lib/use-safe-form";
import type { ActionState } from "../actions";
import { removeDevice, removePushSubscription, saveNotificationPrefs, savePushSubscription, sendTestNotification } from "./notification-actions";

type Status = "checking" | "not-set-up" | "unsupported" | "needs-home-screen" | "blocked" | "off" | "on";
type Prefs = { briefingTime: string; classes: boolean; events: boolean; deadlines: boolean };
type Device = { id: string; name: string; added: string; tail: string };

// Some browsers never finish registering a service worker; don't show "Checking…" forever.
const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

const keyBytes = (b64u: string) => {
  const s = atob(b64u.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const deviceName = () => {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Browser";
};

export function NotificationsCard({ prefs, devices }: { prefs: Prefs; devices: Device[] }) {
  const [status, setStatus] = useState<Status>("checking");
  const [myTail, setMyTail] = useState<string | null>(null);
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (!VAPID_PUBLIC_KEY) return setStatus("not-set-up"); // this server has no push keys
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!supported) return setStatus(ios && !standalone ? "needs-home-screen" : "unsupported");
      if (Notification.permission === "denied") return setStatus("blocked");
      try {
        const reg = await withTimeout(navigator.serviceWorker.register("/sw.js", { scope: "/" }), 4000);
        const sub = await withTimeout(reg.pushManager.getSubscription(), 4000);
        setMyTail(sub ? sub.endpoint.slice(-16) : null);
        setStatus(sub ? "on" : "off");
      } catch {
        setStatus("unsupported");
      }
    })();
  }, []);

  function turnOn() {
    startTransition(async () => {
      // Ask first, straight from the tap: iPhone only allows the prompt from a tap.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
        const res = await safeCall(() => savePushSubscription(sub.toJSON(), deviceName()));
        setResult(res);
        if (res.ok) {
          setStatus("on");
          setMyTail(sub.endpoint.slice(-16));
        }
      } catch (e) {
        console.warn("subscribe failed", e);
        setResult({ ok: false, message: "Couldn't turn on notifications on this device. Try again." });
      }
    });
  }

  function turnOff() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const res = await safeCall(() => removePushSubscription(sub.endpoint));
        if (!res.ok) return setResult(res);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMyTail(null);
      setResult({ ok: true, message: "Notifications are off for this device." });
    });
  }

  function remove(id: string) {
    startTransition(async () => setResult(await safeCall(() => removeDevice(id), "Couldn't reach the app. Try again.")));
  }

  function test() {
    startTransition(async () => setResult(await safeCall(sendTestNotification, "Couldn't reach the app. Try again.")));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {status === "checking" && <p className="text-sm text-muted">Checking this device…</p>}
        {status === "needs-home-screen" && (
          <p className="text-sm">
            On iPhone, notifications only work in the Home Screen app. In Safari tap <strong>Share → Add to Home Screen</strong>, then open Pulse from that icon and come back here.
          </p>
        )}
        {status === "not-set-up" && <p className="text-sm text-muted">Notifications aren&apos;t set up on this server.</p>}
        {status === "unsupported" && <p className="text-sm text-muted">This browser can&apos;t receive notifications.</p>}
        {status === "blocked" && (
          <p className="text-sm text-warning">
            Notifications are blocked for Pulse. On iPhone: <strong>Settings → Notifications → Pulse → Allow Notifications</strong>, then reopen the app.
          </p>
        )}
        {(status === "off" || status === "on") && (
          <div className="flex flex-wrap items-center gap-2">
            {status === "off" ? (
              <button type="button" onClick={turnOn} disabled={pending} className="flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent shadow-card disabled:opacity-60">
                <BellIcon /> {pending ? "Turning on…" : "Turn on notifications"}
              </button>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <BellIcon className="text-accent" /> On for this device
                </span>
                <button type="button" onClick={test} disabled={pending} className="h-11 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
                  Send a test
                </button>
                <button type="button" onClick={turnOff} disabled={pending} className="h-11 rounded-xl px-3 text-sm text-muted disabled:opacity-60">
                  Turn off
                </button>
              </>
            )}
          </div>
        )}
        {result?.message && <p className={`mt-2 text-sm ${result.ok ? "text-accent" : "text-danger"}`}>{result.message}</p>}
        {devices.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No devices yet.</p>
        ) : (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted">Receiving notifications</p>
            <ul className="mt-1 divide-y divide-line">
              {devices.map((d) => (
                <li key={d.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                  <span>
                    {d.name}
                    <span className="text-xs text-muted">
                      {" "}
                      · added {d.added}
                      {d.tail === myTail && " · this device"}
                    </span>
                  </span>
                  {d.tail !== myTail && (
                    <button type="button" onClick={() => remove(d.id)} disabled={pending} className="h-11 px-2 text-xs font-semibold text-muted disabled:opacity-60">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <PrefsForm prefs={prefs} />
    </div>
  );
}

/** Each change saves straight away. */
function PrefsForm({ prefs }: { prefs: Prefs }) {
  const { state, formAction, pending } = useSafeForm(saveNotificationPrefs, { withId: false, resetOnSuccess: false });
  const box = "h-5 w-5 shrink-0 accent-[var(--color-accent)]";
  const row = "flex min-h-11 items-center gap-3 text-sm";
  return (
    <form action={formAction} onChange={(e) => e.currentTarget.requestSubmit()} className="flex flex-col gap-1 border-t border-line pt-3">
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-3">
          <SunIcon className="text-accent" /> Morning briefing at
        </span>
        <input name="briefingTime" type="time" defaultValue={prefs.briefingTime} required className="h-11 rounded-xl border border-line bg-surface px-3 text-base" />
      </label>
      <label className={row}>
        <input type="checkbox" name="classes" defaultChecked={prefs.classes} className={box} />
        <ClassIcon className="text-muted" /> 15–25 min before each class
      </label>
      <label className={row}>
        <input type="checkbox" name="events" defaultChecked={prefs.events} className={box} />
        <EventIcon className="text-muted" /> 30–40 min before your timed events
      </label>
      <label className={row}>
        <input type="checkbox" name="deadlines" defaultChecked={prefs.deadlines} className={box} />
        <DeadlineIcon className="text-muted" /> 21:00 the night before a deadline
      </label>
      <p className={`min-h-5 text-xs ${state.ok ? "text-muted" : "text-danger"}`} aria-live="polite">
        {pending ? "Saving…" : state.message}
      </p>
    </form>
  );
}
