import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";
import { resolveSupportContact } from "../../lib/support-contact";

/**
 * `PRE-14` —— Production Minimum Support Entry（「聯絡平台」）。
 *
 * ## 這一支鎖的是什麼
 *
 * 在此之前，production 前台**沒有任何一般客服聯絡方式**，而 runtime 有**七處**
 * 使用者可見文案叫人去找不存在的「平台客服」（`PRE-14` 立案時盤點為 6 處 ——
 * 那次用 `grep -A` 讀 context，漏掉 `paymentProof.service.js` 同檔的第二處；
 * 下方掃整檔的 source-scan 測試把它掃了出來）。最尖銳的一段是：既有的「申訴與消費爭議」
 * （`BUY-02`）全部端點皆 `requireAuth`，而平台沒有密碼重設（`P1-08` 誠實移除）——
 * 「登入不了的人」因此完全沒有管道。
 *
 * 所以這裡鎖三件事：
 *   1. `/support` **匿名**到得了，且四個進入點都存在；
 *   2. 客服信箱**要嘛正確渲染、要嘛誠實地說尚未設定**，絕不顯示佔位地址；
 *   3. 四條管道**維持分離** —— 一般客服沒有吞掉消費申訴／檢舉／個資權利請求，
 *      也沒有新增第二個檢舉入口，更沒有把草稿法律文件裡的個資信箱搬到公開頁。
 *
 * ## 為什麼有 source-level 斷言
 *
 * 沿用 `complaint-global-entry.spec.ts` 已建立的分工：**UI 行為用瀏覽器測，
 * 關於整棵樹的全稱命題用來源掃描測**（「沒有任何地方硬編 Email」「草稿地址
 * 沒有進到 frontend」逐頁點過去證明不了）。
 *
 * ## 為什麼 env 的兩個分支用純函式測
 *
 * `NEXT_PUBLIC_SUPPORT_EMAIL` 是 server 端 render 時讀的；同一台 web server
 * 沒辦法在 test 之間切換它，而 `reuseExistingServer: true` 代表 harness 也
 * 不保證那台 server 是自己起的。因此分支正確性測 `resolveSupportContact()`
 * 這個純函式（`lib/support-contact.ts` 刻意不讀 `process.env`），
 * 瀏覽器端則斷言「兩個結果**恰好出現一個**，而且不是佔位值」。
 */

const WEB_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..", "..");

async function webSrc(...parts: string[]) {
  return readFile(join(WEB_ROOT, ...parts), "utf8");
}

/** 《隱私權政策》**草稿**所載之個資信箱。公開頁面上不得出現。 */
const DRAFT_PRIVACY_EMAIL = "mush1200@hotmail.com";

test.describe("PRE-14 — 一般客服聯絡入口（純函式：env 的兩個分支）", () => {
  test("設定了合法地址 → 產生 mailto", () => {
    const contact = resolveSupportContact("support@teaching-platform.test");
    expect(contact).not.toBeNull();
    expect(contact?.email).toBe("support@teaching-platform.test");
    expect(contact?.mailto).toBe("mailto:support@teaching-platform.test");
  });

  test("前後空白會被 trim，不影響判定", () => {
    expect(resolveSupportContact("  support@teaching-platform.test \n")?.email).toBe(
      "support@teaching-platform.test"
    );
  });

  test("未設定／空白 → null（呼叫端顯示誠實文案，不編造地址）", () => {
    expect(resolveSupportContact(undefined)).toBeNull();
    expect(resolveSupportContact(null)).toBeNull();
    expect(resolveSupportContact("")).toBeNull();
    expect(resolveSupportContact("   ")).toBeNull();
  });

  test("已知佔位值一律視同未設定", () => {
    /*
     * 與 `Backend/config/paymentBankInfo.js` 的佔位帳號同一條規則：
     * 把示意值貼進 env 不算設定完成。少了這道檢查，最可能的迴歸就是有人把
     * 文件裡的示意地址原封不動搬進部署環境，於是頁面「成功地」顯示一個沒人收信的信箱。
     */
    expect(resolveSupportContact("support@example.com")).toBeNull();
    expect(resolveSupportContact("SUPPORT@EXAMPLE.COM")).toBeNull();
    expect(resolveSupportContact("support@<production-domain>")).toBeNull();
  });

  test("不成地址的字串 → null", () => {
    expect(resolveSupportContact("尚未設定")).toBeNull();
    expect(resolveSupportContact("support")).toBeNull();
    expect(resolveSupportContact("support@localhost")).toBeNull();
  });
});

test.describe("PRE-14 — /support 頁面", () => {
  test("匿名使用者可以直接開啟 /support（不被導向 /login）", async ({ page }) => {
    // 刻意**不**呼叫 `signInAs` —— 本頁存在的首要理由就是服務登入不了的人。
    const response = await page.goto("/support");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByRole("heading", { level: 1, name: "聯絡平台" })).toBeVisible();
  });

  test("四個分流區塊都在，且用的是「聯絡平台」而不是客服／幫助中心", async ({ page }) => {
    await page.goto("/support");
    for (const id of [
      "support-section-general",
      "support-section-complaint",
      "support-section-report",
      "support-section-privacy",
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    /*
     * 平台沒有 ticket system、沒有 SLA、沒有指派（那是 `FUT-P8`，`FUTURE`）。
     * 頁面若自稱「客服中心」／「幫助中心」就是 `BUY-03` 那顆按鈕的重演。
     */
    const body = (await page.locator("body").innerText()).replace(/\s+/g, "");
    expect(body).not.toContain("客服中心");
    expect(body).not.toContain("幫助中心");
  });

  test("客服信箱：要嘛正確渲染 mailto，要嘛誠實地說尚未設定 —— 沒有第三種", async ({ page }) => {
    await page.goto("/support");

    const mailto = page.getByTestId("support-email-link");
    const unavailable = page.getByTestId("support-email-unavailable");
    const mailtoCount = await mailto.count();
    const unavailableCount = await unavailable.count();

    // 恰好一個。兩個都在 = 自相矛盾；兩個都沒有 = 使用者拿不到任何資訊。
    expect(mailtoCount + unavailableCount, "mailto 與『尚未設定』必須恰好出現一個").toBe(1);

    if (mailtoCount === 1) {
      const href = await mailto.getAttribute("href");
      expect(href).toMatch(/^mailto:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/);
      // 佔位地址一律不得出現在 production 前台。
      expect(href?.toLowerCase()).not.toContain("example.com");
      expect(href).not.toContain("<");
    } else {
      await expect(unavailable).toBeVisible();
      await expect(unavailable).toContainText("尚未設定");
    }
  });

  test("消費申訴維持獨立管道：連結指向 /me/complaints 並標示需要登入", async ({ page }) => {
    await page.goto("/support");
    const link = page.getByTestId("support-complaint-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/me/complaints");
    /*
     * 一般客服與消費申訴**不得**互相取代（`docs/mvp_rules.md` §12.12）：
     * 申訴是消保法 §43 的交易爭議、有十五日法定期限，一般客服兩者都沒有。
     * 「需要登入」必須寫出來 —— 匿名讀者點下去會被導向 `/login`。
     */
    await expect(page.getByTestId("support-section-complaint")).toContainText("需要登入");
  });

  test("檢舉不產生第二個入口：頁面只導回教材，不呼叫也不連往任何 report 端點", async ({ page }) => {
    await page.goto("/support");
    const section = page.getByTestId("support-section-report");
    await expect(section).toBeVisible();
    await expect(section).toContainText("檢舉這個教材");
    await expect(page.getByTestId("support-report-materials-link")).toHaveAttribute("href", "/materials");

    /*
     * `BUY-01` 已定：唯一能產生新檢舉的地方是教材詳情頁頁尾，且 DB 有
     * `UNIQUE (material_id, reporter_id)`。檢舉必須指向特定教材，所以這裡
     * **不得**出現任何「直接檢舉」的入口 —— 那會是一個沒有 material_id 的死路。
     */
    const source = await webSrc("app", "support", "page.tsx");
    expect(source).not.toContain('"/reports"');
    expect(source).not.toContain("/admin/reports");
  });

  test("個資權利請求：說明管道但不洩漏草稿法律文件裡的信箱", async ({ page }) => {
    await page.goto("/support");
    const section = page.getByTestId("support-section-privacy");
    await expect(section).toBeVisible();
    await expect(page.getByTestId("support-privacy-pending")).toContainText(
      "個資權利請求聯絡方式將於正式隱私權政策公布後提供。"
    );

    /*
     * 目前唯一寫著個資信箱的檔案是 `docs/legal-drafts/privacy-policy.draft.md`，
     * 那是**草稿**；四條 legal route 在文件未發布前一律 404（`TEST-01`）。
     * 把草稿裡的聯絡資料搬到匿名可讀的頁面，等於在條款定稿前替平台對外承諾。
     */
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(DRAFT_PRIVACY_EMAIL);
  });

  test("一般客服與個資權利請求的邊界寫在頁面上（密碼問題不是個資權利請求）", async ({ page }) => {
    await page.goto("/support");
    await expect(page.getByTestId("support-section-privacy")).toContainText("忘記密碼");
    await expect(page.getByTestId("support-section-privacy")).toContainText("一般使用問題");
  });
});

test.describe("PRE-14 — 進入點", () => {
  test("登入頁提供 /support，且沒有把密碼重設偽裝回來", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByTestId("login-support-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/support");
    await link.focus();
    await expect(link).toBeFocused();

    /*
     * `P1-08` 採「誠實移除」：backend 至今沒有 forgot/reset 端點，也沒有 token
     * 基礎建設。有了客服入口**不代表**密碼重設回來了 —— 這裡釘住，免得日後
     * 有人順手把「忘記密碼？」加回去。
     */
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("忘記密碼");
    expect(body).not.toContain("重設密碼");

    await link.click();
    await expect(page).toHaveURL(/\/support$/);
  });

  test("未登入導覽有「聯絡平台」（desktop 側欄／mobile 抽屜）", async ({ page, viewport }) => {
    await page.goto("/materials");

    /*
     * **兩個外殼的漢堡鈕不是同一顆**（實測，2026-09-01）：
     *   - `RoleShell`（public／creator）用 `NavDrawer` 的 `MobileNavBar`，
     *     `triggerLabel="開啟側邊選單"`，且有 `data-testid="nav-drawer-trigger"`。
     *   - 買家外殼（`ParentAppShell`）的是 `Topbar.tsx` 自己的按鈕，
     *     `aria-label="開啟選單"`，**沒有** testid。
     * 因此這裡用 testid（`shell-consistency.spec.ts` 的既有慣例），
     * 買家那支則沿用 `complaint-global-entry.spec.ts` 的 role+name。
     */
    if ((viewport?.width ?? 0) < 1024) {
      const trigger = page.getByTestId("nav-drawer-trigger");
      await expect(trigger).toBeVisible();
      await trigger.click();
    }

    const entry = page.getByRole("link", { name: "聯絡平台" });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute("href", "/support");
  });

  test("買家導覽有「聯絡平台」，且與「申訴與消費爭議」並存", async ({ page, viewport }) => {
    await signInAs(page, "parent");
    // 買家外殼掛載時打 `orders/my` 作 session 探測（`DX-04`）；沒 mock 會被正確導向 /login。
    await installShellBootstrapMocks(page);
    await page.goto("/explore");

    // Mobile 的全域導覽在抽屜裡（`DX-18`）—— 補完使用者動線，不放寬斷言。
    if ((viewport?.width ?? 0) < 1024) {
      const trigger = page.getByRole("button", { name: "開啟選單" });
      await expect(trigger).toBeVisible();
      await trigger.click();
    }

    const support = page.getByRole("link", { name: "聯絡平台" });
    await expect(support).toBeVisible();
    await expect(support).toHaveAttribute("href", "/support");

    /*
     * `BUY-02` 的入口**必須**同時還在。一般客服不是消費申訴的替代品，
     * 反過來也不是 —— 兩者並存正是 §12.12 的邊界。
     */
    const complaints = page.getByRole("link", { name: "申訴與消費爭議" });
    await expect(complaints).toBeVisible();
    await expect(complaints).toHaveAttribute("href", "/me/complaints");
  });

  test("創作者導覽有「聯絡平台」，且與「平台案件」並存", async ({ page, viewport }) => {
    await signInAs(page, "teacher");
    await installShellBootstrapMocks(page);
    await page.goto("/creator/materials");

    // Creator 走 `RoleShell` → `NavDrawer`（見上一支的說明：label 是「開啟側邊選單」）。
    if ((viewport?.width ?? 0) < 1024) {
      const trigger = page.getByTestId("nav-drawer-trigger");
      await expect(trigger).toBeVisible();
      await trigger.click();
    }

    const support = page.getByRole("link", { name: "聯絡平台" });
    await expect(support).toBeVisible();
    await expect(support).toHaveAttribute("href", "/support");

    // 「平台案件」是創作者自己的教材案件，與一般客服不同，不得被取代。
    await expect(page.getByRole("link", { name: "平台案件" })).toBeVisible();
  });
});

test.describe("PRE-14 — source-level 全稱命題", () => {
  test("/support 不在 middleware 的登入牆內（匿名可讀由結構保證）", async () => {
    const middleware = await webSrc("middleware.ts");
    expect(middleware).not.toContain('"/support"');
    expect(middleware).not.toContain('"/support/:path*"');
  });

  test("沒有任何地方硬編客服 Email —— 頁面只讀 env", async () => {
    const page = await webSrc("app", "support", "page.tsx");
    // 頁面本身不得出現任何 Email 字面值。
    expect(page).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(page).toContain("getSupportContact");

    /*
     * 唯一允許出現地址字面值的地方是 `lib/support-contact.ts` 的**佔位值黑名單** ——
     * 那些是要被拒絕的值，不是 fallback。這裡釘住「沒有 fallback 常數」。
     */
    const lib = await webSrc("lib", "support-contact.ts");
    expect(lib).toContain("NEXT_PUBLIC_SUPPORT_EMAIL");
    expect(lib).not.toMatch(/\?\?\s*["'][^"']*@/);
    expect(lib).not.toMatch(/\|\|\s*["'][^"']*@/);
  });

  test("草稿法律文件的個資信箱沒有進到任何 frontend 原始碼", async () => {
    for (const rel of [
      ["app", "support", "page.tsx"],
      ["lib", "support-contact.ts"],
      ["app", "login", "page.tsx"],
      ["components", "layout", "RoleShell.tsx"],
      ["components", "dashboard", "sidebar-nav-config.ts"],
    ] as const) {
      const text = await webSrc(...rel);
      expect(text, `${rel.join("/")} 不得含草稿個資信箱`).not.toContain(DRAFT_PRIVACY_EMAIL);
    }
  });

  test("七處死文案不再指向不存在的「平台客服」", async () => {
    /*
     * 這是關於整棵樹的全稱命題（`complaint-global-entry.spec.ts` 已建立同樣的分工）。
     * 每一處都依自己的 context 處理，而不是機械式全部換成同一句話：
     * 前端知道路由 → 用 URL 版；backend／信件拿不到可靠的前端路由 → 用頁面名稱版。
     */
    const backendFiles = [
      ["services", "emailService.js"],
      ["services", "paymentProof.service.js"],
      ["services", "materialFile.service.js"],
      ["services", "consumerComplaint.service.js"],
      ["routes", "materials.js"],
    ] as const;

    for (const parts of backendFiles) {
      const text = await readFile(join(REPO_ROOT, "Backend", ...parts), "utf8");
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(stripped, `Backend/${parts.join("/")} 仍有使用者可見的「聯絡平台客服」`).not.toContain(
        "平台客服"
      );
    }

    const materialStatus = await webSrc("lib", "material-status.ts");
    expect(materialStatus).not.toContain("請聯絡平台或另建新教材");
    expect(materialStatus).toContain("/support");

    // 信件走絕對 URL，因此必須真的帶上 `/support`。
    const emailService = await readFile(join(REPO_ROOT, "Backend", "services", "emailService.js"), "utf8");
    expect(emailService).toContain("/support");
  });

  test("不承諾不存在的服務水準（無 24 小時／專人／即時客服／回覆時限）", async () => {
    const sources = [
      await webSrc("app", "support", "page.tsx"),
      await readFile(join(REPO_ROOT, "Backend", "services", "emailService.js"), "utf8"),
    ];
    for (const text of sources) {
      for (const forbidden of ["24 小時", "24小時", "專人", "即時客服", "工作天內回覆", "小時內回覆"]) {
        expect(text, `不得承諾「${forbidden}」`).not.toContain(forbidden);
      }
    }
  });

  test("Admin 主導覽不加入 /support（客服不是 Admin 的日常工作台項目）", async () => {
    const adminNav = await webSrc("lib", "admin-nav.ts");
    expect(adminNav).not.toContain("/support");
  });
});
