/**
 * 消費申訴（P1-09 Gate 3）。
 *
 * 消保法 §43 II：企業經營者對於消費者之申訴，應於申訴之日起**十五日內妥適處理之**。
 *
 * ## 這裡沒有法律判斷
 *
 * 本模組**不決定**法定解除是否成立、是否應退款、金額多少。
 * 它提供的是：**一個可稽核、有法定期限、與訂單狀態機分離的申訴容器**。
 *
 * ## 三種 case 不得互相取代
 *
 *   * `reports` —— 針對**教材內容**的檢舉（提出者可能不是買家，結論是 moderation）
 *   * `consumer_complaints`（本模組）—— 買家對**自己的交易**提出的申訴
 *   * `refund_remedy_cases` —— 平台對某筆交易建立的**補救／退款處理**
 *
 * ## Complaint 是上游，Remedy 是下游
 *
 *   Buyer 申訴 → Admin 受理與回覆 → **若**需要退款 → 由人另建 `refund_remedy_case`
 *
 * **本模組不自動建立 remedy case。** 是否應退款是個案判斷；
 * 自動建立等於讓系統替尚未做出的決定先行處分。
 * `related_remedy_case_id` 由 `linkRemedyCase()` 在人做出判斷後才寫入。
 *
 * **`resolved` ≠ 已退款。** 錢是否退回的唯一來源是
 * `refund_remedy_cases.refund_paid_at`（見 `mvp_rules.md` §12.8.6）。
 *
 * ## 不動任何交易狀態
 *
 * 建立或處理申訴**不改** `orders.status`、`paid_at`、`payment_received_at`、
 * `entitlement_status`，也不觸發退款或稅務沖銷。申訴本身是爭議紀錄。
 */

const db = require("../config/db");
const { writeActivityLog } = require("../utils/activityLog");
const sla = require("../utils/complaintSla");
const { getPrivateFileStorage } = require("../config/privateFileStorage");

const COMPLAINT_TYPES = Object.freeze([
  "payment",
  "delivery",
  "download",
  "material_mismatch",
  "duplicate_payment",
  "refund_request",
  "account_security",
  "other",
]);

const STATUSES = Object.freeze(["submitted", "under_review", "responded", "resolved", "closed"]);

/**
 * 合法轉移。刻意保持最小 —— 客服狀態多一個就多一個沒人維護的分支。
 *
 * `responded` 可以回到 `under_review`：買家對回覆不滿意而繼續爭議是常態，
 * 沒有這條路只會逼出「開第二張申訴」。
 */
const TRANSITIONS = Object.freeze({
  submitted: ["under_review", "closed"],
  under_review: ["responded", "resolved", "closed"],
  responded: ["under_review", "resolved", "closed"],
  resolved: ["closed"],
  closed: [],
});

const MAX_TEXT = 5000;

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

function cleanText(value, { max = MAX_TEXT } = {}) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

/**
 * 建立申訴。
 *
 * `buyer_id` **永遠是提出者本人**（不信任呼叫端傳入的值）。
 * 指定 `orderId` 時驗證那是本人的訂單 —— 這是 ownership 的實際強制點。
 * Admin 代為建立時 `onBehalfOfBuyerId` 才有意義，且仍會驗證訂單歸屬。
 */
async function createComplaint({
  buyerId,
  orderId = null,
  orderItemId = null,
  complaintType,
  subject,
  statement,
  actorId,
  actorRole = null,
} = {}) {
  if (!buyerId) return fail("buyer_required", "buyerId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  if (!COMPLAINT_TYPES.includes(complaintType)) {
    return fail("invalid_complaint_type", `complaintType must be one of: ${COMPLAINT_TYPES.join(", ")}`);
  }
  const cleanSubject = cleanText(subject, { max: 200 });
  if (!cleanSubject) return fail("subject_required", "subject is required");
  const cleanStatement = cleanText(statement);
  if (!cleanStatement) return fail("statement_required", "statement is required");

  if (orderId) {
    const order = await db.query(`SELECT id, user_id FROM orders WHERE id = $1`, [String(orderId)]);
    if (order.rows.length === 0) return fail("order_not_found", "order not found");
    // **不得對他人的訂單申訴。**
    if (order.rows[0].user_id !== String(buyerId)) {
      return fail("order_not_owned", "this order does not belong to the complainant");
    }
    if (orderItemId) {
      const item = await db.query(`SELECT id FROM order_items WHERE id = $1 AND order_id = $2`, [
        String(orderItemId),
        String(orderId),
      ]);
      if (item.rows.length === 0) {
        return fail("order_item_mismatch", "orderItemId does not belong to this order");
      }
    }
  } else if (orderItemId) {
    return fail("order_required_for_item", "orderItemId requires orderId");
  }

  const submittedAt = new Date();
  const dueAt = sla.statutoryDueAt(submittedAt);

  const { rows } = await db.query(
    `INSERT INTO consumer_complaints(
       buyer_id, order_id, order_item_id, complaint_type, subject, statement,
       status, submitted_at, statutory_due_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7, $8)
     RETURNING *`,
    [
      String(buyerId),
      orderId ? String(orderId) : null,
      orderItemId ? String(orderItemId) : null,
      complaintType,
      cleanSubject,
      cleanStatement,
      submittedAt,
      dueAt,
    ]
  );
  const complaint = rows[0];

  await db.query(
    `INSERT INTO consumer_complaint_events(complaint_id, actor_id, actor_role, event_type, message, meta)
     VALUES ($1, $2, $3, 'submitted', $4, $5::jsonb)`,
    [
      complaint.id,
      String(actorId),
      actorRole,
      cleanStatement,
      JSON.stringify({ complaintType, orderId: orderId ? String(orderId) : null }),
    ]
  );

  await writeActivityLog({
    actorId,
    actorRole,
    targetType: "consumer_complaint",
    targetId: complaint.id,
    action: "complaint.submitted",
    meta: {
      complaintType,
      orderId: orderId ? String(orderId) : null,
      buyerId: String(buyerId),
      statutoryDueAt: dueAt.toISOString(),
    },
  });

  return { ok: true, complaint: withSla(complaint) };
}

/**
 * 變更申訴狀態。
 *
 * `message` 必填 —— 每一次對申訴人的處理都必須留下內容，
 * 否則「妥適處理」無從證明。
 *
 * `visibleToBuyer` 決定歷程寫成 `response_to_buyer`（申訴人看得到）
 * 還是 `internal_note`（Admin 內部）。
 */
async function transition({
  complaintId,
  toStatus,
  message,
  resolutionSummary = null,
  visibleToBuyer = true,
  actorId,
  actorRole = null,
} = {}) {
  if (!complaintId) return fail("complaint_required", "complaintId is required");
  if (!actorId) return fail("actor_required", "actorId is required");
  if (!STATUSES.includes(toStatus)) {
    return fail("invalid_status", `toStatus must be one of: ${STATUSES.join(", ")}`);
  }
  const cleanMessage = cleanText(message);
  if (!cleanMessage) {
    return fail("message_required", "message is required — a complaint decision must be explainable");
  }
  const cleanSummary = cleanText(resolutionSummary);
  if (["resolved", "closed"].includes(toStatus) && !cleanSummary) {
    // 一個沒有結論的「已處理」無法證明「妥適處理之」。
    return fail("resolution_summary_required", "resolutionSummary is required when resolving or closing");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT * FROM consumer_complaints WHERE id = $1 FOR UPDATE`, [
      String(complaintId),
    ]);
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("complaint_not_found", "complaint not found");
    }
    const from = found.rows[0].status;
    if (from === toStatus) {
      await client.query("ROLLBACK");
      return fail("already_in_state", `complaint is already ${toStatus}`, { from });
    }
    if (!TRANSITIONS[from].includes(toStatus)) {
      await client.query("ROLLBACK");
      return fail("invalid_transition", `cannot move complaint from ${from} to ${toStatus}`, {
        from,
        allowed: TRANSITIONS[from],
      });
    }

    const updated = await client.query(
      `UPDATE consumer_complaints
          SET status = $2,
              resolution_summary = COALESCE($3, resolution_summary),
              review_started_at = CASE WHEN $2 = 'under_review' AND review_started_at IS NULL
                                       THEN NOW() ELSE review_started_at END,
              responded_at      = CASE WHEN $2 = 'responded' THEN NOW() ELSE responded_at END,
              resolved_at       = CASE WHEN $2 = 'resolved' THEN NOW() ELSE resolved_at END,
              closed_at         = CASE WHEN $2 = 'closed' THEN NOW() ELSE closed_at END,
              reviewed_by       = $4
        WHERE id = $1
        RETURNING *`,
      [String(complaintId), toStatus, cleanSummary, String(actorId)]
    );

    await client.query(
      `INSERT INTO consumer_complaint_events(complaint_id, actor_id, actor_role, event_type, message, meta)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        String(complaintId),
        String(actorId),
        actorRole,
        visibleToBuyer ? "response_to_buyer" : "internal_note",
        cleanMessage,
        JSON.stringify({ from, to: toStatus }),
      ]
    );
    await client.query("COMMIT");

    await writeActivityLog({
      actorId,
      actorRole,
      targetType: "consumer_complaint",
      targetId: String(complaintId),
      action: "complaint.status_changed",
      meta: { from, to: toStatus, visibleToBuyer, hasResolution: Boolean(cleanSummary) },
    });

    return { ok: true, from, to: toStatus, complaint: withSla(updated.rows[0]) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 新增買家提供的外部證據。
 *
 * 付款爭議**不得**只以平台自己的紀錄為唯一認定依據
 * （`N3` / `R7` / 網路交易定型化契約不得記載事項第七點）。
 *
 * 兩種形式：實際附件（`file`，位元組已由呼叫端寫入私有儲存）
 * 或純文字外部參照（`externalReference`，例如「已向 XX 市消費者服務中心申訴，案號 …」）。
 *
 * **`storage_key` / `checksum_sha256` 永遠不出現在回傳值** —— 與教材檔案、
 * 付款憑證同規則。
 */
async function addEvidence({
  complaintId,
  uploadedBy,
  file = null,
  externalReference = null,
  note = null,
  actorRole = null,
} = {}) {
  if (!complaintId) return fail("complaint_required", "complaintId is required");
  if (!uploadedBy) return fail("actor_required", "uploadedBy is required");
  const cleanRef = cleanText(externalReference, { max: 1000 });
  if (!file && !cleanRef) {
    return fail("evidence_required", "either a file or an externalReference is required");
  }

  const found = await db.query(`SELECT id, status FROM consumer_complaints WHERE id = $1`, [
    String(complaintId),
  ]);
  if (found.rows.length === 0) return fail("complaint_not_found", "complaint not found");
  if (found.rows[0].status === "closed") {
    return fail("complaint_closed", "cannot add evidence to a closed complaint");
  }

  const { rows } = await db.query(
    `INSERT INTO consumer_complaint_evidence(
       complaint_id, uploaded_by, storage_key, original_filename, mime_type,
       size_bytes, checksum_sha256, external_reference, note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, complaint_id, uploaded_by, original_filename, mime_type,
               size_bytes, external_reference, note, created_at`,
    [
      String(complaintId),
      String(uploadedBy),
      file?.storageKey ?? null,
      file?.originalFilename ?? null,
      file?.mimeType ?? null,
      file?.sizeBytes ?? null,
      file?.checksumSha256 ?? null,
      cleanRef,
      cleanText(note, { max: 1000 }),
    ]
  );

  await db.query(
    `INSERT INTO consumer_complaint_events(complaint_id, actor_id, actor_role, event_type, message, meta)
     VALUES ($1, $2, $3, 'evidence_added', $4, $5::jsonb)`,
    [
      String(complaintId),
      String(uploadedBy),
      actorRole,
      cleanRef,
      JSON.stringify({ hasFile: Boolean(file), evidenceId: rows[0].id }),
    ]
  );

  await writeActivityLog({
    actorId: uploadedBy,
    actorRole,
    targetType: "consumer_complaint",
    targetId: String(complaintId),
    action: "complaint.evidence_added",
    // storage_key 與 checksum **不得**進 log。
    meta: { evidenceId: rows[0].id, hasFile: Boolean(file), hasExternalReference: Boolean(cleanRef) },
  });

  return { ok: true, evidence: rows[0] };
}

/**
 * 把申訴關聯到下游的補救案件。
 *
 * **不自動建立** —— 呼叫端必須先由人建立 `refund_remedy_case` 並提供 id。
 * 這一步只寫 linkage，不改任何金額、不執行退款。
 */
async function linkRemedyCase({ complaintId, remedyCaseId, actorId, actorRole = null } = {}) {
  if (!complaintId || !remedyCaseId) return fail("link_required", "complaintId and remedyCaseId are required");
  if (!actorId) return fail("actor_required", "actorId is required");

  const rc = await db.query(`SELECT id, order_id FROM refund_remedy_cases WHERE id = $1`, [
    String(remedyCaseId),
  ]);
  if (rc.rows.length === 0) return fail("remedy_case_not_found", "remedy case not found");

  const cc = await db.query(`SELECT id, order_id FROM consumer_complaints WHERE id = $1`, [
    String(complaintId),
  ]);
  if (cc.rows.length === 0) return fail("complaint_not_found", "complaint not found");
  // 兩者都綁訂單時必須是同一張 —— 否則 linkage 會把兩筆不相干的爭議接在一起。
  if (cc.rows[0].order_id && rc.rows[0].order_id !== cc.rows[0].order_id) {
    return fail("order_mismatch", "remedy case belongs to a different order");
  }

  const { rows } = await db.query(
    `UPDATE consumer_complaints SET related_remedy_case_id = $2 WHERE id = $1 RETURNING *`,
    [String(complaintId), String(remedyCaseId)]
  );

  await writeActivityLog({
    actorId,
    actorRole,
    targetType: "consumer_complaint",
    targetId: String(complaintId),
    action: "complaint.remedy_case_linked",
    meta: { remedyCaseId: String(remedyCaseId) },
  });

  return { ok: true, complaint: withSla(rows[0]) };
}

/** 附上 SLA 衍生欄位（不存 DB —— 它們是 `statutory_due_at` 與現在時間的函數）。 */
function withSla(row) {
  if (!row) return row;
  return {
    ...row,
    overdue: sla.isOverdue(row),
    daysUntilDue: sla.daysUntilDue(row),
  };
}

async function getComplaint(complaintId) {
  const { rows } = await db.query(`SELECT * FROM consumer_complaints WHERE id = $1`, [
    String(complaintId),
  ]);
  return rows[0] ? withSla(rows[0]) : null;
}

/**
 * **逾期申訴的唯一 SQL 判準。**
 *
 * 兩個 consumer 共用它：`listComplaints({ overdueOnly })`（`?overdue=1`）與
 * `countOverdue()`（Admin dashboard 的告警數字）。
 *
 * 各寫一份的下場是：dashboard 說「3 件逾期」而佇列點進去只有 2 件 ——
 * 那會讓告警本身失去可信度。因此**任何新的 overdue consumer 都必須用這個常數**，
 * 不得自行拼條件。
 *
 * 語意與 `utils/complaintSla.js` 的 `isOverdue()` **必須一致**：
 *   * 期限已過（`statutory_due_at < NOW()`）
 *   * 且**仍需處理** —— `resolved` / `closed` 一律排除。
 *     已處理完的案件不是待辦告警；對它示警只會讓真正的逾期被淹沒。
 *
 * 兩者的一致性由 `tests/complaintOverdueAlert.db.test.js` 逐案斷言。
 */
const OVERDUE_SQL = `statutory_due_at < NOW() AND status IN ('submitted', 'under_review', 'responded')`;

/**
 * 目前**需要處理**的逾期申訴數。
 *
 * 給 Admin dashboard 的 attention surface 用。回傳的是 backend canonical truth，
 * 前端**不得**自行用日期重算（那會產生第二套 SLA）。
 *
 * 使用 `idx_cc_open_due` partial index —— 資料量成長後仍是單一索引掃描。
 */
async function countOverdue() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM consumer_complaints WHERE ${OVERDUE_SQL}`
  );
  return rows[0].n;
}

/**
 * 列出申訴。
 *
 * `overdueOnly` 直接用 DB 條件（不是把全表撈出來再過濾）——
 * 逾期偵測必須在資料量成長後仍然可用。
 *
 * **排序刻意是 `statutory_due_at ASC`**：期限最近的排最前面，
 * 因此逾期案件天然浮在最上方，不會被普通 pending 案件淹沒。
 */
async function listComplaints({
  buyerId = null,
  status = null,
  overdueOnly = false,
  limit = 50,
} = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (buyerId) add("buyer_id = ?", String(buyerId));
  if (status) add("status = ?", String(status));
  // **與 `countOverdue()` 共用同一個判準** —— 見 `OVERDUE_SQL` 的說明。
  if (overdueOnly) where.push(OVERDUE_SQL);
  params.push(Math.min(Number(limit) || 50, 200));

  const { rows } = await db.query(
    `SELECT * FROM consumer_complaints
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY statutory_due_at ASC, submitted_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows.map(withSla);
}

/**
 * 案件歷程。
 *
 * `forBuyer` 會濾掉 `internal_note` —— 與 `report_events` 的分工一致：
 * Admin 的內部討論不是要給申訴人看的。
 */
async function listEvents(complaintId, { forBuyer = false } = {}) {
  const { rows } = await db.query(
    `SELECT id, actor_id, actor_role, event_type, message, meta, created_at
       FROM consumer_complaint_events
      WHERE complaint_id = $1
        ${forBuyer ? "AND event_type <> 'internal_note'" : ""}
      ORDER BY created_at ASC, id ASC`,
    [String(complaintId)]
  );
  return rows;
}

/** 證據清單。**永遠不回傳 `storage_key` 與 `checksum_sha256`。** */
async function listEvidence(complaintId) {
  const { rows } = await db.query(
    `SELECT id, complaint_id, uploaded_by, original_filename, mime_type, size_bytes,
            external_reference, note, created_at,
            (storage_key IS NOT NULL) AS has_file
       FROM consumer_complaint_evidence
      WHERE complaint_id = $1
      ORDER BY created_at ASC`,
    [String(complaintId)]
  );
  return rows;
}

/*
 * ---------------------------------------------------------------------------
 * 證據檔案的交付（P1-09 Gate 4 / `N3`，Wave 2 #13）
 * ---------------------------------------------------------------------------
 *
 * 在此之前證據是 **write-only**：買家傳得上去、`listEvidence()` 列得出檔名，
 * 但沒有任何路徑能把位元組取回來。對付款爭議而言那等於沒有證據 ——
 * Admin 裁決時只剩平台自己的紀錄可看，恰好是 `R7` 要禁止的狀態。
 *
 * 這一段刻意**照抄 `services/paymentProof.service.js` 的三段式**
 * （resolve → authorize → open），不另建第二套 file-delivery framework。
 * 唯一真正不同的是 **ownership 的來源**：
 *
 *   付款憑證 → `orders.user_id`
 *   申訴證據 → `consumer_complaints.buyer_id`
 *
 * **不得**改用訂單擁有者：申訴可以完全沒有 `order_id`（例如帳號遭冒用），
 * 那種案件的證據仍然必須讀得到。
 */

/**
 * 證據交付的錯誤碼 → HTTP status。
 *
 *   404 申訴或證據不存在
 *   403 不是你的申訴
 *   409 證據存在但**本來就沒有檔案**（純文字 `external_reference`）—— 使用者重試也沒用
 *   503 有 `storage_key` 但實體不見了 —— 資料是對的、儲存後端壞了
 */
const EVIDENCE_ERROR_STATUS = Object.freeze({
  complaint_not_found: 404,
  evidence_not_found: 404,
  forbidden: 403,
  evidence_file_unavailable: 409,
  evidence_object_missing: 503,
});

function statusForEvidenceCode(code) {
  return EVIDENCE_ERROR_STATUS[code] ?? 500;
}

/**
 * 申訴層級的讀取授權。
 *
 * 順序與 `routes/complaints.js` 既有的上傳路徑一致（先 404 再 403），
 * 本輪**不改變**該 convention —— 那是整個 complaint domain 的既有行為，
 * 在這裡自創一套只會讓兩條路徑對同一個輸入給出不同答案。
 */
async function authorizeComplaintAccess({ complaintId, user } = {}) {
  const { rows } = await db.query(
    `SELECT id, buyer_id FROM consumer_complaints WHERE id = $1 LIMIT 1`,
    [String(complaintId)]
  );
  if (rows.length === 0) return fail("complaint_not_found", "complaint not found");

  const isAdmin = user?.role === "admin";
  const isOwner = String(rows[0].buyer_id) === String(user?.userId ?? "");
  if (!isAdmin && !isOwner) return fail("forbidden", "forbidden");

  return { ok: true, complaint: rows[0], isAdmin, isOwner };
}

/**
 * 解析一份可交付的證據（含 `storage_key`，**僅供內部串流用，絕不回給 client**）。
 *
 * 查詢同時綁 `id` 與 `complaint_id`。少了後半段就是一個 IDOR：
 * 攻擊者拿自己的申訴 id 通過授權，再帶別人的 evidence id 取檔。
 */
async function resolveEvidenceForAccess({ complaintId, evidenceId, user } = {}) {
  const access = await authorizeComplaintAccess({ complaintId, user });
  if (!access.ok) return access;

  const { rows } = await db.query(
    `SELECT id, complaint_id, storage_key, original_filename, mime_type, size_bytes,
            external_reference, created_at
       FROM consumer_complaint_evidence
      WHERE id = $1 AND complaint_id = $2
      LIMIT 1`,
    [String(evidenceId), String(complaintId)]
  );
  if (rows.length === 0) return fail("evidence_not_found", "evidence not found");

  const evidence = rows[0];
  if (!evidence.storage_key) {
    // 純文字外部參照（`cce_evidence_has_content` 允許的另一半）。這不是錯誤資料，
    // 只是沒有位元組可交付。**不回退到任何公開路徑。**
    return fail(
      "evidence_file_unavailable",
      "這筆證據沒有附件檔（只有文字說明的外部參照）。"
    );
  }

  return { ok: true, evidence, isAdmin: access.isAdmin, isOwner: access.isOwner };
}

/**
 * 準備串流一份證據。
 *
 * 列存在但實體不見了 = 儲存後端出問題 → **503 而不是 404**（與付款憑證同一判斷）。
 * `storage.stat()` 內部會把「key 形狀不合法」的例外吞成 `{exists:false}`，
 * 因此畸形 key 走的也是這條確定性路徑，不會 crash、不會洩漏檔案系統路徑。
 */
async function openEvidenceForDelivery(evidenceRow) {
  const storage = getPrivateFileStorage();
  const stat = await storage.stat(evidenceRow.storage_key);
  if (!stat.exists) {
    return fail("evidence_object_missing", "證據檔案暫時無法取得，請稍後再試或聯絡平台客服。");
  }
  return {
    ok: true,
    stream: storage.openReadStream(evidenceRow.storage_key),
    sizeBytes: stat.sizeBytes,
  };
}

module.exports = {
  COMPLAINT_TYPES,
  STATUSES,
  TRANSITIONS,
  OVERDUE_SQL,
  countOverdue,
  createComplaint,
  transition,
  addEvidence,
  linkRemedyCase,
  getComplaint,
  listComplaints,
  listEvents,
  listEvidence,
  EVIDENCE_ERROR_STATUS,
  statusForEvidenceCode,
  authorizeComplaintAccess,
  resolveEvidenceForAccess,
  openEvidenceForDelivery,
};
