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
| 圖示 | `lucide-react`（6 檔）+ 手寫 SVG `components/ui/icons.tsx` | 兩套並存 |
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
| **Text hierarchy** | `--ds-text-heading` / `-body` / `-muted` / `-subtle` | `text-ds-heading` / `text-ds-body` / `text-ds-textMuted` / `text-ds-textSubtle` |
| **Radius（卡片）** | `--ds-radius-card`（20px） | `rounded-ds-card` |
| **Shadow（卡片）** | `--ds-shadow-card` / `-soft` / `-hover` | `shadow-ds-card` / `shadow-ds-card-soft` / `shadow-ds-card-hover` |
| **Semantic — Button intent** | `intent.flow` / `action` / `neutral` / `danger` | 透過 `Button` 的 `intent` prop，**不要**直接寫 `bg-intent-*` |
| **Semantic — Status（8 組 bg/text 成對）** | `status.*Bg` / `status.*Text` | `bg-status-draftBg text-status-draftText` … |
| **Semantic — Feedback（loading/empty/error）** | `feedback.*` | `text-feedback-loadingText`、`bg-feedback-errorBg` … |
| **Focus** | `--ds-focus-ring`（= brand primary） | `ring-ds-focus` / `outline-ds-focus`、`ring-offset-ds` |
| **Layout：content max-width** | 768 / 1024 / 1280 | `max-w-narrow` / `max-w-normal` / `max-w-wide` |
| **Layout：page padding** | 16 / 24 / 32 | `px-page-mobile` / `px-page-tablet` / `px-page-desktop` |
| **Layout：section rhythm** | 16 / 24 / 32 / 48 | `gap-section-sm` / `-md` / `-lg` / `-xl` |
| **Layout：sidebar** | 240px 展開 / 72px 收合 | `w-layout-sidebar`、`SIDEBAR_WIDTH_*` 常數 |
| **Typography scale** | h1 / h2 / h3 / title / body / meta / caption | `text-h1` … `text-caption` |
| **Breakpoints** | Tailwind 預設 | `sm:` `md:` `lg:` `xl:` `2xl:` |

### 4.3 B. Duplicate / Inconsistent（已存在的重複，本輪只記錄）

| # | 問題 | 實測證據 |
| --- | --- | --- |
| B1 | **兩套視覺語言並存**：`edu`（探索／行銷，page bg `#F4F1FF`）vs `ds`（commerce／account，page bg `#F4F5FA`） | `tailwind.config.ts` 同時定義 `edu.page` 與 `ds.page` |
| B2 | **四套 page background**：`globals.css` `body` 的 `#FFF8EF→#FFFDF9` 漸層、`AppShell` 的 `#F4F1FF→#FAF8FF→#F4F1FF`、`AdminShell` 的 `#F4F1FF→white→#F4F1FF`、`AuthSplitLayout` 的 `#F4F1FF→#FAF8FF→#FFF8EF` | 4 個 shell 各寫各的 |
| B3 | **`--background` / `--foreground`（`#fffaf5` / `#4f3a2d`）是孤兒 token**：`globals.css` 定義但幾乎無人使用，`body` 反而寫死漸層 | `globals.css` |
| B4 | **三種品牌紫**：`#6C63FF`（78 次）、`#6D5CFF`（31 次，僅 login/register）、CTA 漸層 `#7C3AED→#6366F1` | login/register 自成一套視覺 |
| B5 | **Radius 尺度失控**：canonical `rounded-ds-card`(20px) 15 次（2026-08-19 admin dashboard 改動後）；`rounded-2xl`(16) 74 次、`rounded-xl`(12) 72 次、`rounded-3xl`(24) 27 次，另有 `rounded-[10px/14px/16px/18px/20px/28px/32px]` 任意值 | 全 app grep |
| B6 | **Shadow 尺度失控**：`shadow-sm` 48 次、`ds` 三顆合計 14 次，另有約 20 種不同的任意 `shadow-[...]` | 全 app grep |
| B7 | **content max-width 無共識**：token alias `max-w-wide` 僅 3 次，實際主力是 `max-w-6xl`(17)、`max-w-2xl`(14)、`max-w-7xl`(9)、`max-w-5xl`(7)，另有 `max-w-[1440px]`(5)、`max-w-[720px]`(5) 等 8 種以上任意值 | 全 app grep |
| B8 | **page padding token 幾乎沒被用**：`px-page-*` 合計 8 次；實際是 `px-3`(86)、`px-4`(66)、`px-5`(29)、`px-6`(19) | 全 app grep |
| B9 | **硬編碼 hex 廣泛存在**：62 個檔案含 6 位 hex（原 67，admin dashboard 三個 card component 已清零）；最集中為 `app/register/page.tsx`(52)、`app/checkout/page.tsx`(45)、`components/layout/RoleShell.tsx`(40)、`app/login/page.tsx`(39) | 全 app grep |
| B10 | **`status.*` Tailwind token 幾乎沒被用**：2026-08-19 起 `RecentOrdersTable` 已改用 `status.pendingPayment*` / `status.approved*`，但全 app 也僅此 2 處；其餘狀態徽章仍來自 legacy Tamagui `StatusBadge` | 全 app grep |
| B11 | **Token 三來源漂移**（見 §4.1） | `tokens.ts` vs `tailwind.config.ts` |

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

### 5.1 [現況]

- 字型堆疊：`var(--font-noto), var(--font-inter), ui-sans-serif, system-ui, sans-serif`（`app/layout.tsx` inline style）。
- Tailwind scale（canonical，`tailwind.config.ts`）：

| Class | Size / Line-height / Weight | 用途 |
| --- | --- | --- |
| `text-h1` | 32 / 40 / 700 | 頁面主標題 |
| `text-h2` | 24 / 32 / 700 | 區塊標題 |
| `text-h3` | 20 / 28 / 700 | 卡片／小區塊標題 |
| `text-title` | 16 / 24 / 600 | 卡片標題、表頭 |
| `text-body` | 14 / 22 / 400 | 內文 |
| `text-meta` | 12 / 18 / 500 | Meta 標籤 |
| `text-caption` | 11 / 16 / 500 | 密集輔助文字 |

- **[現況]** 這套 scale 實際使用率偏低，多數頁面直接用 `text-sm` / `text-base` / `text-2xl` 等 Tailwind 預設，另有 `text-[15px]`、`text-[11px]`、`md:text-[1.75rem]` 等任意值（例：`components/account/ProductAccountChrome.tsx`）。

### 5.2 [規則]

- 一頁只有一個 `h1`；區塊用 `h2` / `h3`。
- 語意標籤與視覺尺寸分開：需要小標題視覺但語意是 `h3` 時，用 `<h3 className="text-title">`，不要降級成 `<div>`。
- 新程式碼**優先**用 `text-h1`…`text-caption`；用 Tailwind 預設尺寸可接受，但**不要新增任意 `text-[NNpx]`**。
- 中文行高不得低於 1.4；`leading-relaxed` / `leading-snug` 依密度選用。

---

## 6. Spacing

### 6.1 [現況]

- Base scale = Tailwind 預設 4px 網格。
- 專案 alias（`tailwind.config.ts` `spacing`）：`page-mobile/tablet/desktop` = 16/24/32、`section-sm/md/lg/xl` = 16/24/32/48、`layout-sidebar` = 240px。
- **[現況]** alias 使用率極低（`px-page-*` 合計 8 次），實務上是直接寫 `px-4` / `gap-4` / `space-y-6`。

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
| `ParentAppShell` | `components/dashboard/ParentAppShell.tsx` | Buyer 登入後（sidebar + topbar + 徽章同步） | 由 Sidebar/Topbar 決定 |
| `AdminShell` | `components/admin/AdminShell.tsx` | Admin | `#F4F1FF→white→#F4F1FF` |
| `AuthSplitLayout` | `components/layout/AuthSplitLayout.tsx` | login / register 雙欄 | `#F4F1FF→#FAF8FF→#FFF8EF` |
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
- **Page horizontal padding**：`px-4 sm:px-6 lg:px-8`（= 16 / 24 / 32，與 `page-*` token 對齊）。
- **Section vertical rhythm**：區塊間 `gap-6`（24）為預設，大分段 `gap-8`~`gap-12`（32–48）。
- **Card density**：卡片內距用 `Card` 的 `padding` 變體（`sm`=p-4 / `md`=p-5 / `lg`=p-6 md:p-8），不要在 page 內另寫。
- **不要**用 `margin` hack 做左右欄主對齊；雙欄用同一個 grid container（購物車已如此：`1fr 360px` + `align-items:start`）。

### 7.3 [方向] Content max-width（**目前不一致，尚未收斂**）

**[現況]** 共 8 種以上寬度並存（§4.3 B7）。

**[方向] 建議 canonical（尚未套用，不得當作已完成）：**

| 場景 | 建議 |
| --- | --- |
| 表單 / 單欄閱讀（登入、註冊、上傳憑證） | `max-w-narrow`（768） |
| 一般內容頁（訂單、下載、我的回饋） | `max-w-normal`（1024） |
| 列表 / 儀表板 / 教材探索 | `max-w-wide`（1280） |
| Admin 全寬工作台 | 現況 `max-w-[1440px]`，**例外，保留** |

**Existing exceptions（保留，不在本輪改）：** `AdminShell` 的 `max-w-[1440px]`、`MobileHeader` 的 `max-w-[1440px]`、`BottomNav` 的 `max-w-[390px]`、`AuthSplitLayout` 的 `max-w-7xl` + `max-w-md`。

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
| `md:` | ≥ 768 | **Tablet；Buyer 側欄開始出現** |
| `lg:` | ≥ 1024 | **Desktop；Admin 側欄固定、雙欄版面成立** |
| `xl:` | ≥ 1280 | 寬螢幕微調 |

- **Responsive 不是等比縮小。** 依 breakpoint 調整：**stacking → grouping → navigation → information density → CTA placement**。
- Mobile：主要 CTA 貼近拇指區或 sticky；Desktop：CTA 靠近其作用的內容。
- 表格在 mobile 應轉為 card list 或允許橫向捲動容器，**不得**讓整頁橫向捲動（`globals.css` 已設 `overflow-x: hidden`，這是保險，不是解法）。

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
| **Button** | `Button` | `components/ui/Button.tsx` | **duplicated** | Tailwind 版有 `intent`(4) + legacy `variant`(9)。另有 legacy Tamagui `Button` 在 8 個檔案使用；全 app 另有 **65 個裸 `<button>`（32 檔）** |
| **Card** | `Card` | `components/ui/Card.tsx` | **canonical** | `padding` × `level`，10 個 import 點，全走 `ds` token |
| **SurfaceCard** | `SurfaceCard` | `components/ds/SurfaceCard.tsx` | **duplicated** | Tailwind 版 5 個 import 點（含 admin 兩張摘要卡，2026-08-19 起）；**同名的 legacy Tamagui `SurfaceCard`** 另在 3 個 teacher 頁使用 |
| **Input** | `Input` | `components/ui/Input.tsx` | **duplicated / 嚴重低用** | **僅 1 個 import 點**（`components/parent/SearchBar.tsx`）。legacy `InputField` 在 4 檔使用；全 app 另有 **30 個裸 `<input>`（13 檔）**。實作內含硬編碼 hex |
| **Select** | — | — | **missing** | canonical stack 無此 primitive。legacy `SelectField` 5 檔；裸 `<select>` 在 `AgeFilter` / `SortDropdown` |
| **Chip** | `Chip` | `components/ui/Chip.tsx` | **canonical**（範圍窄） | 3 個引用點，`tone` 綁教材特色分類色 |
| **Badge** | — | — | **missing（元件層）** | 仍無共用 Badge 元件。`RecentOrdersTable` 已直接以 `status.*` token 上色（`<span>` + classes，未抽元件）；其餘狀態徽章來自 legacy Tamagui `StatusBadge`（11 處） |
| **Checkbox** | `Checkbox` | `components/ui/Checkbox.tsx` | **reusable but incomplete（零使用）** | 存在但全 app **無任何 import**。本輪不刪 |
| **Empty state** | `EmptyState` | `components/ds/StateViews.tsx` | **canonical（遷移中）** | Tailwind 版已建立（`feedback.*` token）。已改用者僅 `components/admin/RecentOrdersTable` / `RecentActivityList` 兩檔；**另有 20 檔仍 import legacy Tamagui `EmptyState`** |
| **Loading state** | `LoadingState` | `components/ds/StateViews.tsx` | **canonical（遷移中）** | 同上，**另有 17 檔仍為 legacy**；`role="status"` + `aria-live="polite"`，spinner 沿用 repo 既有 border-trick 慣例 |
| **Error state** | `ErrorState` | `components/ds/StateViews.tsx` | **canonical（遷移中）** | 同上，**另有 18 檔仍為 legacy**；`role="alert"`，紅色只用於 icon／標題／邊框，不做大面積紅底 |
| **Skeleton** | — | — | **missing** | 4 個檔案各自手寫 `animate-pulse` |
| **Pagination** | `Pagination` | `components/ds/Pagination.tsx` | **canonical**（2026-08-22 起） | 頁碼 + 省略號 + 每頁筆數。Admin 四個清單頁使用。legacy：Tamagui `Pagination`（僅上一頁／下一頁）與 `components/parent/PaginationBar`（buyer 端，尚未遷移）**不得**在新頁面使用 |
| **Search field** | `SearchField` | `components/ds/DataToolbar.tsx` | **canonical**（2026-08-22 起） | **送出制**（Enter／按鈕），不逐字 debounce —— 這些搜尋會打 server 並改寫 URL |
| **Filter tabs** | `FilterTabs` | `components/ds/DataToolbar.tsx` | **canonical**（2026-08-22 起） | 互斥狀態篩選 + 全表計數徽章。取代了先前四頁四種寫法（Tamagui `SelectField` / 兩顆 `Button` toggle / 裸 `<select>` / 四個 `InputField`） |
| **Data toolbar** | `DataToolbar` | `components/ds/DataToolbar.tsx` | **canonical**（2026-08-22 起） | 搜尋 + 篩選 + 次要控制項的容器 |
| **Page header** | `PageHeader` | `components/ds/PageHeader.tsx` | **canonical**（2026-08-22 起） | 標題階層 + 描述 + 右側動作。取代各頁就地寫死的 `text-2xl font-bold text-slate-900` |
| **Status pill** | `StatusPill` | `components/ds/PageHeader.tsx` | **canonical**（2026-08-22 起） | 以 `status.*` token 上色。與 legacy Tamagui `StatusBadge` 並存，新頁面用這個 |
| **Detail field / grid** | `DetailField` / `DetailGrid` | `components/ds/PageHeader.tsx` | **canonical**（2026-08-22 起） | 詳情頁的「標籤／值」列 |
| **Modal / Drawer** | `NavDrawer` / `NavDrawerTrigger` / `MobileNavBar` | `components/layout/NavDrawer.tsx` | **canonical（導覽用）**（2026-08-22 起） | Admin 與 Creator 的 mobile drawer 共用同一份行為（hamburger／ESC／scroll lock／focus／overlay／寬度）。**通用 modal 仍 missing**；legacy `AppDialog` 有 export 但零使用；`ParentAppShell` 的 drawer 尚未遷移 |
| **Tabs** | — | — | **domain-only** | `components/dashboard/CategoryTabs.tsx`、`components/parent/CategoryChips.tsx`、`app/orders/page.tsx` 各一套 |
| **Stepper** | — | — | **domain-only** | `components/checkout/CheckoutStepper.tsx`；`app/orders/page.tsx` 與 `MaterialDetailPurchasePanel` 另有各自的步驟視覺 |
| **Pagination** | — | — | **duplicated** | legacy Tamagui `Pagination`（6 檔）vs `components/parent/PaginationBar.tsx`（1 檔） |
| **Toast** | `GlobalToastHost` | `components/ui/GlobalToastHost.tsx` | **canonical** | 事件驅動（`window` event `tp:toast`），掛在 root layout |
| **Icons** | — | `components/ui/icons.tsx` + `lucide-react` | **duplicated** | 手寫 SVG（`IconMenu`/`IconSearch`/`IconCart`…）與 `lucide-react`（6 檔）並存 |
| **CTA links** | `PrimaryCtaLink` / `BrandCtaLink` / `DangerCtaLink` / `AccentTextLink` | `components/ds/` | **canonical** | `<Link>` 型 CTA 用這些，不要把 `Button` 包進 `Link` |

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
詳見 `docs/mvp_rules.md` §22.1。

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

> **[現況]** 全 app 有 **17 處 `outline-none`**。多數（如 `app/login/page.tsx:151`、`app/register/page.tsx:210`）已配 `focus-visible:ring-*`，屬合規；
> 但 `components/ui/Input.tsx:20`、`components/parent/AgeFilter.tsx:26`、`components/parent/SortDropdown.tsx:30`、`components/dashboard/Topbar.tsx:88` 等使用 **`focus:`（非 `focus-visible:`）**，鍵盤與滑鼠行為不分。**本輪只記錄，不修。**

### 10.3 [規則] Icon-only button

- **必須**有 accessible label（`aria-label` 或 visually-hidden text）。
- 必要時補 tooltip，但 tooltip **不能取代** `aria-label`。

> **[現況]** 34 個檔案含 `aria-label`；`MobileHeader` / `BottomNav` / `Sidebar` 的 icon 按鈕已有 label。新增 icon-only 控制項時必須沿用。

### 10.4 [規則] 觸控目標

- Mobile 可點擊區域 **≥ 44×44 CSS px**（現況 `size-10` = 40px 的 header 按鈕屬臨界值，新元件請用 `size-11` 或加 padding）。
- 不得為了 compact 把 mobile 目標縮到難以操作。

### 10.5 [規則] 其他

- 語意標籤優先：可點擊導頁用 `<Link>`，觸發動作用 `<button type="button">`，表單送出用 `type="submit"`。
- 表單控制項一律有 `<label htmlFor>` 或 `aria-label`。
- 圖片有意義時給 `alt`，純裝飾用 `aria-hidden`。
- 顏色不得是唯一的資訊載體（狀態要有文字）。

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
| M10 | **Typography scale 使用率低**：`text-h1`…`text-caption` 常被 Tailwind 預設與 `text-[NNpx]` 取代 |

### 15.3 Low priority

| # | 問題 |
| --- | --- |
| L1 | `components/ui/Checkbox.tsx` **零使用**（保留，不刪） |
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
