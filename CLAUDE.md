# CLAUDE.md

給 Claude Code 的**工作規則摘要**。進入本 repo 先讀這份，不要從零摸索。

這裡只寫「做事時必須遵守的規則」，不重複規格內容。完整規格見底部〈Canonical 文件〉。

---

## 1. Product

C2C 數位教材市集：上架者建立教材 → 管理員審核上架 → 購買者加入購物車、結帳 → 銀行轉帳並上傳付款憑證 → 管理員審核憑證 → 訂單核准後可下載與留下教學回饋。

金流為**人工轉帳 + 憑證審核**，未串接金流服務。

---

## 2. Roles

| 用途 | 值 | 說明 |
| --- | --- | --- |
| 購買者（canonical） | **`buyer`** | DB 與新開發一律用這個 |
| 購買者（legacy） | `parent` | **僅相容用**，不得新增使用點。API 回應層目前仍會把 `buyer` 轉回 `parent`（`normalizeRoleForClient`） |
| 上架者 | `teacher` | 技術角色暫留此名稱；**UI 一律顯示「創作者」** |
| 管理員 | `admin` | |

- `users_role_check` 目前為過渡四值版：`teacher | parent | buyer | admin`。
- UI 文案不得出現 `parent` / `teacher` / `admin` 字面值，也不得用「家長」「老師」當主要稱呼（見 `docs/ui-role-naming-checklist.md`）。

---

## 3. Auth boundary（不可混淆）

| 層 | 實作 | 地位 |
| --- | --- | --- |
| **授權** | `Backend/middlewares/auth.js` 驗簽 JWT + `requireRole` | **唯一**真正的授權邊界 |
| **UX guard** | `frontend/apps/web/middleware.ts` 讀 `tp_role` cookie | 只決定渲染哪個外殼、導向 `/login` 或 `/403` |

- `tp_role` 是 client 可竄改的 cookie，**只能當 UX hint**，不得據以授權任何資料存取。
- middleware 不讀取、不解碼、不驗證 JWT。
- `/api/backend/[...path]` proxy 只轉發 `Authorization` header，**不轉發 cookie**。
- proxy 的 `ALLOW_ROOT` 是 **transport allowlist，不是授權邊界**：它只決定哪些前綴可被
  轉發，授權一律由 Backend 的 `requireAuth` / `requireRole` 決定。
  **新增 Backend 路由前綴時必須同步加進 `ALLOW_ROOT`**，否則前端會拿到 proxy 自己產生的
  `403 {"message":"not allowed"}` 而 Backend 完全沒被呼叫（`creator/*` 曾整條因此不可用）。
  `creator` 與 `teacher` **兩者都要保留**（Backend 把同一個 router 掛在兩處）。
  比對必須是**整段相等**，不得用 prefix 比對（`creatorx` 不該被放行）。

### Admin 帳號

- **公開註冊永遠不能建立 admin**：`POST /auth/register` 帶 `role: "admin"` → **403**。不得新增任何 admin registration endpoint。
- admin 只能由維運 CLI 建立：`npm run create-admin --prefix Backend`（`ADMIN_EMAIL` / `ADMIN_PASSWORD`，密碼下限 16 字元，role 硬編碼）。

---

## 4. Databases

| 用途 | 資料庫 |
| --- | --- |
| Development | `teaching_platform` |
| Security / integration test | `teaching_platform_security_test` |

兩者 schema 一致（皆已套用 buyer role migration）。

### Migration 安全規則（強制）

1. **先 backup**（`pg_dump`，備份檔放專案外部）。
2. **確認 target DB**：執行端 assertion + SQL 內建 assertion 兩層：
   ```sql
   DO $$ BEGIN
     IF current_database() <> '<expected>' THEN
       RAISE EXCEPTION 'ABORT: wrong database (%)', current_database();
     END IF;
   END $$;
   ```
3. **單一 transaction**：約束變更與資料轉換放同一個 `BEGIN...COMMIT`，避免半套狀態。
4. **不改寫歷史 `activity_logs`**：`actor_role` 中既有的 `parent` 等值反映寫入當下的事實，屬稽核軌跡，任何 role 遷移都不得回填。
   **`activity_logs.id` 是 identity，不是 time** —— 它是 UUID（`gen_random_uuid()::text`），不單調遞增。事件先後一律以 `created_at` 為準（`ORDER BY created_at DESC, id DESC`，`id` 只是 deterministic tie-breaker）；**不得** `ORDER BY id`、`MAX(id)` 或 `id > lastId` 當 cursor。canonical 見 `db/db_schema.sql`；`bootstrapModel.verifyCriticalSchema()` 會在啟動時 fail-closed 檢查此型別。
5. 破壞性操作前先唯讀查 `pg_constraint` 找出所有關聯，確認為 0 才動。

---

## 5. API conventions

- **材料更新端點：`PATCH /materials/:id` 為 preferred／canonical 的 partial-update endpoint。**
  `PUT /materials/:id` 屬 legacy compatibility，**不應在新功能中擴張**（不要新增依賴、不要擴充其行為）。

  現況記錄（**2026-08-30 `DOC-01` 以 repo 實測更正；只改文件，未改 API 行為**）：

  - **實際語意：`PUT` 與 `PATCH` 都是 partial update。** 兩者掛在同一個 handler
    （`Backend/routes/materials.js:847-848` → `updateMaterialHandler`），欄位以 `COALESCE` 合併
    （該 handler 內 15 處），因此**未提供的欄位一律保留原值**。
    唯二的例外是 replace 語意的集合欄位：body 帶 `contents` 會整批取代 `material_contents`，
    帶 `detail_images` 會整批取代 `material_images`。
  - **先前這裡寫「canonical docs 仍記載 `PUT` = Full update」——該敘述已不成立。**
    `docs/teaching-platform-mvp-spec-v1.4.md` §11 現在寫的是
    `PUT` = "Update material fields"、`PATCH` = "Partial update semantics, same field
    validation/authorization as PUT"，**沒有任何地方宣稱 full-replace**。
  - 唯一殘留的落差是 `docs/mvp_rules.md` §4 過去只寫 `PUT`、未提 `PATCH`，
    **已於同輪一併更正為 `PUT`／`PATCH`**。三份文件現已一致。
  - **仍然成立的規則：** `PATCH` 是 preferred／canonical，`PUT` 只保留相容性，
    **不得**在新功能中擴張其行為，也**不得**依賴任何「全欄位覆寫」語意 —— 那從來就不是實作的行為。
- `POST /materials` 的 **`material_features` 為必填**（array、至少 1 個、值須來自 allowlist）。
- **教材狀態由審核 workflow 管理，不能用 generic update 端點改**：
  `PUT/PATCH /materials/:id` 帶 `status` → teacher 403、admin 400（`status_not_updatable_here`）。
  正式入口：`POST /admin/materials/:id/approve`、`/request-changes`、`POST /materials/:id/resubmit`，
  以及檢舉處置的 `unpublish_material`（**唯一**下架路徑）。
  狀態有四個：`pending_review` / `published` / `changes_requested` / `unpublished`；
  轉移規則的 canonical source 是 `Backend/utils/materialWorkflow.js`，規格見 `docs/material-review-workflow.md`。
  create 時不得帶 `status`（400）。
- **教材本體檔案由專屬流程管理，不能用 generic update 端點改**：
  建立教材必填 `fileId`（來自 `POST /teacher/uploads/material-file`）；
  `PUT/PATCH /materials/:id` 帶任何檔案欄位 → 400（`file_not_updatable_here`）。
  換檔只走 `POST /materials/:id/file`，且**只有** `changes_requested` / `unpublished` 可用
  （`published` / `pending_review` 一律 409，沒有偷偷回到待審的路徑）。

  四條不可破的不變條件：
  1. `pending_file_id` 永遠不是買家可下載的東西；買家只看 `approved_file_id`。
  2. `approved_file_id` **只有** Admin 核准流程會寫，創作者永遠寫不到。
  3. 買家授權綁定「教材」而不是「版本」，且**不看 `materials.status`**。
  4. **沒有 `approved_file_id` 的教材不得成為可購買的付費商品。**
     `published` ≠ 交付得出東西。三道防線：approve（既有）／`POST /cart/items`／
     `POST /orders`（transaction 內），全部回 409。canonical source 是
     `Backend/utils/materialDeliverability.js`，規格見 `docs/mvp_rules.md` §21A.1.1。
     legacy 已上架但無檔的教材**不回填 DB**，改在販售路徑擋住；
     **既有 entitlement 不受影響**（第 3 條仍成立）。

  教材本體存在 `Backend/private-storage/`（**不在** `uploads/`，後者是公開 static）。
  `storage_key` / `checksum` / `uploaded_by` 不得出現在任何 API 回應或 log。
  `materials.file_key` 是 legacy placeholder，新程式碼不得依賴。
  canonical source 是 `Backend/services/materialFile.service.js` 與
  `Backend/utils/materialFilePolicy.js`，規格見 `docs/material-file-storage-and-delivery.md`。
- **付款憑證永遠不是 public asset**：新憑證只寫 `Backend/private-storage/payment-proofs/`，
  `/uploads/payment-proofs/*` 已被 `index.js` 在 static 之前擋掉（404），不得恢復。
  `storage_key` / `checksum_sha256` / `proof_url` 不得出現在任何 API 回應、log 或前端 state。
  讀取只有一條路：`GET /orders/:orderId/payment-proofs/:proofId/file`，
  授權**只有** `Admin OR 訂單擁有者`，且不看 `orders.status` 與 `review_status`。
  **不要把教材的買家 entitlement 模型套到憑證上** —— 兩者只共用
  `storage/privateFileStorage.js` 的 filesystem primitives，不共用授權。
  canonical source 是 `Backend/services/paymentProof.service.js` 與
  `Backend/utils/paymentProofPolicy.js`，規格見 `docs/mvp_rules.md` §12.4。
- **Report feature 保留**，不要當成死碼刪除：`POST /reports` 與 admin 檢舉管理頁都在使用中。
  > buyer 端的送出入口是**教材詳情頁 `/materials/:id` 頁尾的「檢舉這個教材」**（`BUY-01`，2026-08-24）。
  > 那是**唯一**能產生新檢舉的地方；沒有、也不會有「Admin 代開案件」的端點。
  > `reason` 是自由文字，不得在前端拼假分類；重複檢舉靠 DB 的 `UNIQUE (material_id, reporter_id)` 回 409，
  > **不在前端猜**。規則見 `docs/mvp_rules.md` §6.5。
- **檢舉案件的唯一正式入口是 `/admin/reports`**（`POST /admin/report-cases/:id/{investigate,request-response,notes,resolve}`）。
  `/admin/materials/:id/reports` 是 contextual read-only，**不得**加上任何案件處置動作。
  legacy 的 `PATCH /admin/reports/:id { status: "reviewed" }` 已 **deprecated**：
  `reviewed` 不是合法轉移目標，正式產品 UI 不得再產生新的；既有歷史資料**保留不回填**。
  規格見 `docs/mvp_rules.md` §6 與 `docs/admin-information-architecture.md` §9。

---

## 6. Frontend / UI

> **動 Web UI 前先讀 `docs/ui-design-system.md`**（UI 入口文件：canonical stack、component 現況盤點、工作規則、Visual QA / DoD、Tamagui legacy 邊界）。

### Canonical stack

**Tailwind + `components/ui`（primitives）+ `components/ds`（設計系統複合件）。**

- `@teaching-platform/ui`（`frontend/packages/ui`，Tamagui 實作）與 `TamaguiProvider`（`app/providers.tsx`）為 **legacy-frozen**：既有 27 個檔案繼續用沒關係，**不要在新程式碼新增使用**。
- Card 用 `Card` / `SurfaceCard`，不要發明第三套圓角；CTA 用 `Button` 的 `intent`。
- Token 選用（`ds` vs `edu`）見 `docs/frontend-ui-architecture.md`。

### UI 工作優先序

處理 UI 問題時，依序考慮：**composition → spacing → tokens**。
**不要**為了修 UI 去動 business logic、API 契約或權限判斷。

---

## 7. 驗收最低要求

| 改動範圍 | 必跑 |
| --- | --- |
| Web UI / frontend | `npm run verify:web`（在 `frontend/`） |
| Backend / auth / DB | 依 scope 跑 `npm run smoke --prefix Backend` 與／或 `npm run postman` |

- **smoke / Postman 只能指向 `teaching_platform_security_test`**，啟動前先做 `PGDATABASE` assertion。
- 兩者都必須**全綠**才算完整回歸（smoke exit 0；Postman 0 failed assertions）。
- 憑證（`TEST_ADMIN_*`）來自 git-ignored 的 `Backend/.env`，缺值時測試會明確失敗 —— **不要**改成 fallback 或 hard-code。

### Ports

Backend **3000**（`npm run dev`，專案根目錄）／Frontend **3010**（`npm run dev:web:3010`，在 `frontend/`）。
不要用 `npm run dev:web`，它預設也是 3000 會撞到 Backend。

---

## 8. Secrets

- **不得**把 secret 寫進 tracked file（含 `.env.example`、文件、測試腳本、Postman collection／environment）。
- 真實值只放在 git-ignored 的 `Backend/.env` 或部署環境。
- `JWT_SECRET` 無 fallback：未設定／空白／已知佔位值／短於 32 字元時 Backend 拒絕啟動。必須是高熵隨機值，且**不要與任何使用者密碼共用同一字串**。

---

## 9. Git

- 改動 `Backend/{routes,models,services,repositories,migrations,middlewares}/`、`Backend/index.js`、`Backend/config/db.js` 時，**必須在同一次 push 更新 canonical 文件**（`docs/mvp_rules.md`、`docs/teaching-platform-mvp-spec-v1.4.md`、`db/db_schema.sql` 擇一）。
- pre-push hook 需先 `npm run git-hooks` 啟用一次。
- **不得用 `--no-verify` 或 `SKIP_CANONICAL_DOC_CHECK=1` 繞過 hook。**

---

## 10. 工作方式

1. **先盤點再修改** —— 先讀相關程式與文件、確認現況，再動手。
2. **每次只處理單一 root cause**，不要為了讓測試變綠而連續修不相關的東西。
3. **遇到 scope 外的問題先停止回報**，說明 root cause 與最小修法，由使用者決定，不自行擴大範圍。
4. **不做 broad refactor**，除非任務明確要求。重新命名、搬檔案、統一風格都算 refactor。
5. **高風險 DB / auth 操作先做 assertion**，並在動作前印出目標資料庫。
6. **不自行 push / 建立 PR / merge**，除非明確授權。commit 亦以使用者指示為準。
7. 報告要如實：測試沒過就說沒過，跳過的步驟要講明。

---

## 11. Pending work tracking

**`docs/pending-work-tracker.md` 是本 repo 唯一的 Active Backlog / Pending Work source of truth。**

1. **開工前先讀 tracker** —— 確認 Current Focus、自己的 task ID、dependency 與已知 deferred 項目。
2. **發現「已有證據」的問題就記進 tracker** —— reproducible bug、security / authorization / privacy gap、
   lifecycle correctness bug、stale API contract、stale canonical doc、failing regression、
   sensitive data 外洩、schema divergence、missing migration、deployment blocker，
   以及會影響可靠開發／驗證的 DX 問題。
   **若不屬於本輪 scope：記錄後回到原任務，不要順手擴 scope。**
   這與 §10.3 是同一件事的兩面 —— §10.3 要你**停下來回報、不自行擴大範圍**，
   本節要求你**同時把它寫進 tracker**，不要只留在對話裡。
3. **speculative 的東西不進 Active TODO** —— nice-to-have、brainstorm、個人偏好、純美化、
   無證據的風險、future feature idea 一律不自動新增。
4. **每一筆至少要有**：ID、Priority、Area、Task、Why、**Evidence**、Status、Completion Criteria
   （有的話再加 Dependency、Existing Spec）。同一個問題**更新既有 ID**，不要開近似的新 ID。
5. **任務完成時必須同步四處**：Status、Current Focus、Next Up、Recently Completed。
   不得出現「表格寫 DONE、Current Focus 還寫 IN PROGRESS」。
6. **發現 tracker 的項目已過時或其實已完成** —— 依 code / test 證據更新或標 DONE，
   不要因為它「曾經是真的」就留在 active backlog。
7. **Concurrent session** —— 另一個 session 可能同時在改 tracker：
   動手前**重讀最新檔案**，只做 **minimal merge**，
   **不得整檔覆寫**，也不要刪除無法確認來源的項目。
8. **P0 不得默默升級** —— 只有核心交易無法完成、未授權的敏感資料外洩、繞過付款取得商品、
   繞過 Admin review 替換 buyer content、資料毀損、production 無法安全啟動、
   明確的 high-impact 漏洞才算 P0，且**必須在最終回報中明確指出並附 repository evidence**。
9. **最終回報要有 `Pending Work Reconciliation` 一節**：
   New TODOs discovered / Existing TODOs updated / TODOs completed /
   Current Focus / Next Up / Tracker changed（Yes-No）。
   回報中若出現「known gap」「follow-up」「deferred」「future work」這類說法，
   該項**必須**已經在 tracker 裡。

> **tracker 不是 §9 的 canonical doc。** pre-push 檢查只認
> `docs/mvp_rules.md`、`docs/teaching-platform-mvp-spec-v1.4.md`、`db/db_schema.sql`
> （見 `scripts/git-pre-push-docs-check.mjs`）——
> 更新 tracker 是**額外**要求，不能拿來取代那三份的更新。

> **Active priority 只在 tracker 維護。** 其他 audit / spec 文件（§Canonical 文件）
> 保存 architecture、product decision、workflow 與歷史 audit，
> **不各自維護一套 roadmap 或 priority**；若要列待辦，連回 tracker。

---

## Canonical 文件

| 文件 | 用途 |
| --- | --- |
| `docs/pending-work-tracker.md` | **Active backlog／待辦的唯一 source of truth**：Current Focus、Next Up、各項 priority 與 Recently Completed（見 §11）。**注意：它不算 §9 的 canonical doc**，更新它**不會**滿足 pre-push 檢查 |
| `docs/local-development-and-operations.md` | 啟動、環境變數、回歸、維運（**先讀這份**） |
| `docs/teaching-platform-mvp-spec-v1.4.md` | 產品／API 契約 |
| `docs/mvp_rules.md` | 規則、角色邊界、授權邊界 |
| `db/db_schema.sql` | Schema 參考 |
| `docs/material-review-workflow.md` | **教材上架審核**：狀態機、轉移規則、退回原因、review snapshot、稽核事件、milestone 邊界 |
| `docs/material-file-storage-and-delivery.md` | **教材本體檔案**：private storage、審核隔離、買家授權與交付、型別／大小政策、security invariants |
| `docs/admin-information-architecture.md` | **Admin IA**：每頁的 JTBD、sidebar 分組、Dashboard／Activity Log 責任、Refresh rule、Review Workspace pattern |
| `docs/ui-design-system.md` | **Web UI 入口**：canonical stack、component 狀態、UI 工作規則、Visual QA / DoD |
| `docs/frontend-ui-architecture.md` | 元件分層、token 選用（細節文件） |
| `docs/design-tokens-v1.1.md` | Token 數值 |
| `docs/db-backup-and-migration.md` | 備份／還原步驟 |
| `docs/postman/README.md` | Postman / Newman 與 fixtures |

待辦與 active priority 一律見 `docs/pending-work-tracker.md`（§11）。
`docs/local-development-and-operations.md` §12 仍保留工程債的技術說明，但**優先序以 tracker 為準**。
