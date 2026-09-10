import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getServerApiBaseUrl } from "../../lib/server-api-base-url";

/**
 * `DX-23` —— production URL guard 的不變條件回歸。
 *
 * ## 這支測試存在的理由
 *
 * `DX-23` 為了讓 `E2E_SERVER=production` 能連上 harness 自己的 loopback backend，
 * 在 `getServerApiBaseUrl()` 加了一個**極窄**的例外
 * （`E2E_ALLOW_LOOPBACK_API_BASE_URL=1`）。加例外就必須同時把
 * 「**真實 production 仍然 fail closed**」釘死，否則下一個人只會看到一個
 * 可以關掉安全檢查的旋鈕，卻看不到它為什麼不能被轉。
 *
 * `PRE-12` 的不變條件（**未被本輪放寬**）：
 * production 下 `API_BASE_URL` 缺漏／非絕對 URL／非 http(s)／指向 loopback，
 * 一律 throw，不得靜默回退 localhost。
 *
 * 這裡是**純函式**測試（不開瀏覽器），與 `support-entry.spec.ts` 的
 * 「純函式 ＋ source scan」分層是同一套作法。
 */

const WEB_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..", "..");

/** 在受控 env 下執行，結束後完整還原（含原本就 undefined 的鍵）。 */
function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const k of Object.keys(patch)) saved.set(k, process.env[k]);
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** 真實 production：沒有 harness 旗標。 */
const REAL_PRODUCTION = {
  NODE_ENV: "production",
  E2E_ALLOW_LOOPBACK_API_BASE_URL: undefined,
} as const;

test.describe("DX-23 — 真實 production 仍然 fail closed（PRE-12 不變條件）", () => {
  test("127.0.0.1 在真實 production 仍被拒絕", () => {
    withEnv({ ...REAL_PRODUCTION, API_BASE_URL: "http://127.0.0.1:3000" }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/loopback host/);
    });
  });

  test("localhost 在真實 production 仍被拒絕", () => {
    withEnv({ ...REAL_PRODUCTION, API_BASE_URL: "http://localhost:3000" }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/loopback host/);
    });
  });

  test("其餘 loopback 形式（::1／0.0.0.0／*.localhost／127.x）同樣被拒絕", () => {
    for (const url of [
      "http://[::1]:3000",
      "http://0.0.0.0:3000",
      "http://api.localhost:3000",
      "http://127.9.9.9:3000",
    ]) {
      withEnv({ ...REAL_PRODUCTION, API_BASE_URL: url }, () => {
        expect(() => getServerApiBaseUrl(), `${url} 必須被拒絕`).toThrow(/loopback host/);
      });
    }
  });

  test("未設定 / 非絕對 URL / 非 http(s) 在 production 仍然 throw", () => {
    withEnv({ ...REAL_PRODUCTION, API_BASE_URL: undefined }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/is not set/);
    });
    withEnv({ ...REAL_PRODUCTION, API_BASE_URL: "not-a-url" }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/not a valid absolute URL/);
    });
    withEnv({ ...REAL_PRODUCTION, API_BASE_URL: "ftp://example.com" }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/http: or https:/);
    });
  });

  test("非 loopback 的 production 值正常通過（例如 Render 主機名）", () => {
    withEnv(
      { ...REAL_PRODUCTION, API_BASE_URL: "https://teaching-platform-backend.onrender.com" },
      () => {
        expect(getServerApiBaseUrl()).toBe("https://teaching-platform-backend.onrender.com");
      }
    );
  });
});

test.describe("DX-23 — harness 例外的精確範圍", () => {
  test("harness 旗標只鬆綁 loopback：E2E harness 可連到自己的 backend", () => {
    withEnv(
      {
        NODE_ENV: "production",
        E2E_ALLOW_LOOPBACK_API_BASE_URL: "1",
        API_BASE_URL: "http://127.0.0.1:3000",
      },
      () => {
        expect(getServerApiBaseUrl()).toBe("http://127.0.0.1:3000");
      }
    );
  });

  test("旗標**不會**放寬其他任何驗證", () => {
    const on = { NODE_ENV: "production", E2E_ALLOW_LOOPBACK_API_BASE_URL: "1" };
    withEnv({ ...on, API_BASE_URL: undefined }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/is not set/);
    });
    withEnv({ ...on, API_BASE_URL: "not-a-url" }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/not a valid absolute URL/);
    });
    withEnv({ ...on, API_BASE_URL: "ftp://127.0.0.1" }, () => {
      expect(() => getServerApiBaseUrl()).toThrow(/http: or https:/);
    });
  });

  test("只認精確值 '1' —— 近似的真值字串一律不生效", () => {
    for (const v of ["true", "TRUE", "yes", "on", "0", "", " 1", "1 "]) {
      withEnv(
        { NODE_ENV: "production", E2E_ALLOW_LOOPBACK_API_BASE_URL: v, API_BASE_URL: "http://127.0.0.1:3000" },
        () => {
          expect(() => getServerApiBaseUrl(), `${JSON.stringify(v)} 不得生效`).toThrow(/loopback host/);
        }
      );
    }
  });
});

test.describe("DX-23 — dev / test 行為未改變", () => {
  test("非 production 未設定時仍回退 localhost", () => {
    withEnv({ NODE_ENV: "development", API_BASE_URL: undefined }, () => {
      expect(getServerApiBaseUrl()).toBe("http://localhost:3000");
    });
  });

  test("非 production 下 loopback 一律允許，且不需要任何旗標", () => {
    withEnv(
      { NODE_ENV: "test", API_BASE_URL: "http://127.0.0.1:3000/", E2E_ALLOW_LOOPBACK_API_BASE_URL: undefined },
      () => {
        expect(getServerApiBaseUrl()).toBe("http://127.0.0.1:3000");
      }
    );
  });
});

test.describe("DX-23 — source-level 全稱命題", () => {
  /**
   * **這一條是本輪最重要的安全證明。**
   *
   * 例外之所以無法在真實部署生效，靠的不是「大家記得別設」，
   * 而是**部署設定裡根本沒有這個變數**。`render.yaml` 是 Render 兩個 service
   * 的唯一設定來源，只要它不宣告，部署環境就無從繼承。
   */
  test("render.yaml 不得宣告 E2E_ALLOW_LOOPBACK_API_BASE_URL", async () => {
    const yaml = await readFile(join(REPO_ROOT, "render.yaml"), "utf8");
    expect(yaml).not.toContain("E2E_ALLOW_LOOPBACK_API_BASE_URL");
    // 連 E2E_ 前綴的任何變數都不該出現在部署設定裡。
    expect(yaml).not.toMatch(/key:\s*E2E_/);
  });

  test("production 環境變數契約不得把它列為部署變數", async () => {
    const contract = await readFile(
      join(REPO_ROOT, "docs", "production-environment-contract.md"),
      "utf8"
    );
    // 契約文件可以「說明它存在且僅供測試」，但不得出現在 Render 宣告清單。
    expect(contract).not.toMatch(/^\s*-\s*key:\s*E2E_/m);
  });

  test("旗標只被 playwright.config.ts 注入，不得散落在 app / lib 執行路徑", async () => {
    const config = await readFile(join(WEB_ROOT, "playwright.config.ts"), "utf8");
    expect(config).toContain("E2E_ALLOW_LOOPBACK_API_BASE_URL");

    // 唯一讀取點必須是 server-api-base-url.ts。
    const accessor = await readFile(join(WEB_ROOT, "lib", "server-api-base-url.ts"), "utf8");
    expect(accessor).toContain("E2E_ALLOW_LOOPBACK_API_BASE_URL");

    for (const rel of [
      ["app", "api", "backend", "[...path]", "route.ts"],
      ["app", "api", "auth", "login", "route.ts"],
      ["app", "api", "auth", "register", "route.ts"],
    ] as const) {
      const text = await readFile(join(WEB_ROOT, ...rel), "utf8");
      expect(text, `${rel.join("/")} 不得自行讀取 harness 旗標`).not.toContain(
        "E2E_ALLOW_LOOPBACK_API_BASE_URL"
      );
    }
  });

  test("未引入廣義的 loopback 開關", async () => {
    const accessor = await readFile(join(WEB_ROOT, "lib", "server-api-base-url.ts"), "utf8");
    expect(accessor).not.toMatch(
      /process\.env(\.|\[["'])\s*(ALLOW_LOOPBACK|SKIP_URL_CHECK|DISABLE_URL_GUARD|ALLOW_LOCALHOST)/
    );
  });
});
