/**
 * 終端錯誤回應的單元測試（`COR-07`）。
 *
 *   node --test tests/errorResponses.test.js
 *   npm run test:unit --prefix Backend      （已含本檔）
 *
 * 這裡測的是 handler 的分支與**回應內容不得外洩什麼**；
 * 實際的 HTTP 行為（壞掉的 percent-encoding → 400 JSON）由
 * `scripts/api-smoke-test.js` 對真的跑起來的 server 驗。
 *
 * 要鎖住的事：
 *   1. 壞掉的請求（`URIError` / JSON parse 失敗）→ 400，且是 JSON
 *   2. 其他任何錯誤 → 維持既有的 generic 500 契約（**不得**全部變成 400）
 *   3. 回應不得帶 stack、絕對路徑、`node_modules`、套件名或 `err.message`
 *   4. headers 已送出時不得二次寫入（檔案串流到一半失敗）
 *   5. 未比對到 route → 404 JSON，而不是 Express 的 HTML
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { notFoundJson, jsonErrorHandler, isMalformedRequest } = require("../middlewares/errorResponses");

function fakeRes({ headersSent = false } = {}) {
  const res = { statusCode: null, body: null, headersSent };
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

const fakeReq = { method: "GET", originalUrl: "/materials/100%" };

/** 這些字串永遠不得出現在回應裡。 */
function assertNoLeak(body) {
  const serialized = JSON.stringify(body ?? "");
  for (const leak of [
    "URIError",
    "SyntaxError",
    "node_modules",
    "teaching-platform",
    "path-to-regexp",
    ".js:",
    "    at ",
    "SELECT",
    "22021",
  ]) {
    assert.ok(!serialized.includes(leak), `回應不得包含 ${JSON.stringify(leak)}：${serialized}`);
  }
}

test("isMalformedRequest", async (t) => {
  await t.test("URIError（router 解不開 percent-encoding）算壞掉的請求", () => {
    assert.equal(isMalformedRequest(new URIError("Failed to decode param '100%'")), true);
  });

  await t.test("express.json() 的 parse 失敗算壞掉的請求", () => {
    const err = new SyntaxError("Unexpected token b in JSON at position 1");
    err.type = "entity.parse.failed";
    err.status = 400;
    assert.equal(isMalformedRequest(err), true);
  });

  await t.test("**其他錯誤一律不是** —— 不得變成「所有 Error 都回 400」", () => {
    assert.equal(isMalformedRequest(new Error("boom")), false);
    assert.equal(isMalformedRequest(new TypeError("bad")), false);
    // 光是帶著 status 400 還不夠：必須是可辨識的 parse 失敗
    const vague = new Error("something");
    vague.status = 400;
    assert.equal(isMalformedRequest(vague), false);
    assert.equal(isMalformedRequest(null), false);
    assert.equal(isMalformedRequest(undefined), false);
  });
});

test("jsonErrorHandler", async (t) => {
  await t.test("壞掉的請求 → 400 JSON，且不洩漏任何內部細節", () => {
    const res = fakeRes();
    jsonErrorHandler(new URIError("Failed to decode param '100%'"), fakeReq, res, () => {
      throw new Error("next() 不該被呼叫");
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid_request");
    assertNoLeak(res.body);
  });

  await t.test("未知錯誤 → 維持既有 generic 500 契約", () => {
    const boom = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    boom.stack = "Error: connect ECONNREFUSED\n    at C:\\teaching-platform\\Backend\\db.js:1:1";
    const res = fakeRes();
    jsonErrorHandler(boom, fakeReq, res, () => {
      throw new Error("next() 不該被呼叫");
    });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "server error" });
    assertNoLeak(res.body);
  });

  await t.test("headers 已送出時交還 Express，不得二次寫入", () => {
    const res = fakeRes({ headersSent: true });
    let delegated = false;
    jsonErrorHandler(new Error("stream died"), fakeReq, res, () => {
      delegated = true;
    });
    assert.equal(delegated, true, "應交回 Express 預設行為");
    assert.equal(res.statusCode, null, "不得再寫任何回應");
  });
});

test("notFoundJson", async (t) => {
  await t.test("未比對到 route → 404 JSON，而不是 Express 的 HTML", () => {
    const res = fakeRes();
    notFoundJson({ method: "GET", originalUrl: "/no-such-route" }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "not_found");
    assertNoLeak(res.body);
  });

  await t.test("回應不得回放使用者提供的路徑（避免反射式輸出）", () => {
    const res = fakeRes();
    notFoundJson({ method: "GET", originalUrl: "/<script>alert(1)</script>" }, res);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes("script"), `不得回放請求路徑：${serialized}`);
  });
});
