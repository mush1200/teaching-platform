/**
 * 後端 API 冒煙驗證（等同 Postman 手動跑一輪 Happy Path）。
 *
 * 用法：
 *   1) 終端 A：在 Backend 目錄執行 `npm run start`（依賴 Backend/.env 連線資料庫）
 *      ⚠️ 若在 shell 先設了 PGDATABASE／PGHOST 等，會覆蓋 .env；請勿與 .env 不一致。
 *   2) 終端 B：`npm run smoke` 或 `API_SMOKE_BASE=http://localhost:3000 node scripts/api-smoke-test.js`
 *
 * 選項環境變數：
 *   API_SMOKE_BASE  預設 http://127.0.0.1:3000
 *
 * 涵蓋：health、auth、materials、cart、orders、upload-proof、admin approve/reject、
 *       download、reviews、reports、admin 列表（含 payment-proofs）、DELETE cart（預期 404）。
 */

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
    ipDeclarationAccepted: true,
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
    admin: `smoke_admin_${stamp}@test.local`,
    teacher: `smoke_teacher_${stamp}@test.local`,
    parent: `smoke_parent_${stamp}@test.local`,
  };
  const password = "SmokeTest1!";

  console.log("Base URL:", BASE);

  // Health
  {
    const { status, data } = await http("GET", "/health");
    expect("GET /health", status === 200 && data?.status === "ok", JSON.stringify(data));
    console.log("OK  GET /health");
  }

  // Register ×3
  let adminToken;
  let teacherToken;
  let parentToken;
  let teacherId;
  let parentId;
  {
    const rA = await http("POST", "/auth/register", {
      body: { email: emails.admin, password, role: "admin" },
    });
    expect("POST /auth/register admin", rA.status === 201 && rA.data?.token, JSON.stringify(rA.data));
    adminToken = rA.data.token;

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

    console.log("OK  POST /auth/register (admin, teacher, parent)");
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

    const rj = await http("POST", `/admin/payment-proofs/${proofRejectId}/reject`, {
      token: adminToken,
      body: { note: "smoke test reject" },
    });
    expect(
      "POST /admin/payment-proofs/:id/reject",
      rj.status === 200 && rj.data?.proof?.review_status === "rejected",
      JSON.stringify(rj.data)
    );
    console.log("OK  POST /admin/payment-proofs/:id/reject (+ second order flow)");
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

  // Admin lists
  {
    const m = await http("GET", "/admin/materials", { token: adminToken });
    expect("GET /admin/materials", m.status === 200 && Array.isArray(m.data?.items), JSON.stringify(m.data));

    const o = await http("GET", "/admin/orders", { token: adminToken });
    expect("GET /admin/orders", o.status === 200 && Array.isArray(o.data?.items), JSON.stringify(o.data));

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
