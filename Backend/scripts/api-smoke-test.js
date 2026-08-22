/**
 * 後端 API 冒煙驗證（等同 Postman 手動跑一輪 Happy Path）。
 *
 * 用法：
 *   1) 終端 A：在 Backend 目錄執行 `npm run start`（依賴 Backend/.env 連線資料庫）
 *      ⚠️ 若在 shell 先設了 PGDATABASE／PGHOST 等，會覆蓋 .env；請勿與 .env 不一致。
 *   2) 終端 B：`npm run smoke` 或 `API_SMOKE_BASE=http://localhost:3000 node scripts/api-smoke-test.js`
 *
 * 必要環境變數（admin 流程）：
 *   TEST_ADMIN_EMAIL     既有 admin 帳號的 email
 *   TEST_ADMIN_PASSWORD  該帳號的密碼
 *   ⚠️ 公開註冊已禁止建立 admin（POST /auth/register + role:"admin" → 403）。
 *      smoke 只會「登入」既有 admin，不會、也不能自行建立。請先以
 *      `npm run create-admin` 建好帳號，再於環境變數提供憑證（勿寫入版控）。
 *
 * 選項環境變數：
 *   API_SMOKE_BASE  預設 http://127.0.0.1:3000
 *
 * 涵蓋：health、auth、materials、cart、orders、upload-proof、admin approve/reject、
 *       download、reviews、reports、admin 列表（含 payment-proofs）、DELETE cart（預期 404）、
 *       admin dashboard summary 統計語意（revenue 僅計 approved；ordersCount 不分狀態）、
 *       reporting period 契約與 previous-period comparison、admin dashboard trends（粒度／補 0）、
 *       creator sales（gross sales、paid_at 認列、跨創作者隔離）。
 */

const path = require("path");
// Load Backend/.env explicitly, resolved from this file rather than process.cwd(),
// so the script behaves identically from the repo root and from Backend/.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const BASE = process.env.API_SMOKE_BASE || "http://127.0.0.1:3000";

function fail(msg) {
  console.error("\x1b[31mFAIL\x1b[0m", msg);
  process.exitCode = 1;
}

async function http(method, path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const hasRawBody = Object.prototype.hasOwnProperty.call(opts, "rawBody");
  if (!hasRawBody && opts.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: hasRawBody ? opts.rawBody : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function expect(name, cond, detail) {
  if (!cond) {
    fail(`${name}: ${detail}`);
    throw new Error(detail);
  }
}

/**
 * Admin credentials must be supplied by the environment. There is deliberately no
 * fallback: creating an admin over HTTP is blocked (403), and a hard-coded or default
 * admin password would be exactly the weakness P0-2 removed. The value is never logged.
 */
function requireEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") {
    fail(
      `${name} is not set. Admin smoke coverage signs in as an existing admin account; ` +
        "it never creates one. Create the account once with `npm run create-admin`, then " +
        "export TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD (do not commit them)."
    );
    throw new Error(`missing environment variable: ${name}`);
  }
  return String(raw);
}

/** 符合目前 POST /materials 必填欄位之最小 body（教學商品欄位）。 */
function smokeMaterialBody({ title, fileKey, price = 100 }) {
  return {
    title,
    price,
    file_key: fileKey,
    cover_image_url: "https://picsum.photos/seed/smoke-cover/640/480",
    teaching_objective: "Smoke test teaching objective",
    teaching_methods: ["遊戲活動"],
    usage_duration: "約 1 小時",
    activity_steps: "1. 說明\n2. 練習",
    contents: [{ type: "worksheet", name: "練習", count: 1 }],
    // Required by POST /materials (>= 1 value from the material features allowlist).
    // Fixture value only — not a product default.
    material_features: ["PDF教材"],
    ipDeclarationAccepted: true,
  };
}

/**
 * Admin dashboard summary 的統計語意驗證用。
 *
 * smoke 跑在共用資料庫上（既有資料筆數未知），所以一律用「差值」斷言而非絕對值：
 * 先取基準，跑完一段流程後再取一次，比較 delta。
 */
async function fetchAdminSummary(token) {
  const res = await http("GET", "/admin/dashboard/summary", { token });
  expect(
    "GET /admin/dashboard/summary",
    res.status === 200 && Number.isFinite(Number(res.data?.ordersCount)) && Number.isFinite(Number(res.data?.revenueAmount)),
    JSON.stringify(res.data)
  );
  return {
    ordersCount: Number(res.data.ordersCount),
    revenueAmount: Number(res.data.revenueAmount),
  };
}

function makeProofFormData(filename = "proof.png", mimetype = "image/png") {
  const form = new FormData();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  form.append("proofs", new Blob([bytes], { type: mimetype }), filename);
  return form;
}

async function main() {
  const stamp = Date.now();
  const emails = {
    teacher: `smoke_teacher_${stamp}@test.local`,
    parent: `smoke_parent_${stamp}@test.local`,
  };
  const password = "SmokeTest1!";

  // Fail before any HTTP call so a missing variable is obvious.
  const testAdminEmail = requireEnv("TEST_ADMIN_EMAIL");
  const testAdminPassword = requireEnv("TEST_ADMIN_PASSWORD");

  console.log("Base URL:", BASE);
  console.log("Admin account:", testAdminEmail);

  // Health
  {
    const { status, data } = await http("GET", "/health");
    expect("GET /health", status === 200 && data?.status === "ok", JSON.stringify(data));
    console.log("OK  GET /health");
  }

  // Public registration must never mint an admin (P0-2 guard).
  {
    const blocked = await http("POST", "/auth/register", {
      body: { email: `smoke_admin_attempt_${stamp}@test.local`, password, role: "admin" },
    });
    expect(
      "POST /auth/register role=admin (must be blocked)",
      blocked.status === 403,
      `expected 403, got ${blocked.status}: ${JSON.stringify(blocked.data)}`
    );
    console.log("OK  POST /auth/register role=admin → 403 (public admin registration blocked)");
  }

  // Admin: sign in to a pre-existing account. Register ×2 for teacher/parent.
  let adminToken;
  let teacherToken;
  let parentToken;
  let teacherId;
  let parentId;
  {
    const rA = await http("POST", "/auth/login", {
      body: { email: testAdminEmail, password: testAdminPassword },
    });
    expect(
      "POST /auth/login admin",
      rA.status === 200 && rA.data?.token && rA.data?.user?.role === "admin",
      rA.status === 200
        ? `logged in but role is "${rA.data?.user?.role}" (TEST_ADMIN_EMAIL must be an admin account)`
        : `expected 200, got ${rA.status} (check TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)`
    );
    adminToken = rA.data.token;
    console.log("OK  POST /auth/login (admin)");

    const rT = await http("POST", "/auth/register", {
      body: { email: emails.teacher, password, role: "teacher" },
    });
    expect("POST /auth/register teacher", rT.status === 201 && rT.data?.token, JSON.stringify(rT.data));
    teacherToken = rT.data.token;
    teacherId = rT.data.user.id;

    const rP = await http("POST", "/auth/register", {
      body: { email: emails.parent, password, role: "parent" },
    });
    expect("POST /auth/register parent", rP.status === 201 && rP.data?.token, JSON.stringify(rP.data));
    parentToken = rP.data.token;
    parentId = rP.data.user.id;

    console.log("OK  POST /auth/register (teacher, parent)");
  }

  // GET /auth/me
  {
    const { status, data } = await http("GET", "/auth/me", { token: parentToken });
    expect("GET /auth/me", status === 200 && data?.user?.id === parentId, JSON.stringify(data));
    console.log("OK  GET /auth/me");
  }

  // POST /login
  {
    const { status, data } = await http("POST", "/auth/login", {
      body: { email: emails.parent, password },
    });
    expect("POST /auth/login", status === 200 && data?.token, JSON.stringify(data));
    console.log("OK  POST /auth/login");
  }

  // Teacher creates material
  let materialId;
  {
    const { status, data } = await http("POST", "/materials", {
      token: teacherToken,
      body: smokeMaterialBody({ title: `Smoke material ${stamp}`, fileKey: `files/smoke_${stamp}.pdf` }),
    });
    expect("POST /materials", status === 201 && data?.id, JSON.stringify(data));
    materialId = data.id;
    console.log("OK  POST /materials");
  }

  // Admin publishes
  {
    const { status, data } = await http("PUT", `/materials/${materialId}`, {
      token: adminToken,
      body: { status: "published" },
    });
    expect("PUT /materials/:id publish", status === 200 && data?.status === "published", JSON.stringify(data));
    console.log("OK  PUT /materials/:id (published)");
  }

  // GET /materials (anon)
  {
    const { status, data } = await http("GET", "/materials");
    expect("GET /materials", status === 200 && Array.isArray(data?.items), JSON.stringify(data));
    console.log("OK  GET /materials");
  }

  // GET /materials/:id
  {
    const { status, data } = await http("GET", `/materials/${materialId}`);
    expect("GET /materials/:id", status === 200 && data?.id === materialId, JSON.stringify(data));
    console.log("OK  GET /materials/:id");
  }

  // Cart + order
  let cartItemId;
  let orderId;
  let orderItemId;
  let orderAmount;
  /** 憑證被退回的訂單；供後面驗證 /admin/orders 的 `payment_rejected` operational bucket。 */
  let rejectedOrderId;
  /**
   * reject-flow 的教材。檢舉案件流程要用它 —— `reports` 上有
   * `UNIQUE (material_id, reporter_id)`，第一份教材已被同一個 parent 檢舉過。
   */
  let materialRejectIdRef;
  // Dashboard summary 基準值（在本輪建立任何訂單之前）。
  const summaryBaseline = await fetchAdminSummary(adminToken);
  {
    const teacherOrder = await http("POST", "/orders", { token: teacherToken, body: {} });
    expect(
      "POST /orders (teacher forbidden)",
      teacherOrder.status === 403 &&
        String(teacherOrder.data?.message || "").includes("Only parent can create order"),
      JSON.stringify(teacherOrder.data)
    );

    const add = await http("POST", "/cart/items", {
      token: parentToken,
      body: { materialId, quantity: 1 },
    });
    expect("POST /cart/items", add.status === 200 || add.status === 201, JSON.stringify(add.data));
    cartItemId = add.data.id;

    const list = await http("GET", "/cart", { token: parentToken });
    expect("GET /cart", list.status === 200 && list.data?.items?.length >= 1, JSON.stringify(list.data));

    const ord = await http("POST", "/orders", { token: parentToken, body: {} });
    expect(
      "POST /orders",
      ord.status === 201 && ord.data?.data?.order?.id,
      JSON.stringify(ord.data)
    );
    orderId = ord.data.data.order.id;
    orderItemId = ord.data.data.items[0].id;
    orderAmount = Number(ord.data.data.order.total_amount);
    expect("POST /orders (total_amount)", orderAmount > 0, JSON.stringify(ord.data.data.order));

    const emptyAfter = await http("POST", "/orders", { token: parentToken, body: {} });
    expect(
      "POST /orders (empty cart)",
      emptyAfter.status === 400 && emptyAfter.data?.message === "Cart is empty",
      JSON.stringify(emptyAfter.data)
    );

    const my = await http("GET", "/orders/my", { token: parentToken });
    expect("GET /orders/my", my.status === 200 && my.data?.items?.length >= 1, JSON.stringify(my.data));

    console.log("OK  cart + POST /orders + GET /orders/my");
  }

  // Dashboard summary：新建的 pending_payment 訂單必須計入 ordersCount，但不得計入 revenueAmount。
  {
    const s = await fetchAdminSummary(adminToken);
    expect(
      "GET /admin/dashboard/summary (pending_payment counts toward ordersCount)",
      s.ordersCount === summaryBaseline.ordersCount + 1,
      `expected ordersCount ${summaryBaseline.ordersCount + 1}, got ${s.ordersCount}`
    );
    expect(
      "GET /admin/dashboard/summary (pending_payment excluded from revenue)",
      s.revenueAmount === summaryBaseline.revenueAmount,
      `pending_payment order (amount ${orderAmount}) must not change revenue: ` +
        `expected ${summaryBaseline.revenueAmount}, got ${s.revenueAmount}`
    );
    console.log("OK  GET /admin/dashboard/summary (pending_payment: +1 order, +0 revenue)");
  }

  // Upload proof
  let proofId;
  {
    const up = await http("POST", `/orders/${orderId}/upload-proof`, {
      token: parentToken,
      rawBody: makeProofFormData("proof-smoke-1.png"),
    });
    expect("POST /orders/:id/upload-proof", up.status === 201 && up.data?.proof?.id, JSON.stringify(up.data));
    proofId = up.data.proof.id;
    console.log("OK  POST /orders/:id/upload-proof");
  }

  // Admin approve
  {
    const ap = await http("POST", `/admin/payment-proofs/${proofId}/approve`, {
      token: adminToken,
      body: {},
    });
    expect(
      "POST /admin/payment-proofs/:id/approve",
      ap.status === 200 && ap.data?.order?.status === "approved",
      JSON.stringify(ap.data)
    );
    console.log("OK  POST /admin/payment-proofs/:id/approve");
  }

  // Dashboard summary：核准後才認列營收；ordersCount 不因核准而變動（該訂單先前已計入）。
  {
    const s = await fetchAdminSummary(adminToken);
    expect(
      "GET /admin/dashboard/summary (approved order recognised as revenue)",
      s.revenueAmount === summaryBaseline.revenueAmount + orderAmount,
      `expected revenue ${summaryBaseline.revenueAmount + orderAmount}, got ${s.revenueAmount}`
    );
    expect(
      "GET /admin/dashboard/summary (approval does not change ordersCount)",
      s.ordersCount === summaryBaseline.ordersCount + 1,
      `expected ordersCount ${summaryBaseline.ordersCount + 1}, got ${s.ordersCount}`
    );
    console.log("OK  GET /admin/dashboard/summary (approved: +0 order, +amount revenue)");
  }

  {
    const lib = await http("GET", "/me/materials", { token: parentToken });
    expect(
      "GET /me/materials",
      lib.status === 200 && Array.isArray(lib.data?.items) && lib.data.items.length >= 1,
      JSON.stringify(lib.data)
    );
    console.log("OK  GET /me/materials");
  }

  // Second material + order + reject（覆蓋 POST …/reject）
  {
    const cre = await http("POST", "/materials", {
      token: teacherToken,
      body: smokeMaterialBody({
        title: `Smoke reject-flow ${stamp}`,
        fileKey: `files/smoke_rej_${stamp}.pdf`,
        price: 50,
      }),
    });
    expect("POST /materials (reject flow)", cre.status === 201 && cre.data?.id, JSON.stringify(cre.data));
    const materialRejectId = cre.data.id;
    materialRejectIdRef = materialRejectId;

    const pub = await http("PUT", `/materials/${materialRejectId}`, {
      token: adminToken,
      body: { status: "published" },
    });
    expect(
      "PUT /materials/:id (reject flow publish)",
      pub.status === 200 && pub.data?.status === "published",
      JSON.stringify(pub.data)
    );

    const add = await http("POST", "/cart/items", {
      token: parentToken,
      body: { materialId: materialRejectId, quantity: 1 },
    });
    expect(
      "POST /cart/items (reject flow)",
      add.status === 200 || add.status === 201,
      JSON.stringify(add.data)
    );

    const ord2 = await http("POST", "/orders", { token: parentToken, body: {} });
    expect(
      "POST /orders (reject flow)",
      ord2.status === 201 && ord2.data?.data?.order?.id,
      JSON.stringify(ord2.data)
    );

    rejectedOrderId = ord2.data.data.order.id;

    const up2 = await http("POST", `/orders/${ord2.data.data.order.id}/upload-proof`, {
      token: parentToken,
      rawBody: makeProofFormData("proof-smoke-reject.png"),
    });
    expect(
      "POST …/upload-proof (reject flow)",
      up2.status === 201 && up2.data?.proof?.id,
      JSON.stringify(up2.data)
    );
    const proofRejectId = up2.data.proof.id;

    /*
     * 退件**必須**帶結構化的 rejection_reason（docs/mvp_rules.md §12.2）。
     * 先證明缺原因會被 Backend 擋下 —— 舊版只有前端在擋，直接打 API 就能留下
     * 沒有理由的退件，買家在訂單詳情只會看到一片空白。
     */
    const rjNoReason = await http("POST", `/admin/payment-proofs/${proofRejectId}/reject`, {
      token: adminToken,
      body: { note: "smoke test reject" },
    });
    expect(
      "POST /admin/payment-proofs/:id/reject (missing rejection_reason -> 400)",
      rjNoReason.status === 400,
      JSON.stringify(rjNoReason.data)
    );

    const rjBadReason = await http("POST", `/admin/payment-proofs/${proofRejectId}/reject`, {
      token: adminToken,
      body: { rejection_reason: "because_i_said_so" },
    });
    expect(
      "POST /admin/payment-proofs/:id/reject (invalid rejection_reason -> 400)",
      rjBadReason.status === 400,
      JSON.stringify(rjBadReason.data)
    );

    const rjOtherNoNote = await http("POST", `/admin/payment-proofs/${proofRejectId}/reject`, {
      token: adminToken,
      body: { rejection_reason: "other" },
    });
    expect(
      'POST /admin/payment-proofs/:id/reject (reason "other" without note -> 400)',
      rjOtherNoNote.status === 400,
      JSON.stringify(rjOtherNoNote.data)
    );

    const rj = await http("POST", `/admin/payment-proofs/${proofRejectId}/reject`, {
      token: adminToken,
      body: { rejection_reason: "unreadable", note: "smoke test reject" },
    });
    expect(
      "POST /admin/payment-proofs/:id/reject",
      rj.status === 200 &&
        rj.data?.proof?.review_status === "rejected" &&
        rj.data?.proof?.rejection_reason === "unreadable",
      JSON.stringify(rj.data)
    );
    console.log("OK  POST /admin/payment-proofs/:id/reject (+ second order flow)");

    /*
     * 買家看得到退件原因 —— 這是整個 §4 的重點：退件不能是一個買家無從得知理由的黑盒。
     */
    const rejectedOrderDetail = await http("GET", `/me/orders/${rejectedOrderId}`, { token: parentToken });
    expect(
      "GET /me/orders/:orderId exposes payment_proof_rejected_reason",
      rejectedOrderDetail.status === 200 &&
        rejectedOrderDetail.data?.order?.payment_proof_rejected_reason === "unreadable" &&
        rejectedOrderDetail.data?.order?.payment_proof_rejected_note === "smoke test reject",
      JSON.stringify(rejectedOrderDetail.data?.order)
    );
    console.log("OK  GET /me/orders/:orderId (rejection reason visible to buyer)");

    /* 審核 context：Admin 必須能在同一個 payload 內拿到判斷所需的一切。 */
    const proofDetail = await http("GET", `/admin/payment-proofs/${proofRejectId}`, { token: adminToken });
    expect(
      "GET /admin/payment-proofs/:id (decision context)",
      proofDetail.status === 200 &&
        proofDetail.data?.proof?.order_id === rejectedOrderId &&
        typeof proofDetail.data?.proof?.buyer_email === "string" &&
        proofDetail.data?.proof?.order_total_amount != null &&
        proofDetail.data?.proof?.order_payment_due_at != null &&
        Array.isArray(proofDetail.data?.orderItems) &&
        Array.isArray(proofDetail.data?.otherProofs),
      JSON.stringify(proofDetail.data?.proof)
    );
    console.log("OK  GET /admin/payment-proofs/:id (order + buyer + items + sibling proofs)");

    /* Human-friendly lookup：用訂單編號與買家 email 都要找得到。 */
    const proofByOrder = await http(
      "GET",
      `/admin/payment-proofs?q=${encodeURIComponent(rejectedOrderId)}`,
      { token: adminToken }
    );
    expect(
      "GET /admin/payment-proofs?q=<order id>",
      proofByOrder.status === 200 &&
        Array.isArray(proofByOrder.data?.items) &&
        proofByOrder.data.items.some((it) => String(it.id) === String(proofRejectId)) &&
        proofByOrder.data?.statusCounts?.total >= 1,
      JSON.stringify(proofByOrder.data?.pagination)
    );
    const proofByEmail = await http(
      "GET",
      `/admin/payment-proofs?q=${encodeURIComponent(emails.parent)}`,
      { token: adminToken }
    );
    expect(
      "GET /admin/payment-proofs?q=<buyer email>",
      proofByEmail.status === 200 &&
        Array.isArray(proofByEmail.data?.items) &&
        proofByEmail.data.items.some((it) => String(it.id) === String(proofRejectId)),
      JSON.stringify(proofByEmail.data?.pagination)
    );
    console.log("OK  GET /admin/payment-proofs?q= (order id / buyer email lookup)");

    // Dashboard summary：憑證遭駁回的訂單仍停留在 pending_payment，
    // 因此計入 ordersCount（本輪第 2 筆），但不得計入 revenueAmount。
    const s = await fetchAdminSummary(adminToken);
    expect(
      "GET /admin/dashboard/summary (rejected-proof order counts toward ordersCount)",
      s.ordersCount === summaryBaseline.ordersCount + 2,
      `expected ordersCount ${summaryBaseline.ordersCount + 2}, got ${s.ordersCount}`
    );
    expect(
      "GET /admin/dashboard/summary (rejected-proof order excluded from revenue)",
      s.revenueAmount === summaryBaseline.revenueAmount + orderAmount,
      `expected revenue unchanged at ${summaryBaseline.revenueAmount + orderAmount}, got ${s.revenueAmount}`
    );
    console.log("OK  GET /admin/dashboard/summary (rejected proof: +1 order, +0 revenue)");
  }

  // Dashboard summary：reporting period 的 HTTP 契約（語意細節由 Backend/tests/ 覆蓋）。
  {
    const def = await http("GET", "/admin/dashboard/summary", { token: adminToken });
    expect(
      "GET /admin/dashboard/summary (default period metadata)",
      def.status === 200 &&
        def.data?.periodTimezone === "Asia/Taipei" &&
        def.data?.periodPreset === "30d" &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(def.data?.periodFrom)) &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(def.data?.periodTo)),
      JSON.stringify(def.data)
    );

    const today = String(def.data.periodTo);
    const single = await http("GET", `/admin/dashboard/summary?range=custom&from=${today}&to=${today}`, {
      token: adminToken,
    });
    expect(
      "GET /admin/dashboard/summary?range=custom",
      single.status === 200 && single.data?.periodFrom === today && single.data?.periodTo === today,
      JSON.stringify(single.data)
    );
    // snapshot / all-time 欄位不得隨期間改變。
    for (const key of ["ordersCount", "usersCount", "materialsCount", "reviewsCount", "revenueAmount"]) {
      expect(
        `GET /admin/dashboard/summary (${key} is period-independent)`,
        single.data[key] === def.data[key],
        `${key}: 30d=${def.data[key]} vs single-day=${single.data[key]}`
      );
    }

    for (const [label, qs] of [
      ["unknown preset", "range=abc"],
      ["malformed date", "range=custom&from=2026-8-1&to=2026-08-20"],
      ["non-existent date", "range=custom&from=2026-02-31&to=2026-08-20"],
      ["incomplete custom", "range=custom&from=2026-08-01"],
      ["from after to", "range=custom&from=2026-08-20&to=2026-08-01"],
    ]) {
      const bad = await http("GET", `/admin/dashboard/summary?${qs}`, { token: adminToken });
      expect(
        `GET /admin/dashboard/summary (${label} → 400)`,
        bad.status === 400 && bad.data?.error === "INVALID_DATE_RANGE",
        `${qs} → ${bad.status} ${JSON.stringify(bad.data)}`
      );
    }
    console.log("OK  GET /admin/dashboard/summary (period metadata, custom range, invalid range → 400)");

    // Comparison：previous period 由 Backend 解析並回傳；deltaPercent 只能是數字或 null。
    const cmp = await http("GET", "/admin/dashboard/summary?range=7d", { token: adminToken });
    expect(
      "GET /admin/dashboard/summary (previous period metadata)",
      cmp.status === 200 &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(cmp.data?.previousPeriodFrom)) &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(cmp.data?.previousPeriodTo)) &&
        cmp.data.previousPeriodTo < cmp.data.periodFrom,
      JSON.stringify(cmp.data)
    );
    for (const key of [
      "revenueDeltaPercent", "newOrdersDeltaPercent", "newUsersDeltaPercent",
      "newMaterialsDeltaPercent", "newReviewsDeltaPercent",
    ]) {
      const v = cmp.data[key];
      expect(
        `GET /admin/dashboard/summary (${key} is a finite number or null)`,
        v === null || Number.isFinite(v),
        `${key} = ${JSON.stringify(v)}`
      );
    }
    console.log("OK  GET /admin/dashboard/summary (previous period + deltaPercent)");
  }

  // Dashboard trends：粒度、bucket 補 0、與 summary 共用的期間契約。
  {
    const daily = await http("GET", "/admin/dashboard/trends?range=7d", { token: adminToken });
    expect(
      "GET /admin/dashboard/trends?range=7d",
      daily.status === 200 &&
        daily.data?.granularity === "day" &&
        Array.isArray(daily.data?.revenue) &&
        daily.data.revenue.length === 7 &&
        daily.data.orders.length === 7 &&
        daily.data.periodTimezone === "Asia/Taipei",
      JSON.stringify(daily.data)
    );
    // 每個 bucket 都必須存在且為數字（補 0），圖表不能跳日期。
    expect(
      "GET /admin/dashboard/trends (gap-filled buckets)",
      daily.data.revenue.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.key) && Number.isFinite(p.value)) &&
        daily.data.revenue[0].key === daily.data.periodFrom &&
        daily.data.revenue[6].key === daily.data.periodTo,
      JSON.stringify(daily.data.revenue)
    );

    const hourly = await http("GET", "/admin/dashboard/trends?range=today", { token: adminToken });
    expect(
      "GET /admin/dashboard/trends?range=today (hourly, 24 buckets)",
      hourly.status === 200 &&
        hourly.data?.granularity === "hour" &&
        hourly.data.revenue.length === 24 &&
        hourly.data.revenue[0].key === `${hourly.data.periodFrom}T00` &&
        hourly.data.revenue[23].key === `${hourly.data.periodFrom}T23`,
      JSON.stringify(hourly.data?.revenue?.slice(0, 2))
    );

    // Trend 的期間契約必須與 summary 完全一致，不得自行 fallback。
    const badTrend = await http("GET", "/admin/dashboard/trends?range=abc", { token: adminToken });
    expect(
      "GET /admin/dashboard/trends (invalid range → 400)",
      badTrend.status === 400 && badTrend.data?.error === "INVALID_DATE_RANGE",
      `${badTrend.status} ${JSON.stringify(badTrend.data)}`
    );
    console.log("OK  GET /admin/dashboard/trends (daily/hourly granularity, gap fill, invalid range → 400)");
  }

  /*
   * Creator sales：與 Admin 共用同一套 reporting range 契約，且金額語意刻意不同。
   * 這個 teacher 在本輪剛賣出一筆已核准訂單（金額 orderAmount），因此可做絕對值斷言。
   */
  {
    const summary = await http("GET", "/teacher/sales/summary?range=30d", { token: teacherToken });
    expect(
      "GET /teacher/sales/summary?range=30d",
      summary.status === 200 &&
        summary.data?.periodTimezone === "Asia/Taipei" &&
        summary.data?.periodPreset === "30d" &&
        summary.data?.granularity === "day" &&
        Array.isArray(summary.data?.trend) &&
        summary.data.trend.length === 30,
      JSON.stringify({ ...summary.data, trend: undefined })
    );
    // Canonical 欄位與 deprecated alias 必須同值。
    expect(
      "GET /teacher/sales/summary (totalSalesAmount is canonical, totalRevenue is its alias)",
      summary.data.totalSalesAmount === summary.data.totalRevenue,
      JSON.stringify({ totalSalesAmount: summary.data.totalSalesAmount, totalRevenue: summary.data.totalRevenue })
    );
    // 本輪核准的那一筆（無折扣）必須反映在銷售額中。
    expect(
      "GET /teacher/sales/summary (approved sale is recognised)",
      summary.data.totalSalesAmount >= orderAmount && summary.data.totalOrders >= 1,
      `expected at least ${orderAmount}, got ${summary.data.totalSalesAmount}`
    );
    // trend key 必須是 machine-friendly 字串，不是 PostgreSQL date 物件。
    expect(
      "GET /teacher/sales/summary (trend keys are gap-filled date strings)",
      summary.data.trend.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.key) && Number.isFinite(p.salesAmount)) &&
        summary.data.trend[0].key === summary.data.periodFrom &&
        summary.data.trend[29].key === summary.data.periodTo,
      JSON.stringify(summary.data.trend.slice(0, 2))
    );
    const trendSum = summary.data.trend.reduce((acc, p) => acc + Number(p.salesAmount || 0), 0);
    expect(
      "GET /teacher/sales/summary (trend reconciles with the period total)",
      trendSum === summary.data.totalSalesAmount,
      `trend Σ ${trendSum} vs total ${summary.data.totalSalesAmount}`
    );

    const hourly = await http("GET", "/teacher/sales/summary?range=today", { token: teacherToken });
    expect(
      "GET /teacher/sales/summary?range=today (hourly, 24 buckets)",
      hourly.status === 200 && hourly.data?.granularity === "hour" && hourly.data.trend.length === 24,
      JSON.stringify({ granularity: hourly.data?.granularity, len: hourly.data?.trend?.length })
    );

    const materials = await http("GET", "/teacher/sales/materials?range=30d", { token: teacherToken });
    expect(
      "GET /teacher/sales/materials?range=30d",
      materials.status === 200 &&
        Array.isArray(materials.data?.items) &&
        materials.data?.periodTimezone === "Asia/Taipei" &&
        materials.data.items.every((it) => it.salesAmount === it.revenue),
      JSON.stringify(materials.data)
    );

    const records = await http("GET", "/teacher/sales/records?range=30d", { token: teacherToken });
    expect(
      "GET /teacher/sales/records?range=30d",
      records.status === 200 &&
        Array.isArray(records.data?.items) &&
        records.data.items.length >= 1 &&
        // 只列已成交且有認列時間的明細；不得出現 pending_payment 或 paid_at 為 NULL 的列。
        records.data.items.every((it) => it.orderStatus === "approved" && it.paidAt != null),
      JSON.stringify(records.data?.items?.slice(0, 2))
    );

    // 期間契約與 Admin 完全一致：三支都必須拒絕不合法的 range。
    for (const path of ["summary", "materials", "records"]) {
      const bad = await http(`GET`, `/teacher/sales/${path}?range=abc`, { token: teacherToken });
      expect(
        `GET /teacher/sales/${path} (invalid range → 400)`,
        bad.status === 400 && bad.data?.error === "INVALID_DATE_RANGE",
        `${bad.status} ${JSON.stringify(bad.data)}`
      );
    }

    // 跨創作者隔離：另一個 teacher 看不到這筆銷售。
    const otherTeacher = await http("POST", "/auth/register", {
      body: { email: `smoke_teacher2_${stamp}@test.local`, password, role: "teacher" },
    });
    expect("POST /auth/register (second teacher)", otherTeacher.status === 201 && otherTeacher.data?.token, JSON.stringify(otherTeacher.data));
    const isolated = await http("GET", "/teacher/sales/summary?range=30d", { token: otherTeacher.data.token });
    expect(
      "GET /teacher/sales/summary (cross-creator isolation)",
      isolated.status === 200 && isolated.data.totalSalesAmount === 0 && isolated.data.totalOrders === 0,
      JSON.stringify({ totalSalesAmount: isolated.data?.totalSalesAmount, totalOrders: isolated.data?.totalOrders })
    );

    // 非 teacher 角色不得存取。
    const asParent = await http("GET", "/teacher/sales/summary?range=30d", { token: parentToken });
    expect("GET /teacher/sales/summary (non-teacher → 403)", asParent.status === 403, `got ${asParent.status}`);

    console.log("OK  GET /teacher/sales/{summary,materials,records} (period contract, gross sales, isolation, 400/403)");
  }

  // Download
  {
    const dl = await http("GET", `/download/${materialId}`, { token: parentToken });
    expect("GET /download/:materialId", dl.status === 200 && dl.data?.signedUrl, JSON.stringify(dl.data));
    console.log("OK  GET /download/:materialId");
  }

  // Review
  {
    const rv = await http("POST", "/reviews", {
      token: parentToken,
      body: { material_id: materialId, rating: 5, comment: "smoke" },
    });
    expect("POST /reviews", rv.status === 201 && rv.data?.material_id === materialId, JSON.stringify(rv.data));
    console.log("OK  POST /reviews");
  }

  // GET /me/reviews
  {
    const mr = await http("GET", "/me/reviews", { token: parentToken });
    expect(
      "GET /me/reviews",
      mr.status === 200 && Array.isArray(mr.data) && mr.data.some((r) => r.material_id === materialId),
      JSON.stringify(mr.data)
    );
    console.log("OK  GET /me/reviews");
  }

  // GET /materials/:id/reviews
  {
    const lr = await http("GET", `/materials/${materialId}/reviews`);
    expect("GET /materials/:id/reviews", lr.status === 200 && Array.isArray(lr.data) && lr.data.length >= 1, JSON.stringify(lr.data));
    console.log("OK  GET /materials/:id/reviews");
  }

  // GET /materials/:id/rating
  {
    const rt = await http("GET", `/materials/${materialId}/rating`);
    expect(
      "GET /materials/:id/rating",
      rt.status === 200 && rt.data?.count >= 1 && rt.data?.average !== null && rt.data?.average !== undefined,
      JSON.stringify(rt.data)
    );
    console.log("OK  GET /materials/:id/rating");
  }

  // Report（Day20：pending → reviewed；列表請用 GET /admin/materials/:materialId/reports）
  {
    const rep = await http("POST", "/reports", {
      token: parentToken,
      body: { material_id: materialId, materialId, reason: "smoke report" },
    });
    expect(
      "POST /reports",
      rep.status === 201 &&
        rep.data?.material_id === materialId &&
        rep.data?.reporter_id === parentId &&
        rep.data?.status === "pending",
      JSON.stringify(rep.data)
    );
    console.log("OK  POST /reports");

    const dup = await http("POST", "/reports", {
      token: parentToken,
      body: { material_id: materialId, materialId, reason: "duplicate" },
    });
    expect(
      "POST /reports duplicate",
      dup.status === 409 && dup.data?.message === "Already reported",
      JSON.stringify(dup.data)
    );

    const mrRep = await http("GET", `/admin/materials/${materialId}/reports`, { token: adminToken });
    expect(
      "GET /admin/materials/:materialId/reports",
      mrRep.status === 200 &&
        Array.isArray(mrRep.data) &&
        mrRep.data.some((r) => r.reason === "smoke report" && r.status === "pending"),
      JSON.stringify(mrRep.data)
    );
    console.log("OK  GET /admin/materials/:materialId/reports");

    const reportId = rep.data.id;
    const reviewed = await http("PATCH", `/admin/reports/${reportId}`, {
      token: adminToken,
      body: { status: "reviewed" },
    });
    expect(
      "PATCH /admin/reports/:id (reviewed)",
      reviewed.status === 200 &&
        reviewed.data?.status === "reviewed" &&
        reviewed.data?.reviewed_at != null,
      JSON.stringify(reviewed.data)
    );
    console.log("OK  PATCH /admin/reports/:id");

    const mrRep2 = await http("GET", `/admin/materials/${materialId}/reports`, { token: adminToken });
    expect(
      "GET /admin/materials/:materialId/reports after reviewed",
      mrRep2.status === 200 &&
        mrRep2.data.some((r) => r.id === reportId && r.status === "reviewed"),
      JSON.stringify(mrRep2.data)
    );
    console.log("OK  report status pending → reviewed");
  }

  /*
   * 檢舉案件工作流（docs/mvp_rules.md §6）。
   *
   * 走一次完整的正向路徑，並證明兩件容易被做錯的事：
   *   1. 終態不可再被改判（第二次 resolve → 409）
   *   2. `unpublish_material` 真的會把教材下架，不是只改案件狀態
   */
  {
    const rep = await http("POST", "/reports", {
      token: parentToken,
      body: { material_id: materialRejectIdRef, reason: "smoke case workflow" },
    });
    expect("POST /reports (case workflow)", rep.status === 201, JSON.stringify(rep.data));
    const caseId = rep.data.id;

    const queue = await http("GET", "/admin/report-cases?status=open&limit=100", { token: adminToken });
    expect(
      "GET /admin/report-cases?status=open",
      queue.status === 200 &&
        Array.isArray(queue.data?.items) &&
        queue.data.items.some((c) => c.id === caseId) &&
        // enrich 欄位必須存在，否則 Admin 只看得到 id
        queue.data.items.every((c) => "material_title" in c && "reporter_email" in c),
      JSON.stringify(queue.data?.pagination)
    );

    const badStatus = await http("GET", "/admin/report-cases?status=banana", { token: adminToken });
    expect("GET /admin/report-cases?status=banana -> 400", badStatus.status === 400, JSON.stringify(badStatus.data));

    const inv = await http("POST", `/admin/report-cases/${caseId}/investigate`, { token: adminToken, body: {} });
    expect("POST /admin/report-cases/:id/investigate", inv.status === 200, JSON.stringify(inv.data));

    const askNoMessage = await http("POST", `/admin/report-cases/${caseId}/request-response`, {
      token: adminToken,
      body: {},
    });
    expect(
      "POST …/request-response without message -> 400",
      askNoMessage.status === 400,
      JSON.stringify(askNoMessage.data)
    );

    const ask = await http("POST", `/admin/report-cases/${caseId}/request-response`, {
      token: adminToken,
      body: { message: "smoke: please explain the source" },
    });
    expect("POST /admin/report-cases/:id/request-response", ask.status === 200, JSON.stringify(ask.data));

    /* Admin 內部筆記：不改狀態，且創作者看不到。 */
    const note = await http("POST", `/admin/report-cases/${caseId}/notes`, {
      token: adminToken,
      body: { message: "smoke: internal note" },
    });
    expect("POST /admin/report-cases/:id/notes", note.status === 200, JSON.stringify(note.data));

    /* Creator 端：看得到待回覆案件，看不到內部筆記與檢舉人身分。 */
    const creatorQueue = await http("GET", "/creator/cases?scope=action_required", { token: teacherToken });
    expect(
      "GET /creator/cases?scope=action_required",
      creatorQueue.status === 200 &&
        creatorQueue.data.items.some((c) => c.id === caseId) &&
        creatorQueue.data.actionRequiredCount >= 1 &&
        creatorQueue.data.items.every((c) => !("reporter_id" in c) && !("reporter_email" in c)),
      JSON.stringify(creatorQueue.data?.pagination)
    );

    const creatorDetail = await http("GET", `/creator/cases/${caseId}`, { token: teacherToken });
    expect(
      "GET /creator/cases/:id (no admin_note, canRespond)",
      creatorDetail.status === 200 &&
        creatorDetail.data?.canRespond === true &&
        creatorDetail.data.events.every((e) => e.event_type !== "admin_note") &&
        creatorDetail.data.events.some((e) => e.event_type === "creator_response_requested"),
      JSON.stringify(creatorDetail.data?.events?.map((e) => e.event_type))
    );

    /* 別人的案件一律 404（不是 403 —— 403 會洩漏 case id 存在）。 */
    const foreign = await http("GET", `/creator/cases/${caseId}`, { token: parentToken });
    expect(
      "GET /creator/cases/:id as non-creator -> 403 (role gate)",
      foreign.status === 403,
      JSON.stringify(foreign.data)
    );

    const respond = await http("POST", `/creator/cases/${caseId}/respond`, {
      token: teacherToken,
      body: { message: "smoke: original artwork, licence attached" },
    });
    expect("POST /creator/cases/:id/respond", respond.status === 200, JSON.stringify(respond.data));

    /* 回覆之後不再是 awaiting_creator，重複回覆必須 409。 */
    const respondAgain = await http("POST", `/creator/cases/${caseId}/respond`, {
      token: teacherToken,
      body: { message: "smoke: duplicate" },
    });
    expect(
      "POST /creator/cases/:id/respond twice -> 409",
      respondAgain.status === 409,
      JSON.stringify(respondAgain.data)
    );

    const badResolution = await http("POST", `/admin/report-cases/${caseId}/resolve`, {
      token: adminToken,
      body: { resolution: "suspend_user" },
    });
    expect(
      "POST …/resolve with unsupported resolution -> 400",
      badResolution.status === 400,
      JSON.stringify(badResolution.data)
    );

    const resolved = await http("POST", `/admin/report-cases/${caseId}/resolve`, {
      token: adminToken,
      body: { resolution: "unpublish_material", note: "smoke: confirmed" },
    });
    expect(
      "POST /admin/report-cases/:id/resolve (unpublish_material)",
      resolved.status === 200 && resolved.data?.effects?.materialUnpublished === true,
      JSON.stringify(resolved.data)
    );

    /* 處置真的落到教材上，不是只改案件狀態。 */
    const mat = await http("GET", `/materials/${materialRejectIdRef}`, { token: adminToken });
    expect(
      "material unpublished by moderation resolution",
      mat.status === 200 && mat.data?.status === "unpublished",
      JSON.stringify({ status: mat.data?.status })
    );

    /* 終態不可再被改判。 */
    const resolveAgain = await http("POST", `/admin/report-cases/${caseId}/resolve`, {
      token: adminToken,
      body: { resolution: "dismissed" },
    });
    expect(
      "POST …/resolve on a closed case -> 409",
      resolveAgain.status === 409,
      JSON.stringify(resolveAgain.data)
    );

    /* 詳情帶完整歷程 + allowedTransitions（結案後為空）。 */
    const detail = await http("GET", `/admin/report-cases/${caseId}`, { token: adminToken });
    expect(
      "GET /admin/report-cases/:id (timeline + allowedTransitions)",
      detail.status === 200 &&
        detail.data?.report?.status === "resolved" &&
        detail.data?.report?.resolution === "unpublish_material" &&
        Array.isArray(detail.data?.allowedTransitions) &&
        detail.data.allowedTransitions.length === 0 &&
        detail.data.events.some((e) => e.event_type === "admin_note") &&
        detail.data.events.some((e) => e.event_type === "creator_response") &&
        detail.data.events.some((e) => e.event_type === "resolution"),
      JSON.stringify(detail.data?.events?.map((e) => e.event_type))
    );
    console.log("OK  report case workflow (investigate → ask → respond → resolve → closed)");
  }

  // Admin lists
  {
    const m = await http("GET", "/admin/materials", { token: adminToken });
    expect(
      "GET /admin/materials",
      m.status === 200 &&
        Array.isArray(m.data?.items) &&
        m.data?.pagination?.limit === 20 &&
        typeof m.data?.statusCounts?.total === "number",
      JSON.stringify({ pagination: m.data?.pagination, statusCounts: m.data?.statusCounts })
    );

    /*
     * 分頁上限是硬的：limit=10000 會被靜默改成 100。
     * 「一次抓完整張表」不得是一個可用的呼叫方式。
     */
    const mCapped = await http("GET", "/admin/materials?limit=10000", { token: adminToken });
    expect(
      "GET /admin/materials?limit=10000 (capped at 100)",
      mCapped.status === 200 && mCapped.data?.pagination?.limit === 100,
      JSON.stringify(mCapped.data?.pagination)
    );

    /* statusCounts 是全表計數，不受篩選影響 —— Dashboard 的教材 KPI 靠它。 */
    const mPending = await http("GET", "/admin/materials?status=pending_review&limit=1", { token: adminToken });
    expect(
      "GET /admin/materials?status=pending_review (statusCounts unaffected by filter)",
      mPending.status === 200 &&
        mPending.data.items.length <= 1 &&
        mPending.data?.statusCounts?.total === m.data?.statusCounts?.total,
      JSON.stringify(mPending.data?.statusCounts)
    );

    /* 非法 status / sort 一律 400，不得靜默回空集合。 */
    const mBadStatus = await http("GET", "/admin/materials?status=draft", { token: adminToken });
    expect(
      "GET /admin/materials?status=draft -> 400 (draft is not a real material status)",
      mBadStatus.status === 400,
      JSON.stringify(mBadStatus.data)
    );
    const mBadSort = await http("GET", "/admin/materials?sort=id;DROP", { token: adminToken });
    expect("GET /admin/materials?sort=<invalid> -> 400", mBadSort.status === 400, JSON.stringify(mBadSort.data));

    /* 搜尋走人類可讀欄位（教材標題）。 */
    const mSearch = await http("GET", `/admin/materials?q=${encodeURIComponent(`Smoke reject-flow ${stamp}`)}`, {
      token: adminToken,
    });
    expect(
      "GET /admin/materials?q=<title>",
      mSearch.status === 200 && mSearch.data.items.length >= 1,
      JSON.stringify(mSearch.data?.pagination)
    );
    console.log("OK  GET /admin/materials (filter / search / sort / pagination contract)");

    /*
     * Activity log 的人類可讀搜尋（docs/mvp_rules.md §21）。
     * 既有的精確比對參數不變；`q` 是額外的 AND 條件。
     */
    const logFilters = await http("GET", "/admin/activity-logs/filters", { token: adminToken });
    expect(
      "GET /admin/activity-logs/filters",
      logFilters.status === 200 &&
        Array.isArray(logFilters.data?.actions) &&
        Array.isArray(logFilters.data?.actorRoles) &&
        logFilters.data.actions.some((a) => a.action === "payment_proof.approved"),
      JSON.stringify(logFilters.data?.actions?.slice(0, 3))
    );

    const logByEmail = await http(
      "GET",
      `/admin/activity-logs?q=${encodeURIComponent(emails.parent)}&limit=100`,
      { token: adminToken }
    );
    expect(
      "GET /admin/activity-logs?q=<user email>",
      logByEmail.status === 200 &&
        Array.isArray(logByEmail.data?.items) &&
        logByEmail.data.items.length >= 1 &&
        // 每列必須帶得出可讀的操作者，否則 UI 只能顯示 id
        logByEmail.data.items.every((it) => "actor_email" in it && "target_label" in it),
      JSON.stringify(logByEmail.data?.pagination)
    );

    const logByOrder = await http(
      "GET",
      `/admin/activity-logs?q=${encodeURIComponent(rejectedOrderId)}&limit=100`,
      { token: adminToken }
    );
    expect(
      "GET /admin/activity-logs?q=<order id>",
      logByOrder.status === 200 && logByOrder.data.items.some((it) => it.target_id === rejectedOrderId),
      JSON.stringify(logByOrder.data?.pagination)
    );

    /* 未來日期區間必然是空集合 —— 證明 from/to 真的有作用。 */
    const logFuture = await http("GET", "/admin/activity-logs?from=2099-01-01&to=2099-12-31", {
      token: adminToken,
    });
    expect(
      "GET /admin/activity-logs?from/to (future window is empty)",
      logFuture.status === 200 && logFuture.data.items.length === 0 && logFuture.data.pagination.total === 0,
      JSON.stringify(logFuture.data?.pagination)
    );
    console.log("OK  GET /admin/activity-logs (human-readable search + date range + filters)");

    const o = await http("GET", "/admin/orders", { token: adminToken });
    expect("GET /admin/orders", o.status === 200 && Array.isArray(o.data?.items), JSON.stringify(o.data));

    /*
     * `?status=` 篩的是 **Admin operational state**（`orders.status` + 付款憑證衍生），
     * 不是 `orders.status` 原始值。本輪這兩筆訂單剛好覆蓋兩個關鍵 bucket：
     *   orderId         → 憑證已核准 → approved
     *   rejectedOrderId → 憑證被退回、尚未重新上傳 → payment_rejected
     * 後者在舊版會被歸進「待付款」，正是這次要修掉的語意錯誤。
     */
    const hasId = (res, id) => Array.isArray(res.data?.items) && res.data.items.some((it) => String(it.id) === String(id));

    const oApproved = await http("GET", "/admin/orders?status=approved", { token: adminToken });
    expect(
      "GET /admin/orders?status=approved",
      oApproved.status === 200 &&
        hasId(oApproved, orderId) &&
        oApproved.data.items.every((it) => it.operational_status === "approved"),
      JSON.stringify(oApproved.data)
    );

    const oRejected = await http("GET", "/admin/orders?status=payment_rejected", { token: adminToken });
    expect(
      "GET /admin/orders?status=payment_rejected",
      oRejected.status === 200 &&
        hasId(oRejected, rejectedOrderId) &&
        oRejected.data.items.every((it) => it.operational_status === "payment_rejected"),
      JSON.stringify(oRejected.data)
    );

    const oAwaiting = await http("GET", "/admin/orders?status=awaiting_payment", { token: adminToken });
    expect(
      "GET /admin/orders?status=awaiting_payment (excludes rejected-proof order)",
      oAwaiting.status === 200 && !hasId(oAwaiting, rejectedOrderId) && !hasId(oAwaiting, orderId),
      JSON.stringify(oAwaiting.data)
    );

    const oPendingReview = await http("GET", "/admin/orders?status=pending_review", { token: adminToken });
    expect(
      "GET /admin/orders?status=pending_review",
      oPendingReview.status === 200 &&
        oPendingReview.data.items.every(
          (it) => it.operational_status === "pending_review" && Number(it.payment_proof_pending_review_count) > 0
        ),
      JSON.stringify(oPendingReview.data)
    );

    // 非法值必須 400，不得靜默回空集合。
    const oBanana = await http("GET", "/admin/orders?status=banana", { token: adminToken });
    expect("GET /admin/orders?status=banana → 400", oBanana.status === 400, JSON.stringify(oBanana.data));

    // dead / raw order status 不再是合法 token（`paid` 尤其：歷史語意是「已核准」而非「待審核」）。
    for (const dead of ["paid", "completed", "pending_payment"]) {
      const res = await http("GET", `/admin/orders?status=${dead}`, { token: adminToken });
      expect(`GET /admin/orders?status=${dead} → 400`, res.status === 400, JSON.stringify(res.data));
    }
    console.log("OK  GET /admin/orders?status=<operational state> (+ 400 on legacy/invalid tokens)");

    const proofsPending = await http("GET", "/admin/payment-proofs?status=pending&page=1&limit=20", {
      token: adminToken,
    });
    expect(
      "GET /admin/payment-proofs?status=pending",
      proofsPending.status === 200 &&
        Array.isArray(proofsPending.data?.items) &&
        proofsPending.data?.pagination?.page === 1 &&
        proofsPending.data?.pagination?.limit === 20,
      JSON.stringify(proofsPending.data)
    );

    const proofsApproved = await http("GET", "/admin/payment-proofs?status=approved&page=1&limit=20", {
      token: adminToken,
    });
    expect(
      "GET /admin/payment-proofs?status=approved",
      proofsApproved.status === 200 &&
        Array.isArray(proofsApproved.data?.items) &&
        proofsApproved.data?.items.some((p) => String(p.id) === String(proofId)),
      JSON.stringify(proofsApproved.data)
    );

    const proofsRejected = await http("GET", "/admin/payment-proofs?status=rejected&page=1&limit=20", {
      token: adminToken,
    });
    expect(
      "GET /admin/payment-proofs?status=rejected",
      proofsRejected.status === 200 &&
        Array.isArray(proofsRejected.data?.items) &&
        proofsRejected.data?.items.length >= 1,
      JSON.stringify(proofsRejected.data)
    );

    const logs = await http("GET", "/admin/activity-logs?page=1&limit=20", { token: adminToken });
    expect(
      "GET /admin/activity-logs",
      logs.status === 200 &&
        Array.isArray(logs.data?.items) &&
        logs.data?.pagination?.total != null &&
        logs.data?.pagination?.page === 1 &&
        logs.data?.pagination?.limit === 20,
      JSON.stringify(logs.data)
    );

    const reps = await http("GET", "/admin/reports", { token: adminToken });
    expect("GET /admin/reports", reps.status === 200 && Array.isArray(reps.data), JSON.stringify(reps.data));

    console.log("OK  GET /admin/materials, /admin/orders, /admin/payment-proofs, /admin/activity-logs, /admin/reports");
  }

  // Cart delete (optional — cart empty after order; expect 404 or empty)
  if (cartItemId) {
    const del = await http("DELETE", `/cart/items/${cartItemId}`, { token: parentToken });
    expect(
      "DELETE /cart/items/:id",
      del.status === 404 || del.status === 200,
      `unexpected ${del.status}`
    );
    console.log("OK  DELETE /cart/items/:id (expected 404 after checkout)");
  }

  console.log("\n\x1b[32mAll smoke checks passed.\x1b[0m");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
