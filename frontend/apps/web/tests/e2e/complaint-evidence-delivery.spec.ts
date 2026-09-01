import { expect, test, type Page, type Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * 申訴證據的讀取／交付 —— `P1-09` Gate 4（`N3` / `R7`），Wave 2 #13。
 *
 * ## 這一支鎖的是什麼
 *
 * Wave 2 #13 之前，兩邊的 UI 都把附件渲染成**純文字** `📎 檔名` ——
 * 證據傳得上去，但買家與 Admin 都打不開。對付款爭議而言那等於沒有證據。
 *
 * 這裡鎖的是「UI 真的把位元組取回來，而且走的是**帶 Authorization 的受保護路徑**」：
 *
 *   1. 有附件 → 出現「查看 / 下載」，且點下去確實對受保護路徑發出請求。
 *   2. **token 不得出現在 URL** —— 必須是 header（`<img src>` 不會帶 header，
 *      所以一定得走 blob fetch，見 `lib/complaint-evidence.ts`）。
 *   3. 純文字外部參照**不顯示**必定失敗的「查看 / 下載」。
 *   4. Buyer 與 Admin 打**各自的** scope 路徑，不共用一條。
 *   5. 錯誤（403/409/503）呈現為訊息，不是空白或壞掉的圖。
 *
 * backend 的授權、IDOR 綁定與 header 由
 * `Backend/tests/complaintEvidenceDelivery.db.test.js` 與 HTTP 全鏈驗證覆蓋，此處不重測。
 */

const COMPLAINT_ID = "cc_ev_001";

type Handlers = Record<string, (route: Route) => Promise<unknown> | unknown>;

async function mockApi(page: Page, handlers: Handlers) {
  await page.route("**/api/backend/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const bare = url.pathname.replace(/^\/api\/backend\//, "");
    const withQuery = bare + (url.search || "");
    const handler =
      handlers[`${request.method()} ${withQuery}`] ?? handlers[`${request.method()} ${bare}`];
    if (handler) return handler(route);
    return route.fulfill({
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ message: `unmocked: ${request.method()} ${bare}` }),
    });
  });
}

const json = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });

/** 1×1 PNG，與 backend 允許的型別一致。 */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

const COMPLAINT = {
  id: COMPLAINT_ID,
  buyer_id: "usr_parent_e2e",
  order_id: null,
  order_item_id: null,
  complaint_type: "payment",
  subject: "匯款未入帳",
  statement: "已於 8/26 匯款 480 元。",
  status: "under_review",
  statutory_due_at: "2026-09-10T15:59:59.999Z",
  overdue: false,
  daysUntilDue: 5,
  created_at: "2026-08-26T02:00:00Z",
  submitted_at: "2026-08-26T02:00:00Z",
  related_remedy_case_id: null,
};

const FILE_EVIDENCE = {
  id: "evd_file",
  complaint_id: COMPLAINT_ID,
  uploaded_by: "usr_parent_e2e",
  has_file: true,
  original_filename: "匯款證明.png",
  mime_type: "image/png",
  size_bytes: 75,
  external_reference: null,
  created_at: "2026-08-26T03:00:00Z",
};

const TEXT_EVIDENCE = {
  id: "evd_text",
  complaint_id: COMPLAINT_ID,
  uploaded_by: "usr_parent_e2e",
  has_file: false,
  original_filename: null,
  mime_type: null,
  size_bytes: null,
  external_reference: "已向台北市消費者服務中心申訴，案號 2026-0827-001",
  created_at: "2026-08-26T04:00:00Z",
};

/** 記錄所有打到 evidence file 路徑的請求，用來斷言 scope 與「token 不在 URL」。 */
function trackFileRequests(page: Page) {
  const seen: { url: string; auth: string | null }[] = [];
  page.on("request", (req) => {
    if (/\/evidence\/[^/]+\/file/.test(req.url())) {
      seen.push({ url: req.url(), auth: req.headers()["authorization"] ?? null });
    }
  });
  return seen;
}

const fileBytes = (route: Route, disposition = "inline") =>
  route.fulfill({
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-disposition": `${disposition}; filename="evidence.png"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
    body: PNG,
  });

// ---------------------------------------------------------------------------

test.describe("buyer complaint evidence delivery", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "parent");
  });

  test("有附件的證據提供「查看 / 下載」，純文字的不提供", async ({ page }) => {
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE, TEXT_EVIDENCE] }),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);

    const rows = page.getByTestId("evidence-attachment");
    await expect(rows).toHaveCount(2);

    const withFile = rows.filter({ has: page.locator('[data-has-file="true"]') }).or(
      page.locator('[data-testid="evidence-attachment"][data-has-file="true"]')
    );
    await expect(withFile.getByTestId("evidence-view")).toBeVisible();
    await expect(withFile.getByTestId("evidence-download")).toBeVisible();
    await expect(withFile.getByTestId("evidence-name")).toContainText("匯款證明.png");
    // 型別與大小是既有 metadata，本輪只是把它顯示出來
    await expect(withFile.getByTestId("evidence-meta")).toContainText("image/png");

    // 純文字那一列**不得**出現必定失敗的控制項
    const textRow = page.locator('[data-testid="evidence-attachment"][data-has-file="false"]');
    await expect(textRow).toHaveCount(1);
    await expect(textRow.getByTestId("evidence-view")).toHaveCount(0);
    await expect(textRow.getByTestId("evidence-download")).toHaveCount(0);
  });

  test("點「查看」會向受保護路徑取回位元組並顯示預覽", async ({ page }) => {
    const seen = trackFileRequests(page);
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
      [`GET me/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file`]: (route) =>
        fileBytes(route),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await page.getByTestId("evidence-view").click();

    const preview = page.getByTestId("evidence-preview");
    await expect(preview).toBeVisible();
    // 真的是 blob，不是直接把受保護 URL 塞進 src
    expect(await preview.getAttribute("src")).toMatch(/^blob:/);
    // 且圖片真的解碼成功（不是壞掉的圖）
    expect(await preview.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].url).toContain(`me/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file`);
  });

  test("**token 走 header，不得出現在 URL**", async ({ page }) => {
    const seen = trackFileRequests(page);
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
      [`GET me/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file`]: (route) =>
        fileBytes(route),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await page.getByTestId("evidence-view").click();
    await expect(page.getByTestId("evidence-preview")).toBeVisible();

    for (const req of seen) {
      expect(req.url).not.toMatch(/token|authorization|jwt|bearer/i);
      expect(req.auth ?? "").toMatch(/^Bearer .+/);
    }
    // DOM 裡也不得留下 token 或 storage key
    const html = await page.content();
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // JWT 形狀
    expect(html).not.toContain("complaint-evidence/");
  });

  test("「下載」帶 ?download=1（那是後端寫稽核的條件）", async ({ page }) => {
    const seen = trackFileRequests(page);
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
      [`GET me/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file?download=1`]: (route) =>
        fileBytes(route, "attachment"),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await page.getByTestId("evidence-download").click();

    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen.some((r) => r.url.includes("download=1"))).toBe(true);
  });

  test("取檔失敗（409 只有文字 / 503 儲存後端）呈現訊息，不是空白或壞圖", async ({ page }) => {
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
      [`GET me/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file`]: (route) =>
        json(
          route,
          { error: "evidence_object_missing", message: "證據檔案暫時無法取得，請稍後再試或聯絡平台客服。" },
          503
        ),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await page.getByTestId("evidence-view").click();

    const err = page.getByTestId("evidence-error");
    await expect(err).toBeVisible();
    await expect(err).toContainText("暫時無法取得");
    await expect(page.getByTestId("evidence-preview")).toHaveCount(0);
    // 錯誤訊息不得洩漏路徑
    expect(await err.textContent()).not.toMatch(/private-storage|[A-Za-z]:\\/);
  });

  test("mobile 375×812：證據列不 overflow、長檔名可斷行、tap target 夠大", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const longName = {
      ...FILE_EVIDENCE,
      original_filename: "2026年8月26日台灣銀行網路銀行轉帳成功交易明細截圖_完整版.png",
    };
    await mockApi(page, {
      [`GET me/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [longName, TEXT_EVIDENCE] }),
    });
    await page.goto(`/me/complaints/${COMPLAINT_ID}`);
    await expect(page.getByTestId("evidence-name").first()).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    const view = page.getByTestId("evidence-view").first();
    const box = await view.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("admin complaint evidence delivery", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin");
  });

  test("Admin 詳情的證據可查看，且打的是 **admin** scope 路徑", async ({ page }) => {
    const seen = trackFileRequests(page);
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [COMPLAINT] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
      [`GET admin/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file`]: (route) =>
        fileBytes(route),
    });
    await page.goto("/admin/complaints");
    await page.getByTestId("admin-complaint-row").first().click();
    await expect(page.getByTestId("admin-complaint-detail")).toBeVisible();

    await expect(page.getByTestId("evidence-name")).toContainText("匯款證明.png");
    await page.getByTestId("evidence-view").click();
    await expect(page.getByTestId("evidence-preview")).toBeVisible();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].url).toContain(`admin/complaints/${COMPLAINT_ID}/evidence/`);
    // Admin 不得誤打買家 scope
    expect(seen.every((r) => !r.url.includes("me/complaints"))).toBe(true);
  });

  test("Admin 端不得在 DOM 出現 storage_key / checksum / 檔案系統路徑", async ({ page }) => {
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [COMPLAINT] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
    });
    await page.goto("/admin/complaints");
    await page.getByTestId("admin-complaint-row").first().click();
    await expect(page.getByTestId("admin-complaint-detail")).toBeVisible();

    const html = await page.content();
    for (const forbidden of ["storage_key", "checksum", "complaint-evidence/", "private-storage"]) {
      expect(html).not.toContain(forbidden);
    }
  });

  test("Admin 的下載同樣帶 ?download=1", async ({ page }) => {
    const seen = trackFileRequests(page);
    await mockApi(page, {
      "GET admin/complaints": (route) => json(route, { items: [COMPLAINT] }),
      [`GET admin/complaints/${COMPLAINT_ID}`]: (route) =>
        json(route, { complaint: COMPLAINT, events: [], evidence: [FILE_EVIDENCE] }),
      [`GET admin/complaints/${COMPLAINT_ID}/evidence/${FILE_EVIDENCE.id}/file?download=1`]: (route) =>
        fileBytes(route, "attachment"),
    });
    await page.goto("/admin/complaints");
    await page.getByTestId("admin-complaint-row").first().click();
    await page.getByTestId("evidence-download").click();

    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen.some((r) => r.url.includes("download=1"))).toBe(true);
  });
});
