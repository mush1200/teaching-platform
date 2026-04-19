# Teaching Platform — MVP Spec v1.3

Supersedes v1.2. Aligned with `Backend/models/bootstrapModel.js` (ensureCoreTables + runIdempotentMigrations) and current API behavior.

Architecture: Backend-first  
Database: PostgreSQL  
Auth: JWT  

Identifiers: primary keys are **TEXT** (e.g. `mat_*`, `ord_*`, user ids); amounts on orders use **INTEGER** (`total_amount`, optional `total_price`). **Exception:** `activity_logs.id` is **BIGSERIAL** (see §10); API serializes it as a string in JSON.

---

# 1. Core domain language

material = sellable teaching content (includes `file_key`, optional `category` / `age_range`, IP declaration flags)  
order = transaction container (`status`, `payment_mode`, `total_amount`, timestamps)  
order_item = line item with snapshots (`title_snapshot`, `price_snapshot`, `quantity`, `seller_id`, `subtotal`)  
manual_payment_proof = uploaded payment evidence per order (`proof_url`, `review_status`: pending | approved | rejected)  
review = parent rating/comment per material (at most one row per `(material_id, parent_id)`)  
report = parent-submitted flag on material (`status`: pending | reviewed; admin marking does not imply takedown)  
activity_log = audit row (`target_type`, `target_id`, `action`, `meta` JSONB)

Deprecated naming in prose only: product, purchase.

---

# 2. Roles

teacher · parent · admin  

---

# 3. Material lifecycle

States: `pending_review` · `published` · `unpublished`

Rules:

- **published**: visible to parents (list/detail); may be added to cart if also published in DB.
- **pending_review**: visible to owning teacher and admin only.
- **unpublished**: hidden from parents.

Only **admin** may set `status` on update; teacher edits other fields on own materials.

---

# 4. Order lifecycle (orders.status)

Concrete values used by the backend:

- **pending_payment** — set when an order is created from the cart. Default for new orders.
- **approved** — set when an admin **approves** a pending `manual_payment_proof` for that order.

There is **no** `proof_uploaded` value on `orders`. Uploading proofs inserts rows into `manual_payment_proofs` with `review_status = 'pending'` while the order remains `pending_payment`.

Rejecting a proof (**POST** admin reject) updates only `manual_payment_proofs.review_status` to `rejected`; the **order stays `pending_payment`** until a proof is approved.

Legacy DB values may be normalized at startup (`paid` → `approved`).  

Download is allowed only when `orders.status = approved` and the material appears in `order_items` for that user.

---

# 5. Purchase structure

One order may contain multiple materials via `order_items`.

- Snapshots: `title_snapshot`, `price_snapshot`, `quantity`, `seller_id` (typically material’s teacher), `subtotal`.

---

# 6. Payment proofs (`manual_payment_proofs`)

Stores:

- `order_id`, `proof_url`, `review_status` (pending | approved | rejected), optional `note`, `reviewed_by`, `reviewed_at`, `created_at`, etc.

Admin **approve** on one pending proof sets the order to `approved` and may mark other pending proofs for that order as superseded (rejected) in implementation.

---

# 7. Download authorization

Allowed only if:

- `orders.status = approved`
- AND the material exists in `order_items` for that order and parent (`orders.user_id`).

---

# 8. Material reviews (`review`)

A parent may create/update at most **one** review per material (`UNIQUE (material_id, parent_id)`).

Authorization (enforced in service/repository): there exists an **approved** order for that parent with an `order_item` whose `material_id` matches.

Rating is integer **1–5**; optional `comment`.

---

# 9. Reports (`reports`)

- `material_id`, `reporter_id`, `reason`, `status` (`pending` | `reviewed`).
- At most one report per `(material_id, reporter_id)`.
- Admin may mark a report **reviewed** (`PATCH`), setting `reviewed_at` / `reviewed_by`. This marks admin acknowledgment only, not automatic material removal.

**Parent HTTP (implemented):**

- **POST** `/reports` — JWT + `parent` only; JSON body requires `reason` and material id as **`material_id`** or **`materialId`** (alias). Insert row with `status = pending`; duplicate `(material_id, reporter_id)` → **409** (`Already reported`); missing material → **404**; emits `activity_logs` with `action = report_created`, `target_type = material`, `meta.reason`.

**Admin HTTP (implemented):**

- **GET** `/admin/reports` — JWT + `admin` only; response body is a JSON **array** of report rows. Optional query: `status=pending` or `status=reviewed` (invalid values → 400).
- **PATCH** `/admin/reports/:id` — body must be `{"status":"reviewed"}`; only transition `pending` → `reviewed`; already reviewed → **409**; writes `activity_logs` with `action = report_reviewed` and `meta` containing `{"status":"reviewed"}`.

---

# 10. Audit (`activity_logs`)

Critical paths emit logs. Implemented action strings include (non-exhaustive):

- `material.created`, `material.published`, `material.unpublished`
- `cart.added`, `cart.removed`
- `order_created`, `payment_proof_uploaded`
- `payment_proof.approved`, `payment_proof.rejected`
- `download.attempted`, `download.denied`, `download.allowed`
- `review_created`, `report_created`, `report_reviewed`

Schema: `target_type`, `target_id`, `action`, `meta` JSONB, timestamps; `id` is BIGSERIAL.

**Admin read API (JWT + role `admin` only):**

| Method | Path | Notes |
|--------|------|--------|
| GET | `/admin/activity-logs` | Filters: `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `page`, `limit` (max 100). Order: `created_at DESC`. |
| GET | `/admin/activity-logs/:id` | Single row by primary key string (same as list item `id`; supports bigint serial or UUID/text depending on schema). |
| GET | `/admin/users/:userId/activity-logs` | `actor_id = userId`; `page`, `limit`. |
| GET | `/admin/materials/:materialId/activity-logs` | `target_type = material` and `target_id = materialId`; `page`, `limit`. |
| GET | `/admin/orders/:orderId/activity-logs` | `target_type = order` and `target_id = orderId`; `page`, `limit`. |

List response: `{ "items": [...], "pagination": { "page", "limit", "total" } }`. Item `id` is returned as a string. Unauthorized → 401; non-admin → 403.

---

# 11. HTTP API reference（完整路由表）

Below matches `Backend/index.js` and route modules. **Auth** abbreviations: **—** = no token; **JWT** = `Authorization: Bearer <token>`; **JWT (role)** = JWT plus stated role(s). Unless noted, invalid/missing JWT → **401**, wrong role → **403**.

### Core

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/health` | — | Liveness; `{ "status": "ok" }`. |

### Auth (`/auth`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/auth/register` | — | Body: `email`, `password`, `role` (`teacher` \| `parent` \| `admin`). **201** → `{ token, user }`. Duplicate email **409**. |
| POST | `/auth/login` | — | Body: `email`, `password`. **200** → `{ token, user }`. Bad creds **401**. |
| GET | `/auth/me` | JWT | Current user profile. |

### Materials (`/materials`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/materials` | Optional JWT | List: anonymous sees **published** only; **teacher** sees own + published; **admin** sees all. Query none. |
| GET | `/materials/:id/reviews` | — | Public list of reviews for material. |
| GET | `/materials/:id/rating` | — | Aggregate rating stats for material. |
| GET | `/materials/:id/reports` | JWT (**admin**) | Reports for one material (`id` = material id). |
| GET | `/materials/:id` | Optional JWT | Detail: **published** OR owner **teacher** OR **admin**; else **403**. Not found **404**. |
| POST | `/materials` | JWT (**teacher**) | Create material (starts `pending_review`). Body requires `title`, `price`, `fileKey`, `ipDeclarationAccepted: true`, etc. |
| PUT | `/materials/:id` | JWT (**teacher** owner or **admin**) | Update fields; **only admin** may send `status`. |

### Cart (`/cart`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/cart` | JWT | List current user’s cart rows (joins material title/price/status). |
| POST | `/cart/items` | JWT | Body: `materialId`, optional `quantity`. Material must be **published**. Upserts quantity. |
| DELETE | `/cart/items/:id` | JWT | Deletes row if it belongs to the user. **404** if not found. |

### Orders (`/orders`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/orders` | JWT (**parent**) | Creates order from cart (empties cart path in service). Empty cart **400**; unavailable material **409**. |
| GET | `/orders/my` | JWT | Lists orders for `req.user`. |
| POST | `/orders/:id/upload-proof` | JWT | Body: `proofUrl`. Order must exist, `user_id` must match caller, status `pending_payment`. Inserts `manual_payment_proofs` pending row. |

### Reviews (`/reviews`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/reviews` | JWT (**parent**) | Body: `material_id` or `materialId`, `rating` (1–5), optional `comment`. Purchase entitlement enforced in service. |

### Me (`/me`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/me/reviews` | JWT | Lists reviews authored by current user (service-shaped rows). |

### Reports (`/reports`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/reports` | JWT (**parent**) | Body: `material_id` or `materialId`, `reason`. Duplicate `(material_id, reporter_id)` **409**. |

### Download (`/download`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/download/:materialId` | JWT | Requires approved order containing material for buyer; **403** `No download permission` otherwise. Returns mock `signedUrl` payload. |

### Admin — operations (`/admin`, `routes/admin.js`)

All routes below: **JWT + admin**. Non-admin **403**.

| Method | Path | Summary |
|--------|------|---------|
| GET | `/admin/materials` | All materials (admin list columns). |
| GET | `/admin/orders` | All orders; optional query `status` (e.g. `pending_payment`, `approved`). |
| POST | `/admin/payment-proofs/:id/approve` | Approve pending proof; may set order `approved`; supersede other pending proofs. Body optional `note`. |
| POST | `/admin/payment-proofs/:id/reject` | Reject pending proof; body **`note` required**. Order status unchanged. |
| GET | `/admin/reports` | Array of reports; optional `status=pending` or `reviewed` (invalid → **400**). |
| GET | `/admin/materials/:materialId/reports` | Same idea as material-scoped reports list. |
| PATCH | `/admin/reports/:id` | Body `{ "status": "reviewed" }`; pending → reviewed only; duplicate transition **409**. |

### Admin — audit logs (`/admin`, `routes/adminActivityLogs.js`)

All routes below: **JWT + admin**.

| Method | Path | Summary |
|--------|------|---------|
| GET | `/admin/activity-logs` | Paginated audit list; filters: `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `page`, `limit` (max 100). |
| GET | `/admin/activity-logs/:id` | Single log row by id string (matches list item `id`). |
| GET | `/admin/users/:userId/activity-logs` | Logs where `actor_id = userId`; `page`, `limit`. |
| GET | `/admin/materials/:materialId/activity-logs` | Logs with `target_type = material` and `target_id = materialId`; `page`, `limit`. |
| GET | `/admin/orders/:orderId/activity-logs` | Logs with `target_type = order` and `target_id = orderId`; `page`, `limit`. |

---

**Routing note:** `materials` router registers static segments (`/:id/reviews`, `/:id/rating`, `/:id/reports`) before `/:id` so paths resolve correctly.
