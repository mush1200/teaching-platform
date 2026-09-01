-- Canonical schema snapshot aligned with Backend/models/bootstrapModel.js
-- (ensureCoreTables + runIdempotentMigrations).
-- Deployed DBs may include extra indexes/constraints from Backend/migrations/*.sql.
-- Spec: docs/teaching-platform-mvp-spec-v1.4.md
-- Product rules & HTTP semantics (e.g. material lifecycle, audit action names, POST /materials body):
--   docs/teaching-platform-mvp-spec-v1.4.md, docs/mvp_rules.md
-- This file describes DDL only; no schema migration is required for those rules.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Core domain tables (TEXT primary keys)
-- 2026-08-26 起 activity_logs.id 也是 TEXT UUID（`SCHEMA-01`）——
-- 本檔先前記載的 BIGSERIAL 例外與實際資料庫不符，已對齊實況。
-- ---------------------------------------------------------------------------

-- Canonical role is `buyer`; `parent` is kept as a transitional legacy value only.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 帳號凍結（P1-09 Gate 1，2026-08-26）。應記載事項第十二點要求
  -- 「知悉帳號密碼被冒用時，**立即**暫停該帳號所生交易之處理及後續利用」。
  --
  -- 只有兩個狀態 —— Phase 1 需要回答的只有「這個帳號現在能不能產生新的敏感交易」。
  --
  -- **狀態必須即時查 DB，不得放進 JWT**：`middlewares/auth.js` 的 `requireAuth`
  -- 完全不碰 DB，而 JWT 有效期 7 天；把狀態塞進 token 會讓凍結延遲至多 7 天生效，
  -- 直接違反「立即」的要求。強制點見 `middlewares/accountStatus.js`。
  --
  -- **與 `orders.status` 正交**：帳號凍結不得以改動訂單狀態為之。
  account_status TEXT NOT NULL DEFAULT 'active',
  frozen_at TIMESTAMP,
  frozen_by TEXT REFERENCES users(id),
  freeze_reason TEXT,
  unfrozen_at TIMESTAMP,
  unfrozen_by TEXT REFERENCES users(id),

  CONSTRAINT users_role_check CHECK (role IN ('teacher', 'parent', 'buyer', 'admin')),
  CONSTRAINT users_account_status_check CHECK (account_status IN ('active', 'frozen'))
);

CREATE INDEX IF NOT EXISTS idx_users_account_status_not_active
  ON users (account_status) WHERE account_status <> 'active';

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  age_range TEXT,
  teaching_objective TEXT,
  teaching_methods JSONB,
  usage_duration TEXT,
  activity_steps TEXT,
  extension_value TEXT,
  short_description TEXT,
  material_features TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  demo_video_url TEXT,
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  -- LEGACY placeholder（創作者手打的字串，不對應任何實際檔案）。
  -- 教材本體的 canonical 來源是 approved_file_id / pending_file_id；
  -- 新流程完全不讀 file_key，新建教材此欄為 NULL。保留僅為既有資料與相容性。
  -- 註：實際資料庫此欄為 nullable（NOT NULL 只曾存在於舊的應用層驗證）。
  file_key TEXT,
  -- 教材本體檔案指標。見 docs/material-file-storage-and-delivery.md。
  --   approved_file_id 買家實際下載到的檔案 —— **只有 Admin 核准流程能寫入**
  --   pending_file_id  待審候選檔 —— Buyer 永遠拿不到
  -- 兩者分離讓「核准」成為一次純指標交換，可與 status 變更原子完成。
  -- FK 在 material_files 建立之後才以 ALTER 加上（見下方），避免前向參照。
  approved_file_id TEXT,
  pending_file_id TEXT,
  ip_declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ip_declaration_at TIMESTAMP,
  -- Latest review decision snapshot（**不是** review history）。
  -- 每次新的審核決定都會覆寫這四個欄位；完整歷史的 canonical source 是
  -- activity_logs（target_type = 'material'）。見 docs/material-review-workflow.md §3。
  review_reason_code TEXT,
  review_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  -- **首次**成功公開的時間（不是 last_published_at）。應用層只在它為 NULL 時寫入；
  -- 之後的重新公開時間由 activity_logs 的 material.published 事件保存。
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 教材審核 workflow（docs/material-review-workflow.md）。
  -- changes_requested = 需修改（從未公開過、球在創作者手上）；
  -- unpublished = 曾經上架、被平台下架（目前唯一來源是檢舉處置）。兩者不得混用。
  CONSTRAINT materials_status_check CHECK (status IN ('pending_review', 'published', 'changes_requested', 'unpublished')),
  CONSTRAINT materials_review_reason_check CHECK (review_reason_code IS NULL OR review_reason_code IN (
    'incomplete_info', 'media_quality', 'features_mismatch', 'file_problem', 'ip_concern', 'other'
  ))
);

-- 教材本體檔案。每一列對應一個**實際存在於私有儲存的物件**，包含尚未附加到
-- 教材的上傳（status = 'unattached'），因此 orphan 清理是一句 SQL 而非掃檔案系統。
-- storage_key 為 opaque 值（`material-files/<uuid>`），**永不對 Buyer / 公開 API 外流**。
CREATE TABLE IF NOT EXISTS material_files (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  -- upload-first flow：上傳當下還沒有教材，因此可為 NULL。
  material_id       TEXT REFERENCES materials(id) ON DELETE CASCADE,
  storage_key       TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  -- 上傳時串流計算（不把整個檔案讀進記憶體）。
  checksum_sha256   TEXT,
  status            TEXT NOT NULL DEFAULT 'unattached',
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at       TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  -- unattached 已上傳未附加／candidate 待審（Buyer 拿不到）／approved 目前交付中／
  -- superseded 被同一教材的後續檔案取代，含未經核准就被替換掉的候選（保留供稽核）／
  -- revoked 平台停止交付
  CONSTRAINT material_files_status_check CHECK (status IN (
    'unattached', 'candidate', 'approved', 'superseded', 'revoked'
  )),
  CONSTRAINT material_files_size_check CHECK (size_bytes > 0),
  CONSTRAINT material_files_attachment_check CHECK (
    (status = 'unattached' AND material_id IS NULL)
    OR (status <> 'unattached' AND material_id IS NOT NULL)
  ),

  -- Legal hold（P1-09 Gate 14，2026-08-26）。
  -- 只回答一個問題：「這個檔案現在能不能被**實體刪除**」。
  -- 掛在這張表而不是獨立 hold 表，是因為 repo 既有 pattern 就是
  -- 「current snapshot 欄位 ＋ activity_logs 歷程」（見 users.account_status）；
  -- 歷程走 activity_logs（target_type = 'material_file'）。
  --
  -- **刻意沒有 `retention_until`：** 保存年限尚無 authoritative source
  -- （待 RETENTION-MATRIX ／ External Legal / Tax Gate）。加了只有兩種下場 ——
  -- 全部 NULL 而在 fail-closed 下擋掉一切清理，或把 NULL 當成「無保存義務」。
  -- 兩者都是用預設值假裝知道答案。本輪只建立「何時一定不能刪」的下限。
  --
  -- **解除 hold 不清空 `hold_reason` / `hold_set_at` / `hold_set_by`** —— 那是稽核軌跡。
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  hold_reason TEXT,
  hold_set_at TIMESTAMP,
  hold_set_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  hold_released_at TIMESTAMP,
  hold_released_by TEXT REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT material_files_hold_requires_reason CHECK (
    legal_hold = FALSE
    OR (hold_reason IS NOT NULL AND btrim(hold_reason) <> '' AND hold_set_at IS NOT NULL)
  ),
  CONSTRAINT material_files_hold_release_requires_set CHECK (
    hold_released_at IS NULL OR hold_set_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_material_files_legal_hold
  ON material_files (legal_hold) WHERE legal_hold = TRUE;

-- materials 的兩個指標在此補上 FK（material_files 已存在）。
ALTER TABLE materials
  ADD CONSTRAINT materials_approved_file_fkey
  FOREIGN KEY (approved_file_id) REFERENCES material_files(id) ON DELETE SET NULL;
ALTER TABLE materials
  ADD CONSTRAINT materials_pending_file_fkey
  FOREIGN KEY (pending_file_id) REFERENCES material_files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_materials_approved_file ON materials(approved_file_id);
CREATE INDEX IF NOT EXISTS idx_materials_pending_file ON materials(pending_file_id);

-- 審核隔離的資料庫層保證：一份教材最多一個 approved、一個 candidate。
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_one_approved
  ON material_files(material_id) WHERE status = 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_one_candidate
  ON material_files(material_id) WHERE status = 'candidate';
CREATE INDEX IF NOT EXISTS idx_material_files_material ON material_files(material_id);
CREATE INDEX IF NOT EXISTS idx_material_files_unattached ON material_files(status, uploaded_at);

-- 一次性下載 token。**存在 DB 而非記憶體**：記憶體版重啟即全失效、多實例不成立。
-- 只保存 SHA-256 雜湊，資料庫外洩不會直接變成可用的下載連結。
CREATE TABLE IF NOT EXISTS material_download_tokens (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  file_id     TEXT NOT NULL REFERENCES material_files(id) ON DELETE CASCADE,
  expires_at  TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_download_tokens_expiry ON material_download_tokens(expires_at);

CREATE TABLE IF NOT EXISTS material_images (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  -- 詳情圖的 URL。可以是平台素材的交付 URL（`/materials/media/<id>`，
  -- 對應 material_media_files 的一列）或創作者自填的外部 CDN 連結 —— 兩者都合法。
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 教材**行銷素材**（封面／詳情圖／試看影片）的私有儲存 metadata。
-- 見 docs/material-file-storage-and-delivery.md §24 與 docs/mvp_rules.md §3.1。
--
-- 三種檔案資產裡只有這一種是**條件公開**：可見性由所屬教材的 `status` 決定
-- （published 匿名可取，其餘只有教材擁有者或 Admin），而不是由目錄位置決定。
-- 這張表存在的理由就是「可查詢的素材→教材關聯」—— 少了它，`cover_image_url`
-- 只是自由文字，交付時無從判斷該不該放行，只能整個目錄公開或整個關掉。
CREATE TABLE IF NOT EXISTS material_media_files (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  -- upload-first flow：上傳當下可能還沒有教材，因此可為 NULL（= 尚未認領）。
  -- 未認領的素材只有上傳者或 Admin 看得到。
  material_id       TEXT REFERENCES materials(id) ON DELETE CASCADE,
  -- cover / detail / demo。決定允許的型別與大小上限
  -- （canonical: Backend/utils/materialMediaPolicy.js）。
  kind              TEXT NOT NULL,
  storage_key       TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  checksum_sha256   TEXT,
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  claimed_at        TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT material_media_files_kind_check CHECK (kind IN ('cover', 'detail', 'demo')),
  CONSTRAINT material_media_files_size_check CHECK (size_bytes > 0),
  CONSTRAINT material_media_files_claim_check CHECK (
    (material_id IS NULL AND claimed_at IS NULL)
    OR (material_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_material_media_files_material ON material_media_files(material_id);
CREATE INDEX IF NOT EXISTS idx_material_media_files_unclaimed
  ON material_media_files(uploaded_at) WHERE material_id IS NULL;

CREATE TABLE IF NOT EXISTS material_contents (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER CHECK (count > 0),
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT uq_cart_items_user_material UNIQUE (user_id, material_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_mode TEXT NOT NULL DEFAULT 'manual_transfer',
  total_amount INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER,
  promo_code TEXT,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  invoice_type TEXT NOT NULL DEFAULT 'none',
  invoice_carrier TEXT,

  -- `paid_at` 的語意是「**Admin 核准相關時間戳**」，不是銀行入帳時間。
  -- 唯一寫入點是 `routes/admin.js` 的憑證核准（`paid_at = NOW()`），
  -- 且它是 adminDashboard / adminTrends / teacherSales 的**營收認列依據**。
  -- 2026-08-26 起旁邊多了四個語意明確的欄位，但 `paid_at` **維持原義不變**。
  paid_at TIMESTAMP,

  -- 付款／核帳時間模型（P1-09 Gate 6 / Gate 11，2026-08-26）。四者不得互相替代：
  --   payment_due_at            Buyer 該訂單最晚付款期限
  --   payment_info_submitted_at Buyer 向平台提交付款辨識資訊的時間 → review SLA 的**起算點**
  --   review_due_at             平台人工付款審核期限（= payment_info_submitted_at + SLA）
  --   payment_received_at       平台銀行帳戶**實際**收到款項的時間 → 稅務憑證時點依此
  --
  -- `review_due_at` **不得**以 `payment_received_at` 起算 —— 後者是 Admin 查帳時
  -- 才發現的過去時間，從它起算會變成回溯計算。
  --
  -- 期限「存下來」而非即時計算，是因為它是**對買家揭露過的承諾**；
  -- 政策日後調整不得追溯變動既有訂單。
  --
  -- 歷史列一律 NULL。**絕不以 `paid_at` 回填 `payment_received_at`** ——
  -- 那會製造「系統知道銀行何時入帳」的假歷史證據。
  -- `payment_due_at` / `review_due_at` 的**數值**（幾小時／幾天）尚未由產品拍板。
  payment_due_at TIMESTAMP,
  payment_info_submitted_at TIMESTAMP,
  review_due_at TIMESTAMP,
  payment_received_at TIMESTAMP,

  cancelled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT orders_invoice_type_check CHECK (invoice_type IN ('none', 'carrier')),
  -- 「已經發生的事」不可能在未來；擋掉「拿系統當下時間硬填」之類的錯誤寫入。
  CONSTRAINT orders_payment_received_not_future_check CHECK (
    payment_received_at IS NULL OR payment_received_at <= NOW() + INTERVAL '1 day'
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_review_due_at
  ON orders (review_due_at) WHERE review_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_due_at
  ON orders (payment_due_at) WHERE payment_due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
  value INTEGER NOT NULL CHECK (value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,
  price_snapshot NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  seller_id TEXT REFERENCES users(id),
  subtotal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 獨立的授權狀態（P1-09 Gate 14）。**與 `orders.status` 正交** ——
  -- 撤銷單一買家對單一教材的存取，不得以改動訂單狀態為之。
  --   active          正常，可交付
  --   suspended       暫停交付，可恢復
  --   revoked_pending 因退款／解除／法律流程暫停，仍可能恢復或需稽核
  --   revoked_final   流程已完結，平台確定不再恢復
  -- revoke 的語意是「暫停未來交付」，**不是刪除本列**（稽核與爭議舉證仍需要它）。
  entitlement_status TEXT NOT NULL DEFAULT 'active',
  access_suspended_at TIMESTAMP,
  access_suspended_by TEXT REFERENCES users(id),
  access_suspension_reason TEXT,
  access_restored_at TIMESTAMP,
  access_restored_by TEXT REFERENCES users(id),

  -- 履約版本快照（P1-09 Gate 7 / PRE-04.1）。
  -- 這張表本來就有 title_snapshot / price_snapshot，缺的只是「交付了哪個檔案版本」。
  -- ON DELETE RESTRICT 是 ENTITLEMENT-RETENTION-INVARIANT 的 DB 層表達：
  -- 只要還有品項指向某版本，該版本就不得實體刪除；要停止提供改設
  -- `material_files.status = 'revoked'`。
  -- 既有列為 NULL —— 合法的 legacy 狀態（成立當時系統尚未記錄），**不回填猜測值**。
  fulfilled_material_version_id TEXT REFERENCES material_files(id) ON DELETE RESTRICT,
  fulfilled_at TIMESTAMP,

  UNIQUE (order_id, material_id),
  CONSTRAINT order_items_entitlement_status_check CHECK (
    entitlement_status IN ('active', 'suspended', 'revoked_pending', 'revoked_final')
  ),
  -- 只是無爭議的下限。**這不是 E2-A**（同一買家不得就同一教材重複購買取得第二份授權）
  -- —— 那是跨訂單規則，無法以單列 CHECK 表達，屬建立訂單路徑的檢查。
  CONSTRAINT order_items_quantity_positive_check CHECK (quantity >= 1)
);

-- 非 active 的品項可被快速盤點（稽核用）。
CREATE INDEX IF NOT EXISTS idx_order_items_entitlement_not_active
  ON order_items (entitlement_status)
  WHERE entitlement_status <> 'active';

CREATE TABLE IF NOT EXISTS manual_payment_proofs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- `proof_url` 為 **legacy 指標**：milestone 之前憑證存在公開的
  -- `Backend/uploads/payment-proofs/`，這裡放的是它的公開 URL。
  -- 新憑證一律走私有儲存（`storage_key`），不再產生 URL，因此本欄可為 NULL。
  -- 保留而不 DROP：搬移後它仍是「這一列原本來自哪個公開檔案」的稽核痕跡。
  proof_url TEXT,
  -- 私有儲存的 opaque key（`payment-proofs/<uuid>`）。
  -- **不得出現在任何 API 回應或 log**，與 `material_files.storage_key` 同規則。
  storage_key TEXT,
  checksum_sha256 TEXT,
  -- 位元組在哪裡。private 是唯一可交付的狀態；三個 legacy_* 值只描述舊資料。
  storage_status TEXT NOT NULL DEFAULT 'legacy_public',
  uploaded_by TEXT REFERENCES users(id),
  proof_mime_type TEXT,
  proof_size_bytes INTEGER,
  original_filename TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  -- `note` 為自由文字（核准備註／退件補充說明／系統註記）。
  -- `rejection_reason` 為結構化的退件原因 code；退件時必填（app 層驗證，見 docs/mvp_rules.md §12.2）。
  note TEXT,
  rejection_reason TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  uploaded_at TIMESTAMP,

  -- 買家自行申報的付款辨識資訊（P1-09 Gate 6，2026-08-26）。
  -- **`reported_` 前綴是刻意的**：這些是買家**申報**的值，不是平台查證後的事實。
  -- 兩者不得混用 —— 付款爭議中平台不得把自己的紀錄當成唯一認定依據
  -- （網路交易定型化契約「不得記載事項」第七點）。
  -- 放在憑證列而非訂單列：一筆訂單可能多次提交（退件後重傳），
  -- 每次申報內容可能不同，而那個歷程本身就是爭議處理的證據。
  reported_bank_name TEXT,
  reported_account_last4 TEXT,
  reported_amount INTEGER,
  reported_transfer_at TIMESTAMP,
  updated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mpp_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT mpp_rejection_reason_check CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'amount_mismatch', 'unreadable', 'payment_not_found', 'invalid_proof', 'other'
  )),
  CONSTRAINT mpp_storage_status_check CHECK (storage_status IN (
    'private', 'legacy_public', 'legacy_external', 'legacy_missing'
  )),
  -- 宣稱已搬移就必須真的有 key，否則會產生「看起來已保護、實際讀不到」的列。
  CONSTRAINT mpp_private_requires_storage_key CHECK (
    storage_status <> 'private' OR storage_key IS NOT NULL
  ),
  CONSTRAINT mpp_reported_last4_check CHECK (
    reported_account_last4 IS NULL OR reported_account_last4 ~ '^[0-9]{4}$'
  ),
  CONSTRAINT mpp_reported_amount_check CHECK (
    reported_amount IS NULL OR reported_amount > 0
  )
);

CREATE TABLE IF NOT EXISTS review (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, parent_id)
);

-- Moderation case。狀態機的 canonical 定義在 Backend/utils/reportWorkflow.js
-- （docs/mvp_rules.md §6）。`reviewed` 為 legacy 終態，保留於 allowlist 且不回填。
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolution TEXT,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reports_status_check CHECK (status IN (
    'pending', 'investigating', 'awaiting_creator', 'resolved', 'dismissed', 'reviewed'
  )),
  CONSTRAINT reports_resolution_check CHECK (resolution IS NULL OR resolution IN (
    'dismissed', 'warning', 'request_changes', 'unpublish_material'
  )),
  UNIQUE (material_id, reporter_id)
);

-- 案件歷程 / 溝通串。Admin 的處理歷程與 Creator 的補充說明寫在同一張表，時間軸只有一份。
-- 與 activity_logs 分工：activity_logs 是全平台稽核軌跡，report_events 是案件內容
-- （會顯示給創作者看；`admin_note` 除外，Creator 端 API 會過濾）。
CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_events_type_check CHECK (event_type IN (
    'status_changed', 'admin_note', 'creator_response_requested', 'creator_response', 'resolution'
  ))
);

-- ---------------------------------------------------------------------------
-- 消費申訴（P1-09 Gate 3，2026-08-26）
-- ---------------------------------------------------------------------------
-- 消保法 §43 II：企業經營者對於消費者之申訴，應於申訴之日起**十五日內妥適處理之**。
--
-- **三種 case 不得互相取代：**
--   `reports`              → 針對**教材內容**的檢舉（提出者可能不是買家，結論是 moderation）
--   `consumer_complaints`  → 買家對**自己的交易**提出的申訴（本表）
--   `refund_remedy_cases`  → 平台對某筆交易建立的補救／退款處理
--
-- `reports` 結構上就承接不了消費申訴：`material_id NOT NULL`（付款爭議不指向教材）、
-- `UNIQUE (material_id, reporter_id)` 一人一材一次、resolution 全是 moderation 結果、
-- 無訂單關聯、無 SLA。
--
-- **Complaint 是上游，Remedy 是下游：**
--   Buyer 申訴 → Admin 受理與回覆 → **若**需要退款 → 由人另建 `refund_remedy_case`
-- **不自動建立** —— 是否應退款是個案判斷。`related_remedy_case_id` 由人判斷後才寫入。
--
-- **`resolved` ≠ 已退款。** 錢是否退回的唯一來源是 `refund_remedy_cases.refund_paid_at`。
CREATE TABLE IF NOT EXISTS consumer_complaints (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  -- 申訴人永遠是提出者本人；指定訂單時另行驗證是本人的訂單。
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- 可選：帳號層級的爭議（例如「我的帳號被冒用」）不指向任何訂單。
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,

  complaint_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',

  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  review_started_at TIMESTAMP,
  responded_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,

  -- 消保法 §43 II 的十五日期限。**由 `utils/complaintSla.js` 單一計算**，
  -- 建立時寫入後不再改（改了就不是「申訴之日起」了）。
  -- **刻意沒有第二、第三個 SLA 欄位** —— baseline `N2` 只鎖定這一個數字，
  -- 再造欄位就必須填沒有法源的期限。
  statutory_due_at TIMESTAMP NOT NULL,

  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_summary TEXT,
  related_remedy_case_id TEXT REFERENCES refund_remedy_cases(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT cc_type_check CHECK (complaint_type IN (
    'payment', 'delivery', 'download', 'material_mismatch',
    'duplicate_payment', 'refund_request', 'account_security', 'other'
  )),
  CONSTRAINT cc_status_check CHECK (status IN (
    'submitted', 'under_review', 'responded', 'resolved', 'closed'
  )),
  CONSTRAINT cc_item_requires_order CHECK (order_item_id IS NULL OR order_id IS NOT NULL),
  CONSTRAINT cc_subject_not_blank CHECK (btrim(subject) <> ''),
  CONSTRAINT cc_statement_not_blank CHECK (btrim(statement) <> ''),
  -- 結案必須說得出處理結果 —— 沒有結論的「已處理」無法證明「妥適處理之」。
  CONSTRAINT cc_resolved_requires_summary CHECK (
    status NOT IN ('resolved', 'closed')
    OR (resolution_summary IS NOT NULL AND btrim(resolution_summary) <> '')
  ),
  CONSTRAINT cc_resolved_requires_timestamp CHECK (
    status <> 'resolved' OR resolved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_cc_buyer ON consumer_complaints (buyer_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_order ON consumer_complaints (order_id, submitted_at DESC);
-- 逾期偵測：未結案且已過法定期限，一句 SQL（不是把全表撈出來過濾）。
CREATE INDEX IF NOT EXISTS idx_cc_open_due ON consumer_complaints (statutory_due_at)
  WHERE status IN ('submitted', 'under_review', 'responded');

-- 案件歷程／溝通串。與 `activity_logs` 的分工同 `report_events`：
-- `activity_logs` 是全平台稽核軌跡，這裡是**會顯示給申訴人看的**案件內容
-- （`internal_note` 除外，Buyer 端 API 會過濾）。
CREATE TABLE IF NOT EXISTS consumer_complaint_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  complaint_id TEXT NOT NULL REFERENCES consumer_complaints(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cce_type_check CHECK (event_type IN (
    'submitted', 'status_changed', 'internal_note', 'response_to_buyer',
    'buyer_message', 'evidence_added', 'resolution'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cce_complaint ON consumer_complaint_events (complaint_id, created_at);

-- 買家提供的外部證據（`N3`）。
-- **付款爭議不得只以平台自己的紀錄為唯一認定依據**（`R7`／不得記載事項第七點）。
--
-- 共用 `storage/privateFileStorage.js` 的 filesystem primitives（namespace
-- `complaint-evidence`），但**不共用授權模型**，也**刻意不重用**
-- `manual_payment_proofs` —— 那張表的語意是「這筆訂單的付款憑證，審核通過會讓訂單核准」，
-- 把申訴附件塞進去會讓一張爭議截圖進入付款核准佇列。
--
-- `storage_key` / `checksum_sha256` **不得出現在任何 API 回應或 log**。
CREATE TABLE IF NOT EXISTS consumer_complaint_evidence (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  complaint_id TEXT NOT NULL REFERENCES consumer_complaints(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- 二選一：實際附件（`storage_key`）或純文字外部參照
  -- （例如「已向 XX 市消費者服務中心申訴，案號 …」）。
  storage_key TEXT UNIQUE,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum_sha256 TEXT,
  external_reference TEXT,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cce_evidence_has_content CHECK (
    storage_key IS NOT NULL
    OR (external_reference IS NOT NULL AND btrim(external_reference) <> '')
  ),
  -- 有 key 就必須有完整 metadata，否則會產生「看起來有附件、實際讀不到」的列。
  CONSTRAINT cce_evidence_file_complete CHECK (
    storage_key IS NULL
    OR (original_filename IS NOT NULL AND mime_type IS NOT NULL
        AND size_bytes IS NOT NULL AND size_bytes > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_cce_evidence_complaint
  ON consumer_complaint_evidence (complaint_id, created_at);

CREATE TABLE IF NOT EXISTS user_favorites (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, material_id)
);

-- 全平台稽核軌跡。
--
-- ## `id` 是 identity，**不是 time**
--
-- `id` 是 UUID（`gen_random_uuid()::text`），**不單調遞增**。因此：
--
--   ❌ `ORDER BY id`｜❌ `MAX(id)` 當最新事件｜❌ `WHERE id > $lastId` 當 cursor
--   ✅ `ORDER BY created_at DESC, id DESC`（`id` 只是 deterministic tie-breaker）
--
-- `CURRENT_TIMESTAMP` 是**交易開始時間**，所以同一 transaction 內寫入的多筆事件會拿到
-- 相同的 `created_at`。目前所有寫入都經 `utils/activityLog.js` 各自成交易，實測
-- 同秒重複為 0 組。若日後真的需要單一交易內的先後，**不得**改用 `id` 排序（UUID 無序），
-- 應加序號欄位或改用 `clock_timestamp()`。
--
-- ## 2026-08-26 schema 收斂（`SCHEMA-01`）
--
-- 本檔先前宣告 `id BIGSERIAL PRIMARY KEY`、`target_id` 與 `created_at` 可為 NULL、
-- 且未記載 `actor_id` 的 FK —— 但**兩個實際資料庫都不是那樣**。
-- `CREATE TABLE IF NOT EXISTS` 永遠不會修正既存表，因此舊定義只會讓**新環境**
-- 拿到與所有既有環境不同的 schema，而兩邊都「看起來正常」。
--
-- canonical 已改為**對齊既有實況**（理由見
-- `Backend/migrations/20260826_activity_logs_schema_reconciliation.sql` 的說明；
-- 關鍵是轉成 BIGSERIAL 會改寫既有稽核列的 identity，違反 CLAUDE.md §4.4）。
--
-- `Backend/models/bootstrapModel.js` 的 `verifyCriticalSchema()` 會在啟動時檢查
-- `id` 的型別，**偵測到 drift 就 fail-closed**，不自動修改既存表。
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Typical indexes created by migrations / bootstrap (idempotent elsewhere)
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_order ON manual_payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_status ON manual_payment_proofs(review_status);
CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_storage_status ON manual_payment_proofs(storage_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_payment_proofs_storage_key
  ON manual_payment_proofs(storage_key) WHERE storage_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_material_id ON review(material_id);
CREATE INDEX IF NOT EXISTS idx_review_parent_id ON review(parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_material_id ON reports(material_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_events_report_id ON report_events(report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_contents_material_id ON material_contents(material_id);
CREATE INDEX IF NOT EXISTS idx_material_images_material_id ON material_images(material_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_material_id ON user_favorites(material_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 退款／補救案件（P1-09 Gate 14，2026-08-26）
-- ---------------------------------------------------------------------------
-- 承接法定解除、重複付款、履約瑕疵、教材下架、平台未履約等消費者救濟情形。
--
-- **不重用 `reports`**：那在語意上只是**內容檢舉**（`material_id NOT NULL`、
-- `UNIQUE (material_id, reporter_id)` 一人一材一次、resolution 全是 moderation 結果、
-- 無金額也無訂單關聯，owner 是檢舉人而非買家）。兩種流程的 owner／對象／結論／
-- 唯一性全部不同，共用會讓語意立刻崩壞。
--
-- **三個刻意的分離：**
--   1. 與 `orders.status` 分離 —— 建立或核准案件**不改動訂單狀態機**。
--   2. 與 entitlement 分離 —— `entitlement_action` 只記錄「應該做什麼」，
--      **不自動執行**；實際轉移一律經 `services/entitlement.service.js` 由人明示操作。
--   3. 與稅務憑證分離 —— 憑證沖銷是 `P14` 的另一條流程，其三維決策樹尚待會計師填寫，
--      **本表刻意不含 tax 欄位**（為形狀未知的流程預留欄位只會猜錯）。
--
-- **`approved` ≠ 退款完成**：狀態機讓 `approved` 必須再經 `remedy_pending`
-- 才能到 `completed`，且 `rrc_refund_paid_requires_completed` 擋住
-- 「未完成卻已有退款時間」。「責任已核准」與「錢真的退了」是兩件事。
--
-- **本輪不執行任何實際匯款** —— `refund_method` / `refund_reference` / `refund_paid_at`
-- 是人工銀行退款的**紀錄位置**（Phase 1 不要求自動退款 API）。
CREATE TABLE IF NOT EXISTS refund_remedy_cases (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  -- 可選：整張訂單的問題（例如重複付款）不指向特定品項。
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  -- 建立時自訂單帶入（不信任呼叫端），讓「這個案件屬於誰」成為可直接稽核的事實。
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- 案件類型即分類原因。**刻意不另設 `reason_code`** —— 兩個高度重疊的 enum
  -- 只會讓語意分裂；買家自己的描述放 `buyer_statement`。
  case_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  review_started_at TIMESTAMP,
  decision_at TIMESTAMP,
  completed_at TIMESTAMP,
  requested_amount INTEGER,
  approved_amount INTEGER,
  -- 人工銀行退款的**執行**紀錄（Wave 2 #5）。系統不匯錢 —— Admin 在行外完成後
  -- 於此保存稽核憑據。`refund_amount` 與 `approved_amount` **刻意分離**：
  -- 核准 100 而實退 80（部分補救）是真實情況，同欄位表示會讓對帳答不出差額。
  -- 執行者沿用既有的 `completed_by`，不另造 `executed_by`。
  refund_amount INTEGER,
  refund_method TEXT,
  refund_reference TEXT,
  refund_paid_at TIMESTAMP,
  buyer_statement TEXT,
  admin_note TEXT,
  evidence_reference TEXT,
  -- 只記錄意圖，不自動執行。
  entitlement_action TEXT,
  -- 未來與 `P10` Creator 報酬帳的關聯點；`P10` ledger 尚不存在，故無 FK。
  related_creator_adjustment_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT rrc_case_type_check CHECK (case_type IN (
    'statutory_rescission', 'duplicate_payment', 'wrong_material',
    'corrupted_or_unusable_file', 'access_failure', 'material_takedown',
    'platform_nonperformance', 'other'
  )),
  CONSTRAINT rrc_status_check CHECK (status IN (
    'requested', 'under_review', 'approved', 'rejected', 'remedy_pending', 'completed', 'cancelled'
  )),
  CONSTRAINT rrc_entitlement_action_check CHECK (
    entitlement_action IS NULL OR entitlement_action IN (
      'no_action', 'suspend', 'restore', 'revoke_pending', 'revoke_final'
    )
  ),
  CONSTRAINT rrc_amounts_positive_check CHECK (
    (requested_amount IS NULL OR requested_amount > 0)
    AND (approved_amount IS NULL OR approved_amount > 0)
  ),
  CONSTRAINT rrc_item_requires_order CHECK (order_item_id IS NULL OR order_id IS NOT NULL),
  CONSTRAINT rrc_refund_paid_requires_completed CHECK (
    refund_paid_at IS NULL OR status = 'completed'
  ),
  CONSTRAINT rrc_refund_amount_positive CHECK (refund_amount IS NULL OR refund_amount > 0),
  -- 實退不得超過核准；`approved_amount IS NULL`（＝非金錢補救）時根本不得有銀行退款金額。
  CONSTRAINT rrc_refund_within_approved CHECK (
    refund_amount IS NULL
    OR (approved_amount IS NOT NULL AND refund_amount <= approved_amount)
  ),
  -- Phase 1 只有一種退款方式。free text 會讓稽核出現三種寫法指同一件事。
  CONSTRAINT rrc_refund_method_check CHECK (
    refund_method IS NULL OR refund_method = 'manual_bank_transfer'
  ),
  -- **執行證據是原子的**：四欄全 NULL（未執行）或全具備且案件已完成。
  -- 擋掉「先標 completed、之後再補 payment reference」——
  -- 那會讓帳上出現一段「宣稱已退款但拿不出憑據」的期間。
  CONSTRAINT rrc_refund_execution_atomic CHECK (
    (refund_paid_at IS NULL AND refund_reference IS NULL
       AND refund_amount IS NULL AND refund_method IS NULL)
    OR (refund_paid_at IS NOT NULL AND refund_reference IS NOT NULL
       AND refund_amount IS NOT NULL AND refund_method IS NOT NULL
       AND status = 'completed')
  ),
  -- 反向：已核准**金錢**退款的案件不得在無付款證據時被標成完成。
  -- 非金錢補救（`approved_amount IS NULL`，例如重新交付）不受此限。
  CONSTRAINT rrc_cash_completion_requires_evidence CHECK (
    status <> 'completed' OR approved_amount IS NULL OR refund_paid_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_rrc_executed
  ON refund_remedy_cases (refund_paid_at DESC) WHERE refund_paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rrc_order ON refund_remedy_cases (order_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrc_buyer ON refund_remedy_cases (buyer_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrc_open ON refund_remedy_cases (status)
  WHERE status IN ('requested', 'under_review', 'approved', 'remedy_pending');

-- ---------------------------------------------------------------------------
-- 教材權利審查記錄（P1-09 Gate 2 / D5，2026-08-26）
-- ---------------------------------------------------------------------------
-- 「平台對這份教材的**權利風險**做過什麼審查、發現什麼、依據什麼證據」。
--
-- **與三個既有結構刻意分開：**
--   `materials.ip_declaration_*`  = **Creator 的聲明**（建立時 request 須明確帶 true，但無文件版本）
--   `materials.reviewed_*`        = **一般內容審核**的 latest snapshot（會被覆寫，非 history）
--   `report_cases`/`report_events` = **買家檢舉**（上架後）
--   `material_rights_reviews`     = **Platform 的權利審查**（本表，append-only history）
--
-- 一般內容審核 **≠** 法律權利審查。若合併，「核准上架」就會等同於
-- 「權利審查通過」—— Platform-as-Seller 下平台自身的交付行為不受 ISP 免責事由保護，
-- 權利審查是平台自己的防線，不能是狀態機的副作用。
--
-- **append-only**：改變結論時寫一筆新記錄（trigger `trg_mrr_reject_rewrite` 強制）。
-- 連 notes 都不得修改 —— 「當時審查者寫了什麼」本身就是盡職證據。
-- **只擋 UPDATE、不擋 DELETE**（保存期限屬 RETENTION-MATRIX，尚未拍板）。
--
-- **既有教材無審查記錄，且不 backfill** —— 假造「已審查」等於製造假的盡職證據。
CREATE TABLE IF NOT EXISTS material_rights_reviews (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by TEXT NOT NULL REFERENCES users(id),
  review_result TEXT NOT NULL,
  risk_flags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  -- 可為 NULL：目前沒有任何經核可的聲明文字與版本，硬填會製造假證據。
  declaration_version TEXT,
  -- 未來把 Creator 聲明接到 consent_records 後的關聯點；現在必為 NULL。
  declaration_consent_id TEXT REFERENCES consent_records(id) ON DELETE SET NULL,
  evidence_reference TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrr_result_check CHECK (
    review_result IN ('pending', 'approved', 'rejected', 'needs_evidence')
  ),
  CONSTRAINT mrr_risk_flags_check CHECK (
    risk_flags <@ ARRAY[
      'famous_character', 'trademark_logo', 'stock_image', 'font_license',
      'scanned_book', 'music_audio', 'portrait', 'child_identity',
      'ai_imitation', 'third_party_work', 'other'
    ]::text[]
  ),
  -- `needs_evidence` 必須說明需要什麼，否則對 Creator 是無法行動的結論。
  CONSTRAINT mrr_needs_evidence_requires_notes CHECK (
    review_result <> 'needs_evidence' OR (notes IS NOT NULL AND TRIM(notes) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_mrr_material_reviewed_at
  ON material_rights_reviews (material_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrr_result_open
  ON material_rights_reviews (review_result)
  WHERE review_result IN ('pending', 'needs_evidence');

-- ---------------------------------------------------------------------------
-- 同意證據（P1-09 Gate 5，2026-08-26）
-- ---------------------------------------------------------------------------
-- 「誰、在什麼情境、對哪一份文件的哪一個版本、在什麼時候表示同意」。
--
-- **append-only**：`accepted_at`、`document_version` 等既有事實不得被改寫
-- （由 trigger 強制，唯一可事後設定的是 `superseded_by_id`）。
-- 更正的方式是**寫一筆新記錄並讓舊列指向它**，不是改舊列。
--
-- **不擋 DELETE**：「不得改寫歷史」是 H-VERSION 的要求，「永不刪除」不是 ——
-- 同意證據有其保存期限（RETENTION-MATRIX `RM-13`；個資法 §11 III）。
--
-- **現況（2026-08-26）：本表尚未接線任何流程。** 目前 repo 沒有任何經核可的
-- 法律文件，接線只會保存「指向不存在版本」的假證據。
-- `materials.ip_declaration_accepted` / `ip_declaration_at` 為 legacy、無版本，
-- **原地保留、不搬移、不 backfill**。
CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  -- ON DELETE RESTRICT：刪除使用者前必須先依 RETENTION-MATRIX 決定證據如何處理，
  -- 不得由 CASCADE 靜默銷毀。這不是替保存期限拍板，只是要求先經過那個決定。
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_effective_date DATE,
  -- H4 要求的「內容快照」最小形式：即使版本標籤被誤用，雜湊仍能證明當時的實際文字。
  document_content_hash TEXT,
  accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  context_type TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  material_id TEXT REFERENCES materials(id) ON DELETE RESTRICT,
  superseded_by_id TEXT REFERENCES consent_records(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT consent_records_context_type_check CHECK (context_type IN (
    'registration', 'creator_agreement', 'material_declaration',
    'checkout_purchase_rules', 'checkout_rescission_notice', 'reconsent'
  )),
  CONSTRAINT consent_records_version_not_blank_check CHECK (TRIM(document_version) <> ''),
  CONSTRAINT consent_records_type_not_blank_check CHECK (TRIM(document_type) <> ''),
  CONSTRAINT consent_records_context_link_check CHECK (
    (context_type = 'material_declaration' AND material_id IS NOT NULL)
    OR (context_type IN ('checkout_purchase_rules', 'checkout_rescission_notice') AND order_id IS NOT NULL)
    OR (context_type IN ('registration', 'creator_agreement', 'reconsent'))
  )
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_document
  ON consent_records (user_id, document_type, document_version);
CREATE INDEX IF NOT EXISTS idx_consent_records_order
  ON consent_records (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consent_records_material
  ON consent_records (material_id) WHERE material_id IS NOT NULL;

-- append-only 由 trigger `trg_consent_records_reject_rewrite` 強制，
-- 定義見 Backend/migrations/20260826_consent_records_foundation.sql
-- 與 Backend/models/bootstrapModel.js。

-- ---------------------------------------------------------------------------
-- 法律文件登記表（P1-09 Legal Foundation / Gate 12 foundation，2026-08-27）
-- ---------------------------------------------------------------------------
-- 「平台目前對外生效的法律文件是哪一份、哪一版、內容是什麼」的單一事實來源。
--
-- `consent_records` 記錄的是「使用者同意了 vN」，本表定義 **vN 是什麼**。
-- 兩者的 document_type / version / hash / effective_date 型別刻意一致，
-- 未來 consent 接線時不需要型別轉換（`legalDocuments.db.test.js` 有相容性斷言）。
--
-- **現況（2026-08-27）：0 列，且 production consent 仍未接線。**
-- repo 沒有任何經核可的法律條文；registry 是空的是**預期且正確**的狀態 ——
-- 由 AI 產生條文等同偽造法律文件。沒有 published 版本時
-- `/terms` 等 public route 一律 404，不顯示 placeholder。
--
-- 三道 DB 層防線（不依賴 service 自律）：
--   1. `legal_documents_publishable_check` —— published/superseded 必須具備
--      body / content_hash / effective_date / published_at。
--   2. `legal_documents_one_published_per_type` —— partial UNIQUE index，
--      同一型別同時最多一筆 published（「兩份現行 Terms」不可能存在）。
--   3. `trg_legal_documents_immutable` —— 已發布內容不得改寫；更正只能發新版本，
--      舊版轉 superseded（仍可讀，供稽核與歷史 consent 證據）。
CREATE TABLE IF NOT EXISTS legal_documents (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  document_type TEXT NOT NULL,
  version TEXT NOT NULL,          -- opaque non-empty 版本識別碼（命名規則尚未拍板）
  body TEXT,                      -- plain text；repo 無 HTML sanitizer，不存 raw HTML
  content_hash TEXT,              -- SHA-256，server 計算，client 不得指定
  effective_date DATE,
  -- `SCHEMA-03` / `DEC-LEGAL-06`（2026-08-27）：發布此版本時，
  -- **production 是否要求既有使用者重新同意**。
  --   * **NOT NULL 且刻意無 DEFAULT** —— `DEFAULT false` 會讓發布靜默通過，
  --     事後分不出「決定不要求」與「沒人想過」。呼叫端必須顯式給 true/false。
  --   * **是 enforcement metadata，不是法律上「重大變更」之認定**
  --     （判準與判定者仍屬 `DEC-LEGAL-01` 律師側，未決）。
  --   * 因此**刻意是 BOOLEAN 而非 enum**：不得引入 material / non_material。
  --   * 與 `version` 互不推導 —— 版本號只是識別碼（`DEC-LEGAL-05`）。
  --   * 發布後由 `trg_legal_documents_immutable` 鎖死（該 trigger 是
  --     **顯式欄位白名單**，新增欄位必須同步加入，不會自動涵蓋）。
  requires_reconsent BOOLEAN NOT NULL,
  publication_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMP,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  superseded_at TIMESTAMP,
  superseded_by_id TEXT REFERENCES legal_documents(id) ON DELETE RESTRICT,
  CONSTRAINT legal_documents_type_check CHECK (document_type IN (
    'terms', 'privacy', 'creator_agreement', 'refund_policy'
  )),
  CONSTRAINT legal_documents_status_check CHECK (publication_status IN (
    'draft', 'approved', 'published', 'superseded'
  )),
  CONSTRAINT legal_documents_version_not_blank_check CHECK (TRIM(version) <> ''),
  CONSTRAINT legal_documents_hash_tracks_body_check CHECK (
    (content_hash IS NULL) = (body IS NULL)
  ),
  CONSTRAINT legal_documents_publishable_check CHECK (
    publication_status NOT IN ('published', 'superseded')
    OR (
      body IS NOT NULL AND TRIM(body) <> ''
      AND content_hash IS NOT NULL
      AND effective_date IS NOT NULL
      AND published_at IS NOT NULL
    )
  ),
  CONSTRAINT legal_documents_superseded_evidence_check CHECK (
    publication_status <> 'superseded'
    OR (superseded_at IS NOT NULL AND superseded_by_id IS NOT NULL)
  ),
  CONSTRAINT legal_documents_supersede_only_when_superseded_check CHECK (
    publication_status = 'superseded'
    OR (superseded_at IS NULL AND superseded_by_id IS NULL)
  ),
  CONSTRAINT legal_documents_approved_evidence_check CHECK (
    publication_status = 'draft' OR approved_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_type_version_key
  ON legal_documents (document_type, version);
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_one_published_per_type
  ON legal_documents (document_type) WHERE publication_status = 'published';
CREATE INDEX IF NOT EXISTS idx_legal_documents_type_status
  ON legal_documents (document_type, publication_status);

-- immutability 由 trigger `trg_legal_documents_immutable` 強制，
-- 定義見 Backend/migrations/20260827_legal_document_registry.sql
-- 與 Backend/models/bootstrapModel.js。
-- `requires_reconsent` 已納入該 trigger 的欄位白名單
-- （Backend/migrations/20260827b_legal_document_requires_reconsent.sql，`SCHEMA-03`）。
-- 既有環境須執行該 migration；bootstrap 的 `verifyCriticalSchema()` 會 fail-closed
-- 檢查此欄位存在且為 NOT NULL boolean。

-- ---------------------------------------------------------------------------
-- 個資權利請求（`OPS-04` / `DEC-LEGAL-13`，2026-08-28）
-- ---------------------------------------------------------------------------
-- **獨立於 `consumer_complaints` 的 domain**：法律基礎不同（個資法 vs 消保法 §43），
-- 因此不是 `complaint_type` 的一個值。重用的是模式，不是 table。
-- 見 Backend/migrations/20260828_privacy_requests.sql。
--
-- **刻意沒有**：deadline / SLA 欄位（法定回覆期限未決）、身分驗證欄位
-- （法律標準未決）、刪除執行欄位（`SCHEMA-02` / `O-22` blocked）、evidence 表
-- （對外入口是 Privacy Email，附件留在信箱）。
-- `status = 'completed'` 意為「平台已處理完請求」，**不等於「資料已刪除」**。
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  -- 請求者聯絡識別（通常是寄件 Email）。**刻意不連結 users** ——
  -- 綁定帳號等於主張已確認本人，而身分驗證標準未決。
  requester_reference TEXT NOT NULL,
  summary TEXT NOT NULL,
  received_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'privacy_email',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pr_type_check CHECK (request_type IN (
    'access', 'copy', 'correction', 'stop_processing',
    'deletion', 'withdraw_consent', 'other'
  )),
  CONSTRAINT pr_status_check CHECK (status IN (
    'open', 'in_review', 'waiting_for_information', 'completed', 'closed'
  )),
  CONSTRAINT pr_source_check CHECK (source IN ('privacy_email')),
  CONSTRAINT pr_reference_not_blank CHECK (btrim(requester_reference) <> ''),
  CONSTRAINT pr_summary_not_blank CHECK (btrim(summary) <> ''),
  CONSTRAINT pr_completed_requires_timestamp CHECK (
    status <> 'completed' OR completed_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_received
  ON privacy_requests (status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_received
  ON privacy_requests (received_at DESC);

CREATE TABLE IF NOT EXISTS privacy_request_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  request_id TEXT NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pre_type_check CHECK (event_type IN (
    'created', 'status_changed', 'internal_note'
  ))
);

CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request
  ON privacy_request_events (request_id, created_at DESC);

-- Deployed databases may also apply incremental migrations touching `reports` / activity paths; reference copies under `Backend/migrations/`, for example:
-- `20260420_day20_reports_reporter_status.sql`
-- `20260420_day20b_report_reviewed_metadata.sql`
-- `20260423_day22_activity_logs_indexes.sql`
-- `20260822_report_case_workflow.sql`
-- `20260822_payment_proof_rejection_reason.sql`
-- `20260823_payment_proof_private_storage.sql`
