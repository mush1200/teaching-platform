import type { Page } from "@playwright/test";
import { getTestCookieUrl } from "./base-url";

/**
 * E2E 的登入狀態設定。
 *
 * **必須同時寫 cookie 與 localStorage**：
 *   - `middleware.ts` 只讀 `tp_role` / `tp_token` **cookie**（UX hint，決定渲染哪個外殼）。
 *     少了 cookie，`/admin` 會被導向 `/login`，測試看起來會過，其實整頁都沒渲染到。
 *   - `lib/api-client.ts` 從 **localStorage** 取 token 放進 `Authorization` header。
 *
 * 兩者缺一，測到的就不是真正的目標頁面。
 */
export async function signInAs(
  page: Page,
  role: "admin" | "teacher" | "parent",
  opts: { token?: string; email?: string } = {},
) {
  // origin 只有一個來源（helpers/base-url.ts）；不要在這裡再寫一次預設值。
  const cookieUrl = getTestCookieUrl();
  const token = opts.token ?? `e2e_${role}_token`;
  const email = opts.email ?? `${role}-e2e@example.com`;

  await page.context().addCookies([
    { name: "tp_token", value: token, url: cookieUrl },
    { name: "tp_role", value: role, url: cookieUrl },
  ]);
  await page.addInitScript(
    ({ t, r, e }) => {
      localStorage.setItem("tp_token", t);
      localStorage.setItem("tp_role", r);
      localStorage.setItem("tp_user_email", e);
    },
    { t: token, r: role, e: email },
  );
}
