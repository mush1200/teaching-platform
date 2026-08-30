/**
 * 教材權利審查（P1-09 Gate 2 / D5）。
 *
 * ## 這不是一般內容審核
 *
 * `services/materialReview.service.js` 處理的是**上架狀態機**
 * （`pending_review` → `published` / `changes_requested`），
 * 它把最新一次決定寫進 `materials.reviewed_*`（會被覆寫，schema 註解明寫「不是 history」）。
 *
 * 本模組處理的是**法律權利審查**：平台對這份教材的權利風險做過什麼審查、
 * 發現什麼、依據什麼證據。兩者**不得互相代表**。
 *
 * ## 為什麼刻意不掛在 approve/reject 流程上
 *
 * 若在核准教材時自動寫一筆權利審查記錄，會產生兩個問題：
 *
 *   1. **語意混淆** —— 「核准上架」會等同於「權利審查通過」。
 *      在 Platform-as-Seller 模式下，平台自身的重製與交付行為
 *      不受 ISP 免責事由保護，權利審查是平台自己的防線，
 *      不能是狀態機的副作用。
 *   2. **假的盡職證據** —— 目前沒有讓審查者輸入 risk flags 與證據的介面，
 *      自動寫入的記錄會是空 flags、無證據的空殼，
 *      它**看起來像**盡職紀錄，實際上什麼都沒審。
 *
 * 因此權利審查是**明示的行為**：透過專屬端點記錄，由審查者主動填寫。
 *
 * ## append-only
 *
 * 每一次審查是一個時間點上的決定，**不得事後改寫**（DB trigger 強制）。
 * 要改變結論就寫一筆新的審查記錄；「最新結論」即時間序上的最後一筆。
 */

const db = require("../config/db");

/** 對應 baseline `D6` 的高風險檢查點。與 DB CHECK 保持一致。 */
const RISK_FLAGS = Object.freeze([
  "famous_character",
  "trademark_logo",
  "stock_image",
  "font_license",
  "scanned_book",
  "music_audio",
  "portrait",
  "child_identity",
  "ai_imitation",
  "third_party_work",
  "other",
]);

const REVIEW_RESULTS = Object.freeze(["pending", "approved", "rejected", "needs_evidence"]);

function fail(code, message) {
  return { ok: false, code, message };
}

/**
 * 記錄一次權利審查。
 *
 * `declarationVersion` 刻意**沒有預設值**：目前沒有任何經核可的聲明文字與版本，
 * 未知就保持 NULL —— 硬填會製造假證據。
 */
async function recordReview({
  materialId,
  reviewedBy,
  reviewResult,
  riskFlags = [],
  notes = null,
  declarationVersion = null,
  declarationConsentId = null,
  evidenceReference = null,
} = {}) {
  if (!materialId) return fail("material_required", "materialId is required");
  if (!reviewedBy) return fail("reviewer_required", "reviewedBy is required");
  if (!REVIEW_RESULTS.includes(reviewResult)) {
    return fail("invalid_review_result", `reviewResult must be one of: ${REVIEW_RESULTS.join(", ")}`);
  }

  const flags = Array.isArray(riskFlags) ? [...new Set(riskFlags.map(String))] : null;
  if (flags === null) return fail("invalid_risk_flags", "riskFlags must be an array");
  const unknown = flags.filter((f) => !RISK_FLAGS.includes(f));
  if (unknown.length) {
    return fail("invalid_risk_flags", `unknown risk flags: ${unknown.join(", ")}`);
  }

  const cleanNotes = notes != null && String(notes).trim() !== "" ? String(notes).trim() : null;
  if (reviewResult === "needs_evidence" && !cleanNotes) {
    // 沒有說明就要求補件，對 Creator 是無法行動的結論。
    return fail("notes_required", "needs_evidence requires notes explaining what is needed");
  }

  const exists = await db.query(`SELECT id FROM materials WHERE id = $1`, [String(materialId)]);
  if (exists.rows.length === 0) return fail("material_not_found", "material not found");

  const { rows } = await db.query(
    `INSERT INTO material_rights_reviews(
       material_id, reviewed_by, review_result, risk_flags, notes,
       declaration_version, declaration_consent_id, evidence_reference
     )
     VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8)
     RETURNING *`,
    [
      String(materialId),
      String(reviewedBy),
      reviewResult,
      flags,
      cleanNotes,
      declarationVersion,
      declarationConsentId,
      evidenceReference,
    ]
  );
  return { ok: true, review: rows[0] };
}

/** 最新一次權利審查的結論。沒有任何審查記錄時回 `null`（**那是合法狀態**）。 */
async function getLatestReview(materialId) {
  const { rows } = await db.query(
    `SELECT * FROM material_rights_reviews
      WHERE material_id = $1
      ORDER BY reviewed_at DESC, created_at DESC
      LIMIT 1`,
    [String(materialId)]
  );
  return rows[0] ?? null;
}

/** 完整審查歷程（新到舊）。 */
async function listReviewHistory(materialId) {
  const { rows } = await db.query(
    `SELECT * FROM material_rights_reviews
      WHERE material_id = $1
      ORDER BY reviewed_at DESC, created_at DESC`,
    [String(materialId)]
  );
  return rows;
}

module.exports = {
  RISK_FLAGS,
  REVIEW_RESULTS,
  recordReview,
  getLatestReview,
  listReviewHistory,
};
