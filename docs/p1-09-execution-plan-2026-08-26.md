# `P1-09` EXECUTION PLANNING ＋ `PRE-03` RESOLUTION

**日期：** 2026-08-26
**階段：** 文件／研究階段 **已結束**；本文件為執行規劃，**不修改任何 executable code**
**Canonical baseline：** `docs/PRE-03_PRE-04_P1-09_A-P_v1.8_Full_Baseline.md`

---

# A. CURRENT STATE CONFIRMATION

| 項目 | 狀態 | 不得倒退 |
| --- | --- | --- |
| `P1-09` Document Phase | **CLOSED** | ✅ |
| Document Regression | **PASSED (20/20)** | ✅ |
| Deployment Readiness | **0 / 14 IMPLEMENTED**（Gate 2 = PARTIAL） | ✅ |
| Legal Validation | **PENDING**（0 / 22 active，1 deferred） | ✅ |
| Tax Validation | **PENDING**（0 / 14 active，1 deferred） | ✅ |
| `PRE-03` | **OPEN** | ✅ |
| `PRE-04` | **OPEN** | ✅ |
| `P1-09`（tracker item） | **OPEN**（deployment blocker） | ✅ |
| Scope Freeze | **APPROVED** | 本輪未新增任何 `PRE`／module／`MR`／Gate |

---

# A.1 REPO INVENTORY（本輪新取得的 evidence）

> 這三項發現直接改變了 Gate 排序判斷。

## `INV-1` — `order_items` **已存在**，且已有 snapshot pattern

```sql
order_items (
  id TEXT PRIMARY KEY,
  order_id, material_id,
  title_snapshot TEXT NOT NULL,     -- ← snapshot pattern 已在此表
  price_snapshot NUMERIC NOT NULL,  -- ←
  quantity INTEGER NOT NULL DEFAULT 1,
  seller_id TEXT REFERENCES users(id),
  subtotal, created_at,
  UNIQUE (order_id, material_id)
)
```

**意義：**

- **Gate 7**（`fulfilled_material_version_id` / `fulfilled_at`）與
  **Gate 14**（`entitlement_status` 等）**落在同一張已存在的表上**，
  且該表**已經有 snapshot 慣例**（`title_snapshot`／`price_snapshot`）。
  → 兩者可用**同一次 migration** 完成，且**與 `PRE-03` 的法律答案無關**。
- `UNIQUE (order_id, material_id)` 只擋**同一張訂單內**重複，
  **不擋跨訂單重複購買同一教材** → `E2-A`／`F-03` 的執行需要**跨訂單**查詢，
  而該查詢的自然條件正是 entitlement state。
- `quantity DEFAULT 1` **沒有 CHECK 約束** → 可能 >1，
  與 `E2-A`「不得以增加訂購數量之方式形成多席次授權」有潛在衝突。
- `seller_id` 欄位名稱**內建 Marketplace 模型**。內部欄位不違反 `§5`，
  但**若外洩到 Buyer UI 即違反**「Buyer UI 不把 Creator 顯示為 Seller」（`MR-19`）
  → 列為 Gate 14 驗收前的檢查項（不新增 Gate）。

## `INV-2` — Buyer entitlement **完全由 `orders.status` 推導**

```sql
-- Backend/services/materialFile.service.js:413
WHERE o.user_id = $1 AND o.status = 'approved' AND oi.material_id = $2
```

**意義：** 目前沒有任何可獨立撤銷的 entitlement 記錄，
**但 `order_items` 這張表已經存在** ——
因此 `entitlement_status` 可加在 `order_items`，
entitlement 查詢只需**多一個 AND 條件**，
**完全不需要碰 `orders.status`**（`§Gate 14` 明文禁止）。

> 這是本輪最重要的工程結論：**Gate 14 的 entitlement 部分是一個小而安全的變更，不是重構。**

`material_files.status` 另已有 `'revoked'`（「平台停止交付」）——
那是**檔案層級**，與**每位買家**的 entitlement 是不同維度，兩者不得混用。

## `INV-3` — `orders.paid_at` 的語意是「**核准時間**」，不是「收款時間」

```
Backend/services/adminDashboard.service.js:74
  periodRevenueAmount  期間內「核准」的訂單金額 → paid_at
```

**意義：**

- `paid_at` ≈ `payment_approved_at`，**不是** `payment_received_at`
- 它目前**被 Admin Dashboard 當作營收認列日期**
  → **Gate 6 會觸及 `adminDashboard.service.js` 的營收報表語意**，
    新增 `payment_received_at` 時**不得**靜默改變既有 dashboard 的計算基礎
- 依 `J2`／`P6`，稅務憑證時點必須用**實際入帳時間**，
  因此 `paid_at` **不是**合法的稅務時鐘

## `INV-4` — 付款辨識資訊**沒有結構化欄位**

`db/db_schema.sql` 對 `last_four`／`last4`／`bank_name`／`payer_name`／`remit` **0 命中**。
`manual_payment_proofs` 只有檔案欄位（`storage_key`、`proof_mime_type`、`original_filename`）
與審核欄位（`review_status`、`reviewed_by`、`reviewed_at`、`rejection_reason`）。

**意義：** baseline `§2.1` 描述的「Buyer 回填匯款銀行／後四碼／金額」
**目前只有上傳憑證檔案，沒有結構化欄位**。
`manual_payment_proofs.uploaded_at` 是 `payment_info_submitted_at` 最接近的既有欄位。
→ 併入 **Gate 6** 的 acceptance criteria，**不新增 Gate**。

## `INV-5` — `users` 表極簡

```sql
users (id, email, password_hash, role, created_at)
```

**無** consent 欄位、**無** frozen 欄位、**無** 姓名／稅務欄位、**無** `updated_at`。
→ Gate 1、Gate 5、`P9` 全部需要新增欄位；`F-11`（18+）亦落在註冊路徑。

---

# B. `PRE-03` RESOLUTION MATRIX

**分類：** `A` ＝ v1.8 已定案不需再研究｜`B` ＝ 須 Lawyer 驗證｜`C` ＝ 須 Accountant/Tax 驗證

| ID | Question | v1.8 assumption | 類 | External owner | Required evidence | Blocks deployment? | Blocks which Gate? | Engineering 可否先行? | Resolution needed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q-01 | Platform-as-Seller target model 是否成立 | 成立（`§1`／`PRE-03.1`） | **B** | Lawyer `L-01` | 律師意見書 | ✅ | 間接影響全部條款文案 | ✅ 可（基礎設施與模型無關） | **上線前** |
| Q-02 | 人工匯款＋Admin 核帳是否構成代收代付 | **不落入**（`PRE-03.2`：定義三要素第 3 點被打斷） | **B** | Lawyer `L-02` | 律師意見書 | ✅ **最高風險** | 不直接擋 Gate，擋**商業模式** | ✅ 可 | **上線前，且愈早愈好** |
| Q-03 | Seller-of-Record 如何呈現 | Platform；Buyer UI 不顯示 Creator 為 Seller（`§5`／`MR-19`） | **A ＋ B** | Lawyer `L-01` | 律師確認文案 | ✅ | Gate 14 驗收前的 UI 檢查 | ✅ 可（`INV-1` 的 `seller_id` 外洩檢查） | 上線前 |
| Q-04 | Creator remuneration 的法律／稅務定性 | **中性詞「Creator 報酬」**，不預設（`C9`／`P7`） | **B ＋ C** | Lawyer `L-01`／Accountant `T-09` | 會計師備忘 | ✅ | **Gate 8** | ⚠️ accrual 可做，**payout 不可** | **第一次 payout 前** |
| Q-05 | Creator 為個人／營業人對憑證流程的影響 | 資料模型預留身分類型（`P9`） | **C** | Accountant `T-12` | 會計師備忘 | ✅ | **Gate 8** | ⚠️ 欄位可預留，**不得先蒐集**（須先更新 `B5`） | 第一次 payout 前 |
| Q-06 | 平台營業項目／公司登記是否需調整 | 未定，待 `P0` | **C** | Accountant `T-01` | 登記文件 | ✅ | **Gate 9**（適用性）、Gate 8 | ❌ 不可 | **最優先** —— 是 `T-04`／`T-05`／`L-16` 的前提 |
| Q-07 | 統一發票／收據／其他合法憑證 | 依核定（`P4`／`P5`） | **C** | Accountant `T-05`／`T-06` | 國稅局核定文件 | ✅ | Gate 6（稅務時鐘）、Gate 14（沖銷） | ⚠️ 時間戳欄位可先做 | 開始收款前 |
| Q-08 | 第一次 Creator payout 前必須完成哪些稅務事項 | 所得定性＋扣繳＋憑單（`P8`） | **C** | Accountant `T-09`／`T-10` | 會計師備忘 | ✅ | **Gate 8** | ⚠️ ledger schema 可先做 | 第一次 payout 前 |
| Q-09 | withholding / reporting 所得類別 | 不預設（版稅／權利金／執行業務所得三者稅負不同） | **C** | Accountant `T-09`／`T-10`／`T-11` | 會計師備忘 | ✅ | Gate 8 | ❌ 不可（申報無中性類別） | 第一次 payout 前 |
| Q-10 | `P14` refund / reversal 的稅務處理 | 三維 decision tree，各分支待填（`P14`） | **C** | Accountant `T-08` | 會計師備忘 | ✅ | **Gate 14**（tax reversal 節點） | ⚠️ 時間戳與狀態機可先做 | Gate 14 上線前 |
| Q-11 | `PRE-03.8` Reopen Triggers 是否完整且與 v1.8 一致 | 11 項 ＋ substance test | **A** | —— | 已於 `MR-01` 驗證 | ❌ | —— | ✅ | **已定案** |

## B.1 分類統計

| 類 | 數 | 項目 |
| --- | --- | --- |
| **A**（已定案） | 2 | `Q-03`（部分）、`Q-11` |
| **B**（Lawyer） | 3 | `Q-01`、`Q-02`、`Q-03`／`Q-04`（部分） |
| **C**（Accountant） | 7 | `Q-04`～`Q-10` |

> **`Q-06`（營業項目／公司登記）是所有稅務問題的前提** ——
> `T-04` 稅籍、`T-05` 發票核定、`Gate 9` 適用性、以及（若 `Q-02` 落回代收代付）
> 能量登錄資格，全部依賴它。**它應排在會計師問題清單的第一題。**

---

# C. `PRE-04` RESOLUTION MATRIX

| ID | 項目 | 類 | Owner | Blocks | 可直接進工程？ |
| --- | --- | --- | --- | --- | --- |
| PRE-04.1 | Order Fulfillment Snapshot（五欄位） | **C（工程）** | Engineering | Gate 7 | ✅ **可以** —— `order_items` 已有 snapshot 慣例（`INV-1`） |
| PRE-04.2 | 公開教材更新政策（事前揭露） | **A ＋ B** | Product ＋ Lawyer `L-10` | Gate 7 的 UI 部分 | ⚠️ 資料層可做，**文案待 `L-10`** |
| PRE-04.3 | 更新分級（Patch／Minor／Material Change） | **B** | Lawyer `L-10` | Gate 7 的 workflow | ⚠️ **分級欄位**可先做，**分級判準文案待律師** |
| PRE-04.4 | Existing Buyer Notification（五欄位） | **C（工程）** | Engineering | Gate 7 | ✅ 可以 |
| PRE-04.5 | Historical Version Rights | **B** | Lawyer `L-06` | Gate 14（cleanup 判定） | ⚠️ `legal_hold` primitive 可先做 |
| PRE-04.6 | Creator 離開／IP 違法例外 | **B** | Lawyer `L-05`／`L-14` | Gate 14 | ⚠️ 狀態機可先做 |
| PRE-04.7 | `PRE-04` Legal Gate | **B** | Lawyer `L-10`／`L-11` | —— | —— |

## C.1 核心問題：**`PRE-04` 是否必須整體完成，Gate 7 / Gate 14 才能開工？**

> ## **不是。**

**理由（repo evidence）：**

| 子工作 | 依賴 `PRE-04` 律師結論嗎？ |
| --- | --- |
| `order_items` 加 `fulfilled_material_version_id` / `fulfilled_at` | ❌ **不依賴** —— 無論更新政策怎麼寫，「這筆訂單當初交付了哪個版本」都必須被記錄 |
| `order_items` 加 `entitlement_status` 等欄位 | ❌ **不依賴** —— 無論 `C6-A` sublicense survival 怎麼寫，都需要可獨立撤銷的狀態 |
| `legal_hold` / `hold_reason` / `hold_set_at` / `hold_released_at` primitives | ❌ **不依賴** —— hold 的**觸發理由**待律師，但**欄位與 fail-closed 讀取邏輯**是中性的 |
| 版本更新的**分級判準**與**通知門檻** | ✅ **依賴** `L-10` |
| 更新政策的**對外文案** | ✅ **依賴** `L-10` |
| cleanup 的**保存期限數值** | ✅ **依賴** `L-21`／`L-22`／`T-14` |

**結論：** `PRE-04` 的**資料層與狀態層**可以先做；
**判準、期限、文案**必須等律師與會計師。

---

# D. GATE 1～14 DEPENDENCY MATRIX

| Gate | Status | Dependencies | External dep | Schema | Backend | Frontend | Canonical doc | Can start now? | Blocking reason | Wave |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **1** Account Freeze | NI | 無 | 無 | `users` 加欄位 ＋ 稽核 | 中介層檢查 | Admin UI | `mvp_rules` | ✅ **可** | —— | **2** |
| **2** Material Rights Review | **PARTIAL** | 無 | 無 | `materials` 加 `D5` 欄位 | 審核流程 | Admin UI | `material-review-workflow` | ✅ **可** | —— | **2** |
| **3** Complaint ＋ 15 日 SLA | NI | 無（**不得複用 `report_cases`**） | `L-17` 文案 | 新表 | CRUD ＋ SLA | Buyer/Admin UI | `mvp_rules` | ⚠️ 資料層可 | 外部管道文案待 `L-17` | **3** |
| **4** Buyer external evidence | NI | **Gate 3** | 無 | complaint attachment | 私有儲存（既有 primitive） | Buyer UI | —— | ❌ | 等 Gate 3 | **3** |
| **5** Consent versioning | NI | 無 | 條文本身（`P1-09` legal copy） | `users` ＋ consent 表 | 寫入／查詢 | 註冊／結帳 | —— | ⚠️ **基礎設施可** | **條文文字**待法務 | **2**（infra）／**4**（接文案） |
| **6** 三個時鐘 ＋ SLA | NI | `INV-3`／`INV-4` | `L-08` SLA 日數、`T-07` 稅務時點 | `orders` ＋ `manual_payment_proofs` 加欄位 | 核帳流程 ＋ **`adminDashboard.service.js`** | Admin UI | `mvp_rules` §19 | ⚠️ **欄位可** | **SLA 日數**待營運／律師；**營收語意**不得靜默變動 | **1**（欄位）／**3**（SLA） |
| **7** Fulfillment snapshot | NI | `PRE-04.1` | 無 | **`order_items` 加 2 欄** | 核准流程寫入 | —— | `material-file-storage` | ✅ **可** | —— | **1** |
| **8** PRE-TAX before payout | NI | `Q-04`〜`Q-09` | **Accountant `T-09`/`T-10`** | `P10` ledger 新表 | 結算計算 | Admin UI | `mvp_rules` §18.9 | ⚠️ **accrual 可，payout 不可** | 所得類別無中性選項 | **2**（ledger）／**Wave 0 gated**（payout） |
| **9** Security ＋ Post-Termination Plan | NOT STARTED | **`Q-06` / `T-01`** | **Accountant `T-01`** | 無 | 無 | 無 | `RETENTION-MATRIX` | ❌ | **適用性取決於行業別與登記** | **0** |
| **10** Discontinuation Plan | NI | `M7` | `L-15` | 無 | 無 | 無 | baseline | ⚠️ 草案可 | 條款文字待 `L-15` | **4** |
| **11** Buyer Payment Deadline | NI | Gate 6 欄位 | `L-08`／營運決定日數 | `orders` 加 `payment_due_at` | 逾期處理 | Checkout UI | `mvp_rules` | ⚠️ **欄位可** | **日數**待決定 | **1**（欄位）／**3**（流程） |
| **12** Legal Info Read & Save | NI | `P1-09` legal copy | **條文本身** | 無 | 無 | `/terms` 等 route ＋ 可儲存 | —— | ❌ | **沒有條文可放** | **4** |
| **13** Consent Ordering | NI | **Gate 5** ＋ Gate 11 | `L-09` 文案 | consent 表 ＋ 訂單關聯 | 三條斷言 | 結帳 UI | —— | ❌ | 等 Gate 5 | **4** |
| **14** Rescission & Remedy | NI | `INV-1`／`INV-2`；Gate 7；`P14` | `L-09`／`L-20`／**`T-08`** | **`order_items` entitlement ＋ refund 新表 ＋ `legal_hold`** | 狀態機 ＋ entitlement 查詢 ＋ cleanup | Admin UI | **`mvp_rules` §18.9** | ⚠️ **entitlement 與 refund 骨架可** | **稅務沖銷**待 `T-08`；**解除文案**待 `L-09` | **1**（entitlement）／**2**（refund）／**4**（tax） |

## D.1 未對應到編號 Gate 的 Phase 1 產品規則

依 Scope Freeze，**不新增 Gate 15**。以下規則掛在既有 Register ID，實作落點如下：

| Register ID | 規則 | 實作落點 |
| --- | --- | --- |
| `F-03` | `E2-A` 禁止重複購買同教材取得第二席 | **與 Gate 14 同一次 `order_items` migration** —— 判斷條件正是 entitlement state；並補 `quantity` 的 CHECK |
| `F-11` | 18+ 硬規則 | 註冊路徑（`users`），與 Gate 5 同批 |
| `S-13` | Creator Payout / Seller-of-Record Invariants | Gate 14 驗收前的 `seller_id` 外洩檢查（`INV-1`） |

---

# E. RECOMMENDED WAVE PLAN

```text
────────────────────────────────────────────────────────────────
WAVE 0 — External decisions（無工程，最長 lead time）
────────────────────────────────────────────────────────────────
  ▸ PRE-03 EXTERNAL VALIDATION PACKAGE
      Lawyer   : Q-01, Q-02, Q-03  →  L-01, L-02
      Accountant: Q-06 →（前提）→ Q-04, Q-05, Q-07~Q-10
                   T-01, T-04, T-05, T-06, T-09, T-10, T-11, T-12
  ▸ Gate 9 適用性判定（依賴 Q-06 / T-01）
  ▸ Gate 8 的 payout 授權（依賴 Q-09）

────────────────────────────────────────────────────────────────
WAVE 1 — Foundation / schema（不依賴 PRE-03 的答案）
────────────────────────────────────────────────────────────────
  ▸ order_items 擴充（單一 migration）
      + fulfilled_material_version_id, fulfilled_at        → Gate 7
      + entitlement_status, access_suspended_*/restored_*  → Gate 14
      + quantity CHECK                                     → F-03
  ▸ legal_hold / hold_reason / hold_set_at / hold_released_at primitives
  ▸ orders / manual_payment_proofs 時間欄位
      + payment_info_submitted_at, payment_received_at,
        review_due_at, payment_due_at                      → Gate 6, 11
      ※ 不得改動 paid_at 既有語意（INV-3）

────────────────────────────────────────────────────────────────
WAVE 2 — Core backend capability
────────────────────────────────────────────────────────────────
  ▸ Gate 14 entitlement 查詢加 AND 條件（不碰 orders.status）
  ▸ Gate 14 refund/remedy state machine（不含 tax reversal）
  ▸ Gate 1 Account Freeze
  ▸ Gate 2 Material Rights Review 補齊 D5 欄位
  ▸ Gate 8 accrual ledger（不含 payout 執行）
  ▸ Gate 5 consent infrastructure（不含條文文字）

────────────────────────────────────────────────────────────────
WAVE 3 — User / Admin workflow
────────────────────────────────────────────────────────────────
  ▸ Gate 6 SLA 流程與逾時告警（日數待 Wave 0）
  ▸ Gate 11 逾期訂單處理流程
  ▸ Gate 3 Complaint workflow ＋ 15 日 SLA
  ▸ Gate 4 external evidence 上傳

────────────────────────────────────────────────────────────────
WAVE 4 — Compliance UI / evidence（需 legal copy）
────────────────────────────────────────────────────────────────
  ▸ Gate 12 /terms 等 route ＋ 可儲存
  ▸ Gate 13 consent ordering 三條斷言
  ▸ Gate 14 tax reversal 節點（待 T-08）
  ▸ Gate 10 Discontinuation Plan
  ▸ Gate 7 更新政策 UI 與通知（待 L-10）

────────────────────────────────────────────────────────────────
WAVE 5 — Integration / E2E / release verification
────────────────────────────────────────────────────────────────
  ▸ 14 Gates 的 evidence 收集與 IMPLEMENTED 標記
  ▸ npm run verify:web / smoke / postman 全綠
  ▸ canonical doc 同步（CLAUDE.md §9）
```

---

# F. SAFE TO IMPLEMENT NOW

> **判準：** 即使 `PRE-03` 的法律答案與 v1.8 假設**相反**，這些工作仍不會浪費。

| 項目 | 為什麼與 `PRE-03` 答案無關 | Gate | Evidence |
| --- | --- | --- | --- |
| `order_items` ＋ `fulfilled_material_version_id` / `fulfilled_at` | 無論誰是 Seller，「這筆訂單交付了哪個版本」都必須記錄 | 7 | `INV-1` 已有 snapshot 慣例 |
| `order_items` ＋ `entitlement_status` / `access_suspended_*` / `access_restored_*` | 無論 sublicense survival 怎麼寫，都需要可獨立撤銷的狀態；且 Marketplace 模式**更**需要 | 14 | `INV-2` 目前完全由 `orders.status` 推導 |
| `order_items.quantity` CHECK | `E2-A` 是產品規則，與法律定性無關 | `F-03` | `INV-1` 目前無約束 |
| `legal_hold` 四欄位 primitive ＋ cleanup **fail-closed** 讀取 | hold 的**理由**待律師，**機制**中性 | 14 | 本 repo 已有 fail-closed 慣例 |
| `payment_info_submitted_at` / `payment_received_at` / `review_due_at` / `payment_due_at` 欄位 | 三個時鐘的**存在**與定性無關；只有 **SLA 日數**待決定 | 6、11 | `INV-3`／`INV-4` |
| 結構化匯款辨識欄位（銀行／後四碼／金額／匯款日） | 人工核帳在任何模式下都需要 | 6 | `INV-4` 0 命中 |
| Gate 1 Account Freeze | 應記載事項第十二點的法定義務，與 Seller 定性無關 | 1 | `INV-5` `users` 無 frozen |
| Gate 2 補齊 `D5` 審核紀錄欄位 | `PRE-03.6` 下更需要；Marketplace 下也需要 | 2 | 現況 PARTIAL |
| Gate 5 consent **基礎設施**（表、版本、關聯）— 不含條文文字 | 版本化同意證據在任何模式下都需要 | 5 | `INV-5` 無 consent 欄位 |
| `seller_id` 外洩檢查（API／UI 是否顯示為「賣家」） | 唯讀稽核，零風險 | `S-13`／`MR-19` | `INV-1` |

---

# G. WAIT FOR EXTERNAL VALIDATION

| 項目 | 等誰 | 為什麼不能先做 |
| --- | --- | --- |
| Creator payout **執行** | Accountant `T-09`／`T-10` | 申報**沒有中性所得類別**；先付款＝先做錯 |
| Creator 稅務欄位**實際蒐集** | Accountant `T-12` ＋ `B5` 更新 | 未更新告知範圍前蒐集個資即違反個資法 §8 |
| Gate 9 安全維護計畫 | Accountant `T-01`（`Q-06`） | **適用性**取決於行業別與登記，未定前做的計畫可能對錯行業 |
| Gate 12 `/terms` 等頁面 | 法務提供條文 | **沒有條文可放**；`P1-09` 明禁 placeholder |
| Gate 13 consent ordering 的**文案** | Lawyer `L-09` | 例外流程的告知文字決定證據內容 |
| Gate 14 **tax reversal** 節點 | Accountant `T-08` | 三維 decision tree 各分支未填 |
| Gate 14 **解除受理文案** | Lawyer `L-09`／`L-20` | §18 I(3) 的「行使方式」必須與實際機制一致 |
| Gate 6 **SLA 日數** | 營運 ＋ Lawyer `L-08` | 數字是決策，不是推導 |
| Gate 11 **付款期限日數** | 營運 | 同上 |
| Gate 7 更新政策**文案與分級判準** | Lawyer `L-10` | 分級決定是否需 Buyer consent |
| cleanup **保存期限數值** | `L-21`／`L-22`／`T-14` | `RETENTION-MATRIX` 各列的 legal basis 未覆核 |
| Gate 10 停業條款**文字** | Lawyer `L-15` | 受 `R4` 拘束 |
| Gate 3 外部申訴管道**聯絡資訊** | Lawyer `L-17` | 以官方最新資料為準 |

---

# H. DEFERRED / FUTURE（維持不動）

電子發票 API 串接／自動開立／自動折讓／自動申報整合｜Multi-seat / School / Organization License｜
Buyer stored-value / gift card / paid points｜Phase 2 Marketplace / split payment / Creator KYC 直收｜
信用卡與第三方金流 API｜向 Creator 收費｜`L-23`／`T-15`｜既有 `FUT-T*`／`PRE-01`／`PRE-02`

> **電子發票**：本輪確認 `P4`（憑證型態）已由 `T-05`／`T-06` 涵蓋、
> `P14` reversal decision tree 已由 `T-08` 涵蓋。
> **未發現任何新的、已驗證的現行法規證據證明電子發票為 Day-1 mandatory** → **維持 `DEFERRED`**。

---

# I. NEXT ACTION（只有一個）

> # **NEXT ACTION：`PRE-03` EXTERNAL VALIDATION PACKAGE**

## 為什麼是它，而不是 Wave 1 的 foundation work

Wave 1 確實**不被 `PRE-03` 阻擋**，且我已列出可安全動工的 10 項。
但排序規則是**先啟動 lead time 最長、且自己不消耗工程資源的工作**：

| | `PRE-03` 驗證包 | Wave 1 foundation |
| --- | --- | --- |
| Lead time | **數週（外部）** | 數天（內部） |
| 消耗工程資源 | **零**（只需整理文件） | 是 |
| 阻擋範圍 | 商業模式 ＋ Gate 8／9 ＋ 全部條款文案 | 無 |
| 延後成本 | **每延一天，整條關鍵路徑延一天** | 可隨時開始 |

**先送出驗證包，工程再進 Wave 1** —— 兩者不衝突，但順序不可顛倒。

## 驗證包內容（可直接交付）

### 給律師

**主問題（依序）：** `Q-02` → `Q-01` → `Q-03` → `L-05` → `L-07` → `L-09`
**完整清單：** `L-01`～`L-22`（`L-23` DEFERRED）

**應附證據：**
- baseline `§1`（模型）、`§2`（付款流程）、`§4`（Creator 報酬）、`§5`（Product Invariants）、
  `PRE-03.1`～`.8`（含 substance test）
- `E7` 四層解除權結構、`F` order-level consent
- `C1-A`／`C3`／`C6-A`（授權鏈與 survival）
- `CONTRACT-EFFECT`（§17／§56-1／§19 三項效果）
- **repo evidence：** `INV-2`（entitlement 由 `orders.status` 推導）、
  `INV-3`（`paid_at` ＝ 核准時間）、`mvp_rules.md` §18.9（無退款能力）

### 給會計師

**第一題必須是 `Q-06`（營業項目／公司登記）** —— 它是 `T-04`／`T-05`／`Gate 9` 的前提。
**接著：** `Q-07` → `Q-04`／`Q-09` → `Q-05` → `Q-08` → `Q-10`
**完整清單：** `T-01`～`T-14`（`T-15` DEFERRED）

**應附證據：**
- baseline `§3`（三個時鐘）、`§4`（報酬與退款計算基礎）、`P0`～`P14`
- `J` timeline 全欄位
- **repo evidence：** `INV-3`（現行營收認列用 `paid_at`＝核准時間，非入帳時間）、
  `INV-4`（無結構化匯款辨識欄位）、`orders.invoice_type` / `invoice_carrier` 已存在

## 完成判準

律師與會計師**各回覆一份書面意見**，且其內容足以：

1. 把 `L-01`～`L-22`／`T-01`～`T-14` 中至少 `Q-01`～`Q-10` 對應的項目從 `PENDING` 改為 `VALIDATED`（附 evidence）
2. 讓 `PRE-03.7` 的 8 項封版條件中的第 1～6 項成立
3. 填入 Gate 6／11 的日數、Gate 8 的所得類別、`P14` 三維各分支

---

## 本文件不做什麼

- **不修改任何 executable code。**
- 不重開 `P1-09` Document Phase；不建立 v1.9；不新增 `PRE`／`Q`／`MR`／Gate。
- 不對法律或稅務問題自行下最終結論。
- 本輪**未發現**符合 Scope Freeze A～E 的 reopen blocker。
