import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/server-api-base-url";

export async function POST(request: Request) {
  try {
    // `PRE-12`：在 handler 內取值，production 缺漏即明確失敗，不靜默退回 localhost。
    const API_BASE_URL = getServerApiBaseUrl();
    const body = await request.json();
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({ message: "invalid response payload" }));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error("proxy /api/auth/register failed:", error);
    return NextResponse.json({ message: "server error" }, { status: 500 });
  }
}
