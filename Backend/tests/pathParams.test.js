/**
 * Path 參數輸入邊界的單元測試（`COR-05`）。
 *
 *   node --test tests/pathParams.test.js
 *   npm run test:unit --prefix Backend      （已含本檔）
 *
 * 這裡只測純函式與 middleware 的分支，不碰資料庫 —— HTTP 層的契約
 * （四條匿名 route ＋ 需登入 route 皆不再 500）由 `scripts/api-smoke-test.js` 覆蓋。
 *
 * 要鎖住的事：
 *   1. `%00` 一律拒收（不論出現在 path 的哪個位置）
 *   2. **不**因此擋掉合法識別碼 —— 這個 repo 的 id 是 `mat_*` 這種 text，不是 UUID
 *   3. `%2500` 是字面的 `%00`，合法，不得誤擋
 *   4. 壞掉的 percent-encoding 不由這一層處理（Express 自己已回 400）
 *   5. 拒收時的回應不得帶 PG 錯誤碼 / SQL / stack / 檔案路徑
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { hasNulByte, pathHasNulByte, rejectNulBytePathParams } = require("../utils/pathParams");

const NUL = String.fromCharCode(0);

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

test("hasNulByte", async (t) => {
  await t.test("偵測到 NUL byte", () => {
    assert.equal(hasNulByte(NUL), true);
    assert.equal(hasNulByte(`mat_abc${NUL}`), true);
    assert.equal(hasNulByte(`${NUL}mat_abc`), true);
  });

  await t.test("合法識別碼不得被誤判", () => {
    assert.equal(hasNulByte("mat_mt4n1tppwgtnpe"), false);
    assert.equal(hasNulByte("00000000-0000-0000-0000-000000000000"), false);
    // 字面的 "%00" 只是四個字元，PostgreSQL 存得下，是合法輸入
    assert.equal(hasNulByte("%00"), false);
  });

  await t.test("非字串一律 false", () => {
    assert.equal(hasNulByte(undefined), false);
    assert.equal(hasNulByte(null), false);
    assert.equal(hasNulByte(123), false);
  });
});

test("pathHasNulByte", async (t) => {
  await t.test("百分比編碼的 NUL（大小寫皆須攔下）", () => {
    assert.equal(pathHasNulByte("/materials/%00"), true);
    assert.equal(pathHasNulByte("/materials/%00/reviews"), true);
    assert.equal(pathHasNulByte("/materials/%00/rating"), true);
    assert.equal(pathHasNulByte("/materials/%00/rating-distribution"), true);
    assert.equal(pathHasNulByte("/materials/media/%00"), true);
    // NUL 不一定單獨出現
    assert.equal(pathHasNulByte("/materials/abc%00"), true);
    assert.equal(pathHasNulByte("/materials/%00abc"), true);
  });

  await t.test("已經是原始 NUL byte 的 path", () => {
    assert.equal(pathHasNulByte(`/materials/${NUL}`), true);
  });

  await t.test("合法 path 不得被誤擋", () => {
    assert.equal(pathHasNulByte("/materials/mat_detail_seed_1"), false);
    assert.equal(pathHasNulByte("/materials/mat_detail_seed_1/reviews"), false);
    assert.equal(pathHasNulByte("/materials/media/00000000-0000-0000-0000-000000000000"), false);
    assert.equal(pathHasNulByte("/health"), false);
    assert.equal(pathHasNulByte(""), false);
  });

  await t.test("`%2500` 解出來是字面的 `%00`，是合法文字", () => {
    assert.equal(pathHasNulByte("/materials/%2500"), false);
  });

  await t.test("壞掉的 percent-encoding 不由這一層負責（Express 已回 400）", () => {
    assert.equal(pathHasNulByte("/materials/100%"), false);
    assert.equal(pathHasNulByte("/materials/%C0%80"), false);
  });
});

test("rejectNulBytePathParams middleware", async (t) => {
  await t.test("含 NUL 時回 400，且不呼叫 next()", () => {
    const res = fakeRes();
    let nextCalled = false;
    rejectNulBytePathParams({ path: "/materials/%00" }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false, "非法輸入不得繼續往 handler 走");
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid_path_parameter");
  });

  await t.test("回應不得洩漏 PG 錯誤碼 / SQL / stack / 檔案路徑", () => {
    const res = fakeRes();
    rejectNulBytePathParams({ path: "/materials/%00" }, res, () => {});
    const serialized = JSON.stringify(res.body);
    for (const leak of ["22021", "invalid byte sequence", "SELECT", "at ", "\\", "/Backend/"]) {
      assert.ok(!serialized.includes(leak), `回應不得包含 ${JSON.stringify(leak)}：${serialized}`);
    }
  });

  await t.test("合法 path 直接放行", () => {
    const res = fakeRes();
    let nextCalled = false;
    rejectNulBytePathParams({ path: "/materials/mat_detail_seed_1" }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null, "放行時不得寫入任何回應");
  });
});
