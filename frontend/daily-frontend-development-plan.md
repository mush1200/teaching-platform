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
- [x] 建立共用元件：Button/Input/Select/TextArea/Card/Badge/Dialog/Uploader/Pagination
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
- [x] `/materials` 教材列表
- [x] `/materials/[id]` 教材詳情
- [x] `/login`、`/register`（目前已完成 `/login`）
- [x] `/cart`、`/checkout`
- [x] `/orders`、`/orders/[id]/upload-proof`
- [x] `/downloads`

## 3) teacher 後台（Day 11-13）
- [x] `/teacher/materials`
- [x] `/teacher/materials/new`
- [x] `/teacher/materials/[id]/edit`

## 4) admin 後台（Day 14-17）
- [x] `/admin/materials`
- [x] `/admin/orders`
- [x] `/admin/payment-proofs`
- [x] `/admin/reports`
- [x] `/admin/activity-logs`

## 5) 品質補強（Day 18-20）
- [x] 404 / 403 / 500 錯誤頁
- [x] SEO / OG metadata
- [x] accessibility（鍵盤操作、語意化）
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
- [x] `npm run lint:web` 通過
- [x] `npm run typecheck:web` 通過
- [x] `npm run build:web` 通過
- [ ] 手動驗證三種版面：mobile / tablet / desktop
- [ ] 驗證 loading / empty / error 三態
- [ ] 驗證表單：必填、格式錯誤、送出失敗、送出成功
- [ ] 驗證角色權限（public/parent/teacher/admin）顯示正確
- [ ] 驗證 API 錯誤碼（至少 401/403/404/500）有可理解提示
- [ ] 驗證公開頁 metadata（title/description/OG）與基本 a11y

> 狀態備註（2026-04-24）：lint / typecheck / build 已於本輪開發完成並通過；其餘項目屬瀏覽器手動驗證，尚待逐項實測後勾選。

---

## 本次開發驗證流程（逐步執行版，照順序做）

以下步驟對應目前 **公開頁、註冊登入、購物車、結帳、訂單、上傳憑證、下載** 等實作。每完成一階段再往下，避免遺漏。

---

### 0) 準備專案與依賴（專案已存在時可改做「步驟 0-2 僅確認」）

**步驟 0-1** 開啟一個 PowerShell 視窗（以下稱 **視窗 A**），工作目錄改到 monorepo 前端根目錄。  
執行：

```text
cd c:\teaching-platform\frontend
```

**步驟 0-2** 安裝依賴（若已安裝且 `node_modules` 完整，可略過）。  
執行：

```text
npm install
```

**步驟 0-3** 檢查安裝成功：終端最後不應出現 `npm ERR!` 紅字，且能正常回到提示字元。

---

### 1) 靜態檢查（必做，通過才做手動驗證）

**步驟 1-1：ESLint**

1. 在 **視窗 A** 執行：
   ```text
   npm run lint:web
   ```
2. 預期：出現 `No ESLint warnings or errors`（或專案預設的零警告/零錯誤訊息）。
3. 若失敗：依報告檔名與行數修正後，**重複步驟 1-1** 直到通過。

**步驟 1-2：TypeScript**

1. 在 **視窗 A** 執行：
   ```text
   npm run typecheck:web
   ```
2. 預期：有 `Route types generated successfully`，且**沒有** `error TS` 開頭的錯誤。
3. 若失敗：修正型別或匯入後，**重複步驟 1-2** 直到通過。

**步驟 1-3：正式建置**

1. 在 **視窗 A** 執行：
   ```text
   npm run build:web
   ```
2. 預期：出現 `Compiled successfully`；最後的路由表含（至少）  
   `/materials`、`/materials/[id]`、`/login`、`/register`、`/cart`、`/checkout`、`/orders`、`/orders/[id]/upload-proof`、`/downloads` 等。
3. 若失敗：讀取建置最前面的第一個 error 先修，**重複步驟 1-3** 直到通過。

**步驟 1-4** 僅在 1-1～1-3 **全部通過**後，才進入第 2 節手動驗證。

---

### 2) 後端與環境變數（要測「有 API 」與「斷線」兩種情境）

**步驟 2-1** 另開一個 PowerShell（**視窗 B**），在專案內**啟動本專案後端**（依你們慣用指令，例如從 `c:\teaching-platform\Backend` 執行啟動腳本），讓 API 可從本機被存取。  
（若團隊固定埠別，預設以 `http://localhost:3000` 為例。）

**步驟 2-2** 若改後端位址，在執行 `next` 的環境中設定 `API_BASE_URL` 指到真實後端根位址，**重啟** `dev:web:3010` 後再測（否則代理會打錯主機）。

**步驟 2-3** 要測 error 三態與斷線訊息時：關掉 **視窗 B** 的後端、**不**關前端，在瀏覽器操作需打 API 的頁面，應出現可讀的失敗/重試或說明，而不是白畫面或僅 raw error。

---

### 3) 啟動前端（手動驗證用）

**步驟 3-1** 在 **視窗 A** 執行：
```text
npm run dev:web:3010
```

**步驟 3-2** 用瀏覽器開啟 `http://localhost:3010`  
**步驟 3-3** 之後所有路徑都改把 `3010` 當成你實際的埠號（若改用別埠，請自行替換網址）。

---

### 4) 公開頁：`/materials`（列表）

**步驟 4-1** 開啟 `http://localhost:3010/materials`  
**步驟 4-2** 觀察 **Loading**：首屏或重新整理時，應短暫出現載入狀態，再出現內容或空狀態。  
**步驟 4-3** 若後端有上架教材：應出現教材卡片；點一筆可進入詳情（步驟 5）。  
**步驟 4-4** 若沒有教材或僅測 empty：應出現 `EmptyState` 類空狀態，不是壞版。  
**步驟 4-5** 關閉後端再重新整理本頁：應出現 **Error** 與可點的 **重試**；點重試，行為合理。  
**步驟 4-6**（選做）開發者工具 → Network，確認資料來自同源 `/api/backend/materials`，且狀態 200 / 對應錯誤碼。

---

### 5) 公開頁：`/materials/[id]`（詳情／加入購物車）

**步驟 5-1** 從列表點任一教材；若手動輸入網址，請將 `[id]` 換成真實教材 id。  
**步驟 5-2** **未登入**：應看得到教材資訊；區塊內應有引導「前往登入」之類連結，不要誤顯示已登入才能用的操作誤導。  
**步驟 5-3** 登入為 **家長**：輸入數量後按「加入購物車」，預期成功訊息或導向購物車（依目前實作）；按鈕在送出中應為 loading/disabled。  
**步驟 5-4** 登入為 **老師／管理員**：嘗試加入購物車，預期出現「僅家長」或權限相關提示（與後端一致）。  
**步驟 5-5** 故意輸入錯誤數量（例如 0、負數、空白）：預期出現前端驗證訊息，不送出。  
**步驟 5-6** 檢視分頁標題（metadata）：瀏覽器分頁標題應大致反映教材名稱（詳情頁若有 `generateMetadata`）。

---

### 6) `／register` 與 `／login`（表單）

**步驟 6-1** 開啟 `http://localhost:3010/register`  
**步驟 6-2** **必填與格式**：清空 Email 送出，預期 Email 錯誤提示；密碼少於 6 字元預期提示。  
**步驟 6-3** **成功路徑**：填合法資料、身分選「家長」或「老師」，送出後預期簡短成功說明並導向首頁（或約定頁）；localStorage／cookie 依登入規格寫入（可依專案既有鍵名檢查）。  
**步驟 6-4** **失敗路徑**：後端若回重複信箱（409），預期顯示可讀文案，而非僅數字 status。  
**步驟 6-5** 開啟 `http://localhost:3010/login`  
**步驟 6-6** 確認與 `/register` 互相有連結；輸入錯誤密碼預期 401 對應說明；送出中按鈕為「登入中…」且欄位 disabled 合理。

---

### 7) `／cart`（購物車）

**步驟 7-1** **未登入**開啟 `http://localhost:3010/cart`，預期引導登入，而不是空白錯誤。  
**步驟 7-2** **家長已登入**且購物車有品項：應列出項目、價格、數量；改數量後按「更新數量」應反映後端結果。  
**步驟 7-3** 按「移除」：該列消失或列表更新；若最後一筆移除，預期進入 **empty** 狀態。  
**步驟 7-4** 點「前往結帳」連到 `/checkout`。

---

### 8) `／checkout`（成立訂單）

**步驟 8-1** **未登入**開 `/checkout`，預期引導登入。  
**步驟 8-2** **非家長**登入後開 `/checkout`，預期阻擋說明（僅家長可結帳）。  
**步驟 8-3** **家長**且購物車非空：按「成立訂單」，預期成功後導向 **`/orders/[id]/upload-proof`** 或訂單列表（依目前實作）；購物車應被清空（後端行為）。  
**步驟 8-4** **購物車為空**時按成立訂單：預期 400 類說明（例如購物車為空），且畫面可理解。

---

### 9) `／orders`（我的訂單）

**步驟 9-1** 未登入開 `http://localhost:3010/orders`，預期引導登入。  
**步驟 9-2** 登入後有訂單：列表顯示訂單編號、狀態、金額；每筆有「上傳付款憑證」連結。  
**步驟 9-3** 無訂單：預期 **empty** 狀態。  
**步驟 9-4** 關閉後端再載入本頁：預期 **error** 與重試。

---

### 10) `／orders/[id]/upload-proof`（上傳付款憑證）

**步驟 10-1** 從訂單列表點進某一筆 `upload-proof`，網址中的 `id` 須為真實訂單 id。  
**步驟 10-2** **憑證網址**：輸入非網址字串（例如 `abc`），預期 Zod／前端提示「有效網址」。  
**步驟 10-3** 輸入合法 `https://...` 連結並送出：預期成功訊息；若訂單狀態不允許，預期後端錯誤訊息（400/403/404）且前端顯示可讀文字。  
**步驟 10-4** 未登入時開此頁：預期引導登入或清楚說明。

---

### 11) `／downloads`（取得下載連結）

**步驟 11-1** 未登入開 `http://localhost:3010/downloads`，預期引導登入。  
**步驟 11-2** 登入後：若剛結帳成功，預期 **sessionStorage** 帶入的教材列在清單（同一瀏覽器、未清資料前提下）；每筆可按「取得下載連結」。  
**步驟 11-3** **尚未付款／無權限**：預期 403 或後端訊息在前端可讀，不要只顯示空白。  
**步驟 11-4** 「手動輸入教材 ID」：輸入一個 id 測試；有權限時應出現可點的下載連結。

---

### 12) 全站頂部導覽與首頁（Smoke）

**步驟 12-1** 在任一含 **SiteHeader** 的頁面（例如 `/materials`），逐個點：教材、購物車、結帳、訂單、下載、登入、註冊，確認網址正確且無 404（除非故意）。  
**步驟 12-2** 開 `http://localhost:3010`，確認首頁有教材／購物車／登入／註冊等連結且可點。

---

### 13) RWD（三種寬度）

**步驟 13-1** 開 DevTools「響應式／裝置」模式。  
**步驟 13-2** 依序將可視寬度設為 **375**、**768**、**1280**，各停留於 **`/materials`、`/cart`、`/login`** 檢查：  
**步驟 13-3** 預期：版面不溢出、頂部導覽可換行仍可用、按鈕與輸入框可點、不需橫向捲動才能操作主流程。

---

### 14) 錯誤碼與 metadata／a11y（對照「必做清單」）

**步驟 14-1** 使用或模擬以下情境，確認畫面上是**中文說明**而非僅 `401`：  
未登入打需登入 API、無權限、找不到資源、伺服器錯誤（可用專案內測試路由若存在）。  
**步驟 14-2** 公開頁（如 `/materials`、教材詳情）用「檢視原始碼」或擴充套件確認有 **title／description**（OG 若有設定一併看）。  
**步驟 14-3** 鍵盤操作：在 `/login`、`/register` 用 Tab 掃過可聚焦順序合理；主要按鈕可用 Enter／Space（依元件行為）觸發。

---

### 15)（選擇性）共用元件展示頁 `／teacher／materials`

若本次改動涉及 **Select／Dialog／Uploader／Pagination／三態元件**，加做：

**步驟 15-1** 開 `http://localhost:3010/teacher/materials`  
**步驟 15-2** 依頁面上「示範區」操作 Select、Dialog、Uploader、Pagination、Loading／Empty／Error 切換，確認無回歸。

---

### 16) 驗收勾選（對齊文件開頭「必做清單」）

完成上述步驟後，回到「## 每次開發都要做的前端驗證步驟（必做清單）」逐項打勾：lint、typecheck、build、RWD、三態、表單、角色、API 錯誤、metadata／a11y。

---

## 10-15 分鐘最短手測 Checklist（可直接勾）

- [ ] **前置**
- [X] 啟動前端：`npm run dev:web:3010`
- [x ] 開啟 `http://localhost:3010`
- [x ] DevTools 已開（Responsive + Network）

- [x ] **RWD（三斷點）**
- [x ] `/materials` 在 `375` 無版面破版、可操作、無需水平捲動主流程
- [x ] `/materials` 在 `768` 無版面破版、可操作
- [x ] `/materials` 在 `1280` 無版面破版、可操作
- [ x] Header 連結（教材/購物車/結帳/訂單/下載/登入/註冊）都可點擊導頁

- [ ] **三態（loading / empty / error）**
- [ ] `/materials` 重新整理可觀察到 loading 狀態
- [ ] `/teacher/materials` 透過篩選切出 empty 狀態（或實際無資料）
- [ ] 關 backend 後，`/materials` 或 `/orders` 顯示可讀 error + retry（非白畫面）
- [ ] backend 重開後頁面可恢復讀取

- [ ] **表單驗證**
- [ ] `/login` 空值送出會顯示錯誤提示
- [ ] `/login` 錯誤帳密顯示失敗提示（401 類）
- [ ] `/login` 正確帳密可成功登入與導頁
- [ ] `/register` Email 格式錯誤有提示
- [ ] `/register` 密碼長度不足有提示
- [ ] `/register` 合法資料可成功送出
- [ ] `/teacher/materials/new` 必填缺漏（title/price/fileKey）會擋送出
- [ ] `/teacher/materials/new` 非法價格（0/非數字）會顯示提示
- [ ] `/teacher/materials/new` 合法資料送出成功（可導到 edit）

- [ ] **角色權限**
- [ ] 未登入開 `/cart` 會被導向登入或阻擋
- [ ] 未登入開 `/teacher/materials` 會被導向登入或阻擋
- [ ] 未登入開 `/admin/materials` 會被導向登入或阻擋
- [ ] parent 帳號可用 `/cart`
- [ ] parent 帳號不可用 `/teacher/*`、`/admin/*`
- [ ] teacher 帳號可用 `/teacher/*`
- [ ] teacher 帳號不可用 `/admin/*`
- [ ] admin 帳號可用 `/admin/*`（含 materials/orders/payment-proofs/reports/activity-logs）

- [ ] **API 錯誤碼可理解提示**
- [ ] `/api/test-error/401` 回應正確（401 + message）
- [ ] `/api/test-error/403` 回應正確（403 + message）
- [ ] `/api/test-error/404` 回應正確（404 + message）
- [ ] `/api/test-error/500` 回應正確（500 + message）
- [ ] 實頁錯誤情境（如 backend 關閉）顯示人類可讀訊息，不是 raw error

- [ ] **Metadata / a11y**
- [ ] `/` 分頁標題與描述正確
- [ ] `/materials` 分頁標題與描述正確
- [ ] `/materials/[id]` 分頁標題與描述正確
- [ ] `/login` 用 Tab 可依序聚焦主要欄位與按鈕
- [ ] `/register` 用 Tab 可依序聚焦主要欄位與按鈕
- [ ] 主要送出按鈕可用 Enter/Space 觸發

- [ ] **文件回填（對應必做清單）**
- [ ] 手動驗證三種版面：mobile / tablet / desktop
- [ ] 驗證 loading / empty / error 三態
- [ ] 驗證表單：必填、格式錯誤、送出失敗、送出成功
- [ ] 驗證角色權限（public/parent/teacher/admin）顯示正確
- [ ] 驗證 API 錯誤碼（至少 401/403/404/500）有可理解提示
- [ ] 驗證公開頁 metadata（title/description/OG）與基本 a11y

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
