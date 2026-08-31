const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DRAFT_BLOCK_MARKERS,
  checkTechnical,
  checkExternalApproval,
  preflight,
} = require("../utils/legalPublicationPreflight");
const { DOCUMENT_TYPES } = require("../utils/legalDocumentTypes");
const { PUBLISH_REASONS } = require("../utils/legalDocumentPublishPolicy");

/**
 * `OPS-05` —— 發布前置檢查的單元測試。
 *
 * 這一支**不碰資料庫**：被測的是純函式，沒有 I/O。
 * 真正的 publish 機制（狀態流轉、原子 supersede、稽核欄位）早已由
 * `legalDocuments.db.test.js` / `legalDocumentReconsent.db.test.js` /
 * `legalDocumentPublishJustification.db.test.js` 在隔離測試資料庫上覆蓋，
 * 這裡**刻意不重複**那些情境。
 *
 * 本檔要釘住的是 `OPS-05` 自己的不變條件：
 * **技術檢查與外部核准是兩條線，永遠不得合併。**
 */

/** 一組技術面完全合法的輸入；各測試只覆寫要驗的那一項。 */
function validRequest(overrides = {}) {
  return {
    documentType: "terms",
    version: "1",
    body: "第一條 本平台……",
    effectiveDate: "2026-09-01",
    requiresReconsent: false,
    reasonCode: "editorial_update",
    lawyerApprovalRef: "LAW-2026-09-01/opinion-3",
    acknowledgeExternalReview: true,
    ...overrides,
  };
}

test("A. 預設呼叫不做任何寫入 —— 模組沒有、也不該有寫入能力", () => {
  const mod = require("../utils/legalPublicationPreflight");
  // 純函式模組：不得匯出任何看起來像寫入的東西。
  for (const [key, value] of Object.entries(mod)) {
    if (typeof value !== "function") continue; // 常數不是行為，不在這條不變條件的射程內
    assert.ok(
      !/^(publish|write|create|update|delete|approve)/i.test(key),
      `preflight module must not export a mutating helper, found: ${key}`
    );
  }
  // 呼叫它不需要 DB handle，也不接受任何 client。
  const out = preflight(validRequest());
  assert.equal(typeof out.readyToPublish, "boolean");
});

test("B. 缺少 operator 的外部審閱確認 → 拒絕（技術面即使全過也一樣）", () => {
  const out = preflight(validRequest({ acknowledgeExternalReview: false }));
  assert.equal(out.technical.ok, true, "技術面本來就該通過");
  assert.equal(out.externalApproval.ok, false);
  assert.equal(out.readyToPublish, false);
  assert.ok(
    out.externalApproval.blockers.some((b) => b.code === "external_review_not_acknowledged"),
    "必須明確指出缺的是 operator 的確認"
  );
});

test("C. 文件型別不在 canonical allowlist → 拒絕", () => {
  const out = checkTechnical(validRequest({ documentType: "cookie_policy" }));
  assert.equal(out.ok, false);
  assert.ok(out.failures.some((f) => f.code === "invalid_document_type"));
  // allowlist 必須來自 service，不得在 preflight 另建一份
  assert.deepEqual([...DOCUMENT_TYPES], ["terms", "privacy", "creator_agreement", "refund_policy"]);
});

test("D. 正文為空／只有空白 → 拒絕", () => {
  for (const body of [null, undefined, "", "   \n  "]) {
    const out = checkTechnical(validRequest({ body }));
    assert.equal(out.ok, false, `body=${JSON.stringify(body)} 應被拒絕`);
    assert.ok(out.failures.some((f) => f.code === "body_required"));
  }
});

test("E. 缺少必要的營運 metadata → 拒絕", () => {
  // 版本
  assert.ok(
    checkTechnical(validRequest({ version: "  " })).failures.some((f) => f.code === "version_required")
  );
  // 生效日：格式錯、以及看起來像日期但不存在的日子
  for (const bad of [undefined, "2026/09/01", "26-09-01", "2026-13-01", "2026-02-30"]) {
    const out = checkTechnical(validRequest({ effectiveDate: bad }));
    assert.ok(
      out.failures.some((f) => f.code === "effective_date_invalid"),
      `effectiveDate=${bad} 應被拒絕`
    );
  }
  // 發布理由
  assert.ok(
    checkTechnical(validRequest({ reasonCode: undefined })).failures.length > 0,
    "缺 reasonCode 應被拒絕"
  );
  assert.ok(
    checkTechnical(validRequest({ reasonCode: "made_up_reason" })).failures.length > 0,
    "未知 reasonCode 應被拒絕"
  );
  // `other` 必須附說明
  assert.ok(
    checkTechnical(validRequest({ reasonCode: "other", note: undefined })).failures.length > 0,
    "other 缺 note 應被拒絕"
  );
  assert.equal(checkTechnical(validRequest({ reasonCode: "other", note: "補充說明" })).ok, true);
});

test("E2. requiresReconsent 必須是顯式 boolean，且不得由 reasonCode 推導", () => {
  for (const bad of [undefined, null, "true", "false", 1, 0]) {
    const out = checkTechnical(validRequest({ requiresReconsent: bad }));
    assert.ok(
      out.failures.some((f) => f.code === "requires_reconsent_required"),
      `requiresReconsent=${JSON.stringify(bad)} 應被拒絕`
    );
  }
  // 同一個 reasonCode 搭 true 或 false 都合法 —— 證明沒有 auto-toggle
  for (const reasonCode of PUBLISH_REASONS.filter((r) => r !== "other")) {
    assert.equal(checkTechnical(validRequest({ reasonCode, requiresReconsent: true })).ok, true);
    assert.equal(checkTechnical(validRequest({ reasonCode, requiresReconsent: false })).ok, true);
  }
});

test("F. 來源仍帶著草稿封鎖標記 → 一律 blocked，且不得宣告為可發布", () => {
  for (const marker of DRAFT_BLOCK_MARKERS) {
    const out = preflight(validRequest({ body: `${marker}\n\n第一條 ……` }));
    assert.equal(out.technical.ok, true, "技術面仍可能是好的 —— 這正是重點");
    assert.equal(out.externalApproval.ok, false);
    assert.equal(out.readyToPublish, false, "帶草稿標記時絕不可判為 ready");
    assert.ok(
      out.externalApproval.blockers.some((b) => b.code === "source_is_an_unapproved_draft"),
      `marker ${JSON.stringify(marker)} 應觸發 draft blocker`
    );
  }
});

test("F2. 目前 repo 裡的四份草稿，全部都必須被判為 not ready", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const drafts = {
    terms: "terms-of-service.draft.md",
    privacy: "privacy-policy.draft.md",
    creator_agreement: "creator-agreement.draft.md",
    refund_policy: "refund-cancellation-policy.draft.md",
  };
  const root = path.resolve(__dirname, "..", "..", "docs", "legal-drafts");
  for (const [documentType, file] of Object.entries(drafts)) {
    const body = fs.readFileSync(path.join(root, file), "utf8");
    // 刻意給一組「其他都填對」的輸入 —— 只有草稿標記會擋下它。
    const out = preflight(validRequest({ documentType, body }));
    assert.equal(
      out.readyToPublish,
      false,
      `${file} 必須被判為 not ready —— 它尚未經律師核可`
    );
    assert.ok(out.externalApproval.blockers.some((b) => b.code === "source_is_an_unapproved_draft"));
  }
});

test("G. 缺少律師核准參照 → 拒絕；會計師參照只在被標示為必要時才要求", () => {
  const noLawyer = checkExternalApproval({
    body: "ok",
    lawyerApprovalRef: "   ",
    acknowledgeExternalReview: true,
  });
  assert.equal(noLawyer.ok, false);
  assert.ok(noLawyer.blockers.some((b) => b.code === "lawyer_approval_reference_required"));

  const accountantNeeded = checkExternalApproval({
    body: "ok",
    lawyerApprovalRef: "LAW-1",
    accountantReviewRequired: true,
    acknowledgeExternalReview: true,
  });
  assert.equal(accountantNeeded.ok, false);
  assert.ok(
    accountantNeeded.blockers.some((b) => b.code === "accountant_approval_reference_required")
  );

  const accountantNotNeeded = checkExternalApproval({
    body: "ok",
    lawyerApprovalRef: "LAW-1",
    accountantReviewRequired: false,
    acknowledgeExternalReview: true,
  });
  assert.equal(accountantNotNeeded.ok, true);
});

test("H. 技術面通過**不等於**可以發布 —— 兩條判定線不得合併", () => {
  // 技術全過，但沒有任何外部核准證據
  const out = preflight(
    validRequest({ lawyerApprovalRef: undefined, acknowledgeExternalReview: false })
  );
  assert.equal(out.technical.ok, true);
  assert.equal(out.readyToPublish, false);

  // 反向：外部證據齊備，但技術面壞掉
  const out2 = preflight(validRequest({ effectiveDate: "nope" }));
  assert.equal(out2.externalApproval.ok, true);
  assert.equal(out2.readyToPublish, false);
});
