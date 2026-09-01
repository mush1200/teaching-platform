/**
 * 上傳檔名編碼的**真實路由**整合測試（`DX-14`）。
 *
 * 只針對 **security / integration 資料庫** 執行（`npm run test:db --prefix Backend`）。
 *
 * ## 為什麼不能只測 helper
 *
 * `tests/multipartFilename.test.js` 證明的是「給定一個 latin1 誤讀的字串，函式會還原它」。
 * 那**不能**證明「真實的 multipart 請求打進真實的路由之後，DB 裡存的是正確檔名」——
 * 中間還隔著 busboy 的實際解析、multer 的 middleware 順序、以及 service 讀取
 * `originalname` 的時機（custom storage engine 比 post-multer middleware 更早執行）。
 *
 * 因此這裡**掛載真正的 router**（含真正的 `requireAuth` / multer / 本輪新增的 middleware），
 * 用真正的 `FormData` 發出 multipart 請求，再回 DB 讀 `original_filename` 逐字比對。
 *
 * 兩條路徑都測，且 ASCII 與中文都測 —— ASCII 用來證明**沒有被順手改壞**。
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
const { getPrivateFileStorage } = require("../config/privateFileStorage");

test("guard: tests target the security database", async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, EXPECTED_DB);
});

const ASCII_NAME = "payment-proof-2026-08-27.png";
const CJK_NAME = "匯款證明-2026年8月27日.png";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const created = { users: [], orders: [], complaints: [], keys: [] };

function tokenFor(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

async function makeUser(role = "buyer") {
  const id = `usr_ufe_${uniq()}`;
  await db.query(`INSERT INTO users(id, email, password_hash, role) VALUES ($1, $2, 'x', $3)`, [
    id,
    `${id}@example.test`,
    role,
  ]);
  created.users.push(id);
  return id;
}

/** 掛載真正的 router，回傳 base URL 與關閉函式。 */
function mount(mountPath, router) {
  const app = express();
  app.use(mountPath, router);
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

function form(field, filename) {
  const fd = new FormData();
  fd.append(field, new Blob([PNG], { type: "image/png" }), filename);
  return fd;
}

test.after(async () => {
  const storage = getPrivateFileStorage();
  try {
    for (const k of created.keys) await storage.delete(k).catch(() => {});
    if (created.complaints.length) {
      await db.query(
        `DELETE FROM activity_logs WHERE target_type = 'consumer_complaint' AND target_id = ANY($1)`,
        [created.complaints]
      );
      await db.query(`DELETE FROM consumer_complaints WHERE id = ANY($1)`, [created.complaints]);
    }
    for (const o of created.orders) {
      await db.query(`DELETE FROM manual_payment_proofs WHERE order_id = $1`, [o]);
      await db.query(`DELETE FROM activity_logs WHERE target_type='order' AND target_id = $1`, [String(o)]);
      await db.query(`DELETE FROM order_items WHERE order_id = $1`, [o]);
      await db.query(`DELETE FROM orders WHERE id = $1`, [o]);
    }
    if (created.users.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
  } finally {
    await db.pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// 付款憑證（`routes/order.js`，memoryStorage ＋ post-multer middleware）
// ---------------------------------------------------------------------------

async function uploadProofViaRealRoute(filename) {
  const buyer = await makeUser("buyer");
  const orderId = `ord_ufe_${uniq()}`;
  await db.query(
    `INSERT INTO orders(id, user_id, status, payment_mode, total_amount, total_price, discount_amount)
     VALUES ($1, $2, 'pending_payment', 'manual_transfer', 480, 480, 0)`,
    [orderId, buyer]
  );
  created.orders.push(orderId);

  const { base, close } = await mount("/orders", require("../routes/order"));
  try {
    const res = await fetch(`${base}/orders/${orderId}/payment-proof`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(buyer, "buyer")}` },
      body: form("proofs", filename),
    });
    const body = await res.json().catch(() => null);
    const { rows } = await db.query(
      `SELECT original_filename, storage_key FROM manual_payment_proofs WHERE order_id = $1`,
      [orderId]
    );
    rows.forEach((r) => r.storage_key && created.keys.push(r.storage_key));
    return { status: res.status, body, rows };
  } finally {
    await close();
  }
}

test("付款憑證：ASCII 檔名經真實路由後**完全不變**", async () => {
  const r = await uploadProofViaRealRoute(ASCII_NAME);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].original_filename, ASCII_NAME);
});

test("付款憑證：中文檔名經真實路由後**存的是正確 Unicode，不是 mojibake**", async () => {
  const r = await uploadProofViaRealRoute(CJK_NAME);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.rows.length, 1);
  const stored = r.rows[0].original_filename;
  assert.equal(stored, CJK_NAME);
  // 明確排除修復前的壞值形狀
  assert.equal(stored.includes("å"), false, "不得含 latin1 誤讀的特徵字元");
  assert.equal(stored.includes("æ"), false);
  assert.ok(/^匯款證明-2026年8月27日\.png$/.test(stored));
});

test("付款憑證：storage_key 仍由伺服器產生，**檔名不影響儲存路徑**", async () => {
  const r = await uploadProofViaRealRoute(CJK_NAME);
  assert.equal(r.status, 201);
  const key = r.rows[0].storage_key;
  assert.ok(/^payment-proofs\/[0-9a-f-]{36}$/.test(key), `storage key 形狀異常: ${key}`);
  assert.equal(key.includes("匯"), false, "檔名不得出現在 storage key");
  assert.equal(key.includes(".png"), false);
});

// ---------------------------------------------------------------------------
// 申訴證據（`routes/complaints.js`，memoryStorage ＋ post-multer middleware）
// ---------------------------------------------------------------------------

async function uploadEvidenceViaRealRoute(filename) {
  const buyer = await makeUser("buyer");
  const complaints = require("../services/consumerComplaint.service");
  const c = await complaints.createComplaint({
    buyerId: buyer,
    complaintType: "payment",
    subject: "匯款未入帳",
    statement: "附銀行證明。",
    actorId: buyer,
  });
  assert.ok(c.ok, `createComplaint failed: ${c.code}`);
  created.complaints.push(c.complaint.id);

  const { base, close } = await mount("/me/complaints", require("../routes/complaints"));
  try {
    const res = await fetch(`${base}/me/complaints/${c.complaint.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(buyer, "buyer")}` },
      body: form("evidence", filename),
    });
    const body = await res.json().catch(() => null);
    const { rows } = await db.query(
      `SELECT original_filename, storage_key FROM consumer_complaint_evidence WHERE complaint_id = $1`,
      [c.complaint.id]
    );
    rows.forEach((r) => r.storage_key && created.keys.push(r.storage_key));
    return { status: res.status, body, rows };
  } finally {
    await close();
  }
}

test("申訴證據：ASCII 檔名經真實路由後**完全不變**", async () => {
  const r = await uploadEvidenceViaRealRoute(ASCII_NAME);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].original_filename, ASCII_NAME);
});

test("申訴證據：中文檔名經真實路由後**存的是正確 Unicode，不是 mojibake**", async () => {
  const r = await uploadEvidenceViaRealRoute(CJK_NAME);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const stored = r.rows[0].original_filename;
  assert.equal(stored, CJK_NAME);
  assert.equal(stored.includes("å"), false);
});

test("申訴證據：storage_key 仍由伺服器產生且與檔名無關", async () => {
  const r = await uploadEvidenceViaRealRoute(CJK_NAME);
  assert.equal(r.status, 201);
  const key = r.rows[0].storage_key;
  assert.ok(/^complaint-evidence\/[0-9a-f-]{36}$/.test(key), `storage key 形狀異常: ${key}`);
  assert.equal(key.includes("匯"), false);
});

// ---------------------------------------------------------------------------
// 交付端：Content-Disposition 必須能還原正確 Unicode
// ---------------------------------------------------------------------------

test("交付：`Content-Disposition` 的 `filename*` 可還原成正確中文檔名", () => {
  const { contentDisposition } = require("../utils/fileDownloadResponse");
  const header = contentDisposition(CJK_NAME, "inline");

  const m = /filename\*=UTF-8''([^;]+)$/.exec(header);
  assert.ok(m, `header 缺少 RFC 5987 filename*：${header}`);
  assert.equal(decodeURIComponent(m[1]), CJK_NAME, "百分比解碼後必須等於原始檔名");

  // ASCII fallback 仍存在（給不懂 filename* 的舊 client）
  assert.ok(/filename="[^"]*\.png"/.test(header), `header 缺少 ASCII fallback：${header}`);
  // 修復前這裡會是 mojibake 的百分比編碼
  assert.equal(decodeURIComponent(m[1]).includes("å"), false);
});

test("交付：ASCII 檔名的 `Content-Disposition` 不被改動", () => {
  const { contentDisposition } = require("../utils/fileDownloadResponse");
  const header = contentDisposition(ASCII_NAME, "attachment");
  assert.ok(header.startsWith("attachment;"));
  assert.ok(header.includes(`filename="${ASCII_NAME}"`), header);
  const m = /filename\*=UTF-8''([^;]+)$/.exec(header);
  assert.equal(decodeURIComponent(m[1]), ASCII_NAME);
});

// ---------------------------------------------------------------------------
// 第三條上傳路徑（教材本體／教材媒體）也套用了同一個 helper
// ---------------------------------------------------------------------------

test("`routes/teacherUpload.js` 的兩個 custom storage engine 皆已套用 helper", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "teacherUpload.js"), "utf8");
  const applied = src.match(/originalFilename: normalizeMultipartFilename\(file\.originalname\)/g) || [];
  assert.equal(applied.length, 2, "教材媒體與教材本體兩處都必須套用");
  assert.equal(
    /originalFilename: file\.originalname/.test(src),
    false,
    "不得殘留未經還原的直接讀取"
  );
});

test("所有 production 上傳路徑都不再直接使用未還原的 `originalname`", () => {
  const fs = require("fs");
  const path = require("path");
  const routes = path.join(__dirname, "..", "routes");
  const offenders = [];
  for (const f of fs.readdirSync(routes).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(routes, f), "utf8");
    if (!src.includes("multer(")) continue;
    // 有 multer 的檔案必須以下列兩種方式之一處理檔名
    const usesMiddleware = src.includes("normalizeUploadedFilenames");
    const usesHelper = src.includes("normalizeMultipartFilename");
    if (!usesMiddleware && !usesHelper) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `這些含 multer 的路由未處理檔名編碼: ${offenders.join(", ")}`);
});
