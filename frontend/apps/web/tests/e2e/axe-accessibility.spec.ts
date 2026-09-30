import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { SEED_MATERIAL_ID } from "./helpers/backend-prerequisite";
import { installCoreApiMocks } from "./helpers/mock-api";
import { AXE_TAGS, assertAxeClean } from "../shared/axe-policy";
import type { AxeException } from "../shared/axe-policy";

/**
 * `UI-QA-AXE` —— L1 標準化無障礙規則掃描（`docs/ui-quality-system.md` §L1）。
 *
 * ## 與既有 contract spec 的分工（不重複）
 *
 *   - `contrast-contract` / `accessibility-contract` / `focus-visible` /
 *     `page-heading-and-nav-semantics` / `layout-contract` …：**本專案自己的數值規則**
 *     （44px 觸控目標、canonical 配色 ≥ 4.5:1、一頁一個 gutter 層…）。axe 不知道這些規則。
 *   - 本檔：**axe-core 的標準規則集**（WCAG 2.x A/AA ＋ best-practice）——
 *     name/role/value、label、landmark、aria 屬性合法性、實際渲染的對比…
 *     這些是 contract spec 沒有、也不該手寫的廣度覆蓋。
 *
 * ## Gate 政策
 *
 *   - `critical` / `serious` → **本 test 失敗**（merge-blocking，CI 的 `ui-quality` job 會紅）。
 *   - `moderate` / `minor` → 只列在報告（annotation ＋ JSON attachment），不阻擋。
 *   - 例外只能逐條寫在 `KNOWN_EXCEPTIONS`：**路由 ＋ rule ＋ 節點 selector** 三者都要精確相符，
 *     並附 tracker ID。**沒有**全域停用規則，也沒有「整條路由略過」。
 *     例外若已不再發生，test 會失敗 —— 逼著把過時的例外刪掉。
 *
 * ## 資料來源
 *
 * client 端 API 由 `installCoreApiMocks` 供應（與其他 UI contract spec 相同），沒 mock 的
 * GET 一律回空清單 —— 因此掃描是 deterministic，不依賴測試資料庫的內容。
 * 唯一的例外是 `/materials/:id`：那是 server component，由 harness 啟動的 backend
 * 讀取 migration seed（`SEED_MATERIAL_ID`）。
 *
 * 每條路由都會斷言**最後停留的 URL 就是目標路由** —— 否則一次被導到 `/login` 的掃描
 * 會以「登入頁沒有違規」的形式假綠。
 */

type Role = "public" | "parent" | "teacher" | "admin";

type RouteCase = {
  role: Role;
  path: string;
  label: string;
};

const ROUTES: RouteCase[] = [
  { role: "public", path: "/", label: "首頁" },
  { role: "public", path: "/materials", label: "教材列表" },
  { role: "public", path: `/materials/${SEED_MATERIAL_ID}`, label: "教材詳情" },
  { role: "public", path: "/login", label: "登入" },

  { role: "parent", path: "/dashboard", label: "購買者總覽" },
  { role: "parent", path: "/me/orders", label: "我的訂單" },
  { role: "parent", path: "/favorites", label: "收藏清單" },
  { role: "parent", path: "/me/materials", label: "我的教材" },

  { role: "teacher", path: "/creator/materials", label: "創作者：教材管理" },
  { role: "teacher", path: "/creator/sales", label: "創作者：我的銷售" },
  { role: "teacher", path: "/creator/cases", label: "創作者：我的案件" },

  { role: "admin", path: "/admin", label: "Admin Dashboard" },
  { role: "admin", path: "/admin/orders", label: "Admin 訂單" },
  { role: "admin", path: "/admin/reports", label: "Admin 檢舉" },
  { role: "admin", path: "/admin/payment-proofs", label: "Admin 付款憑證審核" },
  { role: "admin", path: "/admin/remedy-cases", label: "Admin 補救案件" },
];

/* 規則集、阻擋門檻與例外比對統一在 `tests/shared/axe-policy.ts`（與 UI Review 真實資料的 axe 共用）。 */

/**
 * 逐條、精確的暫時例外 —— 每一條都是**已立案的既有缺陷**，不是「可以接受」。
 * 政策見 `docs/ui-quality-system.md` §L1「例外政策」。修好之後對應條目會變成 stale 而讓本檔失敗，
 * 屆時刪掉即可。**不得**新增沒有 tracker ID 的條目，也**不得**以 rule 或路由為單位整批略過。
 * 條目格式：`{ path, ruleId, target, scopes: ["chromium-desktop" | "chromium-mobile", …], ref: "<tracker ID>" }`。
 */

const KNOWN_EXCEPTIONS: AxeException[] = [
  /*
   * `UI-QA-A11Y-01`（白字 on 舊品牌紫 #6C63FF ＝ 4.31:1）的 7 條例外已於 2026-09-29 移除：
   * Owner 選定品牌紫 #5C4EEA（白字 5.63:1），所有 `bg-edu-primary text-white` 表面改由 token 取值後通過。
   */
  /*
   * `UI-QA-A11Y-02`（買家側欄分組標題 2.07:1）的 12 條例外已於 2026-09-29 移除：
   * 改用 `ds-textSubtle`（5.07:1）後 gate 將它們判為 stale —— 例外機制如設計般運作。
   */
  /*
   * `UI-QA-A11Y-03`（買家總覽 Hero CTA 寫死 `#FF6B73`，2.76:1）的例外已於 2026-09-30 移除：
   * `UI-QA-COMMERCE-COLOR` 落地時 Hero 改用 canonical flow token（4.66:1），結帳步驟改用購買 token。
   * 目前沒有任何例外。
   */
];

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

const EMPTY_LIST = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

async function prepare(page: Page, role: Role) {
  /*
   * Playwright 以「後註冊先處理」的順序執行 route handler：
   *   1. 最先註冊的 catch-all —— 沒人處理的 GET 回空清單（不打真實後端、不因假 token 被導走）
   *   2. `installCoreApiMocks` —— 共用 fixture
   *   3. 最後註冊的 `auth/me` —— 依角色回應，優先權最高
   */
  await page.route("**/api/backend/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/backend\//, "");
    /*
     * 教材詳情是 client 端抓 `materials/:id`：回空清單會讓頁面落到「找不到教材」狀態，
     * 掃到的就不是詳情頁（2026-09-29 發現：先前的 moderate `page-has-heading-one` 正是這個假象）。
     * seed 教材一律放行到 harness 的真實 backend。
     */
    if (path === `materials/${SEED_MATERIAL_ID}` || path.startsWith(`materials/${SEED_MATERIAL_ID}/`)) {
      return route.fallback();
    }
    return route.request().method() === "GET" ? json(route, EMPTY_LIST) : route.fallback();
  });
  await installCoreApiMocks(page);

  if (role === "public") return;

  await signInAs(page, role);
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, {
      user: { id: `usr_${role}_axe`, role, email: `${role}-e2e@example.com`, created_at: "2026-05-01T00:00:00.000Z" },
    })
  );
}

test.describe("UI-QA-AXE — axe-core 標準規則（critical／serious 阻擋）", () => {
  for (const rc of ROUTES) {
    test(`${rc.label}（${rc.role}）${rc.path}`, async ({ page }, testInfo) => {
      await prepare(page, rc.role);

      await page.goto(rc.path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);

      /* 假綠防線：掃描的必須是目標頁，不是被導去的 `/login` 或 `/403`。 */
      expect(new URL(page.url()).pathname, "掃描前停留的路由").toBe(rc.path);
      /*
       * 第二道：URL 對了，頁面也可能已經落到 `app/error.tsx`（500）或 `app/not-found.tsx`（404）——
       * 例如 mock payload 形狀不對讓頁面崩潰。那時掃到的是錯誤頁，不是目標頁。
       */
      await expect(
        page.getByRole("heading", { level: 1, name: /^(500|404)$/ }),
        "目標頁不得落到錯誤頁或 404"
      ).toHaveCount(0);
      /* 第三道：已渲染完成的頁面在 `<main>` 裡一定有頁面標題（可為 sr-only）。沒有就代表還在載入或落到空狀態。 */
      await expect(page.locator("main h1").first(), "掃描前 <main> 內必須已有頁面標題").toBeAttached();

      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

      await assertAxeClean(results, {
        testInfo,
        label: rc.label,
        path: rc.path,
        role: rc.role,
        scope: testInfo.project.name,
        exceptions: KNOWN_EXCEPTIONS,
      });
    });
  }
});
