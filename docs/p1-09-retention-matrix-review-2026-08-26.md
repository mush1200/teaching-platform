# `RETENTION-MATRIX` 審查 —— 本方更正 ＋ 三項補充

**日期：** 2026-08-26
**審查對象：** v1.8 scope lock 的最終修正（`RETENTION-MATRIX` 取代 retention floor、
`revoked_final` 三態、`CREATOR-ADJUSTMENT-SUBSTANCE-TEST`、`STATUS-EVIDENCE`）
**前置：** `docs/p1-09-v1.8-scope-lock-review-2026-08-26.md`

---

## 0. 結論

| 項目 | 結果 |
| --- | --- |
| **對方對「取最大 retention floor」的修正** | **正確。本方上一輪的寫法有誤** |
| `RETENTION-MATRIX` 結構 | ✅ 方向正確，**但不完整**（見 §2） |
| `revoked_final` 三態、cleanup 七條件 | ✅ 正確，需兩個實作防護（見 §3） |
| `CREATOR-ADJUSTMENT-SUBSTANCE-TEST` 的細化 | ✅ **比本方原版精準** |
| `STATUS-EVIDENCE` 治理規則 | ✅ 且比本方建議的範圍更廣（涵蓋 VALIDATED／COMPLETED） |
| 新發現 | 3 項（1 項有 repo 證據，是**法規與 canonical 規則的直接衝突**） |

---

## 1. 本方更正：「取所有適用期間的最大值」是錯的

上一輪我寫：

> 取所有適用期間的最大值，並在 baseline 寫明推導過程。

**這個寫法有兩個錯誤，對方的修正正確。**

### 1.1 那四個期間保護的**不是同一個對象**

| 期間 | 實際保護的對象 | 是否適用於教材檔案 |
| --- | --- | --- |
| 消保法 §19 III **四個月** | **解除權可能行使的窗口** | ❌ 不是檔案保存義務 |
| 個資辦法 §16 **五年** | **業務終止後個資處理的「處理紀錄」**（銷毀／移轉／刪除的紀錄本身） | ❌ 不是個資本體，更不是教材 binary |
| 稅務保存 | 發票、帳簿、憑證、payout 紀錄 | ❌ |
| `PRE-04` 履約版本 | **教材檔案** | ✅ 這一項才是 |

把四者取 max 套用到教材檔案，**只有第四項是對的，其餘三項是誤植**。

### 1.2 過度保存本身就是風險，不只是浪費

**個資法 §11 III 原文（已查證）：**

> 個人資料蒐集之特定目的消失或期限屆滿時，應主動或依當事人之請求，
> **刪除、停止處理或利用**該個人資料。
> 但因**執行職務或業務所必須**或經當事人書面同意者，不在此限。

也就是說，對**個人資料**而言，「留久一點比較安全」是錯的直覺 ——
目的消失後繼續保存，本身就需要落入但書才合法。

**`RETENTION-MATRIX`（purpose-based retention ＋ legal minimum ＋ deletion trigger）
是正確的作法。**

---

## 2. `RETENTION-MATRIX` 不完整 —— 應由 `B` 的資料清單 1:1 推導

對方的 Matrix 有 7 列 ✅ 結構正確。
但 **`B` 模組自己列出的資料類別有 13 類**，Matrix 只覆蓋其中約 7 類。

**缺的（對照 `B` 的清單）：**

| 缺漏 | 說明 |
| --- | --- |
| **`activity_logs`** | **repo 中真實存在的表**，見 §3.1 —— 且與 canonical 規則直接衝突 |
| **`report_events`** | `db/db_schema.sql:332`：「`activity_logs` 是全平台稽核軌跡，**`report_events` 是案件內容**」—— 兩張表分工，Matrix 兩張都沒有 |
| security logs | `B` 有列 |
| complaints ＋ 其 attachments/evidence | `N1` 明列 `attachments/evidence`，`N3` 還要求接受 Buyer 外部證據（銀行截圖等，**含個資**） |
| Creator tax identity data | 與「Tax document」**不是同一件事**：前者是個資（身分證統一編號等，`P9`），後者是憑證 |
| account / email / role 基本帳號資料 | `B` 清單第一項 |

**建議（可檢查的規則）：**

> **`RETENTION-MATRIX` 必須由 `B` 的資料清單逐項推導，1:1，不得有任何一類沒有對應列。**

歸屬：Matrix 放在 `K`；**完整性檢查掛在 `MR-11`**（本來就是 data lifecycle／termination），
**不需要 `MR-21`** —— 這一點與對方的判斷一致。

---

## 3. 新發現

### 3.1 `activity_logs` 與個資法 §11 III **直接衝突**，必須明文解決（repo 證據）

| 來源 | 內容 |
| --- | --- |
| `db/db_schema.sql:356-359` | `activity_logs` 有 `actor_id`、`actor_role` → **含個人資料** |
| `db/db_schema.sql:338` | `report_events` 同樣有 `actor_role` |
| `CLAUDE.md` §4 規則 4 | 「**不改寫歷史 `activity_logs`**：`actor_role` 中既有的 `parent` 等值反映寫入當下的事實，**屬稽核軌跡**，任何 role 遷移都不得回填」 |
| 個資法 §11 III | 目的消失或期限屆滿 → **應刪除、停止處理或利用** |

**兩者只能靠 §11 III 但書「因執行職務或業務所必須」調和。**

但這代表一件事：**「因為它是稽核軌跡，所以永遠留著」不是一個合法的預設**，
而是一個**必須被寫下來、附期限、附理由**的決定。

**而且 `K5` 也漏了它。** v1.7 `K5` 的資料清單是
「Buyer accounts、orders、payment proof、bank data、Creator tax data、payout data、
consent evidence、complaints、IP reports、**security records**」——
有 security records，**沒有 `activity_logs`**，而 `B` 的清單寫的是「activity/security logs」。

**建議：**

1. `RETENTION-MATRIX` 新增 `activity_logs` 與 `report_events` 兩列，
   並明寫援引 §11 III 但書的**理由與保存期限**
2. `K5` 的業務終止資料清單補上 `activity_logs`
3. 若未來要支援當事人刪除請求，必須先決定
   **「稽核軌跡中的 `actor_id` 如何處理」**（保留／假名化／依但書留存）
   —— 這是 `CLAUDE.md` §4 規則 4 與個資法之間唯一的接縫，目前沒有人碰過

### 3.2 cleanup 判定條件需要 **fail-closed ＋ legal hold 一級欄位**

對方的七個條件 ✅ 涵蓋完整。但其中三個是**判斷題**：

- 4：沒有 pending complaint / rescission / litigation hold
- 5：沒有 IP process 要求保存證據
- 7：其他適用保存義務已完成

**在 cleanup 執行當下臨場判斷這三件事，不可靠。**

**建議實作形態：**

> **legal hold 是記錄上的一級欄位**（`legal_hold` / `hold_reason` /
> `hold_set_at` / `hold_released_at`），**由業務流程設定**，
> cleanup **只讀取、不判斷**。

且 cleanup 必須 **fail-closed**：任何依賴檢查失敗或結果不確定 → **不刪**。
本 repo 已有此慣例 —— `Backend/config/privateFileStorage.js`
在 production ＋ local driver 時 fail-closed 拒絕啟動（見 tracker `PRE-01`）。

**第 7 條「其他適用保存義務」是開放式 catch-all**，
與 `MR-20.11`（§18 I(6)）和 `G3` 第四款是同一種問題 ——
需要同樣的紀律：**必須可列舉，且列舉的查證來源要記錄**，
不能是一個永遠自動打勾的條件。

### 3.3 `revoked_final` 三態要與 `RETENTION-MATRIX` 對齊

`suspended` / `revoked_pending` / `revoked_final` 的三態 ✅ 正確，
且對方正確指出「即使 `revoked_final` 也不等於 file 可刪」。

**補一點：** 三態本身是 **entitlement 記錄**的狀態，
而 entitlement 記錄在 Matrix 中應有自己的保存期限
（爭議稽核目的）——
**entitlement 記錄的保存期限，與該 entitlement 所指向的教材檔案的保存期限，是兩件事。**

`revoked_final` 之後：

- entitlement **記錄**可能仍需保存（稽核／爭議）
- 教材**檔案**是否可刪，取決於是否還有其他依賴

Matrix 的「Material historical file」與「Entitlement record」已經分成兩列 ✅，
只需在 `Gate 14` 明寫這個對應關係，避免實作時把兩者綁在一起刪。

---

## 4. 對方細化得比本方好的兩處

| 項目 | 說明 |
| --- | --- |
| `CREATOR-ADJUSTMENT-SUBSTANCE-TEST` | 我上一輪寫「若恆等於退款金額，**實質上就是 clawback**」——**太絕對**。對方改為「**恆等於是重要 red flag，應觸發 `PRE-03` 實質複核**，但不代表法律上必然是 clawback」，這個表述正確得多 |
| `STATUS-EVIDENCE` | 我只建議 `IMPLEMENTED` 需附證據；對方擴大到 **`IMPLEMENTED` / `VALIDATED` / `COMPLETED` 全部** ——更完整，且涵蓋律師意見、會計備忘、登記文件等非程式碼證據 |

---

## 5. v1.8 建議追加（41～44）

| # | 追加 | 來源 |
| --- | --- | --- |
| 41 | `RETENTION-MATRIX` **由 `B` 的資料清單 1:1 推導**，補上 `activity_logs`／`report_events`／security logs／complaints＋evidence／Creator tax identity data／基本帳號資料；完整性檢查掛 `MR-11` | §2 |
| 42 | 明文處理 **`activity_logs` 稽核軌跡 vs 個資法 §11 III** 的接縫（援引但書的理由與期限）；`K5` 資料清單補 `activity_logs` | §3.1 |
| 43 | cleanup 判定改為 **legal hold 一級欄位 ＋ fail-closed**；第 7 條 catch-all 套用「可列舉且記錄查證來源」紀律 | §3.2 |
| 44 | `Gate 14` 明寫「**entitlement 記錄的保存期限 ≠ 教材檔案的保存期限**」 | §3.3 |

---

## 6. 本輪查證來源

- 個人資料保護法 §11（五項全文，特別是 III 及其但書）
- 消費者保護法 §19 III
- 數位經濟相關產業個人資料檔案安全維護管理辦法 §16
- 統一發票使用辦法 §20-1
- repo：`db/db_schema.sql:332`／`:338`／`:356-359`；`CLAUDE.md` §4 規則 4；
  `Backend/config/privateFileStorage.js`（fail-closed 慣例）

---

## 7. 這份文件不做什麼

- 不出具法律或稅務意見；`P1-09`／`PRE-03`／`PRE-04` 均維持 OPEN。
- v1.7 維持 `FULL REGRESSION — FAILED (MR-04)`。
- **不預先宣告 v1.8 任何回歸結果。**
- Active backlog 以 `docs/pending-work-tracker.md` 為準。
