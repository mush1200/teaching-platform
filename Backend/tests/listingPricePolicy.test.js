/**
 * 上架價格政策的單元測試（`COR-09` / `DEC-34` + `DEC-39`）。
 *
 * 鎖住四件事：
 *
 *   1. **兩條規則只有一個定義來源** —— 整數 TWD、下限 NT$30。
 *   2. **Fail-fast** —— 不合法就是不合法，**絕不**靜默 floor／ceil／round／clamp。
 *   3. **error code 穩定** —— 三個 code 是 API 契約，不得隨文案漂移。
 *   4. **錯誤碼對應到實際違反的那一條規則** —— `29.5` 是 not_integer，不是 below_minimum。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../utils/listingPricePolicy");
const { validateListingPrice, isCompliantListingPrice, LISTING_PRICE_ERROR } = policy;

test("已拍板的數字：最低上架價 NT$30", () => {
  assert.equal(policy.MIN_LISTING_PRICE, 30);
});

test("error code 是穩定契約", () => {
  assert.equal(LISTING_PRICE_ERROR.INVALID, "price_invalid");
  assert.equal(LISTING_PRICE_ERROR.NOT_INTEGER, "price_not_integer");
  assert.equal(LISTING_PRICE_ERROR.BELOW_MINIMUM, "price_below_minimum");
});

test("邊界：29 拒絕、30 接受、31 接受", () => {
  assert.equal(validateListingPrice(29).ok, false);
  assert.equal(validateListingPrice(29).code, LISTING_PRICE_ERROR.BELOW_MINIMUM);

  assert.deepEqual(validateListingPrice(30), { ok: true, value: 30 });
  assert.deepEqual(validateListingPrice(31), { ok: true, value: 31 });
});

test("小數一律拒絕，且回 price_not_integer", () => {
  for (const v of [30.5, 99.5, 0.5, 120.8, 29.5]) {
    const r = validateListingPrice(v);
    assert.equal(r.ok, false, `${v} 應被拒絕`);
    assert.equal(r.code, LISTING_PRICE_ERROR.NOT_INTEGER, `${v} 應為 not_integer`);
  }
});

test("整數性先於下限：29.5 是 not_integer 而非 below_minimum", () => {
  // 兩條規則都違反時，錯誤碼指向「不是整數」——
  // 因為把它改成 30 之後仍然不合法，先報下限會誤導。
  assert.equal(validateListingPrice(29.5).code, LISTING_PRICE_ERROR.NOT_INTEGER);
});

test("非數值、空值、布林、陣列一律 price_invalid", () => {
  for (const v of [undefined, null, "", "abc", {}, [], true, false, NaN, Infinity, -Infinity]) {
    const r = validateListingPrice(v);
    assert.equal(r.ok, false, `${JSON.stringify(v)} 應被拒絕`);
    assert.equal(
      r.code,
      LISTING_PRICE_ERROR.INVALID,
      `${JSON.stringify(v)} 應為 price_invalid（實際 ${r.code}）`
    );
  }
});

test("零與負數：0 與 -1 為 below_minimum（整數但低於下限）", () => {
  assert.equal(validateListingPrice(0).code, LISTING_PRICE_ERROR.BELOW_MINIMUM);
  assert.equal(validateListingPrice(-1).code, LISTING_PRICE_ERROR.BELOW_MINIMUM);
});

test("數值字串可被接受並正規化為 number（但不改變數值）", () => {
  assert.deepEqual(validateListingPrice("120"), { ok: true, value: 120 });
  assert.equal(validateListingPrice("120").value, 120);
  // 小數字串仍然拒絕 —— 字串形式不是繞過整數規則的後門。
  assert.equal(validateListingPrice("99.5").code, LISTING_PRICE_ERROR.NOT_INTEGER);
});

test("絕不靜默正規化：不合法輸入不得回傳任何 value", () => {
  for (const v of [29, 29.5, 30.5, 0, -5, "abc", null]) {
    const r = validateListingPrice(v);
    assert.equal(r.ok, false);
    assert.equal("value" in r, false, `${v} 不得回傳 value（會被誤寫入 DB）`);
  }
});

test("接受的值必須原封不動 —— 不 floor、不 ceil、不 round", () => {
  for (const v of [30, 31, 99, 120, 250, 1000]) {
    assert.equal(validateListingPrice(v).value, v);
  }
});

test("isCompliantListingPrice：供 census 與對帳判斷既有資料", () => {
  assert.equal(isCompliantListingPrice(30), true);
  assert.equal(isCompliantListingPrice(120), true);
  assert.equal(isCompliantListingPrice(29), false);
  assert.equal(isCompliantListingPrice(99.5), false);
  assert.equal(isCompliantListingPrice(0), false);
  assert.equal(isCompliantListingPrice(null), false);
  assert.equal(isCompliantListingPrice("120"), true);
  assert.equal(isCompliantListingPrice("abc"), false);
});

test("每個錯誤碼都有對應訊息，且訊息含最低價數字", () => {
  for (const code of Object.values(LISTING_PRICE_ERROR)) {
    const msg = policy.LISTING_PRICE_MESSAGE[code];
    assert.ok(msg && typeof msg === "string", `${code} 必須有訊息`);
  }
  assert.match(policy.LISTING_PRICE_MESSAGE[LISTING_PRICE_ERROR.BELOW_MINIMUM], /30/);
});
