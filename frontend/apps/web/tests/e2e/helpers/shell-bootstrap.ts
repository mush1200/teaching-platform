import type { Page, Route } from "@playwright/test";

/**
 * 外殼初始化所需的 mock（`DX-04`）。
 *
 * 三個外殼在掛載時各會打一次 session 探測，並以 `authExpiry: "recover"` opt-in：
 *
 * | 外殼 | 請求 |
 * | --- | --- |
 * | `RoleShell`（creator 分支） | `GET auth/me` |
 * | `AdminShell` | `GET auth/me` |
 * | `ParentAppShell` | `GET orders/my` |
 *
 * 用假 token 的 spec 若沒 mock 這些端點，請求會落到真實後端而回 401，
 * 於是外殼把整頁導向 `/login` —— 測試看起來「壞了」，其實是**產品正確地**
 * 判定 session 無效。**修法是把 mock 補完整，不是關掉 recovery。**
 *
 * 只 mock 外殼真正需要的那幾條；其餘一律 `fallback()`，
 * 讓各 spec 自己的 route 與既有行為不受影響。
 */
export async function installShellBootstrapMocks(page: Page): Promise<void> {
  await page.route("**/api/backend/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/backend\//, "");
    /*
     * Buyer 外殼（`ParentAppShell`）探的是 `orders/my`。少了它，用假 token 的 spec
     * 會在 `/cart`、`/checkout`、`/me/orders` 等頁被導向 `/login` ——
     * 而且因為登入頁在 `COR-06` 之後也有 `main` landmark，
     * 只斷言「main 可見」的測試會**在登入頁上安靜地通過**，什麼都沒驗到。
     */
    if (route.request().method() === "GET" && path === "orders/my") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ items: [] }),
      });
    }
    if (route.request().method() === "GET" && path === "auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          user: { id: "usr_e2e", role: "teacher", email: "creator-e2e@example.com", created_at: "2026-05-01T00:00:00.000Z" },
        }),
      });
    }
    return route.fallback();
  });
}
