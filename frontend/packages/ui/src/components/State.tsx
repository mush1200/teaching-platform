import { Button, H3, Paragraph, Spinner, YStack } from "tamagui";
import { designTokens } from "../tokens";

type StateSize = "sm" | "md" | "lg";

const sizeConfig: Record<StateSize, { padding: number; spinnerSize: "small" | "large" }> = {
  sm: { padding: 12, spinnerSize: "small" },
  md: { padding: 16, spinnerSize: "large" },
  lg: { padding: 24, spinnerSize: "large" },
};

export function LoadingState({ title = "資料載入中...", size = "md" }: { title?: string; size?: StateSize }) {
  const config = sizeConfig[size];
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="$3"
      padding={config.padding}
      borderWidth={1}
      borderColor={designTokens.colors.border.default}
      borderRadius={designTokens.radius.md}
      backgroundColor={designTokens.colors.bg.surface}
    >
      <Spinner size={config.spinnerSize} color={designTokens.colors.info} />
      <Paragraph color={designTokens.colors.text.secondary}>{title}</Paragraph>
    </YStack>
  );
}

export function EmptyState({
  title = "目前沒有資料",
  description = "你可以稍後再試，或先建立第一筆資料。",
  actionLabel,
  onAction,
  size = "md",
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: StateSize;
}) {
  const config = sizeConfig[size];
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="$3"
      padding={config.padding}
      borderWidth={1}
      borderStyle="dashed"
      borderColor={designTokens.colors.border.default}
      borderRadius={designTokens.radius.md}
      backgroundColor={designTokens.colors.bg.muted}
    >
      <H3>{title}</H3>
      <Paragraph textAlign="center" color={designTokens.colors.text.secondary}>
        {description}
      </Paragraph>
      {actionLabel ? <Button onPress={onAction}>{actionLabel}</Button> : null}
    </YStack>
  );
}

export function ErrorState({
  title = "讀取失敗",
  description = "系統忙碌中，請稍後再試。",
  errorCode,
  retryLabel = "重新整理",
  onRetry,
  size = "md",
}: {
  title?: string;
  description?: string;
  errorCode?: string | number;
  retryLabel?: string;
  onRetry?: () => void;
  size?: StateSize;
}) {
  const config = sizeConfig[size];
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="$3"
      padding={config.padding}
      borderWidth={1}
      borderColor={designTokens.colors.border.danger}
      borderRadius={designTokens.radius.md}
      backgroundColor={designTokens.colors.bg.surface}
    >
      <H3 color={designTokens.colors.danger}>{title}</H3>
      <Paragraph textAlign="center" color={designTokens.colors.text.secondary}>
        {description}
      </Paragraph>
      {errorCode ? <Paragraph color={designTokens.colors.text.muted}>錯誤碼：{errorCode}</Paragraph> : null}
      {onRetry ? <Button onPress={onRetry}>{retryLabel}</Button> : null}
    </YStack>
  );
}
