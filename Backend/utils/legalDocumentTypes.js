/**
 * 法律文件型別的 canonical allowlist（`P1-09` Legal Foundation）。
 *
 * ## 為什麼獨立成一個模組（`OPS-05`，2026-08-30）
 *
 * 這份清單原本宣告在 `services/legalDocument.service.js` 裡。那沒有錯，
 * 但那個 service 會 `require("../config/db")`，而 `config/db` 在**模組載入時**
 * 就建立連線池，缺少 PG 環境變數會直接 throw。
 *
 * 結果是：任何只想知道「合法型別有哪些」的純邏輯（例如發布前置檢查），
 * 都被迫連帶要求一個可用的資料庫設定。把常數搬到這個**沒有任何 I/O 相依**的模組後，
 * 純函式可以重用同一份定義，而不必為了一個字串陣列去碰資料庫。
 *
 * **這是唯一的 source of truth。** `services/legalDocument.service.js` 從這裡 require
 * 並原樣 re-export（既有呼叫端如 `routes/adminLegalDocuments.js` 完全不受影響），
 * `utils/legalPublicationPreflight.js` 也從這裡 require ——
 * 兩邊共用同一份，不存在「前置檢查說可以、API 說不行」的漂移空間。
 *
 * 四種型別對應 `DEC-04`（Owner，2026-08-27）拍板的四份文件，
 * 以及 `db/db_schema.sql` 的 `legal_documents_document_type_check`。
 * **新增型別必須同時改這裡與 DB CHECK**，否則寫入會在資料庫層被擋下。
 */

const DOCUMENT_TYPES = Object.freeze([
  "terms",
  "privacy",
  "creator_agreement",
  "refund_policy",
]);

function isValidDocumentType(value) {
  return DOCUMENT_TYPES.includes(value);
}

module.exports = { DOCUMENT_TYPES, isValidDocumentType };
