# Frontend UI Architecture & Engineering Guide

本文件定義 **Next.js App Router** 前端的元件分層、設計 token 選用、卡片／按鈕約定與實作原則。  
**產品可驗收行為**仍以 `docs/teaching-platform-mvp-spec-v1.4.md` 與各功能 spec 為準；本文件不取代 API 契約。

**版本：** v1.0（2026-05-20）  
**實作對照：** `frontend/apps/web/`

---

## 1. 相關文件地圖

| 文件 | 用途 |
| --- | --- |
| `docs/design-tokens-v1.1.md` | 色票、radius、shadow、typography、Button/Card token 規格 |
| `docs/page-token-usage-mapping-v1.1.md` | 關鍵頁面的 intent / card level / feedback 對照 |
| `docs/cart-ui-guidelines.md` | 購物車頁像素級規範（易漂移頁面範例） |
| `docs/buyer-sidebar-ui-spec.md` | 購買者桌面側邊欄展開／收合、toggle、icon rail |
| `docs/ui-role-naming-checklist.md` | UI 文案：去系統角色標籤 |
| `docs/teaching-platform-mvp-spec-v1.4.md` | MVP 產品／API／少數 UI 契約（timeline、回饋入口等） |
| `docs/mvp_rules.md` | 前端資料來源、角色邊界 |

新增或改版 UI 時：**先查 MVP／功能 spec → 再依本文件選元件與 token → 高風險頁可另寫頁面級 guideline。**

---

## 2. 技術棧與目錄約定

- **框架：** Next.js App Router、React、TypeScript、Tailwind CSS  
- **樣式來源：** `app/globals.css`（CSS variables）+ `tailwind.config.ts`（`ds`、`edu`、`intent`、`status` 等 theme keys）

### 2.1 元件分層（由底到上）

```
app/                          # 路由、資料取得、頁面組裝（薄）
components/ui/                # 無領域語意的 primitives（Button, Input, Card, Chip…）
components/ds/                # 設計系統複合件（SurfaceCard, CTA links…）
components/layout/            # AppShell、RoleShell、導覽
components/{domain}/          # materials, cart, admin, parent, reviews…
```

**原則：**

- **Composition over monolith：** 頁面只做 fetch + 組裝；重複區塊抽到 domain 或 `ds/`。
- **Preserve business logic：** 樣式／結構重構不得順手改 API 契約或權限判斷。
- **Avoid duplicated UI logic：** 同一 card 外框、空狀態、篩選列不得在多頁 copy-paste Tailwind 長字串。

---

## 3. Token 家族：何時用哪一套

專案存在兩套視覺語言，**新功能必須依場景選一主軸**，避免同一頁混用硬編碼 hex 與不同 radius。

### 3.1 `edu` / 全域 `--color-*`（探索／行銷向）

| 適用場景 | 範例 |
| --- | --- |
| 家長首頁、探索、溫暖漸層背景 | `ParentHomePage`、`Hero`、部分 `MaterialCard` |
| 舊版大圓角行銷卡 | `--radius-card-*`（24–32px） |

Tailwind：`edu.*`、`intent.*`、`rounded-card-*`、`shadow-card-*`  
CSS：`--color-brand-*`、`--color-intent-*`、`--radius-card-*`

### 3.2 `ds` / `--ds-*`（帳戶／commerce／後台列表）

| 適用場景 | 範例 |
| --- | --- |
| 購物車、結帳、訂單、下載、我的回饋 | `cart`、`checkout`、`downloads` |
| Creator/Teacher 教材管理、銷售 | `teacher/materials`、`creator/materials` |
| Admin dashboard 卡片 | `AdminKpiCard`、列表容器 |

Tailwind：`bg-ds-page`、`bg-ds-surface`、`border-ds-border`、`text-ds-heading`、`rounded-ds-card`、`shadow-ds-card`  
CSS：`--ds-*`（見 `design-tokens-v1.1.md` §2.6）

### 3.3 選用決策表

| 問題 | 建議 |
| --- | --- |
| 是否為「交易／庫存／訂單／管理」流程？ | **以 `ds` 為主** |
| 是否為「逛教材、首頁推薦」？ | **以 `edu` 為主** |
| 新區塊需要 card 外框？ | 先選 §4 的 `Card` 或 `SurfaceCard`，**不要**在 page 內寫 `rounded-xl border shadow-sm` |
| 需要 CTA？ | 用 `Button` 的 `intent`，或 `components/ds/*CtaLink` |

**禁止：** 在 `components/ui` 或 `components/ds` 以外新增「第三套」card 圓角；若 token 不足，先擴充 `globals.css` / `tailwind.config.ts`。

---

## 4. 卡片：`Card` vs `SurfaceCard`（統一決策）

目前兩個 primitive 並存，**職責已分工**，新程式碼請依下表選用，勿再發明第三種 card wrapper。

| 元件 | 路徑 | Token | 何時使用 |
| --- | --- | --- | --- |
| **`Card`** | `components/ui/Card.tsx` | `ds`（`rounded-ds-card`、`border-ds-border`、`shadow-ds-card`） | 需要 **padding 變體**（`none`/`sm`/`md`/`lg`）或 **level**（`elevated`/`default`/`flat`）的內容區塊；與 `page-token-usage-mapping` 的 card level 一致 |
| **`SurfaceCard`** | `components/ds/SurfaceCard.tsx` | `ds` | 只需 **表面 + 邊框 + 陰影**，padding 由子元素控制；`elevation="interactive"` 用於可 hover 的列表卡 |
| **行銷大圓角** | 領域元件內（如 `MaterialCard`） | `edu` / `--radius-card-*` | **僅**探索／首頁商品展示；不套用到 cart、訂單、後台 |

### 4.1 Level 對照（`Card`）

| `level` | 視覺 | 典型用途 |
| --- | --- | --- |
| `elevated` | 較強陰影 | 重點表單、登入卡、強調區塊 |
| `default` | 標準 `shadow-ds-card` | 列表外層、設定區 |
| `flat` | 淺底 `bg-ds-surfaceSubtle` | 篩選列、工具列背景 |

### 4.2 遷移原則

- 新頁面（commerce / account / admin）：**禁止**使用 `--radius-card-default`（28px）除非該頁屬探索行銷流。
- 既有頁面改版：優先改為 `Card` / `SurfaceCard` + `ds` token，**不要**順便改業務 layout grid。
- 需像素級鎖定的頁（如購物車）：維護獨立 `docs/*-ui-guidelines.md`，並引用本文件 §4。

---

## 5. 按鈕：`Button` intent 與 variant

**實作：** `components/ui/Button.tsx`

### 5.1 優先使用 `intent`（語意）

| Intent | 用途 | 對應 variant |
| --- | --- | --- |
| `flow` | 主流程 CTA：結帳、建立訂單、登入、送出證明 | `flow` |
| `action` | 管理／篩選／發布／次要操作 | `action` |
| `neutral` | 返回、取消、輔助 | `neutral` |
| `danger` | 刪除、拒絕、停用 | `danger` |

```tsx
<Button intent="flow">前往結帳</Button>
<Button intent="action">篩選</Button>
```

### 5.2 Legacy `variant`（相容）

`primary` ≈ `flow`，`secondary` ≈ `action`。**新程式碼請寫 `intent`**，避免 `variant="primary"` 與 `intent` 並存造成歧義。

### 5.3 連結型 CTA

若為 `<Link>` 而非 `<button>`，使用 `components/ds/` 下對應 CTA link（`PrimaryCtaLink`、`BrandCtaLink` 等），**不要**把 `Button` 包在 `Link` 內（a11y 與語意不佳）。

---

## 6. 其他 Primitives

| 元件 | 路徑 | 約定 |
| --- | --- | --- |
| `Input` | `components/ui/Input.tsx` | 表單一律經此元件；聚焦環使用 brand primary；**新改動應改為 `text-ds-heading` / `border-ds-border`，避免新增硬編碼 hex** |
| `Chip` | `components/ui/Chip.tsx` | 教材特色 tag；`tone` 對應 `materialFeatures` 分類色 |
| `Checkbox` | `components/ui/Checkbox.tsx` | 與表單同頁時 spacing 跟隨 `Input` 的 `gap-1.5` 節奏 |

**Feedback（Loading / Empty / Error）：** 使用 `feedback.*` token；各頁對照見 `page-token-usage-mapping-v1.1.md`。

**Status badge：** 必須使用 `status.*` 成對 bg/text token，見 `design-tokens-v1.1.md` §2.4。

---

## 7. 版面、RWD 與互動

### 7.1 Layout token

| Token | 值 | Tailwind 別名 |
| --- | --- | --- |
| 頁面水平 padding | 16 / 24 / 32 | `px-page-mobile` …（或 container 內 `px-4 md:px-6 lg:px-8` 對齊 scale） |
| 內容最大寬 | 768 / 1024 / 1280 | `max-w-narrow` / `max-w-normal` / `max-w-wide` |
| 區塊間距 | 16–48 | `gap-section-sm` … `gap-section-xl` |

**Mobile-first：** 預設單欄；`md:` / `lg:` 再切雙欄與 sidebar。

**Buyer 桌面側欄：** 展開 `240px`、收合 `72px`；toggle 僅 Header 單一入口；詳見 `docs/buyer-sidebar-ui-spec.md`。實作：`components/dashboard/ParentAppShell.tsx`、`Sidebar.tsx`。Creator/Admin 側欄仍見 `components/layout/RoleShell.tsx`、`AdminShell.tsx`。

### 7.2 互動與 a11y

- 可點擊元素：`transition-colors` 或 `transition-shadow`，約 **150ms**。
- 鍵盤：`focus-visible:outline` + brand/`ds-focus` 色，offset 一致。
- 禁用：`disabled:pointer-events-none disabled:opacity-50`（`Button` 已內建）。
- Hover 列表卡：優先 `SurfaceCard elevation="interactive"`，勿在每頁重寫 hover shadow。

### 7.3 Typography

優先 Tailwind `text-h1` … `text-caption`（見 `tailwind.config.ts`）。頁面主標題一頁僅一個 `h1`，區塊標題用 `h2`/`h3` 或 `text-title`。

---

## 8. 實作檢查清單（PR / 改版前）

- [ ] 頁面資料仍只來自後端 API（`docs/mvp_rules.md` §A）
- [ ] UI 文案通過 `ui-role-naming-checklist.md`
- [ ] CTA 使用正確 `intent`（對照 `page-token-usage-mapping` 若該頁已列出）
- [ ] Card 使用 `Card` / `SurfaceCard` 或明確的行銷領域卡，無第三套圓角
- [ ] 色彩／邊框／陰影來自 token，無新增散落 `#6C63FF`（除非修 primitive）
- [ ] 重複 UI 已提取到 `ui/`、`ds/` 或 domain component
- [ ] 高風險頁若有像素規範，已更新對應 `docs/*-ui-guidelines.md`

---

## 9. 何時另寫「頁面級 UI 規格」

在以下情況新增獨立文件（範本可參考 `cart-ui-guidelines.md`）：

- Grid 欄位對齊容易漂移（購物車、結帳雙欄、訂單 timeline）
- 設計反覆調整的關鍵轉換頁
- 需鎖定具體 px（如 `min-h-[106px]`）且不宜上升為全域 token
- 高互動 Shell 元件（如 buyer sidebar 展開／收合）且易因 toggle 重複或 layout shift 漂移

**不需要**為每個 CRUD 頁各寫一份；一般列表／表單依本文件 + token mapping 即可。Buyer sidebar 已有 `docs/buyer-sidebar-ui-spec.md`。

---

## 10. 與 AI / 協作工具

在 Cursor 或其他 agent 中改 UI 時，應同時遵守：

1. 本文件（架構與 card/button 決策）
2. `design-tokens-v1.1.md`（數值）
3. 相關功能 spec（產品行為）

可選：在 `.cursor/rules/` 加入本文件路徑的簡短引用，避免與 `docs/` 雙份長文分叉。

---

## 11. 修訂紀錄

| 版本 | 日期 | 說明 |
| --- | --- | --- |
| v1.0 | 2026-05-20 | 初版：`ds` vs `edu`、`Card`/`SurfaceCard` 分工、`Button` intent 優先 |
| v1.1 | 2026-05-09 | §7.1 補 buyer sidebar 文件連結；§9 頁面級 spec 範圍含 sidebar |
