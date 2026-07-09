# Cart UI Guidelines

本文件定義 `frontend/apps/web/app/cart/page.tsx` 與 `frontend/apps/web/components/cart/CartItem.tsx` 的視覺與互動基準，用於避免後續改版造成層級走樣或對齊漂移。

**通用約定（token、Card、Button intent）：** `docs/frontend-ui-architecture.md`、`docs/design-tokens-v1.1.md`

## 1. 頁面目標

- 主目標：提升結帳轉換率，降低分心與跳出。
- 核心任務順序：商品確認 -> 金額確認 -> 前往結帳 CTA。

## 2. 版面結構（Desktop）

- 左右區塊須在同一個 container 內。
- 使用 grid 佈局：
  - `grid-template-columns: 1fr 360px`
  - `align-items: start`
- 左側為商品卡清單，右側為訂單摘要（sticky）。
- 不使用 margin hack 做主對齊（僅允許極小視覺補償）。

## 3. 頁面標題（Page Title）

- 桌機標題使用純文字，不使用大型 header 容器包裹。
- 建議字級/字重：
  - `20~24px`
  - `font-weight: 600`
- 可選格式：`購物車（X 項商品）`
- 必須明顯高於商品卡標題，避免層級混淆。

## 4. 商品卡（CartItem）規範

### 4.1 欄位順序

固定欄位線：

`| checkbox | 圖片 | 文字 | 價格 | 數量 | 刪除 |`

### 4.2 文字結構

- 第一列：商品標題
- 第二列：年齡資訊（次要資訊）
- 價格、數量、刪除與年齡資訊同一水平線

### 4.3 字級層級

- 商品標題：`16px / 600`
- 年齡資訊：`12~13px / gray`
- 商品價格：`16px / 700`
- 數量數字：`14px / 600`

### 4.4 密度與間距

- 卡片高度控制：`104~112px`
- 內距：`16px`
- 元素間距：`8px` 為主

### 4.5 刪除按鈕

- 位置：最右欄，與數量控制同一列
- 預設：灰色 ghost
- Hover：紅色語意（背景/字色）
- 與右邊距保留 `8~12px`，不可貼邊

## 5. 訂單摘要（Summary）規範

- 標題（訂單摘要）：`16px / 600`
- 小計：`13~14px / gray`
- 總金額：`24~28px / 700`（摘要區最強）
- CTA：`16px / 600`

## 6. 視覺權重順序

全頁層級需符合：

`CTA > 總金額 > 商品價格 > 商品名稱 > 次要資訊（年齡/小計文案）`

## 7. 導覽與空態策略

- 非空購物車：頁面不主動強導探索導流，聚焦結帳。
- 空購物車：保留 CTA `前往探索教材`。
- Sidebar 與上方搜尋欄維持可用。

## 8. 徽章與資料同步

- 購物車徽章：依實際 cart quantity 合計動態顯示。
- 訂單徽章：依當前定義的待處理訂單數顯示。
- cart 刪除/數量變更需持久化，重進頁面不可回彈。

## 9. 驗收清單

- 商品卡為高密度橫向排列，欄位對齊穩定。
- 左右區塊上緣平行，且與頁面標題距離合理。
- 層級清晰，可快速辨識頁面起點與主要行動。
- 單商品、少商品、空購物車三種情境均可維持一致品質。

## 10. 元件與 class 基準表（現況對照）

> 以下為目前程式碼的關鍵 class 參考點；若後續調整，請以本表為 diff 基準，避免層級與對齊退化。

| 區塊 | 檔案 | 主要 class / 設定 |
|------|------|-------------------|
| 桌機 page title | `frontend/apps/web/app/cart/page.tsx` | `h1` 使用 `text-[22px] font-semibold tracking-tight` |
| 兩欄主版型 | `frontend/apps/web/app/cart/page.tsx` | `lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6` |
| 右側摘要容器 | `frontend/apps/web/app/cart/page.tsx` | `aside` 使用 `hidden lg:block lg:pt-[10px]`，摘要卡 `sticky top-24` |
| 商品卡外框 | `frontend/apps/web/components/cart/CartItem.tsx` | `min-h-[106px] p-4 rounded-xl border ... shadow-sm` |
| 商品卡欄位線 | `frontend/apps/web/components/cart/CartItem.tsx` | `grid-cols-[16px_52px_minmax(0,1fr)_auto_auto_32px] grid-rows-[auto_auto]` |
| 商品標題 | `frontend/apps/web/components/cart/CartItem.tsx` | `text-base font-semibold` |
| 年齡資訊 | `frontend/apps/web/components/cart/CartItem.tsx` | `text-[12.5px] leading-[1.15] text-[#9CA3AF]` |
| 商品價格 | `frontend/apps/web/components/cart/CartItem.tsx` | `text-base font-bold` |
| 數量數字 | `frontend/apps/web/components/cart/CartItem.tsx` | `text-sm font-semibold` |
| 刪除按鈕 | `frontend/apps/web/components/cart/CartItem.tsx` | 預設灰色 ghost；`hover` 轉紅（`hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]`） |
| 訂單摘要標題 | `frontend/apps/web/app/cart/page.tsx` | `text-base font-semibold` |
| 小計列 | `frontend/apps/web/app/cart/page.tsx` | `text-sm text-[#6B7280]` |
| 總金額 | `frontend/apps/web/app/cart/page.tsx` | `text-[28px] font-bold leading-none` |
| CTA | `frontend/apps/web/app/cart/page.tsx` | `h-12 text-base font-semibold` |
