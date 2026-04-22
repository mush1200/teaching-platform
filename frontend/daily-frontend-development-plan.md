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
請先開兩個 PowerShell 視窗：
- 視窗 A（前端）：`cd c:\teaching-platform\frontend` 後執行 `npm run dev:web -- --port 3010`
- 視窗 B（指令驗證）：`cd c:\teaching-platform\frontend`

步驟 A（驗證 loading）：
1. 開 `http://localhost:3010/login`
2. 在 Email 輸入 `parent@example.com`，密碼輸入 `123456`
3. 按「登入」
4. 預期結果：按下當下按鈕文字會變成 `登入中...`
5. 若沒看到：按 `Ctrl+F5` 強制重新整理再測一次

步驟 B（驗證 empty）：
1. 在視窗 B 執行：
   - `node -e "fetch('http://localhost:3010/cart',{headers:{cookie:'tp_token=fake; tp_role=parent'}}).then(async r=>{const t=await r.text(); console.log(t.includes('目前沒有資料（empty state）。')?'PASS':'FAIL');})"`
2. 預期結果：終端顯示 `PASS`
3. 若顯示 `FAIL`：確認前端 dev server 是否正在執行，以及網址埠口是否 `3010`

步驟 C（驗證 error）：
1. 在視窗 B 執行：
   - `node -e "fetch('http://localhost:3010/api/test-error/500').then(async r=>{const j=await r.json(); console.log(r.status, j.message);})"`
2. 預期結果：顯示 `500 server error`
3. 在畫面層（login）故意輸入錯帳密送出，也應顯示失敗提示

### 6) 驗證表單
以 `/login` 為例：
1. 必填驗證：
   - 清空 Email/密碼，按登入
   - 預期結果：顯示 `Email 格式不正確` 或必填訊息
2. 格式錯誤驗證：
   - Email 輸入 `abc`，密碼任意，按登入
   - 預期結果：顯示 `Email 格式不正確`
3. 送出失敗驗證：
   - Email 輸入 `nobody@example.com`，密碼 `bad`，按登入
   - 預期結果：顯示 `帳號或密碼錯誤，請重新登入。`
4. 送出成功驗證（需要後端有此帳號）：
   - 輸入有效帳密，按登入
   - 預期結果：顯示 `登入成功，正在導向...` 並跳轉頁面
5. API 角度確認（可選）：
   - `node -e "fetch('http://localhost:3010/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'',password:''})}).then(async r=>console.log(r.status,(await r.json()).message))"`
   - 預期結果：`400 email and password are required`

### 7) 驗證角色權限
在視窗 B 依序執行下列指令（每條都要看結果）：

1. 未登入（public）被擋下：
   - `node -e "fetch('http://localhost:3010/teacher/materials',{redirect:'manual'}).then(r=>console.log(r.status,r.headers.get('location')))" `
   - 預期結果：`307 /login?redirect=%2Fteacher%2Fmaterials`

2. parent 不可進 teacher：
   - `node -e "fetch('http://localhost:3010/teacher/materials',{headers:{cookie:'tp_token=fake; tp_role=parent'},redirect:'manual'}).then(r=>console.log(r.status,r.headers.get('location')))" `
   - 預期結果：`307 /403`

3. teacher 不可進 admin：
   - `node -e "fetch('http://localhost:3010/admin/materials',{headers:{cookie:'tp_token=fake; tp_role=teacher'},redirect:'manual'}).then(r=>console.log(r.status,r.headers.get('location')))" `
   - 預期結果：`307 /403`

4. admin 可進 admin：
   - `node -e "fetch('http://localhost:3010/admin/materials',{headers:{cookie:'tp_token=fake; tp_role=admin'},redirect:'manual'}).then(async r=>{const t=await r.text(); console.log(r.status,t.includes('Admin Materials'))})" `
   - 預期結果：`200 true`

### 8) 驗證 API 錯誤碼與提示
在視窗 B 執行一次全檢查：
- `node -e "Promise.all([401,403,404,500].map(async c=>{const r=await fetch('http://localhost:3010/api/test-error/'+c);const j=await r.json();console.log(c,'=>',r.status,j.message)}));"`

預期輸出（順序可不同）：
- `401 => 401 unauthorized`
- `403 => 403 forbidden`
- `404 => 404 not found`
- `500 => 500 server error`

畫面提示對照（login 頁）：
- `401`：帳號或密碼錯誤，請重新登入。
- `403`：你沒有此操作權限。
- `404`：找不到服務或資料。
- `500`：系統忙碌中，請稍後再試。

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
