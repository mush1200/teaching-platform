/**
 * `OPS-02` —— 帳號凍結的 **standardized reason taxonomy** 與 Admin route 契約。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * 既有的 `accountFreeze.db.test.js` 鎖的是「凍結會不會擋住寫入」，本檔補的是
 * **「凍結的理由能不能被稽核」** —— `DEC-LEGAL-10` 的第 3 條。
 *
 * 這裡掛**真正的 router**（含真正的 `requireAuth` / `requireRole("admin")`），
 * 因為要證明的正是「backend 自己會擋」，而不是「前端的下拉選單只給合法選項」。
 * 只驗 UI 等於沒驗 —— taxonomy 若只存在於前端，任何人直打 API 都能繞過。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");

require("dotenv").config({ quiet: true });

const EXPECTED_DB = "teaching_platform_security_test";
if (process.env.PGDATABASE !== EXPECTED_DB) {
  process.env.PGDATABASE = EXPECTED_DB;
}

const db = require("../config/db");
const { FREEZE_REASONS, validateFreezeRequest } = require("../utils/accountFreezePolicy");

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = [];

async function makeUser(role = "buyer") {
  const id = `usr_ops2_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.push(id);
  return id;
}

function tokenFor(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

function mount() {
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/admin"));
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function call(base, adminId, path, body) {
  return fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenFor(adminId, "admin")}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test.after(async () => {
  try {
    if (created.length) {
      await db.query(`DELETE FROM activity_logs WHERE target_type = 'user' AND target_id = ANY($1)`, [created]);
      await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [created]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

// ---------------------------------------------------------------------------
// Taxonomy（pure）
// ---------------------------------------------------------------------------

test("taxonomy: 有限的 allowlist，且不含法律認定用語", () => {
  assert.deepEqual(FREEZE_REASONS, [
    "suspected_fraud",
    "payment_abuse",
    "account_security",
    "content_policy",
    "repeated_misuse",
    "manual_review",
    "other",
  ]);
  const { FREEZE_REASON_LABEL } = require("../utils/accountFreezePolicy");
  for (const code of FREEZE_REASONS) {
    const label = FREEZE_REASON_LABEL[code];
    assert.ok(label, `${code} 缺少中文標籤`);
    // 平台凍結是營運處置，不是法律判決 —— 標籤不得寫成已認定的違法／犯罪。
    for (const forbidden of ["違法", "犯罪", "詐欺成立", "有罪"]) {
      assert.equal(label.includes(forbidden), false, `${code} 的標籤不得使用法律認定用語：${forbidden}`);
    }
  }
});

test("validateFreezeRequest: 缺代碼／未知代碼／other 缺說明一律拒絕", () => {
  assert.equal(validateFreezeRequest({}).code, "reason_required");
  assert.equal(validateFreezeRequest({ reasonCode: "" }).code, "reason_required");
  assert.equal(validateFreezeRequest({ reasonCode: "made_up" }).code, "invalid_reason_code");
  assert.equal(validateFreezeRequest({ reasonCode: "other" }).code, "note_required");
  assert.equal(validateFreezeRequest({ reasonCode: "other", note: "   " }).code, "note_required");
  assert.equal(validateFreezeRequest({ reasonCode: "manual_review" }).valid, true);
  assert.equal(validateFreezeRequest({ reasonCode: "other", note: "個案說明" }).valid, true);
  assert.equal(validateFreezeRequest({ reasonCode: "manual_review", note: "x".repeat(501) }).code, "note_too_long");
});

// ---------------------------------------------------------------------------
// Route 契約
// ---------------------------------------------------------------------------

test("freeze: 合法代碼被接受，狀態與稽核（code + note + actor + target）齊備", async () => {
  const admin = await makeUser("admin");
  const target = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    const res = await call(base, admin, `/admin/users/${target}/freeze`, {
      reasonCode: "suspected_fraud",
      note: "多筆訂單使用同一組末四碼",
    });
    assert.equal(res.status, 200);

    const { rows } = await db.query(
      `SELECT account_status, frozen_at, frozen_by, freeze_reason FROM users WHERE id = $1`,
      [target]
    );
    assert.equal(rows[0].account_status, "frozen");
    assert.ok(rows[0].frozen_at);
    assert.equal(rows[0].frozen_by, admin);
    // 人類可讀欄位維持可讀（向後相容），且帶上補充說明。
    assert.match(rows[0].freeze_reason, /疑似詐欺行為，待查證/);
    assert.match(rows[0].freeze_reason, /多筆訂單/);

    const log = await db.query(
      `SELECT actor_id, target_id, meta FROM activity_logs
        WHERE target_type = 'user' AND target_id = $1 AND action = 'account.frozen'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [target]
    );
    assert.equal(log.rows.length, 1);
    const meta = typeof log.rows[0].meta === "string" ? JSON.parse(log.rows[0].meta) : log.rows[0].meta;
    assert.equal(log.rows[0].actor_id, admin, "who");
    assert.equal(log.rows[0].target_id, target, "target");
    assert.equal(meta.reasonCode, "suspected_fraud", "standardized reason code");
    assert.equal(meta.note, "多筆訂單使用同一組末四碼", "note");
    // 稽核不得寫入法律判定。
    for (const forbidden of ["verdict", "legalFinding", "guilt"]) {
      assert.equal(forbidden in meta, false);
    }
  } finally {
    await close();
  }
});

test("freeze: 未知代碼、缺代碼、other 缺說明 → 400，且帳號不變", async () => {
  const admin = await makeUser("admin");
  const target = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    for (const [body, expected] of [
      [{}, "reason_required"],
      [{ reason: "自由文字" }, "reason_required"], // 舊的自由文字欄位不再被接受
      [{ reasonCode: "totally_made_up" }, "invalid_reason_code"],
      [{ reasonCode: "other" }, "note_required"],
    ]) {
      const res = await call(base, admin, `/admin/users/${target}/freeze`, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal((await res.json()).code, expected, JSON.stringify(body));
    }
    const { rows } = await db.query(`SELECT account_status FROM users WHERE id = $1`, [target]);
    assert.equal(rows[0].account_status, "active", "驗證失敗不得留下 partial write");
  } finally {
    await close();
  }
});

test("guardrails: 不得凍結自己、不得凍結 admin —— backend 自己擋", async () => {
  const admin = await makeUser("admin");
  const otherAdmin = await makeUser("admin");
  const { base, close } = await mount();
  try {
    const self = await call(base, admin, `/admin/users/${admin}/freeze`, { reasonCode: "manual_review" });
    assert.equal(self.status, 400);
    assert.equal((await self.json()).code, "cannot_freeze_self");

    const adminTarget = await call(base, admin, `/admin/users/${otherAdmin}/freeze`, {
      reasonCode: "manual_review",
    });
    assert.equal(adminTarget.status, 400);
    assert.equal((await adminTarget.json()).code, "cannot_freeze_admin");
  } finally {
    await close();
  }
});

test("unfreeze: 單一 admin 即可解除，且凍結歷史完整保留", async () => {
  const admin = await makeUser("admin");
  const target = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    await call(base, admin, `/admin/users/${target}/freeze`, { reasonCode: "account_security" });
    const res = await call(base, admin, `/admin/users/${target}/unfreeze`, {});
    assert.equal(res.status, 200);

    const { rows } = await db.query(
      `SELECT account_status, frozen_at, frozen_by, freeze_reason, unfrozen_at, unfrozen_by
         FROM users WHERE id = $1`,
      [target]
    );
    assert.equal(rows[0].account_status, "active");
    // **解凍不得抹掉「曾經被凍結過」**。
    assert.ok(rows[0].frozen_at, "frozen_at 必須保留");
    assert.equal(rows[0].frozen_by, admin, "frozen_by 必須保留");
    assert.ok(rows[0].freeze_reason, "freeze_reason 必須保留");
    assert.ok(rows[0].unfrozen_at);
    assert.equal(rows[0].unfrozen_by, admin);

    const log = await db.query(
      `SELECT COUNT(*)::int n FROM activity_logs
        WHERE target_type = 'user' AND target_id = $1 AND action = 'account.unfrozen'`,
      [target]
    );
    assert.equal(log.rows[0].n, 1);
  } finally {
    await close();
  }
});

test("account-status: 面板讀取端回傳狀態、選項與 guardrail 旗標", async () => {
  const admin = await makeUser("admin");
  const target = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    const before = await call(base, admin, `/admin/users/${target}/account-status`);
    assert.equal(before.status, 200);
    const b = await before.json();
    assert.equal(b.user.accountStatus, "active");
    assert.equal(b.canFreeze, true);
    assert.deepEqual(
      b.reasonOptions.map((o) => o.code),
      FREEZE_REASONS,
      "選項必須由 backend 提供，前後端不各維護一份"
    );
    // 個資最小化：只吐面板需要的欄位。
    assert.equal("password_hash" in b.user, false);

    await call(base, admin, `/admin/users/${target}/freeze`, {
      reasonCode: "content_policy",
      note: "重複上架侵權素材",
    });
    const after = await (await call(base, admin, `/admin/users/${target}/account-status`)).json();
    assert.equal(after.user.accountStatus, "frozen");
    assert.equal(after.user.currentReasonCode, "content_policy");
    assert.equal(after.user.currentNote, "重複上架侵權素材");

    // admin 目標與自己一律 canFreeze=false（UI 據此 disable；backend 仍會再擋）。
    const selfView = await (await call(base, admin, `/admin/users/${admin}/account-status`)).json();
    assert.equal(selfView.canFreeze, false);
  } finally {
    await close();
  }
});

test("歷史自由文字資料不被假裝成 taxonomy", async () => {
  const admin = await makeUser("admin");
  const target = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    // 模擬 taxonomy 上線前的凍結：只有自由文字，沒有 reasonCode。
    await db.query(
      `UPDATE users SET account_status='frozen', frozen_at=NOW(), frozen_by=$2, freeze_reason='舊的自由文字理由'
        WHERE id = $1`,
      [target, admin]
    );
    const view = await (await call(base, admin, `/admin/users/${target}/account-status`)).json();
    assert.equal(view.user.accountStatus, "frozen");
    assert.equal(view.user.freezeReason, "舊的自由文字理由", "歷史文字必須仍可讀");
    assert.equal(view.user.currentReasonCode, null, "沒有 code 就是 null —— 不得回填成 other");
  } finally {
    await close();
  }
});

test("凍結中的帳號仍可提出申訴（`BUY-02` invariant 未被 OPS-02 破壞）", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "complaints.js"), "utf8");
  // 註解裡會提到這個名字；這裡要求的是**沒有實際掛載**。
  assert.equal(
    /^\s*(?!\s*\*).*requireActiveAccount\s*[,)]/m.test(src),
    false,
    "complaints 不得套用 requireActiveAccount —— 凍結帳號必須仍能申訴"
  );

  const { requireActiveAccount } = require("../middlewares/accountStatus");
  const admin = await makeUser("admin");
  const target = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    await call(base, admin, `/admin/users/${target}/freeze`, { reasonCode: "manual_review" });
    // 受保護的寫入仍必須被擋（凍結真的有效）。
    const blocked = await new Promise((resolve) => {
      const req = { user: { userId: target } };
      const res = { status: (c) => ({ json: () => resolve(c) }) };
      requireActiveAccount(req, res, () => resolve("next"));
    });
    assert.equal(blocked, 403, "凍結必須擋住受保護的寫入");
  } finally {
    await close();
  }
});
