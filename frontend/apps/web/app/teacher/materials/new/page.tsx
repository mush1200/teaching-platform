"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InputField } from "@teaching-platform/ui";
import Link from "next/link";
import type { Material } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";

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
  contentsText: string;
  ipDeclarationAccepted: boolean;
};

const INITIAL_FORM: FormValue = {
  title: "",
  description: "",
  price: "",
  category: "",
  ageRange: "",
  fileKey: "",
  teachingObjective: "",
  teachingMethodsText: "",
  usageDuration: "",
  activitySteps: "",
  extensionValue: "",
  shortDescription: "",
  contentsText: "",
  ipDeclarationAccepted: false,
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

export default function TeacherMaterialNewPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormValue>(INITIAL_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormValue>(key: K, value: FormValue[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      setMessage("教材內容至少 1 筆。格式：type|name|count|description");
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
    if (!form.ipDeclarationAccepted) {
      setMessage("請先確認著作權聲明。");
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
          file_key: form.fileKey.trim(),
          teaching_objective: form.teachingObjective.trim(),
          teaching_methods: teachingMethods,
          usage_duration: form.usageDuration.trim(),
          activity_steps: form.activitySteps.trim(),
          extension_value: form.extensionValue.trim() || undefined,
          short_description: form.shortDescription.trim() || undefined,
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
      router.push(`/teacher/materials/${encodeURIComponent(created.id)}/edit`);
    } catch {
      setMessage("建立失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">新增教材</h1>
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
          <InputField id="new-price" label="價格 *" value={form.price} onChangeText={(v) => update("price", v)} placeholder="199" disabled={saving} />
          <InputField id="new-category" label="分類" value={form.category} onChangeText={(v) => update("category", v)} placeholder="math" disabled={saving} />
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
          <InputField
            id="new-file-key"
            label="檔案 Key *"
            value={form.fileKey}
            onChangeText={(v) => update("fileKey", v)}
            placeholder="materials/math/worksheet-bundle.zip"
            disabled={saving}
          />
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
          <label htmlFor="new-contents" className="text-sm font-medium text-slate-800">
            教材內容 *（每行：type|name|count|description）
          </label>
          <textarea
            id="new-contents"
            value={form.contentsText}
            onChange={(e) => update("contentsText", e.target.value)}
            placeholder={"flashcard|地點圖卡|4|醫院/消防局/警察局\nflashcard|物品圖卡|24|"}
            disabled={saving}
            className="min-h-24 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <InputField id="new-short-description" label="簡短介紹" value={form.shortDescription} onChangeText={(v) => update("shortDescription", v)} placeholder="一句話介紹教材" disabled={saving} />
          <InputField id="new-extension-value" label="延伸活動 / 練習單" value={form.extensionValue} onChangeText={(v) => update("extensionValue", v)} placeholder="回家作業延伸建議" disabled={saving} />

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
            <Link href="/teacher/materials">
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
