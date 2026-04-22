import { ReactNode } from "react";
import { Button as TamaguiButton, Spinner, Text } from "tamagui";
import { designTokens } from "../tokens";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, { backgroundColor: string; color: string; borderColor: string }> = {
  primary: {
    backgroundColor: designTokens.colors.primary,
    color: designTokens.colors.text.inverse,
    borderColor: designTokens.colors.primary,
  },
  secondary: {
    backgroundColor: designTokens.colors.bg.surface,
    color: designTokens.colors.text.primary,
    borderColor: designTokens.colors.border.strong,
  },
  ghost: {
    backgroundColor: "transparent",
    color: designTokens.colors.text.primary,
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
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
};

export function Button({ children, variant = "primary", size = "md", disabled, loading, onPress }: ButtonProps) {
  const style = variantStyles[variant];
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
      opacity={isDisabled ? 0.65 : 1}
      pressStyle={{ opacity: 0.85 }}
    >
      {loading ? <Spinner color={style.color} /> : <Text color={style.color} fontSize={sizeStyle.fontSize}>{children}</Text>}
    </TamaguiButton>
  );
}
