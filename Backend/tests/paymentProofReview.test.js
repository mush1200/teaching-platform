/**
 * 付款憑證退件原因的單元測試（無資料庫）。
 *
 *   node --test tests/paymentProofReview.test.js
 *
 * 舊版只有自由文字 `note`，且**只有前端**擋「拒絕時需填寫原因」——
 * 直接打 API 就能留下沒有理由的退件，買家在訂單詳情只會看到一片空白。
 * 這裡鎖住的是：驗證在 Backend，且每個 code 都有給買家看的文案。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REJECTION_REASONS,
  REASON_REQUIRING_NOTE,
  REJECTION_REASON_TEXT,
  parseRejection,
} = require("../utils/paymentProofReview");

test("每個 reason code 都有給買家看的文案", () => {
  for (const code of REJECTION_REASONS) {
    assert.equal(typeof REJECTION_REASON_TEXT[code], "string", code);
    assert.ok(REJECTION_REASON_TEXT[code].length > 0, code);
  }
  assert.deepEqual(Object.keys(REJECTION_REASON_TEXT).sort(), [...REJECTION_REASONS].sort());
});

test("缺少 rejection_reason → 拒絕", () => {
  assert.equal(parseRejection({}).ok, false);
  assert.equal(parseRejection({ note: "看不清楚" }).ok, false);
  assert.equal(parseRejection({ rejection_reason: "   " }).ok, false);
});

test("不在 allowlist 的 reason → 拒絕", () => {
  const result = parseRejection({ rejection_reason: "because_i_said_so" });
  assert.equal(result.ok, false);
  assert.match(result.message, /rejection_reason must be one of/);
});

test("合法 reason 不需要 note", () => {
  const result = parseRejection({ rejection_reason: "amount_mismatch" });
  assert.deepEqual(result, { ok: true, reason: "amount_mismatch", note: null });
});

test('reason = "other" 時 note 必填', () => {
  assert.equal(parseRejection({ rejection_reason: REASON_REQUIRING_NOTE }).ok, false);
  assert.equal(parseRejection({ rejection_reason: REASON_REQUIRING_NOTE, note: " " }).ok, false);
  assert.deepEqual(parseRejection({ rejection_reason: "other", note: " 銀行查無此筆 " }), {
    ok: true,
    reason: "other",
    note: "銀行查無此筆",
  });
});

test("camelCase 與 reason 別名皆可（前端不必記住哪一種寫法）", () => {
  assert.equal(parseRejection({ rejectionReason: "unreadable" }).reason, "unreadable");
  assert.equal(parseRejection({ reason: "invalid_proof" }).reason, "invalid_proof");
});
