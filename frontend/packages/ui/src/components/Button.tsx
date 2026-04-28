import { ReactNode } from "react";
import { Button as TamaguiButton, Spinner, Text } from "tamagui";
import { designTokens } from "../tokens";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "flow" | "action" | "neutral" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, { backgroundColor: string; color: string; borderColor: string }> = {
  flow: {
    backgroundColor: designTokens.colors.cta,
    color: designTokens.colors.text.inverse,
    borderColor: designTokens.colors.cta,
  },
  action: {
    backgroundColor: designTokens.colors.action,
    color: designTokens.colors.text.inverse,
    borderColor: designTokens.colors.action,
  },
  neutral: {
    backgroundColor: designTokens.colors.neutral,
    color: designTokens.colors.text.primary,
    borderColor: designTokens.colors.border.default,
  },
  outline: {
    backgroundColor: designTokens.colors.bg.surface,
    color: designTokens.colors.text.primary,
    borderColor: designTokens.colors.border.strong,
  },
  primary: {
    backgroundColor: designTokens.colors.cta,
    color: designTokens.colors.text.inverse,
    borderColor: designTokens.colors.cta,
  },
  secondary: {
    backgroundColor: designTokens.colors.action,
    color: designTokens.colors.text.inverse,
    borderColor: designTokens.colors.action,
  },
  ghost: {
    backgroundColor: "transparent",
    color: designTokens.colors.text.secondary,
    borderColor: "transparent",
  },
  danger: {
    backgroundColor: designTokens.colors.danger,
    color: designTokens.colors.text.inverse,
    borderColor: designTokens.colors.danger,
  },
};

const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 36, paddingHorizontal: 12, fontSize: designTokens.fontSizes.sm },
  md: { height: 42, paddingHorizontal: 16, fontSize: designTokens.fontSizes.md },
  lg: { height: 48, paddingHorizontal: 20, fontSize: designTokens.fontSizes.md },
};

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  /** semantic alias for variant. takes precedence when set */
  intent?: "flow" | "action" | "neutral" | "danger";
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
};

export function Button({ children, variant = "primary", intent, size = "md", disabled, loading, onPress }: ButtonProps) {
  const normalizedVariant: ButtonVariant =
    intent === "flow"
      ? "flow"
      : intent === "action"
        ? "action"
        : intent === "neutral"
          ? "neutral"
          : intent === "danger"
            ? "danger"
            : variant;
  const style = variantStyles[normalizedVariant];
  const sizeStyle = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <TamaguiButton
      onPress={onPress}
      disabled={isDisabled}
      backgroundColor={style.backgroundColor}
      borderColor={style.borderColor}
      borderWidth={1}
      height={sizeStyle.height}
      paddingHorizontal={sizeStyle.paddingHorizontal}
      borderRadius={16}
      opacity={isDisabled ? 0.65 : 1}
      pressStyle={{ opacity: 0.85 }}
    >
      {loading ? <Spinner color={style.color} /> : <Text color={style.color} fontSize={sizeStyle.fontSize} fontWeight="600">{children}</Text>}
    </TamaguiButton>
  );
}
