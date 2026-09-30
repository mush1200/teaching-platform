import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  DISCOUNT_CHIP_CLASS,
  STRONG_DISCOUNT_THRESHOLD,
  discountPercent,
  discountTier,
} from "../../lib/commerce";

/**
 * `UI-QA-COMMERCE-COLOR-2` —— 商業語意規則的回歸契約（2026-10-01，Owner 決定）。
 *
 * 1. 折扣強度門檻：`< 30%` 溫和、`>= 30%` 強（30% 本身是強），以畫面顯示的整數百分比判定。
 * 2. 門檻只有一個實作（`lib/commerce.ts`）：產品程式碼裡不得再出現自行寫的 `>= 30`／`>=30`。
 * 3. 舊的商業粉紅（`#FF6B73`／`#FF6B7A`）不得回到產品程式碼；價格不得再用 `text-edu-cta`；
 *    強折扣不得借用 danger／error token。
 *
 * 純 Node 檢查（不開瀏覽器），因此只在 `chromium-desktop` project 跑一次。
 */

test.skip(({ isMobile }) => isMobile, "純規則檢查，只在 desktop project 跑一次");

const WEB_ROOT = path.resolve(__dirname, "..", "..");

function productSources(): Array<{ file: string; source: string }> {
  const out: Array<{ file: string; source: string }> = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const rel of readdirSync(path.join(WEB_ROOT, dir), { recursive: true }) as string[]) {
      const norm = rel.replace(/\\/g, "/");
      if (!/\.(ts|tsx)$/.test(norm) || norm.startsWith("dev/")) continue;
      const file = `${dir}/${norm}`;
      out.push({ file, source: readFileSync(path.join(WEB_ROOT, file), "utf8") });
    }
  }
  return out;
}

/** 去掉註解（說明歷史的註解會提到舊色值與門檻）。 */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test.describe("商業語意規則（UI-QA-COMMERCE-COLOR-2）", () => {
  test("折扣強度：Owner 的範例與邊界", () => {
    expect(STRONG_DISCOUNT_THRESHOLD).toBe(30);
    for (const p of [10, 20, 29]) expect(discountTier(p), `${p}%`).toBe("mild");
    for (const p of [30, 40, 50]) expect(discountTier(p), `${p}%`).toBe("strong");
    expect(discountTier(0)).toBe("none");
    expect(discountTier(-5)).toBe("none");
    expect(discountTier(Number.NaN)).toBe("none");
  });

  test("百分比以顯示的整數判定（29.6% 顯示 30% → 強）", () => {
    expect(discountPercent(140.8, 200)).toBe(30); // 29.6% → 顯示 30
    expect(discountTier(discountPercent(140.8, 200))).toBe("strong");
    expect(discountPercent(142, 200)).toBe(29);
    expect(discountTier(discountPercent(142, 200))).toBe("mild");
    // 沒有原價（目前產品的狀態：originalPrice === price）→ 沒有折扣
    expect(discountPercent(120, 120)).toBe(0);
    expect(discountPercent(120, 0)).toBe(0);
  });

  test("折扣標籤用 commerce token，不借用 danger／error", () => {
    expect(DISCOUNT_CHIP_CLASS.mild).toBe("bg-commerce-discountMild text-commerce-discountMildText");
    expect(DISCOUNT_CHIP_CLASS.strong).toBe("bg-commerce-discountStrong text-commerce-discountStrongText");
    for (const cls of Object.values(DISCOUNT_CHIP_CLASS)) {
      expect(cls).not.toMatch(/error|danger|rejected|edu-cta|red-|rose-/);
    }
  });

  test("門檻只有一個實作；舊商業粉紅與紅色價格不得回來", () => {
    const offenders: string[] = [];
    for (const { file, source } of productSources()) {
      const c = code(source);
      if (file !== "lib/commerce.ts" && />=\s*30\b/.test(c)) offenders.push(`${file}: 自行寫的 >= 30 門檻`);
      if (/FF6B7[3A]/i.test(c)) offenders.push(`${file}: 舊商業粉紅 #FF6B73／#FF6B7A`);
      if (/NT\$[^\n]*text-edu-cta|text-edu-cta[^\n]*NT\$/.test(c)) offenders.push(`${file}: 價格仍用 text-edu-cta`);
    }
    expect(offenders).toEqual([]);
  });

  test("negative control：掃描真的抓得到違規", () => {
    const bad = 'const tier = percent >= 30 ? "strong" : "mild"; <span className="bg-[#FF6B73]">NT$1</span>';
    expect(/>=\s*30\b/.test(code(bad))).toBe(true);
    expect(/FF6B7[3A]/i.test(code(bad))).toBe(true);
  });
});
