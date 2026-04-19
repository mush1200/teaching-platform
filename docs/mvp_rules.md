# MVP Rules

# 0. 資料庫連線

本機開發時以環境變數設定（例如 `Backend` 目錄的 `.env` 或 `DATABASE_URL` / `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`），**不要**在版控文件內寫入實際密碼。

---

# 1. Authentication

JWT required for protected routes.

---

# 2. Role boundaries

Teacher:

create material
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

access admin-only report moderation endpoints (**GET** `/admin/reports`, **PATCH** `/admin/reports/:id`)

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

approved order exists for parent
AND material appears in order_items for that order

DENY if:

not purchased / no matching approved order_item
order not approved
duplicate review for same material (unique constraint)

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
- `review_created`、`report_created`、`report_reviewed`

（歷史資料若略有別名，仍以資料庫實際 `action` 為準；新開發請沿用上列。）

---

# 9. HTTP API 一覽

完整 HTTP 路由表（方法、路徑、認證／角色與簡述）見 **`docs/teaching-platform-mvp-spec-v1.3.md` 第 11 節**（HTTP API reference）。與後端不一致時以 `Backend/` 路由實作為準。
