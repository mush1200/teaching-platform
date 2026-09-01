# `P1-09` FINAL SCOPE RECONCILIATION / CLOSEOUT REVIEW

**日期：** 2026-08-26
**性質：** Scope Freeze 前的最終盤點。**本文件不產出 v1.8 Full Baseline。**
**輸入：** v1.7 Full Baseline ＋ v1.7 Full Regression ＋ 13 份 audit record ＋ tracker ＋ repo canonical docs
**輸出：** A～H 八項交付物

> **Scope Freeze 規則（本輪起生效）：** 新項目只有符合 A～E 任一條件才可加入 Phase 1
> （現行 flow 已觸發／文件已承諾但 repo 無能力／阻擋 MR／阻擋 Gate 驗收／現行法對 Phase 1 的必要義務）。
> 其餘一律 `DEFER` 或 `REJECT`，**不得因此新增 Gate、MR 或 PRE ID**。

---

# A. FINAL V1.8 SCOPE REGISTER

**欄位縮寫：** `P1`＝Phase 1 required｜`DEP`＝Deployment required｜`EXT`＝External validation required
**Repo 狀態縮寫：** `NI`＝NOT IMPLEMENTED｜`PART`＝PARTIAL｜`DOC`＝文件層（無 code 需求）

## A.1 既有結構（v1.7 已存在，全數 KEEP）

| ID | Requirement | Target | P1 | DEP | EXT | Repo | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | `PRE-03` 全文 ＋ `.1`～`.8` | PRE-03 | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline** |
| S-02 | `PRE-04` 全文 ＋ `.1`～`.7` | PRE-04 | ✅ | ✅ | ✅ 律師 | NI | **KEEP — baseline ＋ Gate 7** |
| S-03 | A～P 十六模組 | A–P | ✅ | — | — | DOC | **KEEP — baseline** |
| S-04 | `MAND-01`～`MAND-14` | MAND Matrix | ✅ | — | — | DOC | **KEEP — baseline**（缺口見 A.2） |
| S-05 | `R1`～`R8` | R Matrix | ✅ | — | — | DOC | **KEEP — baseline** |
| S-06 | `R9` 審閱權（消保法 §11-1 II） | R Matrix | ✅ | — | — | DOC | **KEEP — baseline** |
| S-07 | `H-VERSION` | H | ✅ | ✅ | — | NI | **KEEP — baseline ＋ Gate 5** |
| S-08 | `No Permanent Download` | E6 / M5 | ✅ | — | — | DOC | **KEEP — baseline** |
| S-09 | `CONTENT-LIMIT` | 跨模組 | ✅ | — | — | DOC | **KEEP — baseline** |
| S-10 | `CONTRACT-EFFECT`（消保法 §17 II/III/IV） | 跨模組 | ✅ | — | — | DOC | **KEEP — baseline** |
| S-11 | `BUYER-STORED-VALUE-LIMIT` | §6 / PRE-03 | ✅ | ✅ | — | NI（不存在即符合） | **KEEP — baseline ＋ 架構驗收** |
| S-12 | `PRE-03 Reopen Triggers`（11 項） | PRE-03.8 | ✅ | — | — | DOC | **KEEP — baseline** |
| S-13 | Creator Payout / Seller-of-Record Invariants | §5 / MR-19 | ✅ | ✅ | — | NI（不存在即符合） | **KEEP — baseline ＋ 架構驗收** |
| S-14 | `Platform Service Discontinuation`（M7） | M | ✅ | ✅ | ✅ 律師 | NI | **KEEP — baseline ＋ Gate 10** |
| S-15 | `MR-01`～`MR-19` | Master Matrix | ✅ | — | — | DOC | **KEEP — baseline** |
| S-16 | `P0` Operating Entity & Business Scope | P | ✅ | — | ✅ 會計 | NI | **KEEP — External Tax Gate** |
| S-17 | `P13` Business Closure Financial Settlement | P | ✅ | — | ✅ 會計 | DOC | **KEEP — baseline** |
| S-18 | `N3` Buyer external payment evidence（R7 的產品面） | N | ✅ | ✅ | — | NI | **KEEP — Gate 4** |
| S-19 | `N4` External consumer dispute escalation | N | ✅ | — | — | DOC | **KEEP — baseline** |
| S-20 | `D7` 兒少法 §69 特殊高風險 flag | D | ✅ | ✅ | — | PART | **KEEP — Gate 2** |
| S-21 | `A7` 電子文件作為意思表示方法 | A ＋ H | ✅ | — | — | DOC | **KEEP — baseline** |
| S-22 | `C1-A` 著作權法 §37 II（後續讓與不影響既有授權） | C | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline** |
| S-23 | `C6-A` Sublicense Survival（head license 終止） | C | ✅ | — | ✅ 律師 | DOC | **KEEP — External Legal Gate** |
| S-24 | `G3` §90-4 四款 checklist（含第四款實證紀律） | G | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline** |

## A.2 `MR-04` 修復（v1.7 回歸失敗，**轉 PASS 的必要條件**）

| ID | Requirement | Source | Target | P1 | DEP | EXT | Repo | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | **MAND-02** 有利消費者解釋 —— 需**實體條款**，非僅 Matrix 指向 | 應記載二 | A / E | ✅ | — | — | DOC | **KEEP — baseline** |
| F-02 | **MAND-05** 訂約前確認機制 ＋ **契約成立後確實履約**（兩半都要） | 應記載五 | E / J | ✅ | — | — | DOC | **KEEP — baseline** |
| F-03 | **MAND-06** 數位「數量」語意；同一 Buyer 不得重複購買同教材取得第二席 | 應記載六 | E / Checkout | ✅ | ✅ | — | NI | **KEEP — baseline ＋ 產品規則** |
| F-04 | **MAND-07** 數位交付方式；綁 `PRE-04`（履約版本／更新政策） | 應記載七 | E / J ＋ PRE-04 | ✅ | — | — | DOC | **KEEP — baseline** |
| F-05 | **MAND-10** 三層：法定解除權正面記載 → 法定例外 → 平台自願退款政策 | 應記載十 ＋ §18 I(3)(4) | E / F | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline ＋ Legal Gate** |
| F-06 | **MAND-03** 商品頁資訊**為契約之一部分**（不只「要真實」） | 應記載三 | C / D / E ＋ PRE-04 | ✅ | — | — | DOC | **KEEP — baseline** |
| F-07 | **MAND-08 / MAND-09** 先有正文再讓 Matrix 指向；**不得以改歸屬代替補段落** | 應記載八／九 | E ／ §2 | ✅ | — | — | DOC | **KEEP — baseline** |
| F-08 | `K5` 恢復三類處理**逐款欄位** ＋ **至少五年** | 個資辦法 §16 | K | ✅ | — | — | DOC | **KEEP — baseline** |
| F-09 | `MR-15` 措辭改為「Master Regression Matrix is the single source」 | v1.6 合併決定 | Master Matrix | ✅ | — | — | DOC | **KEEP — baseline** |
| F-10 | 恢復法源理由：`CONTENT-LIMIT` ← 消保法 §8 II；`C2` ← 著作權法 §37 I | 第四輪 REG-1 | E3 / C2 | ✅ | — | — | DOC | **KEEP — baseline** |
| F-11 | `18+` 恢復硬規則（移除「原則上」）；無例外制度即不得留模糊語 | 第四輪 | A1 / I | ✅ | ✅ | — | NI | **KEEP — baseline ＋ 產品規則** |

## A.3 消保法 §18 ／ `MR-20` 群組

| ID | Requirement | Source | Target | P1 | DEP | EXT | Repo | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | **`MR-20`** §18 I(1)～(6) ＋ §18 II，十三項逐項驗收 | 消保法 §18 | Master Matrix | ✅ | — | — | DOC | **KEEP — baseline** |
| G-02 | **`BUYER-PAYMENT-DEADLINE`**：`payment_due_at`、逾期處理、逾期後付款、價格變動、是否重下單 | §18 I(2) 付款期日 | E / J | ✅ | ✅ | — | NI | **KEEP — baseline ＋ Gate 11** |
| G-03 | **`PAYMENT-REVIEW-SLA`**；`review_due_at` **起算於 `payment_info_submitted_at`** | §18 I(2) 交付期日 ＋ MAND-05 | §2 / E / J | ✅ | ✅ | — | NI | **KEEP — baseline ＋ Gate 6（升級）** |
| G-04 | 依賴鏈：`PAYMENT-REVIEW-SLA` → 交付期日 → `MR-20 §18 I(2)` | §18 I(2) | 跨模組 | ✅ | — | — | DOC | **KEEP — baseline** |
| G-05 | 三個時鐘分離：`order_created_at`→`payment_due_at`／`payment_info_submitted_at`→`review_due_at`／`payment_received_at`→稅務時點 | §18 ＋ 發票時限表 | J | ✅ | ✅ | — | NI | **KEEP — baseline ＋ Gate 6** |
| G-06 | **§18 II 可完整查閱＋可儲存**（下載／列印／複製全文） | §18 II | H5 | ✅ | ✅ | — | NI | **KEEP — Gate 12** |
| G-07 | **Order-level consent**：`order_id → disclosure version → consent → timestamp → access granted` | 準則 §2(5) | F | ✅ | ✅ | — | NI | **KEEP — Gate 13** |
| G-08 | Gate 13 三條斷言：consent 存在／`consent_accepted_at ≤ access_granted_at`／**disclosure version 相符** | 準則 §2(5) ＋ §18 | F / J | ✅ | ✅ | — | NI | **KEEP — Gate 13** |
| G-09 | `CONTRACT-EFFECT` 補 §19 III **四個月**、§19 IV **視為解除**、§19 V **約定無效** | 消保法 §19 | 跨模組 | ✅ | — | — | DOC | **KEEP — baseline** |
| G-10 | `CONTRACT-EFFECT` 補 **§56-1** 罰鍰結構（§17 適用；**§56-1 未涵蓋 §18**，§18 效果走 §19 III） | 消保法 §56-1 | 跨模組 | ✅ | — | ✅ 律師（§18 是否另有行政罰） | DOC | **KEEP — baseline ＋ Legal Gate** |
| G-11 | `MR-20.11`（§18 I(6)）**須實證確認**，不得自動 PASS；套 `G3` 第四款紀律 | 消保法 §18 I(6) | Master Matrix | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline** |
| G-12 | `N` 的「responsible information **as applicable**」改為**必填**；統編保留條件語 | §18 I(1) ＋ 應記載一 | N | ✅ | — | — | DOC | **KEEP — baseline** |

## A.4 `Gate 14` 群組（解除／退款／授權撤銷）

| ID | Requirement | Source | Target | P1 | DEP | EXT | Repo | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-01 | **`Gate 14`**：人工銀行退款 ＋ refund/remedy case ＋ state machine ＋ audit trail ＋ entitlement revoke/restore | §18 I(3)／§19 IV | E/F/M/N/P | ✅ | ✅ | ✅ 律師 | **NI** | **KEEP — Gate 14** |
| H-02 | entitlement **獨立狀態**；**不得以修改 `orders.status` 實作 revoke** | repo 現況 | Gate 14 | ✅ | ✅ | — | NI | **KEEP — Gate 14 不變條件** |
| H-03 | `revoke` ＝ **暫停未來交付**，非移除 entitlement 記錄 | repo 現況 | Gate 14 | ✅ | ✅ | — | NI | **KEEP — Gate 14 不變條件** |
| H-04 | 三態 `suspended` / `revoked_pending` / `revoked_final`；`revoked_final` ≠ 檔案可刪 | Gate 14 | Gate 14 | ✅ | ✅ | — | NI | **KEEP — Gate 14** |
| H-05 | **已下載副本 ≠ future entitlement**：可撤銷未來存取，不能保證收回本機副本 | Gate 14 | E / Gate 14 | ✅ | — | ✅ 律師（Buyer 對既有副本之義務文字） | DOC | **KEEP — baseline ＋ Legal Gate** |
| H-06 | `P14 Tax Document Reversal` **三維 decision tree**（憑證型態／Buyer 身分／申報狀態） | 統一發票使用辦法 §20、§20-1 | P | ✅ | — | ✅ 會計 | DOC | **KEEP — External Tax Gate** |
| H-07 | `J` 補 refund ＋ tax reversal 時間戳；**退款完成 ≠ 憑證沖銷完成** | §20 / §20-1 | J | ✅ | ✅ | — | NI | **KEEP — Gate 14** |
| H-08 | post-settlement ordinary refund → **Platform 吸收**，不得 clawback | PRE-03 定性 | P / C | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline** |
| H-09 | `CREATOR-ADJUSTMENT-SUBSTANCE-TEST`：判準為**調整的計算基礎**；恆等於退款金額 → **觸發 PRE-03 實質複核**（非「必然違法」） | PRE-03.8 | PRE-03.8 / P10 | ✅ | — | — | DOC | **KEEP — baseline** |
| H-10 | `P10` 保存 adjustment type／basis／calculation／evidence／approver，非僅金額 | 稽核 | P10 | ✅ | ✅ | — | NI | **KEEP — Gate 14** |
| H-11 | `mvp_rules.md:1371` 改為 **`REQUIRED — Gate 14 / NOT IMPLEMENTED`**（帶狀態標記，避免 doc-ahead-of-code） | CLAUDE.md §9／§11.6 | canonical doc | ✅ | — | — | **待改** | **KEEP — baseline** |

## A.5 Retention ／ Legal Hold 群組

| ID | Requirement | Source | Target | P1 | DEP | EXT | Repo | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J-01 | **`RETENTION-MATRIX`**（purpose-based），**由 `B` 資料清單 1:1 推導**，每類含 purpose／legal basis／retention rule／deletion rule／legal hold／source／owner | 個資法 §11 III | K | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline** |
| J-02 | Matrix 補齊：`activity_logs`／`report_events`／security logs／complaints＋evidence／Creator tax identity data／基本帳號資料／entitlement records／material binaries | `B` 清單 | K | ✅ | — | — | DOC | **KEEP — baseline** |
| J-03 | **`activity_logs` vs 個資法 §11 III 接縫**：援引但書之理由與期限須明文；`K5` 資料清單補 `activity_logs` | `db_schema.sql:356-359` ＋ `CLAUDE.md` §4.4 | K / K5 | ✅ | — | ✅ 律師 | DOC | **KEEP — baseline ＋ Legal Gate** |
| J-04 | **legal hold 一級欄位**（`legal_hold`/`hold_reason`/`hold_set_at`/`hold_released_at`）；cleanup **只讀不判斷**、**fail-closed** | repo fail-closed 慣例 | K / Gate 14 | ✅ | ✅ | — | NI | **KEEP — Gate 14** |
| J-05 | cleanup 七條件；第 7 條 catch-all 套「可列舉且記錄查證來源」紀律 | PRE-04 §8.5 | K / PRE-04 | ✅ | ✅ | — | NI | **KEEP — Gate 14** |
| J-06 | **entitlement 記錄保存期限 ≠ 教材檔案保存期限**，不得綁同一天刪除 | RETENTION-MATRIX | Gate 14 / PRE-04 | ✅ | ✅ | — | NI | **KEEP — Gate 14** |

## A.6 治理規則

| ID | Requirement | Target | P1 | Disposition |
| --- | --- | --- | --- | --- |
| K-01 | **`REGRESSION-PROTOCOL-01` 三態**（DELTA REVIEW／FAILED／PASSED） | Master Matrix | ✅ | **KEEP — baseline** |
| K-02 | **三條狀態線永不合併**（Document Regression／Deployment Readiness／Legal・Tax Validation） | baseline 首頁 | ✅ | **KEEP — baseline** |
| K-03 | **`STATUS-EVIDENCE`**：`IMPLEMENTED`／`VALIDATED`／`COMPLETED` 全部須附 evidence pointer | 跨文件 | ✅ | **KEEP — baseline** |
| K-04 | `MR-16`／`MR-17`／`MR-18` 語意 ＝ **coverage / definition / status integrity**，非「已完成」 | Master Matrix | ✅ | **KEEP — baseline** |
| K-05 | **`.md` canonical ／ `.docx` generated only**，不得反向編輯 | 版本治理 | ✅ | **KEEP — baseline** |
| K-06 | **法源引用治理**：全國法規資料庫優先；第三方僅補充（已違反 3 次） | 引用 | ✅ | **KEEP — baseline** |

---

# B. PREVIOUS FINDINGS RECONCILIATION

十三份 audit record 的全部發現，逐條確認去向。

| 輪次／來源 | 發現 | 去向 |
| --- | --- | --- |
| R1 `V1`～`V8` | 8 項已驗證正確的法源 | 已內化至 A～P，無獨立 ID |
| R1 `E1` 契約成立時點引用錯誤 | v1.7 `J1` | MERGE — S-03 |
| R1 `E2` 主管機關前言修正（仍為**草案**） | v1.7「主管機關與法規版本治理」節 | MERGE — Legal Gate L-16 |
| R1 `E3` 兒少法過寬 | `D7` | MERGE — S-20 |
| R1 `E4` AI 基本法 | `O9` | MERGE — S-03 |
| R1 `E5` Etsy 對標過時 | `O3`/`O4` 結構化揭露 | MERGE — S-03 |
| R1 `E6` 72 小時兩條時間線 | `K4` | MERGE — S-03 |
| R1 `M1` 第三方支付 | `PRE-03` | MERGE — S-01 |
| R1 `M2` 扣繳 | `P8` / PRE-TAX Gate | MERGE — Gate 8 |
| R1 `M3` 稅籍／發票 | `P2`～`P6` | MERGE — Tax Gates |
| R1 `M4`～`M10` | `R8`／`R1`,`R2`／`A3`／`A5-1`／`B1`／`N2`／`R9` | MERGE — S-04〜S-06 |
| R1 `M11` AI 著作權 | `O8` | MERGE — S-03 |
| R1 `M12` §90-4 四款 | `G3` | MERGE — S-24 |
| R1 `M13` 電子簽章法 | `H4` | MERGE — S-03 |
| R1 `M14` 18 歲 | `I` | MERGE — F-11 |
| R2 `N1` ISP 避風港對交付段失效 | `PRE-03.6` ＋ `G4` | MERGE — S-01 |
| R2 `N2` §37 再授權 | `PRE-03.5` ＋ `C3` | MERGE — S-01 |
| R2 `N3` 消保法 §7/§8/§22 | `E3` ＋ `CONTENT-LIMIT` 理由 | MERGE — F-10 |
| R2 `N4a` 代銷 | `PRE-03.3` | MERGE — S-01 |
| R2 `N4b` 報酬定性（18 萬免稅） | `C9`/`P7`/`P8` 中性詞 | MERGE — Gate 8 |
| R2 `N5` 定型化契約全適用 | MAND Matrix | MERGE — S-04 |
| R3 `X1` A5 寫反 | `A5-1`/`A5-2` | MERGE — S-03 |
| R3 `X2` 發票時點 | `J2` ＋ `P6` | MERGE — G-05 |
| R3 `X3` 內容處理三層 | `CONTENT-LIMIT` ＋ `C2` | MERGE — S-09 / F-10 |
| R3 永久下載消失 | `E6`/`M5`/invariant | MERGE — S-08 |
| R3 `Y1`～`Y10` | 全數落入 `§5`／`B1`／`L`／`N2`／`G3`／`E3`／`CONTRACT-EFFECT`／`K3`／`P8`／`P9` | MERGE |
| R4 `REG-1`/`REG-2` | `CONTENT-LIMIT`／`CONTRACT-EFFECT` | MERGE — S-09/S-10 |
| R4 `Q1`～`Q6` | `K3`＋`K5`／`M7`／`N4`／`P0`／`A7`／`D7` | MERGE — S-14/S-16/S-19/S-21 |
| R5 `W1`～`W4` | `BUYER-STORED-VALUE-LIMIT`／`C6-A`／Master Matrix 單一化／`REGRESSION-PROTOCOL-01` | MERGE — S-11/S-23/K-01 |
| R6 `V1`～`V3` | `MR-19`／`PRE-03.8`／三態 | MERGE — S-12/S-13/K-01 |
| R7 v1.7 回歸 | `MR-04` FAILED ＋ 11 項 | **F-01～F-11（本輪主線）** |
| R8 §18 發現 | `MR-20` | **G-01（本輪主線）** |
| R9 7 項 | `G-02`～`G-12` | KEEP |
| R10 Gate 14 硬缺口 | `H-01` | KEEP |
| R11 `F1`～`F5` | `H-06`/`H-02`/`H-03`/`H-08`/`H-11` | KEEP |
| R12 scope lock | `H-06` 三維／`K-02`/`K-03`／`H-09`/`H-10` | KEEP |
| R13 retention | `J-01`～`J-06` | KEEP |

**確認：十三輪的全部發現，無一遺漏，無一僅存在於對話。**

---

# C. KEEP / MERGE / DEFER / REJECT 清單

## C.1 KEEP（Phase 1 in scope）

**baseline 文件層：** S-01～S-24、F-01～F-11、G-01／G-04／G-09～G-12、H-05／H-08／H-09／H-11、J-01～J-03、K-01～K-06
**Deployment Gate：** G-02／G-03／G-05～G-08、H-01～H-04／H-07／H-10、J-04～J-06、F-03／F-11、S-02／S-07／S-11／S-13／S-14／S-18／S-20
**External Gate：** S-16／S-23、F-05、G-10／G-11、H-05／H-06、J-01／J-03

## C.2 DEFER — Future phase（**不得新增 Phase 1 Gate／MR／PRE ID**）

| 項目 | 理由 | 觸發條件 |
| --- | --- | --- |
| Multi-seat / School / Organization License | `F-03` 已決定 Phase 1 不允許重複購買取得第二席 | 需要多席授權時，重新設計 `C3`＋`E2`＋pricing |
| Buyer stored-value／gift card／paid points | `S-11` 已禁止；能力本身是 Future | `PRE-03.8` reopen ＋ 禮券履約保障機制評估 |
| 電子發票 API 串接／自動開立／自動折讓／自動申報 | Phase 1 只需完成 `P4` 定性與合法憑證流程 | 會計師確認電子發票成為當期強制義務時，才升 Deployment Blocker |
| Phase 2 Marketplace／split payment／Creator KYC 直收 | 商業模式變更 | `PRE-03.8` reopen triggers |
| 信用卡／第三方金流 API／webhook／自動對帳 | Phase 1 人工核帳 | 交易量成長後 |
| 向 Creator 收費（上架費／服務費） | Phase 1 不收費；若收費，Creator↔Platform 可能落入消保法 | 導入 Creator-facing 收費時 |
| Antivirus／malware scanning、Object storage driver、Resumable upload、CDN | 既有 `FUT-T*`／`PRE-01` | 見 tracker §8 |

## C.3 REJECT — scope creep／duplicate

| 提案 | 理由 |
| --- | --- |
| `PRE-05` | Gate 14 群組完全落入 `PRE-03`／`PRE-04`／`E`/`F`/`J`/`M`/`N`/`P` |
| `Q` module | A～P 十六模組已足；無內容需要新字母 |
| `MR-21` | Gate 14 由 `MR-18` 涵蓋；揭露一致性由 `MR-20` 涵蓋；Retention 完整性掛 `MR-11` |
| `Gate 15` | Gate 14 的 downstream invariants，不另立 |
| 獨立 `Coverage Matrix` | v1.6 已合併入 Master Regression Matrix（`MR-15` 措辭需同步修，見 `F-09`） |
| 獨立 `INV-1`～`INV-6` 清單 | 已合併入 `MR-01`～`MR-20`，避免兩份「看似完整」清單 |
| 「所有 retention 取最大值」floor | 已由 `J-01` `RETENTION-MATRIX` 取代（本方前輪錯誤，已更正） |

## C.4 MERGE

見 §B 表格「MERGE」列，共 40 項歷史發現併入既有 ID。

---

# D. FINAL DEPLOYMENT GATE REGISTER（14/14）

| Gate | 名稱 | Acceptance criteria | Repo 狀態 | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Account Freeze | 凍結帳號、暫停在途交易與 payout、暫停敏感資料變更、解凍流程、audit trail | **NOT IMPLEMENTED** | `db/db_schema.sql` ＋ `Backend/`：`frozen`／`account_freeze` **0 命中** |
| 2 | Material Rights Review | `D5` 全欄位（含 `declaration_version`、`evidence_if_required`）＋ `D6`／`D7` risk flags | **PARTIAL** | `materials.ip_declaration_accepted`／`ip_declaration_at` 存在；`D5` 其餘欄位不存在（tracker `P1-09` inventory） |
| 3 | Consumer Complaint ＋ 15-day SLA | `N1` 全欄位、`statutory_due_at`、逾期告警、`N4` 外部管道揭露 | **NOT IMPLEMENTED** | 現有 `report_cases` 是**檢舉**流程，非消保法 §43 消費申訴 |
| 4 | Buyer external payment evidence | 付款爭議可上傳／附加外部證據（`R7` 的產品面） | **NOT IMPLEMENTED** | 無 complaint attachment 能力 |
| 5 | Consent versioning | `H1` 全欄位、舊版不覆寫、可回溯 | **NOT IMPLEMENTED** | `terms_accepted`／`consent_version` **0 命中**；註冊 consent 未送 Backend（tracker `P1-09`） |
| 6 | 三個時鐘 ＋ `PAYMENT-REVIEW-SLA` | `payment_received_at`／`payment_info_submitted_at`／`review_due_at`；逾時可偵測；不得存在無限期 pending 已收款訂單 | **NOT IMPLEMENTED** | `payment_received_at` **0 命中** |
| 7 | Order fulfillment version snapshot | `PRE-04.1` 五欄位；更新時 `PRE-04.4` 通知欄位 | **NOT IMPLEMENTED** | `material-file-storage-and-delivery.md` §17 情境 D：既有買家靜默取得新版，無 snapshot |
| 8 | PRE-TAX before first Creator payout | 第一次正式 payout 前完成所得定性、扣繳、憑單 | **NOT IMPLEMENTED**（無 payout 能力） | `P10` ledger 不存在 |
| 9 | Security Maintenance Plan ＋ **Post-Termination Personal Data Handling Method**（如適用） | 兩份文件皆存在並執行；`K5` 三類處理欄位 ＋ 五年 | **NOT STARTED**（適用性待 `P0`） | 個資辦法 §3 要求**兩份** |
| 10 | Platform Service Discontinuation Plan | `M7` 四組（Buyer／Creator／Data／Platform）皆有處置 | **NOT IMPLEMENTED** | — |
| 11 | Buyer Payment Deadline | `payment_due_at`、逾期處理、逾期付款處理、consent 版本處置 | **NOT IMPLEMENTED** | — |
| 12 | Legal Information Read & Save | §18 資訊可**完整查閱並儲存**（下載／列印／複製全文） | **NOT IMPLEMENTED** | 無 `/terms`／`/privacy` route（tracker `P1-09` inventory） |
| 13 | Digital Content Consent Ordering | consent 存在 ＋ `consent_accepted_at ≤ access_granted_at` ＋ **disclosure version 相符**；三條斷言可測 | **NOT IMPLEMENTED** | — |
| 14 | Rescission & Remedy Capability | 人工銀行退款 ＋ case state machine ＋ audit ＋ **獨立 entitlement 狀態**（不得改 `orders.status`）＋ revoke＝暫停交付 ＋ legal hold 一級欄位 ＋ cleanup fail-closed ＋ tax reversal 節點 ＋ `P10` adjustment basis | **NOT IMPLEMENTED** | `mvp_rules.md:1371` `Refund / reversal → 不存在`；`Backend/`／schema `refund` **0 命中** |

> **Deployment Readiness： 0 / 14 IMPLEMENTED（1 項 PARTIAL）。**
> 依 `K-04`，這**不影響** `MR-18` 能否 PASS —— `MR-18` 檢查的是
> Gate 是否完整列出、有 acceptance criteria、狀態誠實且附 evidence。

---

# E. FINAL EXTERNAL LEGAL GATE REGISTER

| ID | 名稱 | 狀態 | Evidence requirement |
| --- | --- | --- | --- |
| L-01 | Platform-as-Seller 實質定性 | PENDING | 律師意見書 |
| L-02 | 是否構成代理收付網路實質交易款項（第三方支付） | PENDING | 律師意見書 |
| L-03 | 是否被認定受託代銷 | PENDING | 律師＋會計 |
| L-04 | Creator → Platform → Buyer sublicense（著作權法 §37 III） | PENDING | 律師意見書 |
| L-05 | **Head-license 終止後 sublicense survival**（含 Platform 解散） | PENDING | 律師意見書 |
| L-06 | 歷史版本保存／交付所需授權範圍 | PENDING | 律師意見書 |
| L-07 | Platform 自身 IP responsibility（避風港對交付段不適用） | PENDING | 律師意見書 |
| L-08 | 契約成立時點（民法 §153） | PENDING | 律師意見書 |
| L-09 | **數位內容解除權例外的正式文案與流程時點**（§19 ＋ 準則 §2(5)） | PENDING | 律師核定文案 |
| L-10 | `PRE-04` 更新分級與 Buyer 舊版權利 | PENDING | 律師意見書 |
| L-11 | ISP §90-4 四款適用性（含第四款是否存在核可措施） | PENDING | 律師＋主管機關查證紀錄 |
| L-12 | 定型化契約審閱期（§11-1）在 UI 的落實 | PENDING | 律師意見書 |
| L-13 | 消費者管轄條款（§47／民訴 §436-9） | PENDING | 律師意見書 |
| L-14 | 停售／Creator 離開／Buyer 權利 | PENDING | 律師意見書 |
| L-15 | Platform service discontinuation 條款 | PENDING | 律師意見書 |
| L-16 | **定型化契約適用範圍與主管機關**（前言修正**仍為草案**，2025-01-16 公報） | PENDING | 律師意見 ＋ 發布狀態查證 |
| L-17 | 消費爭議外部升級管道文案 | PENDING | 律師意見書 |
| L-18 | **§18 是否另有行政罰**（§56-1 僅涵蓋 §17） | PENDING | 律師意見書 |
| L-19 | **§18 I(6)** 目前是否存在適用之主管機關公告 | PENDING | **實證查證紀錄**（不得假設有或沒有） |
| L-20 | **解除後 Buyer 對已下載副本之義務文字** | PENDING | 律師核定文案 |
| L-21 | **`activity_logs` 稽核軌跡 vs 個資法 §11 III** 之調和（但書理由與期限） | PENDING | 律師意見書 |
| L-22 | `RETENTION-MATRIX` 各列之 legal basis 覆核 | PENDING | 律師意見書 |
| L-23 | 未來 Buyer stored-value／禮券之定性（若啟用） | **DEFERRED** | 啟用時才需要 |

---

# F. FINAL EXTERNAL TAX / ACCOUNTANT GATE REGISTER

| ID | 名稱 | 狀態 | Evidence requirement |
| --- | --- | --- | --- |
| T-01 | **`P0` 營運主體、公司／商業登記、統一編號、營業項目** | PENDING | 登記文件 |
| T-02 | Platform Seller vs 受託代銷之稅務認定 | PENDING | 會計師備忘 |
| T-03 | 數位教材的稅務分類（電子勞務） | PENDING | 會計師備忘 |
| T-04 | 稅籍登記時點與起徵點認定 | PENDING | 國稅局核定文件 |
| T-05 | **`P4`** 是否使用統一發票／是否為小規模營業人 | PENDING | 國稅局核定文件 |
| T-06 | 免用統一發票時的合法交易憑證形式 | PENDING | 會計師備忘 |
| T-07 | **`P6`** 憑證開立時點（預收貨款）並回寫 `J` | PENDING | 會計師備忘 |
| T-08 | **`P14`** 退回／折讓沖銷（三維 decision tree 逐分支） | PENDING | 會計師備忘 |
| T-09 | Creator 報酬所得定性（版稅／權利金／執行業務所得） | PENDING | 會計師備忘 |
| T-10 | 扣繳率、免扣繳門檻、憑單申報 | PENDING | 會計師備忘 |
| T-11 | 非居住者 Creator 處理 | PENDING | 會計師備忘 |
| T-12 | Creator 稅務身分類型與應蒐集欄位（回寫 `B5`／`P9`） | PENDING | 會計師備忘 |
| T-13 | Business closure 之會計與稅務收尾（`P13`） | PENDING | 會計師備忘 |
| T-14 | 稅務憑證與帳簿之保存年限（回寫 `RETENTION-MATRIX`） | PENDING | 會計師備忘 |
| T-15 | 未來有償禮券／stored-value 之稅務效果（若啟用） | **DEFERRED** | 啟用時才需要 |

---

# G. v1.8 FULL BASELINE 產出清單

v1.8 完整 Markdown 必須逐節包含：

```text
[標頭] 三條獨立狀態線（K-02）
        Document Regression / Deployment Readiness / Legal・Tax Validation
[0] 文件定位與治理原則（含 REGRESSION-PROTOCOL-01、STATUS-EVIDENCE、法源引用治理、.md canonical）
[1] Phase 1 商業模式（Platform-as-Seller）
[2] Buyer 付款流程 ＋ MAND-08 付款方式正文
[3] 三個時鐘（G-05）
[4] Creator 報酬 ＋ 退款計算基礎 ＋ post-settlement 吸收規則（H-08）
[5] Phase 1 Product Invariants（Creator 端）
[6] BUYER-STORED-VALUE-LIMIT
[7] BUYER-PAYMENT-DEADLINE（G-02）← 新增節
PRE-03（.1～.8，含 11 項 Reopen Triggers ＋ CREATOR-ADJUSTMENT-SUBSTANCE-TEST）
PRE-04（.1～.7）
CONTENT-LIMIT（＋消保法 §8 II 理由）
CONTRACT-EFFECT（§17 II/III/IV ＋ §56-1 ＋ §19 III/IV/V）
A（A1～A7；18+ 硬規則）
B（B1 九款 ＋ B2～B5）
C（C1、C1-A、C2＋§37 I 理由、C3、C4、C5、C6、C6-A、C7～C10）
D（D1～D7）
E（E1～E6 ＋ MAND-02/03/05/06/07/09/10 正文）
F（含 order-level consent、disclosure version、§18 I(3)(4) 綁定）
G（G1～G4，含 §90-4 四款）
H（H1～H5）
I（18+）
J（含 payment_due_at／review_due_at／tax reversal 時間戳／fulfilled version）
K（K1～K5 ＋ RETENTION-MATRIX ＋ legal hold）
L（含首次行銷提供拒絕方式並支付所需費用）
M（M1～M7）
N（N1～N4；負責人必填）
O（O1～O9）
P（P0～P14）
MANDATORY CONTRACT MATRIX 14/14（每列指向**實體段落**）
PROHIBITED CLAUSE MATRIX R1～R8 ＋ R9
H-VERSION / No Permanent Download（governance invariants）
External Legal Gates L-01～L-23
External Tax Gates T-01～T-15
Deployment Gates 1～14（含 acceptance criteria、status、evidence）
MASTER REGRESSION MATRIX MR-01～MR-20（MR-15 措辭修正、MR-19、MR-20 十三項）
```

**產出後才可執行 `MR-01`～`MR-20` 全文回歸。**

---

# H. 是否仍有「已知且屬 Phase 1、但上述 scope 沒涵蓋」的缺口？

我逐項比對了：v1.7 全文、v1.7 回歸報告、十三份 audit record、tracker `P1-09`／`PRE-03`／`PRE-04` 全部註記、
以及 repo canonical docs（`mvp_rules.md`、`material-file-storage-and-delivery.md`、`CLAUDE.md`、`db_schema.sql`）。

> ## **H = 無。**
>
> 沒有任何已知、屬於 Phase 1、且未被 §A 的 Register 涵蓋的缺口。

兩項僅記為 FUTURE、**不新增任何 Phase 1 Gate／MR／PRE ID**：

1. **向 Creator 收費**若導入，Creator↔Platform 可能落入消保法 —— Phase 1 不收費，`DEFER`
2. **定型化契約前言修正**仍為草案（2025-01-16 公報）—— 目前以 `L-16` 追蹤，非 Phase 1 實作項

---

> # SCOPE LOCK RECOMMENDED
>
> 建議自本輪起停止新增 scope。
> 僅在下列三種情形才可重新開啟：
>
> 1. 現行法源被證明引用錯誤；
> 2. repo evidence 顯示現行 Phase 1 flow 與規格**直接矛盾**；
> 3. 既有 `MR`／`Gate` **無法驗收**。
>
> 「可以更完整」不是重開 scope 的理由。

---

# P1-09 DOCUMENT CLOSEOUT CRITERIA

只有以下**全部**成立，才可關閉「文件規格階段」：

| # | 條件 | 目前 |
| --- | --- | --- |
| 1 | v1.8 是完整 Full Baseline，不是 delta | ❌ 未產出 |
| 2 | `PRE-03`／`PRE-04`／A～P 全部存在 | ✅（v1.7 已有，v1.8 須沿用） |
| 3 | MAND 14/14 **有實體段落** | ❌ 缺 5 項（`F-01`～`F-05`） |
| 4 | `R1`～`R8` ＋ `R9` | ✅ |
| 5 | `H-VERSION` | ✅ |
| 6 | `No Permanent Download` | ✅ |
| 7 | `CONTENT-LIMIT` | ✅（需補 §8 II 理由） |
| 8 | `RETENTION-MATRIX` | ❌ 未建立 |
| 9 | `MR-01`～`MR-20` 全部 PASS | ❌ v1.7 為 FAILED (MR-04)；`MR-20` 未建立 |
| 10 | 所有 Gates 完整列出 | ✅（本文件 §D／§E／§F 已完整） |
| 11 | Gate 狀態與 repo reality 一致 | ✅（本文件 §D 已附 evidence） |
| 12 | 沒有已知 Phase 1 blocker 被藏在 Future | ✅（§H = 無） |
| 13 | canonical docs 與 code reality 不矛盾 | ❌ `mvp_rules.md:1371` 待改為 `REQUIRED / NOT IMPLEMENTED` |
| 14 | 所有 Pending Legal/Tax 有明確 owner／gate | ✅（`L-01`～`L-23`／`T-01`～`T-15`） |

> **目前 5 項未達成：第 1、3、8、9、13 項。**（2026-08-26 更正：初稿誤寫為 4 項）

**達成全部 14 項 → `Document Regression = PASSED (20/20)` → P1-09 文件階段結案。**

**結案後只追：** Deployment Gates（0/14）、Legal Validation（0/22 active）、Tax Validation（0/14 active）。
**不得因純理論、Future Phase 或 hypothetical feature 重新開啟 P1-09。**

---

## 本文件不做什麼

- 不出具法律或稅務意見。
- 不產出 v1.8 Full Baseline。
- 不宣告任何回歸結果 —— v1.7 維持 `FULL REGRESSION — FAILED (MR-04)`。
- Active backlog 以 `docs/pending-work-tracker.md` 為準。
