# 紅／粉色用法盤點與分類（`UI-QA-COMMERCE-COLOR-2`，2026-09-30）

> **性質：** audit 紀錄（盤點＋分類＋對比計算）。**待辦與狀態只在 `docs/pending-work-tracker.md` 維護**（`UI-QA-COMMERCE-COLOR-2`）。
> **本文件不改變任何顏色。** 價格／徽章／折扣的最終色待 Owner 在 `/dev/ui-review/commerce-color-2` 選定。

## 0. 已鎖定（不在本盤點的決策範圍）

品牌紫 `#5C4EEA`；加入購物車 = `intent="action"`（紫＋白）；立即購買 = `intent="purchase"`（`#FE8742` ＋ `#111827`）；
Inter ＋ Noto Sans TC；`/materials` 頂欄方案 B。`UI-QA-COMMERCE-COLOR` DONE、`SEC-04` CLOSED。

## 1. 方法

- 掃描範圍：`frontend/apps/web/{app,components,lib}`、`tailwind.config.ts`、`frontend/packages/ui/src`（legacy Tamagui）。
- 命中條件：
  - 十六進位／`rgb()` 顏色以 HSL 判定為紅粉色相（色相 ≥ 330° 或 ≤ 18°、飽和度 ≥ 0.40、亮度 0.20–0.93）；
  - Tailwind `red|rose|pink|fuchsia-*`；
  - 會解析成紅色的 token 別名（`edu-cta`、`edu-error`、`intent-flow`、`intent-danger`、`feedback-error*`、`status-rejected*`、`status-pendingPayment*`、`--color-brand-cta*`、`shadow-button-flow`）；
  - `intent="flow"` 呼叫點（prop，另以 grep 補齊）。
- 排除：註解行（記錄歷史，不是渲染用法）與 `app/dev/ui-review/*`（比較頁上刻意畫出的現況／參考色）。
- 對比：WCAG 2.x 相對亮度；撞色以 OKLab ΔE（×100）。文字門檻 4.5:1（大字 ≥ 24px 或 ≥ 18.66px 粗體為 3:1），非文字（圖示、圖表）3:1。
- 結果：**136 行命中**（dev 比較頁外）＝ **110 個使用點** ＋ **26 行 token 定義**。

## 2. 分類總表

| 類別 | 使用點 | 處置 |
| --- | ---: | --- |
| 1. 錯誤／危險 | 64 | **KEEP 紅色**（無缺陷） |
| 2. 警示／急迫狀態 | 14 | **KEEP**（與購買語意分開） |
| 3. 價格 | 3 | **REVIEW** → Owner 選「價格」 |
| 4. 折扣／促銷 | 2 | **REVIEW** → Owner 選「折扣」（其中 1 個對比不合格） |
| 5. 數量徽章 | 3 | **REVIEW** → Owner 選「徽章」（3 個全部對比不合格） |
| 6. 非購買主要動作（`intent="flow"`） | 12 | **KEEP**（依 Owner 指示不自動改橘）；1 個 REVIEW（語意） |
| 7. 裝飾／圖表／legacy | 12 | KEEP ×6、REVIEW ×4、DEPRECATE ×2 |
| **合計** | **110** | |

## 3. 逐項

### 3.1 錯誤／危險 —— KEEP（64）

對比全數合格：`feedback-errorText`／`status-rejectedText`／`edu-error` 文字 `#B91C1C` on 白 **6.47**、on `#FEE2E2` 5.30、on `#FFE4E6` 5.39；
`rose-600` on 白 4.70；`rose-700` 6.29；`intent-danger` 白字 on `#DE1313` **4.99**；最低的是 `OrderStatusTimeline` 失敗狀態 `#DC2626` on `rose-50` **4.40** —— 那是 16px 圖示（非文字門檻 3:1），合格；
買家側欄登出（`Sidebar.tsx:30` `red-600` on `red-50` 4.41）同為圖示按鈕，合格。

| 檔案 | 用途 |
| --- | --- |
| `components/ui/Button.tsx:163-165` | `intent="danger"` solid／outline／ghost |
| `components/ui/{ConfirmAction:185, FormField:120/138, IconButton:38, Input:50/78, Select:49, Textarea:35}` | 表單錯誤、必填星號、危險圖示鈕、錯誤外框 |
| `components/ds/{StateViews:97-117 (6), DangerCtaLink:6, KpiCard:42, PageHeader:57}` | 錯誤狀態、危險 CTA、負成長、危險標頭 |
| `app/login:296`、`app/register:286`、`app/me/complaints/new:158`、`app/downloads:258`、`app/orders:365`、`app/checkout:318` | 表單／載入錯誤訊息 |
| `app/admin/payment-proofs:485/876`、`app/admin/privacy-requests:261`、`…/[requestId]:224` | 管理端錯誤、退回按鈕 |
| `app/orders/[orderId]/payment-proof:353-358`、`app/admin/complaints:385-393`、`app/me/orders/[orderId]:217`、`components/admin/AdminDashboardPage:461-475/522` | 付款憑證退回區塊與重新上傳 |
| `components/account/ProductAccountChrome:101-117 (5)` | 帳號資料載入失敗 |
| `components/admin/{AccountFreezePanel:267/301, MaterialReviewPanel:523/557, AdminSidebar:121}`、`components/layout/CreatorSidebar:93/128/189` | 凍結錯誤、解凍外框、檔案錯誤、登出 hover |
| `components/{cart/CartItem:66, complaints/EvidenceAttachment:139, dashboard/Sidebar:30, orders/OrderStatusTimeline:36, reporting/ReportingRangeSelector:179, teacher/MaterialFileField:177}` | 移除、錯誤、登出、失敗步驟 |
| `components/materials/{MaterialDetailPage:260, detail/MaterialReportDialog:194, detail/MaterialDetailPurchasePanel:118}` | 檢舉入口 hover、檢舉錯誤、加入購物車失敗 |

### 3.2 警示／急迫狀態 —— KEEP（14）

| 檔案 | 用途 | 對比 |
| --- | --- | --- |
| `app/admin/complaints:218/406`、`app/admin/payment-proofs:623/653` | 逾期標記 | `#B91C1C`／`#DE1313` 文字，合格 |
| `app/admin/payment-proofs:639` | 付款憑證送出受阻 | 合格 |
| `app/admin/reports:797` | 已下架提示 | 合格 |
| `app/teacher/materials:318-324 (4)`、`app/teacher/materials/[id]/edit:397-399 (3)` | 創作者「已下架」通知 | `rose-800/900` on `rose-50`，合格 |
| `components/layout/RoleShell:363` | 創作者待回覆案件數徽章 | `#B91C1C` on `#FEE2E2` **5.30** |

`status-pendingPayment*`（`#BE123C` on `#FFE4E6` **5.24**）是狀態色，不在本題。

### 3.3 價格 —— REVIEW（3）

| 檔案 | 用途 | 現值 | 對比 |
| --- | --- | --- | --- |
| `components/materials/detail/MaterialDetailPurchasePanel.tsx:64` | 教材詳情主價格（30–32px 粗體） | `text-edu-cta` `#EA000D` | 白 4.66（大字門檻 3:1，合格） |
| `…/MaterialDetailPurchasePanel.tsx:146` | 手機 sticky 購買列合計（20px 粗體） | 同上 | 白 4.66，合格 |
| `components/dashboard/ProductCard.tsx:41` | 買家首頁商品卡價格（18px 粗體，未達大字） | 同上 | 白 4.66 合格；若落在淺紫頁面 `#F4F1FF` 為 **4.19** 不合格 |

語意問題不是對比，而是**價格用的是與 danger（`#DE1313`）ΔE 僅 2.3 的紅** —— 看起來像錯誤，且在立即購買（橘）旁邊形成第二個暖色焦點。
（教材卡 `MaterialCard`、購物車、結帳的價格／合計**已是深色字**，不在本題。）

### 3.4 折扣／促銷 —— REVIEW（2）

| 檔案 | 用途 | 現值 | 對比 |
| --- | --- | --- | --- |
| `components/materials/detail/MaterialDetailPurchasePanel.tsx:68` | 教材詳情「% OFF」（12px 粗體） | `#EA000D` on `edu-cta/10`（`#FDE6E7`） | **3.92 不合格** |
| `components/materials/MaterialCard.tsx:156` | 教材卡「% OFF」 | `#B91C1C` on `#FF6B73/10`（`#FFF0F1`） | 5.85 |

兩處同一語意卻兩套顏色；與數量徽章共用舊粉色但語意不同（促銷 vs. 數量提醒），因此**分開選**。

### 3.5 數量徽章 —— REVIEW（3，全部不合格）

| 檔案 | 用途 | 現值 | 對比（10px 粗體，需 4.5） |
| --- | --- | --- | --- |
| `components/dashboard/Topbar.tsx:149` | 買家頂欄購物車數量 | 白字 on `#FF6B73` | **2.76 不合格** |
| `components/dashboard/Sidebar.tsx:132` | 買家側欄導覽徽章（展開） | 白字 on `#FF6B7A` | **2.75 不合格** |
| `components/dashboard/Sidebar.tsx:141` | 買家側欄導覽徽章（收合） | 同上 | **2.75 不合格** |

目前 axe 未報這三個（視覺基準以遮罩排除、fixture 下 axe 未命中），**對比計算確定不合格**。

### 3.6 非購買主要動作（`intent="flow"` `#EA000D` 白字 4.66）—— KEEP（12）

`app/downloads:232`、`app/materials:139`（創作者入口）、`app/me/materials/[id]/feedback:142`、`app/me/orders/[orderId]:226`（上傳付款憑證）、
`app/teacher/materials:201`（新增教材）、`components/dashboard/HeroExplore:19`、`components/materials/MaterialHero:15`、
`components/parent/Hero:29`、`app/page.tsx:84`、`components/materials/detail/MaterialReportDialog:162`（檢舉送出）、
`components/ds/PrimaryCtaLink:5`（登入／探索連結）—— **KEEP**（依 Owner：不自動改為購買橘）。
`components/admin/AccountFreezePanel:211`（凍結帳號）：破壞性動作卻用 `flow` 而非 `danger` —— 兩者目前都是紅，視覺無差，**語意 REVIEW**（不在本題）。

### 3.7 裝飾／圖表／legacy（12）

| 檔案 | 用途 | 處置 |
| --- | --- | --- |
| `components/reporting/TrendChart.tsx:183` | 圖表 active 長條 `fill-edu-cta`（非文字 4.66） | REVIEW（紅不必承擔裝飾角色） |
| `components/dashboard/ProductCard:23`、`components/materials/MaterialDetailPage:180`、`…/detail/MaterialDetailBody:165` | 連結／收藏 hover 變紅 `hover:text-edu-cta` | REVIEW（依價格決定一併收斂） |
| `components/materials/MaterialCard:115` | 收藏愛心 `#EF4444` on `#FEE2E2`（圖示 3.08 ≥ 3） | KEEP（「喜愛」語意） |
| `components/reviews/ReviewItem:6`、`components/ui/Chip:15` | 頭像／標籤色塊（`#B91C1C` on `#FFE4E6` 5.39；`rose-800` on `rose-100` 6.68） | KEEP |
| `lib/api-repository:9`、`lib/material-mapper:6` | 無封面漸層 `from-rose-100` | KEEP |
| `components/ui/icons:114` | Google 標誌 `#EA4335` | KEEP（品牌標誌） |
| `app/globals.css:147`、`tailwind.config.ts:156`（`shadow-button-flow`） | flow 按鈕陰影仍是舊粉 `rgba(255,107,115)`，與 flow 本色 `#EA000D` 不一致 | DEPRECATE（對齊 flow 或移除） |
| `packages/ui/src/tokens.ts:37`（legacy Tamagui `pendingPayment` `#ff6b73` on `#ffe4e6` **2.30**） | 只被 `CardBadge` 使用，而 `CardBadge` **沒有任何呼叫端** | DEPRECATE（legacy-frozen，死碼） |

## 4. Token 定義層（26 行，不另計使用點）

`app/globals.css`：`--color-brand-cta`／`-hover`、`--color-intent-flow`、`--color-intent-danger`、`--color-status-{pending-payment,rejected}-*`、`--color-feedback-error-*`、`--shadow-button-flow`。
`tailwind.config.ts`：`edu.cta`／`ctaHover`、`edu.error`、`intent.flow`／`danger`、`status.pendingPaymentText`／`rejectedText`、`feedback.errorBorder`／`errorText`、`boxShadow.button-flow`。
`packages/ui/src/tokens.ts`：legacy `cta`／`ctaHover`／`danger`／`pendingPayment`／`rejected`／`errorBorder`／`errorText`。
價格與折扣定案後，`edu.cta` 的消費者只剩圖表與 hover（§3.7），屆時可再評估是否移除該 alias。

## 5. 對比不合格總表（本盤點發現）

| 組合 | 對比 | 位置 | 狀態 |
| --- | --- | --- | --- |
| 白字 on `#FF6B73` | **2.76** | 買家頂欄購物車徽章 | 待 Owner 選「徽章」後修正 |
| 白字 on `#FF6B7A` | **2.75** | 買家側欄徽章 ×2 | 同上 |
| `#EA000D` on `#FDE6E7` | **3.92** | 教材詳情折扣標籤 | 待 Owner 選「折扣」後修正 |
| `#ff6b73` on `#ffe4e6` | **2.30** | legacy Tamagui `CardBadge` | 死碼，DEPRECATE |
| `#EA000D` on `#F4F1FF` | 4.19 | （潛在）18px 粗體價格若落在淺紫頁面 | 目前實際位置皆在白底，合格 |

## 6. Owner 候選（完整說明與真實情境比較見 `/dev/ui-review/commerce-color-2`）

- **價格**：A `#111827`（白 17.74）／B `#334155`（10.35）／C `#312E81`（11.42）。
- **數量徽章**（白字）：A `#C81E6E`（5.43）／B `#5C4EEA`（5.63）／C `#111827`（17.74）。
- **折扣**：A `#FFF0E9` ＋ `#111827`（15.96）／B `#F3F4F6` ＋ `#111827`（16.12）／C `#FFF0F1` ＋ `#B91C1C`（5.85，現行卡片樣式、詳情頁一併對齊）。

## 7. 最終提案再稽核（2026-10-01，**未核准、未實作**）

提案（整套）：價格 `#111827`；購物車徽章 `#C81E6E` ＋ 白（購物車數量與購買相關待處理數）；一般通知徽章 `#5C4EEA` ＋ 白；
折扣 <30% `#FFF0E9` ＋ `#111827`；折扣 ≥30% `#FFF0F1` ＋ `#B91C1C`；門檻 30%（平台規則）。審閱頁 `/dev/ui-review/commerce-color-2-final-review`。

**對比（全部合格，依實際字級）：** 購物車徽章 5.43、通知徽章 5.63（10px 粗體需 4.5）；折扣 <30% 15.96、≥30% 5.85（12px 粗體需 4.5）；
價格 on 白／`#F4F1FF`／`#FAF8FF` 17.74／15.94／16.84；徽章 vs 側欄 active 列底 `#EBEAFC`（非文字需 3）4.58／4.74。
審閱頁上 23 個提案渲染節點 axe 0 違規。

**疑慮（再稽核發現，ΔE 為 OKLab ×100）：**

1. **折扣 ≥30% ＝ 錯誤樣式** —— 文字 `#B91C1C` 與錯誤文字（`feedback-errorText`／`status-rejectedText`）完全相同（ΔE 0.0），底色與錯誤底 `#FEF2F2` ΔE 0.5。
   建議替代：`#FFE4D4` ＋ `#9A3412`（6.02；與錯誤文字 ΔE 6.6，與購買橘同家族）。
2. **兩級折扣底色幾乎相同**（`#FFF0E9` vs `#FFF0F1` ΔE 1.1）—— 門檻只靠字色表現。
3. **一般通知徽章目前沒有使用處** —— 平台沒有通知系統；買家側欄的兩個徽章（購物車、待處理訂單＝待付款＋被退回）依規則都屬購物車徽章。
4. **折扣目前不會出現在產品上** —— `lib/material-mapper.ts` 的 `originalPrice: price`、後端沒有原價欄位，「% OFF」永遠不渲染；門檻只能以真元件示範。門檻應以畫面顯示的整數百分比判定（元件用 `Math.round`）。
5. 購物車徽章仍屬紅粉家族（vs danger ΔE 11.2、vs 強折扣文字 10.8）—— 可分辨；若強折扣改用替代色則一併消失。
6. 非顏色：Topbar 徽章上限「99+」、側欄上限「9+」不一致。
