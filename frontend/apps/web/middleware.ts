import { NextRequest, NextResponse } from "next/server";

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
