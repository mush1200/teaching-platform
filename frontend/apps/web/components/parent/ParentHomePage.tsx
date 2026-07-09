"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@teaching-platform/ui";
import { getRecentMaterialIds } from "../../lib/recent-materials";
import {
  listMaterialsPreview,
  listRecommendedForHome,
  resolveMaterialsByIds,
} from "../../lib/materials-query";
import type { MockMaterial } from "../../lib/view-models";
import { Hero } from "./Hero";
import { MaterialCarousel } from "./MaterialCarousel";
import { MaterialGrid } from "./MaterialGrid";
import { Section } from "./Section";

/** 每個區塊（為你推薦、熱門、新上架、高回饋等）顯示 8 張卡片（桌機 2 排 × 4 欄） */
const SECTION_LIMIT = 8;

export function ParentHomePage() {
  const [recent, setRecent] = useState<MockMaterial[]>([]);
  const [forYou, setForYou] = useState<MockMaterial[]>([]);
  const [hot, setHot] = useState<MockMaterial[]>([]);
  const [latest, setLatest] = useState<MockMaterial[]>([]);
  const [topRated, setTopRated] = useState<MockMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = getRecentMaterialIds();
      const recentResolved = ids.length > 0 ? await resolveMaterialsByIds(ids) : [];

      const hotList = await listMaterialsPreview({ sort: "popular", limit: SECTION_LIMIT });
      const hotIds = hotList.map((m) => m.id);

      const [fy, lat, rated] = await Promise.all([
        listRecommendedForHome(hotIds, SECTION_LIMIT),
        listMaterialsPreview({ sort: "latest", limit: SECTION_LIMIT }),
        listMaterialsPreview({ sort: "rating", limit: SECTION_LIMIT }),
      ]);

      setRecent(recentResolved);
      setForYou(fy);
      setHot(hotList);
      setLatest(lat);
      setTopRated(rated);
    } catch {
      setError("無法載入首頁內容，請重新整理再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl">
      <Hero />

      <div className="mt-7 space-y-9 md:space-y-10 lg:space-y-11">
        {error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <p className="text-center text-sm text-[#6B7280]" aria-live="polite">
            載入中…
          </p>
        ) : null}

        {!loading && recent.length > 0 ? (
          <Section title="最近瀏覽" icon="🕘" subtitle="你最近查看過的教材" actionLabel="查看更多教材 >">
            <MaterialCarousel materials={recent} trackRecent />
          </Section>
        ) : null}

        {!loading && forYou.length > 0 ? (
          <Section title="為你推薦" icon="✨" subtitle="根據熱門與最新教材精選" actionLabel="查看更多教材 >">
            <MaterialGrid materials={forYou} trackRecent />
          </Section>
        ) : null}

        {!loading && hot.length > 0 ? (
          <Section title="熱門教材" icon="🔥" subtitle="最多人瀏覽與購買的教材" actionLabel="查看更多教材 >">
            <MaterialGrid materials={hot} trackRecent />
          </Section>
        ) : null}

        {!loading && latest.length > 0 ? (
          <Section title="最新教材" icon="🆕" subtitle="最新上架教材" actionLabel="查看更多教材 >">
            <MaterialGrid materials={latest} trackRecent />
          </Section>
        ) : null}

        {!loading && topRated.length > 0 ? (
          <Section title="高回饋" icon="⭐" subtitle="家長與老師教學回饋最高的教材" actionLabel="查看更多教材 >">
            <MaterialGrid materials={topRated} trackRecent />
          </Section>
        ) : null}

        {!loading && !error && hot.length === 0 && forYou.length === 0 ? (
          <p className="rounded-2xl border border-[#E5E7EB]/80 bg-white p-8 text-center text-sm text-[#6B7280]">
            目前沒有可供展示的教材，請稍後再試。
          </p>
        ) : null}
      </div>
    </div>
  );
}
