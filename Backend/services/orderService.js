const db = require("../config/db");
const paymentTimingPolicy = require("../utils/paymentTimingPolicy");
const { isNotDeliverable, MATERIAL_NOT_DELIVERABLE_MESSAGE } = require("../utils/materialDeliverability");

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
    /*
     * `has_timely_submission` 與 enforcement 用**同一個 canonical 判準**
     * （`utils/paymentTimingPolicy.js` 的 `TIMELY_SUBMISSION_SQL`）——
     * 不在這裡另寫一次「有沒有在期限前提交過」。
     */
    `SELECT o.id, o.user_id, o.status, o.payment_due_at,
            ${paymentTimingPolicy.TIMELY_SUBMISSION_SQL} AS has_timely_submission
       FROM orders o WHERE o.id = $1 LIMIT 1`,
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

  /*
   * **付款期限 enforcement**（Wave 2 #12，Option A + A2）。
   *
   * 這裡是**唯一**的 buyer payment-proof write gate —— `/orders/:id/payment-proof`
   * 與 legacy 的 `/orders/:id/upload-proof` 共用同一個 handler，兩者都會走到這裡，
   * 因此不存在繞過的路徑。
   *
   * **刻意排在 ownership 檢查之後**：non-owner 必須先拿到 403，
   * 不得因為期限錯誤而推知「這張訂單存在且已逾期」。
   *
   * 判準本身在 `utils/paymentTimingPolicy.js`：
   *   legacy（NULL）→ 放行；期限內 → 放行；
   *   逾期但曾在期限內成功提交過 → 放行（退件後可重傳）；
   *   逾期且從未提交過 → 拒絕。
   */
  const verdict = paymentTimingPolicy.evaluatePaymentSubmission({
    paymentDueAt: row.payment_due_at,
    hasTimelySubmission: row.has_timely_submission === true,
  });
  if (!verdict.allowed) {
    const err = new Error("payment deadline has passed for this order");
    err.code = "PAYMENT_DEADLINE_EXPIRED";
    err.meta = { paymentDueAt: row.payment_due_at, reason: verdict.reason };
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
              m.title, m.price, m.status, m.approved_file_id, m.teacher_id AS seller_id
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
      /*
       * 可交付性防線 #3（見 `utils/materialDeliverability.js`）—— 最後一道。
       *
       * 購物車可能停留數天，期間教材的檔案狀態會變；而這裡是**唯一**與建立訂單
       * 同一個 transaction 的檢查點，也就是唯一能保證「訂單成立」與「有東西可交付」
       * 原子一致的地方。`FOR UPDATE OF c` 只鎖 cart_items，所以這裡讀到的
       * `approved_file_id` 仍是當下值，正是我們要判斷的那一刻。
       */
      if (isNotDeliverable(row)) {
        await client.query("ROLLBACK");
        const err = new Error(MATERIAL_NOT_DELIVERABLE_MESSAGE);
        err.code = "MATERIALS_NOT_DELIVERABLE";
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
      /*
       * `payment_due_at` = 建單日（台灣日曆日）+ 7 個日曆日的**末日終了**
       * （產品決策 2026-08-26；canonical 見 `utils/paymentTimingPolicy.js`）。
       *
       * **建單當下就寫入、之後不再重算** —— 期限是對買家揭露過的承諾
       * （消保法 §18 I(2)）；政策日後調整時既有訂單必須維持當初的期限，
       * 不得追溯變動。這也是它是實體欄位而非 SELECT 推算值的理由。
       *
       * 舊訂單一律保持 NULL（本輪**不 backfill**）—— 它們建立時
       * 買家根本沒有被揭露過任何期限，未揭露的歷史狀態不得事後補成契約事實。
       */
      `INSERT INTO orders(
         id, user_id, status, total_amount, total_price, payment_mode,
         promo_code, discount_amount, invoice_type, invoice_carrier, payment_due_at
       )
       VALUES($1, $2, $3, $4, $4, 'manual_transfer', $5, $6, $7, $8, $9)`,
      [
        orderId,
        userId,
        PENDING,
        totalAmount,
        promoApplied.promoCode,
        promoApplied.discountAmount,
        normalizedInvoiceType,
        normalizedCarrier,
        paymentTimingPolicy.paymentDueAt(new Date()),
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
      err.code === "MATERIALS_NOT_DELIVERABLE" ||
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

/**
 * 記錄「這筆訂單履約時，實際交付給買家的是哪一個教材版本」（P1-09 Gate 7 / PRE-04.1）。
 *
 * ## 為什麼寫在付款核准的交易裡
 *
 * 買家的下載授權**正是在這一刻成立**（`orders.status → 'approved'`）。
 * 履約版本快照與授權成立必須是同一件事的兩面 ——
 * 分開寫會出現「有授權但不知道交付了什麼」或「記了版本但授權沒成立」的中間狀態。
 * 因此本函式必須以**同一個 transaction client** 呼叫。
 *
 * ## 三個守衛
 *
 * 1. `m.approved_file_id IS NOT NULL`
 *    —— 沒有已核准檔案時**不寫入**。legacy 教材（`published` 但無檔）確實存在，
 *    為它們寫一個猜的版本等於**製造假的履約證據**。未知就是未知。
 * 2. `oi.fulfilled_material_version_id IS NULL`
 *    —— **只寫一次**。重複核准或後續流程都不得改寫既有履約事實。
 * 3. 逐 `order_item` 各自解析
 *    —— 一張訂單多個品項時，每個品項對應各自教材當下的版本。
 *
 * ## 這不是「買家目前可下載的版本」
 *
 * 兩者是**不同的概念**：
 *   - `fulfilled_material_version_id` = **履約當下**交付的版本（歷史事實，永不改寫）
 *   - 目前可下載的版本 = 依 `PRE-04` 的更新政策決定
 *
 * 下載路徑目前仍動態解析 `materials.approved_file_id`，**本輪刻意不改** ——
 * 「Buyer 是否有權取得履約當時版本、平台可否只提供最新版」是
 * `PRE-04.7` / External Legal Gate `L-10` 的待確認事項，不由工程自行決定。
 *
 * @param {object} client 進行中的 transaction client（必填）
 * @param {string} orderId
 * @returns {Promise<{ snapshotted: number }>}
 */
async function recordFulfillmentSnapshot(client, orderId) {
  const { rowCount } = await client.query(
    `UPDATE order_items oi
        SET fulfilled_material_version_id = m.approved_file_id,
            fulfilled_at = NOW()
       FROM materials m
      WHERE oi.order_id = $1
        AND m.id = oi.material_id
        AND m.approved_file_id IS NOT NULL
        AND oi.fulfilled_material_version_id IS NULL`,
    [String(orderId)]
  );
  return { snapshotted: rowCount };
}

module.exports = {
  uploadProof,
  createOrderFromCart,
  resolvePromotion,
  recordFulfillmentSnapshot,
};
