"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, EmptyState, ErrorState, InputField, LoadingState } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import { Link } from "solito/link";
import type { Material } from "../../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../../lib/api-client";

type FormValue = {
  title: string;
  description: string;
  price: string;
  category: string;
  ageRange: string;
  fileKey: string;
};

export default function TeacherMaterialEditPage() {
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

    setSaving(true);
    try {
      const res = await apiFetch(`materials/${encodeURIComponent(materialId)}`, {
        method: "PUT",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          price,
          category: form.category.trim() || undefined,
          ageRange: form.ageRange.trim() || undefined,
          fileKey: form.fileKey.trim(),
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
    <YStack flex={1} padding="$4" maxWidth={860} width="100%" alignSelf="center" gap="$4">
      <YStack gap="$2">
        <H1 size="$9">編輯教材</H1>
        <Paragraph color="$color11">調整教材內容後可重新送審或維持既有狀態。</Paragraph>
      </YStack>

      {loading ? <LoadingState title="載入教材中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !form ? <EmptyState title="找不到教材" description="請確認教材編號是否正確。" /> : null}

      {!loading && form ? (
        <Card padding="$5" borderWidth={1} borderColor="$borderColor">
          <YStack gap="$3">
            <InputField id="edit-title" label="標題 *" value={form.title} onChangeText={(v) => update("title", v)} disabled={saving} />
            <InputField id="edit-description" label="描述" value={form.description} onChangeText={(v) => update("description", v)} disabled={saving} />
            <InputField id="edit-price" label="價格 *" value={form.price} onChangeText={(v) => update("price", v)} disabled={saving} />
            <InputField id="edit-category" label="分類" value={form.category} onChangeText={(v) => update("category", v)} disabled={saving} />
            <InputField id="edit-age-range" label="適齡" value={form.ageRange} onChangeText={(v) => update("ageRange", v)} disabled={saving} />
            <InputField id="edit-file-key" label="檔案 Key *" value={form.fileKey} onChangeText={(v) => update("fileKey", v)} disabled={saving} />

            <XStack gap="$2" flexWrap="wrap">
              <Button onPress={() => void handleSave()} disabled={saving} loading={saving}>
                {saving ? "儲存中…" : "儲存變更"}
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
      ) : null}
    </YStack>
  );
}
