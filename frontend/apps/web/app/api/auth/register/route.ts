import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  try {
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
