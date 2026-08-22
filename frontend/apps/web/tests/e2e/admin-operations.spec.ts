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
          statusCounts: { total: 45, pending_review: 25, published: 18, unpublished: 2 },
        });
      }
      const total = status === "published" ? 18 : 45;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const count = Math.min(limit, Math.max(0, total - (pageNo - 1) * limit));
      return json(route, {
        items: materials(count, (pageNo - 1) * limit),
        pagination: { page: pageNo, limit, total, totalPages },
        statusCounts: { total: 45, pending_review: 25, published: 18, unpublished: 2 },
      });
    });
    return queries;
  }

  test("filter chips show whole-table counts and drive the API status param", async ({ page }) => {
    const queries = await mockMaterials(page);
    await page.goto("/admin/materials");

    const tabs = page.getByTestId("filter-tabs");
    await expect(tabs).toBeVisible();
    // 數字來自 statusCounts（全表），不是目前這一頁的 items.length
    await expect(page.getByTestId("filter-tab-pending_review")).toContainText("25");
    await expect(page.getByTestId("filter-tab-published")).toContainText("18");

    await page.getByTestId("filter-tab-published").click();
    await expect(page).toHaveURL(/status=published/);
    await expect.poll(() => queries.at(-1)).toContain("status=published");
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

    await page.getByTestId("filter-tab-published").click();
    // 停在第 3 頁換到只有 1 頁的狀態會拿到空清單，而畫面上什麼都不會說
    await expect(page).not.toHaveURL(/page=3/);
    await expect(page).toHaveURL(/status=published/);
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
    await page.goto("/admin/materials?status=published&limit=50");
    await expect.poll(() => queries.at(-1)).toContain("limit=50");

    await page.reload();
    await expect(page.getByTestId("filter-tab-published")).toHaveAttribute("aria-selected", "true");
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
        statusCounts: { total: 0, pending_review: 0, published: 0, unpublished: 0 },
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
        statusCounts: { total: 1, pending_review: 1, published: 0, unpublished: 0 },
      });
    });

    await page.goto("/admin/materials");
    await expect(page.getByText("載入失敗")).toBeVisible();
    await page.getByRole("alert").getByRole("button", { name: "重新整理" }).click();
    await expect(page.getByTestId("admin-material-row")).toHaveCount(1);
  });
});

test.describe("Admin payment review", () => {
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
    proof_url: "http://localhost:3000/uploads/payment-proofs/p1.jpg",
    original_filename: "transfer.jpg",
    proof_size_bytes: 12345,
    review_status: "pending",
    uploaded_at: "2026-08-21T02:00:00.000Z",
  };

  async function mockPayments(page: Page) {
    const calls: { list: string[]; posts: Array<{ url: string; body: unknown }> } = { list: [], posts: [] };

    /*
     * Playwright 的 route 是 **LIFO**：最後註冊的 handler 先比對。
     * 因此 catch-all 必須**先**註冊，越specific 的越晚註冊，否則它會蓋掉所有精細的 mock。
     */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));

    await page.route("**/api/backend/admin/payment-proofs**", (route) => {
      const url = new URL(route.request().url());
      calls.list.push(url.search);
      const q = url.searchParams.get("q");
      const items = !q || q === PROOF.order_id || q === PROOF.buyer_email ? [PROOF] : [];
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
      allowedTransitions: ["investigating", "awaiting_creator", "resolved", "dismissed", "reviewed"],
      events: [],
    };
    const posts: Array<{ action: string; body: unknown }> = [];

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

    await page.route("**/api/backend/admin/report-cases**", (route) =>
      json(route, {
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
        statusCounts: { pending: 1, investigating: 0, awaiting_creator: 0, resolved: 4, dismissed: 2 },
      })
    );
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
    return posts;
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
    await page.route("**/api/backend/admin/report-cases**", (route) =>
      json(route, {
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
      })
    );
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

    // 只有「全部」看得到 legacy 案件；它沒有專屬的 filter chip
    await page.goto("/admin/reports?status=all");
    const row = page.getByTestId("admin-report-row").first();
    // 顯示中文標籤，不是原始的 "reviewed"
    await expect(row).toContainText("已標記處理（舊版）");
    await expect(row).not.toContainText("reviewed");

    await page.getByTestId("report-case-open").click();
    const detail = page.getByTestId("report-case-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("已標記處理（舊版）");
    await expect(detail).toContainText("此案件已結案");

    // 不得出現任何按不動的動作
    await expect(page.getByTestId("report-investigate")).toHaveCount(0);
    await expect(page.getByTestId("report-request-response")).toHaveCount(0);
    await expect(page.getByTestId("report-resolve")).toHaveCount(0);
    await expect(page.getByTestId("report-admin-note")).toHaveCount(0);
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
    await expect(actionFilter.locator("option")).toContainText(["全部", "核准了付款（12）"]);
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
