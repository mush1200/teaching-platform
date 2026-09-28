# UI Review 發現登記簿 —— 2026-09-29（第一輪）

> **本輪不做大規模修正。** 這份文件只登記「量測到什麼」與「共同成因是什麼」，
> 修正批次見 §4（**提案，未執行**）。
>
> 環境、護欄與 fixture 見 `docs/ui-review-environment.md`。
> **判讀前必讀該文件 §6「已知的環境限制」** —— 特別是本機無法取用 Google Fonts，
> 因此**任何純字型外觀的觀察都不得據此判為產品缺陷**。

量測工具：`frontend/apps/web/tests/ui-review/measure-layout.mjs`
（逐層累加 `padding-left`，作法與 `tests/e2e/layout-contract.spec.ts` 相同 ——
**不用** `h1.left − main.left`，因為容器多為 `mx-auto max-w-*`，
視窗比上限寬時量到的會是置中位移而不是 gutter）。

---

## 0. 嚴重度

| 級別 | 定義 |
| --- | --- |
| `P0` | 無法使用／核心流程受阻／嚴重重疊 |
| `P1` | 主要版面、responsive 或共用層不一致 |
| `P2` | 間距、字體或次要視覺問題 |

---

## 0A. ⚠️ 量測工具的已知限制（**先讀，否則會誤判**）

第一次 traversal（`measure-layout.mjs`，195 組 route×viewport）在導覽後只等 **1200ms**。
**那對 client-side 取資料的頁面不夠** —— 量到時 `<h1>` 還沒渲染，
於是「gutter 0 層」被記成缺陷，實際上只是「還沒畫出來」。

**證據**：`/me/orders` 在 traversal 中記為 0 層，但以完整載入的瀏覽器實測為
**1 層 / 32px（canonical，正確）**。兩者矛盾 → 是工具的問題，不是產品的問題。

因此本文件的結論**全部**改以第二次 `remeasure.mjs` 為準：
它會 `waitForSelector("h1")` ＋ `networkidle` ＋ 600ms 再量。
第一次 traversal 標記的 13 條「零 gutter」路由中，
**只有 2 條在重新量測後仍然成立**，其餘 11 條是 hydration 假象，已剔除。

> ⚠️ **不得引用第一次 traversal 的零 gutter 清單。** 保留 `layout-measurements.json`
> 只是為了留下這個工具誤差的紀錄。

---

## 1. 發現

### `UI-REV-001` — `P1` — 教材列表（兩條路由共用的 `ExplorePage`）完全沒有 page gutter，卡片緊貼側欄

**這就是 Owner 回報的「Main content／Material Card 離 Sidebar 太近」。**

| | |
| --- | --- |
| **Route** | `/materials`（公開）與 `/explore`（買家）—— **兩條路由共用同一個元件** |
| **Role** | public ／ buyer |
| **Viewport** | 1440／768／390 **全部重現** |
| **元件** | `components/parent/ExplorePage.tsx`（PageContainer 層） |
| **Issue** | 水平 gutter **0 層 / 0px**；`<h1>` 左緣在 **x=239**，而側欄右緣是 **240** → 距離 **−1px**（實際上已經貼上去） |
| **Expected** | 16／24／32，且**恰好一層** |
| **Actual** | **0px（全部三個 viewport）** |
| **Status** | `OPEN` |

**Evidence（`remeasure.mjs`，h1 已確認渲染）**

| Route | 1440 | 768 | 390 |
| --- | --- | --- | --- |
| `public /materials` | **0 層 / 0px**（want 32） | **0 層 / 0px**（want 24） | **0 層 / 0px**（want 16） |
| `buyer /explore` | **0 層 / 0px**（want 32） | **0 層 / 0px**（want 24） | **0 層 / 0px**（want 16） |

1440 時：側欄右緣 240、`main.left` 240、`h1.left` **239** → **gap −1px**。

**Root cause（已查證，非推測）**

`components/parent/ExplorePage.tsx:130` 的根容器是：

```tsx
<div className="mx-auto max-w-7xl space-y-4">
```

該檔 `px-page-mobile` 命中數為 **0** —— **完全沒有供應水平內距**。
而這兩條路由的外殼（`RoleShell` ／ `ParentAppShell`）依 `UI-CONS-07` 的
「每頁恰好一層」規則**刻意不供應** gutter，因此沒有任何一層補上。

`max-w-7xl` ＝ 1280px，但 1440 視窗下 `main` 只有 1185px（< 1280），
所以 `mx-auto` 不產生任何置中位移 —— 內容就從 x=240 開始，**正好貼著側欄**。

> ⚠️ **不是 Card 的問題，不是 Grid 的問題，不是側欄寬度的問題，也不是 AppShell 偏移的問題。**
> 側欄 240px 與 `main` 的 240px 左偏移**完全正確對齊**。
> 缺的是 `main` **之內**的 page container。

**Remediation layer**：**PageContainer**。

---

### `UI-REV-002` — `P1` — 買家 `/dashboard` 的「內距」是卡片內距，不是 page gutter

| | |
| --- | --- |
| **Route** | `/dashboard`（登入後的買家著陸頁） |
| **Viewport** | 1440／768／390 全部重現 |
| **Issue** | 三個 viewport **都是 28px**，完全不隨斷點變化；第一個視覺方塊與側欄距離 **0px** |
| **Expected** | 32／24/16 |
| **Actual** | **28 / 28 / 28** |
| **Status** | `OPEN` |

**Root cause**：`app/(parent)/dashboard/page.tsx:14` 確實有
`px-page-mobile sm:px-page-tablet lg:px-page-desktop` ——
**但那一行在 `DashboardFallback()` 裡，是 `<Suspense>` 的載入骨架**。
真正渲染內容的 `DashboardClient.tsx` 中 `px-page`／`mx-auto`／`max-w-` 命中 **0**。
量到的 28px 是 hero **卡片自己的 `padding-left`**。

> ⚠️ 骨架有 gutter、內容沒有 —— **靜態 grep 會把這一頁誤判為「有 gutter」**。
> 這也是為什麼結論必須以瀏覽器實測為準。

**Remediation layer**：PageContainer。與 `UI-REV-001` **同一根因**。

---

### `UI-REV-003` — `P2` — `/terms` 與 `/403` 的 gutter 固定 16px，不隨斷點放大

| | |
| --- | --- |
| **Route** | `/terms`、`/403` |
| **Issue** | 1440 與 768 都是 **16px**，未套用 24／32 的階梯 |
| **Evidence** | `/terms`：1440 → 16（want 32）、768 → 16（want 24）、390 → 16 ✓；`/403` 同形狀 |
| **Status** | `OPEN` |

層數正確（1 層），**只是數值沒有跟著斷點升級** —— 比 `001`／`002` 輕微。

**Remediation layer**：PageContainer（同一個共用容器可一併解決）。

---

### `UI-REV-004` — `P1` — 三套側欄實作，買家那套未使用設計 token

| | |
| --- | --- |
| **元件** | `components/dashboard/Sidebar.tsx`、`components/admin/AdminSidebar.tsx`、`components/layout/CreatorSidebar.tsx` |
| **Issue** | 三個各自獨立的實作。Admin 與 Creator 視覺語言一致；**買家是分歧的第三套** |
| **Status** | `OPEN` |

| 檔案 | 行數 | 原始 hex | `slate`／`gray` 類 | `ds-*` token | `edu-*` token |
| --- | --- | --- | --- | --- | --- |
| `dashboard/Sidebar.tsx`（買家） | 474 | **5** | **5** | 2 | 1 |
| `admin/AdminSidebar.tsx` | 129 | 2 | **0** | 5 | 2 |
| `layout/CreatorSidebar.tsx` | 196 | 3 | **0** | 5 | 2 |

買家側欄的原始 hex：`#2E2E33`、`#EEF0F6`、`#F2EBFF`、`#F5F3FF`、`#FF6B7A`。

**已經收斂過、不要重做**（避免把已修的當成未修）：
展開寬度已統一 240px（`UI-CONS-06`）、抽屜行為已共用 `NavDrawer`（`UI-CONS-23`）、
常駐側欄斷點已統一 `lg`（`UI-CONS-05`）。**分歧的是顏色 token 與實作份數，不是尺寸。**

> ⚠️ 買家側欄的**收合（icon rail）能力是刻意的角色差異**
> （`ROLE-INTENTIONAL`，`docs/ui-design-system.md` §7.6），**不得**以一致性為由移除。

**Remediation layer**：Sidebar。

---

### `UI-REV-005` — `P2` — Admin 與 Creator 側欄含逐字元相同的重複實作

登出列 class 字串在兩檔中**實測相等**：
`rounded-xl border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#FEF2F2] hover:text-edu-error`

**Status**：`OPEN`。與 `UI-REV-004` 同根因，應合併處理。

---

### `UI-REV-006` — `P2` — gutter ownership 的契約註解自相矛盾（`001`／`002` 的再發生成因）

`RoleShell.tsx` 的註解寫「`AdminShell`／`ParentAppShell` 供應 gutter → 其下頁面**不得**再供應」；
但 `ParentAppShell` 的 `<main>` 實際是 `flex-1 pb-3 pt-1.5 md:pb-4 md:pt-2`（**無水平內距**），
且該檔自身的註解寫的是「**這個外殼不再供應水平 gutter**」——**兩份註解互相矛盾**。

依 `RoleShell` 的版本寫新頁面，就會寫出 `UI-REV-001`／`002`。
**只修症狀不修契約，等於留著再犯的路徑。**

**Status**：`OPEN`。**Remediation layer**：AppShell（僅統一敘述，數值行為不變）。

---

### `UI-REV-007` — `P2` — `/dashboard` 單次載入重複請求 `me/favorites` 約 20 次

`performance.getEntriesByType("resource")` 過濾 `/me/favorites`：載入後穩定 **20**，4 秒後增量 **0**，全部 HTTP 200。

> ⚠️ **不是無窮迴圈。** 初次觀察到的 219 次是**同一分頁多次導覽的累計值**。已更正。

形狀像「每張卡片各自查一次收藏狀態」的 fan-out。
**Remediation layer**：功能／資料層，**不併入 UI 批次**（`CLAUDE.md` §10.3）。

---

## 1A. 通過的路由（**沒有發現缺陷**，記錄下來避免重複檢查）

gutter 為 1 層且數值正確（1440/768/390 ＝ 32/24/16）：

`/admin`、`/admin/materials`、`/admin/orders`、
`/creator/materials`、`/creator/sales`、
`/cart`、`/downloads`、`/favorites`、`/me/materials`、`/me/orders`、`/my-reviews`、
`/materials/:id`（含超長標題版本）。

**水平溢位（`scrollWidth > clientWidth`）：全部 route×viewport 皆為 0 —— 沒有任何橫向捲動缺陷。**

## 2. 共同成因分組

| 分組 | 發現 | 說明 |
| --- | --- | --- |
| **PageContainer ／ gutter ownership** | `UI-REV-001`、`002`、`003`、`006` | 三個症狀（教材列表 0px／dashboard 28px 不隨斷點／terms・403 固定 16px）＋ 一個讓它們再發生的契約矛盾。**同一個共用層，應一次處理。** |
| **Sidebar** | `UI-REV-004`、`005` | token 分歧與實作重複同源；抽共用 nav-item primitive 可同時處理 |
| **功能／資料** | `UI-REV-007` | 與版面無關，**不併入 UI 批次** |

**符合「不為重複症狀開多個修正」：** 7 筆發現收斂為 **3 組**、實際只需 **2 個 UI 修正批次**。

**統計：P0 ＝ 0　│　P1 ＝ 3（`001`／`002`／`004`）　│　P2 ＝ 4（`003`／`005`／`006`／`007`）　│　合計 7。**

---

## 3. 對 Owner 五個問題的直接回答

**1. 是否有多套 Sidebar 實作／樣式？**
**是 —— 3 套實作、2 種視覺語言。**
`dashboard/Sidebar.tsx`（買家，474 行）、`admin/AdminSidebar.tsx`（129 行）、
`layout/CreatorSidebar.tsx`（196 行）。Admin 與 Creator 視覺一致（且有逐字元重複的片段）；
買家是分歧的第三套（5 個原始 hex ＋ 5 個 `slate-*`，而非 `ds-*`／`edu-*` token）。
⚠️ **寬度、抽屜行為、斷點先前已統一，不要重做**；分歧的是**顏色 token 與實作份數**。

**2. 為什麼 Main content／Material Card 離 Sidebar 太近？**
**因為教材列表那一頁根本沒有 page gutter —— 不是間距值太小。**

實測：側欄右緣 **240**、`main.left` **240**（兩者**完全正確對齊**）、
但 `<h1>` 左緣是 **239** → 距離 **−1px**。
成因是 `components/parent/ExplorePage.tsx:130` 的根容器
`mx-auto max-w-7xl space-y-4` **完全沒有 `px-page-*`**（該檔命中數 0），
而該路由的外殼依設計**刻意不供應** gutter，於是沒有任何一層補上。

`max-w-7xl`（1280px）在 1440 視窗下也幫不上忙 —— `main` 只有 1185px，
`mx-auto` 不產生位移，內容就從 x=240 開始。

**3. 是共用版面還是個別頁面的問題？**
**是共用契約，在個別頁面上發作 —— 而且 `ExplorePage` 一個檔案同時影響兩條路由。**
gutter 的擁有者規則是「**每頁恰好一層**」（`AdminShell` 自己供應；
`ParentAppShell`／`RoleShell` 刻意不供應，因為它們同時包住 `sticky` 滿版返回列與
landing 的滿版底色帶）。規則本身沒錯，
但**沒有任何機制保證頁面真的照做** —— 現有的 `layout-contract.spec.ts`
只量「**不會有兩層**」，**沒有**量「不會有零層」。

**4. 應該先修哪一個共用層？**
**PageContainer**（不是 Sidebar）。理由三點：
(a) `UI-REV-001` 命中的是**教材列表**，那是買家的核心瀏覽路徑；
(b) 它在**每一個** viewport 都重現；
(c) 側欄的尺寸、斷點與抽屜行為都已正確，剩下的是顏色一致性，視覺影響較輕。

**5. 哪些發現同一個根因？**
`001`＋`002`＋`003`＋`006`（gutter ownership）／`004`＋`005`（sidebar）。見 §2。

---

## 4. 修正批次提案（**未執行**）

> ⚠️ **本輪不執行任何批次。** 以下僅為提案，待 Owner 決定順序與範圍。

| 批次 | 內容 | 對應發現 |
| --- | --- | --- |
| **1 — AppShell ／ Sidebar** | 統一 gutter ownership 契約敘述；抽共用 nav-item primitive；買家側欄改用 `ds-*`／`edu-*` token | `004`、`005`、`006` |
| **2 — PageContainer ／ Grid** | `ExplorePage`、`DashboardClient`、`/terms`、`/403` 套用共用容器；**補上「不會有零層」的回歸護欄** | `001`、`002`、`003` |
| **3 — 共用 Card ／ MaterialCard** | 待第二輪（本輪未逐卡比對） | — |
| **4 — 角色頁面** | 待第二輪 | — |
| **5 — Responsive 收尾** | 待第二輪（**本輪未發現任何水平溢位**） | — |
| **6 — 最終視覺回歸** | `npm run verify:web` ＋ 更新後的 layout contract | — |

> **建議執行順序：Batch 2 先於 Batch 1**（編號沿用 Owner 指示的分類，順序依 §3 問題 4）。
>
> ⚠️ Batch 2 **必須同時補測試**。目前 `layout-contract.spec.ts` 只擋「兩層」，
> 不擋「零層」—— 這正是 `UI-REV-001` 能存在而測試全綠的原因。
> 只改 class 不補測試，等於修完就等著再犯。
