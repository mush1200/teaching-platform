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

# 8. Activity log actions (implemented)

material.created
material.published
material.unpublished

cart.added
cart.removed

order_created
payment_proof_uploaded
payment_proof.approved
payment_proof.rejected

download.attempted
download.denied
download.allowed

review_created
report_created
report_reviewed
