import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * **Canonical 視覺回歸**（L2，`UI-QA-VISUAL-BASELINE`）—— `toHaveScreenshot`。
 * 設定與拓撲見 `playwright.visual.config.ts`，政策見 `docs/ui-quality-system.md` §3。
 *
 * ## 範圍
 *
 * `tests/ui-review/routes.json` 中 `visual: true` 的路由 × 390／768／1440。路由清單只有那一份；
 * `measure-layout.mjs` 讀同一份，但它是**診斷用**矩陣，不是基準。
 * 截圖為**第一屏**（viewport），不是整頁 —— 基準的目的是抓版面／外殼／字級／色彩的回歸，
 * 整頁截圖會讓一筆資料的增減就改動整張圖。
 *
 * ## 何時才截圖（「頁面已穩定」的證據，全部都要成立）
 *
 *   1. 停留的 URL 就是目標路由（沒被導去 `/login`／`/403`）
 *   2. `<main>` 裡有頁面標題 —— 頁面會先在外殼之外掛載一次（`UI-QA-SHELL-MOUNT`），不能量到那一份
 *   3. 不是 `app/error.tsx`（500）或 `app/not-found.tsx`（404）
 *   4. network idle、`document.fonts.ready`、所有 `<img>` 載入完成、`<main>` 內沒有「載入中」
 *   5. `toHaveScreenshot` 自己再要求連續兩張相同
 *
 * ## 正規化與遮罩（只處理真正會變的東西）
 *
 *   - **日期／時間 → 正規化，不遮罩。** fixture 的時間是以 seed 當下為基準的相對偏移，絕對日期每天不同。
 *     截圖前把文字節點裡符合日期／時間格式的**數字**換成 `0`（`2026/09/29` → `0000/00/00`），
 *     版面、字級、位置都保留。先前以 `getByText` 遮罩時會命中整個容器（Admin 總覽兩整塊面板被塗滿），
 *     那等於不驗那一區 —— 因此改為正規化。
 *   - **待 Owner 決定的粉色強調色**（`UI-QA-A11Y-03`）：`#FF6B73`／`#FF6B7A` 的元素。
 *     不把已知不合格的顏色鎖進基準；Owner 選定並套用後這些 class 會消失，遮罩自動失效，
 *     屆時依 §3 政策重新產生基準。
 *
 * 外部網址的圖片（backend 啟動時為無封面教材補的 `picsum.photos`）一律以本機的固定圖取代 ——
 * 基準不得依賴外部服務。
 */

type Manifest = {
  accounts: Record<string, string>;
  routes: Array<{ role: string | null; path: string; label: string; visual?: boolean }>;
};

const WEB_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..", "..");
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(WEB_ROOT, "tests", "ui-review", "routes.json"), "utf8")
) as Manifest;
const VISUAL_ROUTES = MANIFEST.routes.filter((r) => r.visual);
const BACKEND_URL = "http://127.0.0.1:3100";

const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
];

/** 固定的替代圖（中性灰），取代任何外部圖片。 */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#E5E7EB"/></svg>';

/**
 * 日期（`2026/09/29`、`2026-09-29`、`2026.9.29`、`9/29`）與時間（`14:05`、`14:05:09`）。
 * 在頁面內以字串形式重建成 RegExp（`page.evaluate` 不能直接傳 RegExp）。
 */
const DYNAMIC_TEXT_SOURCE =
  "\\d{4}[/.\\-]\\d{1,2}[/.\\-]\\d{1,2}|(?<!\\d)\\d{1,2}\\/\\d{1,2}(?!\\d)|(?<!\\d)\\d{1,2}:\\d{2}(?::\\d{2})?(?!\\d)";

/** 把文字節點中的日期／時間數字換成 0；回傳被改動的片段數（供除錯）。 */
async function normalizeDynamicText(page: Page) {
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
const PENDING_PINK_SELECTOR = '[class*="FF6B73" i], [class*="FF6B7A" i]';

test.skip(
  process.platform !== "linux" && process.env.VISUAL_ALLOW_NON_LINUX !== "1",
  "canonical 視覺基準只在 Linux（CI）產生與比對；本機請用 CI 的 visual job"
);

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

async function prepareContext(context: BrowserContext, role: string | null, baseURL: string) {
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

async function settle(page: Page, route: string) {
  /* 每個階段都是具名 step、且各自的逾時遠小於 test 逾時 —— 失敗時要看得出卡在哪一步。 */
  await test.step("外殼內已有頁面標題", async () => {
    await expect(page.locator("main h1").first(), "<main> 內必須已有頁面標題").toBeAttached({ timeout: 45_000 });
  });
  await test.step("是目標頁、不是錯誤頁", async () => {
    expect(new URL(page.url()).pathname, "截圖時停留的路由").toBe(route);
    await expect(page.getByRole("heading", { level: 1, name: /^(500|404)$/ }), "不得截到錯誤頁").toHaveCount(0);
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

function slug(value: string) {
  return value.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

for (const r of VISUAL_ROUTES) {
  for (const vp of WIDTHS) {
    test(`${r.label}（${r.role ?? "public"}）${r.path} @${vp.w}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await prepareContext(context, r.role, baseURL!);
      const page = await context.newPage();

      await page.goto(r.path, { waitUntil: "domcontentloaded" });
      await settle(page, r.path);
      await normalizeDynamicText(page);

      await expect(page).toHaveScreenshot(`${r.role ?? "public"}-${slug(r.path)}-${vp.w}.png`, {
        mask: [page.locator(PENDING_PINK_SELECTOR)],
        maskColor: "#FF00FF",
      });

      await context.close();
    });
  }
}
