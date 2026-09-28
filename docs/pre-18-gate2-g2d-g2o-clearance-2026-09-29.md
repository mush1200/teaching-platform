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

### 2.2 🔒 實測結果（Owner 於 2026-09-29 執行指令 A ＋ B 後提供）

**17 項全部取得實測值，無一項需要估算。**

| # | 欄位 | **實測值** | 來源 |
| --- | --- | --- | --- |
| 1 | total orders | **1** | A `census.orders_total` |
| 2 | approved orders | **1** | A `census.approved_total` |
| 3 | approved ＋ `paid_at` | **1** | A `census.approved_with_paid_at` |
| 4 | approved ＋ `paid_at` NULL | **0** | A `census.approved_without_paid_at` |
| 5 | attributable paid items | **1** | A `census.attributable_paid_items` |
| 6 | `seller_id` NULL paid items | **0** | A `census.items_without_seller` |
| 7 | expected earning entries | **1** | A `economics.totals.expectedEarningEntries` |
| 8 | expected payable slices | **0** | A `economics.totals.expectedPayableSlices` |
| 9 | total expected `creator_net_sales` | **NT$1** | A `economics.totals.creatorNetSales` |
| 10 | total expected Creator earnings | **NT$1** | A `economics.totals.creatorEarnings` |
| 11 | total expected platform commission | **NT$0** | A `economics.totals.platformCommission` |
| 12 | duplicate candidates | **0**（`[]`） | A `economics.duplicateEarningCandidates` |
| 13 | suspense candidates | **0** | A `economics.totals.suspenseCandidates` |
| 14 | unresolved dispositions | **0** | B `checks[dispositions_recorded]` ＝ `PASS` |
| 15 | invariant violations | **0**（14 項檢查全過） | B `checks[no_invariant_violations]` ＝ `PASS` |
| 16 | unexplained differences | **0**（`blocking: []`） | A `overall` ＝ `NO_UNEXPLAINED_DIFFERENCE` |
| 17 | settlement readiness verdict | **`READY`** | B `verdict` |

**結論：production 的既有創作者曝險總量為 NT$1，分布於 1 位創作者的 1 筆訂單。**

### 2.2.1 內部一致性驗證（已以 canonical 程式碼重算，非人工推論）

把這筆訂單（單一品項、小計 NT$1、無折扣）輸入
`Backend/utils/settlementMoney.js` 的 `computeOrderSettlement`，輸出與實測值**逐項相符**：

| 檢查 | 算式 | 結果 |
| --- | --- | --- |
| `creator_net_sales` | 品項淨額 ＝ 1 | **1** ＝ 欄位 9 ✅ |
| Creator 分潤（`DEC-24` 80%、`DEC-31` round-half-up） | `round_half_up(1 × 4/5)` ＝ `round_half_up(0.8)` | **1** ＝ 欄位 10 ✅ |
| 平台佣金（`DEC-31` §3 殘值法） | `1 − 1` | **0** ＝ 欄位 11 ✅ |
| `DEC-31` 恆等式 | `1 ＋ 0 ＝ 1` | **成立** ✅ |
| payable slice（`floor(1 × 4/5)` ＝ 0，`amount > 0` 過濾） | 0 個品項切片 | **0** ＝ 欄位 8 ✅ |
| 殘差切片 | `1 − 0` | **1**（`expectedResidueSlices`）✅ |
| Invariant 14（葉節點加總 ＝ 分錄金額） | `0 ＋ 1 ＝ 1` | **精確成立** ✅ |

> ⚠️ **`expectedPayableSlices ＝ 0` 與 `expectedResidueSlices ＝ 1` 不是矛盾。**
> 這正是 `DEC-31` 在極小金額下的預期行為：品項層切片用 `floor` 分配（`floor(0.8) ＝ 0`），
> 分不掉的 NT$1 全額落入**殘差切片**。兩者相加仍等於 Creator 分潤總額，恆等式未破。
>
> ⚠️ **NT$1 ＋ NT$0 的結果不是恆等式失敗。**
> 平台佣金為 0 是 `DEC-31` 殘值法在 round-half-up 之後的正確輸出，
> **不是**「20% 抽成沒有生效」。

### 2.2.2 兩項必須一併記錄的解讀限制（避免日後誤讀）

**(1) 這筆訂單沒有持久化的 `refund_window_end`。**
指令 A 同時回報 `census.approved_paid_without_refund_window ＝ 1` ——
即這唯一一筆訂單是**上線前的 legacy 訂單**，沒有退款窗口紀錄。
依 `DEC-27` §K1**禁止 backfill 歷史訂單期限**，因此它日後若要入帳，
只能循對帳流程產生 `opening` 分錄（`settlementAgeing.isEligibleAtCutoff` 對 `opening` 豁免窗口要求），
**不會**成為 `earning`。

**(2) `expectedCycleMembership`（`2026-09`、expectedPayable 1）是假設性推算，不是預測。**
`settlement-production-shadow.js:249` 由 `paid_at` **重算**窗口
（`refundWindowEndAt(order.paid_at)`），**不讀**持久化欄位。
因此該期間歸屬回答的是「若窗口存在會落在哪一期」，
**不是**「開啟旗標後這筆會自動入帳」——
唯一的自動寫入端（`settlementIntegration.service.js`）只在**付款核准當下**執行，
**沒有回溯物化**。同理，由此推得的「最早撥款到期日 2026-10-15」
**不構成任何已存在的付款義務**。

---

---

## 3. 營運角色指派（G2-O）—— **已由 Owner 指派完成**

**🔒 2026-09-29 Owner 已指派完成。營運人力為兩位真實人員。**

```text
PRE-18 SETTLEMENT —— 營運角色指派（已填）

Primary settlement operator   : Owner
Backup settlement operator    : Owner 的事業夥伴（真實的第二人）
Settlement incident owner     : Owner
First-24-hour monitoring owner: Owner
First-cycle-close approver    : Owner 的事業夥伴  ← 2026-09-29 Owner 改指派
Emergency-disable authority   : Owner

指派日：2026-09-29    指派人：Owner
```

⚠️ **Backup 不是「同一人兜底」** —— 是可在 Primary 不可用時實際接手的另一個人。

⚠️ **Backup 目前狀態為 `ASSIGNED / NOT YET OPERATIONALLY READY`**：
已指名不等於已就緒，10 項 onboarding 要求見
`pre-18-settlement-operating-controls-2026-09-29.md` §1B。

⚠️ **一項重疊需 Owner 裁示（不阻擋 G2-O）**：Primary operator 與
First-cycle-close approver 同為 Owner，故「明示核准」將由執行者自行給出。
該分工建議的來源是**工程端於 commit `7d98c75` 寫下的建議**，
**非任何既有政策或 `DEC-*` 要求**。既然 Backup 是真實第二人，
Owner **得選擇**將 approver 改指派給 Backup。**本文件不代為變更。**

---

### 3.1 First-cycle-close approver —— 🔒 **Owner 已決定：事業夥伴**

**2026-09-29 Owner 選定 OPTION B：first-cycle-close approver ＝ Owner 的事業夥伴。**
Primary settlement operator **維持 Owner**。
**因此第一次真實的期間關閉採用真人雙人覆核。**

> ⚠️ **這是 Owner 的營運選擇，不是「法律／政策／`DEC-*` 要求分離職責」的陳述。**
> 查證結果仍為：**沒有任何規則要求兩者分離**（見 `controls` §1A.1）。
> 兩個選項原本皆合規；Owner 選了較嚴的一個。

| | 採用 OPTION B 後的效果 |
| --- | --- |
| 營運 | 首次關閉需夥伴確認後才能執行，多一個往返 |
| 稽核 | 核准與執行由**不同 `actor_id`** 留痕，事後分辨得出 |
| 雙人覆核 | ✅ **有**（限首次期間關閉這個動作） |
| G2-O 通過條件 | 不變 —— 條件 5 只要求「已指派」 |
| 前置需求 | ⚠️ **夥伴必須先完成 §3.2 onboarding 並擁有自己的 admin 帳號**，否則無法履行此角色 |

### 3.2 Backup operator onboarding —— ✅ **OPERATIONALLY READY**（Owner 於 2026-09-29 具結）

**狀態階梯：`ASSIGNED` → `ONBOARDING IN PROGRESS` → 【✅ `OPERATIONALLY READY`】**

**11 項全數完成。**

| # | 項目 | 狀態 | 證據 |
| --- | --- | --- | --- |
| 1 | 建立獨立 Admin 帳號 | ✅ **COMPLETE** | Owner 具結：已以 `npm run create-admin --prefix Backend` 建立夥伴專屬帳號，夥伴已自行登入 production 且 `role ＝ admin`（**密碼未揭露**） |
| 2 | 存取限縮於結算功能 | ⚠️ **TECHNICALLY UNSUPPORTED — ACCEPTED LIMITATION WITH COMPENSATING CONTROLS** | 見 §3.3；Owner 已明示接受 |
| 3 | 已閱讀結算營運 runbook（`controls` §2–§8） | ✅ **COMPLETE** | 夥伴書面確認 |
| 4 | 已閱讀緊急停用程序（`controls` §7） | ✅ **COMPLETE** | 夥伴書面確認 |
| 5 | 已閱讀期間關閉檢查表（`controls` §5） | ✅ **COMPLETE** | 夥伴書面確認（**本人為 first-cycle-close approver**） |
| 6 | 已閱讀撥款凍結規則（`controls` §6） | ✅ **COMPLETE** | 夥伴書面確認 |
| 7 | 已閱讀事故升級程序（`controls` §8） | ✅ **COMPLETE** | 夥伴書面確認 |
| 8 | 理解憑證處理規則 | ✅ **COMPLETE** | 夥伴書面確認 |
| 9 | **未共用密碼** | ✅ **COMPLETE** | Owner 具結未轉交自身憑證；夥伴使用自有帳號登入 |
| 10 | **未將 production secret 寫入文件** | ✅ **COMPLETE** | 2026-09-29 掃描全部 tracked docs：**0 筆 production secret**（兩筆疑似命中經人工確認為 `postgres://user:password@localhost` 佔位字串與 git commit SHA） |
| 11 | **明示接受 RBAC 限制與補償控制** | ✅ **COMPLETE** | Owner 於 2026-09-29 明示接受（§3.3） |

> ⚠️ **本節記錄的是 Owner 的具結（attestation），不是系統自動驗證。**
> 第 1 項的帳號存在與 `role` 值可事後由 production 查核；
> 第 3～9 項本質上是人的行為，**任何系統都證明不了**，只能以具結為準。
> 這是刻意的界線 —— 不把具結包裝成機械證據。

> ⚠️ 第 2 項**仍然不是 COMPLETE**。標成 COMPLETE 會讓讀者誤以為
> endpoint 層級的 RBAC 已經存在，而它並不存在
> （`requireRole` 只做角色字串比對，詳見 `controls` §1B.1）。
> 夥伴的帳號在技術上可存取**全部 72 個 admin endpoint**。

### 3.3 Backup 存取控制狀態（🔒 Owner 於 2026-09-29 明示接受）

| 項目 | 狀態 |
| --- | --- |
| 需要獨立的 Backup 帳號 | **YES** |
| 共用憑證 | **PROHIBITED** |
| 透過 `activity_logs` 的行為人歸屬 | **REQUIRED** |
| 現行技術能力內的最小權限 | **REQUIRED** |
| **僅限結算端點的限制** | ❌ **NOT CURRENTLY SUPPORTED** |
| 較廣的 Admin 角色存取 | ⚠️ **KNOWN OPERATIONAL LIMITATION（已接受）** |

**補償控制（Owner 已採用）：**

1. Backup 使用**獨立、可個別歸屬**的 Admin 帳號；
2. **不共用密碼**；
3. Backup **只執行**已書面化的結算職責；
4. **非結算的 Admin 功能不在 Backup 的授權操作範圍內** ——
   即使技術上 RBAC 並不強制此區分；
5. Backup 的所有結算動作**必須**可在 `activity_logs` 中歸屬；
6. **Gate 3 撥款凍結維持強制**；
7. 首次真實期間關閉依上述指派採**雙人覆核**；
8. **非預期的 Admin 動作一律以事故處理**（見 `controls` §8）；
9. 日後的細粒度 RBAC 可另案追蹤，**但不是 Gate 2 的必要條件** ——
   現行沒有任何已鎖定的規則要求以技術強制該區分。

> ⚠️ **本項刻意不標記為 COMPLETE。** 標成 COMPLETE 會讓讀者誤以為
> endpoint 層級的 RBAC 已經存在，而它並不存在
> （`requireRole` 只做角色字串比對，詳見 `controls` §1B.1）。

## 4. 營運控制 —— 負責人對應與採用

### 4.0 ⚠️ 兩件不同的事

**指定負責人 ≠ 採用控制。** 下表的「建議負責人」是工程端依 §3 的角色職責**機械對應**的結果，
**不代表該控制已被採用**。採用一律以 §4.2 的四個 bundle 為準。

### 4.1 17 項控制的建議負責人對應

| # | 控制 | 建議負責人 | 依據 |
| --- | --- | --- | --- |
| 1 | payout review checklist | Primary operator | controls §1A 職責 |
| 2 | cycle-close checklist | Owner（執行）＋ **事業夥伴**（首次核准） | controls §5 |
| 3 | payout deadline calendar | Primary operator | controls §5A(1) |
| 4 | payout due-date alert / reminder | Primary operator（Backup 代理期間承接） | controls §1C.3 |
| 5 | weekly exception review | Primary operator | controls §5A(4) |
| 6 | reconciliation review | Primary operator | controls §8（suspense 列） |
| 7 | first-hour monitoring | First-24-hour monitoring owner | controls §3 |
| 8 | first-24-hour monitoring | First-24-hour monitoring owner | controls §4 |
| 9 | emergency flag-off procedure | **Emergency-disable authority** | controls §7 |
| 10 | invariant incident response | Incident owner | controls §8 |
| 11 | duplicate earning response | Incident owner | controls §8 |
| 12 | incorrect-ledger correction response | Incident owner | controls §8 ⚠️ 無 HTTP 路由 |
| 13 | accidental cycle-close response | Owner（incident）＋ **事業夥伴**（核准人） | controls §8 ⚠️ 期間不可重開 |
| 14 | accidental payout-item response | Incident owner | controls §8（mark-failed 可用） |
| 15 | accidental mark-paid response | **Owner**（非僅 incident owner） | controls §8 ⚠️ 無系統回復機制 |
| 16 | notification failure response | Primary operator | controls §8 |
| 17 | payout freeze until Gate 3 PASS | **Owner** | controls §6 |

**17 項歸屬全部明確**（先前兩項的模糊已由 §3.1 的 approver 改指派解除）：

| # | 控制 | 解除後的歸屬 |
| --- | --- | --- |
| 2 | cycle-close checklist | **執行 ＝ Owner；首次核准 ＝ 事業夥伴** |
| 13 | accidental cycle-close response | **Incident owner ＝ Owner；併同核准人（事業夥伴）檢視** |

### 4.2 採用 bundle —— 🔒 **四個 bundle 已於 2026-09-29 全數 ADOPTED**

| Bundle | 內容 | 主要負責人 | 備援 | 狀態 |
| --- | --- | --- | --- | --- |
| **A 例行結算作業** | payout review／cycle-close checklist／weekly exception review／reconciliation review | **Owner**（Primary operator） | **事業夥伴** | ✅ **ADOPTED** |
| **B 期限與監控** | payout deadline calendar／due-date reminder／first-hour monitoring／first-24-hour monitoring | **Owner**（期限＋監控） | **事業夥伴**（Primary 不可用時承接期限責任） | ✅ **ADOPTED** |
| **C 事故應變** | emergency flag-off／invariant／duplicate earning／incorrect ledger／accidental cycle close／accidental payout item／accidental mark-paid／notification failure | **Owner**（Incident owner；緊急停用亦為 Owner） | **事業夥伴**（代理期間） | ✅ **ADOPTED** |
| **D 撥款安全** | payout freeze until Gate 3 PASS | **Owner** | **事業夥伴**（代理期間同受拘束） | ✅ **ADOPTED** |

> ⚠️ **四個 bundle 全部是人工／流程控制，沒有任何一項具技術強制力。**
> 特別是 **Bundle D**：旗標開啟後，任何具 admin 角色者皆可呼叫 `mark-paid`，
> **系統不檢查 Gate 3**。採用 Bundle D 表示的是**營運承諾**，不是系統保證。

**首次期間關閉的核准權已於 §3.1 改為事業夥伴**，因此
Bundle A 的 cycle-close checklist 與 Bundle C 的 accidental cycle-close response
兩項的歸屬**不再模糊**：執行為 Owner、核准為事業夥伴。

### 4.3 立即停用旗標的停止條件（採用 BUNDLE C 即等於採用本清單）

1. 任一 invariant 違反；
2. 重複 earning 候選出現；
3. 不明經濟差異（shadow 回 `STOP_UNEXPLAINED_DIFFERENCE`）；
4. 非預期的懸記（非源於 `seller_id IS NULL`）；
5. 錯誤的創作者歸屬；
6. 非預期的 payout item；
7. **未經核准的期間關閉**；
8. **未經核准的 mark-paid**；
9. 交易／稽核原子性失效（金額已寫但稽核事件缺失，或反之）。

---

## 5. 撥款期限提醒 —— 零程式碼的過渡方案（🔒 **已隨 Bundle B 採用**）

> 🔒 **2026-09-29 Owner 另明示採用「Gate 3 PASS 前的撥款凍結」（Bundle D）**：
> Gate 3 ＝ PASS 之前 —— **不得**執行任何真實創作者撥款；**不得**標記 mark-paid；
> **不得**把人工銀行匯款表述為已完成；**不得**把任何 transfer reference 記為匯款完成之證明。
> **即使 Gate 2 日後變為 ENABLE，本凍結仍然強制。**

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

## 6. G2-O 轉為 PASS 的最低條件 —— ✅ **已滿足**

分三類，**不得**把「文件寫好了」當成「實際做到了」。

### A. 已書面化／已採用（文件層完成）

| # | 條件 | 狀態 |
| --- | --- | --- |
| 1–6 | 六個角色已指派（approver 已改為事業夥伴） | ✅ **完成** |
| 7 | BUNDLE A 例行結算作業已採用 | ✅ **ADOPTED** |
| 8 | BUNDLE B 期限與監控已採用 | ✅ **ADOPTED** |
| 9 | BUNDLE C 事故應變（含緊急停用、事故升級）已採用 | ✅ **ADOPTED** |
| 10 | BUNDLE D 撥款安全（Gate 3 前凍結）已採用 | ✅ **ADOPTED** |
| 11 | 交接程序已書面化 | ✅ **完成** |
| 12 | RBAC 限制與補償控制已明示接受 | ✅ **完成** |

### B. 仍需真實發生的事（文件證明不了）—— **2026-09-29 由 Owner 具結完成**

| # | 條件 | 狀態 | 證據 |
| --- | --- | --- | --- |
| 13 | **Backup 擁有獨立可歸屬的 Admin 帳號** | ✅ **完成** | Owner 具結：帳號已建立，夥伴已自行登入 production，`role ＝ admin`（見 §3.2 第 1 項） |
| 14 | **Backup 已完成 6 項書面確認** | ✅ **完成** | 見 §3.2 第 3～8 項 |
| 15 | **未共用密碼** | ✅ **完成** | 見 §3.2 第 9 項 |
| 16 | 撥款提醒流程**實際運作中** | 🔁 **RECLASSIFIED —— 見 §6.1** | 已採用且已武裝；**在 Gate 2 之前無法被執行** |

### 6.1 條件 16 的重新分類（⚠️ 這是工程端修正自己先前寫錯的判準）

**先前把條件 16 寫成「撥款提醒流程**實際運作中**」。該寫法在 Gate 2 階段是
結構上不可能滿足的，屬於判準本身的缺陷，不是營運端的缺口。**

查證：

| 事實 | 證據 |
| --- | --- |
| production 目前 `settlement_cycles` ＝ **0** | Owner 提供的指令 B 輸出 |
| 期間只能由 `POST /admin/settlement/cycles/:id/close` 產生 | `Backend/routes/adminSettlement.js` |
| 該端點受 `SETTLEMENT_WRITE_ENABLED` 閘控 | 同上（flag-gated） |
| 撥款提醒的觸發時點是**期間關閉當下** | `controls` §5A(1) |

**因此：要讓提醒流程「實際運作」必須先關閉一個期間；要關閉期間必須先開啟旗標；
而是否開啟旗標正是 Gate 2 要決定的事。把條件 16 當成 Gate 2 的前置條件會使 Gate 2 自我循環。**

**重新分類為：✅ ADOPTED AND ARMED —— 首次執行時點 ＝ 首次期間關閉。**

強制機制（非僅承諾）：

1. 提醒流程已隨 **BUNDLE B** 採用（§4.2）；
2. **BUNDLE A 的 cycle-close checklist（`controls` §5）把「建立撥款期限日曆事項」列為
   關閉前必須完成的項目** —— 首次期間關閉時若未建立，檢查表即不成立；
3. 首次期間關閉另需**事業夥伴核准**（§3.1），該核准人亦已確認讀過 §5 檢查表（§3.2 第 5 項）。

> ⚠️ **這項重新分類沒有放寬任何金流安全要求。**
> 條件 16 的目的是「不要錯過撥款期限」。在 Gate 2 階段**尚無任何撥款期限存在**
> （production 期間數 ＝ 0、ledger 分錄 ＝ 0、`payout_items` ＝ 0）。
> 真正防止「Gate 3 未過就付錢」的是 **BUNDLE D 撥款凍結（條件 10）**，
> 它**維持強制、未被放寬**。
>
> ⚠️ 同時保留既有的已知缺口記錄：**`payout_due_at` 在程式中沒有任何消費端** ——
> 沒有排程、沒有告警、沒有提醒。條件 16 自始至終都是**純人工控制**，
> 重新分類**不會**、也不得被讀成「系統會提醒」。

### C. 結論

**G2-O ＝ ✅ PASS。**

達成路徑：條件 1～12 由文件與 Owner 決定完成；條件 13～15 由 Owner 於 2026-09-29 具結完成；
條件 16 重新分類為「已採用且已武裝、首次期間關閉時執行」（§6.1）。

> ⚠️ **明確記錄 G2-O 通過時仍然成立的限制**（通過**不等於**這些已解決）：
>
> 1. 夥伴的帳號在技術上可存取**全部 72 個 admin endpoint**；限縮僅靠補償控制，**無技術強制**；
> 2. **BUNDLE D 撥款凍結無技術強制** —— 旗標開啟後任何 admin 皆可呼叫 `mark-paid`，系統不檢查 Gate 3；
> 3. 四類事故更正路徑**沒有 HTTP 路由**，需一次性維運操作；誤 `mark-paid` **無系統回復機制**；
> 4. 條件 13～15 為**人的具結**，非機械驗證。

---

## 7. G2-E 認知確認 —— 🔒 **Owner 已於 2026-09-29 ACCEPT**

**狀態：`ACCEPTED` → G2-E ＝ PASS。**

Owner 明示接受下列認知：

> 我理解：
>
> 1. 開啟 `SETTLEMENT_WRITE_ENABLED` **不會**回溯物化既有的已付訂單；
> 2. 啟用後的**第一筆新核准付款**將產生**不可變**的創作者結算事實與應付義務；
> 3. `AD-09` 與稅務／扣繳**仍未解決**，因此創作者應付義務可能在平台
>    **尚無法合規執行撥款**之前就開始累積；
> 4. 日後把 `SETTLEMENT_WRITE_ENABLED` 關回 OFF **只會停止未來的 gated 寫入**，
>    **不會**抹除已經產生的義務。

  **[x] ACCEPT**（Owner，2026-09-29）  　 [ ] DO NOT ACCEPT

> ⚠️ **本項接受不是開啟旗標的授權。** 它只讓 G2-E 通過。
> 最終的 KEEP OFF／ENABLE 仍是獨立的 G2-OWNER 決定，且**尚未作成**。

---

## 8. Owner 輸入 —— ✅ **全部完成**

2026-09-29 全數完成：first-cycle approver（＝事業夥伴）、四個控制 bundle（全部 ADOPTED）、
撥款凍結（ADOPTED）、G2-E（ACCEPTED）、Backup onboarding（`OPERATIONALLY READY`）、
production 曝險量測（17 項全數實測）、**最終 Gate 2 決定（`KEEP OFF`）**。

**本閘門已無待辦的 Owner 輸入。**

---

## 9. Gate 2 子閘門最終狀態 —— 🔒 **CLOSED / OWNER DECIDED**

| 子閘門 | 狀態 | 依據 |
| --- | --- | --- |
| **G2-T** 技術 | ✅ **PASS** | production readiness `verdict ＝ READY`、shadow `NO_UNEXPLAINED_DIFFERENCE` |
| **G2-D** 曝險已掌握 | ✅ **PASS** | §2.2 的 17 項**全部實測取得**，無一估算；§2.2.1 以 canonical 程式碼重算逐項相符 |
| **G2-O** 營運控制 | ✅ **PASS** | §6 —— 條件 1～12 完成、13～15 Owner 具結完成、16 重新分類（§6.1） |
| **G2-E** 外部後果認知 | ✅ **PASS** | §7 Owner 已於 2026-09-29 ACCEPT |
| **G2-OWNER** | 🔒 **KEEP OFF**（2026-09-29 最終決定） | §9.1 |

**Gate 2 ＝ `CLOSED / OWNER DECIDED`　│　`SETTLEMENT_WRITE_ENABLED` ＝ OFF　│　PRODUCTION WRITE ENABLED ＝ NO。**

### 9.1 Owner 決定內容（2026-09-29）

**決定：維持 `SETTLEMENT_WRITE_ENABLED` ＝ OFF。這是最終的 Gate 2 Owner 決定。**

理由（Owner 陳述）：

1. `PRE-18` 技術就緒 ＝ PASS；`G2-T`／`G2-D`／`G2-O`／`G2-E` 皆 PASS；
   production shadow 已驗證；write-enable readiness ＝ `READY`。
2. **但** `AD-09` 與稅務／扣繳仍未解決，兩者仍**阻擋安全的創作者撥款執行**。
3. 現在開啟會使日後每一筆核准付款產生**不可變的**創作者結算義務，
   而平台**尚無法可靠地清償**它們。
4. **沒有任何營運上的必要**要在撥款阻擋解除前承受該曝險。

> ⚠️ **這不是 `PRE-18` 技術就緒的失敗。技術就緒維持 PASS。**
> `PRE-18` 本身仍為 **OPEN**，原因是**外部 launch 相依未解**。

### 9.2 重開條件

🔁 **Gate 2 可於日後重開。** 觸發條件：適用的撥款／法律／會計阻擋解除 ——
主要為 **`AD-09`（創作者收款資料）** 與 **稅務／扣繳**，
另含屆時仍然適用的 `AD-10`（代理收付定性）與 `O19`（懸記終局處置）。

> ⚠️ **重開時不得沿用 2026-09-29 的 PASS。**
> `G2-T`／`G2-D`／`G2-O`／`G2-E` **必須以當時的證據重新確認**：
>
> | 子閘門 | 為什麼會失效 |
> | --- | --- |
> | `G2-D` | **曝險量測必然過期** —— 每一筆新的已核准訂單都會改變總量；NT$1 只是 2026-09-29 當下的事實 |
> | `G2-O` | 角色與 onboarding 具結需重新確認仍然成立（人員可能異動） |
> | `G2-T` | 需重跑 readiness 與 shadow |
> | `G2-E` | 屆時的外部後果與今日不同，須就當時事實重新確認 |

### 9.3 本決定當下仍然成立的限制（`KEEP OFF` **不會**使它們消失）

| 仍未解決 | 位置 |
| --- | --- |
| `AD-09` 與稅務／扣繳的外部意見 | 律師／會計師 packet 尚在外部審閱 |
| Gate 3 前的撥款凍結**無技術強制** | §6.C(2) |
| Backup 的 admin 存取**無 endpoint 層級限縮**（可達全部 72 個 endpoint） | §3.3、§6.C(1) |
| `payout_due_at` **無程式消費端** | §6.1 |
| 四類事故更正路徑**無 HTTP 路由**；誤 `mark-paid` **無回復機制** | §6.C(3) |

> **G2-D 的範圍已由 Owner 於 2026-09-29 鎖定為「總量曝險」（option (a)，見 §0）** ——
> 逐創作者拆分的六個欄位為 **DEFERRED — GATE 3 / FIRST-CYCLE-CLOSE READINESS**。
