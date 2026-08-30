import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 教材上架審核閉環（Material Review MVP Phase 1）。
 *
 *   Creator 送出 → Admin 審核 → 核准／退回 → Creator 看得到原因 → 修改 → 重新送審
 *
 * 這裡鎖的是**產品行為**，不是樣式：
 *   - Admin 能打開完整教材內容並做出決定
 *   - 退回必須有原因與足夠長度的說明
 *   - 決定完成後畫面**不自動跳走**，而是顯示結果並提供「下一筆待審」
 *   - Creator 看得到退回原因，且重新送審是**明確的動作**（不會被一般儲存偷偷觸發）
 *   - `changes_requested` 不算 Admin 待辦
 *   - 幽靈狀態 `draft` 不再出現
 *
 *   - Admin 能看到待審的教材本體檔案並實際下載審閱
 *   - 沒有教材檔案的 legacy 教材必須明說不該核准，而不是靜靜地看起來正常
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

const PENDING_MATERIAL = {
  id: "mat_review_1",
  title: "注音配對練習組",
  status: "pending_review",
  price: 350,
  teacher_id: "usr_creator",
  creator_email: "creator@example.com",
  open_report_count: 0,
  created_at: "2026-08-20T02:00:00.000Z",
  updated_at: "2026-08-20T02:00:00.000Z",
  material_features: ["PDF教材", "配對遊戲"],
};

const SECOND_PENDING = {
  ...PENDING_MATERIAL,
  id: "mat_review_2",
  title: "數字排序卡",
};

/** `GET /materials/:id` 的完整內容（admin 可讀所有狀態）。 */
function materialDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...PENDING_MATERIAL,
    description: "適合幼兒園大班的注音配對教材。",
    short_description: "注音配對，10 分鐘上手",
    teaching_objective: "認識注音符號並能配對",
    teaching_methods: ["配對遊戲"],
    usage_duration: "20 分鐘",
    activity_steps: "1. 發下卡片\n2. 進行配對\n3. 檢核",
    extension_value: "可延伸至詞彙練習",
    age_range: "5-6 歲",
    category: "語文",
    cover_image_url: "https://example.com/cover.png",
    demo_video_url: null,
    material_file: {
      approvedFile: null,
      pendingFile: {
        id: "mf_pending_1",
        originalFilename: "注音配對練習組.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2_400_000,
        status: "candidate",
      },
    },
    ip_declaration_accepted: true,
    ip_declaration_at: "2026-08-20T01:59:00.000Z",
    published_at: null,
    review_reason_code: null,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    contents: [{ type: "PDF", name: "主教材", count: 1, description: "20 頁" }],
    detail_images: [{ image_url: "https://example.com/detail-1.png", alt_text: "內頁", sort_order: 0 }],
    ...overrides,
  };
}

type AdminMocks = {
  posts: Array<{ url: string; body: unknown }>;
  setStatus: (status: string) => void;
};

async function mockAdminReview(page: Page, opts: { items?: unknown[] } = {}): Promise<AdminMocks> {
  const posts: Array<{ url: string; body: unknown }> = [];
  const items = opts.items ?? [PENDING_MATERIAL];
  /* 詳情 API 的狀態要跟佇列第一筆一致，否則面板會顯示與清單不同的狀態。 */
  const state = { status: String((items[0] as { status?: string })?.status ?? "pending_review") };

  /* Playwright 的 route 是 LIFO：catch-all 先註冊，越 specific 越晚註冊。 */
  await page.route("**/api/backend/**", (route) => json(route, { items: [] }));

  await page.route("**/api/backend/admin/materials**", (route) => {
    const url = new URL(route.request().url());
    if (/\/admin\/materials\/[^/]+\/(approve|request-changes)$/.test(url.pathname)) {
      const body = route.request().postDataJSON();
      posts.push({ url: url.pathname, body });
      state.status = url.pathname.endsWith("/approve") ? "published" : "changes_requested";
      return json(route, {
        material: materialDetail({
          status: state.status,
          published_at: state.status === "published" ? "2026-08-23T02:00:00.000Z" : null,
          review_reason_code: state.status === "changes_requested" ? body?.reasonCode : null,
          review_note: state.status === "changes_requested" ? body?.note : null,
        }),
        ...(state.status === "published" ? { firstPublish: true } : {}),
      });
    }
    if (url.pathname.endsWith("/activity-logs")) {
      return json(route, {
        items: [
          {
            id: "log_1",
            action: "material.created",
            actor_role: "teacher",
            actor_email: "creator@example.com",
            target_type: "material",
            target_id: PENDING_MATERIAL.id,
            created_at: "2026-08-20T02:00:00.000Z",
            meta: { status: "pending_review" },
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    }
    const status = url.searchParams.get("status");
    const visible = status ? (items as Array<{ status: string }>).filter((m) => m.status === status) : items;
    return json(route, {
      items: visible,
      pagination: { page: 1, limit: 20, total: visible.length, totalPages: 1 },
      statusCounts: { total: 12, pending_review: 2, changes_requested: 3, published: 6, unpublished: 1 },
    });
  });

  /* 詳情要依 id 回對應的教材，否則點「下一筆」時面板會顯示上一筆的內容。 */
  await page.route("**/api/backend/materials/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const found = (items as Array<{ id: string; title: string; status: string }>).find((m) => m.id === id);
    const isFirst = !found || found.id === (items[0] as { id: string }).id;
    return json(
      route,
      materialDetail({
        ...(found ?? {}),
        // 只有目前操作中的那一筆會跟著 state 走；其餘維持自己的狀態
        status: isFirst ? state.status : (found?.status ?? "pending_review"),
      })
    );
  });

  return { posts, setStatus: (status: string) => (state.status = status) };
}

test.describe("Admin material review", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
  });

  test("opens the full material next to the queue", async ({ page }) => {
    await mockAdminReview(page);
    await page.goto("/admin/materials");

    await page.getByTestId("material-review-open").first().click();
    const panel = page.getByTestId("material-review-panel");
    await expect(panel).toBeVisible();

    // 審核需要的內容都在同一個畫面上
    await expect(panel).toContainText("注音配對練習組");
    await expect(panel).toContainText("creator@example.com");
    await expect(panel).toContainText("認識注音符號並能配對");
    await expect(panel).toContainText("主教材");
    await expect(panel).toContainText("配對遊戲");
    await expect(page.getByTestId("material-review-cover")).toBeVisible();

    // 教材檔案可以實際下載審閱 —— 沒有它，「審核」就只是核對表單
    const pendingFile = page.getByTestId("material-review-file-pending");
    await expect(pendingFile).toBeVisible();
    await expect(pendingFile).toContainText("注音配對練習組.pdf");
    await expect(pendingFile).toContainText("2.3 MB");
    await expect(page.getByTestId("material-review-file-download-pending")).toBeVisible();
    // 還沒核准，所以沒有「目前交付中」的檔案。
    await expect(page.getByTestId("material-review-file-approved")).toHaveCount(0);

    // 技術欄位預設收合
    await expect(panel).not.toContainText("teacher_id：");
    await page.getByTestId("material-technical-toggle").click();
    await expect(panel).toContainText("teacher_id：");

    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      const list = page.getByTestId("review-workspace-list");
      const detail = page.getByTestId("review-workspace-detail");
      await expect(list).toBeVisible();
      const listBox = await list.boundingBox();
      const detailBox = await detail.boundingBox();
      expect(detailBox!.x).toBeGreaterThan(listBox!.x);
      // 固定高度工作區：左右兩欄視覺高度一致
      expect(Math.abs(detailBox!.height - listBox!.height)).toBeLessThan(8);
    } else {
      await expect(page.getByTestId("review-workspace-list")).toBeHidden();
      await page.getByTestId("review-workspace-back").click();
      await expect(page.getByTestId("review-workspace-list")).toBeVisible();
    }
  });

  test("approve publishes and shows the result without jumping away", async ({ page }) => {
    const mocks = await mockAdminReview(page, { items: [PENDING_MATERIAL, SECOND_PENDING] });
    await page.goto("/admin/materials");
    await page.getByTestId("material-review-open").first().click();

    await page.getByTestId("material-approve").click();

    await expect.poll(() => mocks.posts.at(-1)?.url).toContain("/approve");
    // 結果留在畫面上；**不自動跳下一筆**
    await expect(page.getByTestId("material-review-result")).toContainText("已核准上架");
    await expect(page.getByTestId("material-review-panel")).toContainText("注音配對練習組");
    // 由 Admin 自己決定何時前進
    await expect(page.getByTestId("material-review-next")).toBeVisible();
    await page.getByTestId("material-review-next").click();
    await expect(page.getByTestId("material-review-panel")).toContainText("數字排序卡");
  });

  test("request changes requires a reason and a long enough note", async ({ page }) => {
    const mocks = await mockAdminReview(page);
    await page.goto("/admin/materials");
    await page.getByTestId("material-review-open").first().click();

    await page.getByTestId("material-request-changes-open").click();
    // 說明太短 → 前端就擋下，不送出必敗的請求
    await page.getByTestId("material-reason-note").fill("太短");
    const before = mocks.posts.length;
    await page.getByTestId("material-request-changes-confirm").click();
    await expect(page.getByTestId("material-review-message")).toContainText("至少 10");
    expect(mocks.posts.length).toBe(before);

    await page.getByTestId("material-reason-select").selectOption("media_quality");
    await page.getByTestId("material-reason-note").fill("封面圖片解析度不足，請重新上傳清晰版本。");
    await page.getByTestId("material-request-changes-confirm").click();

    await expect.poll(() => mocks.posts.at(-1)?.body).toMatchObject({ reasonCode: "media_quality" });
    await expect(page.getByTestId("material-review-result")).toContainText("已退回修改");
  });

  test("published material offers no review action and points at the report flow", async ({ page }) => {
    await mockAdminReview(page, { items: [{ ...PENDING_MATERIAL, status: "published" }] });
    await page.goto("/admin/materials?status=published");

    await page.getByTestId("material-review-open").first().click();
    const decision = page.getByTestId("material-review-decision");
    await expect(decision).toContainText("沒有可執行的審核動作");
    await expect(decision).toContainText("檢舉");
    await expect(page.getByTestId("material-approve")).toHaveCount(0);
    await expect(page.getByTestId("material-request-changes-open")).toHaveCount(0);
  });

  test("queue refresh shows a last-updated stamp", async ({ page }) => {
    await mockAdminReview(page);
    await page.goto("/admin/materials");
    await expect(page.getByTestId("refresh-last-updated")).toContainText("最後更新");
    await page.getByTestId("refresh-button").click();
    await expect(page.getByTestId("refresh-last-updated")).toBeVisible();
  });
});

test.describe("Admin dashboard backlog excludes changes_requested", () => {
  test("待審核教材 counts only pending_review", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/admin/materials**", (route) =>
      json(route, {
        items: [],
        pagination: { page: 1, limit: 1, total: 12, totalPages: 12 },
        // 3 筆 changes_requested 是創作者的球，不是 Admin 的待辦
        statusCounts: { total: 12, pending_review: 2, changes_requested: 3, published: 6, unpublished: 1 },
      })
    );
    await page.route("**/api/backend/admin/dashboard/summary**", (route) =>
      json(route, {
        periodFrom: "2026-07-22",
        periodTo: "2026-08-20",
        periodTimezone: "Asia/Taipei",
        periodPreset: "30d",
        periodRevenueAmount: 0,
        newOrdersCount: 0,
        newUsersCount: 0,
        newMaterialsCount: 0,
        newReviewsCount: 0,
        previousPeriodFrom: "2026-06-22",
        previousPeriodTo: "2026-07-21",
        previousPeriodRevenueAmount: 0,
        previousNewOrdersCount: 0,
        previousNewUsersCount: 0,
        previousNewMaterialsCount: 0,
        previousNewReviewsCount: 0,
        revenueDeltaPercent: 0,
        newOrdersDeltaPercent: 0,
        newUsersDeltaPercent: 0,
        newMaterialsDeltaPercent: 0,
        newReviewsDeltaPercent: 0,
        materialsCount: 12,
        ordersCount: 0,
        revenueAmount: 0,
        reviewsCount: 0,
        usersCount: 0,
        pendingProofsCount: 0,
        pendingReportsCount: 0,
        wowReviewDeltaPercent: 0,
      })
    );

    await page.goto("/admin");
    const card = page.locator("article").filter({ hasText: "待審核教材" });
    await expect(card).toContainText("2");
    await expect(card).not.toContainText("5");
  });
});

test.describe("Creator material review UX", () => {
  const CHANGES_REQUESTED = {
    ...PENDING_MATERIAL,
    status: "changes_requested",
    review_reason_code: "incomplete_info",
    review_note: "活動步驟只寫了一句，請補充完整流程與所需時間。",
    reviewed_at: "2026-08-22T03:00:00.000Z",
    reviewed_by: "usr_admin_secret",
  };

  test("list shows the reason, the CTA, and no ghost draft filter", async ({ page }) => {
    await signInAs(page, "teacher", { email: "creator@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/auth/me", (route) =>
      json(route, { id: "usr_creator", email: "creator@example.com", role: "teacher" })
    );
    await page.route("**/api/backend/materials**", (route) =>
      json(route, { items: [CHANGES_REQUESTED] })
    );

    await page.goto("/creator/materials");

    const banner = page.getByTestId("creator-changes-requested");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("教材資訊不完整或不清楚");
    await expect(banner).toContainText("活動步驟只寫了一句");
    // 不得洩漏 admin 的內部識別碼
    await expect(banner).not.toContainText("usr_admin_secret");
    await expect(page.getByRole("link", { name: "修改教材" })).toBeVisible();

    // 幽靈狀態 draft 已移除
    await expect(page.getByRole("option", { name: "草稿" })).toHaveCount(0);
    await expect(page.getByText("需修改", { exact: true }).first()).toBeVisible();
  });

  test("edit page shows the reason and resubmit is an explicit action", async ({ page }) => {
    const posts: string[] = [];
    await signInAs(page, "teacher", { email: "creator@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/materials/*", (route) =>
      json(route, materialDetail(CHANGES_REQUESTED))
    );
    await page.route("**/api/backend/materials/*/resubmit", (route) => {
      posts.push(new URL(route.request().url()).pathname);
      return json(route, { material: materialDetail({ ...CHANGES_REQUESTED, status: "pending_review" }) });
    });

    await page.goto(`/creator/materials/${CHANGES_REQUESTED.id}/edit`);

    await expect(page.getByTestId("creator-edit-changes-requested")).toContainText(
      "教材資訊不完整或不清楚"
    );

    // 一般儲存不得偷偷送審
    await expect(page.getByTestId("creator-resubmit")).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存變更" })).toBeVisible();
    expect(posts.length).toBe(0);
  });
});
