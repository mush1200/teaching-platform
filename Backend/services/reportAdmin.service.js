const reportRepository = require("../repositories/report.repository");
const { writeActivityLog } = require("../utils/activityLog");

/**
 * Admin 將檢舉標記為 reviewed（僅 pending → reviewed）。
 * @param {string} reportId
 * @param {{ userId: string, role: string }} adminUser
 * @returns {Promise<{ ok: true, report: object } | { ok: false, code: 'not_found' | 'already_reviewed' }>}
 */
async function reviewReport(reportId, adminUser) {
  const updated = await reportRepository.markReportReviewed({
    id: reportId,
    reviewedBy: adminUser.userId,
  });
  if (updated) {
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

module.exports = {
  reviewReport,
};
