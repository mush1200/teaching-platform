import { expect, test } from "@playwright/test";

/**
 * `TEST-01` —— 四條 public legal route 的「未發布即 404、絕不洩漏 draft」不變條件。
 *
 * ## 這支測試證明什麼（以及**不**證明什麼）
 *
 * 只證明一件事：**在 `legal_documents` 沒有 published 版本時，平台不會對外顯示任何法律文字。**
 *
 * 它**不**驗證條文是否合法、解除權例外是否成立、授權鏈是否完整、管轄是否正確、
 * 稅務用語、審閱期或重新同意判準 —— 那些全部 blocked on 外部律師／會計師
 * （`PRE-03` / `L-*` / `T-*`），也不是測試能回答的問題。
 *
 * ## 為什麼這個不變條件值得一支專屬 spec
 *
 * 「看起來像法律頁面但沒有內容」比誠實的 404 更危險 —— 前者會讓使用者以為自己讀過了條款。
 * 而 repo 裡**確實**躺著四份完整的草稿（`docs/legal-drafts/*.draft.md`），
 * 每一份都明確標記 `DRAFT — NOT LAWYER APPROVED` / `NOT FOR PRODUCTION PUBLICATION`。
 * 一旦有人「為了讓頁面不要空著」把草稿接成 fallback，平台就等於對外發布了未經核可的法律文字。
 * 這支測試就是那道護欄。
 *
 * ## 為什麼斷言「不是被導去登入」
 *
 * 四條 route 都**不在** `middleware.ts` 的 `LOGIN_REQUIRED_PREFIXES`，也不在其 `matcher` 內，
 * 因此訪客會直接抵達頁面。如果哪天有人把它們誤加進登入前綴，
 * 「訪客看不到草稿」仍然成立，但**理由錯了**，而且會讓公開條款變成登入才能讀
 * （`L-12` 定型化契約審閱期要求條款須於勾選前可完整閱讀）。
 * 所以這裡同時釘住「**404，而不是 302 到 /login**」。
 */

/** 四條 route → 對應草稿裡最不可能被誤判的字串。 */
const LEGAL_ROUTES = [
  { path: "/terms", uiTitle: "服務條款", draftHeading: "服務條款（草稿）" },
  { path: "/privacy", uiTitle: "隱私權政策", draftHeading: "隱私權政策（草稿）" },
  { path: "/creator-agreement", uiTitle: "創作者條款", draftHeading: "創作者條款（草稿）" },
  { path: "/refund", uiTitle: "退款與取消政策", draftHeading: "退款與取消政策（草稿）" },
] as const;

/**
 * 四份草稿共用的檔頭標記（逐字取自 `docs/legal-drafts/*.draft.md` 的第 2～3 行）。
 *
 * **刻意不把整份法律文字複製進測試** —— 那會讓這支 spec 在每次條文修訂時失效，
 * 而它要守的東西跟條文內容無關。只要這兩行其中之一出現在公開頁面上，
 * 就代表草稿被端出去了。
 */
const DRAFT_MARKERS = ["DRAFT — NOT LAWYER APPROVED", "NOT FOR PRODUCTION PUBLICATION"] as const;

/**
 * `LegalDocumentPage` 在**有** published 文件時才會渲染的結構標記
 * （`components/legal/LegalDocumentPage.tsx`：`<dl>` 內的「版本」「生效日」）。
 * 沒有文件時整個 `<article>` 都不該存在 —— 連空殼卡片都不行。
 */
const PUBLISHED_SHELL_MARKERS = ["版本", "生效日"] as const;

test.describe("TEST-01 — public legal routes never leak an unpublished draft", () => {
  for (const route of LEGAL_ROUTES) {
    test(`${route.path} is unavailable and leaks no draft while nothing is published`, async ({
      page,
      baseURL,
    }) => {
      const response = await page.goto(route.path);

      await test.step("Case A — route is unavailable (real 404, not an auth redirect)", async () => {
        /*
         * `page.goto()` 回傳的是**最終**導覽的 response。同時釘住 status 與 URL：
         * 只斷言 status 的話，把 route 誤加進登入前綴後這條仍可能以別的方式「看起來對」。
         */
        expect(response, `${route.path} must produce a navigation response`).not.toBeNull();
        expect(response!.status(), `${route.path} must return HTTP 404 while unpublished`).toBe(404);

        // 沒有被導去 /login、也沒有被導去 /403 —— 網址必須還停在原本那條 legal route。
        expect(new URL(page.url()).pathname, `${route.path} must not redirect`).toBe(route.path);

        // Next 的 not-found UI（`app/not-found.tsx`）。
        await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
        await expect(page.getByText("找不到你要前往的頁面，可能已移動或網址有誤。")).toBeVisible();
      });

      await test.step("Case B — no draft content leak", async () => {
        const body = page.locator("body");

        for (const marker of DRAFT_MARKERS) {
          await expect(
            body,
            `${route.path} must never render the draft marker ${JSON.stringify(marker)}`
          ).not.toContainText(marker);
        }

        // 該份草稿自己的標題 —— 比共用標記更能證明「這一條 route 沒有去讀那一份檔案」。
        await expect(
          body,
          `${route.path} must never render the draft heading ${JSON.stringify(route.draftHeading)}`
        ).not.toContainText(route.draftHeading);
      });

      await test.step("Case C — the published-document shell is not rendered either", async () => {
        /*
         * 比 Case B 更嚴一階：即使沒有法律**內文**，也不能出現「像法律頁面的空殼」——
         * 沒有 `<article>`、沒有標題、沒有「版本 / 生效日」meta。
         * 這正是 `LegalDocumentPage` 的模組說明所拒絕的那種畫面。
         */
        await expect(page.locator("article")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: route.uiTitle, exact: true })
        ).toHaveCount(0);

        const body = page.locator("body");
        for (const marker of PUBLISHED_SHELL_MARKERS) {
          await expect(
            body,
            `${route.path} must not render the published-document meta ${JSON.stringify(marker)}`
          ).not.toContainText(marker);
        }
      });

      await test.step("Case C2 — no hand-written placeholder legal copy", async () => {
        /*
         * repo 目前**沒有**任何 placeholder 法律文案（`LegalDocumentPage` 只有
         * 「有文件就渲染、沒有就 `notFound()`」兩條路，沒有第三條）。
         * 這裡不為不存在的字串堆砌脆弱斷言，只釘住最可能被人「順手補上」的那一類：
         * 宣稱條款暫時不可用、即將推出、或以其他形式存在。
         */
        await expect(page.locator("body")).not.toContainText(route.uiTitle);
        expect(baseURL, "baseURL is configured by playwright.config.ts").toBeTruthy();
      });
    });
  }

  /**
   * 這一條回答 Case A 剩下的那個問題：**404 是因為「沒有發布」，不是因為「後端連不上」。**
   *
   * `LegalDocumentPage.fetchPublished()` 對 fetch 失敗一律 `return null`（刻意的 —— 後端掛掉時
   * 同樣不得顯示替代內容），因此上面四條 route 在 backend 未啟動時**也會**是 404。
   * 那個 404 是對的，但理由不同；只靠頁面斷言無法區分兩者。
   *
   * 需要 live backend :3000（`DX-19` 已立案，將把這類前置條件明示化）。
   */
  test("backend reports the documents as unpublished, not merely unreachable", async ({
    request,
  }) => {
    for (const type of ["terms", "privacy", "creator_agreement", "refund_policy"]) {
      const res = await request.get(`/api/backend/legal/documents/${type}`);
      expect(res.status(), `GET legal/documents/${type} must be 404 while unpublished`).toBe(404);

      const body = (await res.json()) as { error?: string };
      // 這個 error code 只有「查得到資料庫、但沒有 published 列」才會出現。
      expect(
        body.error,
        `legal/documents/${type} must 404 because nothing is published`
      ).toBe("legal_document_not_published");
    }
  });
});
