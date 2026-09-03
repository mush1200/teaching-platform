# MVP Rules

# A. Frontend data source policy

**UI 工程約定（非 API）：** `docs/frontend-ui-architecture.md` · **Design tokens：** `docs/design-tokens-v1.1.md`

所有「頁面資料內容」必須以後端 API 為唯一資料來源：

- 可渲染為卡片/清單/統計/詳情的資料，不得由前端 hardcode 或 localStorage mock 直接供應。
- 前端可保留純展示文案（標題、提示語、按鈕文案），但不得保留可被誤認為業務資料的假內容。
- API 失敗時應顯示錯誤或空狀態，不得退回前端假資料。
- 收藏、購物車、回饋摘要、後台 KPI 等使用者/交易資料必須走後端儲存與查詢。

---

# A.1 Path 參數的輸入邊界（`COR-05`）

**URL path 參數含 NUL byte（`%00`）時，一律在進入任何 handler 與任何 DB 查詢之前回 400。**

```json
{ "error": "invalid_path_parameter", "message": "Path parameters must not contain NUL bytes." }
```

canonical 實作是 `Backend/utils/pathParams.js` 的 `rejectNulBytePathParams`，
掛在 `Backend/index.js` 的**所有 router 之前**。

**為什麼是「拒收 NUL」而不是「驗證識別碼格式」：** 本 repo 的識別碼不是 UUID ——
`materials.id` 與 `material_media_files.id` 都是 `text`，值形如 `mat_mt4n1tppwgtnpe`。
沒有可以拿來擋的格式，任何字串都是合法查詢輸入，查不到就是 404。
**唯一**永遠不合法的是 PostgreSQL `text` 根本裝不下的 NUL byte。

**為什麼是 400 而不是 404：** 404 代表「查了，沒有這筆」；NUL byte 不可能識別到任何資源，
它是壞掉的請求。用 404 會讓它與真實的查無資料無法區分 —— 那正是這個缺陷的監控問題。
Express 對壞掉的 percent-encoding（例如 `/materials/100%`）本來就回 400，語意一致。

**不得**改用「catch PostgreSQL `22021` 再轉 400」的做法：那會讓「輸入不合法」與
「資料庫真的出事」共用同一條路徑。輸入要在進 DB 之前被拒絕。

字面的 `%00`（即雙重編碼的 `%2500`）是四個合法字元，**不在**攔截範圍內。

---

# A.2 API 錯誤回應的終端契約（`COR-07`）

**API 一律回 JSON。任何情況下都不得回 Express 預設的 HTML 錯誤頁。**

canonical 實作是 `Backend/middlewares/errorResponses.js`，在 `Backend/index.js`
掛在**所有 route 之後**（順序：`notFoundJson` → `jsonErrorHandler`）。

| 情況 | 狀態 | body |
| --- | --- | --- |
| 解不開的 percent-encoding（`/materials/100%`、`%ZZ`、`%C0%80`、不完整多位元組） | **400** | `{ "error": "invalid_request", "message": "The request could not be parsed." }` |
| 壞掉的 JSON body（`express.json()` parse 失敗） | **400** | 同上 |
| 比對不到任何 route | **404** | `{ "error": "not_found", "message": "Route not found." }` |
| 其他未預期的錯誤 | **500** | `{ "message": "server error" }`（與各 route 自己 catch 時的既有契約相同） |

**回應永遠不得包含** stack trace、絕對檔案路徑、`node_modules` 路徑、相依套件名稱，
或 `err.message`。完整錯誤只印在伺服器端 —— 可觀測性不該靠把 stack 送給呼叫端換來。

**只有明確可辨識的兩類算「請求壞掉」**：`URIError`（router 解 path param 失敗）與
`entity.parse.failed`（body 解析失敗）。其餘一律 500，**不得**把所有 Error 都回 400。

## 這與 §A.1 是兩個不同的邊界，兩者都需要

| | `COR-05`（§A.1） | `COR-07`（本節） |
| --- | --- | --- |
| 位置 | 所有 router **之前** | 所有 route **之後** |
| 輸入 | 解得開，但 PostgreSQL 裝不下（NUL byte） | **根本解不開**的 percent-encoding |
| 何時發生 | 進 handler 前主動攔截 | router 比對 param 時丟 `URIError`，**請求從未進到任何 handler** |

因此 §A.1 的守衛攔不到 §A.2 的輸入，反之亦然。

## 不依賴 `NODE_ENV`

**實測**（同一棵樹，`NODE_ENV=production`）：Express 的 `finalhandler` 確實不再把 stack
放進 body，但**回的仍然是 `text/html`**（`<pre>Bad Request</pre>`）。也就是說環境變數
只擋掉資訊外洩，沒有滿足「API 一律 JSON」這件事，而且它是一個沒有任何保障的設定
（repo 目前沒有部署設定，見 `PRE-01`）。

因此上述契約由 app 自己保證，**在 `NODE_ENV` 未設定時同樣成立**（回歸測試即在未設定的
情況下執行）。production 仍應設 `NODE_ENV=production` —— 但那是 **defense in depth**，
不是這條規則的實作方式。（`NODE_ENV` 另有一個獨立用途：
`Backend/config/privateFileStorage.js` 的 production fail-closed 檢查，見 `PRE-01`。）

---

# 0. 資料庫連線

本機開發時以環境變數設定（例如 `Backend` 目錄的 `.env` 或 `DATABASE_URL` / `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`），**不要**在版控文件內寫入實際密碼。

啟動指令、port、環境變數完整清單、回歸流程與維運操作見 **`docs/local-development-and-operations.md`**。

---

# 1. Authentication

JWT required for protected routes.

**`JWT_SECRET` 為必要環境變數（無 fallback）。** Backend 於載入 `Backend/utils/jwt.js` 時驗證，
不符即拋錯、啟動失敗（fail fast），拒絕條件：

- 未設定、為空白
- 屬已知佔位值（例如 `dev-secret-change-me`）
- 長度短於 32 字元

必須是**高熵、隨機產生**的值（例如 `openssl rand -base64 48`）；長度本身不代表安全，
可猜測的長密語同樣不合格。設定範本見 `Backend/.env.example`；實際值只放在 git-ignored 的
`Backend/.env` 或部署環境，**不得寫入版控**。

輪換此值會使所有已簽發之 JWT 失效（預設 `JWT_EXPIRES_IN=7d`），全體使用者需重新登入。

**`JWT_EXPIRES_IN` 的格式於啟動時驗證（`PRE-12`，2026-09-03）。**
未設定時沿用已載明的預設 `7d`；**設了但空白、或不是合法期限**（實測 `"abc"`／`"7dd"`）
一律**啟動失敗**。先前它只在 `jwt.sign()` 時才生效，因此打錯的值會讓 backend
啟動成功、卻在**第一個使用者登入**時才炸。合法性由 `jsonwebtoken` 自己判定
（`Backend/config/productionUrlContract.js` 以拋棄式 secret 試簽），**不另寫 regex**。

## 1.1 Production 對外 URL 契約（`PRE-12`）

`NODE_ENV=production` 時，下列缺漏即**拒絕啟動**（`Backend/index.js` 在
`ensureCoreTables()` 與 `app.listen()` **之前**呼叫
`config/productionUrlContract.js`）：

| 變數 | 已載明別名 | 缺漏的後果（正是拒絕啟動的理由） |
| --- | --- | --- |
| `PUBLIC_BACKEND_URL` | `API_PUBLIC_URL` | 靜默回退 `http://localhost:<PORT>`，而該**絕對 URL 會被寫進** `materials.cover_image_url`／`material_images.image_url`／`demo_video_url`。事後補設定**不會回寫既有列** —— 素材永久失效 |
| `PUBLIC_WEB_URL` | `FRONTEND_URL`／`APP_BASE_URL` | 每一封交易信的連結都指向 `http://localhost:3001` |

**非空字串不算通過**：值必須能解析為絕對 URL、scheme 為 `http:`／`https:`，
且**不得指向 loopback**（`localhost`／`127.0.0.0/8`／`::1`）。
Render 配發的 `*.onrender.com` 必須通過 —— `PRE-10`（自訂網域）仍未解除，
本檢查**不看網域長相**，只看 loopback。

**本機開發與測試維持既有的 localhost 回退**，判準與
`config/privateFileStorage.js` 一致（`NODE_ENV === "production"`）。
前端 server 端亦同：`API_BASE_URL` 由
`frontend/apps/web/lib/server-api-base-url.ts` **單一**取得，
production 缺漏即明確失敗，不得再各自回退 localhost。

> 這是**四個具體變數**的 fail-closed，**不是設定框架**。
> 既有的 `JWT_SECRET` 與私有儲存 fail-closed **未被放寬**。

## 1.2 Production SMTP 設定契約（`REL-03`）—— **條件式**

與 §1.1 不同，SMTP **不是**無條件 fail-closed。`DEC-17` 明示 **MVP 初期不啟用郵件**，
`render.yaml` 因此刻意不宣告任何 `SMTP_*`，現行 production 正是在這個狀態下運行。
無條件要求 SMTP 齊備會讓現在的 production **起不來**。

因此 `NODE_ENV=production` 時的規則是（`Backend/config/smtpContract.js`，
由 `index.js` 在 `ensureCoreTables()` 與 `app.listen()` 之前呼叫）：

```text
五個 SMTP_* 全部不存在   → 允許啟動（維持 DEC-17；郵件不啟用）
任何一個存在             → 視為已啟用 SMTP，整份契約必須成立
部分設定／格式錯誤        → 拒絕啟動（那是部署錯誤）
```

啟用集合為 **`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`**。
**`SMTP_TEST_TO` 不在其中** —— 它只被 `scripts/smtp-smoke-test.js` 使用。

**「存在」看的是變數有沒有被設定，不是有沒有值** —— 只留空白的 `SMTP_PASS` 是
「有人試圖設定卻設錯」，因此會 engage 契約並在驗證時失敗。

已啟用時：`SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` 非空白；`SMTP_PORT` 省略時
沿用既有預設 `587`，若設定則必須是 1–65535 的整數（`"abc"` 原本會變成 `NaN`）；
**`SMTP_FROM` 必填且必須是合法寄件地址，不得回退 `SMTP_USER`** ——
Resend 情境下那個回退的結果是字面 `resend`，根本不是地址。
**不新增 `SMTP_SECURE`**（TLS 仍由 `port === 465` 推導），
**也不新增 `EMAIL_ENABLED` 之類的開關** —— 啟用與否由設定本身表達。

> **這條檢查只證明「設定完整且格式正確」。**
> 它**不證明** SMTP 連得上、Resend 認證成功、寄件網域已驗證、
> DNS／SPF／DKIM／DMARC 正確，或信件真的進得了收件匣 ——
> 那些屬於 `PRE-10` 與實際投遞的範圍。**本檢查不進行任何網路連線。**

**`REL-02` 的邊界未被改動**：啟動之後單次寄信失敗仍然只被
`utils/bestEffortDispatch.js` 接住並記錄，**不會終止 process，也不會讓已成立的交易失敗**。

**授權邊界（前後端分工，勿混淆）**

| 層 | 實作 | 作用 |
| --- | --- | --- |
| **Backend authorization**（唯一真正的授權） | `Backend/middlewares/auth.js` 驗簽 JWT + `requireRole` | 所有資料存取的權限判斷 |
| **Frontend UX guard**（非授權） | `frontend/apps/web/middleware.ts` 讀 `tp_token` / `tp_role` cookie | 只決定要不要渲染某個頁面外殼、導向 `/login` 或 `/403` |

`tp_token` / `tp_role` 由瀏覽器於登入後以 `document.cookie` 寫入（非 HttpOnly），
使用者可自行竄改，因此**只能視為 UX hint，不得作為授權來源**。前端 middleware
不讀取、不解碼、不驗證 JWT。竄改 `tp_role=admin` 只會看到空的管理外殼，
其所有 API 請求仍由後端回 403，不會取得任何資料。

改為 server-set HttpOnly + Secure cookie 與伺服端 session 驗證屬 Phase 2，尚未實作。

---

# 2. Role boundaries

Teacher:

create material (**POST** body must **not** include `status`; server responds **400** if present; new materials always start as `pending_review`)
edit own material (metadata; **cannot** set `status` — only admin)
view own materials

Cannot:

approve orders
review payment proofs
set material publish state

---

Parent:

browse published materials
add to cart (with quantity)
create order
upload payment proof
download approved materials
review purchased materials (one review per material)
report materials

Cannot:

download unapproved materials
review unpurchased materials
approve orders

access admin-only report moderation endpoints (**GET** `/admin/report-cases` 與 `/admin/report-cases/:id` + `POST` 的案件動作＝正式流程；**GET** `/admin/reports`、**GET** `/admin/materials/:materialId/reports`、**GET** `/materials/:id/reports` 為唯讀清單；**PATCH** `/admin/reports/:id` 為 **deprecated legacy** — 全部 admin JWT only)

---

Admin:

review materials (approve / request changes — 見 §21；下架只能經由檢舉處置)
list and act on payment proofs (approve / reject proof)
handle report cases (investigate / request creator response / resolve / dismiss — 見 §6)
view activity logs

**Admin 帳號建立方式（強制）**

- 公開註冊 **永遠不能** 建立 admin：`POST /auth/register` 收到 `role: "admin"` 一律回 **403**，
  公開可註冊角色僅 `teacher` / `parent`（legacy）/ `buyer`（canonical）。
- 平台**不提供**任何 admin registration HTTP endpoint。
- admin 一律以維運 CLI 建立：`Backend/scripts/create-admin.js`（`npm run create-admin --prefix Backend`），
  需具備資料庫連線權限，role 固定為 `admin`，呼叫端不得指定其他角色。
- 密碼優先以環境變數 `ADMIN_PASSWORD` 提供（CLI 參數會出現在 process list 與 shell history）。
- **admin CLI 密碼最短長度 = 16 字元**（以 trim 後長度計算，不足即拒絕建立並以 exit code 1 結束）。
  此規則刻意嚴於公開註冊 —— 公開註冊目前無密碼強度規則，屬另行追蹤之既有技術債，
  不因此讓最高權限維運帳號接受弱密碼。CLI 不另外要求大小寫／符號等複雜度。
- **不得**將 admin 密碼、密碼雜湊或任何真實憑證寫入版控（含 `.env.example`、文件、測試腳本）。

---

# 3. Material visibility rules

四個狀態（canonical 狀態機見 `docs/material-review-workflow.md`；
程式碼 canonical source 為 `Backend/utils/materialWorkflow.js`）：

| status | 買家可見？ | 意義 |
| --- | --- | --- |
| `published` | ✅（公開列表與詳情） | 已上架 |
| `pending_review` | ❌ 只有擁有者 teacher 與 admin | 待審核（初次送出或重新送出） |
| `changes_requested` | ❌ 只有擁有者 teacher 與 admin | 需修改，**從未公開過**，球在創作者手上 |
| `unpublished` | ❌ 只有擁有者 teacher 與 admin | 已下架，**曾經公開過**（目前唯一來源是檢舉處置） |

`changes_requested` 與 `unpublished` **不得混用**：前者是「還沒上架過，請修改後再送」，
後者是「曾經上架、被平台下架」。兩者對創作者的意義、對買家資料的關聯、稽核來源都不同。

## 3.1 教材行銷素材的儲存與交付（private storage，`SEC-02`）

封面、詳情圖、試看影片是**唯一條件公開**的檔案資產。它們的可見性**跟著上表走** ——
與教材 metadata 同一條規則，不再是「檔案放在哪個目錄」決定的。

| 項目 | 規則 |
| --- | --- |
| 儲存位置 | `private-storage/material-media/`，**不在** `uploads/`（後者是公開 static） |
| 公開路徑 | `/uploads/material-media/*` 由 `Backend/index.js` 掛在 static **之前**的 handler 直接擋掉（404 `material_media_not_public`）——**深度防禦**，即使日後有人把檔案放回去也取不到 |
| 上傳 | `POST /teacher/uploads/material-media?kind=cover\|detail\|demo`（teacher）。三層驗證：副檔名＋宣告 MIME＋**magic bytes**。回傳 `{ url, mediaId, kind, filename, … }` |
| 交付 | `GET /materials/media/:mediaId`（**`optionalAuth`**，不是 `requireAuth`） |
| 授權 | `published` → **任何人（含匿名）**；未認領 → 上傳者或 admin；`pending_review` / `changes_requested` / `unpublished` → 教材擁有者或 admin |
| 快取 | 公開素材 `public, max-age=300`；受保護的素材 `private, no-store`。兩者都 `nosniff` ＋ `inline` ＋ 支援 `Range` |
| 不得外流 | `storage_key` / `checksum_sha256` 不得出現在任何 API 回應或 log |

### 為什麼交付端點是 `optionalAuth`

已上架教材的封面必須讓匿名訪客用普通的 `<img src>` 取得（公開商品頁），
而 **HTML 的 `<img>` 不會帶 `Authorization` header**。授權因此不能放在 middleware，
只能在服務層依所屬教材的 `status` 決定。這也是它與另外兩種私有資產最根本的差別：

```text
教材本體  購買授權（已核准訂單 + approved_file_id）  → 完全私有
付款憑證  訂單擁有權（orders.user_id）               → 完全私有
行銷素材  所屬教材的 status                          → 條件公開
```

**不要把教材或憑證的授權模型套到素材上** —— 三者只共用
`storage/privateFileStorage.js` 的 filesystem primitives，不共用授權。

### 三條不可破的不變條件

1. **可見性由所屬教材的 `status` 決定，不由檔名決定。**
   下架（`unpublished`）**立即**撤回匿名存取，不需要搬檔案、不需要換 URL。
   搬遷前的 `express.static` 做不到這件事：URL 一旦流出去，下架就再也撤不回來。
2. **未認領的上傳只有上傳者或 Admin 看得到。**
   創作者按下「上傳」到按下「儲存」之間的素材還不屬於任何教材。
3. **認領必須驗擁有權。** 一個 media id 只能被它的上傳者（或 Admin）綁到教材上，
   且不能被綁到第二份教材（400 `media_not_claimable`）。少了這條，創作者 B 只要把
   A 的未上架素材 URL 填進自己的教材再上架，就能讓 A 的私有素材變成公開的。

認領發生在 `POST /materials` 與 `PATCH /materials/:id`，與教材寫入**同一個 transaction**。
**外部 CDN 連結是合法用法**（表單明說可以手動貼），它們不進 `material_media_files`，
平台既沒有它們的授權資訊，也不代為交付。

### 已知限制（刻意，不是缺口）

- 買家購買後若該教材被下架，`/downloads` 等頁面的封面會退回底色 —— 買家不是
  擁有者也不是 Admin。這是上表規則的直接結果；要不要為「已購買」開一條例外
  屬產品決策，見 `docs/pending-work-tracker.md`。
- 未被任何教材認領的素材沒有自動清理（對照：教材本體有
  `scripts/cleanup-material-files.js`）。它們對外不可見，只佔磁碟。

canonical source 是 `Backend/services/materialMedia.service.js` 與
`Backend/utils/materialMediaPolicy.js`；schema 見 `db/db_schema.sql` 的
`material_media_files`；完整設計見 `docs/material-file-storage-and-delivery.md` §24。

---

# 4. Material create/update payload（teaching product spec）

`POST /materials`（teacher）與 `PUT`／`PATCH /materials/:id` 目前支援下列教學商品欄位：

> **`PUT` 與 `PATCH` 是同一個 partial-update handler**（`Backend/routes/materials.js` 的
> `updateMaterialHandler`，欄位以 `COALESCE` 合併）：**未提供的欄位保留原值**，
> 兩者的驗證與授權完全相同。集合欄位 `contents` / `detail_images` 若出現在 body 中則為整批取代。
> `PATCH` 為 preferred／canonical；`PUT` 僅保留相容性，不得在新功能中擴張。
> （2026-08-30 `DOC-01` 依實作更正用詞，**未改變任何 API 行為**。）

- 基本：`title`、`price`、`fileId`（也接受 alias: `file_id`）
  - `fileId` 來自 `POST /teacher/uploads/material-file`。**legacy 的 `file_key` 已不再接受**
    （`PUT/PATCH` 帶任何檔案欄位一律 400 `file_not_updatable_here`）。
    教材本體的規則見 `docs/material-file-storage-and-delivery.md`。
- 教學資訊：`teaching_objective`、`teaching_methods`（array）、`usage_duration`、`activity_steps`
- 建議填寫（非必填）：`age_range`、`extension_value`、`short_description`
- 內容清單：`contents[]`（每筆含 `type`、`name`、可選 `count`、`description`）

Create 時必填/驗證：

- `title` 不可空
- `price > 0`
- `fileId` 不可空，且必須是自己上傳、尚未被認領的檔案
- `ipDeclarationAccepted` 必須為 `true`
- `teaching_objective` 不可空
- `teaching_methods` 必須存在，長度 `>=1` 且 `<=4`，每筆不可空字串
- `usage_duration` 不可空
- `activity_steps` 不可空
- `contents` 至少 1 筆；每筆 `type`、`name` 必填；`count` 若提供需 `> 0`

Update 時：

- **`status` 不能由這支端點更改**（teacher 403、admin 400 `status_not_updatable_here`）——
  正式入口是審核 workflow，見 §21
- **任何檔案欄位都不接受**（`fileId` / `file_key` / `pending_file_id` / `approved_file_id`
  → 400 `file_not_updatable_here`）。換檔的正式入口是 `POST /materials/:id/file`，
  且只有 `changes_requested` / `unpublished` 可用
- 若 body 含 `contents`，以該陣列整批覆蓋（replace）`material_contents` 舊資料
- 送入 `price` 時必須 `> 0`

`GET /materials/:id` 會回傳 `materials` 主表欄位，並附上 `contents`（依 `sort_order` 升冪）。

**不在公開回應中的欄位**：`file_key`（legacy placeholder，已從投影移除）與
`material_file`（教材本體檔案摘要，**只給 admin 與教材擁有者**）。
`storage_key` / `checksum_sha256` / `uploaded_by` 任何角色都拿不到。

`GET /materials` 回傳 `{ items }`（**無**伺服端分頁）；可見範圍同 MVP 規格（匿名僅 `published`、教師可見自己的與已上架、管理員可見全部）。**列表排序**：依 `docs/materials-detail-spec.md` §10 之品質分 **由高到低**，再以 `created_at` **新到舊**。URL query 參數後端**忽略**；Web 探索頁得對回傳之陣列再做前端篩選／排序。

---

# 5. Order and payment state

本節共有**三層**狀態。它們是三件不同的事，**不得**用同一個 `status` 字彙混稱：

| 層 | 來源 | 誰在寫 | 用途 |
| --- | --- | --- | --- |
| **Order status** | `orders.status` | Backend（建立訂單／核准憑證） | 訂單本身的終局狀態 |
| **Proof review status** | `manual_payment_proofs.review_status` | Backend（admin 核准／退回憑證） | 單一張付款憑證的審核結果 |
| **Derived state** | 計算而來，**不落地** | 查詢當下由 SQL 衍生 | 回答「這張訂單現在卡在哪／誰該動作」 |

Derived state 有兩套，視角不同、名稱不同，**不得互相取代**：
buyer 的 `order_progress_state`（見下方 §5 末段與 §13）與 admin 的 `operational_status`（§19）。

**Order (`orders.status`)**

- `pending_payment` — after checkout; remains while proofs are only uploaded.
- `approved` — after admin approves a **pending** `manual_payment_proofs` row for that order.
- `cancelled` — **legacy 歷史列，read-only**。目前沒有任何 production writer（無取消流程，`cancelled_at` 亦無 writer）；資料庫中的少數列來自 v1.2 之前的舊工作流，僅供查閱。

**Dead values（不得重新引入為 `orders.status`）**：`paid`（歷史語意是**已核准**，不是「待審核」；bootstrap 每次啟動會 normalize 成 `approved`）、`completed`（從未有 writer，也沒有 fulfillment lifecycle）、`pending_review` / `payment_rejected` / `rejected`（屬憑證審核或衍生狀態，見 §19）。

**Parent APIs (`GET /orders/my`, `GET /orders/:id`):** Each order JSON includes **`payment_proof_pending_review_count`** (integer) — number of `manual_payment_proofs` rows for that order with `review_status = 'pending'` (awaiting admin). Frontend uses this to distinguish 「待上傳憑證」vs「審核中」while `orders.status` stays `pending_payment`.

**Not used on the order row:** `proof_uploaded` (proofs are tracked on `manual_payment_proofs`).

**Payment proof (`manual_payment_proofs.review_status`)**

- `pending` | `approved` | `rejected`
- Rejecting a proof does **not** change `orders.status` (order may stay `pending_payment`).

**Allowed admin path to paid order:** at least one proof is approved while order is `pending_payment` → order becomes `approved`.

**Not allowed:** approve an order that is already `approved` via the same flow; skip proof review.

### Buyer derived state（`order_progress_state`）

**canonical 定義：`Backend/services/buyerOrders.service.js`**（`/me/orders` 與
`/me/orders/:orderId` 共用同一段 SQL；只計算、**不落地**，`reviewing` / `rejected` /
`proof_uploaded` 永遠不得寫回 `orders.status`）。

> **產品規則：買家的訂單進度反映「目前這一筆付款憑證」走到哪一步，
> 不是歷史上是否曾經出現過某種憑證。**

一張訂單可以有多筆憑證（買家被退件後重新上傳）。決定進度的**只有最新一筆**：

| 情境 | `order_progress_state` | 買家看到 |
| --- | --- | --- |
| `orders.status = 'approved'`（不論憑證歷史） | `approved` | 已完成 |
| `orders.status = 'cancelled'`（不論憑證歷史） | `cancelled` | 已取消 |
| 最新憑證 `pending` | `reviewing` | 審核中 |
| 最新憑證 `rejected` | `rejected` | 審核未通過 |
| 最新憑證 `approved`，但訂單尚未核准 | `proof_uploaded` | 已上傳憑證 |
| 沒有任何憑證 | `pending` | 待付款 |

**Precedence 即語意，不可調換。**

1. `approved` 必須最先短路：核准憑證時會把同一張訂單其餘 pending 憑證標成 `rejected`
   （`note = 'superseded by approved proof'`），先看憑證會讓已完成的訂單倒退成「審核未通過」。
2. **`cancelled` 是第二個終態，同樣先短路**（`COR-03`）。它是 read-only 的 legacy 狀態，
   **沒有任何付款動作可做**，因此進度不得由憑證推導；少了這一條，已取消且無憑證的訂單
   會落到 `pending` 而顯示「待付款」，卻同時被列表歸進「歷史訂單」，自相矛盾。
   修正點在 canonical 的衍生欄位，**不是**在前端補一個 `orders.status === 'cancelled'`
   判斷 —— 後者會把徽章的來源又拆回兩個。
3. 歷史的 `rejected` **不得**覆蓋更新的 `pending`。這是 `COR-01` 的缺陷：買家**已經**
   重新上傳，卻仍被告知「請依退件原因重新上傳憑證」，於是再傳一次，堆出重複憑證。

**「最新」的定義**：`COALESCE(uploaded_at, created_at) DESC, id DESC`
（`LATEST_PROOF_ORDER_BY_SQL`，`Backend/utils/paymentProofReview.js`）——
資料庫存在 `uploaded_at IS NULL` 的舊憑證，`id` 則是相同時間戳時的 deterministic tie-break。
§19 的 admin `operational_status` **共用同一份排序**，因此兩個視角必然指向同一筆憑證。
SQL 是實作細節，產品規格是上方粗體那句。

**兩個視角的語意對齊**（同一張「舊 rejected ＋ 新 pending」的訂單）：

```text
Admin  operational_status = pending_review    （我現在要審這筆）
Buyer  order_progress_state = reviewing       （我送出的憑證正在審）
```

字不同，語意必須一致。**不得**把兩者合併成單一 universal state：vocabulary 與 JTBD 不同。

**UI 契約**：`reviewing` 時買家端**不得**出現「重新上傳付款憑證」CTA（他已經上傳了）；
只有 `rejected` 才顯示退件原因與重新上傳入口。進度徽章、CTA、timeline 一律讀
`order_progress_state`，不得各自從 `orders.status` 或 pending 憑證數再推導一次。
`cancelled` 顯示「已取消」，且不得出現任何付款 CTA。

**退件備註只在 `rejected` 時進 payload**（`COR-02`）：
`GET /me/orders/:orderId` 的 `payment_proof_rejected_note` /
`payment_proof_rejected_reason` **只有在 `order_progress_state = 'rejected'` 時才回傳**，
其餘狀態一律為 `null`。理由是 `note` 是**買家可見**的自由文字，但核准流程會借用同一個欄位
寫入營運字串（`note = 'superseded by approved proof'`）—— 那是寫給營運看的，不是給買家的
退件理由。條件用的是同一份 `order_progress_state`，不得在別處再判斷一次「什麼算 rejected」。

**進度判定不得依賴檔案層資訊**：`storage_key` / `storage_status` / `checksum_sha256` /
MIME / 檔名一律不參與（見 §12.4）。business state 的來源只有 `orders.status`
＋ `manual_payment_proofs.review_status` ＋ 上述排序。

**回歸測試**：`Backend/tests/buyerOrderProgress.db.test.js`（推導）、
`Backend/scripts/api-smoke-test.js`（退件→重新上傳的真實 HTTP 路徑）、
`frontend/apps/web/tests/e2e/buyer-order-progress.spec.ts`（UI 文案與 CTA）。

---

# 6. Report lifecycle (`reports.status`)

Canonical state machine：`Backend/utils/reportWorkflow.js`（唯一定義；routes / services / UI filter 都從那裡讀）。

| 狀態 | 意義 |
| --- | --- |
| `pending` | 買家送出檢舉後的初始狀態 |
| `investigating` | Admin 已接手調查 |
| `awaiting_creator` | Admin 已要求創作者補充說明 |
| `resolved` | 檢舉成立並已執行處置 |
| `dismissed` | 檢舉不成立 |
| `reviewed` | **legacy terminal（唯讀相容）** —— 舊版「標記已讀」的終態；**不是**任何合法轉移的目標，正式產品 UI 不再產生 |

允許的轉移（其餘一律 409）：

```text
pending          → investigating | awaiting_creator | resolved | dismissed
investigating    → awaiting_creator | resolved | dismissed
awaiting_creator → investigating（創作者已回覆）| resolved | dismissed
resolved / dismissed / reviewed → （終態）
```

### 狀態分組（Dashboard 待辦與清單篩選都以此為準）

```text
open（未結案）        = pending + investigating + awaiting_creator
adminActionable（待辦）= pending + investigating
creator 側            = awaiting_creator
terminal              = resolved + dismissed + reviewed(legacy)

open = adminActionable + awaiting_creator
```

**「未結案」不等於「現在需要 Admin 處理」。** `awaiting_creator` 的球在創作者手上：
`routes/creatorCases.js` 把它定義為創作者端的 `action_required` 範圍，且要由創作者的
`submitCreatorResponse` 轉回 `investigating`（球才回到 Admin）。Admin 仍可從該狀態直接
resolve / dismiss，但那是「不等了」的逃生門，不是預期的下一步。

因此：

- **Dashboard「待處理檢舉」= `ADMIN_ACTIONABLE_REPORT_STATUSES`**（`pending + investigating`），
  由 `GET /admin/dashboard/summary` 的 **`actionableReportsCount`** 提供。
  舊欄位 `pendingReportsCount` 維持字面上的 `status='pending'`，不改語意。
- `/admin/reports` 第一層的「未結案」= `OPEN_REPORT_STATUSES`；
  「待我處理」是第二層選項（API `?status=pending,investigating`）。
- 兩組常數都在 `Backend/utils/reportWorkflow.js`，**不得**在 Dashboard 或頁面各自手寫。

### legacy `reviewed`（唯讀相容）

`reviewed` **不在任何一列轉移的右側** —— 正式 workflow（含 `GET /admin/report-cases/:id`
回傳的 `allowedTransitions`）永遠不會把它列為可選目標。它仍然是合法的**狀態值**：
既有資料要讀得到、要能被 `?status=` 查詢、要歸入 UI 的「已結案」。

- **正式產品 UI 已經沒有任何入口會產生新的 `reviewed`。**
  `/admin/materials/:id/reports` 的「標記已處理」按鈕已移除，該頁降為 contextual read-only。
- 唯一還能寫出新 `reviewed` 的是 **deprecated** 的 `PATCH /admin/reports/:id { status: "reviewed" }`
  （回應帶 `Deprecation: true`）。它**不經過**這張轉移表，且只允許 `WHERE status = 'pending'`。
- **既有列不回填、不刪除。** 它反映的是「當時只做了標記已讀」；改寫成 `resolved`
  會讓它與真正做過處置的案件無法區分 —— historical truth > schema cleanliness。
- UI 文案是「**舊版已處理**」，不是「已處理」，並在案件詳情補一句
  「此案件使用舊版『標記已處理』流程結案，沒有新版案件的處置紀錄」。

`/admin/reports` 是**唯一**正式的檢舉案件處理入口（見 `docs/admin-information-architecture.md` §9）。

## 6.1 最終處置（`reports.resolution`）

| code | 意義 | 副作用 |
| --- | --- | --- |
| `dismissed` | 檢舉不成立 | 無；狀態 → `dismissed` |
| `warning` | 對創作者發出警告 | 僅紀錄；狀態 → `resolved` |
| `request_changes` | 要求創作者修改教材 | 僅紀錄；狀態 → `resolved` |
| `unpublish_material` | 下架教材 | `materials.status = 'unpublished'`（僅當目前為 `published`）+ `material.unpublished` audit log |

**allowlist 只含平台真的做得到的動作。** 「使用者停權」不在其中 —— `users` 沒有 status／suspension 欄位。

## 6.2 案件歷程（`report_events`）

每一次狀態轉移、每一則訊息都寫入 `report_events`（`status_changed` / `admin_note` /
`creator_response_requested` / `creator_response` / `resolution`）。

- 這**不是** `activity_logs` 的替代品：`activity_logs` 是全平台稽核軌跡，`report_events`
  是案件內容（要顯示給創作者看）。兩者都會寫。
- `admin_note` 是 Admin 內部筆記，**Creator 端 API 會過濾掉**。
- 狀態轉移、事件寫入與教材下架在**同一個 transaction**；`activity_logs` 在 COMMIT 之後才寫
  （沿用付款憑證審核的既有慣例：稽核失敗不回滾已成立的業務操作）。

## 6.3 併發

每個動作先 `SELECT ... FOR UPDATE` 鎖列，再依讀到的實際狀態做條件式 UPDATE
（`WHERE status = <expectedFrom>`）。兩個 Admin 同時處理同一張案件時，第二個人拿到 **409**，
不會覆蓋第一個人的判定。

Same reporter cannot submit duplicate reports for the same material (`UNIQUE (material_id, reporter_id)`).

## 6.4 Report case API

| Method | Path | 說明 |
| --- | --- | --- |
| `GET` | `/admin/reports` | **legacy**：裸陣列，`?status=pending\|reviewed`。形狀不變。新的案件佇列請用 `GET /admin/report-cases` |
| `GET` | `/admin/report-cases` | 案件佇列。`?status=open\|all\|<csv>`、`?q=`、`page`/`limit`；回 `{ items, pagination, statusCounts }` |
| `GET` | `/admin/report-cases/:id` | `{ report, events, availableResolutions, allowedTransitions }` |
| `POST` | `/admin/report-cases/:id/investigate` | `pending → investigating` |
| `POST` | `/admin/report-cases/:id/request-response` | `{ message }`（必填）→ `awaiting_creator` |
| `POST` | `/admin/report-cases/:id/notes` | `{ message }` Admin 內部筆記；不改狀態 |
| `POST` | `/admin/report-cases/:id/resolve` | `{ resolution, note? }` → `resolved` / `dismissed` |
| `GET` | `/creator/cases` | Creator 自己教材上的案件。`?scope=action_required\|open\|all`；回 `actionRequiredCount` |
| `GET` | `/creator/cases/:id` | `{ case, events, canRespond }`；events 不含 `admin_note` |
| `POST` | `/creator/cases/:id/respond` | `{ message }`；`awaiting_creator → investigating` |

`/creator/cases` 亦掛在 `/teacher/cases`（相容別名，同一個 router）。

**Creator 端的授權寫在 SQL 的 `materials.teacher_id = <caller>`**，不是 route 層的事後比對。
不屬於自己的案件一律 **404**（不是 403 —— 403 會洩漏 case id 存在）。
Creator 端也**不回傳檢舉人身分**：創作者需要知道被檢舉什麼，不需要知道是誰檢舉的。

## 6.5 買家端送出入口（`BUY-01`）

**檢舉只由買家產生。** 平台沒有、也不打算有「Admin 代開案件」的端點 ——
`reports.reporter_id` 是 `NOT NULL REFERENCES users(id)`，案件必然有一個真實的檢舉人。

唯一入口：**教材詳情頁 `/materials/:id` 底部的「檢舉這個教材」**
（`frontend/apps/web/components/materials/detail/MaterialReportDialog.tsx`，
由 `MaterialDetailPage.tsx` 掛載）。

| 規則 | 內容 |
| --- | --- |
| 可見性 | **永遠顯示**，包含未登入訪客與非買家。與同一頁「加入購物車」一致：顯示提示，不隱藏能力 |
| 授權 | 真正的邊界是 Backend 的 `requireRole("parent")`。前端的 `tp_role` 只決定 dialog 顯示表單還是登入提示，**不是授權** |
| 非買家 | dialog 顯示「請先以購買者帳號登入」＋ `/login?redirect=/materials/:id`，**不呼叫** `POST /reports` |
| 理由欄位 | **自由文字**（必填、`trim` 後送出、上限 500 字）。`reports` 沒有 reason code 欄位，前端**不得**自行拼一組假分類進 `reason` —— Admin 端（`lib/admin-labels.ts` 的 `report_created.reason`）顯示的是檢舉人的原文 |
| 重複檢舉 | **不在前端猜**。平台沒有 buyer 端的 reports 讀取 API；重複由 `UNIQUE (material_id, reporter_id)` 擋下回 **409**，UI 顯示「你已經檢舉過這個教材了」 |
| 送出後 | 只顯示「已收到你的檢舉」。買家**看不到**案件狀態（沒有對應的讀取 API），也不會被通知（見 §6.6） |

Regression：`frontend/apps/web/tests/e2e/material-report.spec.ts`（送出／409／訪客 gating）。
Backend 行為（201 / duplicate 409 / `report_created` activity log）由
`Backend/scripts/api-smoke-test.js` 與 Postman collection 覆蓋，**不由 UI 測試重複驗證**。

## 6.6 目前沒有的能力（需產品決策）

- **買家端案件追蹤**：買家送出後看不到自己的檢舉處理到哪裡；沒有 `GET /reports/mine`
  之類的端點，`reports` 也沒有給檢舉人看的視圖。這是刻意的最小範圍，不是遺漏。
- **檢舉附件**：`reports` 與 `report_events` 都沒有附件欄位；平台唯一的上傳管線是付款憑證
  （`Backend/routes/order.js` 的 multer + 本機磁碟）。創作者只能提交文字說明。
- **推播通知**：沒有 notifications 資料表；`emailService` 只涵蓋訂單／付款事件。
  創作者是**主動**到 `/creator/cases` 查看（側欄徽章顯示待回覆數量），不是被通知。

---

# 7. Download authorization rule

ALLOW if:

approved order (`orders.status = approved`)
AND order_item exists for that material and buyer

DENY if:

not owner
order not approved
material not in order
material not found

---

# 8. Review authorization rule

ALLOW if:

at least one **approved** order exists for the parent **and** that order’s `order_items` include the target `material_id` (entitlement is an **existence** check—any qualifying order counts; a **separate** `pending_payment` order for the same material does **not** remove this entitlement).

DENY if:

no such approved purchase (no approved order whose `order_items` include this `material_id`)
duplicate review for same material (unique constraint; a second **POST** returns **409**; MVP has no separate “update review” endpoint)

---

# 9. Activity log actions & admin audit API

**Audit API（僅 admin，JWT）：**

- `GET /admin/activity-logs` — 全站紀錄；query：`actor_id`、`actor_role`（teacher / parent / admin）、`action`、`target_type`、`target_id`、`page`（預設 1）、`limit`（預設 20，最大 100）；排序固定 `created_at DESC`。
- `GET /admin/activity-logs/:id` — 單筆；路徑 `:id` 須與列表項目 `id` 一致。**canonical 為 `activity_logs.id` TEXT UUID**（2026-08-26 `SCHEMA-01` 對齊實況；服務層一律以 `WHERE l.id::text = $1` 比對，因此 BIGSERIAL 的舊環境也相容）。**`id` 是 identity 不是 time** —— 排序一律 `ORDER BY created_at DESC, id DESC`，`id` 只是 deterministic tie-breaker；不得用 `id` 做 cursor pagination（本端點為 LIMIT/OFFSET）。回應形狀與列表項目**完全相同**（含 `actor_email` / `target_label` / `order_buyer_email`），見 §22.2.2。
- `GET /admin/users/:userId/activity-logs` — `actor_id = userId`，支援 `page` / `limit`。
- `GET /admin/materials/:materialId/activity-logs` — `target_type = material` 且 `target_id = materialId`，支援 `page` / `limit`。
- `GET /admin/orders/:orderId/activity-logs` — `target_type = order` 且 `target_id = orderId`，支援 `page` / `limit`。

列表回傳 `{ items, pagination: { page, limit, total } }`。teacher / parent 不得查詢（403）；未登入 401。

**Action 命名（沿用現行程式寫入；篩選時請用完全一致字串）：**

- `material.created`、`material.published`、`material.unpublished`
- `cart.added`、`cart.removed`
- `order_created`、`payment_proof_uploaded`、`payment_proof.approved`、`payment_proof.rejected`
- `download.attempted`、`download.denied`、`download.allowed`
- `review_created`
- `report_created`、`report_reviewed`：`report_created` 之稽核列為 `target_type = material`、`target_id` = 教材 id；`report_reviewed` 之稽核列為 `target_type = report`、`target_id` = 該筆檢舉 id。

**教材狀態稽核：** 每一個狀態轉移都有自己的 action，全部由審核 workflow 寫入
（`Backend/services/materialReview.service.js` 與 `services/reportAdmin.service.js`）：
`material.published`（核准，meta 含 `firstPublish`）、`material.changes_requested`（退回，meta 含
`reasonCode` / `note`）、`material.resubmitted`（創作者重新送審）、`material.unpublished`（檢舉處置，meta 含 `reportId`）。

**`PUT/PATCH /materials/:id` 不再改變 status**（帶 `status` → **400** `status_not_updatable_here`），
因此它不再寫任何狀態稽核事件。見 `docs/material-review-workflow.md` §8。

**購物車稽核（`cart.added`）：** 新增列與「同一 user+material 已存在而更新數量（upsert）」兩種路徑都會寫入；後者之 `meta` 可含 `upserted: true`。

（歷史資料若略有別名，仍以資料庫實際 `action` 為準；新開發請沿用上列。）

---

# 10. HTTP API 一覽

完整 HTTP 路由表（方法、路徑、認證／角色與簡述）見 **`docs/teaching-platform-mvp-spec-v1.4.md` 第 11 節**（HTTP API reference）。

教材上架與商品 Detail 實作細節（欄位語意、內容結構、Detail 顯示順序、MVP 排序機制）見 **`docs/materials-detail-spec.md`**。

**實作須與本檔、`docs/teaching-platform-mvp-spec-v1.4.md`、`db/db_schema.sql` 對齊；三者為準，程式應修正至一致（更新 canonical 段落須依專案同意流程）。**

---

# 11. Swagger / OpenAPI 文件規則

- 後端啟動後需提供 Swagger UI：`GET /api-doc`。
- 需同步提供 OpenAPI JSON：`GET /api-doc.json`。
- Swagger 文件必須覆蓋目前已開發之所有 HTTP API（參考第 9 節與 spec 第 11 節）。
- 每個 API 至少需包含：
  - `summary` 與 `description` 的中英文敘述
  - request 參數/Body 定義
  - success/error response 與狀態碼
  - response schema 欄位型別與範例（供前端直接對接）

---

# 12. Admin payment proof listing（新增）

新增管理員付款憑證清單 API（admin JWT 必要）：

- `GET /admin/payment-proofs`
- Query:
  - `status`（optional）：`pending` | `approved` | `rejected`
  - `page`（optional，預設 1，最小 1）
  - `limit`（optional，預設 20，最小 1，最大 100）

  - `q`（optional）：**human-friendly lookup** —— 訂單編號 / 買家 email / 憑證 id。
    Admin 不應被要求知道 internal identifier 才找得到案件；憑證 id 仍可搜，但不是唯一入口。
    `%` / `_` / `\` 會被跳脫（`Backend/utils/adminQuery.js` 的 `toLikePattern`），
    輸入 `100%` 不會退化成萬用字元查詢。

回傳：

- `items`: 付款憑證列 + **判斷所需的訂單 context**
  - 憑證：`id`、`proof_storage_status`、`proof_file_available`、`proof_file_path`、
    `proof_mime_type`、`proof_size_bytes`、`original_filename`、
    `review_status`、`uploaded_at`、`created_at`、`reviewed_at`、`reviewed_by`、`reviewed_by_email`、
    `note`、`rejection_reason`

  > **`proof_url` 已從契約中移除**（付款憑證私有儲存，2026-08-23）。舊契約直接交出
  > `/uploads/payment-proofs/<file>` 這條**沒有任何授權**的公開 URL。現在改回一條受保護的
  > `proof_file_path`，讀取仍須通過 `requireAuth` + Admin／訂單擁有者授權。
  > `storage_key` 與實體路徑**不出現在任何 API 回應或 log**。詳見 §12.4。
  - 訂單：`order_id`、`user_id`、`buyer_email`、`order_status`、`order_total_amount`、
    `order_total_price`、`order_discount_amount`、`order_promo_code`、`order_payment_mode`、
    `order_created_at`、`order_paid_at`、`order_payment_due_at`、`order_proof_count`
- `pagination`: `{ page, limit, total, totalPages }`
- `statusCounts`: `{ total, pending, approved, rejected }` —— **全表**計數，不受 `status` / `q` / 分頁影響

`order_payment_due_at` 自 2026-08-26 起是 **`orders.payment_due_at` 實體欄位**（建單時由 `utils/paymentTimingPolicy.js` 算出並寫入，7 個日曆日）；legacy 訂單為 `null`，**不得 fallback 推算**。另有 `order_review_due_at` 與 `review_overdue`。先前的 `PAYMENT_DUE_DAYS` SELECT 推算已移除。
不是資料庫欄位。唯一定義在 `Backend/services/adminPaymentProofs.service.js`；UI 不得自行推算。

## 12.1 `GET /admin/payment-proofs/:id`

單筆審核的完整 decision context：

- `proof`: 同上單列
- `orderItems`: 訂單明細（`material_title`、`quantity`、`unit_price`、`subtotal`）
- `otherProofs`: **同一張訂單的其他憑證**（含 `review_status`、`rejection_reason`、`note`）

`otherProofs` 不是裝飾：買家在憑證被退回後會重新上傳，Admin 必須看得到上一次的退回理由，
否則會用同樣的理由再退一次。

## 12.2 退件原因（`manual_payment_proofs.rejection_reason`）

`POST /admin/payment-proofs/:id/reject` 的 body：

```json
{ "rejection_reason": "amount_mismatch|unreadable|payment_not_found|invalid_proof|other",
  "note": "選填；rejection_reason = other 時必填" }
```

- `rejection_reason` **必填**且經 Backend 驗證（`Backend/utils/paymentProofReview.js`）。
  舊版只有自由文字 `note`，而且**只有前端**擋 —— 直接打 API 就能留下沒有理由的退件，
  買家在訂單詳情只會看到一片空白。
- `note` 語意不變（自由文字補充說明），既有列不改寫。
- 買家在 `GET /me/orders/:orderId` **與 `GET /me/orders`（清單）** 都取得
  `payment_proof_rejected_reason`（code）與既有的 `payment_proof_rejected_note`。
  文案對照：Backend `REJECTION_REASON_TEXT`（通知信）、
  Web `lib/admin-labels.ts`（畫面）—— 兩邊都由同一組 code 驅動。
- **兩個 payload 共用同一段 SQL**（`Backend/services/buyerOrders.service.js` 的
  `REJECTED_PROOF_COLUMNS_SQL`），因此 `COR-02` 的守則對兩者一致生效：
  **只有 `order_progress_state = 'rejected'` 時才回傳這兩個欄位**
  （`note` 在 Admin 核准訂單時會被借用來寫營運字串，非 rejected 時回傳它等於外洩內部備註）。
  清單先前不帶這兩個欄位，導致「我的訂單」列表顯示「審核未通過」與「重新上傳」CTA
  卻說不出原因 —— 而 Admin 的退件表單明寫著「退回原因（必選，購買者會看到）」。
- **買家可見面一律顯示 code 對應的中文標籤，不顯示 code 本身**
  （`frontend/apps/web/lib/payment-rejection.ts` 為三個買家 surface 的唯一 formatter：
  訂單列表、訂單詳情、重新上傳頁）。未登記的 code 退回只顯示 `note`，不得把
  `amount_mismatch` 這類內部值直接呈現給買家。

## 12.3 付款申報欄位（**已接線**）

**2026-08-26。** `manual_payment_proofs` 具備結構化的付款申報欄位：

```text
reported_bank_name       買家申報的匯款銀行
reported_account_last4   帳號後四碼（CHECK：剛好四位數字）
reported_amount          申報金額（CHECK：> 0）
reported_transfer_at     申報的匯款時間
```

**`reported_` 前綴是刻意的**：這些是**買家自行申報**的值，**不是平台查證後的事實**。
兩者不得混用 —— 付款爭議中，平台不得把自己保存的紀錄當成唯一認定依據
（網路交易定型化契約「不得記載事項」第七點）。

欄位放在**憑證列**而非訂單列：一筆訂單可能多次提交（退件後重傳），
每次申報的內容可能不同，而那個歷程本身就是爭議處理的證據。

### 12.3.1 接線（2026-08-26，Wave 2 #8）

**Buyer 提交：** `POST /orders/:id/payment-proof`（`multipart/form-data`）除檔案外接受
`reportedBankName` / `reportedAccountLast4` / `reportedAmount` / `reportedTransferAt`。

- **四個欄位全部選填** —— 既有流程允許只上傳圖片，新增欄位不得把它變成必填
- 只要有填就必須合格。canonical validator 是 `Backend/utils/reportedPayment.js`，
  **不得**在 route、service 或前端各寫一份規則
- **只驗格式，不驗真偽**：不比對申報金額與訂單金額（金額不符是**爭議事實**，
  不是輸入錯誤 —— 擋掉它等於讓買家無法申報「我少匯了」）、不維護銀行代碼表、
  不驗證帳戶所有權、不做 KYC
- **只收帳號末四碼**，不收完整銀行帳號（DB `mpp_reported_last4_check` 亦擋）

**Admin 讀取：** `GET /admin/payment-proofs` 與 `/:id` 回傳四個 `reported_*`
＋ `order_payment_info_submitted_at` ＋ `order_payment_received_at`。

**Admin UI 的用語是規則的一部分：** 買家申報值一律標示為「購買者填寫的…」，
**不得**寫成「實際入帳銀行／金額／時間」。平台查證的事實另有欄位（見 §12.3a）。

**兩個事實來源並存，永不互相覆寫：**

```text
買家申報（reported_*）          平台查證（payment_received_at）
「我 8/26 14:00 匯了 480」      「銀行顯示 8/26 14:03 入帳」
```

兩者都要留得住 —— 那是消費申訴（§12.10）與付款爭議核對的基礎。

**重新提交不覆寫舊申報。** 退件後重傳會建立**新的** `manual_payment_proofs` 列，
舊列的申報內容原地保留：那是買家當時說了什麼的事實。

**買家沒有任何路徑可以寫平台查證欄位** —— `payment_received_at` 與 `paid_at`
都不在買家端的請求形狀內（HTTP 實測：夾帶這些鍵回 201 但兩欄仍為 NULL）。

## 12.3a 付款／核帳的四個時間（**不得互相替代**）

**2026-08-26 新增**（`P1-09` Gate 6 / Gate 11）。

| 欄位 | 語意 | 用途 |
| --- | --- | --- |
| `orders.payment_due_at` | Buyer 該訂單最晚付款期限 | 逾期處理；消保法 §18 I(2) 的「付款期日」 |
| `orders.payment_info_submitted_at` | **平台何時被告知**買家已付款 | **人工審核 SLA 的起算點** |
| `orders.review_due_at` | 平台人工付款審核期限 | 逾時偵測；推導「交付期日」 |
| `orders.payment_received_at` | 平台銀行帳戶**實際**收到款項的時間 | **稅務憑證時點依此** |
| `orders.paid_at` | **Admin 核准相關時間戳（既有語意，未變）** | **營收認列依據**（adminDashboard／adminTrends／teacherSales） |

**三條硬規則：**

1. **`review_due_at` 不得以 `payment_received_at` 起算。**
   後者是 Admin 查帳時才發現的過去時間，從它起算會變成回溯計算 ——
   可能平台一得知就已經逾時。一律以 `payment_info_submitted_at` 起算。
2. **`paid_at` 不是收款時間，不得當作稅務時點。**
   它的唯一寫入點是 `routes/admin.js` 的憑證核准（`paid_at = NOW()`）。
   本次**未**改名、**未**改義、**未**改動任何既有 revenue query。
3. **未知就是 NULL。** 歷史列的 `payment_received_at` 一律保持 NULL，
   **絕不以 `paid_at` 回填** —— 那會製造「系統知道銀行何時入帳」的假歷史證據。

### 12.3a.1 `payment_received_at` 的寫入（2026-08-26，Wave 2 #8）

**唯一入口：`POST /admin/payment-proofs/:id/approve` 的選填 `paymentReceivedAt`**（Admin only）。

| 規則 | 行為 |
| --- | --- |
| 未提供 | 保持既有值（多為 NULL）。**絕不預設 `NOW()`** |
| 不得抄 `reported_transfer_at` | 那是買家申報，不是平台觀察到的事實 |
| 不得抄 `paid_at` | 那是 Admin 按下核准的時刻，不是銀行入帳 |
| 未來時間 | 400 `invalid_payment_received_at`（允許一天時差寬容） |
| 非 Admin | 403／401 |

Admin UI 的欄位標示為「銀行實際入帳時間（選填；**不確定請留空，不要猜**）」，
並明寫「請填寫您在銀行帳戶上看到的入帳時間，而非購買者申報的匯款時間」。

**本輪不加「核准前必須有 `payment_received_at`」的硬性要求** ——
baseline 與現行 workflow 都沒有鎖定這條，且它牽涉會計認列時點（External Tax Gate `PENDING`）。
後端已能保存它；是否成為核准前提屬產品／會計決策。
   `POST /admin/payment-proofs/:id/approve` 的 `paymentReceivedAt` 為**選填**，
   未提供時保持 NULL，**不預設為 `NOW()`**。

**期限「存下來」而非即時計算**，是因為它是**對買家揭露過的承諾**；
政策日後調整不得追溯變動既有訂單。

> ### 12.3a.2 已拍板的兩個數字（2026-08-26，Wave 2 #9）
>
> | 項目 | 值 | 起算 | canonical |
> | --- | --- | --- | --- |
> | Buyer 付款期限 | **7 個日曆日** | `orders.created_at` | `Backend/utils/paymentTimingPolicy.js` |
> | 人工核帳 SLA | **3 個日曆日** | `orders.payment_info_submitted_at` | 同上 |
>
> **兩者都是日曆日，不是工作日。** 工作日需要權威國定假日行事曆 ——
> 那正是 `LEGAL-01` / 民法 §122 刻意延後的那份資料；用日曆日就不引入該依賴。
>
> **期限模型 = 末日終了**（不是 `+N×24h`）：
>
> ```text
> 訂單建立（台灣日曆日）  2026-08-26
> 付款期限日              2026-09-02   ＝ 建立日 + 7 個日曆日
> 期限終止                2026-09-02 23:59:59.999（台北）
> ```
>
> 理由：與買家看到的「請於 2026/09/02 前完成匯款」一致（一個**日期**）；
> 符合 §18 I(2) 的「付款期日」；且永遠不會比 `+N×24h` 更短。
> 附帶結果是它與民法 §120 II ＋ §121 I 算出來完全相同，不需要在兩種模型間選邊。
>
> **期限是實體欄位，不得即席推算。** 期限是對買家揭露過的承諾；
> 政策日後調整時既有訂單必須維持當初的期限，**不得追溯變動**。
> 舊的 `PAYMENT_DUE_DAYS = 3`（`adminPaymentProofs.service.js` 的 SELECT 推算）
> **已於本輪移除** —— 那個 3 從未被拍板，而且會對 legacy 訂單算出它們從未被揭露過的期限。
>
> **Legacy 訂單一律 NULL。** 政策生效前建立的訂單沒有被揭露過任何期限，
> 因此 `payment_due_at` / `review_due_at` 保持 NULL，**不得 backfill、不得 fallback 推算、
> 不得被判定為逾期**（未知 ≠ 違規）。Admin 與 Buyer 介面一律誠實顯示「未設定付款期限（舊訂單）」。
>
> **買家可見文案（PRODUCT COPY / PENDING LEGAL WORDING）：**
>
> > 付款：請於 `YYYY/MM/DD` 前完成匯款並提交付款資訊。
> > 核帳：付款資訊提交後，平台**通常於 1 個工作日內完成核帳，最遲於 3 個日曆日內完成**；
> > 核帳通過後即開通教材。
>
> **「通常 1 個工作日」只是 expected service level，不是 backend deadline。**
> 可稽核的承諾只有 3 個日曆日；`paymentTimingPolicy.EXPECTED_REVIEW_COPY_ONLY`
> 刻意是字串而非數字，讓它永遠進不了計算。
> 前端文案的單一來源是 `frontend/apps/web/lib/payment-timing.ts`。
>
> 2026-08-26 之前，四處買家頁面承諾了一個**從未被拍板、也沒有任何 backend 追蹤**的
> 小時級審核時間，而且比實際 SLA 更緊。已全數改為上述文案。
>
> **正式 Legal Page 與 §18 的最終條文措辭仍待律師（`L-08`／`L-17`）** ——
> 上面是**產品語意**，不是最終法律文字。
>
> **本輪未做**：自動過期（無 `orders.status = 'expired'`、無排程、無自動取消）、
> 逾期付款的 enforcement、逾時**告警**的送達管道。
> Admin 目前**可以辨識**逾期與逾時，但系統不會自己動手。
>
> **（2026-08-27 更新）** 上列「逾期付款的 enforcement」已於 **Wave 2 #12** 補上，見 §12.3a.3。
> 其餘三項（自動過期 / 排程 / 自動取消）**仍然未做，且是刻意不做**。

> ### 12.3a.3 逾期付款的 enforcement（2026-08-27，Wave 2 #12）
>
> **`payment_due_at` 治理的是「第一次有效提交」，不是訂單的生死。**
>
> 拍板的模型是 **Option A + A2**：期限只擋「從未在期限內提交過」的訂單，
> 已經在期限內履行過付款義務的買家，**不因平台的審核時間而失去補件／重傳權利**。
>
> | 情境 | 行為 |
> | --- | --- |
> | 期限未到 | 可提交 |
> | 期限已過、**從未**提交過 | **409 `payment_deadline_expired`**，且**不產生任何寫入** |
> | 期限內提交過 → 被退件 → 期限已過 | **仍可補件**（A2） |
> | 期限內提交、仍在審核中 | 不受影響；Admin 可在期限後正常核准 |
> | Legacy（`payment_due_at IS NULL`） | **豁免**，一律可提交。**不 backfill** |
>
> **沒有新增 `orders.status = 'expired'`。** 逾期是 `payment_due_at` 與 `NOW()` 的**推導結果**，
> 不是訂單狀態機的一個節點 —— 與 `order_progress_state` / `operational_status` 同一個先例。
> **也沒有**排程、cron、自動 DB 狀態轉移、Admin 延期 / reopen / bypass 端點、通知管道。
> 逾期訂單維持 `pending_payment`；買家要買就重新建立訂單。
>
> **`manual_payment_proofs` 是「曾在期限內提交過」的唯一可靠證據。**
> `orders.payment_info_submitted_at` **會被後續提交覆寫**（安全測試庫中已有 17 筆受影響），
> 因此它**不得**用來判定 A2。判定式一律是憑證列的
> `COALESCE(uploaded_at, created_at) <= payment_due_at`。
>
> **單一 canonical predicate。** 定義只有一份，在 `Backend/utils/paymentTimingPolicy.js`：
>
> | 匯出 | 用途 |
> | --- | --- |
> | `TIMELY_SUBMISSION_SQL` | 「曾在期限內提交過」 |
> | `PAYMENT_SUBMISSION_ALLOWED_SQL` | 買家現在可否提交 |
> | `PAYMENT_DEADLINE_EXPIRED_SQL` | 期限是否已過（**與可否提交是兩件事**） |
> | `evaluatePaymentSubmission()` | 寫入路徑的同義 JS 判定 |
> | `PAYMENT_DEADLINE_EXPIRED_CODE` | `"payment_deadline_expired"` |
>
> **前端不得自行用日期重算 eligibility。** Buyer (`GET /me/orders/:id`) 與
> Admin (`GET /admin/payment-proofs`) 都直接回傳推導欄位
> （`payment_submission_allowed` / `payment_deadline_expired`；admin 端加 `order_` 前綴）。
> 「期限已過」與「不能提交」在 A2 情境下**會不一致**，這正是不能在前端重算的原因。
>
> **唯一寫入閘門。** enforcement 放在 `services/orderService.js` 的 `uploadProof()`，
> 因此 `POST /orders/:id/payment-proof` 與 legacy `POST /orders/:id/upload-proof`
> **共用同一個 handler，沒有繞道**。
>
> **授權先於期限。** deadline 檢查放在 ownership 檢查**之後** ——
> non-owner 一律 403，**不得**因為 deadline 錯誤而得知該訂單是否存在或其期限。
>
> **失敗不留半套。** 409 時不寫 `manual_payment_proofs`、不動
> `payment_info_submitted_at` / `review_due_at` / `orders.status`，
> 也不在 `private-storage/payment-proofs/` 留下檔案。
>
> **買家可見文案（PRODUCT COPY / PENDING LEGAL WORDING）：**
>
> > 付款期限已過
> > 此訂單目前無法再提交付款憑證。如仍要購買，請重新建立訂單。
>
> 單一來源是 `frontend/apps/web/lib/payment-timing.ts`
> （`PAYMENT_DEADLINE_EXPIRED_TITLE` / `_BODY`）。
>
> **本輪未做**：`expired` order status、排程／cron／自動狀態轉移、
> Admin 延長期限 / reopen / bypass、逾期通知（Email／站內信）、
> legacy NULL 的 backfill。


## 12.1a 教材權利審查（`material_rights_reviews`）—— **與一般內容審核分離**

**2026-08-26 新增**（`P1-09` Gate 2 / D5）。

### 四個結構，四件不同的事

| 結構 | 是誰做的、代表什麼 |
| --- | --- |
| `materials.ip_declaration_accepted` / `ip_declaration_at` | **Creator 的聲明**。建立教材時 request 的 `ipDeclarationAccepted` **必須明確為 `true`**，backend 驗證通過後才允許建立（`routes/materials.js`），因此它是創作者的明示行為。**但仍無文件版本與內容雜湊**，不構成版本化的同意證據 —— 版本化待 Gate 2 / Gate 5 |
| `materials.reviewed_by` / `reviewed_at` / `review_reason_code` / `review_note` | **一般內容審核**的 **latest snapshot**（會被覆寫；schema 註解明寫「不是 history」）。服務的是上架狀態機 |
| `report_cases` / `report_events` | **買家檢舉**（上架**後**） |
| **`material_rights_reviews`** | **Platform 的權利審查**（append-only history） |

**四者不得互相代表。** 特別是：

> **`ip_declaration_accepted = true` 不代表平台完成了權利審查。**
> **「核准上架」也不代表權利審查通過。**

在 Platform-as-Seller 模式下，平台自身的重製與交付行為**不受 ISP 免責事由保護**，
權利審查是平台自己的防線 —— **不能是狀態機的副作用**。

> 真實資料佐證（security test DB，2026-08-26）：
> 355 份教材中 349 份 `ip_declaration_accepted = true`、173 份有一般審核的 `reviewed_by`，
> 而權利審查記錄為 **0**。

### 為什麼不掛在 `POST /admin/materials/:id/approve` 上

1. **語意混淆** —— 見上。
2. **假的盡職證據** —— 目前沒有讓審查者輸入 risk flags 與證據的介面，
   自動寫入只會產生空 flags、無證據的空殼記錄，
   **看起來像盡職紀錄，實際上什麼都沒審**。那比沒有記錄更糟。

因此權利審查是**明示的行為**：`POST /admin/materials/:id/rights-review`。

### 規則

- `review_result`：`pending` / `approved` / `rejected` / `needs_evidence`（四值，不建 future 狀態機）
- `risk_flags`：可多選，限 11 個允許值（涵蓋 `D6` 高風險檢查點與 `D7` 的 `child_identity`）
- **`needs_evidence` 必須附 `notes`** —— 沒有說明的補件要求，對 Creator 是無法行動的結論
- **append-only**：改變結論就寫一筆新記錄（trigger `trg_mrr_reject_rewrite`）。
  **連 `notes` 都不得修改** —— 「當時審查者寫了什麼」本身就是盡職證據
- **只擋 UPDATE、不擋 DELETE**（保存期限屬 RETENTION-MATRIX，尚未拍板）
- **`declaration_version` 可為 NULL** —— 目前沒有經核可的聲明文字與版本，硬填會製造假證據
- **既有教材不 backfill** —— 沒有審查記錄是事實

**尚未具備：** Admin 審查 UI、證據檔案的儲存流程、Creator 聲明的版本化接線
（待正式條文；`consent_records` 亦尚未接線）、與上架流程的關聯規則。

## 12.2a 帳號凍結（`users.account_status`）

**2026-08-26 新增**（`P1-09` Gate 1）。

法源：網路交易定型化契約**應記載事項第十二點** ——
「企業經營者應於知悉消費者之帳號密碼被冒用時，**立即暫停該帳號所生交易之處理及後續利用**。」
這是**產品能力**要求，不是條款文字。

**兩個狀態：** `active` / `frozen`。刻意不設計成複雜狀態機 ——
Phase 1 只需回答「這個帳號現在能不能產生新的敏感交易」。

### 為什麼狀態必須即時查 DB，不得放進 JWT

`middlewares/auth.js` 的 `requireAuth` **完全不碰資料庫**，`req.user` 全部來自 JWT payload。
而 **JWT 有效期是 7 天** —— 把狀態塞進 token 會讓凍結延遲至多 7 天生效，
**直接違反「立即」的要求**。

強制點：`middlewares/accountStatus.js` 的 `requireActiveAccount`，
**只掛在敏感寫入路徑**（讀取不付出額外查詢成本；被保護的範圍明確可稽核），
且 **fail-closed**（查不到使用者或查詢失敗一律拒絕）。

### 判準：凍結禁止的是什麼

> **會產生金錢後果、授權後果，或對外不可逆之公開內容的寫入。**

| 操作 | 凍結後 | 理由 |
| --- | --- | --- |
| `POST /orders` | **擋** | 金錢後果 |
| `POST /orders/:id/{upload-proof,payment-proof}` | **擋** | 金錢後果 |
| `POST /materials`、`PUT/PATCH /materials/:id` | **擋** | 授權後果（會成為可販售商品） |
| `POST /materials/:id/file`、`/resubmit` | **擋** | 同上 |
| `POST /teacher/uploads/{material-file,material-media}` | **擋** | 同上 |
| `POST /reviews` | **擋** | 對外**公開**且不可逆的內容 |
| 購物車、收藏 | 不擋 | 不是「交易」，無金錢或授權後果；擋了只是把失敗點提前 |
| `POST /reports` 檢舉 | 不擋 | 送往 Admin 的**非公開**通報管道；擋掉可能妨礙正當的安全通報 |
| 登入與所有讀取 | 不擋 | 使用者必須看得到自己被凍結、看得到既有訂單與申訴資訊 |
| **消費申訴**（`/me/complaints`） | **不擋** | 被凍結的人正是最可能需要提出異議的人。`routes/complaints.js` **刻意不套** `requireActiveAccount` |
| Admin 路徑 | 不掛此閘門 | admin 只能由維運 CLI 建立；把 admin 鎖在門外會讓解凍本身變得不可能 |

### 其他規則

- **與 `orders.status` 正交** —— 帳號凍結**不得**以改動訂單狀態為之。
- **解凍保留稽核軌跡** —— `frozen_at` / `frozen_by` / `freeze_reason` 於解凍後**不清空**：
  「這個帳號曾經被凍結過、原因是什麼」是稽核事實。
- 凍結需**必填理由**；**不得凍結 admin**、**不得凍結自己**。
- 凍結與解凍皆寫 `activity_logs`（`account.frozen` / `account.unfrozen`）。
- **凍結回應文案必須指向真的存在的入口**（`BUY-02`，2026-08-27）。
  `FROZEN_RESPONSE.message` 舊值為「請聯繫客服」，但平台**沒有客服系統** ——
  被凍結的人因此拿到死路訊息。現值指向**申訴與消費爭議**，而這是誠實的：
  凍結帳號仍可登入、仍可讀取、**仍可提出申訴**（見上表）。
  日後若把申訴列入封鎖範圍，**必須同步改掉這段文案**，否則它會變成謊言。

**尚未具備：** 使用者名冊與搜尋、使用者端的凍結狀態顯示、
**對外的解凍申訴流程與時限**（Terms §2.5，Owner ＋ Lawyer 未決）、
重新驗證流程、payout 暫停（payout 能力本身尚不存在）。

### Operating model（`DEC-LEGAL-10`，2026-08-27 Owner Decision Round 2）—— **已實作（`OPS-02`）**

MVP 採 **single-admin authority ＋ standardized reason ＋ audit trail ＋ Admin UI**。
**不導入 two-admin approval** —— admin 帳號只能由維運 CLI 建立，現階段可能只有一位；
要求第二位覆核會製造「凍結得了、解凍不了」的鎖死風險。

**單一 Admin 模型（維持）：** 單一 Admin 可 freeze／unfreeze；actor／timestamp 稽核；
解凍**保留** `frozen_at`／`frozen_by`／`freeze_reason`；不得凍結自己；不得凍結 admin。

**Standardized reason taxonomy（`OPS-02`，2026-08-27）**

canonical source 是 `Backend/utils/accountFreezePolicy.js`：

| code | 說明 |
| --- | --- |
| `suspected_fraud` | 疑似詐欺行為，待查證 |
| `payment_abuse` | 付款或退款流程遭濫用 |
| `account_security` | 帳號安全疑慮（疑似遭冒用或外洩） |
| `content_policy` | 上架內容違反平台政策 |
| `repeated_misuse` | 重複違反平台使用規範 |
| `manual_review` | 人工審查中，暫停交易行為 |
| `other` | 其他（**必須**填寫說明） |

* **全部是營運分類，不是法律認定。** 措辭刻意避開「違法」「犯罪」「詐欺成立」——
  平台凍結是營運處置，不是法律判決；文案、稽核與 UI 都不得寫成後者。
* `reasonCode` **必填且必須來自 allowlist**；`other` **必須**附 note；
  非 `other` 的 note 為選填（上限 500 字）。
* **驗證在 backend**（`validateFreezeRequest`）—— 前端的下拉選單不是驗證。
* **向後相容且不動 schema：** `users.freeze_reason` 維持人類可讀文字，
  結構化的 `reasonCode` / `note` 寫進 `activity_logs.meta`。
  **歷史自由文字資料不回填、不假裝有 taxonomy** —— 沒有 code 就回 `null`。

**Admin UI（`OPS-02`）**

操作面板掛在既有的 per-user 頁 `/admin/users/:userId/activity-logs`
（`components/admin/AccountFreezePanel.tsx`），資料來自
`GET /admin/users/:id/account-status`（**只吐凍結面板需要的欄位**，不做名冊／搜尋）。
破壞性操作需先展開確認區；不合法目標前端不給操作，**但 backend 仍各自再擋一次**。

`IA-07` 的判斷不變：**這一頁仍不在側欄** —— 平台仍沒有使用者名冊，
`/admin/users` 維持誠實的轉介頁。

> **UI 文案只描述系統真的做得到的事：** 凍結**不是**永久停權、**不是**法律違規認定、
> **不是**已確認詐欺。它擋的是受 `requireActiveAccount` 保護的寫入；
> 被凍結者**仍可登入、查看，並提出申訴**。
>
> **本節未定義任何對外申訴期限或法定回覆日數** —— 那是 Terms §2.5 的
> Owner ＋ Lawyer 未決事項，維持 blocked。

> **本決定純屬平台內部 operating model。** 它**未**定義任何對外申訴期限、
> 法定回覆日數，或法律上的正當程序最低標準 —— 那些仍為 Terms §2.5 的
> **Owner ＋ Lawyer** 未決事項，維持 blocked。

## 12.3b 同意證據（`consent_records`）—— **schema 已備，尚未接線**

**2026-08-26 新增**（`P1-09` Gate 5 foundation）。

`consent_records` 記錄「**誰、在什麼情境、對哪一份文件的哪一個版本、在什麼時候**表示同意」。
六種 `context_type` 對應 v1.8 baseline 的 Consent UI 結構：
`registration`／`creator_agreement`／`material_declaration`／
`checkout_purchase_rules`／`checkout_rescission_notice`／`reconsent`。

**三條硬規則：**

1. **`document_version` 為必填且不得空白。**
   沒有版本的「同意」不構成可用的證據 —— service 與 DB CHECK 雙重擋下，
   **不提供預設值、不編造版本**。
2. **append-only。** `accepted_at`／`document_version`／`context_type` 等既有事實
   **不得被改寫**（DB trigger `trg_consent_records_reject_rewrite` 強制）。
   更正的方式是 `supersede()` —— **寫一筆新記錄並讓舊列指向它**，不是改舊列。
   唯一可事後設定的欄位是 `superseded_by_id`（新增資訊、不竄改事實）。
3. **只擋 UPDATE，不擋 DELETE。**
   「不得改寫歷史」是 `H-VERSION` 的要求；「永不刪除」不是 ——
   同意證據有其保存期限（RETENTION-MATRIX `RM-13`；個資法 §11 III）。
   若連 DELETE 都擋，等於替尚未拍板的保存期限做了「永久保存」的決定。

**現況：本表尚未接線任何流程。**

| 既有 consent | 狀態 |
| --- | --- |
| 註冊頁「我同意服務條款與隱私權政策」 | **只在前端** —— `register/page.tsx` 驗證後未放進 request body；`routes/auth.js` 不收該欄位。**沒有任何註冊同意被保存** |
| `materials.ip_declaration_accepted` / `ip_declaration_at` | **無文件版本**。建立教材時 request 的 `ipDeclarationAccepted` 必須明確為 `true`，backend 驗證通過後才允許建立（`routes/materials.js`），創作者端亦有預設未同意的明示切換 —— 因此它證明的是「創作者做出了明示聲明」。**但沒有文件版本與內容雜湊**，無法證明「同意的是哪一版條文」，版本化的 consent integration 待 Gate 2 / Gate 5 |

**為什麼先不接線：** repo 中**沒有任何經核可的法律文件**。
現在接線只會保存**指向不存在版本的同意記錄** —— 那比沒有記錄更糟：
系統會宣稱「使用者同意了 v1.0」，而 v1.0 從未存在過。
接線必須等 `P1-09` 的正式條文到位。

**legacy 資料一律不 backfill。** 既有教材的聲明沒有版本，那是事實；
為了填滿欄位而寫入 `document_version = 'v1'` 會製造假證據。
既有欄位**原地保留**，不搬移、不刪除。

## 12.3c 法律文件登記（`legal_documents`）—— **registry 已備，內容尚未存在**

**2026-08-27 新增**（`P1-09` Legal Foundation / Gate 12 foundation）。

§12.3b 的 `consent_records` 記錄「使用者同意了 vN」；本表定義 **vN 是什麼**。
在此之前 repo 中沒有任何地方能回答「現行條款是哪一版、內容為何」，
那是 Gate 5／Gate 11 第 4 條／Gate 13 共同的上游缺口。

**四種 canonical 文件類型**（`DEC-04`，2026-08-27 Owner 拍板）：
`terms`／`privacy`／`creator_agreement`／`refund_policy`。
**退款政策是獨立文件**，不是 Terms 的章節 —— 它必須有自己的 document identity
與 version；Terms 可以引用它。新增類型需要一次 migration。

**發布生命週期：** `draft → approved → published → superseded`。

| 狀態 | public 可讀？ | 說明 |
| --- | --- | --- |
| `draft` | **否** | 內部稿件 |
| `approved` | **否** | 已核可但尚未生效，仍不對外 |
| `published` | **是** | 同一型別**同時只有一筆** |
| `superseded` | 否（Admin 可讀） | 歷史 consent 證據指向它，稽核必須查得到正文 |

**五條硬規則：**

1. **published-only。** public 端點只吐 `published`；沒有 published 版本時
   `/terms` 等 route 一律 **404**，**不得**顯示 placeholder、空殼頁或 draft 內容。
2. **Fail-closed publication。** `published`／`superseded` 必須具備
   body（非空白）／`content_hash`／`effective_date`／`published_at`，
   由 `legal_documents_publishable_check` 在 DB 層強制 ——
   `NULL content → published` 不可能發生。
3. **同型別最多一筆 current。** `legal_documents_one_published_per_type`
   是 partial UNIQUE index。發布 v2 時 v1 於**同一個 transaction** 轉 `superseded`，
   因此不存在「兩份現行 Terms」，也不存在對外可見的空窗。
4. **已發布內容不可改寫。** `trg_legal_documents_immutable` 擋住
   正文／版本／雜湊／生效日／發布時間的任何 UPDATE；`superseded` 是終態。
   要更正只能發新版本 —— 與 `consent_records` 的 append-only 哲學一致。
5. **`content_hash` 由 server 計算**（SHA-256，對實際儲存的 UTF-8 正文，不做正規化），
   **client 不得指定**。接受 client hash 等於讓「同意的內容」可被偽造。

**版本命名規則（`DEC-LEGAL-05`，2026-08-27 Owner 拍板）：**

`version` 採 **integer sequence**（`1`, `2`, `3`…），**每個 `document_type` 各自獨立編號**
（`terms` 的第 3 版與 `privacy` 的第 3 版沒有關係 —— `UNIQUE (document_type, version)`
本來就是以型別為單位）。第一版自 `1` 起算。

**`version` 僅為文件版本識別，不代表變更幅度，也不代表法律上的重大／非重大變更。**
「是否要求重新同意」是**另一個 domain concept**，由 `requires_reconsent` 承載（見下），
**不得**從版本號推論。對外 UI 呈現為「服務條款 第 3 版 · 生效日 YYYY-MM-DD」。

不採 semantic versioning（`2.0` 會被讀成「要重新同意」）、不採 date-based version
（會與 `effective_date` 產生兩個互相矛盾的日期，且同日第二版即撞 UNIQUE）。

> **schema 不需變更** —— `version` 已是 opaque `TEXT NOT NULL`，且 **current version
> 之判定完全不使用它**（partial UNIQUE index ＋ `getCurrentPublished()` 只看
> `publication_status = 'published'`；版本歷史 `ORDER BY created_at DESC, id DESC`）。
> 本規則須在**第一次 publish 之前**生效：`consent_records.document_version` 一旦寫入即為
> 凍結的歷史證據，事後改規則會讓證據集混用兩種格式。

**Re-consent enforcement metadata（`DEC-LEGAL-06`／`SCHEMA-03`，2026-08-27）——
`IMPLEMENTED`：**

`legal_documents.requires_reconsent BOOLEAN NOT NULL` 記錄
「發布此版本時，production 是否要求既有使用者重新同意」。**六條硬規則：**

1. 此欄位為 **production enforcement metadata**，**不是法律上「重大變更」之認定**。
   因此**刻意是 BOOLEAN 而非 enum** —— 不得引入 `material` / `non_material` /
   `major` / `minor` 等法律分類值。
2. **`NOT NULL` 且無 DB `DEFAULT`。** `DEFAULT false` 會讓發布靜默通過，
   事後分不出「決定不要求」與「沒人想過」。
3. **service 層同樣沒有 fallback。** `validateRequiresReconsent()` 只接受**真正的
   boolean**：缺少／`null` → `requires_reconsent_required`；`"true"`／`"false"`／
   數字／物件／陣列 → `requires_reconsent_invalid`。兩者皆 **400**。
4. **publish 必須再次顯式提供，即使草稿已有值。** 草稿階段的值只是為了滿足
   `NOT NULL` 的暫定值；**發布時提供的值覆寫它**，那一次才是被稽核與鎖定的決定。
   （`createDraft` 也要求顯式 boolean —— 本表 lifecycle 是「建立 draft 即 INSERT
   整列」，若不在此處要求，唯一的替代就是 DB `DEFAULT`，而那被第 2 條禁止。）
5. **發布後不可改寫。** `trg_legal_documents_immutable` 是**顯式欄位白名單**，
   `requires_reconsent` 已納入（新增欄位**不會**被自動保護）。
6. **稽核。** `legal_document.published` 的 `activity_logs.meta` 帶
   `requiresReconsent`，連同 actor／時間／`documentType`／`version`／`effectiveDate`，
   足以回答「誰、何時、把哪份文件哪一版，發布為要求／不要求重新同意」。
   **meta 不含任何法律理由欄位** —— 判準尚未取得，由系統編一個等於偽造決策依據。

**版本號與本欄位互不推導**（`DEC-LEGAL-05`）：`2` 不代表要重新同意，`3` 也不代表不用。

> **實作證據（2026-08-27）：**
> `Backend/migrations/20260827b_legal_document_requires_reconsent.sql`
> （兩個資料庫實測 **0 列 → 無 backfill**；migration 內建 row-count assertion，
> 非 0 列時直接中止；重跑為 no-op）／`db/db_schema.sql` ／
> `bootstrapModel.js`（CREATE TABLE ＋ trigger 白名單 ＋
> `verifyCriticalSchema()` fail-closed 檢查欄位存在、NOT NULL、無 DEFAULT）／
> `services/legalDocument.service.js` ／ `routes/adminLegalDocuments.js` ／
> `tests/legalDocumentReconsent.db.test.js`（32 case）。
> DB 432/432、unit 213/213、smoke exit 0。
>
**發布理由：standardized internal justification（`DEC-LEGAL-11` / `OPS-03`，
2026-08-28）—— `IMPLEMENTED`：**

發布法律文件時，除了 `requires_reconsent`，**必須**再提供一個標準化的
**營運理由**（canonical source：`Backend/utils/legalDocumentPublishPolicy.js`）。

| code | 說明 |
| --- | --- |
| `editorial_update` | 文字修訂（錯字、標點、排版、非實質整理） |
| `policy_scope_change` | 政策適用範圍調整 |
| `user_rights_change` | 使用者權利或義務範圍調整 |
| `platform_process_change` | 平台流程或作業方式調整 |
| `compliance_review` | 依外部審閱意見修訂 |
| `administrative_correction` | 行政更正（如生效日、文件識別） |
| `other` | 其他（**必須**填寫說明） |

**六條硬規則：**

1. **維持 single-admin authority** —— 不採雙人覆核（理由同 §12.2a：
   admin 僅由維運 CLI 建立，可能只有一位）。
2. `reasonCode` **必填且須來自 allowlist**；`other` **必須**附 note；
   非 `other` 的 note 選填（上限 500 字）。**驗證在 backend**。
3. **reason 與 boolean 是兩個彼此獨立的顯式選擇。**
   系統**不得**由 `reasonCode` 推導 `requires_reconsent`，反之亦然 ——
   同一個 `policy_scope_change` 可以要求重新同意，也可以不要求。
   `validatePublishJustification()` 因此**完全不接收也不回傳** boolean，
   讓推導在結構上就不可能發生。
4. **這是營運分類，不是法律判定。** taxonomy 刻意不含
   `material_change` / `non_material` / `legally_required`，
   標籤亦不得出現「重大變更」「依法必須」等字眼。
5. **零 schema churn** —— `legal_documents.requires_reconsent` 仍是唯一的
   authoritative boolean；理由與說明寫入 `activity_logs.meta`
   （`justificationCode` / `justificationNote`），
   那裡本來就是「當下做了什麼決定」的 append-only 事實來源。
6. 發布後 `requires_reconsent` 由 `trg_legal_documents_immutable` 鎖死；
   理由屬事件事實，**更正只能發新版本／新的 publish event**，不得改寫歷史。

> **實作證據（2026-08-28）：** `utils/legalDocumentPublishPolicy.js` ／
> `services/legalDocument.service.js`（`publish()` 兩段驗證互不傳參）／
> `routes/adminLegalDocuments.js`（原樣傳遞，不做推導；稽核 meta 加兩欄）／
> `tests/legalDocumentPublishJustification.db.test.js`（13 case）。
> DB 455/455、unit 213/213、smoke exit 0、`verify:web` exit 0。
>
> **尚無 Admin UI** —— 法律文件的建立／核可／發布目前仍是 **API-only**
> （`/admin` 底下沒有 legal-document 頁面）。追蹤於 tracker `OPS-05`。
>
> **「什麼變更依法必須設為 true」仍為未決**
> （`DEC-LEGAL-01` 法律側，`LAWYER REVIEW REQUIRED`）。
> 本節只定形狀與操作紀律，**不定法律判準**。
>
> **本輪未啟用 production consent wiring。** `consent_records` 仍 0 列，
> 註冊／結帳／創作者聲明維持現況，`legal_documents` 仍 0 列、四條 public route 仍 404。
> Gate 5 維持 `PARTIAL`／**NOT ACTIVATED**。

**端點：**

| Method | Path | 授權 |
| --- | --- | --- |
| `GET` | `/legal/documents` | **public**（已發布類型清單，不含正文；供 Footer 判斷是否顯示連結） |
| `GET` | `/legal/documents/:type` | **public**（current published；無則 404） |
| `GET` | `/admin/legal-documents?type=` | Admin |
| `GET` | `/admin/legal-documents/:id` | Admin |
| `POST` | `/admin/legal-documents` | Admin（建立 draft；**`requiresReconsent` 必填 boolean**） |
| `PATCH` | `/admin/legal-documents/:id` | Admin（**只有 draft 可改**；`requiresReconsent` 選填，給了就必須是 boolean） |
| `POST` | `/admin/legal-documents/:id/approve` | Admin |
| `POST` | `/admin/legal-documents/:id/publish` | Admin（**`requiresReconsent` 必填 boolean，即使草稿已有值**） |

Admin 讀取投影（`toAdminView`）帶 `requiresReconsent`；**public 投影刻意不帶** ——
那是 enforcement metadata，不是條款正文。

public 端點**刻意沒有 `requireAuth`**：條款必須讓尚未註冊者在同意前完整閱讀
（消保法 §11-1 審閱期的前提）；已登入使用者的讀取權不應比匿名訪客多。

**正文格式為 plain text。** repo 沒有 HTML sanitizer 或 markdown renderer 相依，
為法律頁面引入 raw HTML 會直接開一個 XSS 面（內容由 Admin 寫入，
一個被入侵的 admin 帳號即可在全站最常被閱讀的公開頁面注入腳本）。
renderer 以 `whitespace-pre-wrap` 保留段落，React 預設轉義確保標記只是字元。

**`effective_date` 在 API 邊界一律為 `YYYY-MM-DD` 字串。**
node-postgres 把 `DATE` 解析成本地午夜的 `Date`，直接序列化會走 UTC，
在台北（UTC+8）`2026-10-01` 會變成 `2026-09-30T16:00:00.000Z` ——
前端取前 10 字元就少一天。生效日決定條款何時開始拘束使用者，差一天不是顯示瑕疵。

> **現況（2026-08-27）：`legal_documents` 為 0 列，且 production consent 仍未接線。**
> repo 沒有任何經核可的法律條文；**registry 是空的是預期且正確的狀態** ——
> 由 AI 產生條文等同偽造法律文件。註冊／結帳／創作者聲明**全部維持現況**，
> 本輪未寫入任何 `consent_records`。
> **Legal foundation implemented；no formal legal content published；
> production consent remains unwired。**

## 12.4 付款憑證的儲存與交付（private storage）

付款憑證是敏感交易檔案，**永遠不是 public asset**。

| 項目 | 規則 |
| --- | --- |
| 儲存位置 | `private-storage/payment-proofs/`，**不在** `uploads/`（後者是公開 static） |
| DB 指標 | `manual_payment_proofs.storage_key`（opaque）＋ `checksum_sha256` ＋ `uploaded_by` |
| 公開路徑 | `/uploads/payment-proofs/*` 由 `Backend/index.js` 掛在 static **之前**的 handler 直接擋掉（404）——**深度防禦**，即使日後有人把檔案放回去也取不到 |
| 型別驗證 | 副檔名 ＋ 宣告 MIME ＋ **magic bytes** 三層（`Backend/utils/paymentProofPolicy.js`）。只允許 JPG / PNG / WebP |
| 授權 | **只有兩種人**：Admin，或該訂單的擁有者（`orders.user_id`）。沒有 signed URL、沒有 view token |
| 交付 | `GET /orders/:orderId/payment-proofs/:proofId/file`（`?download=1` 改 attachment 並寫稽核） |
| 清單 | `GET /orders/:orderId/payment-proofs` —— 只回 metadata，不含位元組 |

**交付不看訂單狀態、也不看審核結果**：憑證是使用者自己交易紀錄的一部分，
訂單被核准或憑證被退回都不該讓他看不到自己上傳過什麼。

### `storage_status`

| 值 | 意思 |
| --- | --- |
| `private` | 已在私有儲存，`storage_key` 必定存在（**唯一可交付的狀態**） |
| `legacy_external` | `proof_url` 指向外部網址（seed / fixture），平台沒有這個檔案 |
| `legacy_missing` | DB 有指標但磁碟找不到檔案 —— 明確標記，**不靜默丟棄** |
| `legacy_public` | 搬移前的暫時狀態；搬移完成後應為 0 |

DB 約束保證 `storage_status = 'private'` 時 `storage_key` 不可為 NULL
（`mpp_private_requires_storage_key`），避免出現「宣稱已搬移、實際讀不到」的列。

canonical source 是 `Backend/services/paymentProof.service.js` 與
`Backend/utils/paymentProofPolicy.js`；一次性資料搬移見
`Backend/scripts/migrate-payment-proofs-to-private.js`（`npm run migrate:payment-proofs`）。

> **保存期限（retention）政策尚未定案** —— 需要產品／法務／營運確認，見
> `docs/pending-work-tracker.md` `FUT-P2`。

錯誤：

- `400`: `status` 非法（僅允許 pending|approved|rejected）；或 reject 缺少／非法 `rejection_reason`
- `401`: 未登入
- `403`: 非 admin
- `404`: 憑證不存在（`/admin/payment-proofs/:id`）
- `500`: server error

---

## 12.5 收款帳戶資訊（單一來源）

人工轉帳的收款帳戶是**買家真的會照著匯錢的目標**，因此不得散落在多處。

| 項目 | 規則 |
| --- | --- |
| 唯一來源 | `Backend/config/paymentBankInfo.js`，讀四個環境變數：`PAYMENT_BANK_NAME` / `PAYMENT_BANK_CODE` / `PAYMENT_BANK_ACCOUNT` / `PAYMENT_BANK_ACCOUNT_NAME` |
| 前端取得 | `GET /payment/bank-info`（`requireAuth`）。**前端不得保留任何 fallback 常數** —— 有 fallback 就等於第二份 source of truth，且會在設定缺失時安靜顯示錯誤帳號 |
| 通知信 | `Backend/services/emailService.js` 讀同一個 module 的 `formatBankInfoLine()` |
| 未設定時 | 回 `200 { configured: false }`（不是 404／500 —— 「尚未設定」是前端要能渲染的正常狀態）。前端顯示「付款資訊尚未設定」並**擋住結帳 Step 2 的下一步**；通知信改印「匯款資訊尚未設定」而**不印任何帳號** |
| 佔位值 | 已知佔位帳號（如 `1234-5678-9012-3456`）**視同未設定**，與 `JWT_SECRET` 拒絕佔位值同一條規則 |

> **為什麼是 env 而不是 DB／Admin 設定：** 換收款帳戶牽涉對帳與金流稽核，
> 不該是後台一個表單就能改的東西（與 §15.5 S-1 的判準一致）。

## 12.6 評分彙總的單一來源

`average_rating` / `review_count` 的定義**只有一個**：
`ROUND(AVG(rating)::numeric, 1)` ＋ `COUNT(*)`，來源是 `review` 表。

| 端點 | 欄位 |
| --- | --- |
| `GET /materials`（清單） | `average_rating`、`review_count`（`RATING_AGGREGATE_LATERAL_SQL`） |
| `GET /materials/:id/rating` | `average`、`count`（`repositories/review.repository.js` 的 `ratingStats()`） |

兩者**必須回相同數值**。先前清單完全不帶這兩個欄位，前端 mapper 只好把每張卡片
寫死成 `rating: 0, reviewCount: 0`，於是：

- 同一份教材在 `/materials`／`/explore` 顯示 `0.0 (0)`，在詳情頁與 `/favorites` 顯示真實值；
- 「評分」排序因所有值皆為 0 而**完全無作用**；
- 「4 星以上」篩選（`rating >= 4 && reviewCount >= 3`）對**每一份教材**都回傳空結果。

**前端不得在任何 component 內自行重算評分**，一律使用 API 回傳值
（`frontend/apps/web/lib/material-mapper.ts`）。

> **`learners` 欄位沒有真實來源**（mapper 寫死 0），因此不得作為排序鍵。
> `popular` / `recommended` 改以 `reviewCount` → `rating` 排序。

## 12.7 訂單編號

**買家、Admin、通知信、付款憑證頁一律顯示 `orders.id`（`ord_*`）。**

它由 server 產生（`orderService.newOrderId()`）、唯一且持久化，因此**不需要**
另一個 `order_number` 欄位或 migration —— canonical identifier 早就存在。

**前端不得自行生成或衍生訂單編號。** 先前 `/me/orders` 用
「建立日期 ＋ `id` 的 hash % 1000」現算出 `#O260825676` 這種編號，造成三個問題：

1. **Admin 查不到** —— `GET /admin/orders?q=` 吃的是 `ord_*`，買家報的編號查無結果；
2. **不唯一** —— 每天只有 1000 個可能值，約 37 筆訂單就有過半機率碰撞；
3. **同一個買家介面自相矛盾** —— 清單顯示 `#O…`，訂單詳情與付款憑證頁顯示 `ord_*`。

## 12.8 退款／補救案件（`refund_remedy_cases`）—— **與訂單狀態機、entitlement、稅務憑證分離**

Phase 1 **沒有**一般任意反悔退款政策（§18.9），但平台必須能處理
法定解除（消保法 §19）、重複付款、履約瑕疵、教材下架、平台未履約等
依法或依契約應退款／補救之情形。承接處為 `refund_remedy_cases`
（canonical source：`Backend/services/refundRemedy.service.js`）。

### 12.8.1 為什麼不重用 `reports`

`reports` 在語意上是**內容檢舉**，不是消費爭議：

| `reports` | `refund_remedy_cases` |
| --- | --- |
| `material_id NOT NULL` —— 一定指向某個教材 | 對象是**訂單**（重複付款根本不指向教材） |
| `UNIQUE (material_id, reporter_id)` 一人一材一次 | 同一張訂單可有**多個**案件（不同事由、不同時間） |
| owner 是檢舉人（可能不是買家） | owner 是**該訂單的買家**（自訂單帶入，不信任呼叫端） |
| resolution 全是 moderation 結果（`dismissed` / `warning` / `request_changes` / `unpublish_material`） | 結論是金額、退款方式、實際退款時間 |
| 無金額、無訂單關聯 | 有 `requested_amount` / `approved_amount` / `refund_paid_at` |

把退款塞進 `reports` 會同時破壞它的唯一性約束與 moderation 語意。
兩者**完全分離**，`/admin/reports` 的檢舉處置流程不受本節影響。

### 12.8.2 狀態機（canonical：`refundRemedy.service.js` 的 `TRANSITIONS`）

```text
requested ──► under_review ──┬─► approved ──► remedy_pending ──► completed
                             └─► rejected
（requested / under_review / approved / remedy_pending 皆可 ──► cancelled）
rejected / completed / cancelled 為終態，沒有出口。
```

**`approved` ≠ 退款完成。** `approved` 只表示「平台已認定應予退款／補救」；
錢是否真的退回、補救是否真的執行，由 `remedy_pending → completed` 表達
（金錢退款的完成**只能**走 §12.8.6 的 `executeRefund()`）。
狀態機**刻意不允許** `approved → completed` 直接跳轉，
DB 另有 `rrc_refund_paid_requires_completed CHECK (refund_paid_at IS NULL OR status = 'completed')`
擋住「尚未完成卻已有實際退款時間」。用同一個狀態表示這兩件事，帳務與客服會同時失準。

每一次轉移都**必須附 `note`** —— 影響買家救濟的決定必須說得出理由。
歷程寫進既有的 `activity_logs`（`target_type = 'refund_remedy_case'`，
`action = 'remedy_case.requested'` / `'remedy_case.status_changed'`），**不另建 event table**。

### 12.8.3 三個不可混淆的邊界

1. **不改 `orders.status`，也不改 `paid_at`。** 建立或核准案件都不動訂單狀態機。
   「訂單成立過並已付款」是歷史事實；「後來發生了退款案件」是另一件事。
   用 `orders.status = 'cancelled'` 表示退款會讓已收款的訂單在營收報表中憑空消失（§18）。
2. **不自動執行 entitlement 轉移。** `entitlement_action` 欄位只記錄
   「這個案件**應該**對授權做什麼」（`no_action` / `suspend` / `restore` /
   `revoke_pending` / `revoke_final`）。實際轉移一律經
   `services/entitlement.service.js` 由人明示操作（§12.9 / Gate 14 suspend-restore）。
   是否撤銷取決於案件類型與尚未完成的法律決定 —— 自動撤銷會在法律結論到位前先做出處分。
3. **不含稅務欄位。** 憑證沖銷（統一發票使用辦法 §20-1 的電子折讓流程）
   是 `P14` 的另一條流程，其決策樹尚待會計師確認（External Tax Gate `PENDING`）。
   為形狀未知的流程預留欄位只會猜錯，因此本表刻意不含任何 tax 欄位。
   `related_creator_adjustment_id` 是未來與 `P10` Creator 報酬帳的關聯點，
   `P10` ledger 尚不存在，故**無 FK**。

### 12.8.6 人工銀行退款的執行紀錄（Wave 2 #5）

**三個事件永遠不得互相推導：**

```text
CASE APPROVED        ≠   REFUND EXECUTED     ≠   TAX DOCUMENT REVERSED
decision_at              refund_paid_at          P14（尚不存在）
平台認定應退款            平台實際完成銀行匯回      憑證沖銷
```

**`refund_paid_at` 已填不得被解讀為憑證已沖銷。** schema **刻意沒有任何 tax 欄位**
（`P14` 決策樹待會計師，External Tax Gate `PENDING`）。

#### 系統不匯錢

Phase 1 沒有退款 API。實際匯款由 Admin 在行外（網銀／臨櫃）完成，
`refund_amount` / `refund_method` / `refund_reference` / `refund_paid_at` / `completed_by`
是**事後的稽核憑據**。`refund_method` 目前只有一個合法值 `manual_bank_transfer`。

#### 唯一入口

`POST /admin/remedy-cases/:id/execute-refund`（**Admin only**），
body `{ amount, paymentReference, paidAt?, note? }`。

| 規則 | 行為 |
| --- | --- |
| 案件必須在 `remedy_pending` | 其他狀態 409 `invalid_state`（**`approved` 也不行**） |
| 必須已有核准決定（`decision_at`） | 否則 409 `case_not_approved` |
| `approved_amount IS NULL`＝非金錢補救 | 409 `non_cash_remedy` —— 沒有錢可退 |
| `amount` 必須為正整數且 ≤ `approved_amount` | 否則 400 |
| `paymentReference` 必填 | 沒有交易參考的「已退款」不是憑據，是宣稱 |
| 已執行過 | 拒絕（案件已 `completed`，狀態檢查先擋） |

#### 原子性

狀態與五項證據在**同一個 `UPDATE`** 內寫入 —— 不存在「已完成但還沒有憑據」的中間狀態。
執行失敗即 `ROLLBACK`，案件保持 `remedy_pending`。

`transition({ toStatus: 'completed' })` 對**已核准金錢退款**的案件回
`use_execute_refund`；`transition` 也不再接受任何 refund 欄位。
DB 層另有兩條 CHECK（`rrc_refund_execution_atomic`、
`rrc_cash_completion_requires_evidence`）在服務層被繞過時仍然擋得住。

#### 執行後仍不變的四件事

1. **`orders.status` / `paid_at` / `payment_received_at` 完全不動** ——
   退款完成 ≠ 訂單沒發生過。交易歷史必須保留（否則已收款訂單會在 §18 營收中憑空消失）。
2. **entitlement 不會自動變更** —— 即使案件記錄了 `entitlement_action`，
   回應中的 `pendingEntitlementAction` 也只是**回報意圖**；
   實際轉移仍須走 `POST /admin/order-items/:id/entitlement` 由人明示操作。
3. **Creator 報酬不動** —— 無 clawback、無 negative balance、無 payout adjustment。
   ordinary post-settlement refund 原則仍為 Platform absorb；
   Creator fault adjustment 待 `P10` / `PRE-03`。
4. **稅務憑證不動**（見本節開頭）。

#### 稽核

`activity_logs`（`target_type = 'refund_remedy_case'`，`action = 'refund.executed'`），
meta 含 `caseId` / `orderId` / `buyerId` / `amount` / `approvedAmount` / `method` /
`paymentReference` / `executedBy` / `executedAt` / `note`。
**被拒絕的執行不寫成功 audit。**

#### 買家退款收款帳戶：尚未蒐集，且本輪刻意不蒐集

repo 目前**沒有**任何買家退款目的地資料。
`manual_payment_proofs.reported_bank_name` / `reported_account_last4` 是買家申報的
**付款來源**且只存末四碼（§12.3），**不是**退款目的地，不得挪用。

為了退款而開始蒐集完整銀行帳號會直接擴大個資範圍並產生新的保存義務，
而保存年限尚未定案（`RM-03` / `L-21` 皆 `PENDING`）。
Phase 1 由 Admin 在行外取得並完成匯款，系統只保存足以稽核的
金額／方式／時間／交易參考／執行者。
**若後續確認 Phase 1 必須由系統保存退款帳戶，須先提出最小欄位需求與保存期限再實作。**

### 12.8.4 端點與授權

| 端點 | 授權 |
| --- | --- |
| `POST /orders/:orderId/remedy-cases` | 訂單擁有者 **或** Admin |
| `GET /orders/:orderId/remedy-cases` | 訂單擁有者 **或** Admin |
| `GET /admin/remedy-cases`、`GET /admin/remedy-cases/:id` | Admin |
| `POST /admin/remedy-cases/:id/transition` | Admin |

買家端建立**刻意不套 `requireActiveAccount`**（§12.2a）：
提出救濟請求不產生金流、不取得授權、不產生公開內容，
且被凍結的帳號恰恰可能**正需要**這條申訴管道；控制點是 Admin 審核而非入口封鎖。

### 12.8.5 沒有 backfill

既有訂單沒有退款案件 —— 那是事實。**不得**為既有已取消訂單補建案件，
`refund_remedy_cases` 在 migration 後為 0 列即為正確狀態。

**本輪不執行任何實際匯款。** `refund_method` / `refund_reference` / `refund_paid_at`
是人工銀行退款的**紀錄位置**，Phase 1 不要求自動退款 API。

## 12.9 教材檔案的實體刪除安全（`legal_hold` ＋ fail-closed cleanup）

**本節不決定保存年限。** 4 個月、5 年、稅務年限屬 `RETENTION-MATRIX` 與
External Legal / Tax Gate（皆 `PENDING`）。這裡只建立「**何時一定不能刪**」的下限 ——
那個下限不需要等法律定案就成立。

### 12.9.1 唯一的判斷點

**所有**實體刪除路徑必須呼叫
`Backend/services/materialFileRetention.service.js` 的
`canPhysicallyDeleteMaterialFile(fileId)`，**不得自行拼資格條件**。
目前唯一的 production 刪除路徑是維運 CLI
`npm run cleanup:orphan-files --prefix Backend`（`--dry-run` 走同一個 predicate）。

只有全部條件被**明確確認安全**才可刪。任一成立即不可刪：
legal hold／`unattached` 以外的狀態／仍被 `approved_file_id` 或 `pending_file_id` 引用／
該教材仍有 `active`｜`suspended`｜`revoked_pending` 的已核准訂單品項／
有 `order_items.fulfilled_material_version_id` 指向它／有未使用未過期的下載票／
**任何依賴查詢失敗**。

**Fail-closed：unknown / error / 查不到 → KEEP。**
查詢失敗**不得**被當成「沒有依賴」。

### 12.9.2 三組不得互相推導的 lifecycle

1. **`revoked_final` ≠ 可以刪。** 授權終止只表示「這個買家不再能下載」，
   不表示「平台不再需要保存當初交付的東西」。它**只移除**「可恢復的授權依賴」
   這一個 blocker，履約快照與 legal hold 照舊。
2. **檔案可回收 ≠ 可以刪授權歷史。** 不得因為檔案被回收就刪 `order_items`。
3. **`revoked_pending` 是「還沒定案」**（`entitlement.service.js` 允許它回到 `active`）。
   在未定案時刪檔，等於替尚未做出的決定執行了不可逆的處分。

### 12.9.3 刪除順序

`BEGIN → FOR UPDATE → 重跑 predicate → DELETE 列 → 刪實體 → COMMIT`。
**先刪列**讓所有 FK（含 `fulfilled_material_version_id` 的 `ON DELETE RESTRICT`）
在位元組還完好時就引爆；任一步失敗即 `ROLLBACK`。
在此之前是**先刪實體再刪列** —— DB 的 RESTRICT 只保護得了列，位元組已經沒了。

### 12.9.4 Legal hold

Admin only。`POST /admin/material-files/:id/legal-hold`（`reason` 必填）／
`POST /admin/material-files/:id/release-legal-hold`／
`GET /admin/material-files/:id/retention`（回傳 `deletable` ＋ 完整阻擋理由 ＋ hold 歷程）。

解除 hold **不清空** `hold_reason` / `hold_set_at` / `hold_set_by`（稽核軌跡，
與 §12.2a 帳號解凍的規則一致）。

**只提供 primitive，不做 orchestration** —— 不假設每一筆 `refund_remedy_cases`（§12.8）
或 `report_cases`（§6）都需要 hold。

### 12.9.5 刻意沒有 `retention_until`

保存年限尚無 authoritative source。加這個欄位只有兩種下場：全部填 NULL 而在
fail-closed 下擋掉所有清理（連從未交付的孤兒上傳都清不掉），
或把 NULL 解讀為「無保存義務」。兩者都是用預設值假裝知道答案。

`superseded` / `revoked` 檔案的回收路徑**尚未開放**，正是因為它取決於尚未定案的年限。

### 12.9.6 稽核

沿用 `activity_logs`（`target_type = 'material_file'`），**不另建 audit framework**：
`material_file.legal_hold_set`｜`material_file.legal_hold_released`｜
`material_file.cleanup_skipped_due_to_hold`｜
`material_file.cleanup_skipped_due_to_dependency`｜`material_file.physically_deleted`。

規格細節見 `docs/material-file-storage-and-delivery.md` §8.6。

## 12.10 消費申訴（`consumer_complaints`）—— 消保法 §43 II 十五日

### 12.10.1 三種 case 不得互相取代

| | 對象 | 提出者 | 結論 | 唯一性 |
| --- | --- | --- | --- | --- |
| `reports`（§6） | **教材內容** | 任何人（可能不是買家） | moderation 處置 | 一人一材一次 |
| `consumer_complaints`（本節） | **買家自己的交易** | **該訂單的買家** | 妥適處理 ＋ 回覆 | 同一訂單可多筆 |
| `refund_remedy_cases`（§12.8） | 平台對某筆交易的補救 | 平台建立 | 金額／退款執行 | 同一訂單可多筆 |
| `privacy_requests`（§12.11） | **使用者的個人資料** | 資料當事人（經個資信箱） | 權利請求之處理 | 同一人可多筆 |

**這四套之外還有一類問題：一般客服**（登入／帳號操作、下載問題、網站操作、一般疑問）。
它**刻意不是**第五套 case system，也**不得**被塞進上列任何一套 —— 邊界與 MVP 決定見 **§12.12**。

`reports` 結構上承接不了消費申訴：`material_id NOT NULL`（付款爭議不指向教材）、
`UNIQUE (material_id, reporter_id)`、resolution 全是 moderation 結果、無訂單關聯、無 SLA。

**`consumer_complaints` 同樣承接不了個資權利請求**（`DEC-LEGAL-13`）：
法律基礎不同（個資法 vs 消保法 §43）、義務不同、期限來源不同 ——
申訴有 `statutory_due_at`（十五日，有法源），個資請求的法定回覆期限**尚未取得律師結論**。
把它塞進 `complaint_type` 會讓「這件事受哪一套規則管」永久消失在一個 enum 值裡。
詳見 §12.11。

### 12.10.2 Complaint 是上游，Remedy 是下游

```text
Buyer 申訴 → Admin 受理與回覆 → 若需要退款 → 由人另建 refund_remedy_case → linkage
```

**不自動建立 remedy case。** 是否應退款是個案判斷；自動建立等於讓系統替尚未做出的
決定先行處分。`related_remedy_case_id` 由 `POST /admin/complaints/:id/link-remedy-case`
在人做出判斷後才寫入，且兩者都綁訂單時必須是同一張。

**`resolved` ≠ 已退款。** 錢是否退回的唯一來源是
`refund_remedy_cases.refund_paid_at`（§12.8.6）。

### 12.10.3 狀態機

```text
submitted ──► under_review ──┬─► responded ──┐
                             ├─► resolved ───┼─► closed
（submitted / under_review / responded / resolved 皆可 ──► closed；closed 為終態）
responded ──► under_review          （買家不滿意可續爭議 —— 沒有這條路只會逼出「開第二張申訴」）
```

每次轉移 **`message` 必填**；`resolved` / `closed` 另外 **`resolutionSummary` 必填** ——
沒有結論的「已處理」無法證明「妥適處理之」，DB 另有 `cc_resolved_requires_summary` 擋住。

`visibleToBuyer` 決定歷程寫成 `response_to_buyer`（申訴人看得到）或 `internal_note`
（Admin 內部，Buyer 端 API 過濾掉）—— 與 `report_events` 的分工一致。

### 12.10.4 十五日 SLA

**canonical source：`Backend/utils/complaintSla.js`。**
`15` 這個數字與計算方式**只有一個定義來源**，任何地方不得自行寫死或另算。

**法源四條：**

| 條文 | 內容 | 效果 |
| --- | --- | --- |
| 消保法 §43 II | 「申訴之日起**十五日內**妥適處理之」 | 期間長度 |
| 民法 §120 II | 「以日…定期間者，其**始日不算入**」 | 申訴日不算，次日為 Day 1 |
| 民法 §121 I | 「以**期間末日之終止**為期間終止」 | 末日的哪一刻 |
| 民法 §122 | 末日為「星期日、紀念日或其他休息日」時，**以其休息日之次日代之** | 末日展延（**尚未實作**，見下） |

**計算：**

```text
申訴日（台灣日曆日）  2026-08-26   ← §120 II 始日不算入
Day 1                 2026-08-27
…
Day 15 ＝ 期間末日     2026-09-10   ＝ 申訴日 + 15 個日曆日
期間終止               2026-09-10 23:59:59.999（台北）  ← §121 I
```

> **2026-08-26 修正：** 初版寫成 `submitted_at + 16 天`（把 8/26 算成 9/11），
> 且直接加毫秒而未處理「末日終了」。兩者皆已修正 —— 正確是 **+15 天 ＋ 末日終了**。

- 日曆日一律以 **`Asia/Taipei`** 判斷（與 §15 reporting 的 canonical 時區一致）。
  **不得**用 UTC 日或主機本地日 —— 台北 `2026-08-27 00:30` 的 UTC 日是 `08-26`，會少算一天
- 台灣自 1979 年起無日光節約時間，全年 UTC+8，因此末日終了即該日 `15:59:59.999Z`（測試驗證此假設）
- `statutory_due_at` 建立時寫入後**不再改**（改了就不是「申訴之日起」了）
- 逾期偵測用 DB 條件（`GET /admin/complaints?overdue=1`），**不是**把全表撈出來過濾
- **已結案（`resolved` / `closed`）不再計為逾期** —— 逾期的意義是「還沒處理完而期限已過」；
  歷史上是否曾逾期由 `resolved_at` 與 `statutory_due_at` 比較回答，那是稽核不是待辦告警
- **刻意沒有第二、第三個 SLA 欄位**（`response_due_at` / `resolution_due_at`）——
  baseline 只鎖定一個數字，再造欄位就必須填沒有法源的期限

**§122 末日展延：`REQUIRED / NOT IMPLEMENTED`。**
「星期日、紀念日或其他休息日」需要權威的國定假日來源（人事行政總處行事曆），
repo 目前**沒有**任何 holiday / calendar primitive，本輪也不建立。

因此 `statutory_due_at` 是**最早可能的法定末日**（`SLA_POLICY.restDayExtension = "NOT_IMPLEMENTED"`）。
§122 只會把末日往後推、不會往前，所以：

- 對外的期限承諾**不得**直接引用此值（可能早於真正的法定期限）
- 逾期偵測因此是**保守的** —— 可能比真正的法定逾期更早示警。
  營運上偏安全（提早處理），**但不得**當成法律上已逾期的認定

追蹤見 `docs/pending-work-tracker.md` 的 `LEGAL-01`。

### 12.10.5 買家外部證據（`N3`）

**付款爭議不得只以平台自己的紀錄為唯一認定依據**
（`R7`／網路交易定型化契約不得記載事項第七點）。

`POST /me/complaints/:id/evidence` 接受二選一：
實際附件（`multipart/form-data` 的 `evidence`）或純文字 `externalReference`
（例如「已向 XX 市消費者服務中心申訴，案號 …」）。

- 型別政策**沿用** `utils/paymentProofPolicy.js`（JPG / PNG / WebP ＋ 三層驗證含 magic bytes）
  —— 兩者要承接的東西一樣，**不另寫一份 allowlist**
- **PDF 目前刻意未開放**（與付款憑證一致）；銀行 PDF 交易證明可先以 `externalReference` 描述
- 檔案存 `Backend/private-storage/complaint-evidence/`（新 namespace）
- **`storage_key` / `checksum_sha256` 不得出現在任何 API 回應或 log**
- **刻意不重用 `manual_payment_proofs`** —— 那張表的語意是「這筆訂單的付款憑證，
  審核通過會讓訂單核准」；把申訴附件塞進去會讓一張爭議截圖進入付款核准佇列
- 結案後不得再補件（`complaint_closed`）

### 12.10.5a 證據的**讀取／交付**（2026-08-27，Wave 2 #13）

**在此之前證據是 write-only。** 買家傳得上去、清單列得出檔名，
但 repo 裡**沒有任何路徑能把位元組取回來** —— Buyer 與 Admin 的 UI 都只把附件
渲染成純文字 `📎 檔名`。對付款爭議而言那等於沒有證據：
Admin 裁決時只剩平台自己的紀錄可看，**恰好是 `R7` 要禁止的狀態**。

**兩條路由，一個 resolver：**

| 角色 | 路由 |
| --- | --- |
| Buyer | `GET /me/complaints/:id/evidence/:evidenceId/file` |
| Admin | `GET /admin/complaints/:id/evidence/:evidenceId/file` |

兩者都呼叫 `consumerComplaint.service.js` 的 `resolveEvidenceForAccess()` ——
**授權判斷只有一份**，不會兩邊各寫一套然後漂移（由 db test 斷言兩個 route 檔
都不得自己下 `FROM consumer_complaint_evidence`）。

**Ownership 的來源是 `consumer_complaints.buyer_id`，不是 `orders.user_id`。**
申訴可以完全沒有 `order_id`（例如帳號遭冒用），那種案件的證據仍然必須讀得到。
**不得**把付款憑證的「訂單擁有者」模型套過來。

**IDOR 綁定：** 查詢同時綁 `id` 與 `complaint_id`。
只有 evidence id 猜不到別人的證據，**Admin 身分也不豁免這條綁定**
（帶 A 申訴的路由 + B 申訴的證據 id → `404 evidence_not_found`）。

**四個確定性錯誤碼：**

| 情況 | 回應 |
| --- | --- |
| 申訴不存在 | `404 complaint_not_found` |
| 證據不存在／不屬於該申訴 | `404 evidence_not_found` |
| 不是你的申訴 | `403 forbidden` |
| 證據**本來就沒有檔案**（純文字 `external_reference`） | `409 evidence_file_unavailable` |
| 有 `storage_key` 但**實體不見了** | `503 evidence_object_missing` |

最後兩者刻意分開：409 是「重試也沒用」，503 是「資料是對的、儲存後端壞了」。
**任何情況都不回退到公開路徑**，錯誤訊息不得含檔案系統路徑。
畸形／越界 storage key 走的是同一條 503 路徑（`storage.stat()` 會把 key 形狀例外
吞成 `{exists:false}`），**不 crash、不洩漏 root**。

**交付沿用既有 private-file helper**（`utils/fileDownloadResponse.js`），
不另建第二套 framework：`Cache-Control: private, no-store` ＋
`X-Content-Type-Options: nosniff` ＋ RFC 6266/5987 雙 filename。
inline 為預設；`?download=1` 改 `attachment`。

**稽核只在明示下載時寫。** `complaint_evidence_downloaded` 只在 `?download=1` 寫入 ——
每次 inline 預覽都記一筆會把 activity log 淹掉，讓真正重要的
「有人把原始證據取走了」看不見（與付款憑證同一 convention）。
**稽核 meta 不得含 `storage_key`。**

**前端必須走 authenticated blob fetch**（`lib/complaint-evidence.ts`）——
`<img src>` / `<a href>` 不會帶 `Authorization` header，而本平台的授權來源是
JWT 不是 cookie。**token 不得進 query string、DOM 或任何公開 URL。**
Buyer 與 Admin 共用 `components/complaints/EvidenceAttachment.tsx`，
兩邊看到的證據呈現必須一致，否則會出現「買家說我傳了、Admin 說我沒看到」這種
無法對帳的爭議。純文字證據**不顯示**必定失敗的「查看／下載」。

> **本輪未改 MIME 政策。** 仍只有 JPEG / PNG / WebP。
> `application/pdf` 是**獨立的產品／安全決策**，且「法律上必須接受哪些金融機構
> 證明格式」屬於 Legal / Consent / Privacy 的範圍，**不由本輪工程決定**。

### 12.10.6 端點與授權

| 端點 | 授權 |
| --- | --- |
| `POST /me/complaints`、`GET /me/complaints`、`GET /me/complaints/:id`、`POST /me/complaints/:id/evidence` | `requireAuth` ＋ **本人** |
| `GET /admin/complaints`（`?overdue=1`／`?status=`）、`GET /admin/complaints/:id` | Admin |
| `POST /admin/complaints/:id/transition`、`/link-remedy-case` | Admin |

掛在 `/me/complaints` 是**刻意的**：`me` 已在前端 proxy 的 `ALLOW_ROOT` 內，
不需要新增 root prefix（CLAUDE.md §5）。

### 12.10.6a Buyer / Admin UI（2026-08-27，Wave 2 #10）

| Surface | 路由 | 內容 |
| --- | --- | --- |
| Buyer 入口 | `/me/orders/:orderId` | 「對這筆訂單提出申訴」→ 帶 `?orderId=` 進表單（**正確的交易 context**） |
| Buyer | `/me/complaints` | 自己的申訴清單（loading／empty／error 三態齊備） |
| Buyer | `/me/complaints/new` | 提出申訴；**無 `orderId` 亦可**（帳號遭冒用不指向訂單） |
| Buyer | `/me/complaints/:id` | 詳情、處理歷程（**已由 backend 濾掉 `internal_note`**）、證據、補件 |
| Admin | `/admin/complaints` | 佇列 ＋ 詳情（`AdminReviewWorkspace` pattern），含 `?status=` 與 `?overdue=1` |

**UI 不得建立任何 frontend-only 狀態。** 三條硬規則：

1. **法定期限與逾期由 backend 提供** —— UI 讀 `statutory_due_at` / `overdue` / `daysUntilDue`，
   **不自行推算**（那會讓 §43 II 的期限有兩個來源）。
2. **`?overdue=1` 是 DB 查詢條件**（partial index），不是前端過濾。
3. **買家與 Admin 的歷程差異來自 backend** —— Buyer 端 API 已用 `forBuyer: true` 濾掉
   `internal_note`；前端不做任何過濾，也不該做。

**狀態、類型與轉移表的前端對照放在 `frontend/apps/web/lib/complaint-labels.ts`，
與 backend 逐字一致**，並由 `Backend/tests/complaintUiContract.db.test.js` 斷言不得漂移。
該表只決定 Admin 要顯示哪些按鈕，是 **UX hint 不是授權邊界** ——
非法轉移仍由 backend 回 409 並附 `allowed`。

**終態不呈現必定失敗的控制項：** `closed` 之後 backend 拒絕補件（`complaint_closed`）
與任何轉移，因此 Buyer 端不顯示補件表單、Admin 端不顯示處理表單。

**`resolved` 在 UI 上明確標示「不等於已退款」** —— Admin 詳情頁的補救案件區塊寫明
「實際退款由補救案件流程執行」。關聯只寫 linkage（`link-remedy-case`），**不建立、不退款**。

Admin 導覽入口在「信任與安全」分組，與**內容檢舉**（`/admin/reports`）並列但分開 ——
兩者是不同的東西（§12.10.1）。

**申訴人永遠是登入者本人** —— 不讀 request body 的 `buyerId`；
指定 `orderId` 時驗證是本人的訂單（否則 403 `order_not_owned`）。

### 12.10.6b 逾期告警（2026-08-27，Wave 2 #11）

消保法 §43 II 的十五日期限一旦超過，Admin **必須被主動告知** ——
Wave 2 #10 讓他「能夠」看申訴，本節讓他「不用想到也會被告知」。

**第一個正式 delivery channel 是站內 Admin attention surface。**
本輪**不做** Email／SMS／push／notification center —— 那需要新的基礎建設，
而站內告警已足以讓營運人員真正看得到並處理。

#### 唯一判準

`OVERDUE_SQL`（`Backend/services/consumerComplaint.service.js`）：

```sql
statutory_due_at < NOW() AND status IN ('submitted', 'under_review', 'responded')
```

**三個 consumer 共用它，任何新的 overdue consumer 都必須用它，不得自行拼條件：**

| Consumer | 用途 |
| --- | --- |
| `complaintSla.isOverdue()` | 單筆的 `overdue` 欄位（UI 顯示） |
| `listComplaints({ overdueOnly })` | `/admin/complaints?overdue=1` |
| `countOverdue()` | `/admin/dashboard/summary` 的 `overdueComplaintsCount` |

各寫一份的下場是「dashboard 說 3 件、點進去只有 2 件」——
**一旦發生，Admin 就再也不會相信那個數字，告警等於沒有。**
一致性由 `Backend/tests/complaintOverdueAlert.db.test.js` 逐案斷言。

#### Terminal-state correctness

`resolved` / `closed` **永遠回 `overdue=false`**，即使期限早已過。
已處理完的案件不是待辦告警；對它示警只會讓真正的逾期被淹沒。
歷史上是否曾逾期由 `resolved_at` 與 `statutory_due_at` 比較回答，那是稽核不是告警。

#### 不需要 scheduler

逾期是 **read-time 計算**（SQL 的 `NOW()` 與 JS 的 `new Date()`），
沒有任何欄位需要被排程翻轉。狀態一轉成 terminal，下一次讀取就已經正確 ——
`complaintOverdueAlert.db.test.js` 有一條專門鎖住這件事。

#### Admin UX

| Surface | 行為 |
| --- | --- |
| `/admin`（dashboard） | **只在真的有逾期時**顯示告警區塊（數字 ＋「查看逾期申訴」）。**沒有逾期就不顯示**，不製造假警告 |
| `/admin/complaints?status=overdue` | 送出 `?overdue=1` 給 backend；**不是**撈全部再前端過濾 |
| 佇列列 | 逾期者顯示紅色「已逾法定期限」徽章，期限文字轉為 error 色並附「已逾期 N 天」 |
| 佇列排序 | **backend `ORDER BY statutory_due_at ASC`** —— 期限最近的在最前面，逾期天然浮在頂端。前端**不重新排序** |
| 詳情 | 逾期時顯示橫幅（逾期天數 ＋ 法定期限 ＋ §43 II）。terminal 案件**不顯示** |

**告警區塊與常駐待辦卡刻意不同：** 待辦卡是日常佇列（0 也有意義），
告警是**已違反法定期限**的例外狀態，常駐顯示「0 件逾期」只會鈍化它。

#### 前端不得自行判斷

UI 只渲染 backend 的 `overdue` / `daysUntilDue` / `statutory_due_at`，
**不得** `Date.now() > statutoryDueAt` —— 那會產生第二套 SLA。
`complaint-overdue-alert.spec.ts` 刻意提供「期限已過但 `overdue=false`」的 terminal fixture：
前端若偷偷自己比日期，那條測試就會失敗。

### 12.10.7 凍結帳號仍可申訴

買家端**刻意不套 `requireActiveAccount`**（§12.2a）。

延續該節的判準：閘門保護的是「會產生金錢後果、授權後果，或對外不可逆之公開內容的寫入」，
提出申訴三者皆非。更重要的是 —— **被凍結的帳號恰恰可能正是帳號遭冒用／付款爭議的當事人**。
應記載事項第十二點要求平台在知悉冒用時立即暫停交易處理；
若同一個機制也擋住申訴管道，被害人就失去了唯一的求助入口。

因此申訴可以**不綁訂單**（`complaint_type = 'account_security'`）。

### 12.10.8 與訂單、授權、退款、稅務分離

建立或處理申訴**不改** `orders.status` / `paid_at` / `payment_received_at` /
`entitlement_status`，不觸發退款，不動稅務憑證，也不建立 remedy case。
**申訴本身是爭議紀錄。**

### 12.10.9 稽核

`activity_logs`（`target_type = 'consumer_complaint'`）：
`complaint.submitted`（meta 含 `statutoryDueAt`）｜`complaint.status_changed`｜
`complaint.evidence_added`（**不含** `storage_key` 與 checksum）｜`complaint.remedy_case_linked`。

外部升級管道（消保法 §43 I / §43 III / §44 的消費者服務中心、消保官、調解委員會）
屬 `N4`／`L-17`，是 Legal / Support Page 的文案，**不在本節的後端能力範圍**。

# 13. Teacher sales analytics + parent order detail（新增）

teacher 銷售統計 API（皆需 JWT，且角色為 teacher）。**金額與期間語意見 §18**，本節只列端點與欄位。

- `GET /teacher/sales/summary`
  - query（optional）：`range`、`from`、`to`
  - 回傳：期間 metadata、`granularity`、`totalSoldUnits`、`totalSalesAmount`、`totalOrders`、`materialsCount`、`trend[]`
- `GET /teacher/sales/materials`
  - query（optional）：`range`、`from`、`to`、`search`、`page`、`limit`
  - 回傳：期間 metadata + `{ items, pagination }`，`items` 以教材維度聚合（`materialId`、`title`、`soldUnits`、`salesAmount`、`lastSoldAt`）
- `GET /teacher/sales/records`
  - query（optional）：`range`、`from`、`to`、`materialId`、`page`、`limit`
  - 回傳：期間 metadata + `{ items, pagination }`，`items` 為成交明細（`orderId`、`orderItemId`、`materialId`、`materialTitle`、`quantity`、`unitPrice`、`subtotal`、`buyerId`、`orderStatus`、`createdAt`、`paidAt`），依 `paid_at DESC` 排序

資料範圍規則：

- 僅統計 `order_items.seller_id = 當前 teacher userId` 之資料（來自已驗簽 JWT，**永遠不接受 query 參數**）。
- 一律採成交口徑：`orders.status = 'approved' AND orders.paid_at IS NOT NULL`，認列於 `paid_at`。
- **不再提供 `status` query 參數**：canonical 定義已固定，其餘狀態的訂單沒有 `paid_at`，任何 status 篩選都只會回傳空集合。`completed` 為 dead status，已完全移除。
- Deprecated 欄位（保留僅為相容，前端已不使用）：`totalRevenue`（＝ `totalSalesAmount`）、`items[].revenue`（＝ `salesAmount`）、`trend[].day` / `trend[].revenue`（＝ `key` / `salesAmount`）。

新增 parent / admin 訂單詳情 API：

- `GET /orders/:id`（需 JWT）
- 權限：order owner（parent）或 admin 可查看；其他角色/非本人回 `403`
- 回傳：`{ order, items }`
  - `order`：單筆訂單主檔（同 `/orders/my` 欄位族群）
  - `items`：`order_items` 明細（`id`、`order_id`、`material_id`、`material_title`、`quantity`、`unit_price`、`subtotal`）

---

# 14. Admin dashboard 統計語意（基礎）

`GET /admin/dashboard/summary` 與 Admin Dashboard 畫面的口徑規則。
本節規範 **snapshot / all-time** 這一類不受期間影響的數字；**period metrics 與 reporting period 見 §15**。

## 12.11 個資權利請求（`privacy_requests`）—— **獨立於消費申訴的 domain**

**2026-08-28 新增**（`OPS-04` / `DEC-LEGAL-13`，Owner Decision Round 3）。

### 對外入口：Privacy Email

使用者透過《隱私權政策》所載之**個資信箱**提出權利請求（`DEC-LEGAL-07`）。
平台**未提供**站內或匿名的請求表單，Admin 收到信後於後台建立案件並追蹤。
Email 同時是「登入不了的人」的 fallback —— 站內機制不得取代它。

### 為什麼是獨立 domain，而不是 `complaint_type` 的一個值

Owner 明訂 **consumer complaint ≠ privacy rights request**。兩者：

| | 消費申訴 | 個資權利請求 |
| --- | --- | --- |
| 法律基礎 | 消保法 §43 | 個人資料保護法 |
| 法定期限 | **十五日**（有法源，`statutory_due_at`） | **未決**（律師側 blocked） |
| 提出者 | 該訂單的買家 | 資料當事人 |
| 入口 | 站內（登入） | 個資信箱（站外） |

因此有自己的 table（`privacy_requests` ＋ `privacy_request_events`）、
自己的 route namespace（`/admin/privacy-requests`）、自己的狀態值。
**重用的是模式**（case lifecycle / event history / 稽核 / Admin UI primitives），
不是 table 或 enum。

### 請求類型

直接對應《隱私權政策》草稿 §8.1／§8.2 **已揭露**之權利，不自行增刪：
`access`（查詢閱覽）／`copy`（製給複製本）／`correction`（補充更正）／
`stop_processing`（停止蒐集處理利用）／`deletion`（刪除）／
`withdraw_consent`（撤回同意）／`other`。

### 狀態機

`open → in_review → waiting_for_information → completed → closed`
（`closed` 為終態；各狀態的合法後繼見 `utils/privacyRequestPolicy.js`）。

**狀態只描述處理進度，不描述法律結論。** 刻意沒有 `legally_satisfied` /
`statutory_deadline_met` / `lawful_refusal` / `identity_legally_verified`。

### 三條硬邊界

1. **沒有法定期限。** 本 domain **沒有任何 deadline / SLA 欄位**，
   **不重用** `utils/complaintSla.js`，UI 也不顯示任何天數。
   只記 `received_at` 與 `completed_at`，等律師給出期限後足以往回計算。
2. **沒有身分驗證的法律標準。** 不建立 `identity_verified` 這類欄位或狀態，
   **不要求**身分證、護照或任何政府證件。需要確認資訊時用中性的
   `waiting_for_information` 狀態與內部註記。
3. **`deletion` 請求不執行任何刪除。** 只記錄「使用者提出了刪除請求」；
   `status = 'completed'` 意為「平台已處理完該請求」，**不等於「資料已刪除」**。
   帳號刪除語意仍為 `SCHEMA-02` / `O-22`（`L-21` 未決 ＋ `users` 38 個 FK 衝突）。

### 資料最小化

只存回覆請求真正需要的欄位：`request_type` / `requester_reference`（來信聯絡識別）/
`summary` / `received_at` / `source`。**不存**出生日期、身分證、護照、政府證件或金融資訊 ——
草稿未揭露平台會蒐集那些。**刻意不連結 `users`**：綁定帳號等於主張「已確認本人」，
而身分驗證標準未決。稽核（`activity_logs`）亦**不複製**請求者的聯絡資料。

> **本節未取得任何法律結論。** 法定回覆期限與身分驗證標準
> **維持 `LAWYER VALIDATION REQUIRED`**（Privacy §8.3）。
> 本節只描述平台內部的受理與追蹤能力。

## 12.12 一般客服（general customer support）—— **刻意不是一套 case system**

**2026-08-31 新增**（customer-support scope 盤點）／**2026-09-01 補入實作**（`PRE-14`）。
本節記錄 **`CUSTOMER_SUPPORT_MVP_DECISION`**：主體是「什麼**不做**」的邊界規則，
末段的「唯一入口」則記載為滿足 launch minimum 而實際做了什麼。

### 一般客服指什麼

登入／帳號操作問題、教材下載問題、網站操作問題、一般使用疑問，
以及**無法自行解決、但不屬於正式申訴或個資權利請求**的問題。

### MVP 決定

| | |
| --- | --- |
| **Production Launch REQUIRED** | 使用者**找得到**一個明確的一般客服聯絡方式（Email 或既有最小聯絡機制），且與個資權利請求／消費申訴／檢舉**在文案上清楚區隔**。**工程已完成（見下方「唯一入口」）；production 的 `NEXT_PUBLIC_SUPPORT_EMAIL` 設定完成前不算達成** |
| **初期處理方式** | User → 客服 Email／最小聯絡入口 → **人工處理** |
| **MVP NOT REQUIRED** | Admin 客服中心、ticket database、ticket assignment、SLA engine、ticket status workflow、internal notes、canned responses、customer-service dashboard、automated routing、完整客服訊息系統 |
| **完整 Admin Customer Support / Ticket System** | **POST-MVP**，見 tracker `FUT-P8`（`FUTURE`）；升級 trigger 條件亦記於該項 |

### 唯一入口：public `/support`（「聯絡平台」）

**2026-09-01 `PRE-14` 實作完成**（Owner 核准 Solution A）。

| | |
| --- | --- |
| Route | `/support`，**匿名可讀** —— 不在 `middleware.ts` 的 `LOGIN_REQUIRED_PREFIXES`，也不在 `config.matcher` |
| 名稱 | 「**聯絡平台**」。**不得**改成「客服中心」／「幫助中心」——平台沒有 ticket system，那會是 `BUY-03` 那顆假按鈕的重演 |
| 聯絡方式 | `NEXT_PUBLIC_SUPPORT_EMAIL` → `mailto:`。**沒有表單** —— 表單需要收件端，而收件端就是 ticket system 的第一步 |
| 未設定時 | 顯示「一般客服聯絡方式目前尚未設定。」**不編造、不顯示任何佔位地址**（canonical source：`frontend/apps/web/lib/support-contact.ts`，佔位值一律視同未設定，同 `paymentBankInfo.js`） |
| 進入點 | 未登入導覽（`RoleShell` 的 `NAVS.public`）／登入頁／買家導覽（`SIDEBAR_NAV_SECTIONS`「其他」）／創作者導覽（`CREATOR_SECTIONS`「帳戶」）。**Admin 主導覽刻意不加** |
| 不承諾 | 回覆時限、專人、即時客服 —— 平台沒有 SLA，寫了就是假承諾（由測試釘住） |

**為什麼登入頁那個入口特別重要：** 消費申訴的端點**全部** `requireAuth`
（`routes/complaints.js`），而平台**沒有密碼重設**（`P1-08` 採誠實移除）。
在 `/support` 之前，「登入不了的人」沒有任何管道。
**但 `/support` 不是 password recovery** —— backend 至今沒有 forgot/reset 端點，
不得因為有了客服入口就把「忘記密碼？」加回來。

> **`/support` 上的個資權利請求段落刻意不印出地址。** 個資信箱目前只寫在
> **草稿**《隱私權政策》裡，而四條 legal route 未發布時一律 404（`TEST-01`）。
> 在條款定稿前把草稿聯絡資料搬到匿名可讀的頁面，等於替平台對外做出承諾。
> 該段落顯示「將於正式隱私權政策公布後提供」，由測試釘住不得洩漏草稿地址。

### 邊界：一般客服**不得**被塞進任何一套專門案件系統

§12.10.1 的四套 case 各有自己的法律基礎、提出者與期限來源。
一般客服**沒有**其中任何一個特性，因此**不是**它們的第五個 enum 值：

| 這件事 | 歸屬 | **不得**歸到 |
| --- | --- | --- |
| 修改密碼、忘記密碼、修改可自行編輯的個人資料 | **一般客服** | `privacy_requests`（那是正式個資**權利**請求：查詢閱覽／複製本／更正補充／停止蒐集處理利用／刪除／撤回同意） |
| 網站操作、一般使用疑問、單純問「這要怎麼用」 | **一般客服** | `consumer_complaints`（那是消保法 §43 的**交易**爭議，有十五日 `statutory_due_at`） |
| 購買爭議、退款爭議、教材與描述不符、付款後未取得應有內容 | `consumer_complaints`（§12.10） | 一般客服 |
| 違規教材、不當內容、平台規範違反 | `reports`（§6） | 一般客服 |
| 付款／核帳 | `manual_payment_proofs` 審核（§12.4） | 一般客服 —— **付款審核不得變成一般客服入口** |

**兩條硬規則：**

1. **不得**為了承接一般客服而新增 `complaint_type` 值、新增
   `privacy_requests.request_type` 值，或擴張 `reports` 的 `resolution`。
2. 未來真的要做 ticket system 時（`FUT-P8`），它必須有**自己的**
   table、route namespace 與狀態集合，**不重用** `COMPLAINT_STATUSES`／
   `complaintSla.js`；且不得破壞既有四套 workflow。

## 14.1 Revenue

- `revenueAmount` **只計入 `orders.status = 'approved'`** 的訂單，金額取 `orders.total_amount`（折扣後；`COALESCE(total_amount, total_price, 0)` 僅為歷史資料相容）。
- `pending_payment` 訂單一律不計入營收，**包含付款憑證遭 admin 駁回後仍停留在 `pending_payment` 的訂單**（`POST /admin/payment-proofs/:id/reject` 不改變訂單狀態）。
- `ordersCount` 是**所有訂單**（不分狀態）。修正 revenue 的 status filter 時不得讓 `ordersCount` 一起被過濾 —— 兩者以 conditional aggregate 分離。
- `revenueAmount` **不接任何日期條件**，語意為 *all-time approved revenue*。它保留給既有 caller；
  Dashboard UI 已改為顯示期間營收 `periodRevenueAmount`（見 §15.4）。
- 本節僅規範 Admin dashboard。Creator 端（§13）目前採 `SUM(order_items.subtotal)`（折扣前）＋ `status IN ('approved','completed')`，兩者口徑尚未對齊，屬已知待處理項目。

## 14.2 Snapshot vs all-time

Dashboard 上每一個數字目前不是 **current snapshot** 就是 **all-time 累計**，沒有任何期間篩選。因此：

- UI 文案**不得**出現「本期」這類期間字樣。all-time 用「歷來累計」，snapshot 用「目前」。
- 待處理卡（待審核教材／待審核付款憑證／待處理檢舉）是 current backlog snapshot，未來加入 date range 後**也不得**受其影響 —— 待辦被區間濾掉不代表已處理完。

## 14.3 統計來源與失敗行為

- `GET /admin/dashboard/summary` 是 KPI 的 canonical source。
- **該 API 失敗時，KPI 一律顯示 `—`，不得改用前端就地計算的另一份數字頂替。** 同一張卡在成功與失敗時代表不同 metric（例如 all-time 訂單數 ↔ 前端過濾後的訂單數）屬 correctness bug。
- `—`（不可用）與 `0`（真實為零）與 skeleton（載入中）三者必須可區分。
- 單一端點失敗不得讓整頁失敗；其餘區塊照常顯示。

## 14.4 Exception feed（「需要注意的訂單」「需要注意的活動」）

Dashboard 下半部的兩張卡是 **exception feed**，不是「最新 N 筆」。
它們回答「現在有沒有卡住的東西」，不是「剛剛發生了什麼」——
後者已由 KPI 與趨勢圖回答（`docs/admin-information-architecture.md` §4、§11 原則 1）。

| 卡片 | 挑選條件 | canonical 定義 |
| --- | --- | --- |
| 需要注意的訂單 | `operational_status ∈ { pending_review, payment_rejected }` | `Backend/services/adminOrders.service.js`（**不新增** SLA／逾期等衍生狀態） |
| 需要注意的活動 | `action` ∈ Admin attention allowlist | `frontend/apps/web/lib/admin-labels.ts` 的 `ATTENTION_ACTIVITY_ACTIONS` |

**規則：**

1. **挑選一律在 API 端完成** —— 訂單走既有的 `?status=`，活動走 `?action=`（多值，見 §22.2）。
   **不得**抓一大頁回前端再自行過濾：高頻事件會把異常擠出視窗，
   widget 於是顯示「沒有異常」而其實有 —— 那是靜默漏顯示，不是效能取捨。
2. 兩者都是 **current snapshot**，不是期間聚合，前端不得再另做日期過濾（見 §15.6）。
3. 活動的 allowlist 只收「**不會**被待辦計數涵蓋的異常」。
   已進佇列的事件（上傳憑證、送出檢舉、重新送審）由待處理卡的數字負責，
   放進 allowlist 只是把同一件事講兩次。
4. 兩張卡都**只導航**到既有的 operational / investigation surface，
   不得在 Dashboard 上長出第二套處置介面。

## 14.5 目前不提供的指標

- **異常訂單**：`orders.status` 目前不會產生 `cancelled` / `rejected`（無取消流程；`rejected` 只存在於 `manual_payment_proofs.review_status` 與 `/me/orders` 的衍生欄位 `order_progress_state`），該指標無 canonical 資料來源，dashboard 不顯示。
- **教學回饋成長率**：`wowReviewDeltaPercent`（近 7 天新增 vs 前 7 天新增）仍由 API 回傳，但它是 period metric，與 all-time 的「教學回饋總數」不是同一個 metric，並列會誤導，故前端不顯示。

---

# 15. Admin dashboard reporting period

Admin Dashboard 的期間統計模型。**§14 規範不受期間影響的數字，本節規範受期間影響的數字。**

Canonical 實作（不得在其他地方各自重算日期）：

| 層 | 檔案 |
| --- | --- |
| 期間解析（唯一權威） | `Backend/utils/reportingRange.js` |
| SQL 邊界與指標 | `Backend/services/adminDashboard.service.js` |
| URL state 與輸入驗證 | `frontend/apps/web/lib/reportingRange.ts` |

## 15.1 Canonical date semantics

| 項目 | 定義 |
| --- | --- |
| Timezone | **`Asia/Taipei`**（固定；不跟隨 server、DB session 或 browser 時區） |
| `from` / `to` | **inclusive calendar date**，格式一律 `YYYY-MM-DD` |
| 查詢邊界 | **half-open `[start, end)`**，`start` = `from` 當日台北 00:00，`end` = `to + 1 天` 台北 00:00 |

禁止寫法（前後端皆適用）：

- `new Date("2026-08-20")` 當台北日曆日 —— 那是 UTC 午夜
- `toISOString().slice(0, 10)` 當台北今日 —— 台北 00:00–08:00 會算成前一天
- `setHours(23, 59, 59, 999)` 或 `<= end` 當期末 —— 一律 half-open

## 15.2 Preset 定義

以台北今日為 `today`，全部為 inclusive 日曆日：

| Preset | `from` | `to` | 說明 |
| --- | --- | --- | --- |
| `today` | `today` | `today` | |
| `7d` | `today - 6d` | `today` | **含今日的 7 個台北日曆日**，不是滾動 168 小時 |
| `30d` | `today - 29d` | `today` | 含今日的 30 個台北日曆日 |
| `this_month` | 當月 1 日 | `today` | **不是整月** —— 未來日期不算入 current period |
| `custom` | 使用者指定 | 使用者指定 | 兩端皆 inclusive |

preset 一律由 server 依台北今日推導；caller 附帶的 `from` / `to` 對 preset 無效。

## 15.3 Period metrics

| Metric | Date field | Filter |
| --- | --- | --- |
| `periodRevenueAmount` | `orders.paid_at` | `status = 'approved' AND paid_at IS NOT NULL` |
| `newOrdersCount` | `orders.created_at` | 無（不分最終狀態） |
| `newUsersCount` | `users.created_at` | 無（不分 role） |
| `newMaterialsCount` | `materials.created_at` | 無 |
| `newReviewsCount` | `review.created_at` | 無 |

`materials` 沒有 `published_at`，因此**不提供**「期間內上架教材數」。不得用 `updated_at` 頂替 —— 它會被任何一次編輯覆寫。

## 15.4 Revenue recognition

- 認列日期一律 **`orders.paid_at`**，即 admin 核准付款憑證的時間（語意等同已被刪除的 `approved_at`）。
- **不得**使用 `orders.created_at`（那是下單）或 `manual_payment_proofs.uploaded_at`（那是買方聲稱已付款）。
- `paid_at IS NOT NULL` 是必要條件：資料庫中存在 `status='approved'` 但 `paid_at` 為 NULL 的歷史列，它們沒有可靠的認列時間點，**不得**用 `created_at` 頂替。
- 金額取 `COALESCE(total_amount, total_price, 0)`（折扣後）。

## 15.5 TIMESTAMP / TIMESTAMPTZ 比較策略

schema 目前混用兩種型別（本輪**不做** migration），reporting query 必須依欄位型別選用對應邊界：

| 欄位型別 | 欄位 | 邊界運算式 |
| --- | --- | --- |
| `TIMESTAMPTZ` | `review.created_at` | `(($n::date)::timestamp AT TIME ZONE 'Asia/Taipei')` → 絕對時間點，直接比較 |
| `TIMESTAMP`（無時區） | `orders.created_at` / `orders.paid_at` / `users.created_at` / `materials.created_at` | 上式再 `AT TIME ZONE current_setting('TimeZone')` → 換算成 **DB session 時區的牆鐘值** |

無時區欄位存的是 `NOW()` / `CURRENT_TIMESTAMP` 寫入當下、以 DB session 時區呈現的牆鐘時間，所以邊界必須換算到同一個座標系。用 `current_setting('TimeZone')` 而非寫死 `'Asia/Taipei'`：本機 DB 目前是 `Asia/Taipei`（兩次轉換互相抵銷），但部署到 UTC 資料庫時這個寫法仍正確，寫死則會整整偏 8 小時。

邊界一律放在比較式右側（每次查詢為常數運算式），欄位本身不包函式，保留索引可用性。

**不得**為了 reporting 執行 `SET TIME ZONE` —— 那會影響同一連線上其他 route 的行為。

## 15.6 期間控制範圍

期間**只**控制 period metrics。以下一律不受影響：

| 類型 | 項目 |
| --- | --- |
| Current backlog snapshot | 待審核教材、待審核付款憑證、待處理檢舉 |
| All-time / snapshot | 教材總數、已發布教材、訂單總數、用戶總數、教學回饋總數 |
| Exception snapshot | 需要注意的訂單、需要注意的活動（見 §14.4） |

UI 上期間選擇器必須放在「本期表現」區塊標題列，**不得**放成看似控制整頁的 global toolbar。待辦被期間濾掉不代表已處理完，會導致漏處理。

`GET /admin/orders`、`GET /admin/activity-logs` **不得**為了 dashboard 的這兩張卡加上 `from` / `to`。

## 15.7 API contract

```
GET /admin/dashboard/summary?range=today|7d|30d|this_month|custom[&from=YYYY-MM-DD&to=YYYY-MM-DD]
```

- `from` / `to` 必須嚴格符合 `YYYY-MM-DD`，且為日曆上真實存在的日期。`2026-8-1`、`20260820`、`2026-08-20T00:00:00Z`、`2026-02-31` 一律 **400**。
- `range=custom` 必須同時提供 `from` 與 `to`；只給一邊 → 400（不做推測）。
- `from > to` → 400；`to` 晚於台北今日 → 400；期間超過 **365 天** → 400。
- 錯誤格式：`400 { "error": "INVALID_DATE_RANGE", "message": "<說明>" }`。
- **未帶任何參數時採預設近 30 天**（向後相容既有 caller），且 response 一律回傳實際解析結果：`periodFrom`、`periodTo`、`periodTimezone`、`periodPreset`。
- 前端**只送日曆日字串**，不自行產生 UTC timestamp；時區換算一律由 Backend 負責。

## 15.8 URL contract

```
/admin                                              → 近 30 天（預設）
/admin?range=7d
/admin?range=custom&from=2026-08-01&to=2026-08-10
```

- URL 是期間的 single source of truth：reload / bookmark / 上一頁下一頁皆須成立（用 `push` 而非 `replace`）。
- **任何不合法的參數安全退回 `30d`**，不得崩潰、不得推測補值。
- UI 顯示的區間文字一律採用 API 回傳的 `periodFrom` / `periodTo`，確保「畫面上寫的期間」＝「後端真正查的期間」。

## 15.9 載入與失敗行為

- 切換期間時**只有** period metrics 進入 loading；待處理卡、平台摘要、需要注意的訂單／活動（§14.4）不得重新 skeleton，與期間無關的端點也不得重新請求。
- 快速切換期間時必須有 race protection（序號 + `AbortController`），較舊的回應不得覆寫較新的期間。
- summary 失敗時所有由它供應的卡顯示 `—`，**不得**保留上一個期間的數字，也**不得**改用前端就地計算的另一份數字。

---

# 16. Admin dashboard trends

`GET /admin/dashboard/trends`。與 §15 共用**同一個** reporting range resolver（`Backend/utils/reportingRange.js`）與同一套 400 行為；兩個 endpoint 不得各自解析期間。

Canonical 實作：

| 層 | 檔案 |
| --- | --- |
| granularity／bucket 序列／補 0 | `Backend/utils/trendBuckets.js` |
| SQL 分組與查詢 | `Backend/services/adminTrends.service.js` |
| 圖表元件 | `frontend/apps/web/components/admin/TrendChart.tsx` |

## 16.1 兩條序列，兩個不同事件

| 序列 | Date field | Filter | UI label |
| --- | --- | --- | --- |
| `revenue` | **`orders.paid_at`** | `status = 'approved' AND paid_at IS NOT NULL` | 營收趨勢 |
| `orders` | **`orders.created_at`** | 無（不分狀態） | **新增訂單趨勢** |

- 營收趨勢**絕不**改用 `created_at`；新增訂單趨勢**絕不**加 status filter。兩者與 §15.3 的 `periodRevenueAmount` / `newOrdersCount` 完全同口徑，因此各 bucket 加總必然等於對應的 KPI。
- UI label 用「**新增**訂單趨勢」而非「訂單趨勢」，避免與 approved orders 混淆。
- 本輪只做這兩張圖。**不**為 snapshot 類指標（總使用者／總教材／pending）做趨勢圖 —— 它們沒有期間語意。

## 16.2 Granularity

依 current period 的日曆天數決定，caller 不能指定：

| 天數 | granularity | key 格式 | 範例 |
| --- | --- | --- | --- |
| 1 | `hour` | `YYYY-MM-DD"T"HH24` | `2026-08-20T14` |
| 2–90 | `day` | `YYYY-MM-DD` | `2026-08-20` |
| 91–365 | `month` | `YYYY-MM` | `2026-08` |

- `today` → hourly，**固定 24 個 bucket**，尚未到來的小時補 0。刻意不隨當下時間縮減點數，否則 x 軸每小時都會變形。
- `this_month`（例如已過 20 天）→ **daily**，不是單一 monthly 點。
- custom 上限 365 天，因此不需要 yearly 粒度。
- key 是 **machine-friendly 識別碼**，不是顯示 label；`14:00` / `8/20` / `2026/08` 由前端格式化。

## 16.3 Gap filling

SQL 只會回傳有資料的 bucket。完整序列一律由 `expectedBucketKeys()` 產生，再以 `fillBuckets()` merge，缺口補 **`0`**。

- 圖表**不得**跳日期。
- 全 0 的期間是**有效資料**（該期間確實沒有營收／訂單），必須正常畫出基線，**不得**顯示「無資料」。真正的「資料無法載入」只用於 endpoint 失敗。
- monthly 的頭尾月份可能只被期間涵蓋一部分；仍各產生一個 bucket，數值由 SQL 的 `[start, end)` 過濾決定，**不會**把整個月算進來。

## 16.4 SQL timezone grouping

**禁止** `GROUP BY DATE(created_at)` —— 那會用 DB 的隱含時區切日，與 §15.5 的台北邊界對不上，邊界附近的資料會掉進錯誤的 bucket。

| 欄位型別 | 分組運算式 |
| --- | --- |
| `TIMESTAMP`（無時區）：`orders.created_at` / `orders.paid_at` | `date_trunc(unit, ((col AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'Asia/Taipei'))` |
| `TIMESTAMPTZ`：`review.created_at` | `date_trunc(unit, (col AT TIME ZONE 'Asia/Taipei'))` |

分組與 §15.5 的邊界換算互為逆向但落在**同一個座標系**，因此 bucket 與 filter 必然一致。邊界仍放在比較式右側（常數運算式），欄位本身不包函式；分組運算式作用於已篩出的列。

本輪沒有 reviews 趨勢圖，但 KPI 端的 TIMESTAMPTZ 策略不得因 trend 的改動而破壞。

## 16.5 Response

```json
{
  "periodFrom": "2026-08-14", "periodTo": "2026-08-20",
  "periodTimezone": "Asia/Taipei", "periodPreset": "7d",
  "granularity": "day",
  "revenue": [{ "key": "2026-08-14", "value": 1200 }],
  "orders":  [{ "key": "2026-08-14", "value": 4 }]
}
```

`revenue` 與 `orders` 長度一律相同（同一組 bucket key）。

## 16.6 UI 行為

- 趨勢圖屬於「本期表現」，跟著同一個期間走，**沒有**自己的 URL state。
- trends 與 summary 是**兩支獨立 endpoint**，各自 loading / error：summary 失敗時 KPI 顯示 `—` 但圖表照常；trends 失敗時圖表顯示「趨勢資料暫時無法載入」但 KPI 照常。**不得**讓整個「本期表現」一起變 `—`。
- 兩者各自持有 `AbortController` 與序號，不得共用 —— 共用會讓一邊的取消殺掉另一邊仍有效的請求。
- 資訊不得只存在於圖形中：圖表需有 accessible name 與一行文字摘要（本期最高 bucket）。

---

# 17. Admin dashboard comparison

Period KPI 的前期比較。**全部由 Backend 決定**（比較期、成長率、零分母），前端只負責顯示，不得自行推算日期或重算百分比。

## 17.1 Previous period

一般規則：**緊鄰前一個等長期間**，兩期完全不重疊。

```
previousTo   = from - 1 天
previousFrom = previousTo - (天數 - 1)
```

| Preset | Current（今天 = 2026-08-20） | Previous |
| --- | --- | --- |
| `today` | 08-20 | **08-19**（昨天，台北日曆日；不是「前 24 小時」） |
| `7d` | 08-14 ~ 08-20 | 08-07 ~ 08-13 |
| `30d` | 07-22 ~ 08-20 | 06-22 ~ 07-21 |
| `custom` 08-03 ~ 08-12 | 10 天 | 07-24 ~ 08-02（同為 10 天） |

**`this_month` 例外**：改用**上個月的相同 elapsed-day window**，而不是等長規則。

| Current | Previous |
| --- | --- |
| 08-01 ~ 08-20 | **07-01 ~ 07-20**（不是 07-12 ~ 07-31，也不是整個 7 月） |

理由：比較「20 天 vs 20 天」才有營運意義；「20 天 vs 31 天」沒有。

**月長邊界**：上個月較短時夾到該月最後一日，**絕不產生不存在的日期**。

| Current | Previous |
| --- | --- |
| 2026-03-01 ~ 2026-03-31 | 2026-02-01 ~ **2026-02-28**（非閏年） |
| 2028-03-01 ~ 2028-03-31 | 2028-02-01 ~ **2028-02-29**（閏年） |

此時 previous 期間會比 current 短 —— 這是刻意且明確定義的行為。

## 17.2 Comparison metrics

`periodRevenueAmount`、`newOrdersCount`、`newUsersCount`、`newMaterialsCount`、`newReviewsCount` 各有一組：

```
previous<Metric>        前期數值（與 current 走完全相同的邊界換算路徑）
<metric>DeltaPercent    canonical 成長率
```

外加 `previousPeriodFrom` / `previousPeriodTo`，讓 caller 知道實際的比較基準。

## 17.3 Growth / zero denominator（canonical）

`Backend/utils/reportingRange.js` 的 `computeDeltaPercent()` 是**唯一**允許計算成長率的地方。

| 條件 | `deltaPercent` |
| --- | --- |
| `previous > 0` | `Math.round((current - previous) / previous * 100)` |
| `previous = 0` 且 `current = 0` | `0` |
| `previous = 0` 且 `current > 0` | **`null`** |

- 下降一律回**負數**，不取絕對值（`5 vs 10` → `-50`）。
- `previous = 0, current > 0` 回 `null`，因為百分比在數學上沒有有限值。**不得**沿用舊 `wowReviewDeltaPercent` 硬編 100% 的規則 —— 那讓 `0→1` 與 `0→10000` 看起來一樣。UI 對 `null` 顯示「**新增**」，不得顯示 `100%` / `Infinity` / `NaN`。
- Backend 已四捨五入成整數；前端**不再**做任何數學。

## 17.4 Comparison wording

比較對象依 preset 而異，**不得**全部叫「較上週」：

| Preset | 文案 |
| --- | --- |
| `today` | 較昨日 |
| `7d` | 較前 7 天 |
| `30d` | 較前 30 天 |
| `this_month` | 較上月同期 |
| `custom` | 較前期 |

實際期間值由 `previousPeriodFrom` / `previousPeriodTo` 提供（UI 放在 `title` 中）。

## 17.5 Growth direction

Component API 用語意值 `positive | negative | neutral | new`，**不得**寫死 green/red —— 「上升是好事」對所有指標並非必然成立，配色屬視覺層決定。目前五個指標一律採 `increase = positive`。

## 17.6 已知落差

`approved` 但 `paid_at IS NULL` 的歷史列不進入任何 period 營收或 trend bucket（沒有可靠的認列時間點，且**不得** fallback 到 `created_at`）。因此 **Σ(各期間營收) 可能小於 all-time `revenueAmount`** —— 這是預期中的 legacy gap，測試已鎖住此行為。

## 17.7 Deprecated

`wowReviewDeltaPercent`（近 7 天 vs 前 7 天滾動）已由 `newReviewsDeltaPercent` 取代，**沒有任何 caller**。保留 response 欄位僅為避免 breaking change；它的零分母規則與 §17.3 不一致，不得使用。

---

# 18. Creator sales semantics（Creator Gross Sales）

Creator（teacher）銷售統計的口徑。端點與欄位見 §13。

Canonical 實作（不得另建第二套）：

| 層 | 檔案 |
| --- | --- |
| 期間解析 | `Backend/utils/reportingRange.js`（**與 Admin 同一份**） |
| Bucket / granularity / 補 0 | `Backend/utils/trendBuckets.js`（**與 Admin 同一份**） |
| SQL 與 eligible-sale 定義 | `Backend/services/teacherSales.service.js` |
| 前端期間 state 與選擇器 | `frontend/apps/web/lib/reportingRange.ts`、`components/reporting/ReportingRangeSelector.tsx`（**與 Admin 同一份**） |
| 前端趨勢圖 | `components/reporting/TrendChart.tsx`（**與 Admin 同一份**） |

## 18.1 Canonical semantics

```text
Meaning : Creator Gross Sales —— 已成交的創作者商品行金額，折扣前
Amount  : SUM(order_items.subtotal)
Status  : orders.status = 'approved'
Date    : orders.paid_at（admin 核准付款的時間，非下單時間）
Window  : Asia/Taipei 日曆日，half-open [start, end)
```

## 18.2 Eligible sale

summary / materials / records / trend **一律共用同一個 predicate**（`ELIGIBLE_SALE`），不得各自手寫 status 集合 —— 舊版的 `IN ('approved','completed')` 就是這樣長出來的。

```sql
oi.seller_id = <JWT user>          -- 永遠來自已驗簽 JWT，不接受 query 參數（P0 security invariant）
AND o.status = 'approved'
AND o.paid_at IS NOT NULL
AND o.paid_at >= <台北 from 00:00>
AND o.paid_at <  <台北 to+1 00:00>
```

`paid_at IS NOT NULL` 是必要條件。資料庫存在 `status='approved'` 但 `paid_at` 為 NULL 的歷史列（dev 2 筆、security_test 2 筆），它們沒有可靠的認列時間點。**不得** fallback 成 `COALESCE(paid_at, created_at)` —— 那會再次破壞認列語意。這些列不會出現在任何期間統計中，屬已知的 **legacy data gap**（Admin 端亦然）。

## 18.3 與 Admin 的對齊與差異

| Dimension | Admin | Creator | 結果 |
| --- | --- | --- | --- |
| Status | `approved` | `approved` | **aligned** |
| Date | `orders.paid_at` | `orders.paid_at` | **aligned** |
| Timezone | Asia/Taipei | Asia/Taipei | **aligned** |
| Boundary | `[start, end)` | `[start, end)` | **aligned** |
| Presets / URL / 預設 30d | 有 | 有 | **aligned** |
| **Amount** | `orders.total_amount`（**折扣後**、order-level） | `Σ order_items.subtotal`（**折扣前**、item-level） | **刻意不同** |

兩者涵蓋**完全相同的一組訂單、在完全相同的日期上**。唯一差異是金額基準，因此差額可完整解釋：

```text
Σ Creator Gross Sales − Σ orders.discount_amount = Admin Recognized Revenue
```

多創作者訂單有折扣時 `Σ Creator > Admin` 是**預期且允許**的（Gross Sales vs Net Revenue）。本階段**不做**折扣分攤，因此不提供 Creator Net Sales。

## 18.4 命名規則（強制）

| 情境 | 用詞 |
| --- | --- |
| Creator 金額指標 | **銷售額** / **銷售額（折扣前）** |
| Admin 金額指標 | **營收**（recognized revenue，折扣後） |
| Creator 側欄 | **我的銷售** |

Creator 端**不得**出現「營收」或「收益」：

- 「營收」在本平台專指 Admin 的 recognized revenue，定義不同，同名會直接造成誤讀。
- 「收益」需要平台抽成與結算模型；repo 中對 `commission` / `platform_fee` / `payout` / `settlement` 的搜尋結果為 **0 命中**，**Creator Earnings 目前不存在**。

同理，UI **不得**新增「淨銷售額」「可提領」「待結算」「已結算」等欄位，直到對應的產品決策與資料模型存在。

## 18.5 Trend

與 Admin 共用 `trendBuckets.js`：

- granularity：單日 → `hour`；2–90 天 → `day`；91–365 天 → `month`
- 依 `orders.paid_at` 以**台北牆鐘**分組（`date_trunc(unit, TPE_WALL(paid_at))`）
- 沒有資料的 bucket 一律補 `0`；全 0 是有效資料，**不得**顯示成「無資料」
- API 回傳的 `key` 必須是 machine-friendly 字串（`YYYY-MM-DD` / `...THH` / `YYYY-MM`），**不得**把 PostgreSQL 的 date 物件直接送到前端
- 前端**不得**把 bucket key 轉成 `Date` 再 `toISOString()` 格式化 —— 那正是舊版每個日期都早一天的原因

## 18.6 前端時間顯示

成交時間一律以 **Asia/Taipei** 呈現（`Intl.DateTimeFormat` 指定 `timeZone`），不跟隨瀏覽器時區：統計期間是台北日曆日，明細時間若用瀏覽器時區顯示，兩者會對不起來。

## 18.7 期間控制範圍

Creator 銷售頁的期間選擇器控制**整頁**：銷售額、成交訂單數、賣出份數、有成交教材數、趨勢、熱銷排行、教材彙總、成交明細。與 Admin dashboard 不同（那裡只控制「本期表現」），因為這頁本身就是銷售分析頁，沒有 snapshot 類指標。

切換期間時三支 endpoint 一起重新取得，並具備 race protection（序號 + `AbortController`）。失敗時顯示錯誤態，**不得**顯示 `0` —— `0` 是有效的銷售額。

## 18.8 呈現層規則（Responsive data presentation）

Creator 銷售頁的呈現規則。**這一節不涉及金額語意**（見 18.1–18.4），只規範資料怎麼呈現。

### 元件

Creator Sales 使用 **canonical stack**（Tailwind + `components/ds` + `components/ui` + `components/reporting`）。
**不得**再用 `@teaching-platform/ui`（Tamagui，legacy-frozen）承載統計數值 —— 它的
`SurfaceCard(title, description)` 會把標籤排成 16px 深色、數值排成 14px 灰色，造成視覺階層反轉。

期間選擇器與趨勢圖與 Admin dashboard **共用** `components/reporting/`，不得複製第二份。

### KPI

- 視覺權重固定為 **value > label > subtext**（`components/reporting/StatCard.tsx`）。
- 順序依 Creator 的決策價值：**銷售額 → 成交訂單 → 賣出份數 → 有成交教材**。
- 標籤用「銷售額」，口徑「折扣前」放 subtext；**不要**把完整口徑塞進標籤。
- 版面：手機 2×2、`lg` 以上 4 欄。**不得**在手機排成單欄（四張卡會吃掉整個首屏）。

### 表格 vs 清單

- **`lg`（1024px）以下不使用 table。** 中文欄位在窄欄會被壓成一行一個字，且金額欄會被推出可視範圍。
  改用同一份資料渲染的分隔線清單（`hidden lg:table` + `lg:hidden`）。
- 桌機表格：數值欄一律 `text-right` + `tabular-nums`；長教材標題 `max-w-0` + `truncate` + `title`，
  **不得**讓標題撐寬整欄把數字擠到畫面邊緣。
- opaque id（`orderId`）降權顯示末六碼，完整值放 `title`。
- 表格必須有 `caption`（可 `sr-only`）與 `th[scope="col"]`。

### 期間控制

期間選擇器控制**整頁**，因此放在標題列旁，**不得**包成一張「統計期間」卡片再附說明文字 ——
位置本身就表達作用範圍。時區不顯示在主畫面，改由 `title` / `sr-only` 提供。

教材篩選只影響成交明細，必須放在該區塊，不得與期間控制並列。

### Partial failure

`summary` / `materials` / `records` **各自**持有 `data / loading / error`：

| 失敗的 endpoint | 顯示錯誤 | 仍正常顯示 |
| --- | --- | --- |
| summary | KPI 與趨勢 | 教材銷售表現、成交明細 |
| materials | 教材銷售表現 | KPI、趨勢、成交明細 |
| records | 成交明細 | KPI、趨勢、教材銷售表現 |

**一支失敗不得清掉其他已成功的資料。** 每區各自可重試（只重打該支），且各自持有 `AbortController` 與序號。

section 級錯誤用 `ErrorState variant="inline"`（單行、secondary retry），不得長成比它取代的內容還大的卡片。
**5xx 的 response body 是給維運看的（例如 `server error`），不得原樣顯示給創作者**；只有 4xx 才帶對使用者有意義的訊息。

### Loading / Empty

- 切換期間時 header 與選擇器保持在原位，只有各區塊進 skeleton（保留高度），**不得**整頁塌陷成單一 spinner。
- `0` 是有效的銷售額：空期間的 KPI 顯示 `NT$ 0` / `0`，**不是**錯誤態。
- 三個區塊的空狀態措辭必須不同（趨勢「此期間尚無成交。」／教材「此期間沒有教材成交資料」／
  明細「此期間沒有成交明細」），且**一頁只放一個 CTA**。

### Heading

頁面擁有 heading 階層：`h1 我的銷售` + `h2 銷售表現 / 銷售額趨勢 / 教材銷售表現 / 成交明細`。
`TrendChart` 以 `titleAs` / `titleClassName` 接受層級與樣式，不自行強制。

其他呈現層規則：帶語意的說明文字（例如 KPI 的「折扣前」）不得使用 `ds-textSubtle`（#9ca3af，約 2.5:1），
一律用 `ds-textMuted`（約 5:1）；skeleton 動畫需加 `motion-reduce:animate-none`；
行動版有 49px 的 sticky top bar，錨點區塊需 `scroll-mt-20 lg:scroll-mt-6`。
舊的 `?tab=records` 僅作**錨點**（捲到成交明細），**不得**改變 `h1` —— 那是假的導覽狀態；新連結用 `#records`。

## 18.9 尚未實作（需產品決策）

```text
折扣承擔責任（Discount funding responsibility）  → Undefined
Creator Net Sales / discount allocation          → 不提供
Platform commission / fee                        → 不存在
Creator Earnings                                 → 不存在
Payout / settlement                              → 不存在
Refund / reversal                                → REQUIRED — P1-09 Gate 14 / NOT IMPLEMENTED
```

> **`Refund / reversal` 的狀態說明（2026-08-26）：**
> Phase 1 **不存在**一般任意反悔退款政策 —— 這是產品決策，維持不變。
> 但平台**必須具備**處理下列情形的 refund / remedy capability：
> 法定解除（消保法 §19）、履約瑕疵、重複付款、IP 下架、平台未履約，
> 以及其他依法或依契約應退款或補救之情形。
>
> **2026-08-26 更新：案件容器與人工銀行退款執行紀錄已存在；退款對帳與稅務沖銷仍未實作。**
> `refund_remedy_cases` 表、狀態機、Admin／買家端點與稽核歷程（**§12.8**）
> 以及人工銀行退款的原子執行紀錄（**§12.8.6**，`POST /admin/remedy-cases/:id/execute-refund`）
> 已上線，因此「平台無從記錄退款案件與實際退款」的缺口已關閉。
>
> 但下列仍**未實作**，故本項維持 **`NOT IMPLEMENTED`**（Gate 14 為 `PARTIAL`）：
> **退款金額如何反映到本節的營收與 trend**（`refund_amount` 目前完全不進入任何營收查詢 ——
> 這是刻意的，因為折扣承擔與稅務沖銷都還沒定案）、憑證沖銷流程（待 External Tax Gate）、
> Creator 報酬回沖（`P10` ledger 不存在）、法定解除的實體判斷、
> 退款 SLA 與買家可見的申訴介面、買家退款收款帳戶。
> 規格見 `docs/PRE-03_PRE-04_P1-09_A-P_v1.8_Full_Baseline.md` 的 **Deployment Gate 14**。
> 實作時依 `CLAUDE.md` §9，須在同一次 push 更新本節狀態。

---

# 19. Admin Orders operational state（Admin 訂單清單語意）

Admin 訂單清單要回答的是**營運問題**：「我現在要處理什麼？」——不是「資料庫的 status 字串是什麼」。
`orders.status` 無法表達這件事：憑證上傳與退回都**不會**改動它，因此
`status = 'pending_payment'` 同時混雜了「還沒上傳憑證」「已上傳待審」「憑證被退回」三種完全不同的處理情境。

## 19.1 Canonical 定義位置

**唯一定義在 `Backend/services/adminOrders.service.js` 的 `OPERATIONAL_STATUS_SQL`。**

- 前端**不得**自行 mapping、不得抓全部訂單再依憑證自行過濾、不得自行推算 latest proof。
- 篩選條件與回傳欄位共用同一份 SQL 運算式；兩邊各寫一次正是舊版 filter 與 badge 語意分歧的成因。
- 這是 derived state，**不落地**：不得新增欄位、不得寫回 `orders.status`（見 §5 dead values）。

## 19.2 五個狀態與 predicate

Precedence 由上而下，**順序即語意**：

| operational_status | Predicate | UI 標籤 |
| --- | --- | --- |
| `approved` | `orders.status = 'approved'` | 已核准 |
| `cancelled` | `orders.status = 'cancelled'` | 已取消 |
| `pending_review` | 非上述兩者，且 `EXISTS` 該訂單有 `review_status = 'pending'` 的憑證 | 待審核 |
| `payment_rejected` | 非上述三者，且 `EXISTS` 該訂單有 `review_status = 'rejected'` 的憑證 | 付款被退回 |
| `awaiting_payment` | 其餘（`pending_payment` 且完全沒有 pending／rejected 憑證） | 待付款 |

兩個**不可調換**的順序條件：

1. **`approved` 必須最先短路。** 核准時會把同一張訂單其餘 pending 憑證標成 `rejected`
   （`note = 'superseded by approved proof'`）；先判斷憑證會把已核准訂單誤分到 `payment_rejected`。
2. **`pending_review` 必須排在 `payment_rejected` 之前。** 憑證被退回後買家重新上傳時，
   同一張訂單同時存在舊 `rejected` 與新 `pending`，此時**必須**是待審核 —— 否則 admin 再也看不到它。
   （regression 已鎖在 `Backend/tests/adminOrdersFilter.db.test.js` Case 4。）

CASE 是 total function：每筆訂單恰好落在一個 bucket，五個 bucket 因此是 `orders` 的一個 **partition**
（`Σ bucket = COUNT(*) FROM orders`，已由測試斷言）。

## 19.3 API contract

`GET /admin/orders`

- Query 參數名維持 **`status`**（不改成 `state`）。
- 接受值**只有**上表五個 operational token。未帶或空字串 → 回傳全部訂單。
- 非法值（含 legacy／dead token `pending_payment`、`paid`、`completed`）→ **400**
  `{ message: "status must be one of awaiting_payment|pending_review|payment_rejected|approved|cancelled" }`。
  **不得**靜默回 `{ items: [] }`。行為與 `/admin/payment-proofs` 的 `status` 驗證一致。
- 每筆 item 於既有訂單欄位外另含：`operational_status`、`payment_proof_pending_review_count`、
  `payment_proof_latest_status`、`buyer_email`。
  `buyer_email` 來自 `LEFT JOIN users`（不是 `JOIN`）：清單頁的職責是把訂單列出來，
  不是替 referential integrity 把關 —— 孤兒列要顯示成 Email 未知，而不是整筆消失。
- Latest proof 一律以 `ORDER BY COALESCE(uploaded_at, created_at) DESC, id DESC LIMIT 1` 判定 ——
  資料庫存在 `uploaded_at IS NULL` 的舊憑證，只用 `uploaded_at` 會把它們排到最後。
  這份排序的 canonical 常數是 `LATEST_PROOF_ORDER_BY_SQL`（`Backend/utils/paymentProofReview.js`），
  **與 buyer 的 `order_progress_state`（§5）共用**：兩個視角的 vocabulary 不同，
  但「哪一筆是最新憑證」必須是同一個答案，否則同一張訂單在 Admin 與 Buyer 兩邊會講出互相矛盾的故事。
  同一張「舊 rejected ＋ 新 pending」的訂單：Admin `pending_review` ⟷ Buyer `reviewing`。
- **搜尋 `q`（`IA-06`）** —— 比對**訂單編號**與**買家 Email**（`ILIKE`，大小寫不敏感）。
  客訴進來時 Admin 手上就是這兩樣東西。`%` / `_` 一律跳脫成字面值
  （`utils/adminQuery.js` 的 `toLikePattern()` ＋ SQL 端 `ESCAPE`）——
  否則貼一個含底線的訂單編號會撈出別人的訂單。
  未帶或空字串 → 不篩選；無命中 → 空集合（**不得**退回全部）。
  金額、備註等模糊比對**不在**搜尋面內。
- **分頁（`IA-06`）** —— `page` / `limit` 與 `/admin/materials`、`/admin/payment-proofs`、
  `/admin/activity-logs` 是**同一份契約**（`utils/adminQuery.js`：`page` 1 起算、
  `limit` 預設 20 上限 100）。回應在 `items` 之外**額外**帶 `pagination`
  `{ page, limit, total, totalPages }`，`total` 是**套用 `status` / `q` 之後**的總數。
  count 與 list 共用同一份 `WHERE`，兩者不得各寫一次。
- 排序 `created_at DESC, id DESC`。第二個鍵是分頁的必要條件 ——
  只用 `created_at` 時同秒建立的訂單在相鄰兩頁可能重複或漏掉。
- **既有 caller 不受影響**：Dashboard 的「需要注意的訂單」（§14.4）走的是既有的
  `?status=` canonical 篩選，且它只取前 8 筆，小於預設頁大小。

## 19.4 URL contract

`/admin/orders?status=<token>&q=&page=&limit=` 是清單狀態的**唯一來源**：
篩選鈕、搜尋框、API request、重新整理、書籤同源。前端以 `lib/useListQueryState.ts`
承載（與其他三個 Admin 清單頁**同一個 hook**），因此四頁的 deep link 行為完全相同。
非法 token（例如 `?status=banana`）在前端 fallback 成「全部」，且**不得**被送到 API。
換篩選或換搜尋一律重設 `page` —— 否則會停在一個什麼都沒有的第 5 頁。

## 19.5 用語

Admin surface 一律：`待付款` / `待審核` / `付款被退回` / `已核准` / `已取消`。

- `approved` 在 Admin 是**已核准**（admin 核准的是憑證），不是「已完成」，也不是「已付款」。
- Buyer `/orders` 維持買家視角的「已完成」，**刻意不統一**。
- 不得因為欄位叫 `paid_at` 就在 UI 顯示「已付款」——人工轉帳流程只證明 admin 核准了憑證。

## 19.6 與 Admin Dashboard 的關係

`/admin/payment-proofs` 是**憑證層**的審核佇列；`/admin/orders` 是**訂單層**的營運視圖。兩者並存，不合併。
Dashboard 的「待審核付款憑證」卡片維持指向 `/admin/payment-proofs?status=pending`。

Dashboard 的 `pendingProofsCount` 是 `COUNT(*) FROM manual_payment_proofs WHERE review_status='pending'`，
即**憑證數**；`?status=pending_review` 回的是**訂單數**。一張訂單可有多張 pending 憑證，
因此兩者的關係是 `pendingProofsCount >= pending_review 訂單數`，**不是**恆等。
要不要把 KPI 改成 `COUNT(DISTINCT order_id)` 是獨立的產品決策，本階段不動。

---

# 20. Admin material review queue（`GET /admin/materials`）

## 20.1 狀態有四個

`materials.status` 的 allowlist（canonical：`Backend/utils/materialWorkflow.js`，
DB 端為 `materials_status_check`）是
**`pending_review` / `published` / `changes_requested` / `unpublished`**。

沒有 `draft`、沒有 `rejected`。UI 的 filter 一律對齊這四個值 ——
過去 Creator 側欄有一個 `?status=draft` 的入口，那是一個永遠 0 筆的 dead filter，已移除。

**退回修改的狀態叫 `changes_requested`，不叫 `rejected`**：平台沒有永久拒絕的商業行為，
退回的目的是讓創作者修好後回來。完整狀態機與轉移規則見 `docs/material-review-workflow.md`。

## 20.2 Query contract

| 參數 | 值 | 行為 |
| --- | --- | --- |
| `status` | `pending_review` \| `published` \| `changes_requested` \| `unpublished` \| `all` \| （未帶） | 非法值 → **400** |
| `q` | 自由文字 | 教材標題 / 創作者 email / 教材 id；`%` `_` `\` 會跳脫 |
| `sort` | `created_desc`（預設）\| `created_asc` \| `updated_desc` \| `title_asc` \| `price_desc` | 非法值 → **400**；allowlist 對照表，**不得**字串拼接進 ORDER BY |
| `page` / `limit` | 見 §20.4 | |

## 20.3 Response

```json
{ "items": [...], "pagination": { "page", "limit", "total", "totalPages" },
  "statusCounts": { "total", "pending_review", "published", "changes_requested", "unpublished" } }
```

- `items` 每列除既有欄位外另含 `creator_email` 與 `open_report_count`
  （未結案檢舉數 = `pending` + `investigating` + `awaiting_creator`）。
- **`statusCounts` 是全表計數**，不受 `status` / `q` / 分頁影響。
  需要總數的 caller（Admin Dashboard 的教材 KPI）**必須**讀它，
  不得抓一頁清單再 `filter().length` —— 那在教材超過一頁時會算出錯的數字。

## 20.4 分頁契約（所有 Admin 清單共用）

唯一定義：`Backend/utils/adminQuery.js`。

- `page` 1 起算；非數字／< 1 → 1
- `limit` 預設 20；非數字／< 1 → 20；**上限 100**（硬性）
- UI 每頁筆數選單只提供 `20 / 50 / 100`
- `totalPages` 至少為 1（空清單仍是「第 1 頁」）

`/admin/materials`、`/admin/payment-proofs`、`/admin/report-cases`、`/admin/activity-logs`
四者共用這一份，不得各自實作。

---

---

# 21. 教材上架審核 workflow

**Canonical：** `Backend/utils/materialWorkflow.js`（狀態機、退回原因 allowlist、note 長度）
**完整規格：** `docs/material-review-workflow.md`

## 21.1 合法轉移

| From | To | 執行者 | 入口 |
| --- | --- | --- | --- |
| （新建） | `pending_review` | creator | `POST /materials` |
| `pending_review` | `published` | admin | `POST /admin/materials/:id/approve` |
| `pending_review` | `changes_requested` | admin | `POST /admin/materials/:id/request-changes` |
| `changes_requested` \| `unpublished` | `pending_review` | creator（**擁有者**） | `POST /materials/:id/resubmit` |
| `published` | `unpublished` | admin | **僅** `POST /admin/report-cases/:id/resolve`（`unpublish_material`） |

**禁止（不得繞過正式審核）：** `changes_requested → published`、`unpublished → published`、
`published → changes_requested`。非法轉移一律 **409**。

## 21.2 退回修改的必填規則

`reasonCode` 必填且須來自 allowlist（`incomplete_info` / `media_quality` / `features_mismatch` /
`file_problem` / `ip_concern` / `other`）；`note` 必填且 **trim 後至少 10 字**（以 code point 計）。
非法輸入 → **400**，且**不得**寫入任何資料。

## 21.3 Review snapshot 與 published_at

`materials.review_reason_code` / `review_note` / `reviewed_by` / `reviewed_at` 是
**latest review decision snapshot**，每次決定都會覆寫；**完整歷史在 `activity_logs`**。
核准時會清空 `review_reason_code` / `review_note`。

`published_at` 是**首次**成功公開的時間，只在為 NULL 時寫入；第二次以後的公開時間由
`material.published` 事件保存。**不是 last_published_at。**

## 21.4 下架只有一個入口

`/admin/materials` **不得**提供下架動作。`published → unpublished` 只能經由檢舉處置，
那條路徑必然帶著 `reportId` 與案件歷程。見 `docs/material-review-workflow.md` §9。

---

# 21A. 教材本體檔案與安全交付

**Canonical：** `Backend/services/materialFile.service.js`（授權、指標、下載票）、
`Backend/utils/materialFilePolicy.js`（型別／大小 allowlist）
**完整規格：** `docs/material-file-storage-and-delivery.md`

## 21A.1 四條不可破的不變條件

1. **`pending_file_id` 永遠不是買家可下載的東西。** 買家的交付只看 `approved_file_id`，
   而它**只有** Admin 核准流程會寫。
2. **創作者永遠不能寫 `approved_file_id`。** 創作者的所有動作最多只到候選檔。
3. **買家授權綁定「教材」而不是「版本」。** 買到的是這份教材的最新已核准檔；
   授權查詢**不看 `materials.status`** —— 教材下架不會沒收已付款買家買到的東西。
4. **沒有 `approved_file_id` 的教材不得成為可購買的付費商品。**
   `published` 只代表「通過審核、對外可見」，**不代表交付得出東西**。兩者脫鉤時，
   買家會付完款、通過付款審核，最後在下載才看到「尚未提供可下載檔案」——
   失敗發生在**收款之後**，而且沒有自助補救路徑。

## 21A.1.1 可交付性的三道防線

canonical source：`Backend/utils/materialDeliverability.js`（`isDeliverable()`）。

| # | 位置 | 行為 |
| --- | --- | --- |
| 1 | `POST /admin/materials/:id/approve` | 沒有候選檔也沒有已核准檔時拒絕核准（`candidate_required`，409）。**先前即已存在**（`materialFile.service.js` 的 `promoteCandidate({ requireCandidate: true })`） |
| 2 | `POST /cart/items` | 無 `approved_file_id` 的教材回 **409**，訊息為 `MATERIAL_NOT_DELIVERABLE_MESSAGE` |
| 3 | `POST /orders`（建立訂單的 transaction 內） | 同上回 **409**。這是**唯一**與收款同一個 transaction 的檢查點，也是購物車停留期間教材檔案狀態改變時的最後一道 |

三道是**縱深**而不是三選一：只有 #1 擋不住 legacy 已上架資料，只有 #3 則會讓買家
在結帳最後一步才被擋（等同白填一輪）。

**買家可見面**：`GET /materials/:id` 回傳 `is_purchasable`（布林；`published` ＋ 有
`approved_file_id`）。教材詳情頁據此在**點擊之前**就停用購買 CTA 並說明原因。
該欄位**只回布林值**，不得回傳 `approved_file_id` 本身（見 §21A.1 第 1、2 條）。

**legacy 資料刻意不改**：現存已上架但無檔案的教材**不下架、不回填 DB** ——
`status` 是審核軌跡的一部分，大量回填會抹掉「它曾經通過審核」這件事實。
改成在**販售路徑**上擋住。**既有 entitlement 不受影響**：本不變條件只作用於購買路徑，
不碰下載授權判斷（第 3 條仍然成立）。

## 21A.2 儲存

教材本體存在 `Backend/private-storage/`，**不在** `express.static` 服務範圍內
（`index.js` 只公開 `uploads/`），且已 gitignore。
storage key 由平台產生（`material-files/<uuid>`，無副檔名），
**永不出現在任何 API 回應或 log 中**。

`NODE_ENV=production` + local driver 時，缺少 `MATERIAL_FILE_STORAGE_PATH` 或
`MATERIAL_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true` 一律**啟動失敗**
（與 `JWT_SECRET` 同一種取捨）。

**兩個 driver（`PRE-13`，2026-08-31）。** `PRIVATE_FILE_STORAGE_DRIVER` 接受
`local`（本機開發）與 **`s3`**（production，`DEC-16`）。後者是 generic S3-compatible driver，
**不綁定任何供應商** —— 換供應商是改五個環境變數，不是改程式碼。
兩個 driver 的行為逐項等價（key 產生、SHA-256、Range、不合法 key 拒絕、
namespace 隔離），由 `Backend/tests/privateFileStorageParity.test.js` 以同一組斷言釘住。

`driver=s3` 時：五個 `PRIVATE_FILE_STORAGE_S3_*` 必填值缺任一即**啟動失敗**；
**bucket 必須是 private**（Backend 是唯一授權入口，presigned URL 刻意未實作）；
`PRIVATE_FILE_STORAGE_PATH` 與 `ALLOW_LOCAL_IN_PRODUCTION` 不使用、也不應設定。
上面那條 local fail-closed **未被放寬**。
canonical 見 `docs/material-file-storage-and-delivery.md` §20.2。

## 21A.3 檔案型別與大小

allowlist：`.pdf` `.zip` `.pptx` `.docx` `.xlsx`；上限 `MAX_MATERIAL_FILE_BYTES`（預設 100 MB）。
驗證是**三層**：副檔名 → 宣告 MIME → **magic bytes**。前兩層都由 client 提供，
只有第三層擋得住「把 .exe 改名成 .pdf」。圖片不得作為教材本體。

## 21A.4 換檔規則

| 教材狀態 | 可否更換教材檔案 |
| --- | --- |
| `changes_requested` / `unpublished` | ✅ `POST /materials/:id/file` |
| `pending_review` | ❌ 409 —— 會讓 Admin 正在審的東西在腳下改變 |
| `published` | ❌ 409 —— 等於在買家背後偷換已售出的商品 |

**`published` 教材沒有偷偷回到 `pending_review` 的路徑。**

## 21A.5 核准時的檔案升級

`pending_review → published` 的核准與檔案升級在**同一個 transaction**：
鎖住教材列 → 驗證候選檔 → 舊的已核准檔轉 `superseded` → 候選檔轉 `approved` →
指標交換 → status 變更 → review snapshot。任一步失敗整筆回滾。

**首次核准必須有候選檔**（否則 409 `candidate_required`）；已有已核准檔的教材再次核准時
若沒有新候選檔則保留原檔。

## 21A.6 買家下載

`GET /download/:materialId`（需 JWT）→ 授權後發一次性下載票
`{ signedUrl, expiresInSeconds, filename, sizeBytes }`；
`GET /download/file/:token`（**無 auth**）串流檔案。

票是 crypto-random、只存 SHA-256 雜湊、TTL 5 分鐘、**只能用一次**，
且綁定 userId + materialId + fileId。`signedUrl` 直指 Backend，**不經前端 proxy**。

已購買但教材沒有可下載檔案（含 legacy 教材）→ **409** `material_file_unavailable`
「此教材目前尚未提供可下載檔案。」——**不回 500、不回假 URL、不洩漏路徑**。

---

# 22. Admin activity log search（`GET /admin/activity-logs`）

## 22.1 既有契約不變

`actor_id` / `actor_role` / `action` / `target_type` / `target_id` 的**精確相等**比對全部保留，
scoped 路由（`/admin/users/:id/activity-logs` 等）行為不變。

## 22.2 新增

| 參數 | 說明 |
| --- | --- |
| `q` | 人類可讀搜尋：操作者 email、教材標題、對象 email、訂單編號（`target_id`）、`action` |
| `from` / `to` | `YYYY-MM-DD`，**含當日**（`to` 比對到隔日 00:00 之前）；格式不符一律視為未提供 |

### 22.2.1 `action` 多值（單值語意不變）

`action` 額外接受**逗號分隔多值**（`a,b,c`），語意為聯集（`= ANY(...)`）。

- **單值行為完全不變**：`ANY(ARRAY['x'])` ≡ `= 'x'`，既有 caller 與 Postman 不受影響。
- 空片段（`a,,b`）丟棄、重複值去重。
- **整串為空或只有分隔符 = 未提供（不篩選）**，**不得**變成空集合 ——
  把「沒有篩選」靜默地變成「篩掉全部」是最難察覺的一種錯。
- 其餘 filter 仍是 AND 組合；排序與分頁不受影響（`created_at DESC, id DESC`）。

存在理由是 §14.4 的「需要注意的活動」需要一次取一組 action 的最新 N 筆。
canonical 解析在 `Backend/services/adminActivityLogs.service.js` 的 `parseActionFilter()`。

`q` 同時涵蓋 actor 與 target 兩側：Admin 心裡想的是「這個人做了什麼」或
「這張訂單發生過什麼」，不會先分清楚自己要查的是哪一欄。

每一列另含 `actor_email` 與 `target_label`（教材標題 / 對象 email / 訂單編號），
讓 UI 能組出「管理員 xxx 核准了付款 · 訂單：ord_…」而不是三個 id。

`GET /admin/activity-logs/filters` 回 `{ actions, actorRoles }`（**實際出現過**的值 + 筆數），
供下拉選單使用 —— 硬編清單會在新增 action 後靜靜地漏掉它。

### 22.2.2 `GET /admin/activity-logs/:id` 與列表同形

單筆端點回傳的欄位與列表項目**逐鍵相同** —— 同樣含 `actor_email` / `target_label` /
`order_buyer_email`。

- 這是 **additive**：既有欄位一個都沒有改名或移除，`meta` 仍原封不動；
  404 語意與 `id::text` 比對（UUID／TEXT 為 canonical；BIGSERIAL 舊環境亦以字串對齊）都不變。
- 為什麼必須同形：前端的清單、單筆詳情與三個 entity 紀錄頁用**同一個**顯示層
  formatter（`frontend/apps/web/lib/admin-labels.ts` 的 `describeActivity()`）。
  少了這幾個欄位，同一筆事件在詳情頁只剩下 uuid —— 也就是回到「必須先知道
  內部 id 才看得懂」的狀態。
- canonical 實作是 `Backend/services/adminActivityLogs.service.js` 的 `getLogById()`，
  與 `listLogs()` 共用同一段 `ENRICHED_SELECT` / `serializeRow`。
  route 層**不得**再自己寫一份 SELECT 或 serializer。

---

## 22.3 Audit 能力不減

`activity_logs` 只讀，**不寫、不刪、不改寫**既有列（含 `actor_role` 裡的 legacy `parent`）。
`meta` 原封不動回傳。UI 把 technical metadata 收進每列的「詳細資訊」摺疊區與單筆詳情頁 ——
降低 technical terminology 的 prominence ≠ 移除稽核能力。

**`meta` 的人話化只發生在顯示層。** canonical formatter 是
`frontend/apps/web/lib/admin-labels.ts` 的 `describeActivityMeta()`：

- 它吃**整筆 log**（不只 `meta`），因為同一個 key 在不同 action 下語意不同 ——
  `to` 在 `order_email_*` 是收件者 email、在 `report.*` 是狀態轉移的目標；
  `reason` 在 `download.denied` 是失敗碼、在 `report_created` 是檢舉人打的字。
  只看 key 的 formatter 會在這裡開始說謊。
- **未登記的 key 一律不丟棄**，落到第三層的原始 JSON；未登記的 action 顯示為
  「其他（原始 code）」。查不到對照時**不編造中文**。
- `meta` 為 null／`{}`／非物件時不解讀，也不得讓畫面壞掉。
- **不新增、不改名、不移除任何 audit event 欄位**，也沒有 schema change。

---

# 23. Admin / Creator shell 尺寸（UI 契約）

Canonical 常數：`frontend/apps/web/components/layout/shell-constants.ts`。

| 項目 | 值 | 來源 |
| --- | --- | --- |
| Desktop 側欄寬 | 240px | Tailwind spacing token `layout-sidebar` |
| 主內容左偏移（`lg`） | 240px | 同上，必須與側欄同值 |
| Mobile drawer 寬 | `min(18rem, 85vw)` | 320px 視窗仍留得下可點的遮罩 |

**Shell 尺寸一致，導覽內容可以不同。** Admin 的選項比較多，要靠 spacing / truncation 解決，
不是把 navigation rail 加寬。

Mobile drawer 的行為（hamburger icon、ESC 關閉、背景 scroll lock、focus 管理、overlay、
路由切換自動關閉）由 `components/layout/NavDrawer` **單一實作**提供，Admin 與 Creator 共用。

## 23.1 側欄捲動（曾經的 bug）

可捲動的導覽區必須是 `min-h-0 flex-1 overflow-y-auto`，且**從固定高度容器到它之間的每一層
flex 容器都要能縮小**。

flex item 的 `min-height` 預設是 `auto`（= 內容高度）。Creator 的手機側欄原本是
`<aside class="fixed inset-y-0 w-64">` —— 不是 flex 容器，裡面的 `flex-1 overflow-y-auto`
因此拿不到任何高度約束，捲軸永遠不出現，超出視窗的選項直接點不到。

修法在 shared shell（`NavDrawer` 的面板是 `flex flex-col` + `inset-y-0`），
**不是**在單一頁面補一個 `overflow-y-auto`。
