import { NextRequest, NextResponse } from "next/server";

type Role = "parent" | "teacher" | "creator" | "admin";

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get("tp_token")?.value;
  const role = request.cookies.get("tp_role")?.value as Role | undefined;
  const pathname = request.nextUrl.pathname;

  // Canonicalize legacy creator routes: /teacher/* -> /creator/*
  if (pathname.startsWith("/teacher")) {
    const canonicalUrl = new URL(request.url);
    canonicalUrl.pathname = pathname.replace("/teacher", "/creator");
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const isProtected =
    pathname.startsWith("/cart") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/creator") ||
    pathname.startsWith("/admin") ||
    pathname === "/my-reviews";
  if (!isProtected) return NextResponse.next();

  if (!token || !role) {
    return redirectToLogin(request);
  }

  if ((pathname.startsWith("/teacher") || pathname.startsWith("/creator")) && role !== "teacher" && role !== "creator" && role !== "admin") {
    return NextResponse.redirect(new URL("/403", request.url));
  }
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/403", request.url));
  }
  if (pathname.startsWith("/cart") && role !== "parent") {
    return NextResponse.redirect(new URL("/403", request.url));
  }
  if (pathname.startsWith("/dashboard") && role !== "parent") {
    return NextResponse.redirect(new URL("/403", request.url));
  }
  if (pathname.startsWith("/explore")) {
    if (role !== "parent") {
      return NextResponse.redirect(new URL("/materials", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/cart/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/explore",
    "/explore/:path*",
    "/teacher/:path*",
    "/creator/:path*",
    "/admin/:path*",
    "/my-reviews",
  ],
};

