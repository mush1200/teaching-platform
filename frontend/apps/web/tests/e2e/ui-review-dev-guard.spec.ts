import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `/dev/ui-review` 的 **production 不可達性**回歸。
 *
 * ## 這支測試存在的理由
 *
 * UI Review 索引頁列出全站路由與 fixture 帳號。它在本機是便利，
 * 部署出去就是一張導覽圖。頁面自己有兩個執行期條件（`NODE_ENV` 與
 * `NEXT_PUBLIC_UI_REVIEW_MODE`），但**執行期條件擋不住「有人在部署設定裡把旗標打開」** ——
 * 那一層只有 source scan 擋得住，作法與 `production-url-guard.spec.ts` 相同。
 *
 * 因此這裡釘住三件事：
 *
 * 1. `render.yaml`（部署設定）**永遠不得**宣告 `NEXT_PUBLIC_UI_REVIEW_MODE`；
 * 2. 頁面原始碼**必須**同時保有兩個 `notFound()` 條件，且 `NODE_ENV` 那一條在前；
 * 3. 頁面**不得**含有任何登入繞道 —— 不寫 cookie、不寫 localStorage、不發 token。
 *
 * 第 3 點是最重要的：一個「方便切換角色」的 dev 頁面若真的簽發了 token，
 * 它就不再只是導覽頁，而是一條繞過 `Backend/middlewares/auth.js` 的路徑。
 */

const WEB_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..", "..");
const DEV_ROOT = join(WEB_ROOT, "app", "dev");

/**
 * `app/dev/**` 底下**每一個** `page.tsx` 都要守同一組規則 —— 不只索引頁。
 * 以掃描取得而不是寫死清單：日後新增的 dev 頁面自動納管，漏掛護欄就會紅
 * （例如 2026-09-29 的 `/dev/ui-review/brand-purple` 品牌色比較頁）。
 */
const DEV_PAGES = (readdirSync(DEV_ROOT, { recursive: true }) as string[])
  .filter((p) => p.replace(/\\/g, "/").endsWith("page.tsx"))
  .map((p) => join(DEV_ROOT, p));

test.describe("UI Review dev 頁面的 production 護欄", () => {
  test("render.yaml 不宣告 NEXT_PUBLIC_UI_REVIEW_MODE", async () => {
    const renderYaml = await readFile(join(REPO_ROOT, "render.yaml"), "utf8");
    expect(
      renderYaml.includes("NEXT_PUBLIC_UI_REVIEW_MODE"),
      "render.yaml 一旦宣告這個旗標，/dev/ui-review 就會在 production 可達"
    ).toBe(false);
    expect(
      renderYaml.includes("UI_REVIEW"),
      "render.yaml 不得出現任何 UI Review 相關設定"
    ).toBe(false);
  });

  test("app/dev 底下確實有被納管的頁面", () => {
    expect(DEV_PAGES.length, "找不到任何 dev 頁面 —— 掃描路徑可能錯了，下面的測試會形同虛設").toBeGreaterThanOrEqual(2);
  });

  for (const pagePath of DEV_PAGES) {
    const rel = pagePath.slice(WEB_ROOT.length + 1).replace(/\\/g, "/");

    test(`${rel}：同時保有兩個 fail-closed 條件，且 NODE_ENV 在前`, async () => {
      const source = await readFile(pagePath, "utf8");

      const prodGuard = 'if (process.env.NODE_ENV === "production") notFound();';
      const flagGuard = 'if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();';

      expect(source.includes(prodGuard), "缺少 NODE_ENV production 護欄").toBe(true);
      expect(source.includes(flagGuard), "缺少 UI_REVIEW_MODE 旗標護欄").toBe(true);

      // 順序有意義：production 的判斷不得被旗標的判斷繞過。
      expect(
        source.indexOf(prodGuard),
        "NODE_ENV 護欄必須在旗標護欄之前"
      ).toBeLessThan(source.indexOf(flagGuard));
    });

    test(`${rel}：不含任何登入繞道`, async () => {
      const source = await readFile(pagePath, "utf8");

      // 逐項檢查，失敗訊息要指得出是哪一種繞道。
      const forbidden: [RegExp, string][] = [
        [/document\s*\.\s*cookie/, "直接寫 cookie"],
        [/localStorage/, "寫 localStorage（tp_token / tp_role 的儲存位置）"],
        [/sessionStorage/, "寫 sessionStorage"],
        [/\bfetch\s*\(/, "發出 API 請求"],
        [/tp_token|tp_role/, "直接操作 session 識別值"],
        [/signIn|loginAs|impersonat/i, "登入／冒用輔助函式"],
        [/jsonwebtoken|jwt\.sign/, "自行簽發 token"],
      ];

      for (const [pattern, label] of forbidden) {
        expect(pattern.test(source), `${rel} 不得${label}`).toBe(false);
      }
    });
  }

  test("UI Review 啟動器不會把旗標寫進一般 dev 或驗收流程", async () => {
    const launcher = await readFile(
      join(REPO_ROOT, "frontend", "scripts", "ui-review-dev.mjs"),
      "utf8"
    );
    // 旗標只能由這一支啟動器注入 —— 它本身就是 UI Review 專用的進入點。
    expect(launcher.includes("NEXT_PUBLIC_UI_REVIEW_MODE")).toBe(true);

    const pkg = await readFile(join(REPO_ROOT, "frontend", "package.json"), "utf8");
    const scripts = JSON.parse(pkg).scripts as Record<string, string>;
    for (const [name, body] of Object.entries(scripts)) {
      if (name === "dev:web:ui-review") continue;
      expect(
        body.includes("UI_REVIEW"),
        `script "${name}" 不得帶入 UI Review 旗標`
      ).toBe(false);
    }
  });
});
