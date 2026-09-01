#!/usr/bin/env node
/**
 * Canonical frontend 驗收：`npm run verify:web`（在 `frontend/` 執行）。
 *
 * 依序跑 `lint:web` → `typecheck:web` → `build:web`，三者全過才算過 ——
 * 與先前的 shell 串接**完全相同**，唯一的差別是：
 *
 *   **三個階段都跑在隔離的 `distDir` 上，不碰開發用的 `.next`。**
 *
 * ## 為什麼（`DX-05`）
 *
 * `.next` 是一個沒有 per-consumer 隔離的共用可變目錄。`next dev`、`next typegen`、
 * `next build`、`next start` 全部預設讀寫它，而 dev 與 production 的產物版面**不相容**：
 *
 *   - build 會整個換掉 `BUILD_ID` 與各種 manifest；同一棵樹上若有 `next dev` 正在跑，
 *     它下一個請求就讀到不存在的 manifest，於是**整站回 500**（實測 `/`、`/login`、
 *     `/materials` 皆 500），而且剛啟動時會假性通過健康檢查。
 *   - 反過來，dev 持有 `.next` 時 build 會倒在 `EPERM: open '.next\\trace'`，
 *     而且是**寫壞之後才失敗**。
 *
 * 也就是說：照 CLAUDE.md §7 執行驗收，就會弄壞另一個 session 正在用的 dev server。
 * 這不是「重跑一次就好」，也不該靠每個人記得先手動停 3010。
 *
 * ## 契約
 *
 *   - `next dev`（`dev:web` / `dev:web:3010`）**維持預設的 `.next`**，行為完全不變。
 *   - 驗收（本檔）一律寫到 `DEFAULT_VERIFY_DIST_DIR`，因此**不需要停掉 dev server**。
 *   - Production E2E 的 `next start` 必須指向**同一個**目錄 ——
 *     `playwright.config.ts` 在 `E2E_SERVER=production` 時套用同一個預設值。
 *   - `NEXT_DIST_DIR` 若已由呼叫端設定則**尊重呼叫端**（CI 或臨時隔離都用得上）。
 *
 * `distDir` 的實際套用點是 `apps/web/next.config.ts` 的
 * `distDir: process.env.NEXT_DIST_DIR || ".next"`。
 */

import { spawnSync } from "node:child_process";

// 驗收專用的建置產物目錄。`.gitignore` 的 `/.next-*` 規則已涵蓋它。
const DEFAULT_VERIFY_DIST_DIR = ".next-verify";

const distDir = process.env.NEXT_DIST_DIR?.trim() || DEFAULT_VERIFY_DIST_DIR;

if (distDir === ".next") {
  console.error(
    "verify:web: NEXT_DIST_DIR 不得為 '.next' —— 那正是 dev server 使用的目錄（DX-05）。",
  );
  process.exit(1);
}

const STAGES = ["lint:web", "typecheck:web", "build:web"];

// 對齊 CLAUDE.md §10.5「高風險操作前先印出目標」：驗收也先講清楚會寫到哪裡。
console.log(`verify:web → NEXT_DIST_DIR=${distDir}（開發用的 .next 不會被動到）`);

for (const stage of STAGES) {
  console.log(`\n=== verify:web [${stage}] ===`);
  const result = spawnSync("npm", ["run", stage], {
    stdio: "inherit",
    // Windows 的 npm 是 npm.cmd，必須經 shell 解析；引數皆為無空白的字面值。
    shell: true,
    env: { ...process.env, NEXT_DIST_DIR: distDir },
  });
  if (result.error) {
    console.error(`verify:web: 無法執行 ${stage}:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nverify:web: [${stage}] 失敗（exit ${result.status}）。`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nverify:web: 全部通過（產物在 ${distDir}）。`);
