"use client";

import { SurfaceCard } from "../ds";

/** 數值不可用（來源 API 失敗）時的顯示字元。刻意不用 `0` —— `0` 代表真實資料為零。 */
const UNAVAILABLE = "—";

type Props = {
  label: string;
  /** 已格式化的數值字串；`null` = 來源 API 失敗，渲染為 `—`。 */
  value: string | null;
  /** 單位或口徑說明，例如「筆」「份」「折扣前」。權重最低。 */
  subtext?: string;
  /** 載入中顯示 skeleton。與 `value === null`（取得失敗）刻意分開。 */
  loading?: boolean;
};

/**
 * 統計數值卡 —— canonical Tailwind + `components/ds` 組成，**不使用** legacy 的
 * `@teaching-platform/ui`（Tamagui，已 frozen）。
 *
 * 視覺權重刻意固定為 **value > label > subtext**：
 * 舊版直接把 `SurfaceCard(title, description)` 拿來當 KPI，導致標籤 16px 深色、
 * 數值 14px 灰色 —— 一頁分析頁最重要的數字反而最不顯眼。
 *
 * skeleton 與數值共用同一個 `<p>` 的字級行高，載入完成不會產生位移。
 */
/**
 * 位數多的金額（例如 `NT$ 1,234,567`）在窄卡片內會換行，讓同一列的卡片高度不一致
 * （實測 122px vs 92px）。改為**依字串長度**降一級字，而不是讓所有卡片都變小 ——
 * 一般金額（`NT$ 7,650`）維持較大字級，只有長值才縮。`truncate` 只是最後防線。
 */
const LONG_VALUE_CHARS = 11;

export function StatCard({ label, value, subtext, loading = false }: Props) {
  const valueSize =
    (value?.length ?? 0) > LONG_VALUE_CHARS ? "text-lg lg:text-xl" : "text-xl lg:text-2xl";

  return (
    <SurfaceCard elevation="flat" className="px-4 py-2.5">
      <p className="text-caption text-ds-textMuted">{label}</p>
      <p
        className={`mt-0.5 truncate whitespace-nowrap font-semibold leading-tight tabular-nums text-ds-heading ${valueSize}`}
        title={value ?? undefined}
      >
        {loading ? (
          <>
            <span aria-hidden className="inline-block h-5 w-20 animate-pulse motion-reduce:animate-none rounded-full bg-ds-surfaceMuted align-middle" />
            <span className="sr-only">載入中</span>
          </>
        ) : (
          value ?? UNAVAILABLE
        )}
      </p>
      {/*
        用 `textMuted`(#6b7280, ≈5:1) 而非 `textSubtle`(#9ca3af, ≈2.5:1)：
        subtext 帶語意（「折扣前」就是金額口徑），不能淡到讀不出來。
      */}
      {subtext ? <p className="mt-0.5 text-caption text-ds-textMuted">{subtext}</p> : null}
    </SurfaceCard>
  );
}
