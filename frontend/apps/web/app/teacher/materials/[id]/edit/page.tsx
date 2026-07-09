"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, EmptyState, ErrorState, InputField, LoadingState } from "@teaching-platform/ui";
import Link from "next/link";
import type { Material } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";
import { MaterialMediaFields } from "../../../../../components/teacher/MaterialMediaFields";
import { MaterialFeaturesSelector } from "../../../../../components/materials/MaterialFeaturesSelector";
import {
  flattenSelectedMaterialFeatures,
  groupMaterialFeatures,
  type MaterialFeatureGroupKey,
} from "@/src/constants/materialFeatures";

type FormValue = {
  title: string;
  description: string;
  price: string;
  category: string;
  ageRange: string;
  fileKey: string;
  teachingObjective: string;
  teachingMethodsText: string;
  usageDuration: string;
  activitySteps: string;
  extensionValue: string;
  shortDescription: string;
  coverImageUrl: string;
  detailImagesText: string;
  demoVideoUrl: string;
  contentsText: string;
  selectedFeatures: Partial<Record<MaterialFeatureGroupKey, string[]>>;
};

function parseTeachingMethods(raw: string): string[] {
  return raw
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function parseContents(raw: string): Array<{ type: string; name: string; count?: number; description?: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [type = "", name = "", countText = "", description = ""] = line.split("|").map((v) => v.trim());
      const out: { type: string; name: string; count?: number; description?: string } = { type, name };
      const count = Number(countText);
      if (countText && Number.isFinite(count)) out.count = count;
      if (description) out.description = description;
      return out;
    });
}

function parseDetailImages(raw: string): Array<{ image_url: string; alt_text?: string; sort_order: number }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [image_url = "", alt_text = ""] = line.split("|").map((v) => v.trim());
      return {
        image_url,
        alt_text: alt_text || undefined,
        sort_order: idx,
      };
    });
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function CreatorMaterialEditPage() {
  const params = useParams<{ id: string }>();
  const materialId = decodeURIComponent(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormValue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(materialId)}`);
      if (!res.ok) {
        setError(await parseApiErrorMessage(res));
        setForm(null);
        return;
      }
      const data = (await res.json()) as Material;
      setForm({
        title: data.title ?? "",
        description: data.description ?? "",
        price: String(data.price ?? ""),
        category: data.category ?? "",
        ageRange: data.age_range ?? "",
        fileKey: data.file_key ?? "",
        teachingObjective: data.teaching_objective ?? "",
        teachingMethodsText: (data.teaching_methods ?? []).join("\n"),
        usageDuration: data.usage_duration ?? "",
        activitySteps: data.activity_steps ?? "",
        extensionValue: data.extension_value ?? "",
        shortDescription: data.short_description ?? "",
        coverImageUrl: data.cover_image_url ?? "",
        detailImagesText: (data.detail_images ?? [])
          .map((img) => `${img.image_url ?? ""}|${img.alt_text ?? ""}`)
          .join("\n"),
        demoVideoUrl: data.demo_video_url ?? "",
        contentsText: (data.contents ?? [])
          .map((c) => [c.type ?? "", c.name ?? "", c.count ?? "", c.description ?? ""].join("|"))
          .join("\n"),
        selectedFeatures: groupMaterialFeatures(data.material_features),
      });
    } catch {
      setError("無法連線至伺服器，請稍後再試。");
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FormValue>(key: K, value: FormValue[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleFeature(group: MaterialFeatureGroupKey, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const current = prev.selectedFeatures[group] ?? [];
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return {
        ...prev,
        selectedFeatures: {
          ...prev.selectedFeatures,
          [group]: next,
        },
      };
    });
  }

  async function handleSave() {
    if (!form) return;
    setMessage(null);
    const price = Number(form.price);
    if (!form.title.trim()) {
      setMessage("請輸入教材標題。");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setMessage("價格需為大於 0 的數字。");
      return;
    }
    if (!form.fileKey.trim()) {
      setMessage("請輸入檔案 key。");
      return;
    }
    if (!form.teachingObjective.trim()) {
      setMessage("請輸入教學目標。");
      return;
    }
    if (!form.usageDuration.trim()) {
      setMessage("請輸入使用時間。");
      return;
    }
    if (!form.activitySteps.trim()) {
      setMessage("請輸入教學步驟。");
      return;
    }
    const teachingMethods = parseTeachingMethods(form.teachingMethodsText);
    if (teachingMethods.length < 1) {
      setMessage("教學玩法至少 1 筆。");
      return;
    }
    const contents = parseContents(form.contentsText);
    if (contents.length < 1) {
      setMessage("教材內容至少 1 筆。");
      return;
    }
    if (contents.some((c) => !c.type || !c.name)) {
      setMessage("每筆教材內容都要有 type 與 name。");
      return;
    }
    if (contents.some((c) => c.count !== undefined && c.count <= 0)) {
      setMessage("教材內容 count 若填寫需大於 0。");
      return;
    }
    if (!form.coverImageUrl.trim()) {
      setMessage("請填寫封面照 URL（必填）。");
      return;
    }
    if (!isValidUrl(form.coverImageUrl.trim())) {
      setMessage("封面照 URL 格式不正確。");
      return;
    }
    if (form.demoVideoUrl.trim() && !isValidUrl(form.demoVideoUrl.trim())) {
      setMessage("教學玩法影片 URL 格式不正確。");
      return;
    }
    const detailImages = parseDetailImages(form.detailImagesText);
    if (detailImages.some((img) => !img.image_url || !isValidUrl(img.image_url))) {
      setMessage("細節照片每筆都必須是合法 URL，可用格式：image_url|alt_text");
      return;
    }
    const materialFeatures = flattenSelectedMaterialFeatures(form.selectedFeatures);
    if (materialFeatures.length < 1) {
      setMessage("請至少選擇 1 個教材特色。");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(materialId)}`, {
        method: "PUT",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          price,
          category: form.category.trim() || undefined,
          age_range: form.ageRange.trim() || undefined,
          file_key: form.fileKey.trim(),
          teaching_objective: form.teachingObjective.trim(),
          teaching_methods: teachingMethods,
          usage_duration: form.usageDuration.trim(),
          activity_steps: form.activitySteps.trim(),
          extension_value: form.extensionValue.trim() || undefined,
          short_description: form.shortDescription.trim() || undefined,
          cover_image_url: form.coverImageUrl.trim(),
          detail_images: detailImages,
          demo_video_url: form.demoVideoUrl.trim() || undefined,
          material_features: materialFeatures,
          contents,
        }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage("教材更新成功。");
      void load();
    } catch {
      setMessage("更新失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">編輯教材（Creator）</h1>
        <p className="text-sm text-slate-600">調整教材內容後可重新送審或維持既有狀態。</p>
      </div>

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !form ? <EmptyState title="找不到教材" description="請確認教材編號是否正確。" /> : null}

      {!loading && form ? (
        <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <InputField id="edit-title" label="標題 *" value={form.title} onChangeText={(v) => update("title", v)} disabled={saving} />
            <InputField id="edit-description" label="描述" value={form.description} onChangeText={(v) => update("description", v)} disabled={saving} />
            <InputField id="edit-price" label="價格 *" value={form.price} onChangeText={(v) => update("price", v)} disabled={saving} />
            <InputField id="edit-category" label="分類" value={form.category} onChangeText={(v) => update("category", v)} disabled={saving} />
            <InputField id="edit-age-range" label="適齡" value={form.ageRange} onChangeText={(v) => update("ageRange", v)} disabled={saving} />
            <InputField id="edit-teaching-objective" label="教學目標 *" value={form.teachingObjective} onChangeText={(v) => update("teachingObjective", v)} disabled={saving} />
            <InputField id="edit-usage-duration" label="使用時間 *" value={form.usageDuration} onChangeText={(v) => update("usageDuration", v)} disabled={saving} />
            <InputField id="edit-activity-steps" label="教學步驟 *" value={form.activitySteps} onChangeText={(v) => update("activitySteps", v)} disabled={saving} />
            <InputField id="edit-file-key" label="檔案 Key *" value={form.fileKey} onChangeText={(v) => update("fileKey", v)} disabled={saving} />
            <label htmlFor="edit-teaching-methods" className="text-sm font-medium text-slate-800">
              教學玩法 *（每行 1 筆，最多 4 筆）
            </label>
            <textarea
              id="edit-teaching-methods"
              value={form.teachingMethodsText}
              onChange={(e) => update("teachingMethodsText", e.target.value)}
              disabled={saving}
              className="min-h-20 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <label htmlFor="edit-contents" className="text-sm font-medium text-slate-800">
              教材內容 *（每行：type|name|count|description）
            </label>
            <textarea
              id="edit-contents"
              value={form.contentsText}
              onChange={(e) => update("contentsText", e.target.value)}
              disabled={saving}
              className="min-h-24 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <InputField id="edit-short-description" label="簡短介紹" value={form.shortDescription} onChangeText={(v) => update("shortDescription", v)} disabled={saving} />
            <InputField id="edit-extension-value" label="延伸活動 / 練習單" value={form.extensionValue} onChangeText={(v) => update("extensionValue", v)} disabled={saving} />

            <MaterialMediaFields
              coverImageUrl={form.coverImageUrl}
              onCoverImageUrlChange={(v) => update("coverImageUrl", v)}
              detailImagesText={form.detailImagesText}
              onDetailImagesTextChange={(v) => update("detailImagesText", v)}
              demoVideoUrl={form.demoVideoUrl}
              onDemoVideoUrlChange={(v) => update("demoVideoUrl", v)}
              disabled={saving}
              onNotify={(msg) => setMessage(msg)}
            />
            <MaterialFeaturesSelector selected={form.selectedFeatures} onToggle={toggleFeature} disabled={saving} />

            <div className="flex flex-wrap gap-2">
              <Button onPress={() => void handleSave()} disabled={saving} loading={saving}>
                {saving ? "儲存中…" : "儲存變更"}
              </Button>
              <Link href="/creator/materials">
                <Button variant="secondary" disabled={saving}>
                  返回列表
                </Button>
              </Link>
            </div>

            {message ? <p className="text-sm text-amber-600">{message}</p> : null}
        </article>
      ) : null}
    </section>
  );
}
