"use client";

import { useEffect, useId, useState } from "react";
import {
  MAX_RANGE_DAYS,
  PRESET_LABELS,
  PRESET_ORDER,
  type RangePreset,
  type RangeSelection,
  todayInTaipei,
  validateCustomRange,
} from "../../lib/reportingRange";

type Props = {
  selection: RangeSelection;
  onChange: (next: RangeSelection) => void;
  /** Backend 解析出的實際期間（`periodFrom` / `periodTo`），供 custom 初始值使用。 */
  resolvedFrom?: string | null;
  resolvedTo?: string | null;
  /** 期間資料重新載入中；只用來停用控制項，不改變版面。 */
  busy?: boolean;
};

/**
 * `min-h-10`（40px）確保觸控目標夠大；`whitespace-nowrap` 讓每顆按鈕不會斷字。
 * 群組本身在窄螢幕改為橫向捲動而非換行 —— 換行會讓「自訂」孤零零掉到第二排。
 */
const presetBase =
  "min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:opacity-60";
const presetOn = "border-edu-primary bg-edu-primary text-white";
const presetOff = "border-ds-border bg-ds-surface text-edu-primary hover:bg-edu-page";

/**
 * 期間選擇器 —— Admin dashboard 與 Creator sales 共用。
 *
 * 刻意 domain-neutral：不含任何 Admin 或 Creator 專屬文案，caller 自行決定把它放在
 * 哪個區塊標題列旁。放在頁首會讓人以為整頁都被篩選，因此建議一律緊鄰它實際控制的
 * 統計區塊（見 docs/mvp_rules.md §15.6、§18）。
 *
 * 驗證與 Backend 同規則（`lib/reportingRange.ts`）：不合法就不送 API，直接顯示 inline error。
 * `max` 綁在台北今日，避免使用者選到未來日期。
 *
 * 自訂日期輸入列只在「正在編輯」時展開，套用後收合（Admin 與 Creator 共用同一套行為，
 * 不分岔成兩份 selector）。常駐展開會讓 custom 期間永久多出一整列，把 KPI 與趨勢圖推下去。
 */
export function ReportingRangeSelector({ selection, onChange, resolvedFrom, resolvedTo, busy = false }: Props) {
  const today = todayInTaipei();
  const fromId = useId();
  const toId = useId();

  const [draftFrom, setDraftFrom] = useState(selection.preset === "custom" ? selection.from : "");
  const [draftTo, setDraftTo] = useState(selection.preset === "custom" ? selection.to : "");
  const [error, setError] = useState<string | null>(null);
  /**
   * 「正在編輯日期」——**不等於**「目前有效 range 是 custom」。
   * 兩者刻意分開：前者決定編輯列展開與否，後者決定哪顆按鈕是 active。
   */
  const [isCustomEditing, setIsCustomEditing] = useState(false);

  // URL（含上一頁／下一頁）才是 single source of truth：selection 變動時同步草稿。
  useEffect(() => {
    if (selection.preset === "custom") {
      setDraftFrom(selection.from);
      setDraftTo(selection.to);
      setError(null);
    }
  }, [selection]);

  function selectPreset(preset: RangePreset) {
    if (preset !== "custom") {
      setError(null);
      setIsCustomEditing(false);
      onChange({ preset });
      return;
    }
    // 切到自訂時，以目前實際生效的期間當起始值，避免出現空白輸入框。
    // 已經是 custom 時直接沿用生效中的 from / to，不會被清掉也不會被 reset 成今天。
    const from = selection.preset === "custom" ? selection.from : draftFrom || resolvedFrom || today;
    const to = selection.preset === "custom" ? selection.to : draftTo || resolvedTo || today;
    setDraftFrom(from);
    setDraftTo(to);
    setError(null);
    // 只展開編輯列；URL 要等使用者按下「套用」才會變。
    setIsCustomEditing(true);
  }

  function applyCustom() {
    const invalid = validateCustomRange(draftFrom, draftTo);
    if (invalid != null) {
      // 驗證失敗維持展開，使用者才有機會就地修正。
      setError(invalid);
      return;
    }
    setError(null);
    setIsCustomEditing(false);
    onChange({ preset: "custom", from: draftFrom, to: draftTo });
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        載入中不停用按鈕：race protection 由呼叫端的序號 + AbortController 負責
        （見 caller 的 loadSummary/loadTrends），停用只會讓快速切換變得卡頓。
        載入狀態以 aria-busy 表達，視覺上由統計卡片的 skeleton 呈現。
      */}
      <div
        role="group"
        aria-label="統計期間"
        aria-busy={busy}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {PRESET_ORDER.map((preset) => {
          // active 一律代表「目前生效的 range」，與是否正在編輯無關。
          const active = selection.preset === preset;
          const isCustom = preset === "custom";
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              // 只有自訂按鈕會控制一段可展開內容；其餘按鈕不該帶這個屬性。
              aria-expanded={isCustom ? isCustomEditing : undefined}
              onClick={() => selectPreset(preset)}
              className={`${presetBase} ${active ? presetOn : presetOff}`}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>

      {isCustomEditing ? (
        <div className="flex flex-wrap items-end gap-2" data-testid="reporting-custom-editor">
          <div className="flex flex-col gap-1">
            <label htmlFor={fromId} className="text-caption text-ds-textMuted">
              開始日期
            </label>
            <input
              id={fromId}
              type="date"
              value={draftFrom}
              max={today}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="rounded-xl border border-ds-border bg-ds-surface px-2 py-1.5 text-sm text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={toId} className="text-caption text-ds-textMuted">
              結束日期
            </label>
            <input
              id={toId}
              type="date"
              value={draftTo}
              max={today}
              onChange={(e) => setDraftTo(e.target.value)}
              className="rounded-xl border border-ds-border bg-ds-surface px-2 py-1.5 text-sm text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            />
          </div>
          <button type="button" onClick={applyCustom} className={`${presetBase} ${presetOff}`}>
            套用
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-caption text-feedback-errorText">
          {error}
        </p>
      ) : (
        <p className="sr-only">{`自訂期間最多 ${MAX_RANGE_DAYS} 天`}</p>
      )}
    </div>
  );
}
