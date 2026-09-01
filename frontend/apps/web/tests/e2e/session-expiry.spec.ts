import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  buildLoginUrl,
  clearClientSession,
  isAuthPagePath,
  isSafeInternalPath,
  recoverFromExpiredSession,
  resetSessionRecoveryForTests,
} from "../../lib/session";

/**
 * Session 失效恢復（`DX-04`）。
 *
 * 缺陷：`apiFetch` 只把原始 `Response` 交還呼叫端，43 個呼叫端各自決定要不要處理 401，
 * 實際上幾乎沒有人處理。token 在 cookie 還活著的期間被撤銷／竄改時，
 * 頁面照常渲染外殼、停在自己的空狀態上，**使用者永遠回不到登入頁**。
 *
 * ## 接線方式：三個外殼各 opt-in 一次
 *
 * `apiFetch` 的 `authExpiry: "recover"` 是 **opt-in**（completion criteria 明訂
 * 「做成 opt-in helper，不要全域攔截」）。opt-in 點刻意放在**外殼的 session 探測**上：
 *
 * | 外殼 | 探測請求 |
 * | --- | --- |
 * | `RoleShell`（creator 分支） | `GET auth/me` |
 * | `AdminShell` | `GET auth/me` |
 * | `ParentAppShell` | `GET orders/my` |
 *
 * 一個外殼探一次，就能讓該區域**所有頁面**有一致的過期行為 ——
 * 不必在 43 個呼叫端各加一次，也不必承擔全域攔截的 blast radius。
 *
 * 因此這支測試分兩層：
 *   - **純函式層**：helper 的契約（清除範圍、回跳路徑安全、恢復動作、只恢復一次）
 *   - **瀏覽器層**：三個角色的 stale session 都回到登入頁；403／400／409／500／
 *     無 token 的 401 都**不得**導向；登入頁不自我重導
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

/** 讓所有 backend 呼叫回同一個狀態碼，模擬「token 已被撤銷」或「無此權限」。 */
async function stubBackendStatus(page: Page, status: number, body: unknown = { message: "stub" }) {
  await page.route("**/api/backend/**", (route) => json(route, body, status));
}

async function sessionCookieNames(page: Page): Promise<string[]> {
  const cookies = await page.context().cookies();
  return cookies
    .filter((c) => c.name === "tp_token" || c.name === "tp_role")
    .map((c) => c.name)
    .sort();
}

const PROTECTED_ROUTES = [
  { role: "parent" as const, route: "/me/orders", label: "buyer" },
  { role: "teacher" as const, route: "/creator/materials", label: "creator" },
  { role: "admin" as const, route: "/admin/materials", label: "admin" },
];

/* ------------------------------------------------------------------ *
 * 純函式層：helper 的契約
 * ------------------------------------------------------------------ */

/** 在 stub 過的 globals 上執行，讓純函式測試不依賴瀏覽器。 */
function withStubbedWindow(
  pathname: string,
  search: string,
  run: () => void,
): { replaced: string[]; store: Map<string, string>; expiredCookies: string[] } {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, localStorage: g.localStorage, document: g.document };
  const replaced: string[] = [];
  const expiredCookies: string[] = [];
  const store = new Map<string, string>([
    ["tp_token", "t"],
    ["tp_role", "admin"],
    ["tp_user_email", "a@example.com"],
    /*
     * 這兩個 key 在 `DEC-06` / `DEC-08`（2026-08-27）之後**已無 writer**，
     * 但**登出仍必須清掉它們** —— 既有瀏覽器可能還存著舊值。
     * 這是 legacy cleanup 斷言，不是 active collection。
     */
    ["tp_display_name", "A"],
    ["tp_analytics_events", '[{"event":"legacy","payload":{},"at":"2026-01-01T00:00:00.000Z"}]'],
    ["theme", "dark"], // 使用者偏好，不得被清掉
  ]);
  g.window = { location: { pathname, search, replace: (u: string) => void replaced.push(u) } };
  g.localStorage = { removeItem: (k: string) => void store.delete(k) };
  g.document = {
    set cookie(value: string) {
      expiredCookies.push(value);
    },
    get cookie() {
      return "";
    },
  };
  try {
    run();
  } finally {
    g.window = saved.window;
    g.localStorage = saved.localStorage;
    g.document = saved.document;
  }
  return { replaced, store, expiredCookies };
}

test.describe("session helper contract (pure)", () => {
  test("isSafeInternalPath 只接受站內路徑", () => {
    for (const ok of ["/", "/admin/materials", "/me/orders?tab=active", "/materials/mat_1"]) {
      expect(isSafeInternalPath(ok), `${ok} 應為安全`).toBe(true);
    }
    // open redirect 的各種寫法
    for (const bad of [
      "https://evil.com",
      "http://evil.com",
      "//evil.com",
      "/\\evil.com", // 瀏覽器把 `\` 當 `/`，等同 //evil.com
      "evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(isSafeInternalPath(bad as string), `${String(bad)} 應被拒絕`).toBe(false);
    }
  });

  test("buildLoginUrl 對不安全的目標退回乾淨的 /login", () => {
    expect(buildLoginUrl("/admin/materials")).toBe("/login?redirect=%2Fadmin%2Fmaterials");
    expect(buildLoginUrl("https://evil.com")).toBe("/login");
    expect(buildLoginUrl("//evil.com")).toBe("/login");
    expect(buildLoginUrl(null)).toBe("/login");
  });

  test("isAuthPagePath 認得登入／註冊頁", () => {
    expect(isAuthPagePath("/login")).toBe(true);
    expect(isAuthPagePath("/register")).toBe(true);
    expect(isAuthPagePath("/admin")).toBe(false);
    expect(isAuthPagePath("/me/orders")).toBe(false);
  });

  test("clearClientSession 清掉所有 session 標記，且不碰其他偏好", () => {
    const { store, expiredCookies } = withStubbedWindow("/admin", "", () => {
      clearClientSession();
    });
    expect([...store.keys()]).toEqual(["theme"]);
    // middleware 讀的兩個 cookie 都必須被過期掉，否則會 redirect loop
    expect(expiredCookies.some((c) => c.startsWith("tp_token=; path=/; max-age=0"))).toBe(true);
    expect(expiredCookies.some((c) => c.startsWith("tp_role=; path=/; max-age=0"))).toBe(true);
  });

  test("恢復時清 session 並導向帶安全回跳的登入頁", () => {
    resetSessionRecoveryForTests();
    const { replaced, store } = withStubbedWindow("/admin/materials", "?tab=all", () => {
      expect(recoverFromExpiredSession()).toBe(true);
    });
    expect([...store.keys()]).toEqual(["theme"]);
    expect(replaced).toEqual(["/login?redirect=%2Fadmin%2Fmaterials%3Ftab%3Dall"]);
  });

  test("同一頁只恢復一次（多個並行 401 不會導向多次）", () => {
    resetSessionRecoveryForTests();
    const { replaced } = withStubbedWindow("/admin/materials", "", () => {
      expect(recoverFromExpiredSession()).toBe(true);
      expect(recoverFromExpiredSession()).toBe(false);
      expect(recoverFromExpiredSession()).toBe(false);
    });
    expect(replaced).toHaveLength(1);
  });

  test("在 auth 頁上不恢復（帳密錯誤不是 session 失效）", () => {
    resetSessionRecoveryForTests();
    const { replaced } = withStubbedWindow("/login", "?redirect=%2Fadmin", () => {
      expect(recoverFromExpiredSession()).toBe(false);
    });
    expect(replaced).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 瀏覽器層：三個角色的 stale session 都必須回到登入頁
 * ------------------------------------------------------------------ */

test.describe("401 — stale session returns the user to login", () => {
  for (const { role, route, label } of PROTECTED_ROUTES) {
    test(`${label} ${route}: stale session → /login`, async ({ page }) => {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubBackendStatus(page, 401, { message: "Unauthorized" });

      await page.goto(route);

      // 三個角色都必須回到登入頁，並帶著原本要去的**站內**路徑
      await expect(page).toHaveURL(/login\?redirect=/);
      expect(decodeURIComponent(new URL(page.url()).searchParams.get("redirect") ?? "")).toContain(route);

      /*
       * cookie 必須清乾淨 —— `middleware.ts` 只讀 cookie，沒清就會判定仍登入而彈回來。
       * 這裡不斷言 localStorage：`signInAs()` 用 `addInitScript`，每次導覽都會重新注入，
       * 斷言它只會測到 fixture。localStorage 的清除由上方 `clearClientSession()` 純函式測試涵蓋。
       */
      expect(await sessionCookieNames(page)).toEqual([]);
    });
  }

  test("不會陷入 redirect loop：停在登入頁不再跳走", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await stubBackendStatus(page, 401, { message: "Unauthorized" });

    await page.goto("/admin/materials");
    await expect(page).toHaveURL(/login\?redirect=/);

    const settled = page.url();
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(settled);
  });

  test("登入頁自己的 401 不自我重導（帳密錯誤不是 session 失效）", async ({ page }) => {
    await page.route("**/api/auth/login", (route) => json(route, { message: "登入失敗" }, 401));
    await page.goto("/login");
    await page.fill("#login-email", "nobody@example.com");
    await page.fill("#login-password", "WrongPassword123!");
    await page.getByRole("button", { name: "登入", exact: true }).click();

    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).searchParams.get("redirect")).toBeNull();
  });

  test("沒有 token 的 401 不觸發導向（公開頁的頁內錯誤態不受影響）", async ({ page }) => {
    await stubBackendStatus(page, 401, { message: "Unauthorized" });
    await page.goto("/materials/mat_mock_001");

    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe("/materials/mat_mock_001");
  });
});

/* ------------------------------------------------------------------ *
 * 403：已驗證但無權限 —— 絕對不能當成 session 失效
 * ------------------------------------------------------------------ */

test.describe("403 — authorization denial must not log the user out", () => {
  for (const { role, route, label } of PROTECTED_ROUTES) {
    test(`${label} ${route}: 403 保留 session 且不導向`, async ({ page }) => {
      await signInAs(page, role, { email: `${role}-e2e@example.com` });
      await stubBackendStatus(page, 403, { message: "Forbidden" });

      await page.goto(route);
      await page.waitForTimeout(1000);

      expect(new URL(page.url()).pathname).toBe(route);
      expect(await sessionCookieNames(page)).toEqual(["tp_role", "tp_token"]);
      const token = await page.evaluate(() => localStorage.getItem("tp_token"));
      expect(token).not.toBeNull();
    });
  }
});

/* ------------------------------------------------------------------ *
 * 其他狀態碼不得被誤判成 session 失效
 * ------------------------------------------------------------------ */

test.describe("other statuses are not auth expiry", () => {
  for (const status of [400, 409, 500]) {
    test(`${status} 不清 session、不導向`, async ({ page }) => {
      await signInAs(page, "admin", { email: "admin-e2e@example.com" });
      await stubBackendStatus(page, status, { message: "boom" });

      await page.goto("/admin/materials");
      await page.waitForTimeout(1000);

      expect(new URL(page.url()).pathname).toBe("/admin/materials");
      expect(await sessionCookieNames(page)).toEqual(["tp_role", "tp_token"]);
    });
  }
});
