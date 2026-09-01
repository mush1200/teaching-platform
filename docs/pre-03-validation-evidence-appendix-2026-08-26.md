# `PRE-03` 驗證包 —— 證據附錄 ＋ 依賴矩陣

**日期：** 2026-08-26
**用途：** `pre-03-lawyer-validation-package` 與 `pre-03-accountant-validation-package` 之共用附錄
**性質：** repo 事實陳述。所有條目均可由指定檔案／指令複驗。
**事實基準日：** 原始 2026-08-26；**freshness reconciliation 2026-08-30**（見下方變更紀錄）。

> ### ⚠️ 變更紀錄 —— 2026-08-30 Freshness Reconciliation
>
> 本附錄原始撰寫於 **2026-08-26**。其後產品端有四項與 `PRE-03` 直接相關的實作落地，
> 使下列條目的原始觀察**不再反映系統現況**。已於 **2026-08-30** 逐項複驗並回寫：
>
> | 條目 | 原始觀察（2026-08-26） | 處置 |
> | --- | --- | --- |
> | `INV-2` | 無法單獨撤銷單一買家對單一教材的存取 | **已 supersede** —— 見該條 Freshness update |
> | `EVD-1` | 平台無任何退款或解除能力 | **已 supersede** —— 見該條 Freshness update |
> | `EVD-5` | 尚無任何法律文件頁面 | **部分 supersede** —— capability 已存在，但**仍無已發布之文件**；見該條 |
> | `EVD-11` | （原始附錄完全未涵蓋） | **新增條目** —— 消費申訴／爭議處理流程 |
>
> **原始文字一律保留**，不刪除、不重新編號 —— 既有 `INV-n` / `EVD-n` 編號是律師與會計師
> 驗證包的 cross-reference 依據，變動編號會破壞那些引用。
>
> **經 2026-08-30 複驗、仍然成立、未變動**：`EVD-6`（發票欄位存在、無開立流程）、
> `EVD-7`（無創作者報酬帳、無創作者稅務資料）。另複驗確認 **repo 中無任何平台抽成／
> 手續費（`commission` / `platform_fee`）之欄位或實作**。
>
> 本次 reconciliation **只更新事實**，未新增任何法律或稅務結論。

---

# 附錄 1 — Repo Evidence

> **外部專業人士閱讀提示：** 本附錄記錄「系統目前實際是什麼樣子」，
> 不是「應該是什麼樣子」。多數條目是**缺口**，且已被列為上線前必須補齊的項目。
> 之所以陳明，是因為部分法律與稅務義務的**履行方式**取決於系統實際具備何種能力。

## `INV-1` — 訂單明細表（`order_items`）現況

```sql
order_items (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL,
  material_id    TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,      -- 下單當時的教材標題（快照）
  price_snapshot NUMERIC NOT NULL,   -- 下單當時的價格（快照）
  quantity       INTEGER NOT NULL DEFAULT 1,
  seller_id      TEXT REFERENCES users(id),
  subtotal       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id, material_id)
)
```

**四項事實：**

| # | 事實 | 意義 |
| --- | --- | --- |
| 1 | 已有 `title_snapshot` / `price_snapshot` | 「下單當時狀態」的快照慣例**已存在於此表**，但**尚無「交付了哪個檔案版本」的快照** |
| 2 | `UNIQUE (order_id, material_id)` | 只擋**同一張訂單內**重複，**不擋跨訂單**重複購買同一教材 |
| 3 | `quantity DEFAULT 1`，**無 CHECK 約束** | 數量理論上可 >1；與產品規則「授權以授權為單位、不得以數量形成多席次」有潛在衝突 |
| 4 | 欄位名為 `seller_id`，指向**創作者** | 早期以 Marketplace 模型設計時遺留之名稱。內部欄位；**是否曾外洩至買家介面尚待檢查** |

**檔案：** `db/db_schema.sql`（`order_items` 定義）

---

## `INV-2` — 買家的教材存取權由訂單狀態推導 【**2026-08-30 SUPERSEDED — 見下方 Freshness update**】

```sql
-- Backend/services/materialFile.service.js:413
WHERE o.user_id = $1 AND o.status = 'approved' AND oi.material_id = $2
```

**意義：** 系統中**沒有任何可單獨撤銷的授權紀錄**。
買家能否下載某教材，完全由「該買家有一張狀態為已核准的訂單、且該訂單含有該教材」推導而來。

**後果：**

- 目前**無法**停止單一買家對單一教材的存取，除非改動訂單狀態
  （而訂單狀態另有其交易語意，不宜挪用）
- 契約解除、侵權下架、爭議處理等情形所需的「撤銷存取」能力**尚不存在**

**相關問題：** 律師 `Q-08`、`Q-12`

> ### Freshness update — 2026-08-30（原始觀察已被後續實作 superseded）
>
> **上述 2026-08-26 的觀察已不成立。** 系統現已具備「單一買家 × 單一教材」層級的
> 授權狀態欄位與變更能力。
>
> **現況事實：**
>
> - `db/db_schema.sql:350` —— `order_items.entitlement_status TEXT NOT NULL DEFAULT 'active'`
> - `db/db_schema.sql:367-368` —— `CHECK (entitlement_status IN
>   ('active', 'suspended', 'revoked_pending', 'revoked_final'))`（四值）
> - `db/db_schema.sql:377-378` —— 部分索引 `ON order_items (entitlement_status)
>   WHERE entitlement_status <> 'active'`
> - `Backend/services/entitlement.service.js` —— `getEntitlement(orderItemId)`、
>   `changeStatus({ orderItemId, toStatus, reason, actorId, actorRole })`、
>   `listStatusHistory(orderItemId)`
> - **與訂單狀態正交** —— `Backend/services/materialFile.service.js:410` 註記
>   `entitlement_status` 是「與 `orders.status` **正交**的維度」；變更授權**不以變更訂單狀態為之**
> - **交付端實際強制** —— 同檔 `:430` 的下載授權查詢含 `AND oi.entitlement_status = 'active'`，
>   亦即非 `active` 者取不到檔案
>
> **本條僅陳述系統具備何種能力與如何強制，不就該能力之法律意義作任何評價** ——
> 行使要件、事前通知或補救義務屬 reviewer 判定事項。
>
> **複驗日：** 2026-08-30

---

## `INV-3` — 「付款時間」欄位的實際語意是「核准時間」

```
Backend/services/adminDashboard.service.js:74
  periodRevenueAmount  期間內「核准」的訂單金額 → paid_at
```

**兩項事實：**

1. `orders.paid_at` 記錄的是**管理員核准**的時間，不是**銀行實際入帳**的時間
2. 該欄位目前被管理後台的**營收報表**用作營收認列日期

**系統中目前並無記錄銀行實際入帳時間的欄位。**

**相關問題：** 律師 `Q-14`；會計師 `Q-07(4)(5)`

---

## `INV-4` — 無結構化的匯款辨識欄位

`db/db_schema.sql` 搜尋 `last_four` / `last4` / `bank_name` / `payer_name` / `remit`
—— **0 命中**。

買家目前只能**上傳匯款憑證影像**（`manual_payment_proofs` 表），
系統中沒有匯款銀行、帳號後四碼、匯款金額、匯款日期等結構化欄位。

管理員的人工核帳因此完全依賴影像判讀與人工比對。

**相關問題：** 律師 `Q-13(2)`、`Q-14`；會計師 `Q-07(7)`

---

## `EVD-1` — 平台無任何退款或解除能力 【**2026-08-30 SUPERSEDED — 見下方 Freshness update**】

| 檢查 | 結果 |
| --- | --- |
| `docs/mvp_rules.md` §18.9 | `Refund / reversal → REQUIRED — P1-09 Gate 14 / NOT IMPLEMENTED` |
| `Backend/routes/` 搜尋 `refund` | **0 命中** |
| `Backend/services/` 搜尋 `refund` | **0 命中** |
| `db/db_schema.sql` 搜尋 `refund` | **0 命中** |

**無資料表、無流程、無介面。**

**相關問題：** 律師 `Q-12`；會計師 `Q-11`、`Q-12`

> ### Freshness update — 2026-08-30（原始觀察已被後續實作 superseded）
>
> **上述 2026-08-26 的「0 命中」已不成立。** 系統現已具備退款／補救案件的資料模型與
> 營運流程。**惟必須精確區分兩件事**（見下方最後一段）。
>
> **現況事實 —— 資料模型：**
>
> - `db/db_schema.sql:714` —— `CREATE TABLE ... refund_remedy_cases`
> - 執行欄位 `:735-738` —— `refund_amount`、`refund_method`、`refund_reference`、`refund_paid_at`
> - `:768-769` —— `CONSTRAINT rrc_refund_paid_requires_completed`
>   （`refund_paid_at IS NULL OR status = 'completed'`）
> - `:771` —— `rrc_refund_amount_positive`；`:773-776` —— `rrc_refund_within_approved`
>   （退款金額不得超過核准金額）
> - `:506` 註記 —— **「`resolved` ≠ 已退款。錢是否退回的唯一來源是
>   `refund_remedy_cases.refund_paid_at`。」**
> - migration：`Backend/migrations/20260826_refund_remedy_cases_foundation.sql`、
>   `20260826_manual_refund_execution.sql`
>
> **現況事實 —— 服務介面：** `Backend/services/refundRemedy.service.js` 提供
> `createCase`、`transition`、`executeRefund`、`getCase`、`listCases`、`listHistory`。
> 案件由**平台 Admin** 建立、推進與執行；買家端的提出入口是消費申訴流程（見 `EVD-11`）。
>
> **必須區分的兩件事：**
>
> | | 現況 |
> | --- | --- |
> | 系統／營運退款能力（建案、審核、記錄執行結果） | **已存在** |
> | 與金流服務商串接之自動退款（provider refund API） | **不存在** |
>
> `Backend/services/refundRemedy.service.js:256` 明載：
> **「Phase 1 唯一的退款方式：人工銀行匯回（沒有金流服務，也沒有第二條管道）。」**
> 亦即 `executeRefund` 記錄的是**人工匯回的結果**，平台**不會**、也**無法**透過金流服務商
> 發動自動退款。原始 `EVD-1` 的「無能力」敘述在**自動化串接**這一層仍然成立。
>
> **複驗日：** 2026-08-30

---

## `EVD-2` — 已售教材的版本會靜默更換

依 `docs/material-file-storage-and-delivery.md` §17 之驗收情境 D：

> 買家已購買 → 教材因檢舉下架 → 創作者上傳新版 → 管理員核准 →
> **買家之後下載到的是新版**（存取權綁定「教材」而非「版本」）。

**目前系統：**

- 訂單**未記錄**當初履約的是哪一個版本
- 版本更換時**無任何通知機制**
- 商品頁**未揭露**任何更新政策

**相關問題：** 律師 `Q-17`

---

## `EVD-3` — 教材權利聲明僅有勾選，無平台審查紀錄

`materials` 表中存有 `ip_declaration_accepted` 與 `ip_declaration_at`
（創作者的權利聲明勾選與時間）。

**但無**審查者、審查時間、風險標記、審查結果、審查依據、聲明版本等欄位。

也就是說：目前只能證明「創作者勾了」，**無法證明平台做過任何審查**。

**相關問題：** 律師 `Q-15(5)`

---

## `EVD-4` — 稽核紀錄表含個人識別資訊，且不得改寫

```sql
activity_logs (
  id TEXT (UUID), actor_id ..., actor_role TEXT, action ..., target_type ..., created_at ...
  （2026-08-26 `SCHEMA-01` 更正：本節先前記為 BIGSERIAL，與任何實際資料庫皆不符）
)
report_events (
  ... actor_role TEXT ...
)
```

專案內部規則（`CLAUDE.md`）明訂：

> 不改寫歷史 `activity_logs`：其中既有的角色值反映寫入當下的事實，屬稽核軌跡，不得回填。

**意義：** 稽核完整性的要求與個人資料「目的消失後應刪除」的要求之間存在接縫，
目前**未明文處理**。

**相關問題：** 律師 `Q-18`

---

## `EVD-5` — 尚無任何法律文件頁面 【**2026-08-30 部分 SUPERSEDED — capability exists ≠ document published；見下方 Freshness update**】

- 無 `/terms`、`/privacy`、`/legal` 等路由
- 無任何經核可之條文
- 註冊頁雖有同意勾選框，但**該同意未送至後端、未被儲存**
- `users` 表無任何同意相關欄位

**相關問題：** 律師 `Q-10`、`Q-13`

> ### Freshness update — 2026-08-30（**部分** superseded —— capability 與 publication 必須分開讀）
>
> **原始第 1 點（無路由）已不成立；其餘各點部分成立。**
> 本條最重要的更正是：**「有能力發布」與「已經發布」是兩件事**，
> 目前是**前者成立、後者不成立**。
>
> **CAPABILITY EXISTS：**
>
> - **四條 public route 已存在** —— `frontend/apps/web/app/{terms,privacy,refund,creator-agreement}/page.tsx`
> - **registry 已存在** —— `db/db_schema.sql:939` `legal_documents`，
>   `document_type` CHECK `('terms','privacy','creator_agreement','refund_policy')`、
>   `publication_status` CHECK `('draft','approved','published','superseded')`、
>   `version`（opaque 識別碼）、`effective_date`、`published_at`、`published_by`
> - **三項不變條件已在 DB 層** —— `legal_documents_publishable_check`、
>   `legal_documents_one_published_per_type`（partial UNIQUE index）、
>   `trg_legal_documents_immutable`（已發布內容不得改寫，更正只能發新版本）
> - **生命週期 API 已存在** —— `Backend/routes/adminLegalDocuments.js`：
>   `GET /admin/legal-documents`、`GET /:id`、`POST`（create draft）、`PATCH /:id`、
>   `POST /:id/approve`、`POST /:id/publish`；public 讀取為 `Backend/routes/legal.js`
>   的 `GET /legal/documents` 與 `GET /legal/documents/:type`
>
> **DOCUMENT CURRENTLY PUBLISHED：無。**
>
> - repo 中**唯一**的 `INSERT INTO legal_documents` 位於
>   `Backend/services/legalDocument.service.js:220`（`createDraft`）——
>   **沒有任何 seed script 或 migration 寫入條文**，發布完全是營運操作驅動
> - 因此在尚未由營運端發布之前，`GET /legal/documents/:type` 取不到 published 列，
>   四條 public route 也**沒有正文可顯示**
>
> **正確的敘述是：**
> **「法律文件 publication capability 已存在，但尚無 production-published legal document。」**
> **不得**寫成「法律文件已發布」。
>
> **原始第 3、4 點的現況：**
>
> - `users` 表**仍無**任何同意相關欄位（複驗：0 命中）—— 原敘述成立
> - **但已另有獨立的 `consent_records` 資料表**（`db/db_schema.sql` 中 17 處），
>   migration `Backend/migrations/20260826_consent_records_foundation.sql`
> - **同意仍未被實際蒐集** —— `Backend/routes/` 下唯一命中 `consent` 的檔案是
>   `adminLegalDocuments.js`，而該處是發布時的 `requiresReconsent` 參數，
>   **不是**同意寫入。亦即 **capability 部分就緒、consent capture 尚未接線**
>
> **複驗日：** 2026-08-30

---

## `EVD-6` — 已有發票欄位，但無開立流程

```sql
orders (
  ...
  invoice_type    TEXT NOT NULL DEFAULT 'none',   -- CHECK IN ('none','carrier')
  invoice_carrier TEXT,
  ...
)
```

欄位存在，但**無任何實際的發票開立、傳輸或憑證產生機制**。

**相關問題：** 會計師 `Q-07`

---

## `EVD-7` — 無創作者報酬帳、無創作者稅務資料

`db/db_schema.sql` 中：

- **無** payout / ledger / settlement 相關資料表
- **無** 創作者稅務身分、身分證統一編號、居住者狀態等欄位
- `users` 表僅有 `id`、`email`、`password_hash`、`role`、`created_at`

**相關問題：** 會計師 `Q-08`、`Q-09`、`Q-10`

---

## `EVD-8` — 產品端已設下「先定性、後撥款」的閘門

規格中明訂：在創作者報酬之所得性質確認前，
**應付報酬可以計算與累計，但不得進入正式撥款**。

理由：實際申報時必須填入所得類別，**沒有「中性」選項**可無限延後。

**相關問題：** 會計師 `Q-08`、`Q-09`

---

## `EVD-9` — 資料保存矩陣已建立（18 類），稅務各列待填

規格中已建立以「蒐集目的」為基礎的保存矩陣，涵蓋 18 類資料
（帳號、訂單、金融資訊、匯款憑證、創作者資料、創作者稅務資料、撥款紀錄、
客服紀錄、申訴與附件、檢舉、檢舉事件、稽核紀錄、資安紀錄、同意證據、
授權紀錄、教材檔案、業務終止處理紀錄、稅務憑證）。

**刻意未採用**「所有資料一律取最長期限」的模型。
其中稅務相關各列的期限**尚未填入**，待會計師回覆。

**相關問題：** 律師 `Q-18(4)`；會計師 `Q-13`

---

## `EVD-10` — Deployment Gate 現況

| | |
| --- | --- |
| Deployment Readiness | **0 / 14 IMPLEMENTED** |
| Gate 2（教材權利審查） | **PARTIAL** —— 見 `EVD-3` |
| 其餘 13 個 Gate | **NOT IMPLEMENTED** |

上述狀態均有 repo evidence 支持，**未有任何 Gate 被標為已完成而無證據**。

---

## `EVD-11` — 消費申訴／爭議處理流程（**2026-08-30 新增條目**）

> **本條為 2026-08-30 freshness reconciliation 新增。** 原始 2026-08-26 附錄完全未涵蓋，
> 因為當時尚無此流程。編號取 `EVD-11`（既有最大為 `EVD-10`；`INV-5` 已為
> `docs/p1-09-execution-plan-2026-08-26.md` 佔用，故不使用 `INV` 序列）。
> **既有條目未重新編號。**

平台已具備內部消費申訴／爭議處理的資料模型與營運流程。

| 面向 | 現況事實 | 來源 |
| --- | --- | --- |
| 資料表 | `consumer_complaints` —— 買家對**自己的交易**提出之申訴 | `db/db_schema.sql:495,507` |
| 案件類型 | `payment` / `delivery` / `download` / `material_mismatch` / `duplicate_payment` / `refund_request` / `account_security` / `other` | `db/db_schema.sql` `cc_type_check` |
| 狀態流程 | `submitted` → `under_review` → `responded` → `resolved` / `closed` | `cc_status_check` |
| 結案約束 | `cc_resolved_requires_summary`（結案必須寫得出處理結果）、`cc_resolved_requires_timestamp` | `db/db_schema.sql` |
| 買家端入口 | `POST /complaints`（提出）、`GET /complaints`、`GET /complaints/:id`、`POST /complaints/:id/evidence`（附證據）、`GET /complaints/:id/evidence/:evidenceId/file`（讀取），皆 `requireAuth` | `Backend/routes/complaints.js:61,86,100,124,246` |
| Admin 端處置 | `GET /admin/complaints`（依法定期限排序，`?overdue=1` 只看逾期）、`POST /admin/complaints/:id/transition`、`POST /admin/complaints/:id/link-remedy-case` | `Backend/routes/admin.js:1350,1388,1484` |
| 服務層 | `Backend/services/consumerComplaint.service.js` | — |
| 與退款之關係 | 申訴案件可 link 至 `refund_remedy_cases`；`consumer_complaints.related_remedy_case_id` 為 FK。schema 明載 **`resolved` ≠ 已退款** | `db/db_schema.sql:503,506,535` |
| 創作者的角色 | `consumerComplaint.service.js` 中**無任何 creator 互動路徑** —— 買家不與創作者直接對話；`creator/cases` 係創作者側的案件視圖，非買家爭議管道 | 複驗：service 內 `creator` 0 命中 |
| 買家 UI 入口 | 買家外殼全域導覽「申訴與消費爭議」→ `/me/complaints`（`BUY-02` / `DEC-LEGAL-09`） | `frontend/apps/web/components/dashboard/sidebar-nav-config.ts` |

**營運事實摘要：** 買家向**平台**提出，由**平台 Admin** 受理、調查、回覆與結案；
平台並得將案件連結至退款／補救案件。

**本條僅陳述流程如何運作，不就平台在爭議中的法律地位或責任作任何評價** ——
該定性屬 reviewer 判定事項（律師 `Q-20`；`review-handoff.md` §4.1-C 第 9 列）。

**複驗日：** 2026-08-30

---

# 附錄 2 — Question-to-Gate Dependency Matrix

| 問題 | 對象 | BLOCKS | Engineering can proceed | 需於首次銷售前？ | 需於首次撥款前？ |
| --- | --- | --- | --- | --- | --- |
| `Q-02` 支付定性 | 律師 | `PRE-03` 全部、A/C/E/N/P 條款、Gate 8、Gate 9 | PARTIAL | ✅ | ✅ |
| `Q-01` 出賣人定性 | 律師 | `PRE-03`、全部條款當事人結構 | PARTIAL | ✅ | ✅ |
| `Q-03` 出賣人呈現 | 律師 | `PRE-03`、E、N | YES | ✅ | —— |
| `Q-04` 定價權 | 律師 | `PRE-03`、C、E | YES | ✅ | —— |
| `Q-05` 淨銷售計算基礎 | 律師 | `PRE-03`、C、P | YES | —— | ✅ |
| `Q-06` reopen 觸發清單 | 律師 | `PRE-03.8` | YES | —— | —— |
| `Q-07` 再授權 | 律師 | `PRE-03.5`、C2、C3、Gate 14 | PARTIAL | ✅ | —— |
| `Q-08` sublicense survival | 律師 | `PRE-03`、C6-A、M2、M7、Gate 14 | PARTIAL | ✅ | —— |
| `Q-09` 歷史版本 | 律師 | `PRE-04.5`、C4、Gate 14 | PARTIAL | —— | —— |
| `Q-10` §18 資訊揭露 | 律師 | Gate 12、`MR-20`、N、E | PARTIAL | ✅ | —— |
| `Q-11` 數位內容例外 | 律師 | F、E7、`MR-20`、Gate 13、Gate 14 | PARTIAL | ✅ | —— |
| `Q-12` 解除受理與執行 | 律師 | Gate 14、E7、E8 | PARTIAL | ✅ | —— |
| `Q-13` 定型化契約 | 律師 | A、E、N、R1～R9、MAND Matrix | PARTIAL | ✅ | —— |
| `Q-14` 契約成立與審核期限 | 律師 | J1、Gate 6、`MR-20` 交付期日 | YES | ✅ | —— |
| `Q-15` 平台 IP 責任 | 律師 | `PRE-03.6`、G、D5、Gate 2 | YES | ✅ | —— |
| `Q-16` 侵權通知程序 | 律師 | G1～G3、C10 | YES | ✅ | —— |
| `Q-17` 更新分級 | 律師 | `PRE-04.2/.3`、Gate 7、R3 | PARTIAL | —— | —— |
| `Q-18` 稽核 vs 刪除權 | 律師 | RETENTION-MATRIX、K5、Gate 14 | PARTIAL | —— | —— |
| `Q-19` 停業 | 律師 | M7、Gate 10、P13 | NO | —— | —— |
| `Q-20` 消費爭議揭露 | 律師 | N1/N2/N4、Gate 3、MAND-14 | YES | ✅ | —— |
| **`Q-06` 營運主體與營業項目** | **會計** | **全部稅務、Gate 8、Gate 9、N** | **NO** | ✅ | ✅ |
| `Q-07` 憑證與開立時點 | 會計 | J、P4～P6、Gate 6、Gate 14 | PARTIAL | ✅ | —— |
| `Q-08` 所得性質 | 會計 | Gate 8、C9、P7、P10 | PARTIAL | —— | ✅ |
| `Q-09` 扣繳與申報 | 會計 | Gate 8、P10 | NO | —— | ✅ |
| `Q-10` 稅務資料蒐集 | 會計 | Gate 8、P9、B5 | PARTIAL | —— | ✅ |
| `Q-11` 退款憑證沖銷 | 會計 | Gate 14 稅務節點、P14、J | PARTIAL | —— | —— |
| `Q-12` 退款與報酬交互 | 會計 | P10、Gate 14 | PARTIAL | —— | ✅ |
| `Q-13` 保存期限 | 會計 | RETENTION-MATRIX、K5 | PARTIAL | —— | —— |

> **注意：** 律師與會計師的問題編號各自獨立。
> 律師包的 `Q-06` 是「reopen 觸發清單」；會計師包的 `Q-06` 是「營運主體與營業項目」。

---

# 附錄 3 — Engineering-Safe-Before-Validation 清單

> **判準：** 即使外部驗證的答案與目前假設**相反**，這些工作仍不會浪費。
> 本清單與 `docs/p1-09-execution-plan-2026-08-26.md` §F 一致。

> ### 2026-08-30 狀態註記 —— 本清單多項**已完成**
>
> 本清單是 2026-08-26 當時「等待外部驗證期間可安全進行的工作」。**它不是能力現況表。**
> 其後第 **2**（授權狀態欄位）、**5**（付款／核帳時間欄位）、**6**（結構化匯款辨識欄位）、
> **7**（帳號凍結）、**9**（同意證據基礎設施）等項**已實作完成**。
> 能力現況請一律以**兩份 validation package 已 re-baseline 的 `B-6` / `B-5` 表**，
> 以及本附錄各條的 Freshness update 為準；本清單**僅保留為當時的規劃紀錄**。

| # | 工作 | 為什麼與驗證答案無關 | Gate |
| --- | --- | --- | --- |
| 1 | `order_items` 增加「履約版本」與「履約時間」欄位 | 無論誰是出賣人、無論更新政策怎麼寫，「這筆訂單交付了哪個版本」都必須被記錄 | 7 |
| 2 | `order_items` 增加獨立的授權狀態欄位（active / suspended / revoked_pending / revoked_final ＋ 時間與操作者） | 無論授權存續怎麼約定，都需要可獨立撤銷的狀態；Marketplace 模式**更**需要 | 14 |
| 3 | `order_items.quantity` 增加 CHECK 約束 | 純產品規則，與法律定性無關 | `F-03` |
| 4 | `legal_hold` / `hold_reason` / `hold_set_at` / `hold_released_at` 四欄位，以及資料回收作業改為**只讀取不判斷**且 **fail-closed** | hold 的**觸發理由**待外部確認，**機制本身**中性 | 14 |
| 5 | 三個獨立時間欄位：`payment_info_submitted_at` / `payment_received_at` / `review_due_at`，以及 `payment_due_at` | 三個時鐘的**存在**與定性無關；只有 **日數** 待決定。且**不得改動 `paid_at` 既有語意**（見 `INV-3`） | 6、11 |
| 6 | 結構化匯款辨識欄位（銀行、後四碼、金額、匯款日） | 人工核帳在任何模式下都需要，且是爭議處理的基礎 | 6 |
| 7 | 帳號凍結能力 | 屬定型化契約應記載事項之法定義務，與出賣人定性無關 | 1 |
| 8 | 教材權利審查紀錄欄位（審查者／時間／風險標記／結果／依據／聲明版本） | 出賣人模式下**更**需要；Marketplace 模式下也需要 | 2 |
| 9 | 同意證據之**基礎設施**（版本化、關聯訂單／教材）—— 不含條文文字 | 版本化同意證據在任何模式下都需要 | 5 |
| 10 | `seller_id` 是否外洩至買家介面的**唯讀稽核** | 純檢查，零風險 | `S-13` |

**不在此清單者，一律等外部驗證**（見執行計畫 §G）。

---

# 附錄 4 — 複驗指令

外部人士若欲自行複驗，或產品端日後重新確認：

```bash
# INV-1 / EVD-6 / EVD-7：schema 現況
grep -n "^CREATE TABLE" db/db_schema.sql
sed -n '/CREATE TABLE IF NOT EXISTS order_items/,/^);/p' db/db_schema.sql
sed -n '/CREATE TABLE IF NOT EXISTS orders/,/^);/p' db/db_schema.sql
sed -n '/CREATE TABLE IF NOT EXISTS users/,/^);/p' db/db_schema.sql

# INV-2：entitlement 推導方式
grep -n "o.status = 'approved'" Backend/services/materialFile.service.js

# INV-3：paid_at 的語意
grep -n "paid_at" Backend/services/adminDashboard.service.js

# INV-4：匯款辨識欄位
grep -n "last_four\|last4\|bank_name\|payer_name\|remit" db/db_schema.sql

# EVD-1：退款能力
grep -rn "refund" Backend/routes/ Backend/services/ db/db_schema.sql
grep -n "Refund / reversal" docs/mvp_rules.md

# EVD-4：稽核表
grep -n "activity_logs\|report_events" db/db_schema.sql

# EVD-5：同意持久化
grep -n "terms_accepted\|consent" db/db_schema.sql
```

---

## 本附錄不做什麼

- 不對法律或稅務問題提出結論。
- 不修改任何 executable code。
- 所有條目均為**事實陳述**，可由上列指令複驗。
