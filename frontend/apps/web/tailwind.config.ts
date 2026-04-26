import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        edu: {
          page: "#F4F1FF",
          card: "#FFFFFF",
          primary: "#6C63FF",
          cta: "#FF6B73",
          ctaHover: "#FF5964",
          text: "#1F2937",
          muted: "#6B7280",
          border: "#E5E7EB",
          success: "#22C55E",
          warning: "#F59E0B",
          error: "#EF4444",
        },
      },
      boxShadow: {
        edu: "0 10px 40px rgba(15, 23, 42, 0.06)",
        "edu-lg": "0 16px 48px rgba(108, 99, 255, 0.12)",
      },
      maxWidth: {
        mobile: "390px",
      },
    },
  },
  plugins: [],
};

export default config;
