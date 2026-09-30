import { expect, test } from "@playwright/test";
import { MANIFEST, normalizeDynamicText, prepareContext, settle } from "./ui-review-harness";

/**
 * **Canonical 視覺回歸**（L2，`UI-QA-VISUAL-BASELINE`）—— `toHaveScreenshot`。
 * 設定與拓撲見 `playwright.visual.config.ts`，政策見 `docs/ui-quality-system.md` §3。
 *
 * ## 範圍
 *
 * `tests/ui-review/routes.json` 中 `visual: true` 的路由 × 390／768／1440。路由清單只有那一份；
 * `measure-layout.mjs` 讀同一份，但它是**診斷用**矩陣，不是基準。
 * 截圖為**第一屏**（viewport），不是整頁 —— 基準的目的是抓版面／外殼／字級／色彩的回歸，
 * 整頁截圖會讓一筆資料的增減就改動整張圖。
 *
 * ## 何時才截圖（「頁面已穩定」的證據，全部都要成立）
 *
 *   1. 停留的 URL 就是目標路由（沒被導去 `/login`／`/403`）
 *   2. `<main>` 裡有頁面標題 —— 頁面會先在外殼之外掛載一次（`UI-QA-SHELL-MOUNT`），不能量到那一份
 *   3. 不是 `app/error.tsx`（500）或 `app/not-found.tsx`（404）
 *   4. network idle、`document.fonts.ready`、所有 `<img>` 載入完成、`<main>` 內沒有「載入中」
 *   5. `toHaveScreenshot` 自己再要求連續兩張相同
 *
 * ## 正規化與遮罩（只處理真正會變的東西）
 *
 *   - **日期／時間 → 正規化，不遮罩。** fixture 的時間是以 seed 當下為基準的相對偏移，絕對日期每天不同。
 *     截圖前把文字節點裡符合日期／時間格式的**數字**換成 `0`（`2026/09/29` → `0000/00/00`），
 *     版面、字級、位置都保留。先前以 `getByText` 遮罩時會命中整個容器（Admin 總覽兩整塊面板被塗滿），
 *     那等於不驗那一區 —— 因此改為正規化。
 *   - **不再遮罩任何元素**（2026-10-01）：先前以遮罩排除的舊粉色（`#FF6B73`／`#FF6B7A`）已隨
 *     `UI-QA-COMMERCE-COLOR-2` 全數歸位（數量徽章 → `commerce.badgePurchase`），遮罩已移除，徽章進入基準。
 *
 * 外部網址的圖片（backend 啟動時為無封面教材補的 `picsum.photos`）一律以本機的固定圖取代 ——
 * 基準不得依賴外部服務。
 */

const VISUAL_ROUTES = MANIFEST.routes.filter((r) => r.visual);

const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
];

test.skip(
  process.platform !== "linux" && process.env.VISUAL_ALLOW_NON_LINUX !== "1",
  "canonical 視覺基準只在 Linux（CI）產生與比對；本機請用 CI 的 visual job"
);

function slug(value: string) {
  return value.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

for (const r of VISUAL_ROUTES) {
  for (const vp of WIDTHS) {
    test(`${r.label}（${r.role ?? "public"}）${r.path} @${vp.w}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await prepareContext(context, r.role, baseURL!);
      const page = await context.newPage();

      await page.goto(r.path, { waitUntil: "domcontentloaded" });
      await settle(page, r.path);
      await normalizeDynamicText(page);

      await expect(page).toHaveScreenshot(`${r.role ?? "public"}-${slug(r.path)}-${vp.w}.png`);

      await context.close();
    });
  }
}
