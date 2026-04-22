export const designTokens = {
  colors: {
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#0284c7",
    bg: {
      page: "#f8fafc",
      surface: "#ffffff",
      muted: "#f1f5f9",
    },
    text: {
      primary: "#0f172a",
      secondary: "#334155",
      muted: "#64748b",
      inverse: "#ffffff",
    },
    border: {
      default: "#dbe3ee",
      strong: "#cbd5e1",
      danger: "#fca5a5",
    },
  },
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
  },
  lineHeights: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 36,
  },
  typography: {
    heading: {
      h1: { size: 28, lineHeight: 36 },
      h2: { size: 20, lineHeight: 28 },
      h3: { size: 16, lineHeight: 24 },
    },
    body: {
      regular: { size: 16, lineHeight: 24 },
      small: { size: 14, lineHeight: 20 },
      caption: { size: 12, lineHeight: 16 },
    },
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  shadows: {
    sm: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 2,
    },
  },
} as const;

export type DesignTokens = typeof designTokens;
