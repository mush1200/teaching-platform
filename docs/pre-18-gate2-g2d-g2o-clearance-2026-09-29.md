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

## 3. 營運角色指派（G2-O）—— **已由 Owner 指派完成**

**🔒 2026-09-29 Owner 已指派完成。營運人力為兩位真實人員。**

```text
PRE-18 SETTLEMENT —— 營運角色指派（已填）

Primary settlement operator   : Owner
Backup settlement operator    : Owner 的事業夥伴（真實的第二人）
Settlement incident owner     : Owner
First-24-hour monitoring owner: Owner
First-cycle-close approver    : Owner
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

### 3.1 First-cycle-close approver —— 兩個選項（**Owner 裁示，本文件不選**）

查證結果：**沒有任何 `DEC-*`、政策或外部規則要求**這兩個角色由不同人擔任
（詳見 `controls` §1A.1）。因此以下兩者**皆為合規**。

| | **OPTION A** approver ＝ Owner（現況） | **OPTION B** approver ＝ 事業夥伴 |
| --- | --- | --- |
| 營運效果 | 首次關閉由 Owner 自行核准後執行，最快 | 需等夥伴確認後才能關閉，多一個往返 |
| 稽核效果 | `activity_logs` 只會有一個 `actor_id`；「核准」與「執行」在軌跡上無法分辨 | 核准與執行由**不同 `actor_id`** 留痕，事後可分辨 |
| 雙人覆核 | ❌ 無 | ✅ 有（針對首次期間關閉這一個動作） |
| 是否改變 G2-O 通過條件 | ❌ 否 | ❌ 否 —— 條件 5 只要求「已指派」 |
| 是否需要程式／存取變更 | ❌ 否 | ⚠️ **需要** —— 夥伴必須先完成 §3.2 的 onboarding 並擁有自己的 admin 帳號 |

> 若選 B，工程端將**機械性地**更新兩份文件的 approver 欄位，不另做其他變更。

### 3.2 Backup operator onboarding（**全部 INCOMPLETE**）

**狀態規則：`ASSIGNED` → `ONBOARDING IN PROGRESS` → `OPERATIONALLY READY`。
第 1～10 項全部通過之前，Backup 不得被視為 `OPERATIONALLY READY`。**

**目前狀態：`ASSIGNED`（尚未開始 onboarding）。**

| # | 項目 | 狀態 | 需要的證據 | 誰執行 | 需改程式？ | 需 production 動作？ | 阻擋就緒？ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 取得 scoped Admin 帳號 | ❌ INCOMPLETE | 帳號已建立且可登入（**不揭露密碼**） | Owner 執行 `npm run create-admin` | 否 | ✅ **是**（建立 production 帳號） | ✅ 是 |
| 2 | 存取限縮於結算／Admin 必要功能 | ❌ INCOMPLETE | — | — | 否 | 否 | ⚠️ **技術上無法達成**，見下 |
| 3 | 已閱讀結算營運 runbook | ❌ INCOMPLETE | 夥伴書面確認已讀 `controls` §2–§8 | 夥伴 | 否 | 否 | ✅ 是 |
| 4 | 已閱讀緊急停用程序 | ❌ INCOMPLETE | 書面確認已讀 `controls` §7 | 夥伴 | 否 | 否 | ✅ 是 |
| 5 | 已閱讀期間關閉檢查表 | ❌ INCOMPLETE | 書面確認已讀 `controls` §5 | 夥伴 | 否 | 否 | ✅ 是 |
| 6 | 已閱讀撥款凍結規則 | ❌ INCOMPLETE | 書面確認已讀 `controls` §6 | 夥伴 | 否 | 否 | ✅ 是 |
| 7 | 已閱讀事故升級程序 | ❌ INCOMPLETE | 書面確認已讀 `controls` §8 | 夥伴 | 否 | 否 | ✅ 是 |
| 8 | 理解憑證處理規則 | ❌ INCOMPLETE | 書面確認 | 夥伴 | 否 | 否 | ✅ 是 |
| 9 | **未共用密碼**（使用自己的帳號） | ❌ INCOMPLETE | 第 1 項完成即滿足；Owner 確認未轉交自己的憑證 | Owner ＋ 夥伴 | 否 | 否 | ✅ **是（硬性）** |
| 10 | **未將 production secret 寫入文件** | ❌ INCOMPLETE | Owner 確認 | Owner | 否 | 否 | ✅ **是（硬性）** |

> ⚠️ **第 2 項在現行架構下無法以技術達成。**
> `requireRole` 只做角色字串比對，**沒有 permission／scope／endpoint 層級授權**，
> 因此一個 admin 帳號即授予全部 **72 個** admin 端點（含 4 個結算寫入端點）。
> 該項只能以**營運紀律 ＋ 事後稽核**滿足（詳見 `controls` §1B.1）。
> **本輪不修改 RBAC。**
>
> ⚠️ **第 9、10 項是硬性要求**：`activity_logs` 以 `actor_id` 辨識行為人，
> 共用登入會讓整套稽核失去分辨能力。

## 4. 營運控制 —— 負責人對應與採用

### 4.0 ⚠️ 兩件不同的事

**指定負責人 ≠ 採用控制。** 下表的「建議負責人」是工程端依 §3 的角色職責**機械對應**的結果，
**不代表該控制已被採用**。採用一律以 §4.2 的四個 bundle 為準。

### 4.1 17 項控制的建議負責人對應

| # | 控制 | 建議負責人 | 依據 |
| --- | --- | --- | --- |
| 1 | payout review checklist | Primary operator | controls §1A 職責 |
| 2 | cycle-close checklist | Primary operator（執行）＋ First-cycle approver（首次核准） | controls §5 |
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
| 13 | accidental cycle-close response | Incident owner ＋ First-cycle approver | controls §8 ⚠️ 期間不可重開 |
| 14 | accidental payout-item response | Incident owner | controls §8（mark-failed 可用） |
| 15 | accidental mark-paid response | **Owner**（非僅 incident owner） | controls §8 ⚠️ 無系統回復機制 |
| 16 | notification failure response | Primary operator | controls §8 |
| 17 | payout freeze until Gate 3 PASS | **Owner** | controls §6 |

**歸屬明確者 15 項。以下 2 項的歸屬在現行角色下不唯一，需 Owner 裁示：**

| # | 控制 | 為什麼不唯一 |
| --- | --- | --- |
| 2 | cycle-close checklist | 執行與核准目前同為 Owner（見 §3 的重疊說明）；若 approver 改為 Backup，本項會分屬兩人 |
| 13 | accidental cycle-close response | 同上 —— 取決於誰核准了那次關閉 |

> 兩項皆**不阻擋** bundle 採用：無論 approver 由誰擔任，控制內容本身不變。

### 4.2 採用 bundle（**四個選擇，非 17 個**）

> 每個 bundle 只有在其**全部**成員控制都已有書面內容時才被提出 ——
> 不存在「採用了卻沒有文件」的成員。

```text
BUNDLE A —— 例行結算作業
  含：payout review checklist / cycle-close checklist /
      weekly exception review / reconciliation review
  文件：controls §4、§5、§5A(4)、§8
  負責人：Primary operator（首次關閉另需 approver 核准）

  [ ] ADOPT        [ ] DO NOT ADOPT


BUNDLE B —— 期限與監控
  含：payout deadline calendar / payout due-date reminder /
      first-hour monitoring / first-24-hour monitoring
  文件：controls §3、§4、§5A
  負責人：Primary operator（期限）＋ First-24-hour monitoring owner（監控）
  ⚠️ 期限部分為人工控制，payout_due_at 無任何程式消費端

  [ ] ADOPT        [ ] DO NOT ADOPT


BUNDLE C —— 事故應變
  含：emergency flag-off / invariant incident / duplicate earning /
      incorrect ledger / accidental cycle close / accidental payout item /
      accidental mark-paid / notification failure
  文件：controls §7、§8（10 情境表）
  負責人：Incident owner（誤 mark-paid 升級至 Owner）
  ⚠️ 含四類「無 HTTP 路由、需一次性維運操作」的更正路徑，
     以及一類「無系統回復機制」（誤 mark-paid）

  [ ] ADOPT        [ ] DO NOT ADOPT


BUNDLE D —— 撥款安全
  含：payout freeze until Gate 3 PASS
  文件：controls §6
  負責人：Owner
  ⚠️ 無技術強制 —— 旗標開啟後任何 admin 皆可呼叫 mark-paid，系統不檢查 Gate 3

  [ ] ADOPT        [ ] DO NOT ADOPT
```

> **未經明示 ADOPT 者一律視為 NOT ADOPTED。**

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

**全部滿足才算 PASS。除 Backup 帳號建立外，皆為人工控制，不需要任何程式碼變更。**

| 群組 | # | 條件 | 狀態 |
| --- | --- | --- | --- |
| **角色** | 1 | Primary operator 已指派 | ✅ **完成** |
| | 2 | Backup operator 已指派 | ✅ **完成** |
| | 3 | Incident owner 已指派 | ✅ **完成** |
| | 4 | First-24-hour monitoring owner 已指派 | ✅ **完成** |
| | 5 | First-cycle-close approver 已指派 | ✅ **完成** |
| | 6 | Emergency-disable authority 已指派 | ✅ **完成** |
| **Backup** | 7 | Backup **operationally ready**（§3.2 的 10 項） | ❌ **未完成** |
| **控制** | 8 | BUNDLE A 例行作業已採用 | ❌ **未採用** |
| | 9 | BUNDLE B 期限與監控已採用 | ❌ **未採用** |
| | 10 | BUNDLE C 事故應變已採用 | ❌ **未採用** |
| | 11 | BUNDLE D 撥款安全已採用 | ❌ **未採用** |
| **流程** | 12 | 撥款提醒流程**實際運作中** | ❌ **未啟動** |
| | 13 | 緊急停用程序已採用 | 併入 BUNDLE C |
| | 14 | 事故升級程序已採用 | 併入 BUNDLE C |
| | 15 | 交接程序已書面化 | ✅ **完成**（controls §1C／§1C.1–3） |
| | 16 | Gate 3 前的撥款凍結**實際生效中** | 併入 BUNDLE D |

**尚缺：條件 7～12（Backup 就緒 ＋ 四個 bundle ＋ 提醒流程啟動）。**

> ⚠️ **不得因為六個角色都有名字就判 PASS。**
> 也**不得**放寬任何金流安全要求以加速通過 ——
> 條件 11（BUNDLE D）與 16 是本清單中唯一直接防止「在 Gate 3 未通過時付錢」的項目。

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

  [ ] ACCEPT（我確認以上認知）
  [ ] DO NOT ACCEPT（我不確認）

簽署：__________________    日期：__________
```

> **本輪 Owner 未於對話中明示接受或拒絕上述認知，故兩個選項皆維持未勾選。**
> 工程端**不得**由「Owner 選擇了 option (a)」推定其已接受 G2-E ——
> 那是兩件不同的事：前者是**量測範圍**的決定，後者是**後果認知**的確認。

---

## 8. 剩餘的 Owner 輸入（**全部非 Owner 工作已窮盡**）

以下是**唯一**還需要 Owner 的事項。其餘全部已機械完成。

```text
OWNER INPUT 1 —— First-cycle-close approver（見 §3.1）
  [ ] Owner（現況，不需任何額外動作）
  [ ] 事業夥伴（需先完成 §3.2 onboarding）

OWNER INPUT 2 —— Backup onboarding（見 §3.2）
  [ ] COMPLETE（10 項全部通過，請附證據）
  [ ] NOT COMPLETE

OWNER INPUT 3 —— 控制採用（見 §4.2，四個 bundle）
  BUNDLE A 例行結算作業   [ ] ADOPT   [ ] DO NOT ADOPT
  BUNDLE B 期限與監控     [ ] ADOPT   [ ] DO NOT ADOPT
  BUNDLE C 事故應變       [ ] ADOPT   [ ] DO NOT ADOPT
  BUNDLE D 撥款安全       [ ] ADOPT   [ ] DO NOT ADOPT

OWNER INPUT 4 —— G2-E 認知確認（見 §7）
  [ ] ACCEPT   [ ] DO NOT ACCEPT

OWNER INPUT 5 —— production 量測（見 §1）
  執行指令 A ＋ B，回傳兩份 JSON（**不要回傳任何憑證**）

OWNER INPUT 6 —— 最終 Gate 2 決定
  [ ] KEEP OFF   [ ] ENABLE
  ⚠️ 在 G2-D／G2-O／G2-E 全部 PASS 之前，**不應**提出此項
```

---

## 9. Gate 2 子閘門現況

| 子閘門 | 狀態 | 轉為 PASS 所需 |
| --- | --- | --- |
| **G2-T** 技術 | ✅ **PASS** | — |
| **G2-D** 曝險已掌握 | ⏸ **WAITING FOR AGGREGATE PRODUCTION MEASUREMENT** | Owner 執行 §1 的指令 A ＋ B 並貼回輸出，取得 §2.1 的 17 項 |
| **G2-O** 營運控制 | ⏸ **WAITING FOR BACKUP ONBOARDING / CONTROL ADOPTION**（6 個角色**已指派完成**） | §6 條件 7～12：Backup 就緒 ＋ 四個 bundle ＋ 提醒流程啟動 |
| **G2-E** 外部後果認知 | ⏸ **WAITING FOR OWNER ACKNOWLEDGEMENT** | §7 已簽署 |
| **G2-OWNER** | ⏸ **PENDING** | Owner 明示選擇 KEEP OFF 或 ENABLE |

> **任一子閘門不得在無明示證據下升級。**
>
> **G2-D 的範圍已由 Owner 於 2026-09-29 鎖定為「總量曝險」（option (a)，見 §0）** ——
> 因此它**不會**因為逐創作者拆分不可得而 FAIL。
> 那六個欄位為 **DEFERRED — GATE 3 / FIRST-CYCLE-CLOSE READINESS**。
