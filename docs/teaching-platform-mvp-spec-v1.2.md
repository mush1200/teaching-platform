# Teaching Platform — MVP Spec v1.2

Architecture: Backend-first
Database: PostgreSQL
Auth: JWT

---

# 1. Core Domain Language (v2.0 aligned)

material = sellable teaching content
order = transaction container
order_item = purchased material snapshot
manual_payment_proof = uploaded payment evidence
activity_log = audit trail record

Deprecated:
product
purchase

---

# 2. Roles

teacher
parent
admin

---

# 3. Material lifecycle

pending_review
published
unpublished

Rules:

published:
 visible to parents
 can be added to cart

pending_review:
 visible only to teacher + admin

unpublished:
 hidden from parents

---

# 4. Order lifecycle

pending
proof_uploaded
approved
rejected

Rules:

cannot skip state

only approved order grants download permission

---

# 5. Purchase structure

One order may contain multiple materials.

orders
  has many order_items

order_items store snapshot:

material_title_snapshot
price_snapshot

---

# 6. Payment proof

manual_payment_proofs stores:

order_id
uploader_id
file_url
file metadata
review result

---

# 7. Download authorization

Download allowed only if:

order.status = approved

AND

material exists in order_items

---

# 8. Review permission

User may review material only if:

approved order exists

AND

material exists in order_items

---

# 9. Audit requirement

All critical actions must generate activity_logs.

Examples:

material_created
material_updated
material_published
order_created
payment_proof_uploaded
order_approved
order_rejected
download_attempt
download_success
download_denied
review_created
report_created