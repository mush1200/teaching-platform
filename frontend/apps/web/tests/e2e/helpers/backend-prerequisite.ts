import fs from "node:fs";
import path from "node:path";

/**
 * `DX-19` —— E2E live-backend 前置條件的**唯一**設定來源。
 *
 * `playwright.config.ts`（決定要不要啟 backend、用哪個資料庫）與
 * `tests/e2e/global-setup.ts`（驗證前置條件是否真的成立）都從這裡取值，
 * 避免兩邊各寫一份而漂移 —— 那正是 `DX-15`／`DX-17` 的教訓：
 * 同一個事實有兩個定義，就會有一個先過期。
 */

/**
 * E2E 唯一允許的目標資料庫。
 *
 * 與 `Backend/scripts/run-db-tests.js` 的 `TARGET_DB` 相同，也與 `CLAUDE.md` §7
 * 「smoke / Postman 只能指向 `teaching_platform_security_test`」同一條規則。
 */
export const E2E_TARGET_DB = "teaching_platform_security_test";

/**
 * 明確列在拒絕清單上的資料庫。
 *
 * `teaching_platform` 是開發資料庫：E2E 會建立訂單、上傳憑證、改教材狀態，
 * 打在它身上會污染開發資料，而且**不會有任何錯誤訊息**告訴你打錯了。
 */
const FORBIDDEN_DBS = new Set(["teaching_platform", "postgres", "template1"]);

/**
 * `public.spec.ts` 依賴的 migration seed（`20260508_seed_material_detail_demo.sql`）。
 *
 * 它同時是「backend 連得到資料庫且 migration 已套用」最便宜的唯讀證明。
 * **注意：這筆 seed 兩個資料庫都有**（它來自 migration），
 * 因此它證明的是 seed 與連通性，**不是**資料庫身分 —— 後者由 spawn 時寫死 PGDATABASE 保證。
 */
export const SEED_MATERIAL_ID = "mat_detail_seed_1";

/** Backend 的 origin。與 `payment-proof-security` / `material-media-security` 共用同一個變數。 */
function resolveBackendUrl(): string {
  const raw = process.env.E2E_BACKEND_URL?.trim();
  return (raw || "http://127.0.0.1:3000").replace(/\/$/, "");
}

/**
 * 解析並**驗證**目標資料庫。
 *
 * 這是 `DX-19` 的 machine-checkable guard：它在 config 載入時（也就是**任何 server 啟動、
 * 任何 test 執行之前**）就會 throw，因此不可能發生「跑到一半才發現打錯資料庫」。
 */
function resolveTargetDb(): string {
  const requested = process.env.E2E_BACKEND_DB?.trim() || E2E_TARGET_DB;

  if (requested !== E2E_TARGET_DB) {
    throw new Error(
      [
        "",
        "═══════════════════════════════════════════════════════════════",
        "  E2E DATABASE GUARD — REFUSING TO START",
        "═══════════════════════════════════════════════════════════════",
        "",
        `  要求的資料庫：${JSON.stringify(requested)}`,
        `  唯一允許的：  ${JSON.stringify(E2E_TARGET_DB)}`,
        "",
        FORBIDDEN_DBS.has(requested)
          ? "  這是開發／系統資料庫。E2E 會建立訂單、上傳憑證、變更教材狀態 ——"
          : "  未知的資料庫目標。",
        "  對它執行整套 E2E 會造成不可逆的資料污染，而且不會有任何錯誤提示。",
        "",
        "  沒有任何 test 被執行，也沒有任何 server 被啟動。",
        "═══════════════════════════════════════════════════════════════",
        "",
      ].join("\n")
    );
  }

  return requested;
}

/**
 * repo 根目錄 —— backend 由此啟動（`node Backend/index.js`）。
 *
 * 這個檔案位於 `frontend/apps/web/tests/e2e/helpers/`，因此要往上 **6 層**
 * （helpers → e2e → tests → web → apps → frontend → repo root）。
 * 少一層會停在 `frontend/`，backend 就啟動不了 —— 下面的斷言讓這種錯誤
 * 在 config 載入時就爆掉，而不是變成一個看起來像 backend 沒開的 timeout。
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");

/**
 * 是否重用既有 backend。
 *
 * **預設為否**，這是刻意的：開發者常態會在 3000 跑 `npm run dev`（nodemon，連**開發**資料庫）。
 * 若預設重用，E2E 就會安靜地打在開發資料庫上 —— 正是 `DX-19` 要防的事。
 * 預設不重用時，harness 自己啟動 backend 並在 spawn 時寫死 `PGDATABASE`，
 * 資料庫正確性**由建構保證**，不依賴任何人記得設環境變數。
 */
const reused = process.env.E2E_REUSE_BACKEND === "1";

if (!fs.existsSync(path.join(REPO_ROOT, "Backend", "index.js"))) {
  throw new Error(
    `E2E harness could not locate Backend/index.js from the resolved repo root ` +
      `${JSON.stringify(REPO_ROOT)}. The relative depth in backend-prerequisite.ts is wrong.`
  );
}

export const BACKEND_PREREQUISITE = {
  baseUrl: resolveBackendUrl(),
  expectedDb: resolveTargetDb(),
  seedMaterialId: SEED_MATERIAL_ID,
  repoRoot: REPO_ROOT,
  reused,
} as const;
