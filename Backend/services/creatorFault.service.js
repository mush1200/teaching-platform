/**
 * 創作者過失分類 —— `DEC-35`。
 *
 * ## 這一層存在的理由
 *
 * `DEC-35` §Q1 明文排除「無依據的 Admin 勾選」「獨立人工開關」「無記載的人工餘額
 * 編輯」與「僅由退款狀態推論」。因此分類**必須**是一筆連結案件、帶書面依據、
 * 帶結構化 reason code、可稽核的獨立紀錄 —— `creator_fault = true` 這種布林值
 * 不符要求（§Q8）。
 *
 * ## 分類**不會**自己產生錢
 *
 * `non_creator_fault` → **完全不寫任何 ledger 分錄**（Platform absorb，`DEC-21` 未變）。
 * `creator_fault` → 才**得**由 `creatorLedger.recordAdjustment` 產生負向調整。
 * 兩者的分界在這裡固化：本模組不呼叫 ledger，ledger 也只接受已 commit 的分類 id。
 *
 * ## `case_type` 不能當分類
 *
 * `DEC-35` §Q12：`reason_code` 必須是獨立欄位。同一個 `case_type`
 * （例如 `material_takedown`）可以導向相反的歸責結論，拿它當分類等於沒分類。
 * 種子值取自 `refund_remedy_cases.case_type` 只是為了用語一致。
 */

const { writeActivityLog } = require("../utils/activityLog");

const CLASSIFICATION_RESULTS = Object.freeze(["creator_fault", "non_creator_fault"]);

const SOURCE_TYPES = Object.freeze([
  "refund_remedy_case",
  "consumer_complaint",
  "report_case",
  "manual_case_record",
]);

/** 結構化 reason code（`DEC-35` §Q4）。種子取自既有 `case_type` 用語。 */
const REASON_CODES = Object.freeze([
  "statutory_rescission",
  "duplicate_payment",
  "wrong_material",
  "corrupted_or_unusable_file",
  "access_failure",
  "material_takedown",
  "platform_nonperformance",
  "other",
]);

function validateInput({ sourceType, sourceId, result, reasonCode, writtenBasis, decidedBy, creatorId }) {
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw new Error(`creatorFault: unknown source_type ${sourceType}`);
  }
  if (!sourceId || !String(sourceId).trim()) {
    throw new Error("creatorFault: a source case id is required (DEC-35 Q1)");
  }
  if (!CLASSIFICATION_RESULTS.includes(result)) {
    throw new Error(`creatorFault: result must be one of ${CLASSIFICATION_RESULTS.join("/")}`);
  }
  if (!REASON_CODES.includes(reasonCode)) {
    throw new Error(`creatorFault: reason_code must be structured (DEC-35 Q4), got ${reasonCode}`);
  }
  if (!writtenBasis || !String(writtenBasis).trim()) {
    throw new Error("creatorFault: a written basis is required (DEC-35 Q3)");
  }
  if (!decidedBy) {
    throw new Error("creatorFault: the deciding operator must be recorded (DEC-35 Q3)");
  }
  if (result === "creator_fault" && !creatorId) {
    // `DEC-36` §R4：過失分類**不能治癒缺失的歸屬**。無法安全識別責任創作者時，
    // 對創作者追償一律 fail closed。
    throw new Error(
      "creatorFault: creator_fault requires a safely attributed creator; attribution cannot be invented (DEC-35 Q7 / DEC-36 R4)"
    );
  }
}

async function classify(
  client,
  {
    sourceType,
    sourceId,
    orderId = null,
    orderItemId = null,
    creatorId = null,
    result,
    reasonCode,
    writtenBasis,
    evidenceReference = null,
    decidedBy,
    supersedesId = null,
  }
) {
  validateInput({ sourceType, sourceId, result, reasonCode, writtenBasis, decidedBy, creatorId });

  const { rows } = await client.query(
    `INSERT INTO creator_fault_classifications
       (source_type, source_id, order_id, order_item_id, creator_id,
        result, reason_code, written_basis, evidence_reference, decided_by, supersedes_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      sourceType,
      sourceId,
      orderId,
      orderItemId,
      creatorId,
      result,
      reasonCode,
      writtenBasis,
      evidenceReference,
      decidedBy,
      supersedesId,
    ]
  );
  const classification = rows[0];

  await writeActivityLog({
    client,
    actorId: decidedBy,
    actorRole: "admin",
    targetType: "creator_fault_classification",
    targetId: classification.id,
    action: "creator_fault.classified",
    meta: {
      source_type: sourceType,
      source_id: sourceId,
      order_id: orderId,
      order_item_id: orderItemId,
      creator_id: creatorId,
      result,
      reason_code: reasonCode,
    },
  });

  return classification;
}

/**
 * 更正／推翻一個既有分類（`DEC-35` §Q9）。
 *
 * **不編輯原紀錄** —— 新增一筆帶 `supersedes_id` 的分類，原決定與更正軌跡都保留。
 * 若原分類已產生調整分錄，沖正由呼叫端以 `creatorLedger.recordReversal` 處理：
 * 分類與金額是兩件事，這裡不替呼叫端決定要不要沖正。
 */
async function correctClassification(client, { classificationId, ...next }) {
  const { rows } = await client.query(
    `SELECT * FROM creator_fault_classifications WHERE id = $1`,
    [classificationId]
  );
  if (rows.length === 0) {
    throw new Error(`creatorFault: unknown classification ${classificationId}`);
  }
  const original = rows[0];

  const replacement = await classify(client, {
    sourceType: next.sourceType ?? original.source_type,
    sourceId: next.sourceId ?? original.source_id,
    orderId: next.orderId ?? original.order_id,
    orderItemId: next.orderItemId ?? original.order_item_id,
    creatorId: next.creatorId ?? original.creator_id,
    result: next.result,
    reasonCode: next.reasonCode,
    writtenBasis: next.writtenBasis,
    evidenceReference: next.evidenceReference ?? null,
    decidedBy: next.decidedBy,
    supersedesId: classificationId,
  });

  await writeActivityLog({
    client,
    actorId: next.decidedBy,
    actorRole: "admin",
    targetType: "creator_fault_classification",
    targetId: replacement.id,
    action: "creator_fault.corrected",
    meta: {
      supersedes_id: classificationId,
      previous_result: original.result,
      result: replacement.result,
      reason_code: replacement.reason_code,
    },
  });

  return replacement;
}

/** 一個案件目前**有效**的分類（未被更正取代的那一筆）。 */
async function effectiveClassification(executor, { sourceType, sourceId }) {
  const { rows } = await executor.query(
    `SELECT c.* FROM creator_fault_classifications c
      WHERE c.source_type = $1 AND c.source_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM creator_fault_classifications s WHERE s.supersedes_id = c.id
        )
      ORDER BY c.decided_at DESC, c.id DESC
      LIMIT 1`,
    [sourceType, sourceId]
  );
  return rows[0] ?? null;
}

module.exports = {
  CLASSIFICATION_RESULTS,
  SOURCE_TYPES,
  REASON_CODES,
  classify,
  correctClassification,
  effectiveClassification,
};
