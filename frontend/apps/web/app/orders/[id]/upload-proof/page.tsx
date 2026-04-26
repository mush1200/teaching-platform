"use client";

import Link from "next/link";
import { use, useState } from "react";
import { z } from "zod";
import { AppShell } from "../../../../components/layout/AppShell";
import { MobileHeader } from "../../../../components/layout/MobileHeader";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { apiFetch, getStoredToken, parseApiErrorMessage } from "../../../../lib/api-client";

const proofSchema = z.object({
  proofUrl: z.string().url({ message: "請輸入有效的憑證網址（http/https）" }),
});

export default function UploadProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params);
  const [proofUrl, setProofUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = getStoredToken();

  async function submit() {
    setMsg(null);
    const parsed = proofSchema.safeParse({ proofUrl });
    if (!parsed.success) {
      setMsg(parsed.error.issues[0]?.message ?? "輸入有誤");
      return;
    }
    if (!token) {
      setMsg("請先登入。");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`orders/${encodeURIComponent(orderId)}/upload-proof`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setMsg(await parseApiErrorMessage(res));
        return;
      }
      setMsg("已送出憑證，請等待管理員審核。");
      setProofUrl("");
    } catch {
      setMsg("上傳失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell withBottomNav>
      <MobileHeader title="上傳憑證" backHref="/orders" right="none" />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-28 pt-4 sm:px-6">
        {!token ? (
          <Card className="text-center">
            <p className="font-semibold text-[#1F2937]">請先登入</p>
            <p className="mt-1 text-sm text-[#6B7280]">需要登入才能提交憑證。</p>
            <Link href={`/login?redirect=${encodeURIComponent(`/orders/${orderId}/upload-proof`)}`} className="mt-4 inline-block">
              <Button>前往登入</Button>
            </Link>
          </Card>
        ) : (
          <>
            <Card>
              <h1 className="text-xl font-bold text-[#1F2937]">付款憑證</h1>
              <p className="mt-1 text-sm text-[#6B7280]">訂單編號：{orderId}</p>
              <p className="mt-2 text-sm text-[#6B7280]">請貼上可公開存取的憑證連結（例如雲端硬碟公開網址）。</p>
            </Card>

            <Card>
              <Input
                id="proof-url"
                label="憑證網址"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://..."
                disabled={loading}
              />
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" disabled={loading} onClick={() => void submit()}>
                  {loading ? "送出中…" : "送出憑證"}
                </Button>
                <Link href="/orders" className="flex-1">
                  <Button variant="outline" fullWidth>
                    返回訂單
                  </Button>
                </Link>
              </div>
              {msg ? (
                <p className={`mt-3 text-sm ${msg.includes("失敗") || msg.includes("請") ? "text-[#F59E0B]" : "text-[#22C55E]"}`}>
                  {msg}
                </p>
              ) : null}
            </Card>
          </>
        )}
      </main>
    </AppShell>
  );
}
