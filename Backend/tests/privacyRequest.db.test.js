/**
 * `OPS-04` —— 個資權利請求（Privacy Rights Request）的內部受理／追蹤。
 *
 * Owner decision `DEC-LEGAL-13`（2026-08-28）。只針對 **security / integration
 * 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 這一支鎖的是什麼
 *
 *   1. **domain 分離** —— privacy request 與 consumer complaint 是兩個 domain：
 *      不同的 table、不同的 route namespace、不同的狀態值。
 *      建立個資請求**不得**產生任何 complaint 列。
 *   2. **沒有法定期限** —— 本 domain 不得有任何 deadline / SLA 欄位，
 *      也不得重用申訴的 `statutory_due_at`。
 *   3. **沒有身分驗證法律標準** —— 不得有 `identity_verified` 這類欄位或狀態。
 *   4. **deletion 請求不刪任何東西** —— 只記錄請求；`SCHEMA-02` / `O-22` 仍 blocked。
 *   5. **狀態機 ＋ 事件流 ＋ 稽核**如實運作。
 *   6. **消費申訴行為完全未變**（含凍結帳號仍可申訴的 `BUY-02` invariant）。
 *
 * 掛**真正的 router**：授權與驗證若只存在於前端，直打 API 就能繞過。
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
const policy = require("../utils/privacyRequestPolicy");

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const createdUsers = [];
const createdRequests = [];

async function makeUser(role = "admin") {
  const id = `usr_pr_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  createdUsers.push(id);
  return id;
}

function tokenFor(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

function mount() {
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/adminPrivacyRequests"));
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

async function call(base, userId, role, method, path, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenFor(userId, role)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const VALID_CREATE = {
  requestType: "access",
  requesterReference: "requester@example.test",
  summary: "使用者來信要求查閱其帳號資料",
  receivedAt: "2026-08-27T02:00:00.000Z",
};

test.after(async () => {
  try {
    if (createdRequests.length) {
      await db.query(`DELETE FROM activity_logs WHERE target_type = 'privacy_request' AND target_id = ANY($1)`, [
        createdRequests,
      ]);
      await db.query(`DELETE FROM privacy_requests WHERE id = ANY($1)`, [createdRequests]);
    }
    if (createdUsers.length) {
      await db.query(`DELETE FROM activity_logs WHERE actor_id = ANY($1)`, [createdUsers]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUsers]);
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
// 1. Domain separation
// ---------------------------------------------------------------------------

test("domain: privacy_requests 是自己的 table，狀態值與申訴不同", async () => {
  const pr = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'privacy_requests'`
  );
  assert.ok(pr.rows.length > 0, "privacy_requests 必須存在 —— 請執行 OPS-04 migration");

  const events = await db.query(
    `SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_name = 'privacy_request_events'`
  );
  assert.equal(events.rows[0].n, 1);

  // 狀態集合刻意與 consumer complaint 不同 —— 兩者不是同一個生命週期。
  assert.deepEqual(policy.PRIVACY_REQUEST_STATUSES, [
    "open",
    "in_review",
    "waiting_for_information",
    "completed",
    "closed",
  ]);
  const complaintStatuses = ["submitted", "under_review", "responded", "resolved", "closed"];
  assert.notDeepEqual(policy.PRIVACY_REQUEST_STATUSES, complaintStatuses);
});

test("domain: complaint_type 未被加上 privacy_request（不得用 enum 值假裝分離）", async () => {
  const { rows } = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'cc_type_check'`
  );
  assert.equal(rows.length, 1);
  for (const forbidden of ["privacy_request", "privacy", "data_subject"]) {
    assert.equal(
      rows[0].def.includes(forbidden),
      false,
      `consumer_complaints.complaint_type 不得包含 ${forbidden} —— 那會讓 domain 分離失效`
    );
  }
});

test("taxonomy: request types 直接對應 Privacy draft §8.1／§8.2 已揭露之權利", () => {
  assert.deepEqual(policy.PRIVACY_REQUEST_TYPES, [
    "access",
    "copy",
    "correction",
    "stop_processing",
    "deletion",
    "withdraw_consent",
    "other",
  ]);
  for (const code of policy.PRIVACY_REQUEST_TYPES) {
    assert.ok(policy.PRIVACY_REQUEST_TYPE_LABEL[code], `${code} 缺少中文標籤`);
  }
});

// ---------------------------------------------------------------------------
// 2. No statutory deadline / no identity standard / no deletion execution
// ---------------------------------------------------------------------------

test("no SLA: privacy_requests 沒有任何 deadline 欄位，也未重用申訴 SLA", async () => {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'privacy_requests'`
  );
  const names = rows.map((r) => r.column_name);
  for (const forbidden of ["statutory_due_at", "due_at", "deadline", "sla_due_at", "respond_by"]) {
    assert.equal(names.includes(forbidden), false, `${forbidden} 不得存在 —— 法定回覆期限尚未取得律師結論`);
  }
  // 只保留兩個時間點，供未來律師決定期限後往回計算。
  assert.ok(names.includes("received_at"));
  assert.ok(names.includes("completed_at"));

  /*
   * 檢查的是**實際的 import 與欄位使用**，不是字串出現。
   * 服務檔的註解本來就會提到 `complaintSla`（正是為了說明「刻意不用它」），
   * 逐字比對會把那段說明誤判成違規。
   */
  const fs = require("node:fs");
  const path = require("node:path");
  const raw = fs.readFileSync(path.join(__dirname, "..", "services", "privacyRequest.service.js"), "utf8");
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/require\([^)]*complaintSla[^)]*\)/.test(code), false, "privacy 服務不得 require 申訴的 SLA 模組");
  assert.equal(code.includes("statutory_due_at"), false, "privacy 服務不得使用申訴的法定期限欄位");
});

test("no identity standard: 沒有身分驗證欄位或狀態，也不蒐集政府證件", async () => {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'privacy_requests'`
  );
  const names = rows.map((r) => r.column_name);
  for (const forbidden of [
    "identity_verified",
    "identity_verified_legal",
    "statutory_identity_verified",
    "national_id",
    "passport_no",
    "date_of_birth",
    "bank_account",
  ]) {
    assert.equal(names.includes(forbidden), false, `${forbidden} 不得存在`);
  }
  for (const forbidden of ["identity_legally_verified", "legally_satisfied", "lawful_refusal", "statutory_deadline_met"]) {
    assert.equal(policy.PRIVACY_REQUEST_STATUSES.includes(forbidden), false, `狀態不得包含法律結論：${forbidden}`);
  }
});

test("deletion 請求只記錄，不刪除任何使用者資料", async () => {
  const admin = await makeUser("admin");
  const subject = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    const res = await call(base, admin, "admin", "POST", "/admin/privacy-requests", {
      ...VALID_CREATE,
      requestType: "deletion",
      summary: "使用者要求刪除帳號",
    });
    assert.equal(res.status, 201);
    const created = await res.json();
    createdRequests.push(created.id);

    // 建立刪除請求之後，該使用者仍然完好無缺。
    const user = await db.query(`SELECT id, email, account_status FROM users WHERE id = $1`, [subject]);
    assert.equal(user.rows.length, 1, "不得刪除任何使用者");
    assert.ok(user.rows[0].email, "不得匿名化");

    // 就算把案件推到 completed，也不代表資料被刪。
    const done = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/transition`, {
      status: "in_review",
    });
    assert.equal(done.status, 200);
    const done2 = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/transition`, {
      status: "completed",
      note: "已回覆請求者",
    });
    assert.equal(done2.status, 200);

    const after = await db.query(`SELECT id FROM users WHERE id = $1`, [subject]);
    assert.equal(after.rows.length, 1, "`completed` 不等於『資料已刪除』");
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// 3. Route contract
// ---------------------------------------------------------------------------

test("create: Admin 可建案；非 admin 不得建案", async () => {
  const admin = await makeUser("admin");
  const buyer = await makeUser("buyer");
  const { base, close } = await mount();
  try {
    const ok = await call(base, admin, "admin", "POST", "/admin/privacy-requests", VALID_CREATE);
    assert.equal(ok.status, 201);
    const created = await ok.json();
    createdRequests.push(created.id);
    assert.equal(created.requestType, "access");
    assert.equal(created.status, "open", "初始狀態");
    assert.equal(created.source, "privacy_email");
    assert.ok(created.receivedAt);

    const denied = await call(base, buyer, "buyer", "POST", "/admin/privacy-requests", VALID_CREATE);
    assert.equal(denied.status, 403, "非 admin 不得建案");
  } finally {
    await close();
  }
});

test("create: 無效 request type / 缺必要欄位 → 400，且不建立任何列", async () => {
  const admin = await makeUser("admin");
  const { base, close } = await mount();
  const before = await db.query(`SELECT COUNT(*)::int n FROM privacy_requests`);
  try {
    for (const [payload, expected] of [
      [{ ...VALID_CREATE, requestType: "made_up" }, "invalid_request_type"],
      [{ ...VALID_CREATE, requesterReference: "   " }, "requester_reference_required"],
      [{ ...VALID_CREATE, summary: "" }, "summary_required"],
      [{ ...VALID_CREATE, receivedAt: undefined }, "received_at_required"],
      [{ ...VALID_CREATE, receivedAt: "not-a-date" }, "received_at_invalid"],
      [{ ...VALID_CREATE, source: "public_form" }, "invalid_source"],
    ]) {
      const res = await call(base, admin, "admin", "POST", "/admin/privacy-requests", payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.equal((await res.json()).code, expected, JSON.stringify(payload));
    }
    const after = await db.query(`SELECT COUNT(*)::int n FROM privacy_requests`);
    assert.equal(after.rows[0].n, before.rows[0].n, "驗證失敗不得留下 partial write");
  } finally {
    await close();
  }
});

test("transition: 合法轉移被接受，非法轉移 409，事件與稽核齊備", async () => {
  const admin = await makeUser("admin");
  const { base, close } = await mount();
  try {
    const created = await (await call(base, admin, "admin", "POST", "/admin/privacy-requests", VALID_CREATE)).json();
    createdRequests.push(created.id);

    // open → completed 不是合法轉移（必須先進 in_review）。
    const bad = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/transition`, {
      status: "completed",
    });
    assert.equal(bad.status, 409);
    const badBody = await bad.json();
    assert.equal(badBody.code, "invalid_transition");
    assert.deepEqual(badBody.allowed, ["in_review", "closed"]);

    // 未知狀態 → 400
    const unknown = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/transition`, {
      status: "legally_satisfied",
    });
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).code, "invalid_status");

    // open → in_review
    const good = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/transition`, {
      status: "in_review",
      note: "開始處理",
    });
    assert.equal(good.status, 200);
    const body = await good.json();
    assert.equal(body.from, "open");
    assert.equal(body.to, "in_review");

    // 事件流保留 actor 與 from/to
    const events = await db.query(
      `SELECT event_type, actor_id, message, meta FROM privacy_request_events
        WHERE request_id = $1 ORDER BY created_at ASC, id ASC`,
      [created.id]
    );
    assert.equal(events.rows[0].event_type, "created");
    assert.equal(events.rows[0].actor_id, admin, "建案者必須留存");
    const statusEvent = events.rows.find((e) => e.event_type === "status_changed");
    assert.ok(statusEvent);
    const meta = typeof statusEvent.meta === "string" ? JSON.parse(statusEvent.meta) : statusEvent.meta;
    assert.equal(meta.from, "open");
    assert.equal(meta.to, "in_review");

    // 稽核
    const logs = await db.query(
      `SELECT action, actor_id, meta FROM activity_logs
        WHERE target_type = 'privacy_request' AND target_id = $1
        ORDER BY created_at ASC, id ASC`,
      [created.id]
    );
    const actions = logs.rows.map((r) => r.action);
    assert.ok(actions.includes("privacy_request.created"));
    assert.ok(actions.includes("privacy_request.status_changed"));
    assert.equal(logs.rows[0].actor_id, admin);
    // 稽核不得複製請求者的聯絡個資。
    for (const row of logs.rows) {
      const m = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
      assert.equal("requesterReference" in m, false, "稽核不得複製請求者聯絡資料");
    }
  } finally {
    await close();
  }
});

test("list / detail: 回傳 taxonomy，排序依 received_at（不是期限）", async () => {
  const admin = await makeUser("admin");
  const { base, close } = await mount();
  try {
    const created = await (await call(base, admin, "admin", "POST", "/admin/privacy-requests", VALID_CREATE)).json();
    createdRequests.push(created.id);

    const list = await (await call(base, admin, "admin", "GET", "/admin/privacy-requests")).json();
    assert.ok(Array.isArray(list.items));
    assert.deepEqual(
      list.requestTypeOptions.map((o) => o.code),
      policy.PRIVACY_REQUEST_TYPES,
      "選項必須由 backend 提供，前後端不各維護一份"
    );
    assert.ok(list.statusOptions.length > 0);

    const detail = await (await call(base, admin, "admin", "GET", `/admin/privacy-requests/${created.id}`)).json();
    assert.equal(detail.request.id, created.id);
    assert.ok(Array.isArray(detail.events));
    assert.ok(detail.events.length >= 1);

    const missing = await call(base, admin, "admin", "GET", "/admin/privacy-requests/pr_does_not_exist");
    assert.equal(missing.status, 404);
  } finally {
    await close();
  }
});

test("notes: 內部註記可新增，且屬中性紀錄", async () => {
  const admin = await makeUser("admin");
  const { base, close } = await mount();
  try {
    const created = await (await call(base, admin, "admin", "POST", "/admin/privacy-requests", VALID_CREATE)).json();
    createdRequests.push(created.id);

    const empty = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/notes`, { note: "  " });
    assert.equal(empty.status, 400);

    const ok = await call(base, admin, "admin", "POST", `/admin/privacy-requests/${created.id}/notes`, {
      note: "已回信請請求者補充說明其請求範圍",
    });
    assert.equal(ok.status, 201);

    const events = await db.query(
      `SELECT event_type FROM privacy_request_events WHERE request_id = $1 AND event_type = 'internal_note'`,
      [created.id]
    );
    assert.equal(events.rows.length, 1);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// 4. Consumer complaint domain unchanged
// ---------------------------------------------------------------------------

test("建立個資請求不會產生任何 consumer complaint 列", async () => {
  const admin = await makeUser("admin");
  const before = await db.query(`SELECT COUNT(*)::int n FROM consumer_complaints`);
  const { base, close } = await mount();
  try {
    const created = await (await call(base, admin, "admin", "POST", "/admin/privacy-requests", VALID_CREATE)).json();
    createdRequests.push(created.id);
    const after = await db.query(`SELECT COUNT(*)::int n FROM consumer_complaints`);
    assert.equal(after.rows[0].n, before.rows[0].n, "兩個 domain 必須互不寫入");
  } finally {
    await close();
  }
});

test("`BUY-02` invariant 未被破壞：凍結帳號仍可提出消費申訴", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "complaints.js"), "utf8");
  assert.equal(
    /^\s*(?!\s*\*).*requireActiveAccount\s*[,)]/m.test(src),
    false,
    "complaints 不得套用 requireActiveAccount"
  );
});

test("scope: 未新增任何 public / anonymous 個資請求提交端點", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  // 只掛在 /admin 之下；不得出現 /me/privacy-requests 之類的使用者端入口。
  assert.match(index, /app\.use\("\/admin", adminPrivacyRequestsRouter\)/);
  assert.equal(index.includes("/me/privacy-requests"), false);

  const route = fs.readFileSync(path.join(__dirname, "..", "routes", "adminPrivacyRequests.js"), "utf8");
  assert.match(route, /requireRole\("admin"\)/, "所有端點必須 admin only");
});
