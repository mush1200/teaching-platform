import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `IA-10` —— 退款／補救案件的 Admin UI。
 *
 * ## 這一支鎖的是什麼
 *
 *   1. **Admin 能瀏覽清單、開詳情、看稽核歷程、送出狀態轉移。**
 *   2. **理由必填** —— 沒填理由不得送出，且**不得**發出請求。
 *   3. **狀態機不在前端** —— 非法轉移由 backend 回 409 `invalid_transition`，
 *      UI 必須誠實顯示錯誤**並把 backend 回的 `allowed` 照實列出**。
 *      這條是 completion criteria (1) 的直接回歸測試。
 *   4. **三段式語意在文案上成立**（`mvp_rules.md` §12.8.2／§12.8.6）——
 *      approved ≠ completed ≠ 錢已退；畫面不得讓任何按鈕看起來像「按下去就退款」。
 *   5. **權限** —— 非 admin 與匿名都進不來。
 *   6. loading／empty／error 三種狀態都有明確呈現。
 *
 * backend 的狀態機與金額規則由 `Backend/tests/refundRemedyCase.db.test.js` 與
 * `manualRefundExecution.db.test.js` 覆蓋（那裡掛真正的 router）。
 * 這裡鎖的是 UI 契約 —— 特別是「前端沒有自己的狀態機」這件事。
 */

const CASE_ID = "rrc_e2e_001";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

async function mockApi(page: Page, handlers: Handlers) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/backend/", "");
    const key = `${route.request().method()} ${path}`;
    const handler = handlers[key];
    if (!handler) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    return handler(route);
  });
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });

const CASE_ROW = {
  id: CASE_ID,
  order_id: "ord_e2e_1",
  order_item_id: null,
  buyer_id: "usr_buyer_e2e",
  case_type: "statutory_rescission",
  status: "requested",
  requested_at: "2026-09-01T00:00:00.000Z",
  decision_at: null,
  completed_at: null,
  requested_amount: 100,
  approved_amount: null,
  refund_amount: null,
  refund_method: null,
  refund_reference: null,
  refund_paid_at: null,
  buyer_statement: "商品與說明不符，申請退款。",
  admin_note: null,
  entitlement_action: null,
};

function baseHandlers(overrides: Handlers = {}): Handlers {
  return {
    "GET auth/me": (r) => json(r, { user: { id: "usr_admin", role: "admin", email: "a@e2e.test" } }),
    "GET admin/remedy-cases": (r) => json(r, { items: [CASE_ROW] }),
    [`GET admin/remedy-cases/${CASE_ID}`]: (r) =>
      json(r, {
        case: CASE_ROW,
        history: [{ id: "h1", action: "remedy_case.created", created_at: "2026-09-01T00:00:00.000Z" }],
      }),
    ...overrides,
  };
}

test.describe("IA-10 — Admin remedy cases", () => {
  test("admin can open the list, open a case, and see its audit history", async ({ page }) => {
    await mockApi(page, baseHandlers());
    await signInAs(page, "admin");
    await page.goto("/admin/remedy-cases");

    await expect(page.getByTestId("admin-remedy-cases-page")).toBeVisible();
    await expect(page.getByTestId("admin-remedy-row")).toHaveCount(1);
    await expect(page.getByTestId("remedy-status-chip").first()).toContainText("已提出");

    await page.getByTestId("admin-remedy-row").first().click();
    await expect(page.getByTestId("admin-remedy-detail")).toBeVisible();
    await expect(page.getByTestId("remedy-case-id")).toContainText(CASE_ID);
    await expect(page.getByTestId("remedy-history")).toBeVisible();
  });

  test("the three-stage distinction is stated where the action is taken", async ({ page }) => {
    await mockApi(page, baseHandlers());
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    // approved ≠ completed ≠ 錢已退，而且畫面要說清楚系統不會匯錢。
    await expect(page.getByText("「已核准」不等於「已完成」，也不等於「錢已經退出去」。")).toBeVisible();
    await expect(page.getByText(/系統不會匯錢/)).toBeVisible();
  });

  test("a reason is required and no request is sent without one", async ({ page }) => {
    let transitionCalls = 0;
    await mockApi(
      page,
      baseHandlers({
        [`POST admin/remedy-cases/${CASE_ID}/transition`]: (r) => {
          transitionCalls += 1;
          return json(r, { caseId: CASE_ID, from: "requested", to: "under_review" });
        },
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await page.getByTestId("remedy-to-status").selectOption("under_review");
    await page.getByTestId("remedy-submit-transition").click();

    await expect(page.getByTestId("remedy-action-message")).toContainText("請填寫處置理由");
    // 關鍵：不只是顯示訊息，而是**根本沒送出請求**。
    expect(transitionCalls).toBe(0);
  });

  test("a valid transition succeeds and refreshes the case", async ({ page }) => {
    let called = 0;
    await mockApi(
      page,
      baseHandlers({
        [`POST admin/remedy-cases/${CASE_ID}/transition`]: async (r) => {
          called += 1;
          const body = JSON.parse(r.request().postData() ?? "{}");
          expect(body.status).toBe("under_review");
          expect(String(body.note)).toContain("開始調查");
          return json(r, { caseId: CASE_ID, from: "requested", to: "under_review" });
        },
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await page.getByTestId("remedy-to-status").selectOption("under_review");
    await page.getByTestId("remedy-note").fill("開始調查此案件。");
    await page.getByTestId("remedy-submit-transition").click();

    await expect(page.getByTestId("remedy-action-message")).toContainText("狀態已更新");
    expect(called).toBe(1);
  });

  /*
   * completion criteria (1) 的直接回歸測試：
   * 前端**沒有**自己的狀態機，因此它會允許使用者送出一個非法轉移，
   * 由 backend 判定並回 409 ＋ `allowed`；UI 必須把那份 allowed 照實顯示。
   *
   * 這條同時是一個負向控制：若有人日後在前端加了一份 TRANSITIONS 並把選項灰掉，
   * 這個測試就會因為選不到 `completed` 而失敗，提醒他違反了 criteria (1)。
   */
  test("an illegal transition surfaces the backend verdict and its allowed list", async ({ page }) => {
    await mockApi(
      page,
      baseHandlers({
        [`POST admin/remedy-cases/${CASE_ID}/transition`]: (r) =>
          json(
            r,
            {
              code: "invalid_transition",
              message: "cannot move case from requested to completed",
              from: "requested",
              allowed: ["under_review", "cancelled"],
            },
            409,
          ),
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await page.getByTestId("remedy-to-status").selectOption("completed");
    await page.getByTestId("remedy-note").fill("嘗試直接完成。");
    await page.getByTestId("remedy-submit-transition").click();

    await expect(page.getByTestId("remedy-action-message")).toContainText("cannot move case");
    const allowed = page.getByTestId("remedy-allowed-transitions");
    await expect(allowed).toContainText("調查中");
    await expect(allowed).toContainText("已取消");
  });

  test("a terminal case offers no transition controls", async ({ page }) => {
    const done = { ...CASE_ROW, status: "completed", approved_amount: 100, refund_amount: 100 };
    await mockApi(
      page,
      baseHandlers({
        "GET admin/remedy-cases": (r) => json(r, { items: [done] }),
        [`GET admin/remedy-cases/${CASE_ID}`]: (r) => json(r, { case: done, history: [] }),
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await expect(page.getByTestId("remedy-terminal-notice")).toBeVisible();
    await expect(page.getByTestId("remedy-to-status")).toHaveCount(0);
    await expect(page.getByTestId("remedy-submit-transition")).toHaveCount(0);
  });

  test("empty and error states are both explicit", async ({ page }) => {
    await mockApi(page, baseHandlers({ "GET admin/remedy-cases": (r) => json(r, { items: [] }) }));
    await signInAs(page, "admin");
    await page.goto("/admin/remedy-cases");
    await expect(page.getByText("沒有符合條件的補救案件")).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockApi(
      page,
      baseHandlers({
        "GET admin/remedy-cases": (r) => json(r, { message: "server error" }, 500),
      }),
    );
    await page.goto("/admin/remedy-cases");
    await expect(page.getByText("清單載入失敗")).toBeVisible();
  });

  test("backend refusal for a non-admin is surfaced, not swallowed", async ({ page }) => {
    // UX guard（`tp_role` cookie）只決定外殼；真正的邊界在 Backend 的 requireRole。
    // 這裡模擬「cookie 說是 admin，但 Backend 說 403」，UI 必須誠實顯示。
    await mockApi(
      page,
      baseHandlers({
        "GET admin/remedy-cases": (r) => json(r, { message: "Forbidden: insufficient role" }, 403),
      }),
    );
    await signInAs(page, "admin");
    await page.goto("/admin/remedy-cases");
    await expect(page.getByText("清單載入失敗")).toBeVisible();
  });
});

test.describe("IA-10 — access control", () => {
  test("anonymous visitors are sent to login, never to the case queue", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/remedy-cases");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("admin-remedy-cases-page")).toHaveCount(0);
  });

  test("a buyer is refused the admin shell", async ({ page }) => {
    await signInAs(page, "parent");
    await page.goto("/admin/remedy-cases");
    await expect(page).toHaveURL(/\/403/);
    await expect(page.getByTestId("admin-remedy-cases-page")).toHaveCount(0);
  });
});

/**
 * ## 建立案件（`POST orders/:orderId/remedy-cases`）
 *
 * Admin 代為開案是 IA-10 的 headline capability 之一 —— 客服管道進來的申訴
 * 必須有地方登錄成正式案件，否則只能直打 API（那就沒有稽核入口）。
 *
 * 這一組鎖三件事：
 *   (A) 送出的 body **只有** backend 解構的四個欄位，且成功後選到新案件；
 *   (B) 必填欄位空白時**不送出請求**；
 *   (C) backend 的拒絕照實顯示，前端不預先猜。
 */
test.describe("IA-10 — create case", () => {
  const NEW_ID = "rrc_e2e_new";
  const NEW_CASE = { ...CASE_ROW, id: NEW_ID, case_type: "duplicate_payment", requested_amount: 250 };

  // (A)
  test("admin creates a case with exactly the backend-accepted fields, and it becomes selected", async ({
    page,
  }) => {
    let posted: Record<string, unknown> | null = null;
    let listCalls = 0;
    await mockApi(
      page,
      baseHandlers({
        "GET admin/remedy-cases": (r) => {
          listCalls += 1;
          return json(r, { items: listCalls === 1 ? [CASE_ROW] : [CASE_ROW, NEW_CASE] });
        },
        [`GET admin/remedy-cases/${NEW_ID}`]: (r) => json(r, { case: NEW_CASE, history: [] }),
        "POST orders/ord_e2e_1/remedy-cases": (r) => {
          posted = JSON.parse(r.request().postData() ?? "{}");
          return json(r, { case: NEW_CASE }, 201);
        },
      }),
    );
    await signInAs(page, "admin");
    await page.goto("/admin/remedy-cases");

    await page.getByTestId("remedy-create-toggle").click();
    await expect(page.getByTestId("remedy-create-form")).toBeVisible();

    await page.getByTestId("remedy-create-order-id").fill("ord_e2e_1");
    await page.getByTestId("remedy-create-order-item-id").fill("oi_e2e_1");
    await page.getByTestId("remedy-create-case-type").selectOption("duplicate_payment");
    await page.getByTestId("remedy-create-statement").fill("同一張教材付了兩次款。");
    await page.getByTestId("remedy-create-amount").fill("250");
    await page.getByTestId("remedy-create-submit").click();

    // 成功後選到新案件 —— 而且是**重新向 backend 取**的那一份，不是前端捏的。
    await expect(page).toHaveURL(new RegExp(`case=${NEW_ID}`));
    await expect(page.getByTestId("remedy-case-id")).toContainText(NEW_ID);

    const body = posted as Record<string, unknown> | null;
    expect(body).not.toBeNull();
    // 關鍵：**只有** `order.js:472` 解構的四個欄位。多送任何一個都是前端自創契約，
    // 特別是 `buyerId` —— 那必須由 backend 從訂單推得，否則 admin 就能把案件掛到任意人身上。
    expect(Object.keys(body ?? {}).sort()).toEqual([
      "caseType",
      "orderItemId",
      "requestedAmount",
      "statement",
    ]);
    expect(body?.caseType).toBe("duplicate_payment");
    expect(body?.orderItemId).toBe("oi_e2e_1");
    expect(body?.requestedAmount).toBe(250);
    expect(String(body?.statement)).toContain("付了兩次款");
  });

  // (B)
  test("missing required fields block the request entirely", async ({ page }) => {
    let calls = 0;
    await mockApi(
      page,
      baseHandlers({
        "POST orders/ord_e2e_1/remedy-cases": (r) => {
          calls += 1;
          return json(r, { case: NEW_CASE }, 201);
        },
      }),
    );
    await signInAs(page, "admin");
    await page.goto("/admin/remedy-cases");
    await page.getByTestId("remedy-create-toggle").click();

    // 訂單編號空白
    await page.getByTestId("remedy-create-submit").click();
    await expect(page.getByTestId("remedy-create-message")).toContainText("請填寫訂單編號");

    // 有訂單但沒選類型
    await page.getByTestId("remedy-create-order-id").fill("ord_e2e_1");
    await page.getByTestId("remedy-create-submit").click();
    await expect(page.getByTestId("remedy-create-message")).toContainText("請選擇案件類型");

    expect(calls).toBe(0);
  });

  // (C)
  test("a backend rejection is surfaced verbatim, not pre-judged by the UI", async ({ page }) => {
    await mockApi(
      page,
      baseHandlers({
        "POST orders/ord_nope/remedy-cases": (r) =>
          json(r, { code: "invalid_amount", message: "requestedAmount must be a positive integer" }, 400),
      }),
    );
    await signInAs(page, "admin");
    await page.goto("/admin/remedy-cases");
    await page.getByTestId("remedy-create-toggle").click();

    await page.getByTestId("remedy-create-order-id").fill("ord_nope");
    await page.getByTestId("remedy-create-case-type").selectOption("other");
    // 前端**沒有**自己的金額規則，所以這個值送得出去，由 backend 裁決。
    await page.getByTestId("remedy-create-amount").fill("0");
    await page.getByTestId("remedy-create-submit").click();

    await expect(page.getByTestId("remedy-create-message")).toContainText(
      "requestedAmount must be a positive integer",
    );
    // 被拒絕時表單必須留著，使用者才改得了。
    await expect(page.getByTestId("remedy-create-form")).toBeVisible();
  });
});

/**
 * ## 記錄退款執行（`POST admin/remedy-cases/:id/execute-refund`）
 *
 * 這是整個 IA-10 唯一結論涉及金錢的動作，也是把案件從 `remedy_pending` 推到
 * `completed` 的**唯一**路徑（`refundRemedy.service.js:211-217` 明文禁止用 transition 做）。
 *
 * 除了「有沒有送出」之外，這一組特別鎖**文案**：畫面必須說清楚平台不會匯錢，
 * 這張表單記錄的是行外已完成的匯款。誤解這一點的人會在錢還沒匯出時就把案件結掉。
 */
test.describe("IA-10 — execute refund", () => {
  const PENDING_CASE = {
    ...CASE_ROW,
    status: "remedy_pending",
    decision_at: "2026-09-02T00:00:00.000Z",
    approved_amount: 100,
  };

  function withCase(row: Record<string, unknown>, overrides: Handlers = {}): Handlers {
    return baseHandlers({
      "GET admin/remedy-cases": (r) => json(r, { items: [row] }),
      [`GET admin/remedy-cases/${CASE_ID}`]: (r) => json(r, { case: row, history: [] }),
      ...overrides,
    });
  }

  // (D)
  test("the form appears for an approved cash case and states that the platform does not transfer funds", async ({
    page,
  }) => {
    await mockApi(page, withCase(PENDING_CASE));
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await expect(page.getByTestId("remedy-refund-form")).toBeVisible();
    const disclaimer = page.getByTestId("remedy-refund-disclaimer");
    // 兩個必須同時成立：**行外已完成** ＋ **平台不會轉帳**。
    await expect(disclaimer).toContainText("已經在行外完成");
    await expect(disclaimer).toContainText("平台不會轉帳");
    await expect(disclaimer).toContainText("不會把錢匯給任何人");

    // 金額預填為核准金額，但仍可編輯 —— 上限由 backend 判定，不是前端鎖死。
    await expect(page.getByTestId("remedy-refund-amount-input")).toHaveValue("100");
  });

  // (E)
  test("a non-monetary case offers no refund form", async ({ page }) => {
    await mockApi(page, withCase({ ...PENDING_CASE, approved_amount: null }));
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await expect(page.getByTestId("remedy-refund-non-cash")).toBeVisible();
    await expect(page.getByTestId("remedy-refund-form")).toHaveCount(0);
  });

  // (F)
  test("a case that already has a recorded refund cannot record a second one", async ({ page }) => {
    await mockApi(
      page,
      withCase({
        ...PENDING_CASE,
        status: "completed",
        refund_amount: 100,
        refund_method: "manual_bank_transfer",
        refund_reference: "TXN-OLD-1",
        refund_paid_at: "2026-09-03T05:00:00.000Z",
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await expect(page.getByTestId("remedy-refund-already-paid")).toBeVisible();
    await expect(page.getByTestId("remedy-refund-form")).toHaveCount(0);
    await expect(page.getByTestId("remedy-refund-reference-value")).toContainText("TXN-OLD-1");
  });

  // (G)
  test("a case that is not yet remedy_pending offers no refund form at all", async ({ page }) => {
    await mockApi(page, withCase({ ...PENDING_CASE, status: "approved" }));
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await expect(page.getByTestId("admin-remedy-detail")).toBeVisible();
    await expect(page.getByTestId("remedy-refund-form")).toHaveCount(0);
    await expect(page.getByTestId("remedy-refund-non-cash")).toHaveCount(0);
    await expect(page.getByTestId("remedy-refund-already-paid")).toHaveCount(0);
  });

  // (H)
  test("the payment reference is required and no request is sent without it", async ({ page }) => {
    let calls = 0;
    await mockApi(
      page,
      withCase(PENDING_CASE, {
        [`POST admin/remedy-cases/${CASE_ID}/execute-refund`]: (r) => {
          calls += 1;
          return json(r, { caseId: CASE_ID });
        },
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await page.getByTestId("remedy-refund-submit").click();
    await expect(page.getByTestId("remedy-refund-message")).toContainText("請填寫交易參考");
    // 「沒有交易參考的『已退款』不是憑據，是宣稱」—— 連送都不該送。
    expect(calls).toBe(0);
  });

  // (I)
  test("a successful execution posts exactly the backend-accepted fields and refreshes the case", async ({
    page,
  }) => {
    let posted: Record<string, unknown> | null = null;
    let detailCalls = 0;
    const done = {
      ...PENDING_CASE,
      status: "completed",
      refund_amount: 100,
      refund_paid_at: "2026-09-10T14:30:00.000Z",
      refund_reference: "TXN-20260910-7",
    };
    await mockApi(
      page,
      baseHandlers({
        "GET admin/remedy-cases": (r) => json(r, { items: [PENDING_CASE] }),
        [`GET admin/remedy-cases/${CASE_ID}`]: (r) => {
          detailCalls += 1;
          return json(r, { case: detailCalls === 1 ? PENDING_CASE : done, history: [] });
        },
        [`POST admin/remedy-cases/${CASE_ID}/execute-refund`]: (r) => {
          posted = JSON.parse(r.request().postData() ?? "{}");
          return json(r, { caseId: CASE_ID, case: done, pendingEntitlementAction: null });
        },
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await page.getByTestId("remedy-refund-reference").fill("TXN-20260910-7");
    await page.getByTestId("remedy-refund-paid-at-input").fill("2026-09-10T14:30");
    await page.getByTestId("remedy-refund-note").fill("已完成銀行匯款。");
    await page.getByTestId("remedy-refund-submit").click();

    // 重新取回的案件已完成，表單收起、改顯示既有紀錄。
    await expect(page.getByTestId("remedy-refund-already-paid")).toBeVisible();
    await expect(page.getByTestId("remedy-refund-form")).toHaveCount(0);

    const body = posted as Record<string, unknown> | null;
    expect(body).not.toBeNull();
    expect(Object.keys(body ?? {}).sort()).toEqual(["amount", "note", "paidAt", "paymentReference"]);
    expect(body?.amount).toBe(100);
    expect(body?.paymentReference).toBe("TXN-20260910-7");
    // `refund_paid_at` 是無時區的 `TIMESTAMP`；送 datetime-local 原值，不得轉成 UTC。
    expect(body?.paidAt).toBe("2026-09-10T14:30");
  });

  // (J)
  test("exceeding the approved amount is decided by the backend and shown with its cap", async ({
    page,
  }) => {
    await mockApi(
      page,
      withCase(PENDING_CASE, {
        [`POST admin/remedy-cases/${CASE_ID}/execute-refund`]: (r) =>
          json(
            r,
            {
              code: "amount_exceeds_approved",
              message: "refund amount exceeds the approved amount",
              approvedAmount: 100,
            },
            400,
          ),
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    // 前端**允許**送出超額 —— 上限是 backend 的規則，不在這裡複製一份。
    await page.getByTestId("remedy-refund-amount-input").fill("999");
    await page.getByTestId("remedy-refund-reference").fill("TXN-OVER-1");
    await page.getByTestId("remedy-refund-submit").click();

    await expect(page.getByTestId("remedy-refund-message")).toContainText(
      "refund amount exceeds the approved amount",
    );
    await expect(page.getByTestId("remedy-refund-approved-cap")).toContainText("NT$100");
    // 被拒絕 → 案件沒有被結掉，表單留著讓人改金額。
    await expect(page.getByTestId("remedy-refund-form")).toBeVisible();
  });

  // (K)
  test("a concurrent already_executed conflict is surfaced, not swallowed", async ({ page }) => {
    await mockApi(
      page,
      withCase(PENDING_CASE, {
        [`POST admin/remedy-cases/${CASE_ID}/execute-refund`]: (r) =>
          json(
            r,
            { code: "already_executed", message: "a refund has already been recorded for this case" },
            409,
          ),
      }),
    );
    await signInAs(page, "admin");
    await page.goto(`/admin/remedy-cases?case=${CASE_ID}`);

    await page.getByTestId("remedy-refund-reference").fill("TXN-DUP-1");
    await page.getByTestId("remedy-refund-submit").click();

    await expect(page.getByTestId("remedy-refund-message")).toContainText(
      "a refund has already been recorded",
    );
  });
});
