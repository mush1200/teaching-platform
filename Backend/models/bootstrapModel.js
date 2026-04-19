const db = require("../config/db");

let readyPromise = null;

async function runIdempotentMigrations() {
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Legacy Day13–14 tables; MVP v1.2 uses materials + manual_payment_proofs only.
  await db.query(`DROP TABLE IF EXISTS payment_proofs CASCADE;`);
  await db.query(`DROP TABLE IF EXISTS products CASCADE;`);

  await db.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount INTEGER;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_mode TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
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
  `);

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

  await db.query(`CREATE INDEX IF NOT EXISTS idx_review_material_id ON review(material_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_review_parent_id ON review(parent_id);`);
  await db.query(`DROP INDEX IF EXISTS idx_review_reviewer_id;`);
}

function ensureCoreTables() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'parent',
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
          paid_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          proof_url TEXT,
          proof_uploaded_at TIMESTAMP,
          payment_method TEXT,
          rejected_reason TEXT,
          approved_by TEXT,
          approved_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          material_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
