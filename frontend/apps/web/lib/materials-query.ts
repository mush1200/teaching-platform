import type { Material, MaterialsListResponse, MaterialsPagination } from "./api-types";
import { apiFetch } from "./api-client";
import { materialToMock } from "./material-mapper";
import type { MockMaterial } from "./mock-data";
import { getMaterials } from "./edu-api-mock";
import { mockMaterials } from "./mock-data";

export type MaterialsSort = "popular" | "latest" | "rating" | "recommended";

export type ListMaterialsParams = {
  search?: string;
  category?: string;
  age?: string;
  price_min?: number;
  price_max?: number;
  rating?: number;
  sort?: MaterialsSort;
  page?: number;
  limit?: number;
};

export type ListMaterialsResult = {
  items: MockMaterial[];
  pagination: MaterialsPagination;
  usedMockFallback: boolean;
};

function buildQueryString(params: ListMaterialsParams): string {
  const q = new URLSearchParams();
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.category && params.category !== "all") q.set("category", params.category);
  if (params.age?.trim()) q.set("age", params.age.trim());
  if (params.price_min != null) q.set("price_min", String(params.price_min));
  if (params.price_max != null) q.set("price_max", String(params.price_max));
  if (params.rating != null) q.set("rating", String(params.rating));
  if (params.sort) q.set("sort", params.sort === "recommended" ? "recommended" : params.sort);
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  return q.toString();
}

function parseAgeRangeLabel(label: string): [number, number] | null {
  const nums = label.match(/\d+/g)?.map((s) => Number.parseInt(s, 10));
  if (!nums || nums.length === 0) return null;
  if (nums.length === 1) return [nums[0], nums[0]];
  return [Math.min(...nums), Math.max(...nums)];
}

function parseAgeFilter(age: string): [number, number] | null {
  const t = age.trim();
  const dash = t.split(/[-–~〜]/).map((s) => s.trim());
  if (dash.length >= 2) {
    const a = Number.parseInt(dash[0], 10);
    const b = Number.parseInt(dash[1], 10);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return [Math.min(a, b), Math.max(a, b)];
  }
  const single = Number.parseInt(t, 10);
  if (!Number.isNaN(single)) return [single, single];
  return null;
}

function ageOverlaps(material: MockMaterial, filterRange: [number, number]): boolean {
  const mr = parseAgeRangeLabel(material.ageLabel);
  if (!mr) return true;
  const [f0, f1] = filterRange;
  const [m0, m1] = mr;
  return !(m1 < f0 || m0 > f1);
}

function sortMaterials(list: MockMaterial[], sort: MaterialsSort | undefined): MockMaterial[] {
  const s = sort ?? "popular";
  const copy = [...list];
  if (s === "popular") {
    copy.sort((a, b) => b.learners - a.learners || b.reviewCount - a.reviewCount);
    return copy;
  }
  if (s === "latest") {
    copy.sort((a, b) => {
      const da = a.publishedAt ?? "";
      const db = b.publishedAt ?? "";
      if (da !== db) return db.localeCompare(da);
      return b.id.localeCompare(a.id);
    });
    return copy;
  }
  if (s === "rating") {
    copy.sort((a, b) => {
      const ra = a.rating * Math.min(1, Math.log10(a.reviewCount + 1));
      const rb = b.rating * Math.min(1, Math.log10(b.reviewCount + 1));
      if (rb !== ra) return rb - ra;
      return b.rating - a.rating;
    });
    return copy;
  }
  if (s === "recommended") {
    copy.sort((a, b) => b.learners - a.learners);
    return copy;
  }
  return copy;
}

function filterMaterials(all: MockMaterial[], params: ListMaterialsParams): MockMaterial[] {
  let list = [...all];
  const q = params.search?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.ageLabel.toLowerCase().includes(q),
    );
  }
  if (params.category && params.category !== "all") {
    list = list.filter((m) => m.category === params.category);
  }
  if (params.age?.trim()) {
    const fr = parseAgeFilter(params.age);
    if (fr) list = list.filter((m) => ageOverlaps(m, fr));
  }
  if (params.price_min != null) {
    list = list.filter((m) => m.price >= params.price_min!);
  }
  if (params.price_max != null) {
    list = list.filter((m) => m.price <= params.price_max!);
  }
  if (params.rating != null) {
    const minR = params.rating;
    list = list.filter((m) => m.rating >= minR && m.reviewCount >= 3);
  }
  return list;
}

function paginate(items: MockMaterial[], page: number, limit: number): { slice: MockMaterial[]; pagination: MaterialsPagination } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * limit;
  const slice = items.slice(start, start + limit);
  return {
    slice,
    pagination: { page: p, limit, total, totalPages },
  };
}

function mapApiPayload(data: MaterialsListResponse): MockMaterial[] {
  return (data.items ?? []).map((row: Material) => {
    const anyRow = row as Material & Record<string, unknown>;
    if (
      anyRow.coverGradient &&
      typeof anyRow.originalPrice === "number" &&
      typeof anyRow.rating === "number"
    ) {
      return anyRow as unknown as MockMaterial;
    }
    return materialToMock(row);
  });
}

/**
 * Fetches materials from GET /materials with query params.
 * Falls back to client-side mock filtering when the response is not usable.
 */
export async function listMaterials(params: ListMaterialsParams = {}): Promise<ListMaterialsResult> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const qs = buildQueryString(params);

  try {
    const res = await apiFetch(qs ? `materials?${qs}` : "materials");
    if (res.ok) {
      const data = (await res.json()) as MaterialsListResponse;
      const items = mapApiPayload(data);
      const pg = data.pagination;
      if (pg && typeof pg.total === "number") {
        return {
          items,
          pagination: {
            page: pg.page ?? page,
            limit: pg.limit ?? limit,
            total: pg.total,
            totalPages: Math.max(1, pg.totalPages ?? 1),
          },
          usedMockFallback: false,
        };
      }
      if (items.length > 0) {
        const { slice, pagination } = paginate(items, page, limit);
        return { items: slice, pagination, usedMockFallback: false };
      }
    }
  } catch {
    /* fallback */
  }

  let list = filterMaterials(mockMaterials, params);
  list = sortMaterials(list, params.sort);
  const { slice, pagination } = paginate(list, page, limit);
  return { items: slice, pagination, usedMockFallback: true };
}

/** Home sections: fetch slice without pagination noise */
export async function listMaterialsPreview(params: Omit<ListMaterialsParams, "page"> & { limit?: number }): Promise<MockMaterial[]> {
  const limit = params.limit ?? 6;
  const r = await listMaterials({ ...params, page: 1, limit });
  return r.items.slice(0, limit);
}

/** Deterministic shuffle from string seed (Fisher–Yates) */
export function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Resolve recent-view ids to materials (order preserved, max 10). */
export async function resolveMaterialsByIds(ids: string[]): Promise<MockMaterial[]> {
  const all = await getMaterials();
  const map = new Map(all.map((m) => [m.id, m]));
  const out: MockMaterial[] = [];
  for (const id of ids.slice(0, 10)) {
    const m = map.get(id);
    if (m) out.push(m);
  }
  return out;
}

/** 「為你推薦」：優先 recommended API；否則 popular 洗牌並盡量與熱門前三名錯開。 */
export async function listRecommendedForHome(hotIds: string[], limit: number): Promise<MockMaterial[]> {
  const tryRec = await listMaterials({ sort: "recommended", limit: Math.max(limit * 2, 12), page: 1 });
  if (!tryRec.usedMockFallback && tryRec.items.length > 0) {
    const hotTop = new Set(hotIds.slice(0, 3));
    const picked = tryRec.items.filter((m) => !hotTop.has(m.id)).slice(0, limit);
    if (picked.length >= Math.min(3, limit)) return picked.slice(0, limit);
  }
  const pop = await listMaterialsPreview({ sort: "popular", limit: 24 });
  const hotTop = new Set(hotIds.slice(0, 3));
  const day = new Date().toISOString().slice(0, 10);
  const shuffled = shuffleWithSeed(pop, `rec-${day}`);
  const out: MockMaterial[] = [];
  for (const m of shuffled) {
    if (out.length >= limit) break;
    if (!hotTop.has(m.id)) out.push(m);
  }
  for (const m of shuffled) {
    if (out.length >= limit) break;
    if (!out.some((x) => x.id === m.id)) out.push(m);
  }
  return out.slice(0, limit);
}
