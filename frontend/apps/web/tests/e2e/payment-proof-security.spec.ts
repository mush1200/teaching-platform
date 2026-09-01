import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * 付款憑證私有儲存的**授權邊界** E2E。
 *
 * ## 為什麼這一支不用 mock
 *
 * 這個 repo 其他的 admin E2E 都以 `page.route` mock 掉 `/api/backend/**` —— 那是對的，
 * 因為它們測的是 **UI 行為**（面板怎麼開、送出什麼 body）。
 *
 * 但「匿名讀不到別人的匯款畫面」不是 UI 行為，是**後端授權**。對著 mock 斷言 401
 * 只是在驗證我自己寫的 mock。因此這一支刻意打**真實後端**，而且分兩條路徑：
 *
 *   授權端點   經 app 的 same-origin proxy `/api/backend/*`（瀏覽器實際會走的路）
 *   legacy URL 直接打 Backend origin（`E2E_BACKEND_URL`）—— 舊的公開憑證 URL 是
 *              Backend 的 static 直出，不經過 proxy；只測 proxy 會漏掉真正的攻擊面
 *
 * 需要一個連著 `teaching_platform_security_test` 的 Backend；沒有的話整組 skip，
 * 不會偽裝成通過。
 *
 * 對應規格：`docs/mvp_rules.md` §12.4、`docs/teaching-platform-mvp-spec-v1.4.md` §6.1。
 */

/** Admin 憑證只從環境變數取（與 smoke / Postman 同一套規則，不得 hard-code）。 */
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD?.trim();

/**
 * Backend 的 origin。
 *
 * legacy 的公開憑證 URL（`http://<backend>/uploads/payment-proofs/<file>.png`）是
 * **Backend 的 express.static 直出**的，不經過 Next 的 `/api/backend/*` proxy ——
 * 那個 proxy 有自己的第一段 allowlist，`uploads` 本來就不在裡面。
 * 因此要驗「舊的公開路徑真的沒東西了」，就必須打 Backend 本身，
 * 否則測到的只是 proxy 的 403，攻擊者實際會用的那條路徑一次都沒被碰到。
 */
const BACKEND_URL = (process.env.E2E_BACKEND_URL?.trim() || "http://127.0.0.1:3000").replace(/\/$/, "");

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

test.describe("Payment proof private storage — authorization boundary", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await backendReachable(request)),
      "needs a Backend on the proxy target (teaching_platform_security_test)"
    );
  });

  /**
   * 舊的公開靜態路徑。
   *
   * 這是整輪 hardening 的核心：憑證曾經放在 `express.static` 無條件公開的
   * `uploads/` 樹下，任何知道檔名的人都拿得到。現在該前綴由掛在 static **之前**的
   * handler 直接擋掉 —— 即使日後有人把檔案放回那個目錄也取不到位元組。
   */
  test("legacy public path /uploads/payment-proofs/* serves nothing", async ({ request }) => {
    for (const path of [
      "/uploads/payment-proofs/anything.png",
      "/uploads/payment-proofs/movprnlk_06819121e3ea.png", // 真的存在過的舊檔名
      "/uploads/payment-proofs/",
    ]) {
      // **直接打 Backend**：這是舊 URL 實際會走的路徑（見 BACKEND_URL 的說明）。
      const res = await request.get(`${BACKEND_URL}${path}`);
      expect(res.status(), `${path} must not be served`).toBe(404);
      expect(String(res.headers()["content-type"] ?? "")).not.toContain("image/");
      expect(await res.text()).toContain("payment_proof_not_public");
    }
  });

  /**
   * 憑證的封鎖必須**只針對 `payment-proofs` 前綴**，不是把整個 `/uploads` 關掉。
   *
   * 這一支原本斷言的是「教材行銷素材仍由 static 公開供應」。`SEC-02` 之後那個前提
   * 已不成立 —— 素材也搬進私有儲存了，它的封鎖與可見性由
   * `material-media-security.spec.ts` 負責。這裡保留的是仍然成立的那一半：
   * 兩個 handler 各自只擋自己的前綴，回的是各自的錯誤碼，沒有互相汙染。
   */
  test("the proofs block is scoped to its own prefix", async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/uploads/material-media/does-not-exist.png`);
    expect(res.status()).toBe(404);
    const body = await res.text();
    expect(body, "material media must not be refused as if it were a payment proof").not.toContain(
      "payment_proof_not_public"
    );
    expect(body).toContain("material_media_not_public");
  });

  /**
   * 縱深防禦：就算有人試著繞道 app 自己的 proxy，`uploads` 也不在 proxy 的
   * 第一段 allowlist 裡（`app/api/backend/[...path]/route.ts`）。
   */
  test("the app proxy does not expose /uploads at all", async ({ request }) => {
    const res = await request.get("/api/backend/uploads/payment-proofs/anything.png");
    expect(res.status()).toBe(403);
    expect(String(res.headers()["content-type"] ?? "")).not.toContain("image/");
  });

  /** 沒有 Authorization 一律 401，而且回應裡不會有任何影像位元組。 */
  test("anonymous cannot read a payment proof", async ({ request }) => {
    const res = await request.get(
      "/api/backend/orders/ord_does_not_matter/payment-proofs/prf_does_not_matter/file"
    );
    expect(res.status()).toBe(401);
    expect(String(res.headers()["content-type"] ?? "")).not.toContain("image/");
  });

  test("anonymous cannot list an order's payment proofs", async ({ request }) => {
    const res = await request.get("/api/backend/orders/ord_does_not_matter/payment-proofs");
    expect(res.status()).toBe(401);
  });

  /**
   * 已登入但不是這筆訂單的人 → 403。
   *
   * 取一筆**真實**的憑證（用 admin 列表拿 order id / proof id），再用一個當場註冊的
   * 全新買家去讀。用假 id 測不出這件事：那只會走到 404「訂單不存在」，
   * 而 IDOR 的實際情境是「id 都是對的，人不對」。
   */
  test("a signed-in non-owner cannot read someone else's proof", async ({ request }) => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "needs TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (never hard-coded)"
    );

    const adminLogin = await request.post("/api/backend/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(adminLogin.ok(), "admin login must succeed").toBeTruthy();
    const adminToken = ((await adminLogin.json()) as { token: string }).token;

    const list = await request.get("/api/backend/admin/payment-proofs?limit=1", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(list.ok()).toBeTruthy();
    const items = ((await list.json()) as { items: Array<Record<string, unknown>> }).items;
    test.skip(items.length === 0, "no payment proof fixtures in the target database");
    const proof = items[0];
    const orderId = String(proof.order_id);
    const proofId = String(proof.id);

    // 這一步順帶鎖住契約：Admin 清單本身不得回傳公開 URL 或 storage key。
    expect(proof.proof_url, "admin list must not expose a public URL").toBeUndefined();
    expect(proof.storage_key, "admin list must not expose a storage key").toBeUndefined();
    expect(JSON.stringify(proof)).not.toContain("/uploads/payment-proofs/");

    // Admin 讀得到（同一條路徑，差別只在身分）。
    const asAdmin = await request.get(`/api/backend${String(proof.proof_file_path)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([200, 409]).toContain(asAdmin.status()); // 409 = legacy 列沒有私有物件
    if (asAdmin.status() === 200) {
      expect(String(asAdmin.headers()["content-type"] ?? "")).toContain("image/");
      expect(String(asAdmin.headers()["cache-control"] ?? "")).toContain("no-store");
      expect(asAdmin.headers()["x-content-type-options"]).toBe("nosniff");
    }

    // 全新註冊的買家 —— 絕對不是這筆訂單的人。
    const stranger = `e2e_stranger_${Date.now()}@example.test`;
    const register = await request.post("/api/backend/auth/register", {
      data: { email: stranger, password: "StrangerPassw0rd!", role: "parent" },
    });
    expect([200, 201]).toContain(register.status());
    const login = await request.post("/api/backend/auth/login", {
      data: { email: stranger, password: "StrangerPassw0rd!" },
    });
    expect(login.ok()).toBeTruthy();
    const strangerToken = ((await login.json()) as { token: string }).token;

    const denied = await request.get(
      `/api/backend/orders/${orderId}/payment-proofs/${proofId}/file`,
      { headers: { Authorization: `Bearer ${strangerToken}` } }
    );
    expect(denied.status(), "non-owner must be refused").toBe(403);
    expect(String(denied.headers()["content-type"] ?? "")).not.toContain("image/");

    const deniedList = await request.get(`/api/backend/orders/${orderId}/payment-proofs`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    expect(deniedList.status()).toBe(403);
  });
});
