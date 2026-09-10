import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `UI-CONS-01` 對比契約護欄（2026-09-07）。
 *
 * ## 為什麼不是比對色碼字串
 *
 * 斷言 `#554BFF` 這種字面值，在任何一次合理的色彩調整時都會紅，卻**從來沒有真的驗證
 * 使用者讀不讀得到**。這裡改成：從瀏覽器讀 **computed style**，自己算 WCAG 對比，
 * 斷言 **≥ 4.5:1**。換色、換 token 名稱、換元件內部實作都不會誤紅；
 * 但只要任何一組 canonical 配色掉回 AA 以下，一定會紅。
 *
 * ## 兩個來源都要驗
 *
 * 專案的 token 有**兩份**（`app/globals.css` 的 CSS 變數 ＋ `tailwind.config.ts` 的 hex，
 * 見 `docs/ui-design-system.md` §4.3 B11 的三來源漂移）。因此：
 *   1. `:root` 變數層 —— 直接讀 CSS 變數並計算；
 *   2. 實際渲染層 —— 讀真的畫出來的元件 computed style（走的是 Tailwind config 的 hex）。
 * 兩邊都測，才抓得到「只改了一邊」的漂移。
 */

const AA_NORMAL = 4.5;

/** 注入頁面內執行：把 `rgb()` / `rgba()` / hex 轉成相對亮度並算對比。 */
const CONTRAST_FN = `
function _toRgb(c) {
  c = c.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return [0, 2, 4].map(i => parseInt(f.substr(i, 2), 16));
  }
  const m = c.match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  return m[1].split(',').slice(0, 3).map(x => parseFloat(x));
}
function _lum(c) {
  const rgb = _toRgb(c);
  if (!rgb) return null;
  const v = rgb.map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(a, b) {
  const l1 = _lum(a), l2 = _lum(b);
  if (l1 === null || l2 === null) return null;
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
`;

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

const ROW = {
  id: "mat_contrast",
  title: "對比契約教材",
  status: "pending_review",
  creator_email: "creator-e2e@example.com",
  open_report_count: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

async function mockAdmin(page: Page) {
  await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_admin", role: "admin", email: "admin-e2e@example.com" } })
  );
  await page.route("**/api/backend/admin/materials**", (route) =>
    json(route, {
      items: [ROW],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      statusCounts: { total: 1, pending_review: 1, published: 0, unpublished: 0 },
    })
  );
  await page.route("**/api/backend/materials/mat_contrast**", (route) =>
    json(route, { ...ROW, description: "x", contents: [], detail_images: [], material_features: [] })
  );
}

test.describe("UI-CONS-01 — canonical status token pairs meet WCAG AA", () => {
  test("every --color-status-* pair in :root is >= 4.5:1", async ({ page }) => {
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const results = await page.evaluate(`(() => {
      ${CONTRAST_FN}
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      const pairs = [
        ['draft',          '--color-status-draft-text',           '--color-status-draft-bg'],
        ['pendingReview',  '--color-status-pending-review-text',  '--color-status-pending-review-bg'],
        ['published',      '--color-status-published-text',       '--color-status-published-bg'],
        ['unpublished',    '--color-status-unpublished-text',     '--color-status-unpublished-bg'],
        ['pendingPayment', '--color-status-pending-payment-text', '--color-status-pending-payment-bg'],
        ['approved',       '--color-status-approved-text',        '--color-status-approved-bg'],
        ['rejected',       '--color-status-rejected-text',        '--color-status-rejected-bg'],
        ['reviewed',       '--color-status-reviewed-text',        '--color-status-reviewed-bg'],
      ];
      return pairs.map(([name, f, b]) => ({ name, fg: v(f), bg: v(b), ratio: contrast(v(f), v(b)) }));
    })()`) as Array<{ name: string; fg: string; bg: string; ratio: number | null }>;

    expect(results.length).toBe(8);
    for (const r of results) {
      expect(r.ratio, `status.${r.name}: ${r.fg} on ${r.bg}`).not.toBeNull();
      expect(r.ratio!, `status.${r.name}: ${r.fg} on ${r.bg} = ${r.ratio?.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

test.describe("UI-CONS-01 — brand / intent / text tokens meet WCAG AA", () => {
  test("intent-flow, intent-action and ds-text-subtle all pass on their real backgrounds", async ({ page }) => {
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const out = await page.evaluate(() => {
      const toRgb = (c: string): number[] | null => {
        c = c.trim();
        if (c.startsWith("#")) {
          const h = c.slice(1);
          const f = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
          return [0, 2, 4].map((i) => parseInt(f.substr(i, 2), 16));
        }
        const m = c.match(/rgba?\(([^)]+)\)/);
        return m ? m[1].split(",").slice(0, 3).map((x) => parseFloat(x)) : null;
      };
      const lum = (c: string): number | null => {
        const rgb = toRgb(c);
        if (!rgb) return null;
        const v = rgb.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a: string, b: string) => {
        const l1 = lum(a), l2 = lum(b);
        return l1 === null || l2 === null ? null : (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const cs = getComputedStyle(document.documentElement);
      const v = (n: string) => cs.getPropertyValue(n).trim();
      const WHITE = "#FFFFFF";
      return [
        { name: "intent-flow (white text)", fg: WHITE, bg: v("--color-intent-flow") },
        { name: "brand-cta-hover (white text)", fg: WHITE, bg: v("--color-brand-cta-hover") },
        { name: "intent-action (white text)", fg: WHITE, bg: v("--color-intent-action") },
        { name: "ds-text-subtle on surface", fg: v("--ds-text-subtle"), bg: v("--ds-surface") },
        { name: "ds-text-subtle on ds-page", fg: v("--ds-text-subtle"), bg: v("--ds-page-bg") },
        { name: "ds-text-subtle on surfaceSubtle", fg: v("--ds-text-subtle"), bg: v("--ds-surface-subtle") },
        { name: "ds-text-body on surface", fg: v("--ds-text-body"), bg: v("--ds-surface") },
        /*
          `--ds-text-muted` 實際渲染在**六種**背景上（實測共現檔案數：
          surface 41／edu-page 21／surfaceMuted 10／surfaceSubtle 8／white 9／ds-page 3）。
          單一 canonical token 必須在全部背景都達 AA —— 這正是不建立
          `text-muted-on-page` 這類補丁 token 的前提。
        */
        { name: "ds-text-muted on surface", fg: v("--ds-text-muted"), bg: v("--ds-surface") },
        { name: "ds-text-muted on ds-page", fg: v("--ds-text-muted"), bg: v("--ds-page-bg") },
        { name: "ds-text-muted on surfaceSubtle", fg: v("--ds-text-muted"), bg: v("--ds-surface-subtle") },
        { name: "ds-text-muted on surfaceMuted", fg: v("--ds-text-muted"), bg: v("--ds-surface-muted") },
        /*
          `Button intent="danger"`：**solid 與 outline/ghost 走不同的 token**
          （solid = `--color-intent-danger`，outline/ghost 文字 = `edu-error`）。
          兩者必須同時通過，outline 的 hover 底色 `--color-feedback-error-bg` 也要算進去 ——
          那一面在核准當下沒有被量到（`#E81414` 在該底色只有 4.23）。
        */
        { name: "intent-danger solid (white text)", fg: WHITE, bg: v("--color-intent-danger") },
        { name: "intent-danger outline/ghost text on surface", fg: v("--color-intent-danger"), bg: v("--ds-surface") },
        { name: "intent-danger outline/ghost text on hover bg", fg: v("--color-intent-danger"), bg: v("--color-feedback-error-bg") },
      ].map((r) => ({ ...r, ratio: ratio(r.fg, r.bg) }));
    });

    for (const r of out) {
      expect(r.ratio, `${r.name}: ${r.fg} on ${r.bg}`).not.toBeNull();
      expect(r.ratio!, `${r.name}: ${r.fg} on ${r.bg} = ${r.ratio?.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  /**
   * 雙來源一致性：`--color-intent-danger`（CSS 變數）與 `edu.error`（Tailwind config hex）
   * 必須是同一個顏色。
   *
   * `Button intent="danger"` 的 **solid 走 CSS 變數**、**outline/ghost 文字走 config hex** ——
   * 兩個來源、同一個語意。只改一邊就會出現「實心是新紅、外框是舊紅」的靜默漂移。
   * 這裡不注入合成 class（Tailwind JIT 只會產生原始碼裡出現過的 class，
   * 執行期造出來的 `bg-intent-danger` 根本不存在），而是量**真的渲染出來的兩顆按鈕**。
   */
  test("intent-danger: solid fill and outline text resolve to the same colour", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    await page.getByTestId("material-review-open").first().click();

    // 「退回修改」= intent="danger" variant="outline"（文字色來自 edu.error / config）
    const outline = page.getByTestId("material-request-changes-open");
    await expect(outline).toBeVisible();
    const outlineText = await outline.evaluate((el) => getComputedStyle(el).color);

    // 開啟退回表單後，「確認退回」= intent="danger" solid（底色來自 CSS 變數）
    await outline.click();
    const solid = page.getByTestId("material-request-changes-confirm");
    await expect(solid).toBeVisible();
    const solidBg = await solid.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(
      outlineText,
      `outline 文字色 ${outlineText} 必須等於 solid 底色 ${solidBg}（兩個 token 來源必須同步）`
    ).toBe(solidBg);
  });

  /**
   * `intent="flow"` 的 hover **必須比 base 更暗**。
   *
   * 這不是美感偏好：舊的 hover `#FF5964` 比新的 base `#EA000D` 更亮，若沒有一起改，
   * 滑過去會變淺（看起來像 disabled），而且白字仍不合格。這條把那個關係釘住。
   */
  test("flow hover is darker than flow base", async ({ page }) => {
    await page.goto("/materials", { waitUntil: "domcontentloaded" });
    const { base, hover } = await page.evaluate(() => {
      const toRgb = (c: string): number[] => {
        const h = c.trim().replace("#", "");
        const f = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
        return [0, 2, 4].map((i) => parseInt(f.substr(i, 2), 16));
      };
      const lum = (c: string) => {
        const v = toRgb(c).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const cs = getComputedStyle(document.documentElement);
      return {
        base: lum(cs.getPropertyValue("--color-intent-flow").trim()),
        hover: lum(cs.getPropertyValue("--color-brand-cta-hover").trim()),
      };
    });
    expect(hover, "flow 的 hover 必須比 base 暗").toBeLessThan(base);
  });
});

/**
 * 在頁面內就地計算對比。
 *
 * 用**真正的函式**（而不是字串），因為 `locator.evaluate` 的字串形式是當成
 * 單一運算式求值，多行函式宣告會失效並回傳 `undefined` —— 那會讓斷言看起來
 * 「通過」卻其實沒量到任何東西。這裡把數學直接內嵌，不依賴外部 helper
 * （Playwright 序列化函式時帶不走 closure）。
 */
function measure(el: Element): { color: string; bg: string; ratio: number | null } {
  const toRgb = (c: string): number[] | null => {
    c = c.trim();
    if (c.startsWith("#")) {
      const h = c.slice(1);
      const f = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
      return [0, 2, 4].map((i) => parseInt(f.substr(i, 2), 16));
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map((x) => parseFloat(x)) : null;
  };
  const lum = (c: string): number | null => {
    const rgb = toRgb(c);
    if (!rgb) return null;
    const v = rgb.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const st = getComputedStyle(el);
  const l1 = lum(st.color);
  const l2 = lum(st.backgroundColor);
  const ratio = l1 === null || l2 === null ? null : (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return { color: st.color, bg: st.backgroundColor, ratio };
}

test.describe("UI-CONS-15 — 品牌色系的文字角色 token 在真實背景上達 AA", () => {
  /**
   * `edu-primary` (#6C63FF) 是**品牌**色，不是可用的文字色 ——
   * 白 4.32／`edu-page` 3.88／導覽 active tint 更低，全部不到 AA。
   * `--color-intent-action` (#655CFF) 也只在純白上過（4.64），`edu-page` 上 4.17。
   *
   * 因此文字角色由 `--ds-text-accent` 承擔。這裡量的是**真實渲染出來的顏色與背景**，
   * 不是 class 字串：換寫法不會誤紅，改壞值一定紅。
   */
  test("ds-text-accent 在白底與 edu-page 底上都 >= 4.5:1", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(() => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map((x) => parseFloat(x));
        return [p[0], p[1], p[2]] as [number, number, number];
      };
      const lum = (rgb: [number, number, number]) => {
        const v = rgb.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a: [number, number, number], b: [number, number, number]) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const read = (bg: string) => {
        const host = document.createElement("div");
        host.style.background = bg;
        const el = document.createElement("span");
        el.className = "text-ds-textAccent";
        el.textContent = "accent";
        host.appendChild(el);
        document.body.appendChild(host);
        const fg = parse(getComputedStyle(el).color);
        const back = parse(getComputedStyle(host).backgroundColor);
        host.remove();
        return fg && back ? ratio(fg, back) : null;
      };
      return { white: read("#FFFFFF"), eduPage: read("#F4F1FF"), navTint: read("#E4E0FF") };
    });

    expect(probe.white, "ds-text-accent on white").not.toBeNull();
    expect(probe.white!, `ds-text-accent on #FFFFFF = ${probe.white?.toFixed(2)}`).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(probe.eduPage!, `ds-text-accent on #F4F1FF = ${probe.eduPage?.toFixed(2)}`).toBeGreaterThanOrEqual(AA_NORMAL);
    /* 導覽 active 的 12% tint 疊在 edu-page 上，是本站最暗的實際文字背景。 */
    expect(probe.navTint!, `ds-text-accent on #E4E0FF = ${probe.navTint?.toFixed(2)}`).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * 負向控制：舊的兩個候選值必須**量得出**不合格 ——
   * 否則上面的斷言可能只是因為量測手法失效而變綠。
   */
  test("舊的品牌色與 intent-action 在同一組背景上量得出不合格", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(() => {
      const lum = (hex: string) => {
        const c = hex.replace("#", "");
        const v = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16) / 255)
          .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a: string, b: string) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      return {
        brandOnPage: ratio("#6C63FF", "#F4F1FF"),
        actionOnPage: ratio("#655CFF", "#F4F1FF"),
      };
    });

    expect(probe.brandOnPage, "edu-primary 當文字色在 edu-page 上").toBeLessThan(AA_NORMAL);
    expect(probe.actionOnPage, "intent-action 當文字色在 edu-page 上").toBeLessThan(AA_NORMAL);
  });
});

test.describe("UI-CONS-01 — rendered components meet WCAG AA", () => {
  test("StatusPill renders at >= 4.5:1 (Tailwind config side of the token)", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });

    const pill = page.getByTestId("status-pill").first();
    await expect(pill).toBeVisible();
    const m = await pill.evaluate(measure);
    expect(m.ratio, `StatusPill ${m.color} on ${m.bg}`).not.toBeNull();
    expect(m.ratio!, `StatusPill 對比 ${m.ratio?.toFixed(2)}:1（${m.color} on ${m.bg}）`).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('Button intent="success" renders white text at >= 4.5:1', async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await mockAdmin(page);
    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    await page.getByTestId("material-review-open").first().click();

    const approve = page.getByTestId("material-approve");
    await expect(approve).toBeVisible();
    const m = await approve.evaluate(measure);
    expect(m.ratio, `核准上架 ${m.color} on ${m.bg}`).not.toBeNull();
    expect(
      m.ratio!,
      `核准上架按鈕對比 ${m.ratio?.toFixed(2)}:1（${m.color} on ${m.bg}）`
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * 負向控制：證明上面的量測**真的抓得到**不合格的配色。
   *
   * 用一個**臨時的合成節點**，而不是去改真實按鈕的 inline style ——
   * 後者實測不可靠：React 會在量測前把 inline style 洗掉，於是「改回舊色」沒有生效，
   * 前後都量到 4.65，負向控制形同空跑。合成節點不受 React 管轄，結果是確定的，
   * 而且走的仍然是同一條 `getComputedStyle` 量測路徑。
   */
  test("the contrast measurement actually detects a failing colour", async ({ page }) => {
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(() => {
      const toRgb = (c: string): number[] | null => {
        c = c.trim();
        if (c.startsWith("#")) {
          const h = c.slice(1);
          const f = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
          return [0, 2, 4].map((i) => parseInt(f.substr(i, 2), 16));
        }
        const m = c.match(/rgba?\(([^)]+)\)/);
        return m ? m[1].split(",").slice(0, 3).map((x) => parseFloat(x)) : null;
      };
      const lum = (c: string): number | null => {
        const rgb = toRgb(c);
        if (!rgb) return null;
        const v = rgb.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const measureSwatch = (fg: string, bg: string) => {
        const d = document.createElement("div");
        d.style.color = fg;
        d.style.backgroundColor = bg;
        d.textContent = "probe";
        document.body.appendChild(d);
        const st = getComputedStyle(d);
        const a = lum(st.color);
        const b = lum(st.backgroundColor);
        const r = a === null || b === null ? null : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        d.remove();
        return r;
      };
      return {
        oldSuccess: measureSwatch("#FFFFFF", "#22C55E"),
        newSuccess: measureSwatch("#FFFFFF", "#178640"),
        oldInfo: measureSwatch("#6C63FF", "#EDE9FE"),
        newInfo: measureSwatch("#554BFF", "#EDE9FE"),
        oldPendingPayment: measureSwatch("#FF6B73", "#FFE4E6"),
        newPendingPayment: measureSwatch("#BE123C", "#FFE4E6"),
      };
    });

    // 舊值必須被判定為不合格 —— 否則這套量測沒有鑑別力
    expect(probe.oldSuccess!, "舊 success 填色 #22C55E").toBeLessThan(AA_NORMAL);
    expect(probe.oldInfo!, "舊 info #6C63FF on #EDE9FE").toBeLessThan(AA_NORMAL);
    expect(probe.oldPendingPayment!, "舊 pendingPayment #FF6B73 on #FFE4E6").toBeLessThan(AA_NORMAL);
    // 新值必須通過
    expect(probe.newSuccess!).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(probe.newInfo!).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(probe.newPendingPayment!).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
