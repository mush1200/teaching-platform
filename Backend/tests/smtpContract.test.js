/**
 * `REL-03` —— production 的**條件式** SMTP 設定契約。
 *
 * 核心不變條件，兩條都必須成立：
 *   1. **零 SMTP 設定的 production 仍然可以啟動**（`DEC-17`／`render.yaml` 的現況）
 *   2. **半套或格式錯誤的 SMTP 設定必須拒絕啟動**（那是部署錯誤）
 *
 * 全部使用合成值。**不連線、不寄信、不碰資料庫。**
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const smtp = require("../config/smtpContract");

const TOUCHED = ["NODE_ENV", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_TEST_TO"];

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

/** 合成的完整設定。**沒有任何真實憑證或真實網域。** */
const FULL = {
  NODE_ENV: "production",
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "465",
  SMTP_USER: "synthetic-user",
  SMTP_PASS: "synthetic-password-not-real",
  SMTP_FROM: "no-reply@example.test",
};

/* -------------------------------------------------------------------------- */
/* 1. DEC-17：零 SMTP 設定的 production 必須仍能啟動                            */
/* -------------------------------------------------------------------------- */

test("production + 五個 SMTP 變數全部不存在 → 允許啟動（DEC-17 現況不得被破壞）", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    const r = smtp.assertProductionSmtpContract();
    assert.equal(r.production, true);
    assert.equal(r.engaged, false);
  });
});

test("SMTP_TEST_TO 是 test-only，不得使 production 進入已啟用狀態", () => {
  withEnv({ NODE_ENV: "production", SMTP_TEST_TO: "someone@example.test" }, () => {
    const r = smtp.assertProductionSmtpContract();
    assert.equal(r.engaged, false, "SMTP_TEST_TO 不在啟用集合內");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 半套設定必須失敗                                                          */
/* -------------------------------------------------------------------------- */

for (const only of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
  test(`production + 只設 ${only} → 拒絕啟動`, () => {
    withEnv({ NODE_ENV: "production", [only]: only === "SMTP_FROM" ? "a@example.test" : "x" }, () => {
      assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP configuration is incomplete or invalid/);
    });
  });
}

test("production + 只設 SMTP_PORT → 拒絕啟動（PORT 本身也會啟用契約）", () => {
  withEnv({ NODE_ENV: "production", SMTP_PORT: "587" }, () => {
    assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_HOST is missing or blank/);
  });
});

test("production + HOST/USER/PASS 齊但缺 SMTP_FROM → 拒絕啟動（不得回退 SMTP_USER）", () => {
  withEnv({ ...FULL, SMTP_FROM: undefined }, () => {
    assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_FROM is missing or blank/);
  });
});

test("production + 混合的不完整組合 → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", SMTP_HOST: "smtp.example.test", SMTP_FROM: "a@example.test" }, () => {
    assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_USER is missing or blank/);
  });
});

test("空白值會啟用契約並失敗（設了卻留空 ＝ 設定錯誤，不是無意啟用）", () => {
  withEnv({ NODE_ENV: "production", SMTP_PASS: "   " }, () => {
    const r = smtp.isSmtpEngaged();
    assert.equal(r, true, "空白仍算存在");
    assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_PASS is missing or blank/);
  });
});

test("SMTP_PASS 空白 → 失敗", () => {
  withEnv({ ...FULL, SMTP_PASS: "" }, () => {
    assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_PASS is missing or blank/);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 完整設定通過                                                              */
/* -------------------------------------------------------------------------- */

test("production + 完整合成設定 → 通過", () => {
  withEnv(FULL, () => {
    const r = smtp.assertProductionSmtpContract();
    assert.equal(r.engaged, true);
    assert.ok(r.checked.includes("SMTP_HOST"));
  });
});

test("SMTP_PORT 省略時沿用既有預設 587，其餘齊備即通過", () => {
  withEnv({ ...FULL, SMTP_PORT: undefined }, () => {
    assert.doesNotThrow(() => smtp.assertProductionSmtpContract());
  });
  assert.equal(smtp.DEFAULT_SMTP_PORT, 587);
});

/* -------------------------------------------------------------------------- */
/* 4. SMTP_PORT 格式                                                            */
/* -------------------------------------------------------------------------- */

for (const good of ["587", "465", "25", "1", "65535"]) {
  test(`SMTP_PORT ${good} → 通過`, () => {
    withEnv({ ...FULL, SMTP_PORT: good }, () => {
      assert.doesNotThrow(() => smtp.assertProductionSmtpContract());
    });
  });
}

for (const bad of ["abc", "", "   ", "0", "65536", "587.5", "-1", "5e2", "587abc", "NaN"]) {
  test(`SMTP_PORT ${JSON.stringify(bad)} → 拒絕啟動`, () => {
    withEnv({ ...FULL, SMTP_PORT: bad }, () => {
      assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_PORT/);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* 5. SMTP_FROM 格式                                                            */
/* -------------------------------------------------------------------------- */

for (const good of ["no-reply@example.test", "Teaching Platform <no-reply@example.test>", "a.b+c@sub.example.test"]) {
  test(`SMTP_FROM ${JSON.stringify(good)} → 通過`, () => {
    withEnv({ ...FULL, SMTP_FROM: good }, () => {
      assert.doesNotThrow(() => smtp.assertProductionSmtpContract());
    });
  });
}

for (const bad of ["resend", "", "   ", "no-reply", "@example.test", "a@b", "a@@b.test", "two words@example.test"]) {
  test(`SMTP_FROM ${JSON.stringify(bad)} → 拒絕啟動`, () => {
    withEnv({ ...FULL, SMTP_FROM: bad }, () => {
      assert.throws(() => smtp.assertProductionSmtpContract(), /SMTP_FROM/);
    });
  });
}

test('已知的實際壞值 "resend"（舊行為回退 SMTP_USER 的結果）被明確擋下', () => {
  assert.equal(smtp.isValidSenderAddress("resend"), false);
});

/* -------------------------------------------------------------------------- */
/* 6. 本機開發不得被這條契約擋住                                                 */
/* -------------------------------------------------------------------------- */

test("development：SMTP 全未設 → 通過", () => {
  withEnv({ NODE_ENV: "development" }, () => {
    const r = smtp.assertProductionSmtpContract();
    assert.equal(r.production, false);
  });
});

test("development：半套 SMTP 設定不受本契約約束（維持既有本機行為）", () => {
  withEnv({ NODE_ENV: "development", SMTP_HOST: "smtp.example.test" }, () => {
    assert.doesNotThrow(() => smtp.assertProductionSmtpContract());
  });
});

test("NODE_ENV 未設時視為非 production", () => {
  withEnv({ SMTP_HOST: "smtp.example.test" }, () => {
    assert.doesNotThrow(() => smtp.assertProductionSmtpContract());
  });
});

/* -------------------------------------------------------------------------- */
/* 7. 錯誤訊息不得洩漏值                                                        */
/* -------------------------------------------------------------------------- */

test("錯誤訊息只提變數名稱，不含 SMTP_PASS 的值", () => {
  const secret = "super-secret-synthetic-value-9876";
  withEnv({ NODE_ENV: "production", SMTP_PASS: secret }, () => {
    try {
      smtp.assertProductionSmtpContract();
      assert.fail("應該要 throw");
    } catch (err) {
      assert.ok(!err.message.includes(secret), "錯誤訊息不得包含 SMTP_PASS 的值");
      assert.match(err.message, /SMTP_PASS/, "但仍要指出是哪個變數");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 8. REL-02 的邊界未被改動                                                     */
/* -------------------------------------------------------------------------- */

test("REL-02：best-effort rejection 邊界仍在，且啟動契約不碰它", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../utils/bestEffortDispatch.js"), "utf8");
  assert.match(src, /Promise\.resolve\(\)/);
  assert.match(src, /\.then\(task\)/);
  assert.match(src, /\.catch\(/);
  assert.match(src, /永遠不 throw/);

  // 契約模組本身不得連線、不得建立 transport、不得寄信。
  const contractSrc = fs.readFileSync(path.join(__dirname, "../config/smtpContract.js"), "utf8");
  assert.doesNotMatch(contractSrc, /require\(["']nodemailer["']\)/, "不得引入 nodemailer");
  assert.doesNotMatch(contractSrc, /createTransport|sendMail|\.verify\(/, "不得建立 transport 或寄信");
});

test("emailService.js 的延遲建立與 REL-02 dispatch 仍然存在（未被本輪改動）", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../services/emailService.js"), "utf8");
  assert.match(src, /let cachedTransporter = null;/);
  assert.match(src, /SMTP env missing/);
});

test("未引入 EMAIL_ENABLED / MAIL_DISABLED 之類的 feature flag", () => {
  const fs = require("fs");
  const path = require("path");
  // 判準是「有沒有**讀取**這種變數」，不是「有沒有提到它的名字」——
  // 契約模組的註解正是為了說明「刻意不引入」而必須提到它們。
  const reads = /process\.env(\.|\[["'])\s*(EMAIL_ENABLED|MAIL_ENABLED|MAIL_DISABLED|DISABLE_EMAIL|SMTP_DISABLED)/;
  for (const rel of ["../config/smtpContract.js", "../index.js", "../services/emailService.js"]) {
    const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
    assert.doesNotMatch(src, reads, `${rel} 不得讀取郵件開關變數`);
  }
});
