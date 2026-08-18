# Local Development & Operations Guide

新接手者（或 AI 協作工具）啟動、測試、維運本專案的 **canonical 指引**。
目標是不必重新考古就能把環境跑起來、跑完回歸、並安全地做維運操作。

**本文件不重複既有規格。** 產品／API 契約見 `docs/teaching-platform-mvp-spec-v1.4.md`，
規則與角色邊界見 `docs/mvp_rules.md`，資料庫搬遷見 `docs/db-backup-and-migration.md`，
前端 UI 約定見 `docs/frontend-ui-architecture.md`。

---

## 1. Local ports

| 服務 | Port | 啟動指令 | 執行目錄 |
| --- | --- | --- | --- |
| **Backend**（Express） | **3000** | `npm run dev`（nodemon）或 `npm run start` | 專案根目錄 |
| **Frontend**（Next.js） | **3010** | `npm run dev:web:3010` | `frontend/` |

```bash
# 終端 A — Backend（3000）
npm run dev
```

```bash
# 終端 B — Frontend（3010）
cd frontend && npm run dev:web:3010
```

> ⚠️ **不要用 `npm run dev:web`**（等同 `next dev`）。它預設也綁 **3000**，會與 Backend 互搶。
> 一律使用 `dev:web:3010`，或自行指定其他非 3000 的 port。

Frontend 透過 `/api/backend/[...path]` proxy 轉發到 Backend，目標由 `API_BASE_URL` 決定
（未設定時預設 `http://localhost:3000`）。Playwright 的 `baseURL` 也是 `http://127.0.0.1:3010`。

Backend 監聽 port 由 `PORT` 決定，未設定時為 `3000`。

---

## 2. Database environments

| 用途 | 資料庫 | 說明 |
| --- | --- | --- |
| **Development** | `teaching_platform` | 日常開發。已完成 P0-5A buyer migration |
| **Security / integration test** | `teaching_platform_security_test` | security regression、smoke／Postman 整合測試、migration 演練 |

兩者 schema 目前一致，Backend 可正常指向任一個。

### Role 語意（重要）

- **Canonical DB role = `buyer`**。
- `parent` **僅保留為 legacy compatibility**，不再新增新的使用點。
  API 層仍會把 `buyer` 對外回成 `parent`（`normalizeRoleForClient`），這是既有相容行為。
- `users_role_check` 目前為**過渡四值版**：

  ```sql
  CHECK (role = ANY (ARRAY['teacher'::text, 'parent'::text, 'buyer'::text, 'admin'::text]))
  ```

  待 `parent` 長期為 0 且程式中無任何寫入路徑後，才另開 migration 收斂為三值
  （`teacher | buyer | admin`）。

- **不改寫歷史 `activity_logs.actor_role`**。稽核紀錄中既有的 `parent` 值反映寫入當下的
  真實角色，屬稽核軌跡的一部分，任何 role 遷移都不得回填或改寫。

### 測試 DB 的定位

`teaching_platform_security_test` **保留、不要刪除**，用途限於：

- security regression
- smoke / Postman 整合測試
- migration 演練（正式對 dev DB 動手前先在此驗證）

它**不是** production-like 的持久業務資料。裡面的資料可被測試任意增刪，
不要依賴其中任何一筆資料的長期存在。

---

## 3. Required environment variables

Backend 讀取 `Backend/.env`（**已 git-ignore**）。範本見 **`Backend/.env.example`**。
複製後填入實際值：

```bash
cp Backend/.env.example Backend/.env
```

| 變數 | 分類 | 說明 |
| --- | --- | --- |
| `PGHOST` | **required**（local） | 資料庫主機，本機通常 `localhost` |
| `PGPORT` | **required**（local） | 預設 `5432` |
| `PGUSER` | **required**（local） | 資料庫使用者 |
| `PGPASSWORD` | **required**（local） | 資料庫密碼 |
| `PGDATABASE` | **required**（local） | 目標資料庫名稱 |
| `DATABASE_URL` | optional | 若設定且非空，**優先於**上述 `PG*` 變數 |
| `JWT_SECRET` | **required** | 見 §4。**無 fallback**，缺少即拒絕啟動 |
| `JWT_EXPIRES_IN` | optional | token 效期，未設定時為 `7d` |
| `PORT` | optional | Backend 監聽 port，未設定時為 `3000` |
| `PUBLIC_BACKEND_URL` / `API_PUBLIC_URL` | optional | 產出上傳檔 URL 用的公開網域。非本機部署務必設定 |
| `SMTP_HOST` | optional | 交易信件（訂單／憑證通知） |
| `SMTP_PORT` | optional | 同上 |
| `SMTP_USER` | optional | 同上 |
| `SMTP_PASS` | optional | 同上 |
| `SMTP_FROM` | optional | 同上 |
| `TEST_ADMIN_EMAIL` | **test-only** | smoke / Postman 用，見 §6 |
| `TEST_ADMIN_PASSWORD` | **test-only** | 同上 |
| `ADMIN_EMAIL` | **ops-only** | 僅 admin CLI 使用，見 §5 |
| `ADMIN_PASSWORD` | **ops-only** | 同上 |
| `API_BASE_URL` | optional（frontend） | Next.js server 端 proxy 目標，預設 `http://localhost:3000` |

SMTP 未設定時服務仍可啟動，但交易信件會失敗；失敗會寫入 `activity_logs`
（`action = order_email_failed`）。可用 `npm run smtp:check --prefix Backend` 單獨測試。

> 🔒 **不得**把任何真實 credential 寫入 `.env.example`、本文件、測試腳本、
> Postman collection／environment 或任何進版控的檔案。

---

## 4. JWT rules

`JWT_SECRET` 由 `Backend/utils/jwt.js` 在**模組載入時**驗證，不符即拋錯，
交由 `Backend/index.js` 既有流程以 exit code 1 結束（fail fast）。

拒絕啟動的條件：

1. 未設定或為空白
2. 屬已知佔位值（例如 `dev-secret-change-me`，大小寫不敏感）
3. 長度短於 **32** 字元

規則：

- **不允許任何 hard-coded fallback**。寫死在原始碼裡的 secret 等同公開，
  任何人都能簽發任意 `userId` / `role`（含 admin）的 token。
- secret 必須是 **high-entropy、隨機產生**的值：

  ```bash
  openssl rand -base64 48
  ```

- 長度本身不代表安全 —— 可猜測的長密語同樣不合格。
- **輪換 secret 會使所有既有 JWT 立即失效**，全體使用者需重新登入
  （預設效期 `JWT_EXPIRES_IN=7d`）。屬需事先公告的維運事件。

---

## 5. Admin account management

**公開 `POST /auth/register` 永遠不能建立 admin。** 帶 `role: "admin"` 一律回 **403**；
公開可註冊角色僅 `teacher` / `parent`（legacy）/ `buyer`（canonical）。
平台**不提供**任何 admin registration HTTP endpoint。

Admin 只能由維運 CLI 建立：

```bash
ADMIN_EMAIL=<email> ADMIN_PASSWORD=<password> npm run create-admin --prefix Backend
```

| 項目 | 規則 |
| --- | --- |
| `ADMIN_EMAIL` | 必要。也可用 `--email <email>` 傳入 |
| `ADMIN_PASSWORD` | 必要。**優先用環境變數** —— CLI 參數會出現在 process list 與 shell history |
| 密碼長度 | **最少 16 字元**（以 trim 後長度計算），不足即拒絕建立並 exit 1 |
| role | 固定為 `admin`，呼叫端**不可**指定其他角色 |
| 重複 email | 安全失敗（exit 1），不覆寫既有帳號 |
| 輸出 | 只印 id / email / role / created，**絕不**輸出密碼或雜湊 |

CLI 會在寫入前印出目標資料庫名稱，執行時請確認是預期的 DB。

> 🔒 **不得**把 admin 密碼或其雜湊寫入 repo、文件或任何腳本。

---

## 6. Test admin（smoke / Postman）

`npm run smoke` 與 `npm run postman` 的 admin 步驟採**登入既有帳號**，
不會、也不能自行建立 admin。

憑證一律由環境變數提供：

- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`

**缺任一個時測試會明確失敗並指出缺少哪一個變數**，不會 fallback 成
公開 admin 註冊、hard-coded 密碼或預設帳號。

### 建立一組長期 test admin

```bash
# 1) 建立（密碼自行保管，至少 16 字元）
PGDATABASE=teaching_platform_security_test \
ADMIN_EMAIL=<test-admin-email> ADMIN_PASSWORD=<password> \
  npm run create-admin --prefix Backend

# 2) 執行測試時提供
TEST_ADMIN_EMAIL=<test-admin-email> TEST_ADMIN_PASSWORD=<password> \
  npm run smoke --prefix Backend
```

> 🔒 憑證**不得** hard-code 於 smoke script、Postman collection、
> `local.postman_environment.json` 或任何進版控的檔案。

---

## 7. Regression commands

### Frontend（在 `frontend/` 執行）

```bash
npm run typecheck:web
npm run build:web
npm run verify:web
```

`verify:web` = `lint:web` → `typecheck:web` → `build:web`，三者皆通過才算過。

### Backend / API（需先啟動 Backend，並提供 test admin 憑證）

```bash
npm run smoke --prefix Backend
npm run postman
```

### 完整回歸的定義

**`smoke` 與 `postman` 都必須全綠**，才算完整回歸：

- `npm run smoke` → `All smoke checks passed.`（exit 0）
- `npm run postman` → `assertions ... 0 failed` 且 `all Postman assertions passed.`（exit 0）

任一非零 exit 或任何 assertion 失敗，都不算通過 —— 不要只看最後幾行輸出。

---

## 8. Postman fixtures

```
docs/postman/fixtures/proof-a.jpg   (160 bytes, 1x1 baseline JPEG)
docs/postman/fixtures/proof-b.png   ( 70 bytes, 1x1 透明 PNG)
```

這兩個檔案是 `POST /orders/:id/upload-proof` multipart 流程的**自動化測試資產**：

- **不是**使用者上傳的內容，也不是產品資料
- 內容為最小合法圖檔位元組，不含任何真實個資或憑證
- 內容 deterministic，執行期不依賴任何外部下載

**不要刪除**，也**不要**把 collection 內的路徑改成本機絕對路徑
（先前的 `/path/to/proof-a.jpg` 佔位寫法讓 headless 執行長期無法通過）。
Collection 以相對路徑 `fixtures/proof-a.jpg` 引用，由
`Backend/scripts/run-postman.js` 設定的 `workingDir` 解析，因此在任何目錄執行都可重現。

細節見 `docs/postman/README.md`。

---

## 9. Auth boundary

| 層 | 實作 | 作用 |
| --- | --- | --- |
| **Backend authorization**（唯一真正的授權） | `Backend/middlewares/auth.js` 驗簽 JWT + `requireRole` | 所有資料存取的權限判斷 |
| **Frontend UX route guard**（非授權） | `frontend/apps/web/middleware.ts` | 只決定要不要渲染頁面外殼、導向 `/login` 或 `/403` |

- `tp_role` cookie = **frontend UX hint only**。它由瀏覽器以 `document.cookie` 寫入
  （非 HttpOnly），使用者可自行竄改。
- middleware **不讀取、不解碼、不驗證 JWT**。
- **不得**根據 `tp_role` 授權任何資料存取。
- 竄改 `tp_role=admin` 只會看到空的管理外殼，其所有 API 請求仍由後端回 403 —— 不會取得資料。
  `/api/backend/[...path]` proxy 只轉發 `Authorization` header、**不轉發 cookie**。

改為 server-set HttpOnly + Secure cookie 與伺服端 session 驗證屬 **Phase 2**，尚未實作。

---

## 10. DB backup / migration

跨電腦搬遷、備份與還原的完整步驟見 **`docs/db-backup-and-migration.md`**。
本節只補充**操作原則**：

1. **migration 前先 backup**。`pg_dump` 對來源是純讀取，10 MB 等級的資料庫成本可忽略：

   ```bash
   pg_dump -h <host> -p <port> -U <user> -d <database> -F p -f <備份路徑>
   ```

   備份檔請放在**專案外部**，避免誤提交。

2. **schema / data migration 一律包在單一 transaction**。PostgreSQL 的 DDL 具交易性，
   把約束變更與資料轉換放在同一個 `BEGIN ... COMMIT`，任何一步失敗會整批 rollback，
   不會留下半套狀態（例如「DEFAULT 已改但約束還沒改」）。

3. **destructive operation 前必須確認 DB target**。建議雙層 assertion：

   ```sql
   DO $$
   BEGIN
     IF current_database() <> '<expected-db>' THEN
       RAISE EXCEPTION 'ABORT: wrong database (%)', current_database();
     END IF;
   END $$;
   ```

   加上執行端（腳本／CLI）對連線目標的檢查。SQL 內建的 assertion 最可靠 ——
   即使連線指向錯誤，SQL 自己會拒絕執行。

4. **security 相關驗證優先使用 `teaching_platform_security_test`**。
   需要正常啟動 Backend 的 security 驗證，先確認：

   ```bash
   PGDATABASE=teaching_platform_security_test \
     node -e 'if(process.env.PGDATABASE!=="teaching_platform_security_test"){process.exit(1)}'
   ```

   通過後再啟動，並在每輪結束後唯讀複查 dev DB 未被更動。

---

## 11. Git / pre-push

pre-push hook 需先啟用一次：

```bash
npm run git-hooks
```

`.githooks/pre-push` 會執行 `scripts/git-pre-push-docs-check.mjs`：
**改動 Backend functional code 時，必須在同一次 push 中同步更新 canonical 文件**，否則 push 被拒。

### 觸發檢查的 functional paths

```
Backend/routes/          Backend/models/        Backend/services/
Backend/repositories/    Backend/migrations/    Backend/middlewares/
Backend/index.js         Backend/config/db.js
```

> 注意：`Backend/scripts/`、`Backend/utils/`、`Backend/package.json` **不在**清單內。

### 可滿足要求的 canonical docs（至少更新其一）

```
docs/mvp_rules.md
docs/teaching-platform-mvp-spec-v1.4.md
db/db_schema.sql
```

**不要繞過 hook。** 存在 `SKIP_CANONICAL_DOC_CHECK=1` 的逃生門，但那代表
「程式行為改了、文件沒跟上」—— 這正是本專案先前文件與實作分叉的成因。
真的需要繞過時，請在同一次 PR／commit 說明理由並補上文件。

---

## 12. Known non-blocking debt

以下為**已知但不阻擋開發**的項目，列此避免重複發現。**不要在無關的變更中順手修**：

| 項目 | 優先序 | 說明 |
| --- | --- | --- |
| 401 / 403 protected-area opt-in UX helper | **P1** | 目前各頁自行處理 API 錯誤；admin / creator 區域收到 401/403 時未統一導向 `/login` 或 `/403`。建議做成 opt-in helper 而非全域攔截（全域攔截會破壞公開頁與 buyer 頁的頁內錯誤態） |
| localStorage JWT → HttpOnly cookie migration | **Phase 2** | token 存於 localStorage，XSS 可竊取；另 cookie `max-age` 24h 與 `JWT_EXPIRES_IN` 7d 不一致，cookie 先過期會被登出 |
| 7 個 `@next/next/no-img-element` warning | **P2** | 前端使用 `<img>` 而非 `next/image`。`verify:web` 仍為 0 error |
| `manual_payment_proofs.reviewed_by` 重複 FK | **P2** | 同欄位上有 `manual_payment_proofs_reviewed_by_fkey` 與 `mpp_reviewed_by_fkey` 兩個功能相同的約束，為 bootstrap 重複建立所致，不影響行為 |

---

## 相關文件

| 文件 | 用途 |
| --- | --- |
| `docs/teaching-platform-mvp-spec-v1.4.md` | 產品／API 契約（canonical） |
| `docs/mvp_rules.md` | 規則、角色邊界、授權邊界（canonical） |
| `db/db_schema.sql` | Schema 參考（canonical） |
| `docs/db-backup-and-migration.md` | 備份／還原／跨機搬遷步驟 |
| `docs/postman/README.md` | Postman / Newman 執行與 fixtures |
| `docs/frontend-ui-architecture.md` | 前端元件分層與 token 選用 |
| `Backend/.env.example` | 環境變數範本 |
