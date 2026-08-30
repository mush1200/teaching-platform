/**
 * 法律文件登記（P1-09 Legal Foundation — Gate 12 foundation）。
 *
 * 這一層回答三個問題，而且是**唯一**能回答它們的地方：
 *
 *   1. 平台目前對外生效的 <type> 文件是哪一份、哪一版？   `getCurrentPublished()`
 *   2. 那份文件的正文與雜湊是什麼？                       同上
 *   3. 歷史上曾經生效過哪些版本？                         `listByType()`（Admin）
 *
 * ## 為什麼 current version 必須由 server 決定
 *
 * 前端**不得**自己抓一堆文件再 `sort by published_at` 決定哪個是現行版 ——
 * 那會讓「現行條款是哪一版」變成 client 可影響的事，而它同時是
 * 未來 consent 證據的標的。canonical resolver 只有這裡一個。
 *
 * ## published-only
 *
 * `draft` 與 `approved` **永遠不對外**。它們是內部稿件，
 * 若能被 public 讀到，等於平台對外發布了未經核可的法律文字。
 * `superseded` 不是 current，但仍可由 Admin 讀取 —— 歷史 consent 證據
 * 會指向它，稽核時必須查得到當時的正文。
 *
 * ## 本模組**不**做的事
 *
 * **不接線任何 production consent flow。** 註冊、結帳、創作者聲明全部維持現況。
 * 文件端就緒不等於 consent 端就緒 —— 後者要等真的有 published 文件之後
 * 才有東西可以繫結（見 Gate 5 / Gate 11 第 4 條 / Gate 13）。
 */

const crypto = require("crypto");
const db = require("../config/db");
const { validatePublishJustification } = require("../utils/legalDocumentPublishPolicy");

/** `DEC-04`（2026-08-27 Owner 拍板）。與 DB CHECK 保持一致。 */
const DOCUMENT_TYPES = Object.freeze([
  "terms",
  "privacy",
  "creator_agreement",
  "refund_policy",
]);

const PUBLICATION_STATUSES = Object.freeze(["draft", "approved", "published", "superseded"]);

/**
 * 合法狀態流轉。`superseded` 是終態；`published → superseded` 只由
 * `publish()` 在同一個 transaction 內部完成，不開放單獨呼叫 ——
 * 否則會出現「沒有任何 current 版本」的空窗。
 */
const TRANSITIONS = Object.freeze({
  draft: ["approved"],
  approved: ["published"],
  published: [],
  superseded: [],
});

/** public 只看得到 published。 */
const PUBLIC_READABLE_STATUSES = Object.freeze(["published"]);

function fail(code, message) {
  return { ok: false, code, message };
}

function isValidType(value) {
  return DOCUMENT_TYPES.includes(value);
}

/**
 * `requires_reconsent` 的**嚴格**驗證（`SCHEMA-03` / `DEC-LEGAL-06`）。
 *
 * ## 為什麼這裡沒有 fallback
 *
 * 這個欄位回答的是「發布這一版時，系統是否要求既有使用者重新同意」。
 * 只要出現 `?? false`、`Boolean(value)`、`value === "true"` 這類寬鬆轉換，
 * 「沒有人回答過這個問題」就會被靜默轉成一個看起來像答案的 `false`，
 * 事後稽核再也分不出「決定不要求」與「沒人想過」。
 *
 * 因此：**只接受真正的 boolean**。`"true"` / `"false"` / `0` / `1` / `null` /
 * `undefined` / 物件一律拒絕。DB 端同樣沒有 DEFAULT，兩層都不替呼叫端作答。
 *
 * **本欄位不是法律上「重大變更」之認定**（`DEC-LEGAL-01` 律師側仍未決）；
 * 它只是 production enforcement metadata。也因此**刻意不是 enum** ——
 * 不得引入 material / non_material 之類的法律分類值。
 *
 * @returns {{ok: true, value: boolean} | {ok: false, code: string, message: string}}
 */
function validateRequiresReconsent(value) {
  if (value === undefined || value === null) {
    return fail(
      "requires_reconsent_required",
      "requiresReconsent is required and must be an explicit boolean (true or false); there is no default"
    );
  }
  if (typeof value !== "boolean") {
    return fail(
      "requires_reconsent_invalid",
      `requiresReconsent must be a boolean, received ${typeof value}; strings such as "true" are not accepted`
    );
  }
  return { ok: true, value };
}

/**
 * 正文的 canonical 雜湊。
 *
 * 對**實際儲存的 UTF-8 位元組**計算，不做 trim / 換行正規化 / 大小寫轉換 ——
 * 任何一種 normalization 都必須在 server 與未來的 consent 比對端完全一致，
 * 而最不容易出錯的一致性就是「不轉換」。client 不得提供雜湊。
 */
function computeContentHash(body) {
  return crypto.createHash("sha256").update(String(body), "utf8").digest("hex");
}

/**
 * 把 `effective_date` 正規化成 `YYYY-MM-DD` 字串。
 *
 * **為什麼需要這個：** node-postgres 把 `DATE` 解析成「本地時區午夜」的 JS `Date`，
 * 而 `JSON.stringify` 會用 `toISOString()` 轉成 UTC —— 在台北（UTC+8）
 * `2026-10-01` 因此變成 `"2026-09-30T16:00:00.000Z"`。
 * 任何前端只要取前 10 個字元，拿到的生效日就**少一天**。
 *
 * 生效日是法律文件對外的關鍵事實（條款何時開始拘束使用者），
 * 差一天不是顯示瑕疵。因此在 API 邊界就固定成不帶時區的日期字串。
 * 用本地日期分量取值，正是 pg 解析時使用的同一組分量，可無損還原。
 */
function formatEffectiveDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/** 對外投影：public 讀取時**不**帶內部審核欄位。 */
function toPublicView(row) {
  if (!row) return null;
  return {
    documentType: row.document_type,
    version: row.version,
    body: row.body,
    contentHash: row.content_hash,
    effectiveDate: formatEffectiveDate(row.effective_date),
    publishedAt: row.published_at,
  };
}

/** Admin 投影：完整生命週期資訊。 */
function toAdminView(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentType: row.document_type,
    version: row.version,
    body: row.body,
    contentHash: row.content_hash,
    effectiveDate: formatEffectiveDate(row.effective_date),
    // `SCHEMA-03`：Admin 端必須看得到這個旗標才稽核得了「這一版是否要求重新同意」。
    // **刻意不放進 `toPublicView`** —— 那是 enforcement metadata，不是條款正文。
    requiresReconsent: row.requires_reconsent,
    publicationStatus: row.publication_status,
    createdAt: row.created_at,
    createdBy: row.created_by,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    supersededAt: row.superseded_at,
    supersededById: row.superseded_by_id,
  };
}

/**
 * 建立草稿。
 *
 * `body` 與 `effectiveDate` 在 draft 階段皆可省略（法務可能先佔一個版本號），
 * 但 `publish()` 時兩者缺一不可 —— 該檢查同時存在於 DB CHECK，不靠這層自律。
 *
 * ## 為什麼 draft 階段就要提供 `requiresReconsent`（`SCHEMA-03`）
 *
 * `DEC-LEGAL-06` 把欄位定為 **`NOT NULL`**，而本表的 lifecycle 是
 * 「建立 draft 時就 INSERT 一整列」。兩者相加 → INSERT 當下就必須有值，
 * 而唯一不需要值的作法是給 DB `DEFAULT`，那正是本決定明文禁止的。
 *
 * 因此採**兩處皆顯式**：
 *
 *   * `createDraft` 要求顯式 boolean —— 滿足 `NOT NULL` 且不引入任何 default。
 *   * `publish` **另外**要求顯式 boolean，且**以發布時提供的值為準**（覆寫 draft 值）。
 *
 * draft 階段的值是**暫定**的，只是為了讓列成立；真正被稽核、被 immutability
 * 鎖住、被寫進 activity log 的，是**發布時**那一次顯式決定。
 * 這樣既沒有隱藏 default，也沒有讓 publish 變成「沿用別人早先填的值」。
 */
async function createDraft({
  documentType,
  version,
  body = null,
  effectiveDate = null,
  requiresReconsent,
  actorId = null,
} = {}) {
  if (!isValidType(documentType)) {
    return fail("invalid_document_type", `documentType must be one of: ${DOCUMENT_TYPES.join(", ")}`);
  }
  if (!version || !String(version).trim()) {
    return fail("version_required", "version is required and must not be blank");
  }
  const reconsent = validateRequiresReconsent(requiresReconsent);
  if (!reconsent.ok) return reconsent;

  const normalizedVersion = String(version).trim();
  const hasBody = body !== null && body !== undefined;
  const bodyValue = hasBody ? String(body) : null;
  // 雜湊一律由 server 計算；呼叫端提供的任何 hash 欄位都被忽略。
  const hash = hasBody ? computeContentHash(bodyValue) : null;

  try {
    const { rows } = await db.query(
      `INSERT INTO legal_documents(
         document_type, version, body, content_hash, effective_date, publication_status, created_by,
         requires_reconsent
       ) VALUES($1, $2, $3, $4, $5, 'draft', $6, $7)
       RETURNING *`,
      [documentType, normalizedVersion, bodyValue, hash, effectiveDate, actorId, reconsent.value]
    );
    return { ok: true, document: rows[0] };
  } catch (err) {
    if (err && err.code === "23505") {
      return fail("version_already_exists", `${documentType} version '${normalizedVersion}' already exists`);
    }
    throw err;
  }
}

/**
 * 更新草稿內容。**只有 `draft` 可以改** —— approved 之後就是待發布的定稿，
 * published 之後由 DB trigger 擋死。
 */
async function updateDraft({ id, body, effectiveDate, requiresReconsent } = {}) {
  if (!id) return fail("id_required", "id is required");

  const found = await db.query(`SELECT publication_status FROM legal_documents WHERE id = $1`, [String(id)]);
  if (found.rows.length === 0) return fail("not_found", "legal document not found");
  if (found.rows[0].publication_status !== "draft") {
    return fail("not_draft", "only draft documents can be edited; publish a new version instead");
  }

  const hasBody = body !== undefined;
  const bodyValue = hasBody ? (body === null ? null : String(body)) : undefined;
  const hash = hasBody ? (bodyValue === null ? null : computeContentHash(bodyValue)) : undefined;

  /*
   * `requiresReconsent` 為**選填**：未提供就完全不動（草稿的暫定值保留）。
   * 但一旦提供，就必須是真正的 boolean —— 這裡不接受 `"true"` 之類的寬鬆值，
   * 與 `createDraft` / `publish` 同一套嚴格判準。
   *
   * 注意：**這裡改的仍然只是暫定值**。決定性的那一次在 `publish()`。
   */
  let reconsentValue;
  if (requiresReconsent !== undefined) {
    const reconsent = validateRequiresReconsent(requiresReconsent);
    if (!reconsent.ok) return reconsent;
    reconsentValue = reconsent.value;
  }

  const { rows } = await db.query(
    `UPDATE legal_documents
        SET body = COALESCE($2, body),
            content_hash = COALESCE($3, content_hash),
            effective_date = COALESCE($4, effective_date),
            requires_reconsent = COALESCE($5, requires_reconsent)
      WHERE id = $1
      RETURNING *`,
    [
      String(id),
      bodyValue,
      hash,
      effectiveDate === undefined ? null : effectiveDate,
      reconsentValue === undefined ? null : reconsentValue,
    ]
  );
  return { ok: true, document: rows[0] };
}

/** `draft → approved`。核可不等於發布 —— approved 仍然不對外。 */
async function approve({ id, actorId = null } = {}) {
  if (!id) return fail("id_required", "id is required");

  const found = await db.query(`SELECT publication_status FROM legal_documents WHERE id = $1`, [String(id)]);
  if (found.rows.length === 0) return fail("not_found", "legal document not found");

  const from = found.rows[0].publication_status;
  if (!TRANSITIONS[from].includes("approved")) {
    return fail("invalid_transition", `cannot approve a document in status '${from}'`);
  }

  const { rows } = await db.query(
    `UPDATE legal_documents
        SET publication_status = 'approved', approved_at = NOW(), approved_by = $2
      WHERE id = $1 AND publication_status = 'draft'
      RETURNING *`,
    [String(id), actorId]
  );
  if (rows.length === 0) return fail("invalid_transition", "document is no longer a draft");
  return { ok: true, document: rows[0] };
}

/**
 * `approved → published`，並在**同一個 transaction** 內把同類型的舊 published
 * 轉為 superseded。
 *
 * 為什麼必須原子：中間任何一個瞬間出現「兩份 published」或「零份 published」
 * 都是錯的 —— 前者讓「現行條款」有歧義，後者讓法律頁面短暫 404。
 * DB 的 partial UNIQUE index 是最後一道防線：即使這裡寫錯，
 * 第二筆 published 也會被拒絕而整個 transaction 回滾。
 *
 * ## `requiresReconsent` 是發布時的**必要顯式決定**（`SCHEMA-03` / `DEC-LEGAL-06`）
 *
 * **即使草稿已經有值，這裡仍然必須再提供一次。** 沿用草稿值會讓
 * 「這一版是否要求既有使用者重新同意」變成某個人在草擬階段順手填的東西，
 * 而發布才是那個決定真正生效的時點。缺少或非 boolean 一律 validation failure ——
 * 這一層沒有 fallback，DB 端也沒有 DEFAULT。
 *
 * 發布時提供的值**覆寫**草稿的暫定值，並自該刻起由 immutability trigger 鎖死。
 *
 * 再次強調：這是 production enforcement metadata，**不是**法律上「重大變更」
 * 之認定（`DEC-LEGAL-01` 律師側仍未決）。本函式不判斷、也不推導法律重大性，
 * 更不從 `version` 推導任何東西。
 *
 * ## 發布理由亦為必要（`OPS-03` / `DEC-LEGAL-11`）
 *
 * 除了 `requiresReconsent`，發布時**必須**再提供一個標準化的**營運理由**
 * （`reasonCode` ＋ 選填 `note`，見 `utils/legalDocumentPublishPolicy.js`）。
 * 稽核因此答得出「依據什麼」，而不只是「設成什麼」。
 *
 * **兩者是彼此獨立的顯式選擇。** 本函式**不會**從 `reasonCode` 推導
 * `requiresReconsent`，也不會反過來 —— 兩個值各自驗證、各自寫入。
 * 理由屬於**營運紀錄**，不是法律分類。
 */
async function publish({ id, actorId = null, requiresReconsent, reasonCode, note } = {}) {
  if (!id) return fail("id_required", "id is required");

  /*
   * 兩個驗證刻意分開呼叫、互不傳參 ——
   * 讓「理由自動決定布林值」在結構上就不可能發生。
   */
  const reconsent = validateRequiresReconsent(requiresReconsent);
  if (!reconsent.ok) return reconsent;

  const justification = validatePublishJustification({ reasonCode, note });
  if (!justification.valid) return fail(justification.code, justification.message);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query(
      `SELECT id, document_type, publication_status, body, effective_date
         FROM legal_documents WHERE id = $1 FOR UPDATE`,
      [String(id)]
    );
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("not_found", "legal document not found");
    }

    const doc = found.rows[0];
    if (!TRANSITIONS[doc.publication_status].includes("published")) {
      await client.query("ROLLBACK");
      return fail("invalid_transition", `cannot publish a document in status '${doc.publication_status}'`);
    }
    // 這兩條 DB CHECK 也擋得住，但在這裡先擋可以回一個有意義的錯誤碼。
    if (doc.body === null || String(doc.body).trim() === "") {
      await client.query("ROLLBACK");
      return fail("body_required", "cannot publish a document with no body");
    }
    if (doc.effective_date === null) {
      await client.query("ROLLBACK");
      return fail("effective_date_required", "cannot publish a document with no effective_date");
    }

    /*
     * **順序很重要：先讓舊版退位，再發布新版。**
     *
     * `legal_documents_one_published_per_type` 是 partial UNIQUE index，
     * 而 UNIQUE 是在**每一句 UPDATE 結束時**檢查，不是在 COMMIT 時。
     * 若先 publish 新版，那一句結束的瞬間同型別就有兩筆 published，
     * 索引立刻拒絕。因此必須先 supersede。
     *
     * 這個順序在 transaction 中間會短暫出現「零筆 published」，
     * 但那對外不可見：整個流程在同一個 transaction 內，
     * 未 COMMIT 前 public 讀到的仍是舊版。
     */
    const superseded = await client.query(
      `UPDATE legal_documents
          SET publication_status = 'superseded', superseded_at = NOW(), superseded_by_id = $2
        WHERE document_type = $1 AND publication_status = 'published'
        RETURNING id, version`,
      [doc.document_type, doc.id]
    );

    const published = await client.query(
      `UPDATE legal_documents
          SET publication_status = 'published',
              published_at = NOW(),
              published_by = $2,
              requires_reconsent = $3
        WHERE id = $1 AND publication_status = 'approved'
        RETURNING *`,
      [String(id), actorId, reconsent.value]
    );
    if (published.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("invalid_transition", "document is no longer approved");
    }

    await client.query("COMMIT");
    return {
      ok: true,
      document: published.rows[0],
      supersededIds: superseded.rows.map((r) => r.id),
      /*
       * 回傳已驗證的理由供 route 寫入稽核。
       * **刻意不寫進 `legal_documents`** —— 沒有 schema churn，
       * 理由屬於「當下這次發布」的事件事實，歸 `activity_logs`。
       */
      justification: {
        reasonCode: justification.reasonCode,
        note: justification.note,
        reasonText: justification.reasonText,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * **Canonical current-version resolver。**
 *
 * 這是「平台目前對外生效的 <type> 是哪一份」的**唯一**答案來源。
 * 沒有 published 版本時回 `null` —— 呼叫端必須據此回 404，
 * **不得** fallback 到 draft / approved / 最新的 superseded。
 */
async function getCurrentPublished(documentType) {
  if (!isValidType(documentType)) return null;
  const { rows } = await db.query(
    `SELECT * FROM legal_documents
      WHERE document_type = $1 AND publication_status = 'published'
      LIMIT 1`,
    [documentType]
  );
  return rows[0] || null;
}

/** 哪些類型目前有 published 版本 —— Footer 依此決定要不要顯示連結（`DEC-LEGAL-04`）。 */
async function listPublishedTypes() {
  const { rows } = await db.query(
    `SELECT document_type, version, effective_date
       FROM legal_documents
      WHERE publication_status = 'published'
      ORDER BY document_type`
  );
  return rows;
}

/** Admin：單筆完整讀取（含 draft / approved / superseded）。 */
async function getById(id) {
  if (!id) return null;
  const { rows } = await db.query(`SELECT * FROM legal_documents WHERE id = $1`, [String(id)]);
  return rows[0] || null;
}

/**
 * Admin：某類型的完整版本歷史。
 *
 * `superseded` 一定要看得到 —— 歷史 consent 證據指向的就是它們，
 * 稽核時必須能取回「當時同意的實際文字」。
 */
async function listByType(documentType) {
  if (!isValidType(documentType)) return [];
  const { rows } = await db.query(
    `SELECT * FROM legal_documents
      WHERE document_type = $1
      ORDER BY created_at DESC, id DESC`,
    [documentType]
  );
  return rows;
}

module.exports = {
  DOCUMENT_TYPES,
  PUBLICATION_STATUSES,
  TRANSITIONS,
  PUBLIC_READABLE_STATUSES,
  computeContentHash,
  formatEffectiveDate,
  validateRequiresReconsent,
  toPublicView,
  toAdminView,
  createDraft,
  updateDraft,
  approve,
  publish,
  getCurrentPublished,
  listPublishedTypes,
  getById,
  listByType,
};
