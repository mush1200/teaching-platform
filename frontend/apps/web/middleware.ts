import { NextRequest, NextResponse } from "next/server";

type Role = "parent" | "teacher" | "admin";

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get("tp_token")?.value;
  const role = request.cookies.get("tp_role")?.value as Role | undefined;
  const pathname = request.nextUrl.pathname;

  const isProtected =
    pathname.startsWith("/cart") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/admin") ||
    pathname === "/my-reviews";
  if (!isProtected) return NextResponse.next();

  if (!token || !role) {
    return redirectToLogin(request);
  }

  if (pathname.startsWith("/teacher") && role !== "teacher" && role !== "admin") {
    return NextResponse.redirect(new URL("/403", request.url));
  }
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/403", request.url));
  }
  if (pathname.startsWith("/cart") && role !== "parent") {
    return NextResponse.redirect(new URL("/403", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cart/:path*", "/teacher/:path*", "/admin/:path*", "/my-reviews"],
};

