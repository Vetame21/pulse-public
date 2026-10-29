import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookie, secureCookies } from "@/lib/supabase/cookies";
import { DEMO_COOKIE, isDemoMode } from "@/lib/demo";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { isAndroidWebView, WEBVIEW_BLOCKED_HTML } from "@/lib/webview";

const PUBLIC_PATHS = ["/login", "/signup"];

// Runs before every page request: refreshes the Supabase session cookie and
// sends signed-out visitors to /login. Pages and server actions still verify
// the user themselves (see lib/auth.ts); this is only the first gate.
export async function proxy(request: NextRequest) {
  // Pulse isn't available inside other people's Android apps (WebView wrappers).
  if (isAndroidWebView(request.headers.get("user-agent"))) {
    return new NextResponse(WEBVIEW_BLOCKED_HTML, {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  let response = NextResponse.next({ request });
  if (isDemoMode()) return gate(request, response, request.cookies.has(DEMO_COOKIE));
  const { url, key } = getSupabaseEnv();
  const secure = secureCookies(request.headers.get("host"));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, hardenCookie(options, secure)),
        );
        Object.entries(headers ?? {}).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  return gate(request, response, Boolean(data?.claims?.sub));
}

function gate(request: NextRequest, response: NextResponse, signedIn: boolean) {
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  // The email confirmation link signs you in itself: let it through either way.
  if (request.nextUrl.pathname.startsWith("/auth/")) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (!signedIn && !isPublic) {
    return redirectWithCookies(request, response, "/login");
  }
  if (signedIn && isPublic) {
    return redirectWithCookies(request, response, "/");
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectWithCookies(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

export const config = {
  // The manifest, icons and service worker must load before sign-in (phones fetch them without cookies).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
