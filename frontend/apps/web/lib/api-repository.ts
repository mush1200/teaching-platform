import type { MockCartItem, MockMaterial, MockReview } from "./view-models";
import { apiFetch } from "./api-client";
import type { Material, MaterialRatingStats, MaterialsListResponse } from "./api-types";
import { materialToMock } from "./material-mapper";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickCartGradient(id: string): string {
  const palette = ["from-violet-200 to-indigo-100", "from-rose-100 to-orange-50", "from-emerald-100 to-cyan-50", "from-amber-100 to-yellow-50"];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[hash] ?? palette[0];
}

export async function getMaterials(): Promise<MockMaterial[]> {
  await delay(120);
  try {
    const res = await apiFetch("materials");
    if (!res.ok) return [];
    const payload = (await res.json()) as MaterialsListResponse | Material[];
    const items = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(items)) return [];
    return items.map((row) => materialToMock(row));
  } catch {
    return [];
  }
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
    return null;
  }
  return null;
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
    audienceRole: "parent",
    avatarAccent: accents[idx % accents.length] ?? "violet",
    rating: Number(row.rating) || 0,
    date: row.created_at ?? "",
    content: (row.comment ?? "").trim() ? String(row.comment).trim() : "（無文字教學回饋）",
    likes: 0,
  };
}

export async function getCartItems(): Promise<MockCartItem[]> {
  await delay(80);
  try {
    const res = await apiFetch("cart");
    if (!res.ok) return [];
    const payload = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const rows = Array.isArray(payload.items) ? payload.items : [];
    return rows.map((row) => {
      const materialId = String(row.material_id ?? "");
      return {
        id: String(row.id ?? ""),
        materialId,
        title: String(row.title ?? "教材"),
        ageLabel: row.age_range ? `適合 ${String(row.age_range).replace(/^適合\s*/, "")}` : "適合全年齡",
        price: Number(row.price ?? 0),
        quantity: Math.max(1, Number(row.quantity ?? 1)),
        coverGradient: pickCartGradient(materialId || String(row.id ?? "")),
      };
    });
  } catch {
    return [];
  }
}

export async function replaceCartItems(items: MockCartItem[]): Promise<void> {
  await delay(50);
  for (const item of items) {
    await apiFetch(`cart/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: item.quantity }),
    });
  }
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
    return [];
  }
  return [];
}
