import AxeBuilder from "@axe-core/playwright";
import { test } from "@playwright/test";
import { AXE_TAGS, assertAxeClean } from "../shared/axe-policy";
import type { AxeException } from "../shared/axe-policy";
import { MANIFEST, prepareContext, settle } from "./ui-review-harness";

/**
 * **真實資料的 axe**（`UI-QA-A11Y-SWEEP`，2026-09-30）—— L1 的補充，跑在 CI 的 `visual` job。
 *
 * ## 為什麼需要它
 *
 * `tests/e2e/axe-accessibility.spec.ts` 用 mock 資料：空清單不會渲染卡片、摘要、徽章，
 * `UI-QA-A11Y-04`～`-06` 三組 serious 違規都**只在真實資料**出現，先前只有人工跑 scratch 腳本才抓得到。
 *
 * ## 與既有結構的關係（不重複、單一來源）
 *
 *   - **政策**（規則集、critical／serious 阻擋、例外比對與 stale 檢查）：`tests/shared/axe-policy.ts`，與 mock gate 共用
 *   - **路由**：`tests/ui-review/routes.json` —— 所有 `a11y !== false` 的路由（視覺基準只取其中 `visual: true` 的子集）
 *   - **資料／登入／「頁面已穩定」判準**：`tests/visual/ui-review-harness.ts`，與視覺回歸共用
 *     —— URL 必須是目標、`<main>` 內有標題、不是 500／404、network idle、沒有「載入中」
 *
 * 寬度：1440（桌機側欄）與 390（行動版抽屜／底部導覽）—— 兩者的 DOM 結構不同；768 與 1440 共用桌機以外的
 * 同一套元件，視覺基準已覆蓋 768 的版面。
 *
 * 與視覺 spec 不同，本檔**不限 Linux**：它不比對像素，任何平台的結果都有效。
 */

const A11Y_ROUTES = MANIFEST.routes.filter((r) => r.a11y !== false);

const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];

/**
 * 逐條、精確的暫時例外（政策見 `docs/ui-quality-system.md` §2.4）。
 * 目前只有一條：待 Owner 選定商業色的 Hero CTA（`UI-QA-A11Y-03`）。
 */
const KNOWN_EXCEPTIONS: AxeException[] = [
  {
    path: "/dashboard",
    ruleId: "color-contrast",
    target: ".min-h-11",
    scopes: ["w1440", "w390"],
    ref: "UI-QA-A11Y-03",
  },
];

for (const r of A11Y_ROUTES) {
  for (const vp of WIDTHS) {
    test(`axe（真實資料）${r.label}（${r.role ?? "public"}）${r.path} @${vp.w}`, async ({ browser, baseURL }, testInfo) => {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await prepareContext(context, r.role, baseURL!);
      const page = await context.newPage();

      await page.goto(r.path, { waitUntil: "domcontentloaded" });
      await settle(page, r.path);

      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      await assertAxeClean(results, {
        testInfo,
        label: r.label,
        path: r.path,
        role: r.role,
        scope: `w${vp.w}`,
        exceptions: KNOWN_EXCEPTIONS,
      });

      await context.close();
    });
  }
}
