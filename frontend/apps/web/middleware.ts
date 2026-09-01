import { NextRequest, NextResponse } from "next/server";
import { getLandingRouteForRole } from "./lib/session";

/**
 * FRONTEND UX GUARD — NOT an authorization boundary.
 *
 * `tp_token` / `tp_role` are non-HttpOnly cookies written by the browser after login
 * (see app/login/page.tsx), so a user can edit them freely from devtools. They are used
 * here only as a UX hint: to send anonymous visitors to /login and to avoid rendering a
 * shell whose API calls will obviously fail.
 *
 * They are NEVER an authorization decision. Every piece of data is authorized by the
 * Backend against the signed JWT sent as `Authorization: Bearer` (see
 * Backend/middlewares/auth.js). This middleware does not read, decode or verify that JWT.
 * Consequently, forging `tp_role=admin` yields an empty admin shell whose requests all
 * return 403 — no data is exposed.
 *
 * Real session verification (server-set HttpOnly cookie + server-side check) is Phase 2.
 */

type RoleHint = "parent" | "teacher" | "creator" | "admin";

/** Routes that require a signed-in session (UX-level only). */
const LOGIN_REQUIRED_PREFIXES = [
  "/cart",
  "/checkout",
  "/orders",
  "/me",
  "/downloads",
  "/favorites",
  "/dashboard",
  "/explore",
  "/my-reviews",
  "/creator",
  "/teacher",
  "/admin",
] as const;

function startsWithPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function redirectToForbidden(request: NextRequest) {
  return NextResponse.redirect(new URL("/403", request.url));
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get("tp_token")?.value;
  const role = request.cookies.get("tp_role")?.value as RoleHint | undefined;
  const pathname = request.nextUrl.pathname;

  // Canonicalize legacy creator routes: /teacher/* -> /creator/*
  if (startsWithPrefix(pathname, "/teacher")) {
    const canonicalUrl = new URL(request.url);
    canonicalUrl.pathname = pathname.replace("/teacher", "/creator");
    return NextResponse.redirect(canonicalUrl, 308);
  }

  /*
   * Signed-in landing redirect at the site root (`DX-15`).
   *
   * ## Why this is here and not (only) in `app/page.tsx`
   *
   * The same redirect used to live exclusively in a `useEffect` on the home page, which
   * means it could only run **after client hydration**. Measured on the production build:
   * hydration 1.5–1.9s, then the landing RSC fetch 0.03–0.55s — 2.3s at best, 4.2s at
   * worst. Under a parallel Playwright run (N workers against a single `next start`
   * process) both of those are load-dependent, so the tail intermittently crossed the
   * 5s assertion budget. The product was never wrong — a 20s-budget diagnostic redirected
   * 8/8 times — it was just slower than the assertion under load, which is exactly why the
   * failure kept migrating between sibling tests and projects and vanished on isolated
   * reruns. Doing it here removes the hydration dependency entirely: the browser is told
   * to go elsewhere before the home page is ever served.
   *
   * ## This is still a UX landing hint, not a new authorization boundary
   *
   * It reads the same forgeable `tp_role` cookie the guards below already use, and sends
   * the visitor to a route those very guards will then re-check. Forging `tp_role=admin`
   * lands you on an empty `/admin` shell whose every request returns 403 — identical to
   * navigating there directly today. No new trust is placed in the cookie.
   *
   * ## Destinations come from the single canonical map
   *
   * `getLandingRouteForRole` (`lib/session.ts`) is the one source of truth — the same one
   * `app/page.tsx` and `app/login/page.tsx` use. `DX-17` was caused by that map existing in
   * two places and drifting; this must not become a third copy. An unrecognised role
   * returns `null` and therefore **stays on the public homepage**, rather than guessing.
   *
   * ## The client-side effect in `app/page.tsx` is deliberately kept
   *
   * It is **not** dead code and must not be removed as a duplicate: it triggers on
   * `localStorage`, this triggers on the cookie, and the two can legitimately disagree —
   * the cookie is `max-age=86400` (login/register) while the JWT lives 7 days. A visitor
   * whose cookie expired but whose localStorage survives is invisible here, and the client
   * effect still gives them their landing route (which then bounces to `/login`, exactly
   * as it does today). Removing it would silently change that case, so it stays.
   */
  if (pathname === "/") {
    const landing = token && role ? getLandingRouteForRole(role) : null;
    if (landing) return NextResponse.redirect(new URL(landing, request.url));
    return NextResponse.next();
  }

  const requiresLogin = LOGIN_REQUIRED_PREFIXES.some((p) => startsWithPrefix(pathname, p));
  if (!requiresLogin) return NextResponse.next();

  if (!token || !role) {
    return redirectToLogin(request);
  }

  // Role hints below only pick the right shell; the Backend still authorizes every call.
  if (startsWithPrefix(pathname, "/creator") && role !== "teacher" && role !== "creator" && role !== "admin") {
    return redirectToForbidden(request);
  }
  if (startsWithPrefix(pathname, "/admin") && role !== "admin") {
    return redirectToForbidden(request);
  }
  if (startsWithPrefix(pathname, "/cart") && role !== "parent") {
    return redirectToForbidden(request);
  }
  if (startsWithPrefix(pathname, "/dashboard") && role !== "parent") {
    return redirectToForbidden(request);
  }
  if (startsWithPrefix(pathname, "/explore") && role !== "parent") {
    return NextResponse.redirect(new URL("/materials", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Exact site root only (`DX-15`) — `"/"` does not match `/anything` in Next's matcher,
     * so no other public route starts going through this middleware because of it.
     */
    "/",
    "/cart",
    "/cart/:path*",
    "/checkout",
    "/checkout/:path*",
    "/orders",
    "/orders/:path*",
    "/me",
    "/me/:path*",
    "/downloads",
    "/downloads/:path*",
    "/favorites",
    "/favorites/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/explore",
    "/explore/:path*",
    "/teacher/:path*",
    "/creator",
    "/creator/:path*",
    "/admin",
    "/admin/:path*",
    "/my-reviews",
  ],
};
