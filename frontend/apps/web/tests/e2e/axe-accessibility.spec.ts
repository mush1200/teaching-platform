import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { SEED_MATERIAL_ID } from "./helpers/backend-prerequisite";
import { installCoreApiMocks } from "./helpers/mock-api";

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

/** 阻擋 merge 的嚴重度。 */
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

/** axe 規則集：WCAG 2.0／2.1／2.2 的 A 與 AA，加上 best-practice。 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

type Project = "chromium-desktop" | "chromium-mobile";
const BOTH: Project[] = ["chromium-desktop", "chromium-mobile"];
const DESKTOP: Project[] = ["chromium-desktop"];

type KnownException = {
  /** 精確路由（與 `ROUTES[].path` 相同）。 */
  path: string;
  ruleId: string;
  /** axe 回報的節點 selector（`node.target.join(" ")`），必須完全相等。 */
  target: string;
  /** 只在這些 Playwright project 出現（側欄在 390 收進抽屜，因此有些只在桌機發生）。 */
  projects: Project[];
  /** tracker ID —— 沒有 ID 的例外不得加入。 */
  ref: string;
};

/**
 * 逐條、精確的暫時例外 —— 每一條都是**已立案的既有缺陷**，不是「可以接受」。
 * 政策見 `docs/ui-quality-system.md` §L1「例外政策」。修好之後對應條目會變成 stale 而讓本檔失敗，
 * 屆時刪掉即可。**不得**新增沒有 tracker ID 的條目，也**不得**以 rule 或路由為單位整批略過。
 */
function exceptionsFor(
  ref: string,
  ruleId: string,
  projects: Project[],
  entries: Array<[path: string, target: string]>
): KnownException[] {
  return entries.map(([path, target]) => ({ path, ruleId, target, projects, ref }));
}

const KNOWN_EXCEPTIONS: KnownException[] = [
  /*
   * `UI-QA-A11Y-01`：`bg-edu-primary text-white`（#FFFFFF on #6C63FF ＝ 4.31:1）。
   * canonical `Button` 已達 AA（`contrast-contract` 有測），這些是**繞過 Button 的手寫 class**，
   * 共 15 處；修法涉及品牌色 token 的選用，屬 Owner 設計決定。
   */
  ...exceptionsFor("UI-QA-A11Y-01", "color-contrast", BOTH, [
    ["/admin", ".bg-edu-primary"],
    ["/admin/orders", ".bg-edu-primary"],
    ["/admin/payment-proofs", 'button[data-testid="payment-proof-open"]'],
    ["/admin/payment-proofs", 'button[type="submit"]'],
    ["/admin/reports", 'button[data-testid="report-case-open"]'],
    ["/admin/reports", 'button[type="submit"]'],
    ["/creator/sales", ".bg-edu-primary"],
  ]),
  /* `UI-QA-A11Y-02`：買家側欄分組標題 `text-slate-400/80`（2.07:1），`components/dashboard/Sidebar.tsx:237`。 */
  ...exceptionsFor("UI-QA-A11Y-02", "color-contrast", DESKTOP, [
    ["/dashboard", ".mt-0"],
    ["/dashboard", "div:nth-child(2) > .mb-1\\.5.uppercase.tracking-\\[0\\.05em\\]"],
    ["/dashboard", "div:nth-child(3) > .mb-1\\.5.uppercase.tracking-\\[0\\.05em\\]"],
    ["/favorites", ".mt-0"],
    ["/favorites", "div:nth-child(2) > .mt-7.mb-1\\.5.text-\\[11px\\]"],
    ["/favorites", "div:nth-child(3) > .mt-7.mb-1\\.5.text-\\[11px\\]"],
    ["/me/materials", ".mt-0"],
    ["/me/materials", "div:nth-child(2) > .mt-7.mb-1\\.5.uppercase"],
    ["/me/materials", "div:nth-child(3) > .mt-7.mb-1\\.5.uppercase"],
    ["/me/orders", ".mt-0"],
    ["/me/orders", "div:nth-child(2) > .mt-7.mb-1\\.5.uppercase"],
    ["/me/orders", "div:nth-child(3) > .mt-7.mb-1\\.5.uppercase"],
  ]),
  /* `UI-QA-A11Y-03`：買家總覽 Hero CTA 寫死 `bg-[#FF6B73] text-white`（2.76:1），`components/parent/Hero.tsx:24`。 */
  ...exceptionsFor("UI-QA-A11Y-03", "color-contrast", BOTH, [["/dashboard", ".min-h-11"]]),
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
  await page.route("**/api/backend/**", (route) =>
    route.request().method() === "GET" ? json(route, EMPTY_LIST) : route.fallback()
  );
  await installCoreApiMocks(page);

  if (role === "public") return;

  await signInAs(page, role);
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, {
      user: { id: `usr_${role}_axe`, role, email: `${role}-e2e@example.com`, created_at: "2026-05-01T00:00:00.000Z" },
    })
  );
}

type Finding = {
  ruleId: string;
  impact: string;
  help: string;
  helpUrl: string;
  nodes: string[];
};

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

      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

      const findings: Finding[] = results.violations.map((v) => ({
        ruleId: v.id,
        impact: v.impact ?? "unknown",
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => n.target.join(" ")),
      }));

      const exceptionsHere = KNOWN_EXCEPTIONS.filter(
        (e) => e.path === rc.path && e.projects.includes(testInfo.project.name as Project)
      );
      const usedExceptions = new Set<KnownException>();

      const blocking: string[] = [];
      const advisory: string[] = [];

      for (const f of findings) {
        const remaining = f.nodes.filter((node) => {
          const hit = exceptionsHere.find((e) => e.ruleId === f.ruleId && e.target === node);
          if (hit) usedExceptions.add(hit);
          return !hit;
        });
        if (remaining.length === 0) continue;

        const shown = remaining.slice(0, 3).join(" | ");
        const more = remaining.length > 3 ? ` (+${remaining.length - 3} more)` : "";
        const line = `[${f.impact}] ${f.ruleId} ×${remaining.length} — ${f.help} → ${shown}${more} (${f.helpUrl})`;
        (BLOCKING_IMPACTS.has(f.impact) ? blocking : advisory).push(line);
      }

      for (const line of advisory) {
        testInfo.annotations.push({ type: "axe-advisory", description: `${rc.path} ${line}` });
      }
      await testInfo.attach(`axe-${rc.role}-${rc.path.replace(/\W+/g, "_")}.json`, {
        body: JSON.stringify({ route: rc.path, role: rc.role, findings }, null, 2),
        contentType: "application/json",
      });

      const stale = exceptionsHere.filter((e) => !usedExceptions.has(e));
      expect(
        stale.map((e) => `${e.ruleId} @ ${e.target}（${e.ref}）`),
        "KNOWN_EXCEPTIONS 中已不再發生的例外 —— 請刪除該條目"
      ).toEqual([]);

      expect(blocking, `${rc.label} ${rc.path} 的 critical／serious axe 違規`).toEqual([]);
    });
  }
});
