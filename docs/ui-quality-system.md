# UI Quality System

> **Status:** canonical，2026-09-29 建立（`UI-QA-CI`／`UI-QA-FONT`／`UI-QA-AXE`）。
> **本文件只定義「誰檢查什麼、何時檢查、擋不擋」。** 待辦與優先序一律在 `docs/pending-work-tracker.md`
> （`CLAUDE.md` §11）；設計規則本身在 `docs/ui-design-system.md`。

---

## 0. 一眼看懂

| Layer | 目的 | 工具 | 何時執行 | 擋不擋 | Owner | 產出的證據 |
| --- | --- | --- | --- | --- | --- | --- |
| **L0 Reference & Rules** | 設計從哪裡來 | `docs/ui-design-system.md`、`docs/design-tokens-v1.1.md`、`globals.css`／`tailwind.config.ts`、`lib/font-stack.ts`；Mobbin 等外部參考 | 設計與實作**之前** | **不是 gate**（輸入） | Owner | 規則文件本身 |
| **L1 Rule Checks** | 可機械判定的規則不得退步 | 既有 Playwright contract specs ＋ `@axe-core/playwright` | **每個 PR 與 push to `main`**（`.github/workflows/ui-quality.yml`） | ✅ **merge-blocking** | Claude／開發者維護 | CI 綠燈；失敗時的 `test-results/` artifact |
| **L2 Visual Regression** | 看得到的變化必須被人批准 | Playwright `toHaveScreenshot`（**未實作**） | 未來：每個 PR | 未來：差異須批准 | Owner 批准差異 | 未來：基準 PNG ＋ diff |
| **L3 Human Product Review** | 美感、層次、舒適度、品牌感 | Local UI Review 環境（`docs/ui-review-environment.md`）＋ `tests/ui-review/measure-layout.mjs` 截圖；AI 僅作 triage | UI 批次完成時 | Owner 決定 | **Owner** | `docs/ui-review-findings-*.md`、tracker 條目 |
| **L4 Release Verification** | 發布前在真實條件下確認 | 未來：Lighthouse（release-only）、WebKit／Firefox smoke、真機 iOS Safari；**現在**：完整 E2E、`smoke`、`postman` | 重要發布之前 | release checklist | Owner | release 紀錄 |

**AI 的位置：** L3 的 triage 與一致性分析、L1 規則的撰寫與維護。**AI 從不決定 pass／fail** ——
L1 由程式判定，L3 由 Owner 判定。

---

## 1. L0 — Reference & Rules

- 是**輸入**，不是檢查。沒有任何 CI 步驟「驗證 Mobbin」。
- 字型的單一來源是 `frontend/apps/web/lib/font-stack.ts`（見 §5）。
- 新規則若可以機械判定，應同時補一條 L1 contract spec，否則它只存在於文件裡。

## 2. L1 — Rule Checks（merge-blocking）

### 2.1 執行者

`.github/workflows/ui-quality.yml`，觸發：`pull_request`、`push` to `main`、`workflow_dispatch`；
`docs/**` 與 `*.md` 的純文件變更不觸發。

| Job | 內容 | 需要 DB |
| --- | --- | --- |
| `backend-unit` | `npm run test:unit --prefix Backend`（含 UI Review guard 與 CI DB guard 的回歸） | 否 |
| `ui-quality` | `verify:web` → 準備拋棄式 DB → `test:e2e:ui-quality`（desktop 1440 ／ mobile 390）→ `test:e2e:ci` | 是（service container） |

本機等價指令（在 `frontend/apps/web`，先跑過 `npm run verify:web`）：

```bash
E2E_SERVER=production npm run test:e2e:ui-quality
```

### 2.2 分工：contract specs vs axe（不重複）

| 來源 | 負責 | 例子 |
| --- | --- | --- |
| **既有 contract specs** | **本專案自己的**數值／設計規則 —— axe 不知道這些規則 | 觸控目標 ≥ 44×44（`accessibility-contract`）、canonical 配色 ≥ 4.5:1（`contrast-contract`）、一頁恰好一層 gutter（`layout-contract`）、一個頁面標題字級（`typography-hierarchy-contract`）、側欄斷點（`responsive-nav-contract`）、focus-visible、heading／nav 語意 |
| **axe**（`tests/e2e/axe-accessibility.spec.ts`） | **標準化**無障礙規則的廣度覆蓋：WCAG 2.0／2.1／2.2 A＋AA 與 best-practice | name／role／value、label、landmark、aria 屬性合法性、**實際渲染**的對比 |

兩者重疊的只有「對比」：contract spec 驗**設計 token 本身**合格；axe 驗**畫面上實際出現的組合** ——
`UI-QA-A11Y-01` 正是 token 合格、但有 15 處繞過 `Button` 手寫 `bg-edu-primary text-white` 的情形。

`test:e2e:ui-quality` 的 spec 清單是**唯一來源**（`frontend/apps/web/package.json`），CI 與本機都跑同一份。

### 2.3 axe 的 gate 政策

- 規則集：`wcag2a`、`wcag2aa`、`wcag21a`、`wcag21aa`、`wcag22aa`、`best-practice`。
- **`critical`／`serious` → 失敗**；`moderate`／`minor` → 只列在報告（annotation ＋ 每頁一份 JSON attachment）。
- 路由（16 條 × 2 個 viewport ＝ 32 次掃描）：public `/`、`/materials`、`/materials/:id`、`/login`；
  buyer `/dashboard`、`/me/orders`、`/favorites`、`/me/materials`；
  creator `/creator/materials`、`/creator/sales`、`/creator/cases`；
  admin `/admin`、`/admin/orders`、`/admin/reports`、`/admin/payment-proofs`、`/admin/remedy-cases`。
- 資料：client 端 API 以 mock 供應（deterministic）；`/materials/:id` 是 server component，讀 migration seed。
- **假綠防線：** 每條路由都斷言掃描時停留的 URL 就是目標路由（被導向 `/login` 不算通過），
  而且畫面**不是** `app/error.tsx`（500）或 `app/not-found.tsx`（404）—— mock payload 形狀不對時，
  URL 仍然正確但頁面已崩潰（CI 首次實跑在 typography contract 上實際發生過）。

### 2.4 例外政策

- 例外只能寫在 `axe-accessibility.spec.ts` 的 `KNOWN_EXCEPTIONS`，每條都是
  **路由 ＋ rule ＋ 節點 selector ＋ project** 的精確組合，並**必須**附 tracker ID。
- **禁止**全域停用規則、禁止整條路由略過、禁止沒有 tracker ID 的條目。
- 例外若已不再發生，test 會**失敗**（stale exception）—— 修好缺陷後必須刪掉對應條目。
- 現有例外全部是**已立案的既有缺陷**（`UI-QA-A11Y-01`／`-02`／`-03`），不是「可以接受」。

### 2.5 L1 的已知覆蓋缺口

mock 資料不會產生每一種真實狀態。2026-09-29 以 Local UI Review fixture（真實資料、真實登入）
另跑一次 axe，找到 gate 目前**掃不到**的 serious 違規，已立案為 `UI-QA-A11Y-04`～`-06`。
UI Review 的 axe sweep 目前是**一次性的證據**，不是常設工具（見 tracker）。

## 3. L2 — Visual Regression（未實作）

**尚未建立任何 screenshot 基準，也沒有 committed PNG。** 前置條件：

1. **P1 版面缺陷先修** —— 否則基準會把已知缺陷鎖進去。現況需先處理 `UI-REV-A`（教材列表零 gutter、
   `/dashboard` gutter 不隨斷點、`/terms`／`/403` 固定 16px、gutter ownership 契約矛盾）。
2. **字型渲染必須 deterministic** —— `UI-QA-FONT` 已完成（§5）。

核准的做法：

- Playwright `toHaveScreenshot`，**基準只在固定的 Linux 容器／CI 環境產生**。
  Playwright 會依作業系統區分基準檔名，Windows 上截的圖不得作為 canonical 基準。
- 起始範圍有界：**約 15 條關鍵路由 × 3 個寬度（390／768／1440）**，不是全部路由 × 全部寬度。
- 路由清單沿用 `tests/ui-review/measure-layout.mjs` 的 route manifest，**不另建第二套截圖系統**。
- 會變的區域（日期、訂單編號）必須 mask。

## 4. L3 — Human Product Review

- 環境：`docs/ui-review-environment.md`（frontend :3110 → backend :3100 → `teaching_platform_ui_review`）。
- `measure-layout.mjs` 產生 route × viewport 截圖與量測數字；判讀與分級寫進 `docs/ui-review-findings-*.md`，
  有證據的缺陷進 tracker。
- AI 可以做 triage（找出不一致、量測、分組根因），**最終判斷屬於 Owner**。

## 5. 字型 determinism（`UI-QA-FONT`）

**機制：** 字型檔自架 —— `@fontsource-variable/inter` 與 `@fontsource-variable/noto-sans-tc`
（SIL OFL 1.1，版本釘死於 lockfile），由 `app/layout.tsx` 匯入 CSS，建置時打包進
`_next/static/media`。**建置、dev、測試都不連任何字型 CDN。** Noto Sans TC 仍是 105 個 unicode-range
切片，瀏覽器只下載頁面用到的切片（實測 `/materials` 載入 11 個 woff2）。

**唯一的字型堆疊**在 `frontend/apps/web/lib/font-stack.ts`：

```
"Inter Variable", "Noto Sans TC Variable", ui-sans-serif, system-ui, sans-serif
```

`<body>`、Tailwind `font-sans`、Tamagui `body`／`heading` 三處都指向它。

**為什麼需要三處：** 修正前實測 `/materials`（1440）的可見文字節點 —— `<body>` 的 Noto 堆疊 **0** 個、
`TamaguiProvider` 的 `span.font_body`（`Inter, -apple-system, system-ui …`）10 個、Tailwind 預設 `font-sans`
（`ui-sans-serif, system-ui …`）145 個。**中文一律落到作業系統字型**，Noto Sans TC 從未被畫出來；
另外 `next/font/google` 在 `next dev` 對 105 個切片各給 3 秒逾時，任一失敗整族退回 fallback。
修正後同一頁 156 個可見文字節點**全部**使用同一個堆疊，對字型 CDN 的請求為 **0**。

**視覺影響（刻意、已記錄）：** 中文由「各作業系統自己的 CJK 字型」改為 Noto Sans TC（文件原本就指定的主字型）；
拉丁字母維持 Inter。若 Owner 偏好 Noto 同時負責拉丁字母，只需對調 `font-stack.ts` 的前兩項。

`system-ui` 只剩 emoji 等兩個字型都沒有的字元會用到 —— 截圖基準時 emoji 區域應 mask 或避免。

## 6. 刻意不在 CI 的東西

| 項目 | 狀態 | 理由 |
| --- | --- | --- |
| 完整 E2E（`npm run test:e2e`）、`npm run smoke`、`npm run postman` | **人工 release gate**（`CLAUDE.md` §7） | 需要 `TEST_ADMIN_*` 等真實測試帳號憑證；`CLAUDE.md` 禁止改成 fallback 或寫死 |
| `npm run test:db --prefix Backend` | 人工 | 需 seed 過的 security test DB；非 UI scope |
| UI Review axe sweep | 一次性證據 | 需要 UI Review 資料庫與 fixture 帳號密碼 |
| Lighthouse | **L4，release-only，未實作** | 見 §7 |
| WebKit／Firefox／iOS Safari | **L4，未實作** | 見 §7 |

**成本：** GitHub-hosted runner 的分鐘數是否計費取決於 repository 的可見性與帳號方案 ——
**這是帳號層級的事實，repo 內看不到**，需 Owner 自行確認。

## 7. 未來工具

| 工具 | 狀態 | 何時重新考慮 |
| --- | --- | --- |
| Playwright screenshot 基準 | **下一步（L2）**，blocked on `UI-REV-A` | P1 版面缺陷修完之後 |
| WebKit ／ Firefox critical-path smoke | LATER | L2 建立之後；以 Playwright project 實作，不用 SaaS |
| 真機 iOS Safari 抽查 | 重要發布前 | 人工 |
| Lighthouse CI | LATER，**release-only，不跑每個 PR** | 目標 `/`、`/materials`、`/materials/:id`、`/login`；accessibility／best-practices 可 assert，performance 先 warning-only |
| Percy | LATER ／ OPTIONAL | 只在：出現第二位需要 web 批准流程的 reviewer、git 管理的基準維護變得痛苦、或需要託管的跨瀏覽器截圖渲染 |
| Chromatic | 條件式 | 只有在採用 Storybook 之後 |
| Storybook | SKIP | 元件層很小（`ui` 11 ＋ `ds` 11），已知缺陷都在頁面／外殼層 |
| Applitools | OUT OF SCOPE | |
| BrowserStack | SKIP | WebKit project ＋ 真機抽查已涵蓋主要風險 |

## 8. 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-09-29 | 建立。L1 CI gate（`UI-QA-CI`）、字型自架（`UI-QA-FONT`）、axe gate（`UI-QA-AXE`） |
