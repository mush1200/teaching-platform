const db = require("../config/db");
const reportRepository = require("../repositories/report.repository");
const { writeActivityLog } = require("../utils/activityLog");
const workflow = require("../utils/reportWorkflow");

/**
 * 檢舉案件（moderation case）的 Admin 服務層。
 *
 * ## 為什麼每個動作都是一個 transaction
 *
 * 一次處置最多會動到三張表：`reports`（狀態）、`report_events`（案件歷程）、
 * `materials`（下架）。三者必須同生共死 —— 只寫了狀態卻沒寫歷程，案件就變成
 * 「不知道為什麼被結案」；下架成功但狀態沒更新，教材就在沒有紀錄的情況下消失。
 *
 * `activity_logs` 刻意**留在 transaction 之外**（COMMIT 之後才寫），沿用 repo 既有慣例
 * （見 routes/admin.js 的付款憑證審核）：稽核記錄失敗不該回滾已經成立的業務操作。
 *
 * ## 併發
 *
 * 每個動作先 `lockReportForUpdate`（`SELECT ... FOR UPDATE`）再依**讀到的實際狀態**
 * 做條件式 UPDATE。兩個 Admin 同時處理同一張案件時，第二個人會拿到 409，
 * 而不是靜默覆蓋第一個人的判定。
 */

/** 服務層錯誤碼 → route 對應 HTTP status。集中一份，避免各 route 自己猜。 */
const ERROR_STATUS = Object.freeze({
  not_found: 404,
  invalid_transition: 409,
  already_reviewed: 409,
  invalid_resolution: 400,
  message_required: 400,
});

function fail(code, message) {
  return { ok: false, code, message };
}

/**
 * Admin 將檢舉標記為 reviewed（僅 pending → reviewed）。
 *
 * **Legacy 路徑**，保留給既有 caller（Postman collection、舊 UI）。
 * 新 UI 走 `investigate` / `requestCreatorResponse` / `resolve`。
 *
 * @param {string} reportId
 * @param {{ userId: string, role: string }} adminUser
 */
async function reviewReport(reportId, adminUser) {
  const updated = await reportRepository.markReportReviewed({
    id: reportId,
    reviewedBy: adminUser.userId,
  });
  if (updated) {
    await reportRepository.insertReportEvent(null, {
      reportId: updated.id,
      actorId: adminUser.userId,
      actorRole: adminUser.role,
      eventType: "status_changed",
      message: null,
      meta: { from: "pending", to: "reviewed", legacy: true },
    });
    await writeActivityLog({
      actorId: adminUser.userId,
      actorRole: adminUser.role,
      targetType: "report",
      targetId: updated.id,
      action: "report_reviewed",
      meta: { status: "reviewed" },
    });
    return { ok: true, report: updated };
  }
  const existing = await reportRepository.findReportById(reportId);
  if (!existing) {
    return { ok: false, code: "not_found" };
  }
  return { ok: false, code: "already_reviewed" };
}

/**
 * 共用的狀態轉移執行器。
 *
 * @param {object} params
 * @param {string} params.reportId
 * @param {{ userId: string, role: string }} params.actor
 * @param {(current: object) => string} params.nextStatusFor  依鎖到的目前狀態決定目標狀態
 * @param {string} params.eventType
 * @param {string|null} params.message
 * @param {object} params.eventMeta
 * @param {string|null} params.resolution
 * @param {string|null} params.resolutionNote
 * @param {boolean} params.stampReviewed  是否寫入 reviewed_by / reviewed_at（結案時才寫）
 * @param {(client: object, current: object) => Promise<object>} [params.sideEffect]
 *        在同一個 transaction 內執行的額外動作（例如下架教材），回傳值併入結果 meta。
 * @param {string} params.auditAction
 */
async function runTransition({
  reportId,
  actor,
  nextStatusFor,
  eventType,
  message = null,
  eventMeta = {},
  resolution = null,
  resolutionNote = null,
  stampReviewed = false,
  sideEffect = null,
  auditAction,
}) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const current = await reportRepository.lockReportForUpdate(client, reportId);
    if (!current) {
      await client.query("ROLLBACK");
      return fail("not_found", "report not found");
    }

    const nextStatus = nextStatusFor(current);
    if (!workflow.canTransition(current.status, nextStatus)) {
      await client.query("ROLLBACK");
      return fail(
        "invalid_transition",
        `cannot move report from "${current.status}" to "${nextStatus}"`
      );
    }

    let sideEffectResult = {};
    if (sideEffect) {
      sideEffectResult = (await sideEffect(client, current)) || {};
    }

    const updated = await reportRepository.updateStatusIfUnchanged(client, {
      id: reportId,
      expectedFrom: current.status,
      nextStatus,
      resolution,
      resolutionNote,
      reviewedBy: actor.userId,
      stampReviewed,
    });
    if (!updated) {
      // 鎖住之後還會失敗，代表狀態在 SELECT 與 UPDATE 之間被改了（理論上不該發生）。
      await client.query("ROLLBACK");
      return fail("invalid_transition", "report state changed concurrently");
    }

    await reportRepository.insertReportEvent(client, {
      reportId,
      actorId: actor.userId,
      actorRole: actor.role,
      eventType,
      message,
      meta: { from: current.status, to: nextStatus, ...eventMeta, ...sideEffectResult },
    });

    await client.query("COMMIT");

    await writeActivityLog({
      actorId: actor.userId,
      actorRole: actor.role,
      targetType: "report",
      targetId: reportId,
      action: auditAction,
      meta: { from: current.status, to: nextStatus, ...eventMeta, ...sideEffectResult },
    });

    return { ok: true, report: updated, effects: sideEffectResult };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** 接手案件：pending → investigating。 */
async function startInvestigation(reportId, actor, { note = null } = {}) {
  return runTransition({
    reportId,
    actor,
    nextStatusFor: () => "investigating",
    eventType: "status_changed",
    message: note ? String(note).trim() : null,
    auditAction: "report.investigation_started",
  });
}

/** 要求創作者補充說明：pending | investigating → awaiting_creator。 */
async function requestCreatorResponse(reportId, actor, { message } = {}) {
  const text = message == null ? "" : String(message).trim();
  if (!text) {
    return fail("message_required", "message is required when requesting a creator response");
  }
  return runTransition({
    reportId,
    actor,
    nextStatusFor: () => "awaiting_creator",
    eventType: "creator_response_requested",
    message: text,
    auditAction: "report.creator_response_requested",
  });
}

/** Admin 內部調查筆記。不改狀態、創作者看不到。 */
async function addAdminNote(reportId, actor, { message } = {}) {
  const text = message == null ? "" : String(message).trim();
  if (!text) return fail("message_required", "message is required");

  const existing = await reportRepository.findReportById(reportId);
  if (!existing) return fail("not_found", "report not found");

  const event = await reportRepository.insertReportEvent(null, {
    reportId,
    actorId: actor.userId,
    actorRole: actor.role,
    eventType: "admin_note",
    message: text,
    meta: {},
  });
  return { ok: true, event };
}

/**
 * 最終處置。
 *
 * `unpublish_material` 是唯一會改動平台資料的處置，且**只在教材目前是 published 時**
 * 執行；已經下架的教材不會再被寫一次（回報 `materialUnpublished: false`），
 * 避免在 activity_logs 產生「下架了一個已下架教材」的假事件。
 */
async function resolveReport(reportId, actor, { resolution, note = null } = {}) {
  const code = resolution == null ? "" : String(resolution).trim();
  if (!workflow.isResolution(code)) {
    return fail(
      "invalid_resolution",
      `resolution must be one of ${workflow.REPORT_RESOLUTIONS.join("|")}`
    );
  }
  const text = note == null ? "" : String(note).trim();

  return runTransition({
    reportId,
    actor,
    nextStatusFor: () => workflow.statusForResolution(code),
    eventType: "resolution",
    message: text || null,
    eventMeta: { resolution: code },
    resolution: code,
    resolutionNote: text || null,
    stampReviewed: true,
    auditAction: "report.resolved",
    sideEffect: workflow.mutatesMaterial(code)
      ? async (client, current) => {
          if (!current.material_id) return { materialUnpublished: false };
          const result = await client.query(
            `UPDATE materials
             SET status = 'unpublished', updated_at = NOW()
             WHERE id = $1 AND status = 'published'
             RETURNING id`,
            [current.material_id]
          );
          const unpublished = result.rows.length > 0;
          if (unpublished) {
            // 教材本身的稽核事件，與 report 的事件分開；查教材歷程時才看得到這一筆。
            await client.query(
              `INSERT INTO activity_logs(actor_id, actor_role, target_type, target_id, action, meta)
               VALUES($1, $2, 'material', $3, 'material.unpublished', $4::jsonb)`,
              [
                actor.userId,
                actor.role,
                current.material_id,
                JSON.stringify({ oldStatus: "published", newStatus: "unpublished", reportId }),
              ]
            );
          }
          return { materialUnpublished: unpublished };
        }
      : null,
  });
}

/**
 * 創作者提交說明：awaiting_creator → investigating（球回到 Admin 手上）。
 *
 * 授權在 `findCreatorCase` 的 `m.teacher_id = creatorId` —— 不是自己教材的案件
 * 一律當成不存在（404），不回 403：403 會洩漏「這個 case id 存在」。
 */
async function submitCreatorResponse(reportId, creator, { message } = {}) {
  const text = message == null ? "" : String(message).trim();
  if (!text) return fail("message_required", "message is required");

  const owned = await reportRepository.findCreatorCase({ reportId, creatorId: creator.userId });
  if (!owned) return fail("not_found", "case not found");

  return runTransition({
    reportId,
    actor: creator,
    nextStatusFor: () => "investigating",
    eventType: "creator_response",
    message: text,
    auditAction: "report.creator_responded",
  });
}

module.exports = {
  ERROR_STATUS,
  reviewReport,
  startInvestigation,
  requestCreatorResponse,
  addAdminNote,
  resolveReport,
  submitCreatorResponse,
};
