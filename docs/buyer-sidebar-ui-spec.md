# Buyer Sidebar UI Spec

本文件定義 **購買者（parent）桌面側邊欄** 的展開／收合狀態、互動與視覺基準，避免後續改版造成 toggle 重複、icon 偏移或 layout shift。

**實作對照：** `frontend/apps/web/components/dashboard/Sidebar.tsx`、`ParentAppShell.tsx`、`sidebar-constants.ts`、`sidebar-nav-config.ts`

**通用約定（token、Shell）：** `docs/frontend-ui-architecture.md`、`docs/design-tokens-v1.1.md`

---

## 1. 適用範圍

| 項目 | 說明 |
| --- | --- |
| **適用** | 登入後 buyer 流程：`ParentAppShell` 包覆之頁面（`/dashboard`、`/explore`、`/cart`、`/materials/*`、`/favorites` 等） |
| **不適用** | Creator/Teacher `RoleShell` 工作台、Admin `AdminShell`、公開頁（無 sidebar） |
| **斷點** | 桌面 `md+`（≥768px）顯示固定側欄；`md` 以下改 Topbar 漢堡選單 + overlay drawer |

---

## 2. 兩種狀態（僅此二種）

| 狀態 | 寬度 | 常數 |
| --- | --- | --- |
| **Expanded（展開）** | `240px` | `SIDEBAR_WIDTH_EXPANDED` |
| **Collapsed（收合）** | `72px` | `SIDEBAR_WIDTH_COLLAPSED` |

- 禁止第三種「半開」寬度。
- 主內容區以 `ParentAppShell` 的 `--sidebar-offset` 同步 `padding-left`，transition **200ms ease**。

---

## 3. 展開狀態（Expanded）

### 3.1 Header

- 左：品牌 logo（32×32 容器）+ `EDUMARKET` + `Hi，歡迎回來 👋`
- 右：**唯一收合按鈕** — `chevron-left`，32×32 ghost（透明底，hover 淡紫）
- padding：`16px`（`p-4`）

### 3.2 導覽

分區與順序（`SIDEBAR_NAV_SECTIONS`）：

1. **主要功能：** 首頁、探索教材、購物車、我的訂單、收藏清單  
2. **我的內容：** 我的教材、我的評論  
3. **其他：** 通知設定、登出  

選單列：

- 高度 **44px**（`h-11`）
- icon **22px** + label **15px / medium**
- 垂直間距 **8px**（`gap-2`）
- 分區標題：11px uppercase，非首區上距 **28px**（`mt-7`）

### 3.3 Active / Hover

- **Active：** 淡紫底 `edu-primary/12` + 品牌紫 icon／文字；**禁止**左側 indicator、`border-left`
- **Hover：** 淡灰紫底 `edu-primary/6`（非實心重色）

### 3.4 Badge

- 購物車、我的訂單：數字 badge **緊貼 label 後方**（約 8px gap），不飄到列最右側
- 規格：16×16、`10px` 字、圓角 pill

### 3.5 底部 Profile

- 頭像 32×32、`#2E2E33` 底
- 顯示使用者名稱 +「個人資料」副標
- 高度約 **40px**（`h-10`），`mt-auto` 貼底

---

## 4. 收合狀態（Collapsed）

### 4.1 Header — 唯一展開入口

- **僅顯示品牌 logo**（32×32 淡紫底）
- **Hover：** logo 淡出，`chevron-right` 淡入（同位置切換）
- **Click：** 展開 sidebar
- Tooltip：「展開側邊欄」
- **禁止：** 在 logo 下方另放獨立 toggle 列；禁止底部 `...` 作為展開入口

### 4.2 Icon rail

- 僅 icon，無文字、無分區標題
- 按鈕 **44×44**，icon 水平垂直置中
- 項目間距 **8px**；分區之間以淡分隔線（`#EEF0F6`）區隔
- Hover：右側 dark tooltip（選單名稱），150ms fade
- Badge：固定於 icon 按鈕右上角（`top/right: 4px`）

收合導覽項目（`SIDEBAR_COLLAPSED_SECTIONS`）與展開版相同兩區，**不含「其他」**（通知／登出需展開後使用）。

### 4.3 底部

- **僅 Avatar**（個人資料連結 + tooltip）
- **已移除** `...`（More）按鈕及其展開功能

### 4.4 捲軸

- 收合 rail 使用 `sidebar-rail-scroll-hidden`：**永不顯示** scrollbar（避免 hover 時 icon 左移）

---

## 5. Toggle 規則（強制）

| 規則 | 說明 |
| --- | --- |
| **單一入口** | 展開／收合只能由 **Header** 控制 |
| 展開時 | Header 右上角 `chevron-left` → 收合 |
| 收合時 | Header logo 區 hover/click → 展開 |
| 禁止 | 底部 `...`、重複 chevron、sidebar 外側浮動按鈕 |

---

## 6. 狀態持久化與情境

| 行為 | 實作 |
| --- | --- |
| 使用者偏好 | `localStorage` key：`tp-sidebar-collapsed` |
| 教材詳情頁 | 路徑 `/materials/:id`（非 list、非 reviews 子路徑）**自動收合**；離開後恢復偏好 |
| 詳情頁手動展開 | 允許 toggle，但不寫入 preference（仍為 detail 情境） |

---

## 7. 視覺 token

| 項目 | 值 |
| --- | --- |
| Sidebar 背景 | `#FFFFFF`（`bg-white`） |
| 右邊框 | `#EEF0F6` |
| 主內容區背景 | `#F4F1FF`（`ParentAppShell`） |
| 品牌紫 | `edu-primary`（`#6C63FF`） |
| Icon 預設色 | `slate-500` |
| Nav 圓角 | `10px` |

---

## 8. 與其他 Shell 的差異

- **Buyer：** 本文件（`ParentAppShell` + `Sidebar.tsx`）
- **Creator/Teacher：** `RoleShell` 內建側欄（不同寬度與結構，不共用本 spec）
- **Admin：** `AdminSidebar` / `AdminShell`

改 buyer sidebar 時**勿**順手改動 creator/admin 側欄，除非另有 spec。

---

## 9. PR 自檢

- [ ] 展開 240px / 收合 72px，無第三種寬度
- [ ] Toggle 僅 Header 一處；收合底部無 `...` 展開
- [ ] 收合 icon 置中；hover 不出現 scrollbar 位移
- [ ] 無左側 active indicator
- [ ] Badge 展開貼 label、收合貼 icon 右上角
- [ ] 主內容 `--sidebar-offset` 與 sidebar 寬度同步動畫
- [ ] 未改 routing、JWT、API 契約

---

## 10. 修訂紀錄

| 版本 | 日期 | 說明 |
| --- | --- | --- |
| v1.0 | 2026-05-09 | 初版：對齊 buyer sidebar 展開／收合重構（單一 toggle、icon rail、移除底部 `...`） |
