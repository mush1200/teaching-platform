import { ReactNode } from "react";
import { Paragraph, View, XStack } from "tamagui";
import { designTokens } from "../tokens";

type BadgeTone = "success" | "warning" | "error" | "info";

const badgeToneStyles: Record<BadgeTone, { bg: string; color: string }> = {
  success: { bg: "#dcfce7", color: designTokens.colors.success },
  warning: { bg: "#fef3c7", color: designTokens.colors.warning },
  error: { bg: "#fee2e2", color: designTokens.colors.danger },
  info: { bg: "#dbeafe", color: designTokens.colors.info },
};

export function SurfaceCard({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <View
      backgroundColor={designTokens.colors.bg.surface}
      borderWidth={1}
      borderColor={designTokens.colors.border.default}
      borderRadius={designTokens.radius.md}
      padding={designTokens.space.lg}
      gap={designTokens.space.sm}
    >
      <Paragraph fontSize={designTokens.typography.heading.h3.size}>{title}</Paragraph>
      {description ? <Paragraph color={designTokens.colors.text.secondary}>{description}</Paragraph> : null}
      {children}
    </View>
  );
}

export function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const style = badgeToneStyles[tone];
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
