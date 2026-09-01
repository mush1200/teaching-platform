import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `OPS-02` —— 帳號凍結的 Admin UI。
 *
 * 凍結能力自 Gate 1 起就存在，但**只有 API** —— 維運者得手動打端點才能凍結或解凍。
 * `DEC-LEGAL-10` 拍板：single-admin ＋ standardized reason ＋ audit ＋ **Admin UI**。
 *
 * ## 這一支鎖的是 UI 契約，不是 backend 規則
 *
 * backend 的 taxonomy 驗證、guardrail 與稽核由
 * `Backend/tests/accountFreezeAdmin.db.test.js` 覆蓋（那裡掛真正的 router）。
 * 這裡鎖的是「畫面呈現的狀態與選項來自 backend」、「破壞性操作要先確認」、
 * 「不合法的目標不給操作」、以及**文案不得超出系統真的做得到的事**。
 */

const USER_ID = "usr_ops2_e2e";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

/** 只 mock 明確列出的路徑；其餘一律 404，避免畫面靠別的資料湊出來。 */
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

const EMPTY_LOGS = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ items: [], pagination: { total: 0, totalPages: 1 } }),
};

function statusPayload(overrides: Record<string, unknown> = {}, canFreeze = true) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: {
        id: USER_ID,
        email: "buyer@example.test",
        role: "buyer",
        accountStatus: "active",
        frozenAt: null,
        frozenBy: null,
        freezeReason: null,
        unfrozenAt: null,
        unfrozenBy: null,
        currentReasonCode: null,
        currentNote: null,
        ...overrides,
      },
      reasonOptions: [
        { code: "suspected_fraud", label: "疑似詐欺行為，待查證" },
        { code: "manual_review", label: "人工審查中，暫停交易行為" },
        { code: "other", label: "其他（須填寫說明）" },
      ],
      canFreeze,
    }),
  };
}

const PAGE = `/admin/users/${USER_ID}/activity-logs`;

test.describe("OPS-02 — admin account freeze UI", () => {
  test("active user: freeze needs an explicit reason and a confirmation step", async ({ page }) => {
    await signInAs(page, "admin");
    let submitted: Record<string, unknown> | null = null;

    await mockApi(page, {
      [`GET admin/users/${USER_ID}/account-status`]: (r) => r.fulfill(statusPayload()),
      [`GET admin/users/${USER_ID}/activity-logs`]: (r) => r.fulfill(EMPTY_LOGS),
      [`POST admin/users/${USER_ID}/freeze`]: (r) => {
        submitted = r.request().postDataJSON() as Record<string, unknown>;
        return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    });

    await page.goto(PAGE);
    await expect(page.getByTestId("account-freeze-panel")).toBeVisible();
    await expect(page.getByTestId("account-status-pill")).toContainText("正常");

    // 破壞性操作不得一鍵直接執行 —— 必須先展開確認區。
    await expect(page.getByTestId("freeze-confirm")).toHaveCount(0);
    await page.getByTestId("freeze-open").click();
    await expect(page.getByTestId("freeze-confirm")).toBeVisible();

    // 未選原因時不得送出。
    await expect(page.getByTestId("freeze-submit")).toBeDisabled();

    // `other` 必須補說明（前端先擋；backend 另有同樣的驗證）。
    await page.getByTestId("freeze-reason-select").selectOption("other");
    await expect(page.getByTestId("freeze-submit")).toBeDisabled();
    await page.getByTestId("freeze-note").fill("個案說明");
    await expect(page.getByTestId("freeze-submit")).toBeEnabled();

    await page.getByTestId("freeze-reason-select").selectOption("suspected_fraud");
    await page.getByTestId("freeze-submit").click();

    await expect.poll(() => submitted).not.toBeNull();
    expect(submitted).toMatchObject({ reasonCode: "suspected_fraud", note: "個案說明" });
    // 絕不送自由文字 `reason` —— taxonomy 才是契約。
    expect(submitted).not.toHaveProperty("reason");
  });

  test("freeze copy stays within what the system actually does", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      [`GET admin/users/${USER_ID}/account-status`]: (r) => r.fulfill(statusPayload()),
      [`GET admin/users/${USER_ID}/activity-logs`]: (r) => r.fulfill(EMPTY_LOGS),
    });
    await page.goto(PAGE);
    await page.getByTestId("freeze-open").click();

    const panel = await page.getByTestId("account-freeze-panel").innerText();
    // 實際能力：擋受保護的寫入，但仍可登入／查看／申訴。
    expect(panel).toContain("仍可登入");
    expect(panel).toContain("提出申訴");
    // 不得宣稱系統做不到或未認定的事。
    for (const forbidden of ["永久停權", "永久停用", "違法", "犯罪", "已確認詐欺", "終身"]) {
      expect(panel, `文案不得出現「${forbidden}」`).not.toContain(forbidden);
    }
    // 也不得在此引入任何法定期限。
    expect(panel).not.toMatch(/\d+\s*(日|天)內(回覆|處理|申訴)/);
  });

  test("frozen user: shows history and offers unfreeze", async ({ page }) => {
    await signInAs(page, "admin");
    let unfroze = false;
    await mockApi(page, {
      [`GET admin/users/${USER_ID}/account-status`]: (r) =>
        r.fulfill(
          statusPayload({
            accountStatus: "frozen",
            frozenAt: "2026-08-27T02:00:00.000Z",
            frozenBy: "usr_admin_1",
            freezeReason: "疑似詐欺行為，待查證：多筆訂單共用末四碼",
            currentReasonCode: "suspected_fraud",
            currentNote: "多筆訂單共用末四碼",
          }),
        ),
      [`GET admin/users/${USER_ID}/activity-logs`]: (r) => r.fulfill(EMPTY_LOGS),
      [`POST admin/users/${USER_ID}/unfreeze`]: (r) => {
        unfroze = true;
        return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      },
    });

    await page.goto(PAGE);
    await expect(page.getByTestId("account-status-pill")).toContainText("已凍結");
    await expect(page.getByTestId("freeze-reason")).toContainText("疑似詐欺");
    await expect(page.getByTestId("freeze-reason-code")).toContainText("suspected_fraud");
    await expect(page.getByTestId("frozen-at")).not.toContainText("—");

    await expect(page.getByTestId("freeze-open")).toHaveCount(0);
    await page.getByTestId("unfreeze-open").click();
    await expect(page.getByTestId("unfreeze-confirm")).toBeVisible();
    await page.getByTestId("unfreeze-submit").click();
    await expect.poll(() => unfroze).toBe(true);
  });

  test("self / admin target: control is unavailable, and the reason is stated", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      [`GET admin/users/${USER_ID}/account-status`]: (r) =>
        r.fulfill(statusPayload({ role: "admin" }, false)),
      [`GET admin/users/${USER_ID}/activity-logs`]: (r) => r.fulfill(EMPTY_LOGS),
    });
    await page.goto(PAGE);

    await expect(page.getByTestId("freeze-unavailable")).toBeVisible();
    await expect(page.getByTestId("freeze-open")).toHaveCount(0);
    await expect(page.getByTestId("unfreeze-open")).toHaveCount(0);
  });

  test("backend errors are surfaced honestly, not swallowed", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      [`GET admin/users/${USER_ID}/account-status`]: (r) => r.fulfill(statusPayload()),
      [`GET admin/users/${USER_ID}/activity-logs`]: (r) => r.fulfill(EMPTY_LOGS),
      [`POST admin/users/${USER_ID}/freeze`]: (r) =>
        r.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: "cannot_freeze_admin", message: "admin accounts cannot be frozen" }),
        }),
    });

    await page.goto(PAGE);
    await page.getByTestId("freeze-open").click();
    await page.getByTestId("freeze-reason-select").selectOption("manual_review");
    await page.getByTestId("freeze-submit").click();

    await expect(page.getByTestId("freeze-error")).toBeVisible();
    // 前端不得自行編一套說法蓋掉 backend 的錯誤。
    await expect(page.getByTestId("freeze-error")).toContainText("admin");
  });

  test("no two-admin approval workflow was introduced", async ({ page }) => {
    await signInAs(page, "admin");
    await mockApi(page, {
      [`GET admin/users/${USER_ID}/account-status`]: (r) => r.fulfill(statusPayload()),
      [`GET admin/users/${USER_ID}/activity-logs`]: (r) => r.fulfill(EMPTY_LOGS),
    });
    await page.goto(PAGE);
    await page.getByTestId("freeze-open").click();

    const panel = await page.getByTestId("account-freeze-panel").innerText();
    // `DEC-LEGAL-10` 明訂 MVP 不採 two-admin approval。
    for (const forbidden of ["second admin", "覆核", "簽核", "審批", "另一位管理員"]) {
      expect(panel, `不得引入雙人覆核：${forbidden}`).not.toContain(forbidden);
    }
  });
});
