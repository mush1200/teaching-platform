# MVP Rules

# 0. 資料庫連線

本機開發時以環境變數設定（例如 `Backend` 目錄的 `.env` 或 `DATABASE_URL` / `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`），**不要**在版控文件內寫入實際密碼。

---

# 1. Authentication

JWT required for protected routes.

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

---

# 3. Material visibility rules

published:

visible to parents (and in public list when not scoped to teacher)

pending_review:

visible only to teacher and admin

unpublished:

hidden from parents

---

# 4. Order and payment state

**Order (`orders.status`)**

- `pending_payment` — after checkout; remains while proofs are only uploaded.
- `approved` — after admin approves a **pending** `manual_payment_proofs` row for that order.

**Not used on the order row:** `proof_uploaded` (proofs are tracked on `manual_payment_proofs`).

**Payment proof (`manual_payment_proofs.review_status`)**

- `pending` | `approved` | `rejected`
- Rejecting a proof does **not** change `orders.status` (order may stay `pending_payment`).

**Allowed admin path to paid order:** at least one proof is approved while order is `pending_payment` → order becomes `approved`.

**Not allowed:** approve an order that is already `approved` via the same flow; skip proof review.

---

# 5. Report lifecycle (`reports.status`)

- `pending` — created by parent.
- `reviewed` — admin acknowledged (PATCH); does not imply material takedown.

Same reporter cannot submit duplicate reports for the same material (`UNIQUE (material_id, reporter_id)`).

---

# 6. Download authorization rule

ALLOW if:

approved order (`orders.status = approved`)
AND order_item exists for that material and buyer

DENY if:

not owner
order not approved
material not in order
material not found

---

# 7. Review authorization rule

ALLOW if:

at least one **approved** order exists for the parent **and** that order’s `order_items` include the target `material_id` (entitlement is an **existence** check—any qualifying order counts; a **separate** `pending_payment` order for the same material does **not** remove this entitlement).

DENY if:

no such approved purchase (no approved order whose `order_items` include this `material_id`)
duplicate review for same material (unique constraint; a second **POST** returns **409**; MVP has no separate “update review” endpoint)

---

# 8. Activity log actions & admin audit API

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

# 9. HTTP API 一覽

完整 HTTP 路由表（方法、路徑、認證／角色與簡述）見 **`docs/teaching-platform-mvp-spec-v1.3.md` 第 11 節**（HTTP API reference）。**實作須與本檔、`docs/teaching-platform-mvp-spec-v1.3.md`、`db/db_schema.sql` 對齊；三者為準，程式應修正至一致（更新 canonical 段落須依專案同意流程）。**

---

# 10. Swagger / OpenAPI 文件規則

- 後端啟動後需提供 Swagger UI：`GET /api-doc`。
- 需同步提供 OpenAPI JSON：`GET /api-doc.json`。
- Swagger 文件必須覆蓋目前已開發之所有 HTTP API（參考第 9 節與 spec 第 11 節）。
- 每個 API 至少需包含：
  - `summary` 與 `description` 的中英文敘述
  - request 參數/Body 定義
  - success/error response 與狀態碼
  - response schema 欄位型別與範例（供前端直接對接）
