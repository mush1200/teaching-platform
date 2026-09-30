import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * **UI Review 真實資料 harness** —— `tests/visual/` 下兩支 spec 共用：
 *   - `ui-review-visual.spec.ts`（`toHaveScreenshot`，L2）
 *   - `ui-review-a11y.spec.ts`（axe on real data，`UI-QA-A11Y-SWEEP`）
 * 路由清單（`tests/ui-review/routes.json`）、正式 `/auth/login` 取 token、外部圖片攔截、
 * 「頁面已穩定」的判準都只在這裡定義一次 —— 兩個 gate 不會各自發展出不同的「穩定」定義。
 */

export type Manifest = {
  accounts: Record<string, string>;
  routes: Array<{ role: string | null; path: string; label: string; visual?: boolean; a11y?: boolean; note?: string }>;
};

const WEB_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..", "..");
export const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(WEB_ROOT, "tests", "ui-review", "routes.json"), "utf8")
) as Manifest;
export const BACKEND_URL = "http://127.0.0.1:3100";


/** 固定的替代圖（中性灰），取代任何外部圖片。 */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#E5E7EB"/></svg>';

/**
 * 日期（`2026/09/29`、`2026-09-29`、`2026.9.29`、`9/29`、`2026年9月27日`、`9月27日`）與時間（`14:05`、`14:05:09`）。
 * 中文格式是 2026-09-29 審閱 Linux 基準時發現的漏網之魚（Admin 訂單／檢舉的「建立時間」）—— 不補的話基準隔天就會失效。
 * 在頁面內以字串形式重建成 RegExp（`page.evaluate` 不能直接傳 RegExp）。
 */
const DYNAMIC_TEXT_SOURCE =
  "\\d{4}年\\d{1,2}月\\d{1,2}日|(?<!\\d)\\d{1,2}月\\d{1,2}日|\\d{4}[/.\\-]\\d{1,2}[/.\\-]\\d{1,2}|(?<!\\d)\\d{1,2}\\/\\d{1,2}(?!\\d)|(?<!\\d)\\d{1,2}:\\d{2}(?::\\d{2})?(?!\\d)";

/** 把文字節點中的日期／時間數字換成 0；回傳被改動的片段數（供除錯）。 */
export async function normalizeDynamicText(page: Page) {
  return page.evaluate((source) => {
    const pattern = new RegExp(source, "g");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let changed = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      const next = text.replace(pattern, (m) => {
        changed += 1;
        return m.replace(/\d/g, "0");
      });
      if (next !== text) node.nodeValue = next;
    }
    return changed;
  }, DYNAMIC_TEXT_SOURCE);
}

function readFixturePassword(): string {
  const file = path.join(REPO_ROOT, "Backend", ".ui-review-credentials.txt");
  const match = fs.readFileSync(file, "utf8").match(/^password:\s*(\S+)\s*$/m);
  if (!match) throw new Error("找不到 UI Review fixture 密碼 —— 請先執行 npm run ui-review:reset");
  return match[1];
}

const tokenCache = new Map<string, { token: string; role: string }>();

/** 走正式的 `/auth/login`（與 `measure-layout.mjs` 相同），不簽發任何 token。 */
async function tokenFor(accountKey: string) {
  const cached = tokenCache.get(accountKey);
  if (cached) return cached;
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MANIFEST.accounts[accountKey], password: readFixturePassword() }),
  });
  if (!res.ok) throw new Error(`fixture 登入失敗 ${accountKey}: HTTP ${res.status}`);
  const data = (await res.json()) as { token: string; user: { role: string } };
  const value = { token: data.token, role: data.user.role };
  tokenCache.set(accountKey, value);
  return value;
}

export async function prepareContext(context: BrowserContext, role: string | null, baseURL: string) {
  await context.route(
    (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
    (route) =>
      route.request().resourceType() === "image"
        ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: PLACEHOLDER_SVG })
        : route.abort()
  );
  if (!role) return;
  const { token, role: r } = await tokenFor(role);
  await context.addCookies([
    { name: "tp_token", value: token, url: baseURL },
    { name: "tp_role", value: r, url: baseURL },
  ]);
  await context.addInitScript(
    ({ t, rr }) => {
      localStorage.setItem("tp_token", t);
      localStorage.setItem("tp_role", rr);
    },
    { t: token, rr: r }
  );
}

export async function settle(page: Page, route: string) {
  /* 每個階段都是具名 step、且各自的逾時遠小於 test 逾時 —— 失敗時要看得出卡在哪一步。 */
  await test.step("外殼內已有頁面標題", async () => {
    await expect(page.locator("main h1").first(), "<main> 內必須已有頁面標題").toBeAttached({ timeout: 45_000 });
  });
  await test.step("是目標頁、不是錯誤頁", async () => {
    expect(new URL(page.url()).pathname, "停留的路由").toBe(route);
    await expect(page.getByRole("heading", { level: 1, name: /^(500|404)$/ }), "不得落到錯誤頁").toHaveCount(0);
  });
  await test.step("network idle", async () => {
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
  });
  await test.step("<main> 內沒有載入中", async () => {
    await expect(page.locator("main").getByText(/載入中/), "<main> 內不得仍在載入").toHaveCount(0, { timeout: 30_000 });
  });
  await test.step("字型與第一屏圖片", async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      /*
       * 只等**第一屏內**的圖片：卡片圖是 `loading="lazy"`，第一屏外的圖片永遠不會開始載入（768／390 實測）。
       * `<img>` 只會觸發 `load` 或 `error`，**沒有** `loadend` —— 先前監聽 `loadend` 會在圖片尚未完成時
       * 永遠等不到，負載高時間歇逾時（2026-09-29 實測 `/`、`/dashboard` @1440）。另設上限，避免單張圖卡死整個 test。
       */
      const inView = [...document.images].filter((img) => {
        const r = img.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      });
      await Promise.all(
        inView.map((img) =>
          img.complete
            ? null
            : Promise.race([
                new Promise((resolve) => {
                  img.addEventListener("load", resolve, { once: true });
                  img.addEventListener("error", resolve, { once: true });
                }),
                new Promise((resolve) => setTimeout(resolve, 15_000)),
              ])
        )
      );
    });
  });
}
