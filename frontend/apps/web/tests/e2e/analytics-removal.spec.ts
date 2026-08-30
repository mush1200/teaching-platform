import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * `DEC-08` —— browser-local analytics 已整套移除。
 *
 * ## 為什麼是 source-level 而不是 UI-level
 *
 * 要證明的不是「某個畫面上看不到 analytics」，而是**整個 repo 不再有任何
 * 蒐集端**。那是一個關於原始碼的全稱命題，只有掃過整棵樹才證明得了 ——
 * 逐頁點過去永遠只能證明「我點過的那幾頁沒有」。
 *
 * ## 這裡守的四件事
 *
 *   1. `tp_analytics_events` **沒有任何 writer**（`session.ts` 的 legacy cleanup 例外，
 *      它是 `removeItem`，不是蒐集）。
 *   2. `lib/analytics.ts` 與 `trackEvent` **不存在**。
 *   3. **沒有替代儲存** —— 不得改用 sessionStorage / IndexedDB / cookie
 *      換個地方繼續存同一批事件。
 *   4. **沒有 network egress、沒有第三方 analytics SDK。**
 *
 * `DEC-08` 的語意是「移除 browser-local analytics 蒐集」，
 * **不是**「平台不再有任何事件紀錄」—— 後端的 `activity_logs` 是
 * server-side operational / security audit，與本項完全無關且維持不變。
 */

const WEB_ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];
const SOURCE_EXT = /\.(ts|tsx)$/;

async function collectSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...(await collectSourceFiles(full)));
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function scan(): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for (const dir of SCAN_DIRS) {
    for (const full of await collectSourceFiles(join(WEB_ROOT, dir))) {
      files.push({ path: relative(WEB_ROOT, full).replace(/\\/g, "/"), text: await readFile(full, "utf8") });
    }
  }
  return files;
}

test.describe("DEC-08 — browser-local analytics removed", () => {
  test("tp_analytics_events has zero active writers", async () => {
    const files = await scan();
    expect(files.length, "來源掃描不得為空 —— 掃不到檔案會讓本檔的所有斷言假性通過").toBeGreaterThan(50);

    const writers = files.filter(({ text }) =>
      /(localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*["'`]tp_analytics_events/.test(text),
    );
    expect(writers.map((f) => f.path)).toEqual([]);

    /*
     * 這個 key 唯一允許出現的地方是 `lib/session.ts` 的 legacy cleanup 清單
     * （登出時 `removeItem`，用來清掉既有瀏覽器的殘留舊值）。
     */
    const mentions = files.filter(({ text }) => text.includes("tp_analytics_events")).map((f) => f.path);
    expect(mentions).toEqual(["lib/session.ts"]);
  });

  test("analytics module and trackEvent no longer exist", async () => {
    const files = await scan();
    expect(files.map((f) => f.path).filter((p) => /lib\/analytics\.(ts|tsx)$/.test(p))).toEqual([]);

    const callers = files.filter(({ text }) => /\btrackEvent\b/.test(text)).map((f) => f.path);
    expect(callers).toEqual([]);

    const importers = files.filter(({ text }) => /from\s+["'][^"']*lib\/analytics["']/.test(text)).map((f) => f.path);
    expect(importers).toEqual([]);
  });

  test("no replacement analytics storage and no network egress", async () => {
    const files = await scan();

    // 換個地方存同一批事件也算沒移除。
    const replacementStores = files
      .filter(({ text }) => /indexedDB|openDatabase/.test(text) || /\banalytics_events\b/.test(text))
      .map((f) => f.path);
    expect(replacementStores).toEqual([]);

    // 送出去更不行 —— 本項的前提正是「沒有 network egress」。
    const egress = files
      .filter(({ text }) => /sendBeacon|dataLayer|gtag\s*\(|mixpanel|posthog|amplitude|segment\.(io|com)/i.test(text))
      .map((f) => f.path);
    expect(egress).toEqual([]);

    const pkg = JSON.parse(await readFile(join(WEB_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(
      deps.filter((d) => /analytics|gtag|gtm|mixpanel|posthog|segment|amplitude|hotjar|plausible|matomo/i.test(d)),
    ).toEqual([]);
  });

  test("logout still clears the retired key (legacy cleanup, not collection)", async () => {
    const sessionSource = await readFile(join(WEB_ROOT, "lib", "session.ts"), "utf8");
    // 清除必須走既有的集中式清單，而不是散在各處的一次性程式碼。
    expect(sessionSource).toMatch(/SESSION_STORAGE_KEYS\s*=\s*\[[\s\S]*?"tp_analytics_events"[\s\S]*?\]/);
    expect(sessionSource).toMatch(/for\s*\(const key of SESSION_STORAGE_KEYS\)[\s\S]*?removeItem\(key\)/);
  });
});
