# PRE-03 + PRE-04 + P1-09 A～P v1.8
## Full Baseline / Pending Legal-Tax Validation

**Baseline date:** 2026-08-26
**Document status:** **Full Baseline**（完整文件，非 delta）
**Canonical source:** 本 `.md` 為唯一 canonical source；任何 `.docx` 僅為 generated derivative，**不得反向編輯**。
**Locked scope:** `docs/p1-09-final-scope-reconciliation-2026-08-26.md` 的 Final Scope Register（59 個 ID）。

---

```text
┌─────────────────────────────────────────────────────────────┐
│  Document Regression   :  PASSED (20/20)                    │
│  Deployment Readiness  :  0 / 14 IMPLEMENTED  (7 PARTIAL)   │
│  Legal Validation      :  PENDING   (0 / 22 active)         │
│  Tax  Validation       :  PENDING   (0 / 14 active)         │
└─────────────────────────────────────────────────────────────┘
```

> **這四條狀態線永不合併。**
> `Document Regression PASSED` **不蘊含任何一項功能存在**，
> 也**不代表** Production Ready。

---

# 0. 文件定位與治理原則

本文件是 `PRE-03`、`PRE-04` 與 `P1-09` 的**完整**產品／合規基準，不是法律意見。
除標示為 External Legal Gate / External Tax Gate 者外，已定案之產品方向不得在後續實作中被自行改回舊模式。

## 0.1 `REGRESSION-PROTOCOL-01` — 三態

| 狀態 | 條件 |
| --- | --- |
| `DELTA REVIEW` | 輸入是變更集。**不得**宣告全文回歸 |
| `FULL REGRESSION — FAILED (MR-xx…)` | 完整 baseline 存在，但 Master Regression Matrix 有缺列或任一項失敗 |
| `FULL REGRESSION — PASSED (20/20)` | 完整文件存在，且 `MR-01`～`MR-20` 全部逐列存在並實際通過 |

**回歸檢查只能對完整文件執行。**

## 0.2 `STATUS-EVIDENCE`

任何 `IMPLEMENTED` / `VALIDATED` / `COMPLETED` 狀態**必須附 evidence pointer**
（code location、schema、migration、自動化測試、人工驗證報告、律師意見、會計備忘、登記文件）。
**無 evidence 者不得標為上述狀態。** `NOT IMPLEMENTED` / `PENDING` 不需 evidence。

## 0.3 法源引用治理

優先序：全國法規資料庫 → 主管機關正式法規系統 → 行政院／主管部會 → 財政部稅務入口網 →
智慧財產局 → 數位發展部 → 其他正式政府來源。
律所、會計師事務所、產業協會、部落格**只能作補充解釋，不得取代核心法源**。

## 0.4 法規版本治理

**只把正式生效法規當作 current law。** 預告、草案、future amendment 不得寫成已生效。
同時，**不得因主管機關名稱或組改過渡**就延後遵守現行義務。

## 0.5 Scope Freeze

本 baseline 之 scope 已鎖定。新項目只有符合下列之一才可加入 Phase 1：
(A) 現行 Phase 1 flow 已觸發；(B) 現行文件已承諾但 repo 無能力履行；
(C) 直接造成 `MR-01`～`MR-20` 無法 PASS；(D) 直接造成既有 Gate 無法正確驗收；
(E) 明確的現行法源錯誤。
其餘一律標 `FUTURE` / `DEFERRED`，**不得新增 `PRE`／module／`MR`／Deployment Gate**。

---

# 1. Phase 1 最上位商業模式

MVP Phase 1 採 **Platform-as-Seller**，不是 Creator-as-Seller ＋ Platform 代收代付。

```text
Creator
   │  授權教材及必要再授權權限
   ▼
Platform
   │  以 Platform 自己名義向 Buyer 銷售數位教材使用授權
   ▼
Buyer
```

Buyer 的直接交易對象是 **Platform**。Creator 是內容創作者／授權人，與 Platform 另有內容授權與合作報酬關係。
Phase 1 **不建立** Buyer 與 Creator 的直接買賣或付款關係。

---

# 2. Phase 1 Buyer 付款流程與付款方式說明【MAND-08 正文】

## 2.1 流程

```text
Buyer 建立訂單
↓  Platform 顯示收款銀行帳戶與付款期限
Buyer 於付款期限內銀行轉帳
↓
Buyer 回填必要付款辨識資訊
↓
Admin 查核 Platform 實際銀行入帳並人工比對
↓
Payment Approved → Order Completed → Access Granted → Buyer 下載教材
```

## 2.2 付款方式說明（契約條款）

> **本平台目前提供之付款方式為「指定金融機構帳戶轉帳」。**
> 消費者應於訂單所載**付款期限**內，將訂單金額全額匯入平台指定帳戶，
> 並於平台提供之介面回填付款辨識資訊，供平台人工核對。
> 平台於核對相符後開通教材存取權。
> 本平台目前**不提供**信用卡、電子支付或其他線上即時付款方式；
> 如未來新增付款方式，將於交易前於商品頁與結帳流程清楚揭露。

Buyer 回填欄位至少包含：匯款銀行、帳號後四碼、匯款金額、必要時匯款日期／時間、其他對帳必要資訊。

Phase 1 暫不要求：信用卡、自動金流 API、Webhook、自動對帳、Split payment、Creator 自動 payout。

---

# 3. 三個時鐘（不得互相替代）

```text
order_created_at            →  payment_due_at            （Buyer 付款期限，§7）
payment_info_submitted_at   →  review_due_at             （平台審核 SLA）
payment_received_at         →  tax_document timing       （憑證開立時點，J2 / P6）
```

| 欄位 | 定義 |
| --- | --- |
| `payment_info_submitted_at` | Buyer 告知平台「我已付款」並提交辨識資訊的時間 —— **平台實際被通知的時點** |
| `payment_received_at` | Platform 銀行帳戶**實際收到款項**的時間（Admin 查帳時填入，可能早於發現時間） |
| `payment_approved_at` | Admin 人工確認該筆款項屬於此訂單的時間 |

**`review_due_at` 起算於 `payment_info_submitted_at`**，不得起算於 `payment_received_at`
（後者是 Admin 查帳時才發現的過去時間，從它起算會變成回溯計算）。

**`payment_approved_at` 不得被當作稅務上的收款時點。**

## 3.1 `PAYMENT-REVIEW-SLA`

平台必須在正式營運前訂定**人工付款審核期限**，並於交易前揭露（因其決定交付期日，見 `MAND-07`）。
資料模型至少支援：`payment_info_submitted_at`、`payment_review_started_at`、
`payment_approved_at` / `payment_rejected_at`、`review_due_at`。

**不得存在無限期 pending 的已收款訂單；系統必須能辨識逾時案件。**
具體日數為營運決策，須經 `L-08` 與營運確認後填入。

---

# 4. Creator 報酬模式

Creator **不取得** Buyer 貨款的「餘額」。Platform 依 Creator Agreement 對 Creator 產生**另一筆獨立的報酬債務**。

```text
符合報酬計算條件的教材銷售 → 計算本期 Creator 報酬 → 固定週期結算
→ Platform 人工匯款 → 保存 payout / accounting records
```

Creator Agreement 必須事前說明：結算週期、計算方式、最低結算門檻、未達門檻如何累積、
終止合作如何結清、匯款失敗如何處理、稅務扣繳如何處理、報酬更正方式。

## 4.1 退款的處理方式

**可以：** 本期 Creator 報酬 ＝ 本期符合條件之**淨銷售計算基礎** × 約定比例；已退款交易**不進入計算基礎**。
這是**債務的計算方式**。

**不可以：** `Creator Wallet = 3,000 → Buyer refund 100 → Wallet −100`。
那表示該筆款項原屬 Creator、平台僅代為保管後扣回，會削弱 Platform-as-Seller 的實質。

## 4.2 已結算後才發生的退款

| 情形 | 處理 |
| --- | --- |
| **一般 Buyer 退款**，發生於 Creator 報酬已完成結算並實際支付之後 | **Phase 1 原則由 Platform 吸收**，不向 Creator claw back |
| **Creator fault**（侵權、詐欺、商品資訊重大不實、故意提供錯誤檔案、其他 Creator Agreement 明文責任） | 依 Creator Agreement 另行主張損害賠償或報酬調整 —— 這是**另一筆 Platform ↔ Creator 的法律關係** |

---

# 5. Phase 1 Product Invariants（Creator 端）

- 不做 Creator Wallet
- 不做 Creator Available Balance
- 不做 Creator 自主提款
- 不把 Buyer 款項描述成 Creator 的錢
- 不寫「平台代 Creator 收款」
- 不寫「售價扣平台佣金後餘額即屬 Creator」
- Buyer UI **不把 Creator 顯示為 Seller**；可顯示「創作者」
- Refund 不從 Creator 既有錢包或可提領餘額扣回
- Buyer 不指示 Platform 把某一筆交易款轉付給特定 Creator

上述任一變更 → 依 `PRE-03.8` 重新開啟 `PRE-03`。

---

# 6. `BUYER-STORED-VALUE-LIMIT`

Phase 1 **允許**「特定訂單先付款」（Buyer 對 Order #123 匯款）—— 這**不是**本規則要禁止的 stored value。

Phase 1 **不建立**可供未來不特定交易使用的 Buyer 儲值價值。未經重新 Legal/Tax Review，不做：
Buyer Wallet、Top-up、Paid credits、付費購買點數、Gift card / gift certificate、
可留到未來使用的預存金額、可轉讓 monetary credit、可跨未來訂單抵用的有償儲值價值。

**判準是「有償 vs 無償」，不是「有沒有金額」：**
商品（服務）禮券**不包括發行人無償發行之抵用券、折扣（價）券**。
→ 免費發放的金額型抵用券**排除**；**有償購買**的「點數」即使設計成非金額型，**仍可能是禮券**。

若未來要做有償禮券、付費點數或多用途儲值，必須先完成：
禮券定型化契約適用分析、履約保障機制、電子支付定性、會計與稅務分析。

---

# 7. `BUYER-PAYMENT-DEADLINE`【MAND-08 / §18 I(2) 付款期日】

Phase 1 必須定義並於結帳與訂單詳情**清楚揭露**：

| 項目 | 要求 |
| --- | --- |
| `payment_due_at` | 自 `order_created_at` 起算之付款期限（具體日數為產品決策，正式營運前必須決定） |
| 逾期未付款 | 訂單失效之處理（是否提前提醒、如何通知） |
| **逾期訂單不無條件復活** | **Phase 1 採：逾期未付款訂單失效，不直接復活。** Buyer 若仍要購買，**建立新訂單**並重新完成**當時有效版本**的 disclosure / consent |
| 逾期後才收到款項 | 退還或視為新訂單之處理 |
| 價格變動 | 逾期後價格已變更時，以新訂單當時價格為準 |
| Consent | 舊訂單之 consent **不得**沿用於新訂單（見 Gate 13 第三條斷言） |

---

# `PRE-03` — Platform-as-Seller 實質交易模式驗證

## PRE-03.1 真正 Seller
Platform 應以自己名義對 Buyer 締約、負履約責任、承擔 Buyer refund / remedy responsibility，
並有實質商品與交易管理角色。Creator 報酬是 Platform 對 Creator 的另一筆獨立債務。

## PRE-03.2 第三方支付
由律師確認實際結構是否排除「代理收付網路實質交易款項」定性。
**不能因人工匯款、交易量小或沒有 API 就自行認定不屬第三方支付。**

## PRE-03.3 代銷
由會計／律師確認是否因實際定價、佣金、Creator 報酬、退款與結算安排而被重新認定為受託代銷。

## PRE-03.4 實質判斷因素
Platform 自己名義締約｜對 Buyer 負責｜有實質定價角色｜承擔交易盈虧與退款風險｜
Creator 無 Wallet｜Creator 無自主提款｜Creator 報酬非「買家貨款扣佣後餘額」｜
Buyer UI 不把 Creator 當 Seller｜Terms 不使用「Platform 代 Creator 收款」。

**這些是實質判斷因素，不是法條逐字列出的固定法定要件。**

## PRE-03.5 Creator → Platform → Buyer 再授權
Creator Agreement 必須明確允許 Platform 在約定範圍內向 Buyer 再授權，
**不能只寫「授權平台販售」**（著作權法 §37 III：非專屬授權之被授權人非經同意不得再授權第三人）。

## PRE-03.6 Platform Seller Content / IP Responsibility
Platform 自身的重製、傳輸、交付、授權 Buyer 等利用行為，**不能預設全部受 ISP safe harbor 保護**；
具體法律責任由律師確認（`L-07`）。

## PRE-03.7 封版條件
1. 律師確認 Platform-as-Seller 實質成立
2. 律師確認第三方支付風險
3. 律師確認 Creator → Platform → Buyer 再授權
4. 會計／律師確認非受託代銷或確認其適用效果
5. 會計確認 Creator 報酬所得定性
6. 確認稅籍／發票／收據適用結果
7. Material Rights Review 能力納入產品
8. Product Invariants 已落實

## PRE-03.8 `PRE-03` Reopen Triggers
以下任一變更出現時，**必須重新開啟 `PRE-03`**，不得直接當一般 feature 開發：

1. Creator Wallet / Available Balance
2. Creator 自主提款或自行決定 payout 時點
3. Refund 直接從 Creator 既有餘額扣回
4. Creator 完全決定售價且 Platform 不具實質定價角色
5. Buyer UI 把 Creator 標為 Seller
6. Terms 改成 Platform「代 Creator 收款」
7. Split payment / Marketplace payment
8. Creator KYC 後直接收 Buyer 款
9. Buyer Wallet / Top-up / Paid points / Gift card / Stored-value credits
10. Seller-of-record 從 Platform 改成 Creator
11. 金流改為 Buyer → Platform → Creator 的直接分帳／轉付

### `CREATOR-ADJUSTMENT-SUBSTANCE-TEST`

判斷第 3 項的依據是**該調整的計算基礎**：

- 基礎是「**某筆 Buyer 交易的款項**」→ **觸發 reopen**
- 基礎是「**Platform 因 Creator 違約所受損害**」→ 不觸發

**操作性測試：** 若 `creator_fault_adjustments` 的金額**恆等於**該筆退款金額，
是**重要 red flag**，應觸發 `PRE-03` 實質複核 ——
但**不代表法律上必然是 clawback**。損害賠償應獨立計算，可能小於、等於或大於退款金額。

---

# `PRE-04` — 已售教材版本與更新治理

## PRE-04.1 Order Fulfillment Snapshot
每筆完成交易至少可關聯：`order_item_id`、`material_id`、`material_version_id`、
`fulfilled_file_version`、`fulfilled_at`。

## PRE-04.2 公開教材更新政策
商品頁／Buyer Rules 應**事前**說明教材是否可能更新、更新種類、既有 Buyer 如何取得新版、重大更新如何處理。
**不得寫 Platform 可任意把已售教材換成任何內容。**

## PRE-04.3 更新分級

| 級別 | 範例 | 要求 |
| --- | --- | --- |
| **Patch** | 錯字、broken link、細小排版 | 可評估自動提供新版 |
| **Minor Update** | 少量新增內容、修正答案、部分素材更新 | version record ＋ change reason ＋ Buyer notification |
| **Material Change** | 核心玩法改變、大幅增減頁面、核心功能消失、軟體需求改變、實質變成不同商品 | 另行判斷舊版保留、Buyer consent、replacement 或 remedy |

## PRE-04.4 Existing Buyer Notification
保存 `old_version`、`new_version`、`effective_at`、`change_reason`、`buyer_notification_status`。

## PRE-04.5 Historical Version Rights
Creator Agreement 必須確認 Platform 為既有 Buyer **保存、必要重製與合法繼續交付**歷史版本的權限。

## PRE-04.6 Creator 離開／IP 違法例外
Creator 離開不應自動讓 Platform 失去履行既有 Buyer 合法授權所需的權限；
但舊版本本身侵權、違法或有重大安全問題時，可優先停止提供並進入 notice / remedy。

## PRE-04.7 `PRE-04` Legal Gate
見 `L-10`、`L-11`。

---

# `CONTENT-LIMIT` — Platform Content-Handling Limit

Phase 1 Platform **原則上不得自行實質修改** Creator 教材內容。
即使 Creator Agreement 給了技術利用授權，也**不代表**產品上可以：
改答案、改題目、改學習目標、重寫教材、改變教學意義、大幅重編內容、
或把 Creator 教材變成 Platform 自己的教材。

**法源理由（消保法 §8 II）：**

> 前項企業經營者，**改裝、分裝商品或變更服務內容者，視為第七條之企業經營者**。

也就是說，平台一旦實質修改教材，就從「經銷者」升格為「製造者」，
**喪失 §8 I 但書「證明已盡相當注意」的免責空間**。

內容更新原則上由 **Creator 提交 → Platform 審核 → 新版本**。
因法律、安全或 remediation 需要處理者，應留下 audit record。

Thumbnail、preview generation、excerpt、watermark、compression、format conversion 等技術處理
**不被視為「當然安全」**，需在 `C2` 取得明確授權。

---

# `CONTRACT-EFFECT` — 法律效果

`MAND` 與 `R` matrices **不是內部自訂 checklist**。

## 消保法 §17

| 項 | 效果 |
| --- | --- |
| §17 II | 中央主管機關公告**應記載之事項，雖未記載於定型化契約，仍構成契約之內容** |
| §17 III | 違反公告之定型化契約，其**定型化契約條款無效** |
| §17 IV | 企業經營者使用定型化契約者，**主管機關得隨時派員查核** |

## 消保法 §56-1（違反 §17 之罰則）

經主管機關令其限期改正而屆期不改正者，處 **3 萬～30 萬元**；
經再次令限期改正仍不改正者，處 **5 萬～50 萬元**，**並得按次處罰**。

## 消保法 §18 / §19（另一套機制）

**`§56-1` 未涵蓋 §18。** §18 的主要法律效果是：

| 條 | 效果 |
| --- | --- |
| §19 III | 未依 §18 I(3) 提供解除契約相關資訊者，七日期間**自提供之次日起算**；但自原起算日**已逾四個月者，解除權消滅** |
| §19 IV | 消費者於期間內已交運商品或**發出書面**者，**契約視為解除**（不以平台同意為要件） |
| §19 V | 通訊交易違反本條規定所為之約定，**其約定無效** |

→ **漏 `MAND`／`R` ＝ 行政罰鍰、可按次；漏 §18 ＝ 每筆訂單的解除權暴露最長四個月。**
兩套義務、兩種制裁，**任何一套都不能靠另一套覆蓋**。
§18 是否另有行政罰，見 `L-18`。

**因此不得把「先做部分條款、上線後再慢慢補」當正常合規策略。**

---

# A — Platform Terms / Account / UGC / Security

## A1 年齡規則
正式會員、Buyer、Creator **均須年滿 18 歲**。
目的在降低限制行為能力、法定代理人同意、契約效力未定與 Creator 收款等風險
（民法自 112-01-01 起以 18 歲為成年），**不代表未成年人依法不得瀏覽網站**。
**本規則無例外；未建立未成年人例外制度、法定代理人同意流程或例外核准機制前，不得使用「原則上」等模糊表述。**

## A2 帳號基本規則
資料真實、不冒用、不不當共用、妥善保管帳密、發現異常立即通知。

## A3 帳號遭冒用
應記載事項第十二點要求：企業經營者應於知悉消費者之帳號密碼被冒用時，
**立即暫停該帳號所生交易之處理及後續利用**。

產品需具備：Account Freeze、**立即**暫停相關交易、暫停 payout、暫停敏感資料變更、
重新驗證、解凍流程、audit trail。

## A4 Reviews / User Content
涵蓋 rating、review、comment、Q&A 與未來 UGC。
禁止假評論、操縱評分、spam、騷擾、冒用、侵權、違法內容、揭露他人個資、故意誤導。
Platform 可依**公開規則**隱藏、移除、限制或停權。

## A5-1 Platform System Security Commitment【MAND-13】

> **本平台應確保其與消費者交易之電腦系統具有符合一般可合理期待之安全性。**

涵蓋 authentication、access control、交易與付款資料保護、secure download、
incident response、vulnerability handling，並與 `K` 聯動。

## A5-2 User Security Prohibitions
使用者不得攻擊、掃描／利用漏洞、繞過驗證、未授權存取、散布 malware、破壞服務或自動化濫用。

## A6 Account Enforcement
可有 warning、restriction、suspension、termination，
但**不得寫成 Platform 可隨時任意終止且全面免責**（`R4`）。
處置原因應**事前公開、合理、合法、可追溯**，並提供申訴管道。

## A7 電子文件作為意思表示方法【MAND-04】

> **交易雙方同意以電子文件作為意思表示之方法。**

包括電子結帳、勾選確認、訂單確認、電子郵件與電子通知。
電子文件之效力、保存、版本與日後查驗由 `H` 負責。

## A8 契約解釋原則【MAND-02】

> **本契約條款如有疑義時，應為有利於消費者之解釋。**

平台**不得**於任何條款中記載「以平台之解釋為準」或其他反向條款。

---

# B — Privacy Policy

至少涵蓋：Platform legal entity、account、email、role、orders、banking / payment info、
payment proofs、Creator info、Creator tax identity data、payout info、support、complaints、
IP reports、activity logs、security logs、consent evidence、entitlement records。

## B1 個資法 §8 告知事項（九項）
1. **非公務機關名稱**
2. 蒐集之目的
3. 個人資料之類別
4. 利用之期間
5. 利用之地區
6. 利用之對象
7. 利用之方式
8. 當事人依 §3 得行使之權利及方式
9. **當事人得自由選擇提供個人資料時，不提供將對其權益之影響**

## B2 不提供資料的影響
Buyer 不提供必要付款辨識資料 → 可能無法完成付款確認；
Creator 不提供依法必要的稅務資料 → 可能無法完成合法報酬支付。

## B3 個資法定權利
不得要求預先放棄查詢、閱覽、複製、補充、更正、停止蒐集／處理／利用、刪除等適用權利（`R1`）。
亦不得記載個人資料得為契約目的必要範圍外之利用（`R2`）。

## B4 Third-party Processor / Cross-border
依真實資料流說明 hosting、cloud、email、analytics、payment、support、security、backup；
如有境外處理，反映 cross-border processing。

## B5 Tax Data
`P` / PRE-TAX 若要求 ID number、統一編號、tax residence、address、entity type 等，
**Privacy notice 必須同步更新後再蒐集**（見 `T-12`）。

---

# C — Creator Content Licensing & Cooperation Agreement

## C1 Creator Rights
依法存在的權利仍屬 Creator 或合法權利人，Platform 不因上架取得整體 ownership。

## C1-A Subsequent Transfer
**著作權法 §37 II：** 「前項授權**不因著作財產權人嗣後將其著作財產權讓與或再為授權而受影響**。」
→ Creator 後續讓與著作財產權或再授權第三人，不應當然使既有 Platform license 失效。

## C2 Platform Rights（須逐項明確授權）
**法源理由（著作權法 §37 I）：** 「授權利用之地域、時間、內容、利用方法或其他事項，依當事人之約定；
**其約定不明之部分，推定為未授權**。」

須逐項列舉：storage、reproduction、search / listing display、public transmission、delivery、
download、promotion、security processing；
以及 **thumbnail、preview generation、excerpt、watermark、compression、format conversion**
—— 後者即使取得授權，仍受 `CONTENT-LIMIT` 拘束。

## C3 Buyer Sublicense
明確允許 Platform 向 Buyer 再授權，定義 recipient、use scope、duration、territory、
copy / printing、classroom display、download、transfer restrictions 與再授權限制。

## C4 Historical Version Rights
配合 `PRE-04`，確認 Platform 可保存已售版本、必要重製歷史版本、
向既有 Buyer 交付依法可繼續提供的版本。

## C5 License Type
MVP 原則為**非專屬授權**；Creator 原則上可於其他合法通路提供自己的教材。

## C6 Creator Exit / Existing Buyers
Creator 停止合作**不自動終止**既有 Buyer 已合法取得的 sublicense。

## C6-A Sublicense Survival
Creator Agreement 必須明文處理 head license 因下列原因終止時，既有 Buyer sublicense 的存續範圍與條件：
Creator 主動退出、契約到期、Platform 違約導致 Creator 終止、雙方合意終止、
**Platform 停業／解散**、Creator 死亡／法人消滅、著作權後續讓與。
**IP infringement / illegal content 應保留例外**（見 `M3`）。

## C7 Listing Accuracy
Creator 提供的商品資訊必須真實、完整、不重大誤導，包括 pages、file type、age、subject、
answer key、editable、software requirement、video、preview、learning goals、media。

## C8 Malware
禁止 virus、malware、harmful macros、malicious script、dangerous link、harmful file。

## C9 Creator Compensation
PRE-TAX 完成前統一使用中性詞 **「Creator 報酬」**，
**不要**先定義成權利金、版稅或執行業務所得（見 `T-09`）。

## C10 Repeat Infringement
Creator Agreement 必須**事前**告知 repeat infringement / three-strike 類處置政策
（著作權法 §90-4 I 第 2 款要求事前告知）。

---

# D — Material Rights Declaration + Platform Rights Review

## D1 每份教材都要聲明
不是 Creator onboarding 勾一次就永遠有效。

## D2 涵蓋權利
text、image、illustration、photo、font、music、audio、video、trademark、logo、character、
stock material、third-party work、likeness、personal data、children's photos、children's voice。

## D3 權利聲明用語

> **Creator 確認對本教材及其內容具有足以合法上架、展示、利用、販售、交付及授權使用之
> 權利、授權或其他合法依據。**

**不要**一律要求「我擁有全部著作權」——
純由 AI 自主運算生成、利用人僅下指令未投入精神創作者，可能不受著作權法保護（見 `O8`）。

## D4 Portrait / Children
一般人物肖像、兒童影像／聲音與可識別個資需有合法權利、同意、授權或其他適法依據
（民法 §18／§195 人格權、肖像權、隱私權 ＋ 個資法）。

## D5 Material Rights Review
至少保存：`material_id`、`reviewed_at`、`reviewed_by`、`risk_flags`、`review_result`、
`notes`、`declaration_version`、`evidence_if_required`。

**Platform-as-Seller 下，Creator 的勾選不足以證明平台盡了注意義務**（見 `PRE-03.6`）。

## D6 High-risk Review Flags
Disney、Pokémon、Sanrio、知名角色、品牌、商標、Logo、stock images、fonts、
掃描書籍、音樂、第三方人物照片、AI 仿知名角色。

## D7 Special Child-Identity Protection Flag
若內容涉及**兒少法 §69 特定情形**（受虐或遭疏忽、藥物濫用、否認子女／收養／親權／監護等身分事件、
刑事案件或少年保護事件之當事人或被害人），且足以識別兒少身分者，
**升級為特殊高風險內容**，除法律例外情形外不得公開。
**不得把一般兒童照片一律套用 §69。**

---

# E — Buyer License / Product Accuracy / Remedies

## E1 Buyer License
Buyer 購買**數位教材使用授權**，不取得 copyright ownership。

## E2 Single Educator License
**允許：** 本人、家長自己的孩子、教師自己負責的學生、合理列印、課堂展示。
**禁止：** 分享 source file 給其他老師、公開上傳、open cloud sharing、resale、
sublicense、modified resale、冒充作者。

## E2-A 訂購數量與重複購買【MAND-06】

> **本平台之數位教材授權以「授權」為計算單位，非以實體件數計算。**
> 同一買受人帳號已有效持有某一教材之單一教學者授權時，
> **不得就同一教材重複購買以取得第二份相同授權。**
> 需供多人使用者，應待本平台提供多席次／機構授權方案時另行購買，
> **不得以增加訂購數量之方式形成多席次授權。**

## E3 Product Listing / Advertising Accuracy【MAND-03】

> **本平台商品交易頁面所呈現之教材名稱、價格、內容、規格、檔案格式、授權範圍
> 及其他重要交易資訊，均為契約之一部分。**

Platform-as-Seller 對 Buyer 有自己的對外責任（消保法 §22：企業經營者應確保廣告內容之真實，
其對消費者所負之義務**不得低於廣告之內容**；並注意公平交易法 §21 虛偽不實或引人錯誤表示之風險）。

不得有虛假頁數、假功能、誤導適用年齡、假折扣／原價、假內容、假銷量、假 review。
須有 listing declaration、review、correction、takedown、Buyer remedy。

## E4 訂約前確認機制與履約【MAND-05】

> **一、確認機制：** 本平台於消費者訂立契約前，提供教材種類、數量、價格、付款方式、
> 付款期限、交付方式及其他重要事項之**確認機制**，供消費者於送出訂單前查核與修正。
>
> **二、履約：** 契約成立後，本平台應**確實依契約內容履行**，
> 包括於付款經核對相符後，依所揭露之交付方式開通教材存取權。

## E5 交付方式【MAND-07】

> **本平台之教材為數位內容，以線上方式交付，不涉及實體寄送。**
> 消費者於付款經本平台核對相符並開通後，
> 得以其帳號登入本平台之「我的教材」等指定介面，取得該教材之下載或存取權。
> 交付所需時間取決於本平台之付款審核期限（見 §3.1）。
>
> **消費者取得之教材版本、後續更新是否提供、以及重大變更之處理，
> 依本平台公開之教材更新政策辦理（見 `PRE-04.2`／`PRE-04.3`）。**
> 每筆訂單保存其實際履約之教材版本（`PRE-04.1`）。
> 本平台**不承諾無條件永久下載**（見 `E7`）。

## E6 運費【MAND-09】

> 本平台教材為純數位內容，**不涉及實體運送，故無運費**。
> 如未來因新增服務而產生其他費用，將於交易前清楚揭露。

## E7 法定解除權、數位內容例外與平台退款政策【MAND-10】

**本條分三層，順序不得顛倒。**

### 第一層 — 法定權利（§18 I(3)）

> **通訊交易之消費者，依消費者保護法第十九條規定，得於收受商品或接受服務後七日內，
> 以退回商品或書面通知方式解除契約，無須說明理由及負擔任何費用或對價。**
> **行使方式：** 消費者得於期間內以書面（含電子文件）通知本平台，
> 或依本平台於「消費申訴」介面提供之解除申請流程提出。
> 本平台受理後之處理程序見 `Gate 14`。

### 第二層 — 法定例外（消保法 §19 I 但書 ＋ 準則 §2 第 5 款）

> 「**非以有形媒介提供之數位內容**或一經提供即為完成之線上服務，
> **經消費者事先同意始提供**」者，為解除權之合理例外情事。
>
> **例外不是商品屬性，是交易流程要件。**
> 必須在**開始提供數位內容之前**完成「明顯告知 ＋ 消費者主動事先同意」，
> 並保存**該筆訂單**的同意證據，例外才成立。
> **同一份教材，同意流程有做的訂單例外成立、沒做的訂單不成立。**
>
> 本平台**不得**以「所有數位教材一律不適用七日解除權」之概括記載取代上述逐筆判斷；
> 依 §19 V，違反 §19 規定所為之約定**無效**。

### 第三層 — 排除解除權適用之情形（§18 I(4)）

> 本平台之數位教材，於已依第二層完成告知與事先同意，
> 且已開始提供數位內容者，屬前述合理例外情事，不適用七日解除權。
> 未完成上述流程者，**不屬**例外情形。

### 第四層 — 平台自願退款政策（與法定權利分離）

> 本平台**目前不另提供**超出法律要求之任意反悔退款；
> 但此**不影響**消費者依法享有之解除、終止、瑕疵救濟、履約請求或其他法定權利。

## E8 Remedy
至少處理：corrupted file、missing content、wrong material、重大描述不符、duplicate payment、
access failure、Platform non-performance、infringement takedown 與其他依法應提供的救濟。
處理能力見 `Gate 14`。

## E9 No Unconditional Permanent Download
**正式禁止**「購買後可永久下載」。
Buyer 取得**長期使用授權**；Platform re-download service 受
Platform 仍營運、帳號狀態、教材仍合法可提供及其他合理條件限制。
**此決定不得改回。**

## E10 已下載副本
本平台可撤銷未來之存取與重新下載權（`Gate 14`），
但**技術上無法收回消費者已下載至其裝置之檔案副本**。
契約解除或授權終止後，消費者對既有副本之義務，依 `L-20` 律師核定之條款文字。

---

# F — Digital Content Rescission Exception Notice

**必須獨立、明顯、主動確認、不得預勾，且在開始提供數位內容之前完成。**
不得只埋在註冊 Terms 或購買規則中。

## F1 UI
independent notice ｜ prominent ｜ no pre-check ｜ before access granted ｜ 可完整閱讀

## F2 Order-level Evidence
每筆訂單保存：
`order_id`、`exception_disclosure_version`、`consent_accepted`、`consent_accepted_at`、
`access_granted_at`。

**核心順序：** 告知 → Buyer 主動同意 → 留存證據 → 才提供下載／存取。
**不得**先讓其下載、之後補同意。
**不得**只存一個全站性的「已同意」—— 判斷單位是**交易／訂單**。

驗收斷言見 `Gate 13`。

---

# G — IP Infringement / ISP Requirements

## G1 Notice Process
Notice → Initial Review → Restriction / Takedown → Notify Creator →
Response / Counter Process → Follow-up → Enforcement。
通知與回復通知之應載事項、5 個工作日補正期限，依《網路服務提供者民事免責事由實施辦法》。

## G2 Contact
依法適用時公告：name、address、phone、**fax**、email，及接受電子簽章之格式說明。

## G3 §90-4 ISP Checklist（四款）
1. 告知使用者其著作權／製版權保護措施，**並確實履行該保護措施**
2. **事前**告知使用者若有三次涉有侵權情事，應終止全部或部分服務
3. 公告接收通知文件之**聯繫窗口資訊**
4. 如著作權人已提供**經主管機關核可**之通用辨識或保護技術措施，依法配合執行
   —— **目前是否存在適用措施需實證確認，不能自行假設有或沒有**（`L-19` 同一紀律，見 `L-11`）

## G4 Seller 行為
Platform 自身的 reproduction、transmission、licensing、delivery
**不得預設**因 notice-and-takedown 就一定免責（`PRE-03.6`／`L-07`）。

---

# H — Legal Document / Consent / Version Governance

## H1 Evidence
至少保存：`user_id`、`document_type`、`version`、`effective_date`、`accepted_at`、`context`；
如適用加 `order_id`、`material_id`。

## H2 `H-VERSION`
所有需要 consent 的 Legal Documents **必須 versioned**；舊版**不得覆寫**，必須可回溯。

## H3 Major Update / Re-consent
重大影響 rights、obligations、payment、privacy、Buyer license、Creator compensation 時，
須評估 notice / re-consent。

## H4 Electronic Evidence
**不能只存 `accepted = true`。** 應保存 version、content snapshot / immutable copy、
timestamp、context、relation ID。
一般情況不要求所有 consent 使用 PKI 數位簽章
（電子簽章法 2024 全文修正後，電子文件不得僅因其電子形式而否認其法律效力）。

## H5 Legal Consent UI
勾選前可完整閱讀 ｜ 可再次開啟 ｜ 顯示 version / effective date ｜ 不 pre-check ｜
不 dark pattern ｜ **不要求放棄審閱權**（`R9`）｜ 給合理審閱機會（消保法 §11-1）。
**不把「一定 scroll 到底」誤寫成唯一法定方式。**

## H6 §18 II — 可完整查閱並儲存

> 經由網際網路所為之通訊交易，§18 I 應提供之資訊
> 應以**可供消費者完整查閱、儲存**之電子方式為之。

驗收：至少提供一種真正可保存的方式（下載、列印、另存 PDF、可複製完整正文）。
**scroll-locked modal、圖片版條款、僅可線上瀏覽且無法保存者，不符合。** 見 `Gate 12`。

---

# I — Age / Minors

正式會員、Buyer、Creator **均須年滿 18 歲**（見 `A1`）。
理由：民法自 112-01-01 起以 18 歲為成年，此規則使平台所有契約當事人均為完全行為能力人，
避免民法 §77～§79 之效力未定與法定代理人承認問題，
並簡化 Creator 收款與稅務處理。**無例外。**

---

# J — Order / Payment / Tax Document / Fulfillment Timeline

至少保存：

```text
order_created_at
payment_due_at                        （§7 BUYER-PAYMENT-DEADLINE）
payment_info_submitted_at
review_due_at                         （起算於 payment_info_submitted_at）
payment_received_at                   （銀行實際入帳）
tax_document_required_at              （如適用）
tax_document_issued_at                （如適用）
payment_approved_at / payment_rejected_at
order_completed_at
access_granted_at
fulfilled_material_version_id
first_downloaded_at

refund_or_remedy_requested_at
refund_approved_at / refund_rejected_at
refund_paid_at
tax_document_reversal_required_at     （如適用）
tax_document_reversal_completed_at    （如適用）

consent_accepted_at
exception_disclosure_version
entitlement_status / access_suspended_at / access_restored_at
```

## J1 Contract Formation
**禁止**產品文件直接寫 `Admin approve = 法律上契約成立`。
系統狀態與法律契約成立分離，由律師依 offer、acceptance、checkout、payment、confirmation 判斷（`L-08`）。

> 註：現行「零售業等網路交易定型化契約應記載及不得記載事項」**已無**「已付款視為契約成立」之規定
> （該用語於 105.7.15 修正時刪除）；行政院消保處亦說明應記載事項第 5 點之確認機制
> 「無涉契約成立與否判斷問題，契約關係應回歸適用民法與消費者保護法判斷」。

## J2 Tax Document Timing
`P` / PRE-TAX 決定**是否**需要統一發票／何種憑證；
**一旦依法有開立義務，時點依法律，不是產品自由決定。**
工程**不得**把 `payment_approved_at` 預設成稅務上的收款時點。

## J3 Refund 與 Tax Reversal 是兩個事件
**退款款項已人工匯回 ≠ 稅務憑證沖銷已完成。** 兩組時間戳不得互相推導。

---

# K — Personal Data Lifecycle / Security / Business Termination

## K1 Lifecycle
`collection → access → use → retention → backup → deletion / anonymization → business termination`

## K2 Payment Data
bank info、last four digits、payment proof 應明確定義：
哪些 Admin 可看、**Creator 原則上不應無必要查看**、retention、deletion、backup、access log。

## K3 Security Maintenance Plan ＋ Post-Termination Method
若平台屬《數位經濟相關產業個人資料檔案安全維護管理辦法》適用業者，
正式營運時應已具備並執行**兩份**文件：

1. **個人資料檔案安全維護計畫**
2. **業務終止後個人資料處理方法**

該辦法 §3 要求兩者一併訂定；**§20 自發布日（112-10-12）施行，原始三個月過渡期已屆滿**，
**不得主張新上線後另有自己的三個月寬限期**。
適用性依 `P0` 之行業別與登記結果確認（`T-01`）。

## K4 Breach
**嚴格區分**：

| | 現行已生效 | 已公布但未施行 |
| --- | --- | --- |
| 依據 | 數位經濟產業個資辦法 §19 | 個資法 §12 修正（114-11-11 公布，**施行日期由行政院另定**） |
| 通報 | 危及正常營運或大量當事人權益之事故，**72 小時內通報數位發展部** | 72 小時通知當事人／通報個資會 |

**不得混用兩者的通報時點。**

## K5 Business-Termination Data Handling
Platform 業務終止時，依資料類型決定 destroy / transfer / delete / stop processing / 依法續存。
**涵蓋範圍：** Buyer accounts、orders、payment proof、bank data、Creator info、
Creator tax data、payout data、consent evidence、complaints、complaint attachments、
IP reports、**`report_events`**、**`activity_logs`**、security logs、entitlement records、
material binaries。

**依個資辦法 §16，處理方式與應留存紀錄如下，且相關紀錄至少保存五年：**

| 方式 | 應記載 |
| --- | --- |
| **銷毀** | 銷毀之**方法、時間、地點及證明銷毀之方式** |
| **移轉** | 移轉之**原因、對象、方法、時間、地點**及**受移轉對象得蒐集該個人資料之合法依據** |
| **刪除、停止處理或利用** | 其**方法、時間或地點** |

## K6 `RETENTION-MATRIX`（purpose-based）

**模型：** purpose-based retention ＋ legal / business basis ＋ deletion / anonymization rule ＋ legal hold。
**明確否決**「所有適用期間取最大值」的模型 ——
個資法 §11 III：「個人資料蒐集之特定目的消失或期限屆滿時，應…**刪除、停止處理或利用**該個人資料。
但因**執行職務或業務所必須**或經當事人書面同意者，不在此限。」
→ 對個人資料而言，**過度保存本身即需落入但書才合法**。

**本表由 `B` 模組之資料類別 1:1 推導。**

| # | 資料／資產 | Purpose | Legal / business basis | Retention rule | Deletion / anonymization | Legal hold | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RM-01 | 帳號基本資料（account / email / role） | 提供服務、身分辨識 | 契約履行 | 帳號存續期間 ＋ 爭議期間 | 目的消失後刪除或假名化 | 適用 | Platform |
| RM-02 | Orders | 履約、對帳、爭議 | 契約履行 ＋ 稅務 | 依 `T-14` 稅務保存年限 | 期滿後刪除 | 適用 | Platform |
| RM-03 | Banking / payment info（含末四碼） | 付款核對 | 契約履行 | 核對完成 ＋ 爭議期間 | 期滿後刪除 | 適用 | Platform |
| RM-04 | Payment proofs | 付款核對、爭議舉證 | 契約履行 | 同 RM-03 | 期滿後刪除 | 適用 | Platform |
| RM-05 | Creator info | 合作關係管理 | 契約履行 | 合作存續 ＋ 結算與爭議期間 | 期滿後刪除 | 適用 | Platform |
| RM-06 | **Creator tax identity data** | 扣繳與憑單申報 | **法定義務** | 依 `T-14` | 期滿後刪除 | 適用 | Platform |
| RM-07 | Payout records | 財務、稽核、稅務 | 法定義務 ＋ 稽核 | 依 `T-14` | 期滿後刪除 | 適用 | Platform |
| RM-08 | Complaints ＋ **attachments / evidence**（含 Buyer 提供之銀行證明） | 消費爭議處理（§43） | 契約履行 ＋ 法定 | 結案 ＋ 爭議期間 | 期滿後刪除 | 適用 | Platform |
| RM-09 | IP reports | 侵權處理（§90-4） | 法定 ＋ 業務必須 | 案件結案 ＋ repeat-infringement 追蹤所需 | 期滿後刪除或假名化 | 適用 | Platform |
| RM-10 | **`report_events`**（案件內容） | 案件處理歷程 | 業務必須 | 同 RM-09 | 同 RM-09 | 適用 | Platform |
| RM-11 | **`activity_logs`**（稽核軌跡，含 `actor_id`／`actor_role`） | 稽核完整性、爭議舉證、資安 | **個資法 §11 III 但書「執行業務所必須」** —— **理由與期限須明文，見 `L-21`** | 期限待 `L-21` 確認；**不得預設永久保存** | 期滿後依 `L-21` 決定保留／假名化／匿名化 | 適用 | Platform |
| RM-12 | Security logs | 資安事件調查 | 業務必須 | 依資安政策 | 期滿後刪除 | 適用 | Platform |
| RM-13 | Consent / version evidence | 證明 Terms 與解除權例外之同意 | 法定舉證 | 至少涵蓋 §19 III 之**四個月**暴露窗 ＋ 契約爭議期間 | 期滿後刪除 | 適用 | Platform |
| RM-14 | Entitlement records | 授權存續與爭議稽核 | 契約履行 ＋ 稽核 | 授權存續 ＋ 爭議期間 | 期滿後刪除 | **適用** | Platform |
| RM-15 | **Material binaries / fulfilled versions** | 履行 Buyer entitlement、`PRE-04` 履約版本 | 契約履行 | **有任何 entitlement dependency 期間**（見 `K7`） | 無依賴且無 hold 後回收 | **適用** | Platform |
| RM-16 | Business-termination action log | 個資辦法 §16 | **法定** | **至少五年** | 五年後且無其他保存義務 | 適用 | Platform |
| RM-17 | Tax documents（發票／收據／沖銷憑證） | 稅務 | 法定 | 依 `T-14` | 期滿後銷毀 | 適用 | Platform |
| RM-18 | **Support records**（非申訴之一般客服往來） | 客服與服務品質 | 契約履行 | 結案 ＋ 合理追溯期間 | 目的消失後刪除或假名化 | 適用 | Platform |

> **`RM-14` 與 `RM-15` 的保存期限是兩件事**，不得綁成同一天刪除。

## K7 `ENTITLEMENT-RETENTION-INVARIANT` 與 cleanup

**`revoke` 的語意是「暫停未來交付」，不是移除 entitlement 記錄。**

某歷史教材檔案（`RM-15`）只有在下列條件**全部成立**時，才進入 physical deletion eligibility：

1. 無 active Buyer entitlement 依賴
2. 無 `suspended` / `revoked_pending`（可恢復）entitlement 仍需要該版本
3. 無 `PRE-04` fulfillment obligation 需要該版本
4. `legal_hold = false`
5. 無 IP process 要求保存證據（**以 `legal_hold` 表達**）
6. Creator Agreement / Buyer license 不再要求提供
7. 其他適用保存義務已完成 —— **必須可列舉，且列舉的查證來源須記錄**（同 `G3` 第四款紀律）

**實作要求：**

- **`legal_hold` 為記錄上的一級欄位**（`legal_hold`、`hold_reason`、`hold_set_at`、`hold_released_at`），
  由業務流程設定；**cleanup 只讀取、不判斷**
- **cleanup 必須 fail-closed**：任何依賴檢查失敗或結果不確定 → **不刪**
  （本 repo 既有慣例：`Backend/config/privateFileStorage.js` production ＋ local 時 fail-closed）
- **`revoked_final` 仍不等於檔案可刪** —— 須看是否還有其他 dependency

---

# L — Service vs Marketing

**Service notifications：** orders、payment、access、password reset、安全事件、IP notice、重要法律更新。
**Marketing：** promotion、recommendation、newsletter。

依個資法 §20 II／III：
當事人表示拒絕接受行銷時應**即停止**；
**首次行銷時應提供當事人表示拒絕接受行銷之方式，並支付所需費用**
—— 拒絕管道之成本由平台負擔，**不得轉嫁使用者**。

---

# M — Delisting / Buyer Rights / Platform Shutdown

## M1 Ordinary Delisting
停止新售；既有 Buyer 原則上維持既有合法 license。

## M2 Creator Departure
Creator 離開**不自動終止**既有 Buyer sublicense（與 `C6`／`C6-A` 一致）。

## M3 IP / Illegal Takedown
Platform 可依法停止 download / distribution / access，
並通知 Buyer、提供合理 remedy / refund / replacement（依情況）。
此為 `C6-A` sublicense survival 之**例外**。

## M4 Platform Obligation
Platform-as-Seller **不得**因 Creator 離開就把 Buyer 問題全部推回 Creator。

## M5 Permanent Download Retirement
**不得承諾無條件永久下載。**
Buyer 有**長期使用授權**；Platform download service 是**有條件服務**。
必須持續區分兩者。**此 invariant 不得移除。**

## M6 Version Governance
連動 `PRE-04`：Order 保存履約版本、更新有版本、重大更新通知、IP takedown 可優先停止舊版。

## M7 Platform Service Discontinuation
Platform 自己停止服務時至少處理：

| 對象 | 處理 |
| --- | --- |
| **Buyer** | 合理**事前通知**、**final download window**、pending orders、未結爭議與退款、交易紀錄取得、長期 license 之法律效果 |
| **Creator** | 停止新售日、最後報酬計算期間、未結報酬、最後 payout、稅務憑單、歷史教材處理 |
| **Data** | 連動 `K5`／`K6` 決定 destroy / transfer / delete / stop processing / 續存 |
| **Platform** | 完成未履行義務、合理通知與收尾 |

**不得寫成「Platform 可隨時關站且概不負責」**（`R4`）。條款文字見 `L-15`。

---

# N — Business Identity / Consumer Complaint / External Escalation

至少公開：
**法人／營運主體正式名稱（必填）**、**負責人／代表人（必填）**、
**營業所或事務所地址（必填）**、**電話（必填）**、**電子郵件信箱（必填）**、
統一編號（依實際營運主體型態，見 `P0`）、客服窗口、legal navigation。

> `MAND-01`（應記載事項第一點）與消保法 §18 I(1) **均無條件**要求負責人／代表人資訊；
> 僅統一編號因主體型態而異，得標示為依實際情形。

## N1 Consumer Complaint Workflow
至少：`complaint_id`、`created_at`、`category`、`assignee`、`status`、
`statutory_due_at`、`responded_at`、`response_history`、`resolution`、`attachments / evidence`。

## N2 15-Day SLA
消保法 §43 II：企業經營者對於消費者之申訴，應於申訴之日起**十五日內妥適處理之**。
系統需有 `statutory_due_at`、逾期告警、回應紀錄。

## N3 Buyer External Payment Evidence
付款爭議**不得**只以 Platform 自己的系統／銀行紀錄為唯一認定依據（`R7`）。
Buyer 得提供 bank transfer proof、ATM receipt、banking screenshot、金融機構交易證明或其他合理證據；
complaint workflow 必須能承接附件／證據。

## N4 External Consumer Dispute Escalation
Legal / Support Page 應揭露外部管道：
消費者保護團體、直轄市／縣（市）政府**消費者服務中心或其分中心**（消保法 §43 I）、
**消費者保護官**（§43 III）、**消費爭議調解委員會**（§44）、
以及全國消費者服務專線。實際聯絡資訊上線時以官方最新資料為準（`L-17`）。

---

# O — AI Material Policy

## O1 AI Allowed
允許 ideation、drafting、text assistance、image generation、editing、layout assistance。

## O2 Human Responsibility
Creator 必須 review、edit、validate 並對最終商品負責。

## O3 Structured AI Disclosure
Material data 至少有 `uses_generative_ai` = Yes / No，**不只靠 description**。

## O4 Buyer Display
適度標示「AI 輔助製作」，**不做恐嚇性警示**。

## O5 Prompt
不要求 Creator 公開完整 prompt。

## O6 IP / Accuracy
AI **不能**成為免責理由；Creator 仍對 accuracy、educational suitability、IP、privacy、
likeness、child safety、misleading content 負責。

## O7 AI Laundering
禁止取得別人的教材後用 AI 洗稿、換圖再宣稱原創。

## O8 AI Copyright
**不假設**所有 AI output 都存在 Creator copyright
（智慧財產局 112-06-16 函釋：完全由 AI 獨立自主運算生成、利用人僅下指令未投入精神創作者，
不受著作權法保護）。統一採「權利／授權／合法依據」表述（`D3`）。

## O9 AI Governance
`O` 接受 `H` 的版本／政策更新治理。
《人工智慧基本法》已於 2025-12-23 三讀通過、自公布日施行、全 20 條、主管機關為國科會、**無罰則**；
其風險分類框架與各目的事業主管機關之作用法**仍在發展中**，`O` 須持續追蹤。

---

# P — Payment / Tax / Invoice / Creator Compensation / Closure

## P0 Operating Entity & Registered Business Scope
正式營運前確認：營運主體型態（個人／商號／公司）、正式名稱、統一編號、
公司／商業登記狀態、**實際營業項目**、稅籍狀態、網路銷售相關登記。
若未來涉及第三方支付或有償禮券／stored-value，需確認相應營業項目與主管要求。
**此為 `N` 揭露、`P2`～`P6` 稅務與（若適用）能量登錄資格之共同前提。**

## P1 Transaction Classification
確認 Platform Seller、third-party payment、consignment 三者定性（`L-01`～`L-03`／`T-02`）。

## P2 Tax Registration
是否可暫免或何時必須登記，依實際營運主體、銷售額、行業分類與稅務規則判定；
**達依法條件不得延後**。（自 114-01-01 起，銷售貨物起徵點 10 萬元／月、**銷售勞務 5 萬元／月**；
數位教材屬電子勞務。）

## P3 Digital Material Tax Classification
純數位教材之實際稅務分類由會計確認，**不因「PDF」三個字就自行做全部稅務結論**（`T-03`）。

## P4 Invoice
是否使用統一發票依稅籍與國稅局核定，**不得自行假設 20 萬以下一定不用**
（網路銷售是被核定使用統一發票的常見理由之一）。

## P5 Receipt
**免用統一發票 ≠ Buyer 不需要任何合法交易憑證。**

## P6 Tax Document Timing
一旦依法需開立，時點必須符合法規
（營業人開立銷售憑證時限表：買賣業以發貨時為限，**但發貨前已收之貨款部分應先行開立**；
銷售勞務多數業別以收款時為限）。**結果回寫 `J`。**

## P7 Creator Compensation
正式稅務定性前一律使用中性詞 **「Creator 報酬」**。

## P8 PRE-TAX Payout Gate
**第一次正式 Creator payout 前**，必須完成所得性質、扣繳與申報定性
—— 實際申報**沒有「中性所得類別」**可無限延後。
在此之前：earning accrual **可以**計算，actual payout **不得**進入正式 production。

## P9 Creator Tax Identity
Onboarding 資料模型預留 individual／business／company-entity／resident／non-resident 等身分類型；
**具體蒐集欄位待會計確認後啟用，並先同步更新 `B5`。**
Creator 之稅務身分同時決定平台取得何種進項憑證（`T-12`）。

## P10 Creator Compensation Ledger
至少：

```text
creator_id
period
gross_calculation_basis
current_period_excluded_refunds
creator_fault_adjustments
platform_absorbed_post_settlement_refunds
adjustment_type / adjustment_basis / calculation_method
related_order_id / related_incident_id / supporting_evidence
tax_category_if_confirmed
tax_withheld_if_applicable
net_amount
paid_at / payment_reference
status / approved_by / approved_at
```

`creator_fault_adjustments` **必須另存損害計算依據**，不得只有金額
（否則稽核時無法與 clawback 區分，見 `CREATOR-ADJUSTMENT-SUBSTANCE-TEST`）。

## P11 No Wallet
**Compensation ledger ≠ Creator wallet。**

## P12 Accounting Auditability
人工 payout 必須記錄：誰計算、誰核准、何時付款、多少、payment reference、對應 period。

## P13 Business Closure Financial Settlement
Platform 停業時處理 final Creator compensation、outstanding payout、Buyer refund liabilities、
tax documents、tax filing、accounting retention、unresolved transaction records。

## P14 Tax Document Reversal / Adjustment

發生退款、解除或折讓時之憑證沖銷。**三維 decision tree，各分支由 PRE-TAX 填入：**

```text
Dimension 1 — 憑證型態
  ├─ paper invoice          （統一發票使用辦法 §20）
  ├─ electronic invoice     （§20-1：存根檔／收執檔／存證檔之電子流程）
  └─ receipt / invoice-exempt（小規模營業人免用統一發票之合法憑證）

Dimension 2 — Buyer 身分
  ├─ business buyer         （有統編；收執檔可作進項扣減）
  └─ non-business consumer  （本平台主要客群，多數無統編）

Dimension 3 — Filing status
  ├─ already filed
  └─ not yet filed
```

**不得寫死為「所有退款都要求 Buyer 出具紙本四聯證明單」** —— 紙本與電子流程不同。
結果回寫 `J`（`tax_document_reversal_*`）。見 `T-08`。

> **電子發票 Scope Lock：** 電子發票 **API 串接、自動開立、自動折讓／退回、自動申報整合**
> 維持 **`DEFERRED` / Future Tax Automation**，**不是 Phase 1 Day-1 blocker**。
> Phase 1 必須完成的是 `P4`／`P14` 的正確定性與流程位置，並由會計師確認現階段合法憑證流程。
> 僅當會計師或適用法律確認電子發票已成為本平台**當期強制義務**時，才升格為 Deployment Blocker。

---

# MANDATORY CONTRACT MATRIX — 14 / 14

> **法律效果見 `CONTRACT-EFFECT`。** 每一列均指向**實體段落**，不得只有 Matrix 對應。

| ID | 必須涵蓋 | 實體段落 |
| --- | --- | --- |
| MAND-01 | 企業經營者資訊 | **`N` 首段**（負責人／代表人必填） |
| MAND-02 | 契約疑義採有利消費者解釋 | **`A8`** |
| MAND-03 | 商品名稱、價格、內容、規格等資訊為契約內容 | **`E3` 首段** ＋ `C7`／`D`／`PRE-04` |
| MAND-04 | 電子文件作為意思表示方法 | **`A7`** ＋ `H` |
| MAND-05 | 訂約前確認機制 ＋ 契約成立後確實履約 | **`E4`（兩半皆有）** |
| MAND-06 | 訂購數量上限／同教材重複購買 | **`E2-A`** |
| MAND-07 | 交付地／交付方式 | **`E5`** ＋ `PRE-04` |
| MAND-08 | 付款方式 | **`§2.2`** ＋ **`§7`**（付款期日） |
| MAND-09 | 運費 | **`E6`** |
| MAND-10 | 退貨／解除權正面記載 | **`E7`（四層結構）** ＋ `F` |
| MAND-11 | 個人資料保護 | **`B`** ＋ `K` |
| MAND-12 | 帳號冒用**立即**處理 | **`A3`** |
| MAND-13 | 系統安全 | **`A5-1`** ＋ `K` |
| MAND-14 | 消費爭議（Internal ＋ External） | **`N1`／`N2`／`N3`／`N4`** |

---

# PROHIBITED CLAUSE MATRIX — R1～R8 ＋ R9

| ID | 不得記載 | 對應 |
| --- | --- | --- |
| **R1** | 消費者預先拋棄或限制個資之查詢閱覽、製給複製本、補充更正、停止蒐集處理利用、刪除等權利 | `B3` |
| **R2** | 個人資料得為契約目的必要範圍外之利用 | `B3` |
| **R3** | 企業經營者得片面變更商品之規格、原產地與配件且消費者不得異議；或得單方變更契約內容<br>對數位教材包括 content、format、version、included files、promised features —— 與 `PRE-04` 直接連動 | `PRE-04.2`／`E3` |
| **R4** | 企業經營者得**任意**終止或解除契約；或預先免除其終止／解除時應負之賠償責任 | `A6`／`M7` |
| **R5** | 消費者放棄或限制依法享有之契約解除權或終止權 | `E7` |
| **R6** | 廣告／商品資訊僅供參考 | `E3` |
| **R7** | 如有糾紛，**限**以企業經營者所保存之電子交易資料作為認定相關事實之依據 | `N3` |
| **R8** | 排除消保法 §47 或民訴 §436-9 小額訴訟管轄法院之適用 | 條款撰寫（`L-13`） |
| **R9** | 使消費者拋棄合理審閱權（消保法 §11-1 II：**無效**） | `H5` |

---

# GOVERNANCE INVARIANTS

## `H-VERSION`
所有需取得 consent 的 Legal Documents 必須 versioned，舊版不可覆寫，
且每次新 baseline 都必須在 Master Regression Matrix 中檢查其是否仍存在。

## `No Permanent Download`
不得對 Buyer 承諾無條件永久下載。必須持續區分
「Buyer 長期使用授權」與「Platform 有條件的 hosting / re-download service」。

---

# EXTERNAL LEGAL GATES（`L-01`～`L-23`）

| ID | 名稱 | 狀態 | Evidence requirement |
| --- | --- | --- | --- |
| L-01 | Platform-as-Seller 實質定性 | PENDING | 律師意見書 |
| L-02 | 是否構成代理收付網路實質交易款項 | PENDING | 律師意見書 |
| L-03 | 是否被認定受託代銷 | PENDING | 律師＋會計 |
| L-04 | Creator → Platform → Buyer sublicense（§37 III） | PENDING | 律師意見書 |
| L-05 | Head-license 終止後 sublicense survival（含 Platform 解散） | PENDING | 律師意見書 |
| L-06 | 歷史版本保存／交付所需授權範圍 | PENDING | 律師意見書 |
| L-07 | Platform 自身 IP responsibility（避風港對交付段不適用） | PENDING | 律師意見書 |
| L-08 | 契約成立時點（民法 §153）＋ 付款審核期限之合理性 | PENDING | 律師意見書 |
| L-09 | 數位內容解除權例外之正式文案與流程時點 | PENDING | 律師核定文案 |
| L-10 | `PRE-04` 更新分級與 Buyer 舊版權利 | PENDING | 律師意見書 |
| L-11 | ISP §90-4 四款適用性（含第四款是否存在核可措施） | PENDING | 律師意見 ＋ 查證紀錄 |
| L-12 | 定型化契約審閱期（§11-1）之 UI 落實 | PENDING | 律師意見書 |
| L-13 | 消費者管轄條款（§47／民訴 §436-9） | PENDING | 律師意見書 |
| L-14 | 停售／Creator 離開／Buyer 權利 | PENDING | 律師意見書 |
| L-15 | Platform service discontinuation 條款 | PENDING | 律師意見書 |
| L-16 | 定型化契約適用範圍與主管機關（前言修正**仍為草案**，2025-01-16 公報） | PENDING | 律師意見 ＋ 發布狀態查證 |
| L-17 | 消費爭議外部升級管道文案與聯絡資訊 | PENDING | 律師意見書 |
| L-18 | §18 是否另有行政罰（§56-1 僅涵蓋 §17） | PENDING | 律師意見書 |
| L-19 | §18 I(6) 目前是否存在適用之主管機關公告 | PENDING | **實證查證紀錄** |
| L-20 | 解除後 Buyer 對已下載副本之義務文字 | PENDING | 律師核定文案 |
| L-21 | `activity_logs` 稽核軌跡 vs 個資法 §11 III 之調和（但書理由與期限） | PENDING | 律師意見書 |
| L-22 | `RETENTION-MATRIX` 各列之 legal basis 覆核 | PENDING | 律師意見書 |
| L-23 | 未來 Buyer stored-value／禮券之定性 | **DEFERRED** | 啟用時才需要 |

**Active：22　Deferred：1　Validated：0**

---

# EXTERNAL TAX / ACCOUNTANT GATES（`T-01`～`T-15`）

| ID | 名稱 | 狀態 | Evidence requirement |
| --- | --- | --- | --- |
| T-01 | `P0` 營運主體、公司／商業登記、統一編號、營業項目 | PENDING | 登記文件 |
| T-02 | Platform Seller vs 受託代銷之稅務認定 | PENDING | 會計師備忘 |
| T-03 | 數位教材之稅務分類（電子勞務） | PENDING | 會計師備忘 |
| T-04 | 稅籍登記時點與起徵點認定 | PENDING | 國稅局核定文件 |
| T-05 | `P4` 是否使用統一發票／是否為小規模營業人 | PENDING | 國稅局核定文件 |
| T-06 | 免用統一發票時之合法交易憑證形式 | PENDING | 會計師備忘 |
| T-07 | `P6` 憑證開立時點並回寫 `J` | PENDING | 會計師備忘 |
| T-08 | `P14` 退回／折讓沖銷（三維 decision tree 逐分支） | PENDING | 會計師備忘 |
| T-09 | Creator 報酬所得定性 | PENDING | 會計師備忘 |
| T-10 | 扣繳率、免扣繳門檻、憑單申報 | PENDING | 會計師備忘 |
| T-11 | 非居住者 Creator 處理 | PENDING | 會計師備忘 |
| T-12 | Creator 稅務身分類型與應蒐集欄位（回寫 `B5`／`P9`） | PENDING | 會計師備忘 |
| T-13 | Business closure 之會計與稅務收尾（`P13`） | PENDING | 會計師備忘 |
| T-14 | 稅務憑證與帳簿之保存年限（回寫 `RETENTION-MATRIX`） | PENDING | 會計師備忘 |
| T-15 | 未來有償禮券／stored-value 之稅務效果 | **DEFERRED** | 啟用時才需要 |

**Active：14　Deferred：1　Validated：0**

---

# DEPLOYMENT / OPERATION GATES（1～14）

> **狀態必須 evidence-backed（`STATUS-EVIDENCE`）。**
> repo 沒有實作即維持 `NOT IMPLEMENTED`；**不得為了讓文件看起來完成而改狀態。**

| Gate | 名稱 | Acceptance criteria | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Account Freeze | 凍結帳號、**立即**暫停在途交易與 payout、暫停敏感資料變更、重新驗證、解凍流程、audit trail | **PARTIAL**（2026-08-26） | **已具備：** `users.account_status`（`active`／`frozen`）＋ 凍結／解凍稽核六欄（`migrations/20260826_account_freeze_foundation.sql`）；`middlewares/accountStatus.js` 於**敏感寫入路徑即時查 DB**（**不放進 JWT** —— token 7 天會讓凍結延遲生效，違反「立即」）；fail-closed；`POST /admin/users/:id/{freeze,unfreeze}` ＋ activity log；db test `accountFreeze.db.test.js`（6 case）＋ HTTP 實測（凍結後 `POST /orders`／`/reviews` 皆 403 `account_frozen`）。**未具備：** Admin Users 管理 UI、使用者端的凍結狀態顯示、解凍申請／客服入口、重新驗證流程、payout 暫停（payout 能力本身尚不存在） |
| 2 | Material Rights Review | `D5` 全欄位（含 `declaration_version`、`evidence_if_required`）＋ `D6`／`D7` risk flags ＋ 可留存審核紀錄 | **PARTIAL**（2026-08-26 擴充） | **已具備：** 獨立的 append-only `material_rights_reviews` 表（`migrations/20260826_material_rights_review_foundation.sql`）——`reviewed_at`／`reviewed_by`／`review_result`（4 值）／`risk_flags`（11 值 CHECK，涵蓋 `D6` 與 `D7` 的 `child_identity`）／`notes`／`declaration_version`／`declaration_consent_id`／`evidence_reference`；審查歷程可累積；`needs_evidence` 強制附說明；`POST/GET /admin/materials/:id/rights-review(s)` ＋ activity log；db test `materialRightsReview.db.test.js`（8 case）＋ HTTP 實測。**與 `materials.reviewed_*`（一般內容審核 latest snapshot）及 `ip_declaration_*`（Creator legacy 聲明）刻意分離** ——真實資料佐證：173 份教材有 `reviewed_by`，權利審查記錄為 0。**未具備：** Admin 審查 UI、證據檔案儲存流程、Creator 聲明的版本化接線（待正式條文）、與上架流程的關聯規則 |
| 3 | Consumer Complaint ＋ 15-day SLA | `N1` 全欄位、`statutory_due_at`、逾期告警、`N4` 外部管道揭露 | **PARTIAL**（2026-08-26） | **已具備：** `consumer_complaints` ＋ `consumer_complaint_events` ＋ `consumer_complaint_evidence` 三表；`N1` 欄位對照 —— `complaint_id`／`created_at`＋`submitted_at`／`category`(`complaint_type`, 8 值)／`assignee`(`assigned_to`)／`status`(5 態狀態機)／**`statutory_due_at`**／`responded_at`／`response_history`(`consumer_complaint_events`)／`resolution`(`resolution_summary`)／`attachments / evidence`(`consumer_complaint_evidence`)；**`N2` 十五日 SLA** —— canonical policy `utils/complaintSla.js`（消保法 §43 II ＋ 民法 §120 II 始日不算入 ＋ §121 I 末日終止 → **末日 ＝ 申訴之台灣日曆日 + 15 天，期間終止於該日台北 23:59:59.999**；2026-08-26 提出 → 末日 **2026-09-10**。日曆日一律以 `Asia/Taipei` 判斷，不得用 UTC 日或主機本地日。**§122 末日休息日展延為 `REQUIRED / NOT IMPLEMENTED`** —— 無權威假日來源，故本值為**最早可能**的法定末日，逾期偵測偏保守，不得作為法律上已逾期之認定，追蹤見 `LEGAL-01`），`statutory_due_at` 建立時寫入不再改，**逾期偵測用 DB 條件**（`GET /admin/complaints?overdue=1` ＋ partial index），已結案不再計為逾期；**`N3` 買家外部證據** —— 檔案（新 private storage namespace `complaint-evidence`，沿用 `paymentProofPolicy` 三層驗證含 magic bytes）或純文字 `externalReference`，`storage_key`／`checksum` 不外流，**刻意不重用 `manual_payment_proofs`**（避免爭議截圖進入付款核准佇列）；Buyer 端 `POST/GET /me/complaints`、`GET /me/complaints/:id`、`POST /me/complaints/:id/evidence`（**刻意不套 `requireActiveAccount`** —— 凍結帳號可能正是冒用被害人）；Admin 端 `GET /admin/complaints`（含 `?overdue=1`）、`GET /admin/complaints/:id`、`POST /admin/complaints/:id/transition`（`message` 必填；`resolved`/`closed` 另需 `resolutionSummary`）、`/link-remedy-case`；稽核 `complaint.submitted`／`status_changed`／`evidence_added`／`remedy_case_linked`；內部註記不外流給申訴人。**三種 case 分離：** `reports`（內容檢舉）≠ `consumer_complaints`（買家交易申訴）≠ `refund_remedy_cases`（補救處理）；complaint 為上游 intake，**不自動建立 remedy case**，`resolved` ≠ 已退款。建立或處理申訴**不動** `orders.status`／`paid_at`／`payment_received_at`／`entitlement_status`／稅務。unit test `complaintSla.test.js`（11 case，含 +16 誤算的回歸案例、跨月／跨年／閏年、台北 vs UTC 日曆日邊界、無日光節約時間假設、§122 未實作的釘樁）＋ db test `consumerComplaint.db.test.js`（11 case）＋ HTTP 實測（他人訂單 403、未登入 401、夾帶 `buyerId` 無效、**凍結後 `POST /orders` 403 而 `POST /me/complaints` 201**、buyer 讀 admin 清單 403、缺 `message` 400、跳關 409、缺 `resolutionSummary` 400、買家歷程 2 筆 vs Admin 3 筆、resolved 後訂單仍 `approved` 且 remedy case 0）。**已具備（2026-08-27 擴充 —— Buyer / Admin Complaint UI，Wave 2 #10）：** **user-facing flow 已完整接線** —— Buyer 入口在訂單詳情（`/me/orders/:orderId` → `/me/complaints/new?orderId=`，正確的交易 context）；`/me/complaints` 清單、`/me/complaints/new` 表單（**無 orderId 亦可**，供帳號遭冒用）、`/me/complaints/:id` 詳情含歷程／證據／補件；Admin `/admin/complaints` 佇列＋詳情（`AdminReviewWorkspace` pattern，含 `?status=` 與 `?overdue=1`），可執行 backend 已支援的全部處理 action（transition ＋ link-remedy-case）；導覽入口在「信任與安全」分組，與內容檢舉並列但分開。**無任何 frontend-only 狀態** —— 法定期限與逾期一律讀 backend 的 `statutory_due_at` / `overdue` / `daysUntilDue`；`?overdue=1` 是 DB 查詢條件不是前端過濾；買家與 Admin 的歷程差異來自 backend 的 `forBuyer` 過濾。狀態／類型／轉移表的前端對照（`lib/complaint-labels.ts`）與 backend **逐字一致**，由 `complaintUiContract.db.test.js` 斷言不得漂移。loading／empty／error／permission／terminal 五態齊備；終態不呈現必定失敗的控制項。db test `complaintUiContract.db.test.js`（8 case）＋ E2E `complaint-ui.spec.ts`（15 case，desktop 與 mobile 各 15/15）＋ HTTP 實測（他人讀取 403、未登入 401、buyer 讀 admin 端點 403、夾帶 `buyerId` 無效、跳關 409 附 `allowed`、缺 message 400、缺 resolutionSummary 400、**Admin 歷程 3 筆含 internal_note／買家 2 筆不含**、結案後補件 409）＋ 真實瀏覽器驗證（Buyer 與 Admin 對同一筆申訴：買家看不到內部註記、Admin 看得到；透過 UI 執行 transition 後 DB canonical state 確實變更；mobile 375×812 無 horizontal overflow）＋ smoke exit 0 ＋ `npm run verify:web` 全綠。 **已具備（2026-08-27 擴充 —— 逾期告警／escalation，Wave 2 #11）：** **站內 Admin attention surface 為第一個正式 overdue delivery channel** —— `/admin/dashboard/summary` 新增 `overdueComplaintsCount`；`/admin` 在**有逾期時**顯示告警區塊（數字 ＋ deep link `?status=overdue`），**無逾期時完全不顯示，不製造假警告**；佇列的逾期徽章與期限轉為 error 色並附「已逾期 N 天」；詳情在逾期時顯示橫幅（逾期天數 ＋ 法定期限 ＋ §43 II），terminal 案件不顯示。**單一判準 `OVERDUE_SQL`** —— `isOverdue()` / `?overdue=1` / `countOverdue()` 三個 consumer 共用，dashboard **不得**手寫 status 清單（由測試斷言）；**terminal-state correctness**：`resolved` / `closed` 即使期限早過也永遠 `overdue=false`；**不需要 scheduler** —— 純 read-time 計算，狀態一轉 terminal 下一次讀取即正確。db test `complaintOverdueAlert.db.test.js`（9 case）＋ E2E `complaint-overdue-alert.spec.ts`（8 case）＋ HTTP 實測（建立 → 推期限 → `overdue=true` 且 dashboard count 與 `?overdue=1` **筆數一致** → resolved → 兩者同時歸零 → closed 亦然；非 Admin 403／401）＋ 真實瀏覽器驗證（dashboard 顯示「2 件」→ 點擊進入 filtered queue 恰 2 列 → 透過 UI 結案一筆後 count 2→1、佇列 2→1、該案橫幅消失 → 兩筆都處理完後**告警整塊消失**；mobile 375×812 無 overflow、CTA 高 44px 未裁切）＋ smoke exit 0 ＋ `npm run verify:web` 全綠。 **仍未具備（因此不得標 IMPLEMENTED）：** `N4` 外部管道揭露文案（屬 `L-17`，Legal/Support Page）、Email／SMS／push 等**站外**通知管道（**本輪明確排除**，需新的 notification infrastructure）、PDF 證據型別（刻意未開放）、`assigned_to` 的指派流程（backend 有欄位但無指派 API）、**民法 §122 末日休息日展延**（需權威國定假日來源，`LEGAL-01`）|
| 4 | Buyer external payment evidence | 付款爭議可上傳／附加外部證據（`R7`／`N3`） | **PARTIAL**（2026-08-27 修正） | **狀態更正說明：** 舊 evidence 寫「無 complaint attachment 能力」，該敘述自 **2026-08-26 Wave 2 #6** 起即不成立（同表 Gate 3 列本身就記載了 `N3` 的三表與 storage namespace）。此為**文件落後於實作**，非狀態升級。 **已具備（上傳，Wave 2 #6）：** `consumer_complaint_evidence` ＋ 新 private namespace `complaint-evidence`；`POST /me/complaints/:id/evidence` 二選一（檔案 or 純文字 `externalReference`）；型別政策沿用 `utils/paymentProofPolicy.js`（JPG/PNG/WebP ＋ 三層驗證含 magic bytes）；DB 兩條 CHECK 確保「有 key 就有完整 metadata」，不產生看得到讀不到的列。 **已具備（讀取／交付，2026-08-27 Wave 2 #13）：** **在此之前證據是 write-only —— 買家與 Admin 都打不開附件，等於 `R7` 的禁止狀態原封不動。** 新增 `GET /me/complaints/:id/evidence/:evidenceId/file` 與 `GET /admin/complaints/:id/evidence/:evidenceId/file`，**兩條路由共用同一個 `resolveEvidenceForAccess()`**（授權只有一份，由測試斷言兩個 route 檔都不得自行查 evidence 表）；**ownership 來自 `consumer_complaints.buyer_id` 而非 `orders.user_id`**（申訴可無 `order_id`）；**IDOR 綁定**同時綁 `id` ＋ `complaint_id`，Admin 身分不豁免；五個確定性錯誤碼（404 complaint / 404 evidence / 403 forbidden / 409 純文字無檔 / 503 實體遺失），**任何情況不回退公開路徑、訊息不含檔案系統路徑**；交付沿用 `utils/fileDownloadResponse.js`（`private, no-store` ＋ `nosniff` ＋ RFC 6266/5987 雙 filename），inline 為預設、`?download=1` 為 attachment **且只有那時才寫** `complaint_evidence_downloaded` 稽核（meta 不含 storage key）；前端走 authenticated blob fetch（`lib/complaint-evidence.ts`），**token 不進 query string／DOM**，Buyer 與 Admin 共用 `EvidenceAttachment.tsx`。db test `complaintEvidenceDelivery.db.test.js`（15 case）＋ E2E `complaint-evidence-delivery.spec.ts`（desktop 9/9、mobile 9/9）＋ HTTP 全鏈實測 **18/18**（位元組 sha256 與原檔相符／anonymous 401／非擁有者 403 且無位元組／買家打 admin 路由 403／Admin 200／IDOR 買家與 Admin 皆 404／純文字 409／`?download=1` attachment ＋ 稽核 1 筆而 inline 0 筆／路徑遍歷與 NUL 安全拒絕）＋ 真實瀏覽器驗證（Buyer 與 Admin 皆由 blob 解碼出真實影像 `naturalWidth>0`；另一位登入買家直打檔案路徑 403、未登入 401；Admin 只打 admin scope；DOM 無 `storage_key`／`checksum`／JWT；mobile 375×812 無 overflow、tap target 44px）。 **仍未具備（因此維持 PARTIAL）：** `N3` 明文列舉的「**金融機構交易證明**」常見形式為 PDF，而 **PDF 型別刻意未開放** —— 是否為 Gate 4 completion requirement，取決於「法律上必須接受哪些金融證明格式」，屬 Legal / `L-17` 範圍，**BLOCKED ON PARALLEL LEGAL / PRODUCT DECISION**，不由工程自行認定。 |
| 5 | Consent versioning | `H1` 全欄位、舊版不覆寫、可回溯、`H6` 可儲存 | **PARTIAL**（2026-08-26） | **已具備：** `consent_records` 表（`H1` 全欄位 ＋ `document_content_hash`）（`migrations/20260826_consent_records_foundation.sql`）；**append-only trigger** 強制既有事實不得改寫（H-VERSION）；更正走 `supersede()` 寫新記錄；`consent.service.js` 提供寫入與回溯查詢；db test `consentRecords.db.test.js`（7 case）。**未具備：** **尚未接線任何流程**（註冊 consent 仍只在前端、教材聲明仍是 legacy 無版本）——因 repo 無任何經核可法律文件，接線會保存指向不存在版本的假證據；`H6` 可儲存能力（Gate 12）；文件版本生命週期；re-consent 行為 |
| 6 | 三個時鐘 ＋ `PAYMENT-REVIEW-SLA` | `payment_received_at`／`payment_info_submitted_at`／`review_due_at`；逾時可偵測；**不得存在無限期 pending 的已收款訂單** | **PARTIAL**（2026-08-26） | **已具備：** `orders.payment_due_at`／`payment_info_submitted_at`／`review_due_at`／`payment_received_at` 四欄分離（`migrations/20260826_payment_timing_foundation.sql`）；`paid_at` 語意未變；買家提交憑證時寫入 `payment_info_submitted_at`（`paymentProof.service.js`）；Admin 核准可明確帶入 `paymentReceivedAt`（未提供則保持 NULL，**不預設 NOW()**）；`manual_payment_proofs.reported_*` 四欄；db test `paymentTiming.db.test.js`。 **已具備（2026-08-26 第二次擴充 —— manual payment information wiring，Wave 2 #8）：** **買家申報鏈已接線** —— `POST /orders/:id/payment-proof` 接受 `reportedBankName`／`reportedAccountLast4`／`reportedAmount`／`reportedTransferAt`（全部選填，既有「只上傳圖片」流程未變），canonical validator `utils/reportedPayment.js`（**只驗格式不驗真偽**：不比對申報金額與訂單金額 —— 金額不符是爭議事實不是輸入錯誤；無銀行代碼表、無帳戶所有權驗證、無 KYC；**只收末四碼**）；申報值寫進**每一列憑證**，**重新提交建立新列且不覆寫舊申報**；**Admin 讀取鏈已接線** —— `GET /admin/payment-proofs`／`/:id` 回傳四個 `reported_*` ＋ `order_payment_info_submitted_at` ＋ `order_payment_received_at`；**Buyer UI** 新增選填匯款資訊欄位（明示「平台會再與銀行實際入帳紀錄核對」）；**Admin UI** 新增「購買者申報的匯款資訊」區塊（每個標籤都標示為購買者填寫，**不得**寫成實際入帳）＋「銀行實際入帳時間」輸入（**不確定請留空，不要猜**）。**兩個事實來源並存永不互相覆寫**（買家「我 8/26 14:00 匯了 480」vs 平台「銀行顯示 14:03 入帳」）。unit test `reportedPayment.test.js`（9 case）＋ db test `paymentInfoWiring.db.test.js`（8 case）＋ HTTP 實測（四種驗證各回 400；買家夾帶 `paymentReceivedAt`／`paid_at` 無效；非 Admin 403／401；核准不填入帳時間 → **仍為 NULL，未預設 NOW()**；填入後**四個時間各自不同**（申報匯款／平台查證入帳／收到付款通知／Admin 核准）；未來時間 400）＋ `npm run verify:web` 全綠。 **已具備（2026-08-26 第三次擴充 —— payment deadline ＋ review SLA 落地，Wave 2 #9）：** **兩個數字已由產品拍板並落地** —— Buyer 付款期限 **7 個日曆日**（起算 `orders.created_at`）、人工核帳 SLA **3 個日曆日**（起算 `orders.payment_info_submitted_at`），canonical 為 `utils/paymentTimingPolicy.js`（日期算術共用 `utils/taiwanCalendar.js`，**與消費申訴 15 日完全分離，不共用任何數字**）；**皆為日曆日不是工作日** —— 避免引入國定假日行事曆依賴（`LEGAL-01` 未被牽動）；**末日終了模型**（台北 23:59:59.999），與買家看到的「請於 YYYY/MM/DD 前」及 §18 I(2) 的「付款期日」一致；建單時寫入 `orders.payment_due_at`、提交付款資訊時寫入 `orders.review_due_at`（**退件後重新提交會重設審核週期**，舊提交的期限不再壓在新提交上）；**舊的 `PAYMENT_DUE_DAYS = 3` SELECT 推算已完全移除** —— 那個 3 從未被拍板，且會對 legacy 訂單算出它們從未被揭露過的期限；**Legacy 訂單一律 NULL、不 backfill、不 fallback、不被判定為逾期**（Admin 與 Buyer 皆誠實顯示「未設定付款期限（舊訂單）」）；Buyer 端 `/me/orders`、`/me/orders/:id`、付款憑證頁顯示實際期限；Admin 端顯示付款期限與核帳期限並標示「核帳已逾時」，逾時偵測可用單一 SQL；**買家可見 SLA 文案已全部改為「通常 1 個工作日內完成，最遲 3 個日曆日內完成」** —— 先前四處承諾的小時級審核時間（從未拍板、無 backend 追蹤、比實際 SLA 更緊）已清零，前端文案單一來源 `frontend/apps/web/lib/payment-timing.ts`；「通常 1 個工作日」刻意實作為**字串常數**，永遠進不了計算。unit test `paymentTimingPolicy.test.js`（11 case）＋ db test `paymentDeadlines.db.test.js`（9 case）＋ HTTP 實測（真實 checkout 建單 → 期限相差 7 日曆日且為末日終了；提交 → 3 日曆日；核准後 `review_overdue` 轉為 false；legacy 訂單全為 null；全表 2026-08-26 前建立卻有期限的訂單 = 0；訂單狀態集合無 `expired`）＋ smoke exit 0 ＋ `npm run verify:web` 全綠。 **已具備（2026-08-27 第四次擴充 —— 逾期付款 enforcement，Wave 2 #12）：** `payment_due_at` 從「只是顯示」變成真正的**寫入閘門**（實作前實測：逾期訂單兩條 upload 路由**都回 201** 且仍能被核准）。拍板 **Option A + A2** —— 期限治理「**第一次有效提交**」而非訂單生死：逾期且**從未**提交 → `409 payment_deadline_expired` 且**無 partial write**（憑證列 0、`payment_info_submitted_at`／`review_due_at` 未寫、private storage 檔案數不變）；**曾在期限內提交過者不因平台審核時間失去補件權**；期限內提交仍在審核中者完全不受影響。**未新增 `orders.status = 'expired'`、無排程／cron／自動狀態轉移**（沿用 `order_progress_state` 的推導狀態先例）。`payment_info_submitted_at` 因**會被後續提交覆寫**（實查 17 筆）而**不可**用於 A2 判定，改以 `manual_payment_proofs` 的 `COALESCE(uploaded_at, created_at) <= payment_due_at`。enforcement 位於 `orderService.uploadProof()` 這個**唯一寫入閘門**（legacy route 共用同一 handler，無繞道），且置於 ownership 檢查**之後** —— **授權先於期限**，non-owner 一律 403，不得由 deadline 錯誤得知訂單存在與否。Buyer 與 Admin 皆回傳推導欄位 `payment_submission_allowed` / `payment_deadline_expired`（**前端不自算**；A2 情境下兩者會不一致，這正是不能重算的原因）。legacy `payment_due_at IS NULL` 一律豁免且**不 backfill**。canonical 為 `utils/paymentTimingPolicy.js`，規格見 `mvp_rules.md` §12.3a.3。db test `paymentDeadlineEnforcement.db.test.js`（14 case）＋ E2E（desktop/mobile 各 9/9）＋ HTTP 8/8 情境實測 ＋ smoke exit 0 ＋ `verify:web` 全綠。 **仍未具備（因此維持 PARTIAL）：** **自動過期**（**刻意未做** —— 無 `orders.status = 'expired'`、無排程、無自動取消；Admin 可辨識但系統不自己動手）、逾時**告警**的送達管道、既有 179 筆 legacy pending 訂單的**一次性營運處置**（本輪只產出分類報告，未處置）、「核准前必須有 `payment_received_at`」是否為硬性要求（牽涉會計認列時點，External Tax Gate `PENDING`）|
| 7 | Order fulfillment version snapshot | `PRE-04.1` 五欄位 ＋ `PRE-04.4` 通知欄位 | **PARTIAL**（2026-08-26 擴充） | **已具備：** `order_items.fulfilled_material_version_id` / `fulfilled_at` ＋ `ON DELETE RESTRICT`；**寫入端已接線** —— 付款核准的**同一個 transaction** 內寫入履約版本（`orderService.recordFulfillmentSnapshot`，由 `routes/admin.js` 核准流程呼叫）；三個守衛：無 `approved_file_id` 不寫（不製造假履約證據）／已有快照不覆寫／逐品項各自解析；db test `fulfillmentSnapshot.db.test.js`（7 case，含換版不改寫、多品項、rollback）＋ smoke 實測（真實核准流程寫入 1 筆且與 `material.approved_file_id` 一致）。**未具備：** `PRE-04.4` 通知欄位與更新分級；**下載仍動態解析最新 `approved_file_id`** ——「Buyer 是否有權取得履約當時版本／平台可否只提供最新版」屬 `PRE-04.7` / `L-10`，**待律師確認，不由工程決定**；`first_downloaded_at` 未實作 |
| 8 | PRE-TAX before first Creator payout | 第一次正式 payout 前完成所得定性、扣繳、憑單；`P10` ledger 存在 | **NOT IMPLEMENTED** | 無 payout 能力 |
| 9 | Security Maintenance Plan ＋ **Post-Termination Personal Data Handling Method** | **兩份文件**皆存在並執行；`K5` 三類處理欄位 ＋ 五年紀錄 | **NOT STARTED**（適用性待 `P0`／`T-01`） | 個資辦法 §3 要求兩份 |
| 10 | Platform Service Discontinuation Plan | `M7` 四組（Buyer／Creator／Data／Platform）皆有處置 | **NOT IMPLEMENTED** | — |
| 11 | Buyer Payment Deadline | `payment_due_at`、逾期處理、逾期付款處理、consent 版本處置（不復活） | **PARTIAL**（2026-08-27 重新判定；2026-08-30 `DOC-01` 同步至本表） | **狀態更正說明：** 本欄原寫 `NOT IMPLEMENTED` / evidence `—`，該敘述自 **2026-08-27 Wave 2 #12（`W2-12`）** 起即不成立 —— `docs/pending-work-tracker.md` 當日已把本 Gate 判為 `PARTIAL`，但**本表未同步**，屬**文件落後於實作**，非狀態升級。**已具備：** `orders.payment_due_at` 期限治理（`Backend/utils/paymentTimingPolicy.js` 為單一 policy 來源；`services/orderService.js` 5 處引用）＋ 逾期偵測與 enforcement ＋ `tests/paymentDeadlineEnforcement.db.test.js` ＋ `tests/paymentDeadlines.db.test.js` ＋ `tests/paymentTiming.db.test.js` ＋ E2E `payment-deadline-enforcement.spec.ts`。**仍缺：** acceptance criteria 第 4 條「**consent 版本處置（逾期訂單不復活舊版 consent）**」尚未接線 —— 它需要**已發布的法律文件版本**才有意義，因此 blocked on `P1-09` 條文定稿。**另：** 179 筆 legacy `pending_payment` 訂單 `payment_due_at IS NULL`，刻意豁免、不 backfill，處置決定見 tracker `OPS-01`。→ **維持 `PARTIAL`，不得升 `IMPLEMENTED`。** |
| 12 | Legal Information Read & Save | §18 資訊可**完整查閱並儲存**（下載／列印／複製全文） | **PARTIAL**（2026-08-27 重新判定；2026-08-30 `DOC-01` 同步至本表） | **狀態更正說明：** 本欄原寫 evidence「無 `/terms`／`/privacy` route」，**該敘述已不成立** —— 四條 public route 於 `P1-09` Legal Foundation 建立，並已隨 `REL-01` 進版控（commit `391ed7b`）：`app/terms/page.tsx`／`app/privacy/page.tsx`／`app/refund/page.tsx`／`app/creator-agreement/page.tsx`，共用 `components/legal/LegalDocumentPage.tsx`。`docs/pending-work-tracker.md` 已於 2026-08-27 判為 `PARTIAL`，本表未同步，屬**文件落後於實作**。**已具備：** 固定的 route → document type mapping（不接受任意查詢字串）；正文以保留段落的純文字呈現（無 markdown/HTML renderer，避免 XSS 面）；**沒有 published 版本即 `notFound()`，絕不 fallback 到 draft、不顯示空殼卡片**。**仍缺（兩項，皆不得忽略）：** (1) acceptance criteria 要求的**儲存能力** —— 下載／列印／複製全文的 affordance **尚未實作**（2026-08-30 實測：renderer 內 `download`／`print`／`列印`／`下載`／`複製` 命中 **0**）；(2) **沒有任何已發布文件**（`legal_documents` 兩個 DB 皆 0 列），因此 production acceptance 無從完成。**route 存在 ≠ Gate IMPLEMENTED** —— 維持 `PARTIAL`。交付能力的實作追蹤於 tracker §17 CONDITIONAL；「未發布即 404、絕不洩漏 draft」的回歸護欄追蹤於 tracker `TEST-01`。 |
| 13 | Digital Content Consent Ordering | **三條斷言**：consent 存在／`consent_accepted_at ≤ access_granted_at`／`consent_disclosure_version` 相符 | **NOT IMPLEMENTED** | — |
| 14 | Rescission & Remedy Capability | 人工銀行退款 ＋ refund/remedy case ＋ state machine ＋ audit trail ＋ **獨立 entitlement 狀態**（不得改 `orders.status`）＋ revoke＝暫停交付 ＋ `legal_hold` 一級欄位 ＋ cleanup fail-closed ＋ tax reversal 節點 ＋ `P10` adjustment basis ＋ `RM-14`／`RM-15` 保存期限分離 | **PARTIAL**（2026-08-26 擴充） | **已具備：** `order_items.entitlement_status` 四值 ＋ 稽核欄位；**suspend／restore／revoke 的可操作能力**（`services/entitlement.service.js`：合法轉移表、`revoked_final` 為終態、reason 必填、`activity_logs` 留歷程）；`POST/GET /admin/order-items/:id/entitlement`；**三個 A 類 entitlement consumer 已全數對齊**（下載授權／`GET /me/materials`／評價資格），B 類 revenue/reporting 刻意未加條件；db test `entitlementTransition.db.test.js`（8 case）＋ HTTP 實測（suspend 後訂單仍 `approved`、`paid_at` 不變、履約快照仍在）。**已具備（2026-08-26 第二次擴充）：** `refund_remedy_cases` 表（8 種 case type、7 種 status、`buyer_id` 自訂單帶入、`order_item_id` 可選且驗證同訂單）；state machine 於 `services/refundRemedy.service.js`，**`approved` 必經 `remedy_pending` 才能 `completed`**，DB 另有 `rrc_refund_paid_requires_completed` 擋住「未完成卻有退款時間」；人工銀行退款紀錄欄位（`refund_method` / `refund_reference` / `refund_paid_at`）；`POST/GET /orders/:orderId/remedy-cases`（擁有者 or Admin）與 `GET /admin/remedy-cases`、`GET /admin/remedy-cases/:id`、`POST /admin/remedy-cases/:id/transition`；`note` 必填 ＋ `activity_logs` 完整歷程；db test `refundRemedyCase.db.test.js`（8 case）＋ HTTP 實測（非本人 403、跳關 409、`approved → completed` 409、完成後訂單 `status`／`paid_at`／`entitlement_status` 三者皆未變）；migration 後 0 列，未 backfill。規格見 `mvp_rules.md` §12.8。 **命名與本文件〈Gate 14 補充 — Refund / Remedy State Machine〉的落差（已知、刻意）：** `refund_pending / refunded / remedied` 實作為 `remedy_pending / completed`（退款與非金錢補救共用同一個完成態，以 `case_type` ＋ `refund_method` 區辨）；`approved_at` / `rejected_at` 合併為 `decision_at`；`reason` 由 `case_type`（分類）＋ `buyer_statement`（自由文字）取代；`payment_method` 未複製（原始付款方式在 `orders.payment_mode`）。 **已具備（2026-08-26 第三次擴充 —— legal hold ＋ cleanup fail-closed）：** `material_files.legal_hold` ＋ `hold_reason` / `hold_set_at` / `hold_set_by` / `hold_released_at` / `hold_released_by`（＋ 兩個 CHECK：hold 必須有理由與時間、解除紀錄不得憑空存在）；Admin only 的 set / release / read（`POST /admin/material-files/:id/legal-hold`、`/release-legal-hold`、`GET /admin/material-files/:id/retention`）；**單一 deletion eligibility predicate** `materialFileRetention.canPhysicallyDeleteMaterialFile()`，八個阻擋理由，**fail-closed（unknown / error / lookup 失敗 → KEEP）**；`cleanupOrphans()` 改為「鎖列 → 重跑 predicate → 先刪 DB 列（讓 FK RESTRICT 在位元組還在時引爆）→ 再刪實體 → COMMIT」，任一步失敗即 ROLLBACK；`--dry-run` 走同一個 predicate；稽核五個 action。**修正的兩個 fail-open：**(1) 舊資格判斷只問 `status='unattached'` ＋ TTL，完全不看 hold／entitlement／履約快照 —— 文件 §8.5 的「永不實體刪除」政策**無程式碼執行**；(2) 舊版**先刪實體再刪列**，因此 `fulfilled_material_version_id` 的 `ON DELETE RESTRICT` 只保護得了 DB 列，位元組已不可逆消失。db test `materialFileRetention.db.test.js`（12 case，含 `revoked_final` ＋ 履約快照、模擬 DB 故障的 fail-closed、實體位元組存在性斷言）＋ HTTP 實測（buyer/teacher 403、無 token 401、缺 reason 400、重複 release 409、解除後仍不可刪、歷程 3 筆）。對應 `RM-15`（material binaries）的 legal hold 欄位。 **已具備（2026-08-26 第四次擴充 —— 人工銀行退款執行紀錄）：** `refund_remedy_cases.refund_amount`（與 `approved_amount` 分離，支援部分退款）＋ 四條 CHECK：`rrc_refund_amount_positive`／`rrc_refund_within_approved`（實退 ≤ 核准，且非金錢補救不得有退款金額）／`rrc_refund_method_check`（Phase 1 只有 `manual_bank_transfer`）／**`rrc_refund_execution_atomic`（五項證據全有或全無）**，另加 **`rrc_cash_completion_requires_evidence`（已核准金錢退款者不得在無付款證據時 completed）**；`refundRemedy.executeRefund()` 為金錢退款完成的**唯一**入口，狀態與證據同一 UPDATE 原子寫入，失敗即 ROLLBACK 且案件保持 `remedy_pending`；`transition()` 不再接受任何 refund 欄位，對已核准金錢退款的案件回 `use_execute_refund`；`POST /admin/remedy-cases/:id/execute-refund`（Admin only）；稽核 `refund.executed`（caseId／orderId／buyerId／amount／approvedAmount／method／paymentReference／executedBy／executedAt），**被拒絕的執行不寫成功 audit**；執行者沿用既有 `completed_by`，不另造欄位。db test `manualRefundExecution.db.test.js`（9 case）＋ HTTP 實測（`approved` 直接執行 409、buyer 403／無 token 401、缺 reference 400、超額 400、金額 0 400、有效執行 200 後**訂單仍 approved、`paid_at` 與 `payment_received_at` 皆不變、`entitlement_status` 仍 active**、重複執行 409、audit meta 完整）。**三個事件在 DB 層釘死為不同事件：CASE APPROVED（`decision_at`）≠ REFUND EXECUTED（`refund_paid_at`）≠ TAX DOCUMENT REVERSED（`P14`，schema 刻意無 tax 欄位）。** **仍未具備：** tax reversal 節點（待 External Tax Gate）、退款金額對本文件 §18 營收／trend 的反映（`refund_amount` 目前不進入任何營收查詢）、買家退款收款帳戶（**刻意未蒐集** —— 會擴大個資範圍且保存年限未定，`RM-03`／`L-21` 皆 `PENDING`）、`superseded` / `revoked` 檔案的回收路徑（待保存年限定案，**刻意未開放**）、`retention_until` 與任何實際保存年限（`RM-15`／`T-14`／`L-21` 皆 `PENDING`，**刻意不加欄位**）、`RM-14` entitlement records 的 hold、hold 與 remedy／report case 的 orchestration（**本輪只做 primitive**）、`P10` ledger 與 Creator 報酬回沖、法定解除的實體判斷、退款對 §18 營收／trend 的反映、買家可見的申訴 UI、post-settlement Creator 處理 —— `mvp_rules.md` §18.9 仍為 `REQUIRED / NOT IMPLEMENTED` |

**Deployment Readiness： 0 / 14 IMPLEMENTED（Gate 1、2、3、4、5、6、7、11、12、14 為 PARTIAL）。**

> **2026-08-30 `DOC-01` 同步：** 本行先前漏列 **Gate 4、11、12**。
> 三者分別於 2026-08-27 由 `docs/pending-work-tracker.md` 判為 `PARTIAL`
> （Gate 4 = Wave 2 #13 申訴證據讀取／交付；Gate 11 = `W2-12` 付款期限 enforcement；
> Gate 12 = 四條 public legal route 建立），但本表未同步。
> **這是文件落後於實作的更正，不是狀態升級** —— `IMPLEMENTED` 數量仍為 **0**。

> **PARTIAL ≠ IMPLEMENTED。** 依 `§0.2 STATUS-EVIDENCE`，
> 只有該 Gate **全部** acceptance criteria 完成且附 evidence，才可標為 `IMPLEMENTED`。
> Gate 1、5、6、7、14 於 2026-08-26 完成 foundation（schema ＋ 述詞／寫入端 ＋ db test），
> 其餘 criteria 仍未具備。

## Gate 14 補充 — Entitlement 狀態模型

```text
entitlement_status: active | suspended | revoked_pending | revoked_final
access_suspended_at / access_suspended_by / access_suspension_reason
access_restored_at / access_restored_by
legal_hold / hold_reason / hold_set_at / hold_released_at
```

**不得以修改 `orders.status` 的方式實作 revoke** ——
`orders.status` 已有既定語意與狀態機，用它表達授權撤銷會污染訂單狀態機、對帳與稽核軌跡。
**entitlement 必須是與 `orders.status` 正交的獨立維度。**

## Gate 14 補充 — Refund / Remedy State Machine

```text
requested → under_review → approved | rejected
approved  → refund_pending → refunded
approved  → remedied
any       → cancelled
```

至少保存：`refund_or_remedy_id`、`order_id`、`order_item_id`、`buyer_id`、`reason`、`type`、
`status`、`amount`、`payment_method`、`refund_method`、
`requested_at`、`approved_at`、`rejected_at`、`paid_at`、
`approved_by`、`payment_reference`、`access_action`、`notes`。

Phase 1 可採：Admin 核准 → **人工銀行匯回** → 填入匯款 reference → 標記 `refunded`。
**不要求自動退款 API。**

---

# MASTER REGRESSION MATRIX — `MR-01`～`MR-20`

> **唯一完整回歸來源。** 其他段落可引用 `MR-ID`，
> **不得再另外維護另一份「看似完整」的 invariant 清單或 Coverage Matrix。**

| MR | 必查項目 |
| --- | --- |
| MR-01 | `PRE-03` 全文與 `PRE-03.1`～`.8`（含 11 項 Reopen Triggers ＋ substance test） |
| MR-02 | `PRE-04` 全文與 `PRE-04.1`～`.7` |
| MR-03 | A～P 16/16 |
| MR-04 | `MAND-01`～`MAND-14` = 14/14，**且每列指向實體段落** |
| MR-05 | `R1`～`R8` = 8/8 |
| MR-06 | `R9` Review Right |
| MR-07 | `H-VERSION` |
| MR-08 | `No Permanent Download` |
| MR-09 | `CONTENT-LIMIT`（含消保法 §8 II 理由） |
| MR-10 | `CONTRACT-EFFECT`（§17 II/III/IV ＋ §56-1 ＋ §19 III/IV/V） |
| MR-11 | Post-Termination Personal Data Handling ＋ **`RETENTION-MATRIX` 由 `B` 清單 1:1 推導** |
| MR-12 | Platform Service Discontinuation |
| MR-13 | `BUYER-STORED-VALUE-LIMIT`（含無償／有償判準） |
| MR-14 | Sublicense Survival（`C6-A`） |
| MR-15 | **Master Regression Matrix itself exists and is the single regression source of truth** |
| MR-16 | External Legal Gates —— 完整列出、狀態誠實、evidence requirement 明確 |
| MR-17 | External Tax Gates —— 同上 |
| MR-18 | Deployment Gates —— 1～14 全部存在、有 acceptance criteria、有狀態、`IMPLEMENTED` 有 evidence、`NOT IMPLEMENTED` 未被包裝成完成 |
| MR-19 | Creator Payout & Seller-of-Record Invariants |
| MR-20 | 消保法 §18 通訊交易資訊揭露 —— 13 項逐項 |

## `MR-19` 明確檢查內容
No Creator Wallet｜No Creator Available Balance｜No Creator 自主提款｜
不使用「平台代 Creator 收款」｜不使用「Buyer 貨款扣佣後餘額即 Creator 所有」｜
Refund 採淨銷售／報酬計算基礎，不從既有餘額扣回｜Buyer UI 不把 Creator 顯示為 Seller｜
Creator 報酬是 Platform 的獨立契約債務

## `MR-20` 十三項

1. 企業經營者名稱、代表人、事務所／營業所及聯絡資料（§18 I(1)）
2. 商品／服務之內容與對價（§18 I(2)）
3. **付款期日**（§18 I(2)）
4. 付款方式（§18 I(2)）
5. **交付期日**（§18 I(2)）
6. 交付方式（§18 I(2)）
7. §19 解除權**行使期限**（§18 I(3)）
8. §19 解除權**行使方式**（§18 I(3)）
9. 排除解除權適用之情形（§18 I(4)）
10. 消費申訴受理方式（§18 I(5)）
11. 其他中央主管機關公告之事項（§18 I(6)）—— **須實證確認，不得自動 PASS**
12. 網路交易資訊可**完整查閱**（§18 II）
13. 網路交易資訊可**儲存**（§18 II）

**`MR-20` 不因 `MR-04` PASS 而自動 PASS —— 兩套 matrix 並行。**

---

# 版本結論

目前唯一應使用的最新完整基準為：

**PRE-03 + PRE-04 + P1-09 A～P v1.8 — Full Baseline / Pending Legal-Tax Validation**

舊版 v1.0～v1.7 不得再用來覆蓋本文件。
後續任何修改必須依 `REGRESSION-PROTOCOL-01` 與 `MR-01`～`MR-20` 執行。
Scope 已依 `§0.5` 鎖定。
