# Local UI Review 環境

> **用途**：讓 Owner 只要「開網址 → 看畫面 → 回報問題」，其餘由工程端處理。
> **本文件不含任何憑證。** fixture 密碼在 git-ignored 的
> `Backend/.ui-review-credentials.txt`。

建立於 2026-09-29。

---

## 0. ⚠️ 安全邊界（先讀這一節）

| 項目 | 狀態 |
| --- | --- |
| Production 資料庫 | **未被觸碰** —— UI Review 連的是本機 `teaching_platform_ui_review` |
| Production 上有無 UI fixture | **無** —— 護欄使 seed 在非本機目標上必然中止 |
| Production 認證／授權 | **未變更** —— 本輪未動 `Backend/middlewares/auth.js`、`middleware.ts`、任何 role 判斷 |
| 登入繞道 | **沒有** —— UI Review 走正式 `/login`，帳號是真的 DB 使用者 |
| `/dev/ui-review` | production **不可達**（三層護欄，見 §4） |
| `SETTLEMENT_WRITE_ENABLED` | **OFF**，本輪未觸碰 |

**UI Review 用的是與 development（`teaching_platform`）和 security test
（`teaching_platform_security_test`）**都不同**的第三個資料庫**，
因此 reset 不會影響任何既有的開發或測試資料。

---

## 1. 拓撲

```text
  瀏覽器
    │
    ▼
  UI Review frontend   http://localhost:3110     next dev（distDir = .next-ui-review）
    │  API_BASE_URL
    ▼
  UI Review backend    http://localhost:3100     node Backend/index.js
    │  PGDATABASE
    ▼
  UI Review database   teaching_platform_ui_review（本機 PostgreSQL）
```

三者**全部**非 production。連接埠刻意避開 `CLAUDE.md` 的一般開發埠
（backend 3000 / frontend 3010），因此 UI Review 與一般開發可以同時執行而互不干擾。

---

## 2. 指令

```bash
npm run ui-review:reset      # 重建 schema + 清空 + 重新 seed（可重複執行）
npm run ui-review:backend    # 啟動 UI Review backend（:3100）
npm run ui-review:frontend   # 啟動 UI Review frontend（:3110）
```

`Backend` 另有：

```bash
npm run ui-review:verify --prefix Backend    # 只跑護欄與現況查詢，不寫入
```

環境是 **resettable／deterministic／disposable／rebuildable**：
`ui-review:reset` 可以任意重跑，資料每次逐欄相同（id 固定、時間為相對偏移），
整個資料庫隨時可以 `DROP DATABASE` 後重建。

---

## 3. Fail-closed production 護欄

canonical source：`Backend/scripts/ui-review/guard.js`。
回歸測試：`Backend/tests/uiReviewGuard.test.js`（9 個 case，已納入 `npm run test:unit`）。

**四層，任一層不通過即中止，且在那之前不會執行任何寫入：**

| # | 檢查 | 擋住什麼 |
| --- | --- | --- |
| 1 | `NODE_ENV !== "production"` | production 模式下永不執行，**優先於其他所有條件** |
| 2 | 連線設定（靜態） | DB 名稱必須**整段相等** `teaching_platform_ui_review`；host 必須是 loopback；連線字串不得命中 Neon／Render／RDS／Supabase 等託管標記 |
| 3 | 連線後（動態） | 實際問 `current_database()` 與 `host(inet_server_addr())` —— 靜態設定可能被 `PGSERVICE`／`.pgpass` 覆寫，**只有伺服器自己回報的身分算數** |
| 4 | production 指紋 | 目標 DB 若含已核准付款憑證／payout item／creator ledger 分錄，視為 production 並中止 |

> ⚠️ **刻意沒有 `--force`。** 加了就等於把四層護欄變成一個提示。

**名稱比對必須整段相等**，不得用 prefix —— `teaching_platform_ui_review_backup`
不該被放行。這與 `CLAUDE.md` §3 對 proxy `ALLOW_ROOT` 的要求是同一個道理。

---

## 4. `/dev/ui-review` 的 production 護欄

`frontend/apps/web/app/dev/ui-review/page.tsx` 是一張**純導覽索引**。

**三層：**

1. `NODE_ENV === "production"` → `notFound()`（**即使**旗標被設了也一樣）；
2. `NEXT_PUBLIC_UI_REVIEW_MODE !== "1"` → `notFound()`；
3. `tests/e2e/ui-review-dev-guard.spec.ts` 以 source scan 釘住
   `render.yaml` 永遠不宣告該旗標，且該旗標只由 `frontend/scripts/ui-review-dev.mjs` 注入。

> ⚠️ **這一頁沒有任何登入繞道。** 它只有 `<Link>`：不寫 cookie、不寫 localStorage、
> 不發 API 請求、不簽發 token。角色切換一律走正式 `/login`。
> `ui-review-dev-guard.spec.ts` 逐項斷言這七類繞道都不存在。
>
> 選擇「真帳號真登入」而不是「快速登入按鈕」是刻意的：
> 任何 production-capable 的登入繞道都會成為繞過
> `Backend/middlewares/auth.js` 的路徑，而那是本 repo **唯一**的授權邊界。

---

## 5. Fixture 內容

| 類別 | 筆數 | 備註 |
| --- | --- | --- |
| 使用者 | 5 | buyer ×2（一般／全空）、creator ×2（一般／全空）、admin ×1 |
| 教材 | 36 | published 33、pending_review 1、changes_requested 1、unpublished 1 |
| 教材檔案 | 34 | 只有 `deliverable` 的教材才有 `approved_file_id` |
| 訂單 | 4 | approved／pending_payment／pending_review／rejected |
| 訂單品項 | 6 | |
| 收藏 | 3 | |
| 購物車 | 2 | |
| 教學回饋 | 2 | **只給已購買的教材**，不製造無效狀態 |
| 檢舉 | 2 | pending 1、investigating 1 |

**視覺壓力涵蓋**：超長中文標題、超長英文標題（無 CJK 斷行點）、中英混排、
超長單一標籤、無標籤、無封面圖、極長創作者名稱、最低價（NT$30）、高價（NT$4,800）、
1 筆／多筆／空清單、長描述。

> ⚠️ **不製造無效商業狀態。** 價格一律遵守 `DEC-34`（整數 TWD）與 `DEC-39`（下限 NT$30）；
> **沒有**為了視覺壓力而捏造 NT$0 上架品。
> 教材狀態只用 `materialWorkflow.js` 真的存在的四個值 ——
> 本 repo **沒有 `draft` 狀態**，Owner 指示中的「draft」對應
> `pending_review`（已送審未上架）與 `changes_requested`（退回修改）。

---

## 6. 已知的環境限制（**會影響判讀，請先知道**）

| 限制 | 影響 | 是不是產品缺陷 |
| --- | --- | --- |
| ~~**Google Fonts 下載失敗**~~ —— ✅ **2026-09-29 已解決（`UI-QA-FONT`）**：字型改為自架（`@fontsource-variable/*`），dev／build／測試都不再連 Google。實測 `/materials` 所有可見文字使用同一個堆疊、字型 CDN 請求 0。**2026-09-29 之前**的截圖與字型觀察仍受此限制，判讀舊紀錄時請注意 | 修正前：中文採作業系統字型（不是只有 dev fallback —— 見 `docs/ui-quality-system.md` §5） | ❌ 不是產品缺陷（已解決） |
| `next dev` 逐路由即時編譯 | 首次進入某路由較慢 | ❌ 不是 |
| 封面圖為 `/uploads/ui-review/*.svg` 佔位路徑，檔案不存在 | 卡片會走 **broken image／無圖** 分支 | ⚠️ 這**正好**是「無圖 fallback」的檢視情境，但不得被誤記為「圖片壞掉」的產品缺陷 |

---

## 7. 不會留下殭屍程序

`ui-review:backend` 與 `ui-review:frontend` 都是前景程序，Ctrl-C 即結束。
frontend 的建置產物在 `.next-ui-review`，與一般開發的 `.next` 分開，
因此停掉 UI Review **不會**影響 3010 上的 dev server。

資料庫要完全移除時：

```bash
psql -d postgres -c "DROP DATABASE teaching_platform_ui_review"
```
