# `Gate 14` 採納後的下游後果 —— 四項尚未被涵蓋

**日期：** 2026-08-26
**審查對象：** v1.8 最終擴充（`Gate 14 RESCISSION-AND-REMEDY-CAPABILITY` ＋ 16 項）
**前置：** `docs/p1-09-v1.8-final-scope-review-2026-08-26.md`

---

## 0. 結論

| 項目 | 結果 |
| --- | --- |
| v1.8 最終擴充 16 項 | **全部正確，無錯誤** |
| `Gate 14` 規格（entitlement revoke/restore ＋ refund/remedy case ＋ 狀態機） | ✅ 方向與粒度都對 |
| 「已下載副本 vs future entitlement」 | ✅ **這是我沒提到的好補充** |
| 三個 SLA 分離（payment review／complaint／refund） | ✅ |
| 不新增 `PRE-05`／`Q`／`MR-21` 的判斷 | ✅ 正確 —— Gate 14 由 `MR-18` 涵蓋，揭露一致性由 `MR-20` 涵蓋 |
| **新發現** | **4 項**（2 項有 repo 證據，1 項是稅務下游，1 項是 Creator 側時序） |

**最重要的一句話：**
`Gate 14` 一旦加入，會同時觸動**稅務憑證的反向作業**、
**repo 現有的 entitlement 推導方式**、**檔案回收指令**，以及 **Creator 報酬的結算時序**。
這四條都不在目前的 v1.8 範圍內。

---

## 1. `F1` —— 退款會產生**稅務憑證的沖銷**，v1.8 只寫了開立

**統一發票使用辦法 §20：**

> 營業人銷售貨物或勞務，於開立統一發票後，發生**銷貨退回**、掉換貨物或**折讓**等情事，
> 應於事實發生時…；開立統一發票之銷售額**已申報者，應取得買受人出具之
> 銷貨退回、進貨退出或折讓證明單**（一式四聯）。

v1.8 的 `P6 Tax Document Timing` **只處理開立，沒有沖銷**。
`J` 的 timeline 同樣不對稱：

```text
tax_document_required_at   ✅
tax_document_issued_at     ✅
tax_document_reversal_*    ❌ 不存在
```

**這是 `Gate 14` 的直接下游** —— 有了退款能力，就會有已開立憑證需要沖銷。
而且憑證是**買受人出具**的，代表退款流程要能**向 Buyer 索取證明單**，
不是平台單方面沖掉就好。

**依賴關係與「交付期日 ← `PAYMENT-REVIEW-SLA`」同型：**
是否需要證明單，取決於 `P4`（是否使用統一發票）的結果 ——
若最終為小規模營業人、免用統一發票，處理的是收據的對應作業。
**`P4` 未定 → `P14` 的具體形式也無法定案，但欄位與流程位置必須先留。**

**建議：** `P` 新增 `P14 Tax Document Reversal`；`J` 補對應時間戳；
`Gate 14` 的完成條件納入「退款完成時的憑證沖銷處理已定義」。

---

## 2. `F2` —— entitlement **目前沒有獨立狀態**，revoke 不能靠改訂單狀態實作

### repo 證據

| 來源 | 內容 |
| --- | --- |
| `Backend/services/materialFile.service.js:23` | 「授權查詢**不看 `material_files.id`，只看訂單與 `approved_file_id`**」 |
| `docs/material-file-storage-and-delivery.md:315` | 「**entitlement 綁 order**，與 creator 無關」 |
| `docs/material-file-storage-and-delivery.md` §7.1 | Buyer entitlement 的 canonical 定義 |

**目前 entitlement 是從「訂單狀態 ＋ `approved_file_id`」推導出來的，
沒有任何獨立記錄可以單獨撤銷。**

v1.8 的欄位清單有 `order_item.entitlement_status` ✅ **方向正確**，
但必須明寫一條禁令，否則實作最省事的路徑就是改訂單狀態：

> **不得以修改 `orders.status` 的方式實作 revoke。**

理由：`orders.status` 已有既定語意與狀態機（`P1-04` 輪次收斂過），
用它來表達「授權被撤銷」會同時污染訂單狀態機、對帳與稽核軌跡 ——
而 `Gate 14` 本身要求的正是可稽核。

**建議：** entitlement 必須成為**獨立維度**，與 `orders.status` 正交。

---

## 3. `F3` —— revoke 會與**檔案回收指令**產生危險交互

### repo 證據

| 來源 | 內容 |
| --- | --- |
| `docs/material-file-storage-and-delivery.md:195` | 「§8 明確要求『**只要有合法 buyer entitlement 就不得任意實體刪除**』」 |
| `docs/material-file-storage-and-delivery.md:362` | 「實體刪除…只有 `superseded` 且**無任何 entitlement 依賴**的列，才由維運指令回收」 |

**危險路徑：**

```text
revoke entitlement
  → orphan cleanup 判定該 superseded 檔案「無 entitlement 依賴」
  → 實體刪除
  → 之後 restore access（Gate 14 的狀態機有這個動作）
     或需要提供 PRE-04.1 的履約版本
  → 檔案已經不存在
```

也就是說，**一個為了合規而加入的能力，會經由既有的回收指令造成不可逆的資料損失**。

**建議（可直接寫進 `Gate 14` 的技術不變條件）：**

> `revoke` 的語意是「**暫停交付**」，**不是移除 entitlement 記錄**。
> 檔案回收指令的判定條件必須把 **revoked／restorable 狀態**視為仍有 entitlement 依賴。

這一條同時保護 `PRE-04.1`（履約版本 snapshot）—— 撤銷授權不得使履約版本無法還原。

---

## 4. `F4` —— 退款與 Creator 報酬的**時序**沒有規則

v1.7 §4 已經定好方向 ✅：
退款訂單不納入計算基礎；**不得**做成從 Creator 餘額扣回。
`P10` 也已有 `refund/excluded_transactions` 欄位 ✅。

**但沒有任何規則處理：退款發生在該期已結算、且已付款給 Creator 之後。**

兩個選項，各有後果：

| 選項 | 後果 |
| --- | --- |
| (a) 在**下一期**的計算基礎中扣除 | 符合「不從餘額扣回」的形式，**但實作不當會長得像 clawback** → 直接觸發 `PRE-03.8` 的 reopen trigger「Refund 直接從 Creator 既有餘額扣回」 |
| (b) 平台吸收 | 最乾淨，不觸動 `PRE-03` 定性，但有成本 |

v1.7 §3 要求 Creator Agreement 事前說明「**報酬更正方式**」——
**欄位在，規則不在。**

**建議：** v1.8 必須就此拍板，且措辭要與 `PRE-03` 的實質定性一致。
若採 (a)，條文與 ledger 都要寫成「**本期計算基礎之調整**」，
不得出現任何「自 Creator 已得款項扣回」的表述或實作。

---

## 5. `F5` —— `mvp_rules.md` 的修改會造成 **doc-ahead-of-code**

v1.8 第 5 項提議把 `docs/mvp_rules.md:1371` 的
`Refund / reversal → 不存在` 改寫為描述應具備的能力 —— **方向正確**。

但 `mvp_rules.md` 是 **canonical doc**。
把它改成描述一個**尚未實作**的能力，會造成
「canonical 文件描述不存在的行為」——
那正是 tracker §11.6 要求避免的 stale-doc 情形，只是方向相反。

**建議改寫時帶狀態標記**，例如：

> `Refund / reversal` → **REQUIRED（Gate 14），尚未實作** ——
> 不存在一般任意反悔退款流程；平台必須具備處理法定解除、履約瑕疵、重複付款、
> IP 下架、平台未履約等情形的人工 refund/remedy capability。

而不是直接改成描述現況。
另依 CLAUDE.md §9，`Gate 14` 實際實作時（會動到
`Backend/routes`／`services`／`db/db_schema.sql`），
**必須在同一次 push 更新 canonical doc** —— 兩次更新的順序要先想清楚。

---

## 6. v1.8 建議追加（32～36）

| # | 追加 | 來源 |
| --- | --- | --- |
| 32 | `P14 Tax Document Reversal`；`J` 補 `tax_document_reversal_*`；依賴 `P4` 的結果 | `F1` |
| 33 | `Gate 14` 明訂「**不得以修改 `orders.status` 實作 revoke**」；entitlement 為獨立維度 | `F2` |
| 34 | `Gate 14` 技術不變條件：revoke ＝ **暫停交付**，非移除 entitlement；檔案回收指令須把 revoked／restorable 視為仍有依賴 | `F3` |
| 35 | 拍板「已結算後才退款」的處理方式，並確保措辭與 `PRE-03` 定性一致 | `F4` |
| 36 | `mvp_rules.md` 改寫時帶狀態標記，避免 doc-ahead-of-code | `F5` |

---

## 7. 本輪查證來源

- 統一發票使用辦法 §20（銷貨退回、進貨退出或折讓證明單）
- 消費者保護法 §18 I(3)、§19 IV／V
- repo：`Backend/services/materialFile.service.js:23`；
  `docs/material-file-storage-and-delivery.md` §7.1／`:195`／`:315`／`:362`；
  `docs/mvp_rules.md:1371`

---

## 8. 這份文件不做什麼

- 不出具法律或稅務意見；`P1-09`／`PRE-03`／`PRE-04` 均維持 OPEN。
- v1.7 維持 `FULL REGRESSION — FAILED (MR-04)`。
- **不預先宣告 v1.8 任何回歸結果。**
- Active backlog 以 `docs/pending-work-tracker.md` 為準。
