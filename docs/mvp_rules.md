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

**Order (`orders.status`)**

- `pending_payment` — after checkout; remains while proofs are only uploaded.
- `approved` — after admin approves a **pending** `manual_payment_proofs` row for that order.

**Parent APIs (`GET /orders/my`, `GET /orders/:id`):** Each order JSON includes **`payment_proof_pending_review_count`** (integer) — number of `manual_payment_proofs` rows for that order with `review_status = 'pending'` (awaiting admin). Frontend uses this to distinguish 「待上傳憑證」vs「審核中」while `orders.status` stays `pending_payment`.

**Not used on the order row:** `proof_uploaded` (proofs are tracked on `manual_payment_proofs`).

**Payment proof (`manual_payment_proofs.review_status`)**

- `pending` | `approved` | `rejected`
- Rejecting a proof does **not** change `orders.status` (order may stay `pending_payment`).

**Allowed admin path to paid order:** at least one proof is approved while order is `pending_payment` → order becomes `approved`.

**Not allowed:** approve an order that is already `approved` via the same flow; skip proof review.

---

# 6. Report lifecycle (`reports.status`)

- `pending` — created by parent.
- `reviewed` — admin acknowledged (PATCH); does not imply material takedown.

Same reporter cannot submit duplicate reports for the same material (`UNIQUE (material_id, reporter_id)`).

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

回傳：

- `items`: 付款憑證列（`id`、`order_id`、`user_id`、`order_status`、`proof_url`、`review_status`、`uploaded_at`、`created_at`、`reviewed_at`、`reviewed_by`、`note`）
- `pagination`: `{ page, limit, total, totalPages }`

錯誤：

- `400`: `status` 非法（僅允許 pending|approved|rejected）
- `401`: 未登入
- `403`: 非 admin
- `500`: server error

---

# 13. Teacher sales analytics + parent order detail（新增）

新增 teacher 銷售統計 API（皆需 JWT，且角色為 teacher）：

- `GET /teacher/sales/summary`
  - query（optional）：`status`、`from`、`to`
  - 回傳：`totalSoldUnits`、`totalRevenue`、`totalOrders`、`materialsCount`、`trend[]`
- `GET /teacher/sales/materials`
  - query（optional）：`status`、`from`、`to`、`search`、`page`、`limit`
  - 回傳：`{ items, pagination }`，`items` 以教材維度聚合（`materialId`、`title`、`soldUnits`、`revenue`、`lastSoldAt`）
- `GET /teacher/sales/records`
  - query（optional）：`status`、`materialId`、`from`、`to`、`page`、`limit`
  - 回傳：`{ items, pagination }`，`items` 為成交明細（`orderId`、`orderItemId`、`materialId`、`materialTitle`、`quantity`、`unitPrice`、`subtotal`、`buyerId`、`orderStatus`、`createdAt`、`paidAt`）

資料範圍規則：

- 僅統計 `order_items.seller_id = 當前 teacher userId` 之資料。
- `summary` 與 `materials` 若未指定 `status`，預設採成交口徑（`approved`，並相容歷史資料中的 `completed`）。
- `records` 若未指定 `status` 或 `status=all`，預設採成交口徑（`approved`，並相容歷史資料中的 `completed`）。

新增 parent / admin 訂單詳情 API：

- `GET /orders/:id`（需 JWT）
- 權限：order owner（parent）或 admin 可查看；其他角色/非本人回 `403`
- 回傳：`{ order, items }`
  - `order`：單筆訂單主檔（同 `/orders/my` 欄位族群）
  - `items`：`order_items` 明細（`id`、`order_id`、`material_id`、`material_title`、`quantity`、`unit_price`、`subtotal`）
