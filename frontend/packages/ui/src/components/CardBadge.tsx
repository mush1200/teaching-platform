import { ReactNode } from "react";
import { Paragraph, View, XStack } from "tamagui";
import { designTokens } from "../tokens";

/*
 * `UI-QA-COMMERCE-COLOR-2`（2026-10-01）：`BadgeTone`／`badgeToneStyles` 已刪除 —— 它們只被已移除的
 * `StatusBadge`（`UI-CONS-10`）使用，全 repo 零參照；其中 `pending_payment`（#ff6b73 on #ffe4e6）只有 2.30:1。
 */

type CardLevel = "elevated" | "default" | "flat";

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
