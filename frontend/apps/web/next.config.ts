import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * 建置產物目錄。預設仍是 `.next`，**未設環境變數時行為完全不變**。
   *
   * 存在的理由是 parallel session：`next build` 會整個換掉 `.next` 的 BUILD_ID 與
   * manifest，而同一棵樹上若有 `next dev` 正在跑，它會在下一次請求時讀到不存在的
   * manifest 並開始回 500。要在不打斷別人的 dev server 的前提下做驗收，
   * 唯一的辦法就是把產物寫到別的地方：
   *
   *     NEXT_DIST_DIR=.next-verify npm run build:web
   *
   * **2026-08-24（`DX-05`）：這個開關已經是 canonical 驗收流程的一部分，不再只是逃生口。**
   * `npm run verify:web`（`frontend/scripts/verify-web.mjs`）與 production E2E 的
   * `next start`（`playwright.config.ts`）都預設把 `NEXT_DIST_DIR` 指到 `.next-verify`，
   * 因此驗收**不會**再碰到 dev server 的 `.next`，也不需要先手動停掉 3010。
   * `next dev` 維持預設的 `.next`，行為完全不變。
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: [
    "react-native",
    "tamagui",
    "@tamagui/core",
    "@tamagui/config",
    "@tamagui/shorthands",
    "@teaching-platform/ui",
    "solito",
    "react-native-web",
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "react-native$": "react-native-web",
    };
    return config;
  },
};

export default nextConfig;
