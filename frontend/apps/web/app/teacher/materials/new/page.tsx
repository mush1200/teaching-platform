"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InputField } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import type { Material } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";

type FormValue = {
  title: string;
  description: string;
  price: string;
  category: string;
  ageRange: string;
  fileKey: string;
  ipDeclarationAccepted: boolean;
};

const INITIAL_FORM: FormValue = {
  title: "",
  description: "",
  price: "",
  category: "",
  ageRange: "",
  fileKey: "",
  ipDeclarationAccepted: false,
};

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
          ageRange: form.ageRange.trim() || undefined,
          fileKey: form.fileKey.trim(),
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
    <YStack flex={1} padding="$4" maxWidth={860} width="100%" alignSelf="center" gap="$4">
      <YStack gap="$2">
        <H1 size="$9">新增教材</H1>
        <Paragraph color="$color11">建立新教材後，預設會進入審核流程。</Paragraph>
      </YStack>

      <Card padding="$5" borderWidth={1} borderColor="$borderColor">
        <YStack gap="$3">
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
            id="new-file-key"
            label="檔案 Key *"
            value={form.fileKey}
            onChangeText={(v) => update("fileKey", v)}
            placeholder="materials/math/worksheet-bundle.zip"
            disabled={saving}
          />

          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Button variant={form.ipDeclarationAccepted ? "primary" : "secondary"} onPress={() => update("ipDeclarationAccepted", !form.ipDeclarationAccepted)} disabled={saving}>
              {form.ipDeclarationAccepted ? "已同意著作權聲明" : "點此同意著作權聲明"}
            </Button>
            <Paragraph size="$2" color="$color10">
              你需確認擁有合法授權，且可上架販售。
            </Paragraph>
          </XStack>

          <XStack gap="$2" flexWrap="wrap">
            <Button onPress={() => void handleCreate()} disabled={saving} loading={saving}>
              {saving ? "建立中…" : "建立教材"}
            </Button>
            <Link href="/teacher/materials">
              <Button variant="secondary" disabled={saving}>
                返回列表
              </Button>
            </Link>
          </XStack>

          {message ? <Paragraph color="$orange10">{message}</Paragraph> : null}
        </YStack>
      </Card>
    </YStack>
  );
}
