import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";

/**
 * `BUY-02` / `DEC-LEGAL-09` —— 全域申訴入口。
 *
 * ## 這一支鎖的是什麼
 *
 * 在此之前，申訴功能**只能**從某一張訂單的詳情頁進入，但平台在四個地方
 * 告訴使用者「請聯繫客服」，而那個管道並不存在 —— 帳號被凍結的人尤其
 * 需要一個不必先找到訂單的入口。
 *
 * `DEC-LEGAL-09` 拍板 **Option C：全域入口 ＋ 既有 order-context CTA 並存**。
 * 因此這裡同時鎖住兩件事：**新入口存在**，而且**舊 CTA 沒有被取代掉**。
 *
 * ## 為什麼有 source-level 斷言
 *
 * 「四處死文案都不再指向不存在的管道」與「沒有引入主管機關資訊」是
 * 關於整棵樹的全稱命題，逐頁點過去證明不了。UI 行為用瀏覽器測，
 * 全稱命題用來源掃描測。
 */

const WEB_ROOT = join(__dirname, "..", "..");

async function src(...parts: string[]) {
  return readFile(join(WEB_ROOT, ...parts), "utf8");
}

test.describe("BUY-02 — global complaint entry", () => {
  test("logged-in buyer reaches the complaint landing from global nav (no order needed)", async ({
    page,
    viewport,
  }) => {
    await signInAs(page, "parent");
    /*
     * 買家外殼掛載時會打 `orders/my` 作 session 探測（`DX-04`）。
     * 用假 token 時那會拿到真的 401，外殼便**正確地**把整頁導向 `/login` ——
     * 於是這裡的點擊有時看似「沒有導航」。修法是補上外殼 bootstrap 的 mock，
     * 不是放寬斷言（`helpers/shell-bootstrap.ts` 記載了同一個坑）。
     */
    await installShellBootstrapMocks(page);

    // 從一個與訂單無關的頁面出發 —— 重點正是「不必先進入某張訂單」。
    await page.goto("/explore");

    /*
     * **Mobile 的全域導覽在抽屜裡（`DX-18`）。**
     *
     * 這一支原本只寫了 desktop 的動線，於是在 `chromium-mobile` 上結構性必失敗：
     *   - desktop 的 `<aside>` 是 `hidden … md:block` —— `display:none` 會被排除在
     *     accessibility tree 之外，`getByRole` 因此**找不到**（錯誤是 `element(s) not found`，
     *     不是 `not visible`）
     *   - mobile 的抽屜是 `{mobileSidebarOpen ? … : null}` **條件渲染**，關著時根本不在 DOM
     *
     * 修法是**補完使用者動線**（真的按下漢堡鈕），不是放寬斷言 ——
     * `BUY-02` 的產品主張「買家不必先找到訂單就能申訴」對 mobile 買家同樣成立，
     * 因此下面那組斷言 desktop / mobile **完全共用**，這裡只補進入抽屜這一步。
     */
    if ((viewport?.width ?? 0) < 1024) {
      const drawerTrigger = page.getByRole("button", { name: "開啟選單" });
      await expect(drawerTrigger).toBeVisible();
      await drawerTrigger.click();
    }

    /*
     * 不加 `.first()`：`getByRole` 已排除 a11y tree 外的元素，因此兩個 viewport 都應該
     * **恰好命中一個**。若哪天真的出現兩個，strict mode 會直接讓這裡失敗 ——
     * 那是要被看見的訊號，不該用 `nth()` 蓋掉。
     */
    const entry = page.getByRole("link", { name: "申訴與消費爭議" });
    await expect(entry).toBeVisible();
    // 必須是真的連結語意 ＋ 可鍵盤操作，且不是 icon-only。
    await expect(entry).toHaveAttribute("href", "/me/complaints");
    await entry.focus();
    await expect(entry).toBeFocused();

    await entry.click();
    await expect(page).toHaveURL(/\/me\/complaints$/);

    // Landing 必須同時看得到既有案件與「提出申訴」入口。
    await expect(page.getByRole("link", { name: "提出申訴" })).toBeVisible();
  });

  test("order-context CTA is preserved, and still carries orderId", async () => {
    // 這是 `DEC-LEGAL-09` 的另一半：全域入口**不得取代** order-aware 流程。
    const orderDetail = await src("app", "me", "orders", "[orderId]", "page.tsx");
    expect(orderDetail).toContain('data-testid="order-complaint-link"');
    expect(orderDetail).toMatch(/\/me\/complaints\/new\?orderId=\$\{encodeURIComponent\(orderId\)\}/);
    expect(orderDetail).toContain("對這筆訂單提出申訴");
  });

  test("logged-out user is told to sign in — never shown as anonymous-capable", async ({ page }) => {
    // 全部 complaint 端點皆 `requireAuth`，所以不得假裝支援匿名申訴。
    await page.context().clearCookies();
    await page.goto("/me/complaints");

    // 沿用既有的 middleware redirect，並保留原目的地（不另造 redirect 系統）。
    await expect(page).toHaveURL(/\/login\?redirect=%2Fme%2Fcomplaints/);

    const body = (await page.locator("body").innerText()).replace(/\s+/g, "");
    expect(body).not.toContain("匿名");
  });

  test("no user-visible dead customer-service destinations remain", async () => {
    /*
     * 四處死文案（`BUY-02` inventory）——
     * 每一處都必須依自己的 context 處理，而不是機械式全部換成同一個連結。
     */
    const checkout = await src("app", "checkout", "page.tsx");
    const bankInfo = await src("components", "payment", "BankTransferInfo.tsx");

    // (1)(3) 平台端設定缺失：此時通常連訂單都不存在 → 誠實等待指示，不導向申訴。
    expect(checkout).toContain("平台的收款帳戶尚未設定，目前無法繼續結帳。請先不要匯款，稍後再試。");
    expect(bankInfo).toContain("平台的收款帳戶目前無法取得，因此暫時無法提供匯款指示。請先不要匯款，稍後再試。");

    // (2) 持續性失敗（已登入買家）→ 指向真實存在的申訴入口。
    expect(checkout).toContain('href="/me/complaints"');
    expect(checkout).toContain("申訴與消費爭議");

    /*
     * 使用者可見文案中不得再出現「客服」。
     *
     * 註解不算 —— 本輪的註解正是在解釋「為什麼不再指向客服」。
     * 必須真的把區塊註解剝掉：`{/* … *\/}` 與 `/* … *\/` 的**中間幾行**
     * 開頭是一般文字，逐行判斷前綴會漏掉它們。
     */
    const stripComments = (text: string) =>
      text
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // JSX 區塊註解
        .replace(/\/\*[\s\S]*?\*\//g, "") // JS 區塊註解
        .replace(/^\s*\/\/.*$/gm, ""); // 行註解

    for (const [label, text] of [
      ["checkout", checkout],
      ["BankTransferInfo", bankInfo],
    ] as const) {
      expect(stripComments(text), `${label} 仍有使用者可見的「客服」文案`).not.toContain("客服");
    }
  });

  test("frozen-account message points at a flow frozen users can actually use", async () => {
    const middleware = await readFile(
      join(WEB_ROOT, "..", "..", "..", "Backend", "middlewares", "accountStatus.js"),
      "utf8",
    );
    expect(middleware).toContain("申訴與消費爭議");
    expect(middleware).not.toMatch(/message:\s*"[^"]*請聯繫客服/);

    /*
     * 這段文案只有在「凍結帳號真的能提出申訴」時才誠實。
     * `routes/complaints.js` 刻意不套 `requireActiveAccount` —— 在這裡釘住，
     * 免得日後有人加上去而讓上面那句話變成謊言。
     */
    const complaintsRoute = await readFile(
      join(WEB_ROOT, "..", "..", "..", "Backend", "routes", "complaints.js"),
      "utf8",
    );
    expect(complaintsRoute).not.toMatch(/^\s*(?!\s*\*).*requireActiveAccount\s*[,)]/m);
  });

  test("privacy email is not used as a complaint channel, and no authority facts were added", async () => {
    const checkout = await src("app", "checkout", "page.tsx");
    const bankInfo = await src("components", "payment", "BankTransferInfo.tsx");
    const navConfig = await src("components", "dashboard", "sidebar-nav-config.ts");
    const all = [checkout, bankInfo, navConfig].join("\n");

    // `DEC-LEGAL-07` 的 privacy email 僅供個資權利使用。
    expect(all).not.toContain("mush1200@hotmail.com");
    expect(all).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);

    // `L-17` 仍為 external validation required —— 不得憑空填入任何機關事實。
    for (const forbidden of ["消費者保護官", "消保官", "消費者服務中心", "1950", "行政院", "調解委員會"]) {
      expect(all, `不得引入外部主管機關資訊：${forbidden}`).not.toContain(forbidden);
    }
  });
});
