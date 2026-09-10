import { ReactNode } from "react";
import { Paragraph, View, XStack } from "tamagui";
import { designTokens } from "../tokens";

type BadgeTone =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "draft"
  | "pending_review"
  | "published"
  | "unpublished"
  | "pending_payment"
  | "approved"
  | "rejected"
  | "reviewed";

type CardLevel = "elevated" | "default" | "flat";

const badgeToneStyles: Record<BadgeTone, { bg: string; color: string }> = {
  success: { bg: designTokens.colors.status.published.bg, color: designTokens.colors.status.published.text },
  warning: { bg: designTokens.colors.status.pendingReview.bg, color: designTokens.colors.status.pendingReview.text },
  error: { bg: designTokens.colors.status.rejected.bg, color: designTokens.colors.status.rejected.text },
  info: { bg: designTokens.colors.status.reviewed.bg, color: designTokens.colors.status.reviewed.text },
  draft: { bg: designTokens.colors.status.draft.bg, color: designTokens.colors.status.draft.text },
  pending_review: { bg: designTokens.colors.status.pendingReview.bg, color: designTokens.colors.status.pendingReview.text },
  published: { bg: designTokens.colors.status.published.bg, color: designTokens.colors.status.published.text },
  unpublished: { bg: designTokens.colors.status.unpublished.bg, color: designTokens.colors.status.unpublished.text },
  pending_payment: { bg: designTokens.colors.status.pendingPayment.bg, color: designTokens.colors.status.pendingPayment.text },
  approved: { bg: designTokens.colors.status.approved.bg, color: designTokens.colors.status.approved.text },
  rejected: { bg: designTokens.colors.status.rejected.bg, color: designTokens.colors.status.rejected.text },
  reviewed: { bg: designTokens.colors.status.reviewed.bg, color: designTokens.colors.status.reviewed.text },
};

const cardStyles: Record<CardLevel, { borderRadius: number; backgroundColor: string; borderColor: string; borderStyle?: "solid" }> = {
  elevated: {
    borderRadius: designTokens.radius.cardElevated,
    backgroundColor: designTokens.colors.bg.surface,
    borderColor: designTokens.colors.border.default,
  },
  default: {
    borderRadius: designTokens.radius.cardDefault,
    backgroundColor: designTokens.colors.bg.surface,
    borderColor: designTokens.colors.border.default,
  },
  flat: {
    borderRadius: designTokens.radius.cardFlat,
    backgroundColor: designTokens.colors.bg.muted,
    borderColor: designTokens.colors.border.default,
  },
};

export function SurfaceCard({
  title,
  description,
  children,
  level = "default",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  level?: CardLevel;
}) {
  const style = cardStyles[level];
  return (
    <View
      backgroundColor={style.backgroundColor}
      borderWidth={1}
      borderColor={style.borderColor}
      borderRadius={style.borderRadius}
      padding={designTokens.space.lg}
      gap={designTokens.space.sm}
    >
      <Paragraph fontSize={designTokens.typography.heading.h3.size}>{title}</Paragraph>
      {description ? <Paragraph color={designTokens.colors.text.secondary}>{description}</Paragraph> : null}
      {children}
    </View>
  );
}

/*
 * `UI-CONS-10`（Wave UI-3）：`StatusBadge` 與 `mapStatusToTone` 已移除。
 * consumer 歸零（最後一個是 `app/teacher/materials/page.tsx`，已改用 ds `StatusPill`）。
 * 它把 domain state（`published` / `pending_payment`…）與 visual tone 混在同一個 union，
 * 正是 `UI-CONS-12` 要消除的形狀。`SurfaceCard` 仍有 consumer，故本檔保留。
 */
