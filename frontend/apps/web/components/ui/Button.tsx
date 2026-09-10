import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

/**
 * Canonical button primitive（`UI-CONS-08` / `UI-CONS-19`，Wave UI-2）。
 *
 * ## API 的三個軸（互不重疊）
 *
 * ```text
 * intent   語意：這顆按鈕在流程裡是什麼   flow | action | neutral | danger
 * variant  呈現：填色 / 外框 / 無底        solid | outline | ghost
 * size     尺寸                            sm | md | lg
 * ```
 *
 * 舊版把**顏色語意**同時放在 `variant`(9 值) 與 `intent`(4 值) 兩個 prop 上，
 * 其中 `primary` 與 `flow`、`secondary` 與 `action` 的 class 字串**逐字相同** ——
 * 四個名字兩種行為，而且 `intent` 會靜默覆蓋 `variant`。現在顏色只由 `intent` 決定。
 *
 * ## 為什麼沒有保留 legacy alias
 *
 * 收斂前實測全 app 32 個 Tailwind `<Button>` 呼叫點：**每一個都有傳 `intent` 或 `variant`**
 * （0 個依賴預設值），而 `variant` 實際只用到 **`outline`(13)** 一個值；
 * `primary` / `secondary` / `ghost` / `social` / `flow` / `action` / `neutral` / `danger`
 * 作為 `variant=` 的呼叫點是 **0**。既然沒有 consumer，保留 alias 只會讓
 * 「canonical API 只有一套」這件事再次失真，因此直接移除，而不是留下死別名。
 * （`social` 這個值也一併移除 —— 它同樣 0 呼叫點，且「社群登入」是頁面層的組合，不是 button 語意。）
 *
 * ## size 從真實 call-site cluster 推導，不是憑空造 scale
 *
 * ```text
 * sm  min-h-11 px-3 py-1.5   ← 既有 5 處覆寫（teacher/sales ×3、ds/StateViews、materials reviews）
 * md  min-h-11 px-5 py-2.5   ← 舊的預設（px-5 py-3），維持 44px 觸控高度
 * lg  min-h-12 px-6 text-base ← 既有 2 處覆寫（cart 的主要 CTA）
 * ```
 *
 * ## loading
 *
 * `loading` 一律：**真的 `disabled`（擋掉重複送出）＋ `aria-busy` ＋ spinner**。
 * **文案交給呼叫端** —— 「送出中…」「上傳中…」「處理中…」各有語境，不強制統一；
 * 統一的是行為與可及狀態，不是字串。
 */

/**
 * 語意軸：顏色只由這個決定。
 *
 * ## `success` 為什麼可以加（`UI-CONS-12` / Wave UI-3）
 *
 * 依「必須是跨頁面 semantic intent，而不是單一元件專用」的門檻檢驗：
 * 全 repo 有**兩個互相獨立的 surface** 使用 success 填色的動作按鈕 ——
 * `components/admin/MaterialReviewPanel.tsx`（核准上架）與
 * `app/admin/payment-proofs/page.tsx`（核准付款憑證）；
 * `AccountFreezePanel` 另有 `tone={frozen ? "danger" : "success"}` 的狀態語意。
 * 因此它是通用語意，不是 domain-specific 的 `approve` variant。
 *
 * ## ✅ 對比已於 `UI-CONS-01`（2026-09-07）修正
 *
 * `edu-success` 由 `#22C55E` 加深為 **`#178640`**：白字對比 **2.28 → 4.65:1**，通過 AA。
 * 色相 142.1° → 142.2°，仍然明確是綠色 success，也仍與 `status.approvedText`
 * `#047857`（162.9°）區分得開。
 *
 * 這正是把缺口集中到 primitive 的價值：**改一個 token 就同時修好兩個 surface**
 * （`MaterialReviewPanel` 的「核准上架」與 `payment-proofs` 的「核准付款」），
 * 不需要任何 page-local 覆寫。
 */
type Intent = "flow" | "action" | "neutral" | "danger" | "success";
/** 呈現軸：與 `intent` 正交。 */
type Variant = "solid" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /**
   * React 19 起 `ref` 是一般 prop，函式元件不需要 `forwardRef`；
   * 這裡只是把型別補上，值本身透過 `...rest` 直接落到 `<button>`。
   * `ConfirmAction` 需要它才能在展開／關閉時移動焦點（`UI-CONS-16`）。
   */
  ref?: Ref<HTMLButtonElement>;
  intent?: Intent;
  variant?: Variant;
  size?: Size;
  /** 送出中：自動 disabled ＋ `aria-busy` ＋ spinner。文案仍由呼叫端決定。 */
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors duration-150 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus " +
  "disabled:pointer-events-none disabled:opacity-50";

/*
 * `UI-CONS-18`（Wave UI-8）：`sm` 的最小高度由 40px 提升到 **44px**。
 *
 * `sm` 原本是「密集 desktop 工具列」用的 40px 例外，但它同時出現在行動版可見的位置，
 * 因而是全站**最後一個系統性的 sub-44 來源**。現在 `sm` 與 `md` 只差水平內距與
 * 字級 —— 仍然是有意義的 compact 變體，但觸控目標達標。
 */
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3 py-1.5 text-sm",
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
};

/**
 * `intent × variant` 的樣式表。
 *
 * 顏色值沿用既有的 `--color-intent-*` CSS 變數，**本輪不調整任何色值** ——
 * 對比度修正是 `UI-CONS-01`／Wave UI-7 的範圍，需要 Owner 的品牌決定。
 */
const styles: Record<Intent, Record<Variant, string>> = {
  flow: {
    solid:
      "bg-[var(--color-intent-flow)] text-white shadow-button-flow hover:bg-[var(--color-brand-cta-hover)] active:bg-[var(--color-brand-cta-hover)]",
    outline:
      "border border-[var(--color-intent-flow)] bg-transparent text-[var(--color-intent-flow)] hover:bg-[var(--color-status-pending-payment-bg)]",
    ghost: "bg-transparent text-[var(--color-intent-flow)] hover:bg-[var(--color-status-pending-payment-bg)]",
  },
  action: {
    solid: "bg-[var(--color-intent-action)] text-white shadow-button-action hover:brightness-95",
    outline:
      "border border-[var(--color-intent-action)] bg-transparent text-[var(--color-intent-action)] hover:bg-edu-page",
    ghost: "bg-transparent text-[var(--color-intent-action)] hover:bg-edu-page",
  },
  neutral: {
    solid:
      "border border-[var(--color-surface-border)] bg-[var(--color-intent-neutral)] text-[var(--color-text-primary)] shadow-sm hover:bg-[#F9FAFB]",
    /*
      舊 `variant="outline"` 的樣式逐字保留在這裡。
      遷移規則（因為舊實作中 `intent` 會**靜默覆蓋** `variant`）：
        - 同時有 `intent` 與 `variant="outline"` 的 8 個呼叫點，實際渲染的是 intent 的樣式
          → 移除被忽略的 `variant`，外觀不變。
        - 只有 `variant="outline"`、沒有 `intent` 的 2 個呼叫點，實際渲染的才是這一格
          → 補上 `intent="neutral"`，外觀不變。
    */
    outline:
      "border border-[var(--color-surface-border)] bg-white text-[var(--color-text-primary)] shadow-sm hover:border-[#6C63FF]/40 hover:text-ds-textAccent",
    /* `UI-CONS-15`：`--color-text-secondary` 是 #6B7280 —— `--ds-text-muted` 在 `UI-CONS-01`
       被改為 #686F7D 之前的舊值。ghost 按鈕常落在 `edu-page`(#F4F1FF) 上，舊值只有 4.34。
       改指 canonical `ds-textMuted`：白 4.94／#F4F1FF 4.54，皆過 AA。 */
    ghost: "bg-transparent text-ds-textMuted hover:bg-white/60",
  },
  /* ✅ `UI-CONS-01`：白字 on `edu-success`(#178640) ＝ 4.65:1，通過 AA（見檔頭）。 */
  success: {
    solid: "bg-edu-success text-white shadow-sm hover:brightness-95",
    outline: "border border-edu-success bg-transparent text-status-approvedText hover:bg-status-approvedBg",
    ghost: "bg-transparent text-status-approvedText hover:bg-status-approvedBg",
  },
  danger: {
    solid: "bg-[var(--color-intent-danger)] text-white shadow-sm hover:brightness-95",
    outline: "border border-edu-error bg-transparent text-edu-error hover:bg-[var(--color-feedback-error-bg)]",
    ghost: "bg-transparent text-edu-error hover:bg-[var(--color-feedback-error-bg)]",
  },
};

/** `aria-hidden` 的載入指示；沿用 repo 既有的 border-trick spinner（同 `ds/StateViews`）。 */
function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none"
    />
  );
}

export function Button({
  intent = "flow",
  variant = "solid",
  size = "md",
  loading = false,
  fullWidth,
  className = "",
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      /* loading 期間必須是真的 disabled —— 只靠 aria 擋不住第二次點擊。 */
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${sizes[size]} ${styles[intent][variant]} ${fullWidth ? "w-full" : ""} ${className}`.trim()}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
