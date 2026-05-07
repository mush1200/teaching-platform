const db = require("../config/db");

const PENDING = "pending_payment";
const INVOICE_NONE = "none";
const INVOICE_CARRIER = "carrier";

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

function normalizePromoCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase();
}

function validateCarrier(raw) {
  const v = String(raw || "").trim().toUpperCase();
  const ok = /^\/[A-Z0-9.+-]{7}$/.test(v);
  return ok ? v : null;
}

async function resolvePromotion(code, subtotal) {
  const normalized = normalizePromoCode(code);
  if (!normalized) return { promoCode: null, discountAmount: 0 };
  const result = await db.query(
    `SELECT id, code, type, value, is_active
     FROM promotions
     WHERE UPPER(code) = $1
     LIMIT 1`,
    [normalized]
  );
  if (result.rows.length === 0) {
    const err = new Error("優惠代碼不存在");
    err.code = "PROMO_NOT_FOUND";
    throw err;
  }
  const promo = result.rows[0];
  if (!promo.is_active) {
    const err = new Error("優惠代碼不可使用");
    err.code = "PROMO_NOT_ACTIVE";
    throw err;
  }
  const type = String(promo.type || "");
  const value = floorMoney(promo.value);
  let discountAmount = 0;
  if (type === "fixed") {
    discountAmount = Math.max(0, value);
  } else if (type === "percent") {
    discountAmount = Math.floor((Math.max(0, subtotal) * Math.max(0, value)) / 100);
  } else {
    const err = new Error("優惠代碼不可使用");
    err.code = "PROMO_INVALID_TYPE";
    throw err;
  }
  return {
    promoCode: String(promo.code),
    discountAmount: Math.max(0, Math.min(discountAmount, Math.max(0, subtotal))),
  };
}

/**
 * 上傳付款憑證前檢查：驗證訂單歸屬、狀態與憑證數量限制（最多 maxProofs 張）。
 */
async function uploadProof(orderId, userId, incomingProofCount, maxProofs = 3) {
  const incoming = Number(incomingProofCount);
  if (!Number.isInteger(incoming) || incoming < 1) {
    const err = new Error("at least one proof image is required");
    err.code = "MISSING_PROOF_FILES";
    throw err;
  }

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

  const proofCountResult = await db.query(
    `SELECT COUNT(*)::int AS c FROM manual_payment_proofs WHERE order_id = $1`,
    [String(orderId)]
  );
  const existingProofCount = Number(proofCountResult.rows[0]?.c || 0);
  if (existingProofCount + incoming > maxProofs) {
    const err = new Error(`proof images exceed limit (${maxProofs} max per order)`);
    err.code = "MAX_PROOFS_EXCEEDED";
    err.meta = { maxProofs, existingProofCount, incoming };
    throw err;
  }

  return {
    orderId: String(orderId),
    existingProofCount,
    incomingProofCount: incoming,
    maxProofs,
  };
}

/**
 * 由 cart_item 建立 order + order_item（單一 transaction）。
 */
async function createOrderFromCart(
  userId,
  {
    promoCode = "",
    invoiceType = INVOICE_NONE,
    invoiceCarrier = null,
  } = {}
) {
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

    const subtotalAmount = lines.reduce((s, L) => s + L.subtotal, 0);
    const promoApplied = await resolvePromotion(promoCode, subtotalAmount);
    const totalAmount = Math.max(0, subtotalAmount - promoApplied.discountAmount);
    const orderId = newOrderId();
    const normalizedInvoiceType = invoiceType === INVOICE_CARRIER ? INVOICE_CARRIER : INVOICE_NONE;
    const normalizedCarrier = normalizedInvoiceType === INVOICE_CARRIER ? validateCarrier(invoiceCarrier) : null;
    if (normalizedInvoiceType === INVOICE_CARRIER && !normalizedCarrier) {
      const err = new Error("手機載具格式不正確");
      err.code = "INVALID_CARRIER";
      throw err;
    }

    await client.query(
      `INSERT INTO orders(
         id, user_id, status, total_amount, total_price, payment_mode,
         promo_code, discount_amount, invoice_type, invoice_carrier
       )
       VALUES($1, $2, $3, $4, $4, 'manual_transfer', $5, $6, $7, $8)`,
      [
        orderId,
        userId,
        PENDING,
        totalAmount,
        promoApplied.promoCode,
        promoApplied.discountAmount,
        normalizedInvoiceType,
        normalizedCarrier,
      ]
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
      `SELECT id, user_id, status, payment_mode, total_amount, created_at,
              promo_code, discount_amount, invoice_type, invoice_carrier
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
        promo_code: o.promo_code,
        discount_amount: o.discount_amount,
        invoice_type: o.invoice_type,
        invoice_carrier: o.invoice_carrier,
      },
      items: insertedItems,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (
      err.code === "CART_EMPTY" ||
      err.code === "MATERIALS_UNAVAILABLE" ||
      err.code === "PROMO_NOT_FOUND" ||
      err.code === "PROMO_NOT_ACTIVE" ||
      err.code === "PROMO_INVALID_TYPE" ||
      err.code === "INVALID_CARRIER"
    ) {
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
  resolvePromotion,
};
