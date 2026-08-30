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

Identifiers: primary keys are **TEXT** (e.g. `mat_*`, `ord_*`, user ids); amounts on orders use **INTEGER** (`total_amount`, optional `total_price`). `activity_logs.id` is also **TEXT** (UUID) — corrected 2026-08-26 (`SCHEMA-01`); the previously documented BIGSERIAL exception did not match any real database. It is an **identity, not a time**: never order or paginate by it (see §10).

---

# 1. Core domain language

material = sellable teaching content (includes the deliverable file via `approved_file_id` / `pending_file_id`, `cover_image_url`, optional `demo_video_url`, `teaching_objective`, `teaching_methods`, `usage_duration`, `activity_steps`, optional `category` / `age_range` / `extension_value` / `short_description`, IP declaration flags)  
material_image = detail image row for one material (`image_url`, optional `alt_text`, `sort_order`; does not store cover image)  
material_content = itemized teaching assets of one material (`type`, `name`, optional `count`, `description`, with `sort_order`)  
user_favorite = parent/admin/teacher self-owned favorite relation (`user_id`, `material_id`, unique per pair)  
order = transaction container (`status`, `payment_mode`, `total_amount`, `promo_code`, `discount_amount`, `invoice_type`, `invoice_carrier`, timestamps)  
order_item = line item with snapshots (`title_snapshot`, `price_snapshot`, `quantity`, `seller_id`, `subtotal`)  
manual_payment_proof = uploaded payment evidence image per order (`storage_key` → private storage, `storage_status`, `checksum_sha256`, `uploaded_by`, `proof_mime_type`, `proof_size_bytes`, `original_filename`, `review_status`: pending | approved | rejected). **Never a public asset** — see section 6  
review = parent rating/comment per material (at most one row per `(material_id, parent_id)`; MVP exposes **POST** create only — duplicate **409**; no separate update endpoint)  
report = buyer-submitted moderation case on a material (`status`: pending | investigating | awaiting_creator | resolved | dismissed, plus the **legacy** terminal `reviewed`; closing a case does not imply takedown — only the `unpublish_material` resolution does)  
activity_log = audit row (`target_type`, `target_id`, `action`, `meta` JSONB)

Deprecated naming in prose only: product, purchase.

---

# 2. Roles

teacher · parent · admin  

---

# 3. Material lifecycle

States: `pending_review` · `published` · `changes_requested` · `unpublished`

Canonical state machine: `Backend/utils/materialWorkflow.js`.
Full spec (transitions, review reasons, audit events, notifications, milestone boundary):
**`docs/material-review-workflow.md`**.

Rules:

- **published**: visible to parents (list/detail); may be added to cart if also published in DB.
- **pending_review**: visible to owning teacher and admin only. Awaiting admin review.
- **changes_requested**: visible to owning teacher and admin only. Admin returned it for edits —
  **never published before**; the ball is with the creator.
- **unpublished**: hidden from parents. **Was published before** and taken down by the platform
  (currently only via a report resolution).

`changes_requested` and `unpublished` are deliberately distinct — see `docs/mvp_rules.md` §3.

**Allowed transitions**

| From | To | Actor | Endpoint |
| --- | --- | --- | --- |
| (create) | `pending_review` | teacher | `POST /materials` |
| `pending_review` | `published` | admin | `POST /admin/materials/:id/approve` |
| `pending_review` | `changes_requested` | admin | `POST /admin/materials/:id/request-changes` |
| `changes_requested` \| `unpublished` | `pending_review` | teacher (**owner**) | `POST /materials/:id/resubmit` |
| `published` | `unpublished` | admin | **only** `POST /admin/report-cases/:id/resolve` (`unpublish_material`) |

Forbidden (would bypass review): `changes_requested → published`, `unpublished → published`,
`published → changes_requested`. Any illegal transition returns **409**.

**`PUT`/`PATCH /materials/:id` no longer accepts `status`** — sending it returns **400**
`{ error: "status_not_updatable_here" }` for admins and **403** for teachers. Material status is
managed exclusively by the review workflow so that every publish carries a reviewer, a
`published_at`, an audit event and a creator notification.

**Review snapshot columns** on `materials` — `review_reason_code`, `review_note`, `reviewed_by`,
`reviewed_at` — hold the **latest review decision only** (overwritten on each decision).
The canonical history is `activity_logs` (`target_type = 'material'`).
`published_at` is the **first** successful publish time and is never overwritten.

**POST /materials (create):** request body must **not** include `status` (**400** if present). New rows always start as `pending_review` (same as DB default).

**Create validation (implemented):**

- required: `title`, `price` (`> 0`), `fileId` (alias `file_id`; obtained from `POST /teacher/uploads/material-file`), `teaching_objective`, `teaching_methods`, `usage_duration`, `activity_steps`, `contents`
- required: `cover_image_url` (alias `coverImageUrl`) and it must be a valid URL
- required: `material_features` (alias `materialFeatures`) — **array**, at least **1** item; every value must come from the material features allowlist (`Backend/constants/materialFeatures.js`, mirrored at `frontend/apps/web/src/constants/materialFeatures.ts`; see `docs/material-features-system-spec-mvp-v1.0.md`). Invalid value → **400** `invalid material feature: <value>`
- `teaching_methods`: array length `1..4`, empty strings are rejected
- `contents`: at least one row; each row requires `type` + `name`; `count` if provided must be `> 0`
- optional: `detail_images` (alias `detailImages`), each `image_url` is required and must be valid URL
- optional: `demo_video_url` (alias `demoVideoUrl`) must be valid URL if provided

**Media URLs (teacher):** the web app uploads files with **POST /teacher/uploads/material-media** (`multipart/form-data`, field `file`, query `kind=cover|detail|demo`) and stores the returned **`url`** in `cover_image_url`, `detail_images`, or `demo_video_url`. The API still validates **http(s) URL strings** only, and an **external CDN link is a valid value** — the field is not restricted to platform media. In production, set **PUBLIC_BACKEND_URL** (or **API_PUBLIC_URL**) on the backend so returned URLs match the public host.

The returned `url` points at **`GET /materials/media/{mediaId}`**, not at a static file. Media bytes live in private storage; visibility follows the **owning material's `status`** (published → anonymous; anything else → owning creator or admin). Create/update **claims** any platform media URL in the payload for that material and rejects media owned by someone else or already claimed by another material (**400** `media_not_claimable`). The legacy public path `/uploads/material-media/*` returns **404**. See `docs/mvp_rules.md` §3.1.

**Detail payload (`GET /materials/:id`):** returns material fields plus `contents[]`, sourced from `material_contents` and ordered by `sort_order ASC`.

---

# 4. Order lifecycle (orders.status)

Concrete values used by the backend:

- **pending_payment** — set when an order is created from the cart. Default for new orders.
- **approved** — set when an admin **approves** a pending `manual_payment_proof` for that order.

Compatibility note: `completed` is a **dead status** — no code path ever writes it and neither database contains a row with it. Analytics queries no longer reference it (creator sales was the last reader; removed in the revenue-semantics alignment). Canonical create/update flow uses `pending_payment` and `approved`.

There is **no** `proof_uploaded` value on `orders`. Uploading proofs inserts rows into `manual_payment_proofs` with `review_status = 'pending'` while the order remains `pending_payment`.

`cancelled` exists only as **legacy read-only rows** from the pre-v1.2 workflow: no route, service, or UI writes it, and `cancelled_at` has no writer at all. It is kept visible for historical lookup, not as a live lifecycle stage.

For UI/state consistency, API now exposes **derived** `order_progress_state`
(buyer surfaces only — `GET /me/orders` and `GET /me/orders/:orderId`; defined once in
`Backend/services/buyerOrders.service.js` and computed per query, **never stored**):

- `pending` — order created, no proof uploaded yet
- `proof_uploaded` — latest proof is approved but the order is not approved yet
- `reviewing` — latest proof is pending review
- `approved` — order approved and downloadable
- `rejected` — latest proof rejected; order stays `pending_payment`

**Business rule — buyer order progress reflects the latest relevant payment proof, not any
historical proof.** An order may accumulate several proofs (the buyer re-uploads after a
rejection). Only the most recent one decides the buyer-visible progress:

| Situation | `order_progress_state` |
| --- | --- |
| `orders.status = 'approved'` (whatever the proof history contains) | `approved` |
| `orders.status = 'cancelled'` (whatever the proof history contains) | `cancelled` |
| latest proof `pending` | `reviewing` |
| latest proof `rejected` | `rejected` |
| latest proof `approved`, order not approved yet | `proof_uploaded` |
| no proof at all | `pending` |

Precedence is ordered, and the two terminal states **must** short-circuit first.
`approved`: approving a proof marks the order's other pending proofs `rejected`
(`note = 'superseded by approved proof'`), so a completed order would otherwise regress to
`rejected`. `cancelled` (`COR-03`): a cancelled order is read-only and has no payment
action, so its progress must not be derived from proofs — without this branch a cancelled
order with no proof fell through to `pending` and the buyer saw a "待付款" badge on an order
the same list had already filed under history. A historical `rejected` proof must
never override a newer `pending` one — that was the `COR-01` defect: the buyer had already
re-uploaded and was still told to re-upload.

"Latest" is defined by `COALESCE(uploaded_at, created_at) DESC, id DESC`
(`LATEST_PROOF_ORDER_BY_SQL` in `Backend/utils/paymentProofReview.js`) — legacy rows exist
with `uploaded_at IS NULL`, and the `id` tie-break keeps the answer deterministic. Admin's
`operational_status` uses the same ordering, so both views point at the same proof. The SQL
is an implementation detail; the product rule is the sentence in bold above.

Rejecting a proof (**POST** admin reject) updates only `manual_payment_proofs.review_status` to `rejected`; the **order stays `pending_payment`** until a proof is approved.

Because of that, `orders.status` alone cannot answer *"what does an admin need to act on?"* — `pending_payment` covers "no proof yet", "proof awaiting review" and "proof rejected" at once. Admin surfaces therefore use a second **derived** view, `operational_status` (`awaiting_payment` | `pending_review` | `payment_rejected` | `approved` | `cancelled`), defined once in `Backend/services/adminOrders.service.js`. It is computed per query and **never stored**; see `docs/mvp_rules.md` §19 for the predicates, precedence, and the re-upload rule (older `rejected` + newer `pending` ⇒ `pending_review`).

Legacy DB values may be normalized at startup (`paid` → `approved`). `paid` historically meant **approved**, not "awaiting review" — it must not be reintroduced, and neither must `completed`.  

Download is allowed only when `orders.status = approved` and the material appears in `order_items` for that user.

---

# 5. Purchase structure

One order may contain multiple materials via `order_items`.

- Snapshots: `title_snapshot`, `price_snapshot`, `quantity`, `seller_id` (typically material’s teacher), `subtotal`.

---

# 6. Payment proofs (`manual_payment_proofs`)

Stores:

- `order_id`, `storage_key` (opaque private-storage pointer), `storage_status`, `checksum_sha256`, `uploaded_by`, `proof_mime_type`, `proof_size_bytes`, `original_filename`, `review_status` (pending | approved | rejected), optional `note`, `rejection_reason`, `reviewed_by`, `reviewed_at`, `created_at`, etc.
- `proof_url` is **legacy only**: proofs used to live under the publicly served `uploads/` tree. It is nullable, never returned by any API, and kept solely as an audit trail of which public file a migrated row came from.
- Upload constraints: image only (`JPG`/`JPEG`/`PNG`/`WEBP`), max **10MB per file** (`MAX_PAYMENT_PROOF_BYTES`), max **3 files per order**. Validation is three-layer — extension + declared MIME + **magic bytes** — so a renamed non-image is rejected with **415**.
- Canonical upload endpoint: `POST /orders/:id/payment-proof` (legacy alias kept: `POST /orders/:id/upload-proof`).
- Client may pass `x-idempotency-key` to prevent duplicate uploads from repeated clicks/retries. Replayed key for same user/order is safely ignored.

## 6.1 Storage and delivery (private, authorized only)

**A payment proof is never a public asset.** Bytes live in `private-storage/payment-proofs/`
(outside the `express.static`-served `uploads/` tree) and can only be read through:

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/orders/:orderId/payment-proofs` | JWT | Proof metadata for the order. No bytes, no storage key. |
| GET | `/orders/:orderId/payment-proofs/:proofId/file` | JWT | The image bytes. `inline` by default; `?download=1` switches to `attachment` and writes a `payment_proof_downloaded` audit event. |

Authorization is a single rule, shared by both endpoints and by the admin review UI:

```text
Admin  OR  authenticated order owner   (orders.user_id)
```

Anything else is **403**; anonymous is **401**. `proofId` must belong to `orderId`
(otherwise **404**) — authorization is granted on the order, and that pairing is what
prevents an IDOR across orders. Access does **not** depend on `orders.status` or on the
review outcome: a proof is part of the buyer's own transaction record.

Responses carry `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
The legacy `/uploads/payment-proofs/*` path is blocked before `express.static` and returns
**404** `payment_proof_not_public`.

Admin/API payloads expose `proof_file_path` (`/orders/:orderId/payment-proofs/:proofId/file`)
and `proof_file_available`; `storage_key` and `checksum_sha256` never leave the service layer.

See `docs/mvp_rules.md` section 12.4 for the `storage_status` values and the legacy migration.
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
- Detail page (`/materials/:id`) shows the **"教學回饋"** section as social proof only.
- Full list page (`/materials/:id/reviews`) is display-only.
- Submission UI is moved to purchased-library flow (`/me/materials/:id/feedback`).

Authorization (enforced in service/repository): **`EXISTS` at least one `approved` order for that parent** whose `order_items` include the requested `material_id` (this is **not** tied to “the” active cart/checkout order—another concurrent order may remain `pending_payment`).

Rating is integer **1–5**; optional `comment`.

---

# 9. Reports (`reports`)

- `material_id`, `reporter_id`, `reason`, `status`, `resolution`, `resolution_note`.
- `status` is one of `pending`, `investigating`, `awaiting_creator`, `resolved`, `dismissed`, plus `reviewed`
  (**legacy terminal, read-only compatibility**). Canonical state machine and allowed transitions:
  `Backend/utils/reportWorkflow.js`, documented in `docs/mvp_rules.md` section 6.
  `reviewed` is **not** a valid transition target — it appears in no row of `ALLOWED_TRANSITIONS` and is never
  returned in `allowedTransitions`.
- `resolution` is one of `dismissed`, `warning`, `request_changes`, `unpublish_material` (null until the case is closed).
  Only `unpublish_material` mutates platform data (`materials.status` becomes `unpublished`).
  User suspension is **not** available — `users` has no status/suspension column, so it is not in the allowlist.
- At most one report per `(material_id, reporter_id)`.
- The **deprecated** `PATCH /admin/reports/:id` still marks a report `reviewed` (setting `reviewed_at` /
  `reviewed_by`) for backward compatibility with pre-existing callers. **No production Admin UI uses it** —
  `/admin/reports` is the single source of truth for case handling, and `/admin/materials/:id/reports` is a
  contextual read-only view. Existing `reviewed` rows are kept as-is and **never** backfilled to `resolved`:
  they record "someone acknowledged this", which is not the same fact as "a disposition was applied".
- `report_events` records the case history and the Admin/Creator thread (`status_changed`, `admin_note`,
  `creator_response_requested`, `creator_response`, `resolution`). It is not a replacement for
  `activity_logs`; both are written.

**Parent HTTP (implemented):**

- **POST** `/reports` — JWT + `parent` only; JSON body requires `reason` and material id as **`material_id`** or **`materialId`** (alias). Insert row with `status = pending`; duplicate `(material_id, reporter_id)` → **409** (`Already reported`); missing material → **404**; emits `activity_logs` with `action = report_created`, `target_type = material`, `meta.reason`.
  - **UI entry point (single).** The web app's only caller is the 「檢舉這個教材」 control at the bottom of the material detail page `/materials/:id` (`components/materials/detail/MaterialReportDialog.tsx`). The control is rendered for **every** visitor including guests; non-buyers get a login prompt inside the dialog and the request is never issued. `reason` is **free text** (required, trimmed, 500-char cap) — `reports` has no reason-code column and the client must not encode pseudo-categories into the string. Reports are only ever created by buyers; there is **no** admin-side "open a case" endpoint, and no buyer-facing endpoint to read back a submitted report. See `docs/mvp_rules.md` §6.5.

**Admin HTTP (implemented):**

- **GET** `/admin/reports` — JWT + `admin` only; response body is a JSON **array** of report rows. Optional query: `status=pending` or `status=reviewed` (invalid values → 400).
- **GET** `/admin/materials/:materialId/reports` — JWT + `admin` only; JSON **array** of report rows for that material (same columns as `/admin/reports`). Optional query: `status=pending` or `status=reviewed` (invalid values → 400).
- **GET** `/materials/:id/reports` — JWT + **admin** only; `:id` is material id. Same columns and optional `status` filter as **`GET /admin/materials/:materialId/reports`** (invalid `status` → **400**).
- **PATCH** `/admin/reports/:id` — **@deprecated legacy.** Body must be `{"status":"reviewed"}`; only transition `pending` → `reviewed`; already reviewed → **409**; writes `activity_logs` with `action = report_reviewed`, `target_type = report`, `target_id` set to that report’s id, and `meta` containing `{"status":"reviewed"}`. **`reviewed` is a legacy terminal, not a valid target of the official state machine** (it is absent from every row of `ALLOWED_TRANSITIONS`; this endpoint bypasses the transition table by design). Existing `reviewed` rows are kept as-is and never backfilled. (**POST** `/reports` emits **`report_created`** with `target_type = material` and the material id as `target_id`.) New work must use the case endpoints below.
- **GET** `/admin/report-cases` — paginated case queue. Query: `status=open|all|<comma-separated statuses>` (invalid values give **400**), `q` (material title / reason / reporter or creator email / case id), `page`, `limit`. Returns `{ items, pagination, statusCounts }`; each item is enriched with `material_title`, `creator_email`, `reporter_email`, `event_count`.
- **GET** `/admin/report-cases/:id` — `{ report, events, availableResolutions, allowedTransitions }`. `events` includes Admin-only `admin_note` entries.
- **POST** `/admin/report-cases/:id/investigate` — `pending` to `investigating`. Invalid transition gives **409**.
- **POST** `/admin/report-cases/:id/request-response` — body `{ message }` (required; blank gives **400**); `pending`/`investigating` to `awaiting_creator`.
- **POST** `/admin/report-cases/:id/notes` — body `{ message }`; appends an Admin-only note. Status unchanged.
- **POST** `/admin/report-cases/:id/resolve` — body `{ resolution, note? }`. A `resolution` outside the allowlist gives **400**. Sets `status` to `dismissed` (when `resolution = dismissed`) or `resolved`, stamps `reviewed_at` / `reviewed_by`, writes a `resolution` event, and for `unpublish_material` also sets `materials.status = 'unpublished'` (only when currently `published`) plus a `material.unpublished` audit log. Emits `activity_logs` with `action = report.resolved`.

Status change, event insert and material unpublish happen in **one transaction**; `activity_logs` is written after COMMIT (same convention as payment proof review). Every action takes `SELECT ... FOR UPDATE` on the report first, so a second concurrent Admin gets **409** rather than silently overwriting the first decision.

**Creator HTTP (implemented):** mounted at both `/creator/cases` (canonical) and `/teacher/cases` (compatibility alias); JWT + `teacher`.

- **GET** `/creator/cases` — cases on the caller's own materials only (authorised in SQL via `materials.teacher_id`). Query: `scope=action_required|open|all` (invalid gives **400**), `page`, `limit`. Returns `{ items, pagination, actionRequiredCount }`. Reporter identity is **not** returned.
- **GET** `/creator/cases/:id` — `{ case, events, canRespond }`. `events` **excludes** `admin_note`. Not the caller's material gives **404** (not 403 — a 403 would leak that the case id exists).
- **POST** `/creator/cases/:id/respond` — body `{ message }`; `awaiting_creator` to `investigating`. Wrong state gives **409**; blank message gives **400**.

**Not implemented (needs a product decision):** report attachments (no attachment column, and no upload pipeline outside payment proofs) and push notifications (no notifications table; `emailService` covers order/payment events only). Creators poll `/creator/cases`; the Creator sidebar shows an outstanding-case badge.

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

**Material status actions:** every material status transition emits its own action, written by the
review workflow (`Backend/services/materialReview.service.js`, `services/reportAdmin.service.js`):

| Action | Emitted when | meta |
| --- | --- | --- |
| `material.created` | teacher creates a material | `{ status: "pending_review" }` |
| `material.published` | admin approves | `{ oldStatus, newStatus, reviewedBy, firstPublish, note? }` |
| `material.changes_requested` | admin returns for edits | `{ oldStatus, newStatus, reasonCode, note, reviewedBy }` |
| `material.resubmitted` | creator resubmits | `{ oldStatus, newStatus, previousReviewReasonCode? }` |
| `material.unpublished` | report resolution takes it down | `{ oldStatus, newStatus, reportId }` |

`PUT`/`PATCH /materials/:id` cannot change `status`, so it emits no status action.

**Cart:** `cart.added` is emitted both when inserting a new cart line and when upserting quantity on an existing `(user_id, material_id)` row; upsert responses may include `meta.upserted: true` in activity logs.

Schema: `target_type` (NOT NULL), `target_id` (NOT NULL), `action` (NOT NULL), `meta` JSONB (NOT NULL), `created_at` (NOT NULL), `actor_id` FK to `users(id)` ON DELETE SET NULL; `id` is **TEXT UUID** (`gen_random_uuid()::text`). **`id` is an identity, not a time** — it is not monotonic, so event order must come from `created_at` (`ORDER BY created_at DESC, id DESC`, where `id` is only a deterministic tie-breaker). Never use `MAX(id)` for "latest" or `id > lastId` as a pagination cursor.

**Admin read API (JWT + role `admin` only):**

| Method | Path | Notes |
|--------|------|--------|
| GET | `/admin/activity-logs` | Filters: `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `page`, `limit` (max 100). Order: `created_at DESC`. |
| GET | `/admin/activity-logs/:id` | Single row by primary key string (same as list item `id`; supports bigint serial or UUID/text depending on schema). Returns the same enriched shape as a list item (`actor_email` / `target_label` / `order_buyer_email`). |
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
| POST | `/materials` | JWT (**teacher**) | Create material (starts `pending_review`). Required body: `title`, `price`, `fileId`, `cover_image_url`/`coverImageUrl`, `teaching_objective`, `teaching_methods` (1..4), `usage_duration`, `activity_steps`, `contents` (>=1), `material_features`/`materialFeatures` (array, >=1, values from allowlist), `ipDeclarationAccepted: true`. Optional: `detail_images`, `demo_video_url`. **Must not** send `status` (**400**). |
| PUT | `/materials/:id` | JWT (**teacher** owner or **admin**) | **Partial update — identical to `PATCH`** (both routes share `updateMaterialHandler`; omitted fields keep their current value). Retained for compatibility only; prefer `PATCH`. **`status` is rejected** — teacher **403**, admin **400** `{ error: "status_not_updatable_here" }`; use the review workflow endpoints below. If body includes `contents`, backend replaces existing `material_contents`; if body includes `detail_images`, backend replaces existing `material_images`. |
| PATCH | `/materials/:id` | JWT (**teacher** owner or **admin**) | Partial update semantics, same field validation/authorization as PUT (including the `status` rejection). |
| POST | `/materials/:id/resubmit` | JWT (**teacher**, **owner only**) | Resubmit for review: `changes_requested` \| `unpublished` → `pending_review`. Same material id — never creates a new material. Non-owner → **404** (not 403, which would leak existence). Illegal source status → **409**. Emits `material.resubmitted`. Returns `{ material }`. |
| POST | `/teacher/uploads/material-media` | JWT (**teacher**) | `multipart/form-data` with field **`file`**; query **`kind`**: `cover` / `detail` (images, max 10MB) or `demo` (MP4/WebM, max 80MB). Type verified by extension + declared MIME + **magic bytes**; an unrecognised `kind` is **400** (not coerced to `cover`). **201** `{ url, mediaId, kind, filename, mimeType, sizeBytes }` — use **`url`** when creating/updating material media fields. |
| GET | `/materials/media/:mediaId` | **optional** JWT | Material media bytes. Visibility follows the owning material's `status`: `published` → **anyone incl. anonymous**; unclaimed → uploader or admin; `pending_review` / `changes_requested` / `unpublished` → owning creator or admin. `inline`, `nosniff`, `Accept-Ranges: bytes`. Public media is `Cache-Control: public, max-age=300`; protected media is `private, no-store`. **401** anonymous / **403** signed-in but not permitted / **404** unknown / **503** storage unavailable. |

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
| POST | `/orders/:id/payment-proof` | JWT (**parent**) | `multipart/form-data`, field `proofs` (1..3 files, JPG/JPEG/PNG/WEBP, each <= 10MB). Optional header `x-idempotency-key` to dedupe retries. Order must exist, owner match, and order status must be `pending_payment`. Bytes go to **private storage**; the response contains no public URL and no storage key. |
| GET | `/orders/:orderId/payment-proofs` | JWT (**admin or order owner**) | Proof metadata for the order. Others **403**, anonymous **401**. |
| GET | `/orders/:orderId/payment-proofs/:proofId/file` | JWT (**admin or order owner**) | Proof image bytes (`inline`; `?download=1` → `attachment` + audit event). `proofId` must belong to `orderId` (else **404**). Legacy rows with no private object → **409**. See section 6.1. |

### Teacher sales (`/teacher/sales`, `routes/teacherSales.js`)

All routes below: **JWT + teacher**. Non-teacher **403**.

| Method | Path | Summary |
|--------|------|---------|
| GET | `/teacher/sales/summary` | Creator **gross sales** KPI + trend. Shares the **identical** reporting-range contract as `/admin/dashboard/summary` (`range` / `from` / `to`, Asia/Taipei calendar days, half-open `[start, end)`, default last 30 days, invalid → **400** `{ error: "INVALID_DATE_RANGE" }`). Amount is `SUM(order_items.subtotal)` (**before discount**), restricted to `orders.status = 'approved' AND paid_at IS NOT NULL`, recognised at **`orders.paid_at`**. Returns period metadata, `granularity`, `totalSoldUnits`, `totalSalesAmount`, `totalOrders`, `materialsCount`, and a gap-filled `trend[]` of `{ key, salesAmount, soldUnits }`. `totalRevenue` and `trend[].day` / `trend[].revenue` are deprecated aliases. See `docs/mvp_rules.md` §18. |
| GET | `/teacher/sales/materials` | Aggregated gross sales by material for the same period. Query: `range`, `from`, `to`, `search`, `page`, `limit` (optional). Returns period metadata + `{ items, pagination }`; each item has `salesAmount` (deprecated alias `revenue`) and `lastSoldAt` = `MAX(orders.paid_at)`. |
| GET | `/teacher/sales/records` | Settled sales records for the same period, ordered by `paid_at DESC`. Query: `range`, `from`, `to`, `materialId`, `page`, `limit` (optional). Returns period metadata + `{ items, pagination }`. Only `approved` orders with a non-null `paid_at` appear — there is deliberately **no** `status` parameter. |

### Teaching feedback (`/reviews`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | `/reviews` | JWT (**parent**) | Body: `material_id` or `materialId`, `rating` (1–5), optional `comment`. Purchase entitlement enforced in service. Duplicate per material → **409** (see §8). Current frontend submission entry is `/me/materials/:id/feedback`. |

### Me (`/me`)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | `/me/orders` | JWT | Canonical user order list endpoint (alias of `/orders/my`). Returns progress fields: `payment_proof_uploaded_count`, `payment_proof_latest_status`, `order_progress_state`. |
| GET | `/me/orders/:orderId` | JWT | Canonical user order detail endpoint (alias of `/orders/:id` for owner). Returns `order`, `items`, and `payment_proof_rejected_note` / `order_progress_state` for timeline UI. `payment_proof_rejected_note` and `payment_proof_rejected_reason` are returned **only when `order_progress_state = 'rejected'`** (`COR-02`); in every other state both are `null`, because the approve flow reuses the buyer-visible `note` column for the operational string `superseded by approved proof`. |

Both endpoints derive `order_progress_state` from the **same** SQL in
`Backend/services/buyerOrders.service.js` — list and detail can no longer disagree. See §4
for the precedence and the latest-proof rule.
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
| GET | `/download/:materialId` | JWT | Requires an approved order containing the material; **403** `not_entitled` otherwise, **409** `material_file_unavailable` when the buyer is entitled but the material has no approved file (legacy materials). Returns a **single-use** download ticket `{ signedUrl, expiresInSeconds, filename, sizeBytes }`. Never gated on `materials.status`. |
| GET | `/download/file/:token` | — (**no auth by design**) | Redeems the ticket and streams the file bytes. Browsers cannot send `Authorization` on a download navigation, so authorisation is baked into the ticket (random, hashed at rest, 5-minute TTL, single use, bound to userId + materialId + fileId). Must be called on the Backend directly, **not** through the Next proxy. |
| POST | `/teacher/uploads/material-file` | JWT (**teacher**) | `multipart/form-data` field `file`. Extension + declared MIME + **magic byte** validation, `MAX_MATERIAL_FILE_BYTES` limit, streaming SHA-256. **201** `{ fileId, originalFilename, mimeType, sizeBytes }` — never a URL or storage key. |
| POST | `/materials/:id/file` | JWT (**teacher**, owner) | Replaces the pending candidate file. Allowed only in `changes_requested` / `unpublished`; **409** `file_replacement_not_allowed` otherwise. Can only ever write `pending_file_id`. |
| GET | `/admin/materials/:id/file` | JWT (**admin**) | `?slot=pending\|approved`. Streams the file for review and writes `admin.material_file_downloaded`. |

### Admin — operations (`/admin`, `routes/admin.js`)

All routes below: **JWT + admin**. Non-admin **403**.

| Method | Path | Summary |
|--------|------|---------|
| GET | `/admin/materials` | Material review queue. Server-side filtering, search, sorting and pagination. Query: `status=pending_review\|published\|changes_requested\|unpublished\|all` (invalid gives **400**), `q` (title / creator email / material id), `sort=created_desc\|created_asc\|updated_desc\|title_asc\|price_desc` (invalid gives **400**), `page`, `limit` (default 20, max 100). Returns `{ items, pagination, statusCounts }`. Each item adds `creator_email` and `open_report_count`. `statusCounts` is a **whole-table** count unaffected by `status` / `q` / pagination — callers needing totals (for example the dashboard material KPIs) must read it instead of counting a page of `items`. See `docs/mvp_rules.md` section 20. |
| POST | `/admin/materials/:id/approve` | Approve and publish: `pending_review` → `published`. Body (optional) `{ note }` — internal note, recorded in the audit event only, **not** sent to the creator. Writes `reviewed_by` / `reviewed_at`, clears `review_reason_code` / `review_note`, sets `published_at` **only on the first publish**. Emits `material.published`. Sends the creator a "教材已上架" email. Any other source status → **409**. Returns `{ material, firstPublish }`. |
| POST | `/admin/materials/:id/request-changes` | Return for edits: `pending_review` → `changes_requested`. Body (**required**) `{ reasonCode, note }` — `reasonCode` must be one of `incomplete_info\|media_quality\|features_mismatch\|file_problem\|ip_concern\|other`; `note` must be **at least 10 characters after trimming** (code points, so CJK counts per character). Invalid input → **400** with nothing written. Writes the review snapshot, emits `material.changes_requested`, sends the creator a "教材需要修改" email. Returns `{ material }`. |
| GET | `/admin/orders` | Orders, `created_at DESC, id DESC`, **paginated**. Optional query **`status`** — an **Admin operational state**, not a raw `orders.status`: `awaiting_payment` \| `pending_review` \| `payment_rejected` \| `approved` \| `cancelled`. Omitted → all orders; any other value (including the legacy raw tokens `pending_payment`, `paid`, `completed`) → **400** `{ message: "status must be one of awaiting_payment\|pending_review\|payment_rejected\|approved\|cancelled" }` — never a silent empty list. Optional **`q`** searches the **order id** and the **buyer email** (`ILIKE`; `%` / `_` are escaped to literals) — no match returns an empty page, never the full list. **`page`** / **`limit`** follow the shared admin-list contract (`Backend/utils/adminQuery.js`: page from 1, limit default 20 / max 100); the response carries `pagination` `{ page, limit, total, totalPages }` alongside `items`, where `total` is the count **after** `status` / `q`. Each item adds `operational_status`, `payment_proof_pending_review_count`, `payment_proof_latest_status` and `buyer_email` to the order fields. The derivation lives only in `Backend/services/adminOrders.service.js`; clients must not re-derive it. See `docs/mvp_rules.md` §19. |
| GET | `/admin/dashboard/summary` | KPI summary. Optional `range=today\|7d\|30d\|this_month\|custom` plus `from`/`to` (`YYYY-MM-DD`, inclusive calendar dates); invalid → **400** `{ error: "INVALID_DATE_RANGE" }`. Defaults to the last 30 days when omitted, and always echoes the resolved `periodFrom` / `periodTo` / `periodTimezone` / `periodPreset`. **Period** fields (`periodRevenueAmount`, `newOrdersCount`, `newUsersCount`, `newMaterialsCount`, `newReviewsCount`) cover only events inside the period; **snapshot/all-time** fields (`materialsCount`, `ordersCount`, `revenueAmount`, `reviewsCount`, `usersCount`, `pendingProofsCount`, `pendingReportsCount`, `actionableReportsCount`, `wowReviewDeltaPercent`) ignore it entirely. **Admin backlog counts** answer "what needs an admin next step **now**", not "what is still open": `actionableReportsCount` = reports in `pending` + `investigating` (`Backend/utils/reportWorkflow.js` → `ADMIN_ACTIONABLE_REPORT_STATUSES`); `awaiting_creator` is excluded because the ball is with the creator, and terminal statuses (including legacy `reviewed`) never count. `pendingReportsCount` keeps its literal meaning (`status = 'pending'` only) and is **deprecated for dashboard use**. See `docs/admin-information-architecture.md` §4.1. `ordersCount` counts **all** orders regardless of status; `revenueAmount` (all-time) and `periodRevenueAmount` sum `total_amount` for **`status = 'approved'` only** — the period one keys off `orders.paid_at` (admin approval), not `created_at`. Also returns **comparison** against the previous period: `previousPeriodFrom` / `previousPeriodTo`, `previousPeriodRevenueAmount`, `previousNew*Count`, and `*DeltaPercent`. The previous period is the adjacent equal-length window (`this_month` uses last month's same elapsed-day window, clamped to that month's length). `*DeltaPercent` is `null` when the previous value is 0 and the current one is positive — the UI shows 「新增」, never 100%. See `docs/mvp_rules.md` §14–§15, §17 for Asia/Taipei half-open `[start, end)` semantics. |
| GET | `/admin/dashboard/trends` | Revenue and new-order time series for the same reporting period. Accepts the **identical** `range` / `from` / `to` contract as `/admin/dashboard/summary`, including `400` `{ error: "INVALID_DATE_RANGE" }` — both endpoints share one resolver. Returns `granularity` (`hour` for a single day, `day` for 2–90 days, `month` for 91–365 days) plus `revenue[]` and `orders[]` as `{ key, value }` buckets. `revenue` keys off `orders.paid_at` with `status = 'approved'`; `orders` keys off `orders.created_at` regardless of status. Buckets are grouped by the **Asia/Taipei** calendar and gap-filled with `0`, so both arrays always cover every bucket in the period. See `docs/mvp_rules.md` §16. |
| POST | `/admin/payment-proofs/:id/approve` | Approve pending proof; may set order `approved`; supersede other pending proofs. Body optional `note`. |
| POST | `/admin/payment-proofs/:id/reject` | Reject pending proof. Body **requires** `rejection_reason`, one of `amount_mismatch\|unreadable\|payment_not_found\|invalid_proof\|other` (missing or invalid gives **400**); `note` is optional except when `rejection_reason = other`, where it is required. Order status unchanged (`pending_payment`). The buyer sees both via `payment_proof_rejected_reason` / `payment_proof_rejected_note` on `GET /me/orders/:orderId`. See `docs/mvp_rules.md` section 12.2. |
| GET | `/admin/payment-proofs/:id` | Full decision context for one proof: `{ proof, orderItems, otherProofs }`. `otherProofs` are the other proofs on the same order together with their rejection reasons — needed because buyers re-upload after a rejection. Unknown id gives **404**. |
| GET | `/admin/reports` | **Legacy** — array of reports; optional `status=pending` or `reviewed` (invalid gives **400**). Shape unchanged. |
| GET | `/admin/materials/:materialId/reports` | Same columns as **`GET /admin/reports`**; optional `status=pending` or `reviewed` (invalid gives **400**). |
| PATCH | `/admin/reports/:id` | **@deprecated legacy — not part of the official workflow.** Body `{ "status": "reviewed" }`; `pending → reviewed` only; duplicate transition **409**. Responses carry `Deprecation: true` and `Link: </admin/report-cases>; rel="successor-version"`. It writes the legacy `reviewed` terminal, which has **no resolution, no disposition note and no case history** — use the case endpoints (`/admin/report-cases/:id/investigate` → `/resolve`) instead. No production Admin UI calls this endpoint. See `docs/mvp_rules.md` §6 and `docs/admin-information-architecture.md` §9. |
| GET | `/admin/report-cases` | Case queue. `status=open\|all\|<csv>`, `q`, `page`, `limit`. Returns `{ items, pagination, statusCounts }`. See section 9. |
| GET | `/admin/report-cases/:id` | `{ report, events, availableResolutions, allowedTransitions }`. |
| POST | `/admin/report-cases/:id/investigate` | `pending` to `investigating`; invalid transition **409**. |
| POST | `/admin/report-cases/:id/request-response` | Body `{ message }` (required); moves the case to `awaiting_creator`. |
| POST | `/admin/report-cases/:id/notes` | Body `{ message }`; Admin-only note, status unchanged. |
| POST | `/admin/report-cases/:id/resolve` | Body `{ resolution, note? }`; closes as `resolved` or `dismissed`. `unpublish_material` also unpublishes the material. |

### Admin — audit logs (`/admin`, `routes/adminActivityLogs.js`)

All routes below: **JWT + admin**.

| Method | Path | Summary |
|--------|------|---------|
| GET | `/admin/activity-logs` | Paginated audit list. Existing exact-match filters unchanged: `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `page`, `limit` (max 100). **`action` also accepts a comma-separated list** (`a,b,c`) meaning "any of these"; a single value behaves exactly as before, and an empty/blank value means "no filter", never "match nothing" (see `docs/mvp_rules.md` section 22.2.1). Added: **`q`** — human-readable search across actor email, material title, target email, order id and action; **`from`** / **`to`** — `YYYY-MM-DD`, inclusive of both days (malformed values are ignored, not rejected). Each row adds `actor_email` and `target_label`. `meta` and every technical id are still returned unchanged. See `docs/mvp_rules.md` section 22. |
| GET | `/admin/activity-logs/filters` | `{ actions, actorRoles }` — the values that actually occur in `activity_logs`, with counts, for filter dropdowns. |
| GET | `/admin/activity-logs/:id` | Single log row by id string (matches list item `id`). **Response shape is identical to a list item** — the same enriched projection is used, so `actor_email`, `target_label` and `order_buyer_email` are present here too. Additive only: no field was renamed or removed, and 404-on-missing is unchanged. See `docs/mvp_rules.md` section 22.2.2. |
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
