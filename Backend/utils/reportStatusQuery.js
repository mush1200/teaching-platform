/**
 * Optional `status` query for report list endpoints (pending | reviewed).
 * Matches docs/teaching-platform-mvp-spec-v1.3.md §9.
 */
function parseOptionalReportStatusQuery(req, res) {
  const raw = req.query.status;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const s = String(raw).trim();
    if (s !== "pending" && s !== "reviewed") {
      res.status(400).json({ message: "status query must be pending or reviewed" });
      return { valid: false, sent: true };
    }
    return { valid: true, status: s };
  }
  return { valid: true, status: null };
}

module.exports = {
  parseOptionalReportStatusQuery,
};
