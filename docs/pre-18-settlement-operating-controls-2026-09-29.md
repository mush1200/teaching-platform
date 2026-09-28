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

## 1A. 六個角色的職責與交接（**姓名由 Owner 於 clearance 文件 §3 指派，本文件不代填**）

> **2026-09-29 Owner 指派完成。營運人力為【兩位真實人員】** ——
> Primary 為 Owner 本人，**Backup 為 Owner 的事業夥伴（真實的第二人）**。
> **Backup 不是「同一人兜底」**，而是在 Primary 不可用時可實際接手的另一個人。

| 角色 | **指派** | 職責 | 交接期望 |
| --- | --- | --- | --- |
| **Primary settlement operator** | **Owner** | 執行期間關閉前的 preview 比對；維護撥款期限日曆；每週檢視 pending payout items；對帳 disposition | 不可用時**必須**明示移交給 Backup，並轉移日曆事項 |
| **Backup settlement operator** | **Owner 的事業夥伴** | Primary 不可用期間承接其全部職責 | 需具備履行職責所需的 Admin 權限與文件存取（見 §1B） |
| **Settlement incident owner** | **Owner** | 判定是否觸發 §8 的停止條件；決定是否緊急停用旗標；主導事故取證與記錄 | 需能在營業時間內被聯繫到 |
| **First-24-hour monitoring owner** | **Owner** | 旗標啟用後首 24 小時執行 §3／§4 檢查表並記錄結果 | 僅限啟用後首 24 小時；之後併入 Primary 的每週檢視 |
| **First-cycle-close approver** | **Owner 的事業夥伴**（2026-09-29 改指派） | 第一次期間關閉前**明示核准**；確認 Gate 3 狀態與撥款期限提醒已建立 | 見下方 ⚠️ |
| **Emergency-disable authority** | **Owner** | 有權在無需額外核可下立即把 `SETTLEMENT_WRITE_ENABLED` 關回 OFF | **必須**有 Render dashboard 存取權 |

> 🔒 **2026-09-29 更新：重疊已由 Owner 解除。**
>
> 先前 Primary operator 與 First-cycle-close approver 同為 Owner。
> **Owner 已將 approver 改指派給事業夥伴**，因此第一次真實的期間關閉
> 採**真人雙人覆核**：執行為 Owner，核准為夥伴，兩者在 `activity_logs`
> 以不同 `actor_id` 留痕。
>
> ⚠️ **這是 Owner 的營運選擇** —— 查證結果仍為**沒有任何規則要求兩者分離**（見 §1A.1）。
> ✅ **前置條件已於 2026-09-29 滿足**：夥伴已擁有自有 admin 帳號並完成 onboarding
> （clearance §3.2，11 項全數完成 → `OPERATIONALLY READY`）。

### 1A.1 既有規則查證 —— 是否有任何規則**要求**這兩個角色由不同人擔任？

**沒有。** 逐項查證結果：

| 來源 | 內容 | 是否要求分離 |
| --- | --- | --- |
| `DEC-20`～`DEC-39` | 全部與角色分工無關 | ❌ 否 |
| `mvp_rules.md` §「發布法律文件」六條硬規則第 1 條 | 「**維持 single-admin authority —— 不採雙人覆核**」 | ❌ 否 —— 且方向**相反** |
| `pre-18-settlement-operating-controls`（本文件） | 「approver 與執行者不應為同一人」 | ⚠️ **工程端建議**（commit `7d98c75`），非政策 |

> ⚠️ **兩點必須分清楚，否則會誤用上表第二列：**
>
> 1. **該條的適用範圍是「發布法律文件」，不是結算。**
>    **不得**因為它存在就推論結算也適用 single-admin authority ——
>    那是把一條有明確脈絡的規則外推到它沒有涵蓋的領域。
> 2. **該條所載的理由已因事實變動而不再成立。**
>    原文理由是「admin 僅由維運 CLI 建立，**可能只有一位**」。
>    **Owner 於 2026-09-29 告知營運人力為兩位真實人員**，
>    因此「可能只有一位」這個前提對結算而言已不成立。
>
> **本文件不變更該規則，也不將其外推至結算。** 僅據實記錄：
> 該條的**理由**已與現況不一致，其**適用範圍**仍限於法律文件發布。

## 1B. Backup operator 的就緒要求

**狀態：✅ `OPERATIONALLY READY`（Owner 於 2026-09-29 具結，clearance §3.2）**

> ⚠️ **已指名 ≠ 已就緒** —— 本節的 11 項已全數完成，故狀態才由
> `ASSIGNED / NOT YET OPERATIONALLY READY` 轉為 `OPERATIONALLY READY`。
>
> ⚠️ **兩項限制在就緒後仍然成立：**
> 1. 「存取限縮於結算功能」一項**技術上不受支援**，為**已接受的限制 ＋ 補償控制**
>    （clearance §3.3）—— 夥伴的帳號可存取**全部 72 個 admin endpoint**；
> 2. 閱讀確認與未共用密碼等項目為 **Owner／夥伴的具結**，**非機械驗證** ——
>    任何系統都證明不了人是否讀過文件。

| # | 項目 | 完成 |
| --- | --- | --- |
| 1 | 已取得符合角色所需的授權存取（Admin 帳號） | [ ] |
| 2 | 存取範圍**限縮於**結算／Admin 必要功能，非全權 | [ ] |
| 3 | 已閱讀本結算營運 runbook（§2–§8） | [ ] |
| 4 | 已閱讀緊急停用程序（§7） | [ ] |
| 5 | 已閱讀期間關閉檢查表（§5） | [ ] |
| 6 | 已閱讀撥款凍結規則（§6） | [ ] |
| 7 | 已閱讀事故升級程序（§8） | [ ] |
| 8 | 已理解憑證處理規則 | [ ] |
| 9 | **未共用任何密碼**（Backup 使用自己的帳號） | [ ] |
| 10 | **未將任何 production secret 複製進文件或訊息** | [ ] |

> 第 9、10 項不是形式要求：平台目前唯一的 Admin 帳號由 `create-admin` CLI 建立，
> 若以共用密碼讓第二人使用，`activity_logs` 的 `actor_id` 將**無法分辨是誰做的**，
> 而那正是本系統全部稽核能力的基礎。

## 1B.1 Backup 的存取模型 —— **權限無法細分**（以程式碼查證）

`Backend/middlewares/auth.js` 的 `requireRole(role)` 只做**單一字串相等比對**
（`userRole !== requiredRole` → 403）。**全系統沒有 permission、沒有 scope、
沒有任何 endpoint 層級的授權維度。**

| Backup 實際需要 | 現行機制能否單獨授予 |
| --- | --- |
| 身分驗證（自己的帳號） | ✅ 可 —— `create-admin` CLI 可建立第二個帳號 |
| Admin 角色 | ✅ 可 |
| 結算**唯讀**存取 | ❌ **不可單獨授予** |
| cycle preview 存取 | ❌ 不可單獨授予 |
| **cycle close 存取** | ❌ 不可單獨授予 |
| **mark-paid 存取** | ❌ 不可單獨授予 |
| 緊急停用權限 | ❌ **不在應用程式內** —— 屬 Render dashboard 存取，與 Admin 角色無關 |
| production secret 存取 | ❌ 不在應用程式內 |

### ⚠️ 已記錄的營運限制（本輪不修改 RBAC）

**給 Backup 一個 admin 帳號，就等於給了全部 72 個 admin 端點**
（`admin.js` 39 ＋ `adminSettlement.js` 16 ＋ activity-logs 6 ＋ legal-documents 6 ＋
privacy-requests 5），**其中包含 4 個結算寫入端點（close／mark-paid／mark-failed／
dispositions）**。

**因此「Backup 的存取限縮於結算必要功能」在目前架構下無法以技術達成** ——
它只能是**營運紀律**（§1C 的禁令清單 ＋ `activity_logs` 的事後可稽核性）。

> 這是**已知限制的如實記錄，不是缺陷報告**：MVP 從未要求細粒度 RBAC。
> 若日後需要技術強制，那是一項獨立的授權模型工作，**不在本輪範圍**。
>
> ✅ **可稽核性不受影響** —— Backup 使用**自己的帳號**（§1B 第 9 項），
> 因此 `activity_logs.actor_id` 仍能分辨每一個動作是誰做的。
> **這正是「不得共用密碼」之所以是硬性要求的原因。**

## 1C. 交接規則（Primary 不可用時）

1. **Backup 得執行**已核准的營運結算職責（§1A 所列 Primary 職責）；
2. **Backup 必須遵循與 Primary 完全相同的 runbook**，無簡化版本；
3. **Gate 3 的撥款凍結規則同樣適用** —— Gate 3 仍為 BLOCKED 時，
   **不得執行任何真實撥款**；
4. **不得**在適用的撥款閘門尚未通過時執行 `mark-paid`；
5. **緊急停用**僅得依 §7 的書面程序為之，不得臨場自創步驟；
6. 交接與交還**都必須**留下紀錄（日期、範圍、期間內執行過的動作）。

### 1C.1 Backup 在代理期間**得**做什麼

- 檢視結算狀態（全部唯讀端點）；
- 執行已核准的唯讀驗證指令（shadow／readiness）；
- **在授權且閘門條件允許時**依 §5 執行期間關閉程序；
- **在授權時**依 §7 啟動緊急停用程序；
- 執行角色範圍內已核准的 Admin 動作。

### 1C.2 Backup **不得**做什麼（硬性禁令）

1. **不得**繞過 Gate 3 的撥款凍結；
2. **不得**共用憑證；
3. **不得**使用 Owner 的帳號；
4. **不得**修改歷史 ledger 事實；
5. **不得**刪除任何不可變紀錄；
6. **不得**自創稅務或銀行處理方式；
7. **Gate 3 仍為 BLOCKED 時不得執行撥款。**

> ⚠️ 第 1 與第 7 項**沒有技術強制** —— 系統不檢查 Gate 3（見 §6）。
> 它們之所以能被稽核，靠的是 `activity_logs.actor_id` 分辨得出是誰做的，
> 而那又取決於 §1B 第 9 項（不共用密碼）。**三者是同一條鏈。**

### 1C.3 交接的記錄方式

| 項目 | 做法 |
| --- | --- |
| 交接啟動 | 記錄日期、預計期間、移交範圍、日曆事項是否已轉移 |
| 事故責任暫時移轉 | 期間內 incident owner 由 Backup 暫代；**須明示記載起訖** |
| 交還後通知 Owner | 列出期間內執行過的每一個寫入動作（可由 `activity_logs` 依 `actor_id` 匯出） |
| 未完成事項 | 明列未決事項與其狀態，**不得**以「沒事」交還 |

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

## 6. 撥款凍結規則（Gate 3 PASS 之前）—— 🔒 **Owner 已於 2026-09-29 採用**

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

| 事故 | 立即圍堵 | 需停用旗標？ | 不得刪除 | 應保全的證據 | 升級對象 | 已核准的更正機制 |
| --- | --- | --- | --- | --- | --- | --- |
| **invariant 違反** | 停止一切 Admin 寫入動作 | ✅ **是** | 任何 ledger／切片／allocation | `report` 的 `invariants.keys`、shadow `--json` | Incident owner | **無自動機制** —— 依 key 個案分析後以 reversal 更正（**需一次性維運操作，無 HTTP 路由**） |
| **重複 earning** | 同上 | ✅ **是** | 兩筆分錄都不得刪 | 兩筆 `creator_ledger_entries` 的 id ＋ `cle_one_earning_per_order_creator` 狀態 | Incident owner | reversal（**需維運操作**）。⚠️ 此情況理論上被 partial unique index 擋住，發生即代表更深層問題 |
| **錯誤的 ledger 分錄** | 記錄分錄 id | ⚠️ 視範圍 | 原分錄 | 分錄全欄位 ＋ 產生它的 `activity_logs` | Incident owner | **僅 reversal 分錄**（`DEC-26` §J5）。`recordReversal` **無 HTTP 路由** → **一次性維運腳本** |
| **錯誤的創作者歸屬** | 暫停該創作者的期間關閉 | ⚠️ 視範圍 | 原分錄與切片 | 訂單、品項、`seller_id` 歷程 | Incident owner | `DEC-36` 的明示可稽核對帳；**不得臆造歸屬**。`resolveSuspense` **無 HTTP 路由** |
| **誤關閉期間** | 停止後續動作 | ⚠️ 視情況 | statement、cycle 列 | `settlement.cycle_closed` 事件 ＋ statements | Incident owner ＋ First-cycle approver | **期間不可重開**（trigger）。差異依 `DEC-30` §N5 走**下一期間**或顯式可稽核例外 |
| **誤產生 payout item** | 立即標記 | ✅ **是**（防擴大） | payout item 列 | item 全欄位 ＋ 產生它的 cycle | Incident owner | `POST .../payout-items/:id/mark-failed` ＋ 理由（**此路由存在且可用**） |
| **誤 mark-paid** | 立即停止所有撥款 | ✅ **是** | payout item、allocation、`payout_consumption` 分錄 | 全部上述 ＋ `payout.marked_paid` 事件 ＋ `bank_reference` | **Owner**（非僅 incident owner） | ⚠️ **錢可能已離開平台** → 進入 `DEC-21` 範疇；法律可執行性受 `AD-12` 未決限制。**系統層無回復機制** |
| **通知失敗** | 無 | ❌ **否** | — | `order_email_failed` 事件 | Primary operator | 設計上不回滾撥款；可人工重寄（`sendPayoutPaidEmail` 為 idempotent 對 `notified_at`） |
| **非預期 suspense** | 無 | ❌ **否** | 懸記列 | 懸記列 ＋ 來源品項 | Primary operator | 正常流程 —— 走 disposition（`POST .../reconciliation/dispositions`，**路由存在**） |
| **錯過撥款期限** | 記錄事實 | ❌ **否** | — | 該 cycle 的 `payout_due_at` ＋ pending item | **Owner** | **無技術機制** —— 逾期為可觀察事實。若因 Gate 3 未通過而無法支付，**必須明示記錄，不得靜默略過**（§5 第 6 點） |

### 8.1 所有事故的共同禁令

1. **不得**對 production 直接下 `DELETE` 或 `UPDATE` 修補金額 ——
   11 個 trigger 會擋，而且那會破壞稽核鏈；
2. **不得**為了讓報表相符而調整數字；
3. **不得**在取證之前變更任何設定（旗標除外）；
4. 四類更正（reversal／legacy opening／hold／歸屬對帳）**目前皆無 HTTP 路由** ——
   一律需要**一次性維運操作**，且該操作本身必須留下紀錄。
