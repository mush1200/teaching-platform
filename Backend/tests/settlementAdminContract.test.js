/**
 * Admin settlement API 的**契約**測試（不連資料庫）。
 *
 * 這裡只驗證那些「錯了會很貴、但不需要資料庫就看得出來」的性質：
 * 寫入端點是否真的都被旗標擋住、`AD-09` 的銀行欄位有沒有偷偷跑進來、
 * 以及路由有沒有自己算錢。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROUTE = path.join(__dirname, "..", "routes", "adminSettlement.js");
const source = fs.readFileSync(ROUTE, "utf8");

/** 去掉註解，避免對說明文字誤判。 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the router is mounted under /admin and reuses the admin auth boundary", () => {
  assert.match(code, /router\.use\(requireAuth, requireRole\("admin"\)\)/);
  const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(index, /app\.use\("\/admin", adminSettlementRouter\)/);
});

test("every state-changing endpoint is gated by the settlement write flag", () => {
  const mutating = [...code.matchAll(/router\.post\("([^"]+)"/g)].map((m) => m[1]);
  assert.ok(mutating.length >= 3, "expected the close / mark-paid / mark-failed endpoints");
  for (const route of mutating) {
    const start = code.indexOf(`router.post("${route}"`);
    const next = code.indexOf("\nrouter.", start + 1);
    const body = code.slice(start, next === -1 ? undefined : next);
    assert.match(
      body,
      /isSettlementWriteEnabled\(\)/,
      `POST ${route} must check SETTLEMENT_WRITE_ENABLED`
    );
  }
});

test("read-only endpoints are NOT gated — shadow inspection must always work", () => {
  const preview = code.slice(
    code.indexOf('router.get("/settlement/cycles/:cycleId/preview"'),
    code.indexOf('router.post("/settlement/cycles/:cycleId/close"')
  );
  assert.equal(
    /isSettlementWriteEnabled\(\)/.test(preview),
    false,
    "the shadow preview must remain available while writes are disabled"
  );
});

test("no AD-09 banking-destination field is accepted, stored or returned", () => {
  for (const forbidden of [
    "account_number",
    "accountNumber",
    "bank_branch",
    "bankBranch",
    "bank_account",
    "bankAccount",
    "swift",
    "iban",
    "routing",
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `AD-09 is undecided; the settlement API must not handle "${forbidden}"`
    );
  }
});

test("no tax or withholding behaviour is implemented", () => {
  for (const forbidden of ["withhold", "withholding", "tax_rate", "taxRate", "扣繳"]) {
    assert.equal(source.includes(forbidden), false, `must not implement "${forbidden}"`);
  }
});

test("the route layer does not compute money itself", () => {
  // 金額一律來自 service 層的不可變事實。路由出現四則運算就是警訊。
  assert.equal(/\*\s*0\.8|\*\s*0\.2|\/\s*5\s*\*\s*4/.test(code), false, "no revenue share maths in routes");
  assert.equal(/Math\.(round|floor|ceil)\(/.test(code), false, "no rounding in routes");
});

test("transfer reference is bounded and required for mark-paid", () => {
  const markPaid = code.slice(
    code.indexOf('router.post("/settlement/payout-items/:id/mark-paid"'),
    code.indexOf('router.post("/settlement/payout-items/:id/mark-failed"')
  );
  assert.match(markPaid, /transfer_reference_required/);
  assert.match(markPaid, /transfer_reference_too_long/);
  assert.match(markPaid, /dispatchBestEffort/, "notification must be fired outside the transaction");
  // 通知必須在 commit 之後：`inTransaction` 回傳之後才 dispatch。
  assert.ok(
    markPaid.indexOf("await inTransaction") < markPaid.indexOf("dispatchBestEffort"),
    "the email must be dispatched after the money transaction commits"
  );
});

test("the report endpoint does not redefine recognized order revenue", () => {
  const report = code.slice(code.indexOf('router.get("/settlement/report"'));
  assert.equal(
    /orders\.total_amount|recognized_order_revenue/.test(report),
    false,
    "recognized order revenue stays the existing Admin metric (mvp_rules.md §18.4)"
  );
});

test("payout evidence reports reconciliation honestly for pending items", () => {
  const evidence = code.slice(
    code.indexOf('router.get("/settlement/payout-items/:id/evidence"'),
    code.indexOf('router.post("/settlement/payout-items/:id/mark-paid"')
  );
  // 零配置的 pending item 不在 deferred trigger 的射程內，因此不得宣稱它對帳過。
  assert.match(evidence, /status === "paid" \? allocated === Number\(item\.amount\) : null/);
});
