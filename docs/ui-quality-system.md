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
| **L2 Visual Regression** | 看得到的變化必須被人批准 | Playwright `toHaveScreenshot`（`tests/visual/`，Linux 基準） | 每個 PR 與 push to `main`（`ui-quality.yml` 的 `visual` job） | ✅ 有差異即紅；更新基準須人工審閱 | Owner 批准差異 | `*-linux.png` 基準 ＋ 失敗時的 diff artifact |
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
| `visual` | UI Review fixture → production build → 視覺回歸（48 張 Linux 基準）＋ 真實資料 axe（76 次掃描） | 是（runner 預裝 PostgreSQL，loopback） |

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
`UI-QA-A11Y-01` 正是 token 合格、但有 15 處繞過 `Button` 手寫 `bg-edu-primary text-white` 的情形
（2026-09-29 已解決：品牌紫改為 `#5C4EEA`，白字 5.63:1，例外移除）。

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
- **現有例外：0 條**（mock gate 與真實資料 gate 皆然）。最後一條 `UI-QA-A11Y-03`（Hero CTA 寫死舊 flow 色）於 2026-09-30
  隨商業配色落地（`UI-QA-COMMERCE-COLOR`）修正後移除。
  `UI-QA-A11Y-01` 的 7 條（品牌紫）與 `UI-QA-A11Y-02` 的 12 條（買家側欄標題）已於 2026-09-29 隨修正移除 ——
  兩次都是 gate 先把例外判為 stale 才刪除，例外機制如設計般運作：修好即刪。

### 2.5 L1 的已知覆蓋缺口

mock 資料不會產生每一種真實狀態。2026-09-29 以 Local UI Review fixture（真實資料、真實登入）
另跑 axe，找到 gate **掃不到**的 serious 違規（`UI-QA-A11Y-04`～`-06`，皆已修正）。
修正後同一 sweep（20 路由 × 1440／390）只剩 `UI-QA-A11Y-03` 的待決粉色（2026-09-30 亦已修正）。
**2026-09-30 起真實資料 axe 已是 CI gate（`UI-QA-A11Y-SWEEP`）**：`tests/visual/ui-review-a11y.spec.ts`，
跑在 `visual` job，`routes.json` 中 `a11y !== false` 的 **38 條路由 × 1440／390 ＝ 76 次掃描**（約 2.5 分鐘），
與 mock gate 共用 `tests/shared/axe-policy.ts`（規則集、critical／serious 阻擋、精確例外與 stale 檢查），
與視覺回歸共用 `tests/visual/ui-review-harness.ts`（登入、外部圖片攔截、「頁面已穩定」判準）。
`/terms` 以 `a11y: false` 明文排除（UI Review 沒有已發布條文，會渲染 404 —— 掃它等於假綠）。
首次擴大覆蓋就在未曾掃過的路由找到 3 組 serious 違規並已修正（`/register` 角色卡說明、教學回饋列表評分、
legacy Tamagui 按鈕的舊粉色 token）。

**另一種假綠（2026-09-29 修正）：** axe gate 的 catch-all mock 曾把教材詳情的 client 端請求回成空清單，
使該路由掃到的是「找不到教材」狀態。現在 seed 教材放行到真實 backend，且每次掃描前都要求
`<main>` 內已有頁面標題、不是 500／404 頁。

## 3. L2 — Visual Regression（`UI-QA-VISUAL-BASELINE`）

### 3.1 架構

| 項目 | 內容 |
| --- | --- |
| spec | `frontend/apps/web/tests/visual/ui-review-visual.spec.ts`（`toHaveScreenshot`） |
| config | `frontend/apps/web/playwright.visual.config.ts`（`npm run test:visual`） |
| 資料 | Local UI Review fixture（`teaching_platform_ui_review`，`npm run ui-review:reset`），真實登入 |
| 拓撲 | `next start`（production build）:3111 → UI Review backend :3100 → UI Review DB |
| 範圍 | `tests/ui-review/routes.json` 中 `visual: true` 的 **16 條路由 × 390／768／1440 ＝ 48 張**，第一屏（viewport） |
| 基準 | `tests/visual/__screenshots__/*-linux.png` —— **只在 Linux（GitHub Actions）產生與比對** |
| 容忍度 | `maxDiffPixelRatio: 0.002`（同一 runner 上的反鋸齒）；動畫停用、游標隱藏、`locale zh-TW`、`timezone Asia/Taipei` |
| 重試 | **0** —— 不穩定的截圖要讓它紅，而不是被重試蓋掉 |

**路由清單只有一份**：`tests/ui-review/routes.json`。`measure-layout.mjs` 讀同一份，
但它是**診斷用**的截圖矩陣與版面量測（輸出到 git-ignored 的 `out/`），**不是基準**。
canonical 基準只有 `tests/visual/`。

**為什麼 CI 用 runner 預裝的 PostgreSQL**：UI Review 的四層護欄要求連線後 `inet_server_addr()` 為 loopback，
而 service container 經 Docker 埠映射會回報 bridge 位址。護欄刻意沒有後門，因此改環境而不是改護欄。

### 3.2 何時才截圖（頁面已穩定的證據，全部成立）

1. 停留的 URL 就是目標路由
2. `<main>` 內已有頁面標題（頁面會先在外殼之外掛載一次，見 tracker `UI-QA-SHELL-MOUNT`）
3. 不是 500／404 頁
4. network idle、`<main>` 內沒有「載入中」、字型載入完成、**第一屏內**的圖片 `load`／`error` 完成
5. `toHaveScreenshot` 自己再要求連續兩張相同

每個階段是具名 `test.step`、各自有遠小於 test 逾時的上限 —— 失敗時看得出卡在哪一步。

### 3.3 正規化與遮罩（只處理真正會變的東西）

| 對象 | 處理 | 理由 |
| --- | --- | --- |
| 日期／時間文字 | **正規化**：數字換成 `0`（`2026/09/29` → `0000/00/00`） | fixture 時間以 seed 當下為基準的相對偏移，絕對日期每天不同。**不用遮罩** —— 以 `getByText` 遮罩曾命中整個容器（Admin 總覽兩整塊面板被塗滿），等於不驗那一區 |
| 待 Owner 決定的粉色（`#FF6B73`／`#FF6B7A`） | **遮罩**（只遮該元素） | 不把已知不合格的顏色鎖進基準；選定並套用後 class 消失、遮罩自動失效，屆時依 §3.5 重新產生基準 |
| 外部圖片（backend 為無封面教材補的 `picsum.photos`） | 以本機固定灰圖取代；其他外部請求一律中止 | 基準不得依賴外部服務 |

**不遮大區塊**：若某區不穩定是因為產品本身不穩定，修產品，不遮罩。

### 3.4 差異審閱政策

visual job 紅燈時，下列任何一種差異都**必須**由人（Owner）看過 diff 才能接受：
版面位移、間距、字級／字重／字型、顏色、元件尺寸、內容層級、響應式行為（斷點、側欄、抽屜）。
**沒有「自動更新基準」**：config 的 `updateSnapshots` 為 `none`；失敗時上傳 `visual-diffs` artifact
（expected／actual／diff 三張圖）。

### 3.5 基準更新流程（刻意的人工步驟）

1. 確認差異是**預期的**（例如 Owner 核准的設計變更）
2. 在 GitHub Actions 手動執行 `UI Quality`，勾選 `update_visual_baselines`
3. 下載 `visual-baselines-linux` artifact，**逐張審閱**後覆蓋 `tests/visual/__screenshots__/`
4. 以 `visual_repeat_each` ≥ 3 再跑一次比對，確認新基準穩定
5. 以獨立 commit 進版控，commit message 說明是哪一個核准的變更

**本機（Windows／macOS）**：spec 預設 skip；`VISUAL_ALLOW_NON_LINUX=1` 可在本機做穩定度檢查，
產生的 `-win32`／`-darwin` 檔已被 `.gitignore` 排除，**不得**作為基準。

### 3.6 建立時的穩定度證據（2026-09-29）

- 本機（Windows，與 CI 同為 2 workers、0 retry）：48 張 × 5 次重複 ＝ **240／240**
- 建立過程修掉的不穩定根因（皆為 spec 端，非產品）：第一屏外 lazy 圖片永遠不載入；
  `<img>` 沒有 `loadend` 事件（曾在負載下間歇逾時）；日期遮罩命中整個容器
- Linux：基準由 CI run `36604515083` 產生、逐張審閱後進版控；run `36605420000` 以 `--repeat-each=3` 比對 **144／144**
- 審閱基準時另發現並修正：購物車手機版標題被擠成一個字（`UI-REV-D`）、中文日期未正規化；
  另立 `UI-REV-E`（公開 `/materials` 行動版兩條頂欄）—— 已納入基準現況，修正後依 §3.5 更新
- visual job 約 4 分鐘、與其他 job 並行 —— 每個 PR 都跑，不需要切子集

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
| Playwright screenshot 基準 | ✅ **已建立（L2，§3）** | 粉色選定後重新產生基準 |
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
| 2026-09-29 | 品牌紫 `#6C63FF` → `#5C4EEA`（Owner 選 B）；`UI-QA-A11Y-01` 例外移除 |
| 2026-09-29 | L2 建立：`toHaveScreenshot` 48 張 Linux 基準、`visual` CI job、差異審閱與基準更新政策；`UI-QA-A11Y-02` 例外移除 |
| 2026-09-30 | 商業配色落地（`Button intent="purchase"`，橘 `#FE8742` ＋ `#111827`）；`UI-QA-A11Y-03` 例外移除，axe 例外 0 條；購買路徑相關視覺基準重產 |
| 2026-09-30 | 真實資料 axe 進 CI（`UI-QA-A11Y-SWEEP`）；axe 政策抽出為 `tests/shared/axe-policy.ts`、UI Review harness 抽出為 `tests/visual/ui-review-harness.ts`；`SEC-04` 移除啟動時的封面補值後視覺基準重產 |
