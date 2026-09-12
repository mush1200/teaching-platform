# Technical Go/No-Go Gate

**狀態：** 定義完成於 2026-09-12（`PRE-16`）。首次執行結果見 §6。
**相關文件：** `docs/pending-work-tracker.md`（狀態的唯一 source of truth）、
`docs/production-environment-contract.md`、`docs/db-backup-and-migration.md`、
`docs/local-development-and-operations.md`

> **這份文件只定義「技術上做完了沒有」的判準。**
> 它**不**維護待辦、**不**排優先序、**不**做法律或商業判斷 —— 那些各有歸屬（見 §8）。

---

## 0. 為什麼需要這份文件

在此之前，repo 內**唯一**帶有 gate 語氣的東西是 `P1-09` 的
`Deployment Readiness 0 / 14` —— 那是**法律文件 gate**。

只有一個 gate 會同時造成兩種相反的錯誤：

```text
把 External Dependency 當成技術失敗   →  技術其實已就緒，卻因為法律未完成而說「還沒開始」
因為法律過關就宣稱可上線             →  法律完成了，但技術面沒有任何人檢查過
```

因此本文件把判斷**拆成兩個**，並規定它們的關係。

---

## 1. 兩個判定，不可混用

```text
A. Technical Go/No-Go   ← 只由技術證據決定
B. 正式 Launch Go       ← Technical GO ＋ Legal ＋ Domain，三者同時成立
```

**`Technical GO` 不等於 `Launch GO`。** 宣布 Technical GO 時**不得**同時宣稱可以上線；
宣布 Launch GO 時**必須**同時指出所依據的 Technical GO 是哪一次、對應哪一個 commit。

### 1.1 External Dependency 不得使 Technical gate 自動判 FAIL

Legal（`L-*`／`P1-09`／`SEC-03 (b)`）與 Domain 屬 **External Dependency**。
它們**只影響 (B)**。Technical gate **不得**因為它們未完成而判 FAIL ——
技術面該做的事有沒有做完，與律師有沒有回覆是兩件事。

反向同樣成立：Legal 與 Domain 完成**不會**讓任何技術項目自動通過。

### 1.2 Owner-deferred 項目不得自動判 FAIL

被 Owner 明示延後的項目（`PRE-15`／`SEC-03 (a)`／`PRE-08 (ii)` 等）**不自動**構成技術阻擋。
**唯一的例外**是它在**當下**就構成 production 安全缺陷 —— 例如未授權存取、
資料外洩、資料毀損、無法安全啟動。延後一項「之後要做的清理」不等於「現在是壞的」。

### 1.3 「還開著」不等於「阻擋」

一個 tracker 項目處於 OPEN **不是**判 FAIL 的理由。只有符合 §4 的定義才算 blocker。

---

## 2. 證據規則

1. **每一項判準都必須指名可重跑的證據來源** —— 一個指令，或一次 production 量測。
   **「以前跑過」不算證據。**
2. **區分三種證據強度**，回報時必須標明是哪一種：

   | 標記 | 意義 |
   | --- | --- |
   | **`[P]` production-measured** | 對線上服務實際量測所得 |
   | **`[R]` repo-side** | 在 repo／測試資料庫上重跑所得，描述的是**該 commit**，不是線上 |
   | **`[I]` inferred** | 由設定或程式碼推得，**未經執行驗證** |

3. **`[R]` 證據只描述它所跑的那個 commit。** 若 production runtime ≠ 該 commit，
   `[R]` 證據**不描述 production**（此規則源自 `REL-05`：當時 production 與 HEAD 相差 151 檔，
   而 UI release gate 的全綠證據被誤讀成 production 的狀態）。
4. **測試失敗不等於產品缺陷。** 判定前必須先分類（見 §4.1）。
5. **不得**以縮小測試範圍、`test.skip`、刪除測試或放寬斷言的方式讓判準通過。

---

## 3. 判準

每一列的「證據來源」都是可以現在重跑的東西。

### 3.1 Deployment

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `D1` | production runtime 的身分是**已知且可證明的** | 能指出 production 正在跑哪一個 commit，並以**產物比對**證明（非僅憑部署紀錄） | `[P]` 取 production 的建置產物與本機該 commit 的 build 比對：CSS chunk 檔名／SHA-256，或請求某個**只存在於特定 build** 的 chunk 路徑並看 200/404 |
| `D2` | repo HEAD 與 production 的差異**已逐檔分類** | 每一個差異檔都歸入 docs／workflow／tests／fresh-provisioning-only／frontend runtime／backend runtime 之一 | `[R]` `git diff --name-status <prod>..<HEAD>` |
| `D3` | 沒有**未部署且為上線所必需**的 runtime 變更 | 若存在，必須先部署並重跑 `D1`＋§3.6 的 production smoke | `[R]` §3.1 `D2` 的分類結果 ＋ Owner 對「是否為上線所必需」的判定 |
| `D4` | 部署行為是**受控的** | `render.yaml` 兩個服務皆 `autoDeployTrigger: "off"`，部署為明示動作 | `[R]` `grep autoDeployTrigger render.yaml` |

### 3.2 Auth / Role matrix

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `A1` | 未授權一律 401 | 無 token 存取受保護資源 → 401，且**不**因此登出或進入 redirect loop | `[R]` `npx playwright test tests/e2e/session-expiry.spec.ts` |
| `A2` | 角色不符一律 403，且**不**清除 session | `requireRole` 不符 → 403；403 **不得**被當成 session 失效 | `[R]` 同上（`session-expiry.spec.ts` 的 403 區塊） |
| `A3` | 三種角色各自可達自己的工作區 | buyer／creator／admin 登入後可進入各自路由 | `[P]` production 三角色人工複驗（`REL-04` 程序）／`[R]` `critical-acceptance.spec.ts` |
| `A4` | 授權邊界只有一個 | 授權一律由 Backend `requireAuth`／`requireRole` 決定；`tp_role` cookie 只是 UX hint | `[R]` `npx playwright test tests/e2e/api-proxy.spec.ts` ＋ `CLAUDE.md` §3 |
| `A5` | 公開註冊**永遠**建立不了 admin | `POST /auth/register` 帶 `role:"admin"` → 403 | `[R]` `npm run smoke --prefix Backend` |

### 3.3 DB / Schema

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `S1` | 沒有待套用的 migration | production runtime 與 HEAD 之間**沒有**新增 migration | `[R]` `git diff --name-only <prod>..<HEAD> -- Backend/migrations/` |
| `S2` | canonical schema 未被實質改動 | `db/db_schema.sql` 的**可執行行數**與內容在差異區間內一致（註解不算） | `[R]` `git show <ref>:db/db_schema.sql \| sed 's/--.*//' \| grep -vE '^\s*$' \| wc -l` 兩端比對 |
| `S3` | 全新 provisioning 與 canonical 一致 | bootstrap 建出來的庫與 `db/db_schema.sql` 為同一份 schema | `[R]` `PRE-06` 的可拋棄庫程序（建新庫 → 比對 table／index／default／FK） |
| `S4` | 沒有已知的 production 資料毀損 | 最近一次 production 備份能還原並通過結構與資料驗證 | `[P]` `backup-restore-verification.yml`（`workflow_dispatch`，指定 object key） |

### 3.4 ENV / Config

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `E1` | proxy `ALLOW_ROOT` 涵蓋所有需經前端轉發的 Backend 前綴 | 每個 `app.use("/x")` 的 `x` 要嘛在 `ALLOW_ROOT`，要嘛**刻意**不在並有記載（目前只有 `uploads`，它是公開 static） | `[R]` 比對 `Backend/index.js` 的掛載點與 `app/api/backend/[...path]/route.ts` 的 `ALLOW_ROOT` |
| `E2` | `JWT_SECRET` fail-closed | 未設／空白／已知佔位值／短於 32 字元 → Backend 拒絕啟動 | `[R]` `Backend/utils/jwt.js` 的 `readJwtSecretFromEnv()` ＋ `npm run test:unit --prefix Backend` |
| `E3` | private storage 設定 fail-closed | 設定不完整時拒絕啟動，不靜默退回本機磁碟 | `[R]` `Backend/config/privateFileStorage.js` ＋ `tests/privateFileStorageConfig.test.js` |
| `E4` | production URL 契約成立 | production 缺少必要 URL 設定時明確失敗，不退回 localhost | `[R]` `Backend/config/productionUrlContract.js` ＋ `tests/productionUrlContract.test.js` |

### 3.5 核心交易鏈

**purchase → payment proof → admin review → entitlement → download**

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `T1` | 完整購買旅程可完成 | 登入 → 逛 → 結帳 → 上傳憑證 → 下載 → Admin 審核，端到端成立 | `[R]` `npx playwright test tests/e2e/critical-acceptance.spec.ts`（含第 16 項 full flow） |
| `T2` | 人工付款審核鏈成立 | 憑證上傳 → Admin 核准／退回（退回需結構化理由）→ 訂單狀態改變 | `[R]` 同上（第 13／14 項）＋ `npm run smoke --prefix Backend` |
| `T3` | entitlement 與下載授權正確 | 買家授權綁教材而非版本；未授權 token 被拒；`approved_file_id` 只有 Admin 流程寫得到 | `[R]` `npm run smoke --prefix Backend`（download token／material file 區塊） |
| `T4` | 無法交付的教材不得販售 | 沒有 `approved_file_id` 的教材在 approve／加入購物車／建立訂單三處皆 409 | `[R]` `npm run smoke --prefix Backend` |
| `T5` | 退款／補救案件可在產品內處置 | Admin 可瀏覽、建立、轉移案件並記錄退款執行 | `[R]` `npx playwright test tests/e2e/admin-remedy-cases.spec.ts` |

### 3.6 Security invariants

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `X1` | 付款憑證永不是 public asset | `/uploads/payment-proofs/*` → 404；讀取只有 `Admin OR 訂單擁有者` 一條路 | `[R]` `npx playwright test tests/e2e/payment-proof-security.spec.ts` |
| `X2` | 教材本體與媒體受保護 | `storage_key`／`checksum`／`uploaded_by` 不出現在任何 API 回應或 log | `[R]` `npx playwright test tests/e2e/material-media-security.spec.ts` ＋ smoke |
| `X3` | 法律文件發布路徑受保護 | public 端只讀 published 版本；寫入只在 `/admin/legal-documents/*` | `[R]` `npx playwright test tests/e2e/legal-publication-security.spec.ts` |
| `X4` | repo 內無 secret | tracked 檔案中沒有真實憑證；`.env` 未進版控 | `[R]` `git grep -nIE '(AKIA[0-9A-Z]{16}\|-----BEGIN [A-Z ]*PRIVATE KEY-----\|postgres(ql)?://[^ ]*:[^ ]*@)' -- . ':!*.md'` |
| `X5` | CI 的備份金鑰**無法刪除**備份 | workflow 內沒有任何遠端刪除操作；金鑰權限不含 `deleteFiles` | `[R]` `grep -nE 's3 rm\|delete-object\|--delete' .github/workflows/*.yml` ＋ `[I]` Owner 設定的 B2 key 權限 |
| `X6` | 公開 repo 的 CI 不外洩 | workflow `permissions: {}`；**不**上傳 artifact；錯誤訊息不含 URL／憑證 | `[R]` `grep -nE 'permissions:\|upload-artifact' .github/workflows/*.yml` |

### 3.7 Monitoring

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `M1` | 監控**正在跑**（不只是設定好） | 排程近期連續成功 | `[P]` `gh run list --workflow=synthetic-monitor.yml` |
| `M2` | 失敗會告警 | 人為誘發失敗會讓 Healthchecks check 轉 DOWN 並發出通知 | `[P]` `synthetic-monitor.yml` 的 `workflow_dispatch` `test_mode=fail-backend` |
| `M3` | 恢復會通知 | 後續成功 run 讓 check 轉回 UP 並發出 recovery 通知 | `[P]` 同上，`test_mode=none` |

### 3.8 Backup / Recovery

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `B1` | 排程備份**正在跑** | 有成功的 scheduled run，且產出物大小／checksum 經驗證 | `[P]` `gh run list --workflow=nightly-db-backup.yml` |
| `B2` | 備份**可還原** | 已存放的 B2 物件能還原進隔離的 PG≥17 並通過結構／資料／app smoke | `[P]` `backup-restore-verification.yml` |
| `B3` | 備份有保留政策 | bucket 有明示的保留期限 | `[I]` Owner 在 B2 設定的 lifecycle（repo 無法量測） |
| `B4` | 有還原 runbook | 步驟可被非作者照著執行 | `[R]` `docs/db-backup-and-migration.md` §8 |

### 3.9 Support technical availability

| ID | 判準 | 通過條件 | 證據來源 |
| --- | --- | --- | --- |
| `U1` | public `/support` 可達且有可用的聯絡管道 | production `/support` 回 200，且信箱**確實收得到信** | `[P]` `curl -o /dev/null -w '%{http_code}' https://<prod>/support` ＋ Owner 收信確認 |

---

## 4. Blocker 的定義

**只有**同時滿足以下兩者才算 Technical blocker：

1. 它讓 §3 的某一項判準**確定**無法通過；且
2. 它在**當下**就影響 production 的正確性、安全性或可運作性 ——
   而不是「之後要清理」「之後要補」。

### 4.1 測試失敗的分類（判定 blocker 前必做）

```text
1  product defect            產品真的壞了            → 可能是 blocker
2  test defect               斷言／selector 過期      → 不是 blocker，但要修
3  harness / 環境不穩         跑序、共用資料庫殘留     → 不是 blocker，是證據品質問題
4  intentional behaviour      產品刻意改了，測試沒同步  → 不是 blocker，要重新對齊
```

**分類方法（不得省略）：**

- **隔離重跑** —— 單獨跑該 spec。在完整套件中失敗、隔離後通過 → 屬第 3 類。
- **clean-tree 重跑** —— `git stash` 後在乾淨的 base 上重跑。兩邊都失敗 → 與本次改動無關。
- **雙向比對** —— 兩次完整跑的失敗集合若**雙向互有增減**，即為不穩定，
  不得歸因於任何單一改動。

**判定規則：** 只有當一個失敗**在當前 HEAD 上可穩定重現**、
**且**落在 §3.5／§3.2／§3.6 的路徑上，才是 blocker。

---

## 5. 判定用語

只能回傳其中一個：

| 判定 | 意義 |
| --- | --- |
| **A. TECHNICAL GO** | §3 全數通過，且無已接受風險需要列舉 |
| **B. TECHNICAL GO WITH ACCEPTED RISKS** | §3 全數通過，但存在已列舉、已說明、Owner 可見的殘留風險 |
| **C. TECHNICAL NO-GO** | 至少一項符合 §4 的 blocker |
| **D. BLOCKED — insufficient evidence** | 判準無法判定，因為證據不存在或不可重跑 |

宣布 **A** 或 **B** 時**必須**同時說明：**判定的對象是哪一個 commit**，
以及**是否必須先部署**才能讓該判定適用於 production。

---

## 6. 執行紀錄

### 6.1 2026-09-12 —— 首次執行

**判定對象：** `d93a99e`（repo HEAD）。**production runtime 當時為 `94c38fe`。**

| 區塊 | 結果 | 主要證據 |
| --- | --- | --- |
| `D1`–`D4` | PASS | `[P]` production 對 `/_next/static/chunks/app/admin/remedy-cases/page-b7867508d39c822e.js` 回 **404**，對照組 CSS chunk 回 200、亂數 chunk 回 404 → **production 不含 `IA-10`**，runtime 早於 `9c886b6`。17 個 commit 逐檔分類見 §6.2 |
| `A1`–`A5` | PASS | `[R]` `session-expiry` ＋ `api-proxy` ＋ `payment-proof-security` 等 6 支安全／授權 spec：**112 passed / 0 failed / 4 skipped**；`[R]` smoke exit 0；`[P]` `REL-04` production 三角色複驗（對象即現行 production `94c38fe`） |
| `S1`–`S4` | PASS | `[R]` `94c38fe..d93a99e` **新增 migration 0 個**；`db/db_schema.sql` 兩端可執行行數皆 **666**（差異為註解）；`[P]` `PRE-08 (i)` 已存放物件還原進隔離 PG17.11，結構 26 tables／93 indexes、列數相符、app smoke 全過 |
| `E1`–`E4` | PASS | `[R]` `ALLOW_ROOT` 與 `Backend/index.js` 掛載點比對：唯一未列入者為 `uploads`（公開 static，刻意排除）；`JWT_SECRET`／private storage／production URL 三處 fail-closed 程式碼在位 |
| `T1`–`T5` | PASS | `[R]` `critical-acceptance.spec.ts` **隔離重跑 36/36 通過（兩個 project）**，含第 16 項 full flow；`[R]` `npm run smoke --prefix Backend` **exit 0，全部通過**（目標庫已 assert 為 `teaching_platform_security_test`）；`[R]` `admin-remedy-cases.spec.ts` **21/21** |
| `X1`–`X6` | PASS | `[R]` 安全 spec 群組全綠；`[R]` secret 掃描唯一命中為 `.env.example` 的 `<user>:<password>` 佔位樣板；`.env` 未進版控；`[R]` 兩個 workflow 皆 `permissions: {}`、無 artifact 上傳、無遠端刪除操作 |
| `M1`–`M3` | PASS | `[P]` `synthetic-monitor` 排程**連續 6 次成功**，最近一次 `2026-09-12T14:09Z`；`M2`／`M3` 由 `OPS-07` 的 6/6 operator evidence 提供（誘發 DOWN → 告警 → 恢復 → recovery 通知） |
| `B1`–`B4` | PASS | `[P]` `nightly-db-backup` scheduled run `2026-09-11T21:15Z` **success**（首次排程備份，113,015 bytes／checksum 相符／HeadObject PASS）；`[P]` `backup-restore-verification` `2026-09-11T16:13Z` **success**；`[I]` B2 保留 365 天為 Owner 設定 |
| `U1` | PASS | `[P]` production `/support` **HTTP 200**；`PRE-14` 已於 2026-09-04 以設定完成的信箱部署 |

**Blocker 數：0。**

### 6.2 repo HEAD 與 production 的差異分類（`D2`）

`94c38fe..d93a99e`＝**17 commits／13 檔**：

```text
workflow only           .github/workflows/{synthetic-monitor,nightly-db-backup,backup-restore-verification}.yml
docs only               docs/{admin-information-architecture,db-backup-and-migration,pending-work-tracker}.md
tests only              frontend/apps/web/tests/e2e/{admin,admin-remedy-cases}.spec.ts
fresh-provisioning-only Backend/models/bootstrapModel.js
                          （ADD COLUMN IF NOT EXISTS 在欄位已存在時整段跳過；DEFAULT 只影響新建表；
                            移除 CREATE INDEX 只影響新庫 —— 對既有 production DB 為 no-op）
canonical reference     db/db_schema.sql（comment-only，可執行行數 666 → 666）
frontend runtime        app/admin/remedy-cases/page.tsx（新頁）
                        lib/admin-nav.ts（新增一個導覽項）
                        components/ds/KpiCard.tsx（新增 data-testid，無行為／視覺改動）
backend runtime         （無 —— 唯一的 Backend 檔屬 fresh-provisioning-only）
```

**結論：production 沒有落後任何 backend runtime 變更，也沒有待套用的 migration。**
唯一未部署的 runtime 差異是 `IA-10` 的 Admin 退款補救頁及其導覽項。

### 6.3 首次執行的判定

> ## **B. TECHNICAL GO WITH ACCEPTED RISKS** —— 判定對象 `d93a99e`
>
> **必須先部署嗎：** 視 `IA-10` 是否為上線所必需而定，這是 **Owner 的判定**，不是技術判定。
>
> - 若 **需要**在產品內處置退款／補救案件才上線 → **必須先部署 `d93a99e` 並重跑 `D1` 與 §3.6 production smoke**，
>   本判定才適用於 production。
> - 若 **接受**上線初期以 API workaround 處理退款（`IA-10` 立案時即判為 `P2`，
>   理由記載為「有可用的 API workaround、不阻擋目前開發」）→ 現行 production `94c38fe`
>   本身不含任何已知技術缺陷，可不先部署。
>
> **不論選哪一條，`[R]` 證據描述的都是 `d93a99e`。** 若不部署，
> 則 `T5`（退款案件產品內處置）在 production 上**不成立**，只在 repo 上成立。

---

## 7. 已接受風險（首次執行時的清單）

| # | 風險 | 為什麼不是 Technical blocker | 什麼會讓它變成 blocker |
| --- | --- | --- | --- |
| 1 | `/health` 是淺層檢查，不驗 DB | 它的用途是「行程還活著嗎」。DB 的健康由 `B1`／`B2` 與交易鏈判準涵蓋；把 DB 查詢放進 `/health` 會讓監控在 DB 短暫抖動時誤報 outage | 出現一種「行程活著但所有交易都失敗」且監控完全沉默的事故 |
| 2 | production 可能仍留有 8 個非 canonical 的歷史索引 | 索引是效能結構，不是正確性契約。Owner 已判定為 historical artifacts；`PRE-06` 已讓**新** provisioning 對齊 canonical，且未 DROP 任何既有索引 | 某個索引造成錯誤結果（而非只是效能差異），或阻擋 migration |
| 3 | production 的 `materials.reviewed_by` 可能沒有 canonical 的 FK | `ADD COLUMN IF NOT EXISTS` 在欄位已存在時整段跳過，因此既有庫未加上該約束。runtime 的寫入路徑本來就只寫合法的 user id | 出現實際的孤兒參照，或有路徑會寫入不存在的 user id |
| 4 | `PRE-15` production launch data baseline cleanup 延後 | OWNER-DEFERRED。它是「上線前清資料」，不是「現在有缺陷」。production 測試帳號另有 **OWNER-PRESERVE** 明示保護 | 測試資料會被真實使用者看見，或參與真實金流 |
| 5 | `PRE-08 (ii)` launch-baseline 還原演練延後 | OWNER-DEFERRED，隨 `PRE-15`。(i) 已證明**備份與還原機制本身可用**；(ii) 是「用上線後的資料基線再演練一次」 | 資料基線大幅改變後，(i) 的還原證據不再具代表性 |
| 6 | `SEC-03 (a)` engineering deletion capability 延後 | OWNER-DEFERRED。缺的是**工程刪除能力**，不是現存的外洩 | 收到必須在期限內執行的刪除請求，而工程上做不到 |
| 7 | `SEC-03 (b)` BLOCKED — LEGAL | External Dependency。依 §1.1 **不得**使 Technical gate 判 FAIL | —（它只擋 Formal Launch Go） |
| 8 | `TEST-03` —— 完整 E2E gate 非決定性 | 這是**證據品質**問題，不是產品缺陷。所有 launch-critical 判準已改由**隔離重跑**取得決定性證據（見 §6.1 `T1`–`T5`、`X1`–`X6`） | 某個失敗在隔離重跑下**仍然**穩定重現，且落在 §3.5／§3.2／§3.6 上 |
| 9 | `creator-sales.spec.ts:204`／`:619` 穩定失敗 | **test defect，非產品缺陷。** 兩者都是 `UI-CONS-11` 的同一個 DOM 契約漂移：`TrendChart` 新增 `sr-only` 等價資料表後，`table` 數由 2 變 3，而測試以 `toHaveCount(2)` 與 `querySelectorAll("table")[1]` 定位。產品 markup 經查證正確（`text-right tabular-nums` 在位） | 若查證顯示產品 markup 真的缺少對齊或語意 |
| 10 | `complaint-evidence-delivery.spec.ts:211` 穩定失敗 | **intentional behaviour，非產品缺陷。** `REL-04` 刻意讓 502／503／504 一律使用自家文案；此測試斷言的是更早的 app 層 503 措辭。訊息誠實且**不洩漏路徑**（該斷言仍通過） | 若該文案在某個情境下會誤導使用者做出錯誤操作 |
| 11 | Legal／Domain 為 External Dependency | 依 §1.1 不得使 Technical gate 判 FAIL | —（它們只擋 Formal Launch Go） |

---

## 8. 這份文件放在哪裡（`PRE-16` CC 5）

`PRE-16` 的完成判準第 (5) 條寫的是
**「gate 放在哪份 canonical doc 由 Owner 決定，本檔只維護狀態」**。

本文件因此建立為**獨立、自足**的一份 doc，**沒有**改動
`docs/mvp_rules.md`、`docs/teaching-platform-mvp-spec-v1.4.md` 或 `db/db_schema.sql`
任何一個字 —— 若 Owner 決定它應併入其中某一份，整份搬移即可，不會留下懸空的交叉引用。

**狀態仍然只在 `docs/pending-work-tracker.md` 維護。** 本文件不列待辦、不排優先序。
