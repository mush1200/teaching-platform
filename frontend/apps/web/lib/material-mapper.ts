import type { Material } from "./api-types";
import type { MockMaterial } from "./mock-data";

const GRADIENTS = [
  "from-violet-200 to-indigo-100",
  "from-rose-100 to-orange-50",
  "from-emerald-100 to-cyan-50",
  "from-amber-100 to-yellow-50",
] as const;

function pickGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * (i + 1)) % GRADIENTS.length;
  return GRADIENTS[h] ?? GRADIENTS[0];
}

export function materialToMock(m: Material): MockMaterial {
  const price = Number(m.price) || 0;
  const ar = m.age_range?.trim();
  const contentsLen = Array.isArray(m.contents) ? m.contents.length : 0;
  return {
    id: m.id,
    title: m.title,
    ageLabel: ar ? (ar.includes("適合") ? ar : `適合 ${ar}`) : "適合全年齡",
    category: m.category && m.category.length > 0 ? m.category : "language",
    price,
    originalPrice: price,
    rating: 0,
    reviewCount: 0,
    coverGradient: pickGradient(m.id),
    coverImageUrl: m.cover_image_url ?? undefined,
    demoVideoUrl: m.demo_video_url ?? undefined,
    detailImages: Array.isArray(m.detail_images) ? m.detail_images : [],
    durationHours: 0,
    units: contentsLen,
    learners: 0,
    description: m.description ?? "",
    outline: [],
    learnPoints: [],
    teachingObjective: m.teaching_objective ?? "",
    teachingMethods: Array.isArray(m.teaching_methods) ? m.teaching_methods : [],
    usageDuration: m.usage_duration ?? "",
    activitySteps: m.activity_steps ?? "",
    extensionValue: m.extension_value ?? "",
    shortDescription: m.short_description ?? "",
    contents: Array.isArray(m.contents) ? m.contents : [],
    publishedAt: m.created_at?.slice(0, 10),
  };
}
