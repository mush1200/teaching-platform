# Teaching Platform — MVP Spec v1.3

Supersedes v1.2. Aligned with `Backend/models/bootstrapModel.js` (ensureCoreTables + runIdempotentMigrations) and current API behavior.

Architecture: Backend-first  
Database: PostgreSQL  
Auth: JWT  

Identifiers: primary keys are **TEXT** (e.g. `mat_*`, `ord_*`, user ids); amounts on orders use **INTEGER** (`total_amount`, optional `total_price`).

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
