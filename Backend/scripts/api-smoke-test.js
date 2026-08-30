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

/**
 * 產生一個**最小但合法**的 PDF。
 *
 * 上傳端會驗 magic bytes，所以 fixture 不能是隨手一串位元組 —— 那正是這一層要擋掉的東西。
 * 每次內容不同（帶入 seed），才能驗證 SHA-256 round-trip 真的對到這一份檔案。
 */
function makeSmokePdf(seed) {
  return Buffer.from(`%PDF-1.7
% smoke fixture ${seed}
1 0 obj<</Type/Catalog>>endobj
trailer<</Root 1 0 R>>
%%EOF
`, "latin1");
}

/** 上傳一份教材本體檔案，回傳 `{ fileId, bytes }`（bytes 供 checksum 比對）。 */
async function uploadSmokeMaterialFile(token, seed) {
  const bytes = makeSmokePdf(seed);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), `smoke_${seed}.pdf`);
  const res = await http("POST", "/teacher/uploads/material-file", { token, rawBody: form });
  expect(
    "POST /teacher/uploads/material-file",
    res.status === 201 && res.data?.fileId,
    JSON.stringify(res.data)
  );
  return { fileId: res.data.fileId, bytes };
}

/**
 * 產生一張**最小但合法**的 PNG（magic bytes 是真的）。
 *
 * 素材上傳端會驗 magic bytes，所以 fixture 不能是隨手一串位元組 —— 那正是這一層
 * 要擋掉的東西（改個副檔名就能寫進伺服器磁碟）。
 */
function makeSmokePng(seed) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`IHDR smoke media ${seed}`, "latin1"),
  ]);
}

/** 上傳一張教材封面素材，回傳 `{ url, mediaId, bytes }`。 */
async function uploadSmokeMaterialMedia(token, seed, kind = "cover") {
  const bytes = makeSmokePng(seed);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), `smoke_${seed}.png`);
  const res = await http("POST", `/teacher/uploads/material-media?kind=${kind}`, {
    token,
    rawBody: form,
  });
  expect(
    "POST /teacher/uploads/material-media",
    res.status === 201 && res.data?.url && res.data?.mediaId,
    JSON.stringify(res.data)
  );
  return { url: res.data.url, mediaId: res.data.mediaId, bytes, response: res.data };
}

/** 素材交付路徑（相對於 BASE）。 */
function mediaPath(mediaId) {
  return `/materials/media/${mediaId}`;
}

/** 符合目前 POST /materials 必填欄位之最小 body（教學商品欄位）。 */
function smokeMaterialBody({ title, fileId, price = 100, coverImageUrl }) {
  return {
    title,
    price,
    fileId,
    cover_image_url: coverImageUrl || "https://picsum.photos/seed/smoke-cover/640/480",
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
  // 主教材的檔案位元組，稍後用來驗證買家下載到的內容逐位元組相同。
  let smokeMaterialFileBytes;
  // 封面素材：用來驗證「未上架素材不得匿名取得、上架後自動公開」（SEC-02）。
  let smokeCover;
  {
    const uploaded = await uploadSmokeMaterialFile(teacherToken, `main_${stamp}`);
    smokeMaterialFileBytes = uploaded.bytes;
    smokeCover = await uploadSmokeMaterialMedia(teacherToken, `cover_${stamp}`);

    // 上傳回應不得洩漏儲存資訊。
    const serialized = JSON.stringify(smokeCover.response);
    expect(
      "material media upload exposes no storage key or public path",
      !serialized.includes("material-media/") &&
        !serialized.includes("/uploads/") &&
        smokeCover.response.storage_key === undefined &&
        smokeCover.response.checksum_sha256 === undefined,
      serialized
    );
    console.log("OK  POST /teacher/uploads/material-media (no storage key leaked)");

    const { status, data } = await http("POST", "/materials", {
      token: teacherToken,
      body: smokeMaterialBody({
        title: `Smoke material ${stamp}`,
        fileId: uploaded.fileId,
        coverImageUrl: smokeCover.url,
      }),
    });
    expect("POST /materials", status === 201 && data?.id, JSON.stringify(data));
    materialId = data.id;
    console.log("OK  POST /materials");
  }

  /*
   * SEC-02 —— 素材可見性由所屬教材的 status 決定。
   *
   * 此刻教材是 `pending_review`：素材**不得**被匿名取得。這正是搬離
   * `express.static` 的理由 —— 舊實作在這一步就已經公開了。
   */
  {
    const anon = await http("GET", mediaPath(smokeCover.mediaId));
    expect(
      "material media of a pending_review material is not anonymous (401)",
      anon.status === 401 && anon.data?.error === "media_auth_required",
      `status=${anon.status} body=${JSON.stringify(anon.data)}`
    );

    const owner = await http("GET", mediaPath(smokeCover.mediaId), { token: teacherToken });
    expect("material media readable by owning creator", owner.status === 200, `status=${owner.status}`);

    const admin = await http("GET", mediaPath(smokeCover.mediaId), { token: adminToken });
    expect("material media readable by admin", admin.status === 200, `status=${admin.status}`);

    const buyer = await http("GET", mediaPath(smokeCover.mediaId), { token: parentToken });
    expect(
      "material media of an unpublished material denied to other signed-in users (403)",
      buyer.status === 403,
      `status=${buyer.status}`
    );
    console.log("OK  material media hidden while pending_review (401 anon / 403 other / 200 owner+admin)");

    // 舊的公開 static 路徑必須不再供應任何位元組。
    const publicProbe = await http("GET", "/uploads/material-media/anything.png");
    expect(
      "GET /uploads/material-media/* is no longer served",
      publicProbe.status === 404 && publicProbe.data?.error === "material_media_not_public",
      `status=${publicProbe.status} body=${JSON.stringify(publicProbe.data)}`
    );
    console.log("OK  /uploads/material-media/* returns 404 (no longer a static asset)");
  }

  /*
   * Admin 核准上架。
   *
   * 走正式的審核端點，**不是** `PUT /materials/:id { status }` ——
   * 後者已不再接受 status（教材狀態由審核 workflow 管理，見
   * docs/material-review-workflow.md）。這裡順便驗證那個防線還在。
   */
  {
    const legacy = await http("PUT", `/materials/${materialId}`, {
      token: adminToken,
      body: { status: "published" },
    });
    expect(
      "PUT /materials/:id no longer changes status",
      legacy.status === 400 && legacy.data?.error === "status_not_updatable_here",
      JSON.stringify(legacy.data)
    );

    const { status, data } = await http("POST", `/admin/materials/${materialId}/approve`, {
      token: adminToken,
      body: {},
    });
    expect(
      "POST /admin/materials/:id/approve",
      status === 200 && data?.material?.status === "published" && data?.material?.published_at,
      JSON.stringify(data)
    );
    console.log("OK  POST /admin/materials/:id/approve (published)");
  }

  /*
   * 上架之後，同一條素材 URL 對匿名訪客自動變成可取 —— 不需要搬檔案、不需要換 URL。
   * 這一段同時驗證交付的位元組與上傳的完全一致，以及公開素材允許共享快取。
   */
  {
    const probe = await fetch(`${BASE}${mediaPath(smokeCover.mediaId)}`);
    expect(
      "material media becomes anonymous after publish",
      probe.status === 200,
      `status=${probe.status}`
    );
    const cacheControl = String(probe.headers.get("cache-control") || "");
    expect(
      "published material media is cacheable and nosniff",
      cacheControl.includes("public") &&
        !cacheControl.includes("no-store") &&
        probe.headers.get("x-content-type-options") === "nosniff" &&
        String(probe.headers.get("content-type") || "").startsWith("image/") &&
        probe.headers.get("accept-ranges") === "bytes",
      `cache-control=${cacheControl} content-type=${probe.headers.get("content-type")}`
    );
    const delivered = Buffer.from(await probe.arrayBuffer());
    expect(
      "delivered material media bytes are byte-identical to the upload",
      delivered.equals(smokeCover.bytes),
      `expected ${smokeCover.bytes.length} bytes, got ${delivered.length}`
    );
    console.log("OK  GET /materials/media/:mediaId (anonymous after publish, byte-identical)");

    // Range 請求（試看影片拖曳進度條靠它）。
    const ranged = await fetch(`${BASE}${mediaPath(smokeCover.mediaId)}`, {
      headers: { Range: "bytes=0-3" },
    });
    const rangedBytes = Buffer.from(await ranged.arrayBuffer());
    expect(
      "material media supports Range requests",
      ranged.status === 206 &&
        ranged.headers.get("content-range") === `bytes 0-3/${smokeCover.bytes.length}` &&
        rangedBytes.equals(smokeCover.bytes.subarray(0, 4)),
      `status=${ranged.status} content-range=${ranged.headers.get("content-range")}`
    );
    console.log("OK  GET /materials/media/:mediaId (Range → 206)");
  }

  /*
   * 素材認領的擁有權檢查（SEC-02 不變條件 #3）：創作者 B 不能把 A 的未認領素材
   * 填進自己的教材再上架。少了這條，整個授權模型可以被一次 POST 繞過。
   */
  {
    const victimMedia = await uploadSmokeMaterialMedia(teacherToken, `victim_${stamp}`);
    const attacker = await http("POST", "/auth/register", {
      body: {
        email: `smoke_attacker_${stamp}@example.com`,
        password: "Passw0rd!23456789",
        role: "teacher",
      },
    });
    expect("POST /auth/register (second teacher)", attacker.status === 201 && attacker.data?.token, JSON.stringify(attacker.data));

    const attackerFile = await uploadSmokeMaterialFile(attacker.data.token, `attacker_${stamp}`);
    const stolen = await http("POST", "/materials", {
      token: attacker.data.token,
      body: smokeMaterialBody({
        title: `Smoke stolen media ${stamp}`,
        fileId: attackerFile.fileId,
        coverImageUrl: victimMedia.url,
      }),
    });
    expect(
      "cannot claim another creator's media (400 media_not_claimable)",
      stolen.status === 400 && stolen.data?.error === "media_not_claimable",
      `status=${stolen.status} body=${JSON.stringify(stolen.data)}`
    );

    const stillHidden = await http("GET", mediaPath(victimMedia.mediaId), {
      token: attacker.data.token,
    });
    expect(
      "the other creator's media stays inaccessible",
      stillHidden.status === 403,
      `status=${stillHidden.status}`
    );
    console.log("OK  material media ownership enforced on claim (no cross-creator disclosure)");
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

    /*
     * Payment Proof Private Storage（P1）。The upload response must not carry any
     * public URL or storage key: the bytes now live in private-storage/payment-proofs/
     * and can only be reached through the authorized read endpoint.
     */
    const serialized = JSON.stringify(up.data);
    expect(
      "POST /orders/:id/payment-proof response carries no public proof URL",
      !serialized.includes("/uploads/payment-proofs/") && up.data.proof.proof_url === undefined,
      serialized
    );
    expect(
      "POST /orders/:id/payment-proof response carries no storage key",
      up.data.proof.storage_key === undefined && up.data.proof.checksum_sha256 === undefined,
      serialized
    );
    expect(
      "upload response exposes the protected read path",
      up.data.proof.proof_file_path === `/orders/${orderId}/payment-proofs/${proofId}/file` &&
        up.data.proof.proof_file_available === true,
      serialized
    );
    console.log("OK  payment proof upload exposes no public URL / storage key");
  }

  // Payment proof: authorized read, and no public path
  {
    const proofPath = `/orders/${orderId}/payment-proofs/${proofId}/file`;

    const owner = await http("GET", proofPath, { token: parentToken });
    expect("GET payment proof file (owner)", owner.status === 200, JSON.stringify(owner.data));
    console.log("OK  GET /orders/:orderId/payment-proofs/:proofId/file (owner)");

    const admin = await http("GET", proofPath, { token: adminToken });
    expect("GET payment proof file (admin)", admin.status === 200, JSON.stringify(admin.data));
    console.log("OK  GET /orders/:orderId/payment-proofs/:proofId/file (admin)");

    const anon = await http("GET", proofPath);
    expect("GET payment proof file (anonymous -> 401)", anon.status === 401, `status=${anon.status}`);

    const teacherRead = await http("GET", proofPath, { token: teacherToken });
    expect(
      "GET payment proof file (other user -> 403)",
      teacherRead.status === 403,
      `status=${teacherRead.status}`
    );
    console.log("OK  payment proof read denied for anonymous and non-owner");

    /*
     * The delivery headers matter as much as the authorization: a payment proof must
     * never sit in a shared cache, and the browser must not sniff it into something else.
     */
    const headerProbe = await fetch(`${BASE}${proofPath}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const cacheControl = String(headerProbe.headers.get("cache-control") || "");
    expect(
      "payment proof response is no-store and nosniff",
      cacheControl.includes("no-store") &&
        cacheControl.includes("private") &&
        headerProbe.headers.get("x-content-type-options") === "nosniff" &&
        String(headerProbe.headers.get("content-type") || "").startsWith("image/"),
      `cache-control=${cacheControl} nosniff=${headerProbe.headers.get("x-content-type-options")}`
    );
    await headerProbe.arrayBuffer();
    console.log("OK  payment proof delivery headers (private, no-store, nosniff)");

    // The legacy public static path must no longer serve anything.
    const publicProbe = await http("GET", "/uploads/payment-proofs/anything.png");
    expect(
      "GET /uploads/payment-proofs/* is no longer served",
      publicProbe.status === 404 && publicProbe.data?.error === "payment_proof_not_public",
      `status=${publicProbe.status} body=${JSON.stringify(publicProbe.data)}`
    );
    console.log("OK  /uploads/payment-proofs/* returns 404 (not a public asset)");

    // Admin review context must not leak the public URL either.
    const detail = await http("GET", `/admin/payment-proofs/${proofId}`, { token: adminToken });
    expect(
      "GET /admin/payment-proofs/:id carries no public proof URL",
      detail.status === 200 &&
        detail.data?.proof?.proof_url === undefined &&
        !JSON.stringify(detail.data).includes("/uploads/payment-proofs/"),
      JSON.stringify(detail.data)
    );
    console.log("OK  admin payment proof detail exposes no public URL");
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
    const rejectUpload = await uploadSmokeMaterialFile(teacherToken, `rej_${stamp}`);
    const cre = await http("POST", "/materials", {
      token: teacherToken,
      body: smokeMaterialBody({
        title: `Smoke reject-flow ${stamp}`,
        fileId: rejectUpload.fileId,
        price: 50,
      }),
    });
    expect("POST /materials (reject flow)", cre.status === 201 && cre.data?.id, JSON.stringify(cre.data));
    const materialRejectId = cre.data.id;
    materialRejectIdRef = materialRejectId;

    const pub = await http("POST", `/admin/materials/${materialRejectId}/approve`, {
      token: adminToken,
      body: {},
    });
    expect(
      "POST /admin/materials/:id/approve (reject flow publish)",
      pub.status === 200 && pub.data?.material?.status === "published",
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

    /*
     * `COR-01` —— 買家進度必須反映**最新一筆**憑證，不是歷史上出現過的憑證。
     *
     * 走完整條真實路徑：退件 → 買家重新上傳 → 新憑證 pending。舊版的 CASE 對全部歷史憑證
     * 做 `EXISTS rejected` 且排在 `EXISTS pending` 之前，於是買家重新上傳後仍被告知
     * 「請依退件原因重新上傳憑證」，只好再傳一次。
     *
     * list 與 detail 兩支端點都要斷言：它們曾經是兩段各自複製的 SQL。
     *
     * **另開一張訂單**：`rejectedOrderId` 後面還要當 `payment_rejected` bucket 的樣本，
     * 在它上面重新上傳會把它推進待審佇列，破壞那一段斷言。
     */
    const progressOf = (rows, oid) =>
      (Array.isArray(rows) ? rows : []).find((o) => String(o.id) === String(oid))?.order_progress_state;

    const listAfterReject = await http("GET", "/me/orders", { token: parentToken });
    expect(
      "COR-01: latest proof rejected -> rejected (list and detail agree)",
      listAfterReject.status === 200 &&
        progressOf(listAfterReject.data?.items, rejectedOrderId) === "rejected" &&
        rejectedOrderDetail.data?.order?.order_progress_state === "rejected",
      JSON.stringify({
        list: progressOf(listAfterReject.data?.items, rejectedOrderId),
        detail: rejectedOrderDetail.data?.order?.order_progress_state,
      })
    );
    console.log("OK  order_progress_state = rejected (latest proof rejected)");

    const addRe = await http("POST", "/cart/items", {
      token: parentToken,
      body: { materialId: materialRejectId, quantity: 1 },
    });
    expect(
      "POST /cart/items (re-upload flow)",
      addRe.status === 200 || addRe.status === 201,
      JSON.stringify(addRe.data)
    );
    const ordRe = await http("POST", "/orders", { token: parentToken, body: {} });
    expect(
      "POST /orders (re-upload flow)",
      ordRe.status === 201 && ordRe.data?.data?.order?.id,
      JSON.stringify(ordRe.data)
    );
    const reuploadOrderId = ordRe.data.data.order.id;

    const upRe1 = await http("POST", `/orders/${reuploadOrderId}/payment-proof`, {
      token: parentToken,
      rawBody: makeProofFormData("proof-smoke-reupload-1.png"),
    });
    expect(
      "POST …/payment-proof (re-upload flow, first proof)",
      upRe1.status === 201 && upRe1.data?.proof?.id,
      JSON.stringify(upRe1.data)
    );
    const rjRe = await http("POST", `/admin/payment-proofs/${upRe1.data.proof.id}/reject`, {
      token: adminToken,
      body: { rejection_reason: "amount_mismatch" },
    });
    expect(
      "POST /admin/payment-proofs/:id/reject (re-upload flow)",
      rjRe.status === 200 && rjRe.data?.proof?.review_status === "rejected",
      JSON.stringify(rjRe.data)
    );

    const upRe2 = await http("POST", `/orders/${reuploadOrderId}/payment-proof`, {
      token: parentToken,
      rawBody: makeProofFormData("proof-smoke-reupload-2.png"),
    });
    expect(
      "POST …/payment-proof (buyer re-uploads after rejection)",
      upRe2.status === 201 && upRe2.data?.proof?.id,
      JSON.stringify(upRe2.data)
    );

    const listReup = await http("GET", "/me/orders", { token: parentToken });
    const detailReup = await http("GET", `/me/orders/${reuploadOrderId}`, { token: parentToken });
    expect(
      "COR-01: older rejected + newer pending -> reviewing (list and detail agree)",
      listReup.status === 200 &&
        detailReup.status === 200 &&
        progressOf(listReup.data?.items, reuploadOrderId) === "reviewing" &&
        detailReup.data?.order?.order_progress_state === "reviewing" &&
        detailReup.data?.order?.payment_proof_latest_status === "pending" &&
        detailReup.data?.order?.payment_proof_uploaded_count === 2,
      JSON.stringify({
        list: progressOf(listReup.data?.items, reuploadOrderId),
        detail: detailReup.data?.order?.order_progress_state,
        latest: detailReup.data?.order?.payment_proof_latest_status,
      })
    );
    console.log("OK  order_progress_state = reviewing after re-upload (COR-01)");

    /* Admin 端對同一張訂單必須同時回到待審佇列 —— 兩邊字不同，語意必須一致。 */
    const adminPendingReview = await http("GET", "/admin/orders?status=pending_review", { token: adminToken });
    expect(
      "COR-01: Admin pending_review 與 Buyer reviewing 對同一張訂單一致",
      adminPendingReview.status === 200 &&
        (adminPendingReview.data?.items ?? []).some((o) => String(o.id) === String(reuploadOrderId)),
      JSON.stringify({ count: (adminPendingReview.data?.items ?? []).length })
    );
    console.log("OK  Admin pending_review aligns with buyer reviewing (COR-01)");

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

    /*
     * Dashboard summary：憑證遭駁回的訂單仍停留在 `pending_payment`，
     * 因此計入 ordersCount，但不得計入 revenueAmount。
     *
     * 本輪建立了 3 筆訂單：主流程 1 筆（已核准）、退件流程 1 筆、`COR-01` 重新上傳流程 1 筆。
     */
    const s = await fetchAdminSummary(adminToken);
    expect(
      "GET /admin/dashboard/summary (rejected-proof order counts toward ordersCount)",
      s.ordersCount === summaryBaseline.ordersCount + 3,
      `expected ordersCount ${summaryBaseline.ordersCount + 3}, got ${s.ordersCount}`
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

  /*
   * 教材本體檔案的交付（Material File Upload & Secure Delivery）。
   *
   * 這一段是整個 milestone 的驗收核心，斷言的是**買家真的拿到那個檔案**，
   * 而不只是「API 回了 200」：下載回來的位元組要與創作者上傳的逐位元組相同。
   */
  {
    const crypto = require("crypto");
    const expectedSha = crypto.createHash("sha256").update(smokeMaterialFileBytes).digest("hex");

    const dl = await http("GET", `/download/${materialId}`, { token: parentToken });
    expect(
      "GET /download/:materialId",
      dl.status === 200 && dl.data?.signedUrl && Number(dl.data?.expiresInSeconds) > 0,
      JSON.stringify(dl.data)
    );
    // mock URL 時代的殘留：signedUrl 必須是真的能打的位址，不是 download.local。
    expect(
      "GET /download/:materialId → signedUrl 指向真實後端",
      typeof dl.data.signedUrl === "string" && !dl.data.signedUrl.includes("download.local"),
      dl.data.signedUrl
    );
    console.log("OK  GET /download/:materialId");

    // 位元組層級的 round-trip。
    const tokenPath = new URL(dl.data.signedUrl).pathname;
    const fileRes = await fetch(`${BASE}${tokenPath}`);
    const body = Buffer.from(await fileRes.arrayBuffer());
    expect("GET /download/file/:token", fileRes.status === 200, `got ${fileRes.status}`);
    expect(
      "GET /download/file/:token → SHA-256 與上傳內容相同",
      crypto.createHash("sha256").update(body).digest("hex") === expectedSha,
      `expected ${expectedSha}`
    );
    const disposition = fileRes.headers.get("content-disposition") || "";
    expect(
      "GET /download/file/:token → Content-Disposition 為 attachment 且帶 UTF-8 檔名",
      disposition.includes("attachment") && disposition.includes("filename*"),
      disposition
    );
    console.log("OK  GET /download/file/:token (binary round-trip)");

    // 一次性：同一張票不能再用。
    const replay = await fetch(`${BASE}${tokenPath}`);
    expect("GET /download/file/:token (replay → 404)", replay.status === 404, `got ${replay.status}`);
    console.log("OK  download token is single-use");

    // 沒買過的人（teacher 自己）拿不到票。
    const noEntitlement = await http("GET", `/download/${materialId}`, { token: teacherToken });
    expect(
      "GET /download/:materialId (未購買 → 403)",
      noEntitlement.status === 403 && noEntitlement.data?.error === "not_entitled",
      JSON.stringify(noEntitlement.data)
    );
    console.log("OK  download requires an approved order");

    // 匿名不能猜 token。
    const bogus = await fetch(`${BASE}/download/file/not-a-real-token`);
    expect("GET /download/file/:token (亂猜 → 404)", bogus.status === 404, `got ${bogus.status}`);
    console.log("OK  unknown download token is rejected");
  }

  /*
   * 教材檔案的安全不變條件。
   *
   * 每一條都是「如果壞了，買家或審核會拿到錯的東西」，而且都不會有人在畫面上發現。
   */
  {
    // 1) 公開／買家契約不得出現 file_key 或任何儲存資訊。
    const anon = await http("GET", `/materials/${materialId}`);
    expect(
      "GET /materials/:id (匿名) 不含 file_key / storage_key / material_file",
      anon.status === 200 &&
        !Object.prototype.hasOwnProperty.call(anon.data, "file_key") &&
        !Object.prototype.hasOwnProperty.call(anon.data, "storage_key") &&
        !Object.prototype.hasOwnProperty.call(anon.data, "material_file"),
      JSON.stringify(Object.keys(anon.data || {}))
    );
    const asBuyer = await http("GET", `/materials/${materialId}`, { token: parentToken });
    expect(
      "GET /materials/:id (買家) 不含檔案內部資訊",
      asBuyer.status === 200 &&
        !Object.prototype.hasOwnProperty.call(asBuyer.data, "file_key") &&
        !Object.prototype.hasOwnProperty.call(asBuyer.data, "material_file"),
      JSON.stringify(Object.keys(asBuyer.data || {}))
    );
    console.log("OK  material file internals are not exposed publicly");

    // 2) 擁有者看得到檔案摘要，但不含 storage key。
    const asOwner = await http("GET", `/materials/${materialId}`, { token: teacherToken });
    const summary = asOwner.data?.material_file;
    expect(
      "GET /materials/:id (擁有者) 帶 material_file 摘要",
      asOwner.status === 200 && summary?.approvedFile?.id,
      JSON.stringify(summary)
    );
    expect(
      "material_file 摘要不含 storage_key / checksum",
      !Object.prototype.hasOwnProperty.call(summary.approvedFile, "storage_key") &&
        !Object.prototype.hasOwnProperty.call(summary.approvedFile, "checksum_sha256"),
      JSON.stringify(summary.approvedFile)
    );
    // 3) 核准之後候選檔要清空 —— 待審與已核准不能同時指向同一件事。
    expect("核准後 pendingFile 已清空", summary.pendingFile === null, JSON.stringify(summary.pendingFile));
    console.log("OK  approved material has an approved file and no pending candidate");

    // 4) generic update 端點不得碰檔案欄位。
    for (const [field, value] of [
      ["fileId", "whatever"],
      ["file_key", "files/x.pdf"],
      ["approved_file_id", "x"],
    ]) {
      const res = await http("PATCH", `/materials/${materialId}`, {
        token: teacherToken,
        body: { [field]: value },
      });
      expect(
        `PATCH /materials/:id { ${field} } → 400 file_not_updatable_here`,
        res.status === 400 && res.data?.error === "file_not_updatable_here",
        `${res.status} ${JSON.stringify(res.data)}`
      );
    }
    console.log("OK  PUT/PATCH /materials/:id cannot change the material file");

    // 5) 已上架教材不得換檔（那等於在買家背後偷換已售出的商品）。
    const replaceUpload = await uploadSmokeMaterialFile(teacherToken, `replace_${stamp}`);
    const replace = await http("POST", `/materials/${materialId}/file`, {
      token: teacherToken,
      body: { fileId: replaceUpload.fileId },
    });
    expect(
      "POST /materials/:id/file (published → 409)",
      replace.status === 409 && replace.data?.error === "file_replacement_not_allowed",
      `${replace.status} ${JSON.stringify(replace.data)}`
    );
    console.log("OK  published materials cannot swap their deliverable");

    // 6) 同一個 fileId 不能被認領兩次。上一步的換檔被擋下來了，所以它仍是 unattached。
    const firstClaim = await http("POST", "/materials", {
      token: teacherToken,
      body: smokeMaterialBody({ title: `Smoke claim ${stamp}`, fileId: replaceUpload.fileId }),
    });
    expect("POST /materials 認領尚未使用的檔案", firstClaim.status === 201, JSON.stringify(firstClaim.data));

    const reuse = await http("POST", "/materials", {
      token: teacherToken,
      body: smokeMaterialBody({ title: `Smoke reuse ${stamp}`, fileId: replaceUpload.fileId }),
    });
    expect(
      "POST /materials 同一個 fileId 不得認領兩次",
      reuse.status === 400 && reuse.data?.error === "file_not_available",
      `${reuse.status} ${JSON.stringify(reuse.data)}`
    );
    console.log("OK  a material file can only be claimed once");

    // 7) 缺 fileId 不能建立教材。
    const noFile = await http("POST", "/materials", {
      token: teacherToken,
      body: (() => {
        const body = smokeMaterialBody({ title: `Smoke nofile ${stamp}`, fileId: "x" });
        delete body.fileId;
        return body;
      })(),
    });
    expect("POST /materials 缺 fileId → 400", noFile.status === 400, JSON.stringify(noFile.data));
    console.log("OK  POST /materials requires an uploaded material file");

    // 8) 型別檢查：改了副檔名的執行檔要被擋下來。
    const evil = new FormData();
    evil.append(
      "file",
      new Blob([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])], { type: "application/pdf" }),
      "教材.pdf"
    );
    const evilRes = await http("POST", "/teacher/uploads/material-file", { token: teacherToken, rawBody: evil });
    expect(
      "POST /teacher/uploads/material-file (改名的執行檔 → 415)",
      evilRes.status === 415 && evilRes.data?.code === "signature_mismatch",
      `${evilRes.status} ${JSON.stringify(evilRes.data)}`
    );

    const blocked = new FormData();
    blocked.append("file", new Blob([Buffer.from("MZ")], { type: "application/octet-stream" }), "payload.exe");
    const blockedRes = await http("POST", "/teacher/uploads/material-file", { token: teacherToken, rawBody: blocked });
    expect(
      "POST /teacher/uploads/material-file (.exe → 415)",
      blockedRes.status === 415 && blockedRes.data?.code === "blocked_file_type",
      `${blockedRes.status} ${JSON.stringify(blockedRes.data)}`
    );
    console.log("OK  material file type policy is enforced at upload time");

    // 9) 上傳是 teacher 專屬。
    const buyerUpload = new FormData();
    buyerUpload.append("file", new Blob([makeSmokePdf("buyer")], { type: "application/pdf" }), "a.pdf");
    const buyerUploadRes = await http("POST", "/teacher/uploads/material-file", {
      token: parentToken,
      rawBody: buyerUpload,
    });
    expect(
      "POST /teacher/uploads/material-file (買家 → 403)",
      buyerUploadRes.status === 403,
      `got ${buyerUploadRes.status}`
    );
    console.log("OK  only creators can upload material files");
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

  /*
   * 教材審核閉環（Material Review MVP Phase 1）。
   *
   *   建立 → 退回修改 → 創作者重新送審 → 核准上架
   *
   * 同時驗證三條**禁止繞過正式審核**的路徑，以及退回原因的必填規則。
   * 教材本體檔案已納入流程：每一份教材都必須帶一個真正上傳過的 `fileId`。
   */
  {
    const reviewUpload = await uploadSmokeMaterialFile(teacherToken, `review_${Date.now()}`);
    const reviewFileBytes = reviewUpload.bytes;
    const cre = await http("POST", "/materials", {
      token: teacherToken,
      body: {
        title: `smoke_review_${Date.now()}`,
        price: 120,
        fileId: reviewUpload.fileId,
        teaching_objective: "審核流程 smoke 測試",
        teaching_methods: ["配對遊戲"],
        usage_duration: "20 分鐘",
        activity_steps: "1. 發下教具 2. 進行配對",
        contents: [{ type: "PDF", name: "主教材", count: 1 }],
        cover_image_url: "https://example.com/cover.png",
        material_features: ["PDF教材"],
        ipDeclarationAccepted: true,
      },
    });
    expect("POST /materials (review flow)", cre.status === 201 && cre.data?.status === "pending_review", JSON.stringify(cre.data));
    const reviewMaterialId = cre.data.id;

    /* 退回原因與說明都是必填，說明至少 10 字。 */
    const noReason = await http("POST", `/admin/materials/${reviewMaterialId}/request-changes`, {
      token: adminToken,
      body: { note: "這段說明長度是絕對足夠的" },
    });
    expect("POST …/request-changes without reasonCode -> 400", noReason.status === 400, JSON.stringify(noReason.data));

    const shortNote = await http("POST", `/admin/materials/${reviewMaterialId}/request-changes`, {
      token: adminToken,
      body: { reasonCode: "incomplete_info", note: "太短" },
    });
    expect("POST …/request-changes with short note -> 400", shortNote.status === 400, JSON.stringify(shortNote.data));

    const badReason = await http("POST", `/admin/materials/${reviewMaterialId}/request-changes`, {
      token: adminToken,
      body: { reasonCode: "not_a_reason", note: "這段說明長度是絕對足夠的" },
    });
    expect("POST …/request-changes with invalid reasonCode -> 400", badReason.status === 400, JSON.stringify(badReason.data));

    /* 創作者不得核准或退回自己的教材。 */
    const teacherApprove = await http("POST", `/admin/materials/${reviewMaterialId}/approve`, {
      token: teacherToken,
      body: {},
    });
    expect("POST /admin/materials/:id/approve as teacher -> 403", teacherApprove.status === 403, JSON.stringify(teacherApprove.data));

    /* 正式退回。 */
    const rejected = await http("POST", `/admin/materials/${reviewMaterialId}/request-changes`, {
      token: adminToken,
      body: { reasonCode: "incomplete_info", note: "活動步驟請補充完整流程與所需時間。" },
    });
    expect(
      "POST /admin/materials/:id/request-changes",
      rejected.status === 200 &&
        rejected.data?.material?.status === "changes_requested" &&
        rejected.data?.material?.review_reason_code === "incomplete_info" &&
        rejected.data?.material?.reviewed_by &&
        rejected.data?.material?.published_at === null,
      JSON.stringify(rejected.data?.material)
    );

    /* changes_requested 不得直接上架 —— 必須重新送審。 */
    const skipReview = await http("POST", `/admin/materials/${reviewMaterialId}/approve`, {
      token: adminToken,
      body: {},
    });
    expect(
      "POST …/approve on changes_requested -> 409 (cannot bypass resubmit)",
      skipReview.status === 409,
      JSON.stringify(skipReview.data)
    );

    /* 創作者看得到退回原因（owner 可讀自己的非公開教材）。 */
    const creatorView = await http("GET", `/materials/${reviewMaterialId}`, { token: teacherToken });
    expect(
      "GET /materials/:id as owner exposes the review snapshot",
      creatorView.status === 200 &&
        creatorView.data?.review_reason_code === "incomplete_info" &&
        typeof creatorView.data?.review_note === "string",
      JSON.stringify({ code: creatorView.data?.review_reason_code })
    );

    /* 審核快照**只給** admin 與擁有者：已上架教材的公開讀取不得帶出 reviewed_by。 */
    const publicView = await http("GET", `/materials/${materialId}`);
    expect(
      "GET /materials/:id (anon, published) hides the review snapshot",
      publicView.status === 200 &&
        publicView.data?.reviewed_by === undefined &&
        publicView.data?.review_note === undefined,
      JSON.stringify({ reviewed_by: publicView.data?.reviewed_by })
    );

    /* 公開讀取不得看到未公開教材。 */
    const anonView = await http("GET", `/materials/${reviewMaterialId}`);
    expect("GET /materials/:id (anon) on changes_requested -> 403", anonView.status === 403, JSON.stringify(anonView.data));

    /*
     * Admin 的審閱下載。這是 `file_problem` 這個退回原因能不能誠實成立的前提 ——
     * 沒有它，「審核教材」就只是核對表單。
     */
    {
      const crypto = require("crypto");
      const pending = await fetch(`${BASE}/admin/materials/${reviewMaterialId}/file?slot=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pendingBytes = Buffer.from(await pending.arrayBuffer());
      expect("GET /admin/materials/:id/file?slot=pending", pending.status === 200, `got ${pending.status}`);
      expect(
        "Admin 下載到的候選檔與創作者上傳的內容相同",
        crypto.createHash("sha256").update(pendingBytes).digest("hex") ===
          crypto.createHash("sha256").update(reviewFileBytes).digest("hex"),
        `${pendingBytes.length} bytes`
      );

      // 還沒核准，所以 approved slot 應該是空的。
      const approvedSlot = await http("GET", `/admin/materials/${reviewMaterialId}/file?slot=approved`, {
        token: adminToken,
      });
      expect(
        "GET …/file?slot=approved (尚未核准 → 409)",
        approvedSlot.status === 409 && approvedSlot.data?.error === "material_file_unavailable",
        `${approvedSlot.status} ${JSON.stringify(approvedSlot.data)}`
      );

      const badSlot = await http("GET", `/admin/materials/${reviewMaterialId}/file?slot=whatever`, {
        token: adminToken,
      });
      expect("GET …/file?slot=whatever → 400", badSlot.status === 400, `got ${badSlot.status}`);

      // 教材檔案只有 Admin 能透過這條路徑取得。
      const asTeacher = await http("GET", `/admin/materials/${reviewMaterialId}/file?slot=pending`, {
        token: teacherToken,
      });
      expect("GET /admin/materials/:id/file as teacher → 403", asTeacher.status === 403, `got ${asTeacher.status}`);
      const asAnon = await fetch(`${BASE}/admin/materials/${reviewMaterialId}/file?slot=pending`);
      expect("GET /admin/materials/:id/file (匿名) → 401", asAnon.status === 401, `got ${asAnon.status}`);

      console.log("OK  GET /admin/materials/:id/file (review download + slot/role boundaries)");
    }

    /* 創作者重新送審。 */
    const resubmitted = await http("POST", `/materials/${reviewMaterialId}/resubmit`, { token: teacherToken, body: {} });
    expect(
      "POST /materials/:id/resubmit",
      resubmitted.status === 200 && resubmitted.data?.material?.status === "pending_review",
      JSON.stringify(resubmitted.data?.material)
    );

    /* 已在待審佇列的教材不能再送一次。 */
    const resubmitAgain = await http("POST", `/materials/${reviewMaterialId}/resubmit`, { token: teacherToken, body: {} });
    expect("POST …/resubmit twice -> 409", resubmitAgain.status === 409, JSON.stringify(resubmitAgain.data));

    /* 核准上架：寫入 reviewer 快照與首次上架時間。 */
    const approved = await http("POST", `/admin/materials/${reviewMaterialId}/approve`, { token: adminToken, body: {} });
    expect(
      "POST /admin/materials/:id/approve (after resubmit)",
      approved.status === 200 &&
        approved.data?.material?.status === "published" &&
        approved.data?.material?.published_at &&
        approved.data?.material?.review_reason_code === null,
      JSON.stringify(approved.data?.material)
    );

    /* 稽核軌跡：三個事件都必須留下。 */
    const logs = await http("GET", `/admin/materials/${reviewMaterialId}/activity-logs?limit=50`, { token: adminToken });
    const actions = (logs.data?.items || []).map((i) => i.action);
    expect(
      "material review audit trail (created / changes_requested / resubmitted / published)",
      logs.status === 200 &&
        actions.includes("material.created") &&
        actions.includes("material.changes_requested") &&
        actions.includes("material.resubmitted") &&
        actions.includes("material.published") &&
        // 檔案相關的稽核事實：Admin 取走過檔案、以及升級為交付版本。
        actions.includes("admin.material_file_downloaded") &&
        actions.includes("material.file_approved"),
      JSON.stringify(actions)
    );
    console.log("OK  material review workflow (submit → changes → resubmit → publish)");
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
     * Activity log 的人類可讀搜尋（docs/mvp_rules.md §22）。
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
    expect(
      "GET /admin/orders (paginated envelope)",
      o.status === 200 && Array.isArray(o.data?.items) && Number(o.data?.pagination?.limit) === 20,
      JSON.stringify(o.data?.pagination ?? o.data)
    );

    /*
     * `?status=` 篩的是 **Admin operational state**（`orders.status` + 付款憑證衍生），
     * 不是 `orders.status` 原始值。本輪這兩筆訂單剛好覆蓋兩個關鍵 bucket：
     *   orderId         → 憑證已核准 → approved
     *   rejectedOrderId → 憑證被退回、尚未重新上傳 → payment_rejected
     * 後者在舊版會被歸進「待付款」，正是這次要修掉的語意錯誤。
     *
     * `IA-06` 起回應是分頁的，因此「這張訂單在不在這個 bucket」一律用 `?q=<orderId>`
     * 精準查，不再依賴它剛好落在第一頁 —— security DB 會跨次執行累積訂單。
     */
    const hasId = (res, id) => Array.isArray(res.data?.items) && res.data.items.some((it) => String(it.id) === String(id));
    const bucketLookup = (status, id) =>
      http("GET", `/admin/orders?status=${status}&q=${encodeURIComponent(id)}`, { token: adminToken });

    const oApproved = await bucketLookup("approved", orderId);
    expect(
      "GET /admin/orders?status=approved&q=<orderId>",
      oApproved.status === 200 &&
        hasId(oApproved, orderId) &&
        oApproved.data.items.every((it) => it.operational_status === "approved"),
      JSON.stringify(oApproved.data)
    );

    const oRejected = await bucketLookup("payment_rejected", rejectedOrderId);
    expect(
      "GET /admin/orders?status=payment_rejected&q=<orderId>",
      oRejected.status === 200 &&
        hasId(oRejected, rejectedOrderId) &&
        oRejected.data.items.every((it) => it.operational_status === "payment_rejected"),
      JSON.stringify(oRejected.data)
    );

    for (const id of [rejectedOrderId, orderId]) {
      const oAwaiting = await bucketLookup("awaiting_payment", id);
      expect(
        "GET /admin/orders?status=awaiting_payment (excludes rejected-proof / approved order)",
        oAwaiting.status === 200 && !hasId(oAwaiting, id),
        JSON.stringify(oAwaiting.data)
      );
    }

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

    /*
     * IA-06 —— 搜尋與分頁。客訴進來時 Admin 手上是**訂單編號**或**買家 Email**，
     * 兩者都要能直接貼進 `q`；`buyer_email` 同時是列上要顯示的欄位。
     */
    const oByEmail = await http("GET", `/admin/orders?q=${encodeURIComponent(emails.parent)}`, {
      token: adminToken,
    });
    expect(
      "GET /admin/orders?q=<buyer email>",
      oByEmail.status === 200 &&
        hasId(oByEmail, orderId) &&
        oByEmail.data.items.every((it) => it.buyer_email === emails.parent),
      JSON.stringify(oByEmail.data?.items?.map((it) => it.buyer_email))
    );

    const oByOrderId = await http("GET", `/admin/orders?q=${encodeURIComponent(orderId)}`, { token: adminToken });
    expect(
      "GET /admin/orders?q=<order id> (exact lookup)",
      oByOrderId.status === 200 &&
        hasId(oByOrderId, orderId) &&
        Number(oByOrderId.data?.pagination?.total) === oByOrderId.data.items.length,
      JSON.stringify(oByOrderId.data?.pagination)
    );

    const oNoMatch = await http("GET", "/admin/orders?q=smoke_no_such_order_zzz", { token: adminToken });
    expect(
      "GET /admin/orders?q=<no match> → 空集合（不是回全部）",
      oNoMatch.status === 200 && oNoMatch.data.items.length === 0 && Number(oNoMatch.data.pagination.total) === 0,
      JSON.stringify(oNoMatch.data?.pagination)
    );

    // 分頁契約與 utils/adminQuery.js 同源：limit 上限 100、page 1 起算。
    const oPaged = await http("GET", "/admin/orders?page=1&limit=1", { token: adminToken });
    expect(
      "GET /admin/orders?page=1&limit=1",
      oPaged.status === 200 && oPaged.data.items.length <= 1 && Number(oPaged.data.pagination.limit) === 1,
      JSON.stringify(oPaged.data?.pagination)
    );
    const oClamped = await http("GET", "/admin/orders?limit=9999", { token: adminToken });
    expect(
      "GET /admin/orders?limit=9999 → clamped to 100",
      oClamped.status === 200 && Number(oClamped.data.pagination.limit) === 100,
      JSON.stringify(oClamped.data?.pagination)
    );
    console.log("OK  GET /admin/orders?q= / page / limit (IA-06 search + pagination)");

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

  /*
   * `COR-05`：path 參數含 NUL byte（`%00`）必須在進 DB 之前被擋下。
   *
   * 以前這幾條會走到 PostgreSQL 並炸在 `22021 invalid byte sequence`，對外回通用 500。
   * 這裡同時鎖住**兩件事**：非法輸入回 400，以及**合法輸入的語意沒有被這個守衛弄壞**
   * （存在 → 200、不存在 → 404）。少了後者，把守衛寫成「什麼都擋」也會通過。
   */
  {
    const nulPaths = [
      "/materials/%00",
      "/materials/%00/reviews",
      "/materials/%00/rating",
      "/materials/%00/rating-distribution",
      "/materials/media/%00",
    ];
    for (const p of nulPaths) {
      const res = await http("GET", p);
      expect(`GET ${p} (NUL byte)`, res.status === 400, `expected 400, got ${res.status}`);
      expect(
        `GET ${p} error contract`,
        res.data?.error === "invalid_path_parameter",
        `unexpected body ${JSON.stringify(res.data)}`
      );
      const serialized = JSON.stringify(res.data ?? "");
      for (const leak of ["22021", "invalid byte sequence", "SELECT", "Backend"]) {
        expect(
          `GET ${p} must not leak internals`,
          !serialized.includes(leak),
          `response leaked ${leak}: ${serialized}`
        );
      }
    }

    // 字面的 "%00"（雙重編碼）是合法文字，必須照常走到查無資料的 404
    const doubleEncoded = await http("GET", "/materials/%2500");
    expect(
      "GET /materials/%2500 (literal %00 is valid text)",
      doubleEncoded.status === 404,
      `expected 404, got ${doubleEncoded.status}`
    );

    // 控制組：合法識別碼的語意不得被守衛影響
    const unknownMaterial = await http("GET", "/materials/cor05_unknown_material_id");
    expect(
      "GET /materials/:id (unknown) still 404",
      unknownMaterial.status === 404,
      `expected 404, got ${unknownMaterial.status}`
    );
    const unknownMedia = await http("GET", "/materials/media/cor05-unknown-media-id");
    expect(
      "GET /materials/media/:mediaId (unknown) still 404",
      unknownMedia.status === 404,
      `expected 404, got ${unknownMedia.status}`
    );
    if (materialId) {
      const existing = await http("GET", `/materials/${materialId}`);
      expect(
        "GET /materials/:id (existing) still 200",
        existing.status === 200,
        `expected 200, got ${existing.status}`
      );
      const rating = await http("GET", `/materials/${materialId}/rating`);
      expect(
        "GET /materials/:id/rating (existing) still 200",
        rating.status === 200,
        `expected 200, got ${rating.status}`
      );
    }

    console.log("OK  path params reject NUL bytes (COR-05) without breaking valid identifiers");
  }

  /*
   * `COR-07`：解不開的 percent-encoding 不得回 Express 預設的 HTML 錯誤頁。
   *
   * 這些輸入在 router 比對 param 時就丟 `URIError`，**從未進到任何 handler** ——
   * 所以 `COR-05` 的 NUL guard 攔不到，必須靠終端 error handler。
   * 修復前 body 是 `text/html`，夾帶完整 stack 與 9 條絕對檔案路徑，且未授權即可觸發。
   *
   * 這裡同時鎖住「不是 HTML」與「沒有洩漏」兩件事 —— 只檢查狀態碼會漏掉重點。
   */
  {
    const malformed = [
      "/materials/100%",           // trailing %
      "/materials/%ZZ",            // invalid hex
      "/materials/%C0%80",         // overlong / invalid UTF-8
      "/materials/%E0%A4%A",       // incomplete multibyte sequence
    ];
    for (const p of malformed) {
      const res = await fetch(`${BASE}${p}`);
      const contentType = String(res.headers.get("content-type") || "");
      const body = await res.text();
      expect(`GET ${p} (malformed encoding)`, res.status === 400, `expected 400, got ${res.status}`);
      expect(
        `GET ${p} must be JSON, not Express HTML`,
        contentType.includes("application/json"),
        `unexpected content-type ${contentType}`
      );
      for (const leak of ["URIError", "node_modules", "teaching-platform", "path-to-regexp", "    at "]) {
        expect(
          `GET ${p} must not leak internals`,
          !body.includes(leak),
          `response leaked ${leak}`
        );
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
      expect(
        `GET ${p} error contract`,
        parsed?.error === "invalid_request",
        `unexpected body ${body.slice(0, 120)}`
      );
    }

    // 壞掉的 JSON body 走同一條邊界
    const badBody = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    const badBodyText = await badBody.text();
    expect(
      "POST /auth/login with malformed JSON body",
      badBody.status === 400 && String(badBody.headers.get("content-type") || "").includes("application/json"),
      `expected 400 JSON, got ${badBody.status} ${badBody.headers.get("content-type")}`
    );
    expect(
      "POST /auth/login malformed body must not leak internals",
      !badBodyText.includes("SyntaxError") && !badBodyText.includes("node_modules"),
      "response leaked parser internals"
    );

    // 未比對到 route → JSON 404（而不是 Express 的 `Cannot GET /x` HTML）
    const unmatched = await http("GET", "/cor07-no-such-route");
    expect(
      "GET unmatched route returns JSON 404",
      unmatched.status === 404 && unmatched.data?.error === "not_found",
      `unexpected ${unmatched.status} ${JSON.stringify(unmatched.data)}`
    );

    // 控制組：`COR-05` 的 NUL 契約與正常語意不得被這個 handler 蓋掉
    const nul = await http("GET", "/materials/%00");
    expect(
      "COR-05 NUL contract still intact",
      nul.status === 400 && nul.data?.error === "invalid_path_parameter",
      `unexpected ${nul.status} ${JSON.stringify(nul.data)}`
    );
    const stillUnknown = await http("GET", "/materials/cor07_unknown_id");
    expect(
      "valid-but-unknown id still 404",
      stillUnknown.status === 404,
      `expected 404, got ${stillUnknown.status}`
    );
    const stillUnauthorized = await http("GET", "/me/orders/cor07_x");
    expect(
      "auth-required route still 401",
      stillUnauthorized.status === 401,
      `expected 401, got ${stillUnauthorized.status}`
    );

    console.log("OK  malformed requests return JSON errors without stack/paths (COR-07)");
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
