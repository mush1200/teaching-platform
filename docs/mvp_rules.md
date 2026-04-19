# MVP Rules

# 0. 資料庫連線資訊
host localhost
database postgres
port 5432
username postgres
password 123456

# 1. Authentication

JWT required for protected routes.

---

# 2. Role boundaries

Teacher:

create material
edit own material
view own materials

Cannot:

approve orders
review payment proofs

---

Parent:

browse published materials
add to cart
create order
upload payment proof
download approved materials
review purchased materials
report materials

Cannot:

download unapproved materials
review unpurchased materials
approve orders

---

Admin:

review materials
approve orders
reject orders
view reports
view activity logs

---

# 3. Material visibility rules

published:

visible to parents

pending_review:

visible only to teacher and admin

unpublished:

hidden from parents

---

# 4. Order state transitions

allowed:

pending -> proof_uploaded

proof_uploaded -> approved

proof_uploaded -> rejected

not allowed:

pending -> approved
pending -> rejected

approved -> pending

---

# 5. Download authorization rule

ALLOW if:

approved order exists
AND order_item exists

DENY if:

not owner
order not approved
material not in order
material not found

---

# 6. Review authorization rule

ALLOW if:

approved order exists
AND material in order_items

DENY if:

not purchased
order not approved

---

# 7. Activity log required events

material_created
material_updated
material_published
material_unpublished

cart_item_added
cart_item_removed

order_created

payment_proof_uploaded

order_approved
order_rejected

download_attempt
download_success
download_denied

review_created

report_created