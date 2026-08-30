import { expect, test } from "@playwright/test";
import { API_ROUTES } from "./helpers/routes";

test.describe("API and Proxy Routes", () => {
  test("backend proxy health route is reachable", async ({ request }) => {
    await test.step("GET /api/backend/health", async () => {
      const res = await request.get("/api/backend/health");
      expect(res.status()).toBe(200);
      // Backend `GET /health` 的契約就是這一個欄位（`Backend/index.js`）。
      expect(res.headers()["content-type"]).toContain("application/json");
      expect(await res.json()).toEqual({ status: "ok" });
    });
  });

  /*
   * `/api/auth/*` 是 Next 的 route handler，**不是** `/api/backend/*` proxy：
   * 它把 upstream 的 JSON 與 status 原樣轉出（`app/api/auth/{login,register}/route.ts`）。
   *
   * 這裡鎖三件事：狀態碼、錯誤 body 的形狀，以及**它不得自己做任何 auth 副作用** ——
   * 不發 redirect、不寫 cookie。登入狀態一律由 client 在收到 token 後自己設定
   * （CLAUDE.md §3；`app/login/page.tsx`）。proxy 若偷偷設 cookie 或 302，
   * 就會出現一條繞過前端的登入路徑。
   */
  test("auth proxy relays upstream status and body without auth side effects", async ({ request }) => {
    await test.step("POST /api/auth/login", async () => {
      const res = await request.post("/api/auth/login", {
        data: { email: "e2e@example.com", password: "wrong-password" },
      });
      // 錯的密碼一定是 401，不是「其中之一」—— Backend `routes/auth.js` 的 invalid credentials。
      expect(res.status()).toBe(401);
      expect(res.headers()["content-type"]).toContain("application/json");
      const body = (await res.json()) as { message?: string; token?: string };
      expect(typeof body.message).toBe("string");
      expect(body.message).toBe("invalid credentials");
      // 失敗的登入不得回 token，也不得回任何 session 痕跡
      expect(body.token).toBeUndefined();
      expect(res.headers()["set-cookie"]).toBeUndefined();
    });

    await test.step("POST /api/auth/register", async () => {
      const res = await request.post("/api/auth/register", {
        data: { email: "e2e-register@example.com", password: "Password123!" },
      });
      /*
       * 這個 payload **刻意少了 `role`** —— Backend 要求 email/password/role 三者齊全，
       * 因此契約上就是 400，而不是「200/201/400/409 其中之一」。
       * 用固定的 payload 斷言固定的結果，測試才不會在契約改變時默默通過。
       */
      expect(res.status()).toBe(400);
      expect(res.headers()["content-type"]).toContain("application/json");
      expect((await res.json()) as { message?: string }).toEqual({
        message: "email, password, role are required",
      });
      // proxy 不做導向、也不寫 cookie：登入狀態一律由 client 自己設定
      expect(res.headers()["location"]).toBeUndefined();
      expect(res.headers()["set-cookie"]).toBeUndefined();
    });
  });

  /*
   * `/api/backend/*` 的 root allowlist 是 **transport** 邊界，不是授權邊界。
   *
   * 這組測試靠一個明確的區別來判斷請求到底走到哪裡，因此**不需要任何憑證**：
   *   - proxy 自己擋掉      → `403 { message: "not allowed" }`
   *   - 轉發到 Backend 才被擋 → `401 { message: "Unauthorized" }`（`requireAuth`）
   *
   * 先前 `creator` 不在 allowlist 裡，`/creator/cases` 三個端點與 `RoleShell`
   * 的待回覆案件徽章全部拿到前者 —— Backend 明明是好的（同一個 router 從
   * `/teacher/cases` 進來就 200），斷點在 transport 這一層。
   */
  test("proxy forwards the canonical creator namespace instead of blocking it", async ({ request }) => {
    const creatorCaseEndpoints: Array<{ label: string; send: () => Promise<import("@playwright/test").APIResponse> }> = [
      { label: "GET /creator/cases", send: () => request.get("/api/backend/creator/cases?scope=all&page=1&limit=20") },
      { label: "GET /creator/cases/:id", send: () => request.get("/api/backend/creator/cases/rep_e2e_probe") },
      {
        label: "POST /creator/cases/:id/respond",
        send: () => request.post("/api/backend/creator/cases/rep_e2e_probe/respond", { data: { message: "probe" } }),
      },
    ];

    for (const { label, send } of creatorCaseEndpoints) {
      await test.step(label, async () => {
        const res = await send();
        const body = (await res.json()) as { message?: string };
        // 決定性斷言：不得再是 proxy 自己產生的 403。
        expect(body.message).not.toBe("not allowed");
        expect(res.status()).toBe(401);
        expect(body).toEqual({ message: "Unauthorized" });
      });
    }
  });

  /*
   * `creator` 與 `teacher` 是同一個 Backend router 的 canonical 路徑與相容別名
   * （`Backend/index.js`）。修好 `creator` 不得以犧牲 `teacher` 為代價 ——
   * 後者還載著 `teacher/sales` 與 `teacher/uploads/*`。
   */
  test("proxy keeps existing allowed roots working", async ({ request }) => {
    const stillForwarded = [
      "/api/backend/teacher/cases?scope=all&page=1&limit=20",
      "/api/backend/teacher/sales/summary",
      "/api/backend/admin/orders",
    ];

    for (const url of stillForwarded) {
      await test.step(`forwarded: ${url}`, async () => {
        const res = await request.get(url);
        expect((await res.json()) as { message?: string }).toEqual({ message: "Unauthorized" });
        expect(res.status()).toBe(401);
      });
    }

    await test.step("public roots still reachable without auth", async () => {
      const res = await request.get("/api/backend/materials?limit=1");
      expect(res.status()).toBe(200);
    });
  });

  /*
   * allowlist 必須維持**整段比對**。用 `startsWith` 之類的前綴比對會讓
   * `creatorx` / `creators` 這種名字一起被放行，等於把 root allowlist 打開一條縫。
   */
  test("proxy still rejects roots outside the allowlist", async ({ request }) => {
    for (const url of ["/api/backend/nope", "/api/backend/creatorx/cases", "/api/backend/creators/cases"]) {
      await test.step(`rejected: ${url}`, async () => {
        const res = await request.get(url);
        expect(res.status()).toBe(403);
        expect((await res.json()) as { message?: string }).toEqual({ message: "not allowed" });
      });
    }
  });

  test("api route list smoke", async ({ request }) => {
    for (const route of API_ROUTES) {
      await test.step(`request ${route}`, async () => {
        const method = route === "/api/backend/health" ? "get" : "post";
        const res =
          method === "get"
            ? await request.get(route)
            : await request.post(route, { data: { email: "smoke@example.com", password: "12345678" } });
        expect(res.status()).toBeGreaterThan(0);
      });
    }
  });
});
