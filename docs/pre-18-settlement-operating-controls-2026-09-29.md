# `PRE-18` 結算啟用 —— 最低營運控制包

> **本文件不啟用任何東西，也不作 Gate 2 決定。**
> 它是「**若** Owner 決定開啟 `SETTLEMENT_WRITE_ENABLED`，之前必須先存在哪些控制」的清單，
> 以及開啟後要做什麼、出事時要做什麼。
>
> 本輪**未變更任何 settlement 程式碼**。所有技術敘述皆以 HEAD 的程式碼查證。

建立於 2026-09-29。搭配 `docs/pre-18-gate2-owner-decision-package-2026-09-29.md`。

---

## 0. 適用前提

| 事實 | 值 |
| --- | --- |
| production 部署 commit | `665c406` |
| production 程式碼是否與 HEAD 等效 | **是** —— `665c406..HEAD` 的非 `docs/` 檔案變更數為 **0** |
| `SETTLEMENT_WRITE_ENABLED` | **OFF** |
| production 寫入探測 | **409 `settlement_writes_disabled`**（Owner-reported） |

---

## 1. 營運控制盤點（依**文件／流程證據**判定，不看程式碼是否做得到）

> ⚠️ 判準刻意嚴格：**程式碼支援 ≠ 控制存在**。
> 一個沒有人負責、沒有文件、沒有提醒的能力，在事故當下等於不存在。

### A. 人員／責任

| 控制 | 狀態 | 依據 |
| --- | --- | --- |
| 指定的主要撥款操作者 | ❌ **MISSING** | repo 無任何文件指名 |
| 備援撥款操作者 | ❌ **MISSING** | 同上 |
| 結算事故負責人 | ❌ **MISSING** | 同上 |
| 開啟後首 24 小時監控負責人 | ❌ **MISSING** | 同上 |

### B. 例行作業

| 控制 | 狀態 | 依據 |
| --- | --- | --- |
| 撥款審查檢查表 | ⚠️ **PARTIAL** | 本文件 §4 提供；尚未指派執行者 |
| 期間關閉檢查表 | ⚠️ **PARTIAL** | 本文件 §5 提供；尚未指派執行者 |
| 撥款期限行事曆 | ❌ **MISSING** | `payout_due_at` 已持久化，但**無任何消費端** |
| 撥款到期提醒／告警 | ❌ **MISSING** | 全 repo 搜尋 `payout_due_at`，**唯一非查詢用途的讀取點是創作者 statements 端點**；無排程、無通知 |
| 首次期間關閉需人工核准的規則 | ⚠️ **PARTIAL** | 本文件 §5 定義；**無技術強制** |
| 對帳審查流程 | ⚠️ **PARTIAL** | disposition 端點存在；流程未定義 |
| 每日／每週例外審查 | ❌ **MISSING** | 無 |

### C. 事故／回退

| 控制 | 狀態 | 依據 |
| --- | --- | --- |
| 緊急關閉旗標程序 | ⚠️ **PARTIAL** | 決定包 §E.2 有大綱；本文件 §7 補完 |
| invariant 違反事故程序 | ⚠️ **PARTIAL** | 本文件 §8 |
| 重複 earning 應對程序 | ⚠️ **PARTIAL** | 本文件 §8 |
| 錯誤分錄更正程序 | ⚠️ **PARTIAL** | 僅能 reversal，**且無 HTTP 入口** —— 需維運操作 |
| 誤關期間應對程序 | ⚠️ **PARTIAL** | 期間**不可重開**；只能走下一期間或顯式例外 |
| 誤產生 payout item 應對程序 | ⚠️ **PARTIAL** | 可 `mark-failed`；本文件 §8 |
| 誤 mark-paid 應對程序 | ⚠️ **PARTIAL** | **錢已離開平台** → `DEC-21` ＋ `AD-12` |
| 通知失敗應對程序 | ✅ **READY** | 設計上失敗不回滾；`order_email_failed` 已留痕 |

### D. 外部閘門控制

| 控制 | 狀態 | 依據 |
| --- | --- | --- |
| 禁止在 Gate 3 PASS 前執行撥款的明文規則 | ⚠️ **PARTIAL** | 本文件 §6 定義為**營運規則**；**無技術強制** |
| 扣繳未定案時禁止具稅務敏感性的撥款 | ⚠️ **PARTIAL** | 同上 |
| 無已驗證收款資料不得匯款 | ⚠️ **PARTIAL** | 同上；且**系統中根本沒有收款資料欄位**（`AD-09` 未決），故實務上匯不出款 |

**小結：READY 1 項、PARTIAL 11 項、MISSING 8 項。**

---

## 2. 啟用 runbook

### 2.1 前置條件（**全部必須成立**）

1. Gate 2 的 Owner 決定已明示作成並記錄；
2. production 備份為**當日**（`pg_dump`，見 `db-backup-and-migration.md`）；
3. `node scripts/settlement-write-enable-readiness.js --json` 對 production 回 **`READY`**；
4. `node scripts/settlement-production-shadow.js --json` 回 **`NO_UNEXPLAINED_DIFFERENCE`**；
5. 已指定 §1.A 的四個角色；
6. 已同意 §6 的撥款凍結規則。

### 2.2 變更動作

```text
Render → teaching-platform-backend → Environment
  新增：SETTLEMENT_WRITE_ENABLED = true
  （只有字面 "true" 生效；1 / yes / TRUE 以外的大小寫皆可，前後空白會被去除）
Manual Deploy（auto-deploy 為 off）
```

⚠️ **不要**同時變更任何其他環境變數。旗標之外的變更會讓事故歸因變得不可能。

### 2.3 啟用後立即驗證（10 分鐘內）

```bash
curl -s .../health                                   # 200 {"status":"ok"}
GET /admin/settlement/cycles                          # writesEnabled: true
GET /admin/settlement/report                          # invariants.violations = 0, identity.ok = true
node scripts/settlement-production-shadow.js --json    # overall = NO_UNEXPLAINED_DIFFERENCE
```

⚠️ **啟用本身不會產生任何分錄。** 第一筆分錄要等到**下一次付款核准**才出現（見 §3）。

---

## 3. 第一小時監控

| 檢查 | 期望 | 取得方式 |
| --- | --- | --- |
| 新 ledger 列 | 只在有新的付款核准時才增加 | `GET /admin/settlement/report` |
| payable slices | 與 ledger 同步增加 | 同上 |
| 重複 earning | **0** | shadow `--json` → `duplicateEarningCandidates` |
| invariant 報表 | **0 違反** | `GET /admin/settlement/report` |
| suspense | 只在出現 `seller_id IS NULL` 品項時增加 | `GET /admin/settlement/suspense` |
| **非預期的 payout item** | **0** —— 除非有人手動關閉期間 | `GET /admin/settlement/payout-items` |
| 活動日誌 | 出現 `creator_ledger.earnings_recorded` | `GET /admin/activity-logs` |
| 應用程式錯誤 | 無交易回滾、無 invariant 例外 | Render logs |

**首筆真實 earning 核對**：取一筆新核准訂單，人工驗證
`creator_net_sales`、`amount`、`platform_commission` 三者相加關係，
並與 `orders.total_amount` 對照。

---

## 4. 第一個 24 小時監控

- **所有**付款核准是否都產生了對應分錄（筆數相符）；
- ledger 總額與訂單金額對帳（`GET /admin/settlement/report` 的 `identity.ok`）；
- 創作者收益總額是否與 shadow 預期一致；
- **hold 筆數應恆為 0** —— 目前無寫入入口，非 0 即為異常；
- **負向調整應恆為 0** —— 同上；
- 重跑 readiness，verdict 應仍為 `READY`；
- 錯誤日誌；
- 通知失敗（`order_email_failed`）—— 此階段**不應有任何撥款通知**；
- **非預期的 Admin 寫入**：`settlement.cycle_closed`、`payout.marked_paid`
  在此階段**都不應出現**。

---

## 5. 第一次期間關閉檢查表

1. **先跑 preview**：`GET /admin/settlement/cycles/<YYYY-MM>/preview`；
2. 逐創作者核對 preview 的 `eligibleBalance` 與 `payoutTriggeredReason`；
3. 門檻驗證：`>= 300` 者應為 `threshold`，其餘應為 `none` 或 `six_cycle_override`；
4. ageing 驗證：`ageingCyclesBefore` / `After` 是否與該創作者的實際歷程相符；
5. **確認沒有任何未解除的外部撥款阻擋**（Gate 3 狀態）；
6. **取得 Owner／操作者的明示核准後**才呼叫 close；
7. close 之後立即比對實際 statements 與 preview —— **任何差異都必須解釋**。

⚠️ **期間一經關閉不可重開**（`pre18_cycle_no_reopen_trg`）。

---

## 6. 撥款凍結規則（Gate 3 PASS 之前）

**在 Gate 3 PASS 之前：**

1. **不得**對任何 `payout_items` 執行 `mark-paid`；
2. **不得**進行任何真實銀行匯款並宣稱已完成；
3. **不得**在 `bank_reference` 填入任何被當作匯款憑據的值。

> ⚠️ **這是營運規則，不是技術強制。**
> 旗標一旦開啟，任何具 admin 權限者都能呼叫 `mark-paid`，
> 系統**不會**檢查 Gate 3。若需要技術強制，必須新增控制項（本輪未實作）。

**Gate 3 PASS 的條件**：`AD-09`（收款資料）與稅務／扣繳皆已答覆，
且扣繳答案對 `payout_items.amount` 語意的影響已依答案處理。

---

## 7. 緊急停用程序

```text
1. Render → teaching-platform-backend → Environment
   → 刪除 SETTLEMENT_WRITE_ENABLED（或設為任何非 "true" 的值）
   → Manual Deploy
2. 確認：GET /admin/settlement/cycles → writesEnabled: false
         POST 任一寫入端點 → 409 settlement_writes_disabled
3. 立即取證（皆唯讀）：
   node scripts/settlement-production-shadow.js --json
   node scripts/settlement-write-enable-readiness.js --json
   GET /admin/settlement/report
   GET /admin/settlement/payout-items
```

**停用之後成立的事實：**

- **只停止未來的 gated 寫入**；
- **既有的不可變事實全部保留** —— ledger 分錄、切片、hold／payout allocation、
  statement、cycle、disposition 共 11 個 trigger 擋下 UPDATE 與 DELETE；
- **不得刪除任何 ledger 事實**；
- 更正**只能**經 reversal 分錄或對帳路徑 ——
  ⚠️ **且 `recordReversal` 目前沒有 HTTP 入口**，需一次性維運操作。

---

## 8. 事故升級程序

| 事故 | 立即動作 | 後續 |
| --- | --- | --- |
| invariant 違反 | **立即停用旗標**（§7） | 由 `settlementInvariants` 的 key 定位；不得直接改資料 |
| 重複 earning | 立即停用 | 檢查 `cle_one_earning_per_order_creator` 為何未擋下；此情況理論上不可能 |
| 不明經濟差異 | 立即停用 | shadow `--json` 取 `blocking` 清單；**不得**逕行調整使其相符 |
| 非預期 suspense | **不需**停用 | 屬正常（`seller_id IS NULL`）；走 disposition 流程 |
| 誤產生 payout item | 停用旗標 | `POST .../mark-failed` 並記錄理由；**不得**刪除 |
| **誤 mark-paid** | 立即停用 | **錢可能已離開平台** → 進入 `DEC-21` 範疇，且受 `AD-12` 法律限制未決 |
| 錯誤的創作者歸屬 | 視情況 | 走 `DEC-36` 的明示可稽核對帳；**不得**臆造歸屬 |
| 通知失敗 | **不需**停用 | 設計上不回滾撥款；查 `order_email_failed` |

**所有事故的共同禁令**：**不得對 production 直接下 `DELETE` 或 `UPDATE` 修補金額。**
trigger 會擋，而且那會破壞稽核鏈。
