#!/usr/bin/env node
/**
 * Production admin verification（`PRE-07` STEP 4）—— 走真實 Backend HTTP 路徑。
 *
 * ## 為什麼需要一支腳本，而不是手打 curl
 *
 * 要證明的東西比「登入成功」多一層：**登入成功只證明 authentication，
 * 不證明 authorization**。一個 role 被寫錯的帳號照樣登得進去，
 * 只是打不開任何 admin 端點 —— 而那要到有人真的去用 Admin 介面才會發現。
 *
 * 所以這裡分開驗三件事：
 *   1. 未帶 token 打 admin 端點 → 必須 401（負向案例）
 *   2. 正確憑證登入 → 200，且回應中的 `user.role` 為 `admin`
 *   3. **拿那個 token 打同一個 admin 端點 → 必須 200**（這一條才是 authorization）
 *
 * 另外解出 JWT 的 payload 檢查 `role` claim。payload 是 base64，不是加密的，
 * 解它不需要 `JWT_SECRET`，也不構成任何秘密外洩 —— 但它能證明**授權依據的那個值**
 * 確實是 admin，而不是只有回應 body 好看。
 *
 * ## 這支腳本不寫入任何東西
 *
 * `routes/auth.js` 的 login 不寫 `activity_logs`（已確認），因此本檢查對資料庫是唯讀的。
 * **刻意不測「錯誤密碼」** —— repo 有 account freeze 機制，拿 production 唯一的 admin
 * 去觸發失敗登入不值得，這裡要驗的是正向路徑與未授權路徑。
 *
 * ## 秘密處理
 *
 * 密碼只從環境變數讀取。**token、密碼、Authorization header 一律不列印**，
 * 連遮罩版本都不印。輸出只有檢查項與布林結果。
 *
 * ## 用法
 *
 *   BACKEND_URL=https://<service>.onrender.com \
 *   ADMIN_EMAIL=<email> ADMIN_PASSWORD='<secret>' \
 *   node Backend/scripts/check-production-admin.js
 */

const ADMIN_PROBE_PATH = "/admin/materials";

const problems = [];
const fail = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

/** JWT payload 是 base64url，不是密文。解它不需要金鑰，也不外洩任何秘密。 */
function decodeJwtRole(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const base = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
  const email = String(process.env.ADMIN_EMAIL || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!base || !email || !password) {
    console.error(
      "Missing configuration. Required environment variables:\n" +
        "  BACKEND_URL     e.g. https://<service>.onrender.com\n" +
        "  ADMIN_EMAIL\n" +
        "  ADMIN_PASSWORD  (never pass this on the command line — it lands in shell history)"
    );
    process.exit(2);
  }

  console.log("Production admin verification (no writes, no secrets printed)\n");

  // --- 1. 負向：未授權必須被擋 ------------------------------------------------
  console.log("[1] unauthenticated request to an admin endpoint");
  try {
    const res = await fetch(`${base}${ADMIN_PROBE_PATH}`);
    if (res.status === 401 || res.status === 403) {
      pass(`rejected with ${res.status}`);
    } else {
      fail(`expected 401/403 but got ${res.status} — the admin boundary is not enforced`);
    }
  } catch (err) {
    fail(`could not reach the backend: ${err.message}`);
    console.log("\nRESULT: BLOCKED");
    process.exit(1);
  }

  // --- 2. 正向：登入 ---------------------------------------------------------
  console.log("\n[2] authentication with the production admin credentials");
  let token = null;
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 200) {
      fail(`login returned ${res.status} — credentials rejected or account unusable`);
      console.log("\nRESULT: BLOCKED");
      process.exit(1);
    }
    const body = await res.json();
    token = body.token;
    pass("login succeeded (200)");

    // 身分要對得上，否則就是登進了別的帳號。
    if (body.user && body.user.email === email) pass(`identity matches the requested account`);
    else fail("the authenticated identity does not match the requested email");

    if (body.user && body.user.role === "admin") pass('response role = "admin"');
    else fail(`response role = ${JSON.stringify(body.user && body.user.role)}, expected "admin"`);
  } catch (err) {
    fail(`login request failed: ${err.message}`);
    console.log("\nRESULT: BLOCKED");
    process.exit(1);
  }

  // --- 3. token 內的 role claim ----------------------------------------------
  console.log("\n[3] role carried by the token itself");
  const claimRole = token ? decodeJwtRole(token) : null;
  if (claimRole === "admin") pass('JWT role claim = "admin" (this is what requireRole checks)');
  else fail(`JWT role claim = ${JSON.stringify(claimRole)}, expected "admin"`);

  // --- 4. 真正的授權 ---------------------------------------------------------
  // 登入成功只代表 authentication。這一條才證明 authorization。
  console.log("\n[4] authorization — the same admin endpoint, now with the token");
  try {
    const res = await fetch(`${base}${ADMIN_PROBE_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 200) pass(`admin endpoint accepted the account (200)`);
    else fail(`admin endpoint returned ${res.status} — authenticated but NOT authorized as admin`);
  } catch (err) {
    fail(`admin request failed: ${err.message}`);
  }

  console.log("");
  if (problems.length > 0) {
    console.log(`RESULT: BLOCKED — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("RESULT: PASS — 0 problems");
}

main().catch((err) => {
  console.error("verification crashed:", err.message);
  process.exit(1);
});
