"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMaterialById } from "../../lib/edu-api-mock";
import type { MockMaterial } from "../../lib/mock-data";
import { AppShell } from "../layout/AppShell";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { IconCheck, IconChevronLeft, IconHeart, IconShare } from "../ui/icons";

type Tab = "intro" | "syllabus" | "reviews";

type Props = {
  materialId: string;
};

export function MaterialDetailPage({ materialId }: Props) {
  const [tab, setTab] = useState<Tab>("intro");
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportHint, setReportHint] = useState<string | null>(null);

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

  const purchaseBlock = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-col">
      <Link href="/cart" className="min-w-0 flex-1 sm:flex-none lg:w-full">
        <Button type="button" intent="flow" fullWidth className="lg:w-full">
          加入購物車
        </Button>
      </Link>
      <Link href="/checkout" className="min-w-0 flex-1 sm:flex-none lg:w-full">
        <Button type="button" intent="action" fullWidth className="lg:w-full">
          立即購買
        </Button>
      </Link>
      <Link href={`/materials/${material.id}/reviews`} className="min-w-0 flex-1 sm:flex-none lg:w-full">
        <Button type="button" intent="neutral" variant="outline" fullWidth className="lg:w-full">
          查看評論
        </Button>
      </Link>
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
            <div
              className={`aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-card-default)] border border-[#E5E7EB]/80 bg-gradient-to-br shadow-[var(--shadow-card-default)] ${material.coverGradient}`}
            />
            <Card level="flat" padding="md" className="hidden lg:block">
              <p className="text-center text-xs font-medium uppercase tracking-wide text-[#6B7280]">快速瀏覽</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-[#1F2937]">{material.durationHours} 小時</p>
                  <p className="text-xs text-[#6B7280]">課程時長</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[#1F2937]">{material.units} 個</p>
                  <p className="text-xs text-[#6B7280]">課程單元</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[#1F2937]">{material.learners.toLocaleString()} 人</p>
                  <p className="text-xs text-[#6B7280]">學習人數</p>
                </div>
              </div>
            </Card>
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
                  className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500 hover:underline"
                >
                  ★ {material.rating.toFixed(1)}
                  <span className="font-normal text-[#6B7280]">（{material.reviewCount} 則評價）</span>
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
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setReportHint("檢舉管道即將開放（MVP）。若內容有疑慮，請聯絡平台客服協助。")}
                  className="text-sm font-medium text-[#9CA3AF] underline-offset-4 transition hover:text-[#EF4444] hover:underline"
                >
                  檢舉教材
                </button>
                {reportHint ? (
                  <p className="mt-2 max-w-md text-xs text-[#6B7280]" role="status">
                    {reportHint}
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

            <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-card-flat)] border border-[#E5E7EB]/80 bg-white p-4 text-center shadow-[var(--shadow-card-default)] sm:gap-4 sm:p-5 lg:hidden">
              <div>
                <p className="text-lg font-bold text-[#1F2937]">{material.durationHours} 小時</p>
                <p className="text-xs text-[#6B7280]">課程時長</p>
              </div>
              <div>
                <p className="text-lg font-bold text-[#1F2937]">{material.units} 個</p>
                <p className="text-xs text-[#6B7280]">課程單元</p>
              </div>
              <div>
                <p className="text-lg font-bold text-[#1F2937]">{material.learners.toLocaleString()} 人</p>
                <p className="text-xs text-[#6B7280]">學習人數</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-[#E5E7EB]/80 pt-8">
          <div className="flex gap-2 border-b border-[#E5E7EB]">
            {(
              [
                ["intro", "教材介紹"],
                ["syllabus", "內容大綱"],
                ["reviews", "評論"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`relative pb-3 text-sm font-semibold ${
                  tab === key ? "text-[#FF6B73]" : "text-[#6B7280]"
                }`}
              >
                {label}
                {tab === key ? (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#FF6B73]" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {tab === "intro" ? (
              <Card level="default">
                <p className="text-sm font-semibold text-[#1F2937]">教材介紹</p>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">{material.description}</p>
                <p className="mt-6 font-semibold text-[#1F2937]">適用對象</p>
                <p className="mt-2 text-sm text-[#4B5563]">{material.ageLabel}，希望建立系統化學習節奏的家庭與教師。</p>
                <p className="mt-6 font-semibold text-[#1F2937]">你將學到</p>
                <ul className="mt-3 space-y-2">
                  {material.learnPoints.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-[#4B5563]">
                      <IconCheck className="mt-0.5 shrink-0 text-[#22C55E]" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {tab === "syllabus" ? (
              <Card level="default">
                <p className="text-sm font-semibold text-[#1F2937]">內容包含</p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#4B5563]">
                  {material.outline.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ol>
              </Card>
            ) : null}
            {tab === "reviews" ? (
              <Card level="default">
                <p className="text-sm text-[#6B7280]">查看完整星等分布與留言</p>
                <Link href={`/materials/${material.id}/reviews`} className="mt-3 inline-flex">
                  <Button type="button" intent="action" className="!px-4 !py-2.5 text-sm">
                    前往課程評論頁
                  </Button>
                </Link>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB]/90 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#6B7280]">售價</p>
            <p className="text-lg font-bold text-[#1F2937]">NT${material.price}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/cart">
              <Button type="button" intent="flow" className="!px-3 !py-2.5 text-xs sm:!px-4 sm:text-sm">
                加入購物車
              </Button>
            </Link>
            <Link href="/checkout">
              <Button type="button" intent="action" className="!px-3 !py-2.5 text-xs sm:!px-4 sm:text-sm">
                立即購買
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
