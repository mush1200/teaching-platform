const db = require("../config/db");

let readyPromise = null;

async function runIdempotentMigrations() {
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await db.query(`
    UPDATE users
    SET role = 'buyer'
    WHERE role = 'parent';
  `).catch(() => {});
  await db.query(`
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'buyer';
  `).catch(() => {});

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

  await db.query(`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS demo_video_url TEXT;
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS material_features TEXT[] DEFAULT '{}';
    ALTER TABLE materials ALTER COLUMN material_features SET DEFAULT '{}';
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
  await db.query(`CREATE INDEX IF NOT EXISTS idx_material_images_material_id ON material_images(material_id);`);
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

  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE reports
        ADD CONSTRAINT reports_status_check
        CHECK (status IN ('pending', 'reviewed'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      await db.query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id BIGSERIAL PRIMARY KEY,
          actor_id TEXT,
          actor_role TEXT,
          target_type TEXT NOT NULL,
          target_id TEXT,
          action TEXT NOT NULL,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await runIdempotentMigrations();
    })();
  }
  return readyPromise;
}

module.exports = { ensureCoreTables };
