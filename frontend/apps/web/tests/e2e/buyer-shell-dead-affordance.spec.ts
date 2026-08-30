import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";

/**
 * 買家外殼的四個 dead affordance（`BUY-03`～`BUY-06`）。
 *
 * ## 這一支鎖的是什麼
 *
 * 四個 affordance 都可以操作、都有承諾性的標籤或指示，但**沒有 destination 也沒有 capability**：
 *
 * | 項目 | 先前的樣子 | Owner 決策 |
 * | --- | --- | --- |
 * | `BUY-03` | `FloatingHelpButton`（`href="#help"`，label「幫助中心」），買家每一頁常駐 | `DEC-09`：移除。**不導向 `/me/complaints`**、不建 Help Center |
 * | `BUY-04` | 側欄「其他」的「通知設定」（`href="#notifications"`） | `DEC-10`：從 buyer navigation 移除。不建 notification system、不留 placeholder |
 * | `BUY-05` | 側欄頁尾 `href="#account"`（collapsed rail ＋ expanded footer） | `DEC-11`：移除假互動；avatar／名稱的**純識別呈現可保留**。不建 `/account`、不建 profile page |
 * | `BUY-06` | Topbar `aria-label="通知"` 按鈕，無 `onClick`，帶未讀紅點 | `DEC-12`：移除按鈕**與紅點**。不建 notification center／dropdown／backend |
 *
 * ## 為什麼每個 case 都先驗一個「還在的」東西
 *
 * 只斷言「某個元素不存在」的測試，會在**整頁沒渲染出來**時安靜地通過 ——
 * 買家外殼掛載時打 `orders/my` 作 session 探測（`DX-04`），假 token 若沒 mock
 * 會拿到 401 而讓外殼正確地導向 `/login`，此時什麼都不存在，斷言全綠但什麼都沒驗到
 * （`helpers/shell-bootstrap.ts` 記載同一個坑）。
 *
 * 因此每個 case 都先確認一個**應該還在**的東西（真實導覽項、topbar、側欄頁尾的名字、
 * 展開鈕），再斷言死 affordance 不存在。前者是後者的前提。
 *
 * ## 為什麼不用 class 去抓未讀紅點
 *
 * `BUY-06` 的紅點沒有穩定 selector，而它的顏色 `bg-[#FF6B73]` 與**購物車數量徽章共用** ——
 * 用 class 去斷言會同時抓到合法的購物車徽章。這裡改用**語意結構**證明整個 affordance 消失：
 * topbar 裡除了 mobile 的漢堡鈕之外**不應該再有任何 button**。紅點原本就掛在那顆按鈕裡，
 * 按鈕不存在，紅點自然不存在 —— 而且這個斷言連「留了一個空的 icon 槽」也一併擋掉。
 * 為此**沒有**在 production 加任何 test id 或可見行為。
 *
 * ## 為什麼 desktop 與 mobile 都要跑
 *
 * `BUY-04`／`BUY-05` 的來源是 `SIDEBAR_NAV_SECTIONS` 與 `SidebarProfileFooter` 這兩份
 * shared rendering path（`IA-08` 的單一 source of truth），desktop 側欄與 mobile drawer
 * 共用它們 —— 但「共用」是實作宣稱，要由兩個 viewport 各驗一次才算數。
 * `BUY-03` 的浮動鈕與 `BUY-06` 的 topbar 按鈕則不分 viewport 常駐，兩邊都必須不存在。
 *
 * 兩個 Playwright project（`chromium-desktop` 1440×900 / `chromium-mobile` 390×844）
 * 都會跑這支檔案，viewport guard 決定哪一組 describe 生效。
 */

const BUYER_ROUTE = "/explore";

/** `signInAs(page, "parent")` 寫入的 email 是 `parent-e2e@example.com`，
 *  側欄頁尾的顯示名稱取其 local-part（`useDisplayName()` 的 fallback）。 */
const EXPECTED_DISPLAY_NAME = "parent-e2e";

/** 買家外殼 ＋ 已登入狀態。 */
async function openBuyerShell(page: Page) {
  await signInAs(page, "parent");
  await installShellBootstrapMocks(page);
  await page.goto(BUYER_ROUTE);
}

/** Topbar：用它獨有的搜尋框定位，避免抓到側欄自己的 `<header>`。 */
function topbarOf(page: Page): Locator {
  return page.locator("header").filter({ has: page.getByPlaceholder("搜尋教材、主題、年齡...") });
}

/** 死錨點的兩種抓法：DOM 屬性（實作）＋ 無障礙名稱（使用者看到的）。 */
function floatingHelpLocators(page: Page) {
  return {
    byHref: page.locator('a[href="#help"]'),
    byName: page.getByRole("link", { name: "幫助中心" }),
  };
}

/** `BUY-05`：頁尾不得再是可操作的東西，但名字本身要留著。 */
async function expectAccountFooterIsPresentationOnly(page: Page, { expectName }: { expectName: boolean }) {
  await expect(page.locator('a[href="#account"]')).toHaveCount(0);
  // 承諾性標籤（tooltip／次行文字）也必須消失，否則仍在暗示有個人資料頁。
  await expect(page.getByRole("link", { name: "個人資料" })).toHaveCount(0);
  await expect(page.getByText("個人資料", { exact: true })).toHaveCount(0);
  // 名字若仍顯示，它必須是純呈現 —— 不是連結、不是按鈕。
  await expect(page.getByRole("link", { name: EXPECTED_DISPLAY_NAME })).toHaveCount(0);
  await expect(page.getByRole("button", { name: EXPECTED_DISPLAY_NAME })).toHaveCount(0);
  if (expectName) {
    /*
     * Mobile 開啟 drawer 時 DOM 裡**同時存在兩個側欄** —— desktop 那個是 `hidden md:block`
     * （`display:none`）。`getByRole` 會排除 a11y tree 外的元素，但 `getByText` 不會，
     * 因此這裡必須明確只取可見的那一個，否則會撞上 strict mode violation。
     * 這是 locator 的問題，不是產品的問題（上面那些 role-based 的 count 斷言不受影響）。
     */
    const visibleName = page.getByText(EXPECTED_DISPLAY_NAME, { exact: true }).filter({ visible: true });
    await expect(visibleName).toHaveCount(1);
    await expect(visibleName).toBeVisible();
  }
}

test.describe("BUY-03～BUY-06 — buyer shell dead affordances are gone (desktop)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop-only assertions");

  test("BUY-03 — no Floating Help affordance anywhere in the buyer shell", async ({ page }) => {
    await openBuyerShell(page);

    // 前提：外殼真的渲染了（否則下面的「不存在」毫無意義）。
    await expect(page.getByRole("link", { name: "申訴與消費爭議" }).first()).toBeVisible();

    const { byHref, byName } = floatingHelpLocators(page);
    await expect(byHref).toHaveCount(0);
    await expect(byName).toHaveCount(0);
  });

  test("BUY-04 — desktop sidebar has no 通知設定 item", async ({ page }) => {
    await openBuyerShell(page);

    // 「其他」區塊仍在，且仍有真實項目 —— 移除的是死項目，不是整個區塊。
    const complaints = page.getByRole("link", { name: "申訴與消費爭議" }).first();
    await expect(complaints).toBeVisible();
    await expect(complaints).toHaveAttribute("href", "/me/complaints");

    await expect(page.getByRole("link", { name: "通知設定" })).toHaveCount(0);
    await expect(page.locator('a[href="#notifications"]')).toHaveCount(0);
    await expect(page.getByText("通知設定", { exact: true })).toHaveCount(0);
  });

  test("BUY-05 — expanded sidebar footer is identity-only, not a fake account entry", async ({ page }) => {
    await openBuyerShell(page);

    // 前提：側欄渲染了，而且頁尾的識別資訊**被刻意保留**（`DEC-11` 允許純呈現）。
    await expect(page.getByRole("link", { name: "申訴與消費爭議" }).first()).toBeVisible();

    await expectAccountFooterIsPresentationOnly(page, { expectName: true });
  });

  test("BUY-05 — collapsed rail footer is identity-only too", async ({ page }) => {
    await openBuyerShell(page);
    await expect(page.getByRole("link", { name: "申訴與消費爭議" }).first()).toBeVisible();

    // 收合後走的是 `SidebarProfileFooter` 的另一個分支，必須各自驗一次。
    await page.getByRole("button", { name: "收合側邊欄" }).click();
    // 前提：真的收合了（展開鈕出現才代表切換成功）。
    await expect(page.getByRole("button", { name: "展開側邊欄" })).toBeVisible();

    // collapsed rail 只剩 avatar 字母（`aria-hidden` 的裝飾），名字不顯示 —— 因此不驗名字。
    await expectAccountFooterIsPresentationOnly(page, { expectName: false });
  });

  test("BUY-06 — topbar has no notification control and no unread indicator", async ({ page }) => {
    await openBuyerShell(page);

    const topbar = topbarOf(page);
    // 前提：topbar 真的在，而且它**該有的**東西還在。
    await expect(topbar).toBeVisible();
    await expect(topbar.getByRole("link", { name: "購物車" })).toBeVisible();

    await expect(topbar.getByRole("button", { name: "通知" })).toHaveCount(0);
    /*
     * Desktop 的漢堡鈕是 `md:hidden`（`display:none` → 不在 a11y tree），
     * 所以這裡 topbar 內**不該有任何 button**。這同時擋掉「留了一顆 disabled 鈕」
     * 或「留了一個空的 icon 槽」—— 紅點原本掛在那顆鈕裡，鈕不在，紅點就不在。
     */
    await expect(topbar.getByRole("button")).toHaveCount(0);
  });
});

test.describe("BUY-03～BUY-06 — buyer shell dead affordances are gone (mobile)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 1024, "mobile-only assertions");

  test("BUY-03 — no Floating Help affordance on the mobile buyer shell", async ({ page }) => {
    await openBuyerShell(page);

    /*
     * 浮動鈕是 `fixed`，先前不在 drawer 裡而是直接掛在外殼上 ——
     * 因此 mobile 這裡**不開 drawer**，驗的就是「頁面上沒有它」。
     * 前提改用 topbar 的選單鈕：它證明買家外殼確實渲染了。
     */
    await expect(page.getByRole("button", { name: "開啟選單" })).toBeVisible();

    const { byHref, byName } = floatingHelpLocators(page);
    await expect(byHref).toHaveCount(0);
    await expect(byName).toHaveCount(0);
  });

  test("BUY-04 — mobile drawer has no 通知設定 item", async ({ page }) => {
    await openBuyerShell(page);

    // Drawer 必須真的打開 —— 關著的抽屜裡「找不到」不能算數。
    await page.getByRole("button", { name: "開啟選單" }).click();

    const complaints = page.getByRole("link", { name: "申訴與消費爭議" }).first();
    await expect(complaints).toBeVisible();
    await expect(complaints).toHaveAttribute("href", "/me/complaints");

    await expect(page.getByRole("link", { name: "通知設定" })).toHaveCount(0);
    await expect(page.locator('a[href="#notifications"]')).toHaveCount(0);
    await expect(page.getByText("通知設定", { exact: true })).toHaveCount(0);
  });

  test("BUY-05 — mobile drawer footer is identity-only, not a fake account entry", async ({ page }) => {
    await openBuyerShell(page);
    await page.getByRole("button", { name: "開啟選單" }).click();

    // 前提：抽屜真的開了，而且頁尾的識別資訊仍在。
    await expect(page.getByRole("link", { name: "申訴與消費爭議" }).first()).toBeVisible();

    // Drawer 走 `forceExpanded`，所以是 expanded 分支 —— 名字應該看得見。
    await expectAccountFooterIsPresentationOnly(page, { expectName: true });
  });

  test("BUY-06 — mobile topbar has no notification control and no unread indicator", async ({ page }) => {
    await openBuyerShell(page);

    const topbar = topbarOf(page);
    await expect(topbar).toBeVisible();
    await expect(topbar.getByRole("link", { name: "購物車" })).toBeVisible();

    await expect(topbar.getByRole("button", { name: "通知" })).toHaveCount(0);
    /*
     * Mobile 上漢堡鈕是可見的，所以 topbar 內**恰好只有那一顆** button。
     * 多出任何一顆就代表通知 affordance（或它的替身）還在。
     */
    await expect(topbar.getByRole("button")).toHaveCount(1);
    await expect(topbar.getByRole("button", { name: "開啟選單" })).toBeVisible();
  });
});
