import { expect, test } from "@playwright/test";

/**
 * `REL-04` 的回歸護欄 —— gateway 類狀態碼（502／503／504）的登入／註冊文案。
 *
 * ## 為什麼需要這條
 *
 * Render Free tier 15 分鐘無流量即 spin down。喚醒期間 `POST /api/auth/login` 會把
 * upstream 的 502 原樣轉發（該 route 自己不產生 502），而 `mapStatusMessage` 先前
 * **沒有** 502／503／504 分支，於是落到 default 的「操作失敗，請稍後再試。」
 *
 * 使用者看到的後果不是「慢」，是「**看起來像壞掉**」—— 在登入頁那句話會被讀成
 * 「我打錯帳密了」。而 401 早就有自己的專屬文案，所以真正的憑證錯誤**根本不會**
 * 顯示那一句。兩者混在同一句文案上，就是這個缺陷的實質。
 *
 * ## 這條測什麼、不測什麼
 *
 * 測的是**使用者看得到的文案**與**狀態碼之間的對應關係**，用 `page.route` 直接
 * 偽造 upstream 狀態碼 —— 這是本 repo 既有的做法（見 `public.spec.ts` 的 401 案例）。
 *
 * **不**測 Render 冷啟動本身、**不**測逾時秒數、**不**在 production 製造 gateway failure。
 * 那些是營運事實，不是前端契約；為了驗文案而弄倒 production 是不可接受的代價。
 */

const GATEWAY_COPY = "服務正在啟動或暫時無法連線，請稍候幾分鐘再試一次。";
const CREDENTIAL_COPY = "帳號或密碼錯誤，請重新登入。";
const OLD_FALLBACK_COPY = "操作失敗，請稍後再試。";

const GATEWAY_STATUSES = [502, 503, 504] as const;

test.describe("REL-04 — gateway 狀態碼的登入文案", () => {
  for (const status of GATEWAY_STATUSES) {
    test(`登入遇到 ${status} 時顯示「服務啟動中」而不是憑證錯誤`, async ({ page }) => {
      await page.route("**/api/auth/login", (route) =>
        route.fulfill({
          status,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ message: "invalid response payload" }),
        }),
      );

      await page.goto("/login");
      await page.fill("#login-email", "someone@example.com");
      await page.fill("#login-password", "CorrectHorseBattery1!");
      await page.getByRole("button", { name: "登入", exact: true }).click();

      await expect(page.getByText(GATEWAY_COPY)).toBeVisible();

      // 三個必須同時成立的否定條件 —— 缺任何一個，這個缺陷就沒有真的修好。
      await expect(page.getByText(CREDENTIAL_COPY)).toHaveCount(0);
      await expect(page.getByText(OLD_FALLBACK_COPY)).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe("/login");
    });
  }

  /*
   * 負向控制：401 的語意**不得**被這次改動動到。
   *
   * 沒有這一條，「把所有錯誤都改成同一句話」也會讓上面三條變綠。
   */
  test("401 仍然顯示憑證錯誤，語意未被 gateway 分支吃掉", async ({ page }) => {
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ message: "invalid credentials" }),
      }),
    );

    await page.goto("/login");
    await page.fill("#login-email", "nobody@example.com");
    await page.fill("#login-password", "WrongPassword123!");
    await page.getByRole("button", { name: "登入", exact: true }).click();

    await expect(page.getByText(CREDENTIAL_COPY)).toBeVisible();
    await expect(page.getByText(GATEWAY_COPY)).toHaveCount(0);
  });

  /*
   * 文案本身不得洩漏基礎設施細節。使用者需要知道的是「稍後再試」，
   * 不是我們用哪一家供應商、哪一層 proxy 倒了、逾時設定是幾秒。
   */
  test("gateway 文案不揭露任何基礎設施細節", async ({ page }) => {
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ message: "service unavailable" }),
      }),
    );

    await page.goto("/login");
    await page.fill("#login-email", "someone@example.com");
    await page.fill("#login-password", "CorrectHorseBattery1!");
    await page.getByRole("button", { name: "登入", exact: true }).click();

    await expect(page.getByText(GATEWAY_COPY)).toBeVisible();

    const body = (await page.textContent("body")) ?? "";
    for (const leak of ["Render", "render.com", "onrender", "proxy", "upstream", "gateway", "502", "503", "504"]) {
      expect(body).not.toContain(leak);
    }
  });
});

test.describe("REL-04 — gateway 狀態碼的註冊文案", () => {
  /*
   * 註冊頁與登入頁**不是**同一條路徑：`parseRegisterError` 原本優先顯示 server message。
   *
   * 而 `/api/auth/register/route.ts` 與 login route 是同一個形狀 —— body 非 JSON 時
   * 會合成 `{ message: "invalid response payload" }`。因此在修正前，gateway 502 會讓
   * 使用者看到那串**內部字串**，比通用文案更糟。
   *
   * 這條刻意把 body 帶上 message，證明 gateway 狀態碼**不再**採用它。
   */
  test("註冊遇到 503 時用自家文案，且不顯示 upstream 的 message", async ({ page }) => {
    await page.route("**/api/auth/register", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ message: "invalid response payload" }),
      }),
    );

    await page.goto("/register");
    await page.fill("#reg-email", `rel04-${Date.now()}@example.com`);
    await page.fill("#reg-password", "CorrectHorseBattery1!");
    await page.fill("#reg-confirm", "CorrectHorseBattery1!");
    /*
     * `registerSchema` 要求 `terms` 為 true（`role` 預設 `parent`，不需選）。
     * 少了這一步，表單會停在「請同意服務條款」而**根本不送出請求** ——
     * 那樣測到的就不是 gateway 文案，而是本地驗證。
     */
    await page.check("#terms");

    await page.getByRole("button", { name: "註冊", exact: true }).click();

    await expect(page.getByText(GATEWAY_COPY)).toBeVisible();
    await expect(page.getByText("invalid response payload")).toHaveCount(0);
    await expect(page.getByText(OLD_FALLBACK_COPY)).toHaveCount(0);
  });
});
