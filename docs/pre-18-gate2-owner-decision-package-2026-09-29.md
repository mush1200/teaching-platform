# Gate 2 Owner 決定包 —— `SETTLEMENT_WRITE_ENABLED` 開或不開

> **本文件不作決定，也不建議任何一方。** 它把「開了會發生什麼、不開會發生什麼」
> 攤開到可以下判斷的程度，決定權在 Owner。
>
> **本輪未開啟旗標、未變更任何 settlement 程式碼、未作任何法律／稅務／會計結論。**

建立於 2026-09-29。所有 §A 的行為敘述**逐一以現行程式碼查證**，不採信設計文件記憶。

---

## A. 開啟旗標實際上會做什麼（逐點以程式碼查證）

### A.1 旗標的全貌

全系統**只有一個** settlement 開關，定義只有一處：

```
Backend/utils/settlementPolicy.js:157
  isSettlementWriteEnabled(env) → env.SETTLEMENT_WRITE_ENABLED 去空白、轉小寫後 === "true"
```

**除 `"true"` 之外的任何值（含未設定、空字串、`1`、`yes`）一律視為關閉。**

真正**攔截行為**的判斷點只有 **5 處**：

| 位置 | 攔住什麼 |
| --- | --- |
| `services/settlementIntegration.service.js:66` | 付款核准時的 ledger／懸記寫入 |
| `services/settlement.service.js:319` | `closeCycle`（期間關閉） |
| `routes/adminSettlement.js:130` | `POST .../cycles/:id/close` |
| `routes/adminSettlement.js:276` | `POST .../payout-items/:id/mark-paid` |
| `routes/adminSettlement.js:330` | `POST .../payout-items/:id/mark-failed` |

（另有 `adminSettlement.js:86` 只是把狀態回報給前端，不攔截任何事。）

### A.2 開啟後**會**發生的事

| 問題 | 答案 | 觸發方式 |
| --- | --- | --- |
| `creator_ledger_entries` 於付款核准時寫入？ | **會** | **自動** —— Admin 核准付款憑證時 |
| payable slices 建立？ | **會** | **自動** —— 與 earning 同一 transaction |
| suspense 列建立？ | **會**（僅當該訂單有 `seller_id IS NULL` 的品項） | **自動** |
| 期間關閉寫入變成可用？ | **會** | **人工** —— Admin 呼叫 close 端點 |
| payout items 產生？ | **會** | **人工** —— 只在期間關閉時產生 |
| mark-paid 變成可用？ | **會** | **人工** |
| 通知信變成可能發出？ | **會** | **人工** —— 只在 mark-paid 成功 commit 之後 |

### A.3 開啟後**仍然不會**發生的事（重要）

| 項目 | 為什麼 |
| --- | --- |
| **hold 的建立／解除** | **沒有任何 HTTP 端點**。`openHold`／`releaseHold` 的 production 呼叫點為 **0** |
| **過失分類的建立／更正** | 同上。`classify` 只被 `correctClassification` 內部呼叫，而後者呼叫點為 **0** |
| **負向調整／沖正** | `recordAdjustment`／`recordReversal` production 呼叫點為 **0** |
| **懸記的歸屬解決** | `resolveSuspense` 呼叫點為 **0**；`recordLegacyOpening` 僅被它內部呼叫 |
| **legacy 期初對帳寫入** | 同上 |

> ⚠️ **這五類寫入即使旗標開啟也做不到** —— 不是被旗標擋住，而是**根本沒有入口**。
> 它們的服務層已實作並測試過，但尚未接上任何路由。
> **因此「開啟旗標」不等於「整個結算系統變成可寫」。**

### A.4 旗標**關閉時**已經在做的事（現在就在發生）

- **`orders.refund_window_end` 一律寫入**（`settlementIntegration.service.js` 第一個動作，
  在旗標判斷**之前**）。這是 `DEC-26` 的持久化期限，不產生任何應付。
- 付款核准路徑會跑一次 **shadow 計算**並回傳結果，**不寫入任何金額**。
- 所有唯讀端點（含 `preview`）完全可用。
- `POST .../reconciliation/dispositions` **不受旗標約束**（刻意：它不移動金錢，
  且是開旗標的前置條件，擋住會死結）。

---

## B. 開啟後開始累積的是什麼

### B.1 系統事實（可由程式碼與資料確認）

1. **一筆 earning 分錄是不是對創作者的義務？**
   在**系統上**它是一筆對該創作者的**應付餘額**，且**不可刪除**
   （`pre18_ledger_append_only_trg` 擋下 UPDATE 與 DELETE）。
   **它在法律上是不是債務，屬 `AD-10`／`PRE-03` 的定性問題，本文件不作認定。**
2. **何時成為 eligible？**
   該訂單 `status='approved'`、`paid_at` 存在、`refund_window_end` 已於期間 cutoff 前屆滿、
   有安全歸屬、cutoff 當下未被 hold 覆蓋、且尚未被撥款消耗。
3. **何時可能成為「應撥付」？**
   只有在**有人手動關閉某個結算期間**、且該創作者的 eligible 餘額
   達 NT$300 或滿足六期 override 或終止 override 時，才產生 `payout_items`。
   **不關期間就永遠不會產生應撥付項目。**
4. **若撥款仍被 `AD-09`／稅務擋住會怎樣？**
   應付會**持續累積**且完全可稽核，但**付不出去**。
   `mark-paid` 需要 transfer reference，而沒有收款資料就無法完成真實匯款。
5. **能否安全且可稽核地累積？**
   **系統層面可以** —— append-only、14 項 invariant 檢查、逐筆稽核事件、
   隨時可重算的報表恆等式。**但「可稽核地欠錢」與「該不該欠錢」是兩件事。**
6. **一旦應撥付，作業期限是什麼？**
   `DEC-30`：撥款**完成**期限為**次月 15 日**（`payout_cycles.payout_due_at`，已持久化）。
7. **屆期付不出來會怎樣？**
   系統會保留該 `payout_items` 於 `pending`，並持續顯示逾期。
   **這是營運承諾的違反，其後果屬法律／契約問題，本文件不作認定。**

### B.2 三層必須分開

| 層次 | 現況 |
| --- | --- |
| **會計系統事實** | 一筆不可變的應付餘額被建立 |
| **營運撥款義務** | 期間關閉後產生，次月 15 日前應完成 |
| **法律解釋** | **外部未決**（`AD-10`／`PRE-03`），本文件不預設 |

> ⚠️ **關鍵不對稱**：累積義務是**自動**的（付款核准即發生），
> 而清償義務需要 `AD-09` 與稅務答案才做得到。
> **開啟旗標會讓這兩件事之間的落差開始擴大。**

---

## C. 目前的 production 曝險 —— **未量化**

**本 session 無 production 憑證（`DATABASE_URL = NOT SET`），因此以下欄位無法填寫。**
**不估算、不推測。**

最近一次 Owner 回報的 production shadow（**非本 session 第一手量測**）只涵蓋**判定**，
未包含數量：

| 已知（Owner-reported） | 值 |
| --- | --- |
| overall shadow verdict | `NO_UNEXPLAINED_DIFFERENCE` |
| invariant violations | 0 |
| duplicate earning candidates | 0 |
| suspense candidates | **0** |
| outstanding manual dispositions | 0 |

| 仍**未知**，必須實測 | 取得方式 |
| --- | --- |
| 已付／已核准訂單數 | `settlement-production-shadow.js --json` → `census.approved_with_paid_at` |
| 可歸屬品項數 | 同上 → `census.attributable_paid_items` |
| 預期 earning 筆數 | 同上 → `economics.totals.expectedEarningEntries` |
| 預期 payable slices | 同上 → `economics.totals.expectedPayableSlices` |
| 預期創作者應付總額 | 同上 → `economics.totals.creatorEarnings` |
| 期間歸屬分布 | 同上 → `economics.expectedCycleMembership` |
| **逐創作者 eligible 餘額** | `GET /admin/settlement/cycles/<YYYY-MM>/preview` |
| **達門檻會撥付的金額** | 同上 → `wouldPayTotal`、`statements[].payoutTriggeredReason` |
| 最早應撥付日 | 由 `expectedCycleMembership` 最早期間 ＋ 次月 15 日推得 |
| 現有 holds／負向調整 | 目前**不可能存在** —— 兩者皆無寫入入口（§A.3） |

> ✅ **這些數字全部可在旗標維持 OFF 的情況下取得** ——
> `preview` 端點與 shadow 腳本都是唯讀的。
> **建議在作決定之前先跑一次**，因為 §D 的兩個選項在金額未知時難以評估。

---

## D. 兩個選項

### Option A —— 維持 OFF

**好處**
- 不產生任何創作者應付，因此**不存在「累積了卻付不出去」的落差**；
- 外部四項答覆回來後，若答案改變金額語意（例如扣繳採「總額 ＋ 扣繳欄位」方案會
  **改動 invariant 10 的比對對象**），**沒有任何已寫入的資料需要遷移或沖正**；
- 隨時可改為開啟，且開啟前的驗證資產（shadow／readiness）持續有效。

**風險**
- **不會**遺失經濟事實 —— 訂單、品項、金額、折扣、`paid_at`、`refund_window_end`
  全部照常持久化；
- 但**結算側的物化**（分錄、切片、期間歸屬）不會發生，因此
  **日後開啟時，先前所有已付訂單都成為需要一次性對帳的 backlog**；
- 該 backlog 的處理路徑已實作（`opening` 分錄、`reconciliation_runs`、
  逐筆 disposition），但**尚無 HTTP 入口**（§A.3），屆時需先補上。

**未被物化的經濟事實**：每創作者×每訂單的 earning 拆分、payable 切片、
期間歸屬、ageing 計數起點。

**Launch 影響**：Gate 2 維持 pending；Gate 3／4 不受影響（本來就被外部項擋住）。

### Option B —— 現在開啟

**好處**
- 應付自付款核准起**即時物化**，不累積對帳 backlog；
- ageing 時鐘自實際交易日起算，而非日後補記；
- 真實資料會持續驗證引擎（invariant 檢查每次都跑）。

**風險**
- **開始累積真實的創作者應付，而清償能力仍被 `AD-09` 與稅務擋住**；
- 若外部答案要求改動金額語意，**已寫入的資料只能以沖正分錄更正，不能刪除**；
- 期間一旦關閉即**不可重開**（`pre18_cycle_no_reopen_trg`）。

**變成可寫的工作流**：付款核准的 ledger／切片／懸記（自動）、期間關閉（人工）、
mark-paid／mark-failed（人工）、撥款通知（人工觸發後自動寄出）。

**仍被擋住的下游**：實際匯款（`AD-09`）、扣繳處理（稅務）、
會計呈現與發票（`AD-10`）、hold／調整／分類／懸記解決（**無入口**）。

**必要的營運監控**：見 §H。

**Rollback 限制**：見 §E。

**關掉之後會怎樣？** —— **只停止新的寫入。**
已寫入的分錄、切片、statement、payout item 全部保留且不可刪除。

---

## E. 失效與 rollback 分析

### E.1 逐題

1. **開啟一天後發現 bug，能安全回退什麼？**
   **能**：把旗標關回 OFF（立即停止新寫入）。
   **不能**：刪除已寫入的任何金額事實。
2. **已寫入的分錄是 append-only 因而不可安全刪除嗎？** **是。**
   `pre18_ledger_append_only_trg` 在 DB 層擋下 UPDATE 與 DELETE。
   另有 10 個同類 trigger 保護切片、hold allocation、payout allocation、
   statement、cycle、disposition。
3. **關掉旗標只停止未來寫入嗎？** **是。** 它是一個純讀取的條件判斷，沒有補償邏輯。
4. **錯誤分錄如何更正？** 只能新增 **reversal 分錄**（`DEC-26` §J5）。
   ⚠️ 但 `recordReversal` **目前沒有 HTTP 入口**，因此更正需要一次性的維運操作。
5. **payout items 可能已經產生嗎？** **只有在有人手動關閉期間時才會。**
   若未關閉任何期間，則不會存在。
6. **通知信可能已經寄出嗎？** **只有在有人手動 mark-paid 成功之後。**
   自動路徑（付款核准）**不寄任何信**。
7. **開啟後必須立刻監看什麼？** 見 §H。

### E.2 Rollback runbook（大綱）

```text
1. 立即：於 Render 將 SETTLEMENT_WRITE_ENABLED 設為非 "true"（或刪除）→ 重新部署
   → 新寫入即停止；既有資料不受影響。
2. 取證：node scripts/settlement-production-shadow.js --json  （唯讀）
          node scripts/settlement-write-enable-readiness.js --json （唯讀）
          GET /admin/settlement/report  → invariants / identity
3. 界定範圍：GET /admin/settlement/payout-items  → 是否已有 paid 項目
             活動日誌查 payout.marked_paid / settlement.cycle_closed
4. 若僅有 ledger 寫入、未關期間、未撥款：
   → 影響面僅為「多了不該有的應付分錄」，以 reversal 更正（需維運操作）。
5. 若已關閉期間：
   → 期間不可重開；差異依 DEC-30 §N5 走「下一期間」或顯式可稽核例外路徑。
6. 若已 mark-paid：
   → 錢已離開平台。此時屬 DEC-21 範疇（追償／調整），且受 AD-12 法律限制。
7. 全程不得直接對 production 下 DELETE —— trigger 會擋，且那會破壞稽核鏈。
```

---

## F. 安全開啟的最低條件

### F.1 技術條件（**目前已全部滿足**）

| 條件 | 狀態 | 證據 |
| --- | --- | --- |
| readiness = READY | ✅ | Owner-reported production 執行 |
| invariant 違反 = 0 | ✅ | 14 項檢查 |
| 無不明差異 | ✅ | shadow `NO_UNEXPLAINED_DIFFERENCE` |
| API gating 已證明 | ✅ | production 寫入探測回 409 |
| 稽核原子性已證明 | ✅ | rollback 測試：無孤兒事件 |
| production 備份為最新 | ⚠️ **需確認** | 上次為 665c406 部署前 |
| 監控就緒 | ⚠️ **需建立** | 見 §H，目前無自動監控 |

### F.2 營運條件（**尚未滿足**）

| 條件 | 狀態 |
| --- | --- |
| Owner 明示接受累積創作者應付 | ❌ **本決定本身** |
| 有審查待撥款項目的人工流程 | ⚠️ 端點存在，流程未定義 |
| 指定負責的操作者 | ❌ 未指定 |
| 撥款期限監控 | ❌ 無（`payout_due_at` 已持久化但無提醒） |
| 付不出款時的升級路徑 | ❌ 未定義 |

### F.3 外部條件 —— 按時點分類（**已對現行程式碼重新查證**）

| 外部項目 | 第一筆結算寫入前必要？ | 第一次撥款前必要？ | Launch 揭露／會計完成前必要？ |
| --- | --- | --- | --- |
| **`AD-09`** | ❌ 否 | ✅ **是** | ✅ 是 |
| **稅務／扣繳** | ❌ 否 | ✅ **是** | ✅ 是 |
| **`AD-10`／`PRE-03`** | ❌ 否 | ⚠️ 技術上否 | ✅ **是** |
| **`O19`** | ❌ 否 | ❌ 否（懸記為 0 時） | ⚠️ 出現懸記時 |

---

## G. 是否存在更安全的分階段做法

**現行架構只有一個布林旗標，沒有任何分階段模式。** 逐項查證：

| 候選 | 是否支援 |
| --- | --- |
| 指定日期後才啟用 | ❌ **不存在**，需新增程式碼 |
| 只對新訂單啟用 | ❌ **不存在**（判斷發生在核准當下，天然只影響其後的核准，但**這不是可設定的範圍控制**） |
| 啟用但禁止期間關閉 | ❌ **沒有獨立開關** —— 同一個旗標同時控制兩者 |
| 啟用 ledger 但停用撥款寫入 | ❌ **沒有獨立開關**（見下方說明） |
| 創作者白名單 | ❌ **不存在** |
| Dry-run | ✅ **已存在且現在就可用** —— `GET .../cycles/:id/preview` 與 shadow 腳本，皆唯讀 |

> ⚠️ **一個重要但脆弱的事實**：期間關閉與 mark-paid 都是**人工端點**，
> 因此「只累積 ledger、先不撥款」在**操作上**做得到 —— 只要沒有人呼叫那兩個端點。
> **但這是紀律，不是強制** —— 旗標一旦開啟，任何具 admin 權限者都可以關閉期間。
> **系統不會阻止。** 若需要強制，必須新增控制項（本輪未實作）。

---

## H. 開啟後的監控計畫

### 第 1 小時
- `GET /admin/settlement/report` → `invariants.violations` 必須為 **0**、`identity.ok` 必須為 **true**
- `GET /admin/settlement/reconciliation` → suspense 是否非預期增加
- 應用程式錯誤日誌：是否出現 `MATERIAL_PRICE_NOT_INTEGER`、invariant 違反、交易回滾
- 隨機抽一筆新核准訂單，核對 ledger 金額與訂單金額

### 第 24 小時
- ledger 列數成長是否與已核准訂單數一致
- **重複 earning 檢查**：`settlement-production-shadow.js --json` → `duplicateEarningCandidates` 必須為 **0**
- 懸記筆數：非 0 即代表出現未歸屬品項，需人工處置
- hold 筆數：**應恆為 0**（無寫入入口）；非 0 即為異常
- `activity_logs` 是否有 `creator_ledger.earnings_recorded` 且數量相符
- readiness verdict 是否仍為 `READY`

### 第一次期間關閉
- 先跑 `preview`，與實際 close 結果逐筆比對
- `payout_items` 數量與金額是否符合 preview
- 每筆 statement 的 `ageing_cycles_before/after` 是否合理
- **不要**在此時 mark-paid（除非 `AD-09` 與稅務已解除）

### 立即關閉旗標的停止條件
1. 任一 invariant 違反；
2. 報表恆等式 `identity.ok === false`；
3. 出現重複 earning 候選；
4. shadow 出現 `STOP_UNEXPLAINED_DIFFERENCE`；
5. ledger 列數與已核准訂單數持續不符；
6. 出現任何無法解釋的 hold 或調整（兩者本應無入口）；
7. 付款核准流程出現新的交易失敗。

---

## I. Owner 比較表（**不評分、不排序**）

| 準則 | 維持 OFF | 現在開啟 |
| --- | --- | --- |
| 技術風險 | 極低 —— 無新寫入 | 低 —— 引擎已驗證，但首次接觸真實資料 |
| 財務義務風險 | **無新增義務** | **開始累積尚無法清償的應付** |
| 對帳負擔 | **日後需一次性補記所有已付訂單**（入口尚未實作） | 即時物化，無 backlog |
| 撥款營運風險 | 無 | 期限（次月 15 日）開始計時，但可能付不出款 |
| 外部相依曝險 | 不增加 | 若答案改動金額語意，已寫入資料需沖正 |
| 可逆性 | 完全可逆 | **僅未來可逆** —— 已寫入者不可刪除 |
| 監控負擔 | 無 | 需 §H 的持續監控 |
| Launch 影響 | Gate 2 維持 pending | Gate 2 通過；Gate 3／4 仍被外部擋住 |

---

## J. 2026-09-29 追加查證（Phase 2–8）

### K.1 production 讀取管道 —— **本 session 全部不可用**

| 管道 | 狀態 |
| --- | --- |
| `DATABASE_URL`（production DB） | **NOT SET** |
| `PRIVATE_FILE_STORAGE_S3_*` | **NOT SET** |
| production Admin API | **HTTP 401** —— 本 session 無 production admin 憑證 |
| `TEST_ADMIN_*` | 已設定，但**僅適用 `teaching_platform_security_test`**，非 production |

⚠️ **因此 §C 的曝險數字仍為未量化，本輪亦未取得。不估算。**

> **一項自我更正**：production `/admin/settlement/*` 回 **401** 曾被我視為
> 「settlement router 已部署」的證據。**該推論不成立** ——
> `/admin/settlement/definitely-not-a-route` 同樣回 401，因為
> `requireAuth` 在路由比對**之前**執行。401 只證明 `/admin` 掛載存在，
> 而那早於 Batch 3。**已撤回該推論。**

### K.2 production 程式碼是否為最新 —— **是**（可由 git 證明）

production 部署 commit 為 `665c406`。其後至 HEAD 的每一個 commit
（`f11976e`／`73f08e2`／`d7d1d72`／`d41c665`／`92a9b3e`）
**非 `docs/` 檔案變更數皆為 0**，累計亦為 **0**。

**因此 production 執行的程式碼與 HEAD 在功能上等效** ——
§A 的行為敘述適用於現行 production，不需重新部署。

### K.3 路由可達性 —— 於 HEAD `92a9b3e` **重新查證**（未沿用前次結論）

| 函式 | 有 HTTP 路由？ | 其他 production 呼叫端 |
| --- | --- | --- |
| `closeCycle` | **是**（1） | — |
| `markPaid` | **是**（1） | — |
| `markFailed` | **是**（1） | — |
| `recordDisposition` | **是**（1，**不受旗標約束**） | — |
| `recordOrderEarnings` | 否 | `settlementIntegration`（付款核准，受旗標約束） |
| `recordSuspense` | 否 | 同上 |
| `openHold` / `releaseHold` | **否** | **無** |
| `recordAdjustment` / `recordReversal` | **否** | **無** |
| `resolveSuspense` / `correctClassification` | **否** | **無** |
| `recordLegacyOpening` | **否** | 僅被 `resolveSuspense` 內部呼叫（該函式本身不可達） |

**結論不變且已重新驗證**：六類寫入**即使旗標開啟也做不到**。

### K.4 歷史 vs 未來寫入行為（Phase 4 逐題）

1. **開啟旗標會自動物化所有既有已付訂單嗎？** **不會。**
2. **自動物化只發生在啟用後的新付款核准嗎？** **是** ——
   唯一的自動寫入點是 `onOrderPaymentApproved`，只在 Admin 核准付款憑證時執行。
3. **哪些歷史訂單成為對帳 backlog？** 啟用時點之前**所有**已核准＋已付款的訂單。
4. **目前有建立 legacy opening 對帳分錄的 HTTP 路由嗎？** **沒有。**
5. **那有什麼已核准的路徑？** 服務層的 `recordLegacyOpening` 已實作並測試，
   但**唯一呼叫端是同樣不可達的 `resolveSuspense`**。
   實務上需要**新增路由或一次性維運腳本**（本輪未實作）。
6. **只是把旗標打開，既有訂單會立刻產生創作者應付嗎？** **不會。**
7. **未來的義務何時出現？** 啟用後的**第一筆付款核准**當下。
8. **啟用後 Admin 能立刻關閉期間嗎？** **能** —— 端點即時可用，系統不作額外檢查。
9. **能立刻產生 payout items 嗎？** **能**，但只透過關閉期間產生。
10. **能立刻 mark-paid 嗎？** **能** —— 只需一個 transfer reference 字串。
    ⚠️ 系統**不會**檢查 Gate 3、不會檢查是否真的匯了款。
11. **哪些寫入類別因無路由而仍不可能？** 見 §J.3 的六類。

### K.5 立即／歷史／未來義務（Phase 5）

**A. 開啟當下立即產生的義務 ＝ NT$0。**
理由：唯一的自動寫入點是付款核准；**啟用動作本身不觸發任何回溯處理**。
在下一筆付款核准發生之前，ledger 維持空的。

**B. 歷史 backlog** —— 金額**未量化**（無 production 存取）。
- **旗標維持 OFF 時該 backlog 依然存在**，且**隨每筆新的已付訂單持續增長**；
- 差別只在於：OFF 時它**全部**是 backlog；ON 之後**新訂單不再累積 backlog**，
  但既有部分仍需一次性對帳，**而該對帳路徑目前無入口**。

**C. 未來義務** —— 啟用後第一筆付款核准即：
earning 分錄與切片於**同一 transaction** 寫入並自此不可變；
切片於下一個**已關閉**期間的 cutoff 起開始 ageing；
於首次成為 eligible 的期間關閉時取得永久的期間歸屬；
達 NT$300／六期 override／終止 override 時成為應撥付，
期限為**次月 15 日**（`payout_cycles.payout_due_at`，已持久化）。

**D. 無法清償的義務風險**
- **`AD-09` 未決** → 系統中**沒有**收款資料欄位，因此**匯不出款**；應付持續累積。
- **稅務未決** → 即使能匯款，`payout_items.amount` 的 gross／net 語意未定
  （決定包 §A 與會計師包 §2.2 Q8）。
- **應付能否持續累積？** **能，且完全可稽核**（append-only ＋ 14 項 invariant）。
- **有撥款期限監控嗎？** **沒有。** 全 repo 搜尋 `payout_due_at`，
  **唯一非查詢用途的讀取點是創作者 statements 端點** —— 無排程、無告警、無提醒。
- **逾期未付會被技術阻止嗎？** **不會。** 期限已持久化，但**僅為可觀察事實**，
  系統不會因此阻擋任何動作，也不會主動通知任何人。

### K.6 分階段控制 —— **重新查證，結論不變**

全系統**只有一個** settlement 相關開關。逐項確認**皆不存在**：
指定日期後啟用、僅新訂單、創作者白名單、獨立的累積旗標、
獨立的期間關閉旗標、獨立的撥款旗標、Admin 權限細分、功能別寫入閘門。

**唯一真正存在的分階段能力是 dry-run**（`preview` 端點 ＋ shadow 腳本），
且**現在、旗標 OFF 的狀態下就可用**。

| | 技術強制 | 操作紀律 |
| --- | --- | --- |
| 旗標 OFF 時不得寫入 | ✅ **是** | — |
| 「旗標 ON 但不關閉期間」 | ❌ **否** | ⚠️ **是** —— 任何 admin 皆可關閉，系統不阻止 |
| 「Gate 3 前不 mark-paid」 | ❌ **否** | ⚠️ **是** —— 系統不檢查 Gate 3 |

### K.7 營運控制盤點（Phase 6 摘要）

依**文件／流程證據**（非程式碼能力）判定：
**READY 1 項、PARTIAL 11 項、MISSING 8 項。**

**MISSING 的 8 項**：主要撥款操作者、備援操作者、事故負責人、
首 24 小時監控負責人、撥款期限行事曆、**撥款到期提醒／告警**、
每日／每週例外審查、對帳審查流程的既有定義。

完整盤點與所有 runbook／檢查表見
`docs/pre-18-settlement-operating-controls-2026-09-29.md`。

---

## K. Gate 2 子閘門（**不得合併成單一 READY**）

| 子閘門 | 狀態 | 判準與現況 |
| --- | --- | --- |
| **G2-T 技術** | ✅ **PASS** | readiness `READY`、invariant 0 違反、shadow 無不明差異、寫入探測 409、稽核原子性已測 |
| **G2-D 曝險已掌握** | ❌ **FAIL** | **production 曝險未量測** —— 本 session 無任何 production 讀取管道。決定所需的金額與筆數目前**皆為未知** |
| **G2-O 營運控制** | ❌ **FAIL** | 8 項 MISSING（含**無撥款期限告警**、**無指定操作者**）、11 項 PARTIAL |
| **G2-E 外部後果認知** | ⏸ **待 Owner 明示** | **不要求** `AD-09`／稅務先解決，但要求 Owner **明示認知**：應付可能在能夠撥款之前就開始累積 |
| **G2-OWNER** | ⏸ **PENDING** | 待 Owner 明示選擇 KEEP OFF 或 ENABLE |

> **G2-D 與 G2-O 目前為 FAIL 是事實陳述，不是建議。**
> 兩者都可以在**不開啟旗標**的情況下補齊：
> G2-D 只需執行兩支唯讀指令；G2-O 只需指派人員並採用 §J.7 的控制包。

## L. 決定記錄範本（**待填，本文件不代填**）

```text
GATE 2 OWNER DECISION —— SETTLEMENT_WRITE_ENABLED

Decision:
  [ ] KEEP SETTLEMENT_WRITE_ENABLED OFF
  [ ] ENABLE SETTLEMENT_WRITE_ENABLED

Effective date/time:        ____________________
Scope:                      ____________________

Reason:                     ____________________

Measured production exposure at decision time:
  approved + paid orders:   ____________________
  expected earning entries: ____________________
  expected creator earnings:____________________
  eligible payable:         ____________________
  >= NT$300 / below:        ____________________ / ____________________
  earliest payout due date: ____________________
  (source: settlement-production-shadow.js --json  +  cycles/<YYYY-MM>/preview)

Known unresolved items:
  AD-09 (收款資料):          ____________________
  tax / withholding:        ____________________
  AD-10 / PRE-03 (定性):     ____________________
  O19 (懸記終局處置):        ____________________

Accepted operational risk:  ____________________

Primary operator:           ____________________
Backup operator:            ____________________
Monitoring owner:           ____________________

Emergency-disable trigger:  ____________________   （見控制包 §8）
First review date:          ____________________

Payout execution permitted?   [ ] YES   [ ] NO
  If NO — reason / blocking gate: ____________________

簽署：__________________    日期：__________
```

> 若決定為 **ENABLE**，依 `DEC-24` 的先例，這應成為一筆**明示的 Owner Decision**
> 並記入 tracker 的決定登記簿。**本輪不預先建立 ID。**
