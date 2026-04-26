import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

/** First path segment allowlist — mirrors public backend routes used by the web app */
const ALLOW_ROOT = new Set([
  "auth",
  "materials",
  "cart",
  "orders",
  "download",
  "reviews",
  "me",
  "reports",
  "health",
  "admin",
  "teacher",
]);

function isAllowed(segments: string[]): boolean {
  if (segments.length === 0) return false;
  return ALLOW_ROOT.has(segments[0]);
}

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  if (!isAllowed(segments)) {
    return NextResponse.json({ message: "not allowed" }, { status: 403 });
  }

  const path = segments.join("/");
  const incoming = new URL(request.url);
  const targetUrl = `${API_BASE_URL}/${path}${incoming.search}`;

  const headersOut = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) {
    headersOut.set("Authorization", auth);
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headersOut.set("Content-Type", contentType);
  }

  const init: RequestInit = {
    method: request.method,
    headers: headersOut,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 0) {
      init.body = buf;
    }
  }

  const upstream = await fetch(targetUrl, init);
  const text = await upstream.text();
  const ct = upstream.headers.get("content-type") ?? "application/json";
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": ct },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}
