/**
 * 買家付款申報驗證的單元測試（P1-09 Gate 6）。
 *
 * 這裡鎖的是「驗格式，不驗真偽」的界線：
 *
 *   * 四個欄位**全部選填** —— 既有流程允許只上傳圖片。
 *   * 只要有填就必須合格；半套申報比沒有申報更難核對。
 *   * **不比對申報金額與訂單金額** —— 金額不符是**爭議事實**，不是輸入錯誤。
 *     擋掉它等於讓買家無法申報「我少匯了」或「我多匯了」。
 *   * 只收帳號**末四碼**，不收完整帳號。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateReportedPayment, MAX_BANK_NAME_LENGTH } = require("../utils/reportedPayment");

const NOW = new Date("2026-08-26T10:00:00Z");

test("四個欄位全部選填 —— 什麼都不填是合法的（既有流程不得被破壞）", () => {
  for (const input of [{}, { reportedBankName: "", reportedAccountLast4: "  " }]) {
    const r = validateReportedPayment(input, NOW);
    assert.equal(r.valid, true);
    assert.equal(r.provided, false, "空白等同未填");
    assert.deepEqual(r.value, { bankName: null, accountLast4: null, amount: null, transferAt: null });
  }
});

test("完整申報：正規化後回傳，且標記 provided", () => {
  const r = validateReportedPayment(
    {
      reportedBankName: "  國泰世華  ",
      reportedAccountLast4: "0417",
      reportedAmount: "480",
      reportedTransferAt: "2026-08-26T09:30:00Z",
    },
    NOW
  );
  assert.equal(r.valid, true);
  assert.equal(r.provided, true);
  assert.equal(r.value.bankName, "國泰世華", "前後空白必須被去掉");
  assert.equal(r.value.accountLast4, "0417");
  assert.equal(r.value.amount, 480);
  assert.equal(r.value.transferAt.toISOString(), "2026-08-26T09:30:00.000Z");
});

test("只填一個欄位也是合法的 —— provided 為 true", () => {
  const r = validateReportedPayment({ reportedAmount: "100" }, NOW);
  assert.equal(r.valid, true);
  assert.equal(r.provided, true);
  assert.equal(r.value.amount, 100);
  assert.equal(r.value.bankName, null);
});

test("帳號末四碼：只接受 4 位數字（完整帳號一律拒絕）", () => {
  for (const bad of ["12", "12345", "abcd", "12a4", "1234567890123456"]) {
    const r = validateReportedPayment({ reportedAccountLast4: bad }, NOW);
    assert.equal(r.valid, false, `${bad} 必須被拒絕`);
    assert.equal(r.code, "invalid_reported_account_last4");
  }
  assert.equal(validateReportedPayment({ reportedAccountLast4: "0000" }, NOW).valid, true);
});

test("金額：正整數；精度與 orders 金額一致", () => {
  for (const bad of ["0", "-1", "12.5", "abc", ""]) {
    const r = validateReportedPayment({ reportedAmount: bad }, NOW);
    if (bad === "") {
      // 空字串等同未填，不是錯誤。
      assert.equal(r.valid, true);
      assert.equal(r.value.amount, null);
      continue;
    }
    assert.equal(r.valid, false, `${bad} 必須被拒絕`);
    assert.equal(r.code, "invalid_reported_amount");
  }
  assert.equal(validateReportedPayment({ reportedAmount: 480 }, NOW).value.amount, 480);
  // 驗的是**值**是不是正整數，不是字面形式 —— `"1e3"` 正規化後就是 1000，
  // 存進 DB 的仍是整數，沒有任何歧義殘留，因此不必額外拒絕。
  assert.equal(validateReportedPayment({ reportedAmount: "1e3" }, NOW).value.amount, 1000);
});

test("金額**不與訂單金額比對** —— 金額不符是爭議事實，不是輸入錯誤", () => {
  // 訂單 480 元、買家申報 100 元（少匯）或 9999 元（多匯）都必須能送出，
  // 否則買家無法透過系統陳述爭議。
  for (const amount of [1, 100, 9999, 1000000]) {
    const r = validateReportedPayment({ reportedAmount: String(amount) }, NOW);
    assert.equal(r.valid, true, `${amount} 必須被接受 —— validator 不做金額核對`);
  }
});

test("匯款時間：合法日期，且不得是未來（允許一天時差寬容）", () => {
  assert.equal(validateReportedPayment({ reportedTransferAt: "not-a-date" }, NOW).code, "invalid_reported_transfer_at");
  const farFuture = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(validateReportedPayment({ reportedTransferAt: farFuture }, NOW).code, "invalid_reported_transfer_at");

  // 一天內的偏差（時區／時鐘）必須被容忍。
  const slightlyAhead = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();
  assert.equal(validateReportedPayment({ reportedTransferAt: slightlyAhead }, NOW).valid, true);

  const past = "2026-08-20T08:00:00Z";
  assert.equal(validateReportedPayment({ reportedTransferAt: past }, NOW).value.transferAt.toISOString(), "2026-08-20T08:00:00.000Z");
});

test("銀行名稱：非空白且有長度上限", () => {
  const tooLong = "銀".repeat(MAX_BANK_NAME_LENGTH + 1);
  const r = validateReportedPayment({ reportedBankName: tooLong }, NOW);
  assert.equal(r.valid, false);
  assert.equal(r.code, "invalid_reported_bank_name");
  assert.equal(validateReportedPayment({ reportedBankName: "銀".repeat(MAX_BANK_NAME_LENGTH) }, NOW).valid, true);
});

test("不做的事：沒有銀行代碼表、沒有帳戶所有權驗證", () => {
  // 任何非空白字串都是合法的銀行名稱 —— 本平台不維護銀行清單。
  for (const name of ["台銀", "Bank of Somewhere", "郵局", "自訂名稱"]) {
    assert.equal(validateReportedPayment({ reportedBankName: name }, NOW).valid, true);
  }
});
