"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getMaterialById, getReviewsForMaterial } from "../../lib/api-repository";
import type { MockMaterial, MockReview } from "../../lib/view-models";
import { apiFetch, getStoredRole, parseApiErrorMessage } from "../../lib/api-client";
import type { UserRole } from "../../lib/api-types";
import { groupMaterialFeatures, MATERIAL_FEATURE_GROUP_LABELS } from "@/src/constants/materialFeatures";
import { AppShell } from "../layout/AppShell";
import { MaterialDetailBody } from "./detail/MaterialDetailBody";
import {
  FEATURE_GRID_LEFT_ORDER,
  FEATURE_GRID_RIGHT_ORDER,
  FEATURE_GROUP_ORDER,
  type FeatureGroupRow,
} from "./detail/detail-utils";
import { MaterialDetailGallery } from "./detail/MaterialDetailGallery";
import { MaterialDetailHeader } from "./detail/MaterialDetailHeader";
import { MaterialDetailHeroInfo } from "./detail/MaterialDetailHeroInfo";
import { MaterialDetailPurchasePanel } from "./detail/MaterialDetailPurchasePanel";

type Props = {
  materialId: string;
};

export function MaterialDetailPage({ materialId }: Props) {
  const router = useRouter();
  const [material, setMaterial] = useState<MockMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [activeHeroImageUrl, setActiveHeroImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setRole(getStoredRole());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, reviewRows] = await Promise.all([getMaterialById(materialId), getReviewsForMaterial(materialId)]);
      if (!cancelled) {
        setMaterial(m);
        setReviews(reviewRows);
        setActiveHeroImageUrl(m?.coverImageUrl ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  const discountPercent = useMemo(() => {
    if (!material || material.originalPrice <= material.price) return 0;
    return Math.round((1 - material.price / material.originalPrice) * 100);
  }, [material]);

  const latestReviews = useMemo(
    () => [...reviews].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3),
    [reviews],
  );

  const { heroFeatureChips, contentSummaryRows, featureLeftColumn, featureRightColumn } = useMemo(() => {
    if (!material) {
      return {
        heroFeatureChips: [] as Array<{ label: string; groupKey: FeatureGroupRow["key"] }>,
        contentSummaryRows: [] as string[],
        featureLeftColumn: [] as FeatureGroupRow[],
        featureRightColumn: [] as FeatureGroupRow[],
      };
    }

    const grouped = groupMaterialFeatures(material.materialFeatures);
    const teachingMethodsFallback = (material.teachingMethods ?? []).filter(Boolean);
    if (grouped.teaching_methods.length === 0 && teachingMethodsFallback.length > 0) {
      grouped.teaching_methods = teachingMethodsFallback;
    }

    const groupsWithLabels: FeatureGroupRow[] = FEATURE_GROUP_ORDER.map((key) => ({
      key,
      label: MATERIAL_FEATURE_GROUP_LABELS[key],
      items: grouped[key],
    })).filter((group) => group.items.length > 0);

    const preview = groupsWithLabels
      .flatMap((group) => group.items.map((item) => ({ label: item, groupKey: group.key })))
      .slice(0, 4);

    const summaryRows = (material.contents ?? [])
      .slice(0, 6)
      .map((item) => `${item.name}${item.count ? ` × ${item.count}` : ""}`)
      .filter(Boolean);

    const featureGroupMap = new Map(groupsWithLabels.map((group) => [group.key, group]));

    return {
      heroFeatureChips: preview,
      contentSummaryRows: summaryRows,
      featureLeftColumn: FEATURE_GRID_LEFT_ORDER.map((key) => featureGroupMap.get(key)).filter(
        (group): group is FeatureGroupRow => Boolean(group),
      ),
      featureRightColumn: FEATURE_GRID_RIGHT_ORDER.map((key) => featureGroupMap.get(key)).filter(
        (group): group is FeatureGroupRow => Boolean(group),
      ),
    };
  }, [material]);

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
          body: JSON.stringify({ materialId: material.id, quantity: purchaseQty }),
        });
        if (!res.ok) {
          setCartFeedback({ kind: "err", text: await parseApiErrorMessage(res) });
          return;
        }
        setCartFeedback({ kind: "ok", text: "已加入購物車。" });
        if (nextPath === "/checkout") router.push(nextPath);
      } catch {
        setCartFeedback({ kind: "err", text: "加入購物車失敗，請稍後再試。" });
      } finally {
        setCartBusy(false);
      }
    },
    [material, purchaseQty, role, router],
  );

  const scrollToFeedback = useCallback(() => {
    document.getElementById("usage-feedback")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const galleryImages = useMemo(() => {
    if (!material) return [];
    return [
      { image_url: material.coverImageUrl, alt_text: `${material.title} 封面`, isCover: true },
      ...(material.detailImages ?? []).map((img) => ({
        image_url: img.image_url,
        alt_text: img.alt_text,
        isCover: false,
      })),
    ].filter(
      (img): img is { image_url: string; alt_text: string | null | undefined; isCover: boolean } =>
        typeof img.image_url === "string" && img.image_url.length > 0,
    );
  }, [material]);

  if (loading) {
    return (
      <AppShell className="bg-ds-page">
        <div className="flex min-h-[50vh] items-center justify-center text-ds-textMuted">載入中…</div>
      </AppShell>
    );
  }

  if (!material) {
    return (
      <AppShell className="bg-ds-page">
        <div className="mx-auto max-w-lg px-page-mobile py-16 text-center sm:px-page-tablet">
          <p className="text-lg font-semibold text-ds-heading">找不到教材</p>
          <Link href="/materials" className="mt-4 inline-block text-sm font-semibold text-edu-primary hover:text-edu-cta">
            返回列表
          </Link>
        </div>
      </AppShell>
    );
  }

  const purchaseHandlers = {
    price: material.price,
    originalPrice: material.originalPrice,
    discountPercent,
    quantity: purchaseQty,
    busy: cartBusy,
    feedback: cartFeedback,
    onDecrease: () => setPurchaseQty((prev) => Math.max(1, prev - 1)),
    onIncrease: () => setPurchaseQty((prev) => Math.min(99, prev + 1)),
    onAddToCart: () => void addToCart(),
    onBuyNow: () => void addToCart("/checkout"),
  };

  return (
    <AppShell className="bg-ds-page">
      <div className="min-h-dvh pb-28 lg:pb-10">
        <MaterialDetailHeader />

        <div className="mx-auto max-w-wide px-page-mobile sm:px-page-tablet lg:px-page-desktop">
          <section className="py-4 lg:py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,320px)] lg:items-start lg:gap-8">
              <MaterialDetailGallery
                title={material.title}
                coverGradient={material.coverGradient}
                activeImageUrl={activeHeroImageUrl}
                fallbackCoverUrl={material.coverImageUrl}
                images={galleryImages}
                onSelectImage={setActiveHeroImageUrl}
                onPreview={() => setPreviewImageUrl(activeHeroImageUrl || material.coverImageUrl || null)}
              />

              <div className="min-w-0">
                <MaterialDetailHeroInfo
                  material={material}
                  heroFeatureChips={heroFeatureChips}
                  onScrollToFeedback={scrollToFeedback}
                />
              </div>

              <div className="hidden lg:block">
                <MaterialDetailPurchasePanel {...purchaseHandlers} layout="card" />
              </div>
            </div>

            <div className="mt-4 lg:hidden">
              <MaterialDetailPurchasePanel {...purchaseHandlers} layout="card" />
            </div>
          </section>

          <section className="mt-2 border-t border-ds-border pt-6 lg:mt-4">
            <MaterialDetailBody
              material={material}
              materialId={material.id}
              contentSummaryRows={contentSummaryRows}
              featureLeftColumn={featureLeftColumn}
              featureRightColumn={featureRightColumn}
              latestReviews={latestReviews}
            />
          </section>
        </div>

        <MaterialDetailPurchasePanel {...purchaseHandlers} layout="sticky" />
      </div>

      {previewImageUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImageUrl(null)}
          aria-label="關閉預覽"
        >
          <img src={previewImageUrl} alt="教材預覽" className="max-h-[90vh] max-w-[90vw] rounded-ds-card object-contain shadow-ds-card-hover" />
        </button>
      ) : null}
    </AppShell>
  );
}
