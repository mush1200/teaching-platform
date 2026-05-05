/**
 * Mock API layer — same async shape as future Node.js client.
 * Replace implementations with `fetch('/api/...')` when wiring backend.
 */

import type { MockAdminOrder, MockAdminStats, MockCartItem, MockMaterial, MockReview } from "./mock-data";
import { apiFetch } from "./api-client";
import type { Material, MaterialRatingStats } from "./api-types";
import { materialToMock } from "./material-mapper";
import {
  mockAdminRecentOrders,
  mockAdminStats,
  mockCartItems,
  mockMaterials,
  mockReviews,
} from "./mock-data";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CART_STORAGE_KEY_PREFIX = "tp_mock_cart_items_v1";
const CART_BOOTSTRAP_FLAG_PREFIX = "tp_mock_cart_bootstrap_v1";
const SPECIAL_SEED_EMAIL = "parent1@test.com";

function cloneCart(items: MockCartItem[]): MockCartItem[] {
  return items.map((c) => ({ ...c }));
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function currentUserEmail(): string {
  if (!canUseStorage()) return "guest";
  const email = window.localStorage.getItem("tp_user_email");
  return email && email.trim() ? email.trim().toLowerCase() : "guest";
}

function storageKeyForUser(email: string): string {
  return `${CART_STORAGE_KEY_PREFIX}:${email}`;
}

function bootstrapFlagKeyForUser(email: string): string {
  return `${CART_BOOTSTRAP_FLAG_PREFIX}:${email}`;
}

function specialSeedItemsForUser(email: string): MockCartItem[] | null {
  if (email !== SPECIAL_SEED_EMAIL) return null;
  return cloneCart(mockCartItems.slice(0, 2));
}

function readStoredCart(email: string): MockCartItem[] | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(storageKeyForUser(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every(
      (row) =>
        row &&
        typeof row === "object" &&
        typeof (row as MockCartItem).id === "string" &&
        typeof (row as MockCartItem).materialId === "string" &&
        typeof (row as MockCartItem).title === "string" &&
        typeof (row as MockCartItem).ageLabel === "string" &&
        typeof (row as MockCartItem).price === "number" &&
        typeof (row as MockCartItem).quantity === "number" &&
        typeof (row as MockCartItem).coverGradient === "string",
    );
    return valid ? (parsed as MockCartItem[]) : null;
  } catch {
    return null;
  }
}

function writeStoredCart(items: MockCartItem[]) {
  if (!canUseStorage()) return;
  const email = currentUserEmail();
  window.localStorage.setItem(storageKeyForUser(email), JSON.stringify(items));
  window.dispatchEvent(new Event("tp:cart-updated"));
}

export async function getMaterials(): Promise<MockMaterial[]> {
  await delay(120);
  return [...mockMaterials];
}

export async function getMaterialById(id: string): Promise<MockMaterial | null> {
  await delay(100);
  try {
    const [detailRes, ratingRes] = await Promise.all([
      apiFetch(`materials/${encodeURIComponent(id)}`),
      apiFetch(`materials/${encodeURIComponent(id)}/rating`),
    ]);
    if (detailRes.ok) {
      const row = (await detailRes.json()) as Material;
      const mock = materialToMock(row);
      if (ratingRes.ok) {
        const stats = (await ratingRes.json()) as MaterialRatingStats;
        const avg = stats.average;
        const cnt = stats.count ?? 0;
        mock.rating = avg != null && Number.isFinite(Number(avg)) ? Number(avg) : 0;
        mock.reviewCount = cnt;
      }
      return mock;
    }
  } catch {
    // fallback to local mock
  }
  return mockMaterials.find((m) => m.id === id) ?? null;
}

function apiReviewRowToMock(
  row: { id: string; rating: number; comment?: string | null; created_at?: string },
  idx: number,
  materialId: string,
): MockReview {
  const accents: MockReview["avatarAccent"][] = ["violet", "coral", "emerald", "amber"];
  return {
    id: row.id,
    materialId,
    userName: "家長",
    avatarAccent: accents[idx % accents.length] ?? "violet",
    rating: Number(row.rating) || 0,
    date: row.created_at
      ? new Date(row.created_at).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" })
      : "",
    content: (row.comment ?? "").trim() ? String(row.comment).trim() : "（無文字評論）",
    likes: 0,
  };
}

export async function getCartItems(): Promise<MockCartItem[]> {
  await delay(80);
  const email = currentUserEmail();
  const stored = readStoredCart(email);
  if (stored) return cloneCart(stored);

  const bootstrapKey = bootstrapFlagKeyForUser(email);
  const hasBootstrapped = canUseStorage() ? window.localStorage.getItem(bootstrapKey) === "1" : false;
  const specialSeed = specialSeedItemsForUser(email);
  const seeded = specialSeed && !hasBootstrapped ? specialSeed : cloneCart(mockCartItems);

  writeStoredCart(seeded);
  if (canUseStorage() && specialSeed && !hasBootstrapped) {
    window.localStorage.setItem(bootstrapKey, "1");
  }
  return seeded;
}

export async function replaceCartItems(items: MockCartItem[]): Promise<void> {
  await delay(50);
  writeStoredCart(cloneCart(items));
}

export async function getReviewsForMaterial(materialId: string): Promise<MockReview[]> {
  await delay(90);
  try {
    const res = await apiFetch(`materials/${encodeURIComponent(materialId)}/reviews`);
    if (res.ok) {
      const rows = (await res.json()) as Array<{
        id: string;
        rating: number;
        comment?: string | null;
        created_at?: string;
      }>;
      if (Array.isArray(rows)) {
        return rows.map((row, idx) => apiReviewRowToMock(row, idx, materialId));
      }
    }
  } catch {
    /* fallback */
  }
  return mockReviews.filter((r) => r.materialId === materialId);
}

export async function getAdminStats(): Promise<MockAdminStats> {
  await delay(100);
  return { ...mockAdminStats, orderStatusDonut: [...mockAdminStats.orderStatusDonut] };
}

export async function getAdminRecentOrders(): Promise<MockAdminOrder[]> {
  await delay(80);
  return mockAdminRecentOrders.map((o) => ({ ...o }));
}
