"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Canonical form field（`UI-CONS-04` / `UI-CONS-09`，Wave UI-2）。
 *
 * ## 這個元件存在的唯一理由
 *
 * 收斂前全 app **`aria-invalid` 0 處、`aria-describedby` 0 處** —— 每一個驗證訊息都只有
 * 視覺呈現，沒有任何一個在程式上與它的欄位有關聯。輔助技術的使用者在 login／register／
 * checkout／上傳憑證／申訴／教材建立編輯／Admin 退回等表單上，得不到「哪一個欄位錯了」。
 *
 * `FormField` 把「label ↔ control ↔ error/help」的關聯變成**結構性的**，
 * 而不是每一頁各自記得要寫。
 *
 * ## 契約
 *
 * ```text
 * error 存在  → control 拿到 aria-invalid="true"
 *              → aria-describedby 指向 error 節點（若同時有 help，兩個 id 都給）
 * error 不存在 → 不得出現 aria-invalid（不能留 aria-invalid="false" 以外的假陽性）
 *              → aria-describedby 只指向 help（沒有 help 時完全不輸出）
 * ```
 *
 * ## id 為什麼用 `useId()`
 *
 * 同一個 `FormField` 可能在清單裡被 render 多次（例如教材內容的每一列）。
 * 手寫字串 id 會產生 **duplicate id** —— 那會讓 `aria-describedby` 指到錯的節點，
 * 比沒有關聯更糟。`useId()` 由 React 保證同一棵樹內唯一，且 SSR/CSR 一致。
 *
 * ## 兩種接線方式（同時支援，互不衝突）
 *
 * 1. **cloneElement** —— 直接子節點是單一 React element 時，把 `id` / `aria-*` 注入它。
 *    這條路徑讓**裸 `<input>` / `<select>` / `<textarea>`** 也能立刻受惠，不必先換成 primitive。
 * 2. **context** —— `Input` / `Select` / `Textarea` 會讀 `useFormFieldControl()`。
 *    當控制項被包在額外的 `<div>` 裡（cloneElement 到不了）時仍然正確。
 *
 * 兩者都**不覆蓋**呼叫端已經明確傳入的值。
 */

export type FormFieldControlContext = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

const FormFieldContext = createContext<FormFieldControlContext | null>(null);

/** 供 `Input` / `Select` / `Textarea` 取用；不在 `FormField` 內時回傳 `null`。 */
export function useFormFieldControl(): FormFieldControlContext | null {
  return useContext(FormFieldContext);
}

export type FormFieldProps = {
  label: ReactNode;
  children: ReactNode;
  /** 有值即視為錯誤狀態。空字串／`undefined`／`null` 皆表示無錯誤。 */
  error?: string | null;
  /** 輔助說明；與 error 並存時兩者都會進 `aria-describedby`。 */
  help?: ReactNode;
  required?: boolean;
  className?: string;
  /** 覆寫自動產生的 control id（需要外部 `htmlFor`／測試錨點時才用）。 */
  htmlFor?: string;
};

export function FormField({
  label,
  children,
  error,
  help,
  required = false,
  className = "",
  htmlFor,
}: FormFieldProps) {
  const autoId = useId();
  const id = htmlFor ?? `field-${autoId}`;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  const hasError = typeof error === "string" && error.trim().length > 0;
  const describedBy = [help ? helpId : null, hasError ? errorId : null].filter(Boolean).join(" ") || undefined;

  const ctx: FormFieldControlContext = { id, describedBy, invalid: hasError, required };

  /*
    只有在子節點沒有自帶該 prop 時才注入 —— 呼叫端的明示值一律優先，
    否則會出現「傳了 id 卻被靜默換掉」這種難以除錯的行為。
  */
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as Record<string, unknown>).id ?? id,
        "aria-invalid":
          (children.props as Record<string, unknown>)["aria-invalid"] ?? (hasError ? true : undefined),
        "aria-describedby":
          (children.props as Record<string, unknown>)["aria-describedby"] ?? describedBy,
        required: (children.props as Record<string, unknown>).required ?? (required || undefined),
      })
    : children;

  return (
    <FormFieldContext.Provider value={ctx}>
      <div className={`flex w-full flex-col gap-1.5 ${className}`.trim()}>
        <label htmlFor={id} className="text-sm font-medium text-ds-heading">
          {label}
          {required ? (
            <>
              {" "}
              {/* `*` 是視覺標記，真正的必填語意由 control 的 `required` 屬性承載 */}
              <span aria-hidden className="text-edu-error">
                *
              </span>
              <span className="sr-only">（必填）</span>
            </>
          ) : null}
        </label>
        {child}
        {help ? (
          <p id={helpId} className="text-caption text-ds-textMuted">
            {help}
          </p>
        ) : null}
        {hasError ? (
          /*
            `role="alert"` 讓錯誤在**送出後才出現**時也會被朗讀；
            `aria-describedby` 負責的是「聚焦到欄位時讀得到」，兩者互補而非重複。
          */
          <p id={errorId} role="alert" className="text-caption text-feedback-errorText">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}
