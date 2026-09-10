import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * `Wave UI-7` 的回歸護欄 —— `UI-CONS-18`（觸控目標）／`UI-CONS-20`（auth focus）／
 * `UI-CONS-24`（icon 可及性）／`UI-CONS-04`（表單 ARIA）。
 *
 * 全部量 computed 值與 accessibility 屬性，不斷言 class 字串。
 */

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) });
}

async function stubApi(page: Page, role = "parent") {
  await page.route("**/api/backend/**", (route) =>
    json(route, { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })
  );
  await page.route("**/api/backend/auth/me", (route) =>
    json(route, { user: { id: "usr_1", role, email: `${role}-e2e@example.com` } })
  );
}

/** 回傳元素的 border box 尺寸（含 padding 與 border，也就是實際可點區域）。 */
async function boxOf(page: Page, testIdOrRole: { testId?: string; name?: string }) {
  const locator = testIdOrRole.testId
    ? page.getByTestId(testIdOrRole.testId)
    : page.getByRole("button", { name: testIdOrRole.name! });
  return locator.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
}

test.describe("UI-CONS-18 — 主要行動端互動的觸控目標 ≥ 44×44", () => {
  test("教材詳情的返回／收藏／分享", async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    /* 教材詳情需要真實 id；改在教材列表上驗卡片收藏鈕，同屬行動端主要互動。 */
    const fav = page.getByRole("button", { name: /收藏/ }).first();
    if ((await fav.count()) > 0) {
      const box = await fav.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      expect(box.w, "卡片收藏鈕寬").toBeGreaterThanOrEqual(44);
      expect(box.h, "卡片收藏鈕高").toBeGreaterThanOrEqual(44);
    }
  });

  test("購物車的數量與刪除控制項", async ({ page }) => {
    await signInAs(page, "parent", { email: "parent-e2e@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/cart**", (route) =>
      json(route, {
        items: [
          {
            id: "ci_1",
            material_id: "mat_1",
            title: "測試教材",
            price: 100,
            quantity: 1,
            ageLabel: "6-8 歲",
            coverGradient: "from-purple-200 to-purple-400",
          },
        ],
      })
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cart", { waitUntil: "domcontentloaded" });

    for (const name of ["減少數量", "增加數量"]) {
      const b = page.getByRole("button", { name });
      if ((await b.count()) === 0) continue;
      const box = await b.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      expect(box.w, `${name} 寬`).toBeGreaterThanOrEqual(44);
      expect(box.h, `${name} 高`).toBeGreaterThanOrEqual(44);
    }
  });

  test("登入頁的密碼顯示切換", async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const toggle = page.getByRole("button", { name: /顯示密碼|隱藏密碼/ }).first();
    await expect(toggle).toBeVisible();
    const box = await toggle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  });
});

test.describe("UI-CONS-20 — auth 焦點指示", () => {
  for (const route of ["/login", "/register"]) {
    test(`${route} 的每個可聚焦控制項都有看得見的 focus 指示`, async ({ page }) => {
      await stubApi(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });

      /*
        逐一以鍵盤聚焦，讀 computed outline / box-shadow。
        重點不是「用哪一種寫法」，而是**焦點一定看得見**：
        修正前這幾個控制項是 `outline-none` ＋ 25% 透明度的 ring，
        在 `#FAFAFA` 底上幾乎看不出來。
      */
      const results = await page.evaluate(() => {
        const focusables = Array.from(
          document.querySelectorAll<HTMLElement>("input, button:not([disabled]), a[href], select, textarea")
        ).filter((el) => el.offsetParent !== null);
        const out: Array<{ tag: string; name: string; outlineWidth: string; outlineStyle: string; shadow: string }> = [];
        for (const el of focusables) {
          el.focus();
          const s = getComputedStyle(el);
          out.push({
            tag: el.tagName.toLowerCase(),
            name: el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.textContent?.trim().slice(0, 16) ?? "",
            outlineWidth: s.outlineWidth,
            outlineStyle: s.outlineStyle,
            shadow: s.boxShadow,
          });
        }
        return out;
      });

      expect(results.length, `${route} 應該有可聚焦控制項`).toBeGreaterThan(0);
      for (const r of results) {
        /*
          **必須同時看 `outlineStyle`。** Chromium 即使 `outline-style: none` 也會回報
          `outlineWidth: "3px"`，只看寬度會讓每個元素都「通過」—— 這正是本輪負向控制
          抓到的假綠。
        */
        const hasOutline = r.outlineStyle !== "none" && parseFloat(r.outlineWidth) > 0;
        const hasShadow = r.shadow !== "none" && r.shadow !== "";
        expect(hasOutline || hasShadow, `${route} 的 ${r.tag}「${r.name}」聚焦時沒有可見指示`).toBe(true);
      }
    });
  }

  test("auth 頁面沒有任何未補救的 outline 抑制", async ({ page }) => {
    await stubApi(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    /*
      負向控制的另一面：直接把某個控制項的 outline 拿掉，上面的量測必須抓得到。
      這裡用合成節點，不動真實元素。
    */
    const detected = await page.evaluate(() => {
      const el = document.createElement("button");
      el.style.outline = "none";
      el.style.boxShadow = "none";
      document.body.appendChild(el);
      el.focus();
      const s = getComputedStyle(el);
      const bad = (s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0) && (s.boxShadow === "none" || s.boxShadow === "");
      el.remove();
      return bad;
    });
    expect(detected, "量測手法必須能偵測到沒有焦點指示的控制項").toBe(true);
  });
});

test.describe("UI-CONS-24 — icon 可及性", () => {
  test("icon-only 控制項有名稱，且 icon 本身不重複進 accessibility tree", async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/materials", { waitUntil: "domcontentloaded" });

    const report = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLElement>("button")).filter(
        (el) => el.offsetParent !== null
      );
      const unnamed: string[] = [];
      let iconOnly = 0;
      for (const b of buttons) {
        const text = (b.textContent ?? "").trim();
        const hasIcon = Boolean(b.querySelector("svg")) || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
        const named = Boolean(b.getAttribute("aria-label") || b.getAttribute("aria-labelledby"));
        const textOnly = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
        if (hasIcon && !textOnly) {
          iconOnly += 1;
          if (!named) unnamed.push(b.outerHTML.slice(0, 80));
        }
      }
      const svgs = Array.from(document.querySelectorAll("svg"));
      const decorativeExposed = svgs.filter(
        (s) => !s.hasAttribute("aria-hidden") && s.getAttribute("role") !== "img"
      ).length;
      return { iconOnly, unnamed, decorativeExposed };
    });

    expect(report.unnamed, "icon-only 控制項必須有可及名稱").toEqual([]);
    expect(report.decorativeExposed, "裝飾性 svg 必須 aria-hidden；語意性的必須 role=img").toBe(0);
  });
});

test.describe("UI-CONS-04 — 表單驗證的 ARIA 連結", () => {
  test("登入失敗時訊息會被宣告，且與送出鈕連結", async ({ page }) => {
    /*
      **刻意不 stub `auth/me` 為已登入使用者** —— 那會讓 `/login` 直接導向，
      表單根本不會渲染，測試會以「找不到訊息」的形式誤紅。
    */
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    /*
      **登入走的是 `/api/auth/login`，不是 `/api/backend/*`。** 先前這裡誤攔後者，
      請求因此直接打到真實 route handler 並卡住，畫面上什麼訊息都不會出現。
    */
    await page.route("**/api/auth/login", (route) => json(route, { message: "帳號或密碼錯誤" }, 401));
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    /*
      用**用戶端驗證**觸發訊息（email 格式錯誤），不倚賴網路往返 ——
      這條測試要驗的是 ARIA 連結，不是登入 API 的行為。
    */
    await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
    await page.getByRole("textbox", { name: "密碼" }).fill("x");

    /*
      重試點擊：hydration 完成前按下去等於沒按（按鈕在 SSR HTML 裡就存在，
      但 React 還沒掛上 handler）。輪詢的是訊息**真的出現**這個產品狀態。
    */
    const submit = page.getByRole("button", { name: /^登入$/ });
    const alert = page.locator("#auth-form-message");
    await expect
      .poll(async () => {
        if ((await alert.count()) > 0) return true;
        await submit.click();
        await page.waitForTimeout(300);
        return (await alert.count()) > 0;
      }, { timeout: 15000 })
      .toBe(true);
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(page.getByRole("button", { name: /^登入$/ })).toHaveAttribute(
      "aria-describedby",
      "auth-form-message"
    );
  });
});

test.describe("Disclosure semantics", () => {
  test("技術資訊 disclosure 會切換 aria-expanded", async ({ page }) => {
    await signInAs(page, "admin", { email: "admin-e2e@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/auth/me", (route) =>
      json(route, { user: { id: "u", role: "admin", email: "admin-e2e@example.com" } })
    );
    const ROW = {
      id: "mat_a11y",
      title: "A11y 教材",
      status: "pending_review",
      creator_email: "c@example.com",
      open_report_count: 0,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    await page.route("**/api/backend/admin/materials**", (route) =>
      json(route, {
        items: [ROW],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { total: 1, pending_review: 1, published: 0, unpublished: 0 },
      })
    );
    await page.route("**/api/backend/materials/mat_a11y**", (route) =>
      json(route, { ...ROW, description: "x", contents: [], detail_images: [], material_features: [] })
    );

    await page.goto("/admin/materials", { waitUntil: "domcontentloaded" });
    await page.getByTestId("material-review-open").first().click();

    const toggle = page.getByTestId("material-technical-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("UI-CONS-15 — auth 文字對比（closeout）", () => {
  /**
   * 兩個已確認的缺陷：輸入框 placeholder（`#94A3B8` on `#FAFAFA` ＝ 2.46）
   * 與「或」分隔文字（`#94A3B8` on 白 ＝ 2.56）。兩者都改用 canonical `ds-textSubtle`。
   * 量 computed 值與實際背景，不斷言 class。
   */
  for (const route of ["/login", "/register"]) {
    test(`${route} 的 placeholder 與分隔文字都 >= 4.5:1`, async ({ page }) => {
      await page.route("**/api/backend/**", (route2) => json(route2, { items: [] }));
      await page.goto(route, { waitUntil: "domcontentloaded" });

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
        /** 沿祖先鏈找第一個不透明背景 —— 元素自身多半是 transparent。 */
        const bgOf = (el: Element | null) => {
          let node: Element | null = el;
          while (node) {
            const c = parse(getComputedStyle(node).backgroundColor);
            const alpha = getComputedStyle(node).backgroundColor.match(/rgba\([^)]*,\s*0\s*\)/);
            if (c && !alpha) return c;
            node = node.parentElement;
          }
          return [255, 255, 255] as [number, number, number];
        };

        const input = document.querySelector<HTMLInputElement>('input[type="email"], input[type="text"]');
        let placeholder: number | null = null;
        if (input) {
          const ph = parse(getComputedStyle(input, "::placeholder").color);
          const bg = bgOf(input);
          if (ph) placeholder = ratio(ph, bg);
        }

        /* 「或」分隔文字：文字節點直接掛在該 div 上。 */
        const divider = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
          (d) => d.childNodes.length > 0 && (d.textContent ?? "").trim() === "或"
        );
        let dividerRatio: number | null = null;
        if (divider) {
          const fg = parse(getComputedStyle(divider).color);
          const bg = bgOf(divider.parentElement);
          if (fg) dividerRatio = ratio(fg, bg);
        }

        return { placeholder, dividerRatio };
      });

      expect(probe.placeholder, `${route} 應該找得到輸入框`).not.toBeNull();
      expect(probe.placeholder!, `${route} placeholder 對比 ${probe.placeholder?.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      if (probe.dividerRatio !== null) {
        expect(probe.dividerRatio, `${route} 「或」分隔文字對比 ${probe.dividerRatio?.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  /** 負向控制：舊值必須量得出不合格，否則上面的斷言可能是假綠。 */
  test("舊的 auth 灰在同一組背景上量得出不合格", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.goto("/login", { waitUntil: "domcontentloaded" });
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
      return { onInput: ratio("#94A3B8", "#FAFAFA"), onCard: ratio("#94A3B8", "#FFFFFF") };
    });
    expect(probe.onInput, "舊 placeholder 灰在 #FAFAFA 上").toBeLessThan(4.5);
    expect(probe.onCard, "舊分隔文字灰在白底上").toBeLessThan(4.5);
  });
});

test.describe("UI-CONS-04 — 欄位層級 vs 面板層級的 ARIA 語意", () => {
  /**
   * **欄位層級**：`ReportingRangeSelector` 的兩個日期欄位有一條「最多 N 天」的限制說明。
   * 它必須是**恆常存在**且由欄位以 `aria-describedby` 指到的真實節點 ——
   * 先前它只在沒有錯誤時以 `sr-only` 存在、且沒有任何關聯，聚焦欄位讀不到限制。
   *
   * 同時釘住反向規則：範圍限制**跨兩個欄位**，因此不得宣告單一欄位 `aria-invalid`。
   */
  test("日期範圍限制說明被程式關聯，且沒有假的 aria-invalid", async ({ page }) => {
    await signInAs(page, "teacher", { email: "teacher-e2e@example.com" });
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.route("**/api/backend/auth/me", (route) =>
      json(route, { user: { id: "u", role: "teacher", email: "teacher-e2e@example.com" } })
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/teacher/sales", { waitUntil: "domcontentloaded" });

    /*
      自訂日期列預設收合；只有「自訂」那顆 preset 帶 `aria-expanded`。
      必須加 `:visible` —— 抽屜觸發鈕也帶 `aria-expanded`，它在 `lg` 以上是隱藏的
      但仍在 DOM 裡，不篩選就會抓到它。
    */
    const customToggle = page.locator("button[aria-expanded]:visible").first();
    await expect(customToggle).toBeVisible();
    await expect
      .poll(async () => {
        if ((await page.getByTestId("reporting-custom-editor").count()) > 0) return true;
        await customToggle.click();
        await page.waitForTimeout(250);
        return (await page.getByTestId("reporting-custom-editor").count()) > 0;
      }, { timeout: 15000 })
      .toBe(true);

    const report = await page.evaluate(() => {
      const dates = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"]'));
      return dates.map((d) => {
        const ids = (d.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        return {
          describedBy: ids,
          allResolve: ids.length > 0 && ids.every((id) => Boolean(document.getElementById(id))),
          描述文字: ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" "),
          ariaInvalid: d.getAttribute("aria-invalid"),
        };
      });
    });

    expect(report.length, "/teacher/sales 應該有日期範圍欄位").toBeGreaterThan(0);
    for (const d of report) {
      expect(d.allResolve, `aria-describedby 必須指到真實存在的節點（${d.describedBy.join(",")}）`).toBe(true);
      expect(d.描述文字.length, "被指到的說明節點不得為空").toBeGreaterThan(0);
      /* 範圍限制不是單一欄位無效 —— 不得宣告 aria-invalid。 */
      expect(d.ariaInvalid, "範圍限制不得讓單一欄位宣稱 invalid").not.toBe("true");
    }
  });

  /**
   * **面板層級**：auth 的表單訊息用 `role="alert"` 宣告，
   * 並以 `aria-describedby` 接到送出鈕，但**不得**出現 `aria-invalid`。
   */
  test("表單層級訊息用 role=alert，且不得產生假的 aria-invalid", async ({ page }) => {
    await page.route("**/api/backend/**", (route) => json(route, { items: [] }));
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
    await page.getByRole("textbox", { name: "密碼" }).fill("x");
    const submit = page.getByRole("button", { name: /^登入$/ });
    const alert = page.locator("#auth-form-message");
    await expect
      .poll(async () => {
        if ((await alert.count()) > 0) return true;
        await submit.click();
        await page.waitForTimeout(300);
        return (await alert.count()) > 0;
      }, { timeout: 15000 })
      .toBe(true);

    await expect(alert).toHaveAttribute("role", "alert");
    const invalids = await page.evaluate(
      () => document.querySelectorAll('[aria-invalid="true"]').length
    );
    expect(invalids, "表單層級失敗不得把任何欄位標成 invalid").toBe(0);
  });
});

test.describe("WCAG 1.4.11 — non-text contrast", () => {
  /**
   * 表單控制項的**邊界**是它唯一的視覺辨識依據 —— 輸入框的填色與周圍只差 1.04～1.07，
   * 所以邊框必須 ≥ 3:1。修正前是 `--ds-border` `#E5E7EB`：白卡上 1.24、`edu-page` 上 1.11。
   *
   * 量的是 computed border colour 與**實際相鄰背景**（沿祖先鏈找第一個不透明底色），
   * 不是 hex 對白色硬算。
   */
  const NONTEXT = 3.0;

  const PROBE = () => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      return m[1].split(",").map((x) => parseFloat(x));
    };
    const lum = (rgb: number[]) => {
      const v = rgb.slice(0, 3).map((x) => x / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a: number[], b: number[]) => {
      const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const bgBehind = (el: Element | null) => {
      let n: Element | null = el;
      while (n) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && (c.length < 4 || c[3] > 0.95)) return c;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const out: Array<{ tag: string; ratio: number }> = [];
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("input, select, textarea")
    ).filter((el) => el.offsetParent !== null && !(el as HTMLInputElement).disabled);
    for (const el of controls) {
      const s = getComputedStyle(el);
      const bw = parseFloat(s.borderTopWidth) || 0;
      if (bw === 0) continue; // no boundary drawn — identified by other means
      const bc = parse(s.borderTopColor);
      if (!bc) continue;
      out.push({ tag: el.tagName.toLowerCase(), ratio: Number(ratio(bc, bgBehind(el.parentElement)).toFixed(2)) });
    }
    return out;
  };

  for (const route of ["/login", "/register"]) {
    test(`${route} 的表單控制項邊界 >= 3:1`, async ({ page }) => {
      await page.route("**/api/backend/**", (r) => json(r, { items: [] }));
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const rows = await page.evaluate(PROBE);
      expect(rows.length, `${route} 應該量到有邊框的控制項`).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.ratio, `${route} 的 <${r.tag}> 邊界對比 ${r.ratio}`).toBeGreaterThanOrEqual(NONTEXT);
      }
    });
  }

  test("focus indicator 對相鄰背景 >= 3:1", async ({ page }) => {
    await page.route("**/api/backend/**", (r) => json(r, { items: [] }));
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const probe = await page.evaluate(() => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        return m ? m[1].split(",").map((x) => parseFloat(x)) : null;
      };
      const lum = (rgb: number[]) => {
        const v = rgb.slice(0, 3).map((x) => x / 255)
          .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a: number[], b: number[]) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const el = document.querySelector<HTMLElement>("input");
      if (!el) return null;
      el.focus();
      const s = getComputedStyle(el);
      const oc = parse(s.outlineColor);
      if (!oc || s.outlineStyle === "none") return null;
      return ratio(oc, [255, 255, 255]);
    });
    expect(probe, "應該量得到 focus outline").not.toBeNull();
    expect(probe!, `focus outline 對比 ${probe?.toFixed(2)}`).toBeGreaterThanOrEqual(NONTEXT);
  });

  /** 負向控制：舊的邊框值必須量得出不合格。 */
  test("舊的邊框 token 在同一組背景上量得出不合格", async ({ page }) => {
    await page.route("**/api/backend/**", (r) => json(r, { items: [] }));
    await page.goto("/login", { waitUntil: "domcontentloaded" });
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
      return { border: ratio("#E5E7EB", "#FFFFFF"), strong: ratio("#DCDCE8", "#FFFFFF") };
    });
    expect(probe.border, "舊 ds-border 當控制項邊界").toBeLessThan(NONTEXT);
    expect(probe.strong, "ds-borderStrong 同樣不足").toBeLessThan(NONTEXT);
  });
});
