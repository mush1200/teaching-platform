# P1-09 — Legal Draft Review Handoff Index

> **這是索引與審閱協調文件，不是法律文件，也不重寫任何條文。**
> 條文正文一律以四份草稿為準；本檔只負責「誰要回答什麼、卡住什麼」。

**建立日期：** 2026-08-27
**狀態：** 待外部審閱

```text
Production publication status : NOT PUBLISHED
Lawyer approval status        : PENDING
Accountant approval status    : PENDING
legal_documents rows          : 0
consent_records rows          : 0
Production consent wiring     : NONE
```

---

## 0. 交付物

| 文件 | 檔案 | 類型 | 對應 route |
| --- | --- | --- | --- |
| 服務條款 | [terms-of-service.draft.md](terms-of-service.draft.md) | `terms` | `/terms` |
| 隱私權政策 | [privacy-policy.draft.md](privacy-policy.draft.md) | `privacy` | `/privacy` |
| 創作者條款 | [creator-agreement.draft.md](creator-agreement.draft.md) | `creator_agreement` | `/creator-agreement` |
| 退款與取消政策 | [refund-cancellation-policy.draft.md](refund-cancellation-policy.draft.md) | `refund_policy` | `/refund` |
| 審閱清單 | [legal-review-checklist.md](legal-review-checklist.md) | 支援文件 | — |

四份草稿均標記 `DRAFT — NOT LAWYER APPROVED` / `NOT FOR PRODUCTION PUBLICATION`。
四條 public route 已存在；**在對應文件發布前一律回應 404**，不顯示任何草稿或替代內容。

### 0.1 完整交付清單（10 份）—— 送出時以本表為準

> **2026-09-04 補列。** 上表原本只列出本目錄內的六份文件，
> **未列出 §4.1 所依賴的四份 `PRE-03` 委託文件** —— §4.1 明示
> 「`PRE-03` 的完整事實陳述與逐題委託內容**早已存在**於下列四份文件，本節**不重複**它們」，
> 因此只送出上表六份，審閱者會拿到一份指向手上沒有的文件的索引。
> 本節**僅補齊清單，未新增或重複任何內容**。

| # | 檔案 | 收件對象 | 用途 |
| --- | --- | --- | --- |
| 01 | `docs/legal-drafts/review-handoff.md`（本文件） | 律師 ＋ 會計師 | 索引：交付物、審閱順序、Owner 決定、§3／§4 範圍、§4.1 會同判定 packet 與回覆模板 |
| 02 | `docs/legal-drafts/legal-review-checklist.md` | 律師 ＋ 會計師 | A～E 勾稽清單 |
| 03 | `docs/legal-drafts/terms-of-service.draft.md` | 律師 ＋ 會計師 | 買家端契約；當事人結構取決於 `PRE-03` |
| 04 | `docs/legal-drafts/creator-agreement.draft.md` | 律師 ＋ 會計師 | 授權鏈與報酬；與稅務高度重疊 |
| 05 | `docs/legal-drafts/privacy-policy.draft.md` | 律師 | 個資、受託處理者、跨境傳輸、保存期間 |
| 06 | `docs/legal-drafts/refund-cancellation-policy.draft.md` | 律師 ＋ 會計師 | 解除權例外、退款義務、憑證時點 |
| 07 | `docs/pre-03-lawyer-validation-package-2026-08-26.md` | **律師** | 律師委託書：事實 `B-1`～`B-6`、問題 `Q-01`～`Q-20`、`L-F` |
| 08 | `docs/pre-03-accountant-validation-package-2026-08-26.md` | **會計師** | 會計師委託書：問題 `Q-06`～`Q-13`、`T-D`、`T-F` |
| 09 | `docs/pre-03-validation-evidence-appendix-2026-08-26.md` | 律師 ＋ 會計師 | 證據附錄 `INV-*`／`EVD-*`、問題→Gate 矩陣、複驗指令 |
| 10 | `docs/pre-03-platform-seller-model-verification-2026-08-26.md` | 律師 ＋ 會計師 | 第二輪獨立排查：`N1`～`N5` 風險、§6 封版所需之 6 項最小條件 |

> **07～10 四份的完整說明見 §4.1 的文件表**（含行數與內容摘要）。
> 本節只負責「送出時不要漏掉」，**不重複** §4.1 的內容。

**Draft Identifier：** `draft-2026-08`（**不是** production document version；
正式 `version` 由 `legal_documents` registry 於核可後指派）。

---

## 1. 審閱順序建議

```text
① Owner（§2）        ← 無外部依賴，可立即開始
       ↓
② PRE-03 定性        ← 律師 ＋ 會計師會同；三份條款的當事人結構取決於此
       ↓
③ Lawyer（§3）       ── 可與 ④ 並行
④ Accountant（§4）   ── 可與 ③ 並行
       ↓
⑤ 條文定稿 → 發布 → consent activation wave
```

**`PRE-03` 是關鍵路徑。** 在平台交易地位定性確定前，
《服務條款》§1、《創作者條款》§1.4 的當事人結構無法定稿。

---

## 2. Owner Review

| # | 議題 | 文件／條文 | 現況 | Blocks what |
| --- | --- | --- | --- | --- |
| O-1 | ~~**文件集合與識別**~~ | 全部 | **✅ CONFIRMED（2026-08-27, Round 2）** —— `DEC-04` 維持：四份，Refund 獨立，不重開設計 | — |
| O-2 | ~~**版本命名規則**~~ | 全部 | **✅ DECIDED `DEC-LEGAL-05`（2026-08-27）** —— integer sequence，每型別獨立 | — |
| O-3 | **「重大變更」定義與判定者** | 全部（修訂條款） | **部分決定** —— 記錄形狀 ✅ `DEC-LEGAL-06`；設定權限與內部檢核 ✅ `DEC-LEGAL-11`（Round 3，實作未開始，tracker `OPS-03`）；**法律判準仍未決**（`DEC-LEGAL-01`） | re-consent 之法律判準 |
| O-4 | **既有使用者遷移之受管制行為對應** | Terms §17.4 | `DEC-LEGAL-02` 已定原則：不全站強制阻擋，於下次受管制行為補同意 | consent activation wave |
| O-5 | ~~**個資保護聯絡管道**~~ | Privacy §12 | **✅ DECIDED `DEC-LEGAL-07`（2026-08-27）** —— dedicated privacy email | —（作業流程另見 O-21） |
| O-6 | ~~**外部申訴管道 UX**~~ | Terms §12.6 | **✅ DECIDED `DEC-LEGAL-09`（2026-08-27）** —— Option C：global entry ＋ 既有 order-context CTA 並存。**實作未開始**（tracker `BUY-02`） | 機關資訊內容仍併同 `L-17`（blocked） |
| O-7 | ~~**PDF 證據產品方向**~~ | Terms §12.3 | **✅ DECIDED `DEC-LEGAL-08`（2026-08-27）** —— Option A：PDF evidence **upload** 不列為 MVP launch blocker | `PROD-01` **法律下限仍 blocked** |
| O-8 | 註冊姓名是否停止蒐集 | Privacy §2.1 | **✅ CONFIRMED（2026-08-27, Round 2）** —— `DEC-06 = A` 維持。**⚠ 實作未完成**：frontend-only 蒐集仍在線（tracker `DEC-06` `OPEN`） | Privacy 揭露範圍 |
| O-9 | 本機事件記錄是否移除 | Privacy §2.7 | **✅ CONFIRMED（2026-08-27, Round 2）** —— `DEC-08 = A` 維持。**⚠ 實作未完成**：`lib/analytics.ts` ＋ 5 個 producer 仍在線（tracker `DEC-08` `OPEN`） | Privacy 揭露範圍 |
| O-10 | **購買者使用範圍**（再散布／改作／商業利用） | Terms §14.2 | 未定 | 併同 `L-04` |
| O-11 | **授權是否專屬；平台行銷使用範圍** | Creator §4.3 | 未定 | 併同 `L-04` |
| O-12 | 創作者資格條件（年齡等） | Creator §2.2 | 平台未蒐集出生日期、無年齡驗證 | Creator 定稿 |
| O-13 | **平台服務費比例、折扣承擔、結算週期** | Creator §9.2 | 撥款系統不存在 | 併同 `T-09`/`T-10` |
| O-14 | 退款時創作者是否負擔、比例 | Creator §10.1 | 未定 | 併同 `T-08` |
| O-15 | ~~退款收款帳戶之蒐集方式~~ | Refund §6.2 | **✅ DECIDED `DEC-LEGAL-12`（2026-08-28, Round 3）** —— Option A：維持**不在平台內保存**，個案式站外取得；待 `L-21`/`L-22` 後重新評估 | —（保存規則仍待 `L-21`/`L-22`） |
| O-16 | **退款案件處理時限** | Refund §7.1 | **草稿刻意未填天數** | Refund 定稿 |
| O-17 | 帳號凍結後之申訴／解除流程 | Terms §2.5 | **部分決定** —— 內部 operating model ✅ `DEC-LEGAL-10`（single-admin ＋ 標準化 reason ＋ Admin UI；實作未開始，tracker `OPS-02`）。**對外申訴時限／法定回覆日數仍未決** | Terms 定稿（對外側） |
| O-18 | 平台停止營運計畫（四組處置） | Terms §13.3 | 未訂定 | Gate 10、併同 `L-15` |
| O-19 | 郵件服務供應商揭露 | Privacy §5.3 | **✅ FACT NOW KNOWN（2026-08-31，Owner 拍板 `DEC-13`／`DEC-14` 之 `DEC-14`）** —— 交易郵件供應商 **Resend**，法人 **Plus Five Five, Inc.**，整合方式為 **nodemailer 經通用 SMTP relay**。供應商文件：DPA `resend.com/legal/dpa`；分包商清單 `resend.com/legal/subprocessors`；隱私政策 `resend.com/legal/privacy-policy`；該 DPA 載明主要處理作業位於美國並納入 SCCs。**以上皆為事實陳述。`LEGAL SUFFICIENCY: PENDING LAWYER REVIEW` —— 本 repo 不判斷 DPA、SCCs、分包商、隱私條款或資料所在地是否於法充分。**（2026-08-27 原記載為 `FACT UNKNOWN — OWNER / DEPLOYMENT INPUT REQUIRED`，已由本次拍板取代。**production 郵件尚未啟用** —— DNS／網域驗證未完成，且寄件網域待 production 網域鎖定。） | Privacy 定稿 |
| O-20 | 部署環境委外處理者揭露 | Privacy §5.4 | **⚠️ 部分事實已知（2026-09-04 事實更新）** —— **本列 2026-08-31 版依 `DEC-13` 記載「基礎建設供應商為 Render（含 Managed PostgreSQL、Persistent Disk）；私有檔案儲存 driver 維持 `local`，不使用任何物件儲存供應商 —— S3／R2 明確不屬於 MVP」。該敘述已由同日之 `DEC-16`／`DEC-17` 取代，與現行 production 不符，於本次更正。** 現行**受託處理者為四家**：應用程式主機（Frontend／Backend）**Render**／production 資料庫 **Neon**／私有檔案儲存（**含付款憑證**）**Backblaze B2**（S3-compatible driver，`PRIVATE_FILE_STORAGE_DRIVER=s3`）／交易郵件 **Resend**（**production 郵件尚未啟用**，見 `PRE-10`）。**付款憑證（含買家姓名、帳號末碼、匯款截圖）存放於 Backblaze B2；依本 repo canonical 紀錄該儲存位於美國，且 Backblaze 無亞太 region。** 另有一項**非受託處理者**之個資存放位置：Owner 自行保管之 `pg_dump` 備份副本（Neon Free 無 automated backup、PITR 僅 6 小時）。`PRE-01` 已拍板；`PRE-02` 已由 `DEC-15`（fresh DB）簡化為驗證性工作。**仍未齊備者：production 網域與主機名稱（`PENDING OWNER DECISION / PURCHASE`）**，以及上列四家供應商之法人名稱、DPA／分包商／資料所在地文件（除 `O-19` 已蒐集 Resend 部分文件連結外，其餘尚未查證）。**與 Privacy §5.4 之事實敘述一致。****以上皆為事實陳述。`LEGAL SUFFICIENCY: PENDING LAWYER REVIEW`。** | Privacy 定稿 |
| **O-21** | **當事人權利之受理作業流程** | Privacy §8.3 | **部分決定** —— 內部受理模型 ✅ `DEC-LEGAL-13`（Round 3：重用 case-management，獨立分類；實作未開始，tracker `OPS-04`）；**法定回覆期限與身分驗證標準仍未決** | Privacy §8 定稿（法律側） |
| **O-22** | **帳號刪除之技術語意與流程**（`SCHEMA-02`） | Privacy §9.2 | 未解決之設計問題；**BLOCKED ON `L-21`** | Privacy §9、刪除權實作 |

> **Inventory correction（2026-08-27，Owner Decision Lock Round 1）：**
> **O-21 與 O-22 為本次補列。** 兩者先前存在於草稿 marker
> （Privacy §8.3、§9.2）與 `legal-review-checklist.md` §D（#6 即 `SCHEMA-02`），
> 但**未列入本表**，造成 Owner Review Queue 的 inventory 與草稿不一致。
> 補列**僅為盤點修正**，**未就 O-21／O-22 之實質內容作出任何決定**。

**優先三項（後續 consent activation 的前置）：O-2、O-3、O-5
—— 已於 2026-08-27 完成 Owner Decision Lock Round 1，見 §2.1。**

---

## 2.1 Owner Decisions Recorded

> 本節只記錄 **Owner 已明確拍板** 的事項。
> **不得**據此解除任何 `LAWYER REVIEW REQUIRED` 或 `ACCOUNTANT REVIEW REQUIRED` marker。

### `DEC-LEGAL-05` — 法律文件版本命名規則（O-2）

**決定：** `legal_documents.version` 採 **integer sequence**。

* 每個 `document_type` **各自獨立編號**（`terms` 的第 3 版與 `privacy` 的第 3 版無關）。
* 第一版自 `1` 起算，其後 `2`, `3`, `4`…
* `version` **僅作為文件版本識別**，**不代表變更幅度，亦不代表法律上的重大／非重大變更**。
* 對外 UI 呈現形式：「**服務條款 第 3 版 · 生效日 YYYY-MM-DD**」。
* **不採** semantic versioning，**不採** date-based version。

**Repository 相容性（決定前已驗證）：** `version` 為 opaque `TEXT NOT NULL`，唯一約束
`TRIM(version) <> ''`；`UNIQUE (document_type, version)`；**current version 之判定
完全不使用 `version`**（partial UNIQUE index ＋ `getCurrentPublished()` 只看
`publication_status = 'published'`）；版本歷史 `ORDER BY created_at DESC, id DESC`。
因此本決定**不需要任何 schema 變更**。`legal_documents` 實查 0 列，無 backfill 問題。

> **時效性：** 一旦第一筆 `consent_records` 寫入，版本字串即成為凍結的歷史證據。
> 本規則必須在**第一次 publish 之前**生效 —— 已於此處生效。

**External validation：** NONE。

---

### `DEC-LEGAL-06` — Re-consent enforcement metadata（O-3，系統記錄形狀側）

**決定：** production 以 **`legal_documents.requires_reconsent BOOLEAN`** 記錄
「此版本是否要求重新同意」。Owner 同時核可下列 implementation constraints：

1. 此欄位屬 **production enforcement metadata**，**不代表法律上「重大變更」之認定**。
2. 欄位應為 **`NOT NULL`**。
3. API／publish flow **不得提供會掩蓋決策的 implicit default**；發布時必須顯式決定 true／false。
4. 發布後沿用既有 published immutability（`trg_legal_documents_immutable`），**不得事後修改**。
5. 設定者、設定時間與理由應留下**可稽核紀錄**。
6. 法律上何種變更應設為 true，**仍維持 `LAWYER VALIDATION REQUIRED`**，不由本次 Owner Decision 取代。

**Repository 現況（決定前已驗證）：** 全 repo grep `requires_reconsent` /
`change_classification` → **0 hit**；`reconsent` 目前僅作為
`consent_records.context_type` 的允許值存在（記錄「這筆同意是透過重新同意流程產生」），
**沒有任何地方記錄「哪一版要求它」**。

> **實作狀態：✅ 已完成**（2026-08-27，tracker `SCHEMA-03`）。
> `legal_documents.requires_reconsent BOOLEAN NOT NULL`（DB 與 service 兩層皆無
> default／fallback）；publish 即使草稿已有值仍須再次顯式提供並覆寫；
> immutability trigger 白名單已同步（該 trigger 不會自動涵蓋新欄位）；
> `verifyCriticalSchema()` fail-closed 驗型別＋NOT NULL＋無 DEFAULT；
> 稽核 meta 帶 `requiresReconsent` 且不含法律理由欄位。
> DB 432/432、unit 213/213、smoke exit 0。
>
> **但這只是能力建置。** 沒有任何法律文件被發布、`consent_records` 仍 0 列、
> **Gate 5 consent wiring 維持 NOT ACTIVATED**。

**External validation：** **LAWYER VALIDATION REQUIRED** —— 僅就「設定旗標時所適用的判準」
與「`DEC-LEGAL-02` 補同意機制之適法性」（併同 `L-12`）；**欄位形狀本身不需要**。

---

### `DEC-LEGAL-07` — 個資保護聯絡管道（O-5）

**決定：** 採 **Dedicated Privacy Email**，作為《隱私權政策》正式之
個資權利／個資保護聯絡入口。

* **MVP 階段先以 Owner 指定之個人 Email 作為實際受理地址**
  （已填入 `privacy-policy.draft.md` §12）；**正式專用 privacy mailbox 建立後再行替換**。
* 採用個人 Email **僅為聯絡端點之安排** —— 不因此改變其他個資處理流程，
  亦不構成任何法律結論。
* 站內 authenticated request／ticket 機制得作為**後續強化項目**，
  但**不得取代** Email 作為**無法登入使用者**之 fallback channel。

**Repository 現況（決定前已盤點）：** repo 內**不存在**任何 support／privacy／legal email、
`/contact`／`/support` route 或營業地址；對外**僅有送信能力**
（`emailService.js` 之 `SMTP_FROM || SMTP_USER`，供應商由部署環境決定＝ O-19）；
站內申訴管道存在但**全部端點皆要求登入**（`Backend/routes/complaints.js`），
故結構上無法服務登入不了的人 —— 而平台**無密碼重設功能**（Terms §2.4）。

> **本決定僅涵蓋「採用哪一種管道」。** 受理後之作業流程、請求者身分核對方式，
> 以及法定回覆期限**均未決** —— 見 **O-21** 與 Privacy §8.3 的 lawyer marker。

**External validation：** 管道選擇本身 NONE；O-21（作業流程／法定回覆天數）
維持 **LAWYER VALIDATION REQUIRED**。

---

> **本輪未變更之事項：** 四份草稿**仍為 `DRAFT — NOT LAWYER APPROVED`**、
> **未發布**；`legal_documents` 0 列、`consent_records` 0 列、
> production consent wiring **NONE**；所有
> **BLOCKED — EXTERNAL REVIEW** 項目**維持 blocked**；`P1-09` 維持 `OPEN`。

---

## 2.2 Owner Decisions Recorded — Round 2（2026-08-27）

> 同 §2.1：本節只記錄 Owner 已明確拍板者，**不得**據此解除任何
> `LAWYER REVIEW REQUIRED` / `ACCOUNTANT REVIEW REQUIRED` marker。
> **本輪為 decision-only —— 未開始任何 implementation。**

### O-1 — 文件集合與識別：**CONFIRM（`DEC-04` 維持）**

四份文件維持：Terms of Service／Privacy Policy／Creator Agreement／
**Refund & Cancellation Policy（獨立文件）**。**不重新開啟文件集合設計。**

**Repository 佐證（確認前已驗證）：** DB `legal_documents_type_check`、service
`DOCUMENT_TYPES`、四條 public route 三者完全一致；`consent_records.context_type`
已內含 Refund 專屬情境（`checkout_rescission_notice`，與 `checkout_purchase_rules` 分離）。
**無任何相反設計；確認之實作成本與 migration cost 皆為 0。**

**External validation：** 文件「拆分方式」本身 NONE；各文件**內容**仍為律師審閱範圍。

---

### `DEC-LEGAL-08` — PDF evidence 產品優先序（O-7）

**決定：Option A —— PDF evidence *upload* 不列為 MVP launch blocker。**
MVP 維持現行 JPG／PNG／WebP evidence upload 能力；`PROD-01` 保留為
future / external-validation item。

**Owner 明示之限定（逐字保留）：**

1. 本決策**只是 product priority**。
2. **不代表** Owner 判定「法律上不需要接受 PDF」。
3. 金融機構 PDF 證明是否屬法律上必須接受的最低格式要求，
   **仍維持 `LAWYER VALIDATION REQUIRED`**。
4. 若後續律師確認 PDF 為必要格式，**依該法律要求重新提升 implementation priority**。
5. **不得**把「PDF evidence upload」與「downloadable PDF evidence package / export」
   合併成同一需求。
6. **PDF export 不在本次 Owner Decision 範圍內**（因此本輪**未**為其建立任何 TODO）。

**Repository 現況：** 申訴證據沿用 `utils/paymentProofPolicy.js` 的型別政策
（JPG／PNG／WebP）；該檔記載真正的阻礙不是安全性，而是 **Admin 審核 UI 是
`<img>` inline preview** —— 開放 PDF 而不改 viewer 會造成「上傳成功但審核者看不到」。
repo **全域沒有任何 PDF 產生／匯出函式庫**。

**External validation：** **LAWYER VALIDATION REQUIRED**（`PROD-01` 法律下限，維持 blocked）。

---

### `DEC-LEGAL-09` — 申訴入口 UX（O-6）

**決定：Option C —— global complaint entry ＋ 既有 order-context entry 並存。**

1. **保留**目前 Order Detail 的 contextual complaint CTA（它帶著 `orderId`）。
2. **新增**一個全域、容易找到的「申訴／消費爭議」入口。
3. Global entry 須讓使用者**不必先進入特定訂單頁**也能找到申訴功能。
4. 若建立案件需要登入，UI **必須誠實顯示「登入後提出申訴」** ——
   **不得假裝已支援 anonymous complaint**。
5. 既有四處「請聯繫客服」但實際不存在客服入口的 dead copy，
   後續應改為指向真實存在的 complaint／help destination。
6. **Privacy Email 不作為一般 consumer dispute channel**，維持個資權利用途
   （`DEC-LEGAL-07`）。
7. **本輪不填寫任何主管機關名稱、電話、地址或外部申訴資訊。**
8. 若目前沒有 Footer，**不要求**為此決策建立大型 Footer ——
   implementation round 應先盤點最符合現有 IA 的 global placement，再做 minimal implementation。

**Repository 現況：** 申訴功能的**唯一**入口是 `/me/orders/[orderId]`；
buyer nav 與 guest nav 皆無申訴項目；**repo 內沒有 footer 元件**；
complaint 端點**全部** `requireAuth`；四處 dead 「客服」文案分別在
`checkout/page.tsx`（兩處）、`components/payment/BankTransferInfo.tsx`，
以及 **`middlewares/accountStatus.js` 的凍結回應訊息**。

> **實作未開始** —— tracker **`BUY-02`**（`OPEN`）。
> `L-17`（外部機關正式名稱與聯絡方式）**維持 LAWYER / EXTERNAL VALIDATION REQUIRED**。

**External validation：** 版位本身 NONE；外部管道**文案內容**為 `L-17`（blocked）。

---

### `DEC-LEGAL-10` — 帳號凍結內部 operating model（O-17）

**決定：Option C —— single-admin freeze／unfreeze authority ＋ standardized
operational reason／checklist ＋ audit trail ＋ Admin UI。不導入 MVP two-admin approval。**

canonical 條文見 `docs/mvp_rules.md` §12.2a〈Operating model〉。

**維持既有（backend 已實作）：** single-admin freeze／unfreeze、freeze reason required、
actor／timestamp 稽核、frozen history 保留、cannot freeze self、cannot freeze admin。

**後續 implementation（tracker `OPS-02`，本輪未開始）：** 實際 Admin UI 入口
（不應長期維持 API-only）／保留 mandatory reason／建立有限且可稽核的
standardized reason taxonomy 或 checklist／需要時可另存 free-text note
但**不得取代**標準 reason／freeze 與 unfreeze 皆維持 auditability。

> **本決策不定義任何法定申訴期限、法定回覆日數或法律上的 due-process minimum。**
> 對外 appeal / response SLA **仍維持 Owner ＋ Lawyer review**（Terms §2.5）。

**External validation：** 內部 operating model NONE；**對外承諾側 LAWYER VALIDATION REQUIRED**。

---

### O-8 / O-9 — CONFIRM，但**實作未完成**

| # | 決定 | 實作狀態 |
| --- | --- | --- |
| O-8 | **`DEC-06 = A` 維持** —— 註冊不應要求或蒐集使用者姓名 | ❌ **未完成**，tracker `DEC-06` `OPEN` |
| O-9 | **`DEC-08 = A` 維持** —— 移除無 consumer、無 network egress 的 client-side local analytics | ❌ **未完成**，tracker `DEC-08` `OPEN` |

**O-8 現況（Round 2 盤點）：** backend **從未**蒐集（`POST /auth/register` 只取
`email`／`password`／`role`），`users` 表**沒有** `name` 欄位 ——
因此**不需要**新增或移除任何 backend／schema。仍在線的是**純前端蒐集**：
註冊表單的必填姓名欄位與 zod 驗證、以及 `tp_display_name` 的寫入。
Sidebar 得沿用既有 fallback（「使用者」），**不得**為了保留姓名顯示而建立新的蒐集機制。

**O-9 現況（Round 2 盤點）：** `lib/analytics.ts` 仍在，`tp_analytics_events`
仍寫入 localStorage，**5 個 live producer**（checkout ×3、payment-proof ×2），
**consumer 為 0**，且 **logout 不清除**此 storage。
**不得**因本項移除或弱化 backend `activity_logs` —— 那是 server-side audit trail，
與 client-side local analytics 是兩件事。

> **CONFIRM ≠ COMPLETE。** 兩項皆**不得**標記為實作完成。

---

### O-19 — 事實已補齊（2026-08-31）

```text
FACT KNOWN — OWNER DECISION LOCKED 2026-08-31 (DEC-14)
LEGAL SUFFICIENCY: PENDING LAWYER REVIEW
```

**事實（僅事實，無法律判斷）：**

| 欄位 | 內容 |
| --- | --- |
| 交易郵件供應商 | **Resend** |
| 法人名稱 | **Plus Five Five, Inc.** |
| 使用之服務 | 交易郵件寄送（SMTP relay） |
| 整合方式 | **nodemailer 經通用 SMTP relay**（`smtp.resend.com`）；**未使用供應商 SDK** |
| DPA | `https://resend.com/legal/dpa` |
| 分包商清單 | `https://resend.com/legal/subprocessors` |
| 隱私政策 | `https://resend.com/legal/privacy-policy` |
| 資料所在地（依其 DPA 記載） | 主要處理作業位於**美國**；納入 Standard Contractual Clauses |

> **本 repo 不對上述任何一項作法律評價。**
> 是否符合《個人資料保護法》之委外監督要求、國際傳輸是否適法、
> DPA／SCCs／分包商安排是否充分 —— **全部屬律師判斷**，標記
> `LEGAL SUFFICIENCY: PENDING LAWYER REVIEW`。
>
> **本輪僅提供事實，未將任何供應商名稱填入《隱私權政策》§5.3 的條文本文。**
> 條文如何表述、是否需揭露分包商層級，由律師於定稿時決定。

**尚未完成者（與上述事實無關，屬營運前置）：**
production 郵件**尚未啟用** —— 寄件網域驗證與 SPF／DKIM／DMARC 尚未設定，
且寄件網域取決於仍為 `PENDING` 的 production 網域。

<details>
<summary>2026-08-27 原記載（已由本次拍板取代，保留供稽核）</summary>

```text
FACT UNKNOWN — OWNER / DEPLOYMENT INPUT REQUIRED
```

Owner 表示 production email provider **尚未決定**。
**不得猜測 provider，不得將任何 provider 名稱填入《隱私權政策》§5.3。**

**Repository 佐證：** `.env.example` 的 `SMTP_HOST`／`SMTP_USER`／`SMTP_PASS`／
`SMTP_FROM` **皆為空白**（僅 `SMTP_PORT=587`，通用 submission port）；
`emailService.js` 使用**通用** `nodemailer.createTransport({host, port, secure, auth})`，
**未使用任何 provider 專屬 `service:` 捷徑**；repo 內**沒有任何**部署或 CI 設定檔
（無 Dockerfile／docker-compose／render／railway／vercel／fly／Procfile／`.github/`）。
**local `Backend/.env` 不構成 production provider 之證據**（且為 git-ignored 秘密檔，
本輪只確認變數已設定，未讀取其值）。

**待補事實（僅此一項）：** production 寄信所使用之 email service provider 名稱。

</details>

---

## 2.3 Owner Decisions Recorded — Round 3（2026-08-28）

> 同 §2.1／§2.2：只記錄 Owner 已明確拍板者。
> **不得**據此解除任何 `LAWYER REVIEW REQUIRED` / `ACCOUNTANT REVIEW REQUIRED` marker。
> **本輪為 decision-only —— 未開始任何 implementation。**

### `DEC-LEGAL-11` — `requires_reconsent` 之設定權限與內部檢核（O-3，操作權限側）

**決定：Option B —— 維持 single-admin authority，但每次設定 `requires_reconsent`
時必須留下標準化、可稽核的 internal justification。**

**Owner 明示之限定（逐字保留）：**

1. 此 internal justification **僅屬 production / operational metadata**，
   **不代表法律上的「重大變更」認定**。
2. 法律上何種變更必須要求重新同意，**仍維持 `LAWYER VALIDATION REQUIRED`**。

**Repository 現況（決定前已驗證）：** `requires_reconsent` 已為
`BOOLEAN NOT NULL`、無 DB default、發布時必須顯式提供、發布後由
`trg_legal_documents_immutable` 鎖死，稽核 meta 帶 `requiresReconsent`
（`SCHEMA-03`，2026-08-27 完成）。**權限目前僅為結構性的** ——
`routes/adminLegalDocuments.js` 是 `requireAuth + requireRole("admin")`，
因此任何能發布的 Admin 都能設定該旗標；**沒有任何檢核或理由紀錄**。

**與既有 pattern 的一致性：** 本決定與 `DEC-LEGAL-10`（帳號凍結）同一形狀 ——
單人權限 ＋ 標準化理由 ＋ 稽核；實作亦應沿用 `OPS-02` 已驗證的作法
（`utils/*Policy.js` 的 allowlist ＋ backend 驗證 ＋ `activity_logs.meta`，
不新增法律分類 enum）。

> **⚠ 實作未開始** —— tracker **`OPS-03`**（`OPEN`）。
> 本決定**只是決定**：justification taxonomy、backend 驗證、稽核寫入與測試皆未做。

**External validation：** 內部檢核機制本身 NONE；
**「什麼變更依法必須設為 true」維持 `LAWYER VALIDATION REQUIRED`**（`DEC-LEGAL-01`）。

---

### `DEC-LEGAL-12` — 退款收款帳戶之蒐集方式（O-15，產品側）

**決定：Option A —— MVP 維持退款收款帳戶不在平台內保存。**

* 退款銀行帳戶資料維持**個案式、站外取得**。
* **不新增退款帳戶 DB 欄位。**
* **不在 registration / checkout 預先蒐集。**
* 待 `L-21` / `L-22` 對個資保存與刪除規則完成外部確認後，
  **再重新評估**是否改為 in-platform per-case collection。

**Repository 現況（決定前已驗證）：** `refund_remedy_cases` 記錄
`refund_amount` / `refund_method`（僅 `manual_bank_transfer`）/ `refund_reference` /
`refund_paid_at`，但**沒有任何 payee 或銀行帳戶欄位**；
全 schema grep `refund.*(account|bank|payee)` 無實質命中。
亦即現況本來就是站外取得 —— 本決定是**明確維持**，不是新增限制。

> **本決定不產生 implementation TODO** —— 維持現狀即是決定內容。
> 若日後改採 in-platform 蒐集，**必須先有保存期間結論**，否則會建立一個
> 沒有合法保存期限的敏感欄位。

**External validation：** 產品選擇本身 NONE；
**改採 in-platform 時需 `LAWYER VALIDATION REQUIRED`**（最小必要範圍與保存期間，`L-21`/`L-22`）。

---

### `DEC-LEGAL-13` — 個資權利請求之內部受理模型（O-21，操作側）

**決定：Option B —— 對外維持 Privacy Email 入口（`DEC-LEGAL-07`），
平台內部重用既有 audited case-management pattern 進行案件追蹤。**

**Owner 明示之限定（逐字保留）：**

1. 必須建立**清楚獨立的 privacy-request category / domain distinction**。
2. **Consumer complaint 與 privacy-rights request 不得混為同一法律／產品概念。**
3. 可以重用底層 **case lifecycle / event / evidence infrastructure**。
4. **不得**因本決策自行設定 statutory response deadline。
5. **不得**自行定義 identity-verification legal standard。
6. 法定期限與身分驗證標準**仍維持 `LAWYER VALIDATION REQUIRED`**。

**Repository 現況（決定前已驗證）：** 平台**沒有任何**個資請求受理、追蹤或結案機制
（grep `privacy.?request` / `data.?subject` / 個資請求 → 0 命中）。
但已有一組完整且已稽核的 case-management 三件組：
`consumer_complaints` ＋ `consumer_complaint_events` ＋ `consumer_complaint_evidence`，
含 8 種 `complaint_type`、5 態生命週期、SLA 計算與授權證據交付。

> **⚠ 實作未開始** —— tracker **`OPS-04`**（`OPEN`）。
> **重用基礎設施 ≠ 併為同一案件類別** —— 兩者法律基礎不同，
> 實作時必須在資料模型與 UI 上明確區分。

**External validation：** 內部受理模型 NONE；
**法定回覆期限與身分驗證標準維持 `LAWYER VALIDATION REQUIRED`**（Privacy §8.3）。

---

> **本輪未變更之事項：** 四份草稿仍為 `DRAFT — NOT LAWYER APPROVED`、**未發布**；
> `legal_documents` 0 列、`consent_records` 0 列、production consent wiring **NONE**；
> 所有 **BLOCKED — EXTERNAL REVIEW** 項目維持 blocked；`P1-09` 維持 `OPEN`。

---

## 3. Lawyer Review

### `PRE-03` — 平台交易地位定性

| | |
| --- | --- |
| **Document** | Terms §1.3；Creator §1.4 |
| **Question** | 平台在交易中係出賣人、居間，抑或代理收付網路實質交易款項？ |
| **Decision needed** | 法律定性意見書；若為代理收付，須確認第三方支付服務能量登錄義務 |
| **Blocks what** | **三份條款的當事人結構**、發票開立主體、`T-02`、Terms §1／Creator §1.4 定稿。**整包的關鍵路徑** |

### `L-04` — 授權鏈與再授權要件

| | |
| --- | --- |
| **Document** | Creator §4.3；Terms §14.2 |
| **Question** | 創作者 → 平台 → 購買者之授權鏈應如何建構？是否滿足著作權法 §37 III 再授權要件？購買者取得之使用權範圍如何表述？ |
| **Decision needed** | 授權條款文字（草稿**刻意全文留白**，未寫寬泛的永久／全球／不可撤銷授權） |
| **Blocks what** | Creator §4、Terms §14；`L-05`／`L-06` |

### `L-05` — 上位授權終止後之再授權存續

| | |
| --- | --- |
| **Document** | Creator §4.3、§13.2 |
| **Question** | 創作者終止授權或平台解散後，已授出之再授權是否存續？ |
| **Decision needed** | 存續條款文字 |
| **Blocks what** | Creator §13；`L-14` |

### `L-06` — 歷史版本保存與交付所需授權

| | |
| --- | --- |
| **Document** | Creator §4.3 |
| **Question** | 平台為履行既有購買者權利而保存並交付歷史教材版本，所需之授權範圍為何？ |
| **Decision needed** | 授權範圍文字 |
| **Blocks what** | Creator §8；`RM-15` 保存期間之法律基礎 |

### `L-07` — 平台自身之 IP 責任

| | |
| --- | --- |
| **Document** | Terms §4.4；Creator §5.5 |
| **Question** | 平台被認定為出賣人時，其自身之重製與交付行為不受著作權法 §90-4 免責事由保護；創作者與平台間之責任如何分配？ |
| **Decision needed** | 責任分配條款 |
| **Blocks what** | Terms §4、Creator §5。**依賴 `PRE-03`** |

### `L-08` — 契約成立時點與付款／審核期限

| | |
| --- | --- |
| **Document** | Terms §5.3、§7.4、§8.2 |
| **Question** | (a) 契約成立之法律時點（民法 §153）對應訂單建立／付款申報／實際入帳／平台核准之哪一個？(b) 付款期限 7 個日曆日之合理性；逾期之法律效果為解除、失效，抑或僅不得補件？(c) 核帳期限 3 個日曆日之法律性質（承諾期間或作業目標）及逾期效果 |
| **Decision needed** | 三項法律認定 ＋ 對外文案 |
| **Blocks what** | Terms §5／§7／§8 定稿；Gate 6／Gate 11 對外文案 |

### `L-09` — 數位內容解除權例外

| | |
| --- | --- |
| **Document** | Refund §2.3；Terms §14 |
| **Question** | 消保法 §19 解除權及數位內容例外是否適用於本平台之教材？正式告知文案為何？**告知之流程時點**為何？ |
| **Decision needed** | 解除權例外之認定 ＋ 核定文案 ＋ 告知時點 |
| **Blocks what** | **Refund §2 全節定稿**、Gate 13（結帳 consent ordering）、`L-20` |

### `L-10` — 已售教材版本更新義務

| | |
| --- | --- |
| **Document** | Terms §10.2；Creator §8.3 |
| **Question** | 已售出教材之版本更新，對既有購買者之揭露義務、通知義務為何？既有購買者對舊版本有何權利？ |
| **Decision needed** | 更新分級 ＋ 義務條款 |
| **Blocks what** | Terms §10、Creator §8。**依賴 `PRE-04`** |

### `L-12` — 定型化契約審閱期（消保法 §11-1）

| | |
| --- | --- |
| **Document** | Terms §17.5 |
| **Question** | 審閱期之 UI 落實方式為何？條款須於勾選前可完整閱讀，且**不得有拋棄審閱權之字樣** |
| **Decision needed** | UI 要求規格 ＋ 合規判準 |
| **Blocks what** | consent activation wave、Gate 5 |

### `L-13` — 管轄條款

| | |
| --- | --- |
| **Document** | Terms §16 |
| **Question** | 管轄法院條款應如何撰寫？**不得排除**消保法 §47 與民事訴訟法 §436-9 之小額訴訟管轄 |
| **Decision needed** | 管轄條款文字（草稿**刻意未指定任何法院**） |
| **Blocks what** | Terms §16 定稿 |

### `L-14` — 創作者離開後之處置

| | |
| --- | --- |
| **Document** | Creator §13.2 |
| **Question** | 創作者終止合作後，既有購買者之權利與教材檔案之保存義務為何？ |
| **Decision needed** | 處置條款 |
| **Blocks what** | Creator §13。依賴 `L-05`／`RM-15` |

### `L-15` — 平台停售與服務終止

| | |
| --- | --- |
| **Document** | Terms §13.3 |
| **Question** | 平台停止營運之條款（購買者／創作者／資料／平台四組處置）應如何約定？ |
| **Decision needed** | 停售條款文字 |
| **Blocks what** | Terms §13、**Gate 10**。併同 O-18 |

### `L-17` — 外部消費爭議管道

| | |
| --- | --- |
| **Document** | Terms §12.6；Refund §11.3 |
| **Question** | 外部消費爭議管道（消費者保護團體、消費者服務中心、消費者保護官、消費爭議調解委員會、全國消費者服務專線）之揭露文字為何？ |
| **Decision needed** | 核定文案 ＋ **各管道正式名稱與聯絡方式**（須併同外部主管機關最新公告） |
| **Blocks what** | Terms §12、Refund §11；`N4` 揭露。**草稿刻意未填入任何機關資訊** |

### `L-20` — 解除後已下載副本之義務

| | |
| --- | --- |
| **Document** | Refund §8.2 |
| **Question** | 契約解除後，購買者對已下載副本之義務文字為何？其可執行性如何？ |
| **Decision needed** | 義務條款文字 |
| **Blocks what** | Refund §8。**依賴 `L-09`** |

### `L-21` — 稽核紀錄保存理由與期限

| | |
| --- | --- |
| **Document** | Privacy §6.2、§9.2 |
| **Question** | 稽核紀錄依個資法 §11 III 但書「執行業務所必須」之保存理由與期限為何？**不得預設永久保存** |
| **Decision needed** | 保存理由 ＋ 明確期限 ＋ 期滿處置（保留／假名化／匿名化） |
| **Blocks what** | Privacy §6／§9；**`SCHEMA-02` 帳號刪除語意**；資料主體刪除權之實作 |

### `L-22` — 保存期間矩陣之法定依據覆核

| | |
| --- | --- |
| **Document** | Privacy §3、§6.2；Creator §11.2；Refund §10.1 |
| **Question** | 18 類資料之法定蒐集與保存依據（契約履行／法定義務／業務必須）逐項是否成立？ |
| **Decision needed** | 逐列覆核意見 |
| **Blocks what** | Privacy 全文保存期間；併同 `T-14` |

### `RM-15` — 教材檔案保存期間

| | |
| --- | --- |
| **Document** | Privacy §6.2；Creator §13.3 |
| **Question** | 教材檔案（含歷史履約版本）之保存期間為何？ |
| **Decision needed** | 期限值 |
| **Blocks what** | 檔案回收路徑。**技術上刻意未新增 `retention_until` 欄位**，以免替未拍板的期限做實質決定 |

### `LEGAL-01` — 民法 §122 末日展延

| | |
| --- | --- |
| **Document** | Terms §12.2 |
| **Question** | 民法 §122（末日為休息日順延次日）對本平台消保法 §43 SLA 之適用為何？對外文案應如何表述？ |
| **Decision needed** | 適用認定 ＋ 對外文案（**不得直接引用未展延之值**） |
| **Blocks what** | Terms §12 對外承諾。另需外部權威假日來源 |

### `PROD-01`（法律側）— 金融證明格式

| | |
| --- | --- |
| **Document** | Terms §12.3 |
| **Question** | 法律上必須接受哪些金融機構交易證明格式？拒收 PDF 是否使「不得以平台紀錄為唯一認定依據」落空？ |
| **Decision needed** | 法律下限認定 |
| **Blocks what** | Gate 4 升級；併同 O-7 產品方向 |

### 未編號但需律師確認（草稿留白處）

| # | Document | Section | Question |
| --- | --- | --- | --- |
| U-1 | Terms | §15 | **責任限制條款全文**。草稿刻意完全未寫 —— 須符合定型化契約「不得記載事項」關於免除或減輕企業經營者責任之限制 |
| U-2 | Terms | §6.5 | 付款爭議條款表述。**寫「以平台入帳紀錄為準」該條款無效**（消保法 §17 III） |
| U-3 | Terms | §13.2 | 終止事由列舉是否符合關於任意終止之限制 |
| U-4 | Creator | §3.3 | 既有**無版本**權利聲明之法律效力；本條款發布後是否須就既有教材重新取得聲明（**不得回填**） |
| U-5 | Creator | §4.4 | 平台處理行為（浮水印／試看／格式轉換）須於授權範圍內逐項明文；消保法 §8 II 適用 |
| U-6 | Creator | §7.4 | 下架要件、事前通知義務、**重複侵權者處理政策**（平台目前未實作） |
| U-7 | Privacy | §10.2 | 應記載事項第十三點「企業經營者應確保系統符合一般可合理期待之安全性」之承諾文字 |
| U-8 | Privacy | §10.3 | 個資檔案安全維護管理辦法之適用性與 72 小時通報義務範圍（依賴 `T-01` 登記） |
| U-9 | Privacy | §8.3 | 當事人權利行使流程；人工受理是否足夠、應於幾日內回覆 |
| U-10 | 全部 | — | 應記載事項尚缺正面記載之 6 點：解釋原則／商品資訊為契約一部分／電子文件表示方法／交付方式／付款方式說明／§19 解除權 |

---

## 4. Accountant Review

| ID | Question | Required output | Blocks what |
| --- | --- | --- | --- |
| `T-02` | Platform Seller 與受託代銷之稅務認定為何？ | 會計師備忘 | Creator §1.4；**併同 `PRE-03` 會同認定** |
| `T-04` | 稅籍登記時點與起徵點認定 | **國稅局核定文件** | Creator §9；發票主體 |
| `T-05` | 是否使用統一發票／是否為小規模營業人？ | **國稅局核定文件** | Creator §9.2、Refund §9.1 |
| `T-06` | 免用統一發票時之合法交易憑證形式 | 會計師備忘 | Refund §9.1 |
| `T-07` | 憑證開立時點（本平台收款在核准之前，時點可能落在收款） | 會計師備忘 | Refund §9.1；營運流程 |
| `T-08` | 退回與折讓之沖銷處理（逐分支） | 會計師備忘 | **Refund §9**、Creator §10；退款對營收之反映 |
| `T-09` | 創作者報酬之所得定性 | 會計師備忘 | Creator §9.2；撥款系統 |
| `T-10` | 扣繳率、免扣繳門檻、憑單申報 | 會計師備忘 | Creator §9.2 |
| `T-11` | 非居住者創作者之處理 | 會計師備忘 | Creator §9.2 |
| `T-12` | 創作者稅務身分類型與應蒐集之欄位 | 會計師備忘 | Creator §2.2；**個資蒐集範圍擴張需併同 Privacy** |
| `T-14` | 稅務憑證與帳簿之法定保存年限 | 會計師備忘 | **Privacy §6.2**、Creator §11.2、Refund §10.1；回寫保存期間矩陣 |
| — | 退款對創作者報酬之回沖規則 | 會計師備忘 ＋ Owner 決定比例 | Creator §10.1；併同 O-14 |

> **現況：** 平台**未實作**任何稅務憑證、撥款或扣繳流程；資料庫刻意不含稅務欄位。
> 「案件已核准」「款項已退還」「憑證已沖銷」在系統中為**三個不同事件**。

---

## 4.1 `PRE-03` — 會同判定 packet（彙整於 2026-08-30）

> **這一節不是新的驗證包。** `PRE-03` 的完整事實陳述與逐題委託內容**早已存在**於下列四份文件，
> 本節**不重複**它們，只補三樣它們沒有的東西：**(a) 送出前必須先套用的事實更新**、
> **(b) 跨律師／會計師的單一判定矩陣**、**(c) 單一份回覆模板**。
>
> | 文件 | 內容 | 行數 |
> | --- | --- | --- |
> | `docs/pre-03-lawyer-validation-package-2026-08-26.md` | 律師委託書：事實 `B-1`～`B-6`、問題 `Q-01`～`Q-20`、`L-F` 請求結論 | 702 |
> | `docs/pre-03-accountant-validation-package-2026-08-26.md` | 會計師委託書：事實 `B-1`～`B-6`、問題 `Q-06`～`Q-13`、`T-D` 依賴、`T-F` 請求結論 | 474 |
> | `docs/pre-03-validation-evidence-appendix-2026-08-26.md` | 證據附錄 `INV-1`～`INV-4`／`EVD-1`～`EVD-10`、問題→Gate 矩陣、複驗指令 | 339 |
> | `docs/pre-03-platform-seller-model-verification-2026-08-26.md` | 第二輪獨立排查：`N1`～`N5` 風險、§6 **封版所需的 6 項最小條件** | 389 |
>
> **本節不做任何法律或稅務結論。** 所有 Final Answer 欄位一律留白，等候外部填答。

---

### A. Freshness audit —— **已於 2026-08-30 完成回寫**（2026-08-26 → 2026-08-30）

上述委託書與證據附錄的原始事實基準日為 **2026-08-26**。其後產品端有四項與 `PRE-03` 直接相關的變動，
曾使證據附錄的四段敘述與現況不符。

> ### ✅ 已完成（2026-08-30）
> **Freshness audit completed: four identified deltas reconciled into the evidence appendix on 2026-08-30.**
> 四項已全部逐項複驗並正式回寫 `docs/pre-03-validation-evidence-appendix-2026-08-26.md`：
> `INV-2` / `EVD-1` 標為 superseded 並附 Freshness update；`EVD-5` 標為**部分** superseded
> （capability exists ≠ document published）；申訴流程新增為 **`EVD-11`**。
> 原始 2026-08-26 文字**全部保留**、既有編號**未重排**。
> 兩份 validation package 的 evidence 摘要列（`L-E` / `T-E`）亦同步做了**事實更正**
> （僅更正事實陳述；`Q-01`～`Q-20`、`Q-06`～`Q-13` 與 Requested Written Conclusions **未動**）。
>
> **PRE-03 factual re-baseline complete as of 2026-08-30. Reviewer packet ready to send.**
> **Awaiting lawyer + accountant joint written determination.**
>
> 2026-08-30 第二階段另完成**兩份 package 能力表的完整 re-baseline**：
> 律師 `B-6`（7 列）與會計師 `B-5`（6 列）**每一列**都重新從 repo 深度驗證並標上分類
> （`[CURRENT]` / `[PARTIAL]` / `[NOT EXIST]`），**已無任何 `[需 re-baseline]` 或 UNKNOWN 列**。
> `[PARTIAL]` 各列均明確寫出 **capability 與 wiring 的區別**
> （例：同意紀錄的表與服務齊備但四條流程皆未呼叫；`payment_received_at` 存在但由 Admin 人工填入）。
> 兩份 package 的 `Q-01`～`Q-20`、`Q-06`～`Q-13`、`L-F`、`T-F` 經 diff 確認**逐字未變**。
> 下表保留為 audit trail —— 讓 reviewer 與未來稽核看得出**發現過什麼、何時修正**。

> 反向確認：**四份 legal draft 本身已同步**（`terms-of-service.draft.md` §9.4 已直接引用
> `entitlement_status {active, suspended, revoked_pending, revoked_final}` 且載明與 `orders.status` 正交；
> `refund-cancellation-policy.draft.md` §8.1／§8.2；`creator-agreement.draft.md` §7.3）。
> **本輪未發現任何 draft 文字與現況事實矛盾**，因此**沒有** `REVIEW ISSUE` 需記錄。
> 落後的只有 2026-08-26 的證據附錄。

| # | 附錄原敘述 | 現況（FACT，2026-08-30 實測） | 為何對 `PRE-03` 重要 |
| --- | --- | --- | --- |
| 1 | `INV-2`「系統中**沒有任何可單獨撤銷的授權紀錄**…目前無法停止單一買家對單一教材的存取」 | **已不成立。** `db/db_schema.sql:350` `order_items.entitlement_status TEXT NOT NULL DEFAULT 'active'`，四值 CHECK（`:367`）`active / suspended / revoked_pending / revoked_final`，另有部分索引（`:377`）；能力實作於 `Backend/services/entitlement.service.js`（「暫停或撤銷**單一買家對單一教材**的存取，一律走 `order_items.entitlement_status`」）。**與 `orders.status` 正交** | 平台對「已交付之數位內容」的控制程度，是出賣人／居間定性的核心事實之一；律師 `Q-08`（再授權於上位授權終止後之存續）與 `Q-12`（解除之受理與執行）都建立在舊敘述上 |
| 2 | `EVD-1`「平台**無任何**退款或解除能力」 | **已不成立。** 存在 `Backend/migrations/20260826_refund_remedy_cases_foundation.sql`、`20260826_manual_refund_execution.sql` 與 `Backend/services/refundRemedy.service.js`；`db/db_schema.sql` 中 `refund` 相關出現 **32 處** | 直接影響 `Q-11`／`Q-12`（退款憑證沖銷、退款與報酬交互）與消保法解除權的可執行性 |
| 3 | `EVD-5`「**尚無**任何法律文件頁面」 | **已不成立。** 四條 public route 已存在（`frontend/apps/web/app/{terms,privacy,refund,creator-agreement}`），另有 `legal_documents` registry（`20260827_legal_document_registry.sql`）＋ Admin 生命週期 API（`Backend/routes/adminLegalDocuments.js`：create／patch／approve／publish）。**目前 `legal_documents` 為 0 列，四條路由因此仍回 404** | 影響「條款如何對買家揭露、何時生效」這一段的事實描述；也影響審閱回覆後的發布路徑（見 §6） |
| 4 | （附錄**完全未涵蓋**） | **新增事實：平台已具備內部消費申訴／爭議處理流程。** `Backend/routes/complaints.js`、`Backend/services/consumerComplaint.service.js`、`consumer_complaints` 表；買家入口為全域導覽「申訴與消費爭議」→ `/me/complaints`（`DEC-LEGAL-09`） | 爭議處理責任歸屬（買家向誰申訴、誰裁決）是出賣人／居間定性的判斷因子，且與律師 `Q-20`（消費爭議之外部管道揭露）直接相關 |

**經複驗仍然成立、未變動的事實**（審閱者可沿用附錄原文）：

- `EVD-6` **發票欄位存在但無開立流程** —— `orders.invoice_type`（`db/db_schema.sql:279`，CHECK 僅 `'none' | 'carrier'`）與 `orders.invoice_carrier`（`:280`）；全 repo **沒有任何開立、作廢或折讓邏輯**，`emailService.js:169-170` 只是把載具號碼顯示在信件中。
- `EVD-7` **無創作者報酬帳、無創作者稅務資料** —— schema 無 payout／settlement／扣繳欄位，`Backend/services/` 無 payout 或 settlement service。
- **無平台抽成／手續費之任何實作** —— schema 與 services 皆無 `commission` / `platform_fee` 欄位或常數。

---

### B. 交易事實清單（FACT / UNKNOWN）

> **只陳述目前產品怎麼運作，不做任何法律評價。**
> 「平台帳戶收款」是 FACT；「因此平台是出賣人」**不是**工程端可以推導的 FACT。

| 面向 | FACT | 來源 |
| --- | --- | --- |
| **A 商品與創作者** | 教材由創作者建立並自行決定內容與**價格**（`materials.price`）。平台**強制審核**後才可上架：狀態機四值 `pending_review / published / changes_requested / unpublished`，且**狀態只能經審核端點變更**，generic update 帶 `status` 一律拒絕 | `db/db_schema.sql:53`；`Backend/utils/materialWorkflow.js`；`docs/material-review-workflow.md`；CLAUDE.md §5 |
| **A（呈現）** | 商品頁如何標示創作者／平台身分 → **UNKNOWN**：repo 未有任何 canonical 文件明訂「對外呈現之出賣人」為何，且該呈現正是律師 `Q-03` 的待決事項 | 律師 package `Q-03` |
| **B 訂單** | 買家的訂單建立於平台（`orders`），訂單明細 `order_items` 帶 `title_snapshot` / `price_snapshot`；**一張訂單可含多個創作者的教材，平台不拆單**；`order_items` **有一個 `seller_id TEXT REFERENCES users(id)` 欄位指向創作者**（`db/db_schema.sql:339`）—— 依證據附錄 `INV-1`，該欄位是**早期 Marketplace 設計之遺留**，**本節不就其法律意義作評價** | `db/db_schema.sql:337` 附近；證據附錄 `INV-1` |
| **C 金流** | 買家**匯款至平台單一帳戶**；帳戶資訊由 **env** 提供（`Backend/config/paymentBankInfo.js`），非逐創作者帳戶、非 Admin 可調。憑證由**平台 Admin** 審核（`manual_payment_proofs`）。**平台先收全額**；**不存在 creator direct collection** | `Backend/config/paymentBankInfo.js`；`docs/mvp_rules.md` §12.4；`Backend/services/paymentProof.service.js` |
| **C（辨識）** | 無結構化匯款辨識欄位（對帳靠人工） | 證據附錄 `INV-4` |
| **D 履約** | 數位教材檔案由**平台**自 private storage 交付；買家取得下載權的條件是「有一張 `approved` 訂單且含該教材」，**且** `order_items.entitlement_status = 'active'`。**平台可暫停／撤銷單一買家對單一教材的存取**（四狀態，與 `orders.status` 正交） | `Backend/services/materialFile.service.js`；`Backend/services/entitlement.service.js`；`db/db_schema.sql:350,367,377`（**已更新，見 §A#1**） |
| **E 退款** | 買家經**平台**的申訴／退款案件流程提出；由**平台 Admin** 決定與執行；已有 refund remedy case 與 manual refund execution 的資料模型與服務 | `Backend/services/refundRemedy.service.js`；`20260826_{refund_remedy_cases_foundation,manual_refund_execution}.sql`（**已更新，見 §A#2**） |
| **E（憑證保存）** | 退款證據由平台保存（案件附件走 private storage 授權讀取） | `Backend/services/consumerComplaint.service.js`；`docs/mvp_rules.md` |
| **F 創作者款項** | **UNKNOWN / 尚未實作。** 無 payout／settlement schema、無 service、無營運流程；**無平台抽成或手續費之任何實作**。撥付條件、時程、扣繳皆**未決** | 證據附錄 `EVD-7`；本輪複驗仍成立 |
| **G 發票／稅務** | **部分 FACT、其餘 UNKNOWN。** FACT：`orders.invoice_type`（僅 `none` / `carrier`）與 `invoice_carrier` 欄位存在，**無任何開立／作廢／折讓邏輯**。UNKNOWN：開立者為誰、憑證型態、開立時點、稅籍與營業項目 —— 產品文案**未**描述任何開立者，亦**未**自行認定 | `db/db_schema.sql:279-280,311`；會計師 package `B-4` / `B-6`；證據附錄 `EVD-6` |
| **H 爭議與客服** | 買家向**平台**提出申訴（全域入口「申訴與消費爭議」→ `/me/complaints`）；由**平台 Admin** 受理、調查與結案。**創作者不直接處理買家爭議**（`creator/cases` 為創作者側案件視圖，非買家對話管道）。平台**沒有**客服系統，只有消費申訴案件流程 | `Backend/routes/complaints.js`；`Backend/services/consumerComplaint.service.js`；`components/dashboard/sidebar-nav-config.ts`（`BUY-02` / `DEC-LEGAL-09`）（**新增事實，見 §A#4**） |

---

### C. 會同判定矩陣（Final Answer 一律留白）

> **Reviewer 欄的「會同」表示該題必須律師與會計師取得一致結論**，
> 因為其中一方的答案會直接改變另一方的結論（例如：出賣人定性 → 發票開立主體）。

| # | Issue | Current Product Fact | Legal Question | Accounting / Tax Question | Why It Matters | Downstream Documents / Systems Affected | Reviewer | Final Answer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 平台與創作者之間的交易角色 | 創作者定價與供稿；平台強制審核、控制上架與交付、控制存取撤銷；**無抽成實作、無撥付實作** | 平台係出賣人（本人）、居間，抑或受託代銷？ | 若為受託代銷，稅務處理是否不同於自營銷售？ | 決定三份條款的當事人結構；決定是否落入第三方支付定性 | Terms §1.3、Creator §1.4、`T-02`、`L-04`～`L-06` | **會同** | `[ ]` |
| 2 | 買家的交易相對人 | 買家在平台下單、向平台付款、自平台取得檔案、向平台申訴 | 買家的契約相對人是平台或創作者？對外應如何呈現？ | 相對人認定是否影響銷售額歸屬？ | 消保法責任歸屬、定型化契約主體 | Terms §1、§4；商品頁呈現 | **會同** | `[ ]` |
| 3 | 收款者身分 | 買家匯款至**平台單一帳戶**（env 設定），平台審核憑證後才核准訂單 | 是否構成「代理收付網路實質交易款項」而須辦理第三方支付服務能量登錄？ | 收款當下之銷售額歸屬與認列時點為何？ | **牌照義務**（未登錄者不得提供服務，刑責 2 年以下／罰金 500 萬以下，無金額 de minimis） | 全平台可否合法營運；`docs/pre-03-platform-seller-model-verification-2026-08-26.md` §1 | **會同** | `[ ]` |
| 4 | 創作者款項之性質 | **尚未實作**：無 payout schema、無 service、無流程 | 平台付予創作者者，係買賣價金、授權報酬，抑或代收轉付？ | 所得類別為何？扣繳率、免扣繳門檻、憑單與申報時程？ | 決定創作者稅務資料蒐集清單與撥付流程 | Creator §5～§6；會計師 `Q-08`～`Q-10` | **會同** | `[ ]` |
| 5 | 平台 fee／commission 之性質 | **無任何實作**（schema 與 services 皆無 commission／platform_fee） | 若採淨額計算，是否影響第 1 題之定性？ | 應以總額或淨額認列？是否須就 fee 另開憑證？ | 影響營收認列基礎與憑證張數 | Creator §5；會計師 `Q-07` | **會同** | `[ ]` |
| 6 | 退款責任歸屬 | 買家向平台申請，平台 Admin 決定與執行；已有 case 與 manual execution 資料模型 | 解除權與退款義務之義務人為誰？數位內容解除權例外之要件？ | 退款時之憑證沖銷流程；與創作者報酬之交互 | 決定退款政策的義務主體與時限 | Refund Policy 全文；`L-09`、`L-20`、`Q-11`、`Q-12` | **會同** | `[ ]` |
| 7 | 發票／收據開立主體 | 僅有 `invoice_type`（`none`/`carrier`）與 `invoice_carrier` 欄位；**無開立邏輯**；產品文案未指定開立者 | 對買家之交易憑證應由誰開立？ | 應否使用統一發票？免用時之合法憑證格式與應載事項？開立時點以何者為準？ | 首次銷售前的強制義務 | Terms §4；會計師 `Q-07`、`T-F` ★3★4★5 | **會同** | `[ ]` |
| 8 | 稅務申報責任 | **UNKNOWN**：無稅籍決定、無營業項目清單、無創作者稅務資料 | —（本題以稅務為主） | 營運主體形式、應登記營業項目、稅籍登記時點；創作者扣繳與申報責任 | 決定上線前必須完成的登記事項 | 會計師 `Q-06`、`Q-09`、`T-F` ★1★2★7★8 | **會計師**（結論若因第 1 題而變動請標明條件） | `[ ]` |
| 9 | 爭議處理責任 | 買家向平台申訴，平台 Admin 受理、調查、結案；創作者不直接處理買家爭議 | 平台得否／應否對消費爭議作成裁決？外部消費爭議管道之揭露義務為何？ | —（除非裁決結果影響憑證沖銷） | 決定申訴流程的法律定位與必要揭露 | Terms §12；`L-17`、`Q-20` | **律師**（涉沖銷時會同） | `[ ]` |

---

### D. 給審閱者的問題（白話版，一題一判定）

> 逐題委託內容仍以兩份 validation package 為準；本節是**會同判定所需的最小題組**，
> 供律師與會計師在同一場討論中先取得一致答案。

**Q-A｜平台在買家交易中的角色**
目前的流程是：消費者在平台下單、把款項匯到**平台的帳戶**、由平台核對款項後才開通下載、
檔案由平台交付、事後平台再與創作者結算（結算方式尚未建立）。
在這樣的流程下，平台對消費者而言，法律上應定性為什麼角色？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-B｜收款行為是否需要牌照**
承上，款項先進入平台帳戶、再由平台撥付給創作者。
這樣的收款是否構成「代理收付網路實質交易款項」，因而必須先完成第三方支付服務能量登錄？
若是，取得登錄前可否營運？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-C｜對消費者開立憑證的人是誰**
平台目前只記錄「要不要載具」與載具號碼，沒有任何開立流程，也還沒決定由誰開立。
對消費者的交易憑證應由平台或創作者開立？應使用統一發票或其他合法憑證？開立時點以哪一個為準？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-D｜付給創作者的錢屬於什麼**
平台尚未建立任何撥款機制。將來平台付給創作者的款項，性質上是買賣價金、授權報酬，還是代收轉付？
對應的所得類別、扣繳義務與應蒐集的稅務資料為何？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-E｜退款由誰負責**
消費者目前只能向平台申請退款，也由平台決定與執行。
退款與契約解除的義務人應為平台或創作者？數位內容的解除權例外要如何設計才成立？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-F｜平台可以暫停或撤銷已購買者的下載權，這在法律上要有什麼前提**
平台現在可以針對「某一位買家的某一份教材」單獨暫停或撤銷存取，而且不必更動訂單狀態。
行使這項能力需要什麼要件、事前通知或補救義務？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-G｜平台受理並裁決消費爭議的定位**
消費者的申訴一律由平台受理、調查與結案，創作者不直接與消費者對話。
平台作成處理結果在法律上的定位為何？必須向消費者揭露哪些外部爭議管道？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

**Q-H｜營運主體與登記事項**
平台尚未決定營運主體形式，也尚未辦理稅籍登記。
上線販售前必須完成哪些登記？應登記的營業項目為何？時點為何？
`Legal answer: [ ]`　`Accounting / tax answer: [ ]`　`Required wording / caveat: [ ]`

---

### E. 回覆模板（請直接填寫本表）

```text
PRE-03 FINAL DETERMINATION

Legal characterization:
[ ]

Accounting / tax characterization:
[ ]

Buyer-facing seller / contracting party:
[ ]

Payment recipient characterization:
[ ]

Creator payout characterization:
[ ]

Invoice / receipt issuer:
[ ]

Refund responsibility:
[ ]

Required legal-document wording changes:
[ ]

Required accounting / operational changes:
[ ]

Effective assumptions / limitations:
[ ]

Reviewer:
[ ]

Date:
[ ]

需要 joint sign-off？
[Yes / No + explanation]
```

---

### F. Downstream Impact —— `PRE-03` 有答案後**才能**繼續的事

> 只寫 `PRE-03` 的答案 **enables / informs** 哪些下一步。
> **本節不宣稱任何 Deployment Gate 會因此變綠**；Gate 狀態一律以 canonical 定義為準。

| 下游 | `PRE-03` 的答案 enables / informs 什麼 |
| --- | --- |
| `terms-of-service.draft.md` | **informs** §1.3（當事人結構）、§4（價金與憑證）、§9.4（撤銷存取要件，草稿已標 `[LAWYER REVIEW REQUIRED]`）、§12（爭議） |
| `creator-agreement.draft.md` | **informs** §1.4（平台角色）、§5～§6（報酬性質與計算基礎）、§7.3（撤銷存取） |
| `refund-cancellation-policy.draft.md` | **informs** 義務主體、解除權例外之設計、§8 撤銷存取與案件之關係 |
| `privacy-policy.draft.md` | **informs** 僅限交易當事人敘述之用語；其餘個資議題不依賴 `PRE-03` |
| `legal-review-checklist.md` | **enables** 勾稽 `PRE-03` 相關列的關閉 |
| 本文件（`review-handoff.md`）§3／§4 | **enables** `PRE-03`、`T-02` 兩列標記為已取得結論 |
| version / effective-date finalization | **enables** —— 依 §6，`PRE-03` 未確認前**不得發布**，因此也不得指派正式 `version` 與 `effective_date` |
| publication（`legal_documents` draft→approved→published） | **enables** —— 見 §6 步驟 3；目前 `legal_documents` 為 0 列 |
| Gate 5 consent activation wave | **enables** —— 依 §6 步驟 5，需先有已發布之正式條文 |
| 發票／會計實作 | **informs** —— 開立主體、憑證型態與時點確定後，才知道首次銷售前必須完成什麼 |
| 創作者撥款（payout／settlement） | **informs** —— 所得類別與扣繳結論確定後，才能決定應蒐集之稅務資料與撥付流程 |
| `PRE-04`（已售教材版本更新義務） | **informs** —— 更新義務的義務人取決於平台角色 |
| Deployment gates | **本節不預判。** `PRE-03` 的答案是上述文件定稿與發布的前提，Gate 是否推進一律依 canonical Gate 定義另行評估 |

---

## 5. External Authority Sources

| ID | 所需來源 | 用於 |
| --- | --- | --- |
| `LEGAL-01` | **人事行政總處**行事曆（權威國定假日來源） | 民法 §122 末日展延計算 |
| `L-17` | **消保主管機關／各縣市消費者服務中心**最新公告 | 外部爭議管道之正式名稱與聯絡方式 |
| `T-04`／`T-05` | **國稅局**核定文件 | 稅籍登記與統一發票 |
| `T-01` | 營運主體之公司／商業登記、統一編號、營業項目 | 個資辦法適用性、Gate 9 |
| `PRE-03` | 若認定為代理收付：**第三方支付服務能量登錄** | 牌照義務 |

**四份草稿刻意未填入任何政府網址、電話、機關名稱或聯絡資訊。**

---

## 6. 回覆後的下一步（本輪不執行）

1. 依審閱意見修訂草稿正文。
2. 依 `DEC-LEGAL-05`（整數序號，每型別獨立）指派正式 `version`，並指派 `effective_date`；
   發布時依 `DEC-LEGAL-06` 顯式決定 `requires_reconsent`
   （欄位已就緒，`SCHEMA-03` 完成於 2026-08-27；**publish API 必填 boolean，無預設值**）。
3. 經 Admin 端點寫入 `legal_documents` → `draft` → `approved` → `published`。
4. 四條 public route 自動由 404 轉為顯示正文。
5. 進入 consent activation wave（註冊／結帳／創作者聲明接線）。

**在 §3 關鍵項目（`PRE-03`、`L-09`、`L-04`、`L-13`、`L-21`）確認前，不得發布。**

---

```text
REVIEW COORDINATION INDEX — NOT A LEGAL DOCUMENT
```
