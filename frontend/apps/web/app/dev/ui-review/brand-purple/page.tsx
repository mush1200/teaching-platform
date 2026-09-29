import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * 品牌紫候選色比較頁（**dev-only**，`UI-QA-A11Y-01`，2026-09-29）。
 *
 * Owner 決定：品牌紫必須壓暗到「白字 ≥ 4.5:1（WCAG AA 一般字級）」。本頁把現行色與三個候選
 * 並排在**真實的專案字型**（Inter ＋ Noto Sans TC）與真實元件樣式上，供 Owner 選 A／B／C。
 * **2026-09-29 Owner 選定 B（`#5C4EEA`），並已套用為 canonical 品牌紫。** 本頁保留作為決策紀錄：
 * 「舊值」欄是被取代的 `#6C63FF`，B 欄即現行品牌紫。頁面本身不讀 token，數值固定寫在下方，
 * 因此即使日後品牌色再變，這裡記錄的仍是當時的比較。
 *
 * ## 候選色的產生方式
 *
 * 在 OKLCH 中**固定色相（−80.2°）與彩度（0.224）**，只降低亮度，直到白字對比達到目標值。
 * 不用 HSL 壓暗：HSL 在 100% 飽和度下越暗越偏電光藍（例如 `#3A2EFF`），品牌感會跑掉。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），並由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 以 source scan 釘住。本頁沒有任何登入繞道、
 * 不發 API、不寫 cookie／storage —— 純靜態展示。
 */

type Swatch = {
  key: string;
  label: string;
  hex: string;
  rgb: string;
  onWhite: number;
  character: string;
};

/* 數值由 WCAG 2.x 相對亮度公式計算（與 `contrast-contract.spec.ts` 同一套公式）。 */
const SWATCHES: Swatch[] = [
  { key: "current", label: "舊值", hex: "#6C63FF", rgb: "108, 99, 255", onWhite: 4.32, character: "2026-09-29 前的品牌紫（已取代）" },
  { key: "A", label: "A", hex: "#655AF6", rgb: "101, 90, 246", onWhite: 4.83, character: "略暗一點" },
  { key: "B", label: "B", hex: "#5C4EEA", rgb: "92, 78, 234", onWhite: 5.63, character: "平衡 —— ✓ Owner 選定，現行品牌紫" },
  { key: "C", label: "C", hex: "#5443DD", rgb: "84, 67, 221", onWhite: 6.51, character: "明顯較暗" },
];

const AA = 4.5;

/** 每一欄以 CSS 變數注入候選色 —— 下面的樣式全部讀 `--c`，不另建任何 token。 */
function columnStyle(hex: string): CSSProperties {
  return { "--c": hex } as CSSProperties;
}

/* 與 `components/ui/Button.tsx` 的 `action / solid` 相同的結構（尺寸、圓角、hover、focus-visible）。 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition " +
  "bg-[var(--c)] hover:brightness-95 disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";

function Row({ title, note, children }: { title: string; note?: string; children: (s: Swatch) => ReactNode }) {
  return (
    <>
      <div className="col-span-full mt-6 border-t border-black/[0.06] pt-4">
        <h2 className="text-title text-ds-heading">{title}</h2>
        {note ? <p className="mt-0.5 text-meta text-ds-body">{note}</p> : null}
      </div>
      {SWATCHES.map((s) => (
        <div key={s.key} style={columnStyle(s.hex)} className="flex flex-wrap items-center gap-2">
          {children(s)}
        </div>
      ))}
    </>
  );
}

export default function BrandPurpleComparisonPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · UI-QA-A11Y-01</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">品牌紫候選色比較</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          <strong>已決定：Owner 於 2026-09-29 選定 B（#5C4EEA），並已套用為品牌紫。</strong>
          本頁保留作為決策紀錄。每一欄是同一組元件，只有紫色不同。滑鼠移到按鈕上看 hover，
          按 <kbd className="rounded border border-black/10 bg-white px-1 text-xs">Tab</kbd> 看 focus。
          「舊值」欄是被取代的品牌紫，只作對照 —— 它的白字對比未達 AA。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← 回 UI Review 路由索引
          </Link>
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white p-5">
        <div className="grid min-w-[960px] grid-cols-4 gap-x-6 gap-y-3">
          {/* 欄標題 */}
          {SWATCHES.map((s) => (
            <div key={s.key} style={columnStyle(s.hex)}>
              <div className="h-16 rounded-xl bg-[var(--c)]" aria-hidden />
              <p className="mt-2 text-lg font-bold text-ds-heading">
                {s.key === "current" ? "舊值" : `候選 ${s.label}`}
                <span className="ml-2 font-mono text-sm font-medium text-ds-body">{s.hex}</span>
              </p>
              <p className="text-meta text-ds-body">
                rgb({s.rgb}) · {s.character}
              </p>
              <p className="mt-1 text-sm">
                白字對比 <strong className="font-mono">{s.onWhite.toFixed(2)}:1</strong>{" "}
                {s.onWhite >= AA ? (
                  <span className="rounded-full bg-status-approvedBg px-2 py-0.5 text-xs font-semibold text-status-approvedText">
                    AA 通過
                  </span>
                ) : (
                  <span className="rounded-full bg-[var(--color-feedback-error-bg)] px-2 py-0.5 text-xs font-semibold text-edu-error">
                    AA 未通過
                  </span>
                )}
              </p>
            </div>
          ))}

          <Row title="1. 主要按鈕（Primary）" note="與 Button intent=action / solid 同尺寸（md）">
            {() => (
              <>
                <button type="button" className={`${BUTTON_BASE} min-h-11 px-5 py-2.5 text-sm`}>
                  儲存
                </button>
                <button type="button" className={`${BUTTON_BASE} min-h-11 px-5 py-2.5 text-sm`}>
                  Save
                </button>
              </>
            )}
          </Row>

          <Row title="2. 大型 CTA" note="lg 尺寸">
            {() => (
              <button type="button" className={`${BUTTON_BASE} min-h-12 w-full px-6 py-3 text-base`}>
                立即購買 · Buy now
              </button>
            )}
          </Row>

          <Row title="3. 小按鈕" note="sm 尺寸（觸控目標仍 ≥ 44px）">
            {() => (
              <>
                <button type="button" className={`${BUTTON_BASE} min-h-11 px-3 py-1.5 text-sm`}>
                  繼續
                </button>
                <button type="button" className={`${BUTTON_BASE} min-h-11 px-3 py-1.5 text-sm`}>
                  Continue
                </button>
              </>
            )}
          </Row>

          <Row
            title="4. 導覽 active 狀態"
            note="結構同 nav-active.ts：左邊框與 12% 底色用品牌紫；文字維持既有 ds-textAccent（本輪不動）"
          >
            {() => (
              <div className="w-full space-y-1">
                <span className="flex min-h-11 items-center rounded-xl border-l-[3px] border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_12%,transparent)] px-3 text-sm font-semibold text-ds-textAccent">
                  我的訂單 · My orders
                </span>
                <span className="flex min-h-11 items-center rounded-xl border-l-[3px] border-transparent px-3 text-sm font-medium text-[#4B5563]">
                  收藏清單 · Favorites
                </span>
              </div>
            )}
          </Row>

          <Row title="5. 分頁／區間選擇（實心 active pill）" note="Pagination／ReportingRangeSelector 的 active 樣式">
            {() => (
              <div className="flex gap-1.5">
                <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--c)] bg-[var(--c)] px-3 text-sm font-semibold text-white">
                  2
                </span>
                <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--c)] bg-[var(--c)] px-3 text-sm font-semibold text-white">
                  近 30 天
                </span>
              </div>
            )}
          </Row>

          <Row title="6. Badge / pill" note="實心白字徽章（12px）">
            {() => (
              <>
                <span className="rounded-full bg-[var(--c)] px-2.5 py-0.5 text-xs font-semibold text-white">新上架</span>
                <span className="rounded-full bg-[var(--c)] px-2.5 py-0.5 text-xs font-semibold text-white">New</span>
              </>
            )}
          </Row>

          <Row title="7. Hover 狀態（靜態示意）" note="Button 的 hover 是 brightness-95 —— 只會更暗，對比只會更高">
            {() => (
              <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--c)] px-5 text-sm font-semibold text-white brightness-95">
                儲存 · Save
              </span>
            )}
          </Row>

          <Row title="8. Focus 狀態（靜態示意）" note="與 Button 相同的 2px ds-focus outline、offset 2px">
            {() => (
              <span className="inline-flex min-h-11 items-center rounded-xl bg-[var(--c)] px-5 text-sm font-semibold text-white outline outline-2 outline-offset-2 outline-ds-focus">
                繼續 · Continue
              </span>
            )}
          </Row>

          <Row title="9. Disabled" note="Button 的 disabled 為 opacity-50；WCAG 不要求停用元件達對比，僅供觀感比較">
            {() => (
              <button type="button" disabled className={`${BUTTON_BASE} min-h-11 px-5 py-2.5 text-sm`}>
                儲存 · Save
              </button>
            )}
          </Row>

          <Row title="10. 淺紫頁面底色上的按鈕" note="edu-page（#F4F1FF）上的實際觀感">
            {() => (
              <div className="w-full rounded-xl bg-edu-page p-3">
                <button type="button" className={`${BUTTON_BASE} min-h-11 px-5 py-2.5 text-sm`}>
                  立即購買
                </button>
              </div>
            )}
          </Row>
        </div>
      </div>

      <section className="mt-6 max-w-3xl text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">決策之後</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            品牌紫目前定義在三處：<code>app/globals.css</code> 的 <code>--color-brand-primary</code>、
            <code>tailwind.config.ts</code> 的 <code>edu.primary</code>、<code>packages/ui/src/tokens.ts</code>（legacy），
            另有多個元件直接寫死 <code>#6C63FF</code>。選定後三處 token 來源都已改為 <code>#5C4EEA</code>、元件內寫死的品牌紫已改用 token；
            細節見 <code>docs/ui-quality-system.md</code> 與 tracker 的 <code>UI-QA-A11Y-01</code>。
          </li>
          <li>字型堆疊不變：拉丁字母 Inter、繁體中文 Noto Sans TC。</li>
          <li>axe gate 的 <code>UI-QA-A11Y-01</code> 例外已隨套用一併移除。</li>
        </ul>
      </section>
    </div>
  );
}
