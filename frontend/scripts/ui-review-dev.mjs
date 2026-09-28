/**
 * UI Review 的 **frontend 啟動器**。
 *
 * ```
 *   npm run dev:web:ui-review --prefix frontend
 * ```
 *
 * 做的事只有兩件：
 *
 * 1. 把 `API_BASE_URL` 指到 UI Review 的 backend（**3100**，不是一般開發的 3000），
 *    這樣同一棵樹上可以同時跑「一般開發」與「UI Review」而互不干擾。
 * 2. 在 **3110** 啟動 `next dev`。
 *
 * 用一支 node 腳本而不是在 npm script 裡寫 `API_BASE_URL=... next dev`：
 * 後者在 PowerShell／cmd 是語法錯誤，而本 repo 的主要開發環境是 Windows。
 *
 * `NEXT_DIST_DIR` 刻意設為 `.next-ui-review`：`next dev` 預設寫 `.next`，
 * 與一般開發的 dev server 共用同一個目錄會互相覆寫 manifest（見 `next.config.ts` 的
 * `distDir` 註解）。
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_APP = path.join(HERE, "..", "apps", "web");

const UI_REVIEW_FRONTEND_PORT = "3110";
const UI_REVIEW_BACKEND_URL = "http://localhost:3100";

const env = {
  ...process.env,
  API_BASE_URL: UI_REVIEW_BACKEND_URL,
  NEXT_PUBLIC_API_BASE_URL: UI_REVIEW_BACKEND_URL,
  NEXT_DIST_DIR: ".next-ui-review",
  // UI Review 專屬的 dev-only 頁面開關（見 app/dev/ui-review）。
  // production build 另有 source-scan 測試釘住它不會被部署繼承。
  NEXT_PUBLIC_UI_REVIEW_MODE: "1",
};

console.log("");
console.log("  UI REVIEW — FRONTEND");
console.log("  ────────────────────");
console.log(`    frontend : http://localhost:${UI_REVIEW_FRONTEND_PORT}`);
console.log(`    backend  : ${UI_REVIEW_BACKEND_URL}`);
console.log(`    distDir  : ${env.NEXT_DIST_DIR}`);
console.log("");

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "--port", UI_REVIEW_FRONTEND_PORT],
  { cwd: WEB_APP, env, stdio: "inherit", shell: process.platform === "win32" }
);

child.on("exit", (code) => process.exit(code ?? 0));
