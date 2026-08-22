# MVP Rules

# A. Frontend data source policy

**UI 工程約定（非 API）：** `docs/frontend-ui-architecture.md` · **Design tokens：** `docs/design-tokens-v1.1.md`

所有「頁面資料內容」必須以後端 API 為唯一資料來源：

- 可渲染為卡片/清單/統計/詳情的資料，不得由前端 hardcode 或 localStorage mock 直接供應。
- 前端可保留純展示文案（標題、提示語、按鈕文案），但不得保留可被誤認為業務資料的假內容。
- API 失敗時應顯示錯誤或空狀態，不得退回前端假資料。
- 收藏、購物車、回饋摘要、後台 KPI 等使用者/交易資料必須走後端儲存與查詢。

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

access admin-only report moderation endpoints (**GET** `/admin/reports`, **GET** `/admin/materials/:materialId/reports`, **PATCH** `/admin/reports/:id`, **GET** `/materials/:id/reports` — admin JWT only)

---

Admin:

change material status (publish / unpublish)
list and act on payment proofs (approve / reject proof)
view reports; mark report as reviewed
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

published:

visible to parents (and in public list when not scoped to teacher)

pending_review:

visible only to teacher and admin

unpublished:

hidden from parents

---

# 4. Material create/update payload（teaching product spec）

`POST /materials`（teacher）與 `PUT /materials/:id` 目前支援下列教學商品欄位：

- 基本：`title`、`price`、`file_key`（也接受 alias: `fileKey`）
- 教學資訊：`teaching_objective`、`teaching_methods`（array）、`usage_duration`、`activity_steps`
- 建議填寫（非必填）：`age_range`、`extension_value`、`short_description`
- 內容清單：`contents[]`（每筆含 `type`、`name`、可選 `count`、`description`）

Create 時必填/驗證：

- `title` 不可空
- `price > 0`
- `file_key` 不可空
- `ipDeclarationAccepted` 必須為 `true`
- `teaching_objective` 不可空
- `teaching_methods` 必須存在，長度 `>=1` 且 `<=4`，每筆不可空字串
- `usage_duration` 不可空
- `activity_steps` 不可空
- `contents` 至少 1 筆；每筆 `type`、`name` 必填；`count` 若提供需 `> 0`

Update 時：

- 仍只有 admin 可改 `status`
- 若 body 含 `contents`，以該陣列整批覆蓋（replace）`material_contents` 舊資料
- 送入 `price` 時必須 `> 0`

`GET /materials/:id` 會回傳 `materials` 主表欄位，並附上 `contents`（依 `sort_order` 升冪）。

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
| `reviewed` | **legacy** —— 舊版「標記已讀」的終態 |

允許的轉移（其餘一律 409）：

```text
pending          → investigating | awaiting_creator | resolved | dismissed | reviewed(legacy)
investigating    → awaiting_creator | resolved | dismissed
awaiting_creator → investigating（創作者已回覆）| resolved | dismissed
resolved / dismissed / reviewed → （終態）
```

**`reviewed` 保留且不回填。** `PATCH /admin/reports/:id { status: "reviewed" }` 仍然可用；
既有列反映的是「當時只做了標記已讀」，改寫成 `resolved` 會讓它與真正做過處置的案件無法區分。

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
| `GET` | `/admin/reports` | **legacy**：裸陣列，`?status=pending\|reviewed`。形狀不變 |
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

## 6.5 目前沒有的能力（需產品決策）

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
- `GET /admin/activity-logs/:id` — 單筆；路徑 `:id` 須與列表項目 `id` 一致（canonical schema 為 `activity_logs.id` BIGSERIAL 之字串；若部署環境將該欄設為 UUID／TEXT，亦同左對齊）。
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

**教材狀態稽核（`material.published` / `material.unpublished`）：** 僅在**更新後**的 `materials.status` 分別為 `published` 或 `unpublished`（且與更新前不同）時寫入對應 action。僅轉成 `pending_review` 等情況**不**借 `material.unpublished` 之名寫入。

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
  - 憑證：`id`、`proof_url`、`proof_mime_type`、`proof_size_bytes`、`original_filename`、
    `review_status`、`uploaded_at`、`created_at`、`reviewed_at`、`reviewed_by`、`reviewed_by_email`、
    `note`、`rejection_reason`
  - 訂單：`order_id`、`user_id`、`buyer_email`、`order_status`、`order_total_amount`、
    `order_total_price`、`order_discount_amount`、`order_promo_code`、`order_payment_mode`、
    `order_created_at`、`order_paid_at`、`order_payment_due_at`、`order_proof_count`
- `pagination`: `{ page, limit, total, totalPages }`
- `statusCounts`: `{ total, pending, approved, rejected }` —— **全表**計數，不受 `status` / `q` / 分頁影響

`order_payment_due_at` 是**衍生值**（`orders.created_at + PAYMENT_DUE_DAYS`，目前 3 天），
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
- 買家在 `GET /me/orders/:orderId` 取得 `payment_proof_rejected_reason`（code）與
  既有的 `payment_proof_rejected_note`。文案對照：Backend `REJECTION_REASON_TEXT`（通知信）、
  Web `lib/admin-labels.ts`（畫面）—— 兩邊都由同一組 code 驅動。

## 12.3 目前**沒有**的付款申報欄位

`POST /orders/:id/payment-proof` 只收檔案（`multer.array('proofs')`）：**沒有**付款日期、
匯款金額、帳號末碼、付款人姓名，`manual_payment_proofs` 也沒有對應 column。
Admin UI 因此不顯示「使用者付款申報」區塊 —— 要補這些欄位需先改買家端上傳流程與 schema，
屬獨立的產品決策。

錯誤：

- `400`: `status` 非法（僅允許 pending|approved|rejected）；或 reject 缺少／非法 `rejection_reason`
- `401`: 未登入
- `403`: 非 admin
- `404`: 憑證不存在（`/admin/payment-proofs/:id`）
- `500`: server error

---

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

## 14.4 Latest-N feed

「最近訂單」「最近活動」是平台最新 N 筆的 latest-N feed，不是期間聚合，前端不得再另做日期過濾。

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
| Latest-N feed | 最近訂單、最近活動 |

UI 上期間選擇器必須放在「本期表現」區塊標題列，**不得**放成看似控制整頁的 global toolbar。待辦被期間濾掉不代表已處理完，會導致漏處理。

`GET /admin/orders`、`GET /admin/activity-logs` **不得**為了 dashboard 的 recent feed 加上 `from` / `to`。

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

- 切換期間時**只有** period metrics 進入 loading；待處理卡、平台摘要、最近訂單／活動不得重新 skeleton，與期間無關的端點也不得重新請求。
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
Refund / reversal                                → 不存在
```

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
  `payment_proof_latest_status`。
- Latest proof 一律以 `ORDER BY COALESCE(uploaded_at, created_at) DESC, id DESC LIMIT 1` 判定 ——
  資料庫存在 `uploaded_at IS NULL` 的舊憑證，只用 `uploaded_at` 會把它們排到最後。
- 排序 `created_at DESC`；本階段無分頁、無搜尋。

## 19.4 URL contract

`/admin/orders?status=<token>` 是篩選狀態的**唯一來源**：dropdown、API request、重新整理、書籤同源。
非法 token（例如 `?status=banana`）在前端 fallback 成「全部」，且**不得**被送到 API。

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

## 20.1 狀態只有三個

`materials.status` 的 allowlist（`Backend/routes/materials.js`）是
**`pending_review` / `published` / `unpublished`**。

沒有 `draft`、沒有 `rejected`、沒有 `needs_revision`。UI 的 filter 一律對齊這三個值 ——
過去 Creator 側欄有一個 `?status=draft` 的入口，那是一個永遠 0 筆的 dead filter，已移除。

## 20.2 Query contract

| 參數 | 值 | 行為 |
| --- | --- | --- |
| `status` | `pending_review` \| `published` \| `unpublished` \| `all` \| （未帶） | 非法值 → **400** |
| `q` | 自由文字 | 教材標題 / 創作者 email / 教材 id；`%` `_` `\` 會跳脫 |
| `sort` | `created_desc`（預設）\| `created_asc` \| `updated_desc` \| `title_asc` \| `price_desc` | 非法值 → **400**；allowlist 對照表，**不得**字串拼接進 ORDER BY |
| `page` / `limit` | 見 §20.4 | |

## 20.3 Response

```json
{ "items": [...], "pagination": { "page", "limit", "total", "totalPages" },
  "statusCounts": { "total", "pending_review", "published", "unpublished" } }
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

# 21. Admin activity log search（`GET /admin/activity-logs`）

## 21.1 既有契約不變

`actor_id` / `actor_role` / `action` / `target_type` / `target_id` 的**精確相等**比對全部保留，
scoped 路由（`/admin/users/:id/activity-logs` 等）行為不變。

## 21.2 新增

| 參數 | 說明 |
| --- | --- |
| `q` | 人類可讀搜尋：操作者 email、教材標題、對象 email、訂單編號（`target_id`）、`action` |
| `from` / `to` | `YYYY-MM-DD`，**含當日**（`to` 比對到隔日 00:00 之前）；格式不符一律視為未提供 |

`q` 同時涵蓋 actor 與 target 兩側：Admin 心裡想的是「這個人做了什麼」或
「這張訂單發生過什麼」，不會先分清楚自己要查的是哪一欄。

每一列另含 `actor_email` 與 `target_label`（教材標題 / 對象 email / 訂單編號），
讓 UI 能組出「管理員 xxx 核准了付款 · 訂單：ord_…」而不是三個 id。

`GET /admin/activity-logs/filters` 回 `{ actions, actorRoles }`（**實際出現過**的值 + 筆數），
供下拉選單使用 —— 硬編清單會在新增 action 後靜靜地漏掉它。

## 21.3 Audit 能力不減

`activity_logs` 只讀，**不寫、不刪、不改寫**既有列（含 `actor_role` 裡的 legacy `parent`）。
`meta` 原封不動回傳。UI 把 technical metadata 收進每列的「詳細資訊」摺疊區與單筆詳情頁 ——
降低 technical terminology 的 prominence ≠ 移除稽核能力。

---

# 22. Admin / Creator shell 尺寸（UI 契約）

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

## 22.1 側欄捲動（曾經的 bug）

可捲動的導覽區必須是 `min-h-0 flex-1 overflow-y-auto`，且**從固定高度容器到它之間的每一層
flex 容器都要能縮小**。

flex item 的 `min-height` 預設是 `auto`（= 內容高度）。Creator 的手機側欄原本是
`<aside class="fixed inset-y-0 w-64">` —— 不是 flex 容器，裡面的 `flex-1 overflow-y-auto`
因此拿不到任何高度約束，捲軸永遠不出現，超出視窗的選項直接點不到。

修法在 shared shell（`NavDrawer` 的面板是 `flex flex-col` + `inset-y-0`），
**不是**在單一頁面補一個 `overflow-y-auto`。
