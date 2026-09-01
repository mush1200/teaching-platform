# Readiness Audit — Round 2（`READINESS-02`）

**日期：** 2026-08-31
**Baseline commit：** `4234723`（branch `chore/rel-01-preservation-checkpoint`，領先 `main`／`70f77f5` **11 個 commit**）
**性質：** **AUDIT-ONLY。** 本輪未修正任何發現，未動 production code、schema、migration 或 legal wording。

---

## 0. 與 `READINESS-01` 的關係（歷史完整性）

`READINESS-01` 記錄的事實**不變、不刪除**：2026-08-25 那份 Pre-Deployment UI/UX Readiness Audit
**從未進入 repo**，其 28 個 ID（`P2-01`～`P2-03`、`P2-05`～`P2-16`、`P3-01`～`P3-12`）的定義
已於 2026-08-30 經完整 git 復原嘗試確認**不可復原**（`git log --all -S`、`--diff-filter=D`、
`git fsck --lost-found` 的 9 個 dangling object 逐一檢視，包含兩個 dangling stash 內的本檔舊版本）。

> **本輪未重建、未猜測、未沿用那 28 個編號。**
> Round 2 使用全新命名空間 `R2-xxx`，與歷史 ID **完全分離**。
> 任何 `R2` 發現都**不**宣稱等同於某個未知的歷史 ID。

`READINESS-01` 狀態維持 **ACCEPTED INFORMATION LOSS**，僅在「目前的上線規劃」這一用途上
由本文件取代。

---

## 1. Scope

以**目前 HEAD 的 repository 實況**重新判定「現在到底是什麼擋住 MVP 上線」，
不預設既有 tracker 的優先序正確。涵蓋 A～P 共 16 個 domain。

## 2. Method

* canonical 文件交叉比對（`CLAUDE.md`、tracker、`mvp_rules.md`、spec v1.4、
  `local-development-and-operations.md`、v1.8 Baseline、legal packet 兩份）
* 原始碼 / 路由 / 授權 / 測試 inventory
* **唯讀** DB 聚合快照（兩個資料庫）
* 完整回歸套件實際執行
* 真實瀏覽器關鍵流程抽查
* Node runtime 行為實測（unhandled rejection）

---

## 3. Verification（本輪實測值）

| Suite | 結果 | 對照 baseline |
| --- | --- | --- |
| Backend unit | **223 / 223 pass, 0 fail** | 223 ✅ 相符 |
| Backend DB | **470 / 470 pass, 0 fail** | 470 ✅ 相符 |
| Smoke | **exit 0** | ✅ |
| Postman | **129 assertions / 0 failed** | ✅ |
| `verify:web` | **exit 0**（lint／typecheck／build） | ✅ |
| Full production E2E | **610 passed / 39 skipped / 1 failed** | 611 / 39 / 0 ⚠️ **少 1 pass、多 1 fail** |

E2E 的那一個失敗經隔離重跑 **5 / 5 全過**（見 `R2-007`），
判定為**平行負載下的間歇性失敗**，非產品缺陷、非資料相依。

---

## 4. DB snapshot（唯讀、僅聚合，不含個資）

| 指標 | `teaching_platform`（dev） | `teaching_platform_security_test` |
| --- | --- | --- |
| users（role） | admin 50 / buyer 62 / teacher 105 | admin 67 / buyer 324 / teacher 516 |
| users（account_status） | active 217 | active 906 / frozen 1 |
| materials | published 93 / pending_review 4 / unpublished 4 | published 318 / pending_review 56 / unpublished 108 / changes_requested 1 |
| **published 中有 `approved_file_id`** | **2**（無檔 **91**） | **157**（無檔 **161**） |
| orders | approved 53 / pending_payment 48 / cancelled 2 | approved 161 / pending_payment 217 / cancelled 2 |
| pending_payment 且 `payment_due_at IS NULL` | 48 | **179** |
| payment proofs | approved 51 / rejected 44 / pending 1 | approved 159 / rejected 204 / pending 53 |
| order_items entitlement | active 105（無 suspended／revoked） | active 382 |
| refund_remedy_cases / consumer_complaints / privacy_requests | 0 / 0 / 0 | 0 / 0 / 0 |
| **legal_documents** | **0** | **0** |
| **consent_records** | **0** | **0** |
| activity_logs | 944 | 6,079 |

> **「published 但沒有可交付檔案」是 legacy 種子資料，不是 production 會出現的狀態。**
> 現行 `POST /materials` 強制 `fileId`，且核准流程明文拒絕無檔上架
> （`materialFile.db.test.js`：「approve: 沒有任何教材檔案時拒絕上架」）。
> 詳見 `R2-010`。

---

## 5. R2 Findings

### `R2-001` — BLOCKER — EXTERNAL — 平台交易地位定性（`PRE-03`）
**Evidence：** `docs/legal-drafts/review-handoff.md` §1「`PRE-03` 是關鍵路徑」；§4.1 判定 packet
9 題矩陣、`Q-A`～`Q-H`、回覆模板 **Final Answer 全部留白**。
**Launch impact：** 決定三份條款的當事人結構、發票主體、是否須第三方支付能量登錄。
**Dependency：** 律師＋會計師**會同**判定。 **Existing ticket：** `PRE-03`。

### `R2-002` — BLOCKER — EXTERNAL — 沒有任何經核可的法律條文（`P1-09`）
**Evidence：** `legal_documents` 兩個資料庫皆 **0 列**；四份草稿仍帶
`DRAFT — NOT LAWYER APPROVED` / `NOT FOR PRODUCTION PUBLICATION`（各 2 處，本輪複驗）。
**Launch impact：** 使用者無法被要求同意不存在的條款；`/terms` 等四條 route 依設計回 404。
**Dependency：** 律師核可。 **Existing ticket：** `P1-09`。

### `R2-003` — BLOCKER — EXTERNAL — consent／re-consent 未接線（Gate 5 / Gate 13）
**Evidence：** `consent_records` 0 列；`consent.service.js` 的 `supersede()` 0 route 引用；
Gate 5 / 13 於 v1.8 Baseline 分別為 `PARTIAL` / `NOT IMPLEMENTED`。
**Launch impact：** 無法證明「同意先於取得數位內容」。
**Dependency：** 需先有已發布條文 ＋ `DEC-LEGAL-01`（法律判準，律師側未決）。
**Existing ticket：** `P1-09` / Gate 5 / Gate 13。

### `R2-004` — BLOCKER — EXTERNAL — 保存期限與刪除語意（`L-21`／`L-22`／`RM-15`）
**Evidence：** `SCHEMA-02` 明文 blocked on `L-21`；`H-4` Completion Criteria (3) 同。
本輪複驗：production code 內 `DELETE FROM users` **0 命中**；`db_schema.sql` 有 24 處
`ON DELETE SET NULL`。
**Launch impact：** 帳號刪除與稽核保存的衝突無法在無法律結論下定案。
**Existing ticket：** `SCHEMA-02`、`H-4`。

### `R2-005` — BLOCKER — OWNER DECISION — 沒有任何部署設定（`PRE-01`）
**Evidence：** 本輪實測 `Dockerfile` / `docker-compose.yml` / `.github` / `Procfile` /
`vercel.json` / `render.yaml` / `fly.toml` / `railway.json` **全部不存在**；
`config/privateFileStorage.js` 僅實作 `local` driver，且 `NODE_ENV=production` + local 時
fail-closed 拒絕啟動（除非明示 opt-in 持久化磁碟）。
**Launch impact：** 沒有選定平台就無法上線；ephemeral filesystem 會刪掉已售教材與付款憑證。
**Existing ticket：** `PRE-01`（連帶 `PRE-02`）。

### `R2-006` — BLOCKER — OWNER DECISION — production 郵件供應商未定（O-19）
**Evidence：** `.env.example` 的 `SMTP_HOST/USER/PASS/FROM` 全為空白；
handoff §2 O-19 記為 `FACT UNKNOWN — OWNER / DEPLOYMENT INPUT REQUIRED`。
實作**本身可用**（dev DB `order_email_sent` 34 筆、0 失敗；test DB 863 sent／323 failed）。
**Launch impact：** 訂單成立、付款指示、審核結果通知是 MVP 的承諾；沒有 provider 就送不出去。
**Existing ticket：** O-19（handoff）／`PRE-01` 家族。

### `R2-007` — IMPORTANT — ENGINEERING P2 — 179 筆 legacy `pending_payment` 訂單待處置
**Evidence：** 本輪複驗 test DB `pending_payment` 且 `payment_due_at IS NULL` = **179**（dev 48）。
**Launch impact：** 這些訂單永遠不會逾期、也不會被處置，Admin 佇列會一直帶著它們。
**Dependency：** 產品／營運拍板（**非**律師）。 **Existing ticket：** `OPS-01`。

### `R2-008` — IMPORTANT — ENGINEERING P2 — fire-and-forget 郵件可讓 backend 整個掛掉 **（新發現）**
**Evidence：**
* 6 處呼叫皆為 `void sendXxxEmail(...)`，**無 `.catch()`**：
  `routes/order.js:72,269`、`routes/admin.js:352,441`、`services/materialReview.service.js:226,268`
* `Backend/index.js` **沒有** `unhandledRejection` / `uncaughtException` handler（本輪 grep 0 命中）
* `sendEmailWithLog()` 的 try/catch 只包住 transporter；但
  `loadOrderEmailContext()`（`emailService.js:78`）與 `loadMaterialEmailContext()`（`:245`）
  會 `throw new Error(...)`，且在該 try/catch **之外**執行
* **Runtime 實測（本輪）：** 以相同的 `void asyncFn()` 呼叫形狀，
  Node **v18.20.8** 的 unhandled rejection **直接終止 process**（未印出存活訊息，非零 exit）

**Launch impact：** 訂單已 commit、HTTP 201 已回傳之後，若那兩支查詢遇到任何 DB 故障
（連線中斷、pool 耗盡、列不存在），整個 API process 會被終止。
**觸發需要一次 DB 故障**，因此非常態；但一旦發生就是全站中斷。
**若最終部署平台沒有自動重啟（`PRE-01` 未定），本項應升為 P1。**
**Recommended action（本輪不執行）：** 6 個呼叫點補 `.catch()`，並在 `index.js` 加
process 層 handler。**Existing ticket：** 無 —— 新項目。

### `R2-009` — IMPORTANT — ENGINEERING P2 — 完整套件仍有間歇性失敗 **（新發現）**
**Evidence：** 本輪完整 production E2E **610 / 39 / 1**；失敗者為
`critical-acceptance.spec.ts:62 AUTH | CI | 2) login success stores auth and redirects`，
症狀為登入後 URL 停在 `/login`（10 秒內 14 次輪詢皆同）。
隔離重跑 `--repeat-each=5` → **5 / 5 全過**。該 spec 的 `beforeEach` 已安裝
`installCoreApiMocks`，且 mock 確實攔截 `**/api/auth/login`
（`helpers/mock-api.ts:51-52`），因此**不是**資料相依，也**不是**產品缺陷。
**Launch impact：** 回歸 baseline 不可重現，紅燈需要人工解釋 —— 與 `DX-06`／`DX-15`／`DX-18`
同一類問題的殘餘，會侵蝕每一輪驗收的可信度。
**Recommended action（本輪不執行）：** 先重現再修，**不得**用 retry／timeout／serial 掩蓋。
**Existing ticket：** 無 —— 新項目。

### `R2-010` — IMPORTANT — ENGINEERING P2 — 全新資料庫的 provisioning 未經端到端驗證 **（新發現）**
**Evidence：**
* 40 個 migration 檔，但**沒有 migration ledger**（`schema_migrations` 之類，本輪 grep 0 命中）
* `scripts/apply-migration.js` 檔頭自述：canonical 路徑是
  「同樣的 schema 變更也存在於 `models/bootstrapModel.js` 的 idempotent 區塊，正常啟動 Backend 就會套用」
* `docs/db-backup-and-migration.md` 只涵蓋**跨電腦備份／還原**，**沒有**全新 production 資料庫的建置程序
* **靜態比對（本輪）：** `bootstrapModel.js` 的 `CREATE TABLE IF NOT EXISTS` 涵蓋 **26 / 26** 個
  live table，table 層級**完全相符**；`verifyCriticalSchema()` 提供 fail-closed drift 檢查

**Launch impact：** table 層級已確認相符，**但 column／constraint／trigger／partial index 層級
從未以「空資料庫 → 啟動 → 比對」的方式驗證過**。兩個現有資料庫都是「長期逐步套 migration」
形成的，不能證明 fresh bootstrap 會得到同一份 schema。
**風險等級：** 中 —— 有 fail-closed 檢查與 table 層級證據，但缺少最後一哩的驗證。
**Recommended action（本輪不執行）：** 在**可拋棄**的資料庫上做一次
「空庫 → 啟動 Backend → 與 `db_schema.sql` 比對」的驗證，並把結果寫進 ops 文件。
**不得**為此改動 dev 或 security test 資料庫。 **Existing ticket：** 無 —— 新項目。

### `R2-011` — POLISH — P3 — 教材清單不揭露可購買性 **（新發現）**
**Evidence：** `routes/materials.js` 的 `MATERIAL_COLUMNS`（:45-49）**不含** `approved_file_id`；
`is_purchasable` 只在**詳情** handler 計算（:455, :488）。前端 `lib/material-mapper.ts:37`
對清單列一律預設 `isPurchasable: true`。
**瀏覽器複驗（本輪）：** `/materials` 40 張卡片**沒有任何**「暫停販售」標示；
但詳情頁完全誠實 —— 停用的「加入購物車」＋
「此教材目前沒有可供下載的教材檔案，已暫停販售。」＋「暫停販售」標籤。
**Launch impact：** **低。** production 無法產生「published 但無檔」的教材
（建立強制 `fileId`、核准拒絕無檔），因此只有 legacy 種子資料會呈現此落差。
**Existing ticket：** 無 —— 新項目（P3）。

### `R2-012` — POLISH — P3 — `ui/Checkbox.tsx` 未收斂到 canonical focus-visible
**Evidence：** 本輪複驗 `components/ui/Checkbox.tsx:13` 仍為 `focus:ring-[#6C63FF]/30`。
**Existing ticket：** `A11Y-02`（維持 P3，**不因本輪升級**）。

### `R2-013` — POLISH — P3 — `/materials` 工具列焦點框被裁 4px
**Evidence：** `A11Y-01` 輪次實測 button right 1256 / outline 右緣 1260 / scroller 右緣 1256。
既存狀況（先前 ring 型也被裁 2px）。
**Existing ticket：** `A11Y-03`（維持 P3）。

### `R2-014` — POLISH — P3 — 法律文件管理仍無 Admin UI
**Evidence：** `frontend/apps/web/app/admin/` 下無 legal-document 頁面；`lib/admin-nav.ts` 8 個
一級入口皆非法律文件。`OPS-05` 已交付 dry-run 前置檢查 ＋ runbook，API 路徑完整。
**Launch impact：** **不構成上線阻擋** —— API ＋ 安全 runbook 足以完成發布，
且發布本身仍 blocked on lawyer approval。 **Existing ticket：** `OPS-06`（維持 P3）。

### `R2-015` — POLISH — P3 — 既有 mojibake 檔名未回填
**Evidence：** 本輪唯讀複驗：dev `manual_payment_proofs` 3 列 ＋ `material_files` 1 列；
test `manual_payment_proofs` 3 列。與 2026-08-27 的計數一致。
**Existing ticket：** `DX-16`（維持 P3 deferred）。

### `R2-016` — POST-MVP — 資料主體權利之刪除／匯出／撤回同意
**Evidence：** `H-4` Completion Criteria (3)(4)(5) 明文 blocked on `RM-15`／`T-14`／`L-21` 與 Gate 5。
Phase 1「查看／更正」為自助（`LEGAL-DEC-05 = C`）。 **Existing ticket：** `H-4`。

### `R2-017` — NOT A GAP — 付費教材交付授權（Domain E，本輪最高風險項）
**查核結果：無洩漏。** `GET /download/:materialId` 需 `requireAuth` ＋ entitlement 解析
（`not_entitled` → 403、legacy 無檔 → 409）；交付走一次性 token：
32 bytes 隨機、**DB 只存雜湊**、原子 `UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW()`
單次消費、TTL 預設 300 秒、綁 user/material/file、`revoked` 檔案拒絕交付。
教材本體從未進入 `express.static` 的 `/uploads`。
覆蓋充分（`materialFile.db.test.js`）：「沒有已核准訂單就沒有下載權」「訂單尚未核准時沒有下載權」
「教材下架不會沒收已付款買家的下載權」「待審候選檔永遠不會被解析成買家可下載的檔案」
「token 只能用一次，且資料庫只存雜湊」「亂猜的票與空值都回同一個錯誤（不洩漏差異）」，
smoke 另驗 replay → 404 與位元組 round-trip。

### `R2-018` — NOT A GAP — Admin 授權邊界
**查核結果：** `routes/admin.js:34` 為 `router.use(requireAuth, requireRole("admin"))`，
**router 層級**覆蓋其下全部 30 條路由；`adminActivityLogs` / `adminLegalDocuments` /
`adminPrivacyRequests` 亦各有 router 層級 guard。未發現未保護的 admin 路由。
proxy `ALLOW_ROOT` 與 backend 掛載前綴比對：唯一差集是 `uploads`（**刻意** —— 公開 static，不經 proxy）。

### `R2-019` — NOT A GAP — 法律 public route 的 404 / no-draft-leak
**查核結果：** `TEST-01`（`legal-publication-security.spec.ts`）10 case 全綠，
涵蓋四條 route × 2 project，斷言 404、非 `/login` 轉址、無草稿標記、無「已發布外殼」，
外加 backend contract case 證明 404 來自「沒有 published 列」而非「後端連不上」。

---

## 6. Launch-readiness matrix

| ID | Classification | Domain | Finding | Existing ticket | Launch blocking? | Dependency |
| --- | --- | --- | --- | --- | --- | --- |
| `R2-001` | BLOCKER — EXTERNAL | Legal/Payment | 平台交易地位定性未決 | `PRE-03` | **YES** | 律師＋會計師會同 |
| `R2-002` | BLOCKER — EXTERNAL | Legal | 無經核可之法律條文 | `P1-09` | **YES** | 律師 |
| `R2-003` | BLOCKER — EXTERNAL | Legal/Consent | consent／re-consent 未接線 | `P1-09` / Gate 5,13 | **YES** | 條文 ＋ `DEC-LEGAL-01` |
| `R2-004` | BLOCKER — EXTERNAL | Privacy | 保存期限／刪除語意未決 | `SCHEMA-02`,`H-4` | **YES**（刪除功能側） | `L-21`/`L-22`/`RM-15` |
| `R2-005` | BLOCKER — OWNER DECISION | Infra | 無任何部署設定；storage driver 未定 | `PRE-01`,`PRE-02` | **YES** | 部署平台拍板 |
| `R2-006` | BLOCKER — OWNER DECISION | Notifications | production SMTP provider 未定 | O-19 | **YES** | Owner／部署 |
| `R2-007` | IMPORTANT — P2 | Operations | 179 筆 legacy pending_payment 待處置 | `OPS-01` | No | 產品／營運拍板 |
| `R2-008` | IMPORTANT — P2 | Reliability | fire-and-forget 郵件可終止 process | **新** | No（見註） | 無 |
| `R2-009` | IMPORTANT — P2 | Test/CI | 完整套件間歇性失敗 1 例 | **新** | No | 無 |
| `R2-010` | IMPORTANT — P2 | DB/Deploy | fresh-DB provisioning 未端到端驗證 | **新** | No | 需可拋棄 DB |
| `R2-011` | POLISH — P3 | Marketplace | 清單不揭露可購買性 | **新** | No | 無 |
| `R2-012` | POLISH — P3 | A11y | Checkbox 未收斂 | `A11Y-02` | No | 無 |
| `R2-013` | POLISH — P3 | A11y/UI | 焦點框被裁 4px | `A11Y-03` | No | 無 |
| `R2-014` | POLISH — P3 | Admin/Legal Ops | 無法律文件 Admin UI | `OPS-06` | No | 無 |
| `R2-015` | POLISH — P3 | Data | mojibake 檔名未回填 | `DX-16` | No | Owner 拍板 |
| `R2-016` | POST-MVP | Privacy | DSR 刪除／匯出／撤回 | `H-4` | No | `L-21` |
| `R2-017` | NOT A GAP | Paid delivery | 付費教材授權無洩漏 | — | No | — |
| `R2-018` | NOT A GAP | AuthZ | Admin 邊界完整 | — | No | — |
| `R2-019` | NOT A GAP | Legal routes | 404／no-draft-leak 有護欄 | `TEST-01` | No | — |

> **`R2-008` 註：** 若最終部署平台**沒有**自動重啟機制，應升為 **ENGINEERING P1**。

---

## 7. 最重要的問題

> **若律師／會計師今天就核准，這個 repository 能安全上線 MVP 嗎？**

```text
CONDITIONALLY
```

法律核准會解除 `R2-001`～`R2-004`，但**不會**解除兩個 Owner／部署決策，
它們與法律無關且同樣是硬阻擋：

1. **`R2-005`（`PRE-01`）** —— repo 內**沒有任何部署設定**。
   而且 `config/privateFileStorage.js` 在 `NODE_ENV=production` + local driver 時
   **fail-closed 拒絕啟動**，除非明示 opt-in 持久化磁碟。也就是說：
   在選定平台並提供持久化儲存之前，**production backend 根本起不來**。
2. **`R2-006`（O-19）** —— 沒有 production SMTP provider，
   訂單成立／付款指示／審核結果等 MVP 承諾的通知**送不出去**。

**除這兩項外，沒有其他非外部的上線阻擋。** 工程面的 `R2-008`～`R2-010` 皆為 P2，
不獨立阻擋上線（但 `R2-008` 建議在上線前一併處理，理由見上註）。

---

## 8. Launch critical path

```text
CURRENT (HEAD 4234723 — engineering P1/P2 queue empty, 11 commits unpushed)
  ↓
External lawyer + accountant joint determination        ← PRE-03 (R2-001)
  ↓
Lawyer approval of the four legal documents             ← P1-09 (R2-002)
  ↓
Owner decisions (parallel with the above, not blocked by it)
    ├─ deployment platform + persistent storage         ← PRE-01 (R2-005)
    ├─ production SMTP provider                         ← O-19  (R2-006)
    └─ 179 legacy pending_payment disposition           ← OPS-01 (R2-007)
  ↓
Engineering hardening recommended before launch
    └─ R2-008 unhandled-rejection guard (P1 if no supervisor)
  ↓
Final legal copy → OPS-05 preflight → deliberate publish
  ↓
Consent / re-consent wiring (Gate 5, Gate 13)           ← R2-003
  ↓
Fresh-DB provisioning verification                      ← R2-010
  ↓
Release integration (merge 11 commits, push)
  ↓
MVP launch
```

---

## 9. Scope proof

```text
production frontend changed: NO
production backend changed:  NO
business logic changed:      NO
schema changed:              NO
migration executed:          NO
legal wording changed:       NO
legal_documents before/after: 0 / 0
consent_records before/after: 0 / 0
```

本輪唯一的寫入是本文件與 tracker。DB 僅有唯讀查詢與既有測試套件本身的 fixture 行為
（限 `teaching_platform_security_test`）。
