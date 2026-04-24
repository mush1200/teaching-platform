"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, InputField } from "@teaching-platform/ui";
import { Card, H1, Paragraph, XStack, YStack } from "tamagui";
import type { AdminPaymentProof, AdminPaymentProofsResponse } from "../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";

export default function AdminPaymentProofsPage() {
  const [proofs, setProofs] = useState<AdminPaymentProof[]>([]);
  const [handledProofIds, setHandledProofIds] = useState<Record<string, "approved" | "rejected">>({});
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [proofId, setProofId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<{ mode: "approve" | "reject"; proofId: string } | null>(null);

  const busy = submitting !== null;

  const sortedProofs = useMemo(
    () => [...proofs].sort((a, b) => (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? "") * -1),
    [proofs],
  );
  const filteredProofs = useMemo(() => {
    if (filter === "all") return sortedProofs;
    return sortedProofs.filter((row) => row.review_status === "pending" && !handledProofIds[row.id]);
  }, [filter, handledProofIds, sortedProofs]);

  const loadProofs = useCallback(async () => {
    setLoading(true);
    try {
      const query = filter === "pending" ? "admin/payment-proofs?status=pending&page=1&limit=100" : "admin/payment-proofs?page=1&limit=100";
      const res = await apiFetch(query);
      if (!res.ok) {
        setProofs([]);
        return;
      }
      const data = (await res.json()) as AdminPaymentProofsResponse;
      setProofs(data.items ?? []);
    } catch {
      setProofs([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadProofs();
  }, [loadProofs]);

  async function submit(mode: "approve" | "reject", incomingProofId?: string) {
    const id = (incomingProofId ?? proofId).trim();
    if (!id) {
      setMessage("請先輸入憑證 ID。");
      return;
    }
    if (mode === "reject" && !note.trim()) {
      setMessage("拒絕時需填寫原因。");
      return;
    }

    setMessage(null);
    setSubmitting({ mode, proofId: id });
    try {
      const res = await apiFetch(`admin/payment-proofs/${encodeURIComponent(id)}/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "reject" ? { note: note.trim() } : { note: note.trim() || undefined }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setHandledProofIds((prev) => ({ ...prev, [id]: mode === "approve" ? "approved" : "rejected" }));
      setMessage(mode === "approve" ? "付款憑證已核准。" : "付款憑證已拒絕。");
      await loadProofs();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <YStack flex={1} padding="$4" gap="$4" maxWidth={920} width="100%" alignSelf="center">
      <H1 size="$9">付款憑證審核</H1>
      <Paragraph color="$color11">
        使用付款憑證清單 API，支援待審/全部篩選，並可直接核准或拒絕。
      </Paragraph>

      <Card padding="$4" borderWidth={1} borderColor="$borderColor" gap="$3">
        <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
          <Paragraph fontWeight="700">付款憑證列表</Paragraph>
          <XStack gap="$2" flexWrap="wrap">
            <Button size="sm" variant={filter === "pending" ? "primary" : "secondary"} onPress={() => setFilter("pending")} disabled={busy}>
              待審
            </Button>
            <Button size="sm" variant={filter === "all" ? "primary" : "secondary"} onPress={() => setFilter("all")} disabled={busy}>
              全部
            </Button>
            <Button size="sm" variant="secondary" onPress={() => void loadProofs()} disabled={busy} loading={loading}>
              重新整理
            </Button>
          </XStack>
        </XStack>

        {filteredProofs.length === 0 ? (
          <Paragraph color="$color10">目前查無符合條件的憑證；也可用下方手動輸入憑證 ID。</Paragraph>
        ) : (
          <YStack gap="$2">
            {filteredProofs.map((row) => (
              <Card key={row.id} padding="$3" borderWidth={1} borderColor="$borderColor" gap="$2">
                <Paragraph fontWeight="700">憑證 ID：{row.id}</Paragraph>
                <Paragraph size="$2">審核狀態：{row.review_status}</Paragraph>
                {row.order_id ? <Paragraph size="$2">訂單 ID：{row.order_id}</Paragraph> : null}
                {row.user_id ? <Paragraph size="$2">家長 ID：{row.user_id}</Paragraph> : null}
                {row.uploaded_at ? <Paragraph size="$2">上傳時間：{row.uploaded_at}</Paragraph> : null}
                {handledProofIds[row.id] ? (
                  <Paragraph size="$2" color="$green10">
                    已於本次操作標記：{handledProofIds[row.id] === "approved" ? "核准" : "拒絕"}
                  </Paragraph>
                ) : null}
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    size="sm"
                    onPress={() => void submit("approve", row.id)}
                    disabled={busy || row.review_status !== "pending"}
                    loading={submitting?.mode === "approve" && submitting?.proofId === row.id}
                  >
                    核准
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onPress={() => {
                      setProofId(row.id);
                    }}
                    disabled={busy || row.review_status !== "pending"}
                  >
                    帶入拒絕
                  </Button>
                </XStack>
              </Card>
            ))}
          </YStack>
        )}
      </Card>

      <Card padding="$5" borderWidth={1} borderColor="$borderColor" gap="$3">
        <Paragraph fontWeight="700">手動審核（若已知憑證 ID）</Paragraph>
        <InputField id="proof-id" label="付款憑證 ID *" value={proofId} onChangeText={setProofId} placeholder="例如：10" disabled={submitting !== null} />
        <InputField id="proof-note" label="備註 / 拒絕原因" value={note} onChangeText={setNote} placeholder="例如：影像模糊無法辨識" disabled={submitting !== null} />

        <XStack gap="$2" flexWrap="wrap">
          <Button
            onPress={() => void submit("approve")}
            disabled={busy}
            loading={submitting?.mode === "approve" && submitting?.proofId === proofId.trim()}
          >
            核准憑證
          </Button>
          <Button
            variant="danger"
            onPress={() => void submit("reject")}
            disabled={busy}
            loading={submitting?.mode === "reject" && submitting?.proofId === proofId.trim()}
          >
            拒絕憑證
          </Button>
        </XStack>

        {message ? <Paragraph color="$orange10">{message}</Paragraph> : null}
      </Card>
    </YStack>
  );
}
