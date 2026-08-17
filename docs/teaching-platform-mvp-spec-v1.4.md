# Teaching Platform — MVP Spec v1.4

Supersedes v1.3. Aligned with `Backend/models/bootstrapModel.js` (ensureCoreTables + runIdempotentMigrations) and current API behavior.

**Document note (2026-05-08):** Checkout + payment-proof + order-progress experience has been upgraded to production-style MVP:
- Stepper checkout with promo/invoice data persistence
- payment-proof progress timeline
- order detail timeline with canonical backend `order_progress_state`
- proof upload idempotency protection (`x-idempotency-key`)
- transactional emails + activity logs for email success/failure
- payment-proof page layout finalized as two-column desktop: left (`order info + payment proof upload`), right (`order status timeline`)
- timeline icons finalized with Lucide icon system (no emoji)

**Document note (2026-05-08):** Materials feedback UX and E2E artifact policy aligned with current frontend:
- materials detail page is product-focused and only **displays** teaching feedback
- `/materials/:id/reviews` is read-only list view (no submit form)
- feedback submission entry moved to **`/me/materials`** via "分享教學回饋" (current page: `/me/materials/:id/feedback`)
- UI naming uses **「教學回饋」** consistently
- Playwright default output is terminal-only (`reporter: list`); `screenshot/trace/video` are all `off` (no automatic `playwright-report` / `test-results` artifacts)

**Document note (2026-05-08):** Frontend page data is now backend-driven:
- Removed frontend mock-data/localStorage fallback as page content source.
- Detail/Explore/Home/Favorites/Cart/Checkout/Admin dashboard now render from backend APIs.
- API additions: `GET /materials/:id/rating-distribution`, `GET /admin/dashboard/summary`, `GET|POST|DELETE /me/favorites`.

**Document note (2026-05-09):** Buyer desktop sidebar UX documented and aligned with implementation:
- Expanded `240px` / collapsed `72px` icon rail (`ParentAppShell` + `Sidebar.tsx`)
- Single header toggle (expand: logo hover/click; collapse: chevron-left); no footer `...` expand
- Auto-collapse on `/materials/:id`; preference `localStorage` key `tp-sidebar-collapsed`
- Spec: `docs/buyer-sidebar-ui-spec.md`

**Document note (2026-05-03):** §11 `GET /materials` row and routing note updated to match implemented **list quality score** ordering and **ignored query string**; see `docs/materials-detail-spec.md` §10.

Supplemental feature spec for materials domain: `docs/materials-detail-spec.md`.

**Frontend UI (engineering, non-API):** Component layering, `ds` vs `edu` tokens, `Card` / `SurfaceCard` usage, and `Button` intent conventions are defined in `docs/frontend-ui-architecture.md`. Token values: `docs/design-tokens-v1.1.md`. Per-page intent mapping: `docs/page-token-usage-mapping-v1.1.md`. Buyer desktop sidebar (expand/collapse): `docs/buyer-sidebar-ui-spec.md`.

Architecture: Backend-first  
Database: PostgreSQL  
Auth: JWT  

Identifiers: primary keys are **TEXT** (e.g. `mat_*`, `ord_*`, user ids); amounts on orders use **INTEGER** (`total_amount`, optional `total_price`). **Exception:** `activity_logs.id` is **BIGSERIAL** (see §10); API serializes it as a string in JSON.

---

# 1. Core domain language

material = sellable teaching content (includes `file_key`, `cover_image_url`, optional `demo_video_url`, `teaching_objective`, `teaching_methods`, `usage_duration`, `activity_steps`, optional `category` / `age_range` / `extension_value` / `short_description`, IP declaration flags)  
material_image = detail image row for one material (`image_url`, optional `alt_text`, `sort_order`; does not store cover image)  
material_content = itemized teaching assets of one material (`type`, `name`, optional `count`, `description`, with `sort_order`)  
user_favorite = parent/admin/teacher self-owned favorite relation (`user_id`, `material_id`, unique per pair)  
order = transaction container (`status`, `payment_mode`, `total_amount`, `promo_code`, `discount_amount`, `invoice_type`, `invoice_carrier`, timestamps)  
order_item = line item with snapshots (`title_snapshot`, `price_snapshot`, `quantity`, `seller_id`, `subtotal`)  
manual_payment_proof = uploaded payment evidence image per order (`proof_url`, `proof_mime_type`, `proof_size_bytes`, `original_filename`, `review_status`: pending | approved | rejected)  
review = parent rating/comment per material (at most one row per `(material_id, parent_id)`; MVP exposes **POST** create only — duplicate **409**; no separate update endpoint)  
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

**POST /materials (create):** request body must **not** include `status` (**400** if present). New rows always start as `pending_review` (same as DB default).

**Create validation (implemented):**

- required: `title`, `price` (`> 0`), `file_key` (alias `fileKey`), `teaching_objective`, `teaching_methods`, `usage_duration`, `activity_steps`, `contents`
- required: `cover_image_url` (alias `coverImageUrl`) and it must be a valid URL
- required: `material_features` (alias `materialFeatures`) — **array**, at least **1** item; every value must come from the material features allowlist (`Backend/constants/materialFeatures.js`, mirrored at `frontend/apps/web/src/constants/materialFeatures.ts`; see `docs/material-features-system-spec-mvp-v1.0.md`). Invalid value → **400** `invalid material feature: <value>`
- `teaching_methods`: array length `1..4`, empty strings are rejected
- `contents`: at least one row; each row requires `type` + `name`; `count` if provided must be `> 0`
- optional: `detail_images` (alias `detailImages`), each `image_url` is required and must be valid URL
- optional: `demo_video_url` (alias `demoVideoUrl`) must be valid URL if provided

**Media URLs (teacher):** the web app uploads files with **POST /teacher/uploads/material-media** (`multipart/form-data`, field `file`, query `kind=cover|detail|demo`) and stores the returned **`url`** in `cover_image_url`, `detail_images`, or `demo_video_url`. The API still validates **http(s) URL strings** only. In production, set **PUBLIC_BACKEND_URL** (or **API_PUBLIC_URL**) on the backend so returned URLs match the public host.

**Detail payload (`GET /materials/:id`):** returns material fields plus `contents[]`, sourced from `material_contents` and ordered by `sort_order ASC`.

---

# 4. Order lifecycle (orders.status)

Concrete values used by the backend:

- **pending_payment** — set when an order is created from the cart. Default for new orders.
- **approved** — set when an admin **approves** a pending `manual_payment_proof` for that order.

Compatibility note: some analytics/reporting queries may include legacy/deployed rows with `completed`. Canonical create/update flow uses `pending_payment` and `approved`.

There is **no** `proof_uploaded` value on `orders`. Uploading proofs inserts rows into `manual_payment_proofs` with `review_status = 'pending'` while the order remains `pending_payment`.

For UI/state consistency, API now exposes **derived** `order_progress_state`:

- `pending` — order created, no proof uploaded yet
- `proof_uploaded` — proof exists (non-pending historical state)
- `reviewing` — latest/active proof is pending review
- `approved` — order approved and downloadable
- `rejected` — latest proof rejected; order stays `pending_payment`

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

- `order_id`, `proof_url`, `proof_mime_type`, `proof_size_bytes`, `original_filename`, `review_status` (pending | approved | rejected), optional `note`, `reviewed_by`, `reviewed_at`, `created_at`, etc.
- Upload constraints: image only (`JPG`/`JPEG`/`PNG`/`WEBP`), max **10MB per file**, max **3 files per order**.
- Canonical upload endpoint: `POST /orders/:id/payment-proof` (legacy alias kept: `POST /orders/:id/upload-proof`).
- Client may pass `x-idempotency-key` to prevent duplicate uploads from repeated clicks/retries. Replayed key for same user/order is safely ignored.
- Frontend payment-proof page uses **status timeline** (not stepper) and separates:
  - order info / bank transfer info / upload form (left)
  - order timeline tracker (right)

Admin **approve** on one pending proof sets the order to `approved` and may mark other pending proofs for that order as superseded (rejected) in implementation.

---

# 7. Download authorization

Allowed only if:

- `orders.status = approved`
- AND the material exists in `order_items` for that order and parent (`orders.user_id`).

---

# 8. Material teaching feedback (`review`)

At most **one** review row per `(material_id, parent_id)` (`UNIQUE` constraint). The MVP backend exposes **POST** `/reviews` to **create** only; a second create for the same pair returns **409** (`already reviewed`). There is **no** separate update-review endpoint in this MVP.

Frontend UX policy:
- Detail page (`/materials/:id`) shows **"教師與家長回饋"** section as social proof only.
- Full list page (`/materials/:id/reviews`) is display-only.
- Submission UI is moved to purchased-library flow (`/me/materials/:id/feedback`).

Authorization (enforced in service/repository): **`EXISTS` at least one `approved` order for that parent** whose `order_items` include the requested `material_id` (this is **not** tied to “the” active cart/checkout order—another concurrent order may remain `pending_payment`).

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
- **GET** `/admin/materials/:materialId/reports` — JWT + `admin` only; JSON **array** of report rows for that material (same columns as `/admin/reports`). Optional query: `status=pending` or `status=reviewed` (invalid values → 400).
- **GET** `/materials/:id/reports` — JWT + **admin** only; `:id` is material id. Same columns and optional `status` filter as **`GET /admin/materials/:materialId/reports`** (invalid `status` → **400**).
- **PATCH** `/admin/reports/:id` — body must be `{"status":"reviewed"}`; only transition `pending` → `reviewed`; already reviewed → **409**; writes `activity_logs` with `action = report_reviewed`, `target_type = report`, `target_id` set to that report’s id, and `meta` containing `{"status":"reviewed"}`. (**POST** `/reports` emits **`report_created`** with `target_type = material` and the material id as `target_id`.)

---

# 10. Audit (`activity_logs`)

Critical paths emit logs. Implemented action strings include (non-exhaustive):

- `material.created`, `material.published`, `material.unpublished`
- `cart.added`, `cart.removed`
- `order_created`, `payment_proof_uploaded`
- `payment_proof.approved`, `payment_proof.rejected`
- `download.attempted`, `download.denied`, `download.allowed`
- `review_created`, `report_created`, `report_reviewed`
- `order_email_sent`, `order_email_failed` (meta.type: `order_created` | `proof_uploaded` | `payment_approved` | `payment_rejected`)

**Material status actions:** `material.published` is emitted only when an update sets `status` to **`published`** (changed from prior value). `material.unpublished` only when the new `status` is **`unpublished`**. (For example, moving to `pending_review` does **not** emit `material.unpublished`.)

**Cart:** `cart.added` is emitted both when inserting a new cart line and when upserting quantity on an existing `(user_id, material_id)` row; upsert responses may include `meta.upserted: true` in activity logs.

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
| POST | `/auth/register` | — | Body: `email`, `password`, `role` (`teacher` \| `parent` \| `buyer`). **201** → `{ token, user }`. Duplicate email **409**. `role: "admin"` → **403** (admin 不可經公開註冊建立；見 `docs/mvp_rules.md` §2)。其他非法 role → **400**. |
| POST | `/auth/login` | — | Body: `email`, `password`. **200** → `{ token, user }`. Bad creds **401**. |
| GET | `/auth/me` | JWT | Current user profile. |

### Materials (`/materials`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/materials` | Optional JWT | List: anonymous sees **published** only; **teacher** sees own + published; **admin** sees all. Response `{ "items": [...] }` (no pagination). **Server ignores query string** (filters/sort params are not applied). **Order:** **quality score** per `docs/materials-detail-spec.md` §10 **DESC**, then **`created_at` DESC**. |
| GET | `/materials/:id/reviews` | — | Public list of reviews for material. |
| GET | `/materials/:id/rating` | — | Aggregate rating stats for material. |
| GET | `/materials/:id/rating-distribution` | — | Rating distribution for 5→1 stars (`total`, `items[{star,count,percent}]`). |
| GET | `/materials/:id/reports` | JWT (**admin**) | Report rows for material `id`; optional `status=pending` or `reviewed` (invalid → **400**); same columns as **`GET /admin/reports`**. |
| GET | `/materials/:id` | Optional JWT | Detail: **published** OR owner **teacher** OR **admin**; else **403**. Not found **404**. Response includes `contents[]` ordered by `sort_order`. |
| POST | `/materials` | JWT (**teacher**) | Create material (starts `pending_review`). Required body: `title`, `price`, `file_key`/`fileKey`, `cover_image_url`/`coverImageUrl`, `teaching_objective`, `teaching_methods` (1..4), `usage_duration`, `activity_steps`, `contents` (>=1), `material_features`/`materialFeatures` (array, >=1, values from allowlist), `ipDeclarationAccepted: true`. Optional: `detail_images`, `demo_video_url`. **Must not** send `status` (**400**). |
| PUT | `/materials/:id` | JWT (**teacher** owner or **admin**) | Full update fields; **only admin** may send `status`. If body includes `contents`, backend replaces existing `material_contents`; if body includes `detail_images`, backend replaces existing `material_images`. |
| PATCH | `/materials/:id` | JWT (**teacher** owner or **admin**) | Partial update semantics, same field validation/authorization as PUT. |
| POST | `/teacher/uploads/material-media` | JWT (**teacher**) | `multipart/form-data` with field **`file`**; query **`kind`**: `cover` / `detail` (images, max 10MB) or `demo` (MP4/WebM, max 80MB). **201** `{ url, filename }` — use **`url`** when creating/updating material media fields. Files served at `GET /uploads/material-media/<filename>`. |

### Cart (`/cart`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/cart` | JWT | List current user’s cart rows (joins material title/price/status). |
| POST | `/cart/items` | JWT | Body: `materialId`, optional `quantity`. Material must be **published**. Upserts quantity; emits `cart.added` on insert and on quantity upsert (see §10). |
| PATCH | `/cart/items/:id` | JWT | Update one cart line quantity (`quantity > 0`). |
| DELETE | `/cart/items/:id` | JWT | Deletes row if it belongs to the user. **404** if not found. |

### Orders (`/orders`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/orders` | JWT (**parent**) | Creates order from cart (empties cart path in service). Supports `promo_code`, `invoice_type`, `invoice_carrier`. Empty cart **400**; unavailable material **409**; promo/invoice validation errors return **4xx**. |
| POST | `/orders/promo/validate` | JWT (**parent**) | Validates promo code against subtotal. Returns `code`, `discount_amount`, `total_amount`. |
| GET | `/orders/my` | JWT | Lists orders for `req.user`. Includes payment-proof counters and compatibility fields. |
| GET | `/orders/:id` | JWT | Returns `{ order, items }` for one order. Access allowed to owner parent or admin; otherwise **403**. |
| POST | `/orders/:id/upload-proof` | JWT (**parent**) | Legacy upload endpoint; same behavior as canonical endpoint. |
| POST | `/orders/:id/payment-proof` | JWT (**parent**) | `multipart/form-data`, field `proofs` (1..3 files, JPG/JPEG/PNG/WEBP, each <= 10MB). Optional header `x-idempotency-key` to dedupe retries. Order must exist, owner match, and order status must be `pending_payment`. |

### Teacher sales (`/teacher/sales`, `routes/teacherSales.js`)

All routes below: **JWT + teacher**. Non-teacher **403**.

| Method | Path | Summary |
|--------|------|---------|
| GET | `/teacher/sales/summary` | Teacher KPI + daily trend. Query: `status`, `from`, `to` (optional). |
| GET | `/teacher/sales/materials` | Aggregated sales by material. Query: `status`, `from`, `to`, `search`, `page`, `limit` (optional). Returns `{ items, pagination }`. |
| GET | `/teacher/sales/records` | Transaction-level sales records. Query: `status`, `materialId`, `from`, `to`, `page`, `limit` (optional). Returns `{ items, pagination }`. |

### Teaching feedback (`/reviews`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/reviews` | JWT (**parent**) | Body: `material_id` or `materialId`, `rating` (1–5), optional `comment`. Purchase entitlement enforced in service. Duplicate per material → **409** (see §8). Current frontend submission entry is `/me/materials/:id/feedback`. |

### Me (`/me`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/me/orders` | JWT | Canonical user order list endpoint (alias of `/orders/my`). Returns progress fields: `payment_proof_uploaded_count`, `payment_proof_latest_status`, `order_progress_state`. |
| GET | `/me/orders/:orderId` | JWT | Canonical user order detail endpoint (alias of `/orders/:id` for owner). Returns `order`, `items`, and `payment_proof_rejected_note` / `order_progress_state` for timeline UI. |
| GET | `/me/reviews` | JWT | Lists reviews authored by current user (service-shaped rows). |
| GET | `/me/materials` | JWT | 已購買且訂單已核准（`orders.status = approved`）之教材清單，供「我的教材」頁顯示。回傳 `{ items: [{ materialId, title, coverImageUrl, materialUpdatedAt, purchasedAt, authorName }] }`。 |
| GET | `/me/favorites` | JWT | Current user favorites list, newest first. |
| POST | `/me/favorites/:materialId` | JWT | Add one favorite (idempotent). |
| DELETE | `/me/favorites/:materialId` | JWT | Remove one favorite. |

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
| GET | `/admin/dashboard/summary` | KPI summary (`materialsCount`, `ordersCount`, `revenueAmount`, `reviewsCount`, `usersCount`, pending counters, WoW review delta). |
| POST | `/admin/payment-proofs/:id/approve` | Approve pending proof; may set order `approved`; supersede other pending proofs. Body optional `note`. |
| POST | `/admin/payment-proofs/:id/reject` | Reject pending proof; body `note` optional (stored as empty string if omitted). Order status unchanged (`pending_payment`). |
| GET | `/admin/reports` | Array of reports; optional `status=pending` or `reviewed` (invalid → **400**). |
| GET | `/admin/materials/:materialId/reports` | Same columns as **`GET /admin/reports`**; optional `status=pending` or `reviewed` (invalid → **400**). |
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

# 14. Timeline UI contract（前端追蹤介面）

For order tracking surfaces (`/orders/:orderId/payment-proof`, `/me/orders/:orderId`), timeline must use **status tracker semantics** (not checkout stepper semantics).

- Icon library: **Lucide** (`lucide-react`)
- Emoji is not allowed in timeline status nodes.
- Status mapping:
  - `orderCreated` → `CheckCircle2` (green)
  - `transferCompleted` → `Landmark` (green)
  - `proofUploaded` → `Upload` (brand purple)
  - `reviewing` → `Clock3` (brand purple)
  - `downloadReady` → `Download` (green)
  - `proofRejected` → `CircleX` (red)
  - `locked` → `Lock` (gray)
- Visual states:
  - completed = green
  - processing/current = purple
  - failed = red
  - locked/pending = gray
- Timeline layout: vertical, left icon + connector line, right content card.

**Routing note:** `materials` router registers static segments (`/:id/reviews`, `/:id/rating`, `/:id/reports`) before `/:id` so paths resolve correctly.

**`GET /materials` — client integration:** The web app explore flow may send search/sort/pagination query parameters to the proxy; the **backend does not use them** for filtering or SQL ordering. Clients should treat the response as the full visible list for the caller’s role and may **filter or re-sort in memory** (e.g. popular / rating / latest) if product requires it.

---

# 12. Canonical DB schema highlights（materials domain）

Besides legacy MVP tables, current materials domain includes:

- `materials` extra columns:
  - `teaching_objective TEXT`
  - `teaching_methods JSONB`
  - `usage_duration TEXT`
  - `activity_steps TEXT`
  - `extension_value TEXT`
  - `short_description TEXT`
  - `cover_image_url TEXT`
  - `demo_video_url TEXT`
- `material_contents` table:
  - `id TEXT PK`
  - `material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE`
  - `type TEXT NOT NULL`
  - `name TEXT NOT NULL`
  - `count INTEGER CHECK (count > 0)`
  - `description TEXT`
  - `sort_order INTEGER DEFAULT 0`
  - timestamps: `created_at`, `updated_at`
- `material_images` table:
  - `id TEXT PK`
  - `material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE`
  - `image_url TEXT NOT NULL`
  - `alt_text TEXT`
  - `sort_order INTEGER DEFAULT 0`
  - timestamps: `created_at`, `updated_at`
- `user_favorites` table:
  - `id TEXT PK`
  - `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE`
  - `created_at TIMESTAMP NOT NULL DEFAULT NOW()`
  - `UNIQUE (user_id, material_id)`

---

# 13. Swagger / OpenAPI（對接文件）

Backend server 啟動後，文件入口如下：

- Swagger UI: `GET /api-doc`
- OpenAPI JSON: `GET /api-doc.json`

文件內容規範（給前端對接）：

- 覆蓋本規格第 11 節所有已實作 API 路由。
- 每支 API 提供中英文 `summary`、`description`。
- 明確定義 request path/query/body。
- 明確定義 responses（含 success/error 狀態碼）。
- response schema 需標示欄位型別與可用範例值（example）。
