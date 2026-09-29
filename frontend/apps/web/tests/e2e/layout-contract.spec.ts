import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `Wave UI-4B` 的回歸護欄 —— `UI-CONS-07`（page gutter 與 container ownership）。
 *
 * ## 這裡鎖住的是「瀏覽器算出來的距離」，不是 class 字串
 *
 * 兩件事：
 *
 * 1. **一頁只有一層水平 gutter。** `UI-CONS-07` 的核心缺陷不是「數值不一樣」，
 *    而是**外殼與頁面同時供應內距**，於是同一個頁面在不同角色下縮排不同
 *    （買家路由的外殼取決於 `storedRole`，見 `RoleShell.getRoleByPath`）。
 *    這裡直接量 `<h1>` 到 `<main>` 內緣的距離：疊了兩層就會變成兩倍，一定會紅。
 *
 * 2. **canonical ladder 是 16 / 24 / 32。** 來自既有的 `page-mobile`／`page-tablet`／
 *    `page-desktop` token（`sm:` 640、`lg:` 1024 斷點），不是本輪新造的值。
 *
 * 允許的例外寫在 `docs/ui-design-system.md` §7.4，不在這裡斷言。
 *
 * ## `UI-REV-A`（2026-09-29）補強：零層也會紅
 *
 * `layers === 1` 本來就同時擋「兩層」與「零層」，但先前的 `CASES` **沒有涵蓋**真正漏掉 gutter 的頁面
 * （`/materials`、`/explore`、`/dashboard`、404、`/403`），於是 0px 的缺陷在測試全綠下存在。
 * 現在這些路由都在 `CASES` 裡，另加一個「零層」負向控制，並把刻意滿版的路由明文宣告在 `FULL_BLEED_ROUTES`。
 *
 * 標題長在卡片裡的頁（`/dashboard` 的 hero）不能從 `<h1>` 往上量 —— 卡片自己的內距會被算進去。
 * 那類頁面以 `anchor: "container"` 從 `PageContainer` 的 `data-page-container` 量起。
 */

/** viewport width → canonical gutter（`sm:` 640 / `lg:` 1024）。 */
function canonicalGutter(width: number) {
  if (width >= 1024) return 32;
  if (width >= 640) return 24;
  return 16;
}

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

async function stubApi(page: Page, role: string) {
  await page.route("**/api/backend/**", (route) =>
    json(route, { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })
  );
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_1", role, email: `${role}-e2e@example.com` } })
  );
}

/**
 * 從 `<h1>` 往上走到 `<main>`（含），把每一層的 `padding-left` 相加。
 *
 * **不能用「`h1` 左緣減 `main` 左緣」**：頁面容器是 `mx-auto max-w-*`，
 * 視窗比上限寬時 auto margin 會把 `h1` 推到中間，量到的是置中位移而不是 gutter。
 * 逐層累加 padding 只看內距，與容器寬度、置中與否無關。
 *
 * `layers` 是「真的貢獻了水平內距的層數」—— `UI-CONS-07` 要求它恰好是 1。
 */
type Anchor = "h1" | "container";

/** 量測起點：`h1` 從標題的父層往上；`container` 從 `PageContainer` 本身往上（含它自己）。 */
function anchorSelector(anchor: Anchor) {
  return anchor === "container" ? "main [data-page-container]" : "main h1";
}

async function gutterOf(page: Page, anchor: Anchor = "h1") {
  return page.evaluate((a) => {
    const main = document.querySelector("main");
    const start =
      a === "container"
        ? (main?.querySelector<HTMLElement>("[data-page-container]") ?? null)
        : (main?.querySelector("h1")?.parentElement ?? null);
    if (!main || !start) return null;
    let total = 0;
    let layers = 0;
    let node: HTMLElement | null = start;
    while (node) {
      const pad = Math.round(parseFloat(getComputedStyle(node).paddingLeft) || 0);
      if (pad > 0) {
        total += pad;
        layers += 1;
      }
      if (node === main) break;
      node = node.parentElement;
    }
    return { gutter: total, layers, mains: document.querySelectorAll("main").length };
  }, anchor);
}

type Case = { surface: string; route: string; role: "admin" | "teacher" | "parent" | "guest"; anchor?: Anchor };

/**
 * 每個 surface 取「標題直接長在頁面容器裡」的代表頁。
 * 標題被包在 Card 裡的頁（例如 `/me/orders/:id`）不適合這個量法 —— Card 自己的
 * 內距會被算進去，那不是 page gutter。
 */
const CASES: Case[] = [
  { surface: "Admin", route: "/admin/orders", role: "admin" },
  { surface: "Admin", route: "/admin/complaints", role: "admin" },
  { surface: "Creator", route: "/teacher/materials", role: "teacher" },
  { surface: "Creator", route: "/teacher/materials/new", role: "teacher" },
  { surface: "Buyer", route: "/favorites", role: "parent" },
  { surface: "Buyer", route: "/my-reviews", role: "parent" },
  { surface: "Public", route: "/support", role: "guest" },
  /* `UI-REV-A`（2026-09-29）：先前 0 gutter 或寫死 16px 的頁面，現在由 `PageContainer` 供應。 */
  { surface: "Public", route: "/materials", role: "guest", anchor: "container" },
  { surface: "Buyer", route: "/explore", role: "parent", anchor: "container" },
  { surface: "Buyer", route: "/dashboard", role: "parent", anchor: "container" },
  { surface: "Public", route: "/403", role: "guest", anchor: "container" },
  /* 未發布的法律文件走 `app/not-found.tsx`（測試資料庫沒有任何已發布條文）。 */
  { surface: "Public", route: "/terms", role: "guest", anchor: "container" },
];

/**
 * **刻意滿版**、因此不在上面斷言 page gutter 的路由（`docs/ui-design-system.md` §7.3／§7.5）。
 * 寫在這裡是為了讓「沒有 gutter」成為一個被宣告的決定，而不是被遺漏的頁面。
 */
export const FULL_BLEED_ROUTES: Record<string, string> = {
  "/": "landing 的區塊底色帶需貼齊視窗左右；各區塊內部自行供應內距",
  "/materials/:id": "`MaterialDetailHeader` 是 sticky 滿版返回列，border-b 需貼齊視窗",
};

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`UI-CONS-07 — canonical page gutter @${vp.w}`, () => {
    for (const c of CASES) {
      test(`${c.surface} ${c.route} 只有一層 canonical gutter`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        const page = await context.newPage();
        if (c.role !== "guest") await signInAs(page, c.role, { email: `${c.role}-e2e@example.com` });
        await stubApi(page, c.role === "guest" ? "parent" : c.role);
        await page.goto(c.route, { waitUntil: "domcontentloaded" });
        /*
         * 等的是 **`<main>` 裡的** `<h1>`：`app/layout.tsx` 以 `<Suspense fallback={children}>`
         * 包住 `RoleShell`，頁面會先在外殼**之外**掛載一次、再移進外殼（`UI-QA-CI`，2026-09-29 查證）。
         * 只等「任一 h1」會量到即將被卸載的那一份 —— production build 夠快時就穩定紅燈。
         */
        await expect(page.locator(anchorSelector(c.anchor ?? "h1")).first()).toBeVisible();

        const m = await gutterOf(page, c.anchor ?? "h1");
        expect(m, `${c.route} 必須同時有 <main> 與量測起點（${c.anchor ?? "h1"}）`).not.toBeNull();
        expect(m!.mains, `${c.route} 只能有一個 main landmark（COR-06）`).toBe(1);
        expect(m!.layers, `${c.route} @${vp.w} 只能有一層水平內距（外殼與頁面不得同時供應）`).toBe(1);
        expect(m!.gutter, `${c.route} @${vp.w} 的 page gutter`).toBe(canonicalGutter(vp.w));

        await context.close();
      });
    }
  });
}

/**
 * 負向控制：確認上面的量法真的抓得到「多疊一層內距」。
 * 在頁面容器外再包一層 32px 內距後，同一組量法必須讀到更大的值。
 */
test("gutter 量法能偵測到多出來的一層內距", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await signInAs(page, "parent", { email: "parent-e2e@example.com" });
  await stubApi(page, "parent");
  await page.goto("/favorites", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1").first()).toBeVisible();

  const before = await gutterOf(page);
  expect(before!.gutter).toBe(32);
  expect(before!.layers).toBe(1);

  /*
   * 直接加在 `<main>` 上 —— 那正是「外殼也供應一層 gutter」的情形，
   * 也是 `UI-CONS-07` 修掉的那個缺陷。加在 `main.firstElementChild` 沒有用：
   * 那個節點不一定在 `<h1>` 的祖先鏈上（可能是 nav 之類的兄弟子樹）。
   */
  await page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement | null;
    if (main) main.style.paddingLeft = "32px";
  });

  const after = await gutterOf(page);
  expect(after!.gutter, "多疊一層 32px 後必須量到 64").toBe(64);
  expect(after!.layers, "多疊一層後必須量到兩層").toBe(2);
});

/**
 * 負向控制：確認量法抓得到「**零層**」—— `UI-REV-A` 的缺陷形態（`/materials` 實測 0px）。
 * 拿掉 `PageContainer` 的內距後，同一組量法必須讀到 0 層，`CASES` 的 `layers === 1` 斷言才會紅。
 */
test("gutter 量法能偵測到零層內距", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await stubApi(page, "parent");
  await page.goto("/materials", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main [data-page-container]").first()).toBeVisible();

  const before = await gutterOf(page, "container");
  expect(before!.gutter).toBe(32);
  expect(before!.layers).toBe(1);

  await page.evaluate(() => {
    const c = document.querySelector("main [data-page-container]") as HTMLElement | null;
    if (c) c.style.paddingLeft = "0px";
  });

  const after = await gutterOf(page, "container");
  expect(after!.gutter, "拿掉 gutter 後必須量到 0").toBe(0);
  expect(after!.layers, "拿掉 gutter 後必須量到零層").toBe(0);
  await context.close();
});
