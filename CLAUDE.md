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
5. 破壞性操作前先唯讀查 `pg_constraint` 找出所有關聯，確認為 0 才動。

---

## 5. API conventions

- **材料更新端點：`PATCH /materials/:id` 為 preferred／canonical 的 partial-update endpoint。**
  `PUT /materials/:id` 屬 legacy compatibility，**不應在新功能中擴張**（不要新增依賴、不要擴充其行為）。

  現況記錄（**本文件只記錄，未解決此不一致**）：

  - 實作上 `PUT` 與 `PATCH` **共用同一個 partial-update handler**
    （`Backend/routes/materials.js` 的 `updateMaterialHandler`，欄位以 `COALESCE` 合併）。
  - canonical docs 仍記載 **`PUT` = Full update**
    （`docs/teaching-platform-mvp-spec-v1.4.md` §11；`docs/mvp_rules.md` §4 亦以 `PUT` 描述更新欄位）。
  - 因此 **contract inconsistency 目前仍存在且尚未收斂**。在正式對齊之前，
    不要依賴 `PUT` 的全欄位覆寫語意，也不要以本文件作為該不一致已解決的依據。
- `POST /materials` 的 **`material_features` 為必填**（array、至少 1 個、值須來自 allowlist）。
- 只有 admin 可改 `materials.status`；create 時不得帶 `status`（400）。
- **Report feature 保留**，不要當成死碼刪除：`POST /reports` 與 admin 檢舉管理頁都在使用中。
  > 已知缺口：buyer 端的檢舉送出 UI 目前不存在（僅 API 與 admin 端）。要移除或補回都需先確認產品決定。

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

## Canonical 文件

| 文件 | 用途 |
| --- | --- |
| `docs/local-development-and-operations.md` | 啟動、環境變數、回歸、維運（**先讀這份**） |
| `docs/teaching-platform-mvp-spec-v1.4.md` | 產品／API 契約 |
| `docs/mvp_rules.md` | 規則、角色邊界、授權邊界 |
| `db/db_schema.sql` | Schema 參考 |
| `docs/ui-design-system.md` | **Web UI 入口**：canonical stack、component 狀態、UI 工作規則、Visual QA / DoD |
| `docs/frontend-ui-architecture.md` | 元件分層、token 選用（細節文件） |
| `docs/design-tokens-v1.1.md` | Token 數值 |
| `docs/db-backup-and-migration.md` | 備份／還原步驟 |
| `docs/postman/README.md` | Postman / Newman 與 fixtures |

已知但不阻擋開發的技術債清單見 `docs/local-development-and-operations.md` §12。
