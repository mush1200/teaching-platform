# PRE-05 —— 全新資料庫 provisioning 驗證

**日期：** 2026-08-31
**Baseline commit：** `d1035ad`（branch `chore/rel-01-preservation-checkpoint`）
**性質：** 驗證為主；過程中發現並修復**一個真實的 provisioning 缺陷**（見 §7）。

---

## 1. 要回答的問題

> 一個完全空白的 PostgreSQL 資料庫，能否用本 repo 記載的 canonical 流程，
> provisioning 成一個**結構上足以安全運行 MVP** 的資料庫？

`READINESS-02`（`R2-010`）只驗到「26 / 26 張表存在」。本輪把驗證擴到
欄位／型別／預設值／可空性／PK／FK／UNIQUE／CHECK／索引／部分索引／trigger／function，
並實際啟動 Backend、跑 canonical seed 與 smoke。

**結論：擴大驗證是必要的 —— 表數量相同，但功能是壞的。**

---

## 2. Canonical provisioning path（先確認，再執行）

| 問題 | 答案（repo 證據） |
| --- | --- |
| canonical 機制是什麼？ | **Backend 啟動時的 idempotent bootstrap**（`Backend/index.js:28` → `models/bootstrapModel.js` 的 `ensureCoreTables()`），啟動失敗即 exit 1 |
| `db_schema.sql` 的角色？ | **canonical 參考文件**（`CLAUDE.md` §Canonical 文件），不是執行檔 |
| 40 個 migration 的角色？ | **歷史增量產物**。`scripts/apply-migration.js` 檔頭自述：「同樣的 schema 變更也存在於 `models/bootstrapModel.js` 的 idempotent 區塊，正常啟動 Backend 就會套用；這支腳本是給『不想起 server 只想套 schema』的情境。」 |
| 全新 DB 需要 replay migration 嗎？ | **不需要。** 本輪實測：空資料庫 → 啟動 Backend → 26 張表建立完成、`/health` 200，**未執行任何 migration** |
| 有 migration ledger 嗎？ | **沒有**（`schema_migrations` 之類 grep 0 命中）。因為 canonical 是 idempotent bootstrap，不是逐一 replay |
| 啟動需要 seed 資料嗎？ | **不需要。** 但 smoke 需要一個既有 admin，canonical 機制是 `npm run create-admin`（HTTP 無法建立 admin） |
| 需要哪些環境變數？ | `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`（或 `DATABASE_URL`）＋ `JWT_SECRET` |

---

## 3. 可拋棄環境

| | |
| --- | --- |
| 名稱 | `teaching_platform_pre05_verify_20260831` / `_20260832` / `_20260833` |
| 建立前檢查 | 以 `pg_database` 證明**不存在**才建立；名稱必須符合 `^teaching_platform_pre05_verify_\d+$`；`teaching_platform` / `teaching_platform_security_test` / `postgres` / `template*` 為硬拒絕清單 |
| 初始狀態 | public tables = **0** |
| 參考基準 | `teaching_platform_security_test`（**唯讀**） |
| 清理 | 三個皆已 `DROP`；清理後只剩兩個受保護資料庫 |

> 需要三個是因為：#1 用於首次驗證並發現缺陷，#2 在缺陷修復腳本失敗時建立（未使用），
> #3 用於修復後的 from-zero 重新驗證。

---

## 4. 首次啟動與 idempotency

| 檢查 | 結果 |
| --- | --- |
| 空資料庫 → 第一次啟動 | ✅ `Server running on port 3000`，無錯誤 |
| `GET /health` | ✅ `{"status":"ok"}` |
| 建立的表 | ✅ **26**（與參考庫相同） |
| 停止後**第二次**啟動同一個 DB | ✅ 健康、無 duplicate-object 錯誤、無破壞性重建 |
| 第二次啟動後表數 | ✅ 仍為 26 |
| 資料保存（sentinel 列） | ✅ **保留**（未被清空） |

---

## 5. 結構比對（參考庫 vs 全新庫）

比對方法：`information_schema` + `pg_catalog` 唯讀擷取，並以**定義**（非名稱）正規化比對，
以免把「同一個約束換個名字」誤判成缺漏。

| 物件類型 | 參考庫 | 全新庫 | 真實差異 |
| --- | ---: | ---: | --- |
| tables | 26 | 26 | **0** |
| columns | 325 | 323 | 2 缺少、14 不一致 |
| constraints | 185 | 176 | 10 缺少（定義比對後） |
| indexes | 101 | 93 | 9 缺少、1 不同 |
| triggers | 5 | 3 | 2 缺少 |
| functions | 40 簽章 | 39 簽章 | 1 缺少 |
| sequences / views | 0 / 0 | 0 / 0 | 0 |

> **比對工具本身的一個假陽性已排除：** 以函式**名稱**為 key 時，`pgcrypto` 的多載
> （`pgp_sym_decrypt(bytea,text)` vs `(bytea,text,text)`）會塌成 5 個「不一致」。
> 改以**完整簽章**為 key 後，只剩 `set_updated_at()` 一個真正缺少。

### 5.1 差異分類（關鍵：多數差異是**參考庫**的歷史漂移）

以 `db/db_schema.sql`（canonical）裁決，而不是預設「參考庫一定對」：

| 差異 | canonical 怎麼寫 | 判定 |
| --- | --- | --- |
| `materials.price`：ref `integer` / fresh `numeric` | `price NUMERIC NOT NULL DEFAULT 0` | **全新庫正確**，參考庫漂移 |
| `order_items.price_snapshot`：ref `integer` / fresh `numeric` | `price_snapshot NUMERIC NOT NULL` | **全新庫正確** |
| `reports.created_at`：ref `timestamp` / fresh `timestamptz` | `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **全新庫正確** |
| `orders.payment_proof_key` / `payment_uploaded_at`（僅參考庫有） | **未宣告**（legacy，已由 migration DROP） | **全新庫正確** |
| `users/materials/orders/order_items.id` 的 `gen_random_uuid()` 預設 | `id TEXT PRIMARY KEY`（**無預設**，id 由應用層產生 `usr_`/`mat_`/`ord_` 前綴） | **全新庫正確** |
| `materials.teacher_id`：ref nullable / fresh NOT NULL | `teacher_id TEXT NOT NULL` | **全新庫正確** |
| `orders.user_id` FK：ref 帶 `ON DELETE CASCADE` | `user_id TEXT NOT NULL REFERENCES users(id)`（無 ON DELETE） | **全新庫正確** |
| `order_items` / `materials.teacher_id` 的額外 FK、`total_amount >= 0` 等 CHECK | **未宣告** | 參考庫歷史殘留 |
| `set_updated_at()` ＋ 兩個 `trg_*_set_updated_at` | **未宣告** | 參考庫歷史殘留 |
| **參考庫有重複 FK**（`materials.approved_file_id` ×2、`pending_file_id` ×2、`manual_payment_proofs.reviewed_by` ×2） | 各一個 | **參考庫漂移**，全新庫較乾淨 |

**仍屬全新庫的真實 parity 缺口（2 項，皆未造成功能失敗）：**

1. `manual_payment_proofs.review_status` 缺少 `DEFAULT 'pending'`（canonical `db_schema.sql:398` 有）
2. `materials.reviewed_by` 缺少 `REFERENCES users(id) ON DELETE SET NULL`（canonical 有）

**效能面觀察（非 canonical 宣告，但值得注意）：** 全新庫缺少 8 個熱路徑索引
（`orders(user_id)`、`orders(status)`、`orders(user_id,status)`、`orders(payment_mode)`、
`materials(teacher_id)`、`materials(category)`、`order_items(order_id)`、`order_items(material_id)`）。
這些只存在於參考庫（來自舊 migration），`db/db_schema.sql` 並未宣告。
`activity_logs(created_at)` 則相反 —— 全新庫是 `DESC`，比參考庫的無序版本更貼合查詢。

---

## 6. 關鍵不變條件逐一確認（全新庫）

| 不變條件 | 結果 |
| --- | --- |
| `legal_documents` 每型別僅一筆 published（partial UNIQUE index） | ✅ 存在 |
| `legal_documents` 已發布內容不可竄改（trigger + function） | ✅ `trg_legal_documents_immutable` / `legal_documents_reject_rewrite()` |
| `consent_records` append-only | ✅ `trg_consent_records_reject_rewrite` |
| `material_rights_reviews` append-only | ✅ `trg_mrr_reject_rewrite` |
| 部分索引總數 | ✅ 16 / 16（與 bootstrap 原始碼一致） |
| trigger / function 數 | ✅ 3 / 3（`set_updated_at` 家族屬參考庫歷史殘留） |
| `order_items.entitlement_status` 四值 CHECK | ✅ 存在 |
| `users.account_status` CHECK | ✅ 存在 |

---

## 7. 發現的 provisioning 缺陷（**已修復**）

### `materials.file_key` 在 bootstrap 中被建成 `NOT NULL`

**症狀（全新庫實測）：** `POST /materials` 回 **500**。

```text
null value in column "file_key" of relation "materials" violates not-null constraint
```

**根因：** `bootstrapModel.js` 寫 `file_key TEXT NOT NULL`，
而 canonical `db/db_schema.sql` 明確宣告它可為空，並註明：

> 新流程完全不讀 `file_key`，新建教材此欄為 NULL。
> 註：實際資料庫此欄為 nullable（NOT NULL 只曾存在於舊的應用層驗證）。

**為什麼一直沒被發現：** 既有兩個資料庫**早就是 nullable**（由早期 migration 形成），
而 `CREATE TABLE IF NOT EXISTS` **不會修改既存表** —— 這個分歧因此只在**全新資料庫**上顯現。
現有測試（DB 470、smoke、E2E）全部跑在既有資料庫上，結構上不可能發現它。

**影響：** 全新部署的平台**完全無法上架任何教材** —— 創作者主流程從第一天就是壞的。

**修法（最小、僅影響 provisioning）：** bootstrap 的該欄改為 `file_key TEXT,`，與 canonical 一致。
不影響既有資料庫（本來就是 nullable，且 `IF NOT EXISTS` 不會 ALTER）。

**修復後驗證：** 以**第三個全新空資料庫**從零重跑 —— `is_nullable = YES`、
`create-admin` 成功、**smoke 73 項全過**。

---

## 8. 驗證結果

| 項目 | 結果 |
| --- | --- |
| 空 DB → 第一次啟動 | ✅ healthy，26 表 |
| 第二次啟動（idempotency） | ✅ healthy，無重複物件錯誤，sentinel 資料保留 |
| canonical seed（`create-admin`） | ✅ 成功，明確印出目標資料庫名稱 |
| **smoke（全新庫）** | ✅ **exit 0，73 項全過** |
| Backend unit（修改 bootstrap 後） | ✅ **230 / 230** |
| DB tests（既有 security test DB，回歸） | ✅ **470 / 470** |
| DB tests（**全新庫**） | ⛔ **刻意未執行** —— `scripts/run-db-tests.js` 硬釘 `teaching_platform_security_test` 並拒絕其他目標；那是刻意的安全護欄，不為 PRE-05 削弱 |
| Postman | ⛔ 未執行 —— 與 DB tests 同一理由：它依賴既有 security test DB 的 fixture 狀態 |
| E2E | ⛔ 未執行 —— DX-19 harness 亦硬釘 security test DB（見 §16 原則：不為 PRE-05 弱化 DX-19 護欄） |

> 全新庫的功能證明來自 **smoke（73 項，涵蓋 auth／materials／cart／orders／付款憑證／
> admin 審核／download／reviews／reports）**，而非 DB 套件。

---

## 9. 既有資料庫完整性

| 檢查 | 結果 |
| --- | --- |
| `teaching_platform` 被修改？ | ❌ 否 |
| `teaching_platform_security_test` 被修改？ | ❌ 否 |
| 參考庫結構指紋（前 vs 後） | ✅ **byte-identical**（sha256 `c2c8edb2df40aebf`） |
| `legal_documents` / `consent_records`（兩庫） | ✅ 皆維持 **0 / 0** |

---

## 10. 最終判定

> **能否用 repo 記載的流程，從零 provisioning 出一個新的 production 資料庫？**

```text
YES —— 但這個 YES 是在本輪修掉一個真實缺陷之後才成立的。
```

修復前的答案是 **NO**：表數量正確（26 / 26），Backend 也起得來，
但創作者**完全無法上架教材**。這正是 `R2-010` 擔心的情況，也說明
「26 / 26 張表存在」不足以作為 provisioning 證據。

**修復後成立的條件：**

1. 提供 `PG*`（或 `DATABASE_URL`）與 `JWT_SECRET`
2. 啟動 Backend 一次以完成 bootstrap（**不需要 replay 任何 migration**）
3. 以 `npm run create-admin` 建立第一個 admin（HTTP 無法建立）
4. `PRE-01` 的持久化儲存決策仍未解 —— `NODE_ENV=production` + local driver 會 fail-closed 拒絕啟動

**已知且刻意未修的殘留（不影響功能，已於 §5.1 列出）：**
`manual_payment_proofs.review_status` 的預設值、`materials.reviewed_by` 的 FK，
以及 8 個熱路徑索引。三者皆未造成 smoke 失敗，且其中索引並非 canonical 宣告，
因此本輪依「最小且有證據」原則未動，改以 tracker 條目交付 Owner 決定。
