"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCartItems, getMaterialById, replaceCartItems } from "../../lib/edu-api-mock";
import type { MockMaterial } from "../../lib/mock-data";
import { apiFetch, getStoredRole, parseApiErrorMessage } from "../../lib/api-client";
import type { UserRole } from "../../lib/api-types";
import { AppShell } from "../layout/AppShell";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { IconCheck, IconChevronLeft, IconHeart, IconShare } from "../ui/icons";

type Props = {
  materialId: string;
};

function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function MaterialDetailPage({ materialId }: Props) {
  const router = useRouter();
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setRole(getStoredRole());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const m = await getMaterialById(materialId);
      if (!cancelled) {
        setMaterial(m);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  const off = useMemo(() => {
    if (!material || material.originalPrice <= material.price) return 0;
    return Math.round((1 - material.price / material.originalPrice) * 100);
  }, [material]);
  const demoVideoEmbed = material?.demoVideoUrl ? toYouTubeEmbed(material.demoVideoUrl) : null;

  const submitReport = useCallback(
    async (mid: string) => {
      const trimmed = reportReason.trim();
      if (!trimmed) return;
      setReportBusy(true);
      setReportFeedback(null);
      try {
        const res = await apiFetch("reports", {
          method: "POST",
          body: JSON.stringify({ material_id: mid, reason: trimmed }),
        });
        if (!res.ok) {
          const msg = await parseApiErrorMessage(res);
          setReportFeedback({ kind: "err", text: msg });
          return;
        }
        setReportReason("");
        setReportFeedback({ kind: "ok", text: "檢舉已送出，管理員將於後台檢視。" });
      } catch {
        setReportFeedback({ kind: "err", text: "連線失敗，請稍後再試。" });
      } finally {
        setReportBusy(false);
      }
    },
    [reportReason],
  );

  const addToCart = useCallback(
    async (nextPath?: "/checkout") => {
      if (!material) return;
      if (role !== "parent") {
        setCartFeedback({ kind: "err", text: "請先以家長帳號登入後再加入購物車。" });
        return;
      }
      setCartBusy(true);
      setCartFeedback(null);
      try {
        const res = await apiFetch("cart/items", {
          method: "POST",
          body: JSON.stringify({ materialId: material.id, quantity: 1 }),
        });
        if (!res.ok) {
          setCartFeedback({ kind: "err", text: await parseApiErrorMessage(res) });
          return;
        }

        // Keep local mock cart in sync so existing cart UI shows latest state.
        const current = await getCartItems();
        const existed = current.find((it) => it.materialId === material.id);
        const next = existed
          ? current.map((it) => (it.materialId === material.id ? { ...it, quantity: Math.max(1, it.quantity) } : it))
          : [
              ...current,
              {
                id: `cart_local_${material.id}`,
                materialId: material.id,
                title: material.title,
                ageLabel: material.ageLabel,
                price: material.price,
                quantity: 1,
                coverGradient: material.coverGradient,
              },
            ];
        await replaceCartItems(next);
        setCartFeedback({ kind: "ok", text: "已加入購物車。" });
        if (nextPath === "/checkout") {
          router.push(nextPath);
        }
      } catch {
        setCartFeedback({ kind: "err", text: "加入購物車失敗，請稍後再試。" });
      } finally {
        setCartBusy(false);
      }
    },
    [material, role, router],
  );

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center text-[#6B7280]">載入中…</div>
      </AppShell>
    );
  }

  if (!material) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-lg font-semibold text-[#1F2937]">找不到教材</p>
          <Link href="/materials" className="mt-4 inline-block text-[#6C63FF] underline">
            返回列表
          </Link>
        </div>
      </AppShell>
    );
  }

  const contentItemCount = material.contents?.length ?? 0;

  const purchaseBlock = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col">
      <div className="min-w-0 flex-1 sm:flex-none lg:w-full">
        <Button type="button" intent="flow" fullWidth className="lg:w-full" disabled={cartBusy} onClick={() => void addToCart()}>
          加入購物車
        </Button>
      </div>
      <div className="min-w-0 flex-1 sm:flex-none lg:w-full">
        <Button type="button" intent="action" fullWidth className="lg:w-full" disabled={cartBusy} onClick={() => void addToCart("/checkout")}>
          立即購買
        </Button>
      </div>
      <Link href={`/materials/${material.id}/reviews`} className="min-w-0 flex-1 sm:flex-none lg:w-full">
        <Button type="button" intent="neutral" variant="outline" fullWidth className="lg:w-full">
          查看評論
        </Button>
      </Link>
      {cartFeedback ? (
        <p className={`text-xs ${cartFeedback.kind === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{cartFeedback.text}</p>
      ) : null}
    </div>
  );

  return (
    <AppShell>
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB]/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/materials" className="flex size-10 items-center justify-center rounded-2xl hover:bg-[#F4F1FF]" aria-label="返回">
            <IconChevronLeft className="text-[#1F2937]" />
          </Link>
          <div className="flex gap-1">
            <button type="button" className="flex size-10 items-center justify-center rounded-2xl hover:bg-[#F4F1FF]" aria-label="收藏">
              <IconHeart />
            </button>
            <button type="button" className="flex size-10 items-center justify-center rounded-2xl hover:bg-[#F4F1FF]" aria-label="分享">
              <IconShare />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[minmax(260px,400px)_minmax(0,1fr)] lg:gap-10 lg:items-start">
          <div className="space-y-5">
            <div className={`aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-card-default)] border border-[#E5E7EB]/80 bg-gradient-to-br shadow-[var(--shadow-card-default)] ${material.coverGradient}`}>
              {material.coverImageUrl ? (
                <img src={material.coverImageUrl} alt={material.title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            {material.demoVideoUrl ? (
              <Card level="flat" padding="md">
                <p className="text-sm font-semibold text-[#1F2937]">教學玩法影片</p>
                <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-[#E5E7EB]/80 bg-black">
                  {demoVideoEmbed ? (
                    <iframe
                      src={demoVideoEmbed}
                      title={`${material.title} 教學玩法影片`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      controls
                      preload="metadata"
                      className="h-full w-full"
                      src={material.demoVideoUrl}
                    />
                  )}
                </div>
                <a
                  href={material.demoVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-[#6C63FF] underline"
                >
                  無法直接播放？點此開啟影片連結
                </a>
              </Card>
            ) : null}
            {Array.isArray(material.detailImages) && material.detailImages.length > 0 ? (
              <Card level="flat" padding="md">
                <p className="text-sm font-semibold text-[#1F2937]">教材細節照片</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {material.detailImages.map((img, idx) => (
                    <div key={`${img.image_url}-${idx}`} className="overflow-hidden rounded-lg border border-[#E5E7EB]/80 bg-white">
                      <img
                        src={img.image_url}
                        alt={img.alt_text || `${material.title} 細節照片 ${idx + 1}`}
                        className="aspect-[4/3] h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
            {contentItemCount > 0 ? (
              <Card level="flat" padding="md" className="hidden lg:block">
                <p className="text-center text-xs font-medium uppercase tracking-wide text-[#6B7280]">教材內容項目</p>
                <p className="mt-2 text-center text-lg font-bold text-[#1F2937]">共 {contentItemCount} 項</p>
              </Card>
            ) : null}
          </div>

          <div className="mt-5 min-w-0 space-y-5 lg:mt-0">
            <div>
              <h1 className="text-xl font-bold leading-snug text-[#1F2937] sm:text-2xl lg:text-3xl">{material.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  適用：{material.ageLabel}
                </span>
                <Link
                  href={`/materials/${material.id}/reviews`}
                  className={`inline-flex items-center gap-1 text-sm font-semibold hover:underline ${
                    material.reviewCount > 0 ? "text-amber-500" : "text-[#6B7280]"
                  }`}
                >
                  {material.reviewCount > 0 ? (
                    <>
                      ★ {material.rating.toFixed(1)}
                      <span className="font-normal text-[#6B7280]">（{material.reviewCount} 則評價）</span>
                    </>
                  ) : (
                    <span className="font-normal">尚無評價 · 查看評論頁</span>
                  )}
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <span className="text-2xl font-bold text-[#1F2937]">NT${material.price}</span>
                {off > 0 ? (
                  <>
                    <span className="text-sm text-[#9CA3AF] line-through">NT${material.originalPrice}</span>
                    <span className="rounded-full bg-[#FF6B73]/10 px-2 py-0.5 text-xs font-bold text-[#FF6B73]">{off}% OFF</span>
                  </>
                ) : null}
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-[#1F2937]">檢舉不當內容</p>
                {role === "parent" ? (
                  <>
                    <textarea
                      value={reportReason}
                      onChange={(e) => {
                        setReportReason(e.target.value);
                        setReportFeedback(null);
                      }}
                      placeholder="請簡述檢舉原因（必填）"
                      rows={3}
                      disabled={reportBusy}
                      className="w-full max-w-lg rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#374151] outline-none ring-[#6C63FF]/30 focus:border-[#6C63FF] focus:ring-2"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        intent="neutral"
                        variant="outline"
                        className="!text-sm"
                        disabled={reportBusy || !reportReason.trim()}
                        onClick={() => void submitReport(material.id)}
                      >
                        {reportBusy ? "送出中…" : "送出檢舉"}
                      </Button>
                    </div>
                  </>
                ) : role === "teacher" || role === "admin" ? (
                  <p className="text-xs text-[#6B7280]">檢舉功能僅限家長帳號；若有疑慮請聯絡平台客服。</p>
                ) : (
                  <p className="text-xs text-[#6B7280]">
                    請先{" "}
                    <Link href={`/login?redirect=${encodeURIComponent(`/materials/${material.id}`)}`} className="font-medium text-[#6C63FF] underline">
                      登入家長帳號
                    </Link>{" "}
                    後再提交檢舉。
                  </p>
                )}
                {reportFeedback ? (
                  <p
                    className={`max-w-md text-xs ${reportFeedback.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}
                    role="status"
                  >
                    {reportFeedback.text}
                  </p>
                ) : null}
              </div>
            </div>

            <Card level="elevated" padding="md" className="hidden lg:block">
              <p className="text-xs text-[#6B7280]">售價</p>
              <p className="mt-1 text-2xl font-bold text-[#1F2937]">NT${material.price}</p>
              <div className="mt-4">{purchaseBlock}</div>
            </Card>

            <div className="lg:hidden">{purchaseBlock}</div>

            {contentItemCount > 0 ? (
              <div className="rounded-[var(--radius-card-flat)] border border-[#E5E7EB]/80 bg-white p-4 text-center shadow-[var(--shadow-card-default)] sm:p-5 lg:hidden">
                <p className="text-xs font-medium text-[#6B7280]">教材內容項目</p>
                <p className="mt-1 text-lg font-bold text-[#1F2937]">共 {contentItemCount} 項</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10 space-y-4 border-t border-[#E5E7EB]/80 pt-8">
          {material.shortDescription ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">簡短介紹</p>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">{material.shortDescription}</p>
            </Card>
          ) : null}
          {(material.usageDuration || (material.teachingMethods && material.teachingMethods.length > 0)) ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">一句話價值</p>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                {`${material.usageDuration || "可彈性安排課程時間"}，透過${(material.teachingMethods || []).join("、") || "多元互動活動"}學習${material.title}`}
              </p>
            </Card>
          ) : null}
          <Card level="default">
            <p className="text-sm font-semibold text-[#1F2937]">教材內容</p>
            <ul className="mt-3 space-y-2">
              {(material.contents && material.contents.length > 0
                ? material.contents
                : material.outline.map((name) => ({ type: "outline", name, count: null }))).map((item) => (
                <li key={`${item.type}-${item.name}`} className="text-sm text-[#4B5563]">
                  {item.name}
                  {item.count ? ` × ${item.count}` : ""}
                </li>
              ))}
            </ul>
          </Card>
          {material.teachingObjective ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">教學目標</p>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">{material.teachingObjective}</p>
            </Card>
          ) : null}
          {(material.teachingMethods || []).length > 0 ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">教學玩法</p>
              <ul className="mt-2 space-y-1 text-sm text-[#4B5563]">
                {(material.teachingMethods || []).map((method) => (
                  <li key={method} className="flex items-start gap-2">
                    <IconCheck className="mt-0.5 shrink-0 text-[#22C55E]" />
                    <span>{method}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {material.activitySteps ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">教學步驟</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#4B5563]">{material.activitySteps}</p>
            </Card>
          ) : null}
          {material.usageDuration ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">使用時間</p>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">{material.usageDuration}</p>
            </Card>
          ) : null}
          {(material.ageLabel || material.extensionValue) ? (
            <Card level="default">
              <p className="text-sm font-semibold text-[#1F2937]">其他</p>
              <ul className="mt-2 space-y-1 text-sm text-[#4B5563]">
                {material.ageLabel ? <li>適用年齡：{material.ageLabel}</li> : null}
                {material.extensionValue ? <li>延伸活動：{material.extensionValue}</li> : null}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB]/90 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#6B7280]">售價</p>
            <p className="text-lg font-bold text-[#1F2937]">NT${material.price}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" intent="flow" className="!px-3 !py-2.5 text-xs sm:!px-4 sm:text-sm" disabled={cartBusy} onClick={() => void addToCart()}>
              加入購物車
            </Button>
            <Button type="button" intent="action" className="!px-3 !py-2.5 text-xs sm:!px-4 sm:text-sm" disabled={cartBusy} onClick={() => void addToCart("/checkout")}>
              立即購買
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
