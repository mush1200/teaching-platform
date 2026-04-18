const db = require("../config/db");

let ensureCartTablePromise = null;

function ensureCartTable() {
  if (!ensureCartTablePromise) {
    ensureCartTablePromise = (async () => {
      await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
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
    })();
  }

  return ensureCartTablePromise;
}

async function addItem(userId, materialId, quantity = 1) {
  await ensureCartTable();

  const existing = await db.query(
    `SELECT id, user_id, material_id, quantity, created_at, updated_at
     FROM cart_items
     WHERE user_id = $1 AND material_id = $2`,
    [userId, materialId]
  );

  if (existing.rows.length > 0) {
    const result = await db.query(
      `UPDATE cart_items
       SET quantity = quantity + $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND material_id = $2
       RETURNING id, user_id, material_id, quantity, created_at, updated_at`,
      [userId, materialId, quantity]
    );

    return result.rows[0];
  }

  const result = await db.query(
    `INSERT INTO cart_items(user_id, material_id, quantity)
     VALUES($1, $2, $3)
     RETURNING id, user_id, material_id, quantity, created_at, updated_at`,
    [userId, materialId, quantity]
  );

  return result.rows[0];
}

async function getCart(userId) {
  await ensureCartTable();

  const result = await db.query(
    `SELECT c.id, c.user_id, c.material_id, c.quantity, c.created_at, c.updated_at,
            m.title, m.price
     FROM cart_items c
     LEFT JOIN materials m ON m.id = c.material_id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    ...row,
    name: row.title || null,
    price: row.price !== null ? Number(row.price) : null,
  }));
}

async function removeItem(userId, materialId) {
  await ensureCartTable();

  await db.query(`DELETE FROM cart_items WHERE user_id = $1 AND material_id = $2`, [userId, materialId]);

  return true;
}

async function clearCart(userId) {
  await ensureCartTable();

  await db.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

  return true;
}

module.exports = {
  addItem,
  getCart,
  removeItem,
  clearCart,
};
