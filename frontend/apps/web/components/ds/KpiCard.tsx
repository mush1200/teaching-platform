"use client";

import { SurfaceCard } from "./SurfaceCard";

/**
 * Canonical KPI 數值卡（`UI-CONS-11`，Wave UI-3）。
 *
 * ## 合併了什麼
 *
 * 收斂前有**兩份**幾乎相同的實作：
 *
 * ```text
 * components/admin/AdminKpiCard.tsx    Admin dashboard   ＋ comparison
 * components/reporting/StatCard.tsx    Creator sales     ＋ 長值降級
 * ```
 *
 * 兩者的 props、`—` sentinel、skeleton 手法連註解都幾乎一樣，差異只在：
 * 一邊多了「與前期比較」、另一邊多了「長金額降一級字」，以及一組彼此不一致的
 * padding／字級／`textSubtle` vs `textMuted`。這裡取**兩邊各自較好的那一半**。
 *
 * ## 對比決策（`UI-CONS-01` 邊界）
 *
 * `subtext` 與 comparison 的說明文字一律用 **`text-ds-textMuted`（#6b7280，≈4.8:1）**，
 * **不用** `text-ds-textSubtle`（#9ca3af，≈2.5:1）—— 舊的 `AdminKpiCard` 用的是後者，
 * 而 `StatCard` 的原始碼裡早就寫下了不該這樣做的理由。
 *
 * 這是**選用一個既有且已通過 AA 的 token**，不是修改任何品牌色值 ——
 * 品牌／對比色值的變更屬 `UI-CONS-01` / Wave UI-7，需 Owner sign-off。
 */

/** 數值不可用（來源 API 失敗）時的顯示字元。刻意不用 `0` —— `0` 代表真實資料為零。 */
const UNAVAILABLE = "—";

/**
 * 成長方向。刻意**不**叫 `up` / `down`：「上升是好事」對所有指標並非必然成立。
 * `new` = 前期為 0 且本期 > 0，百分比無有限值。
 */
export type KpiTrend = "positive" | "negative" | "neutral" | "new";

const trendClass: Record<KpiTrend, string> = {
  positive: "text-status-approvedText",
  negative: "text-status-rejectedText",
  neutral: "text-ds-textMuted",
  new: "text-status-reviewedText",
};

const trendGlyph: Record<KpiTrend, string> = {
  positive: "↑",
  negative: "↓",
  neutral: "→",
  new: "＋",
};

export type KpiComparison = {
  /** 由 Backend 算出的整數百分比；`null` = 前期為 0 且本期 > 0（顯示「前期無資料」）。 */
  deltaPercent: number | null;
  /**
   * 本期與前期**都是 0**。
   *
   * Backend 的 `computeDeltaPercent(0, 0)` 回傳 `0`，與「5 → 5 真的持平」拿到同一個值，
   * 但兩者意思完全不同。前端用 `previous*` 欄位把兩者分開 —— 只是顯示層的判斷，
   * **沒有**改動後端的比較定義。
   */
  emptyBothPeriods?: boolean;
  /** 依 preset 決定的文案，例如「較前 30 天」。 */
  label: string;
  /** 無障礙用的完整敘述，例如「比較基準期 2026/07/22 – 2026/08/20」。 */
  title?: string;
};

export type KpiCardProps = {
  label: string;
  /** `null` = 來源 API 失敗，渲染為 `—`。已格式化的字串 = 真實數值。 */
  value: string | null;
  /** 單位或口徑說明，例如「筆」「份」「折扣前」「歷來累計」。權重最低。 */
  subtext?: string;
  /** 載入中顯示 skeleton。與 `value === null`（取得失敗）刻意分開，兩者不得共用同一個外觀。 */
  loading?: boolean;
  /** 前期比較。省略時不顯示比較列（snapshot / all-time 卡沒有比較對象）。 */
  comparison?: KpiComparison | null;
};

function resolveTrend(comparison: KpiComparison): KpiTrend {
  if (comparison.deltaPercent == null) return "new";
  if (comparison.emptyBothPeriods) return "neutral";
  if (comparison.deltaPercent > 0) return "positive";
  if (comparison.deltaPercent < 0) return "negative";
  return "neutral";
}

/**
 * `+12%` / `-8%` / `0%` / `前期無資料` / `暫無變化`。
 * Backend 已四捨五入成整數，前端不再做數學。
 */
function formatDelta(comparison: KpiComparison): string {
  if (comparison.deltaPercent == null) return "前期無資料";
  if (comparison.emptyBothPeriods) return "暫無變化";
  const sign = comparison.deltaPercent > 0 ? "+" : "";
  return `${sign}${comparison.deltaPercent}%`;
}

/** 只有真的算得出百分比時才接比較基準期的文案。 */
function showsLabel(comparison: KpiComparison): boolean {
  return comparison.deltaPercent != null && !comparison.emptyBothPeriods;
}

/**
 * 位數多的金額（例如 `NT$ 1,234,567`）在窄卡片內會換行，讓同一列的卡片高度不一致
 * （實測 122px vs 92px）。依**字串長度**降一級字，而不是讓所有卡片都變小 ——
 * 一般金額維持較大字級，只有長值才縮。`truncate` 只是最後防線。
 * （這一段來自原 `StatCard`；原 `AdminKpiCard` 是全部固定 `text-xl`。）
 */
const LONG_VALUE_CHARS = 11;

export function KpiCard({ label, value, subtext, loading = false, comparison = null }: KpiCardProps) {
  const trend = comparison ? resolveTrend(comparison) : null;
  const valueSize = (value?.length ?? 0) > LONG_VALUE_CHARS ? "text-lg" : "text-xl";

  return (
    <SurfaceCard elevation="flat" className="px-4 py-2.5">
      <p className="text-meta text-ds-textMuted">{label}</p>
      {/* skeleton 與數值共用同一個 `<p>` 的字級行高，載入完成不會產生位移。 */}
      <p
        className={`mt-1 truncate whitespace-nowrap font-bold leading-tight tabular-nums text-ds-heading ${valueSize}`}
        title={value ?? undefined}
      >
        {loading ? (
          <>
            <span
              aria-hidden
              className="inline-block h-4 w-16 animate-pulse motion-reduce:animate-none rounded-full bg-ds-surfaceMuted align-middle"
            />
            <span className="sr-only">載入中</span>
          </>
        ) : (
          value ?? UNAVAILABLE
        )}
      </p>
      {subtext ? <p className="mt-0.5 text-caption text-ds-textMuted">{subtext}</p> : null}
      {comparison && !loading && value != null ? (
        <p className="mt-0.5 text-caption" title={comparison.title}>
          <span className={`font-semibold ${trendClass[trend as KpiTrend]}`}>
            {/* 兩期都沒有資料時不畫箭頭 —— 沒有方向可指。 */}
            {comparison.emptyBothPeriods ? null : <span aria-hidden>{trendGlyph[trend as KpiTrend]} </span>}
            {formatDelta(comparison)}
          </span>
          {showsLabel(comparison) ? (
            <>
              {" "}
              <span className="text-ds-textMuted">{comparison.label}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </SurfaceCard>
  );
}
