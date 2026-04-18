const db = require("../config/db");

const PENDING = "pending_payment";

function newOrderId() {
  return `ord_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function newOrderItemId() {
  return `oi_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function floorMoney(n) {
  const x = Number(n);
  return Math.floor(Number.isFinite(x) ? x : 0);
}

/**
 * 上傳付款憑證：寫入 manual_payment_proofs（由 route 呼叫）；訂單仍為 pending_payment。
 */
async function uploadProof(orderId, userId, proofUrl) {
  if (proofUrl === undefined || proofUrl === null || String(proofUrl).trim() === "") {
    const err = new Error("proofUrl is required");
    err.code = "MISSING_PROOF_URL";
    throw err;
  }

  const url = String(proofUrl).trim();

  const existing = await db.query(
    `SELECT id, user_id, status FROM orders WHERE id = $1 LIMIT 1`,
    [String(orderId)]
  );

  if (existing.rows.length === 0) {
    const err = new Error("order not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  const row = existing.rows[0];
  if (String(row.user_id) !== String(userId)) {
    const err = new Error("forbidden");
    err.code = "FORBIDDEN";
    throw err;
  }

  if (row.status !== PENDING) {
    const err = new Error("only pending_payment order can upload proof");
    err.code = "INVALID_STATUS";
    throw err;
  }

  return { proofUrl: url };
}

/**
 * 由 cart_item 建立 order + order_item（單一 transaction）。
 */
async function createOrderFromCart(userId) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const cartResult = await client.query(
      `SELECT c.id AS cart_item_id, c.material_id, c.quantity,
              m.title, m.price, m.status, m.teacher_id AS seller_id
       FROM cart_items c
       INNER JOIN materials m ON m.id = c.material_id
       WHERE c.user_id = $1
       ORDER BY c.created_at ASC
       FOR UPDATE OF c`,
      [userId]
    );

    if (cartResult.rows.length === 0) {
      await client.query("ROLLBACK");
      const err = new Error("Cart is empty");
      err.code = "CART_EMPTY";
      throw err;
    }

    const lines = [];
    for (const row of cartResult.rows) {
      if (row.status !== "published") {
        await client.query("ROLLBACK");
        const err = new Error("One or more materials are unavailable");
        err.code = "MATERIALS_UNAVAILABLE";
        throw err;
      }
      const qty = Number(row.quantity);
      const quantity = Number.isInteger(qty) && qty > 0 ? qty : 1;
      const unitPrice = floorMoney(row.price);
      const subtotal = unitPrice * quantity;
      lines.push({
        materialId: String(row.material_id),
        materialTitle: String(row.title),
        sellerId: String(row.seller_id),
        unitPrice,
        quantity,
        subtotal,
      });
    }

    const totalAmount = lines.reduce((s, L) => s + L.subtotal, 0);
    const orderId = newOrderId();

    await client.query(
      `INSERT INTO orders(id, user_id, status, total_amount, total_price, payment_mode)
       VALUES($1, $2, $3, $4, $4, 'manual_transfer')`,
      [orderId, userId, PENDING, totalAmount]
    );

    const insertedItems = [];
    for (const line of lines) {
      const oiId = newOrderItemId();
      await client.query(
        `INSERT INTO order_items(
           id, order_id, material_id, title_snapshot, price_snapshot, quantity,
           seller_id, subtotal
         )
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          oiId,
          orderId,
          line.materialId,
          line.materialTitle,
          line.unitPrice,
          line.quantity,
          line.sellerId,
          line.subtotal,
        ]
      );
      insertedItems.push({
        id: oiId,
        order_id: orderId,
        material_id: line.materialId,
        material_title: line.materialTitle,
        seller_id: line.sellerId,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        subtotal: line.subtotal,
      });
    }

    await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
    await client.query("COMMIT");

    const orderRow = await db.query(
      `SELECT id, user_id, status, payment_mode, total_amount, created_at
       FROM orders WHERE id = $1`,
      [orderId]
    );

    const o = orderRow.rows[0];
    return {
      order: {
        id: o.id,
        user_id: o.user_id,
        status: o.status,
        payment_mode: o.payment_mode,
        total_amount: o.total_amount,
        created_at: o.created_at,
      },
      items: insertedItems,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err.code === "CART_EMPTY" || err.code === "MATERIALS_UNAVAILABLE") {
      throw err;
    }
    console.error("createOrderFromCart failed:", err);
    const wrap = new Error("Failed to create order");
    wrap.code = "CREATE_FAILED";
    wrap.cause = err;
    throw wrap;
  } finally {
    client.release();
  }
}

module.exports = {
  uploadProof,
  createOrderFromCart,
};
