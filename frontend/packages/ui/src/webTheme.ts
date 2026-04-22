import { designTokens } from "./tokens";

export const webTheme = {
  background: designTokens.colors.bg.page,
  color: designTokens.colors.text.primary,
  color11: designTokens.colors.text.secondary,
  color12: designTokens.colors.text.primary,
  borderColor: designTokens.colors.border.default,
  borderColorHover: designTokens.colors.border.strong,
  borderColorFocus: designTokens.colors.primary,
  borderColorPress: designTokens.colors.border.strong,
  placeholderColor: designTokens.colors.text.muted,
} as const;
