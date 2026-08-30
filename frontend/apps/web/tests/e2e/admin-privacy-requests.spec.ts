import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { signInAs } from "./helpers/auth";

/**
 * `OPS-04` / `DEC-LEGAL-13` —— 個資權利請求的 Admin UI。
 *
 * ## 這一支鎖的是什麼
 *
 *   1. **domain 分離在 UI 上也成立** —— 頁面自稱「個資權利請求」，
 *      **不得**呈現為「消費申訴」。
 *   2. **誠實邊界** —— 不得出現法定期限天數、不得宣稱身分驗證已依法完成、
 *      不得宣稱「已處理完成 = 資料已刪除」。
 *   3. **未新增匿名／站內提交入口** —— 對外仍是 Privacy Email。
 *   4. Admin 可建案、可看歷程、可轉狀態；backend 錯誤誠實呈現。
 *
 * backend 的驗證與 domain 分離由 `Backend/tests/privacyRequest.db.test.js` 覆蓋
 * （那裡掛真正的 router）。這裡鎖的是 UI 契約與文案邊界。
 */

const REQUEST_ID = "pr_e2e_001";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

async function mockApi(page: Page, handlers: Handlers) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/backend/", "");
    const key = `${route.request().method()} ${path}`;
    const handler = handlers[key];
    if (!handler) return route.fulfill({ status: 404, body: "{}" });
    return handler(route);
  });
}

const TYPE_OPTIONS = [
  { code: "access", label: "查詢或請求閱覽" },
  { code: "deletion", label: "請求刪除" },
  { code: "other", label: "其他（須說明）" },
];
const STATUS_OPTIONS = [
  { code: "open", label: "已受理" },
  { code: "in_review", label: "處理中" },
  { code: "completed", label: "已處理完成" },
];

function listPayload(items: unknown[] = []) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items,
      total: items.length,
      requestTypeOptions: TYPE_OPTIONS,
      statusOptions: STATUS_OPTIONS,
    }),
  };
}

const ONE_ITEM = {
  id: REQUEST_ID,
  requestType: "access",
  requestTypeLabel: "查詢或請求閱覽",
  status: "open",
  statusLabel: "已受理",
  requesterReference: "requester@example.test",
  summary: "使用者來信要求查閱其帳號資料",
  receivedAt: "2026-08-27T02:00:00.000Z",
  completedAt: null,
  source: "privacy_email",
  allowedTransitions: ["in_review", "closed"],
};

test.describe("OPS-04 — admin privacy rights requests", () => {
  test("list page is clearly a privacy-rights domain, not consumer complaints", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      "GET admin/privacy-requests": (r) => r.fulfill(listPayload([ONE_ITEM])),
    });
    await page.goto("/admin/privacy-requests");

    await expect(page.getByTestId("privacy-requests-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "個資權利請求" })).toBeVisible();

    const body = await page.getByTestId("privacy-requests-page").innerText();
    // 絕不可被呈現成消費申訴。
    expect(body).not.toContain("消費申訴的");
    expect(body).toContain("與「消費申訴」是不同類型的案件");

    await expect(page.getByTestId("privacy-request-list")).toBeVisible();
    await expect(page.getByText("查詢或請求閱覽")).toBeVisible();
  });

  test("copy never claims a statutory deadline, verified identity, or completed deletion", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      "GET admin/privacy-requests": (r) => r.fulfill(listPayload([ONE_ITEM])),
      [`GET admin/privacy-requests/${REQUEST_ID}`]: (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            request: ONE_ITEM,
            events: [
              {
                id: "ev1",
                eventType: "created",
                actorId: "usr_admin",
                actorRole: "admin",
                message: "由 Privacy Email 受理並建立案件",
                createdAt: "2026-08-27T03:00:00.000Z",
              },
            ],
          }),
        }),
    });

    for (const url of ["/admin/privacy-requests", `/admin/privacy-requests/${REQUEST_ID}`]) {
      await page.goto(url);
      // 兩頁都是 client component，載入完成前 innerText 只有骨架 ——
      // 先等到各自的內容錨點出現，否則掃到的是空字串而假性通過。
      await expect(
        url.endsWith(REQUEST_ID)
          ? page.getByTestId("privacy-detail-type")
          : page.getByTestId("privacy-requests-notice"),
      ).toBeVisible();
      const text = (await page.locator("main").innerText()).replace(/\s+/g, "");

      // 沒有任何法定天數承諾。
      expect(text, `${url} 不得出現法定期限天數`).not.toMatch(/依法.{0,6}\d+(日|天)/);
      expect(text).not.toMatch(/\d+(日|天)內(回覆|完成|處理)/);
      // 沒有身分驗證的法律主張。
      for (const forbidden of ["已依法完成身分驗證", "身分驗證已完成", "已完成法定身分確認"]) {
        expect(text, `${url} 不得宣稱 ${forbidden}`).not.toContain(forbidden);
      }
      // 沒有「資料已刪除」的保證。
      expect(text).not.toContain("資料已全部刪除。");
    }

    // 詳情頁必須主動說明邊界。
    await page.goto(`/admin/privacy-requests/${REQUEST_ID}`);
    await expect(page.getByTestId("privacy-detail-type")).toBeVisible();
    await expect(page.getByTestId("privacy-request-detail")).toContainText("不代表使用者資料已全部刪除");
    await expect(page.getByTestId("privacy-request-detail")).toContainText(
      "不代表已符合任何法定回覆期限或身分驗證程序",
    );
  });

  test("admin can create a case from an email, with the request-type selector from backend", async ({ page }) => {
    await signInAs(page, "admin");
    let submitted: Record<string, unknown> | null = null;
    await mockApi(page, {
      "GET admin/privacy-requests": (r) => r.fulfill(listPayload([])),
      "POST admin/privacy-requests": (r) => {
        submitted = r.request().postDataJSON() as Record<string, unknown>;
        return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(ONE_ITEM) });
      },
    });
    await page.goto("/admin/privacy-requests");

    await page.getByTestId("privacy-create-toggle").click();
    await expect(page.getByTestId("privacy-create-form")).toBeVisible();

    // 未填完不得送出。
    await expect(page.getByTestId("privacy-create-submit")).toBeDisabled();

    await page.getByTestId("privacy-type-select").selectOption("deletion");
    await page.getByTestId("privacy-reference-input").fill("requester@example.test");
    await page.getByTestId("privacy-received-input").fill("2026-08-27T10:00");
    await page.getByTestId("privacy-summary-input").fill("使用者要求刪除帳號");
    await expect(page.getByTestId("privacy-create-submit")).toBeEnabled();

    /*
     * 資料最小化斷言必須在送出**之前**做 —— 成功送出會收起表單。
     * 表單只提到這些欄位一次，而且是在「請勿輸入」的警語裡；
     * 因此這裡驗的是「沒有對應的輸入欄位」，而不是字面不出現。
     */
    await expect(page.getByLabel(/身分證|護照|銀行帳號|出生日期/)).toHaveCount(0);
    const form = await page.getByTestId("privacy-create-form").innerText();
    expect(form).toContain("請勿於此輸入身分證字號、護照號碼或金融資訊");

    await page.getByTestId("privacy-create-submit").click();
    await expect.poll(() => submitted).not.toBeNull();
    expect(submitted).toMatchObject({
      requestType: "deletion",
      requesterReference: "requester@example.test",
      summary: "使用者要求刪除帳號",
    });
    expect(submitted).toHaveProperty("receivedAt");
  });

  test("detail page shows history and drives the transition endpoint", async ({ page }) => {
    await signInAs(page, "admin");
    let transitioned: Record<string, unknown> | null = null;
    await mockApi(page, {
      [`GET admin/privacy-requests/${REQUEST_ID}`]: (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            request: ONE_ITEM,
            events: [
              {
                id: "ev1",
                eventType: "created",
                actorId: "usr_admin",
                actorRole: "admin",
                message: "由 Privacy Email 受理並建立案件",
                createdAt: "2026-08-27T03:00:00.000Z",
              },
            ],
          }),
        }),
      [`POST admin/privacy-requests/${REQUEST_ID}/transition`]: (r) => {
        transitioned = r.request().postDataJSON() as Record<string, unknown>;
        return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    });

    await page.goto(`/admin/privacy-requests/${REQUEST_ID}`);
    await expect(page.getByTestId("privacy-detail-type")).toContainText("查詢或請求閱覽");
    await expect(page.getByTestId("privacy-detail-received")).not.toContainText("—");
    await expect(page.getByTestId("privacy-event-list")).toContainText("建立案件");

    await page.getByTestId("privacy-transition-select").selectOption("in_review");
    await page.getByTestId("privacy-transition-note").fill("開始處理");
    await page.getByTestId("privacy-transition-submit").click();

    await expect.poll(() => transitioned).not.toBeNull();
    expect(transitioned).toMatchObject({ status: "in_review", note: "開始處理" });
  });

  test("backend errors are surfaced honestly", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      "GET admin/privacy-requests": (r) => r.fulfill(listPayload([])),
      "POST admin/privacy-requests": (r) =>
        r.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: "invalid_request_type", message: "requestType must be one of ..." }),
        }),
    });
    await page.goto("/admin/privacy-requests");
    await page.getByTestId("privacy-create-toggle").click();
    await page.getByTestId("privacy-type-select").selectOption("other");
    await page.getByTestId("privacy-reference-input").fill("a@b.test");
    await page.getByTestId("privacy-received-input").fill("2026-08-27T10:00");
    await page.getByTestId("privacy-summary-input").fill("x");
    await page.getByTestId("privacy-create-submit").click();

    await expect(page.getByTestId("privacy-form-error")).toBeVisible();
    await expect(page.getByTestId("privacy-form-error")).toContainText("requestType");
  });

  test("no public / anonymous privacy-request submission surface was added", async () => {
    /*
     * 對外入口仍是 Privacy Email（`DEC-LEGAL-07`）。
     * 這是關於整棵樹的全稱命題，逐頁點過去證明不了。
     */
    const webRoot = join(__dirname, "..", "..");
    const proxy = await readFile(join(webRoot, "app", "api", "backend", "[...path]", "route.ts"), "utf8");
    // 沒有為 privacy request 開新的 proxy 前綴（走既有的 "admin"）。
    expect(proxy).not.toContain("privacy-requests");

    const nav = await readFile(join(webRoot, "lib", "admin-nav.ts"), "utf8");
    expect(nav).toContain("/admin/privacy-requests");
    expect(nav).toContain("個資權利請求");

    // 使用者端不得出現任何提交入口。
    const buyerShell = await readFile(join(webRoot, "components", "layout", "RoleShell.tsx"), "utf8");
    expect(buyerShell).not.toContain("privacy-requests");
  });

  test("consumer complaint admin surface is unchanged", async () => {
    const webRoot = join(__dirname, "..", "..");
    const nav = await readFile(join(webRoot, "lib", "admin-nav.ts"), "utf8");
    // 申訴入口仍在，且兩者並列而非合併。
    expect(nav).toContain("/admin/complaints?status=submitted");
    expect(nav).toContain("消費申訴");
    expect(nav).not.toContain("/admin/complaints?type=privacy");
  });
});
