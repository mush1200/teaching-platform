"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * 高影響動作的**兩段式確認**（`UI-CONS-16`）。
 *
 * ## 為什麼是就地展開，不是 modal
 *
 * 這個 repo 的所有 consequential admin 流程都已經是**就地展開**：
 * `AccountFreezePanel` 的解除凍結、`MaterialReviewPanel` 的「退回修改」、
 * `app/admin/payment-proofs` 的「退回付款」都在同一張卡片裡把面板展開。
 * 唯一的 modal 是 `components/materials/detail/MaterialReportDialog`，那是買家端
 * 的檢舉表單，不是可重用的 dialog primitive。
 *
 * 因此本元件沿用既有的就地樣式，而**不是**再造第二套 modal：
 *   - 審核面板裡「核准」若跳 modal、旁邊的「退回修改」卻就地展開，同一組決策
 *     會有兩種互動模型，比不一致的確認更糟。
 *   - 另建 modal 會多一份 overlay／scroll-lock／focus-trap 實作要維護。
 *
 * ## 焦點行為：**刻意不做 focus trap**
 *
 * focus trap 是 modal（`aria-modal`）的行為 —— 它的前提是背景內容被標記為
 * inert。這個面板是頁面內容的一部分、背景仍然可讀可用，把焦點鎖在裡面反而是
 * accessibility 反模式（鍵盤使用者會被困在一個沒有宣告為 modal 的區域）。
 *
 * 實際提供的是**焦點管理**，這才是這個形態該有的：
 *   - 展開時焦點移到確認鈕（使用者不必自己找）；
 *   - `Escape` 關閉並把焦點**送回觸發鈕**；
 *   - 取消同樣送回觸發鈕。
 *
 * ## 送出鎖
 *
 * 兩層，缺一不可：
 *   - `Button` 的 `loading` 會真的 `disabled` ＋ `aria-busy`（見 `Button.tsx`）；
 *   - 內部 `submittingRef` 擋掉「呼叫端把 `loading` 設起來之前」那一個 tick 的
 *     第二次點擊 —— 只靠 `loading` prop 擋不住，因為那是非同步 state。
 *
 * ## 什麼**不該**用這個元件
 *
 * 需要填理由才能送出的流程（退回修改、退回付款、凍結帳號、結案處置）**不要**
 * 包進來。那些流程的理由輸入本身就是確認步驟，再加一層 yes/no 只是多一次點擊。
 * 規則見 `docs/ui-design-system.md` §10.9。
 */
export function ConfirmAction({
  triggerLabel,
  triggerIntent = "danger",
  triggerVariant = "solid",
  size = "md",
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  intent = "danger",
  loading = false,
  disabled = false,
  error,
  onConfirm,
  testId,
}: {
  /** 收合狀態顯示的按鈕文案。 */
  triggerLabel: ReactNode;
  triggerIntent?: "flow" | "action" | "neutral" | "danger" | "success";
  triggerVariant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  /** 面板標題：說明「要做什麼」。 */
  title: ReactNode;
  /** 面板說明：說明「會造成什麼後果」。可省略。 */
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  /** 確認鈕的視覺語意，值域同 `Button`（`lib/status-tone` 之外不另立字彙）。 */
  intent?: "flow" | "action" | "neutral" | "danger" | "success";
  /** 由呼叫端的非同步狀態驅動；`Button` 會據此 disabled ＋ `aria-busy`。 */
  loading?: boolean;
  /** 觸發鈕是否停用（例如同面板另一個動作進行中）。 */
  disabled?: boolean;
  /** 送出失敗時顯示在面板內的訊息；面板同時保持展開。 */
  error?: ReactNode;
  /**
   * 回傳 `false` 代表失敗、面板保持展開（配合 `error`）。
   * 其餘情況（`void` / `true`）視為成功並關閉面板。
   */
  onConfirm: () => boolean | void | Promise<boolean | void>;
  /** 觸發鈕沿用原本的 testId，衍生 `-panel` / `-confirm` / `-cancel`。 */
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const submittingRef = useRef(false);
  const panelId = useId();

  /**
   * 關閉後要不要把焦點送回觸發鈕。
   *
   * **不能在 `close()` 裡直接 `triggerRef.current?.focus()`** —— 那個瞬間畫面上
   * 還是面板，觸發鈕尚未掛載，`triggerRef.current` 是 `null`，焦點會掉回 `<body>`。
   * 因此改成旗標＋effect：等 React 把觸發鈕渲染回來之後才移焦點。
   */
  const restoreFocusRef = useRef(false);

  const close = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      return;
    }
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    /* 觸發鈕可能因為動作成功而整個被移除；此時 `?.` 直接略過。 */
    triggerRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      /* 送出中不讓 Escape 關閉：動作已經在飛，關掉面板只會讓人以為取消了。 */
      if (submittingRef.current || loading) return;
      event.stopPropagation();
      close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, loading, close]);

  async function handleConfirm() {
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    try {
      const result = await onConfirm();
      /* 呼叫端回報失敗時保持展開 —— 否則錯誤訊息會連同面板一起消失。 */
      if (result !== false) {
        restoreFocusRef.current = true;
        setOpen(false);
      }
    } finally {
      submittingRef.current = false;
    }
  }

  if (!open) {
    return (
      <Button
        ref={triggerRef}
        intent={triggerIntent}
        variant={triggerVariant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <div
      /*
       * `group` 而不是 `dialog`：這不是 modal，宣告成 dialog 會讓輔助技術以為
       * 背景已被 inert。`aria-labelledby` 讓這個區域在 landmark/群組導覽裡有名字。
       */
      role="group"
      aria-labelledby={`${panelId}-title`}
      data-testid={testId ? `${testId}-panel` : undefined}
      className="w-full space-y-3 rounded-ds-card border border-ds-border bg-ds-surface p-3"
    >
      <p id={`${panelId}-title`} className="text-body font-semibold text-ds-heading">
        {title}
      </p>
      {description ? (
        <p id={`${panelId}-description`} className="text-meta text-ds-textMuted">
          {description}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-meta text-edu-error" data-testid={testId ? `${testId}-error` : undefined}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          ref={confirmRef}
          intent={intent}
          size={size}
          loading={loading}
          aria-describedby={description ? `${panelId}-description` : undefined}
          onClick={() => void handleConfirm()}
          data-testid={testId ? `${testId}-confirm` : undefined}
        >
          {confirmLabel}
        </Button>
        <Button
          intent="neutral"
          variant="outline"
          size={size}
          disabled={loading}
          onClick={close}
          data-testid={testId ? `${testId}-cancel` : undefined}
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
