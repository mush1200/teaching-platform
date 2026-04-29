/**
 * Mock API layer — same async shape as future Node.js client.
 * Replace implementations with `fetch('/api/...')` when wiring backend.
 */

import type { MockAdminOrder, MockAdminStats, MockCartItem, MockMaterial, MockReview } from "./mock-data";
import { apiFetch } from "./api-client";
import type { Material } from "./api-types";
import { materialToMock } from "./material-mapper";
import {
  mockAdminRecentOrders,
  mockAdminStats,
  mockCartItems,
  mockMaterials,
  mockReviews,
} from "./mock-data";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getMaterials(): Promise<MockMaterial[]> {
  await delay(120);
  return [...mockMaterials];
}

export async function getMaterialById(id: string): Promise<MockMaterial | null> {
  await delay(100);
  try {
    const res = await apiFetch(`materials/${encodeURIComponent(id)}`);
    if (res.ok) {
      const row = (await res.json()) as Material;
      return materialToMock(row);
    }
  } catch {
    // fallback to local mock
  }
  return mockMaterials.find((m) => m.id === id) ?? null;
}

export async function getCartItems(): Promise<MockCartItem[]> {
  await delay(80);
  return mockCartItems.map((c) => ({ ...c }));
}

export async function getReviewsForMaterial(materialId: string): Promise<MockReview[]> {
  await delay(90);
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
