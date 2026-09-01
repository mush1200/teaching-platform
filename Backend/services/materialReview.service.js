const db = require("../config/db");
const workflow = require("../utils/materialWorkflow");
const { writeActivityLog } = require("../utils/activityLog");
const materialFileService = require("./materialFile.service");
const { sendMaterialPublishedEmail, sendMaterialChangesRequestedEmail } = require("./emailService");
const { dispatchBestEffort } = require("../utils/bestEffortDispatch");

/**
 * 教材上架審核的服務層（Material Review MVP Phase 1）。
 *
 * ## 為什麼不繼續用 generic 的 `PUT/PATCH /materials/:id`
 *
 * 那是一支「部分更新」端點，`status` 只是它眾多欄位中的一個 —— 用它做審核代表：
 * 沒有轉移規則（任何 admin 可以把 published 直接改回 pending_review）、
 * 沒有退回原因、沒有 reviewer 快照、`pending_review` 轉移完全不寫稽核。
 * 審核是**有語意的業務動作**，因此有自己的端點與自己的不變條件。
 *
 * ## 併發
 *
 * 每個動作先 `SELECT ... FOR UPDATE` 再依**讀到的實際狀態**做條件式 UPDATE。
 * 兩個 Admin 同時審同一份教材時，第二個人拿到 409（`invalid_transition`），
 * 而不是靜默覆蓋第一個人的決定。
 *
 * ## activity_logs 在 transaction 之外
 *
 * 沿用 repo 既有慣例（見 `services/reportAdmin.service.js` 與付款憑證審核）：
 * 稽核記錄失敗不應回滾已經成立的業務操作。email 同理（fire-and-forget）。
 *
 * ## Review snapshot
 *
 * `review_reason_code / review_note / reviewed_by / reviewed_at` 是
 * **latest review decision snapshot**，每次決定都會覆寫。完整歷史在 `activity_logs`。
 */

/** 服務層錯誤碼 → HTTP status。集中一份，避免各 route 自己猜。 */
const ERROR_STATUS = Object.freeze({
  not_found: 404,
  invalid_transition: 409,
  invalid_input: 400,
  forbidden: 403,
  // 核准時教材沒有可上架的檔案 —— 是狀態衝突而不是輸入錯誤，Admin 沒有填錯任何東西。
  candidate_required: 409,
  conflict: 409,
});

function fail(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

/**
 * 共用的狀態轉移執行器。
 *
 * @param {object} args
 * @param {string} args.materialId
 * @param {string} args.toStatus
 * @param {(row: object) => boolean} [args.ownerCheck] 額外的資料邊界檢查（creator 專用）
 * @param {(row: object) => object} args.columns 依當下的列決定要寫入哪些欄位
 * @param {(client: object, updated: object, before: object) => Promise<object>} [args.inTransaction]
 *        狀態更新之後、COMMIT 之前，在**同一個 transaction 內**執行的額外工作。
 *        回傳 `{ok:false, code, message}` 會讓整筆回滾。教材檔案的升級走這條路 ——
 *        「已上架」與「指向新檔」必須是同一個原子事實，否則會出現
 *        「教材上架了但買家下載到舊檔」這種沒有人會發現的中間狀態。
 * @returns {Promise<{ok: true, material: object, before: object, extra: object} | {ok: false, code: string, message: string}>}
 */
async function runTransition({ materialId, toStatus, ownerCheck = null, columns, inTransaction = null }) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const locked = await client.query(
      `SELECT id, title, teacher_id, status, published_at
         FROM materials
        WHERE id = $1
        FOR UPDATE`,
      [String(materialId)]
    );
    if (locked.rows.length === 0) {
      await client.query("ROLLBACK");
      return fail("not_found", "material not found");
    }
    const before = locked.rows[0];

    if (ownerCheck && !ownerCheck(before)) {
      await client.query("ROLLBACK");
      // 不是自己的教材一律 404，回 403 會洩漏「這個 id 存在」。
      return fail("not_found", "material not found");
    }

    if (!workflow.canTransition(before.status, toStatus)) {
      await client.query("ROLLBACK");
      return fail(
        "invalid_transition",
        `material is ${before.status}; ${before.status} → ${toStatus} is not allowed`
      );
    }

    /*
     * $1 = id，接著是各欄位的值，最後兩個是 toStatus 與 before.status。
     * `sets` 可以是空陣列（重新送審只改 status），因此 assignment 是組出來的，
     * 不用字串樣板拼接 —— 空陣列時不會留下一個孤兒逗號。
     */
    const { sets, values } = columns(before);
    const assignments = sets.map((column, i) => `${column} = $${i + 2}`);
    assignments.push(`status = $${values.length + 2}`);
    assignments.push("updated_at = NOW()");

    const updated = await client.query(
      `UPDATE materials
          SET ${assignments.join(",\n              ")}
        WHERE id = $1 AND status = $${values.length + 3}
        RETURNING *`,
      [String(materialId), ...values, toStatus, before.status]
    );
    if (updated.rows.length === 0) {
      // 理論上不會發生（已 FOR UPDATE），保留為 defence in depth。
      await client.query("ROLLBACK");
      return fail("invalid_transition", "material status changed concurrently; please reload");
    }

    let material = updated.rows[0];
    let extra = null;
    if (inTransaction) {
      extra = await inTransaction(client, material, before);
      if (extra && extra.ok === false) {
        await client.query("ROLLBACK");
        return extra;
      }
      // hook 可能改了同一列（例如檔案指標），UPDATE 的 RETURNING 已經過時。
      const refreshed = await client.query(`SELECT * FROM materials WHERE id = $1`, [String(materialId)]);
      if (refreshed.rows.length > 0) material = refreshed.rows[0];
    }

    await client.query("COMMIT");
    return { ok: true, material, before, extra };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* 連線已失效時 ROLLBACK 也會失敗；原始錯誤才是要往上拋的那一個 */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 核准上架：`pending_review → published`。
 *
 * - `published_at` 只在**第一次**公開時寫入（首次公開時間，不是 last_published_at）；
 *   之後的重新公開時間由 `material.published` 事件保存。
 * - 清掉 `review_reason_code` / `review_note`：那是上一次退回的理由，
 *   留著會讓創作者在一份已上架的教材上看到「需修改原因」。
 *   歷史沒有遺失 —— 它在 activity_logs 裡。
 */
async function approveMaterial(materialId, adminUser, { note = null } = {}) {
  const adminNote = note == null ? null : String(note).trim() || null;

  const result = await runTransition({
    materialId,
    toStatus: "published",
    columns: (before) => ({
      sets: ["review_reason_code", "review_note", "reviewed_by", "reviewed_at", "published_at"],
      values: [
        null,
        null,
        String(adminUser.userId),
        new Date(),
        // COALESCE 語意寫在應用層：只有還沒有值時才填。
        before.published_at ?? new Date(),
      ],
    }),
    /*
     * 檔案升級與上架**必須是同一筆 transaction**。
     *
     * 分成兩步的話，兩種中間狀態都會發生而且沒有人會發現：
     *   - 先上架後升級失敗 → 教材公開販售，買家下載到舊檔或 409；
     *   - 先升級後上架失敗 → 買家拿到還沒通過審核的內容。
     *
     * `requireCandidate` 的語意見 promoteCandidate()：從沒有已核准檔的教材
     * （＝第一次上架）一定要有候選檔，否則等於上架一個買家下載不到東西的商品。
     */
    inTransaction: (client) =>
      materialFileService.promoteCandidate(client, {
        materialId,
        adminUserId: adminUser.userId,
        requireCandidate: true,
      }),
  });
  if (!result.ok) return result;

  const { material, before, extra } = result;
  const firstPublish = before.published_at == null;

  await writeActivityLog({
    actorId: adminUser.userId,
    actorRole: adminUser.role,
    targetType: "material",
    targetId: material.id,
    action: "material.published",
    meta: {
      oldStatus: before.status,
      newStatus: material.status,
      reviewedBy: adminUser.userId,
      firstPublish,
      ...(adminNote ? { note: adminNote } : {}),
    },
  });

  // 檔案升級是獨立的稽核事實：「這份教材從這一刻起交付的是這個檔案」。
  if (extra?.promoted) {
    await writeActivityLog({
      actorId: adminUser.userId,
      actorRole: adminUser.role,
      targetType: "material",
      targetId: material.id,
      action: "material.file_approved",
      meta: {
        fileId: extra.approvedFileId,
        ...(extra.supersededFileId ? { supersededFileId: extra.supersededFileId } : {}),
        originalFilename: extra.file?.originalFilename,
        sizeBytes: extra.file?.sizeBytes,
      },
    });
  }

  /*
   * 這兩支教材信目前**自己**包了 try/catch，所以現在不會 reject。
   * 仍然改用 `dispatchBestEffort`：不變條件應該由「分離 promise 的這一行」保證，
   * 而不是靠「每一支 sender 的作者都記得包 try/catch」（`REL-02`）。
   */
  dispatchBestEffort(() => sendMaterialPublishedEmail(material.id), {
    operation: "material_published email",
    reference: material.id,
  });

  return { ok: true, material, firstPublish, fileApproved: Boolean(extra?.promoted) };
}

/**
 * 退回修改：`pending_review → changes_requested`。
 *
 * 原因與說明**都是必填**（`utils/materialWorkflow.js`）：結構化原因讓創作者知道要改哪一區，
 * 必填說明讓他知道具體是哪裡。缺一不可 —— 一個沒有說明的退回等於把教材永久卡死。
 */
async function requestChanges(materialId, adminUser, { reasonCode, note } = {}) {
  const validated = workflow.validateRequestChanges({ reasonCode, note });
  if (!validated.valid) return fail("invalid_input", validated.message);

  const result = await runTransition({
    materialId,
    toStatus: "changes_requested",
    columns: () => ({
      sets: ["review_reason_code", "review_note", "reviewed_by", "reviewed_at"],
      values: [validated.reasonCode, validated.note, String(adminUser.userId), new Date()],
    }),
  });
  if (!result.ok) return result;

  const { material, before } = result;

  await writeActivityLog({
    actorId: adminUser.userId,
    actorRole: adminUser.role,
    targetType: "material",
    targetId: material.id,
    action: "material.changes_requested",
    meta: {
      oldStatus: before.status,
      newStatus: material.status,
      reasonCode: validated.reasonCode,
      note: validated.note,
      reviewedBy: adminUser.userId,
    },
  });

  // 同上：邊界放在分離點，不依賴 sender 的內部寫法（`REL-02`）。
  dispatchBestEffort(() => sendMaterialChangesRequestedEmail(material.id), {
    operation: "material_changes_requested email",
    reference: material.id,
  });

  return { ok: true, material };
}

/**
 * 創作者重新送審：`changes_requested | unpublished → pending_review`。
 *
 * **同一份教材繼續 lifecycle**（同一個 `materials.id`），不建立新教材 ——
 * 新建會讓訂單、購物車、評價、檢舉的外鍵關聯全部斷裂。
 *
 * `unpublished`（曾因檢舉下架）同樣走這條路：必須重新經過完整審核才能再次公開，
 * **不得**直接復架。
 *
 * review snapshot **不清空**：創作者在等待審核期間仍應看得到上一次的退回原因，
 * 否則他無法對照自己改了什麼。下一次審核決定會覆寫它。
 */
async function resubmitMaterial(materialId, creatorUser) {
  const result = await runTransition({
    materialId,
    toStatus: "pending_review",
    ownerCheck: (row) => String(row.teacher_id) === String(creatorUser.userId),
    columns: () => ({ sets: [], values: [] }),
  });
  if (!result.ok) return result;

  const { material, before } = result;

  await writeActivityLog({
    actorId: creatorUser.userId,
    actorRole: creatorUser.role,
    targetType: "material",
    targetId: material.id,
    action: "material.resubmitted",
    meta: {
      oldStatus: before.status,
      newStatus: material.status,
      // 只留原因代碼：note 全文已在退回當下的 activity log 裡，重複塞一份沒有稽核價值。
      ...(material.review_reason_code ? { previousReviewReasonCode: material.review_reason_code } : {}),
    },
  });

  return { ok: true, material };
}

module.exports = {
  ERROR_STATUS,
  approveMaterial,
  requestChanges,
  resubmitMaterial,
};
