import type { UserRole } from "./api-types";
import { mapStatusMessage } from "./auth";

const STORAGE_TOKEN = "tp_token";

/**
 * Authorization source of truth is the JWT below, sent as `Authorization: Bearer` and
 * verified by the Backend. The `tp_role` cookie/localStorage value is only a UX hint used
 * by middleware.ts and the shells to pick which chrome to render — it is client-writable
 * and must never be treated as a permission.
 */

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_TOKEN);
}

export function getStoredRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  const r = localStorage.getItem("tp_role");
  if (r === "parent" || r === "teacher" || r === "admin") return r;
  return null;
}

/** Proxied backend call: GET/POST/DELETE `/api/backend/<path>` */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (init?.body instanceof FormData) {
    headers.delete("Content-Type");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const body = init?.body;
  if (body != null && !headers.has("Content-Type")) {
    if (typeof body === "string") {
      headers.set("Content-Type", "application/json; charset=utf-8");
    } else if (body instanceof URLSearchParams) {
      headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
  }

  const url = `/api/backend/${path.replace(/^\//, "")}`;
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function parseApiErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (data.message && typeof data.message === "string") {
      return data.message;
    }
  } catch {
    /* ignore */
  }
  return mapStatusMessage(response.status);
}
