# 前端每日開發流程與進度追蹤

本文件用於每日開發執行。  
原則：**每次開發都要做前端驗證步驟**，通過後才進入下一項。

---

## 0) Monorepo 基礎架構（Day 1）
- [x] 建立 `apps/web`、`apps/mobile`
- [x] 建立 `packages/ui`、`packages/features`、`packages/api`、`packages/config`
- [x] 在 `apps/web` 初始化 Next.js + TypeScript + App Router
- [x] 在 `apps/web` 接入 Tamagui / Solito 基礎配置

## 1) 設計系統與底層（Day 2-4）
- [x] 建立 design tokens（色彩、字級、間距、圓角、陰影）
  - [x] 在 `packages/ui` 建立 `tokens` 模組（colors/fontSizes/space/radius/shadows）
  - [x] 定義語意化色票（primary/success/warning/danger/info/bg/text/border）
  - [x] 定義字級與行高（xs/sm/md/lg/xl）並提供 heading/body 對應
  - [x] 定義間距與圓角階層（xs/sm/md/lg/xl）
  - [x] 匯出 web 可用 theme 設定，確保元件僅透過 token 取值
  - [x] 建立 token 文件（命名規則 + 使用範例）
- [ ] 建立共用元件：Button/Input/Select/TextArea/Card/Badge/Dialog/Uploader/Pagination
  - [x] `Button`：variant（primary/secondary/ghost/danger）+ size（sm/md/lg）+ loading/disabled
  - [x] `Input/TextArea`：label/helper/error/success 狀態 + 可及性屬性
  - [x] `Select`：選單開關、鍵盤操作、placeholder、disabled 狀態
  - [x] `Card/Badge`：樣式變體與語意化狀態（success/warning/error/info）
  - [x] `Dialog`：開關控制、焦點陷阱、ESC 關閉、確認/取消動作
  - [x] `Uploader`：拖曳/點擊上傳、檔案大小與副檔名驗證、失敗提示
  - [x] `Pagination`：頁碼、上一頁/下一頁、禁用狀態、總筆數顯示
  - [x] 每個元件提供最小範例（props + 事件）供頁面直接重用
- [x] 建立共用狀態元件：LoadingState/EmptyState/ErrorState
  - [x] `LoadingState`：skeleton 與 spinner 兩種模式
  - [x] `EmptyState`：標題/說明/主要操作按鈕（回到上一層或新增）
  - [x] `ErrorState`：錯誤訊息 + retry callback + 可選支援錯誤碼顯示
  - [x] 三者都支援 size（sm/md/lg）與可自訂文案
  - [x] 在 `/materials` 或 `/teacher/materials` 先接一頁驗證可重用性
  - [x] 已在 `/cart` 接入三態元件完成首輪重用驗證

## 2) 公開頁與購買流程（Day 5-10）
- [ ] `/materials` 教材列表
- [ ] `/materials/[id]` 教材詳情
- [ ] `/login`、`/register`（目前已完成 `/login`）
- [ ] `/cart`、`/checkout`
- [ ] `/orders`、`/orders/[id]/upload-proof`
- [ ] `/downloads`

## 3) teacher 後台（Day 11-13）
- [ ] `/teacher/materials`
- [ ] `/teacher/materials/new`
- [ ] `/teacher/materials/[id]/edit`

## 4) admin 後台（Day 14-17）
- [ ] `/admin/materials`
- [ ] `/admin/orders`
- [ ] `/admin/payment-proofs`
- [ ] `/admin/reports`
- [ ] `/admin/activity-logs`

## 5) 品質補強（Day 18-20）
- [ ] 404 / 403 / 500 錯誤頁
- [ ] SEO / OG metadata
- [ ] accessibility（鍵盤操作、語意化）
- [ ] 效能與分析追蹤

---

## 每日開發 SOP（固定執行）
1. 選定今日 1-2 個頁面或 1 個流程（不要同時開太多）。
2. 先完成 UI 骨架（layout + states），再接 API。
3. 對齊 Swagger 契約做資料映射與錯誤處理。
4. 完成「前端驗證步驟」後才勾選完成。
5. 記錄當日成果與次日待辦。

---

## 每次開發都要做的前端驗證步驟（必做清單）
- [ ] `npm run lint:web` 通過
- [ ] `npm run typecheck:web` 通過
- [ ] `npm run build:web` 通過
- [ ] 手動驗證三種版面：mobile / tablet / desktop
- [ ] 驗證 loading / empty / error 三態
- [ ] 驗證表單：必填、格式錯誤、送出失敗、送出成功
- [ ] 驗證角色權限（public/parent/teacher/admin）顯示正確
- [ ] 驗證 API 錯誤碼（至少 401/403/404/500）有可理解提示
- [ ] 驗證公開頁 metadata（title/description/OG）與基本 a11y

---

## 4~8 新手操作版（照做即可）

## 本次開發驗證流程（一步一步照做）

### 0) 先準備環境（只做一次）
1. 開一個 PowerShell（視窗 A）。
2. 執行：
   - `cd c:\teaching-platform\frontend`
   - `npm install`
3. 預期結果：安裝完成，沒有 `npm ERR!`。

### 1) 靜態檢查（必做）
步驟 1-1：Lint
1. 在視窗 A 執行 `npm run lint:web`。
2. 預期結果：顯示 `No ESLint warnings or errors`。

步驟 1-2：Type Check
1. 在視窗 A 執行 `npm run typecheck:web`。
2. 預期結果：
   - 顯示 `Route types generated successfully`
   - 無 TypeScript error

步驟 1-3：Build
1. 在視窗 A 執行 `npm run build:web`。
2. 預期結果：
   - 顯示 `Compiled successfully`
   - 最後有路由清單（含 `/login`、`/cart`、`/teacher/materials`）

### 2) 啟動本機網站（手動驗證用）
1. 在視窗 A 執行 `npm run dev:web:3010`。
2. 瀏覽器打開 `http://localhost:3010`。

### 3) 驗證共用元件（第二批元件）
步驟 3-1：`/teacher/materials` 頁面整合驗證
1. 打開 `http://localhost:3010/teacher/materials`。
2. 預期可看到：
   - `Select` 狀態篩選
   - `StatusBadge` 四種標籤
   - `Uploader` 上傳區
   - 開啟確認視窗按鈕（Dialog）
   - `Pagination`

### 4) 驗證 Select
1. 在 `/teacher/materials` 找到「狀態篩選」。
2. 點開下拉，切換不同選項（例如 `all` -> `draft`）。
3. 用鍵盤操作（上下鍵、Enter）選值。
4. 預期結果：
   - 選項可切換
   - 畫面摘要文案跟著變化（目前篩選狀態）

### 5) 驗證 Card/Badge
1. 在 `/teacher/materials` 看兩個卡片區塊（`SurfaceCard`）。
2. 檢查四個 badge（info/success/warning/error）。
3. 預期結果：
   - Card 有邊框與間距，內容清楚
   - Badge 顏色與文字狀態對應正確

### 6) 驗證 Dialog
1. 點「開啟確認視窗」。
2. 在 Dialog 內測試：
   - 點 `取消` 會關閉
   - 點 `確認送出` 會關閉
   - 按 `Esc` 可關閉
3. 預期結果：
   - 開關正常
   - 按鈕行為正確
   - 鍵盤可操作

### 7) 驗證 Uploader
1. 在 `/teacher/materials` 的 uploader 點「選擇檔案」。
2. 測試一個合法檔（如 `test.pdf`）。
3. 再測不合法情境：
   - 副檔名不在允許清單
   - 或檔案超過 10MB
4. 預期結果：
   - 合法檔會顯示「已選擇：檔名」
   - 不合法檔不應被接受（維持未選擇或清空）

### 8) 驗證 Pagination
1. 在 `/teacher/materials` 下方分頁區測試。
2. 點「下一頁」「上一頁」。
3. 到第 1 頁時上一頁應禁用；到最後頁下一頁應禁用。
4. 預期結果：
   - 頁碼顯示正確（第 X / Y 頁）
   - 禁用狀態正確
   - 可看到總筆數

### 9) 驗證共用狀態元件（指定頁面）
1. 仍在 `/teacher/materials`。
2. 在「共用狀態元件驗證」區塊依序點：
   - `Loading`
   - `Empty`
   - `Error`
3. 預期結果：
   - Loading 顯示載入中元件
   - Empty 顯示空狀態文案
   - Error 顯示錯誤狀態與錯誤碼，按 `retry` 會回到 loading

### 10) 回歸驗證（既有頁面）
步驟 10-1：`/login`
1. 打開 `http://localhost:3010/login`。
2. 驗證：
   - 按登入後按鈕變 `登入中...`
   - Input 可輸入、disabled 狀態合理
3. 預期結果：流程正常，無 UI 壞掉。

步驟 10-2：`/cart`
1. 打開 `http://localhost:3010/cart`。
2. 目前預設資料應進入 empty state。
3. 預期結果：顯示共用 `EmptyState` 內容。

### 11) RWD 快速檢查（建議）
1. 開 DevTools 裝置模式。
2. 測寬度：`375`、`768`、`1280`。
3. 預期結果：
   - 不爆版
   - 按鈕、輸入、Dialog 可操作

---

## 每日紀錄模板（複製使用）
### 日期：
### 今日目標：
- 

### 今日完成：
- 

### 驗證結果：
- lint:
- typecheck:
- build:
- RWD:
- states:
- form:
- role/permission:
- API error handling:
- SEO/a11y:

### 問題與阻塞：
- 

### 明日計劃：
- 
