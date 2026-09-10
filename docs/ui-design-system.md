# UI Design System & Frontend Working Rules

**版本：** v1.0（2026-08-19）
**Audit 對照 commit：** `ec44e4d`（`frontend/apps/web`、`frontend/packages/ui`）

本文件是 **Web UI 任務的 canonical 入口**。任何要動 `frontend/apps/web` 畫面的工作，先讀這一份，再依需要往下查細節文件。

本文件**同時記錄兩件事**，且明確分開標示：

| 標記 | 意義 |
| --- | --- |
| **[現況]** | Repository 目前實際存在的樣子（audit 結果，可能不理想） |
| **[規則]** | 後續必須遵循的規則 |
| **[方向]** | 建議的收斂方向，**尚未執行**，不得視為已完成 |

> 本文件不 redesign UI、不定義新品牌、不新增大量 token。它回答的是：
> **「之後的 Web UI 任務，到底該依循哪一套 Design System 與工作規則。」**

---

## 0. 文件地圖（誰是誰的 source of truth）

| 文件 | 負責範圍 | 與本文件的關係 |
| --- | --- | --- |
| **`docs/ui-design-system.md`（本文件）** | UI 入口、canonical stack、分層、component 狀態、工作規則、DoD | **先讀這份** |
| `docs/frontend-ui-architecture.md` | `ds` vs `edu` token 家族選用決策、`Card`/`SurfaceCard` 分工、Button intent 對照 | **細節文件**，決策表仍有效 |
| `docs/design-tokens-v1.1.md` | Token **數值**（色票、radius、shadow、typography） | **數值 source of truth**，本文件不重抄 |
| `docs/page-token-usage-mapping-v1.1.md` | 7 個關鍵頁的 intent / card level / feedback 對照 | 頁面級對照 |
| `docs/cart-ui-guidelines.md` | 購物車頁像素級規範 | 頁面級 spec |
| `docs/buyer-sidebar-ui-spec.md` | Buyer 桌面側欄展開／收合 | 頁面級 spec |
| `docs/materials-detail-spec.md` | 教材詳情頁 | 頁面級 spec |
| `docs/ui-role-naming-checklist.md` | UI 文案角色命名 | **每個 UI 任務必查** |
| `docs/mvp_rules.md` | §A 前端資料來源政策、授權邊界 | **UI 任務的硬約束**，見 §11.8 |
| `CLAUDE.md` | 專案總規則（auth 邊界、DB、git、驗收） | 上位規則，衝突時以 `CLAUDE.md` 為準 |

**衝突排序：** `CLAUDE.md` > 產品／API spec > 本文件 > 頁面級 UI spec > 其他。

---

## 1. Purpose

1. 讓後續每一個 Web UI 任務有**單一入口**，不必重新盤點架構。
2. 明確 **canonical vs legacy** 邊界，避免「又長出第三套 Button / Card」。
3. 把「已經存在的規則」與「建議方向」分開，避免文件寫成理想化空談。
4. 定義 UI 任務的 **Definition of Done**：不是 build passed 就算完成。

**不在本文件範圍：** 產品行為、API 契約、權限判斷、資料來源。UI 任務**不得**順手改這些（見 §11.5）。

---

## 2. Canonical Web UI stack

### 2.1 [現況] 實際技術棧

| 項目 | 實際值 | 來源 |
| --- | --- | --- |
| Framework | Next.js 15 App Router + React 19 + TypeScript | `frontend/apps/web/package.json` |
| Styling（canonical） | **Tailwind CSS 3.4.17** + PostCSS + autoprefixer | `tailwind.config.ts`、`postcss.config.mjs` |
| Token 來源 | `app/globals.css` `:root` CSS variables + `tailwind.config.ts` `theme.extend` | 兩檔 |
| 字型 | `Noto Sans TC`（主）+ `Inter`（fallback），`next/font/google` | `app/layout.tsx` |
| Breakpoints | **Tailwind 預設**（`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`）— config **未**自訂 `screens` | `tailwind.config.ts` |
| 圖示 | `lucide-react`（**4 檔**）+ 手寫 SVG `components/ui/icons.tsx` | 兩套並存 |
| Legacy UI 套件 | **Tamagui v2-rc + `@teaching-platform/ui`，仍安裝且仍在 root 掛載** | `app/providers.tsx`、`tamagui.config.ts`、`next.config.ts` |

### 2.2 [規則] Canonical stack

```
Tailwind (utility) + globals.css CSS variables
  └── components/ui/      primitives
        └── components/ds/  design-system compositions
              └── components/{domain}/  business composition
                    └── app/**          page / route composition
```

- **Web canonical styling = Tailwind**（配合 `globals.css` 的 CSS variables）。
- `components/ui` = **primitives**（無領域語意）。
- `components/ds` = **design-system compositions**（表面容器、CTA link）。
- domain components **不得**重造 primitive。
- `@teaching-platform/ui` / Tamagui = **legacy-frozen**（見 §12）。
- **新 Web UI 不得新增 Tamagui import、不得新增 `@teaching-platform/ui` 使用點。**

### 2.3 [現況] Tailwind / Tamagui 混用是事實，不是例外

Tamagui **並未被隔離在少數頁面**，而是與 Tailwind **同頁混用**：整頁版面用 Tailwind class，頁內的 Button / SurfaceCard / StatusBadge / EmptyState 卻來自 Tamagui。

`app/layout.tsx` → `AppProviders`（`NextThemeProvider` + `TamaguiProvider`）包住**全部**路由，
`tamagui.config.ts` 以 `@teaching-platform/ui` 的 `webTheme` 覆寫 light theme，
`next.config.ts` 需 `transpilePackages` 與 `react-native$ → react-native-web` alias。

**因此：移除 Tamagui 是一個獨立的 migration 專案，本輪僅記錄邊界（§12），不執行。**

---

## 3. Component layering

### 3.1 [規則] 分層定義

```text
components/ui/          → atomic / primitive UI
                          無領域語意、無 fetch、無路由知識
                          例：Button, Card, Input, Chip, Checkbox, icons

components/ds/          → composed Design System pattern
                          以 ds token 組出的通用表面／CTA
                          例：SurfaceCard, PrimaryCtaLink, BrandCtaLink

components/{domain}/    → business-specific composition
                          知道領域語意（教材、訂單、購物車、admin）
                          例：MaterialCard, CartItem, CheckoutStepper, AdminKpiCard

components/layout/      → shell / navigation composition
                          例：AppShell, RoleShell, MobileHeader, BottomNav

app/**/page.tsx         → screen composition
                          只做 fetch + 組裝，盡量薄
```

### 3.2 [規則] 依賴方向（單向）

```
app  →  layout  →  domain  →  ds  →  ui
```

- **不得反向**：`components/ui` 不得 import domain 或 `ds`。
- `components/ds` 可 import `components/ui`，反之不可。
- domain component 可 import `ui` 與 `ds`。

### 3.3 [規則] 後續 Claude 不應做的事

- 在 domain component 或 page 內重新造 Button（用 `components/ui/Button`）。
- 在 page 裡 hard-code 一套 Card system（`rounded-xl border shadow-sm` 長字串）。
- 已有 DS pattern 時又建立第二套。
- 為單一頁面需求過早抽象 universal component。

**原則：Reuse when semantics match. Abstract only when reuse is real.**

判準：**同一個 pattern 在 ≥ 3 處出現且語意相同**，才值得抽到 `ds/`；只有 1–2 處請留在 domain。

---

## 4. Design tokens

**數值 source of truth：`docs/design-tokens-v1.1.md`。本節只做 audit 分類，不重抄數值。**

### 4.1 [現況] Token 目前有 **三個來源**（這是問題，不是設計）

| # | 來源 | 形式 | 狀態 |
| --- | --- | --- | --- |
| 1 | `app/globals.css` `:root` | CSS variables（`--color-*`、`--ds-*`、`--layout-*`、`--radius-*`、`--shadow-*`） | **canonical** |
| 2 | `tailwind.config.ts` `theme.extend` | 部分 `var(--…)` 參照（`ds.*`、`boxShadow.ds-*`、`borderRadius.ds-card`）；**部分直接寫死 hex**（`edu.*`、`intent.*`、`status.*`、`feedback.*`） | **半 canonical**：寫死的部分與 #1 是複製關係，會漂移 |
| 3 | `frontend/packages/ui/src/tokens.ts` | JS 物件 `designTokens`，供 Tamagui 元件使用 | **legacy**，已與 #1/#2 漂移 |

**已確認的漂移範例（#3 vs #2）：**

| Token | `tailwind.config.ts` | `packages/ui/src/tokens.ts` |
| --- | --- | --- |
| success | `#22C55E` | `#16a34a` |
| warning | `#F59E0B` | `#d97706` |
| h1 size / line-height | `32 / 40` | `28 / 36` |

> **[規則] 新 UI 一律只讀來源 #1 / #2（Tailwind class 或 CSS variable）。不得 import `designTokens`。**

### 4.2 A. Canonical / Ready（可直接使用）

| 類別 | Token | Tailwind 用法 |
| --- | --- | --- |
| **Surface（commerce/account/admin）** | `--ds-page-bg` / `--ds-surface` / `--ds-surface-muted` / `--ds-surface-subtle` | `bg-ds-page` / `bg-ds-surface` / `bg-ds-surfaceMuted` / `bg-ds-surfaceSubtle` |
| **Border** | `--ds-border-default` / `-muted` / `-strong` | `border-ds-border` / `border-ds-borderMuted` / `border-ds-borderStrong` |
| **Text hierarchy** | `--ds-text-heading` / `-body` / `-muted` / `-subtle` / **`-accent`** | `text-ds-heading` / `text-ds-body` / `text-ds-textMuted` / `text-ds-textSubtle` |
| **Radius（卡片）** | `--ds-radius-card`（20px） | `rounded-ds-card` |
| **Shadow（卡片）** | `--ds-shadow-card` / `-soft` / `-hover` | `shadow-ds-card` / `shadow-ds-card-soft` / `shadow-ds-card-hover` |
| **Semantic — Button intent** | `intent.flow` / `action` / `neutral` / `danger` | 透過 `Button` 的 `intent` prop，**不要**直接寫 `bg-intent-*` |
| **Semantic — Status（8 組 bg/text 成對）** | `status.*Bg` / `status.*Text` | `bg-status-draftBg text-status-draftText` … |
| **Semantic — Feedback（loading/empty/error）** | `feedback.*` | `text-feedback-loadingText`、`bg-feedback-errorBg` … |
| **Focus** | `--ds-focus-ring`（= brand primary） | `ring-ds-focus` / `outline-ds-focus`、`ring-offset-ds` |
| **Layout：content max-width** | 768 / 1152 / 1280 / 1440 | `max-w-3xl` / `max-w-6xl` / `max-w-wide` / `max-w-[1440px]`（分類見 §7.4；`max-w-narrow` / `max-w-normal` 已於 `UI-CONS-17` 移除，零 consumer） |
| **Layout：page padding** | 16 / 24 / 32 | `px-page-mobile` / `px-page-tablet` / `px-page-desktop`（**canonical page gutter**，見 §7.2／§7.3） |
| **Layout：section rhythm** | 16 / 24 / 32 / 48 | `gap-section-sm` / `-md` / `-lg` / `-xl` |
| **Layout：sidebar** | 240px 展開 / 72px 收合 | 展開寬度的**唯一來源**是 `components/layout/shell-constants.ts` 的 `SIDEBAR_WIDTH_EXPANDED_PX`（＋ class 形式 `w-layout-sidebar`）；`dashboard/sidebar-constants.ts` 只 re-export，**不再宣告第二個 `240`**（`UI-CONS-06`，2026-09-08）。收合寬度 72px 為買家專屬，見 §8.2.3 |
| **Typography scale** | h2 / h3 / title / body / meta / caption | `text-h2` … `text-caption`（`text-h1` 已於 `UI-CONS-13` 移除，見 §5.1） |
| **Breakpoints** | Tailwind 預設 | `sm:` `md:` `lg:` `xl:` `2xl:` |

### 4.2.0 [規則] 品牌色 ≠ 文字色（`UI-CONS-15`，2026-09-09，Owner 批准）

**`edu-primary`（`#6C63FF`）是品牌／強調的視覺 token，不是可用的文字色。**
實測它當作文字時在本站**每一種**背景上都不到 AA：

| 背景 | `#6C63FF` | `--ds-text-accent` `#5045FF` |
| --- | ---: | ---: |
| 白 `#FFFFFF` | 4.32 ❌ | **5.78** ✅ |
| `edu-page` `#F4F1FF` | 3.88 ❌ | **5.19** ✅ |
| `ds-page` `#F4F5FA` | 3.96 ❌ | **5.30** ✅ |
| `surfaceSubtle` `#F7F7FB` | 4.04 ❌ | **5.40** ✅ |
| 導覽 active tint over 白 `#EDECFF` | — | **4.96** ✅ |
| 導覽 active tint over page `#E4E0FF` | — | **4.51** ✅ |

**既有的 `--color-intent-action`（`#655CFF`）也不夠** —— 它只在純白上過（4.64），
在 `edu-page` 上是 4.17。而且它同時是 `Button intent="action"` 的**填色**，
調暗它會連帶改掉所有 action 按鈕的底色 —— 那不是文字補救該做的事。

**因此採用的架構是：**

```text
edu-primary       →  維持不變（品牌／填色／邊框／裝飾）
intent-action     →  維持不變（button intent，含填色）
--ds-text-accent  →  新增；品牌色系的「文字角色」token，與
                     --ds-text-heading/body/muted/subtle 同一語意層
```

`#5045FF` 是自 `#6C63FF` **保持色相**（243.5°）壓暗到剛好在最暗的實際文字背景
（`#E4E0FF`）上達到 4.5 為止 —— 不是隨手挑的深紫。

**遷移範圍：** 95 處／52 檔的 `text-edu-primary`／`text-[#6C63FF]` → `text-ds-textAccent`。
**非文字用途（填色 20、邊框／ring 62、tint 6、icon fill 1）完全未動。**

護欄：`tests/e2e/contrast-contract.spec.ts` 量真實渲染的前景與背景，
並附「舊值必須量得出不合格」的負向控制。

### 4.2.0b [規則] 非文字對比（WCAG 1.4.11）與控制項邊界

**裝飾性邊框與控制項邊界是兩件事。**

| 用途 | Token | 值 | 門檻 | 白底實測 |
| --- | --- | --- | ---: | ---: |
| 卡片邊緣／分隔線（裝飾） | `ds-border` | `#E5E7EB` | 不適用 | 1.24 |
| 次要分隔 | `ds-borderMuted` | `#ECECF2` | 不適用 | 1.18 |
| 強調分隔 | `ds-borderStrong` | `#DCDCE8` | 不適用 | 1.36 |
| **表單控制項邊界** | **`ds-borderControl`** | **`#85898F`** | **3:1** | **3.52** |

`input` / `select` / `textarea` 一律用 `border-ds-borderControl`。理由：這些控制項的
填色與周圍只差 **1.04～1.07**，**邊框是它唯一的視覺辨識依據**，因此受 1.4.11 的 3:1 拘束。
既有三個邊框 token **數值上都達不到 3:1**，所以這是新增而非沿用。

`#85898F` 在四種實際背景上都通過：白 3.52／`edu-page` 3.16／`#FAFAFA` 3.37／`#F9FAFB` 3.36。

**明確不受 1.4.11 拘束（已逐項判定）：**

- 卡片邊緣、區塊分隔線 —— 裝飾性，不用於辨識控制項
- 實心按鈕 —— 以填色辨識（`#655CFF` 4.64／`#EA000D` 4.66），本來就不靠邊框
- `disabled` 控制項 —— 1.4.11 明文例外（但必須是**真的** `disabled`，不是只變淡）
- 導覽 active 態 —— 同時有底色＋前景色＋字重三個訊號，非單一顏色傳達
- `aria-hidden` 裝飾 icon —— 不承載必要資訊

Focus indicator（`#6C63FF` 對白 **4.32**）已通過 3:1，Wave UI-7 的 focus 系統不需改動。

### 4.2.1 [規則＋現況] Contrast — canonical 配色全部符合 WCAG AA（`UI-CONS-01` ✅ CLOSED，2026-09-08）

> **Canonical contrast debt closed.** 全量 census **31 列、failures = 0**。
> Button／Status／text／feedback 的所有 canonical pair（含 hover 態與各種實際背景）
> 皆達 **AA 正常字級 4.5:1**。**raw legacy palette 的硬編碼色值不在本節範圍，由 `UI-CONS-15` 追蹤。**

**量測方式：** 從 `app/globals.css` 與 `tailwind.config.ts` 讀**實際值**計算，
並由 `tests/e2e/contrast-contract.spec.ts`（14 條 × 2 project）在瀏覽器讀 computed style 複驗。
**不比對色碼字串** —— 換色、換 token 名稱都不會誤紅，但任何一組掉回 AA 以下一定會紅。

**修正過的 canonical token（三批，皆 Owner sign-off）：**

| token | 舊值 → 新值 | 對比（前 → 後） |
| --- | --- | ---: |
| `--color-status-reviewed-text`（`tone="info"`） | `#6C63FF` → `#554BFF` | 3.63 → **4.61** |
| `--color-status-pending-payment-text` | `#FF6B73` → `#BE123C` | 2.30 → **5.24** |
| `edu.success`（`Button intent="success"` 填色） | `#22C55E` → `#178640` | 2.28 → **4.65** |
| `--color-intent-flow` | `#FF6B73` → `#EA000D` | 2.76 → **4.66** |
| `--color-brand-cta` / `--color-brand-cta-hover` | `#FF6B73`/`#FF5964` → `#EA000D`/`#D1000C` | 2.76/3.06 → 4.66/**5.65** |
| `--color-intent-action` | `#6C63FF` → `#655CFF` | 4.32 → **4.64** |
| `--ds-text-subtle` | `#9CA3AF` → `#666F7F` | 白 2.54→**5.07**／ds-page 2.33→**4.65**／edu-page→**4.55** |
| `--color-intent-danger` ＋ `edu.error` | `#EF4444` → `#DE1313` | solid 3.76→**4.99**／outline 3.76→**4.99**／hover→**4.56** |
| `--ds-text-muted` | `#6B7280` → `#686F7D` | ds-page 4.44→**4.64**／edu-page 4.34→**4.54**／白→**5.05** |

**四個非顯而易見的陷阱（每一個都曾讓「已修好」是假的）：**

1. **一個語意可能有兩個 token。** `Button intent="danger"` 的 **solid** 走
   `--color-intent-danger`，**outline/ghost 文字**走 **`edu-error`** —— 只改一個，
   外框態仍停在舊色。`success` 同理（`edu.success` 是填色來源，不是 `--color-*`）。
2. **hover／active 是獨立 token。** `intent="flow"` 的 hover 是 `--color-brand-cta-hover`；
   加深 base 卻不動它，會變成「滑過去反而變淺」，而且白字仍不合格。
   `danger` outline 的 hover 底色是 `--color-feedback-error-bg`(#FEF2F2) ——
   在白底通過不代表在 hover 底通過（`#E81414` 白底 4.62、hover 底只有 4.23）。
3. **同一個文字 token 會落在多種背景上。** `text-ds-textMuted` 實測渲染於
   surface／white／ds-page／surfaceSubtle／surfaceMuted／**edu-page** 六種背景，
   必須挑一個在**全部**背景都達標的值 —— **不建立 `text-muted-on-page` 這類補丁 token**。
4. **色值有兩個來源。** `globals.css` CSS 變數與 `tailwind.config.ts` hex 必須一起改（§4.3 B11）。
   契約測試直接量「真實渲染的 danger solid 底色」與「outline 文字色」是否相等來釘住這件事
   （**不能**用執行期注入的 class —— Tailwind JIT 只產生原始碼裡出現過的 class）。

> **`pendingPayment` 為什麼不是「保持色相壓暗」：** 那會得到 `#D3000B`，與 `danger` 的
> `#B91C1C` 只差 **3.1°** 色相，兩個狀態會失去視覺區分。rose 系 `#BE123C` 色相差 **14.7°**。
>
> **`danger` 為什麼是 `#DE1313` 而不是核准的 `#E81414`：** 見上面第 2 點 ——
> `#E81414` 在 outline hover 底色上只有 4.23。`#DE1313` 同色相、再暗 0.022 明度，
> 全部組合皆過。要嚴格回到 `#E81414`：改 `globals.css` 一行 ＋ `tailwind.config.ts` 兩處。

---

### 4.3 B. Duplicate / Inconsistent（已存在的重複，本輪只記錄）

| # | 問題 | 實測證據 |
| --- | --- | --- |
| B1 | **兩套視覺語言並存**：`edu`（探索／行銷，page bg `#F4F1FF`）vs `ds`（commerce／account，page bg `#F4F5FA`） | `tailwind.config.ts` 同時定義 `edu.page` 與 `ds.page` |
| B2 | **三套 page background**（原記四套）：`globals.css` `body` 的 `#FFF8EF→#FFFDF9` 漸層、`AppShell` 的 `#F4F1FF→#FAF8FF→#F4F1FF`、`AdminShell` 的 `#F4F1FF→white→#F4F1FF` | 3 個 shell 各寫各的。第四套（`AuthSplitLayout` 的 `#F4F1FF→#FAF8FF→#FFF8EF`）**已隨該檔於 2026-09-04 `UI-CONS-22` 刪除** |
| B3 | **`--background` / `--foreground`（`#fffaf5` / `#4f3a2d`）是孤兒 token**：`globals.css` 定義但幾乎無人使用，`body` 反而寫死漸層 | `globals.css` |
| B4 | **三種品牌紫**：`#6C63FF`（**52 次 / 27 檔**，code-only）、`#6D5CFF`（**29 次**，僅 login/register 兩檔）、CTA 漸層 `#7C3AED→#6366F1` | login/register 自成一套視覺。**注意：`status.reviewed-text` 已於 `UI-CONS-01`（2026-09-07）由 `#6C63FF` 改為 `#554BFF`；`--color-intent-action` 仍是 `#6C63FF`**〔M〕〔M3〕 |
| B5 | **Radius 尺度失控**：canonical `rounded-ds-card`(20px) **58 次**；`rounded-xl`(12) **199 次**、`rounded-full` **69 次**、`rounded-2xl`(16) **67 次**、`rounded-3xl`(24) **18 次**、`rounded-lg` 19、`rounded-md` 6，另有 **10 種**相異的 `rounded-[…]` 任意值（`10px/14px/16px/18px/20px/28px/32px` 等） | 全 app grep〔M〕 |
| B6 | **Shadow 尺度失控**：`shadow-sm` **31 次**、`ds` 三顆合計 **36 次**（`-soft` 22 / `shadow-ds-card` 11 / `-hover` 3），另有 **40 種**相異的任意 `shadow-[…]` | 全 app grep〔M〕 |
| B7 | **[部分收斂 `UI-CONS-07`／Wave UI-4B]** 置中 page container 已分四類（§7.4），gutter 已統一為 16/24/32 且**每頁只有一層**；但 **`max-w-*` 名稱仍未收斂**（`max-w-6xl`／`7xl` 與 `max-w-wide` 同概念兩套寫法），記為 semantic debt。原盤點：**content max-width 無共識**：token alias `max-w-wide` 僅 **3 次**（`max-w-narrow` / `max-w-normal` / `max-w-mobile` 皆 **0**），實際主力是 `max-w-2xl`(**12**)、`max-w-6xl`(**10**)、`max-w-7xl`(**10**)、`max-w-3xl`(7)、`max-w-xl`(6)、`max-w-4xl`(6)、`max-w-5xl`(4)，另有 **16 種**相異的 `max-w-[…]` 任意值（`720px` / `1440px` / `820px` / `620px` / `960px` / `90vw` 等） | 全 app grep〔M〕 |
| B8 | **page padding token 幾乎沒被用**：`px-page-*` 合計 **8 次**（`-mobile` 3 / `-tablet` 3 / `-desktop` 2 —— **此數與原記相同，未變**）；實際是 `px-3`(**138**)、`px-4`(**113**)、`px-5`(**33**)、`px-6`(**20**)。**`gap-section-sm/md/lg/xl` 四個 token 使用數皆為 0** | 全 app grep〔M〕 |
| B9 | **硬編碼 hex 廣泛存在**：6 位 hex **67 個檔案 / 688 處 / 84 個相異值**（分母：`app` ＋ `components` 下 **167** 支 `.tsx`，原記 166）；最集中為 `app/register/page.tsx`、`app/login/page.tsx`、`app/checkout/page.tsx`、`app/orders/[orderId]/payment-proof/page.tsx`、`app/orders/page.tsx`、`components/cart/CartItem.tsx`（**逐檔數字見下方 B9 註**）。**另有 118 處 off-token `slate-*`**，集中於 `app/teacher/*` ＋ `components/teacher/*`（7 檔）。**現由 tracker `UI-CONS-15`（`P2`）追蹤；本表只記錄現況，不啟動 token migration** | 全 app grep（2026-08-30 `DOC-01`；**2026-09-04 7-layer audit 重測**）〔M〕|
| B10 | **`status.*` Tailwind token 採用度已明顯改善（原記「全 app 僅此 2 處」已過期）**：2026-09-04 重測為 **27 處 / 7 檔**（`app/admin/complaints`、`app/me/orders/[orderId]`、`app/orders/[orderId]/payment-proof`、`components/admin/AdminDashboardPage`、`components/admin/AdminKpiCard`、`components/admin/MaterialReviewPanel`、`components/ds/PageHeader`）。主要載體是 `ds/StatusPill`（21 處）。**但仍與另外兩套並存**：legacy Tamagui `StatusBadge`（1 處，tone 值域不相容）與 **24 個就地手寫的 `rounded-full` badge span** | 全 app grep〔M〕 |
| B11 | **Token 三來源漂移**（見 §4.1） | `tokens.ts` vs `tailwind.config.ts` |

> **B9 的量測沿革（`DOC-01`，2026-08-30）：** 本列先前寫「62 個檔案（原 67，admin dashboard 三個 card component 已清零）」。2026-08-30 重新實測為 **67 檔 / 694 處** —— 與「已清零」的敘述不一致。
> 本輪**只更正為實測值，未調查差異來源**（可能是後續新頁面重新引入，也可能是原始 62 的分母不同）。
> `components/layout/RoleShell.tsx` 現為 **5** 處（原記 40），該檔確實已大幅收斂。
> **本輪不啟動任何 token migration**（`CLAUDE.md` §10.4：不做 broad refactor）。
>
> **B9 的逐檔數字與單位（`UI SYSTEM 7-LAYER CONSISTENCY AUDIT`，2026-09-04）：**
> 本列先前的逐檔數字（register 49、checkout 44、login 38、payment-proof 33、orders 21、cart 15）
> 是**含 hex 的「行數」**，而總計「67 檔 / 694 處」的「處」是**出現次數** —— **兩者單位不同**。
> **這不是舊值錯誤，是口徑不同。** 2026-09-04 以同一個 6 位 hex pattern 重測，兩種單位並列：
>
> | 檔案 | 行數 | 出現次數 |
> | --- | ---: | ---: |
> | `app/register/page.tsx` | 49 | 83 |
> | `app/login/page.tsx` | 40 | 69 |
> | `app/checkout/page.tsx` | 44 | 51 |
> | `app/orders/[orderId]/payment-proof/page.tsx` | 33 | 38 |
> | `app/orders/page.tsx` | 21 | 29 |
> | `app/cart/page.tsx` | 15 | 15 |
> | `components/cart/CartItem.tsx` | 9 | 23 |
>
> 總計以**出現次數**計為 **688**（原記 694，同口徑下的小幅變動）；檔數 **67**（未變）。
> 若把 pattern 放寬到 3–8 位 hex，則為 **68 檔 / 689 處 / 85 個相異值** —— **那是另一個口徑，
> 不可與本列的 6 位數字直接相減。**

### 4.4 C. Missing / Future need（**本輪不建立**）

| # | 缺口 | 現況 |
| --- | --- | --- |
| C1 | **Dark mode / theme** | 無。`<html>` 寫死 `t_light`，`NextThemeProvider` 的 `onChangeTheme` 是 no-op |
| C2 | **z-index scale** | 無 token。實際用 `z-50`(8) / `z-40`(12) / `z-30` / `z-20` / `z-10` / `z-[80]` / `z-[1]` 各自為政 |
| C3 | **Motion / duration token** | 無。150ms / 200ms 只寫在文件散文裡，程式用 `transition` / `duration-150` / `duration-200` |
| C4 | **Focus ring recipe** | `--ds-focus-ring` 有值，但沒有統一的 focus-visible utility 或元件約定 |
| C5 | **Skeleton token / 元件** | 無。4 個檔案各自手寫 `animate-pulse` |
| C6 | **語意化 breakpoint 命名** | 無自訂 `screens`；`2xl` 完全未用、`xl` 僅 5 次 |
| C7 | **Overlay / scrim token** | 無。drawer 遮罩自寫 |

> **[規則] 本輪與後續一般 UI 任務，不得為了「文件完整」而擅自新增大量新顏色／spacing／radius／shadow／breakpoint。**
> 要補 token 必須：先確認 ≥ 3 個真實使用點 → 加到 `globals.css` + `tailwind.config.ts` → 同步 `docs/design-tokens-v1.1.md`。

---

## 5. Typography

### 5.1 [現況] Scale（canonical，`tailwind.config.ts`）

| Class | Size / Line-height / Weight | 用途 | 實測 consumer〔M4〕 |
| --- | --- | --- | ---: |
| `text-h2` | 24 / 32 / 700 | **application page title**（`PageHeader` 的 `h1`） | 5 |
| `text-h3` | 20 / 28 / 700 | 卡片／小區塊標題 | 4 |
| `text-title` | 16 / 24 / 600 | 卡片標題、表頭 | 36 |
| `text-body` | 14 / 22 / 400 | 內文 | 82 |
| `text-meta` | 12 / 18 / 500 | Meta 標籤 | 134 |
| `text-caption` | 11 / 16 / 500 | 密集輔助文字 | 48 |

> 〔M4〕**量測範圍**：`frontend/apps/web/{app,components}/**/*.tsx`（167 個檔案），
> 單位是 **class token 出現次數**（不是檔案數）。量測時間：`Wave UI-4A` 完成後。

**`text-h1` 已於 `Wave UI-4A`（`UI-CONS-13`，2026-09-08）移除。**
它的 consumer 實測為 **0**，而且它描述的 32px 字級**在這個產品裡並不存在** ——
canonical 的頁面標題是 24px（`text-h2`），全 app 41 個 `<PageHeader>` 都是這個尺寸。
把 `PageHeader` 改成 `text-h1` 會讓 41 個頁面的標題一次變大，那是**藉 token adoption
重新設計頁面**。保留一個沒人用、又描述不存在尺寸的階，只會讓 design system 看起來
比實際完整。

**這組 scale 是「字級階梯」，不是「heading 層級」** ——
`text-h2` 是頁面標題的**字級**，`<h1>` 是它的**語意**，兩者不對應是刻意的。
重新命名整組 scale（`h2`→`title-lg` 之類）屬 churn，未排程。

- 字型堆疊：`var(--font-noto), var(--font-inter), ui-sans-serif, system-ui, sans-serif`（`app/layout.tsx` inline style）。

### 5.2 [規則] Typography hierarchy contract

同一個語意層級在不同頁面**必須算出同一組字體值**。這是 `UI-CONS-13` 的實質內容 ——
問題從來不是「有人沒用 token」，而是同一層級長得不一樣。

| 層級 | Canonical recipe | 唯一入口 / 用法 | 護欄 |
| --- | --- | --- | --- |
| Application page title | `text-h2`（24/32/700） | **`components/ds/PageHeader`**；無法用 PageHeader 時直接寫 `<h1 className="text-h2 …">` | `tests/e2e/typography-hierarchy-contract.spec.ts` |
| Section heading | `text-h3`（20/28/700） | `<h2 className="text-h3">` | — |
| Card heading | `text-title`（16/24/600） | `<h3 className="text-title">` | — |
| Body | `text-body` | 段落內文 | — |
| Helper / meta | `text-meta` / `text-caption` | 標籤、輔助說明 | — |

- 一頁只有一個 `h1`；區塊用 `h2` / `h3`。
- 語意標籤與視覺尺寸分開：需要小標題視覺但語意是 `h3` 時，用 `<h3 className="text-title">`，不要降級成 `<div>`。
- 新程式碼**優先**用 `text-h2`…`text-caption`；用 Tailwind 預設尺寸可接受，但**不要新增任意 `text-[NNpx]`**。
- 中文行高不得低於 1.4；`leading-relaxed` / `leading-snug` 依密度選用。
- **Marketing hero 不套 application page typography。** landing / login / register / `Hero` /
  `HeroExplore` 的 `text-3xl`…`text-5xl` + `font-extrabold` 是刻意的行銷字級，不是 drift。

### 5.3 [現況] `Wave UI-4A` 後仍未收斂的 `<h1>`（已分類，非未知）

實測 raw `<h1>` ＝ **22**（`{app,components}/**/*.tsx`），分類如下：

| 類別 | 數量 | 處置 |
| --- | ---: | --- |
| `PageHeader` 本體（canonical） | 1 | — |
| 已收斂為 `text-h2` | 5 | ✅ |
| `sr-only` / 響應式僅供輔助技術的標題 | 4 | 不是視覺 typography，維持 |
| Marketing hero（landing / login / register / Hero / HeroExplore / Legal / Account shell） | 7 | 刻意例外，見 §5.2 |
| 系統 fallback 頁（`403` / `not-found` / `error`） | 3 | 全頁使用 inline style、不吃 Tailwind；改寫屬 restyle 而非 typography normalization |
| Media-object 內的內容標題（`/materials/:id/reviews`） | 1 | 80px 縮圖右側的教材標題，套 24px 會擠壓版面 —— 屬版面問題，非 typography drift |
| ~~Account shell 自有標題~~ | ~~1~~ | **已於 Wave UI-8 收斂**：`md:text-[1.75rem]`（28px 任意值）→ canonical `text-h2`。其他四個 surface 的頁面標題在任何斷點都是 24px，這裡卻在 `md` 以上獨自放大，屬無理由的 divergence。只改字級，eyebrow／分隔線／行動版 `sr-only` 行為未動 |

> **`UI-CONS-13` 於 Wave UI-8 結案（✅ DONE）**：剩餘裸 `<h1>` **全部**落在四類允許例外
> （`sr-only`／marketing hero／系統 fallback／media-object），application page title 已完全 canonical。

---

## 6. Spacing

### 6.1 [現況]

- Base scale = Tailwind 預設 4px 網格。
- 專案 alias（`tailwind.config.ts` `spacing`）：`page-mobile/tablet/desktop` = 16/24/32、`section-sm/md/lg/xl` = 16/24/32/48、`layout-sidebar` = 240px。
- **[現況→已改善]** `px-page-*` 在 Wave UI-4B（`UI-CONS-07`）成為 canonical page gutter，
  實測從 8 次增加到 **31 個 page container**（`app/**/page.tsx`）。
- **[現況] Section rhythm 仍未收斂，且 `section-*` token 不是 canonical**：
  page container 上的實測分佈是 `gap-4`／`space-y-4`（16px）**18／31**，
  而 `space-y-section-md`（24px）只有 **2 個 consumer、集中在 `AdminDashboardPage` 一個檔**。
  因此本輪**不推動 `section-*` 採用** —— 那會是為了 token 採用而改動整站，
  而不是收斂既有 pattern。

### 6.2 [規則]

- 一律走 4px 網格：`1 / 1.5 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12`。
- **禁止 spacing magic number**：不要 `mt-[13px]`、`p-[18px]`。
- **禁止用 negative margin / `translate` 修主要版面對齊**（僅允許極小的視覺補償，且需在 code comment 說明）。
- 間距優先加在 **container 的 `gap`**，而不是每個子元素的 `margin`。

---

## 7. Layout

### 7.1 [現況] 目前有 **六個 shell**

| Shell | 路徑 | 使用範圍 | 背景 |
| --- | --- | --- | --- |
| `RoleShell` | `components/layout/RoleShell.tsx`（493 行） | **root layout 全域包覆**，依 role 分派 | 依分支 |
| `AppShell` | `components/layout/AppShell.tsx` | 公開頁 / 一般頁，可掛 `BottomNav` | `#F4F1FF→#FAF8FF→#F4F1FF` |
| `ParentAppShell` | `components/dashboard/ParentAppShell.tsx` | Buyer 登入後（sidebar + topbar + 徽章同步）。**側欄斷點 `lg`（2026-09-08 `UI-CONS-05`，原為 `md`）；抽屜改用共用 `NavDrawer`（`UI-CONS-23`）** | 由 Sidebar/Topbar 決定 |
| `AdminShell` | `components/admin/AdminShell.tsx` | Admin | `#F4F1FF→white→#F4F1FF` |
| ~~`AuthSplitLayout`~~ | ~~`components/layout/AuthSplitLayout.tsx`~~ | ~~login / register 雙欄~~ | **已於 2026-09-04 Wave UI-1（`UI-CONS-22`）刪除** —— 全 repo **0 個 consumer**（runtime / test / story / barrel 皆 0）；`/login`／`/register` 實際上各自寫版面，從未使用它。**因此 shell 現為五個，不是六個。** |
| `ProductAccountChrome` | `components/account/ProductAccountChrome.tsx` | 使用者中心內頁共用 header（非完整 shell） | 用 `ds` token |

**[現況] Header / Sidebar 關係：**

| Role | Desktop | Mobile |
| --- | --- | --- |
| Buyer | `Sidebar`（240px 展開 / 72px 收合，`--sidebar-offset` 同步 padding，transition 200ms）+ `Topbar` | `Topbar` 漢堡 → overlay drawer；部分頁另有 `MobileHeader` + `BottomNav` |
| Creator | `RoleShell` 內建 creator sidebar | `RoleShell` 內建 |
| Admin | `AdminSidebar`（`lg:fixed`，240px）+ `main` 的 `lg:ml-60` + `max-w-[1440px]` 容器 | **compact top bar（漢堡）→ slide-in drawer + overlay**；側欄在 `lg` 以下 `hidden`，不進文件流（2026-08-19） |
| Public | 無 sidebar；`MobileHeader` + 可選 `BottomNav` | 同左 |

**Toggle 唯一入口：** Buyer 側欄 toggle 只在 Header，收合狀態存 `localStorage`（`tp-sidebar-collapsed`）。詳見 `docs/buyer-sidebar-ui-spec.md`。

### 7.2 [規則] Layout 規則

- **Mobile-first**：預設單欄，用 `md:` / `lg:` 往上擴展；不要寫 desktop-first 再用 `max-*` 往下收。
- **Page horizontal padding（canonical，`UI-CONS-07`／Wave UI-4B，2026-09-08）**：
  `px-page-mobile sm:px-page-tablet lg:px-page-desktop` ＝ **16 / 24 / 32**（斷點 `sm` 640、`lg` 1024）。
  數值沿用既有 token，不是本輪新造；`px-4 sm:px-6 lg:px-8` 與它等值，但**新程式碼一律用 token 形式**。
  **不得新增第二套命名**（`page-gutter-*`／`layout-padding-*`／`shell-padding-*`）。
- **Section vertical rhythm**：區塊間 `gap-6`（24）為預設，大分段 `gap-8`~`gap-12`（32–48）。
- **Card density**：卡片內距用 `Card` 的 `padding` 變體（`sm`=p-4 / `md`=p-5 / `lg`=p-6 md:p-8），不要在 page 內另寫。
- **不要**用 `margin` hack 做左右欄主對齊；雙欄用同一個 grid container（購物車已如此：`1fr 360px` + `align-items:start`）。

### 7.3 [規則] Gutter ownership —— **一頁恰好一層**

`UI-CONS-07` 真正的缺陷不是「數值不一樣」，而是**外殼與頁面同時供應水平內距**。
實測（Wave UI-4B，四個 viewport × 22 條路由）：`/admin/orders`、`/admin/complaints`、
`/cart`、`/my-reviews`、`/me/orders`、`/downloads`、`/checkout` 等頁在 390 上量到
**32px**（外殼 16 ＋ 頁面 16），而同型的 `/admin`、`/favorites` 只有 16。

**規則：**

| 層 | 負責什麼 | 不負責什麼 |
| --- | --- | --- |
| Shell | navigation offset、垂直節奏、背景；**只有 `AdminShell` 供應水平 gutter** | content max-width、頁面內部組成 |
| Page | **唯一**一層水平 gutter（`AdminShell` 之下除外）、content max-width、section 組成 | navigation、背景 |
| Component | 只有自己的內部 padding | 頁面 gutter |

**為什麼不是「外殼永遠擁有 gutter」**（STEP 5 的建議形態，實測後否決，兩個理由都可驗證）：

1. **買家路由的外殼取決於角色，不取決於路由。** `RoleShell.getRoleByPath()` 只在
   `storedRole === "parent"` 時才走 `ParentAppShell`；而 `/orders`／`/favorites`／
   `/downloads`／`/my-reviews`／`/checkout`／`/me/*` 在 `middleware.ts` 只有 login gate、
   **沒有 role gate**（只有 `/cart`／`/dashboard`／`/explore` 有）。gutter 掛在買家外殼上，
   同一頁就會「買家有內距、創作者貼邊」。
2. **`RoleShell` 的 `<main>` 同時包住 full-bleed 元素** —— `MaterialDetailHeader` 是
   `sticky top-0` 的滿版返回列，landing 的區塊底色帶也是滿版。外殼一旦有內距，
   這些元素會被內縮、邊框不再貼邊，那是版面重新設計而不是 spacing 收斂。

因此 `AdminShell`（路由與角色都固定）保留 shell ownership，其餘一律 page ownership。
兩者數值相同，且**每頁只有一層**由 `tests/e2e/layout-contract.spec.ts` 實測
（`<h1>` 到 `<main>` 的逐層 `padding-left` 累加 ＋ 負向控制）。

### 7.4 [規則] Content width categories

**[現況]** 置中容器實測 **15 種** max-width（`app/**/page.tsx`，單位＝容器數，共 49 個）。
本輪**不做大規模改名**，改記為 semantic debt。

| 類別 | 值 | 用途 | 證據 |
| --- | --- | --- | --- |
| narrow | `max-w-3xl`（768） | 表單、單欄閱讀、申訴、我的回饋 | 7 個容器（Admin／Buyer） |
| standard | `max-w-6xl`（1152） | 一般列表／內容頁 | 10 個容器（四個 surface 都有，最常見） |
| wide | `max-w-wide`（1280） | 教材探索、銷售報表、教材詳情 | `max-w-wide` 為既有 token，另有 `max-w-7xl` 5 個容器同值 |
| full | `max-w-[1440px]` | Admin 工作台、教材目錄、auth 雙欄 | 3 個容器 ＋ `AdminShell`／`MobileHeader` |

**Semantic debt（記錄，不在本輪改）：** `max-w-6xl`／`max-w-7xl` 與 `max-w-wide` 指的是
同一組概念卻有兩套寫法；`max-w-4xl`（896，Creator 表單）與 `max-w-3xl`（768，Buyer 表單）
是同一類用途的兩個值。收斂它們會改動幾乎每一頁的內容寬度，屬獨立 wave。

**已移除的死上限：** `/admin/complaints` 的 `max-w-6xl`（1152）在 `AdminShell` 的 1200 上限
＋32 內距下有效寬度只有 1136，**永遠不生效**，Wave UI-4B 已移除。

### 7.5 [規則] Layout 的刻意例外（不算 drift）

| 頁面 | 例外 | 理由 |
| --- | --- | --- |
| `/login`、`/register` | 自有 `px-5 lg:px-6` ＋ `max-w-[1440px]` 雙欄 | `RoleShell` 對這兩條路由走另一個 bare `<main>`（無外殼 chrome）；刻意的行銷雙欄版面 |
| `/`（landing） | `px-4 sm:px-6`（16/24/24，無 `lg` 階） | Marketing hero，`UI-CONS-07` 的 application-page 規則不適用 |
| `MaterialDetailHeader` | 自有 `px-page-*` | `sticky` 滿版返回列，必須貼齊視窗邊緣 |
| `BottomNav` | `max-w-[390px]` | 行動版固定底欄 |

---

## 8. Responsive rules

### 8.1 [現況]

- 使用 Tailwind 預設 breakpoint，未自訂。
- 實際使用密度：`lg:` 100 次 > `md:` 90 次 > `sm:` 61 次 > `xl:` 5 次 > `2xl:` 0 次。
- E2E viewport 基準：**Desktop 1440×900**、**Mobile 390×844（Pixel 5）**（`playwright.config.ts`）。

### 8.2 [規則]

| Breakpoint | 寬度 | 語意（本專案約定） |
| --- | --- | --- |
| （base） | < 640 | Mobile |
| `sm:` | ≥ 640 | 大手機 / 直立平板起 |
| `md:` | ≥ 768 | Tablet；**不再是任何角色的側欄斷點**（`UI-CONS-05`，2026-09-08） |
| `lg:` | ≥ 1024 | **Desktop；Admin／Creator／Buyer 的常駐側欄一律在此出現**、雙欄版面成立 |
| `xl:` | ≥ 1280 | 寬螢幕微調 |

- **Responsive 不是等比縮小。** 依 breakpoint 調整：**stacking → grouping → navigation → information density → CTA placement**。
- Mobile：主要 CTA 貼近拇指區或 sticky；Desktop：CTA 靠近其作用的內容。
- 表格在 mobile 應轉為 card list 或允許橫向捲動容器，**不得**讓整頁橫向捲動（`globals.css` 已設 `overflow-x: hidden`，這是保險，不是解法）。

### 8.2.1 [規則] Authenticated navigation contract（`UI-CONS-05`，Owner 產品決定，2026-09-08）

```text
< 1024   →  沒有常駐 authenticated sidebar
         →  必須有 drawer 觸發鈕（hamburger）
         →  主內容左偏移 = 0
>= 1024  →  常駐 sidebar 出現
         →  主內容左偏移 = 側欄實際寬度
```

**三個 authenticated 角色同一個斷點。** 買家原本用 `md:`（768），於是 768–1023 之間
買家有一條 240px 常駐側欄，而同寬度下 Admin／Creator 已經是 drawer —— 這是角色間的
accidental divergence，不是產品差異。

**禁止**在 `< lg` 保留「看不見卻仍佔寬度」的側欄偏移。這一條由
`tests/e2e/responsive-nav-contract.spec.ts` 在 768／1023／1024／1280／1440 實測
（側欄可見性、主內容左緣、水平溢出）。

`BottomNav` 不在這個契約裡 —— 它是買家／公開頁的行動版附加導覽，維持 `md:hidden`，
本輪未更動（產品上本來就需要，不為了收斂而刪除）。

### 8.2.2 [規則] Shared drawer behaviour（`UI-CONS-23`）

三個外殼共用 `components/layout/NavDrawer`。共用的是**行為**，不只是外觀：

| | 契約 |
| --- | --- |
| 語意 | `role="dialog"` ＋ `aria-modal="true"` ＋ 可及名稱 |
| 關閉 | `Escape`、關閉鈕、點遮罩 |
| 焦點 | 開啟時移到關閉鈕；**Tab 被關在面板內**；關閉後還給觸發鈕 |
| 背景 | scroll lock（記錄原值再還原，不寫死 `""`） |
| 寬度 | `min(18rem, 85vw)` —— 窄視窗仍留得下可點的遮罩 |
| 觸發鈕 | `aria-expanded` ＋ `aria-controls` 指向面板 `id` |

> **focus trap 在這裡是對的，在 `ConfirmAction` 是錯的**（§10.6）。判準是同一個：
> 有沒有宣告 `aria-modal`。宣告了就必須真的把焦點關住，否則等於告訴輔助技術
> 「背景是 inert」卻讓鍵盤走得出去；沒宣告的就不該關。

### 8.2.3 [規則] Role-intentional 例外

| 例外 | 角色 | 為什麼保留 |
| --- | --- | --- |
| 側欄收合（240 ↔ 72px，`localStorage` 記憶） | Buyer | 買家側欄項目多且常駐使用，收合成 icon rail 是這個角色的實際需求。**Admin／Creator 不需要跟進** —— 統一的是 responsive contract，不是角色功能 |
| `BottomNav` | Buyer／Public | 行動版主要導覽入口 |

收合寬度 `72px` 因此刻意留在 `components/dashboard/sidebar-constants.ts`，
**不上升為共用 shell 尺寸**；共用的只有展開寬度（見 §7.1）。

### 8.2.4 [規則] Navigation touch target（`UI-CONS-18` 的 navigation 子集）

導覽觸發鈕（hamburger、返回、購物車、搜尋、抽屜關閉）一律 **≥ 44×44**，
對應 `shell-constants.NAV_ICON_BUTTON_CLASS`（`size-11`）。

**本輪只收斂導覽 chrome。** FilterTabs、分頁、表格動作、創作者表單控制項仍有
36/40px 目標，留在 `UI-CONS-18` 後續 —— 因此該項仍是 PARTIAL。

### 8.3 [規則] Desktop density（明確要求）

在一般 Desktop、**100% browser zoom** 下，**不應**出現整體 UI 過度巨大、資訊密度過低。特別檢查：

- oversized cards（單卡佔滿首屏）
- oversized CTA（按鈕高度 > 60px 且無理由）
- oversized typography（內文 > 16px、標題 > 32px）
- excessive vertical spacing（區塊間距 > 48px）
- excessive empty space（首屏只放得下 1–2 個資訊單元）

### 8.4 [規則] First-screen usability

**登入、註冊、結帳、上傳憑證**等主要任務：關鍵輸入欄位與主要 CTA 應盡量可在**首屏**完成，不得為了視覺留白犧牲任務效率。

> **[現況]** `app/login/page.tsx`、`app/register/page.tsx` 的輸入框為 `h-14`、主 CTA 為 `h-[60px]`，屬於本節需要優先驗證的頁面。本輪不修。

### 8.5 [現況] 參考實作：Admin 待處理工作卡（`AdminTaskCard`）

這是目前 repo 內把 §8.2「Responsive 不是等比縮小」落實得最完整的例子 —— 同一個 component 在兩個斷點是**不同的組合方式**，不是同一版面的縮放。可作為後續 responsive composition 的參考。

| | Mobile（`< sm`） | Desktop（`sm` 以上） |
| --- | --- | --- |
| 版面 | **2 × 2 grid**（`grid-cols-2`） | `xl:grid-cols-4` 單列四張 |
| Header | icon 與 count 同列，title 落在第二列 | **icon + title 同列**（語意群組），count 靠右 |
| 說明文字 | **隱藏**（卡寬僅約 164px，描述會斷成兩行且斷點難看） | **保留** |
| 操作入口 | **整張卡可點**（覆蓋式 `<Link>`，觸控面積約 164×84） | **`前往處理` 按鈕**（`BrandCtaLink`） |
| 卡片高度 | 約 86px | 約 131px |

實作要點：

- **單一 DOM 結構**，用 `flex-wrap` + `order` + `w-full ↔ flex-1` 切換兩種 header，不複製兩份區塊。
- icon 與 count 皆 `shrink-0`、title `min-w-0 flex-1`：長標題換行時 count 不會被擠到下一行、icon 不會錯位。
- 兩個斷點**各只有一個連結是 `display` 可見的**（另一個 `hidden`），不會被輔助技術重複朗讀；mobile 覆蓋連結帶 `aria-label` 與 `focus-visible` 樣式。
- Desktop 層級：`icon + title / count` → description → CTA。

> **[規則]** 這類「mobile 整卡可點、desktop 顯示按鈕」的雙形態做法，必須確保**任一斷點只有一個可聚焦的連結**，且 mobile 覆蓋連結有 accessible name。不要用 `<div onClick>` 取代 `<Link>`。

---

## 9. Component canonical status

**Status 定義：** `canonical`（首選）／`reusable but incomplete`（可用但功能不足）／`duplicated`（同語意有多套）／`domain-only`（只在領域內）／`legacy`（Tamagui，凍結）／`missing`（canonical stack 沒有）。

| Component | Canonical 實作 | Location | Status | 現況說明 |
| --- | --- | --- | --- | --- |
| **Button** | `Button` | `components/ui/Button.tsx` | **canonical**（2026-09-05 Wave UI-2 起） | **API：`intent`(flow/action/neutral/danger) × `variant`(solid/outline/ghost) × `size`(sm/md/lg) ＋ `loading` ＋ `fullWidth`。顏色語意只由 `intent` 決定。** 舊的 9 值 `variant` 與「`intent` 靜默覆蓋 `variant`」已移除，**且未保留 legacy alias**（census：32 個呼叫點 0 個依賴預設值，`variant` 只用到 `outline`）。`loading` ＝ 真的 `disabled` ＋ `aria-busy` ＋ spinner，**文案由呼叫端決定**。仍有 legacy Tamagui `Button` **13 處**（`UI-CONS-10`）。裸 `<button>` 分類：A 合理 semantic **37**／B 應遷移 **75**／C design-system 內部 **9**〔M2〕。**`success` intent 於 Wave UI-3 加入（現為 5 值）；`ref` prop 於 Wave UI-5 補上型別**（React 19 起 `ref` 是一般 prop，`ConfirmAction` 需要它移動焦點）。**Wave UI-5 重測**〔M5〕：裸 `<button>` **123 → 105**、`<Button>` **45 → 59**、legacy Tamagui Button 檔數 **9 → 3** |
| **Confirm action** | `ConfirmAction` | `components/ui/ConfirmAction.tsx` | **canonical**（2026-09-08 Wave UI-5 起） | 高影響且實質不可逆動作的兩段式確認。**就地展開、不是 modal**，且**刻意不做 focus trap**（非 `aria-modal` 區域）；提供焦點移入／`Escape` 與取消送回觸發鈕／送出鎖兩層。**有必填理由的流程不得包進來**（理由輸入即確認）。目前 3 個 consumer：`MaterialReviewPanel` 核准上架、`app/admin/payment-proofs` 核准付款、`AccountFreezePanel` 解除凍結。政策見 §10.9 |
| **Card** | `Card` | `components/ui/Card.tsx` | **canonical** | `padding` × `level`，10 個 import 點，全走 `ds` token |
| **SurfaceCard** | `SurfaceCard` | `components/ds/SurfaceCard.tsx` | **duplicated** | Tailwind 版 **10 檔**使用（21 處 JSX）；**同名的 legacy Tamagui `SurfaceCard`** 另在 **2 檔**使用。兩者 API 不同（children-only vs `title`/`description`），**同名本身就是風險**〔M〕 |
| **Input** | `Input` | `components/ui/Input.tsx` | **canonical（低採用）** | 2026-09-05 Wave UI-2 **擴充非重寫**：`label` 改為選配、接上 `FormField` context、硬編碼 hex 換成 `ds` token。既有唯一 consumer `components/parent/SearchBar.tsx` **零修改**。legacy `InputField` 仍在 **3 檔／18 處 JSX**；裸 `<input>` **49**〔M2〕 |
| **Select** | `Select` | `components/ui/Select.tsx` | **canonical**（2026-09-05 Wave UI-2 起） | Tailwind ＋ `ds` token 的原生 `<select>`；label 由 `FormField` 負責。**注意：型別必須 `Omit` 掉原生的 `size`**（原生是數字＝可見選項列數，與視覺尺寸同名但語意不同）。使用點 **1**；裸 `<select>` 仍有 **16**〔M2〕 |
| **Textarea** | `Textarea` | `components/ui/Textarea.tsx` | **canonical**（2026-09-05 Wave UI-2 起） | 與 `Input` / `Select` 共用同一組 token 與 focus recipe。使用點 **1**；裸 `<textarea>` 仍有 **17**〔M2〕 |
| **FormField** | `FormField` | `components/ui/FormField.tsx` | **canonical**（2026-09-05 Wave UI-2 起） | label ＋ required ＋ help ＋ error ＋ **`aria-invalid` / `aria-describedby` 接線**。`useId()` 保證 id 唯一；同時支援 `cloneElement`（裸控制項也能受惠）與 context（`Input`/`Select`/`Textarea`）。**無 error 時不輸出 `aria-invalid`。** 使用點 **2**〔M2〕 |
| **IconButton** | `IconButton` | `components/ui/IconButton.tsx` | **canonical（尚無使用點）**（2026-09-05 Wave UI-2 起） | `label`（＝`aria-label`）為 **required prop**，型別強制；預設 **44×44**（§10.4）。**本輪只建立 recipe，未做全站 touch-target 遷移**（`UI-CONS-18`）。使用點 **0**〔M2〕 |
| **Chip** | `Chip` | `components/ui/Chip.tsx` | **canonical**（範圍窄） | 3 個引用點，`tone` 綁教材特色分類色 |
| **Badge / Status pill** | `StatusPill` | `components/ds/PageHeader.tsx` | **canonical**（2026-09-07 Wave UI-3 起） | tone 值域收斂為 `lib/status-tone.ts` 的 `StatusTone`（`neutral｜info｜success｜warning｜danger`）；legacy Tamagui `StatusBadge`（把 domain state 當 tone 的 12 值 union）**已刪除**。**15 檔**使用。仍有 **23 個就地手寫的 badge span** 待收斂〔M3〕 |
| ~~**Badge（舊列）**~~ | — | — | ~~**missing（元件層）**~~ | 仍無共用 Badge 元件。`RecentOrdersTable` 已直接以 `status.*` token 上色（`<span>` + classes，未抽元件）；其餘狀態徽章來自 legacy Tamagui `StatusBadge`（11 處） |
| ~~**Checkbox**~~ | — | ~~`components/ui/Checkbox.tsx`~~ | **已刪除（2026-09-05）** | **`UI-CONS-22` ／ Owner Decision 1：dead code，runtime／test／story／barrel consumer 皆為 0，已移除。** canonical stack 目前**沒有** Checkbox primitive；需要時依 §9 開頭的規則（≥ 3 個真實使用點）重建，並同步本表。全 app 的 checkbox 目前是裸 `<input type="checkbox">` |
| **Empty state** | `EmptyState` | `components/ds/StateViews.tsx` | **canonical（遷移中）** | Tailwind 版已建立（`feedback.*` token）。**遷移已大幅推進**：ds 版 **18 檔**、legacy Tamagui **11 檔**（原記「已改用者僅 2 檔／另有 20 檔 legacy」已過期）〔M〕 |
| **Loading state** | `LoadingState` | `components/ds/StateViews.tsx` | **canonical（遷移中）** | 同上：ds 版 **21 檔**、legacy Tamagui **7 檔**（原記 17 檔 legacy 已過期）；`role="status"` + `aria-live="polite"`，spinner 沿用 repo 既有 border-trick 慣例〔M〕 |
| **Error state** | `ErrorState` | `components/ds/StateViews.tsx` | **canonical（遷移中）** | 同上：ds 版 **22 檔**、legacy Tamagui **8 檔**（原記 18 檔 legacy 已過期）；`role="alert"`，紅色只用於 icon／標題／邊框，不做大面積紅底〔M〕 |
| **Skeleton** | — | — | **missing** | 4 個檔案各自手寫 `animate-pulse` |
| **Pagination** | `Pagination` | `components/ds/Pagination.tsx` | **canonical — 唯一實作**（2026-09-07 Wave UI-3 起） | 頁碼 + 省略號 + 每頁筆數。**三個實作已收斂為一個：** Tamagui `Pagination` 與 `components/parent/PaginationBar` 皆已刪除（consumer 歸零）。ds 版能完整表達原本的互動模型，且每頁筆數選單只在有傳 `onPageSizeChange` ＋ `pageSize` 時渲染，因此 buyer 端不會多出控制項；唯一可見差異是**多了頁碼**（ds 版既有能力）。**11 檔**使用〔M3〕 |
| **Search field** | `SearchField` | `components/ds/DataToolbar.tsx` | **canonical**（2026-08-22 起） | **送出制**（Enter／按鈕），不逐字 debounce —— 這些搜尋會打 server 並改寫 URL |
| **Filter tabs** | `FilterTabs` | `components/ds/DataToolbar.tsx` | **canonical**（2026-08-22 起） | 互斥狀態篩選 + 全表計數徽章。取代了先前四頁四種寫法（Tamagui `SelectField` / 兩顆 `Button` toggle / 裸 `<select>` / 四個 `InputField`） |
| **Data toolbar** | `DataToolbar` | `components/ds/DataToolbar.tsx` | **canonical**（2026-08-22 起） | 搜尋 + 篩選 + 次要控制項的容器 |
| **Page header** | `PageHeader` | `components/ds/PageHeader.tsx` | **canonical**（2026-08-22 起） | 標題階層 + 描述 + 右側動作 + breadcrumb。取代各頁就地寫死的 `text-2xl font-bold text-slate-900`。`Wave UI-4A`（2026-09-08）再遷入 8 個檔案，實測 **41 處**。**API 未擴充** —— STEP 3 逐頁檢視 8 個 migration candidate，`{title, description, action, breadcrumb}` 四個 prop 已足夠涵蓋全部，無 consumer 證據支持新增 prop |
| **Account page header** | `AccountPageHeader` / `AccountPageHeaderOrders` | `components/account/ProductAccountChrome.tsx` | **刻意分離**（`Wave UI-4A` 覆核，2026-09-08） | 帳號區 shell 專用：多一個 eyebrow、底部分隔線、以及行動版 `sr-only` → 桌機 `not-sr-only` 的標題切換。合併進 `PageHeader` 需新增約 4 個 prop 並改動版面，違反「API 擴充必須有 consumer 證據」；維持分離 |
| **Status pill** | `StatusPill` | `components/ds/PageHeader.tsx` | **canonical**（2026-08-22 起） | 以 `status.*` token 上色。與 legacy Tamagui `StatusBadge` 並存，新頁面用這個 |
| **Detail field / grid** | `DetailField` / `DetailGrid` | `components/ds/PageHeader.tsx` | **canonical**（2026-08-22 起） | 詳情頁的「標籤／值」列 |
| **Modal / Drawer** | `NavDrawer` / `NavDrawerTrigger` / `MobileNavBar` | `components/layout/NavDrawer.tsx` | **canonical（導覽用）**（2026-08-22 起） | Admin 與 Creator 的 mobile drawer 共用同一份行為（hamburger／ESC／scroll lock／focus／overlay／寬度）。**通用 modal 仍 missing**；legacy `AppDialog` 有 export 但零使用；`ParentAppShell` 的 drawer 尚未遷移 |
| **Tabs** | — | — | **domain-only** | `components/dashboard/CategoryTabs.tsx`、`components/parent/CategoryChips.tsx`、`app/orders/page.tsx` 各一套 |
| **Stepper** | — | — | **domain-only** | `components/checkout/CheckoutStepper.tsx`；`app/orders/page.tsx` 與 `MaterialDetailPurchasePanel` 另有各自的步驟視覺 |
| **KPI card** | `KpiCard` | `components/ds/KpiCard.tsx` | **canonical**（2026-09-07 Wave UI-3 起） | `AdminKpiCard` ＋ `reporting/StatCard` 合併而成，兩份 duplicate 已刪除。保留兩邊各自較好的一半：`comparison`（趨勢）＋ 長值降級。subtext 用 `ds-textMuted`（≈4.8:1），**不用** `ds-textSubtle`（≈2.5:1）。**2 檔**使用〔M3〕 |
| **Toast** | `GlobalToastHost` | `components/ui/GlobalToastHost.tsx` | **canonical** | 事件驅動（`window` event `tp:toast`），掛在 root layout |
| **Icons** | — | `components/ui/icons.tsx` + `lucide-react` | **duplicated** | 手寫 SVG（`IconMenu`/`IconSearch`/`IconCart`… 共 15 個）與 `lucide-react`（**4 檔**）並存〔M〕 |
| **CTA links** | `PrimaryCtaLink` / `BrandCtaLink` / `DangerCtaLink` / `AccentTextLink` | `components/ds/` | **canonical** | `<Link>` 型 CTA 用這些，不要把 `Button` 包進 `Link` |

> **〔M3〕Wave UI-3 重測（2026-09-07）：** 範圍與〔M2〕相同（`frontend/apps/web/{app,components}`，
> 排除 `components/ui/**`），單位為 JSX-instance 或「檔案數」（各處已標明）。
> **不可與〔M〕直接相減**（〔M〕未排除 primitive 層）。

> **〔M2〕Wave UI-2 重測（2026-09-05）：** 範圍 **`frontend/apps/web/{app,components}/**/*.tsx`，且排除 `components/ui/**`**
> —— primitive 自己的 `<button>` / `<select>` / `<textarea>` 是**實作**，不是「裸用法」，計進去會虛增缺陷數。
> 單位為 **JSX-instance（開頭標籤）**，不是行數也不是檔案數。
> **不可與〔M〕的數字直接相減** —— 〔M〕未排除 `components/ui/**`。

> **〔M〕量測範圍與方法（`UI SYSTEM 7-LAYER CONSISTENCY AUDIT`，2026-09-04 重測）**
>
> 標記〔M〕的數字全部重新量測過，範圍為 **`frontend/apps/web/{app,components}`，167 支 `.tsx`**。
> 「檔數」＝ 該符號的 import 來源解析後的檔案數（多行 import 也算得到）；
> 「處」＝ JSX instance 數（`grep -rhoE '<Name(\s|>|/|$)'`）；
> 裸 element 數同樣以 `(\s|>|/|$)` 結尾比對，因此**會涵蓋 `<button` 後直接換行的多行 JSX**。
>
> 〔M5〕**量測範圍**：`frontend/apps/web/{app,components}/**/*.tsx`（168 檔），單位＝**出現次數**，
> **已先移除 `/* */` 與 `//` 註解**（否則本輪新增的說明文字會被算成命中）。量測時間：Wave UI-5 完成後。
>
> **這一點與舊數字的口徑可能不同** —— 例如 Button 一列原記「65 個裸 `<button>`（32 檔）」，
> 本輪測得 123／55 檔。**本文件不主張舊值當時是錯的**：兩者可能只是量測方法不同
> （舊值疑似只比對 `<button ` 空格形式，會漏掉多行 JSX），且期間也有新頁面加入。
> 需要跨時間比較時，請以本註記的方法重跑，不要直接相減。
>
> 未標記〔M〕的敘述本輪**未重新量測**，維持原狀。

### [規則] Shell 尺寸只有一份定義

Admin 與 Creator 的側欄尺寸一律讀 `components/layout/shell-constants.ts`：

| 項目 | 值 | 常數 |
| --- | --- | --- |
| Desktop 側欄寬 | 240px（`layout-sidebar` token） | `SIDEBAR_DESKTOP_WIDTH_CLASS` |
| 主內容左偏移（`lg`） | 240px | `CONTENT_OFFSET_CLASS` |
| Mobile drawer 寬 | `min(18rem, 85vw)` | `DRAWER_WIDTH_CLASS` |
| 可捲動導覽區 | `min-h-0 flex-1 overflow-y-auto` | `SIDEBAR_NAV_SCROLL_CLASS` |

**Shell 尺寸一致，導覽內容可以不同。** 導覽項目比較多不是把 rail 加寬的理由 ——
用 spacing / truncation / tooltip 解決。

`SIDEBAR_NAV_SCROLL_CLASS` 的 `min-h-0` **不是保險**：flex item 的 `min-height` 預設是
`auto`（＝內容高度），少了它，可捲動區不會縮小，而是把整條側欄撐出視窗外。
詳見 `docs/mvp_rules.md` §23.1。

> **[規則] 發現 `missing` 不代表要立刻建立。** 只有當「目前這個 UI 任務真的需要它、且 ≥ 3 處會用」時才建立，並在同一個 PR 更新本文件。

---

## 10. Interaction / accessibility

### 10.1 [規則] 互動狀態

每個 interactive component 必須考慮：

| 狀態 | 要求 |
| --- | --- |
| `default` | — |
| `hover` | `transition-colors` 或 `transition-shadow`，約 150ms |
| `active` | 可與 hover 同色系加深；不要只靠 transform |
| `focus-visible` | **必須有可見 focus 樣式**，使用 `--ds-focus-ring`（= brand primary），offset 一致 |
| `disabled` | `disabled:pointer-events-none disabled:opacity-50`（`Button` 已內建） |
| `loading` | 適用時：鎖住重複送出，並保留可讀的狀態文字 |

### 10.2 [規則] Focus

- **不得**寫 `outline-none` 而沒有替代 focus 樣式。
- 允許的寫法：`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-focus focus-visible:ring-offset-2`。

> **[現況（2026-09-04 重測）]** 全 app 有 **10 處 `outline-none`**（原記 17；`A11Y-01` 已於 2026-08-30 收斂掉一部分）。
> 其中 **8 處已配 `focus-visible:ring-*`／`outline`，屬合規**；
> **仍有 2 個位置只以 1px 邊框變色表達焦點**：`app/login/page.tsx:143,162` 與 `app/register/page.tsx:138,156,173`
> 的輸入框寫 `outline-none … focus:border-[#…]`，**沒有** ring／outline 替代
> —— 由 tracker **`UI-CONS-20`（`P3`）** 追蹤。
> 對照：canonical `focus-visible:outline*` recipe 全 app **188 處**，由 `tests/e2e/focus-visible.spec.ts`
> 以 computed `outlineWidth` 行為型護欄保護（不斷言 class 字串）。
> ~~另 `components/ui/Checkbox.tsx` 仍用 `focus:ring-*`（`A11Y-02`）。~~
> **已於 2026-09-05 解除：** 該元件是 0 consumer 的 dead code，已隨 `UI-CONS-22`／Owner Decision 1 刪除，
> `A11Y-02` 同步 CLOSED。**它不是被修好，是隨死碼一起消失** —— 沒有殘留的 runtime focus 行為需要處理。〔M〕

### 10.3 [規則] Icon-only button

- **必須**有 accessible label（`aria-label` 或 visually-hidden text）。
- 必要時補 tooltip，但 tooltip **不能取代** `aria-label`。

> **[現況（2026-09-04 重測）]** **48 個檔案**含 `aria-label`（原記 34）；`MobileHeader` / `BottomNav` / `Sidebar` 的 icon 按鈕已有 label。新增 icon-only 控制項時必須沿用。〔M〕

### 10.4 [規則] 觸控目標（`UI-CONS-18`，Wave UI-7 更新）

```text
主要 mobile / touch 互動        →  >= 44×44 CSS px
密集 desktop-only 控制項        →  可以小於 44，但四個條件全部成立才行：
                                   1. 不是主要 mobile 互動
                                   2. 間距足以避免誤觸
                                   3. 鍵盤操作完整
                                   4. 例外有文件記錄
```

**不做機械式全站替換**（`h-10` → `h-11`、`size-10` → `size-11`）—— 逐類判斷。

**Wave UI-7 已收斂（10 個控制項）：** 購物車數量 ±／刪除（28／32px）、教材詳情返回／收藏／分享（36px）、
教材卡與商品卡的收藏（36px）、教材詳情縮圖捲動（36px）、登入頁密碼顯示切換（40px）、
買家首頁 hero CTA（32px）。

**已記錄的 desktop-density 例外：** 買家側欄的收合切換與 rail 控制項（`size-8` = 32px）——
該側欄自 Wave UI-6 起只在 `lg`（≥1024）出現，不是 mobile 互動，且四周有足夠間距。

**Wave UI-8 收尾（`UI-CONS-18` ✅ DONE）：** Admin／Creator 工作台的 `min-h-10` 密集控制項
（篩選 select、搜尋輸入、列表列展開、關閉鈕）全數提升為 `min-h-11`（**26 處／13 檔**），
其中包含 `components/ui/Button` 的 **`sm` 尺寸** —— 它是全站最後一個**系統性**的 sub-44 來源。
`sm` 仍是有意義的 compact 變體（水平內距與字級較小），只是不再低於觸控下限。
另補 `ds/RefreshControl` 的 40px 圖示鈕。

**最終僅存的例外（2 個，`components/dashboard/Sidebar`）：**

| 項目 | 值 |
| --- | --- |
| 路由 | 買家 `ParentAppShell` 的所有路由 |
| Viewport | **僅 `lg`（≥1024）** —— 1024 以下該側欄完全不渲染（Wave UI-6），因此不是行動端互動 |
| 控制項類型 | 側欄收合切換 / rail 控制項（非主要動作） |
| 週邊間距 | 位於側欄 header 右側，最近的可點目標距離 > 12px |
| 誤觸風險為何可接受 | 滑鼠／觸控板精度下 32px 充足；誤觸後果是「側欄收合」，可一鍵還原且無資料副作用 |

### 10.5 [規則] Auth 焦點（`UI-CONS-20`）

`/login`、`/register` 的每一個可聚焦控制項都必須有**看得見**的 focus 指示。

**Wave UI-7 修正：** 這兩頁原本有 10 處 `outline-none`；輸入框的替代是
`focus:ring-2 focus:ring-[#6D5CFF]/25` —— 25% 透明度疊在 `#FAFAFA` 上幾乎看不見，
等同沒有指示。現在全部改用 canonical recipe
`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus`，
品牌用的 `focus:border` / `focus:ring` 保留（**未改 auth 的品牌、插圖、版面或文案** —— 那是 `UI-CONS-21`）。

> **量測陷阱（本輪實測踩到）：** Chromium 即使 `outline-style: none` 也會回報
> `outlineWidth: "3px"`。只看寬度會讓每個元素都「通過」——
> `tests/e2e/accessibility-contract.spec.ts` 因此同時檢查 `outlineStyle`，並附負向控制。

### 10.6 [規則] Icon 可及性（`UI-CONS-24`）

**目標不是「全站只留一個 icon library」。** 多個來源（`lucide-react` 4 檔、
`components/ui/icons` 14 檔、inline `<svg>` 24 個、emoji 74 處）只要不造成可及性或
維護問題就可以並存。規則只管 accessibility：

| 類別 | 規則 |
| --- | --- |
| 裝飾性 icon | `aria-hidden` |
| 有文字標籤的控制項內的 icon | `aria-hidden`（名稱來自文字） |
| icon-only 控制項 | 名稱掛在**控制項**上（`aria-label`），不是 SVG `<title>`；用 `components/ui/IconButton`（`label` 為必填） |
| 語意性獨立圖形（圖表等） | `role="img"` ＋ 可及名稱，且**資料必須有文字替代** |

**Wave UI-7 實測：** icon-only 控制項缺名稱 **0**；`<svg>` 24 個中 23 個 `aria-hidden`、
1 個是 `role="img"` 的趨勢圖（正確，不該 hidden）。

趨勢圖另補了 `sr-only` 資料表格 —— 它的資料點原本**只有滑鼠可及**
（`onMouseEnter`／`onMouseLeave`，沒有 `tabIndex`／`onFocus`／`onKeyDown`），
`role="img"` 只說明「這是什麼圖」，沒有提供數值本身。

### 10.7 [規則] 表單驗證的 ARIA（`UI-CONS-04`）

| 情況 | 規則 |
| --- | --- |
| 欄位層級錯誤 | `aria-invalid="true"` ＋ `aria-describedby` 指向錯誤節點 |
| 同時有 help 與 error | `aria-describedby` 兩者都要包含 |
| 沒有錯誤 | **不得**留 `aria-invalid="false"` |
| 表單層級訊息 | `role="alert"` ＋ 送出鈕以 `aria-describedby` 連結；**不加 `aria-invalid`**（那會是假的欄位狀態） |

優先用 `FormField` / `Input` / `Select` / `Textarea`（它們已實作上表）；
但**若遷移會改動 business logic 或版面，只補 ARIA linkage，不強制重構**。

### 10.8 [規則] 其他

- 語意標籤優先：可點擊導頁用 `<Link>`，觸發動作用 `<button type="button">`，表單送出用 `type="submit"`。
- 表單控制項一律有 `<label htmlFor>` 或 `aria-label`。
- 圖片有意義時給 `alt`，純裝飾用 `aria-hidden`。
- 顏色不得是唯一的資訊載體（狀態要有文字）。

---

### 10.9 [規則] Confirmation policy（`UI-CONS-16`，Wave UI-5，2026-09-08）

**不是每個紅色按鈕都要跳確認。** 依「後果」分類，不依顏色：

| 類別 | 規則 | 本 repo 的實例 |
| --- | --- | --- |
| 高影響且**實質不可逆** | **必須確認**（`components/ui/ConfirmAction`） | 核准教材上架（寫入 `approved_file_id`、對買家開賣）、核准付款（訂單成立、發出下載授權）、解除帳號凍結 |
| 有**必填理由**的工作流決定 | **理由輸入本身就是確認**，不再加一層 yes/no | 退回修改、退回付款、凍結帳號、檢舉案件結案處置 |
| 可逆的流程狀態變更 | 不確認 | 檢舉案件「開始調查」（`open → investigating`） |
| 一般動作／導覽 | 不確認 | 加入購物車、移除購物車項目、篩選、換頁 |

購物車移除**刻意不確認**：買家自己的購物車、可從教材頁直接加回，加確認只是增加摩擦。

**`ConfirmAction` 是就地展開，不是 modal。** 理由寫在元件檔的註解裡：這個 repo 所有
consequential admin 流程本來就是就地展開，同一個面板裡「核准跳 modal、退回就地展開」
會是兩種互動模型；另建 modal 也等於再造一套 overlay／scroll-lock 實作。
**刻意不做 focus trap** —— trap 是 `aria-modal` 的行為，把焦點鎖在一個沒有宣告為 modal
的區域是 accessibility 反模式。實際提供的是焦點管理：展開時焦點移到確認鈕、
`Escape` 與取消都把焦點送回觸發鈕、送出中 `Escape` 不關閉。

送出鎖是兩層：`Button` 的 `loading` 會真的 `disabled` ＋ `aria-busy`，
另有內部 `submittingRef` 擋掉「呼叫端把 `loading` 設起來之前」那一個 tick 的第二次點擊。

### 10.10 [規則] Loading policy（`UI-CONS-19`）

非同步動作開始時，**一律**：

```text
loading = true
→ 按鈕真的 disabled（不是只有 aria）
→ aria-busy="true"
→ spinner 出現
→ 重複送出被擋掉
```

這一段由 `components/ui/Button` 一處實作，呼叫端只傳 `loading`。

**文案保留 contextual** —— `處理中…`／`送出中…`／`上傳中…` 依動作而定，不強求同一句；
但 spinner 位置、disabled 行為、busy 語意、送出鎖必須一致。loading 期間
**可及名稱不得變成空字串**（不能只剩 spinner）。

### 10.11 [規則] Disabled policy

只收斂**語意相同**的東西：

| 類別 | 規則 |
| --- | --- |
| canonical `Button` | 由 primitive 統一（`disabled` ＋ `disabled:` 樣式集中在一處） |
| 原生表單控制項（`<input disabled>` / `<select disabled>`） | **維持原生**，不包成 Button 風格 |
| 非按鈕複合元件 | 自行處理，但必須同時反映在 accessibility tree |
| legacy 手刻 | 逐波遷移，見 `UI-CONS-08` |

### 10.12 [規則] Active navigation policy（`UI-CONS-14`）

四個導覽（`AdminSidebar`／`CreatorSidebar`／`dashboard/Sidebar`／`BottomNav`）
的「目前所在」必須同時滿足：

1. `aria-current="page"`，且**恰好一個**；
2. 視覺訊號來自 `components/layout/nav-active.ts` 的同一組配方 ——
   底色 `bg-edu-primary/[0.12]`、前景 `text-edu-primary`、字重 `font-semibold`；
3. **不得只用顏色**表達 active。

版面可以不同（側欄是水平列、底欄是垂直 icon＋文字、收合側欄是純 icon），
因此 `rail` 變體多一條左側 accent 邊框，`compact` 變體沒有 —— 但三個訊號相同。

**route matching 不在這一層**：哪一項是 active 仍由各導覽自己判斷
（source-of-truth 收斂是 `UI-CONS-06`，未排程）。

---

## 11. Frontend working rules

後續每個 UI 任務必須遵循下列七條。

### 11.1 Composition-first

先處理 **container → grid → flex → hierarchy → alignment → gap**。
**不要**優先用 negative margin / `translate` / arbitrary position / pixel patch 修 layout。

處理 UI 問題的順序：**composition → spacing → tokens**。

### 11.2 Mobile-first

先確保 mobile composition 合理，再擴展 tablet / desktop。Responsive 不只是縮小（見 §8.2）。

### 11.3 Tokens-first

優先使用既有 semantic token（§4.2）。不得隨意新增 spacing magic number / arbitrary color / arbitrary radius / arbitrary shadow。

### 11.4 Reuse-first

新增 component 前**先搜尋 repository**。優先序：

1. `components/ui`
2. `components/ds`
3. existing domain pattern
4. 都沒有 → 才考慮新增（並確認 ≥ 3 處會用）

### 11.5 Scope discipline

UI 任務**不得順手修改**：business logic、API contract、database schema、authentication、payment logic、permissions、unrelated domain behavior。
除非該任務明確要求。

發現 scope 外的問題 → **停止並回報 root cause 與最小修法**，由使用者決定（`CLAUDE.md` §10.3）。

### 11.6 No broad refactor

不要因為改一個 UI，就順便 reorganize component tree / rename 大量檔案 / rewrite 無關的 shared component / migrate 整套 UI system。

### 11.7 Visual hierarchy first

視覺優先序：**hierarchy → readability → spacing → alignment → interaction clarity → decoration**。

不要靠大量 shadow / border / coloured background / gradient 製造層級。層級應該來自**尺寸、字重、留白與位置**。

### 11.8 [規則] 資料來源與授權邊界（來自 `docs/mvp_rules.md`，UI 任務同樣受約束）

這兩條不是 UI 規則，但**每個 UI 任務都可能踩到**，因此在此複述約束、細節仍以 `docs/mvp_rules.md` 為準。

**資料來源（`mvp_rules.md` §A）：**

- 可渲染為卡片／清單／統計／詳情的資料，**不得**由前端 hardcode 或 localStorage mock 供應。
- 前端只可保留**純展示文案**（標題、提示語、按鈕文案），不得保留會被誤認為業務資料的假內容。
- **API 失敗時顯示 error 或 empty state，不得退回前端假資料**——這直接決定 §9 的 Empty / Error state 要怎麼用。
- 做 UI 改版時，**不得**為了畫面好看而把真實 API 資料換成 placeholder；也不得把既有的 mock 「順手扶正」成真 API（那是 backlog，屬 scope 外，見 §11.5）。

**授權邊界：**

- `frontend/apps/web/middleware.ts` 讀 `tp_token` / `tp_role` cookie，是 **UX guard，不是授權**；cookie 非 HttpOnly、可被竄改。
- UI 任務**不得**依據這些 cookie 做任何資料存取判斷，也不得為了「讓畫面順一點」放寬導向邏輯。
- 唯一真正的授權邊界在 `Backend/middlewares/auth.js`。

---

## 12. Legacy / Tamagui boundary

### 12.1 [現況] Legacy 範圍（精確清單）

**Package：** `frontend/packages/ui`（`@teaching-platform/ui`）
匯出 8 組元件，**全部**基於 Tamagui：
`Button`、`InputField`、`SelectField`、`LoadingState` / `EmptyState` / `ErrorState`、`SurfaceCard` / `StatusBadge`、`AppDialog`、`Uploader`、`Pagination`，
外加 `designTokens`（第三套 token）與 `webTheme`。

**Runtime 掛載（全域，不能只刪頁面就移除）：**

- `app/layout.tsx` → `AppProviders`
- `app/providers.tsx` → `NextThemeProvider` + `TamaguiProvider`
- `tamagui.config.ts` → 以 `webTheme` 覆寫 light theme
- `next.config.ts` → `transpilePackages` + `react-native$ → react-native-web` alias
- `package.json` → `tamagui` / `@tamagui/*` / `react-native-web` / `react-native-svg` / `solito`

**仍使用 `@teaching-platform/ui` 的 25 個檔案：**

Admin（11）：`app/admin/activity-logs/page.tsx`、`app/admin/activity-logs/[id]/page.tsx`、`app/admin/materials/page.tsx`、`app/admin/materials/[materialId]/activity-logs/page.tsx`、`app/admin/materials/[materialId]/reports/page.tsx`、`app/admin/orders/page.tsx`、`app/admin/orders/[orderId]/activity-logs/page.tsx`、`app/admin/payment-proofs/page.tsx`、`app/admin/reports/page.tsx`、`app/admin/reviews-hub/page.tsx`、`app/admin/users/[userId]/activity-logs/page.tsx`

Teacher / Creator（5）：`app/teacher/materials/page.tsx`、`app/teacher/materials/new/page.tsx`、`app/teacher/materials/[id]/edit/page.tsx`、`app/teacher/materials/[id]/reviews/page.tsx`、`app/teacher/sales/page.tsx`
（`app/creator/**` 為上列的 re-export，非獨立實作）

Buyer / 公開（6）：`app/cart/page.tsx`、`app/downloads/page.tsx`、`app/favorites/page.tsx`、`app/materials/[id]/reviews/page.tsx`、`app/me/materials/[id]/feedback/page.tsx`、`app/my-reviews/page.tsx`

Shared components（3）：`components/parent/ExplorePage.tsx`、`components/parent/ParentHomePage.tsx`、`components/teacher/MaterialMediaFields.tsx`

（`components/admin/RecentActivityList.tsx`、`components/admin/RecentOrdersTable.tsx` 已於 2026-08-19 改用 `components/ds` 的 state，不再列入。）

（另有 `app/providers.tsx`、`tamagui.config.ts`、`next.config.ts` 直接依賴 `tamagui` / `@tamagui/*`。）

### 12.2 [規則] Boundary

| 動作 | 允許？ |
| --- | --- |
| 既有 27 檔繼續使用 Tamagui 元件 | **允許**（frozen，不強制改） |
| **新程式碼** import `@teaching-platform/ui` 或 `tamagui` | **禁止** |
| 在既有檔案**新增**一個原本沒有的 Tamagui import | **禁止**（請改用 Tailwind primitive） |
| 移除 `TamaguiProvider` / 拔 dependency | **本輪禁止**；需獨立 migration 任務 |
| 改 `frontend/packages/ui` 的元件實作 | **禁止**，除非明確授權（frozen） |
| import `designTokens`（`packages/ui/src/tokens.ts`） | **禁止**（已與 canonical token 漂移，見 §4.1） |

### 12.3 [方向] 未來 migration（**未排程**）

若日後要移除 Tamagui，最小順序建議為：

1. ~~補齊 `EmptyState` / `LoadingState` / `ErrorState`~~ → **已於 2026-08-19 建立於 `components/ds/StateViews.tsx`**（放 `ds` 而非 `ui`：三者為 surface + typography + 選用 action 的 composed pattern，且 `ErrorState` reuse `ui/Button`）。剩下的工作是把其餘 legacy 引用點逐步改過來：`EmptyState` 20 檔、`LoadingState` 17 檔、`ErrorState` 18 檔，合計 **55 個引用點**。
2. `StatusBadge` → 以既有 `status.*` Tailwind token 實作 Badge
3. `SelectField` / `InputField` → `components/ui`
4. ~~`Pagination` 統一~~ → **已於 2026-08-22 建立 canonical `components/ds/Pagination.tsx`**（頁碼 + 省略號 + 每頁筆數），Admin 四個清單頁已使用。剩下的工作是把 buyer 端的 `components/parent/PaginationBar` 與 legacy Tamagui `Pagination` 的引用點遷移過來。
5. 最後才拔 provider 與 dependency

**這是方向，不是承諾；未經授權不得執行。**

---

## 13. Visual QA workflow

每個 UI 實作任務原則上依此流程。

| Step | 動作 |
| --- | --- |
| **1. 盤點** | 讀目前頁面與 component hierarchy；確認要改的是 `ui` / `ds` / domain / page 哪一層 |
| **2. 計畫** | 提出 layout / composition plan（先講清楚 grid、stacking、hierarchy 怎麼變） |
| **3. 實作** | 依 §11 工作規則 |
| **4. 驗證** | 在 `frontend/` 執行 `npm run verify:web` |
| **5. 啟動** | 在 `frontend/` 執行 `npm run dev:web:3010`（Frontend **3010**；**不要**用 `npm run dev:web`，它是 3000，會撞 Backend） |
| **6. 檢視** | 至少 **Desktop** 與 **Mobile**；必要時 Tablet |
| **7. Screenshot / Visual QA** | 檢查 hierarchy / overflow / alignment / spacing / density / CTA prominence / navigation / responsive behavior |
| **8. 第二輪** | 依 QA 結果做 visual refinement，再跑一次 Step 4 |

**Verification script（repository 實際存在的 canonical script）：**

```bash
npm run verify:web
```

（在 `frontend/` 執行；= `lint:web && typecheck:web && build:web`）

**Viewport 基準**（與 `playwright.config.ts` 一致）：

| 裝置 | 尺寸 |
| --- | --- |
| Desktop | **1440 × 900** |
| Mobile | **390 × 844** |
| Tablet（選用） | 768 × 1024 |

Desktop 檢視必須在 **100% zoom** 下進行（§8.3）。

---

## 14. Definition of Done

**不要只以 `build passed` 視為 UI 完成。**

一個 UI 任務完成，必須同時滿足：

- [ ] `npm run verify:web` 通過（lint + typecheck + build 全綠）
- [ ] **Desktop layout 已實際檢視**（1440×900，100% zoom）
- [ ] **Mobile layout 已實際檢視**（390×844）
- [ ] 無明顯 overflow（頁面不橫向捲動；表格／長內容有自己的捲動容器）
- [ ] Hierarchy 合理（一個 `h1`；主要資訊優先於裝飾）
- [ ] Interaction states 合理（hover / focus-visible / disabled；必要時 loading）
- [ ] Visual QA 完成（§13 Step 7 的檢查項）
- [ ] Token / component 選用符合 §4、§9（無新增第三套 card / button）
- [ ] UI 文案通過 `docs/ui-role-naming-checklist.md`
- [ ] 未改動 business logic / API / 權限（§11.5）
- [ ] 若該頁有頁面級 spec（cart / buyer sidebar / materials detail），已同步更新

---

## 15. Known inconsistencies / deferred items

本節列出 audit 發現、**本輪未修**的問題。優先序是建議，實際排程由使用者決定。

### 15.1 High priority

| # | 問題 | 影響 |
| --- | --- | --- |
| H1 | **Tailwind 與 Tamagui 同頁混用**（27 檔），兩套 Button / SurfaceCard / Input 並存 | 視覺不一致、改一處不會同步；後續開發（含 AI）容易選錯 |
| H2 | ~~canonical stack 缺 Empty / Loading / Error state~~ → **元件已建立**（`components/ds/StateViews.tsx`，2026-08-19）。legacy 用量仍分布在多個檔案，且三者範圍不同：**`EmptyState` 20 檔、`LoadingState` 17 檔、`ErrorState` 18 檔（合計 55 個引用點）**，僅 2 檔已遷移 | 瓶頸已解除，但兩套 state 會並存直到遷移完成 |
| H3 | **`components/ui/Input` 幾乎沒被用**（1 個引用點），全 app 有 30 個裸 `<input>` + 4 檔 legacy `InputField` | 表單樣式、focus、錯誤訊息各頁不一致 |
| H4 | **login / register 自成一套視覺**（第二種品牌紫 `#6D5CFF` + 漸層 CTA + `h-14` 輸入框 + `h-[60px]` CTA） | 與 design token 脫節，且是 first-screen usability 風險最高的頁 |
| H5 | **Token 三來源漂移**（`globals.css` / `tailwind.config.ts` 寫死 hex / `packages/ui/tokens.ts`） | 改 token 不會全域生效 |

### 15.2 Medium priority

| # | 問題 |
| --- | --- |
| M1 | **Radius 尺度失控**：canonical `rounded-ds-card` 15 次，`rounded-2xl`/`rounded-xl` 合計 146 次 + 7 種任意值 |
| M2 | **Shadow 尺度失控**：`shadow-sm` 48 次 + 約 20 種任意 `shadow-[...]`，`ds` 三顆僅 14 次 |
| M3 | **content max-width 無共識**：8 種以上並存（§4.3 B7） |
| M4 | **`status.*` Tailwind token 使用面極窄**：目前僅 `RecentOrdersTable` 2 處；仍無 Tailwind Badge 元件。另 `status.pendingPayment` 這組 token 對比僅約 **2.3:1**（`#FF6B73` on `#FFE4E6`），未達 WCAG AA 4.5:1 —— 屬 token 數值問題，需另案決定是否調整 palette |
| M5 | **四套 page background 漸層**（§4.3 B2）；`--background` / `--foreground` 是孤兒 token |
| M6 | **`focus:` vs `focus-visible:` 不一致**（`Input`、`AgeFilter`、`SortDropdown`、`Topbar` 用 `focus:`） |
| M7 | **Pagination 兩套**（legacy Tamagui vs `components/parent/PaginationBar`） |
| M8 | **Icon 兩套**（手寫 `components/ui/icons.tsx` vs `lucide-react`） |
| M9 | **六個 shell**，各自定義背景與最大寬；`RoleShell` 493 行且混雜導覽設定與版面。（`AdminShell` 已於 2026-08-19 補上 mobile drawer） |
| M10 | **Typography scale 使用率部分收斂**（`UI-CONS-13`，`Wave UI-4A`）：application page title 已統一由 `PageHeader` 的 `text-h2` 提供、dead 的 `text-h1` 已移除；但 section／card 層仍大量使用 Tailwind 預設與 `text-[NNpx]`。剩餘未收斂 `<h1>` 已分類，見 §5.3 |

### 15.3 Low priority

| # | 問題 |
| --- | --- |
| ~~L1~~ | ~~`components/ui/Checkbox.tsx` **零使用**（保留，不刪）~~ → ✅ **已處置（2026-09-05，`UI-CONS-22` ／ Owner Decision 1）：檔案已刪除。** consumer census 為 runtime 0 ／ test 0 ／ story 0 ／ barrel 0 |
| L2 | legacy `AppDialog`、`Uploader` **零使用**（保留） |
| L2b | `components/admin/AdminQuickActions.tsx` **零使用**（2026-08-19 IA 調整後不再於 Dashboard render，檔案依指示保留）。其 4 個目的地全部與 Sidebar 重複，3 個與 KPI CTA 重複 |
| L3 | 無 z-index scale（`z-[80]`、`z-[1]` 等任意值） |
| L4 | 無 motion / duration token |
| L5 | 無 Skeleton 元件（4 檔各自 `animate-pulse`） |
| L6 | Tabs / Stepper 各有 2–3 套 domain 實作（尚未到抽象門檻，可先不動） |
| L7 | 無 dark mode；`NextThemeProvider.onChangeTheme` 是 no-op |
| L8 | `page-*` / `section-*` spacing alias 幾乎未被使用（8 次） |
| L9 | `frontend/apps/web/screenshots/all-ui/{desktop,mobile}` 目錄為空 — visual QA 產出未落地 |

### 15.4 [規則] 本節的用法

- 這是 **backlog，不是 TODO 授權**。修哪一項由使用者決定。
- 修任一項時：**一次一個 root cause**，不得把 H1–H5 併成一個「大整理」PR。
- 修完請回來更新本節與 §9 的 status。

---

## 16. 修訂紀錄

| 版本 | 日期 | 說明 |
| --- | --- | --- |
| v1.0 | 2026-08-19 | 初版：UI 架構盤點、design token audit（A/B/C）、component canonical status、Tamagui legacy boundary、frontend working rules、visual QA workflow 與 DoD |
| v1.1 | 2026-08-19 | 建立 canonical `EmptyState` / `LoadingState` / `ErrorState`（`components/ds/StateViews.tsx`），並在 `RecentOrdersTable` / `RecentActivityList` 驗證；同步更新 §9、§12.3、§15.1 H2 |
| v1.2 | 2026-08-19 | `RecentOrdersTable` 訂單 status badge 改用 canonical `status.*` token（`pendingPayment` / `approved`）；同步更新 §4.3 B10、§9 Badge、§15.2 M4（含 `status.pendingPayment` 對比不足之發現） |
| v1.3 | 2026-08-19 | Admin 兩張摘要卡（`RecentOrdersTable` / `RecentActivityList`）統一改用 `SurfaceCard` + `ds` token + `AccentTextLink`；Recent Orders 改欄寬策略消除 horizontal overflow；同步更新 §9 SurfaceCard |
| v1.5 | 2026-08-22 | Admin Operations UX Closure Epic：新增 canonical `Pagination` / `SearchField` / `FilterTabs` / `DataToolbar` / `PageHeader` / `StatusPill` / `DetailField`；`components/layout/NavDrawer` + `shell-constants` 統一 Admin 與 Creator 的 shell 尺寸與 mobile drawer 行為（含修正 Creator drawer 無法捲動的 root cause）；同步更新 §9 元件盤點、§9 Shell 尺寸規則、§12.3 backlog |
| v1.4 | 2026-08-19 | Admin Dashboard 首屏密度：`AdminTaskCard` / `AdminKpiCard` / `AdminQuickActions` 收斂內距與字級並全面改用 `ds` / `intent` token（硬編碼 hex 歸零），section 間距改用 `space-y-section-md`；摘要卡在 1280px 從 y=636 提前到 y=492；同步更新 §4.3 B5/B9、§15.2 M1 |
| v1.5 | 2026-08-19 | Admin Dashboard 改用 operations-first IA（proposal B）：順序改為 標題 → 待處理 KPI → 最近訂單/最近活動 → 統計；訂單左、活動右；Dashboard 不再 render `AdminQuickActions`。1280×560 下 Recent 從 y=496 提前到 **y=293**。同步更新 §15.3 |
| v1.6 | 2026-08-19 | `AdminShell` mobile navigation：`lg` 以下側欄改為 compact top bar + slide-in drawer + overlay（沿用 `ParentAppShell` 慣例），`AdminSidebar` 加 `variant` / `onNavigate`、共用同一份 navigation source。390px 下 Dashboard 內容起點 y=770 → **y=85**。同步更新 §7.1 Admin 列 |
| v1.7 | 2026-08-19 | Mobile Admin KPI refinement：`AdminTaskCard` 在 `< sm` 改為 2×2 compact —— 隱藏說明文字、隱藏 `前往處理` 按鈕、改為整張卡可點（覆蓋式 `<Link>` + `aria-label` + `focus-visible`）；`AdminDashboardPage` 於 mobile 縮小 h1 並隱藏副標。375×443 可視高度下完整可見 KPI 由 2 張增為 **4 張**。新增 §8.5 |
| v1.8 | 2026-08-19 | Desktop KPI header refinement：`AdminTaskCard` 在 `sm` 以上改為 **icon + title 同列、count 靠右**，層級由四層降為三層（`icon+title / count` → description → CTA），卡高 153 → **131px**；mobile 的 2×2 compact 組合完全不變。同步 §8.5 |
