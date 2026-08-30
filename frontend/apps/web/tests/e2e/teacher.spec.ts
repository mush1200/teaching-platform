import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { installShellBootstrapMocks } from "./helpers/shell-bootstrap";
import { TEACHER_ROUTES } from "./helpers/routes";

test.describe("Teacher Pages", () => {
  // cookie + localStorage 都要設；只設 localStorage 會被 middleware 導向 /login，
  // 這些測試就會在登入頁上通過，實際上什麼都沒驗到。
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "teacher", { email: "teacher-e2e@example.com" });
    // RoleShell 的 creator 分支掛載時會打 `auth/me`（`DX-04` 的 session 探測）。
    await installShellBootstrapMocks(page);
  });

  test("teacher material list skeleton", async ({ page }) => {
    /*
     * 狀態篩選與分頁都在 client 端（`app/teacher/materials/page.tsx`：`statusFilter`
     * ＋ `PAGE_SIZE = 8`），因此必須先給足資料才驗得出來 —— 這是 fixture 不足，
     * 不是「不該驗」。10 筆 published ＋ 2 筆 pending_review：
     * 10 > 8 讓分頁真的出現第 2 頁，兩種狀態讓篩選有可觀察的差異。
     */
    const MINE = "usr_creator_e2e";
    await page.route("**/api/backend/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ user: { id: MINE, role: "teacher", email: "teacher-e2e@example.com" } }),
      }),
    );
    await page.route("**/api/backend/materials", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          items: [
            ...Array.from({ length: 10 }, (_, i) => ({
              id: `mat_pub_${i}`,
              title: `已發布教材 ${i}`,
              price: 100 + i,
              status: "published",
              teacher_id: MINE,
            })),
            { id: "mat_pend_1", title: "待審教材 1", price: 200, status: "pending_review", teacher_id: MINE },
            { id: "mat_pend_2", title: "待審教材 2", price: 201, status: "pending_review", teacher_id: MINE },
          ],
        }),
      }),
    );

    await page.goto("/teacher/materials");

    await test.step("list page visible", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      // 側欄捷徑與頁面 CTA 都叫「新增教材」（正常設計），因此限定在 main 內。
      await expect(page.getByRole("main").getByRole("link", { name: "新增教材" })).toBeVisible();
    });

    await test.step("狀態篩選改變的是實際列出的教材，不只是選單本身", async () => {
      // 預設「全部」：第一頁 8 筆，因此看得到已發布、看不到被擠到第二頁的待審
      await expect(page.getByText("已發布教材 0")).toBeVisible();

      // 狀態篩選是 Tamagui 的 Select（combobox ＋ listbox），不是原生 <select>。
      await page.locator("#teacher-material-status").click();
      await page.getByRole("option", { name: "審核中" }).click();
      // 篩掉之後只剩 2 筆待審 —— 兩筆都應該出現，已發布的則完全消失
      await expect(page.getByText("待審教材 1")).toBeVisible();
      await expect(page.getByText("待審教材 2")).toBeVisible();
      await expect(page.getByText("已發布教材 0")).toHaveCount(0);
    });

    await test.step("換頁換的是內容，不是只有頁碼", async () => {
      await page.locator("#teacher-material-status").click();
      await page.getByRole("option", { name: "全部" }).click();
      // 12 筆 / 每頁 8 → 第 2 頁應該出現第一頁沒有的項目
      await expect(page.getByText("已發布教材 0")).toBeVisible();
      await expect(page.getByText("待審教材 2")).toHaveCount(0);

      await page.getByRole("button", { name: "下一頁" }).click();

      await expect(page.getByText("待審教材 2")).toBeVisible();
      await expect(page.getByText("已發布教材 0")).toHaveCount(0);
    });
  });

  test("teacher create material skeleton", async ({ page }) => {
    await page.goto("/teacher/materials/new");
    await test.step("form fields and required validation", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("button", { name: /建立教材|建立中/i })).toBeVisible();
    });

    await test.step("空表單送出會被擋下並說明原因", async () => {
      await page.getByRole("button", { name: /建立教材|建立中/i }).click();
      // 第一個未通過的必填就是標題（`app/teacher/materials/new/page.tsx` 的驗證順序）
      await expect(page.getByText("請輸入教材標題。")).toBeVisible();
      // 被擋下就不該離開表單頁
      expect(new URL(page.url()).pathname).toBe("/creator/materials/new");
    });

    await test.step("著作權聲明是一個真的 gate，預設未同意且可切換", async () => {
      /*
       * 這裡驗的是 gate 的**使用者可見狀態**。不驅動到「因為未同意而被擋」那一步，
       * 是因為它排在必填檢查之後 —— 要走到那裡得先通過教材檔案上傳（`請先上傳教材檔案。`），
       * 而檔案上傳的完整流程已由 `material-review.spec.ts` 與 backend smoke 覆蓋。
       */
      await expect(page.getByRole("button", { name: "點此同意著作權聲明" })).toBeVisible();
      await page.getByRole("button", { name: "點此同意著作權聲明" }).click();
      await expect(page.getByRole("button", { name: "已同意著作權聲明" })).toBeVisible();
    });
  });

  test("teacher edit material skeleton", async ({ page }) => {
    // 這頁必須先成功取得教材才會渲染表單；沒有 mock 時只會看到 ErrorState。
    await page.route("**/api/backend/materials/mat_mock_001", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          id: "mat_mock_001",
          title: "示範教材",
          price: 199,
          status: "published",
          material_file: {
            approvedFile: {
              id: "mf_approved_1",
              originalFilename: "示範教材.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1_048_576,
              status: "approved",
            },
            pendingFile: null,
          },
          /*
           * 這些欄位是**儲存路徑的必要條件**（`app/teacher/materials/[id]/edit/page.tsx`
           * 的驗證順序：標題→價格→檔案→教學目標→使用時間→教學步驟→教學玩法→教材內容→封面）。
           * 少了任何一個，按下「儲存變更」都會停在驗證訊息，永遠打不到 PUT ——
           * 那樣就驗不到儲存成功／失敗的行為了。
           */
          teaching_objective: "認識常見蔬果並能說出名稱",
          usage_duration: "約 2 堂課",
          activity_steps: "1. 發下圖卡\n2. 進行配對",
          teaching_methods: ["遊戲活動"],
          material_features: ["PDF教材"],
          contents: [{ type: "cards", name: "圖卡", count: 10, description: "主題圖卡" }],
          cover_image_url: "https://example.test/cover.png",
          detail_images: [],
        }),
      }),
    );
    await page.goto("/teacher/materials/mat_mock_001/edit");
    await test.step("edit form and save action", async () => {
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("button", { name: /儲存變更|儲存中/i })).toBeVisible();

      // 已上架的教材看得到目前交付中的檔案，但**不能**更換 ——
      // 換檔等於在買家背後偷換已售出的商品，UI 必須說明原因而不是只把按鈕灰掉。
      await expect(page.getByTestId("material-file-approved")).toContainText("示範教材.pdf");
      await expect(page.getByTestId("material-file-upload-button")).toHaveCount(0);
      await expect(page.getByTestId("material-file-locked")).toContainText("已上架的教材無法更換教材檔案");
    });

    await test.step("改一個欄位、儲存，看到成功訊息", async () => {
      await page.route("**/api/backend/materials/mat_mock_001", async (route) => {
        if (route.request().method() === "PUT") {
          return route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ id: "mat_mock_001", title: "改過的標題" }),
          });
        }
        return route.fallback();
      });

      await page.locator("#edit-title").fill("改過的標題");
      await page.getByRole("button", { name: /儲存變更|儲存中/i }).click();

      // 已上架的教材不能重新送審，因此訊息是不帶送審提示的那一句
      await expect(page.getByText("教材已儲存。", { exact: true })).toBeVisible();
    });

    await test.step("後端 500 時顯示可讀的失敗訊息，而不是靜默", async () => {
      await page.route("**/api/backend/materials/mat_mock_001", async (route) => {
        if (route.request().method() === "PUT") {
          return route.fulfill({
            status: 500,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ message: "server error" }),
          });
        }
        return route.fallback();
      });

      await page.locator("#edit-title").fill("再改一次");
      await page.getByRole("button", { name: /儲存變更|儲存中/i }).click();

      // `parseApiErrorMessage` 取 server 的 message；不得出現成功訊息
      await expect(page.getByText("server error")).toBeVisible();
      await expect(page.getByText("教材已儲存。", { exact: true })).toHaveCount(0);
    });
  });

  test("all teacher routes reachable", async ({ page }) => {
    // 多條路由共用一個 test timeout；dev server 需要逐條 on-demand 編譯，30s 不夠。
    test.setTimeout(120_000);
    for (const route of TEACHER_ROUTES) {
      await test.step(`open ${route}`, async () => {
        await page.goto(route);
        // `middleware.ts` 會把 legacy 的 /teacher/* 正規化成 /creator/*（308），這是刻意行為；
        // 斷言要接受正規化後的網址。
        const canonical = route.replace(/^\/teacher/, "/creator");
        await expect(page).toHaveURL(new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      });
    }
  });
});
