import { BACKEND_PREREQUISITE } from "./helpers/backend-prerequisite";

/**
 * `DX-19` —— E2E 的 live-backend 前置條件檢查。
 *
 * ## 為什麼需要這一層
 *
 * 這套 E2E 有一部分**必須**打到真的 backend（`api-proxy` / `payment-proof-security` /
 * `material-media-security` / `legal-publication-security` 的 backend contract case），
 * 另外 `public.spec.ts` 依賴 migration 帶進來的 seed 教材，而 `/materials/:id` 與四條
 * legal route 是 **server-side fetch** —— `page.route()` 攔不到，只能靠真的 backend。
 *
 * 在這一層出現之前，backend 沒開會有兩種都很糟的表現（2026-08-30 實測，見 tracker `DX-19`）：
 *
 * ```text
 * 1) 假紅燈：api-proxy.spec.ts 報 "Expected: 200 / Received: 500"、
 *    "SyntaxError: Unexpected end of JSON input" —— 看起來像 proxy 壞了。
 *    真正的原因 ECONNREFUSED ::1:3000 只出現在交錯的 [WebServer] stdout 裡。
 *
 * 2) 假綠燈（更危險）：legal-publication-security 的四條 public route case
 *    在 backend 全滅時 4/4 通過 —— 因為 LegalDocumentPage.fetchPublished() 對
 *    fetch 失敗一律 return null，於是 notFound()。頁面行為「看起來正確」，
 *    但它證明的不是「沒有發布」，而只是「連不上」。
 * ```
 *
 * 所以這裡的職責只有一個：**在任何 product assertion 開始之前，
 * 把 backend 前置條件變成明確、可機器檢查、且失敗時一眼看得懂的東西。**
 *
 * ## 執行順序（實測，非推測）
 *
 * Playwright 1.59 先啟動 `webServer`，**再**執行 `globalSetup`。
 * 已於 2026-08-30 以拋棄式 config 實測確認：3010 在 globalSetup 執行時已經是 up
 * （起跑前確認 3010 為 down）。因此這裡可以直接假設兩個 server 都已就緒，不需要自己輪詢啟動。
 *
 * ## 這裡**不**做的事
 *
 * 不建立、不修改、不刪除任何資料；不發布任何法律文件；不碰 schema。
 * 全部是唯讀 HTTP 探測。
 */

function fail(reason: string, remedy: string): never {
  throw new Error(
    [
      "",
      "═══════════════════════════════════════════════════════════════",
      "  E2E BACKEND PREREQUISITE NOT SATISFIED",
      "═══════════════════════════════════════════════════════════════",
      "",
      `  ${reason}`,
      "",
      `  ${remedy}`,
      "",
      "  這是**前置條件**失敗，不是產品缺陷 —— 不要把它當成 regression 追。",
      "═══════════════════════════════════════════════════════════════",
      "",
    ].join("\n")
  );
}

async function probe(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}

export default async function globalSetup(): Promise<void> {
  const { baseUrl, expectedDb, reused, seedMaterialId } = BACKEND_PREREQUISITE;

  /*
   * 0. 先把「這一輪用的是哪一種模式」講清楚。
   *
   *    刻意放在所有檢查**之前**：重用模式的風險說明，在後面某個檢查失敗時
   *    往往正是最關鍵的線索，不該因為提前失敗就看不到。
   */
  if (reused) {
    console.warn(
      [
        "",
        "  ⚠️  E2E_REUSE_BACKEND=1 —— 正在重用既有的 backend。",
        `      harness 無法從外部證明它連的是 ${expectedDb}。`,
        "      若它其實連著開發資料庫，E2E 會對開發資料造成寫入。",
        "      預設路徑（不設此變數）由 harness 自行啟動 backend 並寫死測試資料庫，較安全。",
        "",
      ].join("\n")
    );
  }

  /*
   * 1. 可達性 —— 分辨「沒開」與「開著但不對」。
   */
  const health = await probe(`${baseUrl}/health`);
  if (health === null) {
    fail(
      `Backend 在 ${baseUrl} 無法連線（連線被拒或逾時）。`,
      reused
        ? `目前設定為重用既有 backend（E2E_REUSE_BACKEND=1），但該位址上沒有服務。\n` +
            `  請先啟動 backend，或移除 E2E_REUSE_BACKEND 讓 harness 自己啟動它。`
        : `harness 本該自己啟動 backend 卻沒有成功 —— 請看上方 [WebServer] 的輸出。\n` +
          `  常見原因：Backend/.env 缺少 JWT_SECRET、PostgreSQL 沒開、或 ${expectedDb} 不存在。`
    );
  }

  /*
   * 2. 身分 —— 證明 3000 上跑的是**這個** app，而不是剛好占用該 port 的別的東西。
   */
  if (health.status !== 200 || !health.text.includes(`"status":"ok"`)) {
    fail(
      `${baseUrl}/health 回應非預期（HTTP ${health.status}）：${health.text.slice(0, 120)}`,
      `該 port 上的服務不是本專案的 Backend（契約為 200 + {"status":"ok"}）。\n` +
        `  請確認沒有其他程式占用該 port。`
    );
  }

  /*
   * 3. 資料庫連通性 ＋ seed —— `public.spec.ts` 直接依賴這筆 migration seed
   *    （`Backend/migrations/20260508_seed_material_detail_demo.sql`），
   *    而 `/materials/:id` 是 server-side fetch，mock 不了。
   *
   *    這一步同時證明 backend 真的連得上資料庫且 migration 已套用 ——
   *    backend 起得來但 DB 空的話，會在這裡就停，而不是等到某支 spec 的 locator timeout。
   */
  const seed = await probe(`${baseUrl}/materials/${seedMaterialId}`);
  if (seed === null || seed.status !== 200) {
    fail(
      `Seed 教材 ${seedMaterialId} 讀不到（HTTP ${seed ? seed.status : "no response"}）。`,
      `Backend 活著，但它連的資料庫沒有這筆 migration seed。\n` +
        `  預期資料庫：${expectedDb}\n` +
        `  請確認該資料庫存在且 Backend/migrations 已全部套用。`
    );
  }

  /*
   * 4. 資料庫來源的誠實聲明。
   *
   *    預設路徑（harness 自己啟動 backend）下，PGDATABASE 由 playwright.config.ts
   *    在 spawn 時**寫死**注入，因此正確性**由建構保證**，不依賴任何人記得 export 環境變數。
   *
   *    重用路徑則無法從外部證明對方連的是哪一個資料庫 —— backend 沒有、也不該有
   *    對外揭露資料庫名稱的 endpoint（那是 production 的資訊洩漏面）。
   *    這個限制在此明說，而不是假裝已經驗過。
   */
  console.log(
    reused
      ? `  ✓ E2E backend prerequisite OK — ${baseUrl} (reused; database provenance unverified)`
      : `  ✓ E2E backend prerequisite OK — ${baseUrl}, database pinned to ${expectedDb}`
  );
}
