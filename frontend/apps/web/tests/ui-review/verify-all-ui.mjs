/**
 * Owner UI Review Index（`all-ui.json`）的連結驗證。
 *
 * 用法（先啟動 UI Review 環境：`npm run ui-review:backend` 與 `npm run ui-review:frontend`）：
 *   node tests/ui-review/verify-all-ui.mjs
 *
 * 逐條以該條目的 fixture 角色登入（正式 `/auth/login`，與 `measure-layout.mjs` 相同；不簽發任何 token），
 * 開啟頁面並判定：
 *   - 一般條目：最終網址 = `expect.path`（預設等於 path）、`<main>` 有標題、不是 404／500；
 *   - `expect.notFound`：必須是 404（例如 UI Review 沒有已發布條文的法務頁）；
 *   - 權限導向（例如未登入進購物車 → `/login`、購買者進後台 → `/403`）以 `expect.path` 表達。
 * 另外把 React hydration 錯誤列為 WARN（不判失敗，但會印出）。任何 FAIL 時 exit code 1。
 *
 * 只讀不寫：不新增、不修改任何資料。密碼取自 git-ignored 的 `Backend/.ui-review-credentials.txt`，不會印出。
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const FRONTEND = process.env.UI_REVIEW_FRONTEND_URL || "http://localhost:3110";
const BACKEND = process.env.UI_REVIEW_BACKEND_URL || "http://localhost:3100";

const data = JSON.parse(fs.readFileSync(path.join(HERE, "all-ui.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "routes.json"), "utf8"));
const credentials = fs.readFileSync(path.join(REPO_ROOT, "Backend", ".ui-review-credentials.txt"), "utf8");
const password = credentials.match(/^password:\s*(\S+)\s*$/m)?.[1];
if (!password) throw new Error("找不到 UI Review fixture 密碼 —— 請先執行 npm run ui-review:reset");

const tokens = new Map();
async function login(role) {
  if (tokens.has(role)) return tokens.get(role);
  const res = await fetch(`${BACKEND}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: manifest.accounts[role], password }),
  });
  if (!res.ok) throw new Error(`fixture 登入失敗 ${role}: HTTP ${res.status}`);
  const j = await res.json();
  const value = { token: j.token, role: j.user.role };
  tokens.set(role, value);
  return value;
}

const browser = await chromium.launch();
const contexts = new Map();
async function contextFor(role) {
  if (contexts.has(role)) return contexts.get(role);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (role !== "public") {
    const t = await login(role);
    await ctx.addCookies([
      { name: "tp_token", value: t.token, url: FRONTEND },
      { name: "tp_role", value: t.role, url: FRONTEND },
    ]);
    await ctx.addInitScript(({ tk, r }) => {
      localStorage.setItem("tp_token", tk);
      localStorage.setItem("tp_role", r);
    }, { tk: t.token, r: t.role });
  }
  contexts.set(role, ctx);
  return ctx;
}

let failed = 0;
let warned = 0;
let checked = 0;
for (const section of data.sections) {
  for (const item of section.items) {
    checked += 1;
    const page = await (await contextFor(item.role)).newPage();
    const hydration = [];
    page.on("pageerror", (e) => {
      if (/hydrat/i.test(e.message)) hydration.push(e.message.split("\n")[0]);
    });
    let status = 0;
    let error = "";
    try {
      const resp = await page.goto(FRONTEND + item.path, { waitUntil: "domcontentloaded", timeout: 300_000 });
      status = resp?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
      await page.locator("main h1, h1").first().waitFor({ timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(800);
    } catch (e) {
      error = String(e.message).split("\n")[0];
    }
    const finalPath = new URL(page.url()).pathname;
    const h1 = ((await page.locator("main h1").first().textContent({ timeout: 2000 }).catch(() => null)) ??
      (await page.locator("h1").first().textContent({ timeout: 2000 }).catch(() => "")) ??
      "").trim();
    const is404 = /^404$/.test(h1) || status === 404;
    const is500 = /^500$/.test(h1) || status >= 500;
    const expectedPath = item.expect?.path ?? new URL(FRONTEND + item.path).pathname;
    const ok = item.expect?.notFound
      ? is404
      : !error && !is404 && !is500 && finalPath === expectedPath && h1.length > 0;
    if (!ok) failed += 1;
    if (hydration.length) warned += 1;
    const tag = ok ? (hydration.length ? "WARN" : "OK  ") : "FAIL";
    console.log(
      `${tag} [${section.key}/${item.role}] ${item.path} -> ${finalPath} (${status}) h1="${h1.slice(0, 24)}"` +
        (error ? ` ERROR ${error}` : "") +
        (hydration.length ? ` hydration: ${hydration[0].slice(0, 80)}` : "")
    );
    await page.close();
  }
}
await browser.close();
console.log(`\n${checked} checked, ${failed} failed, ${warned} with hydration warnings`);
process.exit(failed ? 1 : 0);
