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

function mapStatusToTone(status?: string): BadgeTone {
  if (!status) return "info";
  if (status in badgeToneStyles) return status as BadgeTone;
  if (status === "pending") return "pending_review";
  if (status === "completed" || status === "paid") return "approved";
  return "info";
}

export function StatusBadge({ tone, label, status }: { tone?: BadgeTone; label: string; status?: string }) {
  const resolvedTone = tone ?? mapStatusToTone(status);
  const style = badgeToneStyles[resolvedTone];
  return (
    <XStack
      alignSelf="flex-start"
      backgroundColor={style.bg}
      borderRadius={999}
      paddingHorizontal={10}
      paddingVertical={4}
    >
      <Paragraph color={style.color} fontSize={designTokens.fontSizes.sm}>
        {label}
      </Paragraph>
    </XStack>
  );
}
