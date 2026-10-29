// Android apps that wrap a website in a WebView mark it with "; wv)" in the user agent.
// Chrome itself (and Trusted Web Activities, which run in Chrome) don't, so the
// official way to install Pulse keeps working.

/** True for an Android in-app WebView, e.g. "...(Linux; Android 14; Pixel 8 Build/AP1A; wv) ...". */
export function isAndroidWebView(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /Android/.test(userAgent) && /;\s*wv\)/.test(userAgent);
}

/** Shown instead of Pulse inside someone else's app. */
export const WEBVIEW_BLOCKED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Open Pulse in your browser</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f1e8;color:#102421;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}a{color:#0b7a56;font-weight:600}</style>
</head><body><main><h1>Open Pulse in your browser</h1>
<p>This app isn't the official Pulse. Open this page in Chrome or Safari instead.</p></main></body></html>`;
