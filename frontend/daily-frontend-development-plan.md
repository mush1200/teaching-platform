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
- [ ] 建立 design tokens（色彩、字級、間距、圓角、陰影）
- [ ] 建立共用元件：Button/Input/Select/TextArea/Card/Badge/Dialog/Uploader/Pagination
- [ ] 建立共用狀態元件：LoadingState/EmptyState/ErrorState

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

### 4) 驗證三種版面（RWD）
1. 在 `frontend` 執行 `npm run dev:web`
2. 開 `http://localhost:3000/login`
3. 按 `F12` 開發者工具 -> 切換裝置模式（手機圖示）
4. 依序看寬度：
   - mobile：`375`
   - tablet：`768`
   - desktop：`1280`
5. 檢查是否「沒有爆版、按鈕看得到、輸入框可輸入」。

### 5) 驗證 loading / empty / error 三態
1. loading：在頁面資料載入前先顯示「讀取中」文字或骨架。
2. empty：把資料清單設成空陣列 `[]`，應顯示「目前沒有資料」。
3. error：把 API 暫時改成錯誤路徑（例如 `/api/not-exist`），應顯示錯誤提示與重試按鈕。

### 6) 驗證表單
以 `/login` 為例：
1. 必填：Email/密碼都空，按登入 -> 應顯示必填訊息。
2. 格式錯誤：輸入 `abc` 當 Email -> 應顯示格式錯誤。
3. 送出失敗：把 API 指到錯誤帳密 -> 應顯示登入失敗訊息。
4. 送出成功：輸入正確帳密 -> 應導頁或顯示成功訊息。

### 7) 驗證角色權限
1. 未登入（public）：只能看公開頁，進後台頁應被擋下。
2. parent：可看購買流程，不可進 teacher/admin 頁。
3. teacher：可進 teacher 頁，不可進 admin 頁。
4. admin：可進所有管理頁。

### 8) 驗證 API 錯誤碼與提示
手動觸發並確認畫面訊息：
- `401`：未登入或 token 過期 -> 顯示「請先登入」。
- `403`：權限不足 -> 顯示「你沒有此操作權限」。
- `404`：資料不存在 -> 顯示「找不到資料」。
- `500`：伺服器錯誤 -> 顯示「系統忙碌，請稍後再試」。

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
