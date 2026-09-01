"use client";

import type { ReactNode } from "react";

/**
 * 審核工作區的 **layout / pane composition**（教材審核、付款審核、檢舉管理共用）。
 *
 * ## 解決的問題
 *
 * 這三頁原本都把詳情面板 render 在**整份清單之後**。清單有 20 筆時，Admin 點了第 1 筆
 * 也得捲過 20 張卡片才看得到內容，做完決定又要捲回去找下一筆。
 *
 * ## 版型（`xl` 以上）
 *
 * **固定高度工作區，左右各自捲動** —— 不是「右欄一個矮的 max-height 內捲框」。
 *
 *   ┌──────────────────────────────┐
 *   │ (頁首 / toolbar 在工作區之外)  │
 *   ├───────────────┬──────────────┤
 *   │ Queue         │ Detail       │  ← 兩欄等高，各自 overflow-y:auto
 *   │ (自己捲)       │ (自己捲)      │
 *   └───────────────┴──────────────┘
 *
 * 為什麼是固定高度而不是 sticky：`position: sticky` 的元素一旦比視窗高，被釘住後
 * 就看不到它的下半部；而審核詳情天生很長（教材有 10 幾個區塊）。改用固定高度後：
 *   - 左右視覺高度一致，右下不再出現大片空白
 *   - 頁面本身不會因為 20 筆佇列被拉成超長
 *   - 詳情拿到的是**整個可用視窗高度**，不是一個矮框
 *
 * `--admin-workspace-height` 以 `100dvh` 扣掉頁首與 shell padding 估算；
 * dvh 讓行動瀏覽器的網址列伸縮不會造成跳動（`xl` 以下用不到）。
 *
 * ## 版型（`xl` 以下）
 *
 * 單欄流程：選取案件後**只顯示詳情**，最上方提供返回清單的按鈕。
 * 斷點切換完全交給 CSS（兩份 DOM 以 `hidden` 切換），不用 JS 量測 viewport ——
 * server render 與 client 首次 render 才會一致，不會有 hydration 落差或閃爍。
 *
 * ## 這裡**不**做的事
 *
 * 只負責版面組合。清單、篩選、分頁、詳情內容、API 呼叫、workflow 判斷全部留在各自
 * 的頁面 —— 三頁的 domain logic 差異很大（教材是內容審閱、付款是單張憑證的
 * approve/reject、檢舉是五狀態案件流程），硬抽成同一份會做出一個誰都不合身的抽象。
 */

/** `xl` 以上工作區的高度：視窗高扣掉 shell 的上下 padding 與頁首區塊。 */
const WORKSPACE_HEIGHT = "xl:h-[calc(100dvh-13rem)]";

export function AdminReviewWorkspace({
  list,
  detail,
  placeholder,
  onBackToList,
  listLabel,
  detailLabel,
  backLabel = "返回清單",
}: {
  /** 左欄：佇列內容（清單 + 分頁）。 */
  list: ReactNode;
  /** 右欄：目前選取案件的詳情。`null` = 沒有選取任何案件。 */
  detail: ReactNode | null;
  /** `xl` 以上、尚未選取案件時右欄顯示的提示。 */
  placeholder?: ReactNode;
  /** 窄螢幕返回清單（等同取消選取）。 */
  onBackToList: () => void;
  listLabel: string;
  detailLabel: string;
  backLabel?: string;
}) {
  const hasDetail = detail != null;

  return (
    <div
      data-testid="review-workspace"
      className={`grid min-h-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] ${WORKSPACE_HEIGHT}`}
    >
      <section
        aria-label={listLabel}
        data-testid="review-workspace-list"
        /*
         * 窄螢幕選取案件後隱藏清單；`xl` 以上兩欄永遠同時存在並各自捲動。
         * `min-h-0` 是必要的：grid item 的預設 `min-height:auto` 會讓內部的
         * overflow 容器撐開而不是捲動。
         */
        className={`min-w-0 ${hasDetail ? "hidden xl:flex" : "flex"} min-h-0 flex-col xl:overflow-y-auto xl:pr-1`}
      >
        {list}
      </section>

      <section
        aria-label={detailLabel}
        data-testid="review-workspace-detail"
        className="flex min-h-0 min-w-0 flex-col xl:overflow-y-auto xl:pr-1"
      >
        {hasDetail ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={onBackToList}
              data-testid="review-workspace-back"
              /* 雙欄時清單就在旁邊，返回鈕沒有意義，只在單欄流程出現。 */
              className="min-h-10 rounded-xl border border-ds-border bg-ds-surface px-3 text-sm font-medium text-ds-heading transition-colors hover:bg-edu-page xl:hidden"
            >
              ← {backLabel}
            </button>
            {detail}
          </div>
        ) : (
          <div className="hidden xl:block">{placeholder}</div>
        )}
      </section>
    </div>
  );
}

/** 右欄尚未選取案件時的提示。刻意只在 `xl` 以上出現（單欄時右欄根本不佔位）。 */
export function AdminReviewPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-ds-card border border-dashed border-ds-border bg-ds-surface/60 p-8 text-center">
      <p className="text-title text-ds-heading">{title}</p>
      <p className="mt-1 text-body text-ds-textMuted">{description}</p>
    </div>
  );
}
