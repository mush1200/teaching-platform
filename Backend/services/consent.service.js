/**
 * 同意證據（consent evidence）—— P1-09 Gate 5 foundation。
 *
 * 這一層只做兩件事：**寫入一筆同意證據**、**查詢某人／某訂單／某教材同意過什麼**。
 *
 * ## 目前尚未接線任何流程
 *
 * repo 中**沒有任何經核可的法律文件**（無 `/terms`、無 `/privacy`、無條文）。
 * 在那之前把註冊 checkbox 或教材聲明接到這裡，只會保存
 * **指向不存在版本的同意記錄** —— 那比沒有記錄更糟：
 * 系統會宣稱「使用者同意了 v1.0」，而 v1.0 從未存在過。
 *
 * 接線必須等 `P1-09` 的正式條文到位（該項仍為 OPEN deployment blocker）。
 *
 * ## H-VERSION 不變條件
 *
 * 同意證據是 **append-only**：`accepted_at`、`document_version` 等既有事實
 * **不得被改寫**（DB trigger 強制）。需要更正時的正確做法是
 * `supersede()` —— 寫一筆新記錄，並讓舊列指向它。
 * 這樣「當初同意的是什麼」與「後來如何被更正」兩件事都保得住。
 *
 * ## legacy 資料
 *
 * `materials.ip_declaration_accepted` / `ip_declaration_at` 是**沒有文件版本**的
 * 聲明記錄：建立教材時 request 的 `ipDeclarationAccepted` 必須明確為 `true`
 * 並經 backend 驗證，因此它是創作者的明示行為 —— 但沒有版本與內容雜湊。
 * 它**不會**被搬進本表，也**不會**被 backfill 成任何版本 ——
 * 未知的版本就是未知，硬填會製造假證據。
 */

const db = require("../config/db");

/** 對應 v1.8 baseline 的 Consent UI 結構。新增情境需要一次 migration。 */
const CONTEXT_TYPES = Object.freeze([
  "registration",
  "creator_agreement",
  "material_declaration",
  "checkout_purchase_rules",
  "checkout_rescission_notice",
  "reconsent",
]);

/** 哪些情境**必須**帶關聯 id（與 DB 的 `consent_records_context_link_check` 一致）。 */
const REQUIRED_LINK = Object.freeze({
  material_declaration: "materialId",
  checkout_purchase_rules: "orderId",
  checkout_rescission_notice: "orderId",
});

function fail(code, message) {
  return { ok: false, code, message };
}

/**
 * 記錄一筆同意證據。
 *
 * `documentVersion` 為必填且不得空白 —— **沒有版本的「同意」不構成可用的證據**。
 * `acceptedAt` 可由呼叫端指定（用於補登實際發生時間），未提供則為 NOW()。
 */
async function recordConsent({
  userId,
  documentType,
  documentVersion,
  documentEffectiveDate = null,
  documentContentHash = null,
  contextType,
  orderId = null,
  materialId = null,
  acceptedAt = null,
  client = null,
} = {}) {
  if (!userId) return fail("user_required", "userId is required");
  if (!documentType || !String(documentType).trim()) {
    return fail("document_type_required", "documentType is required");
  }
  if (!documentVersion || !String(documentVersion).trim()) {
    // 刻意不提供預設值：沒有版本就不要記錄，不要編一個。
    return fail("document_version_required", "documentVersion is required — an unversioned consent is not usable evidence");
  }
  if (!CONTEXT_TYPES.includes(contextType)) {
    return fail("invalid_context_type", `contextType must be one of: ${CONTEXT_TYPES.join(", ")}`);
  }

  const needed = REQUIRED_LINK[contextType];
  if (needed === "materialId" && !materialId) {
    return fail("material_required", `contextType '${contextType}' requires materialId`);
  }
  if (needed === "orderId" && !orderId) {
    return fail("order_required", `contextType '${contextType}' requires orderId`);
  }

  const runner = client || db;
  const { rows } = await runner.query(
    `INSERT INTO consent_records(
       user_id, document_type, document_version, document_effective_date,
       document_content_hash, context_type, order_id, material_id, accepted_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamp, NOW()))
     RETURNING *`,
    [
      String(userId),
      String(documentType).trim(),
      String(documentVersion).trim(),
      documentEffectiveDate,
      documentContentHash,
      contextType,
      orderId ? String(orderId) : null,
      materialId ? String(materialId) : null,
      acceptedAt,
    ]
  );
  return { ok: true, consent: rows[0] };
}

/**
 * 更正一筆同意證據 —— **不改舊列**，而是寫一筆新記錄並讓舊列指向它。
 *
 * 這是唯一被允許在既有列上寫入的欄位（`superseded_by_id`）；
 * 它**新增資訊而不竄改既有事實**。
 */
async function supersede(previousConsentId, next) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const created = await recordConsent({ ...next, client });
    if (!created.ok) {
      await client.query("ROLLBACK");
      return created;
    }
    const updated = await client.query(
      `UPDATE consent_records SET superseded_by_id = $2
        WHERE id = $1 AND superseded_by_id IS NULL
        RETURNING id`,
      [String(previousConsentId), created.consent.id]
    );
    if (updated.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("supersede_target_unavailable", "previous consent not found or already superseded");
    }
    await client.query("COMMIT");
    return created;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 查詢同意證據。
 *
 * `activeOnly`（預設 true）排除已被取代的記錄 —— 回答「目前有效的同意是哪一筆」。
 * 要取得完整歷程（含被取代的）時傳 `activeOnly: false`。
 */
async function findConsents({
  userId = null,
  documentType = null,
  documentVersion = null,
  contextType = null,
  orderId = null,
  materialId = null,
  activeOnly = true,
} = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (userId) add("user_id = ?", String(userId));
  if (documentType) add("document_type = ?", String(documentType));
  if (documentVersion) add("document_version = ?", String(documentVersion));
  if (contextType) add("context_type = ?", String(contextType));
  if (orderId) add("order_id = ?", String(orderId));
  if (materialId) add("material_id = ?", String(materialId));
  if (activeOnly) where.push("superseded_by_id IS NULL");

  const { rows } = await db.query(
    `SELECT * FROM consent_records
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY accepted_at DESC, created_at DESC`,
    params
  );
  return rows;
}

module.exports = {
  CONTEXT_TYPES,
  recordConsent,
  supersede,
  findConsents,
};
