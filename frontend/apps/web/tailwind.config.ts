import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** Account / commerce UI — mirrors globals.css `--ds-*` */
        ds: {
          page: "var(--ds-page-bg)",
          surface: "var(--ds-surface)",
          surfaceMuted: "var(--ds-surface-muted)",
          surfaceSubtle: "var(--ds-surface-subtle)",
          border: "var(--ds-border-default)",
          borderMuted: "var(--ds-border-muted)",
          borderStrong: "var(--ds-border-strong)",
          /*
           * `UI-CONS-15`／WCAG **1.4.11**：表單控制項邊界專用。
           * 既有三個邊框 token 都達不到 3:1（`border` 1.24／`borderMuted` 1.18／`borderStrong` 1.36 on white），
           * 因此**不是**語意不合而已，是數值上沒有可用的既有 token。理由與量測見 `globals.css`。
           */
          borderControl: "var(--ds-border-control)",
          heading: "var(--ds-text-heading)",
          body: "var(--ds-text-body)",
          textMuted: "var(--ds-text-muted)",
          textSubtle: "var(--ds-text-subtle)",
          /* `UI-CONS-15`：品牌色系的**文字**角色 token；理由與量測見 `globals.css`。 */
          textAccent: "var(--ds-text-accent)",
          focus: "var(--ds-focus-ring)",
        },
        edu: {
          page: "#F4F1FF",
          card: "#FFFFFF",
          primary: "#6C63FF",
          /*
           * `UI-CONS-15`（2026-09-09）：**dual-source drift 修正。**
           * `UI-CONS-01` 已把 `--color-brand-cta` 改為 `#EA000D`（白字 4.66），
           * 但這個 Tailwind token 被漏掉、仍停在舊值 `#FF6B73` —— 於是 `text-edu-cta`
           * 實際渲染出 2.76:1 的價格文字。現與 CSS 變數對齊。
           * 用途：5 個 text ＋ 1 個 bg ＋ 1 個 fill，白字於填色上 4.66 亦通過。
           */
          cta: "#EA000D",
          ctaHover: "#FF5964",
          text: "#1F2937",
          /*
           * `UI-CONS-15`（2026-09-09）：這是 `--ds-text-muted` 在 `UI-CONS-01` 被改為
           * `#686F7D` **之前**的舊值所留下的第二份副本。實測 5 個使用點全部是 `text-`，
           * 且多在 Admin 的 `#F4F1FF` 漸層底上 —— 舊值在該底色只有 **4.34:1**。
           * 改為指向同一個 CSS 變數，兩者不再各自漂移。
           */
          muted: "var(--ds-text-muted)",
          border: "#E5E7EB",
          /*
           * `UI-CONS-01`（2026-09-07）：由 #22C55E 改為 #178640。
           * 白字在舊值上只有 2.28:1；新值 4.65:1（AA 通過）。
           * 色相 142.1° → 142.2°，仍然明確是綠色 success，
           * 也仍與 `status.approvedText` #047857（162.9°）區分得開。
           * 這個 token 同時用於填色與文字，兩種用法都因此改善。
           */
          success: "#178640",
          /*
           * `UI-CONS-15`（2026-09-09）：`#F59E0B` 當文字色在白底只有 **2.15:1**。
           * 實測本 token 的 **6 個使用點全部是 `text-`**（無 bg／border／fill），
           * 因此直接改值即可，不會連帶改到任何非文字用途。
           * `#B45309` ＝ 既有 `status.pendingReviewText` 的同值（白底 5.02），沿用既有警示文字色，不新造 token。
           */
          warning: "#B45309",
          /*
           * `UI-CONS-01`（2026-09-08）：`Button intent="danger"` 的 **outline / ghost 文字**
           * 走的是 `edu-error`（不是 `--color-intent-danger`）—— 兩個 token、同一個語意。
           * 必須一起改，否則 outline/ghost 仍停在不合格的 #EF4444。
           */
          error: "#DE1313",
        },
        intent: {
          /* `UI-CONS-01`（2026-09-07）：與 `globals.css` 的 `--color-intent-*` 同步。 */
          flow: "#EA000D",
          action: "#655CFF",
          neutral: "#FFFFFF",
          /* `UI-CONS-01`（2026-09-08）：與 `--color-intent-danger` 同步（見 globals.css 註解）。 */
          danger: "#DE1313",
        },
        status: {
          draftBg: "#F3F4F6",
          draftText: "#4B5563",
          pendingReviewBg: "#FEF3C7",
          pendingReviewText: "#B45309",
          publishedBg: "#ECFDF5",
          publishedText: "#047857",
          unpublishedBg: "#F3F4F6",
          unpublishedText: "#4B5563",
          pendingPaymentBg: "#FFE4E6",
          pendingPaymentText: "#BE123C",
          approvedBg: "#ECFDF5",
          approvedText: "#047857",
          rejectedBg: "#FEE2E2",
          rejectedText: "#B91C1C",
          reviewedBg: "#EDE9FE",
          reviewedText: "#554BFF",
        },
        feedback: {
          loadingText: "#6B7280",
          loadingSpinnerPrimary: "#6C63FF",
          loadingSpinnerTrack: "#DDEBFA",
          emptyIconBg: "#EDE9FE",
          emptyTitle: "#1F2937",
          emptyDescription: "#6B7280",
          emptyAction: "#6C63FF",
          errorBg: "#FEF2F2",
          errorBorder: "#FECACA",
          errorText: "#B91C1C",
        },
      },
      /*
       * `UI-CONS-17`（Wave UI-1，2026-09-04）—— 移除 **零 consumer** 的 theme key。
       *
       * 判定方式不是「grep 一個前綴」：`spacing` 會生成 p/px/py/m/gap/space-y/w/h/max-w/…
       * 幾十個前綴，而 `shadow-card-elevated`（class）與 `shadow-[var(--shadow-card-elevated)]`
       * （arbitrary value 讀 CSS 變數）是兩件事 —— 後者不算前者的 consumer。
       * 逐 key 以全前綴 × 全 `frontend/` 掃描（排除 arbitrary value 與 `var()` 內的字串）後才刪。
       *
       * **`globals.css` 的 CSS 變數一律不動** —— `--shadow-card-*` / `--radius-card-*`
       * 仍透過 `shadow-[var(--shadow-card-default)]`、`rounded-[var(--radius-card-flat)]`
       * 這類 arbitrary value 被實際使用；刪掉的只是「沒人用的 Tailwind class 別名」。
       *
       * 已移除：boxShadow `edu` / `edu-lg` / `card-elevated` / `card-default`；
       *         maxWidth `mobile` / `narrow` / `normal`；
       *         spacing `section-sm` / `section-lg` / `section-xl`；
       *         borderRadius `card-elevated` / `card-default` / `card-flat`。
       * 保留（實測有 consumer）：`button-flow`(2) / `button-action`(2) / `max-w-wide`(3) /
       *         `layout-sidebar`(2) / `page-mobile`(3) / `page-tablet`(3) / `page-desktop`(2) /
       *         `section-md`(2，用的是 `space-y-section-md` 不是 `gap-`)。
       */
      boxShadow: {
        "ds-card": "var(--ds-shadow-card)",
        "ds-card-soft": "var(--ds-shadow-card-soft)",
        "ds-card-hover": "var(--ds-shadow-card-hover)",
        "button-flow": "0 8px 24px rgba(255, 107, 115, 0.28)",
        "button-action": "0 6px 20px rgba(108, 99, 255, 0.22)",
      },
      maxWidth: {
        wide: "1280px",
      },
      ringOffsetColor: {
        ds: "var(--ds-page-bg)",
      },
      spacing: {
        "layout-sidebar": "240px",
        "page-mobile": "16px",
        "page-tablet": "24px",
        "page-desktop": "32px",
        "section-md": "24px",
      },
      borderRadius: {
        "ds-card": "var(--ds-radius-card)",
      },
      /*
       * `UI-CONS-13`（Wave UI-4A，2026-09-08）—— typography token policy: **ADOPT，並移除 `h1`**。
       *
       * `text-h1`（2rem/2.5rem/700）的 consumer 是 **0**，而且它描述的字級**在這個產品裡並不存在** ——
       * canonical 的頁面標題是 `components/ds/PageHeader` 的 `text-h2`（1.5rem/2rem/700 ＝ 24px bold），
       * 全 app 41 個 `<PageHeader>` 都是這個尺寸。把 `PageHeader` 改成 `text-h1` 會讓 41 個頁面
       * 的標題一次變大 —— 那是**藉 token adoption 重新設計頁面**，正是本輪明文禁止的事。
       *
       * 因此保留一個「沒人用、且描述不存在尺寸」的 `h1` 只會讓 design system 看起來比實際完整。
       * **這個 scale 是「字級階梯」，不是「heading 層級」** —— `text-h2` 是頁面標題的字級，
       * 這件事寫在 `docs/ui-design-system.md` §5。重新命名整組 scale 屬 churn，本輪不做。
       *
       * 其餘全部 ADOPT（實測 consumer）：h2=2、h3=4、title=36、body=83、meta=134、caption=48。
       */
      fontSize: {
        h2: ["1.5rem", { lineHeight: "2rem", fontWeight: "700" }],
        h3: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "700" }],
        title: ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.375rem", fontWeight: "400" }],
        meta: ["0.75rem", { lineHeight: "1.125rem", fontWeight: "500" }],
        caption: ["0.6875rem", { lineHeight: "1rem", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};

export default config;
