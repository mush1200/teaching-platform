# `PRE-18` 實作設計（Creator Payout / Revenue Share）

> **Status: DESIGN FOR REVIEW — NOT IMPLEMENTED**
>
> 日期：2026-09-27 ／ 對應 commit：`c086528`
>
> | 項目 | 狀態 |
> | --- | --- |
> | `PRE-18` | **OPEN** —— 本文件不改變此狀態 |
> | `COR-09` | **OPEN** —— 政策已定（`DEC-34`／`DEC-39`），實作未做 |
> | `DEC-20` ～ `DEC-39` | **canonical policy inputs，本文件不得重新詮釋** |
> | `AD-09`／`AD-10`／稅務扣繳／`O19` 最終處置 | **維持外部事項**，本文件不發明任何答案 |
> | 本文件內容 | **0 schema、0 migration、0 production code** |

**本文件的定位**：把 `DEC-20`～`DEC-39` 的 Owner 政策，轉成一份**可供審查的整合實作設計**。
它**不是**實作，也**不是**已核准的 schema。所有表名與欄位除 `DEC-38` 已 canonical 固定者外，
一律標示為 **PROPOSED — SUBJECT TO DESIGN REVIEW**。

## Review Round 1 修訂摘要（2026-09-27）

> **五項設計審查發現，全部成立，全部已修正。**
> **`DEC-20`～`DEC-39` 一字未改** —— 修正的是實作詮釋與 proposed schema，不是政策。

| # | 發現 | 判定 | 修正 | 影響 canonical policy | 影響 proposed schema |
| --- | --- | --- | --- | --- | --- |
| 1 | 六期 override off-by-one：`ageing >= 6 → pay` 會在**第 6 期**撥付 | **VALID** | 改以 `ageing_before`（帶入本期的計數）判斷，override 於**第 7 期**觸發；附 7 期 worked example | **NO** | NO（僅演算法） |
| 2 | `cycle_id NOT NULL` 於付款核准寫入 —— 但期間歸屬當下**不可知** | **VALID** | 新增 §3.2，拆成「金額事實／結算資格／期間歸屬」三個概念；改為 **write-once `settlement_cycle_id`**，於首次 eligible 的期間關閉時寫入 | **NO** | **YES** |
| 3 | `amount` 與 `creator_earnings` 語意重複，invariant 指涉未定義欄位 | **VALID** | **刪除 `creator_earnings` 欄** —— `earning` 列的 `amount` **即** creator earnings；恆等式改寫為 `amount + platform_commission = creator_net_sales` | **NO** | **YES** |
| 4 | `settlement_holds` 無法決定性指出「哪一筆分錄被凍結多少」 | **VALID** | 新增 **`settlement_hold_allocations`**；`creator_id` 自 hold 主表移除（一個 order-level hold 可跨多位創作者） | **NO** | **YES** |
| 5 | 稽核事件 `payout.batch_closed` 指涉一個本設計刻意不設的 batch 實體 | **VALID** | 更名為 **`settlement.cycle_closed`**；全文統一 settlement-cycle／payout-cycle 用語，**MVP 確定不設 batch** | **NO** | NO（僅命名） |
| 6 | `payout_consumption` 無法證明**消耗了哪幾筆**來源 | **VALID** | 新增 **`payout_allocations`**；invariant 5／10 由「僅靠報表」升級為**可由資料證明** | **NO** | **YES** |

### Review Round 2 追加（同日）

| # | 發現 | 判定 | 修正 |
| --- | --- | --- | --- |
| 7 | `qualifies` 含「該期間無覆蓋它的 hold」—— **本設計自行加上，`DEC-32` P1 未要求且與之抵觸** | **VALID** | 改採 **CUTOFF-STATE MODEL**（只看期末），附四情境結果；明確不採日數加權 |
| 8 | 「tranche ＝ 一筆 earning 分錄」在部分 hold 下不成立（情境 4） | **VALID** | 新增 **`creator_payable_slices`**；**tranche ＝ slice**，身分錨定在**品項**上 |
| 9 | 分錄層級單一 `settlement_cycle_id` **結構上不足** —— 同筆 earning 的不同 slice 可在不同期間首次 eligible | **VALID** | `settlement_cycle_id` **自分錄下移至 slice** |
| 10 | hold／payout allocation 指向 entry，無法證明**哪一個切片**被凍結或消滅 | **VALID** | 兩者**改指向 `payable_slice_id`**；ageing reset 因而可證 |
| 11 | 切片內部的**部分金額 hold** 無政策依據 | ⚠️ **判定有誤，同輪更正** | **`DEC-33` §P7(a) 早已決定商業行為**，且 **§P7(b) 排除**了「暫停整個切片」——**不存在 Owner 抉擇空間**。已改列為設計機制：**切片依金額再分割**，子切片**繼承分割當下的 ageing**（§4.1a）。**不新增 `DEC-40`；Owner 側政策維持完整至 `DEC-39`** |
| 12 | 再分割需要可稽核的 lineage | **VALID** | 新增 `parent_slice_id` ＋ `split_in_cycle_id`；**append-only**，「已分割」由 `EXISTS(children)` 推導，**不加 status 欄位**；新增 invariant 15／16 |

**Round 2 schema delta**：**+1 表**（`creator_payable_slices`）、**1 欄位下移**（`settlement_cycle_id`：entry → slice）、**2 個 allocation 改指向 slice**、**+1 invariant**（14）。
**新增 Owner 決定需求 0 項** —— `O20` 經覆核**不成立**，已改列為設計機制。**canonical policy 仍一字未改，Owner 側政策完整至 `DEC-39`。**

---

**Round 1 —— 新增 proposed 表 2 張**（`settlement_hold_allocations`、`payout_allocations`），**刪除欄位 1 個**（`creator_earnings`），**欄位語意變更 1 個**（`cycle_id` → write-once `settlement_cycle_id`）。
**新增 invariant 3 條**（11／12／13）；可資料化的 invariant 由 6 條增為 **8 條**。
兩張新表**同樣標示 PROPOSED — SUBJECT TO DESIGN REVIEW**。

---

**四類內容在本文件中刻意分開，閱讀時請勿混用：**

| 標記 | 意義 |
| --- | --- |
| **【CANONICAL POLICY】** | `DEC-*` 已鎖定的 Owner 決定，**不得重新詮釋** |
| **【REPO FACT】** | 2026-09-27 於 repo 實測的現況，附檔案行號 |
| **【PROPOSED】** | 本文件提出的設計，**待審查** |
| **【EXTERNAL】** | 律師／會計師事項，**本文件不作答** |

---

## 1. Current-state repo inventory 【REPO FACT】

| 面向 | 現況 |
| --- | --- |
| 金額欄位 | `orders.total_amount`／`total_price`／`discount_amount` 皆 `INTEGER`；`order_items.subtotal` `INTEGER`、`price_snapshot` `NUMERIC`、`seller_id` **可為 NULL**；`promotions.value` `INTEGER`；**`materials.price` 為 `NUMERIC` 且全無 CHECK**（`db/db_schema.sql:53`） |
| 訂單生命週期 | `status`（**無 DB CHECK** —— bootstrap 主動 DROP，`bootstrapModel.js:1345`）、`paid_at`（Admin 核准時間，唯一寫入點 `routes/admin.js:320`）、`payment_received_at`、`payment_due_at`、`review_due_at`、`payment_info_submitted_at` |
| 案件表 | `refund_remedy_cases`（`order_id` NOT NULL、`order_item_id` 可 NULL、`requested/approved/refund_amount` INTEGER、`evidence_reference`、`related_creator_adjustment_id`）；`consumer_complaints`（`order_id` **與** `order_item_id` 皆可 NULL、**完全無金額欄位**）；`reports`（教材 moderation，`material_id NOT NULL`、無訂單關聯、無 SLA —— **不得用於結算 hold**） |
| 報表 | `teacherSales.service.js`（Creator Gross Sales，**折扣前**）、`adminDashboard`／`adminTrends.service.js`（recognized revenue，`orders.total_amount`，**折扣後、order-level**）；共用 `reportingRange.js` ＋ `trendBuckets.js`（`YYYY-MM` key、half-open 台北窗口） |
| 稽核 | `activity_logs`（`actor_id`／`actor_role`／`target_type`／`target_id`／`action`／`meta` JSONB）；唯一寫入點 `utils/activityLog.js`；命名慣例 `<domain>.<verb>`；**排序必須 `created_at DESC, id DESC`** |
| ID 慣例 | `TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text)`（16 張表）；`orders`／`order_items` 另有應用層前綴 id |
| 時間慣例 | `TIMESTAMP`（**無時區**）＋ `created_at`／`updated_at`；期限採**台北日曆日 ＋ 末日終了**（`utils/taiwanCalendar.js` 的 `endOfTaiwanDay()`，`:69`） |
| FK 慣例 | `ON DELETE SET NULL` 24 處／`CASCADE` 21 處／`RESTRICT` 14 處 |
| 表名慣例 | **複數 snake_case**（唯一例外為 legacy 的 `review`） |
| Policy module 慣例 | `paymentTimingPolicy.js`／`complaintSla.js`／`materialWorkflow.js` —— 純政策、單一定義來源、共用 `taiwanCalendar.js` |
| **DDL 雙軌** | 每張表都存在**兩處**：`db/db_schema.sql`（canonical）與 `models/bootstrapModel.js`（runtime，冪等，**每次啟動都執行**），另有 `Backend/migrations/*.sql` |
| 撥款既有基礎 | **幾乎沒有**。`users` 表**無任何銀行／收款欄位**；全 repo 僅 `related_creator_adjustment_id TEXT` 三處**欄位宣告、無寫入端** |
| ⚠️ 稽核原子性 | **`writeActivityLog` 以 pool 呼叫 `db.query`，無法加入呼叫端的 transaction**（`utils/activityLog.js`） |

---

## 2. Proposed architecture 【PROPOSED】

核心原則：**金額事實 append-only；資格狀態獨立存放。**

```text
訂單核准 ──同一 tx──> creator_ledger_entries（earning，每創作者×每訂單）   [DEC-31]
                └──> orders.refund_window_end（持久化）                    [DEC-26]

settlement_holds            ──references──> ledger entries                 [DEC-28, DEC-33]
creator_fault_classifications ──gates────> adjustment entries              [DEC-35, DEC-21]
unattributed_suspense_entries（無 creator_id）                              [DEC-36, DEC-37]

payout_cycles（YYYY-MM）──> creator_cycle_statements ──> payout_items       [DEC-29, DEC-30]
```

新增：**5 張表（1 張 canonical 命名、4 張 PROPOSED）**、**2 個 policy module**、**6 個 service**。

---

## 3. Proposed data model — 命名狀態 【PROPOSED】

| 名稱 | 命名狀態 |
| --- | --- |
| `creator_ledger` / `creator_ledger_entry` / **`creator_ledger_entries`** | ✅ **CANONICAL —— `DEC-38` 已鎖定** |
| **`creator_payable_slices`** ⚠️ Round 2 新增 | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `settlement_hold_allocations` ⚠️ Round 1 新增 | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `payout_allocations` ⚠️ Round 1 新增 | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `creator_cycle_statements` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `settlement_holds` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `creator_fault_classifications` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `unattributed_suspense_entries` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `payout_cycles` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `payout_items` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |
| `reconciliation_runs` | **PROPOSED — SUBJECT TO DESIGN REVIEW** |

> **`DEC-38` 只固定了 ledger 本身的名稱。** 其餘 7 個名稱**尚未核准**，審查時可整批更名而不影響設計結構。

### 3.1 ⚠️ 關鍵區分：monetary fact vs materialized snapshot 【PROPOSED，本設計的核心前提】

| | `creator_ledger_entries` | `creator_cycle_statements` |
| --- | --- | --- |
| 性質 | **append-only 的金額事實（monetary fact）** | **物化的結算快照／checked cache** |
| 地位 | **唯一權威來源（authoritative）** | **衍生物，永遠可由 ledger ＋ hold 歷程重算** |
| 可變性 | 永不 UPDATE／DELETE；更正走 reversal 分錄 | 期間關閉時寫入一次；可重算驗證 |

**`creator_cycle_statements` 絕不得成為金額歷史的權威來源。** 這條界線同時保住四件事：

1. **`DEC-30` 的歷史期間穩定性** —— 期間歸屬持久化於 ledger entry 的 `cycle_id`，statement 只是彙總；
2. **`DEC-31` 的逐訂單金額事實** —— 每創作者×每訂單的切分保存在 entry 上，不因彙總而消失；
3. **`DEC-32`／`DEC-33` 的 ageing 可重算性** —— ageing 由不可變歷程推導，statement 只是快取；
4. **調整／沖正的可稽核性** —— 更正產生新分錄，statement 重算即可，無須竄改歷史。

### 3.2 ⚠️ 三個概念必須分開：金額事實 / 結算資格 / 期間歸屬 【PROPOSED，Review Round 1 修正】

**設計審查發現**：原設計讓 `earning` 分錄在**付款核准時**即帶 `cycle_id NOT NULL`。**該設計不成立** ——
核准當下**期間歸屬尚不可知**：`DEC-25` 的退款窗口尚未屆滿；`DEC-28` 的 hold 可能延後其 eligible；
hold 若於 cutoff 之後才解除，該金額依 `DEC-30` §N4 應落入**更晚**的期間；
而 `DEC-30` §N6 又禁止回溯移動已關閉期間的歸屬。兩者相加會逼出一個無解的狀態。

**修正：三個概念各自獨立，不得混為一欄。**

| 概念 | 何時確定 | 存放位置 | 可變性 |
| --- | --- | --- | --- |
| **① 金額事實發生**（monetary fact） | **付款核准當下** | `creator_ledger_entries`（`amount`／`creator_net_sales`／`platform_commission`／`occurred_at`／`order_id`） | **永久不可變**（`DEC-31`） |
| **② 結算資格**（eligibility） | **每次期間關閉時評估** | 不持久化 —— 由 §8 predicate 推導 | 隨 hold 與窗口變動 |
| **③ 期間歸屬**（settlement cycle membership） | **該 slice 首次成為 eligible 的那個期間關閉時** | **`creator_payable_slices.settlement_cycle_id`**，write-once ⚠️（Round 2：自分錄層級下移至 slice） | **一經寫入永久不可變**（`DEC-30` §N6／§N7） |

**為何 ③ 是欄位而非獨立表**：期間歸屬與 **slice** 是 **1:1 且無金額**，故為 slice 上的欄位；
而 hold 與 payout 對 slice 是 **N:M 且帶金額**，故必須是獨立的 allocation 表（見 §4.2／§4.5）。
**形狀由基數決定，不是任意選擇。**

> ⚠️ **Review Round 2 更正**：Round 1 把 `settlement_cycle_id` 放在**分錄**上。**該位置結構上不足** ——
> 同一筆 earning 的不同 slice 可能在**不同期間**首次成為 eligible（例：`I1` 被 hold 而 `I2` 未被），
> 此時一筆分錄會有**兩個**「首次 eligible 期間」，單一欄位無法表達。**已下移至 slice 層級。**
> 其語意仍嚴格為「**該 slice 首次成為結算合格、得被納入的那個期間**」 ——
> **不是**收益發生月、**不是**撥款月、**也不是** hold 解除月（除非那正好是首次合格的期間）。

**為何 write-once 不違反 append-only**：`settlement_cycle_id` **不是金額事實**，
而是事後才可知的結算分類。金額欄位維持絕對不可變；此欄只允許 `NULL → 值` 的一次性轉移，
由 trigger 強制「已有值者不得再改」。**這是 ledger 上唯一被允許的變更。**

> **審查替代方案（未採用）**：以獨立的 `creator_ledger_entry_cycles` 衛星表保存歸屬，
> 可讓 ledger 完全零 UPDATE。代價是每個查詢多一次 join，且與「1:1 無金額」的基數不相稱。
> **若審查偏好絕對不可變，可改採此方案，不影響其他設計。**

---

## 4. Table-by-table design

> 下表**不是 DDL，亦非可執行的 migration**。僅為欄位意圖說明，供審查。
> `P` ＝ persisted（持久化）／`D` ＝ derived（衍生）。

### 4.1 `creator_ledger_entries` ✅ CANONICAL 名稱（欄位仍為 PROPOSED）

| 欄位 | 型別意圖 | 為何存在／依據 | P/D |
| --- | --- | --- | --- |
| `id` | TEXT PK，`gen_random_uuid()::text` | 沿用 repo ID 慣例 | P |
| `creator_id` | TEXT **NOT NULL**，FK → `users` RESTRICT | **`NOT NULL` 是 invariant 6「無歸屬即無創作者責任」成為結構性保證的關鍵**。`DEC-36` | P |
| `entry_type` | TEXT NOT NULL，受限值 | 見 §5。`DEC-38` | P |
| `amount` | INTEGER NOT NULL（帶符號，正值增加應付） | **唯一的金額欄位。`earning` 列上 `amount` ＝ creator earnings（`DEC-24`／`DEC-31`），不另設 `creator_earnings` 欄** | P |
| `creator_net_sales` | INTEGER，**僅 `earning` 列有值** | `DEC-31` 分潤基數；與 `amount`／`platform_commission` 同列，使 invariant 2 可用 row CHECK 強制 | P |
| `platform_commission` | INTEGER，**僅 `earning` 列有值** | `DEC-24`／`DEC-31`，**餘額法** | P |
| ~~`settlement_cycle_id`~~ | — | ⚠️ **Review Round 2 移除** —— 期間歸屬**不在分錄層級**。同一筆 earning 的不同 slice 可能在**不同期間**首次 eligible，故單一分錄欄位**結構上不足**。改置於 slice（§4.1a） | — |
| `order_id`／`order_item_id` | TEXT | 來源連結；`DEC-31` 逐訂單 | P |
| `source_type`／`source_id` | TEXT NOT NULL | 多型來源：order／refund_remedy_case／reconciliation_run／payout_item。`DEC-35` 可追溯性 | P |
| `fault_classification_id` | TEXT，FK → 分類表 | `DEC-21`／`DEC-35`；**負值分錄的門檻** | P |
| `reverses_entry_id` | TEXT，self-FK | `DEC-26` §J5「更正不得靜默覆寫」 | P |
| `created_at`／`created_by` | TIMESTAMP／TEXT | 稽核 | P |

**約束意圖（PROPOSED）**

- `entry_type <> 'earning' OR (creator_net_sales IS NOT NULL AND platform_commission IS NOT NULL AND amount + platform_commission = creator_net_sales)` → **invariant 2 由 DB 強制**（**注意寫法**：因 `amount` 即 creator earnings，恆等式寫為 `amount + platform_commission = creator_net_sales`）
- `entry_type = 'earning' OR (creator_net_sales IS NULL AND platform_commission IS NULL)` → **非 earning 列不得帶分潤欄位**，避免金額語意重載
- `UNIQUE (order_id, creator_id) WHERE entry_type = 'earning'` → **invariant 3**
- `amount >= 0 OR (entry_type IN ('adjustment','payout_consumption','reversal'))`，且`amount < 0 AND entry_type = 'adjustment'` 時 `fault_classification_id IS NOT NULL` → **invariant 7**
- **金額欄位禁止 UPDATE／DELETE**；**唯一允許的變更是 `settlement_cycle_id` 的 `NULL → 值` 一次性轉移**（trigger 強制，見 §3.2）

### 4.1a `creator_payable_slices` 【PROPOSED，Review Round 2 新增】 —— payable 切片

#### 四個概念的最終區分（全文一致，不得混用）

| # | 概念 | 定義 | 粒度 | 可變性 |
| --- | --- | --- | --- | --- |
| 1 | **`creator_ledger_entry`** | **不可變的金額事實** | **每創作者 × 每訂單**（`DEC-31`） | 金額欄位**永不變更** |
| 2 | **`creator_payable_slice`** | **結算／資格／ageing 的單位** | 每分錄 × 每品項（＋ residue）；**可再分割** | **再分割不改變金額事實**；只新增子列 |
| 3 | **`settlement_hold_allocation`** | hold → **payable slice** ＋ 金額 | N:M ＋ 金額 | append-only |
| 4 | **`payout_allocation`** | payout item → **payable slice** ＋ 金額 | N:M ＋ 金額 | append-only |

**一句話**：**分錄記「賺了多少」，切片記「這筆錢在結算上如何被對待」。**
切片再分割**永遠不會**改變 ① 的任何金額欄位。

**為何需要**：`DEC-31` 把 earning 分錄固定在**每創作者 × 每訂單**；`DEC-28` 允許 hold 落在**每品項**。
因此**一筆分錄的不同部分可以有不同的 hold 狀態，進而有不同的 ageing**（§10 情境 4）。
`DEC-33` §P7(a) 明文要求這些部分**各自保留 ageing 狀態**，§P7(b) 禁止把它們塌縮成單一計數器。
**分錄層級無法表達，必須有切片。**

**切片不是新的金額事實** —— 它是同一筆分錄的 payable **分解**：

| 欄位 | 意圖 | 依據 | P/D |
| --- | --- | --- | --- |
| `id` | TEXT PK | 慣例 | P |
| `ledger_entry_id` | FK → `creator_ledger_entries` | 所屬金額事實 | P |
| `parent_slice_id` | FK self，**可為 NULL** | ⚠️ **Round 2 最終新增** —— 部分金額 hold 造成的**再分割** lineage（`DEC-33` §P7a） | P |
| `order_item_id` | FK，**residue 切片為 NULL**；子切片繼承父值 | **切片身分錨定在品項上** —— hold 以品項為目標，品項是既有且穩定的身分 | P |
| `amount` | INTEGER > 0 | 該品項對 payable 的貢獻（`item_net_amount × 80%`）；子切片為其中一部分 | P |
| `settlement_cycle_id` | TEXT，**可為 NULL；write-once** | `DEC-30` §N7 期間歸屬 —— **位於此層**（見 §3.2）。**子切片於分割時繼承父值**（父若為 NULL 則子各自決定） | P |
| `split_in_cycle_id` | TEXT，**可為 NULL** | ⚠️ **Round 2 最終新增** —— 分割發生的期間；用以界定「父的歷史算到哪一期、子自哪一期起自算」。**以期間為單位，不引入分數期間** | P |
| `created_at` | TIMESTAMP | 稽核 | P |

**約束意圖**：**`SUM(leaf slices.amount) = ledger_entry.amount`**（**leaf 切片必須精確加總回分錄，不多不少**）；
`SUM(children.amount) = parent.amount`；`amount > 0`；
`UNIQUE (ledger_entry_id, order_item_id)` **僅適用於 root 切片**（`parent_slice_id IS NULL`），
因為再分割後同一 `order_item_id` 會有多個子切片。

**Residue 切片**：`DEC-31` 的取整發生在**分錄層級**，故逐品項貢獻加總後可能與分錄金額差 **≤ NT$1**。
該差額放進一個 `order_item_id IS NULL` 的 residue 切片。**residue 切片永遠不可被 hold**
（它不歸屬任何品項，故任何品項層級的爭議都碰不到它），因此不產生歸屬歧義。

**切片何時建立**：與 earning 分錄**同一個 transaction**，由 `DEC-23` 的品項分攤結果決定性導出。
**切片不可變**（`settlement_cycle_id` 的一次性寫入除外）。

#### 為何切片解決了「哪一部分」的歧義

若切片只是「一筆金額」，則第二個 hold 覆蓋 30 時無法判斷它落在先前被 hold 的 40 還是未被 hold 的 60 ——
而兩種答案會導致不同的 ageing 結果。**把切片錨定在品項上，這個歧義就消失了**：
hold 的目標本來就是品項，品項身分穩定且既有。

> **示例**：訂單 `O`，創作者 `C`，品項 `I1`（payable 80）與 `I2`（payable 160）。
> 一筆分錄（`amount = 240`），兩個切片。
> 期 1：`I1` 被 hold → `I1` 切片不計入（ageing 0），`I2` 切片計入（ageing 1）。
> 期 2：`I1` 解除 → 兩者皆計入（`I1` ageing 1、`I2` ageing 2）。
> 期 3：改為 `I2` 被 hold → `I1` 計入（ageing 2）、`I2` 不計入（**維持 2，不歸零**）。
> **全程決定性，無需任何順序規則。**

#### 切片再分割 —— `DEC-33` 已決定商業行為（Round 2 最終更正）

`DEC-28` §L6 允許 hold 的金額**小於**一個品項的貢獻，此時單一切片內部又分成被 hold 與未被 hold 兩部分。

> ⚠️ **本節先前記為「政策未決、需新 Owner 決定（`O20`）」，該判斷有誤，已於同輪更正。**
> **`DEC-33` §P7(a) 早已完整決定商業行為**，且其文字**未**以「是否對齊品項邊界」為條件 ——
> 「若僅**部分** carried payable 被 hold —— hold 之外仍為正數的 eligible carried payable **照常 ageing**；
> 被 hold 的部分**於 hold 期間不 ageing**；**釋出時自其保留的既有 ageing 狀態續計**」。
> **且 §P7(b) 主動排除了另一個候選**：「不得把各自獨立 ageing 的餘額塌縮成單一計數器」——
> 「部分金額 hold 即暫停整個切片」正是這種塌縮。**故自始只有一個合規答案，不存在 Owner 抉擇空間。**
> 待解決的只是**資料模型機制**。

**鎖定的設計詮釋**：當部分金額 hold 小於既有切片時，**該切片依金額再分割為子切片**。

**示例**（原切片 80、既有 ageing ＝ 3、部分 hold ＝ 30）：

| 子切片 | 金額 | 繼承 ageing | 狀態 | 後續行為 |
| --- | --- | --- | --- | --- |
| 未被 hold | **50** | **3** | eligible | **照常繼續 ageing** |
| 被 hold | **30** | **3** | held | **暫停；釋出後自 3 續計** |

**四項禁止**：**不得**暫停整個原切片；**不得**重置被 hold 部分的 ageing；
**不得**複製底層的 earning 金額事實；**不得**變更原 `creator_ledger_entries` 的任何金額欄位。

#### Slice lineage（最小表示）

再分割以 **append-only 的父子關係**表達：**插入子切片，永不更新父切片**。

| 性質 | 如何滿足 |
| --- | --- |
| 子金額精確加總回父金額 | 約束：`SUM(children.amount) = parent.amount`（invariant 15） |
| 父的金額 provenance 可追溯 | `parent_slice_id` 鏈 ＋ 共同的 `ledger_entry_id` |
| 子繼承父在分割當下的 ageing | 由 lineage 推導：**父在 `split_in_cycle_id` 之前的合格期數 ＋ 子自該期起自身的合格期數**（與 §10「由不可變歷程推導」一致，**不另存可變計數器**） |
| 後續 hold／release／payout 指向子切片 | **只有 leaf 切片可被 allocation 指向**（invariant 16） |
| 歷史分割不被破壞性改寫 | 父切片列**永不更新**；「已被分割」由 `EXISTS(children)` **推導**，故**不需要 status 欄位** |

> **為何沒有 lifecycle／active 欄位**：一個切片是否仍為 active，等同於「它沒有子切片」，
> 可由 `EXISTS` 推導。加一個可變 status 欄位會引入本設計刻意避免的 mutation，且無新增資訊。

### 4.2 `settlement_holds` 【PROPOSED】 —— `DEC-28`／`DEC-33`

`id`、`scope`（`item`｜`order`｜`manual`）、`order_id`、`order_item_id`、`source_type`／`source_id`（案件）、
`opened_at`／`opened_by`、`released_at`／`released_by`、`release_reason`。

#### ⚠️ `settlement_hold_allocations` 【PROPOSED，Review Round 1 新增】 —— scope 推導不足以定位 tranche

**設計審查發現**：原設計僅以 `scope` ＋ `order_id`／`order_item_id`／`held_amount` 描述 hold，
**無法決定性地回答「究竟哪一筆分錄、被凍結了多少」**。根因是兩條 canonical 政策的粒度不同：

- **`DEC-31`** 規定 earning 分錄的粒度是**每創作者 × 每訂單**；
- **`DEC-28`** 允許 hold 的粒度是**每品項**，甚至是品項內的**部分金額**。

**因此一筆 earning 分錄可能只有一部分被 hold。** 具體例（PROPOSED 說明用）：

> 訂單 `O` 含品項 `I1`（創作者 `C`，item_net 100）與 `I2`（同創作者 `C`，item_net 200）。
> 依 `DEC-31`，`C` 在 `O` 上只有**一筆** earning 分錄：`creator_net_sales = 300`、`amount = 240`。
> 今有一件 refund case 指向 `I1`。**scope 推導只能說「`I1` 被 hold」，但分錄是訂單層級的** ——
> 無法從 scope 推出「240 之中有多少被凍結」。`I1` 對應的 payable 是 `100 × 80% = 80`，
> 而這個對應關係**必須被記錄下來，不能在每次查詢時重算**（重算會受日後調整影響而漂移）。

**結論：scope 推導不足，必須有明確的 allocation。** 最小模型：

`settlement_hold_allocations`：`hold_id`、**`payable_slice_id`**（⚠️ Round 2：改為指向 slice，非 entry）、`held_amount`（INTEGER）、`created_at`。

**約束意圖**：`UNIQUE (hold_id, ledger_entry_id)`；
`held_amount > 0`；
**每筆分錄的未解除 hold 總額不得超過該分錄的 `amount`**（`DEC-28` §L6 的 fail-closed 在資料層的表達）。

**這同時讓六個問題變成決定性的**：① 哪一筆 tranche 被 hold ＝ `ledger_entry_id`；
② 凍結多少 ＝ `held_amount`；③ 哪些繼續 ageing ＝ 未被任何未解除 allocation 覆蓋的部分；
④ 解除後恢復哪個 ageing 狀態 ＝ 該分錄自身的歷程（§10，tranche ＝ 分錄）；
⑤ hold 金額能否超過可歸屬 payable ＝ **不能**，由上述約束擋下；
⑥ 一個 order-level hold 能否涵蓋多位創作者 ＝ **能** —— 一個 `hold` 對應**多列 allocation**，
每位創作者各自一列，因此 `creator_id` 從 hold 主表移除（改由 allocation 指向的分錄決定），
避免「一個 hold 只能有一個創作者」的錯誤假設。

### 4.3 `creator_fault_classifications` 【PROPOSED】 —— `DEC-35`

`id`、`source_type`／`source_id`（**必須多型** —— 需同時服務 `refund_remedy_cases` 與 `consumer_complaints`）、
`order_id`、`order_item_id`、`creator_id`、`result`（`creator_fault`｜`non_creator_fault`）、
`reason_code`（受限值，種子見 §12）、`written_basis` NOT NULL、`evidence_reference`、
`decided_by`、`decided_at`、`supersedes_id`（更正軌跡，`DEC-35` §Q9）。

### 4.4 `unattributed_suspense_entries` 【PROPOSED】 —— `DEC-37`

與 ledger 同形，**但沒有 `creator_id`**。`order_item_id`、`amount`、`cycle_id`、
`state`（`open`｜`resolved`）、`resolved_entry_id` → 日後歸屬時產生的 ledger entry。

### 4.5 `payout_cycles` ／ `creator_cycle_statements` ／ `payout_items` 【PROPOSED】 —— `DEC-29`／`DEC-30`

- **`payout_cycles`**：`cycle_id` PK（`YYYY-MM`）、`cutoff_at`、`payout_due_at`（次月 15 日）、`status`（`open`｜`closed`｜`settled`）、`closed_at`／`closed_by`
- **`creator_cycle_statements`**（期間關閉時寫入，**materialized snapshot，非權威**）：`cycle_id` ＋ `creator_id` UNIQUE、`opening_balance`、`earnings`、`adjustments`、`held_amount`、`eligible_balance`、`ageing_qualified`、`ageing_cycles_after`、`payout_triggered_reason`（`threshold`｜`six_cycle_override`｜`termination`｜`none`）
- **`payout_items`**：`cycle_id` ＋ `creator_id`、`amount`、`status`、`bank_reference`、`paid_at`、`paid_by`、`notified_at`
- **`payout_allocations`** 【PROPOSED，Review Round 1 新增；Round 2 改為指向 slice】：`payout_item_id`、**`payable_slice_id`**、`amount`、`created_at`
  > **payout 必須能證明的五件事**：① **哪一個切片被消耗** ＝ `payable_slice_id`；② **消耗多少** ＝ `amount`；③ **該切片是否完全消滅** ＝ `SUM(allocations) = slice.amount`；④ **因而哪一個 ageing 狀態重置** ＝ 被完全消滅的那個切片（`DEC-32` §P3）；⑤ **消耗不得超過切片金額** ＝ 約束。
  > **為何指向 slice 而非 entry**：ageing reset 的條件是「**該 tranche 被實際消滅**」（`DEC-32` §P3），而 tranche 現在是 slice。若 allocation 只指向 entry，就無法證明**哪一個切片**被消滅、因而無法判定哪一個切片的 ageing 該重置。指向 slice 則三件事同時可證：**消耗了多少**、**哪一個切片被消滅**、**不得超額消耗**。

#### ⚠️ 為何需要 `payout_allocations` 【Review Round 1】

**設計審查發現**：原設計僅以 `payout_consumption` 分錄表示撥款消耗，
並把 invariant 5（不得超額消耗）交給「service ＋ 對帳報表」。**這不足夠** ——
`payout_consumption` 只記錄「這位創作者這一期被消耗了多少」，**無法證明是哪幾筆 earning／adjustment 被消耗**。
而下列五件事都需要那個對應關係：**不得超額消耗**、**tranche 消滅**（`DEC-32` §P3 的 reset 條件）、
**ageing 重置**、**調整的沖抵順序**、以及**事後稽核**。

**約束意圖**：`UNIQUE (payout_item_id, ledger_entry_id)`；`amount > 0`；
**每筆分錄的 allocation 總額不得超過其 `amount`** → **invariant 5 自此可由資料證明，而非僅靠報表**；
`SUM(payout_allocations.amount) = payout_items.amount` → **invariant 10 精確對帳**。

> **`payout_consumption` 分錄是否仍需要？** 需要 —— 它是 ledger 上「應付減少」的金額事實；
> `payout_allocations` 則是它與被消耗來源之間的對應。兩者分工：**分錄記金額，allocation 記歸屬**。

#### 關於「batch」的設計取捨 【PROPOSED】

**建議 MVP 將 batch 收攏進 cycle，不另立 `payout_batches`。** 理由：一位創作者於一個期間只收一筆款；
重試是 item 的狀態而非新批次；而依 `DEC-30` §N6，**事後才解除 hold 的金額歸入下一期間**，
因此已關閉的期間內不可能出現第二個批次。另立 batch 表屬 over-modeling。
若日後 Admin 需要「我現在要付的這一組」，那是 item 狀態的篩選，不是一張表。
**此為設計選擇，審查時可推翻。**

---

## 5. Entry / state taxonomy 【PROPOSED】

**`entry_type`**：`earning`／`adjustment`／`opening`（`DEC-27` legacy）／`payout_consumption`／`reversal`

### ⚠️ hold 刻意**不是** ledger entry —— 這是政策推導的結果，不是偏好

若把 hold 做成「先負後正」的兩筆分錄，則 **hold 期間的 carried balance 會顯示為 0**。
而 `DEC-32` §P3 規定「餘額歸零即重置 ageing」——
於是 hold 會**重置** ageing，**這正是 `DEC-33` 明文禁止的**。

**獨立實體＋自身區間，是唯一能同時滿足 `DEC-32` 與 `DEC-33` 的模型。**

---

## 6. Service boundaries 【PROPOSED】

| Service | 責任 | 輸入 → 輸出 | 相依 |
| --- | --- | --- | --- |
| `creatorLedger.service` | 寫入分錄、計算餘額 | entry spec → entry | db |
| `settlement.service` | 資格判定、期間關閉、statement | cycle → statements | ledger、hold、settlementPolicy |
| `payout.service` | payout item、標記已付、通知 | statement → payout_item | settlement、emailService |
| `hold.service` | 開啟／解除、scope 判定 | case → hold | `DEC-28` 階梯 |
| `creatorFault.service` | 分類與更正 | case ＋ decision → classification | — |
| `reconciliation.service` | census 與寫入階段 | run → report／entries | 全部（讀）、ledger（寫） |

**新增 policy module**：`utils/settlementPolicy.js`（期間邊界、`refund_window_end`、門檻、ageing），
仿 `paymentTimingPolicy.js`、共用 `taiwanCalendar.js`；另 `utils/listingPricePolicy.js`（`COR-09`）。

---

## 7. Transaction boundaries 【PROPOSED】

| 操作 | 邊界 |
| --- | --- |
| 付款核准 ＋ `paid_at` ＋ `refund_window_end` ＋ **earning 分錄（不含 `settlement_cycle_id`）** | **同一個 transaction**（`DEC-26` §J2；本設計將 earning 一併納入，避免訂單狀態與金額事實分歧）。⚠️ **此時只寫金額事實；`settlement_cycle_id` 保持 NULL** —— 期間歸屬當下不可知（§3.2） |
| **期間歸屬指派**（`settlement_cycle_id` 的 `NULL → 值`） | 併入「期間關閉」的同一個 tx；**write-once，trigger 擋下任何再次變更** |
| hold 開啟／解除 | 單一 tx；**必須重查**該品項未被已付撥款消耗 |
| 期間關閉 → statements | 每期間一個 tx；同時將 `status` 設為 `closed` |
| 撥款標記已付 | 單一 tx；**通知在 tx 之外**（`DEC-20` C4：通知失敗不得回滾） |
| 創作者調整 | 單一 tx；分類必須已存在且已 commit |
| 歸屬對帳 | 單一 tx：suspense resolve ＋ ledger earning |
| legacy opening 分錄 | 每 run 一個 tx，具冪等鍵 |

### ⚠️ 實作需求：稽核原子性 【REPO FACT ＋ PROPOSED】

**【REPO FACT】** `writeActivityLog` 以 pool 呼叫 `db.query`，**無法加入呼叫端的 transaction**。

**【PROPOSED】** 金額操作的權威記錄是 **ledger／狀態表本身**，`activity_logs` 為輔助軌跡
（與 `DEC-35` §Q13「log 不是決定狀態」一致）。建議**擴充該 helper 接受選用的 transaction client**，
使金額寫入的稽核可與金額同 tx；非交易型呼叫端維持現行預設行為。**本輪不實作**，
已記入 tracker 的 `PRE-18` 實作需求。

---

## 8. Eligibility algorithm 【PROPOSED，依 `DEC-25`／`DEC-28`／`DEC-30`】

```text
eligible(entry, cycle) :=
    order.status = 'approved'
AND order.paid_at IS NOT NULL
AND order.refund_window_end IS NOT NULL          -- 持久化，DEC-26
AND order.refund_window_end <= cycle.cutoff_at   -- DEC-30 N4
AND NOT EXISTS (覆蓋該 entry 的未解除 settlement_hold)   -- DEC-28
AND entry.creator_id IS NOT NULL                 -- DEC-36
```

**持久化**：`refund_window_end`、`cycle_id`、cycle statements。
**衍生**：關閉當下的 eligibility。
**永不回溯重算**：期間歸屬與已關閉的 statement（`DEC-30` §N6）。

> ⚠️ **此 predicate 不得沿用 `teacherSales` 的 `ELIGIBLE_SALE`** —— 後者會靜默丟棄
> `paid_at IS NULL` 的列，而 `DEC-27` §K4 要求那些列必須 **fail closed 並被顯示出來**。

---

## 9. Hold algorithm 【PROPOSED，依 `DEC-28`】

取**最窄的安全層級**：有 `order_item_id` → item scope（僅該創作者）；
否則有 `order_id` → order scope（該訂單全部未撥付應付）；
否則 → **不得自動 hold**，須 Admin 明示指認並留稽核。

部分金額僅能來自 `refund_remedy_cases.approved_amount`，且**必須驗證不大於該品項依 `DEC-23`
分攤後的 `item_net_amount`；超出即 fail closed 退回整個品項範圍**（`DEC-28` §L6）。
**已撥付**的金額不得 hold，改走 `DEC-21`。

---

## 10. Ageing algorithm 【PROPOSED，依 `DEC-29`／`DEC-32`／`DEC-33`】

### 選定方案：**由不可變歷程推導（derived-from-history），並於期間關閉時物化**

四個選項的比較：

| 方案 | 評估 |
| --- | --- |
| 明確計數器（可變欄位） | ❌ 會 drift；更正後**無法重算**；與 append-only 哲學衝突 |
| first-carried-cycle 標記 | ❌ 在 `DEC-33` 的 pause 下失效（**經過的期數 ≠ 合格的期數**） |
| tranche 狀態表（可變） | ⚠️ 實質等同物化，但少了「推導即真相」的保證 |
| **推導 ＋ 物化（選定）** | ✅ `DEC-30` 讓輸入（已關閉期間、不可變分錄、hold 區間）**永久穩定**，故永遠可重算、可稽核；statement 為 **checked cache** |

```text
-- ⚠️ CUTOFF-STATE MODEL（Review Round 2 修正）：只看期末狀態，不看期間內的 hold 歷程
qualifies(slice, cycle N)  := 於 N 的 cutoff 當下，該 slice 的 carried eligible payable > 0
                              （等價於：cutoff 當下未被任何未解除的 hold 覆蓋）  -- DEC-32 P1「期末」

-- 計數於「期間關閉」時遞增，且只計已關閉的合格期間
ageing_after(tranche, N)  := ageing_before(tranche, N) + (qualifies(tranche, N) ? 1 : 0)
ageing_before(tranche, N) := ageing_after(tranche, N-1)     -- 帶入本期的計數

reset                     := tranche 被實際消滅（撥付／完全沖抵）      -- DEC-32 §P3

-- ⚠️ 六期 override 以「帶入本期的計數」判斷，不是關閉後的計數
override_in(N)            := ageing_before(tranche, N) >= 6            -- DEC-29
```

**tranche ＝ 一個 payable slice**（見 §4.1a）。⚠️ **Round 1 寫的「tranche ＝ 一筆 earning 分錄」已被 Round 2 推翻** ——
`DEC-33` §P7(a) 明文要求「hold 之外的部分照常 ageing、被 hold 的部分保留其既有狀態」，
而 §P7(b) 禁止「把各自獨立 ageing 的餘額塌縮成單一計數器」。**分錄層級的單一計數器正是被禁止的那種塌縮。**

### ⚠️ ageing 合格判準 —— CUTOFF-STATE，非 ANY-HOLD-DURING-CYCLE 【Review Round 2 修正】

**設計審查發現**：Round 1 的 `qualifies` 含有第二個條件「**該期間無覆蓋它的 hold**」。
**該條件是本設計自行加上的，canonical policy 並未要求，且與 `DEC-32` 直接抵觸。**

**`DEC-32` P1 的原文是期末判準**：「ageing 基準 ＝ **期末**仍有正數 carried eligible payable 餘額……
只要**期末** `carried eligible payable > 0`，該期即計入 ageing」。**判準是 cutoff 當下的狀態，不是期間內的歷程。**

**兩個候選解釋的比較：**

| | OPTION 1 — CUTOFF-STATE（**選定**） | OPTION 2 — ANY-HOLD-DURING-CYCLE（**否決**） |
| --- | --- | --- |
| 與 `DEC-32` P1「期末」字面 | ✅ 完全一致 | ❌ 抵觸 —— P1 從未提及期間內歷程 |
| 與 `DEC-33` 的 pause 機制 | ✅ 自然成立：cutoff 當下仍被 hold → 該 slice 不合格 ＝ 暫停 | ⚠️ 亦可成立，但過度擴張 |
| 與 `DEC-29` 的目的（避免無限期不付款） | ✅ 保存最多的已累積等待時間 | ❌ **反其道而行** —— 一連串短暫的 hold 可無限期阻止 ageing，正好製造 `DEC-29` 要防的結果 |
| 實作成本 | ✅ 只需 cutoff 當下的狀態 | ❌ 需保存並查詢期間內完整 hold 區間 |

**選定 OPTION 1。此為政策所決定，不是新的 Owner 決定** —— `DEC-32` P1 的「期末」二字已經定案。
`DEC-33` 的「暫停」在此模型下自然實現：**cutoff 當下仍被 hold 的 slice 不合格，計數不前進亦不歸零。**

**四個情境的結果：**

| # | 情境 | 該期是否計入 |
| --- | --- | --- |
| 1 | 期初 eligible，第 3～8 日被 hold，第 9 日解除，**月底仍 eligible** | ✅ **計入** —— cutoff 當下為正數 eligible |
| 2 | 全月大致 eligible，**最後一日被 hold 且 cutoff 當下仍被 hold** | ❌ **不計入**（僅該被 hold 的部分） |
| 3 | 自期初之前即被 hold 至第 20 日，第 21 日解除，**cutoff 當下 eligible** | ✅ **計入** |
| 4 | 100 的 payable 中 **40 被 hold（cutoff 當下仍在）**、60 全月 eligible | ⚠️ **60 的部分計入，40 的部分不計入** —— 見下方 slice 模型 |

**情境 4 證明了一件事：同一筆 earning 的不同部分可以有不同的 ageing。** 這直接推翻了
Round 1「tranche ＝ 一筆 earning 分錄」的說法，見 §4.1a。

**不引入日數加權**：`DEC-29`／`DEC-32` 以**結算期間**計數，非以日計。本設計**不採**
day-weighted ageing、fractional cycle 或 prorated month —— 每個 slice 對每個期間只有
「計入」或「不計入」兩種結果。

### ⚠️ 六期 off-by-one 修正 【Review Round 1】

**設計審查發現**：原設計寫成 `release := ageing >= 6 → 不論金額釋出`。
若 `ageing` 是**含本期**的關閉後計數，則第 6 期關閉時 `ageing = 6`，會**在第 6 期就撥付**。
**這與 `DEC-29` 不符** —— 政策為「連續 6 個期間低於門檻者，**下一個**應付期間釋出」，
且 `DEC-32` §P2 的示例明載「第 1 期 NT$50、第 2～6 期無新銷售 → **第 7 期**即釋出」。

**修正**：override 以 **`ageing_before`（帶入本期的計數）** 判斷，而非關閉後的計數。
`ageing` 在**期間關閉**時遞增；**六個已完成的合格期間**指第 1～6 期皆 qualifies；
**override 於第 7 期成為可撥付**。

**Worked example —— 自第 1 期起持有 NT$50、其後無新銷售、無 hold：**

| 期間 | qualifies? | `ageing_before` | override? | 關閉後 `ageing_after` | 結果 |
| --- | --- | --- | --- | --- | --- |
| 1 | ✅ | 0 | ❌ | 1 | 低於門檻，結轉 |
| 2 | ✅ | 1 | ❌ | 2 | 結轉 |
| 3 | ✅ | 2 | ❌ | 3 | 結轉 |
| 4 | ✅ | 3 | ❌ | 4 | 結轉 |
| 5 | ✅ | 4 | ❌ | 5 | 結轉 |
| 6 | ✅ | 5 | ❌ | 6 | 結轉（**六個合格期間於此完成**） |
| **7** | ✅ | **6** | ✅ | — | **override 觸發，撥付 NT$50** |

**與 `DEC-32` §P2 的示例完全一致。** 本修正只改實作詮釋，**`DEC-29` 與 `DEC-32` 未變**。

---

## 11. Payout algorithm 【PROPOSED，依 `DEC-29`／`DEC-30`】

期間於台北月底關閉（`endOfTaiwanDay`，內部以 half-open 表達）
→ 逐創作者計算 `eligible_balance = Σ eligible 分錄 − 調整`
→ 符合下列任一即撥付：**`>= NT$300`**、**任一 tranche 之 `ageing_before >= 6`**（⚠️ 帶入本期的計數，見 §10 的 off-by-one 修正）、**終止／停業 override**
→ 產生 `payout_item` → Admin 於平台外完成匯款 → 標記已付並記錄銀行參考
→ 寫入 `payout_consumption` 分錄 **並同時寫入 `payout_allocations`**（逐筆指明消耗了哪些 earning／adjustment 分錄及金額）
→ 寄送通知（best-effort，失敗不回滾）。

**`payout_allocations` 使「這筆撥款消耗了什麼」成為可證明的資料，而非只能靠報表推論** ——
tranche 是否消滅（進而 `DEC-32` §P3 的 ageing reset 是否成立）由此決定。

---

## 12. Fault / adjustment algorithm 【PROPOSED，依 `DEC-21`／`DEC-35`】

分類必須**先存在**，才可能有調整。
`non_creator_fault` → **完全不寫任何 ledger 分錄**（Platform absorb）。
`creator_fault` ＋ 歸屬存在 → 寫 `adjustment` 分錄並帶 `fault_classification_id`
（負值分錄由 DB CHECK 強制此連結）。
更正 → 新增一筆帶 `supersedes_id` 的分類 ＋ 一筆 `reversal` 分錄，**永不編輯原紀錄**。

**reason_code 種子** 取自既有 `refund_remedy_cases.case_type`，
但依 `DEC-35` §Q12 **必須是獨立欄位**，不得以 `case_type` 代替分類
（`material_takedown` 同一 case_type 可導向相反的歸責結論）。

**`related_creator_adjustment_id` 的處置** 【PROPOSED】：**保留為 compatibility glue**，
日後指向 `creator_ledger_entries.id`。**現在不改名、不重新用途** ——
它沒有任何寫入端，因此無可遷移之物；`DEC-38` §T6 已記錄其名稱較概念為窄。

---

## 13. Suspense algorithm 【PROPOSED，依 `DEC-37`】

**不能放進 `creator_ledger_entries`** —— 因為 `creator_id NOT NULL` 正是讓 invariant 6
成為結構性保證的機制；改成可空會重新打開 `DEC-36` 所要防的失效模式。

故採**獨立表**，於報表中自成一行，**永不併入創作者應付**。
日後歸屬 ＝ 一個 transaction：標記 suspense 為 `resolved` ＋ 寫入 `earning` 分錄 ＋ 雙向連結。

**【EXTERNAL】** 最終的會計／法律歸屬**不在本文件範圍**（`O19`，會計師 ＋ 律師）。

---

## 14. Legacy reconciliation framework 【PROPOSED，依 `DEC-27`】

三個**嚴格分離**的階段，每次執行一筆 `reconciliation_runs`：

| 階段 | 內容 | 寫入 |
| --- | --- | --- |
| **A. read-only census** | 清點：`approved` ＋ `paid_at NULL`、legacy paid orders、`seller_id NULL`、小數價格、低於 NT$30 價格 | **無** |
| **B. decision** | 逐例外記錄操作者處置與證據 | 僅 exception 記錄 |
| **C. write** | opening 分錄／suspense 分錄 | 以 `UNIQUE (run_scope, order_item_id)` 保證**重跑不重複** |

> ⚠️ **冪等是必要而非可選** —— `DEC-27` §K8：bootstrap 的 legacy 語句**每次啟動都執行**。

---

## 15. `COR-09` implementation design 【PROPOSED，依 `DEC-34` ＋ `DEC-39`】

新增 `utils/listingPricePolicy.js`：`MIN_LISTING_PRICE = 30`、
`validateListingPrice(raw)` → `{ ok, value, code }`。
規則：**整數 TWD 且 `>= 30`**。

1. **create 驗證** —— 取代 `routes/materials.js:152` 的檢查。
2. **update 驗證** —— 取代 `:164`，**並且**修正 **`:789` 目前以 `req.body?.price ?? null` 原值寫入**的路徑。
   ⚠️ **只改驗證不夠 —— 寫入端必須改用驗證後的值。**
3. **錯誤碼** —— `price_not_integer`／`price_below_minimum` 分開，**絕不靜默轉換**。
4. **`floorMoney`** —— 見下方「順序要求」。
5. **DB 層 CHECK** —— **僅在對帳證明零違反之後**才施加。

### ⚠️ 順序要求（不可調換）【PROPOSED】

```text
read-only census
  → 對帳處理小數／低於 NT$30 的歷史列
  → 驗證零違反
  → 移除或取代 orderService 的靜默 floor
  → 施加 DB 層價格約束
```

**理由**：`orderService.js:218` 的 `floorMoney` 目前是**唯一讓既有小數教材仍能結帳的東西**。
**若先移除它，未經對帳的 legacy 小數列會在結帳時失敗。**

---

## 16. Reporting changes 【PROPOSED】

新增彼此不含混的行：Creator Gross Sales（既有，不動）／**Creator Net Sales**（新，`DEC-23` 後）／
Creator Earnings／Platform Commission／Recognized Order Revenue（既有，**定義保持不變**）／
Held／Pending Payable／Paid／Negative Adjustments／**Unattributed Suspense**（補上 `DEC-36` §R11 的缺口）。

> 依 `mvp_rules.md` §18.4，**「營收」一詞保留給 Admin recognized revenue**，
> 創作者側不得重用該詞。

---

## 17. Audit events 【PROPOSED，沿用 `<domain>.<verb>`】

`settlement.cycle_closed`／`payout.marked_paid`／`hold.opened`／`hold.released`／
`attribution.manually_assigned`／`creator_fault.classified`／`creator_fault.corrected`／
`creator_ledger.adjusted`／`reconciliation.run_completed`／`suspense.resolved`

> ⚠️ **Review Round 1 更正**：原列有 `payout.batch_closed`，但本設計刻意**不設 batch 實體**（§4.5）。
> 保留該事件名會讓稽核軌跡指涉一個不存在的領域概念。已更名為 **`settlement.cycle_closed`**，
> 語意也更準確 —— 該事件記錄的是**結算期間關閉**（statements 寫入），而非撥款執行；
> 撥款執行由 `payout.marked_paid` 記錄。**全文改採 settlement-cycle／payout-cycle 用語，不再出現 batch。**

---

## 18. Invariants 與強制方式 【PROPOSED】

| # | Invariant | 強制方式 |
| --- | --- | --- |
| 1 | 整數 TWD | 欄位型別 ＋ 價格 CHECK |
| 2 | `creator_earnings + platform_commission = creator_net_sales` | **row CHECK** |
| 3 | 每訂單每創作者不得重複 earning | **partial UNIQUE** |
| 4 | 不得重複 legacy opening 分錄 | **UNIQUE (run_scope, order_item_id)** |
| 5 | 撥款消耗不得超過應付 | **`payout_allocations` 每 slice 總額 ≤ 該 slice `amount`**（約束／trigger）＋ 對帳報表 |
| 6 | 無歸屬即無創作者責任 | **`creator_id NOT NULL` ＋ suspense 獨立表** |
| 7 | 無 creator_fault 來源即不得有負餘額 | **row CHECK** |
| 8 | 已關閉期間歸屬不可變 | cycle status ＋ 禁止 UPDATE |
| 9 | suspense 永不呈現為創作者應付 | **結構性（不同表）** |
| 10 | 撥款總額精確對帳 | **`SUM(payout_allocations.amount) = payout_items.amount`** ＋ 對帳報表 |

**原 10 條中有 8 條可落為真正的 DB 約束**（Round 1 後，第 5、10 條因 `payout_allocations` 而可資料化；Round 2 再加第 14 條） —— 這是本設計形狀的主要論據。

**新增 invariant（Review Round 1）**：

| # | Invariant | 強制方式 |
| --- | --- | --- |
| 11 | 每 **slice** 的**未解除 hold 總額** ≤ 該 slice `amount` | `settlement_hold_allocations` 約束／trigger（`DEC-28` §L6） |
| 12 | `settlement_cycle_id` 一經寫入不得變更 | trigger（`DEC-30` §N6／§N7，見 §3.2）—— **位於 slice 層級** |
| 14 | **leaf 切片必須精確加總回分錄**：`SUM(leaf slices.amount) = ledger_entry.amount` | 約束／trigger（Round 2；確保切片不製造也不遺失金額） |
| 15 | **子切片必須精確加總回父切片**：`SUM(children.amount) = parent.amount` | 約束／trigger（Round 2 最終；再分割不得製造或遺失金額） |
| 16 | **只有 leaf 切片可被 hold／payout allocation 指向** | 約束／trigger（避免對已分割的父切片重複配置） |
| 13 | 非 `earning` 列不得帶 `creator_net_sales`／`platform_commission` | row CHECK（避免金額語意重載） |

---

## 19. Test matrix 【PROPOSED】

**UNIT**：`DEC-23` 分攤（含 Owner 兩個示例與 100% 折扣）／`DEC-31` 取整（`97 → 78/19`）／
eligibility／threshold／ageing／hold pause-resume（3 → 暫停 → 4）／fault gating
（**non_creator_fault 必須完全不產生分錄**）／suspense。

**INTEGRATION**：order → earning／earning → cycle／hold → release／payout／adjustment／
legacy reconciliation／attribution correction。

**MIGRATION**：冪等（跑兩次結果相同）／防重複／rollback 安全。

**E2E**：創作者撥款全生命週期／Admin 人工標記完成／被 hold 的案件／低於門檻結轉／
六期 override／創作者過失調整／未歸屬品項。

**`COR-09`**：create 29 拒絕／create 30 接受／create 30.5 拒絕／
update 29 拒絕／update 30 接受／update 30.5 拒絕／**確認無靜默 floor**
（**六個案例 create 與 update 兩條路徑都要測**）。

---

## 20. Migration sequencing 【PROPOSED】

| Phase | 內容 | 前置 | 寫入 | 驗證 | Rollback |
| --- | --- | --- | --- | --- | --- |
| **0** | read-only census | 無 | **無** | 報表產出 | 無需 |
| **1** | additive schema ＋ `orders.refund_window_end` | 設計審查通過 | DDL only | 雙軌（`db_schema.sql` ＋ `bootstrapModel.js`）一致 | drop 新表 |
| **2** | backfill／opening 對帳 | Phase 0 結果 | opening／suspense 分錄 | 冪等重跑 | 以 run id 反向刪除 |
| **3** | shadow 計算（**只比對，不服務**） | Phase 2 | 無（或只寫 shadow） | 與既有報表差異報告 | 關閉旗標 |
| **4** | 啟用核准時寫入 earning | Phase 3 零差異 | ledger 分錄 | invariant 檢查 | 關閉旗標 |
| **5** | 報表切換 | Phase 4 穩定 | 無 | 指標對帳 | 切回舊查詢 |
| **6** | 移除 `floorMoney`、加價格 CHECK | **`COR-09` 對帳完成且零違反** | DDL | 結帳回歸 | drop constraint |

**Phase 6 之前全部為 additive，無破壞性步驟。**

---

## 21. Rollout / rollback 【PROPOSED】

單一旗標 `SETTLEMENT_WRITE_ENABLED` —— 有其必要性，因為 Phase 3 與 Phase 4 的差別
**只在於是否持久化已計算的分錄**。Shadow 對帳報表即 canary。
**Rollback trigger**：夜間報表出現任一 invariant 違反。
每次部署後跑一次 census 比對。**不引入超出此範圍的 rollout 複雜度。**

---

## 22. External dependency isolation 【EXTERNAL】

| 外部項目 | 隔離點 | 是否需要重新設計 ledger |
| --- | --- | --- |
| **`AD-09`** 創作者收款資料 | 完全侷限於 `payout_items.bank_reference` ＋ 未來的收款目的地表 | **否** |
| **`AD-10`** 代理收付定性 | 影響**金錢歸誰所有**，不影響**如何計算**；標籤落在報表層 | **否** |
| **稅務／扣繳** | 未來的 entry type 或衍生報表行 | **否** |
| **`O19` 最終處置** | suspense 表已保存金額；處置只是新增終態 | **否** |

**四者皆可於日後插入而不需重塑 ledger。** 這是本設計的主要約束滿足論據。
**本文件不為其中任何一項發明答案。**

---

## 23. Risks / unresolved implementation questions

1. **「核准時即寫 earning」會把結帳與 ledger 正確性耦合** —— 以 shadow 階段緩解，但耦合真實存在。
2. **`writeActivityLog` 的原子性** —— 需要選用 client 的擴充，否則金額稽核只能是 best-effort。
3. **`orders` 無 status CHECK** —— eligibility predicate 建立在未受約束的狀態域上。
4. **DDL 雙軌** —— 每張新表都必須同時加入 `db_schema.sql` 與 `bootstrapModel.js`，否則全新佈建會分歧。
5. ~~切片內部的部分金額 hold 尚無政策，需要新的 Owner 決定（`O20`）~~ ✅ **已於 Round 2 最終更正並解除** —— 該歸類有誤：**`DEC-33` §P7(a) 早已決定商業行為**，且 **§P7(b) 主動排除**了「暫停整個切片」的候選。**自始只有一個合規答案，無 Owner 抉擇空間。**
   已落為設計機制（§4.1a 的切片再分割 ＋ lineage），**不再是風險或阻擋項**。
6. **Legacy 數量未知** —— 本設計期間**未查詢任何資料庫**；Phase 0 的結果可能實質改變 Phase 2 的形狀。

---

## 24. Exact recommended implementation order

1. **`COR-09` 驗證（create ＋ update ＋ `:789` 原值寫入修正）＋ Phase 0 read-only census**
   —— 小、可逆、無新表、無外部相依，且 census 產出是後續每一階段的輸入。
2. **設計審查**（本文件）。
3. Phase 1 additive schema。
4. Phase 2 對帳。
5. Phase 3 shadow。
6. Phase 4 啟用。
7. Phase 5 報表切換。
8. Phase 6 清理（移除 `floorMoney`、加約束）。

---

## 審查結論

| 問題 | 回答 |
| --- | --- |
| **設計是否可審查** | **READY**。惟 Phase 2 的形狀取決於 Phase 0 census，而 census 需要資料庫 |
| **實作阻擋** | `COR-09` 與 Phase 0 **無阻擋**；Phase 1 以後應待本文件審查通過 |
| **仍為外部** | `AD-09`、`AD-10`、稅務／扣繳、`O19` 最終處置 |
| **schema 設計可否先於 `AD-09`／`AD-10`** | **可以** —— 兩者都不影響 ledger 形狀；`PRE-18` §E(2)／§E(3) 禁止的是**實作**收款模型與**假定** `AD-10` 的答案，本設計兩者皆未做 |
| **`COR-09` 可否立即開工** | **可以，但僅部分** —— 驗證與 census 完全不受阻；`floorMoney` 移除與 DB 約束必須等對帳 |
| **建議第一個 PR** | **`COR-09` 驗證 ＋ Phase 0 census，不含任何 schema** |

### 建議審查順序

1. **金額 invariants**（§18）—— 若第 2、3、6、7 條不成立，其餘設計無意義
2. **ledger 形狀**（§3.1、§4.1、§5）—— 特別是 fact vs snapshot 的界線
3. **hold / ageing**（§9、§10）—— `DEC-32`／`DEC-33` 的交互最容易出錯
4. **payout cycle**（§4.5、§11）—— 含「batch 收攏進 cycle」的取捨
5. **reconciliation**（§14）—— 冪等性
6. **`COR-09`**（§15）—— 含不可調換的順序要求
7. **migration / rollout**（§20、§21）

---

> **本文件不改變任何 `DEC-*` 決定、不建立 schema、不含可執行 migration、不含 production code。**
> `PRE-18` 與 `COR-09` 皆維持 **OPEN**。
