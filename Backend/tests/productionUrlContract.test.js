/**
 * `PRE-12` —— production 設定的 fail-closed 契約。
 *
 * 這支測試證明的是「**缺漏或打錯設定時，process 起不來**」。
 * 它不需要資料庫、不需要網路，也不碰 production。
 *
 * 每個案例都自行注入 `process.env` 並在結束後還原 —— 測試之間不得互相污染，
 * 否則「哪一個案例讓下一個變綠」會變成無法回答的問題。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const contract = require("../config/productionUrlContract");

const TOUCHED = [
  "NODE_ENV",
  "PUBLIC_BACKEND_URL",
  "API_PUBLIC_URL",
  "PUBLIC_WEB_URL",
  "FRONTEND_URL",
  "APP_BASE_URL",
  "JWT_EXPIRES_IN",
];

/** 在乾淨的環境下跑 fn，結束後還原（無論成功或丟例外）。 */
function withEnv(overrides, fn) {
  const saved = {};
  for (const k of TOUCHED) saved[k] = process.env[k];
  for (const k of TOUCHED) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const PROD_BACKEND = "https://teaching-platform-backend.onrender.com";
const PROD_WEB = "https://teaching-platform-web.onrender.com";

/* -------------------------------------------------------------------------- */
/* PUBLIC_BACKEND_URL                                                          */
/* -------------------------------------------------------------------------- */

test("production: 合法的 backend URL 通過", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: PROD_BACKEND, PUBLIC_WEB_URL: PROD_WEB }, () => {
    const r = contract.assertProductionConfigContract();
    assert.equal(r.production, true);
    assert.ok(r.checked.includes("PUBLIC_BACKEND_URL"));
  });
});

test("production: PUBLIC_BACKEND_URL 未設 → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_WEB_URL: PROD_WEB }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /PUBLIC_BACKEND_URL is not set/);
  });
});

test("production: PUBLIC_BACKEND_URL 空白 → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: "   ", PUBLIC_WEB_URL: PROD_WEB }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /PUBLIC_BACKEND_URL is not set/);
  });
});

test("production: PUBLIC_BACKEND_URL 指向 localhost → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: "http://localhost:3000", PUBLIC_WEB_URL: PROD_WEB }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /loopback host/);
  });
});

test("production: 127.0.0.1 與 ::1 同樣被視為 loopback", () => {
  for (const bad of ["http://127.0.0.1:3000", "http://[::1]:3000"]) {
    withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: bad, PUBLIC_WEB_URL: PROD_WEB }, () => {
      assert.throws(() => contract.assertProductionConfigContract(), /loopback host/);
    });
  }
});

test("production: 非 URL 的垃圾字串 → 拒絕啟動（非空不等於合法）", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: "not a url", PUBLIC_WEB_URL: PROD_WEB }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /not a valid absolute URL/);
  });
});

test("production: 非 http/https scheme → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: "ftp://example.com", PUBLIC_WEB_URL: PROD_WEB }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /must use http: or https:/);
  });
});

test("production: 已載明的別名 API_PUBLIC_URL 可單獨滿足契約", () => {
  withEnv({ NODE_ENV: "production", API_PUBLIC_URL: PROD_BACKEND, PUBLIC_WEB_URL: PROD_WEB }, () => {
    const r = contract.assertProductionConfigContract();
    assert.ok(r.checked.includes("API_PUBLIC_URL"));
  });
});

/* -------------------------------------------------------------------------- */
/* PUBLIC_WEB_URL —— Owner decision：production fail-closed，不是警告            */
/* -------------------------------------------------------------------------- */

test("production: PUBLIC_WEB_URL 未設 → 拒絕啟動（不是警告）", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: PROD_BACKEND }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /PUBLIC_WEB_URL is not set/);
  });
});

test("production: PUBLIC_WEB_URL 空白 → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: PROD_BACKEND, PUBLIC_WEB_URL: "  " }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /PUBLIC_WEB_URL is not set/);
  });
});

test("production: PUBLIC_WEB_URL 指向 localhost → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: PROD_BACKEND, PUBLIC_WEB_URL: "http://localhost:3001" }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /loopback host/);
  });
});

test("production: 已載明的別名 FRONTEND_URL / APP_BASE_URL 可單獨滿足契約", () => {
  for (const alias of ["FRONTEND_URL", "APP_BASE_URL"]) {
    withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: PROD_BACKEND, [alias]: PROD_WEB }, () => {
      const r = contract.assertProductionConfigContract();
      assert.ok(r.checked.includes(alias));
    });
  }
});

/* -------------------------------------------------------------------------- */
/* JWT_EXPIRES_IN —— 格式在啟動時驗證，所有環境                                  */
/* -------------------------------------------------------------------------- */

test("JWT_EXPIRES_IN 合法值通過", () => {
  for (const good of ["7d", "1h", "30m", "60"]) {
    withEnv({ JWT_EXPIRES_IN: good }, () => {
      assert.doesNotThrow(() => contract.assertJwtExpiresIn());
    });
  }
});

test("JWT_EXPIRES_IN 未設 → 通過（沿用已載明的預設 7d，不自行發明新預設）", () => {
  withEnv({}, () => {
    const r = contract.assertJwtExpiresIn();
    assert.equal(r.configured, false);
  });
});

test('JWT_EXPIRES_IN = "abc" → 啟動即失敗（不再等到第一次登入）', () => {
  withEnv({ JWT_EXPIRES_IN: "abc" }, () => {
    assert.throws(() => contract.assertJwtExpiresIn(), /not a valid duration/);
  });
});

test('JWT_EXPIRES_IN = "7dd" → 啟動即失敗', () => {
  withEnv({ JWT_EXPIRES_IN: "7dd" }, () => {
    assert.throws(() => contract.assertJwtExpiresIn(), /not a valid duration/);
  });
});

test("JWT_EXPIRES_IN 設了但空白 → 失敗（設了卻留空是設定錯誤，不是想用預設）", () => {
  withEnv({ JWT_EXPIRES_IN: "   " }, () => {
    assert.throws(() => contract.assertJwtExpiresIn(), /set but blank/);
  });
});

test("JWT_EXPIRES_IN 格式檢查在非 production 也會執行", () => {
  withEnv({ NODE_ENV: "development", JWT_EXPIRES_IN: "abc" }, () => {
    assert.throws(() => contract.assertProductionConfigContract(), /not a valid duration/);
  });
});

/* -------------------------------------------------------------------------- */
/* 本機開發不得被這條契約擋住                                                    */
/* -------------------------------------------------------------------------- */

test("development: 三個 URL 全未設仍可啟動（localhost 回退維持）", () => {
  withEnv({ NODE_ENV: "development" }, () => {
    const r = contract.assertProductionConfigContract();
    assert.equal(r.production, false);
  });
});

test("NODE_ENV 未設時視為非 production", () => {
  withEnv({}, () => {
    assert.equal(contract.isProduction(), false);
    assert.doesNotThrow(() => contract.assertProductionConfigContract());
  });
});

test("test 環境同樣不受 production URL 契約約束", () => {
  withEnv({ NODE_ENV: "test" }, () => {
    assert.doesNotThrow(() => contract.assertProductionConfigContract());
  });
});

/* -------------------------------------------------------------------------- */
/* Render 現行主機名必須通過 —— PRE-10（自訂網域）仍未解除                        */
/* -------------------------------------------------------------------------- */

test("Render 配發的 *.onrender.com 主機名不得被誤擋（PRE-10 仍 blocked）", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_BACKEND_URL: PROD_BACKEND, PUBLIC_WEB_URL: PROD_WEB }, () => {
    assert.doesNotThrow(() => contract.assertProductionConfigContract());
  });
});

/* -------------------------------------------------------------------------- */
/* 既有 fail-closed 未被放寬（PRE-12 criterion 6）                              */
/* -------------------------------------------------------------------------- */

test("JWT_SECRET 的既有 fail-closed 仍然存在且未被本輪改動", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../utils/jwt.js"), "utf8");
  assert.match(src, /JWT_SECRET is not set \(or is blank\)\. Refusing to start\./);
  assert.match(src, /is a well-known placeholder value/);
  assert.match(src, /is shorter than \$\{MIN_JWT_SECRET_LENGTH\} characters/);
});

test("私有儲存的 production fail-closed 仍然存在", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "../config/privateFileStorage.js"), "utf8");
  assert.match(src, /NODE_ENV/);
  assert.match(src, /ALLOW_LOCAL_IN_PRODUCTION/);
});

/* -------------------------------------------------------------------------- */
/* Frontend API_BASE_URL —— source contract scan                               */
/*                                                                            */
/* web app **沒有 unit test runner**（只有 lint / typecheck / build ＋ Playwright  */
/* e2e），因此這裡用 source scan 釘住契約：五個各自回退 localhost 的寫法不得復活。  */
/* helper 的型別正確性由 `npm run verify:web` 的 typecheck ＋ build 覆蓋。          */
/* -------------------------------------------------------------------------- */

const fsx = require("fs");
const pathx = require("path");
const WEB = pathx.join(__dirname, "../../frontend/apps/web");

const MIGRATED_CALL_SITES = [
  "app/api/auth/login/route.ts",
  "app/api/auth/register/route.ts",
  "app/api/backend/[...path]/route.ts",
  "app/materials/[id]/page.tsx",
  "components/legal/LegalDocumentPage.tsx",
];

test("frontend: 共用 accessor 存在且在 production fail closed", () => {
  const src = fsx.readFileSync(pathx.join(WEB, "lib/server-api-base-url.ts"), "utf8");
  assert.match(src, /NODE_ENV/, "必須以 NODE_ENV 判斷 production");
  assert.match(src, /API_BASE_URL is not set/, "缺漏時必須明確 throw");
  assert.match(src, /loopback host/, "production 不得接受 loopback 目的地");
  assert.match(src, /http:\/\/localhost:3000/, "development 仍保留 localhost 回退");
});

test("frontend: 五個呼叫點都不得再自行回退 localhost", () => {
  const raw = /process\.env\.API_BASE_URL\s*\?\?\s*["'`]http:\/\/localhost/;
  for (const rel of MIGRATED_CALL_SITES) {
    const src = fsx.readFileSync(pathx.join(WEB, rel), "utf8");
    assert.doesNotMatch(src, raw, `${rel} 仍有原始 localhost 回退`);
    assert.match(src, /getServerApiBaseUrl/, `${rel} 未改用共用 accessor`);
  }
});

test("frontend: app/ 與 components/ 內不得出現新的原始 API_BASE_URL localhost 回退", () => {
  const raw = /process\.env\.API_BASE_URL\s*\?\?\s*["'`]http:\/\/localhost/;
  const offenders = [];
  const walk = (dir) => {
    for (const e of fsx.readdirSync(dir, { withFileTypes: true })) {
      const p = pathx.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        // 共用 accessor 本身是這個回退的**唯一合法所在**（且其註解引用了舊寫法）。
        const rel = pathx.relative(WEB, p).replace(/\\/g, "/");
        if (rel === "lib/server-api-base-url.ts") continue;
        if (raw.test(fsx.readFileSync(p, "utf8"))) offenders.push(rel);
      }
    }
  };
  for (const d of ["app", "components", "lib"]) walk(pathx.join(WEB, d));
  assert.deepEqual(offenders, [], `這些檔案重新引入了靜默的 localhost 回退：${offenders.join(", ")}`);
});
