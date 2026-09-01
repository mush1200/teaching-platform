"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InputField } from "@teaching-platform/ui";
import Link from "next/link";
import type { Material } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";
import { MaterialMediaFields } from "../../../../components/teacher/MaterialMediaFields";
import { MaterialFileField } from "../../../../components/teacher/MaterialFileField";
import type { UploadedMaterialFile } from "../../../../lib/material-file";
import { MATERIAL_CATEGORIES } from "../../../../lib/material-categories";
import {
  MaterialContentsField,
  cleanMaterialContents,
  toContentRows,
  type MaterialContentRow,
} from "../../../../components/teacher/MaterialContentsField";
import { MaterialFeaturesSelector } from "../../../../components/materials/MaterialFeaturesSelector";
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
  ipDeclarationAccepted: boolean;
  selectedFeatures: Partial<Record<MaterialFeatureGroupKey, string[]>>;
};

const INITIAL_FORM: FormValue = {
  title: "",
  description: "",
  price: "",
  category: "",
  ageRange: "",
  teachingObjective: "",
  teachingMethodsText: "",
  usageDuration: "",
  activitySteps: "",
  extensionValue: "",
  shortDescription: "",
  coverImageUrl: "",
  detailImagesText: "",
  demoVideoUrl: "",
  contentsText: "",
  ipDeclarationAccepted: false,
  selectedFeatures: groupMaterialFeatures([]),
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

export default function CreatorMaterialNewPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormValue>(INITIAL_FORM);
  /*
   * 教材本體檔案不放在 `form` 裡：它不是一個文字欄位，而是一個**已經上傳到後端的物件**。
   * 使用者選檔的當下就完成上傳，這裡保存的是後端回傳的 `fileId`（不是 URL，也不是路徑）。
   */
  const [materialFile, setMaterialFile] = useState<UploadedMaterialFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /*
   * 教材內容改成結構化列（`P1-10`）。Backend 本來就收 `{type,name,count,description}[]`，
   * 管線字串從頭到尾只是 UI 的產物，因此這裡不需要任何 adapter。
   */
  const [contentRows, setContentRows] = useState<MaterialContentRow[]>(() => toContentRows(null));

  function update<K extends keyof FormValue>(key: K, value: FormValue[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFeature(group: MaterialFeatureGroupKey, value: string) {
    setForm((prev) => {
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

  async function handleCreate() {
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
    if (!materialFile) {
      setMessage("請先上傳教材檔案。");
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
    const contents = cleanMaterialContents(contentRows);
    if (contents.length < 1) {
      setMessage("請至少填寫 1 項教材內容。");
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
    if (!form.ipDeclarationAccepted) {
      setMessage("請先確認著作權聲明。");
      return;
    }
    const materialFeatures = flattenSelectedMaterialFeatures(form.selectedFeatures);
    if (materialFeatures.length < 1) {
      setMessage("請至少選擇 1 個教材特色。");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("materials", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          price,
          category: form.category.trim() || undefined,
          age_range: form.ageRange.trim() || undefined,
          fileId: materialFile.fileId,
          teaching_objective: form.teachingObjective.trim(),
          teaching_methods: teachingMethods,
          usage_duration: form.usageDuration.trim(),
          activity_steps: form.activitySteps.trim(),
          extension_value: form.extensionValue.trim() || undefined,
          short_description: form.shortDescription.trim() || undefined,
          cover_image_url: form.coverImageUrl.trim(),
          detail_images: detailImages.length > 0 ? detailImages : undefined,
          demo_video_url: form.demoVideoUrl.trim() || undefined,
          material_features: materialFeatures,
          contents,
          ipDeclarationAccepted: true,
        }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }

      const created = (await res.json()) as Material;
      setMessage("教材建立成功，正在導向編輯頁…");
      router.push(`/creator/materials/${encodeURIComponent(created.id)}/edit`);
    } catch {
      setMessage("建立失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">新增教材（Creator）</h1>
        <p className="text-sm text-slate-600">建立新教材後，預設會進入審核流程。</p>
      </div>

      <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <InputField id="new-title" label="標題 *" value={form.title} onChangeText={(v) => update("title", v)} placeholder="例如：國小數學分數練習包" disabled={saving} />
          <InputField
            id="new-description"
            label="描述"
            value={form.description}
            onChangeText={(v) => update("description", v)}
            placeholder="教材內容簡介"
            disabled={saving}
          />
          {/*
            價格改成數值輸入（`P1-10`）。先前是 `type="text"`：行動版不會叫出數字鍵盤，
            也接受任何字串。Backend 仍然是唯一的驗證權威（`price must be greater than 0`），
            這裡只是不要讓使用者一開始就打得出不合法的值。
          */}
          <label htmlFor="new-price" className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-800">價格 *（NT$）</span>
            <input
              id="new-price"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
              placeholder="199"
              disabled={saving}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </label>
          {/*
            分類改成選單（`P1-10`）。先前是自由文字、placeholder 還是內部值 `math` ——
            實測 dev DB 已經因此存進 `語文`／`56` 這種買家永遠篩不到的值。
            選項來自 `lib/material-categories.ts`（唯一來源）：畫面顯示中文，送出 canonical 值。
          */}
          <label htmlFor="new-category" className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-800">分類 *</span>
            <select
              id="new-category"
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              disabled={saving}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">請選擇分類</option>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <InputField id="new-age-range" label="適齡" value={form.ageRange} onChangeText={(v) => update("ageRange", v)} placeholder="7-10" disabled={saving} />
          <InputField
            id="new-teaching-objective"
            label="教學目標 *"
            value={form.teachingObjective}
            onChangeText={(v) => update("teachingObjective", v)}
            placeholder="幫助學生完成 ..."
            disabled={saving}
          />
          <InputField id="new-usage-duration" label="使用時間 *" value={form.usageDuration} onChangeText={(v) => update("usageDuration", v)} placeholder="約 2 堂課，每堂 30 分鐘" disabled={saving} />
          <InputField id="new-activity-steps" label="教學步驟 *" value={form.activitySteps} onChangeText={(v) => update("activitySteps", v)} placeholder="1. ... 2. ... 3. ..." disabled={saving} />
          <MaterialFileField uploaded={materialFile} onUploaded={setMaterialFile} disabled={saving} />
          <label htmlFor="new-teaching-methods" className="text-sm font-medium text-slate-800">
            教學玩法 *（每行 1 筆，最多 4 筆）
          </label>
          <textarea
            id="new-teaching-methods"
            value={form.teachingMethodsText}
            onChange={(e) => update("teachingMethodsText", e.target.value)}
            placeholder={"配對遊戲\n搶答遊戲"}
            disabled={saving}
            className="min-h-20 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <MaterialContentsField idPrefix="new" rows={contentRows} onChange={setContentRows} disabled={saving} />
          <InputField id="new-short-description" label="簡短介紹" value={form.shortDescription} onChangeText={(v) => update("shortDescription", v)} placeholder="一句話介紹教材" disabled={saving} />
          <InputField id="new-extension-value" label="延伸活動 / 練習單" value={form.extensionValue} onChangeText={(v) => update("extensionValue", v)} placeholder="回家作業延伸建議" disabled={saving} />

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

          <div className="flex flex-wrap items-center gap-2">
            <Button variant={form.ipDeclarationAccepted ? "primary" : "secondary"} onPress={() => update("ipDeclarationAccepted", !form.ipDeclarationAccepted)} disabled={saving}>
              {form.ipDeclarationAccepted ? "已同意著作權聲明" : "點此同意著作權聲明"}
            </Button>
            <p className="text-xs text-slate-500">你需確認擁有合法授權，且可上架販售。</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onPress={() => void handleCreate()} disabled={saving} loading={saving}>
              {saving ? "建立中…" : "建立教材"}
            </Button>
            <Link href="/creator/materials">
              <Button variant="secondary" disabled={saving}>
                返回列表
              </Button>
            </Link>
          </div>

          {message ? <p className="text-sm text-amber-600">{message}</p> : null}
      </article>
    </section>
  );
}
