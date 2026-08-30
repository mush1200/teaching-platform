"use client";

/** 數值不可用（來源 API 失敗）時的顯示字元。刻意不用 `0` —— `0` 代表真實資料為零。 */
const UNAVAILABLE = "—";

/**
 * 成長方向。刻意**不**叫 `up` / `down` 或直接指定顏色：
 * 「上升是好事」對所有指標並非必然成立，配色屬視覺層決定，不應寫進 component API。
 * `new` = 前期為 0 且本期 > 0，百分比無有限值。
 */
export type KpiTrend = "positive" | "negative" | "neutral" | "new";

const trendClass: Record<KpiTrend, string> = {
  positive: "text-status-approvedText",
  negative: "text-status-rejectedText",
  neutral: "text-ds-textSubtle",
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
   * 但兩者的意思完全不同：一個是「兩期都沒有任何資料」，一個是「有資料且沒有變化」。
   * 前端用 `previous*` 欄位把兩者分開 —— 這只是顯示層的判斷，**沒有**改動後端的比較定義。
   */
  emptyBothPeriods?: boolean;
  /** 依 preset 決定的文案，例如「較前 30 天」。 */
  label: string;
  /** 無障礙用的完整敘述，例如「比較基準期 2026/07/22 – 2026/08/20」。 */
  title?: string;
};

type Props = {
  label: string;
  /** `null` = 來源 API 失敗，渲染為 `—`。已格式化的字串 = 真實數值。 */
  value: string | null;
  /**
   * 額外的統計條件說明，例如「所選期間已核准」。
   *
   * **只在它真的補充了標題沒說的事情時才給**：卡片標題（「新增訂單」）、區塊標題
   * （「本期表現」）與其下的日期區間已經說明了統計範圍，再寫一次「所選期間」是零資訊。
   */
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
 *
 * 「前期無資料」與「暫無變化」都是**完整的句子**，後面不再接「較前期」——
 * 舊的「新增 較前期」把狀態與比較用語黏在一起，中文讀不通。
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
 * 核心統計卡 — 定位是「可快速掃描的 summary strip」，不是第二組大型 KPI。
 * 數值降到 `text-xl`：除了降低卡片高度，也讓 `NT$ 10,550` 這類較長的值在
 * 1280px 的六欄版面下不再換行（換行會讓整排從 110px 撐到 142px）。
 *
 * skeleton 放在與數值同一個 `<p>` 內，沿用同一組字級／行高，載入完成時不會產生位移。
 */
export function AdminKpiCard({ label, value, subtext, loading = false, comparison = null }: Props) {
  const trend = comparison ? resolveTrend(comparison) : null;

  return (
    <article className="rounded-ds-card border border-ds-border bg-ds-surface px-3 py-2.5 shadow-ds-card-soft">
      <p className="text-meta text-ds-textMuted">{label}</p>
      <p className="mt-1 text-xl font-bold leading-tight text-ds-heading">
        {loading ? (
          <>
            <span aria-hidden className="inline-block h-4 w-16 animate-pulse motion-reduce:animate-none rounded-full bg-ds-surfaceMuted align-middle" />
            <span className="sr-only">載入中</span>
          </>
        ) : (
          value ?? UNAVAILABLE
        )}
      </p>
      {subtext ? <p className="mt-0.5 text-caption text-ds-textSubtle">{subtext}</p> : null}
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
              <span className="text-ds-textSubtle">{comparison.label}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
