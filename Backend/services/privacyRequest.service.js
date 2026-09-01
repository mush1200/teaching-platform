/**
 * 個資權利請求的 case management（`OPS-04` / `DEC-LEGAL-13`）。
 *
 * ## 與消費申訴的關係：同一種**模式**，不同的 **domain**
 *
 * 這一層刻意與 `services/consumerComplaint.service.js` 長得很像 ——
 * 案件 ＋ 事件流 ＋ 狀態機 ＋ 稽核，是那邊已經驗證過的作法。
 * 但兩者**不共用 table、不共用 route、不共用狀態值**：
 * 消費申訴受消保法 §43 拘束，個資請求受個人資料保護法拘束，
 * 混在一起會讓「這件事受哪一套規則管」永久消失。
 *
 * ## 這裡**沒有** SLA
 *
 * 申訴那邊有 `statutory_due_at` / `OVERDUE_SQL` / `countOverdue()`，
 * 因為消保法 §43 II 給了十五日這個**有法源的數字**。
 * 個資請求的法定回覆期限**尚未取得律師結論**，
 * 因此本檔**完全不引用 `utils/complaintSla.js`**，也不衍生任何 overdue 欄位。
 * 排序改用 `received_at`，那只是「先收到的先看」，不是期限。
 *
 * ## `completed` ≠ 資料已刪除
 *
 * 即使 `request_type = 'deletion'`，本服務也**只記錄請求與處理歷程**，
 * 不執行任何刪除、匿名化或帳號關閉（`SCHEMA-02` / `O-22` 仍 blocked）。
 */

const db = require("../config/db");
const policy = require("../utils/privacyRequestPolicy");

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

/** API 邊界投影。欄位刻意只有這些 —— 資料最小化。 */
function toAdminView(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestType: row.request_type,
    requestTypeLabel: policy.PRIVACY_REQUEST_TYPE_LABEL[row.request_type] ?? row.request_type,
    status: row.status,
    statusLabel: policy.PRIVACY_REQUEST_STATUS_LABEL[row.status] ?? row.status,
    requesterReference: row.requester_reference,
    summary: row.summary,
    receivedAt: row.received_at,
    completedAt: row.completed_at,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    // 前端據此決定顯示哪些按鈕；**backend 仍會各自再擋一次**。
    allowedTransitions: policy.PRIVACY_REQUEST_TRANSITIONS[row.status] ?? [],
  };
}

function toEventView(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    message: row.message,
    meta: row.meta,
    createdAt: row.created_at,
  };
}

/**
 * Admin 依收到的 Privacy Email 建立案件。
 *
 * 對外入口是 Email（`DEC-LEGAL-07`）—— 本輪**未新增**任何站內或匿名提交端點，
 * 因此建案一律由 Admin 執行，`source` 固定為 `privacy_email`。
 */
async function createRequest({ requestType, requesterReference, summary, receivedAt, source, actorId = null, actorRole = null } = {}) {
  const input = policy.validateCreate({ requestType, requesterReference, summary, receivedAt, source });
  if (!input.valid) return fail(input.code, input.message);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO privacy_requests(
         request_type, requester_reference, summary, received_at, source, created_by
       ) VALUES($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.requestType, input.requesterReference, input.summary, input.receivedAt, input.source, actorId]
    );
    const request = inserted.rows[0];

    await client.query(
      `INSERT INTO privacy_request_events(request_id, actor_id, actor_role, event_type, message, meta)
       VALUES($1, $2, $3, 'created', $4, $5)`,
      [
        request.id,
        actorId,
        actorRole,
        "由 Privacy Email 受理並建立案件",
        JSON.stringify({ requestType: input.requestType, source: input.source }),
      ]
    );

    await client.query("COMMIT");
    return { ok: true, request };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 狀態流轉。
 *
 * `completed` 會寫入 `completed_at` —— 那是「平台處理完畢」的時間，
 * **不是**「資料已刪除」的證明。
 */
async function transition({ requestId, toStatus, note, actorId = null, actorRole = null } = {}) {
  if (!requestId) return fail("request_id_required", "requestId is required");
  const input = policy.validateTransitionInput({ toStatus, note });
  if (!input.valid) return fail(input.code, input.message);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT * FROM privacy_requests WHERE id = $1 FOR UPDATE`, [
      String(requestId),
    ]);
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("request_not_found", "privacy request not found");
    }

    const from = found.rows[0].status;
    if (from === input.toStatus) {
      await client.query("ROLLBACK");
      return fail("already_in_state", `request is already ${from}`, { from });
    }
    if (!policy.canTransition(from, input.toStatus)) {
      await client.query("ROLLBACK");
      return fail("invalid_transition", `cannot move privacy request from ${from} to ${input.toStatus}`, {
        from,
        allowed: policy.PRIVACY_REQUEST_TRANSITIONS[from] ?? [],
      });
    }

    const updated = await client.query(
      `UPDATE privacy_requests
          SET status = $2,
              completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $1
        RETURNING *`,
      [String(requestId), input.toStatus]
    );

    await client.query(
      `INSERT INTO privacy_request_events(request_id, actor_id, actor_role, event_type, message, meta)
       VALUES($1, $2, $3, 'status_changed', $4, $5)`,
      [String(requestId), actorId, actorRole, input.note, JSON.stringify({ from, to: input.toStatus })]
    );

    await client.query("COMMIT");
    return { ok: true, request: updated.rows[0], from, to: input.toStatus };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** 內部註記。用於「需要向請求者確認資訊」這類中性紀錄。 */
async function addNote({ requestId, note, actorId = null, actorRole = null } = {}) {
  if (!requestId) return fail("request_id_required", "requestId is required");
  const text = String(note ?? "").trim();
  if (!text) return fail("note_required", "note is required");
  if ([...text].length > policy.MAX_NOTE_LENGTH) {
    return fail("note_too_long", `note must be at most ${policy.MAX_NOTE_LENGTH} characters`);
  }

  const found = await db.query(`SELECT id FROM privacy_requests WHERE id = $1`, [String(requestId)]);
  if (found.rows.length === 0) return fail("request_not_found", "privacy request not found");

  await db.query(
    `INSERT INTO privacy_request_events(request_id, actor_id, actor_role, event_type, message)
     VALUES($1, $2, $3, 'internal_note', $4)`,
    [String(requestId), actorId, actorRole, text]
  );
  return { ok: true };
}

/**
 * 清單。**排序是 `received_at`，不是期限** —— 本 domain 沒有期限。
 */
async function listRequests({ status = null, limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = "";
  if (status) {
    if (!policy.isStatus(status)) return { ok: false, code: "invalid_status", message: "unknown status" };
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  params.push(Math.max(Number(offset) || 0, 0));

  const { rows } = await db.query(
    `SELECT * FROM privacy_requests ${where}
      ORDER BY received_at DESC, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = await db.query(
    `SELECT COUNT(*)::int n FROM privacy_requests ${where}`,
    status ? [status] : []
  );
  return { ok: true, items: rows, total: total.rows[0].n };
}

async function getRequest(requestId) {
  if (!requestId) return null;
  const { rows } = await db.query(`SELECT * FROM privacy_requests WHERE id = $1`, [String(requestId)]);
  return rows[0] || null;
}

async function listEvents(requestId) {
  const { rows } = await db.query(
    `SELECT * FROM privacy_request_events
      WHERE request_id = $1
      ORDER BY created_at DESC, id DESC`,
    [String(requestId)]
  );
  return rows;
}

module.exports = {
  toAdminView,
  toEventView,
  createRequest,
  transition,
  addNote,
  listRequests,
  getRequest,
  listEvents,
};
