"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "../components/ui/Card";
import { MaterialCard } from "../components/materials/MaterialCard";
import { getStoredRole, getStoredToken } from "../lib/api-client";
import { mockMaterials } from "../lib/mock-data";

const FEATURE_CARDS = [
  {
    title: "精選教材",
    desc: "依年齡與主題挑選，快速找到適合孩子的學習內容。",
    emoji: "📚",
  },
  {
    title: "安全交易",
    desc: "訂單與付款流程清楚可追溯，購買更有保障。",
    emoji: "🔒",
  },
  {
    title: "購買後下載",
    desc: "核准後即可從下載中心取得教材檔案，隨時複習。",
    emoji: "⬇️",
  },
] as const;

const PREVIEW_MATERIALS = mockMaterials.slice(0, 4);

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    const role = getStoredRole();
    if (!token) return;
    if (role === "teacher") {
      router.replace("/teacher/materials");
      return;
    }
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[var(--color-surface-page)] via-[#FAF8FF] to-[var(--color-surface-page)] font-sans text-[var(--color-text-primary)] antialiased">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6 md:gap-12 md:pt-14">
        {/* Hero */}
        <section className="rounded-[var(--radius-card-elevated)] border border-[#E5E7EB]/70 bg-white p-6 shadow-[var(--shadow-card-elevated)] sm:p-8 md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <div className="max-w-xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
              <h1 className="text-3xl font-bold tracking-tight text-[#1F2937] sm:text-4xl md:text-[2rem] md:leading-tight">
                找到適合孩子的優質教學資源
              </h1>
              <p className="text-base leading-relaxed text-[#6B7280]">
                精選教具與數位教材，協助不同使用者更有效率地陪伴孩子學習。
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/materials"
                  className="inline-flex items-center justify-center rounded-2xl bg-[var(--color-intent-flow)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-button-flow)] transition hover:bg-[var(--color-brand-cta-hover)]"
                >
                  開始逛教材
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-2xl border border-[var(--color-surface-border)] bg-white px-5 py-3 text-sm font-semibold text-[#1F2937] shadow-sm transition hover:border-[#6C63FF]/40 hover:text-[#6C63FF]"
                >
                  登入帳號
                </Link>
              </div>
            </div>
            <div
              className="flex min-h-[180px] flex-1 items-center justify-center rounded-[var(--radius-card-default)] border border-[#E5E7EB]/80 bg-gradient-to-br from-[#EDE9FE] to-[#F4F1FF] shadow-inner lg:max-w-md"
              role="img"
              aria-label="孩子與學習情境插畫區"
            >
              <span className="text-6xl text-[#6B7280]" aria-hidden>
                🎓
              </span>
            </div>
          </div>
        </section>

        {/* Value cards */}
        <section aria-labelledby="home-value-heading" className="space-y-4">
          <h2 id="home-value-heading" className="text-lg font-bold text-[#1F2937] md:text-xl">
            為什麼選擇 EduMarket
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CARDS.map((item) => (
              <Card key={item.title} level="default" padding="lg">
                <div className="flex gap-3">
                  <span className="text-2xl" aria-hidden>
                    {item.emoji}
                  </span>
                  <div>
                    <h3 className="font-bold text-[#1F2937]">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">{item.desc}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Featured materials */}
        <section aria-labelledby="home-featured-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="home-featured-heading" className="text-lg font-bold text-[#1F2937] md:text-xl">
              熱門教材預覽
            </h2>
            <Link href="/materials" className="text-sm font-semibold text-[#6C63FF] hover:underline">
              查看全部
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {PREVIEW_MATERIALS.map((m) => (
              <MaterialCard key={m.id} material={m} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
