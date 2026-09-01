import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * Admin Operations UX Closure Epic 的端對端覆蓋。
 *
 * 全部走 `page.route` 假 API：這些測試要驗的是**前端契約**（URL state、分頁重設、
 * 送出的 query、拒絕時的必填驗證、案件動作按鈕的可見性），不是 Backend 的行為 ——
 * 後者已由 `Backend/tests/*.db.test.js` 與 smoke / Postman 覆蓋。
 *
 * 每個 mock 都把收到的 query 記錄下來，因此測試可以斷言
 * 「UI 真的把 page=2 送出去了」，而不是只看畫面上的數字變了。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

/** 產生 n 筆假教材；`offset` 讓不同頁的 id 不重複。 */
function materials(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `mat_${offset + i}`,
    title: `教材 ${offset + i}`,
    status: "pending_review",
    price: 100 + i,
    teacher_id: "usr_creator",
    creator_email: "creator@example.com",
    open_report_count: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    material_features: [],
  }));
}

test.describe("Admin materials review queue", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  /** @returns 收到的每一次 `/admin/materials` 請求的 query string。 */
  async function mockMaterials(page: Page) {
    const queries: string[] = [];
    /*
     * Playwright 的 route 是 **LIFO**：最後註冊的 handler 先比對。
     * 因此 catch-all 必須**先**註冊，越specific 的越晚註冊，否則它會蓋掉所有精細的 mock。
     */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/materials**", async (route) => {
      const url = new URL(route.request().url());
      queries.push(url.search);
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const pageNo = Number(url.searchParams.get("page") ?? "1");
      const status = url.searchParams.get("status");
      const q = url.searchParams.get("q");

      // 搜尋只回一筆，好證明搜尋確實改變了結果集
      if (q) {
        return json(route, {
          items: [{ ...materials(1)[0], id: "mat_hit", title: `搜尋命中 ${q}` }],
          pagination: { page: 1, limit, total: 1, totalPages: 1 },
          statusCounts: { total: 45, pending_review: 25, changes_requested: 4, published: 18, unpublished: 2 },
        });
      }
      const total = status === "published" ? 18 : 45;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const count = Math.min(limit, Math.max(0, total - (pageNo - 1) * limit));
      return json(route, {
        items: materials(count, (pageNo - 1) * limit),
        pagination: { page: pageNo, limit, total, totalPages },
        statusCounts: { total: 45, pending_review: 25, changes_requested: 4, published: 18, unpublished: 2 },
      });
    });
    return queries;
  }

  test("filter chips serve the queue: pending / awaiting creator / all", async ({ page }) => {
    const queries = await mockMaterials(page);
    await page.goto("/admin/materials");

    const tabs = page.getByTestId("filter-tabs");
    await expect(tabs).toBeVisible();
    // 預設就是「待審核」—— 這一頁的工作是把佇列清空
    await expect(page.getByTestId("filter-tab-pending_review")).toHaveAttribute("aria-selected", "true");
    // 數字來自 statusCounts（全表），不是目前這一頁的 items.length
    await expect(page.getByTestId("filter-tab-pending_review")).toContainText("25");
    await expect(page.getByTestId("filter-tab-changes_requested")).toContainText("4");
    await expect(page.getByTestId("filter-tab-all")).toContainText("45");
    // 已上架不是這一頁的工作，不給一級 tab（仍可 deep link）
    await expect(page.getByTestId("filter-tab-published")).toHaveCount(0);

    await page.getByTestId("filter-tab-changes_requested").click();
    await expect(page).toHaveURL(/status=changes_requested/);
    await expect.poll(() => queries.at(-1)).toContain("status=changes_requested");
  });

  test("pagination is server-side and page changes are sent to the API", async ({ page }) => {
    const queries = await mockMaterials(page);
    await page.goto("/admin/materials");

    await expect(page.getByTestId("admin-material-row")).toHaveCount(20);
    await expect(page.getByTestId("pagination-total")).toContainText("共 45 筆");

    await page.getByRole("button", { name: "第 3 頁" }).click();
    await expect(page).toHaveURL(/page=3/);
    await expect.poll(() => queries.at(-1)).toContain("page=3");
    // 45 筆、每頁 20 → 第 3 頁只有 5 筆
    await expect(page.getByTestId("admin-material-row")).toHaveCount(5);
  });

  test("changing the filter resets the page", async ({ page }) => {
    await mockMaterials(page);
    await page.goto("/admin/materials?page=3");
    await expect(page.getByRole("button", { name: "第 3 頁" })).toHaveAttribute("aria-current", "page");

    await page.getByTestId("filter-tab-changes_requested").click();
    // 停在第 3 頁換到只有 1 頁的狀態會拿到空清單，而畫面上什麼都不會說
    await expect(page).not.toHaveURL(/page=3/);
    await expect(page).toHaveURL(/status=changes_requested/);
  });

  test("searching resets the page and is reflected in the URL", async ({ page }) => {
    const queries = await mockMaterials(page);
    await page.goto("/admin/materials?page=2");

    await page.getByTestId("toolbar-search-input").fill("注音");
    await page.getByTestId("toolbar-search-submit").click();

    await expect(page).toHaveURL(/q=%E6%B3%A8%E9%9F%B3/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect.poll(() => queries.at(-1)).toContain("q=");
    await expect(page.getByTestId("admin-material-row")).toHaveCount(1);
  });

  test("URL state survives a reload", async ({ page }) => {
    const queries = await mockMaterials(page);
    await page.goto("/admin/materials?status=changes_requested&limit=50");
    await expect.poll(() => queries.at(-1)).toContain("limit=50");

    await page.reload();
    await expect(page.getByTestId("filter-tab-changes_requested")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("pagination-page-size")).toHaveValue("50");
  });

  test("page size selector changes limit and resets the page", async ({ page }) => {
    const queries = await mockMaterials(page);
    await page.goto("/admin/materials?page=2");

    await page.getByTestId("pagination-page-size").selectOption("50");
    await expect(page).toHaveURL(/limit=50/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect.poll(() => queries.at(-1)).toContain("limit=50");
  });

  test("empty search result explains what to try instead", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/materials**", (route) =>
      json(route, {
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        statusCounts: { total: 0, pending_review: 0, changes_requested: 0, published: 0, unpublished: 0 },
      })
    );
    await page.goto("/admin/materials?q=nothing");
    await expect(page.getByText("沒有符合條件的教材")).toBeVisible();
    await expect(page.getByText(/創作者 Email/)).toBeVisible();
  });

  test("list error state offers a retry", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/materials**", (route) => {
      attempts += 1;
      if (attempts === 1) return json(route, { message: "server error" }, 500);
      return json(route, {
        items: materials(1),
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { total: 1, pending_review: 1, changes_requested: 0, published: 0, unpublished: 0 },
      });
    });

    await page.goto("/admin/materials");
    await expect(page.getByText("載入失敗")).toBeVisible();
    await page.getByRole("alert").getByRole("button", { name: "重新整理" }).click();
    await expect(page.getByTestId("admin-material-row")).toHaveCount(1);
  });
});

test.describe("Admin payment review", () => {
  /** 1×1 透明 PNG。夠讓瀏覽器真的解碼出一張圖，`<img>` 才會 visible。 */
  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  const PROOF = {
    id: "prf_1",
    order_id: "ord_260822_001",
    user_id: "usr_buyer",
    buyer_email: "buyer@example.com",
    order_status: "pending_payment",
    order_total_amount: 450,
    order_payment_mode: "manual_transfer",
    order_created_at: "2026-08-20T02:00:00.000Z",
    order_payment_due_at: "2026-08-23T02:00:00.000Z",
    order_proof_count: 2,
    proof_file_path: "/orders/ord_260822_001/payment-proofs/prf_1/file",
    proof_file_available: true,
    proof_storage_status: "private",
    original_filename: "transfer.jpg",
    proof_size_bytes: 12345,
    review_status: "pending",
    uploaded_at: "2026-08-21T02:00:00.000Z",
  };

  /** 已核准的憑證：用來驗證「已結案 → 唯讀」的入口文案與面板。 */
  const DECIDED_PROOF = {
    ...PROOF,
    id: "prf_done",
    order_id: "ord_260822_002",
    review_status: "approved",
    reviewed_at: "2026-08-21T06:00:00.000Z",
    reviewed_by_email: "admin-e2e@example.com",
  };

  async function mockPayments(page: Page, opts: { includeDecided?: boolean } = {}) {
    const calls: { list: string[]; posts: Array<{ url: string; body: unknown }> } = { list: [], posts: [] };
    const rows = opts.includeDecided ? [PROOF, DECIDED_PROOF] : [PROOF];

    /*
     * Playwright 的 route 是 **LIFO**：最後註冊的 handler 先比對。
     * 因此 catch-all 必須**先**註冊，越specific 的越晚註冊，否則它會蓋掉所有精細的 mock。
     */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));

    await page.route("**/api/backend/admin/payment-proofs**", (route) => {
      const url = new URL(route.request().url());
      calls.list.push(url.search);
      const q = url.searchParams.get("q");
      const items = !q || q === PROOF.order_id || q === PROOF.buyer_email ? rows : [];
      return json(route, {
        items,
        pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
        statusCounts: { total: 12, pending: 3, approved: 8, rejected: 1 },
      });
    });
    await page.route("**/api/backend/admin/payment-proofs/prf_1", (route) =>
      json(route, {
        proof: PROOF,
        orderItems: [
          { id: "oi_1", material_id: "mat_1", material_title: "示範教材", quantity: 1, unit_price: 450, subtotal: 450 },
        ],
        otherProofs: [
          {
            id: "prf_0",
            review_status: "rejected",
            rejection_reason: "unreadable",
            note: "影像過暗",
            uploaded_at: "2026-08-20T05:00:00.000Z",
          },
        ],
      })
    );
    await page.route("**/api/backend/admin/payment-proofs/prf_done", (route) =>
      json(route, { proof: DECIDED_PROOF, orderItems: [], otherProofs: [] })
    );
    /*
     * 憑證影像。**不再是公開 URL** —— UI 用 `apiFetch` 帶 JWT 取回位元組再轉 object URL
     * （見 `lib/payment-proof.ts`），所以 mock 的是那條受保護路徑並回傳真的 PNG 位元組。
     * 回 JSON 會讓 `<img>` 載不出來，測不到「預覽真的顯示了」。
     */
    await page.route("**/api/backend/orders/*/payment-proofs/*/file*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
        body: TINY_PNG,
      })
    );
    await page.route("**/api/backend/admin/payment-proofs/*/approve", async (route) => {
      calls.posts.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return json(route, { proofId: "prf_1", order: { id: PROOF.order_id, status: "approved" } });
    });
    await page.route("**/api/backend/admin/payment-proofs/*/reject", async (route) => {
      const body = route.request().postDataJSON();
      calls.posts.push({ url: route.request().url(), body });
      if (!body?.rejection_reason) return json(route, { message: "rejection_reason is required" }, 400);
      return json(route, { proof: { id: "prf_1", review_status: "rejected", ...body } });
    });
    return calls;
  }

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("search is by order number / buyer email, not an internal id field", async ({ page }) => {
    const calls = await mockPayments(page);
    await page.goto("/admin/payment-proofs");

    // 舊版的主要入口是「請輸入憑證 ID」的表單；它不該再存在
    await expect(page.getByText("手動審核（若已知憑證 ID）")).toHaveCount(0);
    await expect(page.getByTestId("toolbar-search-input")).toHaveAttribute(
      "placeholder",
      /訂單編號|Email/
    );

    await page.getByTestId("toolbar-search-input").fill("buyer@example.com");
    await page.getByTestId("toolbar-search-submit").click();
    await expect.poll(() => calls.list.at(-1)).toContain("q=buyer%40example.com");
    await expect(page.getByTestId("admin-payment-proof-row")).toHaveCount(1);
  });

  test("review panel shows the full decision context", async ({ page }) => {
    await mockPayments(page);
    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();

    const panel = page.getByTestId("payment-review-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("ord_260822_001");
    await expect(panel).toContainText("buyer@example.com");
    await expect(panel).toContainText("NT$ 450");
    await expect(panel).toContainText("付款期限");
    await expect(panel).toContainText("示範教材");
    // 同訂單先前的退件原因必須看得到，否則會用同樣理由再退一次
    await expect(panel).toContainText("無法辨識付款資訊");
    await expect(page.getByTestId("payment-proof-image")).toBeVisible();
  });

  test("detail opens next to the queue, not after the whole list", async ({ page }) => {
    await mockPayments(page);
    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();

    const list = page.getByTestId("review-workspace-list");
    const detail = page.getByTestId("review-workspace-detail");
    await expect(detail.getByTestId("payment-review-panel")).toBeVisible();
    // 選取的那一列要看得出來被選取
    await expect(page.getByTestId("admin-payment-proof-row").first()).toHaveAttribute("aria-current", "true");

    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      // 雙欄：清單仍在左側，詳情在右側 —— 不需要捲過整份清單
      await expect(list).toBeVisible();
      const listBox = await list.boundingBox();
      const detailBox = await detail.boundingBox();
      expect(detailBox!.x).toBeGreaterThan(listBox!.x);
      expect(detailBox!.y).toBeLessThan(listBox!.y + listBox!.height);
      await expect(page.getByTestId("review-workspace-back")).toBeHidden();
    } else {
      // 單欄：詳情取代清單，並且有明確的返回路徑
      await expect(list).toBeHidden();
      await expect(page.getByTestId("review-workspace-back")).toBeVisible();
      await page.getByTestId("review-workspace-back").click();
      await expect(list).toBeVisible();
      await expect(page.getByTestId("payment-review-panel")).toHaveCount(0);
    }
  });

  test("decided proofs open as read-only detail, not as a new review", async ({ page }) => {
    await mockPayments(page, { includeDecided: true });
    await page.goto("/admin/payment-proofs");

    const buttons = page.getByTestId("payment-proof-open");
    // 待審核 → 開始審核；已核准／已退回 → 查看詳情（面板本來就是唯讀的）
    await expect(buttons.nth(0)).toHaveText("開始審核");
    await expect(buttons.nth(1)).toHaveText("查看詳情");

    await buttons.nth(1).click();
    const panel = page.getByTestId("payment-review-panel");
    await expect(panel).toContainText("已於");
    await expect(page.getByTestId("payment-approve")).toHaveCount(0);
    await expect(page.getByTestId("payment-reject-open")).toHaveCount(0);
  });

  test("approve posts to the approve endpoint", async ({ page }) => {
    const calls = await mockPayments(page);
    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();
    await page.getByTestId("payment-approve").click();

    await expect.poll(() => calls.posts.at(-1)?.url).toContain("/approve");
    await expect(page.getByTestId("payment-review-message")).toContainText("已核准");
  });

  test("rejection requires a reason and sends the reason code", async ({ page }) => {
    const calls = await mockPayments(page);
    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();
    await page.getByTestId("payment-reject-open").click();

    // 預設已選第一個原因 —— 不存在「沒有原因就送出」的路徑
    await expect(page.getByTestId("rejection-reason-amount_mismatch")).toBeChecked();

    await page.getByTestId("rejection-reason-unreadable").check();
    await page.getByTestId("payment-reject-confirm").click();

    await expect.poll(() => calls.posts.at(-1)?.body).toMatchObject({ rejection_reason: "unreadable" });
    await expect(page.getByTestId("payment-review-message")).toContainText("已退回");
  });

  test('reason "other" requires a note before submitting', async ({ page }) => {
    const calls = await mockPayments(page);
    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();
    await page.getByTestId("payment-reject-open").click();
    await page.getByTestId("rejection-reason-other").check();

    const before = calls.posts.length;
    await page.getByTestId("payment-reject-confirm").click();
    await expect(page.getByTestId("payment-review-message")).toContainText("必須填寫說明");
    expect(calls.posts.length).toBe(before);

    await page.getByTestId("rejection-note").fill("銀行查無此筆匯款");
    await page.getByTestId("payment-reject-confirm").click();
    await expect
      .poll(() => calls.posts.at(-1)?.body)
      .toMatchObject({ rejection_reason: "other", note: "銀行查無此筆匯款" });
  });

  /**
   * IA-03：付款審核面板 → 該訂單的活動時間軸。
   *
   * 判斷一張憑證常常需要知道「這張訂單之前發生過什麼」。在 IA-03 之前，
   * Admin 必須離開審核面板、回到活動紀錄、再自己搜一次訂單編號。
   */
  test("the review panel leads to that order's activity timeline", async ({ page }) => {
    test.setTimeout(120_000);
    await mockPayments(page);
    // mockPayments 先註冊 catch-all，因此這條要更晚註冊才會贏（route 是 LIFO）
    await page.route("**/api/backend/admin/orders/ord_260822_001/activity-logs**", (route) =>
      json(route, {
        items: [
          {
            id: "a1",
            action: "payment_proof_uploaded",
            actor_role: "buyer",
            actor_id: "usr_buyer",
            actor_email: "buyer@example.com",
            target_type: "order",
            target_id: "ord_260822_001",
            target_label: "ord_260822_001",
            meta: { uploadedCount: 1, totalProofCountAfterUpload: 2 },
            created_at: "2026-08-21T02:00:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
    );

    await page.goto("/admin/payment-proofs");
    await page.getByTestId("payment-proof-open").first().click();

    const link = page.getByTestId("payment-proof-order-activity-link");
    await expect(link).toBeVisible();

    // 真的點下去 —— 只比對 href 只能證明字串拼對了，證不出目的地是活的
    await link.click();
    await expect(page).toHaveURL(/\/admin\/orders\/ord_260822_001\/activity-logs/, { timeout: 60_000 });
    const row = page.getByTestId("activity-log-row").first();
    await expect(row).toContainText("上傳了付款憑證");
    await expect(row.getByTestId("activity-log-meta")).toContainText("本次上傳張數：1 張");
  });
});

test.describe("Admin report cases", () => {
  type CaseState = {
    status: string;
    allowedTransitions: string[];
    events: Array<{ id: string; event_type: string; message?: string | null; created_at: string; meta?: unknown }>;
  };

  async function mockCases(page: Page) {
    const state: CaseState = {
      status: "pending",
      // `reviewed` 不再是合法轉移目標（legacy terminal），mock 必須跟著後端契約
      allowedTransitions: ["investigating", "awaiting_creator", "resolved", "dismissed"],
      events: [],
    };
    const posts: Array<{ action: string; body: unknown }> = [];
    const listQueries: string[] = [];

    const detail = () => ({
      report: {
        id: "rep_1",
        material_id: "mat_1",
        material_title: "注音符號練習本",
        material_status: "published",
        creator_email: "creator@example.com",
        reporter_email: "reporter@example.com",
        reason: "疑似侵權",
        status: state.status,
        created_at: "2026-08-20T02:00:00.000Z",
      },
      events: state.events,
      availableResolutions: ["dismissed", "warning", "request_changes", "unpublish_material"],
      allowedTransitions: state.allowedTransitions,
    });

    /*
     * Playwright 的 route 是 **LIFO**：最後註冊的 handler 先比對。
     * 因此 catch-all 必須**先**註冊，越specific 的越晚註冊，否則它會蓋掉所有精細的 mock。
     */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));

    await page.route("**/api/backend/admin/report-cases**", (route) => {
      listQueries.push(new URL(route.request().url()).search);
      return json(route, {
        items: [
          {
            id: "rep_1",
            material_id: "mat_1",
            material_title: "注音符號練習本",
            creator_email: "creator@example.com",
            reporter_email: "reporter@example.com",
            reason: "疑似侵權",
            status: state.status,
            created_at: "2026-08-20T02:00:00.000Z",
            event_count: state.events.length,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { pending: 1, investigating: 0, awaiting_creator: 0, resolved: 4, dismissed: 2, reviewed: 3 },
      });
    });
    await page.route("**/api/backend/admin/report-cases/rep_1", (route) => json(route, detail()));
    await page.route("**/api/backend/admin/report-cases/rep_1/*", async (route) => {
      const action = new URL(route.request().url()).pathname.split("/").pop() ?? "";
      const body = route.request().postDataJSON();
      posts.push({ action, body });

      if (action === "investigate") {
        state.status = "investigating";
        state.allowedTransitions = ["awaiting_creator", "resolved", "dismissed"];
        state.events.push({ id: `e${state.events.length}`, event_type: "status_changed", created_at: "2026-08-21T00:00:00.000Z", meta: { from: "pending", to: "investigating" } });
      } else if (action === "request-response") {
        state.status = "awaiting_creator";
        state.allowedTransitions = ["investigating", "resolved", "dismissed"];
        state.events.push({ id: `e${state.events.length}`, event_type: "creator_response_requested", message: String((body as { message?: string })?.message ?? ""), created_at: "2026-08-21T01:00:00.000Z" });
      } else if (action === "notes") {
        state.events.push({ id: `e${state.events.length}`, event_type: "admin_note", message: String((body as { message?: string })?.message ?? ""), created_at: "2026-08-21T02:00:00.000Z" });
      } else if (action === "resolve") {
        const resolution = (body as { resolution?: string })?.resolution ?? "";
        state.status = resolution === "dismissed" ? "dismissed" : "resolved";
        state.allowedTransitions = [];
        state.events.push({ id: `e${state.events.length}`, event_type: "resolution", created_at: "2026-08-21T03:00:00.000Z", meta: { resolution, materialUnpublished: resolution === "unpublish_material" } });
      }
      return json(route, { ok: true });
    });
    return Object.assign(posts, { listQueries });
  }

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("queue defaults to open cases and shows who reported what", async ({ page }) => {
    await mockCases(page);
    await page.goto("/admin/reports");

    await expect(page.getByTestId("filter-tab-open")).toHaveAttribute("aria-selected", "true");
    const row = page.getByTestId("admin-report-row").first();
    await expect(row).toContainText("注音符號練習本");
    await expect(row).toContainText("creator@example.com");
    await expect(row).toContainText("reporter@example.com");
    await expect(row).toContainText("疑似侵權");
  });

  test("filters are two levels: stage first, detail status second", async ({ page }) => {
    const mock = await mockCases(page);
    await page.goto("/admin/reports");

    // 第一層只有三個：待處理中 / 已結案 / 全部
    await expect(page.getByTestId("filter-tab-open")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("filter-tab-closed")).toBeVisible();
    await expect(page.getByTestId("filter-tab-all")).toBeVisible();
    // 有包含關係的細分狀態不得與「待處理中」同層
    await expect(page.getByTestId("filter-tab-pending")).toHaveCount(0);
    await expect(page.getByTestId("filter-tab-investigating")).toHaveCount(0);

    // 第二層跟著第一層走
    await expect(page.getByTestId("filter-subtab-pending")).toBeVisible();
    await expect(page.getByTestId("filter-subtab-awaiting_creator")).toBeVisible();

    await page.getByTestId("filter-subtab-investigating").click();
    await expect(page).toHaveURL(/status=investigating/);
    await expect.poll(() => mock.listQueries.at(-1)).toContain("status=investigating");
    // 換細分狀態不會跳出「待處理中」
    await expect(page.getByTestId("filter-tab-open")).toHaveAttribute("aria-selected", "true");

    /*
     * counts 必須自洽：全部 = 待處理中 + 已結案（closed 含 legacy reviewed）。
     * fixture：pending 1 + investigating 0 + awaiting_creator 0 = 1；
     *          resolved 4 + dismissed 2 + reviewed 3 = 9；合計 10。
     */
    await expect(page.getByTestId("filter-tab-open")).toContainText("1");
    await expect(page.getByTestId("filter-tab-closed")).toContainText("9");
    await expect(page.getByTestId("filter-tab-all")).toContainText("10");

    await page.getByTestId("filter-tab-closed").click();
    await expect(page.getByTestId("filter-subtab-resolved")).toBeVisible();
    await expect(page.getByTestId("filter-subtab-dismissed")).toBeVisible();
    await expect(page.getByTestId("filter-subtab-pending")).toHaveCount(0);
    // legacy 的 reviewed 也算已結案，否則那些案件只在「全部」看得到
    await expect.poll(() => mock.listQueries.at(-1)).toContain("status=resolved%2Cdismissed%2Creviewed");
  });

  test("case detail opens next to the queue, not after the whole list", async ({ page }) => {
    await mockCases(page);
    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").click();

    const list = page.getByTestId("review-workspace-list");
    const detail = page.getByTestId("review-workspace-detail");
    await expect(detail.getByTestId("report-case-detail")).toBeVisible();
    await expect(page.getByTestId("admin-report-row").first()).toHaveAttribute("aria-current", "true");

    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      await expect(list).toBeVisible();
      const listBox = await list.boundingBox();
      const detailBox = await detail.boundingBox();
      expect(detailBox!.x).toBeGreaterThan(listBox!.x);
      expect(detailBox!.y).toBeLessThan(listBox!.y + listBox!.height);
    } else {
      await expect(list).toBeHidden();
      await page.getByTestId("review-workspace-back").click();
      await expect(list).toBeVisible();
      await expect(page.getByTestId("report-case-detail")).toHaveCount(0);
    }
  });

  test("full workflow: investigate → request creator response → resolve", async ({ page }) => {
    const posts = await mockCases(page);
    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").click();

    const detail = page.getByTestId("report-case-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("待處理");

    await page.getByTestId("report-investigate").click();
    await expect.poll(() => posts.at(-1)?.action).toBe("investigate");
    await expect(detail).toContainText("調查中");
    // 已接手之後不該再出現「開始調查」——按鈕由 allowedTransitions 決定
    await expect(page.getByTestId("report-investigate")).toHaveCount(0);

    await page.getByTestId("report-request-message").fill("請說明第 3 頁圖片來源");
    await page.getByTestId("report-request-response").click();
    await expect.poll(() => posts.at(-1)?.body).toMatchObject({ message: "請說明第 3 頁圖片來源" });
    await expect(detail).toContainText("等待創作者回覆");
    // 往來訊息會顯示在處理歷程上
    await expect(page.getByTestId("report-case-timeline")).toContainText("請說明第 3 頁圖片來源");

    await page.getByTestId("report-resolution-unpublish_material").check();
    await page.getByTestId("report-resolution-note").fill("侵權屬實");
    await page.getByTestId("report-resolve").click();
    await expect
      .poll(() => posts.at(-1)?.body)
      .toMatchObject({ resolution: "unpublish_material", note: "侵權屬實" });

    await expect(detail).toContainText("已處理");
    await expect(page.getByTestId("report-case-timeline")).toContainText("下架教材");
    await expect(detail).toContainText("此案件已結案");
  });

  /**
   * `IA-01` —— 教學回饋 contextualization。
   *
   * 檢舉案件詳情是 Admin 真正需要「這份教材被怎麼評價」的當下。驗三件事：
   * 摘要數字正確、脈絡綁在**這一筆案件的教材**上、而且完全唯讀（沒有任何回饋處置 CTA）。
   */
  test("case detail carries the material's teaching feedback as read-only context", async ({ page }) => {
    await mockCases(page);
    // LIFO：晚註冊的更 specific，會蓋掉 mockCases 的 catch-all。
    await page.route("**/api/backend/materials/mat_1/rating", (route) =>
      json(route, { average: 3.7, count: 3 })
    );
    await page.route("**/api/backend/materials/mat_1/reviews", (route) =>
      json(route, [
        { id: "rev_a", rating: 5, comment: "步驟清楚", created_at: "2026-08-20T03:00:00.000Z", parent_id: "usr_p1" },
        { id: "rev_b", rating: 2, comment: "檔案缺頁", created_at: "2026-08-19T03:00:00.000Z", parent_id: "usr_p2" },
        { id: "rev_c", rating: 4, comment: "整體不錯", created_at: "2026-08-18T03:00:00.000Z", parent_id: "usr_p3" },
      ])
    );

    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").click();

    const context = page.getByTestId("material-feedback-context");
    await expect(context).toBeVisible();
    // 脈絡屬於這一筆案件的教材，不是全平台的回饋流
    await expect(context).toHaveAttribute("data-material-id", "mat_1");
    await expect(page.getByTestId("material-feedback-summary")).toContainText("平均 3.7 分・3 則・其中 1 則 2 星以下");
    await expect(page.getByTestId("material-feedback-review")).toHaveCount(3);
    await expect(context).toContainText("檔案缺頁");

    // 唯讀：不得長出任何回饋 moderation 動作
    for (const label of ["隱藏", "刪除", "還原", "標記", "下架回饋"]) {
      await expect(context.getByRole("button", { name: label })).toHaveCount(0);
    }
    await expect(context).toContainText("唯讀脈絡");
  });

  test("resolution options describe their consequences and exclude unsupported actions", async ({ page }) => {
    await mockCases(page);
    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").click();

    await expect(page.getByTestId("report-resolution-unpublish_material")).toBeVisible();
    await expect(page.getByText("立即將教材下架")).toBeVisible();
    // users 沒有 status/suspension 欄位；不得出現一顆什麼都不會發生的按鈕
    await expect(page.getByText("停權")).toHaveCount(0);
  });

  /*
   * Legacy `reviewed`（舊版「標記已讀」的終態，資料庫中既有列，刻意不回填）。
   *
   * 要證明它在新的案件 UI 裡不是一個壞掉的 orphan：有中文標籤、進得去詳情、
   * 不會顯示任何按不動的動作按鈕。
   */
  test("legacy reviewed cases render as closed, not as broken rows", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    /*
     * mock 必須**依 `status` query 回應**。
     *
     * `/admin/reports` 的篩選完全在 API 端（頁面把 `status` 送給後端後只渲染回傳結果），
     * 所以一個不分 query 的 catch-all 會讓最後一步 `?status=open` 照樣拿到這筆 legacy 案件，
     * 那時 `toHaveCount(0)` 只有在斷言早於 fetch 解析時才會通過 —— 那是 race，不是驗證。
     */
    await page.route("**/api/backend/admin/report-cases**", (route) => {
      const status = new URL(route.request().url()).searchParams.get("status") ?? "";
      // legacy `reviewed` 屬於已結案，不在「未結案」(`open`) 的結果集裡
      if (status === "open") {
        return json(route, {
          items: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
          statusCounts: { pending: 0, investigating: 0, awaiting_creator: 0, resolved: 0, dismissed: 0, reviewed: 1 },
        });
      }
      return json(route, {
        items: [
          {
            id: "rep_legacy",
            material_id: "mat_1",
            material_title: "舊版已讀教材",
            creator_email: "creator@example.com",
            reporter_email: "reporter@example.com",
            reason: "舊資料",
            status: "reviewed",
            created_at: "2026-04-01T02:00:00.000Z",
            reviewed_at: "2026-04-02T02:00:00.000Z",
            event_count: 0,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { pending: 0, investigating: 0, awaiting_creator: 0, resolved: 0, dismissed: 0, reviewed: 1 },
      });
    });
    await page.route("**/api/backend/admin/report-cases/rep_legacy", (route) =>
      json(route, {
        report: {
          id: "rep_legacy",
          material_id: "mat_1",
          material_title: "舊版已讀教材",
          material_status: "published",
          creator_email: "creator@example.com",
          reporter_email: "reporter@example.com",
          reason: "舊資料",
          status: "reviewed",
          resolution: null,
          created_at: "2026-04-01T02:00:00.000Z",
          reviewed_at: "2026-04-02T02:00:00.000Z",
        },
        events: [],
        availableResolutions: ["dismissed", "warning", "request_changes", "unpublish_material"],
        // Backend 的 workflow 把 reviewed 視為終態
        allowedTransitions: [],
      })
    );

    // legacy 案件沒有專屬的 filter chip：它被歸在「已結案」內，在「全部」也看得到
    await page.goto("/admin/reports?status=all");
    const row = page.getByTestId("admin-report-row").first();
    // 顯示中文標籤，不是原始的 "reviewed"
    await expect(row).toContainText("舊版已處理");
    await expect(row).not.toContainText("reviewed");

    await page.getByTestId("report-case-open").click();
    const detail = page.getByTestId("report-case-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("舊版已處理");
    await expect(detail).toContainText("此案件已結案");

    // legacy 的「已結案」要說清楚它與新版 resolved 不同：沒有處置紀錄
    await expect(page.getByTestId("report-case-legacy-hint")).toContainText("舊版「標記已處理」");

    // 不得出現任何按不動的動作，也不得提供任何 legacy 重新處理入口
    await expect(page.getByTestId("report-investigate")).toHaveCount(0);
    await expect(page.getByTestId("report-request-response")).toHaveCount(0);
    await expect(page.getByTestId("report-resolve")).toHaveCount(0);
    await expect(page.getByTestId("report-admin-note")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "標記已處理" })).toHaveCount(0);

    // 待處理中看不到它 —— legacy 案件不是任何人的待辦
    await page.goto("/admin/reports?status=open");
    /*
     * 先等清單真的載完（空狀態出現），再斷言 0 筆。
     * 直接 `toHaveCount(0)` 會在 fetch 還沒解析、清單根本還沒渲染時就先行通過。
     */
    await expect(page.getByText("沒有符合條件的案件")).toBeVisible();
    await expect(page.getByTestId("admin-report-row")).toHaveCount(0);
  });

  /**
   * Dashboard 待辦與檢舉頁的 counts 必須是**同一個定義**。
   *
   * fixture 刻意用互不相同的數字，任何一項算錯都看得出來是哪一項：
   *   pending 2 / investigating 3 / awaiting_creator 4 / resolved 5 / dismissed 6 / reviewed 7
   *
   *   待我處理 = 2 + 3            = 5
   *   未結案   = 2 + 3 + 4        = 9
   *   已結案   = 5 + 6 + 7        = 18
   *   全部     = 9 + 18           = 27
   */
  test("counts: actionable / open / closed are consistent and exclude the creator's ball", async ({ page }) => {
    const listQueries: string[] = [];
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/report-cases**", (route) => {
      listQueries.push(new URL(route.request().url()).search);
      return json(route, {
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        statusCounts: {
          pending: 2,
          investigating: 3,
          awaiting_creator: 4,
          resolved: 5,
          dismissed: 6,
          reviewed: 7,
        },
      });
    });

    await page.goto("/admin/reports?status=open");

    // 第一層：未結案（不是「待處理中」——它包含等創作者的案件）
    await expect(page.getByTestId("filter-tab-open")).toContainText("未結案");
    await expect(page.getByTestId("filter-tab-open")).toContainText("9");
    await expect(page.getByTestId("filter-tab-closed")).toContainText("18");
    await expect(page.getByTestId("filter-tab-all")).toContainText("27");

    // 第二層：待我處理 = pending + investigating
    await expect(page.getByTestId("filter-subtab-actionable")).toContainText("待我處理");
    await expect(page.getByTestId("filter-subtab-actionable")).toContainText("5");
    await expect(page.getByTestId("filter-subtab-awaiting_creator")).toContainText("4");

    // 點「待我處理」→ API 只查 pending,investigating
    await page.getByTestId("filter-subtab-actionable").click();
    await expect(page).toHaveURL(/status=actionable/);
    await expect.poll(() => listQueries.at(-1)).toContain("status=pending%2Cinvestigating");

    // 等待創作者要看得到，並且明說不是我方待辦
    await page.getByTestId("filter-subtab-awaiting_creator").click();
    await expect(page.getByTestId("awaiting-creator-hint")).toContainText("等創作者回覆");
  });

  test("a case can be deep-linked with ?case=<id>", async ({ page }) => {
    await mockCases(page);
    // 直接開啟某一件案件（教材檢舉脈絡頁的「查看案件」就是連到這個形狀）
    await page.goto("/admin/reports?status=all&case=rep_1");

    await expect(page.getByTestId("report-case-detail")).toBeVisible();
    await expect(page.getByTestId("report-case-detail")).toContainText("注音符號練習本");

    // 關閉會把 case 從 URL 移除，但不影響篩選
    await page.getByRole("button", { name: "關閉" }).click();
    await expect(page).not.toHaveURL(/case=/);
    await expect(page).toHaveURL(/status=all/);

    // 開啟案件後換篩選：案件關閉，篩選生效（兩者不會互相覆蓋 URL）
    await page.getByTestId("report-case-open").first().click();
    await expect(page).toHaveURL(/case=rep_1/);
    await page.getByTestId("filter-tab-open").click();
    await expect(page).not.toHaveURL(/case=/);
  });

  test("admin note stays in the timeline without changing the status", async ({ page }) => {
    const posts = await mockCases(page);
    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").click();

    await page.getByTestId("report-admin-note").fill("已比對外部來源");
    await page.getByRole("button", { name: "新增筆記" }).click();

    await expect.poll(() => posts.at(-1)?.action).toBe("notes");
    await expect(page.getByTestId("report-case-detail")).toContainText("待處理");
    await expect(page.getByTestId("report-case-timeline")).toContainText("已比對外部來源");
  });

  /**
   * IA-03：檢舉案件詳情 → 被檢舉教材的活動時間軸。
   *
   * 這一頁原本只連得到「此教材的檢舉」（同一類事件），看不到教材本身的歷程 ——
   * 而判定一件檢舉要知道的正是後者：被退回過幾次、換過檔案沒有、是不是已經下架。
   */
  test("case detail leads to the reported material's activity timeline", async ({ page }) => {
    test.setTimeout(120_000);
    await mockCases(page);
    await page.route("**/api/backend/admin/materials/mat_1/activity-logs**", (route) =>
      json(route, {
        items: [
          {
            id: "a2",
            action: "material.changes_requested",
            actor_role: "admin",
            actor_id: "usr_admin",
            actor_email: "admin@example.com",
            target_type: "material",
            target_id: "mat_1",
            target_label: "注音符號練習本",
            meta: {
              oldStatus: "pending_review",
              newStatus: "changes_requested",
              reasonCode: "file_problem",
            },
            created_at: "2026-08-19T02:00:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
    );

    await page.goto("/admin/reports");
    await page.getByTestId("report-case-open").click();

    const link = page.getByTestId("report-case-material-activity-link");
    await expect(link).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(/\/admin\/materials\/mat_1\/activity-logs/, { timeout: 60_000 });
    const row = page.getByTestId("activity-log-row").first();
    await expect(row).toContainText("退回了教材");
    const meta = row.getByTestId("activity-log-meta");
    await expect(meta).toContainText("狀態變更：待審核 → 等待創作者");
    await expect(meta).toContainText("退回原因：教材檔案有問題或無法使用");
  });
});

/**
 * 教材檢舉脈絡頁（contextual read-only）。
 *
 * 這一頁是 legacy `reviewed` 在正式產品 UI 中的**最後一個 writer**，本輪已移除。
 * 它現在只回答「這份教材被檢舉過什麼」，所有處置一律回 `/admin/reports`。
 */
test.describe("Material reports contextual page", () => {
  const MATERIAL_ID = "mat_ctx_1";

  async function mockMaterialReports(page: Page, items: unknown[]) {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route(`**/api/backend/admin/materials/${MATERIAL_ID}/reports**`, (route) =>
      json(route, items)
    );
  }

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("shows the material's cases and links to the real case queue — no disposition here", async ({ page }) => {
    await mockMaterialReports(page, [
      {
        id: "rep_ctx_open",
        material_id: MATERIAL_ID,
        status: "pending",
        reason: "圖片疑似侵權",
        created_at: "2026-08-20T02:00:00.000Z",
      },
    ]);
    await page.goto(`/admin/materials/${MATERIAL_ID}/reports`);

    const row = page.getByTestId("material-report-row").first();
    await expect(row).toContainText("圖片疑似侵權");
    await expect(row).toContainText("待處理");

    // legacy writer 已移除
    await expect(page.getByRole("button", { name: "標記已處理" })).toHaveCount(0);
    // 也不得複製一套新版 workflow 到這一頁
    await expect(page.getByTestId("report-investigate")).toHaveCount(0);
    await expect(page.getByTestId("report-resolve")).toHaveCount(0);

    // 處置一律回正式案件佇列，而且直接深連到該案件
    const cta = page.getByTestId("material-report-open-case").first();
    await expect(cta).toContainText("查看案件");
    await expect(cta).toHaveAttribute("href", /\/admin\/reports\?status=all&case=rep_ctx_open/);
  });

  /**
   * `IA-01`：同一個 `MaterialFeedbackContext` 也出現在教材的檢舉脈絡頁。
   *
   * 這裡的重點是**不會跨教材混在一起** —— 別的教材有回饋不代表這一頁該顯示，
   * 這正是 `/admin/reviews-hub` 那種全平台 feed 做不到的事。
   */
  test("material context shows only this material's teaching feedback, read-only", async ({ page }) => {
    await mockMaterialReports(page, []);
    await page.route(`**/api/backend/materials/${MATERIAL_ID}/rating`, (route) =>
      json(route, { average: 2.0, count: 2 })
    );
    await page.route(`**/api/backend/materials/${MATERIAL_ID}/reviews`, (route) =>
      json(route, [
        { id: "rev_ctx_1", rating: 1, comment: "內容與描述不符", created_at: "2026-08-20T03:00:00.000Z", parent_id: "usr_p9" },
        { id: "rev_ctx_2", rating: 3, comment: "普通", created_at: "2026-08-18T03:00:00.000Z", parent_id: "usr_p8" },
      ])
    );
    // 另一份教材的回饋 —— 如果元件抓錯 id，這段文字就會出現在畫面上
    await page.route("**/api/backend/materials/mat_other/reviews", (route) =>
      json(route, [
        { id: "rev_other", rating: 5, comment: "這是另一份教材的回饋", created_at: "2026-08-21T03:00:00.000Z", parent_id: "usr_p7" },
      ])
    );

    await page.goto(`/admin/materials/${MATERIAL_ID}/reports`);

    const context = page.getByTestId("material-feedback-context");
    await expect(context).toHaveAttribute("data-material-id", MATERIAL_ID);
    await expect(page.getByTestId("material-feedback-summary")).toContainText("平均 2.0 分・2 則・其中 1 則 2 星以下");
    await expect(context).toContainText("內容與描述不符");
    await expect(context).not.toContainText("這是另一份教材的回饋");
    await expect(context.getByRole("button")).toHaveCount(0);
  });

  test("legacy reviewed cases are shown as legacy, not as a normal resolution", async ({ page }) => {
    await mockMaterialReports(page, [
      {
        id: "rep_ctx_legacy",
        material_id: MATERIAL_ID,
        status: "reviewed",
        reason: "舊案件",
        created_at: "2026-04-19T02:00:00.000Z",
      },
    ]);
    await page.goto(`/admin/materials/${MATERIAL_ID}/reports`);

    const row = page.getByTestId("material-report-row").first();
    await expect(row).toContainText("舊版已處理");
    await expect(row).not.toContainText("reviewed");
    await expect(page.getByTestId("material-report-legacy-hint")).toContainText("沒有新版案件的處置紀錄");
    await expect(page.getByRole("button", { name: "標記已處理" })).toHaveCount(0);
  });
});

test.describe("Admin activity log", () => {
  async function mockLogs(page: Page) {
    const queries: string[] = [];
    /*
     * Playwright 的 route 是 **LIFO**：最後註冊的 handler 先比對。
     * 因此 catch-all 必須**先**註冊，越specific 的越晚註冊，否則它會蓋掉所有精細的 mock。
     */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/activity-logs**", (route) => {
      const url = new URL(route.request().url());
      queries.push(url.search);
      return json(route, {
        items: [
          {
            id: "1",
            action: "payment_proof.approved",
            actor_role: "admin",
            actor_id: "usr_admin",
            actor_email: "admin@example.com",
            target_type: "order",
            target_id: "ord_260822_001",
            target_label: "ord_260822_001",
            meta: { proofId: "prf_1" },
            created_at: "2026-08-22T03:32:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });
    await page.route("**/api/backend/admin/activity-logs/filters", (route) =>
      json(route, {
        actions: [
          { action: "payment_proof.approved", count: 12 },
          { action: "material.published", count: 5 },
          { action: "cart.added", count: 9 },
          { action: "download.denied", count: 2 },
          { action: "review_created", count: 4 },
          // catalog 沒有登記的新 action：不得裸露 code
          { action: "some.future_action", count: 1 },
        ],
        actorRoles: [
          { actor_role: "admin", count: 12 },
          { actor_role: "parent", count: 3 },
        ],
      })
    );
    return queries;
  }

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("rows read as sentences, not as raw identifiers", async ({ page }) => {
    await mockLogs(page);
    await page.goto("/admin/activity-logs");

    const row = page.getByTestId("activity-log-row").first();
    await expect(row).toContainText("管理員 admin@example.com核准了付款");
    await expect(row).toContainText("訂單：ord_260822_001");
    // technical metadata 預設收起 —— 稽核資訊沒有被刪除，只是不再最顯眼
    await expect(page.getByTestId("activity-log-details")).toHaveCount(0);
    await page.getByTestId("activity-log-details-toggle").click();
    const details = page.getByTestId("activity-log-details");
    await expect(details).toContainText("payment_proof.approved");
    await expect(details).toContainText("actor_id");
    await expect(details).toContainText("proofId");
  });

  test("primary search is free text, not an actor-id field", async ({ page }) => {
    const queries = await mockLogs(page);
    await page.goto("/admin/activity-logs");

    // 舊版把四個技術欄位當主要入口；它們不該再是主要搜尋面
    await expect(page.getByLabel("Actor ID")).toHaveCount(0);
    await expect(page.getByLabel("Target ID")).toHaveCount(0);

    await page.getByTestId("toolbar-search-input").fill("buyer@example.com");
    await page.getByTestId("toolbar-search-submit").click();
    await expect.poll(() => queries.at(-1)).toContain("q=buyer%40example.com");
    await expect(page).toHaveURL(/q=buyer/);
  });

  test("action and actor-role dropdowns come from the API, and dates filter", async ({ page }) => {
    const queries = await mockLogs(page);
    await page.goto("/admin/activity-logs");

    const actionFilter = page.getByTestId("activity-action-filter");
    // 選項依分類收在 optgroup 下，文案是短標籤而不是 action code；順序依 ACTION_GROUP_ORDER
    await expect(actionFilter.locator("option")).toContainText([
      "全部",
      "核准付款（12）",
      "上架教材（5）",
      "留下教學回饋（4）",
      "下載遭拒（2）",
      "加入購物車（9）",
      "其他（some.future_action）（1）",
    ]);
    await expect(
      actionFilter.locator('optgroup[label="付款"] option[value="payment_proof.approved"]')
    ).toHaveCount(1);
    await expect(actionFilter.locator('optgroup[label="其他"] option[value="some.future_action"]')).toHaveCount(1);
    // 角色顯示為中文，不出現 admin / parent 字面值
    await expect(page.getByTestId("activity-actor-role-filter").locator("option")).toContainText([
      "全部",
      "管理員（12）",
      "購買者（3）",
    ]);

    await actionFilter.selectOption("material.published");
    await expect.poll(() => queries.at(-1)).toContain("action=material.published");

    await page.getByTestId("activity-from").fill("2026-08-01");
    await expect.poll(() => queries.at(-1)).toContain("from=2026-08-01");
  });
});


/* ------------------------------------------------------------------------- *
 * IA-02 / IA-03
 * ------------------------------------------------------------------------- */

/**
 * `activity_logs.meta` 的人話化 fixture（IA-02）。
 *
 * 每一列都在鎖一件**具體**的事，不是「隨便給點資料看畫面會不會動」：
 *
 *   1 `rejectionReason`  code → 中文（跨 action 唯一的 key）
 *   2 `from` / `to`      案件狀態轉移合成一句，且 `to` 在這裡是狀態**不是** email
 *   3 `reason`           在 `download.denied` 下是失敗碼 → 中文
 *   4 `reason`           在 `report_created` 下是檢舉人自由輸入的文字 → 原樣
 *   5 `to` / `type`      在 `order_email_*` 下是收件者與信件種類 → **不得**被讀成狀態
 *   6 未登記的 action ＋ 未登記的 meta key → 不進第二層，但**必須**留在第三層
 *   7 `meta: null`
 *   8 `meta: {}`
 *
 * 第 2/3 對第 4/5 是這份 fixture 的重點：同一個 key 在不同 action 下語意不同，
 * 一份只看 key 的 formatter 會在這裡開始說謊。
 */
const META_FIXTURES = [
  {
    id: "m1",
    action: "payment_proof.rejected",
    actor_role: "admin",
    actor_id: "usr_admin",
    actor_email: "admin@example.com",
    target_type: "order",
    target_id: "ord_1",
    target_label: "ord_1",
    meta: { proofId: "prf_9", rejectionReason: "amount_mismatch" },
    created_at: "2026-08-22T03:00:00.000Z",
  },
  {
    id: "m2",
    action: "report.resolved",
    actor_role: "admin",
    actor_id: "usr_admin",
    actor_email: "admin@example.com",
    target_type: "report",
    target_id: "rep_1",
    target_label: "被檢舉的教材",
    meta: { from: "investigating", to: "resolved", resolution: "unpublish_material", materialUnpublished: true },
    created_at: "2026-08-22T02:00:00.000Z",
  },
  {
    id: "m3",
    action: "download.denied",
    actor_role: "parent",
    actor_id: "usr_buyer",
    actor_email: "buyer@example.com",
    target_type: "material",
    target_id: "mat_1",
    target_label: "示範教材",
    meta: { reason: "not_entitled" },
    created_at: "2026-08-22T01:00:00.000Z",
  },
  {
    id: "m4",
    action: "report_created",
    actor_role: "buyer",
    actor_id: "usr_buyer2",
    actor_email: "buyer2@example.com",
    target_type: "material",
    target_id: "mat_1",
    target_label: "示範教材",
    meta: { reason: "投影片第 12 頁抄襲" },
    created_at: "2026-08-22T00:30:00.000Z",
  },
  {
    id: "m5",
    action: "order_email_failed",
    actor_role: null,
    actor_id: null,
    actor_email: null,
    target_type: "order",
    target_id: "ord_2",
    target_label: "ord_2",
    meta: { type: "order_created", to: "buyer@example.com", error: "SMTP timeout" },
    created_at: "2026-08-22T00:20:00.000Z",
  },
  {
    id: "m6",
    action: "some.future_action",
    actor_role: "admin",
    actor_id: "usr_admin",
    actor_email: "admin@example.com",
    target_type: "material",
    target_id: "mat_1",
    target_label: "示範教材",
    meta: { brandNewKey: "brand-new-value", proofId: "prf_x" },
    created_at: "2026-08-22T00:10:00.000Z",
  },
  {
    id: "m7",
    action: "material.published",
    actor_role: "admin",
    actor_id: "usr_admin",
    actor_email: "admin@example.com",
    target_type: "material",
    target_id: "mat_1",
    target_label: "示範教材",
    meta: null,
    created_at: "2026-08-22T00:05:00.000Z",
  },
  {
    id: "m8",
    action: "material.resubmitted",
    actor_role: "teacher",
    actor_id: "usr_creator",
    actor_email: "creator@example.com",
    target_type: "material",
    target_id: "mat_1",
    target_label: "示範教材",
    meta: {},
    created_at: "2026-08-22T00:01:00.000Z",
  },
] as const;

test.describe("Admin activity log meta humanization", () => {
  async function mockMetaLogs(page: Page) {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/activity-logs**", (route) =>
      json(route, {
        items: META_FIXTURES,
        pagination: { page: 1, limit: 20, total: META_FIXTURES.length, totalPages: 1 },
      })
    );
    await page.route("**/api/backend/admin/activity-logs/filters", (route) =>
      json(route, { actions: [], actorRoles: [] })
    );
    /*
     * 單筆詳情**必須**晚於清單註冊：Playwright 的 route 是 LIFO，
     * `admin/activity-logs**` 也會吃到 `admin/activity-logs/m2`。
     */
    await page.route("**/api/backend/admin/activity-logs/m2", (route) =>
      json(route, META_FIXTURES.find((row) => row.id === "m2"))
    );
  }

  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("meta is read as sentences, and the same key is not read the same way across actions", async ({
    page,
  }) => {
    await mockMetaLogs(page);
    await page.goto("/admin/activity-logs");

    const rows = page.getByTestId("activity-log-row");
    await expect(rows).toHaveCount(META_FIXTURES.length);

    await test.step("code 欄位轉成中文，不要求 Admin 認得代碼", async () => {
      const meta = rows.nth(0).getByTestId("activity-log-meta");
      await expect(meta).toContainText("退回原因：金額不符");
      await expect(meta).not.toContainText("amount_mismatch");
    });

    await test.step("狀態轉移合成一句，不是兩個裸欄位", async () => {
      const meta = rows.nth(1).getByTestId("activity-log-meta");
      await expect(meta).toContainText("案件狀態變更：調查中 → 已處理");
      await expect(meta).toContainText("最終處置：下架教材");
      await expect(meta).toContainText("教材是否被下架：是");
      await expect(meta).not.toContainText("investigating");
      await expect(meta).not.toContainText("unpublish_material");
    });

    await test.step("`reason` 在 download.denied 下是失敗碼", async () => {
      const meta = rows.nth(2).getByTestId("activity-log-meta");
      await expect(meta).toContainText("拒絕原因：沒有已核准的訂單");
      await expect(meta).not.toContainText("not_entitled");
    });

    await test.step("`reason` 在 report_created 下是檢舉人打的字，原樣呈現", async () => {
      const meta = rows.nth(3).getByTestId("activity-log-meta");
      await expect(meta).toContainText("檢舉理由：投影片第 12 頁抄襲");
    });

    await test.step("`to` 在 order_email_* 下是收件者，不得被讀成案件狀態", async () => {
      const meta = rows.nth(4).getByTestId("activity-log-meta");
      await expect(meta).toContainText("收件者：buyer@example.com");
      await expect(meta).toContainText("信件類型：訂單成立通知");
      await expect(meta).toContainText("錯誤訊息：SMTP timeout");
      // 這一行是這支測試真正的價值：`to` 是 email，不是狀態轉移的目標
      await expect(meta).not.toContainText("案件狀態變更");
    });
  });

  test("unknown action and unknown meta keys are never silently dropped", async ({ page }) => {
    await mockMetaLogs(page);
    await page.goto("/admin/activity-logs");

    const row = page.getByTestId("activity-log-row").nth(5);

    // catalog 沒登記 → 顯示「其他（原始 code）」，不裸露 code，也不編造中文
    await expect(row).toContainText("其他（some.future_action）");
    // 未登記的 key 不進第二層 —— 第二層只放「確實看得懂」的東西
    await expect(row.getByTestId("activity-log-meta")).toHaveCount(0);

    // …但**必須**留在第三層。人話化是加一層解讀，不是取代稽核軌跡。
    await row.getByTestId("activity-log-details-toggle").click();
    const details = row.getByTestId("activity-log-details");
    await expect(details).toContainText("brandNewKey");
    await expect(details).toContainText("brand-new-value");
    await expect(details).toContainText("some.future_action");
  });

  test("null / empty meta renders without a stray empty section", async ({ page }) => {
    await mockMetaLogs(page);
    await page.goto("/admin/activity-logs");

    const rows = page.getByTestId("activity-log-row");

    for (const index of [6, 7]) {
      const row = rows.nth(index);
      await expect(row).toBeVisible();
      // 空的「詳細內容」標題會讓人以為資料掉了；沒有可說的就不要開一個區塊
      await expect(row.getByTestId("activity-log-meta")).toHaveCount(0);
      await row.getByTestId("activity-log-details-toggle").click();
      await expect(row.getByTestId("activity-log-details")).toContainText("meta");
    }

    await expect(rows.nth(6)).toContainText("上架了教材");
    await expect(rows.nth(7)).toContainText("重新送審了教材");
  });

  test("the single-record page uses the same three layers, not a raw payload dump", async ({ page }) => {
    await mockMetaLogs(page);
    await page.goto("/admin/activity-logs/m2");

    const row = page.getByTestId("activity-log-row");
    await expect(row).toBeVisible();

    // 第一層：人話句子。raw action code 不得是主要描述
    await expect(row).toContainText("管理員 admin@example.com完成了檢舉案件的處置");
    await expect(row).toContainText("檢舉：被檢舉的教材");
    // 第二層：meta 人話版
    await expect(row.getByTestId("activity-log-meta")).toContainText("案件狀態變更：調查中 → 已處理");

    // 第三層預設收合；raw actor_role（`admin` 字面值）不得出現在第一／二層
    await expect(row.getByTestId("activity-log-details")).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("report.resolved");

    await row.getByTestId("activity-log-details-toggle").click();
    const details = row.getByTestId("activity-log-details");
    await expect(details).toContainText("report.resolved");
    await expect(details).toContainText("actor_role");
    await expect(details).toContainText("investigating");
  });

  test("entity timelines read the same way as the global list", async ({ page }) => {
    test.setTimeout(120_000);
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    // scoped 路由與全站列表共用同一個 service，因此形狀相同
    await page.route("**/api/backend/admin/materials/mat_1/activity-logs**", (route) =>
      json(route, {
        items: [META_FIXTURES[2], META_FIXTURES[5]],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      })
    );
    await page.route("**/api/backend/admin/orders/ord_1/activity-logs**", (route) =>
      json(route, {
        items: [META_FIXTURES[0]],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
    );

    await test.step("教材時間軸", async () => {
      await page.goto("/admin/materials/mat_1/activity-logs");
      const rows = page.getByTestId("activity-log-row");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toContainText("購買者 buyer@example.com被拒絕下載教材");
      await expect(rows.nth(0).getByTestId("activity-log-meta")).toContainText("拒絕原因");
      // 修正前這一頁的標題是 raw action、下面接「角色：parent」
      const main = page.getByRole("main");
      await expect(main).not.toContainText("download.denied");
      await expect(main).not.toContainText("角色：parent");
    });

    await test.step("訂單時間軸", async () => {
      await page.goto("/admin/orders/ord_1/activity-logs");
      const row = page.getByTestId("activity-log-row").first();
      await expect(row).toContainText("管理員 admin@example.com退回了付款憑證");
      await expect(row.getByTestId("activity-log-meta")).toContainText("退回原因：金額不符");
      await expect(page.getByRole("main")).not.toContainText("角色：admin");
    });
  });
});

test.describe("Creator platform cases", () => {
  test("creator sees the request, replies, and never sees the reporter", async ({ page }) => {
    await signInAs(page, "teacher", { email: "creator-e2e@example.com" });

    const posts: unknown[] = [];
    let responded = false;

    /*
     * Playwright 的 route 是 **LIFO**：最後註冊的 handler 先比對。
     * 因此 catch-all 必須**先**註冊，越specific 的越晚註冊，否則它會蓋掉所有精細的 mock。
     */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));

    await page.route("**/api/backend/creator/cases**", (route) =>
      json(route, {
        items: [
          {
            id: "rep_1",
            material_id: "mat_1",
            material_title: "注音符號練習本",
            material_status: "published",
            status: responded ? "investigating" : "awaiting_creator",
            created_at: "2026-08-20T02:00:00.000Z",
            latest_request_message: "請說明第 3 頁圖片來源",
            latest_request_at: "2026-08-21T01:00:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        actionRequiredCount: responded ? 0 : 1,
      })
    );
    await page.route("**/api/backend/creator/cases/rep_1", (route) =>
      json(route, {
        case: {
          id: "rep_1",
          material_id: "mat_1",
          material_title: "注音符號練習本",
          material_status: "published",
          status: responded ? "investigating" : "awaiting_creator",
          created_at: "2026-08-20T02:00:00.000Z",
        },
        events: [
          {
            id: "e1",
            report_id: "rep_1",
            actor_role: "admin",
            event_type: "creator_response_requested",
            message: "請說明第 3 頁圖片來源",
            created_at: "2026-08-21T01:00:00.000Z",
          },
        ],
        canRespond: !responded,
      })
    );
    await page.route("**/api/backend/creator/cases/rep_1/respond", (route) => {
      posts.push(route.request().postDataJSON());
      responded = true;
      return json(route, { ok: true });
    });

    await page.goto("/creator/cases");
    await expect(page.getByTestId("filter-tab-action_required")).toContainText("1");
    const row = page.getByTestId("creator-case-row").first();
    await expect(row).toContainText("請說明第 3 頁圖片來源");
    // 創作者不需要（也不應該）知道是誰檢舉的
    await expect(page.getByText("檢舉人")).toHaveCount(0);

    await page.getByTestId("creator-case-open").click();
    await page.getByTestId("creator-case-reply").fill("圖片為自製，已附授權");
    await page.getByTestId("creator-case-submit").click();

    await expect.poll(() => posts.at(-1)).toMatchObject({ message: "圖片為自製，已附授權" });
    await expect(page.getByTestId("creator-case-detail")).toContainText("此案件目前不需要你回覆");
  });
});
