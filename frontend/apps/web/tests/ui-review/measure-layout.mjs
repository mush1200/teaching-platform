/**
 * UI Review 的 **版面量測 traversal**。
 *
 * ```
 *   node tests/ui-review/measure-layout.mjs            # 量測 + 截圖
 *   node tests/ui-review/measure-layout.mjs --no-shots # 只量測
 * ```
 *
 * ## 這支腳本回答的問題
 *
 * 「主內容離側欄多遠、那段距離是**誰**給的、以及有沒有人給了兩次或一次都沒給。」
 *
 * 逐層累加 `padding-left`（而不是量 `h1.left − main.left`）的理由與
 * `tests/e2e/layout-contract.spec.ts` 相同：頁面容器多半是 `mx-auto max-w-*`，
 * 視窗比上限寬時 auto margin 會把元素推到中間，量到的會是置中位移而不是 gutter。
 *
 * ## 這支腳本**不**做的事
 *
 * 不寫入資料庫、不改任何 UI、不下判斷 —— 它只產出數字。
 * 判讀與分級在 `docs/ui-review-findings-2026-09-29.md`。
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "out");
const SHOTS_DIR = path.join(OUT_DIR, "screenshots");
const BASE = "http://localhost:3110";
const TAKE_SHOTS = !process.argv.includes("--no-shots");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

/**
 * 路由與 fixture 帳號的**唯一來源**是 `routes.json`（`tests/visual/` 的 canonical 視覺回歸也讀同一份）。
 * 本腳本是**診斷用**的截圖矩陣 ＋ 版面量測：截圖寫到 git-ignored 的 `out/`，不作為任何基準。
 * canonical 視覺基準只有 `tests/visual/`（`toHaveScreenshot`，Linux 產生）。
 */
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, "routes.json"), "utf8"));
/** `role: null` = 不登入。 */
const ROUTES = MANIFEST.routes;
const ACCOUNTS = MANIFEST.accounts;

function readPassword() {
  const f = path.join(HERE, "..", "..", "..", "..", "..", "Backend", ".ui-review-credentials.txt");
  const m = fs.readFileSync(f, "utf8").match(/^password:\s*(\S+)\s*$/m);
  if (!m) throw new Error("找不到 fixture 密碼，請先執行 npm run ui-review:reset");
  return m[1];
}

/** 直接打 backend 換 token —— 比每次走登入表單快得多，且用的是同一條正式流程。 */
async function tokenFor(email, password) {
  const res = await fetch("http://localhost:3100/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`登入失敗 ${email}: HTTP ${res.status}`);
  const data = await res.json();
  return { token: data.token, role: data.user.role };
}

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const side = [...document.querySelectorAll("aside")].find((a) => {
    const b = a.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.left <= 1;
  });
  const main = document.querySelector("main");
  const h1 = document.querySelector("h1");
  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) };
  };

  const chain = [];
  if (h1 && main) {
    let n = h1;
    while (n) {
      const cs = getComputedStyle(n);
      const pl = parseFloat(cs.paddingLeft) || 0;
      if (pl > 0) chain.push({ tag: n.tagName.toLowerCase(), cls: String(n.className || "").slice(0, 70), pl });
      if (n === main) break;
      n = n.parentElement;
    }
  }

  // 主內容的第一個「視覺方塊」左緣 —— 這才是使用者看到的貼邊與否
  const firstBlock = main
    ? [...main.querySelectorAll("section, article, div")].find((el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return b.width > 120 && b.height > 60 && b.top < 900 &&
          (cs.borderLeftWidth !== "0px" || cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.boxShadow !== "none");
      })
    : null;

  const sideR = side ? rect(side).r : 0;
  const h1R = rect(h1);
  const fbR = rect(firstBlock);

  return {
    vw,
    sidebarVisible: !!side,
    sidebar: rect(side),
    main: rect(main),
    h1Text: h1 ? h1.textContent.trim().slice(0, 40) : null,
    h1Left: h1R ? h1R.l : null,
    gapSidebarToH1: h1R ? h1R.l - sideR : null,
    firstBlockLeft: fbR ? fbR.l : null,
    gapSidebarToBlock: fbR ? fbR.l - sideR : null,
    gutterLayers: chain.length,
    gutterTotalPx: chain.reduce((s, x) => s + x.pl, 0),
    gutterChain: chain,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const password = readPassword();

  const tokens = {};
  for (const [key, email] of Object.entries(ACCOUNTS)) tokens[key] = await tokenFor(email, password);
  console.log(`  取得 ${Object.keys(tokens).length} 個 fixture token`);

  const browser = await chromium.launch();
  const results = [];
  let n = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const route of ROUTES) {
      n += 1;
      const page = await ctx.newPage();
      try {
        if (route.role) {
          const { token, role } = tokens[route.role];
          await ctx.addCookies([
            { name: "tp_token", value: token, url: BASE },
            { name: "tp_role", value: role, url: BASE },
          ]);
          await page.addInitScript(
            ({ t, r }) => {
              localStorage.setItem("tp_token", t);
              localStorage.setItem("tp_role", r);
            },
            { t: token, r: role }
          );
        }
        await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(1200);
        const m = await page.evaluate(MEASURE);
        const shot = `${vp.name}__${(route.role ?? "public")}__${route.path.replace(/[^a-z0-9]+/gi, "_")}.png`;
        if (TAKE_SHOTS) {
          await page.screenshot({ path: path.join(SHOTS_DIR, shot), fullPage: false });
        }
        results.push({ viewport: vp.name, ...route, ...m, screenshot: TAKE_SHOTS ? shot : null, error: null });
        process.stdout.write(".");
      } catch (err) {
        results.push({ viewport: vp.name, ...route, error: String(err.message || err).slice(0, 200) });
        process.stdout.write("x");
      } finally {
        await page.close();
      }
    }
    await ctx.close();
    console.log(` ${vp.name} done`);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, "layout-measurements.json"), JSON.stringify(results, null, 2));
  console.log(`\n  ${n} 組 route×viewport 量測完成 → tests/ui-review/out/layout-measurements.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
