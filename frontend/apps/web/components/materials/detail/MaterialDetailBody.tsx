import Link from "next/link";
import type { MockMaterial, MockReview } from "../../../lib/view-models";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { ReviewItem } from "../../reviews/ReviewItem";
import { MaterialDetailSection } from "./MaterialDetailSection";
import { chipToneByGroup, type FeatureGroupRow } from "./detail-utils";

type Props = {
  material: MockMaterial;
  materialId: string;
  contentSummaryRows: string[];
  featureLeftColumn: FeatureGroupRow[];
  featureRightColumn: FeatureGroupRow[];
  latestReviews: MockReview[];
};

function FeatureColumn({ groups }: { groups: FeatureGroupRow[] }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ds-textMuted">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item) => (
              <Chip key={`${group.key}-${item}`} tone={chipToneByGroup(group.key)}>
                {item}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MaterialDetailBody({
  material,
  materialId,
  contentSummaryRows,
  featureLeftColumn,
  featureRightColumn,
  latestReviews,
}: Props) {
  const hasReviews = latestReviews.length > 0;
  const teachingMethodBullets = (material.teachingMethods ?? []).filter(Boolean);
  const activitySteps = material.activitySteps
    ?.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Card level="default" padding="none" className="overflow-hidden">
      {material.shortDescription ? (
        <MaterialDetailSection title="簡短介紹">
          <p className="max-w-2xl text-sm leading-relaxed text-ds-body">{material.shortDescription}</p>
        </MaterialDetailSection>
      ) : null}

      {contentSummaryRows.length > 0 ? (
        <MaterialDetailSection title="教材包含">
          <ul className="space-y-2">
            {contentSummaryRows.map((row) => (
              <li key={row} className="flex items-start gap-2 text-sm text-ds-body">
                <span className="mt-0.5 font-semibold text-emerald-600" aria-hidden>
                  ✓
                </span>
                <span>{row}</span>
              </li>
            ))}
          </ul>
        </MaterialDetailSection>
      ) : null}

      {material.teachingObjective ? (
        <MaterialDetailSection title="教學目標">
          <p className="max-w-2xl text-sm leading-relaxed text-ds-body">{material.teachingObjective}</p>
        </MaterialDetailSection>
      ) : null}

      {teachingMethodBullets.length > 0 ? (
        <MaterialDetailSection title="教學玩法">
          <ul className="max-w-2xl list-inside list-disc space-y-1 text-sm text-ds-body">
            {teachingMethodBullets.map((method) => (
              <li key={method}>{method}</li>
            ))}
          </ul>
        </MaterialDetailSection>
      ) : null}

      {activitySteps && activitySteps.length > 0 ? (
        <MaterialDetailSection title="教學步驟">
          <ol className="max-w-2xl space-y-2">
            {activitySteps.map((step, idx) => (
              <li key={`${step}-${idx}`} className="flex items-start gap-2 text-sm text-ds-body">
                <span className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-semibold text-violet-700">
                  {idx + 1}
                </span>
                <span>{step.replace(/^\d+\.\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </MaterialDetailSection>
      ) : null}

      {material.usageDuration ? (
        <MaterialDetailSection title="使用時間">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-ds-surfaceSubtle px-3 py-1.5 text-sm font-medium text-ds-body">
            <span aria-hidden>⏱</span>
            {material.usageDuration}
          </p>
        </MaterialDetailSection>
      ) : null}

      {(featureLeftColumn.length > 0 || featureRightColumn.length > 0) && (
        <MaterialDetailSection title="教材特色">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FeatureColumn groups={featureLeftColumn} />
            <FeatureColumn groups={featureRightColumn} />
          </div>
        </MaterialDetailSection>
      )}

      {material.extensionValue ? (
        <MaterialDetailSection title="延伸活動">
          <p className="max-w-2xl text-sm leading-relaxed text-ds-body">{material.extensionValue}</p>
        </MaterialDetailSection>
      ) : null}

      <MaterialDetailSection
        id="usage-feedback"
        title="教學回饋"
        description={
          material.reviewCount > 0
            ? `平均 ${material.rating.toFixed(1)} 分 · ${material.reviewCount} 則回饋`
            : "購買後可於「我的教材」分享教學回饋"
        }
        action={
          <span className="shrink-0 rounded-full border border-ds-border bg-ds-surfaceSubtle px-3 py-1 text-xs font-medium text-ds-textMuted">
            最新優先
          </span>
        }
      >
        <div className="space-y-3">
          {hasReviews ? (
            latestReviews.map((review) => (
              <ReviewItem key={review.id} review={review} compact showRoleBadge={false} />
            ))
          ) : (
            <div className="rounded-ds-card border border-dashed border-ds-border bg-ds-surfaceSubtle px-4 py-8 text-center">
              <div
                className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-feedback-emptyIconBg text-2xl"
                aria-hidden
              >
                💬
              </div>
              <p className="text-sm font-medium text-ds-heading">目前還沒有回饋</p>
              <p className="mt-1 text-sm text-ds-textMuted">先看看教材亮點，購買後可在我的教材填寫回饋。</p>
            </div>
          )}
        </div>
        <Link
          href={`/materials/${materialId}/reviews`}
          className="mt-4 inline-flex text-sm font-semibold text-edu-primary transition-colors hover:text-edu-cta"
        >
          查看全部回饋 →
        </Link>
      </MaterialDetailSection>
    </Card>
  );
}
