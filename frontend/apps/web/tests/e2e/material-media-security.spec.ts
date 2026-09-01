import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * 教材行銷素材私有儲存的**授權邊界** E2E（`SEC-02`）。
 *
 * ## 為什麼這一支不用 mock
 *
 * 與 `payment-proof-security.spec.ts` 同一個理由：「未上架教材的封面不能被匿名取得」
 * 不是 UI 行為，是**後端授權**。對著 `page.route` mock 斷言 401 只是在驗證我自己
 * 寫的 mock。因此這一支打**真實後端**，而且分兩條路徑：
 *
 *   交付端點   經 app 的 same-origin proxy `/api/backend/materials/media/:id`
 *   legacy URL 直接打 Backend origin（`E2E_BACKEND_URL`）—— 舊的公開素材 URL 是
 *              Backend 的 static 直出，不經過 proxy；只測 proxy 會漏掉真正的攻擊面
 *
 * ## 這一輪修的是什麼
 *
 * 素材以前放在 `express.static` 無條件公開的 `Backend/uploads/material-media/`。
 * 大多數素材**確實該公開**（已上架教材的封面），但 static 沒有「條件」：
 * 審核中、已退回、已下架的教材素材同樣被吐出來，只靠 12 個 hex 的隨機檔名保護。
 * 而 URL 一旦被爬蟲、分享或快取記下，**下架就再也撤不回來**。
 *
 * 現在可見性跟著所屬教材的 `status` 走，因此下架是立即生效的。
 *
 * 需要一個連著 `teaching_platform_security_test` 的 Backend；沒有的話整組 skip，
 * 不會偽裝成通過。
 *
 * 對應規格：`docs/mvp_rules.md` §3.1、`docs/material-file-storage-and-delivery.md` §24。
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD?.trim();

const BACKEND_URL = (process.env.E2E_BACKEND_URL?.trim() || "http://127.0.0.1:3000").replace(/\/$/, "");

/** 1×1 PNG。上傳端驗 magic bytes，所以 fixture 必須是真的 PNG。 */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function backendReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get("/api/backend/health");
    if (!res.ok()) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

async function registerAndLogin(
  request: APIRequestContext,
  role: "teacher" | "parent"
): Promise<{ token: string; email: string }> {
  const email = `e2e_media_${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = "MediaPassw0rd!23456";
  const register = await request.post("/api/backend/auth/register", {
    data: { email, password, role },
  });
  expect([200, 201]).toContain(register.status());
  const login = await request.post("/api/backend/auth/login", { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  return { token: ((await login.json()) as { token: string }).token, email };
}

test.describe("Material media private storage — authorization boundary", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await backendReachable(request)),
      "needs a Backend on the proxy target (teaching_platform_security_test)"
    );
  });

  /**
   * 舊的公開靜態路徑。
   *
   * 這是這一輪的核心：素材曾經放在 `express.static` 無條件公開的 `uploads/` 樹下。
   * 現在該前綴由掛在 static **之前**的 handler 直接擋掉 —— 即使日後有人把檔案
   * 放回那個目錄也取不到位元組。
   */
  test("legacy public path /uploads/material-media/* serves nothing", async ({ request }) => {
    for (const path of [
      "/uploads/material-media/anything.png",
      "/uploads/material-media/mj8abc_0123456789ab.jpg", // 舊命名格式：timestamp_12hex.ext
      "/uploads/material-media/",
    ]) {
      // **直接打 Backend**：這是舊 URL 實際會走的路徑，不經過 Next proxy。
      const res = await request.get(`${BACKEND_URL}${path}`);
      expect(res.status(), `${path} must not be served`).toBe(404);
      expect(String(res.headers()["content-type"] ?? "")).not.toContain("image/");
      expect(await res.text()).toContain("material_media_not_public");
    }
  });

  /** `/uploads` 整段本來就不在 app proxy 的第一段 allowlist 裡（縱深防禦）。 */
  test("the app proxy does not expose /uploads at all", async ({ request }) => {
    const res = await request.get("/api/backend/uploads/material-media/anything.png");
    expect(res.status()).toBe(403);
    expect(String(res.headers()["content-type"] ?? "")).not.toContain("image/");
  });

  test("unknown media id is a 404, not an accidental disclosure", async ({ request }) => {
    const res = await request.get(
      "/api/backend/materials/media/00000000-0000-4000-8000-000000000000"
    );
    expect(res.status()).toBe(404);
    expect(String(res.headers()["content-type"] ?? "")).not.toContain("image/");
  });

  test("upload requires a creator（匿名上傳一律 401）", async ({ request }) => {
    const res = await request.post("/api/backend/teacher/uploads/material-media?kind=cover", {
      multipart: { file: { name: "cover.png", mimeType: "image/png", buffer: PNG_1X1 } },
    });
    expect(res.status()).toBe(401);
  });

  /**
   * 完整的生命週期：上傳 → 建立教材（pending_review）→ 核准上架 → 下架。
   *
   * 這一支跑真實流程而不是拿既有 fixture，因為要斷言的是**狀態變化本身**：
   * 同一條 URL 在四個時間點的可見性各不相同。
   */
  test("media visibility follows the owning material's status", async ({ request }) => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "needs TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (never hard-coded)"
    );

    const creator = await registerAndLogin(request, "teacher");
    const buyer = await registerAndLogin(request, "parent");

    const adminLogin = await request.post("/api/backend/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLogin.ok(), "admin login must succeed").toBeTruthy();
    const adminToken = ((await adminLogin.json()) as { token: string }).token;

    /* ---- 上傳素材 ------------------------------------------------------ */

    const upload = await request.post("/api/backend/teacher/uploads/material-media?kind=cover", {
      headers: { Authorization: `Bearer ${creator.token}` },
      multipart: { file: { name: "cover.png", mimeType: "image/png", buffer: PNG_1X1 } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const uploaded = (await upload.json()) as { url: string; mediaId: string };

    // 回應不得洩漏儲存位置。
    expect(JSON.stringify(uploaded)).not.toContain("/uploads/");
    expect(JSON.stringify(uploaded)).not.toContain("material-media/");
    expect(uploaded.url).toContain(`/materials/media/${uploaded.mediaId}`);

    const mediaPath = `/api/backend/materials/media/${uploaded.mediaId}`;
    const get = (token?: string) =>
      request.get(mediaPath, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

    /* ---- 1) 尚未認領：只有上傳者與 Admin ------------------------------ */

    expect((await get()).status(), "unclaimed media must not be anonymous").toBe(401);
    expect((await get(creator.token)).status()).toBe(200);
    expect((await get(adminToken)).status()).toBe(200);
    expect((await get(buyer.token)).status(), "a buyer is not the uploader").toBe(403);

    /* ---- 2) pending_review：仍然不公開 -------------------------------- */

    const fileUpload = await request.post("/api/backend/teacher/uploads/material-file", {
      headers: { Authorization: `Bearer ${creator.token}` },
      multipart: {
        file: {
          name: "material.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.7\n% e2e media fixture\n%%EOF\n", "latin1"),
        },
      },
    });
    expect(fileUpload.status(), await fileUpload.text()).toBe(201);
    const { fileId } = (await fileUpload.json()) as { fileId: string };

    const create = await request.post("/api/backend/materials", {
      headers: { Authorization: `Bearer ${creator.token}` },
      data: {
        title: `E2E media material ${Date.now()}`,
        price: 100,
        fileId,
        cover_image_url: uploaded.url,
        teaching_objective: "E2E media authorization boundary",
        teaching_methods: ["遊戲活動"],
        usage_duration: "約 1 小時",
        activity_steps: "1. 說明\n2. 練習",
        contents: [{ type: "worksheet", name: "練習", count: 1 }],
        material_features: ["PDF教材"],
        ipDeclarationAccepted: true,
      },
    });
    expect(create.status(), await create.text()).toBe(201);
    const materialId = ((await create.json()) as { id: string }).id;

    expect((await get()).status(), "pending_review media must not be anonymous").toBe(401);
    expect((await get(buyer.token)).status()).toBe(403);
    expect((await get(creator.token)).status(), "the creator always sees their own media").toBe(200);
    expect((await get(adminToken)).status(), "the reviewer must see what they are reviewing").toBe(200);

    /* ---- 3) published：任何人（公開商品頁需要） ----------------------- */

    const approve = await request.post(`/api/backend/admin/materials/${materialId}/approve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {},
    });
    expect(approve.status(), await approve.text()).toBe(200);

    const asAnon = await get();
    expect(asAnon.status(), "published media must be anonymously readable").toBe(200);
    expect(String(asAnon.headers()["content-type"] ?? "")).toContain("image/");
    expect(asAnon.headers()["x-content-type-options"]).toBe("nosniff");
    // 公開素材允許共享快取；受保護的素材則否（下面第 4 步會驗）。
    expect(String(asAnon.headers()["cache-control"] ?? "")).toContain("public");
    expect(String(asAnon.headers()["cache-control"] ?? "")).not.toContain("no-store");
    expect(Buffer.from(await asAnon.body()).equals(PNG_1X1), "bytes must round-trip").toBeTruthy();

    /* ---- 4) unpublished：下架立即撤回匿名存取 ------------------------- */

    /*
     * **必須走真正的下架路徑。**
     *
     * `published` 只有一個合法出口：檢舉處置的 `unpublish_material`
     * （`Backend/utils/materialWorkflow.js` 的 `ALLOWED_TRANSITIONS`）。
     * 用 `request-changes` 之類的捷徑會被狀態機擋下，那樣這一段就只是靜靜地
     * 什麼都沒測到 —— 而它正是這一輪最重要的一條斷言：
     * 舊的 `express.static` 實作在下架後**仍會繼續**吐出封面與試看影片。
     */
    const report = await request.post("/api/backend/reports", {
      headers: { Authorization: `Bearer ${buyer.token}` },
      data: { material_id: materialId, reason: "E2E: media revocation on unpublish" },
    });
    expect(report.status(), await report.text()).toBe(201);
    const caseId = ((await report.json()) as { id: string }).id;

    const investigate = await request.post(
      `/api/backend/admin/report-cases/${caseId}/investigate`,
      { headers: { Authorization: `Bearer ${adminToken}` }, data: {} }
    );
    expect(investigate.status(), await investigate.text()).toBe(200);

    const resolve = await request.post(`/api/backend/admin/report-cases/${caseId}/resolve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { resolution: "unpublish_material", note: "E2E: confirmed, unpublishing." },
    });
    expect(resolve.status(), await resolve.text()).toBe(200);

    // 教材真的離開 published 了（否則下面的斷言證明不了任何事）。
    const afterResolve = await request.get(`/api/backend/materials/${materialId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(afterResolve.ok()).toBeTruthy();
    expect(((await afterResolve.json()) as { status: string }).status).toBe("unpublished");

    const afterUnpublish = await get();
    expect(
      afterUnpublish.status(),
      "unpublishing must immediately revoke anonymous access to the media"
    ).toBe(401);
    expect(String(afterUnpublish.headers()["content-type"] ?? "")).not.toContain("image/");

    const stillOwner = await get(creator.token);
    expect(stillOwner.status(), "the creator keeps access to their own media").toBe(200);
    expect(String(stillOwner.headers()["cache-control"] ?? "")).toContain("no-store");
  });

  /**
   * 不變條件 #3：創作者 B 不能把 A 的未認領素材填進自己的教材再上架。
   * 少了這條檢查，整個授權模型可以被一次 `POST /materials` 繞過。
   */
  test("a creator cannot claim another creator's media", async ({ request }) => {
    const victim = await registerAndLogin(request, "teacher");
    const attacker = await registerAndLogin(request, "teacher");

    const upload = await request.post("/api/backend/teacher/uploads/material-media?kind=cover", {
      headers: { Authorization: `Bearer ${victim.token}` },
      multipart: { file: { name: "private.png", mimeType: "image/png", buffer: PNG_1X1 } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const victimMedia = (await upload.json()) as { url: string; mediaId: string };

    const fileUpload = await request.post("/api/backend/teacher/uploads/material-file", {
      headers: { Authorization: `Bearer ${attacker.token}` },
      multipart: {
        file: {
          name: "material.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.7\n% attacker fixture\n%%EOF\n", "latin1"),
        },
      },
    });
    expect(fileUpload.status()).toBe(201);
    const { fileId } = (await fileUpload.json()) as { fileId: string };

    const stolen = await request.post("/api/backend/materials", {
      headers: { Authorization: `Bearer ${attacker.token}` },
      data: {
        title: `E2E stolen media ${Date.now()}`,
        price: 100,
        fileId,
        cover_image_url: victimMedia.url,
        teaching_objective: "E2E cross-creator media claim",
        teaching_methods: ["遊戲活動"],
        usage_duration: "約 1 小時",
        activity_steps: "1. 說明",
        contents: [{ type: "worksheet", name: "練習", count: 1 }],
        material_features: ["PDF教材"],
        ipDeclarationAccepted: true,
      },
    });
    expect(stolen.status(), await stolen.text()).toBe(400);
    expect(await stolen.text()).toContain("media_not_claimable");

    const stillDenied = await request.get(
      `/api/backend/materials/media/${victimMedia.mediaId}`,
      { headers: { Authorization: `Bearer ${attacker.token}` } }
    );
    expect(stillDenied.status()).toBe(403);
  });

  /** 型別政策：改了副檔名的檔案在 magic bytes 那一層被擋下。 */
  test("a renamed non-image is rejected at upload", async ({ request }) => {
    const creator = await registerAndLogin(request, "teacher");
    const res = await request.post("/api/backend/teacher/uploads/material-media?kind=cover", {
      headers: { Authorization: `Bearer ${creator.token}` },
      multipart: {
        file: {
          name: "totally-a-cover.png",
          mimeType: "image/png",
          /*
           * `\x90\x00` are written as escape sequences on purpose.
           *
           * Embedding the raw bytes puts a literal NUL in this TypeScript source, and tools
           * that scan the whole file rather than a fixed-size prefix then classify it as
           * binary: `file(1)` reports "data", and GNU `grep -n` prints
           * "Binary file ... matches" instead of the matching line. (`git` itself was never
           * affected -- its detector only looks at the first 8000 bytes and the NUL sat at
           * offset 15745 -- so this is a general-tooling fix, not a git one. See `DX-20`.)
           *
           * The decoded payload is byte-identical either way: latin1 maps each code unit to
           * one byte, giving 4D 5A 90 00 20 ... -- the DOS/PE header "MZ" that the upload
           * magic-byte check must reject even though the filename says .png.
           */
          buffer: Buffer.from("MZ\x90\x00 windows executable", "latin1"),
        },
      },
    });
    expect(res.status()).toBe(415);
    expect(await res.text()).toContain("media_signature_mismatch");
  });

  /** kind 打錯字不再默默退回 `cover`（舊行為會產生一次成功但錯誤的上傳）。 */
  test("an unrecognised kind is rejected rather than coerced", async ({ request }) => {
    const creator = await registerAndLogin(request, "teacher");
    const res = await request.post("/api/backend/teacher/uploads/material-media?kind=video", {
      headers: { Authorization: `Bearer ${creator.token}` },
      multipart: { file: { name: "cover.png", mimeType: "image/png", buffer: PNG_1X1 } },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("invalid_media_kind");
  });
});
