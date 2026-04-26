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

  return (
    <AppShell>
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB]/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
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

      <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div
            className={`aspect-[4/3] w-full shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br shadow-md sm:w-52 ${material.coverGradient}`}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-xl font-bold leading-snug text-[#1F2937] sm:text-2xl">{material.title}</h1>
            <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {material.ageLabel}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-amber-500">★ {material.rating.toFixed(1)}</span>
              <span className="text-[#6B7280]">（{material.reviewCount} 則評價）</span>
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <span className="text-2xl font-bold text-[#1F2937]">NT${material.price}</span>
              {off > 0 ? (
                <>
                  <span className="text-sm text-[#9CA3AF] line-through">NT${material.originalPrice}</span>
                  <span className="rounded-full bg-[#FF6B73]/10 px-2 py-0.5 text-xs font-bold text-[#FF6B73]">{off}% OFF</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-3xl border border-[#E5E7EB]/80 bg-white p-4 text-center shadow-sm sm:gap-4 sm:p-5">
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

        <div className="mt-6 flex gap-2 border-b border-[#E5E7EB]">
          {(
            [
              ["intro", "課程介紹"],
              ["syllabus", "課程大綱"],
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
            <Card>
              <p className="text-sm leading-relaxed text-[#4B5563]">{material.description}</p>
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
            <Card>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-[#4B5563]">
                {material.outline.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
            </Card>
          ) : null}
          {tab === "reviews" ? (
            <Card>
              <p className="text-sm text-[#6B7280]">完整評論列表請見</p>
              <Link href={`/materials/${material.id}/reviews`} className="mt-2 inline-block font-semibold text-[#6C63FF] underline">
                課程評論頁 →
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E5E7EB]/90 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#6B7280]">售價</p>
            <p className="text-lg font-bold text-[#1F2937]">NT${material.price}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/cart">
              <Button variant="outline" className="!px-4 !py-2.5 text-xs sm:text-sm">
                加入購物車
              </Button>
            </Link>
            <Link href="/checkout">
              <Button className="!px-4 !py-2.5 text-xs sm:text-sm">立即購買</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
