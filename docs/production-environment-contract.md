# Production Environment Contract（`PRE-09`）

> ## ⚠️ 2026-08-31 — 儲存章節已被 `DEC-16` 更新（`PRE-13`）
>
> 本文件成稿時，production 的私有儲存是 **Render Persistent Disk ＋ `local` driver**（`DEC-13`）。
> Owner 已於同日改採 **NT$0 MVP 部署目標**，`local` driver 因此**不再是 production 路徑** ——
> 免費方案一律不提供 persistent volume。canonical 決策見
> **`docs/mvp-nt0-deployment-decision-2026-08-31.md`**。
>
> **對本文件的具體影響（其餘章節不受影響，仍然有效）：**
>
> | 變數 | 本文件原本的分類 | 現況（`DEC-16` 之後） |
> | --- | --- | --- |
> | `PRIVATE_FILE_STORAGE_DRIVER` | `OPTIONAL`（production 必須維持 `local`） | **production ＝ `s3`**。`local` 僅供本機開發 |
> | `PRIVATE_FILE_STORAGE_PATH` | `REQUIRED — FAIL CLOSED` | **僅 `local` driver 適用。driver=s3 時不使用，且不應設定** |
> | `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | `REQUIRED — FAIL CLOSED` | **同上 —— NT$0 production 不需要、也不應設定** |
> | `PRIVATE_FILE_STORAGE_S3_BUCKET` / `_ENDPOINT` / `_REGION` | 尚不存在 | **新增，`REQUIRED — FAIL CLOSED`** |
> | `PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | 尚不存在 | **新增，`REQUIRED — FAIL CLOSED` ＋ SECRET** |
> | `PRIVATE_FILE_STORAGE_S3_FORCE_PATH_STYLE` | 尚不存在 | **新增，`OPTIONAL`**（預設 true） |
>
> **§5 的 secret 清單因此多兩項**：`PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID` 與
> `PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY`。§5 的五條規則原封適用。
>
> **`local` driver 的三條 fail-closed 完全未被放寬**，且已由
> `Backend/tests/privateFileStorageConfig.test.js` 釘住（`PRE-13`）。
>
> §4（資料庫只有一條 production 路徑）的技術結論**完全不變**，
> 但 provider 由 Render Postgres 改為 **Neon**（Render 免費 Postgres 建立 30 天後到期）。
> `sslmode=require` 仍然適用 —— Neon 使用公開 CA 簽發的憑證。

> **這份文件定義「應用程式需要什麼設定」，不定義「Render 上怎麼給」。**
> 後者是 `PRE-07` 的工作，邊界見 §8。
>
> **本文件不部署任何東西。** 未建立 Render 服務、未設定 SMTP、未變更 DNS、
> 未購買網域、未建立 production 資料庫、未修改任何 production code／schema／migration。
>
> 每一條「失敗行為」都以 **repo 讀碼 ＋ 實測**確認，不是推論。實測方法見 §10。

| 項目 | 值 |
| --- | --- |
| Ticket | `PRE-09` |
| 日期 | 2026-08-31 |
| 依據的 Owner 決策 | `DEC-13` Render／`DEC-14` Resend／`DEC-15` fresh DB |
| Production 網域 | **PENDING OWNER DECISION / PURCHASE**（不阻塞本文件，見 §7） |

---

## 1. 分類定義

每個變數**只屬於一類**，依**實際 runtime 行為**分類，不依偏好。

| 類別 | 意義 |
| --- | --- |
| `REQUIRED — FAIL CLOSED` | production 缺少／不合法時**程序拒絕啟動**（或在第一次使用前就 throw 導致無法服務） |
| `REQUIRED — CURRENTLY FAILS SOFT` | production 一定要有，但缺少時**服務照常啟動**，只是行為錯誤或功能靜默失效 |
| `OPTIONAL` | 有預設值，缺少不影響正確性 |
| `DEVELOPMENT / TEST ONLY` | 只被測試、腳本或本機工具讀取，production 不需要 |
| `DERIVED / PLATFORM PROVIDED` | 由平台注入，不由人手設定 |
| `PENDING OWNER DOMAIN` | production 必需，但**值**取決於尚未鎖定的網域 |

---

## 2. 環境變數普查（census）

盤點範圍：`Backend/`、`frontend/apps/web/`、`frontend/scripts/`、`*.config.*`、
`package.json`、`.env*`、`docs/`。排除 `node_modules/` 與所有 Next 建置產物
（`.next*`）—— 後者含大量 Next／Tamagui 內部變數，**不是本專案的設定介面**。

> **普查必須同時涵蓋動態讀取。** 本 repo 有 5 處 `process.env[<變數>]` 的間接讀法
> （`config/privateFileStorage.js:64,65,77`、`scripts/api-smoke-test.js:74`、
> `scripts/run-postman.js:26`），只 grep `process.env.NAME` 會**漏掉**
> `PRIVATE_FILE_STORAGE_DRIVER`／`PRIVATE_FILE_STORAGE_PATH`／四個 `MAX_*`／
> `MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS` 這一整組。

### 2.1 Backend — production 相關

| Variable | Consumer | Purpose | Production required? | Secret? | Current fallback/default | Failure behavior | 類別 |
| --- | --- | --- | :--- | :--- | --- | --- | --- |
| `NODE_ENV` | `config/privateFileStorage.js`、`routes/payment.js:25` | 武裝三條儲存 fail-closed 分支；並在 `/payment/bank-info` **隱藏未設定的變數名稱清單** | **是** | 否 | 無（未設 ＝ 非 production） | 未設 → 三條 fail-closed **全部不武裝**，且 `/payment/bank-info` 會對已登入者吐出 `missing: [...]` 變數名 | **`REQUIRED — FAIL CLOSED`**（它是那些檢查的開關本身） |
| `JWT_SECRET` | `utils/jwt.js:27-53` | 簽發／驗證 JWT | **是** | **是** | **無 fallback（刻意）** | 缺／空白／已知佔位值／< 32 字元 → **module load 即 throw，程序起不來** | `REQUIRED — FAIL CLOSED` |
| `JWT_EXPIRES_IN` | `utils/jwt.js`＋`config/productionUrlContract.js` | token 有效期 | 否 | 否 | `"7d"` | **【`PRE-12`，2026-09-03 起】載入 `utils/jwt.js` 時即驗證格式**：未設 → 沿用預設 `7d`；設了但空白或非法（實測 `"abc"`／`"7dd"`）→ **拒絕啟動**。~~先前要到第一次登入才 throw~~ | **`REQUIRED — FAIL CLOSED`**（設了就必須合法；所有環境） |
| `DATABASE_URL` | `config/db.js` | 資料庫連線（**production 唯一可行路徑**，見 §4） | **是** | **是**（內含密碼） | 無 | 與 `PG*` 皆缺 → throw；程序起不來 | `REQUIRED — FAIL CLOSED` |
| `PGHOST`／`PGPORT`／`PGUSER`／`PGPASSWORD`／`PGDATABASE` | `config/db.js` | 離散連線參數 | **否（production）** | `PGPASSWORD` 是 | `localhost`／`5432`／`postgres`／`""`／`postgres` | 與 `DATABASE_URL` 皆缺 → throw | **`DEVELOPMENT / TEST ONLY`**（理由見 §4） |
| `PRIVATE_FILE_STORAGE_DRIVER` | `config/privateFileStorage.js:127` | 儲存 driver | 否 | 否 | `local` | 非 `local` → **throw**（物件儲存未實作） | `OPTIONAL`（production 必須維持 `local`，`DEC-13`） |
| `PRIVATE_FILE_STORAGE_PATH` | 同上 `:140` | 私有檔案根目錄 | **是** | 否 | `Backend/private-storage` | production ＋ local ＋ 未設 → **throw**（實測） | `REQUIRED — FAIL CLOSED` |
| `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | 同上 `:152` | 明示承認該路徑是持久化磁碟 | **是** | 否 | 未設 ＝ false | production ＋ local ＋ 非 truthy → **throw**（實測） | `REQUIRED — FAIL CLOSED` |
| `MATERIAL_FILE_STORAGE_{DRIVER,PATH,ALLOW_LOCAL_IN_PRODUCTION}` | 同上 | 上三者的 **legacy 別名** | 否 | 否 | —— | 與 canonical 同時設定且**值不同** → **throw**（實測） | `OPTIONAL`（**production 不要用**） |
| `MAX_MATERIAL_FILE_BYTES` | `config/privateFileStorage.js:88` | 教材本體上限 | 否 | 否 | `104857600`（100 MB） | 非正數 → throw（實測 `"0"`／`"-5"`／`"abc"`）；由 `routes/teacherUpload.js` 於 module load 讀取 → 起不來 | `OPTIONAL` |
| `MAX_PAYMENT_PROOF_BYTES` | 同上 `:98` | 憑證上限 | 否 | 否 | `10485760`（10 MB） | 同上；`routes/order.js:26` 於 **module load** 讀取 → 起不來（實測） | `OPTIONAL` |
| `MAX_MATERIAL_MEDIA_IMAGE_BYTES` | 同上 `:108` | 素材圖片上限 | 否 | 否 | `10485760` | 同上 | `OPTIONAL` |
| `MAX_MATERIAL_MEDIA_VIDEO_BYTES` | 同上 `:112` | 試看影片上限 | 否 | 否 | `83886080`（80 MB） | 同上 | `OPTIONAL` |
| `MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS` | 同上 `:116` | 下載票證存活秒數 | 否 | 否 | `300` | 非正數 → throw；空字串 → 回退預設（實測） | `OPTIONAL` |
| `PUBLIC_BACKEND_URL` | `utils/publicUrl.js:11`＋`config/productionUrlContract.js` | Backend 對外絕對 URL；**會被寫進資料列** | **是** | 否 | `http://localhost:<PORT>`（**僅 dev／test**） | **【`PRE-12`，2026-09-03 起】production 未設／空白／非 URL／非 http(s)／loopback → 拒絕啟動**（`index.js` 於 `ensureCoreTables()` 與 `app.listen()` 之前）。~~先前靜默回退並永久寫入 `cover_image_url`~~ | **`REQUIRED — FAIL CLOSED`** ＋ `PENDING OWNER DOMAIN` |
| `API_PUBLIC_URL` | 同上 | `PUBLIC_BACKEND_URL` 的別名 | 否 | 否 | —— | 兩者皆未設才回退 localhost | `OPTIONAL`（別名，擇一即可） |
| `PUBLIC_WEB_URL` | `services/emailService.js:22`＋`config/productionUrlContract.js` | 信件內連結的網域基準 | **是** | 否 | `http://localhost:3001`（**僅 dev／test**；dev 前端其實是 3010） | **【`PRE-12`，2026-09-03 起】production 未設／空白／非 URL／loopback → 拒絕啟動**（Owner 決定為 fail-closed，非警告）。~~先前每一封交易信連結都指向 localhost~~ | **`REQUIRED — FAIL CLOSED`** ＋ `PENDING OWNER DOMAIN` |
| `FRONTEND_URL`／`APP_BASE_URL` | 同上 | `PUBLIC_WEB_URL` 的別名 | 否 | 否 | —— | 同上 | `OPTIONAL`（別名） |
| `SMTP_HOST` | `services/emailService.js:29` | SMTP 主機 | **是** | 否 | 無 | 缺 → **第一次寄信**時 throw，被 `dispatchBestEffort` 接住 → **啟動正常、收單正常、一封信都不寄**（`REL-03`） | `REQUIRED — CURRENTLY FAILS SOFT` |
| `SMTP_PORT` | 同上 `:30` | SMTP 埠 | **是** | 否 | `587` | 非數字 → `Number()` 得 `NaN` → `secure: NaN === 465` 為 false，連線於寄信時失敗（同樣被接住） | `REQUIRED — CURRENTLY FAILS SOFT` |
| `SMTP_USER` | 同上 `:31` | SMTP 帳號 | **是** | 否（Resend 為固定值 `resend`） | 無 | 同 `SMTP_HOST` | `REQUIRED — CURRENTLY FAILS SOFT` |
| `SMTP_PASS` | 同上 `:32` | SMTP 密碼（Resend ＝ API key） | **是** | **是** | 無 | 同 `SMTP_HOST` | `REQUIRED — CURRENTLY FAILS SOFT` |
| `SMTP_FROM` | 同上 `:57,120` | 寄件人位址 | **是** | 否 | 回退 `SMTP_USER` | 未設 → 寄件人變成 SMTP 帳號字串（Resend 情境下即字面 `resend`，不是合法位址） | `REQUIRED — CURRENTLY FAILS SOFT` ＋ `PENDING OWNER DOMAIN` |
| `PAYMENT_BANK_NAME`／`_CODE`／`_ACCOUNT`／`_ACCOUNT_NAME` | `config/paymentBankInfo.js` | 買家實際匯款的目標帳戶 | **是** | 視同敏感營運資料 | 無 | **刻意不 throw**（`:26` 註解明載）→ 付款指示顯示「尚未設定」，四值缺任一即全部不可用；已知佔位帳號會被拒絕 | `REQUIRED — CURRENTLY FAILS SOFT`（**設計如此**） |
| `PORT` | `index.js:158`、`utils/publicUrl.js:15` | 監聽埠 | 否 | 否 | `3000`；非法值（非數字／超出 1–65535）**回退 3000 而不報錯** | 埠被占用 → `EADDRINUSE` → `process.exit(1)` | `DERIVED / PLATFORM PROVIDED` |

### 2.2 Backend — 非 runtime（腳本／測試）

| Variable | Consumer | 類別 |
| --- | --- | --- |
| `ADMIN_EMAIL`／`ADMIN_PASSWORD` | `scripts/create-admin.js` | **維運 CLI 專用** —— 建立 initial Admin 時一次性提供（CLAUDE.md §3：admin **只能**由此建立）。`ADMIN_PASSWORD` 為 secret，**不得寫入任何檔案** |
| `SMTP_TEST_TO` | `scripts/smtp-smoke-test.js` | `DEVELOPMENT / TEST ONLY`（`PRE-10` 驗證時使用） |
| `API_SMOKE_BASE` | `scripts/api-smoke-test.js` | `DEVELOPMENT / TEST ONLY` |
| `POSTMAN_BASE_URL` | `scripts/run-postman.js` | `DEVELOPMENT / TEST ONLY` |
| `PGDATABASE`（測試用途） | `scripts/run-db-tests.js` 與 40 支 `*.db.test.js` | `DEVELOPMENT / TEST ONLY` —— 硬釘 `teaching_platform_security_test`，**不得為 production 放寬** |

### 2.3 Frontend（`frontend/apps/web/`）

| Variable | Consumer | Purpose | Production required? | Secret? | Fallback | Failure behavior | 類別 |
| --- | --- | --- | :--- | :--- | --- | --- | --- |
| `API_BASE_URL` | **單一** accessor `lib/server-api-base-url.ts`（五個呼叫點已於 `PRE-12` 收斂） | Next server 端呼叫 Backend 的位址 | **是** | 否 | `http://localhost:3000`（**僅 dev／test**） | **【`PRE-12`，2026-09-03 起】production 未設／空白／非 URL／loopback → 明確 throw**。~~先前五處各自靜默回退 localhost，整站 API 失效且無錯誤指出原因~~ | **`REQUIRED — FAIL CLOSED`** |
| `PORT` | `next start` | 監聽埠 | 否 | 否 | Next 預設 | —— | `DERIVED / PLATFORM PROVIDED` |
| `NEXT_DIST_DIR` | `next.config.ts:20`、`playwright.config.ts`、`scripts/verify-web.mjs` | 建置產物目錄（驗收流程用） | 否 | 否 | `.next` | —— | `DEVELOPMENT / TEST ONLY` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `lib/support-contact.ts`（由 `app/support/page.tsx` 讀取） | **一般客服**聯絡信箱，顯示在 public `/support`（「聯絡平台」） | **是** | **否 —— 刻意是 public 值** | **無 fallback（刻意）** | 未設／空白／佔位值／不成地址 → `/support` 顯示「一般客服聯絡方式目前尚未設定。」，**不編造也不顯示任何佔位地址** | **`REQUIRED — CURRENTLY FAILS SOFT`**（設計如此，同 `PAYMENT_BANK_*`）＋ `PENDING OWNER DOMAIN` |
| `CI`／`E2E_SERVER`／`E2E_BACKEND_URL`／`E2E_BACKEND_DB`／`E2E_REUSE_BACKEND`／`PLAYWRIGHT_BASE_URL`／`TEST_ADMIN_EMAIL`／`TEST_ADMIN_PASSWORD` | Playwright 與 E2E helper | 測試 | 否 | `TEST_ADMIN_PASSWORD` 是 | —— | —— | `DEVELOPMENT / TEST ONLY` |

> **`NEXT_PUBLIC_*` 現況（2026-09-01 `PRE-14` 更新）：`1`，且只有一個。**
>
> 本文件 2026-08-31 版寫的是「整個 repo 沒有任何 `NEXT_PUBLIC_*` 變數」。
> 該敘述**已不成立** —— `PRE-14` 依 Owner 決策新增 `NEXT_PUBLIC_SUPPORT_EMAIL`。
>
> **不變的安全結論、改變的表述方式：** 先前的保證是「數量為 0 ⇒ 不可能外洩」，
> 那是用**不存在**換來的安全。現在改成一條要持續成立的規則：
> **`NEXT_PUBLIC_*` 只能放本來就要公開給所有人看的值。**
>
> 唯一那個變數完全符合：它的整個用途就是**印在一個匿名可讀的頁面上給人抄下來**，
> 因此「被打包進瀏覽器 bundle」不是外洩，而是它的功能本身。
> 它也**不是** secret、**不能推導出**任何 secret，且**不得**與個資權利請求信箱共用
> 同一條設定（兩者是不同的法定受理管道）。
>
> **其餘 secret 一律不得使用這個前綴** —— 規則見 §5 規則 3（已同輪改寫）。

### 2.4 統計

```text
Backend production runtime 相關 ......... 27（含 5 個 legacy／alias）
Backend 腳本／測試專用 ...................  5
Frontend production runtime 相關 ........  3（API_BASE_URL、PORT、NEXT_PUBLIC_SUPPORT_EMAIL）
Frontend 測試專用 ........................  9
NEXT_PUBLIC_* ............................  1（NEXT_PUBLIC_SUPPORT_EMAIL，PRE-14；刻意公開）
─────────────────────────────────────────────
REQUIRED — FAIL CLOSED ...................  5
REQUIRED — CURRENTLY FAILS SOFT ..........  12
OPTIONAL .................................  11
DEVELOPMENT / TEST ONLY ..................  14
DERIVED / PLATFORM PROVIDED ..............  2
PENDING OWNER DOMAIN（與上列重疊標記） ...  4
```

---

## 3. Production 必要契約（精簡版）

| Variable | Required | Secret | Failure policy | Value status |
| --- | :--- | :--- | --- | --- |
| `NODE_ENV` | ✅ | 否 | fail closed（它是其他檢查的開關） | `production`（固定值） |
| `JWT_SECRET` | ✅ | **✅** | **fail closed** | 由 Owner 產生高熵隨機值，注入部署環境 |
| `DATABASE_URL` | ✅ | **✅** | **fail closed** | `VALUE ASSIGNED BY PRE-07`（Render 提供） |
| `PRIVATE_FILE_STORAGE_PATH` | ✅ | 否 | **fail closed** | `VALUE ASSIGNED BY PRE-07`（Render disk mount path） |
| `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | ✅ | 否 | **fail closed** | `true`（固定值，`DEC-13`） |
| `PRIVATE_FILE_STORAGE_DRIVER` | 建議明示 | 否 | 非 `local` 即 throw | `local`（固定值，`DEC-13`） |
| `PUBLIC_BACKEND_URL` | ✅ | 否 | **fails soft（危險，見 `PRE-12`）** | **PENDING OWNER DOMAIN** |
| `PUBLIC_WEB_URL` | ✅ | 否 | fails soft | **PENDING OWNER DOMAIN** |
| `API_BASE_URL`（frontend） | ✅ | 否 | fails soft | `VALUE ASSIGNED BY PRE-07` |
| `SMTP_HOST` | ✅ | 否 | fails soft（`REL-03`） | `smtp.resend.com`（已知，`DEC-14`） |
| `SMTP_PORT` | ✅ | 否 | fails soft（`REL-03`） | `465`（已知，`DEC-14` —— implicit TLS） |
| `SMTP_USER` | ✅ | 否 | fails soft（`REL-03`） | `resend`（已知，`DEC-14`） |
| `SMTP_PASS` | ✅ | **✅** | fails soft（`REL-03`） | Resend API key —— **僅存在於部署環境** |
| `SMTP_FROM` | ✅ | 否 | fails soft（`REL-03`） | **PENDING OWNER DOMAIN** |
| `PAYMENT_BANK_NAME` / `_CODE` / `_ACCOUNT` / `_ACCOUNT_NAME` | ✅ | 敏感營運資料 | fails soft（**刻意**） | 由 Owner 提供實際收款帳戶 |
| `NEXT_PUBLIC_SUPPORT_EMAIL`（frontend） | ✅ | **否（刻意公開）** | fails soft（**刻意** —— 顯示「尚未設定」，不編造地址） | **PENDING OWNER DOMAIN**（形式 `support@<production-domain>`；`PRE-14`） |
| `JWT_EXPIRES_IN` | 選填 | 否 | 設錯 → **第一次登入才炸** | 建議留空用預設 `7d` |
| `PORT` | — | 否 | 平台注入 | `DERIVED` |

---

## 4. 資料庫設定：**只有一條 production 路徑**

`Backend/config/db.js` 支援兩種模式，但**它們在 production 不是對等的**：

```text
DATABASE_URL 有值        → 使用 { connectionString }
否則有任一 PG*           → 使用 { host, port, user, password, database }
兩者皆無                 → throw（拒絕啟動）
```

**production 一律使用 `DATABASE_URL`。** 理由不是偏好，是實測出來的能力差異：

1. **離散 `PG*` 路徑無法開啟 TLS。** `db.js` 組出的物件**從不設定 `ssl` 鍵**
   （`grep -n "ssl" Backend/config/db.js` 零命中），而 `pg` 的 `defaults.ssl` 實測為 **`false`**。
   本 repo 也**沒有**讀取 `PGSSLMODE`。因此走 `PG*` 連 managed PostgreSQL＝**明文連線**。
2. **只有連線字串能帶 `sslmode`。** 實測 `pg-connection-string` 2.12.0：
   `?sslmode=require` → `ssl: {}`（開啟且驗證；該版本等同 `verify-full`）、
   `?sslmode=no-verify` → `ssl: { rejectUnauthorized: false }`、
   不帶 `sslmode` → `ssl: undefined`（**不加密**）。
3. `DATABASE_URL` 本來就優先，Render 也以連線字串形式提供。

> **契約：production 必須設定 `DATABASE_URL`，且必須明確帶 `sslmode`。**
> 由公開 CA 簽發憑證的 managed 服務（Render 屬此類）用 `sslmode=require` 即可；
> 自簽憑證才需要 `sslmode=no-verify`。**具體字串由 `PRE-07` 依 Render 實際提供者決定。**
>
> **`PG*` 在 production 視為 `DEVELOPMENT / TEST ONLY`** —— 不是「另一條 canonical 路徑」。
> 本文件刻意**不**把兩者並列為對等選項。

---

## 5. Secret 管理規則

**Secret 清單（僅此四項 ＋ 一組營運敏感值）：**

```text
JWT_SECRET
DATABASE_URL          （內含資料庫密碼）
SMTP_PASS             （Resend API key）
ADMIN_PASSWORD        （僅 create-admin CLI 一次性使用）
PAYMENT_BANK_*        （非技術 secret，但屬敏感營運資料）
```

**規則：**

1. **不得進入版控** —— 包含 `.env.example`、文件、測試腳本、Postman collection／environment
   （CLAUDE.md §8）。真實值只存在 git-ignored 的 `Backend/.env` 或部署環境。
2. **文件中不得出現可用的範例值** —— 只用明顯的佔位符（`<...>`），且不得是「看起來像真的」的字串。
3. **不得經由 `NEXT_PUBLIC_*` 暴露** —— `NEXT_PUBLIC_*` 只能放**本來就要公開給所有人看**
   的值。任何要加 `NEXT_PUBLIC_*` 的變更都必須先確認它不是 secret，也不是能推導出
   secret 的東西，並在本文件 §2.3 明確記錄「為什麼公開是它的功能而不是缺陷」。

   > **2026-09-01 `PRE-14` 修訂。** 本條原文是「目前為 0，這個數字必須維持為 0」。
   > 那條規則已由 Owner 決策取代（`NEXT_PUBLIC_SUPPORT_EMAIL`）。
   > **判準從「數量」改為「性質」** —— 因為靠「一個都沒有」得到的安全，
   > 在第一個合法需求出現時就會失效，而且會誘使人把公開值塞進 server-only 變數
   > 再繞路傳到前端，那反而更難稽核。
   >
   > **目前合法清單（僅此一項）：** `NEXT_PUBLIC_SUPPORT_EMAIL`
   > —— 一般客服信箱，其用途就是印在匿名可讀的 `/support` 頁面上。
   > 新增第二項前必須回到本條逐項確認。
4. **經由部署環境／secret 管理注入**，不經由檔案傳遞。
5. **不得印在任何驗證輸出裡** —— 包含健康檢查、啟動 log、錯誤訊息。
   （現況良好：`JWT_SECRET` 的錯誤訊息只說「太短／是佔位值」，**不回顯值本身**；
   `config/privateFileStorage.js` 的錯誤會回顯 **路徑**，那不是 secret。）
6. **`/payment/bank-info` 在 production 不揭露未設定的變數名稱** —— 已由
   `routes/payment.js:25` 以 `NODE_ENV` 控制。這是 `NODE_ENV` 必須正確設定的第二個理由。

**`Backend/.env` 現況：** 存在且已被 `.gitignore` 第 3 行涵蓋；本輪**未讀取其值**，
只確認其存在與被忽略。`frontend/.env` 亦已在 `.gitignore` 第 4 行。

---

## 6. Fail-closed / fail-soft 矩陣

| Variable / group | Current behavior（實測） | Desired production behavior | Already compliant? | Follow-up ticket |
| --- | --- | --- | :--- | --- |
| `JWT_SECRET` | 缺／空白／佔位／< 32 → module load throw | 同左 | ✅ **是** | —— |
| 資料庫設定完全缺漏 | throw，程序起不來 | 同左 | ✅ **是** | —— |
| 資料庫**未加密連線** | `PG*` 路徑靜默明文；`DATABASE_URL` 不帶 `sslmode` 亦明文 | production 必須加密 | ⚠️ **靠設定紀律，程式不強制** | `PRE-07`（設定正確的 `DATABASE_URL`）；本文件 §4 為契約 |
| `PRIVATE_FILE_STORAGE_PATH` 缺（prod＋local） | throw（實測） | 同左 | ✅ **是** | —— |
| `ALLOW_LOCAL_IN_PRODUCTION` 未明示（prod＋local） | throw（實測） | 同左 | ✅ **是** | —— |
| `PRIVATE_FILE_STORAGE_DRIVER` 非 `local` | throw（未實作） | 同左 | ✅ **是** | —— |
| canonical／legacy 儲存變數衝突 | throw（實測） | 同左 | ✅ **是** | —— |
| `MAX_*`／TTL 非正數 | throw（實測），且由 route 於 module load 讀取 → 起不來 | 同左 | ✅ **是** | —— |
| `NODE_ENV` 未設 | 三條 fail-closed **不武裝**；`/payment/bank-info` 洩漏變數名清單 | production 必為 `production` | ⚠️ **無自我保護**（它就是開關） | `PRE-07` 必設；`PRE-12` 可加檢查 |
| **`PUBLIC_BACKEND_URL` 未設** | ~~回退 `http://localhost:3000` 並永久寫入 `cover_image_url` 等欄位~~ → **2026-09-03 起：production 拒絕啟動**（`PRE-12`） | production 缺少時**應拒絕啟動** | ✅ **是**（`config/productionUrlContract.js`） | **`PRE-12` ✅ 已實作** |
| `PUBLIC_WEB_URL` 未設 | ~~回退 `http://localhost:3001` → 所有交易信連結失效~~ → **2026-09-03 起：production 拒絕啟動**（Owner 決定為 fail-closed，非警告） | production 缺少時應拒絕啟動 | ✅ **是** | **`PRE-12` ✅ 已實作** |
| `API_BASE_URL`（frontend）未設 | ~~回退 `http://localhost:3000` → 整站 server 端 API 呼叫失效~~ → **2026-09-03 起：production 明確失敗**（`lib/server-api-base-url.ts`；dev／test 仍回退） | production 缺少時應明確失敗 | ✅ **是** | **`PRE-12` ✅ 已實作** |
| `JWT_EXPIRES_IN` 格式錯誤 | ~~啟動正常；**第一次登入**才 throw~~ → **2026-09-03 起：載入 `utils/jwt.js` 時即拒絕啟動**（所有環境） | 啟動時驗證 | ✅ **是** | **`PRE-12` ✅ 已實作** |
| `SMTP_*` **部分**缺漏／格式錯誤 | ~~啟動正常、收單正常、一封信都不寄~~ → **2026-09-03 起：production 拒絕啟動**（`REL-03` 條件式契約） | 部署時即顯現 | ✅ **是** | **`REL-03` ✅ 已實作** |
| `SMTP_*` **全部**未設 | **允許啟動、不寄信**（`DEC-17` 明示 MVP 初期不啟用郵件；`render.yaml` 刻意不宣告）。`REL-02` 保證單次寄信失敗不終止 process | 維持現狀（**刻意**） | ✅ **是（設計決定）** | `REL-03` 明文保留此狀態 |
| `PAYMENT_BANK_*` 缺漏 | 付款指示顯示「尚未設定」；**刻意不 throw**（`paymentBankInfo.js:26` 註解明載） | 維持現狀 ＋ 上線檢查表把關 | ✅ **是（設計決定）** | 本文件 §11 檢查表 |
| `NEXT_PUBLIC_SUPPORT_EMAIL` 缺／佔位／不成地址 | `/support` 顯示「一般客服聯絡方式目前尚未設定。」；**不編造、不顯示佔位地址**（`lib/support-contact.ts`） | 維持現狀 ＋ 上線檢查表把關 | ✅ **是**（**刻意** fails soft，同 `PAYMENT_BANK_*`） | **`PRE-14`**（實作已完成；production 值未設定前不得標 PASS） |
| `PORT` 非法值 | 靜默回退 3000 | 平台注入，非人工設定 | ✅ 可接受 | —— |

---

## 7. 網域相依變數（Domain-dependent）

production 網域刻意尚未解決。**這不阻塞 `PRE-09`** —— 本節證明工程可以繼續：
所有網域相依的都是**值**，不是**契約**。契約現在就能定案，值稍後填入。

### `PUBLIC_BACKEND_URL`

```text
Variable:              PUBLIC_BACKEND_URL（別名 API_PUBLIC_URL）
Why domain-dependent:  它是 Backend 的對外絕對位址，且 mediaUrl() 會把它
                       連同 host 一起寫進資料列（cover_image_url 等）
Required before:       任何一筆真實 production 素材上傳
Current placeholder policy:
                       **無佔位值。** 不得填入 onrender.com、localhost 或 example.com。
                       在鎖定前，production 不得上傳素材（見下方 guardrail）
Owning ticket:         PRE-07（設定注入）／PRE-12（缺少時 fail closed）
```

### `PUBLIC_WEB_URL`

```text
Variable:              PUBLIC_WEB_URL（別名 FRONTEND_URL / APP_BASE_URL）
Why domain-dependent:  它是交易信中所有連結的網域基準
Required before:       production 郵件啟用（第一封真實交易信）
Current placeholder policy:
                       無佔位值；不得填入 localhost
Owning ticket:         PRE-10（郵件啟用）／PRE-07（設定注入）
```

### `SMTP_FROM`

```text
Variable:              SMTP_FROM
Why domain-dependent:  寄件位址必須位於已完成 SPF/DKIM 驗證的寄件網域
Required before:       production 郵件啟用
Current placeholder policy:
                       REQUIRED BEFORE PRODUCTION EMAIL ACTIVATION
                       VALUE PENDING OWNER DOMAIN
Owning ticket:         PRE-10
```

### `API_BASE_URL`（frontend）

```text
Variable:              API_BASE_URL
Why domain-dependent:  部分相依 —— 若前後端同處 Render 可走內部位址，
                       則**不必**等自訂網域；若走公開位址則需要
Required before:       前端第一次在 production 服務請求
Current placeholder policy:
                       VALUE ASSIGNED BY PRE-07（由 PRE-07 決定內部或公開位址）
Owning ticket:         PRE-07
```

### `NEXT_PUBLIC_SUPPORT_EMAIL`（frontend，`PRE-14`）

```text
Variable:              NEXT_PUBLIC_SUPPORT_EMAIL
Why domain-dependent:  Owner 決定的形式是 support@<production-domain>，
                       因此值取決於尚未鎖定的網域
Required before:       production 上線（PRE-14 的 production gate）
Secret?:               否 —— 刻意公開；它就是要印在匿名可讀的 /support 上
Current placeholder policy:
                       VALUE PENDING OWNER DOMAIN
                       未設定時 /support 顯示「一般客服聯絡方式目前尚未設定。」，
                       **不得**填入任何示意值當作暫時解（會被視同未設定並拒絕）
Must NOT be:           個資權利請求信箱（不同的法定受理管道，DEC-LEGAL-07）
Owning ticket:         PRE-14
```

> **這一項不阻塞工程，但阻塞 launch。** `PRE-14` 的實作（頁面、四個進入點、
> 死文案收尾、測試）與網域無關，已可完成；**只有值**要等網域。
> 在值設定完成並實測前，`PRE-14` 一律記為 `BLOCKED_BY_PRODUCTION_CONFIG`。

### 對 O-20 的影響

`O-20`（《隱私權政策》§5.4 部署環境委外處理者揭露）需要的是**供應商身分**（已知：Render）
與**主機名稱**（未知）。因此 `O-20` 仍受網域阻塞，但**與本契約無關** —— 本文件不作任何法律判斷。

### 🚩 LAUNCH GUARDRAIL（不得以任何方式繞過）

```text
NO REAL PRODUCTION MEDIA UPLOAD
BEFORE THE STABLE BACKEND PRODUCTION HOSTNAME IS LOCKED.
```

理由：`services/materialMedia.service.js:90` 的 `mediaUrl()` 會把**含 host 的絕對 URL**
持久化到 `cover_image_url` / `detail_images[].image_url` / `demo_video_url`。

**不得**以「先用 Render 配發的 hostname 撐著」來解決 —— 那正是會造成
永久性錯誤 host 資料的做法。`parseMediaId()` 只比對 path，所以**認領邏輯**不受影響，
但**已寫入的字串仍帶著舊 host**，換網域後那些圖就失效。

---

## 8. `PRE-09` / `PRE-07` 責任邊界

```text
PRE-09  =  WHAT        應用程式需要哪些設定、哪些必須 fail closed、
                       哪些是 secret、哪些的值待網域鎖定
PRE-07  =  HOW ON RENDER  在 Render 上實際用什麼機制提供這些設定，
                       以及那些「VALUE ASSIGNED BY PRE-07」的具體值
```

| 事項 | `PRE-09` 負責 | `PRE-07` 負責 |
| --- | --- | --- |
| 私有儲存路徑 | 宣告 `PRIVATE_FILE_STORAGE_PATH` 為必要且 fail-closed | **選定並設定實際的 Render disk mount path** |
| 資料庫 | 宣告 production 必須用帶 `sslmode` 的 `DATABASE_URL`（§4） | 取得 Render 提供的連線字串並決定 `sslmode` 值 |
| 前後端互連 | 宣告 `API_BASE_URL` 為必要 | 決定走 Render 內部位址或公開位址 |
| Secret | 宣告哪些是 secret 與注入規則（§5） | 在 Render 的 secret 機制中實際建立 |
| `NODE_ENV` | 宣告 production 必為 `production` 且說明後果 | 在服務定義中設定 |

> 本文件**刻意不寫任何 Render 專屬的值**。凡是 `PRE-07` 才能決定的，一律寫
> **`VALUE ASSIGNED BY PRE-07`**。

---

## 9. 啟動驗證的所有權

| Configuration | Startup validation exists? | Location | Follow-up |
| --- | :--- | --- | --- |
| `JWT_SECRET` | ✅ **有**（fail closed） | `utils/jwt.js:27-53`，module load 時執行 | —— |
| 資料庫設定存在性 | ✅ **有**（fail closed） | `config/db.js` `buildDbConfig()` | —— |
| 資料庫**可連線性** | ⚠️ **間接** —— `ensureCoreTables()` 於 `index.js:161` 執行，失敗則 `process.exit(1)`；因此**連不上資料庫確實起不來**（`PRE-05` 已驗證此路徑） | `index.js:161-190` | 足夠，無需新增 |
| 資料庫連線**加密** | ❌ **無** | —— | 契約層（§4）＋ `PRE-07` |
| 私有儲存（production） | ✅ **有**（三條 fail-closed 分支，本輪逐條實測） | `config/privateFileStorage.js:132-160` | —— |
| 儲存數值旋鈕 | ✅ **有**（非正數 throw，且由 route 於 module load 讀取） | `config/privateFileStorage.js:76-84` | —— |
| `NODE_ENV` | ❌ **無**（它是開關本身，無法自我檢查） | —— | `PRE-12` |
| `PUBLIC_BACKEND_URL` | ✅ **有**（`PRE-12`，2026-09-03）—— production 未設／空白／非 URL／非 http(s)／loopback 皆**拒絕啟動**；別名 `API_PUBLIC_URL` 可單獨滿足 | `config/productionUrlContract.js`，由 `index.js` 在 `ensureCoreTables()` 與 `app.listen()` 之前呼叫 | —— |
| `PUBLIC_WEB_URL` | ✅ **有**（`PRE-12`，2026-09-03）—— 同上，**Owner 決定為 fail-closed 而非警告**；別名 `FRONTEND_URL`／`APP_BASE_URL` | 同上 | —— |
| `JWT_EXPIRES_IN` 格式 | ✅ **有**（`PRE-12`，2026-09-03）—— 載入 `utils/jwt.js` 時即驗證；未設沿用預設 `7d`，設了但空白或格式非法即拒絕啟動。合法性交由 `jsonwebtoken` 判定，未自寫 regex | `config/productionUrlContract.js`／`utils/jwt.js` | —— |
| SMTP | ✅ **有（條件式）**（`REL-03`，2026-09-03）—— 五個 `SMTP_*` 全不存在 → **允許啟動**（`DEC-17`）；**任何一個存在** → 整份契約必須成立，半套或格式錯誤即**拒絕啟動**。`SMTP_TEST_TO` 為 test-only，不會啟用契約。**只驗證設定完整性，不連線、不證明投遞** | `config/smtpContract.js`，由 `index.js` 在 `ensureCoreTables()` 與 `app.listen()` 之前呼叫 | —— |
| `PAYMENT_BANK_*` | ❌ 無（**刻意**） | `config/paymentBankInfo.js:26` | 檢查表把關（§11） |
| Frontend `API_BASE_URL` | ✅ **有**（`PRE-12`，2026-09-03）—— production 未設／空白／非 URL／loopback 皆明確失敗；dev／test 保留 localhost 回退 | `frontend/apps/web/lib/server-api-base-url.ts`（五個呼叫點已收斂為單一 accessor） | —— |

> **不引入通用設定框架。** 現有的 fail-closed 已覆蓋最嚴重的四類
> （JWT、資料庫、私有儲存路徑、儲存 driver），缺口是**具體的四、五個變數**，
> 不是「缺少框架」。`REL-03` ＋ `PRE-12` 兩張票足以補齊，無需重構設定系統。

---

## 10. 本文件的驗證方法

所有「失敗行為」欄位皆以下列方式取得，非推論：

```text
讀碼        逐一開啟 consumer 檔案確認實際分支
動態讀取    另行 grep process.env[ 以涵蓋 5 處間接讀法
實測 A      以隔離 require + 環境變數注入，跑私有儲存 fail-closed 矩陣 11 種組合
實測 B      直接呼叫 readPositiveInt 系列，驗證非正數與空字串行為
實測 C      直接呼叫 jwt.sign，驗證 JWT_EXPIRES_IN 格式錯誤的失敗時點
實測 D      pg-connection-string 解析 sslmode 的三種結果 ＋ pg defaults.ssl
```

**未啟動 Backend 服務、未連線任何資料庫、未寄出任何郵件、未建立任何 production 資源。**
實測 A 建立的一次性探測目錄已刪除，無殘留。

---

## 11. Production 設定檢查表

> 給 `PRE-07` / `PRE-10` / `PRE-11` 直接使用。
> `[ ]` ＝ 待辦；`[P]` ＝ 值待 Owner 網域；`[R]` ＝ 值由 `PRE-07` 於 Render 決定。

```text
APPLICATION
  [ ] NODE_ENV = production                      ← 未設則三條 fail-closed 不武裝
  [ ] JWT_SECRET                                 ← SECRET；高熵隨機；≥ 32 字元；非佔位值
  [ ] JWT_EXPIRES_IN                             ← 建議留空用預設 7d；若設，格式必須合法

DATABASE
  [R] DATABASE_URL（含明確 sslmode）             ← SECRET；production 唯一路徑（§4）
  [ ] 確認未使用離散 PG*（那條路徑無法加密）

PRIVATE STORAGE（2026-08-31 依 DEC-16 改寫；舊的 local-disk 版本見本節下方）
  [ ] PRIVATE_FILE_STORAGE_DRIVER = s3           ← DEC-16
  [R] PRIVATE_FILE_STORAGE_S3_BUCKET             ← 必須是 PRIVATE bucket
  [R] PRIVATE_FILE_STORAGE_S3_ENDPOINT
  [R] PRIVATE_FILE_STORAGE_S3_REGION
  [R] PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID      ← SECRET
  [R] PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY  ← SECRET
  [ ] 確認 bucket 沒有開啟任何 public access
  [ ] 確認未設定 PRIVATE_FILE_STORAGE_PATH 與 ALLOW_LOCAL_IN_PRODUCTION（s3 不需要）
  [ ] 確認未同時設定 MATERIAL_FILE_STORAGE_*（值不同會拒絕啟動）

PRIVATE STORAGE — local driver（**僅本機開發**；production 不走這條）
  ——  PRIVATE_FILE_STORAGE_DRIVER = local
  ——  PRIVATE_FILE_STORAGE_PATH                  ← 必須是真正的持久化磁碟
  ——  PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION = true
      （這兩條 fail-closed 未被移除，只是 NT$0 production 不再走這條路徑）

PUBLIC URLS
  [P] PUBLIC_BACKEND_URL                         ← 素材 URL 會連 host 寫進資料列
  [P] PUBLIC_WEB_URL                             ← 信件連結基準
  [R] API_BASE_URL（frontend service）           ← Render 內部或公開位址

SMTP（DEC-14 = Resend）
  [ ] SMTP_HOST = smtp.resend.com                ← 已知
  [ ] SMTP_PORT = 465                            ← 已知；使現有 secure=(port===465) 生效
  [ ] SMTP_USER = resend                         ← 已知
  [ ] SMTP_PASS                                  ← SECRET；Resend API key
  [P] SMTP_FROM                                  ← 需已驗證寄件網域

SUPPORT（PRE-14 —— 一般客服聯絡入口）
  [P] NEXT_PUBLIC_SUPPORT_EMAIL                  ← 形式 support@<production-domain>；
                                                    非 secret（公開頁面上的地址）；
                                                    未設 → /support 顯示「尚未設定」
                                                    （不編造、不顯示佔位地址）
  [ ] 部署後實測 /support 匿名可讀且顯示該地址   ← 這一項未過，PRE-14 不得標 PASS
  [ ] 確認該值**不是**個資權利請求信箱            ← 兩者是不同的法定受理管道

PAYMENT（人工轉帳的收款帳戶）
  [ ] PAYMENT_BANK_NAME
  [ ] PAYMENT_BANK_CODE
  [ ] PAYMENT_BANK_ACCOUNT                       ← 已知佔位帳號會被拒絕
  [ ] PAYMENT_BANK_ACCOUNT_NAME
  [ ] 四值必須同時設定，缺一即整組不可用

DOMAIN / DNS（全部 PENDING OWNER）
  [P] frontend hostname
  [P] backend hostname                           ← 素材上傳前必須鎖定（§7 guardrail）
  [P] sending domain（SPF / DKIM / DMARC）        ← PRE-10

OPS（非 runtime）
  [ ] ADMIN_EMAIL / ADMIN_PASSWORD               ← 僅 create-admin CLI 一次性使用；
                                                    公開註冊永遠不能建立 admin
不需設定（平台提供）
  ——  PORT（Backend 與 Frontend 皆由 Render 注入）
```

---

## 12. 本文件未做的事

```text
Render 部署：           NO
Render 服務建立：       NO
SMTP 設定：             NO
DNS 變更：              NO
購買網域：              NO
發明 production 網域：  NO（無 onrender.com / localhost / example.com 作為 production 值）
production DB 建立：    NO
schema／migration：     未修改
business logic：        未修改
設定系統重構：          未進行
物件儲存：              未實作
```
