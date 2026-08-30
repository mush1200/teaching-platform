const db = require("../config/db");

let readyPromise = null;

async function runIdempotentMigrations() {
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Canonical role is `buyer`; `parent` is legacy-compatibility only.
  // These two statements must NOT fail silently: a swallowed error here leaves the DB in a
  // split state (DEFAULT 'buyer' while users_role_check still rejects 'buyer'), which makes
  // buyer registration fail at runtime with no trace. Fail fast instead — index.js exits 1.
  try {
    await db.query(`
      UPDATE users
      SET role = 'buyer'
      WHERE role = 'parent';
    `);
    await db.query(`
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'buyer';
    `);
  } catch (err) {
    console.error(
      "[bootstrap] role migration (parent -> buyer) failed:",
      err.message
    );
    console.error(
      "[bootstrap] hint: users_role_check must allow 'buyer' before this migration can run."
    );
    throw err;
  }

  // Legacy Day13–14 tables; MVP v1.2 uses materials + manual_payment_proofs only.
  await db.query(`DROP TABLE IF EXISTS payment_proofs CASCADE;`);
  await db.query(`DROP TABLE IF EXISTS products CASCADE;`);

  await db.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount INTEGER;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_mode TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_carrier TEXT;
  `);
  await db.query(`
    UPDATE orders SET discount_amount = 0 WHERE discount_amount IS NULL;
    UPDATE orders SET invoice_type = 'none' WHERE invoice_type IS NULL OR TRIM(invoice_type) = '';
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE orders
        ADD CONSTRAINT orders_invoice_type_check CHECK (invoice_type IN ('none', 'carrier'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
      value INTEGER NOT NULL CHECK (value >= 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`
    INSERT INTO promotions(code, type, value, is_active)
    VALUES ('WELCOME100', 'fixed', 100, TRUE)
    ON CONFLICT (code) DO NOTHING;
  `);
  await db.query(`
    INSERT INTO promotions(code, type, value, is_active)
    VALUES ('MAY10', 'percent', 10, TRUE)
    ON CONFLICT (code) DO NOTHING;
  `);
  await db.query(`
    ALTER TABLE orders DROP COLUMN IF EXISTS proof_url;
    ALTER TABLE orders DROP COLUMN IF EXISTS proof_uploaded_at;
    ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;
    ALTER TABLE orders DROP COLUMN IF EXISTS rejected_reason;
    ALTER TABLE orders DROP COLUMN IF EXISTS approved_by;
    ALTER TABLE orders DROP COLUMN IF EXISTS approved_at;
  `);

  await db.query(`
    UPDATE orders
    SET total_amount = ROUND(COALESCE(total_amount::numeric, total_price::numeric, 0))::integer
    WHERE total_amount IS NULL;
  `);
  await db.query(`
    UPDATE orders
    SET total_price = ROUND(COALESCE(total_price::numeric, total_amount::numeric, 0))::integer
    WHERE total_price IS NULL;
  `);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_price'
          AND udt_name <> 'int4'
      ) THEN
        ALTER TABLE orders
          ALTER COLUMN total_price TYPE INTEGER
          USING ROUND(COALESCE(total_price::numeric, total_amount::numeric, 0))::integer;
      END IF;
    END $$;
  `);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_amount'
          AND udt_name <> 'int4'
      ) THEN
        ALTER TABLE orders
          ALTER COLUMN total_amount TYPE INTEGER
          USING ROUND(COALESCE(total_amount::numeric, total_price::numeric, 0))::integer;
      END IF;
    END $$;
  `);

  await db.query(`
    UPDATE orders SET payment_mode = 'manual_transfer' WHERE payment_mode IS NULL;
  `);
  await db.query(`
    ALTER TABLE orders ALTER COLUMN payment_mode SET DEFAULT 'manual_transfer';
    ALTER TABLE orders ALTER COLUMN payment_mode SET NOT NULL;
  `).catch(() => {});

  await db.query(`
    UPDATE orders SET total_price = total_amount WHERE total_price IS NULL OR total_price <> total_amount;
  `);
  await db.query(`
    ALTER TABLE orders ALTER COLUMN total_amount SET NOT NULL;
  `).catch(() => {});

  await db.query(`
    ALTER TABLE orders ALTER COLUMN total_price DROP NOT NULL;
  `).catch(() => {});

  await db.query(`
    UPDATE orders SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
  `);
  await db.query(`
    ALTER TABLE orders ALTER COLUMN created_at SET NOT NULL;
  `).catch(() => {});
  await db.query(`
    UPDATE orders SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
  `);
  await db.query(`
    ALTER TABLE orders ALTER COLUMN updated_at SET NOT NULL;
  `).catch(() => {});

  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS manual_payment_proofs (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      proof_url TEXT NOT NULL,
      review_status TEXT NOT NULL,
      note TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT mpp_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected'))
    );
  `);

  await db.query(`
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS proof_mime_type TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS proof_size_bytes INTEGER;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS original_filename TEXT;
  `);

  /*
   * 付款憑證的私有儲存（P1 security hardening，migration
   * `20260823_payment_proof_private_storage.sql`）。
   *
   * 憑證從公開的 `uploads/payment-proofs/` 移到 `private-storage/payment-proofs/`，
   * DB 從此保存 opaque `storage_key` 而不是可公開存取的 URL。
   * `proof_url` 保留為 legacy 指標（搬移腳本用它找到舊檔），因此 NOT NULL 要放寬 ——
   * 新憑證根本沒有 URL 可填。
   *
   * `storage_status` 的既有列 DEFAULT 是 `legacy_public`：搬移腳本跑之前它們確實
   * 還在公開目錄。實體檔案的搬移由 `scripts/migrate-payment-proofs-to-private.js` 負責。
   */
  await db.query(`
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS storage_key TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS uploaded_by TEXT REFERENCES users(id);
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS storage_status TEXT NOT NULL DEFAULT 'legacy_public';
    ALTER TABLE manual_payment_proofs ALTER COLUMN proof_url DROP NOT NULL;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs
        ADD CONSTRAINT mpp_storage_status_check
        CHECK (storage_status IN ('private', 'legacy_public', 'legacy_external', 'legacy_missing'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs
        ADD CONSTRAINT mpp_private_requires_storage_key
        CHECK (storage_status <> 'private' OR storage_key IS NOT NULL);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_payment_proofs_storage_key
      ON manual_payment_proofs(storage_key)
      WHERE storage_key IS NOT NULL;
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_storage_status
      ON manual_payment_proofs(storage_status);
  `);

  await db.query(`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS demo_video_url TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS material_features TEXT[] DEFAULT '{}';
    ALTER TABLE materials ALTER COLUMN material_features SET DEFAULT '{}';
  `);

  /*
   * 教材審核 workflow（Material Review MVP Phase 1）。
   *
   * `changes_requested`（需修改，球在創作者手上）加入 allowlist。三個既有值全部保留，
   * 資料不回填。`materials_status_check` 在既有資料庫是手動建立的（repo 內原本沒有
   * 建立它的程式碼），因此這裡同時負責「放寬既有的」與「為全新資料庫建立」。
   *
   * DROP + ADD 包在同一個 DO block（單一 statement）內，不會出現無約束的視窗。
   */
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_status_check;
      ALTER TABLE materials
        ADD CONSTRAINT materials_status_check
        CHECK (status IN ('pending_review', 'published', 'changes_requested', 'unpublished'));
    END $$;
  `);

  /*
   * Latest review decision snapshot。**不是** review history ——
   * 每次新的審核決定都會覆寫這四個欄位；完整歷史的 canonical source 是
   * `activity_logs`（target_type = 'material'）。見 docs/material-review-workflow.md。
   *
   * `published_at` 是**首次**成功公開的時間（不是 last_published_at）：
   * 應用層只在它為 NULL 時寫入，之後的重新公開時間由 `material.published` 事件保存。
   */
  await db.query(`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS review_reason_code TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS review_note TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_review_reason_check;
      ALTER TABLE materials
        ADD CONSTRAINT materials_review_reason_check
        CHECK (review_reason_code IS NULL OR review_reason_code IN (
          'incomplete_info', 'media_quality', 'features_mismatch', 'file_problem', 'ip_concern', 'other'
        ));
    END $$;
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_materials_status_updated_at ON materials(status, updated_at DESC);`
  );

  /*
   * 教材本體檔案（material_files）與交付。見 docs/material-file-storage-and-delivery.md。
   *
   * 兩個指標把「創作者上傳的候選檔」與「買家真正下載得到的檔」在資料層徹底分開：
   *   pending_file_id  待審候選 —— Buyer 永遠拿不到
   *   approved_file_id 已核准 —— **只有 Admin 核准流程能寫入**
   * 因此「核准」只是一次指標交換，可以和 status 變更放在同一個 transaction 裡原子完成。
   *
   * `materials.file_key`（legacy placeholder 字串）刻意保留不動：既有 fixture／smoke／
   * Postman 仍依賴它，新流程則完全不讀它。
   */
  await db.query(`
    CREATE TABLE IF NOT EXISTS material_files (
      id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      material_id       TEXT REFERENCES materials(id) ON DELETE CASCADE,
      storage_key       TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      mime_type         TEXT NOT NULL,
      size_bytes        BIGINT NOT NULL,
      checksum_sha256   TEXT,
      status            TEXT NOT NULL DEFAULT 'unattached',
      uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
      approved_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at       TIMESTAMP NOT NULL DEFAULT NOW(),
      approved_at       TIMESTAMP,
      created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT material_files_size_check CHECK (size_bytes > 0)
    );
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE material_files DROP CONSTRAINT IF EXISTS material_files_status_check;
      ALTER TABLE material_files
        ADD CONSTRAINT material_files_status_check
        CHECK (status IN ('unattached', 'candidate', 'approved', 'superseded', 'revoked'));

      ALTER TABLE material_files DROP CONSTRAINT IF EXISTS material_files_attachment_check;
      ALTER TABLE material_files
        ADD CONSTRAINT material_files_attachment_check
        CHECK (
          (status = 'unattached' AND material_id IS NULL)
          OR (status <> 'unattached' AND material_id IS NOT NULL)
        );
    END $$;
  `);
  /* 一份教材最多一個 approved、一個 candidate —— 審核隔離的資料庫層保證。 */
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_one_approved
      ON material_files(material_id) WHERE status = 'approved';
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_material_files_one_candidate
      ON material_files(material_id) WHERE status = 'candidate';
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_material_files_material ON material_files(material_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_material_files_unattached ON material_files(status, uploaded_at);`);

  await db.query(`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved_file_id TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS pending_file_id TEXT;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE materials
        ADD CONSTRAINT materials_approved_file_fkey
        FOREIGN KEY (approved_file_id) REFERENCES material_files(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE materials
        ADD CONSTRAINT materials_pending_file_fkey
        FOREIGN KEY (pending_file_id) REFERENCES material_files(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_materials_approved_file ON materials(approved_file_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_materials_pending_file ON materials(pending_file_id);`);

  /*
   * 一次性下載 token。**存在 DB 而不是記憶體**：記憶體版重啟即全失效、
   * 多實例不成立。只保存 SHA-256 雜湊，資料庫外洩不會直接變成可用連結。
   */
  await db.query(`
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
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_material_download_tokens_expiry ON material_download_tokens(expires_at);`
  );

  await db.query(`
    CREATE TABLE IF NOT EXISTS material_images (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      alt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_material_images_material_id ON material_images(material_id);`);

  /*
   * SEC-02 — 教材行銷素材（封面／詳情圖／試看影片）的私有儲存 metadata。
   * 見 Backend/migrations/20260824_material_media_private_storage.sql 與
   * docs/material-file-storage-and-delivery.md §24。
   *
   * 這張表的存在本身就是修法：沒有它，`cover_image_url` 只是一個自由文字 URL，
   * 檔案與教材之間沒有可查詢的關聯，交付時無從判斷「所屬教材上架了沒」。
   * `material_id IS NULL` = 尚未認領（只有上傳者或 Admin 看得到）。
   */
  await db.query(`
    CREATE TABLE IF NOT EXISTS material_media_files (
      id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      material_id       TEXT REFERENCES materials(id) ON DELETE CASCADE,
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
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_material_media_files_material ON material_media_files(material_id);`
  );
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_material_media_files_unclaimed
      ON material_media_files(uploaded_at)
      WHERE material_id IS NULL;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_favorites (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, material_id)
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_user_favorites_material_id ON user_favorites(material_id);`);

  await db.query(`ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';`);
  await db.query(`
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
  `);
  await db.query(`
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  `);
  await db.query(`
    UPDATE manual_payment_proofs SET created_at = NOW() WHERE created_at IS NULL;
  `);
  await db.query(`
    ALTER TABLE manual_payment_proofs ALTER COLUMN created_at SET DEFAULT NOW();
  `).catch(() => {});
  await db.query(`
    ALTER TABLE manual_payment_proofs ALTER COLUMN created_at SET NOT NULL;
  `).catch(() => {});

  await db.query(`
    ALTER TABLE manual_payment_proofs ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
  `).catch(() => {});

  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs
        ADD CONSTRAINT mpp_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs
        ADD CONSTRAINT mpp_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  /*
   * 結構化的拒絕原因（Epic §4）。`note` 保留為自由文字補充說明 ——
   * 它同時被用在核准備註與「superseded by approved proof」的系統註記上，語意不動。
   * canonical allowlist 在 `utils/paymentProofReview.js`。
   */
  await db.query(`ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS rejection_reason TEXT;`);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs DROP CONSTRAINT IF EXISTS mpp_rejection_reason_check;
      ALTER TABLE manual_payment_proofs
        ADD CONSTRAINT mpp_rejection_reason_check
        CHECK (rejection_reason IS NULL OR rejection_reason IN (
          'amount_mismatch', 'unreadable', 'payment_not_found', 'invalid_proof', 'other'
        ));
    END $$;
  `);

  await db.query(`DROP INDEX IF EXISTS idx_manual_payment_proofs_order_id;`);
  await db.query(`DROP INDEX IF EXISTS idx_manual_payment_proofs_review;`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_order ON manual_payment_proofs(order_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_manual_payment_proofs_status ON manual_payment_proofs(review_status);`);

  await db.query(`
    ALTER TABLE cart_items ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text);
  `).catch(() => {});
  await db.query(`
    UPDATE cart_items SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL;
  `);
  await db.query(`
    UPDATE cart_items SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
  `);
  await db.query(`
    ALTER TABLE cart_items ALTER COLUMN created_at SET NOT NULL;
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cart_items ALTER COLUMN updated_at SET NOT NULL;
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);`);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE cart_items
        ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE cart_items
        ADD CONSTRAINT cart_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'qty'
      )
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'quantity'
      ) THEN
        ALTER TABLE order_items RENAME COLUMN qty TO quantity;
      END IF;
    END $$;
  `);
  await db.query(`
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
  `).catch(() => {});

  await db.query(`
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_id TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal INTEGER;
  `);
  await db.query(`
    UPDATE order_items oi
    SET subtotal = ROUND((COALESCE(oi.price_snapshot::numeric, 0) * COALESCE(oi.quantity, 1))::numeric)::integer
    WHERE oi.subtotal IS NULL;
  `);
  await db.query(`
    UPDATE order_items oi
    SET seller_id = m.teacher_id
    FROM materials m
    WHERE oi.material_id = m.id AND oi.seller_id IS NULL;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES users(id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.query(`
    ALTER TABLE order_items ALTER COLUMN subtotal SET NOT NULL;
  `).catch(() => {});

  // --- order_items：獨立授權狀態與履約版本快照 ------------------------------
  // 見 Backend/migrations/20260826_order_item_entitlement_and_fulfillment.sql。
  // 純加法：既有列一律拿到 `entitlement_status = 'active'`（欄位預設），
  // 因此**所有既有買家的下載權完全不變**。
  // `orders`（含 `paid_at`）與訂單狀態機**完全不動**。
  await db.query(`
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS entitlement_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_suspended_at TIMESTAMP;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_suspended_by TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_suspension_reason TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_restored_at TIMESTAMP;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS access_restored_by TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfilled_material_version_id TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_entitlement_status_check
        CHECK (entitlement_status IN ('active', 'suspended', 'revoked_pending', 'revoked_final'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  // quantity 只加無爭議的下限。**這不是 E2-A** —— 那是跨訂單規則，屬 Wave 2。
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_quantity_positive_check CHECK (quantity >= 1);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_access_suspended_by_fkey
        FOREIGN KEY (access_suspended_by) REFERENCES users(id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_access_restored_by_fkey
        FOREIGN KEY (access_restored_by) REFERENCES users(id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
  // ON DELETE RESTRICT 是 K7 ENTITLEMENT-RETENTION-INVARIANT 的 DB 層表達：
  // 只要還有訂單品項指向某個檔案版本，該版本就不得被實體刪除。
  // 要停止提供某版本，正確做法是 material_files.status = 'revoked'，不是刪列。
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_fulfilled_version_fkey
        FOREIGN KEY (fulfilled_material_version_id) REFERENCES material_files(id) ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END $$;
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_order_items_entitlement_not_active
      ON order_items (entitlement_status)
      WHERE entitlement_status <> 'active';
  `).catch(() => {});

  // --- 付款／核帳時間模型分離（Gate 6 / Gate 11）----------------------------
  // 見 Backend/migrations/20260826_payment_timing_foundation.sql。
  // **`orders.paid_at` 完全不動** —— 它的語意仍是「Admin 核准相關時間戳」，
  // 且仍是 adminDashboard / adminTrends / teacherSales 的營收認列依據。
  // 歷史列的 `payment_received_at` 一律保持 NULL：不得以 `paid_at` 回填，
  // 那會製造「系統知道銀行何時入帳」的假歷史證據。
  await db.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_info_submitted_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMP;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE orders ADD CONSTRAINT orders_payment_received_not_future_check
        CHECK (payment_received_at IS NULL OR payment_received_at <= NOW() + INTERVAL '1 day');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_review_due_at
      ON orders (review_due_at) WHERE review_due_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_payment_due_at
      ON orders (payment_due_at) WHERE payment_due_at IS NOT NULL;
  `).catch(() => {});
  // `reported_` 前綴是刻意的：買家自行申報的值，不是平台查證後的事實。
  await db.query(`
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_bank_name TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_account_last4 TEXT;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_amount INTEGER;
    ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS reported_transfer_at TIMESTAMP;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs ADD CONSTRAINT mpp_reported_last4_check
        CHECK (reported_account_last4 IS NULL OR reported_account_last4 ~ '^[0-9]{4}$');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE manual_payment_proofs ADD CONSTRAINT mpp_reported_amount_check
        CHECK (reported_amount IS NULL OR reported_amount > 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});

  // --- 帳號凍結（Gate 1）-----------------------------------------------------
  // 見 Backend/migrations/20260826_account_freeze_foundation.sql。
  // 既有使用者一律取得 'active'（欄位預設），不會有帳號被誤凍結。
  // 稽核欄位對既有列一律 NULL —— 不 backfill 沒發生過的凍結事件。
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_by TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS unfrozen_at TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS unfrozen_by TEXT;
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE users ADD CONSTRAINT users_account_status_check
        CHECK (account_status IN ('active', 'frozen'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
  for (const col of ["frozen_by", "unfrozen_by"]) {
    await db
      .query(
        `DO $$
         BEGIN
           ALTER TABLE users ADD CONSTRAINT users_${col}_fkey
             FOREIGN KEY (${col}) REFERENCES users(id);
         EXCEPTION
           WHEN duplicate_object THEN NULL;
         END $$;`
      )
      .catch(() => {});
  }
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_users_account_status_not_active
      ON users (account_status) WHERE account_status <> 'active';
  `).catch(() => {});

  // --- 可版本化的同意證據（Gate 5）------------------------------------------
  // 見 Backend/migrations/20260826_consent_records_foundation.sql。
  // **不 backfill、不接線任何流程** —— 目前 repo 沒有任何經核可的法律文件，
  // 現在接線只會保存「指向不存在版本」的假證據。
  // `materials.ip_declaration_*` 原地不動。
  await db.query(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      document_type TEXT NOT NULL,
      document_version TEXT NOT NULL,
      document_effective_date DATE,
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
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_consent_records_user_document
      ON consent_records (user_id, document_type, document_version);
    CREATE INDEX IF NOT EXISTS idx_consent_records_order
      ON consent_records (order_id) WHERE order_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_consent_records_material
      ON consent_records (material_id) WHERE material_id IS NOT NULL;
  `).catch(() => {});
  // H-VERSION：同意證據 append-only。只擋 UPDATE，不擋 DELETE ——
  // 「不得改寫歷史」是 H-VERSION 的要求；「永不刪除」不是（RETENTION-MATRIX `RM-13`）。
  await db.query(`
    CREATE OR REPLACE FUNCTION consent_records_reject_rewrite()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.user_id IS DISTINCT FROM OLD.user_id
         OR NEW.document_type IS DISTINCT FROM OLD.document_type
         OR NEW.document_version IS DISTINCT FROM OLD.document_version
         OR NEW.document_effective_date IS DISTINCT FROM OLD.document_effective_date
         OR NEW.document_content_hash IS DISTINCT FROM OLD.document_content_hash
         OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
         OR NEW.context_type IS DISTINCT FROM OLD.context_type
         OR NEW.order_id IS DISTINCT FROM OLD.order_id
         OR NEW.material_id IS DISTINCT FROM OLD.material_id
         OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION
          'consent_records is append-only: consent evidence must not be rewritten (only superseded_by_id may be set)';
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await db.query(`DROP TRIGGER IF EXISTS trg_consent_records_reject_rewrite ON consent_records;`);
  await db.query(`
    CREATE TRIGGER trg_consent_records_reject_rewrite
      BEFORE UPDATE ON consent_records
      FOR EACH ROW EXECUTE FUNCTION consent_records_reject_rewrite();
  `);

  // --- 法律文件登記表（P1-09 Legal Foundation / Gate 12 foundation）-----------
  // 見 Backend/migrations/20260827_legal_document_registry.sql。
  // **不 seed 任何條文** —— 執行後為 0 列，這是預期且正確的狀態。
  // 三道 DB 防線：publishable_check（fail-closed metadata）、
  // one_published_per_type（partial UNIQUE）、immutable trigger。
  await db.query(`
    CREATE TABLE IF NOT EXISTS legal_documents (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      document_type TEXT NOT NULL,
      version TEXT NOT NULL,
      body TEXT,
      content_hash TEXT,
      effective_date DATE,
      -- SCHEMA-03 / DEC-LEGAL-06：NOT NULL 且刻意無 DEFAULT。
      -- （這段在 JS template literal 內，不能出現反引號。）
      -- 見 Backend/migrations/20260827b_legal_document_requires_reconsent.sql。
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
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_type_version_key
      ON legal_documents (document_type, version);
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_one_published_per_type
      ON legal_documents (document_type) WHERE publication_status = 'published';
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_legal_documents_type_status
      ON legal_documents (document_type, publication_status);
  `);
  await db.query(`
    CREATE OR REPLACE FUNCTION legal_documents_reject_rewrite()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF OLD.publication_status IN ('published', 'superseded') THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.document_type IS DISTINCT FROM OLD.document_type
           OR NEW.version IS DISTINCT FROM OLD.version
           OR NEW.body IS DISTINCT FROM OLD.body
           OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
           OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
           OR NEW.requires_reconsent IS DISTINCT FROM OLD.requires_reconsent
           OR NEW.published_at IS DISTINCT FROM OLD.published_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
          RAISE EXCEPTION
            'legal_documents is immutable once published: publish a new version instead of rewriting %', OLD.id;
        END IF;
      END IF;
      IF OLD.publication_status = 'superseded'
         AND NEW.publication_status IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'legal_documents: superseded is terminal (% -> %)',
          OLD.publication_status, NEW.publication_status;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await db.query(`DROP TRIGGER IF EXISTS trg_legal_documents_immutable ON legal_documents;`);
  await db.query(`
    CREATE TRIGGER trg_legal_documents_immutable
      BEFORE UPDATE ON legal_documents
      FOR EACH ROW EXECUTE FUNCTION legal_documents_reject_rewrite();
  `);

  // --- 個資權利請求（`OPS-04` / `DEC-LEGAL-13`）--------------------------------
  // 見 Backend/migrations/20260828_privacy_requests.sql。
  // **獨立於 consumer_complaints 的 domain** —— 法律基礎不同，不是 complaint_type
  // 的一個值。刻意沒有 deadline / 身分驗證 / 刪除執行欄位（三者法律結論皆未取得）。
  await db.query(`
    CREATE TABLE IF NOT EXISTS privacy_requests (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      request_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
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
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_received
      ON privacy_requests (status, received_at DESC);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_privacy_requests_received
      ON privacy_requests (received_at DESC);
  `);
  await db.query(`
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
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request
      ON privacy_request_events (request_id, created_at DESC);
  `);

  // --- 退款／補救案件（Gate 14）----------------------------------------------
  // 見 Backend/migrations/20260826_refund_remedy_cases_foundation.sql。
  // **不重用 `reports`** —— 那在語意上只是內容檢舉（`material_id NOT NULL`、
  // 一人一材一次、resolution 全是 moderation 結果、無金額無訂單關聯）。
  // 三個刻意分離：不改 `orders.status`／不自動執行 entitlement 轉移／不含稅務欄位。
  // `approved` ≠ 退款完成（必須經 `remedy_pending` 才能到 `completed`）。
  await db.query(`
    CREATE TABLE IF NOT EXISTS refund_remedy_cases (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
      buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      case_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      review_started_at TIMESTAMP,
      decision_at TIMESTAMP,
      completed_at TIMESTAMP,
      requested_amount INTEGER,
      approved_amount INTEGER,
      refund_method TEXT,
      refund_reference TEXT,
      refund_paid_at TIMESTAMP,
      buyer_statement TEXT,
      admin_note TEXT,
      evidence_reference TEXT,
      entitlement_action TEXT,
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
      )
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_rrc_order ON refund_remedy_cases (order_id, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rrc_buyer ON refund_remedy_cases (buyer_id, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rrc_open ON refund_remedy_cases (status)
      WHERE status IN ('requested', 'under_review', 'approved', 'remedy_pending');
  `).catch(() => {});

  // --- 消費申訴（Gate 3 / Wave 2 #6）-----------------------------------------
  // 見 Backend/migrations/20260826_consumer_complaints.sql。
  // 消保法 §43 II 十五日期限；`statutory_due_at` 由 utils/complaintSla.js 單一計算。
  // **不得與 reports（內容檢舉）或 refund_remedy_cases（補救處理）互相取代。**
  await db.query(`
    CREATE TABLE IF NOT EXISTS consumer_complaints (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
      CONSTRAINT cc_resolved_requires_summary CHECK (
        status NOT IN ('resolved', 'closed')
        OR (resolution_summary IS NOT NULL AND btrim(resolution_summary) <> '')
      ),
      CONSTRAINT cc_resolved_requires_timestamp CHECK (
        status <> 'resolved' OR resolved_at IS NOT NULL
      )
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cc_buyer ON consumer_complaints (buyer_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cc_order ON consumer_complaints (order_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cc_open_due ON consumer_complaints (statutory_due_at)
      WHERE status IN ('submitted', 'under_review', 'responded');
  `).catch(() => {});
  await db.query(`
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
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cce_complaint ON consumer_complaint_events (complaint_id, created_at);
  `).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS consumer_complaint_evidence (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      complaint_id TEXT NOT NULL REFERENCES consumer_complaints(id) ON DELETE CASCADE,
      uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
      CONSTRAINT cce_evidence_file_complete CHECK (
        storage_key IS NULL
        OR (original_filename IS NOT NULL AND mime_type IS NOT NULL
            AND size_bytes IS NOT NULL AND size_bytes > 0)
      )
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cce_evidence_complaint
      ON consumer_complaint_evidence (complaint_id, created_at);
  `).catch(() => {});

  // --- 人工銀行退款執行紀錄（Gate 14 / Wave 2 #5）---------------------------
  // 見 Backend/migrations/20260826_manual_refund_execution.sql。
  // 把「已核准」「已執行」釘死成不同事件：執行證據四欄原子，
  // 且已核准金錢退款的案件不得在無付款證據時被標成 completed。
  // **刻意沒有 tax 欄位**（P14 待會計師）與 Buyer 退款帳戶（不擴大個資蒐集）。
  await db.query(`
    ALTER TABLE refund_remedy_cases
      ADD COLUMN IF NOT EXISTS refund_amount INTEGER;
  `).catch(() => {});
  await db.query(`
    ALTER TABLE refund_remedy_cases
      ADD CONSTRAINT rrc_refund_amount_positive CHECK (refund_amount IS NULL OR refund_amount > 0);
  `).catch(() => {});
  await db.query(`
    ALTER TABLE refund_remedy_cases
      ADD CONSTRAINT rrc_refund_within_approved CHECK (
        refund_amount IS NULL
        OR (approved_amount IS NOT NULL AND refund_amount <= approved_amount)
      );
  `).catch(() => {});
  await db.query(`
    ALTER TABLE refund_remedy_cases
      ADD CONSTRAINT rrc_refund_method_check CHECK (
        refund_method IS NULL OR refund_method = 'manual_bank_transfer'
      );
  `).catch(() => {});
  await db.query(`
    ALTER TABLE refund_remedy_cases
      ADD CONSTRAINT rrc_refund_execution_atomic CHECK (
        (refund_paid_at IS NULL AND refund_reference IS NULL
           AND refund_amount IS NULL AND refund_method IS NULL)
        OR (refund_paid_at IS NOT NULL AND refund_reference IS NOT NULL
           AND refund_amount IS NOT NULL AND refund_method IS NOT NULL
           AND status = 'completed')
      );
  `).catch(() => {});
  await db.query(`
    ALTER TABLE refund_remedy_cases
      ADD CONSTRAINT rrc_cash_completion_requires_evidence CHECK (
        status <> 'completed' OR approved_amount IS NULL OR refund_paid_at IS NOT NULL
      );
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_rrc_executed
      ON refund_remedy_cases (refund_paid_at DESC) WHERE refund_paid_at IS NOT NULL;
  `).catch(() => {});

  // --- 教材檔案 legal hold（Gate 14 / Wave 2 #4）----------------------------
  // 見 Backend/migrations/20260826_material_file_legal_hold.sql。
  // 只回答一個問題：「這個檔案現在能不能被實體刪除」。
  // 歷程走 activity_logs（target_type = 'material_file'），不另建 hold 表。
  // **刻意沒有 retention_until** —— 保存年限尚無 authoritative source，
  // 加欄位只會逼出「全部 NULL 擋掉一切」或「NULL 當作無義務」兩種假答案。
  await db.query(`
    ALTER TABLE material_files
      ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS hold_reason TEXT,
      ADD COLUMN IF NOT EXISTS hold_set_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS hold_set_by TEXT,
      ADD COLUMN IF NOT EXISTS hold_released_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS hold_released_by TEXT;
  `).catch(() => {});
  await db.query(`
    ALTER TABLE material_files
      ADD CONSTRAINT material_files_hold_set_by_fkey
      FOREIGN KEY (hold_set_by) REFERENCES users(id) ON DELETE SET NULL;
  `).catch(() => {});
  await db.query(`
    ALTER TABLE material_files
      ADD CONSTRAINT material_files_hold_released_by_fkey
      FOREIGN KEY (hold_released_by) REFERENCES users(id) ON DELETE SET NULL;
  `).catch(() => {});
  await db.query(`
    ALTER TABLE material_files
      ADD CONSTRAINT material_files_hold_requires_reason CHECK (
        legal_hold = FALSE
        OR (hold_reason IS NOT NULL AND btrim(hold_reason) <> '' AND hold_set_at IS NOT NULL)
      );
  `).catch(() => {});
  await db.query(`
    ALTER TABLE material_files
      ADD CONSTRAINT material_files_hold_release_requires_set CHECK (
        hold_released_at IS NULL OR hold_set_at IS NOT NULL
      );
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_material_files_legal_hold
      ON material_files (legal_hold) WHERE legal_hold = TRUE;
  `).catch(() => {});

  // --- 教材權利審查記錄（Gate 2 / D5）---------------------------------------
  // 見 Backend/migrations/20260826_material_rights_review_foundation.sql。
  // **獨立於** `materials.reviewed_*`（一般內容審核的 latest snapshot）與
  // `materials.ip_declaration_*`（Creator 的 legacy 聲明）——
  // 一般內容審核 ≠ 法律權利審查，不得互相代表。
  // **不 backfill**：既有教材沒有權利審查記錄，那是事實；假造會製造假的盡職證據。
  await db.query(`
    CREATE TABLE IF NOT EXISTS material_rights_reviews (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reviewed_by TEXT NOT NULL REFERENCES users(id),
      review_result TEXT NOT NULL,
      risk_flags TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT,
      declaration_version TEXT,
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
      CONSTRAINT mrr_needs_evidence_requires_notes CHECK (
        review_result <> 'needs_evidence' OR (notes IS NOT NULL AND TRIM(notes) <> '')
      )
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mrr_material_reviewed_at
      ON material_rights_reviews (material_id, reviewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mrr_result_open
      ON material_rights_reviews (review_result)
      WHERE review_result IN ('pending', 'needs_evidence');
  `).catch(() => {});
  // append-only：改變結論時寫一筆新記錄，不得改寫既有審查。
  await db.query(`
    CREATE OR REPLACE FUNCTION material_rights_reviews_reject_rewrite()
    RETURNS TRIGGER AS $fn$
    BEGIN
      RAISE EXCEPTION
        'material_rights_reviews is append-only: record a new review instead of rewriting an existing one';
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await db.query(`DROP TRIGGER IF EXISTS trg_mrr_reject_rewrite ON material_rights_reviews;`);
  await db.query(`
    CREATE TRIGGER trg_mrr_reject_rewrite
      BEFORE UPDATE ON material_rights_reviews
      FOR EACH ROW EXECUTE FUNCTION material_rights_reviews_reject_rewrite();
  `);

  await db.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;`);
  await db.query(`UPDATE orders SET status = 'approved' WHERE status = 'paid';`);

  await db.query(`DROP TABLE IF EXISTS reviews CASCADE;`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS review (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (material_id, parent_id)
    );
  `);

  // 舊表若早於 parent_id 欄位：CREATE TABLE IF NOT EXISTS 不會補欄位；必須先補齊再建索引。
  await db.query(`ALTER TABLE review ADD COLUMN IF NOT EXISTS parent_id TEXT;`);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'review' AND column_name = 'reviewer_id'
      ) THEN
        EXECUTE 'UPDATE review SET parent_id = CAST(reviewer_id AS TEXT) WHERE parent_id IS NULL';
      END IF;
    END $$;
  `);

  // 舊庫仍為 Day18 結構時，須先遷移出 parent_id，才能建立 idx_review_parent_id。
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'review' AND column_name = 'order_item_id'
      ) THEN
        ALTER TABLE review ADD COLUMN IF NOT EXISTS parent_id TEXT;
        UPDATE review SET parent_id = reviewer_id WHERE parent_id IS NULL;
        DELETE FROM review
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY material_id, parent_id
                     ORDER BY created_at ASC, id ASC
                   ) AS rn
            FROM review
            WHERE parent_id IS NOT NULL
          ) t
          WHERE rn > 1
        );
        ALTER TABLE review DROP CONSTRAINT IF EXISTS review_order_item_id_key;
        ALTER TABLE review DROP CONSTRAINT IF EXISTS review_order_item_id_fkey;
        ALTER TABLE review DROP COLUMN IF EXISTS order_item_id;
        ALTER TABLE review DROP COLUMN IF EXISTS reviewer_id;
        ALTER TABLE review ALTER COLUMN parent_id SET NOT NULL;
        BEGIN
          ALTER TABLE review
            ADD CONSTRAINT review_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
          ALTER TABLE review
            ADD CONSTRAINT uq_review_material_parent UNIQUE (material_id, parent_id);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END IF;
    END $$;
  `);

  await db.query(`ALTER TABLE review DROP COLUMN IF EXISTS reviewer_id;`);

  await db.query(`
    DO $$
    BEGIN
      DELETE FROM review
      WHERE parent_id IS NULL OR (parent_id IS NOT NULL AND btrim(parent_id::text) = '');
    END $$;
  `);

  await db.query(`
    DO $$
    BEGIN
      BEGIN
        ALTER TABLE review ALTER COLUMN parent_id SET NOT NULL;
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
      BEGIN
        ALTER TABLE review
          ADD CONSTRAINT review_parent_id_fkey
          FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      BEGIN
        ALTER TABLE review
          ADD CONSTRAINT uq_review_material_parent UNIQUE (material_id, parent_id);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN duplicate_table THEN NULL;
      END;
    END $$;
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_review_material_id ON review(material_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_review_parent_id ON review(parent_id);`);
  await db.query(`DROP INDEX IF EXISTS idx_review_reviewer_id;`);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id TEXT;
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT;
        UPDATE reports SET reporter_id = user_id WHERE reporter_id IS NULL;
        UPDATE reports SET status = COALESCE(NULLIF(TRIM(status), ''), 'pending');
        DELETE FROM reports
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY material_id, reporter_id
                     ORDER BY created_at ASC NULLS LAST, id ASC
                   ) AS rn
            FROM reports
            WHERE reporter_id IS NOT NULL
          ) t
          WHERE rn > 1
        );
        ALTER TABLE reports DROP COLUMN user_id;
      END IF;
    END $$;
  `);

  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT;`);
  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id TEXT;`);
  await db.query(`
    UPDATE reports SET status = COALESCE(NULLIF(TRIM(status), ''), 'pending') WHERE status IS NULL OR TRIM(status) = '';
  `).catch(() => {});
  await db.query(`ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'pending';`).catch(() => {});
  await db.query(`ALTER TABLE reports ALTER COLUMN status SET NOT NULL;`).catch(() => {});
  await db.query(`ALTER TABLE reports ALTER COLUMN reporter_id SET NOT NULL;`).catch(() => {});

  /*
   * `reports.status` 的 allowlist —— canonical 定義在 `utils/reportWorkflow.js`。
   *
   * 這裡用 DROP + ADD（而非 `EXCEPTION WHEN duplicate_object`）：舊資料庫上已經存在
   * 一個只允許 `pending | reviewed` 的同名 constraint，靠「已存在就跳過」永遠不會被放寬。
   * 兩個 statement 包在同一個 DO block 內 —— DO block 是單一 statement，
   * 不會出現「已 DROP、尚未 ADD」的無約束視窗。
   *
   * `reviewed` 是 legacy 終態，**保留於 allowlist 且不回填**：既有列反映的是
   * 「當時只做了標記已讀」，改寫會讓它與真正做過處置的案件無法區分。
   */
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
      ALTER TABLE reports
        ADD CONSTRAINT reports_status_check
        CHECK (status IN ('pending', 'investigating', 'awaiting_creator', 'resolved', 'dismissed', 'reviewed'));
    END $$;
  `);

  // 檢舉案件工作流欄位（Epic §2）。只做加法。
  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution TEXT;`);
  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;`);
  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_resolution_check;
      ALTER TABLE reports
        ADD CONSTRAINT reports_resolution_check
        CHECK (resolution IS NULL OR resolution IN ('dismissed', 'warning', 'request_changes', 'unpublish_material'));
    END $$;
  `);

  /*
   * 案件歷程 / 溝通串。Admin 的處理歷程與 Creator 的補充說明寫在同一張表，
   * 時間軸因此只有一份 —— 不需要在 UI 端把兩個來源合併排序。
   *
   * 這**不是** activity_logs 的替代品：activity_logs 是全平台稽核軌跡（不可竄改、
   * 不做業務查詢），report_events 是案件本身的內容（要顯示給 Creator 看）。
   * 兩者都會寫。
   */
  await db.query(`
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
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_report_events_report_id ON report_events(report_id, created_at);`
  );
  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);`);

  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE reports
        ADD CONSTRAINT reports_reporter_id_fkey
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE reports
        ADD CONSTRAINT reports_material_id_fkey
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // UNIQUE name collision can surface as SQLSTATE 42P07 (duplicate_table), not duplicate_object.
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_reports_material_reporter'
          AND conrelid = 'public.reports'::regclass
      ) THEN
        RETURN;
      END IF;

      BEGIN
        ALTER TABLE public.reports
          ADD CONSTRAINT uq_reports_material_reporter UNIQUE (material_id, reporter_id);
      EXCEPTION
        WHEN duplicate_table THEN
          DROP INDEX IF EXISTS public.uq_reports_material_reporter;
          BEGIN
            ALTER TABLE public.reports
              ADD CONSTRAINT uq_reports_material_reporter UNIQUE (material_id, reporter_id);
          EXCEPTION
            WHEN duplicate_table THEN NULL;
            WHEN duplicate_object THEN NULL;
          END;
        WHEN duplicate_object THEN NULL;
      END;
    END $$;
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_material_id ON reports(material_id);`);

  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by TEXT;`);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE reports
        ADD CONSTRAINT reports_reviewed_by_fkey
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON activity_logs(actor_id);`
  );
  await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);`
  );

  // Dev/demo: stable placeholder cover art when missing (Lorem Picsum — one image per material id).
  await db.query(`
    UPDATE materials
    SET cover_image_url = 'https://picsum.photos/seed/tp-' || md5(id::text) || '/640/480'
    WHERE cover_image_url IS NULL
       OR trim(cover_image_url) = ''
       OR lower(trim(cover_image_url)) IN ('https://example.com/cover.jpg', 'http://example.com/cover.jpg');
  `).catch((err) => {
    console.warn("material cover_image_url placeholder seed skipped:", err.message);
  });
}

function ensureCoreTables() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'buyer',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT users_role_check CHECK (role IN ('teacher', 'parent', 'buyer', 'admin'))
        );
      `);
      await db.query(`
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
          file_key TEXT NOT NULL,
          ip_declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
          ip_declaration_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.query(`
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
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS material_images (
          id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
          material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          alt_text TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_material_contents_material_id ON material_contents(material_id);
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_material_images_material_id ON material_images(material_id);
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_favorites (
          id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, material_id)
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_user_favorites_material_id ON user_favorites(material_id);`);

      await db.query(`
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS teaching_objective TEXT;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS teaching_methods JSONB;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS usage_duration TEXT;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS activity_steps TEXT;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS extension_value TEXT;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS short_description TEXT;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS material_features TEXT[] DEFAULT '{}';
        ALTER TABLE materials ALTER COLUMN material_features SET DEFAULT '{}';
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
        ALTER TABLE materials ADD COLUMN IF NOT EXISTS demo_video_url TEXT;
      `);

      await db.query(`
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
      `);
      await db.query(`
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
          paid_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS promotions (
          id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
          code TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK (type IN ('fixed', 'percent')),
          value INTEGER NOT NULL CHECK (value >= 0),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
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
          UNIQUE(order_id, material_id)
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS review (
          id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
          material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (material_id, parent_id)
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
          material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reviewed_at TIMESTAMPTZ,
          reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT reports_status_check CHECK (status IN ('pending', 'reviewed'))
        );
      `);
      // `id` 是 **identity 不是 time**（見 db/db_schema.sql 與 utils/activityLog.js）。
      // 2026-08-26 由 BIGSERIAL 更正為 TEXT UUID 以對齊既有資料庫（`SCHEMA-01`）——
      // 兩個實際資料庫都是 UUID，而 `CREATE TABLE IF NOT EXISTS` 永遠不會修正既存表，
      // 因此舊定義只會讓**新環境**拿到與所有既有環境不同的 schema。
      await db.query(`
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
      `);

      await runIdempotentMigrations();
      await verifyCriticalSchema();
    })();
  }
  return readyPromise;
}

/**
 * 關鍵 schema 的 fail-closed 驗證（`SCHEMA-01`，2026-08-26）。
 *
 * ## 為什麼需要這個
 *
 * `CREATE TABLE IF NOT EXISTS` **不能修正既存表的 schema drift** —— 這不是理論，
 * `activity_logs` 就這樣漂了：canonical 寫 `id BIGSERIAL`，兩個實際資料庫卻是
 * `id TEXT DEFAULT gen_random_uuid()::text`，而**兩邊都宣稱正常**。
 *
 * ## 責任分工（本輪明訂）
 *
 *   * **bootstrap 只負責建立新環境**（`ensureCoreTables` ＋ `runIdempotentMigrations`
 *     的 additive 語句）。它**不做** schema evolution —— 那是 `Backend/migrations/` 的事。
 *   * **bootstrap 另外負責「發現 drift 就不讓服務起來」**，也就是本函式。
 *     偵測到不一致時**不自動修**（自動改既存表正是 drift 難追的原因），
 *     而是 fail-closed 並指名該跑哪一支 migration。
 *
 * 這裡刻意**只驗會造成語意錯誤的欄位**，不做全表 schema diff ——
 * 後者需要一套 schema 快照框架，屬另一個題目。
 */
async function verifyCriticalSchema() {
  const checks = [
    {
      table: "activity_logs",
      column: "id",
      expect: "text",
      migration: "Backend/migrations/20260826_activity_logs_schema_reconciliation.sql",
      why: "activity_logs.id 是 identity 不是 time；BIGSERIAL 環境與既有 UUID 環境的 schema 不一致（SCHEMA-01）",
    },
    {
      table: "legal_documents",
      column: "requires_reconsent",
      expect: "boolean",
      // `NOT NULL` 與「無 DEFAULT」是 `DEC-LEGAL-06` 的核心 guardrail，
      // 兩者任一漂掉都會讓「發布時必須顯式決定」失效：
      //   * nullable  → 可以不回答就發布
      //   * 有 DEFAULT → 沒回答會被靜默填成一個看似答案的值
      // 因此這一項不只驗型別，也驗 nullability 與 default。
      requireNotNull: true,
      requireNoDefault: true,
      migration: "Backend/migrations/20260827b_legal_document_requires_reconsent.sql",
      why: "legal_documents.requires_reconsent 是 re-consent enforcement metadata，必須 NOT NULL 且無 DEFAULT（SCHEMA-03 / DEC-LEGAL-06）",
    },
  ];

  const problems = [];
  for (const check of checks) {
    const { rows } = await db.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2`,
      [check.table, check.column]
    );
    if (rows.length === 0) {
      problems.push(`${check.table}.${check.column} 不存在 —— ${check.why}。請執行 ${check.migration}`);
      continue;
    }
    const col = rows[0];
    if (col.data_type !== check.expect) {
      problems.push(
        `${check.table}.${check.column} 型別為 ${col.data_type}，canonical 為 ${check.expect}` +
          ` —— ${check.why}。請執行 ${check.migration}`
      );
    }
    if (check.requireNotNull && col.is_nullable !== "NO") {
      problems.push(
        `${check.table}.${check.column} 可為 NULL，canonical 為 NOT NULL` +
          ` —— ${check.why}。請執行 ${check.migration}`
      );
    }
    if (check.requireNoDefault && col.column_default !== null) {
      problems.push(
        `${check.table}.${check.column} 有 DEFAULT (${col.column_default})，canonical 為「無 DEFAULT」` +
          ` —— ${check.why}。請執行 ${check.migration}`
      );
    }
  }

  if (problems.length > 0) {
    const detail = problems.map((line) => `  - ${line}`).join("\n");
    throw new Error(`schema drift detected:\n${detail}`);
  }
}

module.exports = { ensureCoreTables, verifyCriticalSchema };
