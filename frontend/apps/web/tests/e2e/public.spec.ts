import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";
import { PUBLIC_ROUTES } from "./helpers/routes";

test.describe("Public Pages", () => {
  test("home page redirects by role and shows entry links", async ({ page }) => {
    /*
     * 訪客首頁的入口只斷言**頁面本體**的 CTA。
     *
     * 這裡原本斷言 `教材列表` 與 `購物車` 兩條側欄連結，兩者都不成立：
     *   - `購物車` 只在 `RoleShell` 的 `parent` 導覽裡，而 `/cart` 是 `middleware.ts`
     *     的 login-required 前綴 —— 訪客本來就不該有購物車入口。
     *   - `教材列表` 在 `public` 導覽裡，但側欄在 mobile 收在抽屜中，預設不可見，
     *     所以那條斷言只有 desktop 會過。
     * 頁面本體的兩顆 hero CTA 在兩個 viewport 都可見，才是訪客真正的入口契約。
     */
    await test.step("guest sees homepage links", async () => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "開始逛教材" })).toBeVisible();
      await expect(page.getByRole("link", { name: "登入帳號" })).toBeVisible();
      // Hero 的主張與品牌標記（`app/page.tsx`）—— 訪客第一眼該看到的東西
      await expect(page.getByRole("heading", { name: "找到適合孩子的優質教學資源" })).toBeVisible();
      await expect(page.getByText("精選教具與數位教材，協助不同使用者更有效率地陪伴孩子學習。")).toBeVisible();
    });

    /*
     * 兩處過期：
     *   1. 只寫 localStorage —— `middleware.ts` 讀 cookie，因此 `app/page.tsx` 把
     *      創作者導去 `/creator/materials` 後會再被導到 `/login?redirect=…`。
     *      canonical 的登入狀態一律用 `helpers/auth.ts` 的 `signInAs()`。
     *   2. 目的地是 `/creator/materials` —— `/teacher/*` 已由 middleware 308 正規化
     *      到 `/creator/*`，`app/page.tsx` 也直接 replace 到 `/creator/materials`。
     */
    await test.step("teacher role auto-redirect check", async () => {
      await signInAs(page, "teacher");
      /*
       * 這一步驗的是**角色導向**，不是 session 有效性。
       * creator 外殼掛載時會打 `auth/me`（`DX-04`）——假 token 會換回真 401 而被導向
       * /login，那樣就測不到原本要測的東西了。補上外殼 bootstrap 的 mock。
       */
      await installShellBootstrapMocks(page);
      await page.goto("/");
      await expect(page).toHaveURL(/\/creator\/materials/);
    });

    await test.step("buyer role auto-redirect check", async () => {
      /*
       * 買家的目的地是 `/dashboard`，**不是** `/materials` —— 原本待補的斷言寫的是舊行為。
       * 依現行 `app/page.tsx`：有 token 且不是 creator，一律 `router.replace("/dashboard")`。
       */
      await page.context().clearCookies();
      await signInAs(page, "parent");
      await installShellBootstrapMocks(page);
      await page.goto("/");
      await expect(page).toHaveURL(/\/dashboard/);
    });

    /*
     * `DX-17`：admin 先前**完全沒有被涵蓋**，這正是它長期沒被發現的原因。
     *
     * 舊的 `app/page.tsx` 是「creator 去 /creator/materials，**其餘一律 /dashboard**」，
     * 而 `/dashboard` 在 middleware 是 `parent` 專屬 —— 於是 admin 一進首頁就被彈到 `/403`。
     * 這一步同時驗兩件事：導到正確目的地，**而且沒有再被彈走**。
     */
    await test.step("admin role auto-redirect check", async () => {
      await page.context().clearCookies();
      await signInAs(page, "admin");
      await installShellBootstrapMocks(page);
      await page.goto("/");
      await expect(page).toHaveURL(/\/admin/);
      // 目的地必須真的可停留 —— 只斷言 URL 會漏掉「導過去又被 middleware 彈回」。
      await expect(page).not.toHaveURL(/\/403/);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  /*
   * `DX-15`：**landing redirect 必須發生在 server navigation 上，而不是等 hydration 之後。**
   *
   * 這一條先前只由 `app/page.tsx` 的 `useEffect` 提供，因此只能在 client hydration
   * 完成後才執行（實測 1.5–1.9s，再加上 landing 的 RSC 請求）。在平行完整套件下
   * （N 個 worker 對單一 `next start`）那個延遲是負載函數，尾端會間歇越過斷言預算 ——
   * 產品本身從未壞掉（20 秒預算的診斷 8/8 都會導向），但測試會紅，而且紅在哪一支、
   * 哪個 project 完全隨負載游移。修法是把導向移到 `middleware.ts`。
   *
   * **這裡刻意不驗「幾毫秒內完成」** —— 那只會再造一個負載敏感的門檻。
   * 改驗**結構**：`GET /` 的第一個回應本身就是 3xx redirect，也就是瀏覽器在拿到
   * 首頁 HTML 之前就已經被指去別處。這個性質與機器快慢無關。
   */
  test("已登入者的 landing redirect 發生在 server navigation 上（DX-15）", async ({ page }) => {
    for (const { role, landing } of [
      { role: "parent", landing: "/dashboard" },
      { role: "admin", landing: "/admin" },
    ] as const) {
      await page.context().clearCookies();
      await signInAs(page, role);
      await installShellBootstrapMocks(page);

      const response = await page.goto("/");
      await expect(page, `${role} 應被導向 ${landing}`).toHaveURL(new RegExp(landing.replace(/\//g, "\\/")));

      // 最終回應必須是被重導過來的 —— 也就是導向不是頁面自己在 client 端做的。
      const redirectedFrom = response?.request().redirectedFrom() ?? null;
      expect(redirectedFrom, `${role}: "/" 應在 server 端就被重導，而不是等 hydration`).not.toBeNull();
      expect(new URL(redirectedFrom!.url()).pathname, `${role}: 重導的起點應是 "/"`).toBe("/");

      const rootResponse = await redirectedFrom!.response();
      const status = rootResponse?.status() ?? 0;
      expect(status, `${role}: GET / 本身就該回 3xx（實得 ${status}）`).toBeGreaterThanOrEqual(300);
      expect(status, `${role}: GET / 本身就該回 3xx（實得 ${status}）`).toBeLessThan(400);
    }

    // 訪客則完全不受影響：`/` 直接 200，沒有任何重導。
    await page.context().clearCookies();
    const anonPage = await page.context().newPage();
    const anonResponse = await anonPage.goto("/");
    expect(anonPage.url(), "訪客不得被導離公開首頁").toMatch(/\/$/);
    expect(anonResponse?.status(), "訪客的 GET / 應為 200").toBe(200);
    expect(anonResponse?.request().redirectedFrom() ?? null, "訪客不該有任何重導").toBeNull();
    await expect(anonPage.getByRole("heading", { name: "找到適合孩子的優質教學資源" })).toBeVisible();
    await anonPage.close();
  });

  /*
   * `DX-17` 的不變條件：**每個角色的 canonical landing route 必須是該角色進得去的 route。**
   *
   * 破壞它就會產生「導過去、立刻被彈回來」。這一支把三個角色的 landing 逐一直接開啟，
   * 確認不是 `/403`、也不是 `/login` —— 也就是 redirect destination 與 middleware
   * authorization 不會再各走各的。
   */
  test("每個角色的 canonical landing route 都可直接進入（不被 middleware 彈開）", async ({ page }) => {
    const LANDINGS = [
      { role: "parent", path: "/dashboard" },
      { role: "teacher", path: "/creator/materials" },
      { role: "admin", path: "/admin" },
    ] as const;

    for (const { role, path } of LANDINGS) {
      await page.context().clearCookies();
      await signInAs(page, role);
      await installShellBootstrapMocks(page);
      await page.goto(path);
      await expect(page, `${role} 應能停留在 ${path}`).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      await expect(page, `${role} 的 landing 不該是 403`).not.toHaveURL(/\/403/);
      await expect(page, `${role} 的 landing 不該被導去登入`).not.toHaveURL(/\/login/);
    }
  });

  /*
   * `DX-17` 的迴圈防護：`/` → canonical destination 只能發生一次。
   *
   * 修復前 admin 的實際路徑是 `/` → `/dashboard` → `/403`，
   * 而 `/403` 的「返回首頁」又指回 `/` —— 點下去就再繞一輪。
   */
  test("root redirect 不產生迴圈（admin 回到首頁不會再被彈到 403）", async ({ page }) => {
    await page.context().clearCookies();
    await signInAs(page, "admin");
    await installShellBootstrapMocks(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/admin/);

    // 再走一次 `/`：結果必須穩定，不得出現 403 或在兩個 URL 之間來回
    await page.goto("/");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page).not.toHaveURL(/\/403/);
  });

  /*
   * 兩個頁面都多了「以 Google／Facebook 登入（即將開放）」的 SSO 佔位按鈕，
   * 於是 `/登入|login/i` 與 `/註冊|register/i` 各自解到 3 個元素而觸發 strict mode。
   * 這裡要驗的是**送出按鈕**，用 exact 名稱鎖定它（與 `critical-acceptance.spec.ts`
   * 既有的 `{ name: "登入", exact: true }` 一致），不是把 strict mode 關掉。
   */
  test("auth pages render validation surfaces", async ({ page }) => {
    await test.step("login page elements", async () => {
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "登入", exact: true })).toBeVisible();

      // 空表單：先擋在 client 端的格式驗證，不會送出請求
      await page.getByRole("button", { name: "登入", exact: true }).click();
      await expect(page.getByText("Email 格式不正確")).toBeVisible();

      // 帳密錯誤：顯示可讀訊息，且**留在登入頁**（不得因 401 而觸發 session 恢復導向）
      await page.route("**/api/auth/login", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ message: "invalid credentials" }),
        }),
      );
      await page.fill("#login-email", "nobody@example.com");
      await page.fill("#login-password", "WrongPassword123!");
      await page.getByRole("button", { name: "登入", exact: true }).click();
      // 登入頁把狀態碼對應成自己的文案（`mapStatusMessage`），不是直接顯示 server message
      await expect(page.getByText("帳號或密碼錯誤，請重新登入。")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/login");
    });

    await test.step("register page elements", async () => {
      await page.goto("/register");
      await expect(page.getByRole("button", { name: "註冊", exact: true })).toBeVisible();

      /*
       * `DEC-06 = A`：註冊**不蒐集姓名**。
       *
       * 姓名欄位與其 required validation 已移除，因此空表單第一個未通過的欄位
       * 變成 email（`registerSchema` 的宣告順序）。這一步同時釘住兩件事：
       * 表單上沒有姓名輸入，且註冊**不會**再因為缺姓名而擋下來。
       */
      await expect(page.locator("#reg-name")).toHaveCount(0);
      await expect(page.getByText("姓名", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "註冊", exact: true }).click();
      await expect(page.getByText("Email 格式不正確")).toBeVisible();
      await expect(page.getByText("請輸入姓名")).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe("/register");
    });

    /*
     * `DEC-06 = A` 的另一半：**送出的 payload 不含姓名，且成功後不寫 `tp_display_name`。**
     *
     * 上一步只證明「畫面上沒有欄位」。真正要守住的不變條件是資料面 ——
     * 沒有任何姓名離開瀏覽器，也沒有任何姓名被留在瀏覽器裡。
     */
    await test.step("successful registration collects no name", async () => {
      await page.goto("/register");

      let submitted: Record<string, unknown> | null = null;
      await page.route("**/api/auth/register", async (route) => {
        submitted = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 201,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            token: "e2e-token",
            user: { id: "usr_e2e", email: "dec06@example.com", role: "parent" },
          }),
        });
      });

      await page.fill("#reg-email", "dec06@example.com");
      await page.fill("#reg-password", "Password123!");
      await page.fill("#reg-confirm", "Password123!");
      await page.check("#terms");
      await page.getByRole("button", { name: "註冊", exact: true }).click();

      await expect.poll(() => submitted).not.toBeNull();
      // backend contract（`POST /auth/register`）只有這三個欄位。
      expect(Object.keys(submitted ?? {}).sort()).toEqual(["email", "password", "role"]);
      expect(submitted).not.toHaveProperty("name");
      expect(submitted).not.toHaveProperty("displayName");

      // 既有的 session 標記仍照常寫入 —— 移除姓名不得順手弄壞註冊本身。
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("tp_token")))
        .toBe("e2e-token");
      expect(await page.evaluate(() => localStorage.getItem("tp_role"))).toBe("parent");
      expect(await page.evaluate(() => localStorage.getItem("tp_user_email"))).toBe(
        "dec06@example.com",
      );

      // 核心斷言：沒有任何姓名被留在瀏覽器裡，也沒有替代 key。
      expect(await page.evaluate(() => localStorage.getItem("tp_display_name"))).toBeNull();
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => /name/i.test(k) && k !== "tp_user_email"),
        ),
      ).toEqual([]);

      await page.unroute("**/api/auth/register");
    });
  });

  /*
   * 這幾步只驗「頁面外殼有渲染出來」。
   *
   * 先前這裡必須寫 `.first()`：外殼與頁面各渲染一個 `<main>`，`locator("main")`
   * 會 strict-mode 解到 2 個。`COR-06` 已把 main landmark 的擁有權收斂到外殼一層，
   * 因此**不再需要迴避** —— 直接用 `getByRole("main")`，它同時也驗證了唯一性
   * （解到 2 個會 strict-mode 失敗）。landmark 數量本身另由
   * `shell-consistency.spec.ts` 的「exactly one main landmark」逐路由斷言。
   */
  test("materials and detail pages render core functionality", async ({ page }) => {
    await test.step("materials list", async () => {
      // 只攔清單本身：`**` 會連 `/materials/<id>` 的詳情請求一起吃掉，
      // 那會讓後面的詳情步驟拿到清單 payload 而渲染成錯誤態。
      await page.route("**/api/backend/materials**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (!path.endsWith("/api/backend/materials")) return route.fallback();
        return route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            items: [
              { id: "mat_l1", title: "語言教材 L1", price: 100, status: "published", category: "language" },
              { id: "mat_l2", title: "語言教材 L2", price: 120, status: "published", category: "language" },
              { id: "mat_m1", title: "數學教材 M1", price: 150, status: "published", category: "math" },
            ],
          }),
        });
      });
      await page.goto("/materials");
      await expect(page.getByRole("main")).toBeVisible();
      // 三筆 mock 資料都必須真的列出來，而不是只渲染一個空殼
      await expect(page.getByText("語言教材 L1")).toBeVisible();
      await expect(page.getByText("語言教材 L2")).toBeVisible();
      await expect(page.getByText("數學教材 M1")).toBeVisible();
    });

    await test.step("material detail and report entry", async () => {
      await page.goto("/materials/mat_detail_seed_1");
      await expect(page.getByRole("main")).toBeVisible();
      /*
       * 用 seed 的教材而不是 `mat_mock_001`：後者在資料庫裡不存在，頁面只會渲染錯誤態，
       * 按鈕根本不會出現。
       *
       * 原本待補的斷言想驗「加入購物車成功」，但這是**公開頁的訪客情境** ——
       * 現行 canonical 行為是擋下並說明（`MaterialDetailPage`：非 buyer 一律顯示
       * 「請先以購買者帳號登入後再加入購物車。」），不是成功。這裡驗真正的行為。
       */
      // 詳情頁有三個購買面板（desktop 卡片／mobile 卡片／sticky），各自以斷點顯示，
      // 因此要挑**目前看得見**的那一顆，否則在另一個 viewport 會點到隱藏元素而逾時。
      const addToCart = page.getByRole("button", { name: "加入購物車" }).filter({ visible: true }).first();
      /*
       * `P1-03` 之後，這個 seed 教材**沒有 `approved_file_id`**，因此後端回
       * `is_purchasable: false`，購買 CTA 在**點擊之前**就停用並說明原因
       * （`Backend/utils/materialDeliverability.js`；規格見 `docs/mvp_rules.md` §21A.1.1）。
       *
       * 先前這裡斷言 CTA 可點，等於把「可購買但交付不出東西」的舊行為寫進契約 ——
       * 那正是買家付完款才在下載失敗的成因。訪客 gating 的文案本身
       * 由 `material-report.spec.ts` 與詳情頁的 buyer 情境覆蓋。
       */
      await expect(addToCart).toBeDisabled();
      // 三個購買面板各有一份說明；與上面的按鈕一樣，要挑目前這個斷點看得見的那一份。
      await expect(page.getByTestId("material-unavailable").filter({ visible: true }).first()).toBeVisible();
      // 訪客不得被靜默帶進購買流程：仍停在教材詳情頁
      await expect(page).toHaveURL(/\/materials\/mat_detail_seed_1/);
      // 檢舉入口與 POST /reports 行為已由 `material-report.spec.ts` 覆蓋（BUY-01）。
    });

    await test.step("material reviews", async () => {
      /*
       * 評分摘要與回饋列的內容已由 `public.spec.ts` 自己的
       * 「seeded material detail page shows conversion-focused sections」覆蓋
       * （教學回饋區、最新優先、查看全部回饋）。這裡補它沒測到的**空狀態**。
       */
      await page.route("**/api/backend/materials/mat_detail_seed_1/reviews", (route) =>
        route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: "[]" }),
      );
      // 用 seed 的教材：`mat_mock_001` 不存在，頁面會顯示「找不到教材」而不是回饋空狀態
      await page.goto("/materials/mat_detail_seed_1/reviews");
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByText("尚無教學回饋")).toBeVisible();
    });
  });

  /*
   * Seed 來自 `Backend/migrations/20260508_seed_material_detail_demo.sql`
   * （`material_contents` = 地點圖卡 4 / 物品圖卡 24 / 任務圖卡 6）。
   *
   * 這支測試原本斷言的是**已經不存在於產品裡**的一套聚合文案：
   * `📦 34 張圖卡`、`⏱ 約 2 堂課`、`👧 4-8 歲`、`🎲 配對遊戲 / 搶答活動`、
   * `創作者與家長回饋`、`依最新排序`。現行的 `MaterialDetailBody` 逐列渲染
   * `${name} × ${count}`、把使用時間／年齡放進各自的區塊，回饋區標題是「教學回饋」
   * 加上「最新優先」；`創作者與家長回饋` 另外還違反 CLAUDE.md §2 的 UI 稱呼規則。
   * 因此**不補假 UI**，改成對齊目前的 canonical 契約。
   */
  test("seeded material detail page shows conversion-focused sections", async ({ page }) => {
    await page.goto("/materials/mat_detail_seed_1", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "主題圖卡：超市購物配對" })).toBeVisible();

    // 教材包含：逐列的 `${名稱} × ${數量}`
    await expect(page.getByText("教材包含")).toBeVisible();
    await expect(page.getByText("地點圖卡 × 4")).toBeVisible();
    await expect(page.getByText("物品圖卡 × 24")).toBeVisible();
    await expect(page.getByText("任務圖卡 × 6")).toBeVisible();

    // 使用時間與適用年齡各自成塊，不再是首屏的 emoji 摘要列
    await expect(page.getByText("使用時間")).toBeVisible();
    await expect(page.getByText("約 2 堂課").first()).toBeVisible();
    await expect(page.getByText("適用：適合 4-8 歲")).toBeVisible();

    await expect(page.getByText("教材特色").first()).toBeVisible();
    await expect(page.getByText("配對遊戲").first()).toBeVisible();
    await expect(page.getByText("語言表達").first()).toBeVisible();

    /*
     * 購買區塊仍然存在且看得見；但這個 seed 教材沒有可交付檔案，
     * 因此 `P1-03` 之後主 CTA 顯示「暫停販售」而不是「立即購買」，兩顆都停用。
     */
    await expect(page.getByRole("button", { name: "加入購物車" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "加入購物車" }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "暫停販售" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "立即購買" })).toHaveCount(0);

    // 回饋區：標題「教學回饋」、排序標示「最新優先」、以及通往完整列表的**連結**（不是按鈕）
    await expect(page.getByText("教學回饋").first()).toBeVisible();
    await expect(page.getByText("最新優先")).toBeVisible();
    await expect(page.getByRole("link", { name: "查看全部回饋" })).toBeVisible();

    /*
     * `COR-04`：買家可見面不得出現系統角色稱呼。
     *
     * 這一頁的回饋區以前會渲染「— 家長」（`api-repository.ts` 對每一則回饋寫死的
     * 假作者名）—— API 根本沒有回傳作者身分。角色徽章的 `parent` 文案也曾是「家長」。
     * 規則見 CLAUDE.md §2 與 `docs/ui-role-naming-checklist.md`。
     * 注意這裡鎖的是**買家可見文案**，不是內部的 `parent` / `teacher` role 常數。
     */
    await expect(page.getByText("家長")).toHaveCount(0);
    await expect(page.getByText("老師")).toHaveCount(0);
  });

  test("status pages are reachable", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route === "/" ? "/$" : route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
