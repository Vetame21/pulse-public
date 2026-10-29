// Public half of the web push (VAPID) key pair. Safe to publish: phones use it to
// check that notifications really come from this app. The private half lives only
// in the VAPID_PRIVATE_KEY environment variable. Generate your own pair; see the README.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
// Who runs this app (a URL or mailto:), sent to the push services with each notification.
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
