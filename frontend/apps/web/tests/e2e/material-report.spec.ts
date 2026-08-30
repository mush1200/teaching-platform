import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 買家端檢舉送出 UI —— `BUY-01`。
 *
 * ## 為什麼這一支存在
 *
 * `POST /reports` 與整套 Admin 案件流程一直都在運作，但平台上**沒有任何地方能產生新檢舉**
 * （`tests/e2e/public.spec.ts` 舊有的「submit report form」待補斷言就是這個缺口的殘留，已於 `DX-01` 移除）。
 * 這一支鎖住的是「入口存在且真的打到 `POST /reports`」，不是 backend 的行為 ——
 * 建立、重複 409、activity log 已由 `Backend/scripts/api-smoke-test.js` 與 Postman 覆蓋。
 *
 * 對應規格：`docs/mvp_rules.md` §6。
 */

const MATERIAL_ID = "mat_buy01_001";
const MATERIAL_TITLE = "檢舉測試教材";

type ReportsHandler = (route: Route, request: Request) => Promise<unknown>;

/**
 * 只 mock 教材詳情需要的讀取端點 ＋ `POST /reports`，其餘一律 404。
 * 讓「頁面靠別的資料湊出檢舉入口」或「打到別的端點」直接失敗，而不是靜靜地過。
 */
async function mockMaterialDetail(page: Page, onReports: ReportsHandler) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");
    const body = (payload: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

    if (path === "reports" && request.method() === "POST") return onReports(route, request);

    if (path === `materials/${MATERIAL_ID}`) {
      return body({
        id: MATERIAL_ID,
        title: MATERIAL_TITLE,
        description: "用於 BUY-01 regression 的教材。",
        short_description: "BUY-01 fixture",
        price: 299,
        category: "language",
        age_range: "4-8 歲",
        status: "published",
        material_features: ["cut_and_paste"],
        contents: [],
        detail_images: [],
        teaching_methods: [],
        created_at: "2026-05-01T00:00:00.000Z",
      });
    }
    if (path === `materials/${MATERIAL_ID}/rating`) return body({ average: null, count: 0 });
    if (path === `materials/${MATERIAL_ID}/reviews`) return body([]);

    return body({ message: `unexpected call: ${request.method()} ${path}` }, 404);
  });
}

async function openReportDialog(page: Page) {
  await page.goto(`/materials/${MATERIAL_ID}`);
  const trigger = page.getByTestId("material-report-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByTestId("material-report-dialog")).toBeVisible();
}

test.describe("Buyer material report", () => {
  test("buyer submits a report and the payload reaches POST /reports", async ({ page }) => {
    let received: { material_id?: string; reason?: string } | null = null;

    await signInAs(page, "parent");
    await mockMaterialDetail(page, async (route, request) => {
      received = request.postDataJSON() as { material_id?: string; reason?: string };
      return route.fulfill({
        status: 201,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          id: "rep_buy01",
          material_id: MATERIAL_ID,
          reporter_id: "usr_parent_e2e",
          reason: received?.reason,
          status: "pending",
          created_at: "2026-05-01T00:00:00.000Z",
        }),
      });
    });

    await openReportDialog(page);

    const submit = page.getByRole("button", { name: "送出檢舉" });
    // 空白理由不得送出 —— 否則 Backend 會用 400 擋，使用者卻不知道自己漏填什麼。
    await expect(submit).toBeDisabled();

    await page.getByLabel("檢舉原因").fill("教材內容與商品描述不符。");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("已收到你的檢舉。")).toBeVisible();
    expect(received).toEqual({ material_id: MATERIAL_ID, reason: "教材內容與商品描述不符。" });
  });

  test("duplicate report shows the 409 message instead of a generic failure", async ({ page }) => {
    await signInAs(page, "parent");
    await mockMaterialDetail(page, (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ message: "Already reported" }),
      }),
    );

    await openReportDialog(page);
    await page.getByLabel("檢舉原因").fill("重複檢舉。");
    await page.getByRole("button", { name: "送出檢舉" }).click();

    await expect(page.getByText("你已經檢舉過這個教材了，我們正在處理中。")).toBeVisible();
    // 失敗後表單必須留著，讓使用者知道沒送出成功。
    await expect(page.getByText("已收到你的檢舉。")).toHaveCount(0);
  });

  test("guest sees the entry but is gated to login, and never calls POST /reports", async ({ page }) => {
    let reportCalls = 0;

    await mockMaterialDetail(page, (route) => {
      reportCalls += 1;
      return route.fulfill({ status: 201, contentType: "application/json; charset=utf-8", body: "{}" });
    });

    await openReportDialog(page);

    await expect(page.getByText("請先以購買者帳號登入，才能送出檢舉。")).toBeVisible();
    await expect(page.getByLabel("檢舉原因")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "前往登入" })).toHaveAttribute(
      "href",
      `/login?redirect=${encodeURIComponent(`/materials/${MATERIAL_ID}`)}`,
    );
    expect(reportCalls).toBe(0);
  });
});
