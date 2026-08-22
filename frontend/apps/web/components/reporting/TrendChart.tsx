"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, SurfaceCard } from "../ds";
import type { TrendGranularity, TrendPoint } from "../../lib/api-types";

/**
 * 趨勢圖 —— Admin dashboard 與 Creator sales 共用。
 *
 * **為什麼是手寫 inline SVG 而不是 chart library：** repo 的 `package.json` 與 lockfile
 * 目前沒有任何 chart 相依（Recharts / Chart.js / visx 皆無）。為了兩張單序列長條圖引入
 * 一套 chart library，會帶進 d3 子套件與可觀的 bundle；Recharts 2.x 的 peer dependency
 * 也還停在 React ^16–18，而本專案是 React 19。以目前需求（單序列、無互動縮放、無圖例）
 * 手寫 SVG 更小、更可控，也能直接吃設計系統 token。若之後需要多序列／堆疊／刷選，
 * 再評估導入 library。
 *
 * 視覺刻意極簡：無格線、無外框軸線，只有基線與少量刻度標籤 —— 與其餘統計卡片的
 * 密度一致，不做第三方 dashboard demo 風格。
 */

type Props = {
  title: string;
  /** 圖表的無障礙名稱與說明，例如「營收趨勢，依核准日期」。 */
  description: string;
  points: TrendPoint[];
  granularity: TrendGranularity;
  loading: boolean;
  error: string | null;
  /** 把 bucket 值格式化成 tooltip / 摘要用的字串，例如 `NT$ 1,200`、`4 筆`。 */
  formatValue: (value: number) => string;
  /**
   * 標題的 heading 層級。預設 `h3`；當呼叫端把這張圖當成頁面的一個 section 時
   * 應傳 `h2`，讓 heading 階層由頁面擁有，元件不強制層級。
   */
  titleAs?: "h2" | "h3";
  /** 標題樣式。當 caller 把它當成頁面 section 時，應傳入與同層 heading 一致的 class。 */
  titleClassName?: string;
  /** 全部為 0 時的說明文字。不同產品面向用語不同（Admin vs Creator）。 */
  zeroLabel?: string;
};

/** viewBox 座標系；實際尺寸由 CSS 決定（`width: 100%`），因此在任何斷點都不會橫向溢出。 */
const VIEW_W = 600;
const VIEW_H = 160;
const BASELINE_Y = VIEW_H - 18;
const TOP_Y = 8;

/** `2026-08-20T14` → `14:00`；`2026-08-20` → `8/20`；`2026-08` → `2026/08`。 */
export function formatBucketLabel(key: string, granularity: TrendGranularity): string {
  if (granularity === "hour") {
    const hour = key.slice(11, 13);
    return `${hour}:00`;
  }
  if (granularity === "month") {
    return key.replace("-", "/");
  }
  const [, month, day] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/** tooltip 用的完整日期，比軸標籤多帶年份。 */
function formatBucketFull(key: string, granularity: TrendGranularity): string {
  if (granularity === "hour") return `${key.slice(0, 10).replace(/-/g, "/")} ${key.slice(11, 13)}:00`;
  if (granularity === "month") return key.replace("-", "/");
  return key.replace(/-/g, "/");
}

/**
 * 軸標籤挑選：bucket 數多時只標示部分刻度，避免文字重疊。
 * 一律包含第一個與最後一個 bucket，讓期間兩端可讀。
 */
function tickIndexes(count: number): Set<number> {
  if (count <= 1) return new Set([0]);
  const maxTicks = 6;
  const step = Math.max(1, Math.ceil(count / maxTicks));
  const ticks = new Set<number>();
  for (let i = 0; i < count; i += step) ticks.add(i);
  ticks.add(count - 1);
  return ticks;
}

export function TrendChart({
  title,
  description,
  points,
  granularity,
  loading,
  error,
  formatValue,
  titleAs: Heading = "h3",
  titleClassName = "text-title text-ds-heading",
  zeroLabel = "本期無資料變動（全部為 0）。",
}: Props) {
  /*
   * hover 與「明確選取」分開追蹤。
   * 只用一個 index 時，滑鼠移到長條上會先觸發 hover 設定該 index，接著的 click
   * 就會被當成「再點一次同一根」而立刻取消 —— 桌機因此永遠點不出數值。
   * pinned 也讓觸控裝置的選取在指標離開後仍保留。
   */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const activeIndex = pinnedIndex ?? hoverIndex;

  const max = points.reduce((acc, p) => Math.max(acc, p.value), 0);
  const ticks = tickIndexes(points.length);
  const slot = points.length > 0 ? VIEW_W / points.length : VIEW_W;
  // 細長 bucket（例如 365 天的月粒度只有 13 根，單日則有 24 根）都維持可見的間隙。
  const barWidth = Math.max(1, Math.min(slot * 0.7, 28));
  const active = activeIndex != null ? points[activeIndex] : null;

  /** 全 0 仍要畫出基線 —— `0` 是有效資料（該期間沒有營收／訂單），不是「無資料」。 */
  const scale = (value: number) => (max <= 0 ? 0 : ((value / max) * (BASELINE_Y - TOP_Y)));

  const peak = points.reduce<TrendPoint | null>((best, p) => (best == null || p.value > best.value ? p : best), null);

  return (
    <SurfaceCard elevation="raised" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-ds-borderMuted px-4 py-3">
        <Heading className={titleClassName}>{title}</Heading>
        {!loading && !error && active ? (
          <p className="text-meta text-ds-textMuted" aria-live="polite">
            {formatBucketFull(active.key, granularity)}・
            <span className="font-semibold text-ds-heading">{formatValue(active.value)}</span>
          </p>
        ) : null}
      </header>

      <div className="p-4">
        {loading ? <LoadingState title="載入趨勢中…" /> : null}
        {!loading && error ? <ErrorState title="趨勢資料暫時無法載入" description={error} /> : null}
        {!loading && !error && points.length === 0 ? (
          <EmptyState title="沒有可顯示的期間" description="請重新選擇統計期間。" />
        ) : null}

        {!loading && !error && points.length > 0 ? (
          <>
            {/* 只標一個最大值刻度：沒有 y 軸時，至少讓長條高度有可讀的尺度參照。 */}
            {max > 0 ? (
              <p className="text-caption text-ds-textSubtle">最高 {formatValue(max)}</p>
            ) : null}
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="h-40 w-full"
              role="img"
              // 直接給 aria-label：`useId()` 產生的識別碼含特殊字元，用 aria-labelledby
              // 參照較脆弱；`<desc>` 仍保留供支援 SVG 語意的工具使用。
              aria-label={`${title}：${description}`}
              preserveAspectRatio="none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <desc>{description}</desc>

              {points.map((point, i) => {
                const height = scale(point.value);
                const x = i * slot + (slot - barWidth) / 2;
                return (
                  <g key={point.key}>
                    {/* 透明的整欄命中區：細長條也能輕鬆 hover，觸控同樣可用。 */}
                    <rect
                      x={i * slot}
                      y={TOP_Y}
                      width={slot}
                      height={BASELINE_Y - TOP_Y}
                      fill="transparent"
                      onMouseEnter={() => setHoverIndex(i)}
                      // 觸控裝置沒有 hover：點擊同樣要能讀出數值，否則手機完全看不到任何金額。
                      // 點同一根 → 取消釘選；點另一根 → 改選它。
                      onClick={() => setPinnedIndex((prev) => (prev === i ? null : i))}
                      style={{ cursor: "pointer" }}
                    />
                    {/*
                      SVG 的堆疊順序就是 DOM 順序，長條畫在命中區之上會攔截 pointer
                      事件 —— 圖表上最可能被點到的地方（長條本身）反而沒有反應。
                      `pointer-events: none` 讓點擊與 hover 一律穿透到整欄的命中區。
                    */}
                    <rect
                      x={x}
                      y={BASELINE_Y - height}
                      width={barWidth}
                      height={Math.max(height, point.value > 0 ? 1 : 0)}
                      rx="2"
                      pointerEvents="none"
                      className={activeIndex === i ? "fill-edu-cta" : "fill-edu-primary"}
                    />
                  </g>
                );
              })}

              <line x1="0" y1={BASELINE_Y} x2={VIEW_W} y2={BASELINE_Y} className="stroke-ds-border" strokeWidth="1" />
            </svg>

            {/* 軸標籤放在 SVG 外：`preserveAspectRatio="none"` 會讓 SVG 內的文字被水平拉伸。 */}
            <div className="mt-1 flex text-caption text-ds-textSubtle">
              {points.map((point, i) => (
                <span key={point.key} className="min-w-0 shrink-0 text-center" style={{ width: `${100 / points.length}%` }}>
                  {ticks.has(i) ? formatBucketLabel(point.key, granularity) : " "}
                </span>
              ))}
            </div>

            {/*
              資訊不只存在於圖形中：tooltip 是滑鼠專屬，這行摘要讓鍵盤與螢幕閱讀器
              使用者也能取得重點。全 0 期間不顯示尖峰（沒有意義）。
            */}
            <p className="mt-2 text-caption text-ds-textMuted">
              {peak && peak.value > 0
                ? `本期最高：${formatBucketFull(peak.key, granularity)}，${formatValue(peak.value)}`
                : zeroLabel}
            </p>
          </>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
