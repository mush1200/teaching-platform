"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, EmptyState, ErrorState, InputField, LoadingState } from "@teaching-platform/ui";
import Link from "next/link";
import type { Material } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";
import {
  canReplaceMaterialFile,
  canResubmit,
  materialFileLockReason,
} from "../../../../../lib/material-status";
import { MATERIAL_REVIEW_REASON_LABEL } from "../../../../../lib/admin-labels";
import { MaterialMediaFields } from "../../../../../components/teacher/MaterialMediaFields";
import { MaterialFileField } from "../../../../../components/teacher/MaterialFileField";
import type { MaterialFileSummary, UploadedMaterialFile } from "../../../../../lib/material-file";
import { MATERIAL_CATEGORIES } from "../../../../../lib/material-categories";
import {
  MaterialContentsField,
  cleanMaterialContents,
  toContentRows,
  type MaterialContentRow,
} from "../../../../../components/teacher/MaterialContentsField";
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
  /* 教材內容的結構化列（`P1-10`）。載入既有教材時由 `toContentRows()` hydrate。 */
  const [contentRows, setContentRows] = useState<MaterialContentRow[]>(() => toContentRows(null));
  const [form, setForm] = useState<FormValue | null>(null);
  /**
   * 教材目前的狀態與最近一次審核快照。
   *
   * 這些欄位**不進表單** —— 創作者不能編輯它們，它們只決定要不要顯示
   * 「需修改」提示與「儲存並重新送審」。
   */
  const [material, setMaterial] = useState<Material | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  /*
   * 剛上傳、還沒被送到後端認領的檔案。
   * 與 `material.material_file` 是不同的東西：後者是這份教材**目前**的檔案狀態。
   */
  const [pendingUpload, setPendingUpload] = useState<UploadedMaterialFile | null>(null);
  const [attachingFile, setAttachingFile] = useState(false);

  const canReplaceFile = canReplaceMaterialFile(material?.status);
  const fileLockReason = materialFileLockReason(material?.status);

  /**
   * 換檔走**專屬端點**，不跟其他欄位一起 PUT。
   *
   * 教材檔案有自己的不變條件（只有特定狀態能換、舊候選要退場、已核准檔絕不能被創作者
   * 覆寫），把它塞進一般儲存等於讓「買家拿到什麼」跟著一次普通的文案修改一起改變。
   * 因此上傳成功後立刻認領，成功了才更新畫面。
   */
  async function handleMaterialFileUploaded(uploaded: UploadedMaterialFile | null) {
    setPendingUpload(uploaded);
    if (!uploaded) return;
    setMessage(null);
    setAttachingFile(true);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(materialId)}/file`, {
        method: "POST",
        body: JSON.stringify({ fileId: uploaded.fileId }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        setPendingUpload(null);
        return;
      }
      setPendingUpload(null);
      setMessage("教材檔案已更新，將於重新送審通過後成為買家下載的版本。");
      void load();
    } catch {
      setMessage("教材檔案更新失敗，請稍後再試。");
      setPendingUpload(null);
    } finally {
      setAttachingFile(false);
    }
  }

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
      setMaterial(data);
      setForm({
        title: data.title ?? "",
        description: data.description ?? "",
        price: String(data.price ?? ""),
        category: data.category ?? "",
        ageRange: data.age_range ?? "",
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
        contentsText: "",
        selectedFeatures: groupMaterialFeatures(data.material_features),
      });
      /*
       * 既有教材的內容 hydrate 回結構化列。
       *
       * 這一步是 `P1-10` 真正的風險點：新表單能建立、卻讀不回既有資料的話，
       * 創作者一按儲存就會把原本的內容清空。`toContentRows()` 保證
       * `count: null` 變成空字串（而不是字串 "null"），空清單則給一列空白。
       */
      setContentRows(toContentRows(data.contents));
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
      /*
       * 一般儲存**不會**送審。創作者可以存到一半明天再繼續；只有他自己按
       * 「儲存並重新送審」時，教材才會回到審核佇列（見 docs/material-review-workflow.md）。
       */
      setMessage(
        canResubmit(material?.status)
          ? "教材已儲存。若已完成修改，請按「儲存並重新送審」送回審核。"
          : "教材已儲存。"
      );
      void load();
      return true;
    } catch {
      setMessage("更新失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  /**
   * 儲存並重新送審。
   *
   * 一定先儲存再送審 —— 只送審不儲存，Admin 會看到創作者「已經修好」的舊內容。
   * 儲存失敗（驗證沒過）就停在原地，不送審。
   */
  async function handleSaveAndResubmit() {
    const saved = await handleSave();
    if (!saved) return;
    setResubmitting(true);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(materialId)}/resubmit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage("已重新送審，教材回到審核佇列，審核結果會以 Email 通知你。");
      void load();
    } catch {
      setMessage("重新送審失敗，請稍後再試。");
    } finally {
      setResubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">編輯教材（Creator）</h1>
        <p className="text-sm text-slate-600">
          修改內容會先儲存；準備好之後再按「儲存並重新送審」，教材才會回到審核佇列。
        </p>
      </div>

      {/* 審核意見：來自 materials 的最近一次審核快照，不顯示任何內部識別碼。 */}
      {material?.status === "changes_requested" ? (
        <div
          data-testid="creator-edit-changes-requested"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-semibold text-amber-800">
            需修改
            {material.review_reason_code
              ? ` ・ ${MATERIAL_REVIEW_REASON_LABEL[material.review_reason_code] ?? material.review_reason_code}`
              : ""}
          </p>
          {material.review_note ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{material.review_note}</p>
          ) : null}
        </div>
      ) : null}

      {material?.status === "unpublished" ? (
        <div data-testid="creator-edit-unpublished" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">已下架</p>
          <p className="mt-1 text-sm text-rose-900">
            這份教材已由平台下架。修改後可以重新送審，通過審核才會再次上架。
          </p>
        </div>
      ) : null}

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !form ? <EmptyState title="找不到教材" description="請確認教材編號是否正確。" /> : null}

      {!loading && form ? (
        <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <InputField id="edit-title" label="標題 *" value={form.title} onChangeText={(v) => update("title", v)} disabled={saving} />
            <InputField id="edit-description" label="描述" value={form.description} onChangeText={(v) => update("description", v)} disabled={saving} />
            <label htmlFor="edit-price" className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-800">價格 *（NT$）</span>
              <input
                id="edit-price"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </label>
            {/*
              分類選單（`P1-10`）。**legacy 值要保留得住**：dev DB 裡存在 `語文`／`56`
              這種自由文字時期的值，如果選單只有四個 canonical 選項，
              打開編輯頁就會把它靜默改成第一個選項，創作者按儲存即被覆寫。
              因此不在清單內的現值會多出一個「目前值」選項，讓它維持原樣直到創作者主動改。
            */}
            <label htmlFor="edit-category" className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-800">分類 *</span>
              <select
                id="edit-category"
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
                {form.category && !MATERIAL_CATEGORIES.some((c) => c.id === form.category) ? (
                  <option value={form.category}>{`目前值：${form.category}`}</option>
                ) : null}
              </select>
            </label>
            <InputField id="edit-age-range" label="適齡" value={form.ageRange} onChangeText={(v) => update("ageRange", v)} disabled={saving} />
            <InputField id="edit-teaching-objective" label="教學目標 *" value={form.teachingObjective} onChangeText={(v) => update("teachingObjective", v)} disabled={saving} />
            <InputField id="edit-usage-duration" label="使用時間 *" value={form.usageDuration} onChangeText={(v) => update("usageDuration", v)} disabled={saving} />
            <InputField id="edit-activity-steps" label="教學步驟 *" value={form.activitySteps} onChangeText={(v) => update("activitySteps", v)} disabled={saving} />
            <MaterialFileField
              uploaded={pendingUpload}
              onUploaded={handleMaterialFileUploaded}
              summary={material?.material_file ?? null}
              canReplace={canReplaceFile}
              lockedReason={fileLockReason}
              disabled={saving || attachingFile}
            />
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
            <MaterialContentsField idPrefix="edit" rows={contentRows} onChange={setContentRows} disabled={saving} />
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
              <Button
                onPress={() => void handleSave()}
                disabled={saving || resubmitting}
                loading={saving && !resubmitting}
                variant={canResubmit(material?.status) ? "secondary" : "primary"}
              >
                {saving && !resubmitting ? "儲存中…" : "儲存變更"}
              </Button>
              {/*
                只有 changes_requested / unpublished 能重新送審（與後端
                utils/materialWorkflow.js 的 RESUBMITTABLE_STATUSES 一致）。
                送審是明確的意圖，不會被一般儲存偷偷觸發。
              */}
              {canResubmit(material?.status) ? (
                <div data-testid="creator-resubmit">
                  <Button
                    onPress={() => void handleSaveAndResubmit()}
                    disabled={saving || resubmitting}
                    loading={resubmitting}
                  >
                    {resubmitting ? "送審中…" : "儲存並重新送審"}
                  </Button>
                </div>
              ) : null}
              <Link href="/creator/materials">
                <Button variant="secondary" disabled={saving || resubmitting}>
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
