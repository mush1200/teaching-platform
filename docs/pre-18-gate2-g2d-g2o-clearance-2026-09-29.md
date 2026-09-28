# Gate 2 —— 清除 G2-D 與 G2-O 的作業包

> **本文件不作 Gate 2 決定，不啟用旗標，不變更任何 settlement 程式碼。**
> 它提供 Owner 需要執行的唯讀指令、需要指派的角色、需要採用的控制，
> 以及 G2-E 的認知確認書。**所有欄位皆待 Owner 填寫，本文件不代填。**

建立於 2026-09-29。搭配
`pre-18-gate2-owner-decision-package-2026-09-29.md` 與
`pre-18-settlement-operating-controls-2026-09-29.md`。

---

## 0. ⚠️ 開始前必讀 —— 一項已查證的限制

**`GET /admin/settlement/cycles/<YYYY-MM>/preview` 在旗標 OFF 時不會回傳任何曝險資訊。**

原因（已實測）：`previewCycleClose` 逐創作者計算時，
先以 `SELECT DISTINCT creator_id FROM creator_ledger_entries` 取得創作者名單。
旗標 OFF ⇒ 該表為空 ⇒ **`statements` 為空陣列、`wouldPayTotal` 為 0**。

實測（0 筆分錄的資料庫）：

```text
ledger entries: 0
preview statements returned: 0
preview wouldPayTotal      : 0
```

**因此下列欄位無法由既有唯讀工具取得：**

| 欄位 | 為什麼取不到 |
| --- | --- |
| unique Creators | shadow 只彙總總額，**不逐創作者拆分** |
| Creators ≥ NT$300 ／ < NT$300 | 同上；preview 因 ledger 為空而回空集合 |
| amount ≥ threshold ／ < threshold | 同上 |
| cycle-7 override 金額 | 同上（且需要已關閉期間的歷程，目前為 0） |
| `wouldPayTotal`（有意義的值） | 同上 |

**這不是工具故障** —— shadow 的設計目的是「總量對帳」，逐創作者拆分從未被要求過。

### 🔒 Owner 決定（2026-09-29）—— 採用 option (a)：以**總量曝險**作 Gate 2 決定

**上述六個欄位一律標記為
`PER-CREATOR THRESHOLD BREAKDOWN = DEFERRED — GATE 3 / FIRST-CYCLE-CLOSE READINESS`。**

**它們不是 Gate 2 的缺漏技術需求，也不得被當成 Gate 2 的未知阻擋項。**

Owner 記載的理由：

1. 開啟旗標**不會**回溯物化既有已付訂單；
2. 僅僅開啟旗標所產生的**立即義務為 NT$0**；
3. 新的不可變結算義務**只在啟用後的未來付款核准**才發生；
4. 逐創作者的 NT$300 門檻拆分，**與「第一筆結算寫入是否可以開始」無關** ——
   它關係到日後的**期間關閉／撥款就緒**；
5. 無論如何 **Gate 3 仍被 `AD-09` ＋ 稅務／扣繳擋住**。

**本輪未新增 `--by-creator` 旗標，亦未變更任何 settlement 程式碼或唯讀工具。**

**其餘欄位全部可取得**，且其中數項在旗標 OFF 時**必然為 0**（非估算，而是結構事實）：
eligible payable、held、pending、negative adjustments、suspense amount ——
因為這些量全部讀自 `creator_ledger_entries` 與其下游表，而該表為空。

---

## 1. Owner 需執行的唯讀指令（**三道，不是兩道**）

三道皆為**唯讀**：無 `INSERT`／`UPDATE`／`DELETE`／DDL，無 `--fix`／`--write` 旗標。

### 指令 A —— production settlement shadow

```powershell
cd C:\teaching-platform\Backend
$env:DATABASE_URL = "<production connection string>"
node scripts/settlement-production-shadow.js --json > $env:TEMP\pre18-shadow.json
Remove-Item Env:\DATABASE_URL
Get-Content $env:TEMP\pre18-shadow.json
```

### 指令 B —— write-enable readiness（**提供 shadow 沒有的 disposition 與 verdict**）

```powershell
cd C:\teaching-platform\Backend
$env:DATABASE_URL = "<production connection string>"
node scripts/settlement-write-enable-readiness.js --json > $env:TEMP\pre18-readiness.json
Remove-Item Env:\DATABASE_URL
Get-Content $env:TEMP\pre18-readiness.json
```

### 指令 C —— 現行期間 preview（**預期為空，用於確認而非測量**）

目前的台北結算期間為 **`2026-09`**（cutoff `2026-09-30` 台北日終，
撥款完成期限 **`2026-10-15`** 台北日終）。

```powershell
$token = "<production admin JWT>"
Invoke-RestMethod -Uri "https://teaching-platform-backend.onrender.com/admin/settlement/cycles/2026-09/preview" `
  -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 6
```

### 安全規則

- **請勿**把連線字串或 token 貼進對話；上面全部是佔位符。
- `$env:DATABASE_URL` 只存在於該視窗，指令末尾即移除；**不寫入任何檔案**。
- 若任何指令出現寫入跡象（`INSERT`／`UPDATE`／`rows affected`／
  `settlement writes are disabled` 以外的寫入錯誤）→ **立即停止並回報**。
- 三道指令都**不會**產生 ledger 列、不會關閉期間、不會撥款。

### 需要貼回的輸出

1. `pre18-shadow.json` **全文**
2. `pre18-readiness.json` **全文**
3. 指令 C 的回應（預期 `statements: []`）

**請勿**貼回 `DATABASE_URL`、token 或任何金鑰。

---

## 2. 指令輸出 → 欄位對照

| 需要的欄位 | 來源 |
| --- | --- |
| total orders | A `census.orders_total` |
| approved orders | A `census.approved_total` |
| approved + `paid_at` | A `census.approved_with_paid_at` |
| approved + `paid_at` NULL | A `census.approved_without_paid_at` |
| Creator-attributable paid items | A `census.attributable_paid_items` |
| `seller_id` NULL paid items | A `census.items_without_seller` |
| expected earning entries | A `economics.totals.expectedEarningEntries` |
| expected payable slices | A `economics.totals.expectedPayableSlices` |
| total expected Creator earnings | A `economics.totals.creatorEarnings` |
| total `creator_net_sales` | A `economics.totals.creatorNetSales` |
| total platform commission | A `economics.totals.platformCommission` |
| suspense candidates | A `economics.totals.suspenseCandidates` ／ `suspenseNetAmount` |
| duplicate candidates | A `economics.duplicateEarningCandidates` |
| unexplained differences | A `blocking` ／ `overall` |
| earliest eligible cycle | A `economics.expectedCycleMembership[0].cycleId` |
| invariant violations | B `checks[no_invariant_violations]` |
| unresolved dispositions | B `checks[dispositions_recorded]` |
| readiness verdict | B `verdict` |
| eligible payable ／ held ／ pending ／ negative adjustments | **結構上為 0**（ledger 為空） |
| **unique Creators** | ⏭ **DEFERRED — GATE 3 / FIRST-CYCLE-CLOSE**（見 §0） |
| **Creators ≥／< NT$300、金額分割、cycle-7 金額、`wouldPayTotal`** | ⏭ **DEFERRED — GATE 3 / FIRST-CYCLE-CLOSE**（見 §0） |
| earliest payout due date | 由 `expectedCycleMembership[0].cycleId` 推得：該期間次月 15 日台北日終 |

### 2.1 G2-D 的**必要**欄位（全部可由指令 A ＋ B 取得）

**Gate 2 的 G2-D 只要求下列 17 項，皆為實測值，不得估算：**

| # | 欄位 | 來源 |
| --- | --- | --- |
| 1 | total orders | A `census.orders_total` |
| 2 | approved orders | A `census.approved_total` |
| 3 | approved + `paid_at` | A `census.approved_with_paid_at` |
| 4 | approved + `paid_at` NULL | A `census.approved_without_paid_at` |
| 5 | attributable paid items | A `census.attributable_paid_items` |
| 6 | `seller_id` NULL paid items | A `census.items_without_seller` |
| 7 | expected earning entries | A `economics.totals.expectedEarningEntries` |
| 8 | expected payable slices | A `economics.totals.expectedPayableSlices` |
| 9 | total expected `creator_net_sales` | A `economics.totals.creatorNetSales` |
| 10 | total expected Creator earnings | A `economics.totals.creatorEarnings` |
| 11 | total expected platform commission | A `economics.totals.platformCommission` |
| 12 | duplicate candidates | A `economics.duplicateEarningCandidates` |
| 13 | suspense candidates | A `economics.totals.suspenseCandidates` |
| 14 | unresolved dispositions | B `checks[dispositions_recorded]` |
| 15 | invariant violations | B `checks[no_invariant_violations]` |
| 16 | unexplained differences | A `blocking` ／ `overall` |
| 17 | settlement readiness verdict | B `verdict` |

> **A ＋ B 為 Gate 2 的權威量測來源。**
> 指令 C 僅為**確認用**：ledger 為空時 preview 必然為空，
> ⚠️ **空的 preview 不得被解讀為「歷史曝險為零」** ——
> 歷史曝險在 A 的 `economics.totals` 裡，不在 preview 裡。

---

## 3. 營運角色指派（G2-O，**待 Owner 填寫**）

```text
PRE-18 SETTLEMENT —— 營運角色指派

Primary settlement operator   : ____________________
Backup settlement operator    : ____________________
Incident owner                : ____________________
First-24-hour monitoring owner: ____________________
First-cycle-close approver    : ____________________
Emergency-disable authority   : ____________________

生效日：____________    指派人：____________
```

> 同一人可兼任多角，但**每一欄都必須有名字** ——
> 空白等於事故當下沒有人負責。

---

## 4. 營運控制採用檢查表（**待 Owner 勾選**）

> ⚠️ **未經 Owner 明示勾選者一律視為 NOT ADOPTED。**
> 程式碼支援不等於控制存在。

```text
控制                                    ADOPTED / NOT ADOPTED / N/A
---------------------------------------------------------------
payout review checklist                 [ ] / [ ] / [ ]
cycle-close checklist                   [ ] / [ ] / [ ]
payout deadline calendar                [ ] / [ ] / [ ]
payout due-date alert / reminder        [ ] / [ ] / [ ]
weekly exception review                 [ ] / [ ] / [ ]
reconciliation review                   [ ] / [ ] / [ ]
first-hour monitoring                   [ ] / [ ] / [ ]
first-24-hour monitoring                [ ] / [ ] / [ ]
emergency flag-off procedure            [ ] / [ ] / [ ]
invariant incident response             [ ] / [ ] / [ ]
duplicate earning response              [ ] / [ ] / [ ]
incorrect-ledger correction response    [ ] / [ ] / [ ]
accidental cycle-close response         [ ] / [ ] / [ ]
accidental payout-item response         [ ] / [ ] / [ ]
accidental mark-paid response           [ ] / [ ] / [ ]
notification failure response           [ ] / [ ] / [ ]
payout freeze until Gate 3 PASS         [ ] / [ ] / [ ]
```

各控制的實際內容見 `pre-18-settlement-operating-controls-2026-09-29.md` §2–§8。

---

## 5. 撥款期限提醒 —— 零程式碼的過渡方案

**問題**：`payout_cycles.payout_due_at` 已持久化，但**全 repo 沒有任何消費端** ——
無排程、無告警、無提醒。逾期在技術上不被阻止，也不會有人被通知。

**過渡方案（不需要任何程式碼變更）**：

1. **期間關閉時立刻建立日曆事項** —— 關閉 `YYYY-MM` 之後，
   於該月**次月 15 日**建立提醒，並在**次月 8 日**建立一個提前提醒；
2. **每週例行檢視**：
   `GET /admin/settlement/payout-items?status=pending`
   —— 任何 `pending` 且其 cycle 的 `payout_due_at` 在 14 日內者必須被指名處理；
3. **關閉期間的檢查表中加入一項**：
   「已建立本期的撥款到期日曆事項？」未勾選不得關閉；
4. **交接規則**：主要操作者請假時，日曆事項須同時指派給備援操作者。

> ⚠️ **這是人工控制，不是技術強制。** 若要技術強制，需新增排程或告警
> （**本輪未實作，亦未獲授權實作**）。
>
> 提醒：**在 Gate 3 PASS 之前不應有任何真實撥款**，
> 因此此提醒的第一個實際用途，是確保「已到期但因外部阻擋而無法支付」
> 這件事**被看見並被記錄**，而不是被忽略。

---

## 6. G2-O 轉為 PASS 的最低條件

**全部滿足才算 PASS。皆為人工控制，不需要任何程式碼變更。**

| # | 條件 | 證據 |
| --- | --- | --- |
| 1 | Primary operator 已指派 | §3 已填 |
| 2 | Backup operator 已指派 | §3 已填 |
| 3 | Incident owner 已指派 | §3 已填 |
| 4 | Monitoring owner 已指派 | §3 已填 |
| 5 | First-cycle approver 已指派 | §3 已填 |
| 6 | Emergency-disable authority 已指派 | §3 已填 |
| 7 | 撥款凍結規則已採用 | §4 該列 ADOPTED |
| 8 | 撥款期限提醒已採用 | §4 該列 ADOPTED ＋ §5 方案就位 |
| 9 | 監控檢查表已採用 | §4 first-hour ＋ first-24-hour 皆 ADOPTED |
| 10 | 緊急停用程序已採用 | §4 該列 ADOPTED |
| 11 | 事故升級程序已採用 | §4 invariant／duplicate／mark-paid 三列皆 ADOPTED |

---

## 7. G2-E 認知確認（**待 Owner 核可或拒絕，本文件不代勾**）

```text
GATE 2 —— 外部後果認知確認

我理解：

1. 開啟 SETTLEMENT_WRITE_ENABLED **不會**回溯物化既有的已付訂單；
2. 但啟用後的**第一筆新核准付款**將產生**不可變**的創作者結算事實與應付義務；
3. AD-09（創作者收款資料）與稅務／扣繳**仍未解決**，
   因此上述義務可能在平台**尚無法合規執行撥款**之前就開始累積；
4. 日後把旗標關回 OFF **只會停止未來的 gated 寫入**，
   **不會**抹除已經產生的義務。

  [ ] 我確認以上認知          [ ] 我不確認

簽署：__________________    日期：__________
```

---

## 8. Gate 2 子閘門現況

| 子閘門 | 狀態 | 轉為 PASS 所需 |
| --- | --- | --- |
| **G2-T** 技術 | ✅ **PASS** | — |
| **G2-D** 曝險已掌握 | ⏸ **WAITING FOR AGGREGATE PRODUCTION MEASUREMENT** | Owner 執行 §1 的指令 A ＋ B 並貼回輸出，取得 §2.1 的 17 項 |
| **G2-O** 營運控制 | ⏸ **WAITING FOR OWNER ASSIGNMENT / CONTROL ADOPTION** | §6 的 11 項條件全數滿足 |
| **G2-E** 外部後果認知 | ⏸ **WAITING FOR OWNER ACKNOWLEDGEMENT** | §7 已簽署 |
| **G2-OWNER** | ⏸ **PENDING** | Owner 明示選擇 KEEP OFF 或 ENABLE |

> **任一子閘門不得在無明示證據下升級。**
>
> **G2-D 的範圍已由 Owner 於 2026-09-29 鎖定為「總量曝險」（option (a)，見 §0）** ——
> 因此它**不會**因為逐創作者拆分不可得而 FAIL。
> 那六個欄位為 **DEFERRED — GATE 3 / FIRST-CYCLE-CLOSE READINESS**。
