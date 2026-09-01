# Pending Work Tracker

> **這份文件是 active backlog 的唯一 source of truth。**
>
> 其他 audit / spec 文件（`admin-information-architecture.md`、`material-review-workflow.md`、
> `material-file-storage-and-delivery.md`、`local-development-and-operations.md` §12）保留各自的
> **歷史決策、架構說明與 future considerations**，但**優先序與執行狀態以本檔為準**。
> 那些文件若列出待辦，應連回本檔，不得各自維護一套不同的 priority。

**最後一次全面盤點：** 2026-08-23（Pending Work Consolidation / Master TODO Audit）
**盤點方式：** 以 repository 的真實程式碼、tests、schema、read-only DB 狀態交叉驗證各文件宣稱的狀態。

> ### ⚠️ 2026-08-24 tracker recovery incident —— 讀這份檔案前先看這段
>
> 2026-08-24，本檔在一次 tracker patch 中被**截斷為 0 bytes**（patch script 以 `"w"` 模式開檔，
> 隨後在寫入前拋出 `UnicodeEncodeError`；截斷已生效、寫入未發生）。內容未 commit，
> 因此 git 只保留得到更舊的 `HEAD` 版本。本檔是事後的**受控復原**結果。
>
> **每一段的來源分級如下（詳細對照見 §16 Recovery map）：**
>
> | 分級 | 意思 | 涵蓋 |
> | --- | --- | --- |
> | **EXACT** | 事故前最終版的逐字內容 | 檔首、§0、§1、§1.1、§1.3、§2、§5、§6、§7、§8、§9、§10、§13、§14 |
> | **新增**（可識別） | 本輪新寫的區塊，一律有自己的標題或引述框 | 本 banner、§1 的 recovery 小節、§5 的 `COR-05` 區塊、§9 的完整套件 baseline、§10 的重驗註、§13 的新增條目、§14 的重算順序、§16 |
> | **EXACT-VERIFIED** | 取自較舊 snapshot，但**行數、內部子標題偏移、與最終版重疊區逐字比對三者全部相符** | §1.2、§3、§11、§12、§15 |
> | **RECONSTRUCTED** | 原文已遺失，依 settled-tree 證據重新撰寫並明確標記 | §4.1～§4.7 |
> | **PARTIAL** | 部分逐字回收，其餘缺口已就地標記 | 更新紀錄 |
>
> **本次 recovery 只動本檔**，未改任何 runtime code、未跑 build／E2E、未 commit／push。
> 所有狀態（Current Focus／Next Up／各 ID 的 Status）都以 **settled working tree 的實際證據**
> 重新判定，**未沿用事故當下那批未完成的中間 patch**。

---

## 0. 一眼看懂

| | 項目 |
| --- | --- |
| **現在在做** | **兩軌並行，沒有「正在實作的 `P1-09`」。** **(1) External Review Track —— `PRE-03` / `P1-09`：`READY FOR EXTERNAL REVIEW`，awaiting lawyer + accountant joint determination。** packet 已於 2026-08-30 備妥並隨 `REL-01` 進版控（`docs/legal-drafts/`，commit `91574a1`）；律師與會計師皆 `PENDING`，`legal_documents` 兩個 DB 皆 0 列。**(2) Independent Engineering Track —— `DOC-01`（本輪）。** **不得再把 `P1-09` 描述為 implementation in progress** —— 它的 engineering foundation（Gate 1～7／14 的 schema、述詞、寫入端、legal document registry、consent／privacy 基礎設施）**都已完成且已進版控**；現在唯一的 blocker 是 external professional review 與其下游的條文定稿。Product Readiness 的 **11 個 deployment blocker 已完成 10 個**，唯一剩下的 `P1-09` 仍 `OPEN`；**Deployment Readiness 維持 `0 / 14`**（見 §1、§2、§2.3、§6、§17） |
| **剛完成** | **`OPS-04` — 個資權利請求的內部受理／追蹤** ✅（2026-08-28）：`DEC-LEGAL-07` 已定對外管道（Privacy Email），但平台內部完全沒有受理、追蹤或結案機制。現在有了**獨立的 privacy-request domain** —— 自己的兩張表、自己的 route namespace、自己的狀態集合，**不是** `complaint_type` 的一個值（測試以 DB constraint 斷言）。taxonomy 直接取自《隱私權政策》草稿 §8.1／§8.2 已揭露之權利，未自行增刪。**三條硬邊界皆由測試釘住**：**無法定期限**（無 deadline 欄位、不 require 申訴 SLA）、**無身分驗證法律標準**（無相關欄位、不蒐集政府證件）、**deletion 請求不刪任何東西**（`completed` ≠ 資料已刪除，UI 亦逐字說明）。資料最小化且**刻意不連結 `users`**。Admin UI 掛在既有「信任與安全」區塊，未重建 sidebar；**未新增任何 public/anonymous 提交端點**。db 15 case ＋ E2E 7 case；DB 470/470、unit 213/213、smoke exit 0、`verify:web` exit 0。**未動 `OPS-05`，未進 Round 4。** 詳見 §1.4 `OPS-04` ／ **`OPS-03` — 法律文件發布之 standardized internal justification** ✅（2026-08-28）：`SCHEMA-03` 已讓發布必須顯式決定 `requires_reconsent`，但稽核答不出「依據什麼」。現在發布時**必須**再提供一個標準化**營運理由**（7 個代碼，`other` 必附說明，backend 驗證）。**核心不變條件：reason 與 boolean 完全獨立** —— 驗證函式不接收也不回傳 boolean，兩段驗證互不傳參，測試證明同一個 reasonCode 可產生 true 與 false。**taxonomy 刻意不含法律分類用語**，**未定義任何法律上的重大變更判準**（`DEC-LEGAL-01` 仍 blocked）。**零 schema churn** —— 理由寫入 `activity_logs.meta`。維持 single-admin，未引入雙人覆核。db 13 case（新檔）＋ 既有兩支 45/45 無 regression；DB 455/455、unit 213/213、smoke exit 0、`verify:web` exit 0。**附帶記錄：** 法律文件管理仍是 **API-only**（`/admin` 無對應頁面），已另立 **`OPS-05`**，本輪刻意未擴 scope。**未動 `OPS-04`，未進 Round 4。** 詳見 §1.4 `OPS-03` ／ **`P1-09` Owner Decision Lock — Round 3** 🗳（2026-08-28，**decision-only，0 檔 code**）：**`DEC-LEGAL-11`** `requires_reconsent` 維持 single-admin 權限，但每次設定須留下標準化、可稽核的 internal justification（**僅 operational metadata，非法律認定**；→ 新 TODO **`OPS-03`**）／**`DEC-LEGAL-12`** 退款收款帳戶**維持不在平台內保存**，個案式站外取得、不新增 DB 欄位、不預先蒐集，待 `L-21`/`L-22` 後再評估（**維持現狀即決定內容，不產生 TODO**）／**`DEC-LEGAL-13`** 個資權利請求對外維持 Privacy Email，內部重用既有已稽核的 case-management 基礎設施，但**必須建立獨立的 privacy-request 分類**，消費申訴與個資請求不得混為同一概念（→ 新 TODO **`OPS-04`**）。**三項皆明文不解除任何 lawyer marker**：`DEC-LEGAL-01` 法律判準、退款帳戶保存規則、法定回覆期限與身分驗證標準全部維持 blocked。**Round 3 是目前最後一輪 Owner-ready decisions** —— 其餘 Owner items（O-4／O-10～O-14／O-16／O-18／O-20／O-22 及 O-3／O-21 的法律側）皆卡在 Lawyer／Accountant／deployment fact，**不是再開一輪 Owner Decision 能推進的**。詳見 `docs/legal-drafts/review-handoff.md` §2.3 ／ **`OPS-02` — 帳號凍結 Admin UI ＋ standardized reason taxonomy** ✅（2026-08-27）：凍結能力自 Gate 1 起就存在，但**只有 API** —— 維運者得手打端點才能凍結。現在操作面板掛在既有的 per-user 頁（`/admin/users/:userId/activity-logs`），**未新建使用者管理模組、未改側欄**（`IA-07` 判斷不變）。新增 7 個**營運分類**（非法律認定）的 freeze reason taxonomy，`reasonCode` 必填、`other` 必附說明、**驗證在 backend**，舊的自由文字 `reason` 不再被接受。**零 schema churn** —— `users.freeze_reason` 維持可讀文字，結構化 code/note 進 `activity_logs.meta`，**歷史資料不回填、不假裝有分類**。新增最小的 `GET /admin/users/:id/account-status`（個資最小化、不做名冊）。**單一 Admin 模型維持、未導入雙人覆核、未定義任何法定申訴期限**；`cannot_freeze_self`／`cannot_freeze_admin` 仍由 backend 執行；解凍後凍結歷程完整保留；**`BUY-02` 的『凍結帳號仍可申訴』invariant 由測試釘住**。db 10 case ＋ E2E 6 case；DB 442/442、unit 213/213、smoke exit 0、`verify:web` exit 0。**這是 Owner Decision Round 2 四個實作項的最後一個** —— `DEC-06`／`DEC-08`／`BUY-02`／`OPS-02` 全數完成。詳見 §1.4 `OPS-02` ／ **`BUY-02` — 全域申訴入口** ✅（2026-08-27）：申訴功能先前**只能**從某一張訂單詳情頁進入，但平台在四處告訴使用者「請聯繫客服」而該管道不存在。現在買家外殼既有的「其他」區塊多了一個**「申訴與消費爭議」**入口（→ `/me/complaints`，有文字標籤、可鍵盤操作），**訂單情境 CTA 完整保留**（仍帶 `orderId`）—— 即 `DEC-LEGAL-09` 的兩者並存。**未新建 Footer／客服中心，未重構 navigation，未新增匿名申訴**（guest 造訪會走既有 middleware 導向 `/login?redirect=…`）。四處死文案**依 context 分別處理**：兩處平台設定缺失改為誠實等待指示（不導向申訴）、一處結帳持續失敗改為指向申訴、**一處為 Backend 凍結回應**改為指向申訴 —— 後者誠實的前提是`routes/complaints.js` 刻意不套 `requireActiveAccount`（凍結帳號仍可申訴），該不變條件已寫入 `mvp_rules.md` §12.2a 並由測試釘住。**未動 privacy email，未新增任何主管機關資訊**（`L-17` 仍 blocked）。新增 `complaint-global-entry.spec.ts` 6 case；complaint E2E 32/32、critical 18/18、DB 432/432、unit 213/213、`verify:web` exit 0、smoke exit 0；唯一失敗為 `shell-consistency` 的 admin 側欄跨檔 flake（單獨跑 31/31 全綠，與本輪無交集）。**本輪未動 `OPS-02`，未進 Round 3。** 詳見 §1.4 `BUY-02` ／ **`DEC-08` — 移除瀏覽器端 local analytics 蒐集** ✅（2026-08-27）：`lib/analytics.ts` 整個模組刪除 ＋ **5 個 producer 全數移除**（checkout ×3、payment-proof ×2），**business behavior 零改動**（只刪獨立的 `trackEvent(...)` 陳述式）。**未建立任何替代蒐集** —— 無新 storage key、未改 sessionStorage／IndexedDB／cookie、未改送 backend、無第三方 SDK。`tp_analytics_events` 加入 `session.ts` 的登出清單作為 **legacy cleanup（清除，非蒐集）**；active writer = 0。**backend `activity_logs` 完全未動** —— 本項移除的是 browser-local 行為事件蒐集，**不等於**「平台不再有事件／稽核記錄」，server-side 稽核維持不變。新增 `analytics-removal.spec.ts` 4 個 source-level guardrail case；23/23 ＋ 3/3 ＋ 18/18 ＋ 18/18、`verify:web` exit 0、smoke exit 0。Privacy §2.7 已同步改寫。**本輪未動 `BUY-02`／`OPS-02`，未進 Round 3。** 詳見 §1.4 `DEC-08` ／ **`DEC-06` — 停止註冊姓名蒐集** ✅（2026-08-27）：Round 2 CONFIRM 後的第一個實作項落地。註冊表單的姓名欄位、必填驗證與 `tp_display_name` 寫入**全部移除**，**backend 與 schema 零改動**（實查確認自始未曾蒐集、`users` 無 `name` 欄位）；**未建立任何替代蒐集**（無暱稱／無 display_name 欄位／不由 Email 推導）。`tp_display_name` 的 **writer 實查歸零**；唯一 reader 在一個**目前無 importer** 的元件內，已標記為 legacy read only；`lib/session.ts` 的登出清除刻意保留為 **legacy cleanup**，讓既有瀏覽器舊值退場。`privacy-policy.draft.md` §2.1 已同步改寫為「註冊不蒐集姓名」，§2.7 儲存表的該列標為 legacy。`verify:web` exit 0、`public.spec.ts` 7/7（含 4 項新斷言）、`session-expiry.spec.ts` 19/19、`critical-acceptance.spec.ts` 18/18、smoke exit 0。**本輪未動 `DEC-08`／`BUY-02`／`OPS-02`，未進 Round 3。** 詳見 §1.4 `DEC-06` ／ **`P1-09` Owner Decision Lock — Round 2** 🗳（2026-08-27，**decision-only，0 檔 production code**）：Owner 就 Owner Review Queue 第二批七項拍板 —— **O-1** `DEC-04` **CONFIRM**（四份文件、Refund 獨立；schema／service／四條 route 三者實測一致，確認成本 0）／**O-7 `DEC-LEGAL-08`** PDF evidence **upload** 非 MVP launch blocker（**僅產品優先序，不代表法律上不需接受 PDF**；`PROD-01` 法律下限維持 `LAWYER VALIDATION REQUIRED`；**PDF export 明確不在範圍，未建立任何 export TODO**）／**O-6 `DEC-LEGAL-09`** 申訴入口採全域入口 ＋ 既有 order-context CTA 並存，需登入時 UI 須誠實標示、privacy email 不作爭議管道、**不填機關資訊**（→ 新 TODO **`BUY-02`**）／**O-17 `DEC-LEGAL-10`** 帳號凍結**內部** operating model 採 single-admin ＋ mandatory reason ＋ standardized taxonomy ＋ 稽核 ＋ Admin UI，**不採 two-admin**（→ 新 TODO **`OPS-02`**；canonical `mvp_rules.md` §12.2a）／**O-8**／**O-9** 維持 `DEC-06 = A`／`DEC-08 = A`。**關鍵盤點更正：O-8 與 O-9 先前被記為「已驗證移除安全」，Round 2 實查證實兩者的移除從未執行** —— 註冊表單仍有必填姓名欄位與 `tp_display_name` 寫入（backend／schema 從未蒐集，無欄位可移除）；`lib/analytics.ts` 仍有 5 個 live producer、consumer 為 0、登出不清除。**兩者一律標為 CONFIRM 而非 COMPLETE**，既有 `DEC-06`／`DEC-08` 更新為含最新證據，**未開新的重複 ID**。**O-19 維持 `FACT UNKNOWN — OWNER / DEPLOYMENT INPUT REQUIRED`**（`.env.example` 之 SMTP 值全空、transporter 為通用 nodemailer 設定、repo 內無任何部署／CI 設定檔；Owner 表示尚未決定 —— **未猜測、未填入 Privacy §5.3**）。**本輪未開始任何 implementation、未啟用 consent wiring、未發布法律文件、未定義重大變更、未填主管機關資訊、未決定 statutory deadline／jurisdiction／liability／tax／creator licensing、未處理 O-21／O-22 實質決策。** Gate 狀態全部未變，Deployment Readiness 維持 **0 / 14**，`P1-09` 維持 `OPEN`。詳見 `docs/legal-drafts/review-handoff.md` §2.2 ／ **`SCHEMA-03` — `legal_documents.requires_reconsent` enforcement metadata** ✅（2026-08-27）：`DEC-LEGAL-06` 從決定變成實作。**`BOOLEAN NOT NULL`，DB 與 JS 兩層皆無 default／fallback** —— publish 缺值、`null`、`"true"`／`"false"`、數字、物件一律 400，**且草稿已有值也必須在 publish 再次顯式提供並覆寫**（草稿值只是為了滿足 `NOT NULL` 的暫定值，因為本表 lifecycle 是「建立 draft 即 INSERT 整列」，不在此要求就只剩 DB `DEFAULT` 一條路，而那正是被禁止的）。**關鍵發現：`trg_legal_documents_immutable` 是顯式欄位白名單，新欄位不會被自動保護** —— 已同步加入，並以測試證明 published 後 true↔false 皆不可改、既有 body／version 保護無 regression。`verifyCriticalSchema()` 擴充為驗**型別＋NOT NULL＋無 DEFAULT**（三種 drift 皆實測可偵測）。migration 兩個 DB 實測 **0 列 → 無 backfill**，非 0 列會 abort（已實測），重跑 no-op。稽核可回答 who／when／document／version／`requiresReconsent`，且**刻意不含法律理由欄位**（判準未取得，編造等於偽造決策依據）。**未定義「重大變更」、未決定誰有判定權、未實作任何 Buyer re-consent UI／blocking、未發布法律文件、未寫入 `consent_records`** —— `Gate 5 consent wiring: NOT ACTIVATED`，Deployment Readiness 維持 **0 / 14**，`P1-09` 維持 `OPEN`。db 32 case（新檔）、DB 432/432、unit 213/213、smoke exit 0。詳見 §1.4 `SCHEMA-03` ／ **`P1-09` Owner Decision Lock — Round 1** 🗳（2026-08-27）：Owner 就 review-handoff Owner Review Queue 的**前三項**拍板 —— **`DEC-LEGAL-05`** 版本命名採 integer sequence（每 `document_type` 獨立，版本號**不代表**變更幅度或法律重大性；schema 不需變更，已驗證 current-version 判定完全不使用 `version`）／**`DEC-LEGAL-06`** re-consent 以 `legal_documents.requires_reconsent BOOLEAN NOT NULL` 承載，明定為 **production enforcement metadata 而非法律認定**，發布時須顯式決定、發布後不可改寫、設定留稽核（**欄位尚未存在，實作追蹤於 `SCHEMA-03`**）／**`DEC-LEGAL-07`** 個資聯絡管道採 dedicated privacy email，MVP 階段先用 Owner 指定之個人 Email、正式 mailbox 建立後替換，站內工單**不得取代**其對「登入不了的人」的 fallback 地位。**本輪為 decision-only：0 行 production code、0 個 migration、未發布任何法律文件、`legal_documents` 仍 0 列、`consent_records` 仍 0 列、production consent wiring 仍 NONE、所有 BLOCKED — EXTERNAL REVIEW 項目維持 blocked、Gate 狀態全部未變、Deployment Readiness 維持 0 / 14**。同輪修正 `review-handoff.md` §2 的 inventory gap（補列 **O-21** 當事人權利受理作業流程／**O-22** `SCHEMA-02` 帳號刪除語意，兩者先前只存在於草稿 marker 與 checklist §D，**補列僅為盤點修正，未作任何實質決定**）。`P1-09` 維持 `OPEN`。詳見 `docs/legal-drafts/review-handoff.md` §2.1 ／ **`P1-09` 法律文件草稿產出** 📝（2026-08-27）：四份草稿（服務條款／隱私權政策／創作者條款／**退款與取消政策（獨立文件）**）＋ 審閱清單 ＋ 交付索引，位於 `docs/legal-drafts/`；**全部標記 `DRAFT — NOT LAWYER APPROVED`，未發布、`legal_documents` 仍 0 列、`consent_records` 仍 0 列、production consent 未接線**；僅依 repo 實際能力撰寫，未承諾不具備之功能，未決事項全數以 marker 標示而**未自行填答**；**未變更任何 Gate 狀態**（草稿不是 published 內容），`P1-09` 維持 `OPEN`。詳見 §2.3 ／ **`P1-09` Legal Foundation — 法律文件 registry ＋ published-only renderer** ✅（2026-08-27）：`legal_documents` registry（四種型別，**`refund_policy` 為獨立文件**）＋ `draft → approved → published → superseded` 生命週期＋ canonical current-version resolver ＋ 四條 public route（`/terms`／`/privacy`／`/refund`／`/creator-agreement`）；三道 DB 層防線（fail-closed publication metadata／partial UNIQUE 同型別最多一筆 published／published 後 immutable trigger）；**未撰寫任何條文，registry 實測 0 列**，無 published 版本時一律 404、**不顯示 placeholder**；**production consent 仍未接線**（`consent_records` 仍 0 列）；順帶修掉 `effective_date` 因時區序列化**少一天**的實質缺陷。**Gate 12 `NOT IMPLEMENTED` → `PARTIAL`**；Gate 5／11 維持 `PARTIAL`、Gate 13 維持 `NOT IMPLEMENTED`；**Deployment Readiness 維持 0 / 14**。DB 400/400、unit 213/213、smoke exit 0、`verify:web` exit 0。詳見 §2.3 ／ **`P1-09` Wave 2 #13 — Gate 4 申訴證據讀取／交付** ✅（2026-08-27）：申訴證據原本是 **write-only**（repo 全域 **0** 個檔案交付端點，兩邊 UI 都只印純文字 `📎 檔名`）——Admin 裁決付款爭議時只剩平台自己的紀錄可看，**正是 `R7` 要被 `N3` 打破的狀態**；新增 Buyer／Admin 兩條路由並**共用單一 `resolveEvidenceForAccess()`**（測試斷言兩個 route 檔都不得自行查 evidence 表）；**ownership 取自 `consumer_complaints.buyer_id` 而非 `orders.user_id`**（申訴可無 orderId，帳號遭冒用時仍須讀得到）；**IDOR 同時綁 `id`＋`complaint_id`，Admin 身分不豁免**；五個確定性錯誤碼（409 純文字無檔 vs 503 實體遺失刻意分開）、畸形 key 不 crash 不洩漏 root；沿用既有 `fileDownloadResponse`（`private, no-store` ＋ `nosniff`）與 authenticated blob fetch，**token 不進 URL／DOM**；inline 不寫稽核、`?download=1` 才寫且 meta 不含 storage key；db 15 case ＋ E2E 9 case（desktop/mobile 各 9/9）＋ **HTTP 18/18** ＋ 真實瀏覽器（Buyer 與 Admin 皆由 blob 解出真實影像、另一位登入買家直打 403、未登入 401、mobile 375×812 無 overflow）；regression 46/46（含 payment-proof 共用 helper）、DB 376/376、unit 195/195、smoke exit 0、verify:web 全綠。**Gate 4 由 `NOT IMPLEMENTED` 更正為 `PARTIAL`（文件落後的更正，非升級）**，唯一未決項為 PDF（`PROD-01`，BLOCKED ON PARALLEL LEGAL / PRODUCT DECISION）。詳見 §2.3 ／ **`P1-09` Wave 2 #12 — Gate 6 逾期付款 enforcement** ✅（2026-08-27）：`payment_due_at` 從「只是顯示」變成真正的**寫入閘門**（實作前實測：逾期訂單兩條 upload 路由**都回 201** 且仍能被核准）；拍板 **Option A + A2** —— 期限治理「第一次有效提交」，逾期且**從未**提交 → `409 payment_deadline_expired` 且**無 partial write**（憑證列 0、`payment_info_submitted_at`／`review_due_at` 未寫、private storage 檔案數不變），但**曾在期限內提交過者不因平台審核時間失去補件權**；**未新增 `orders.status = 'expired'`、無排程／cron、無自動狀態轉移**（沿用 `order_progress_state` 的推導狀態先例）；`payment_info_submitted_at` 因**會被覆寫**（實查 17 筆）而**不可**用於 A2 判定，改以 `manual_payment_proofs` 的 `COALESCE(uploaded_at, created_at) <= payment_due_at`；**授權先於期限**（non-owner 一律 403，不洩漏訂單存在與否）；db 14 case ＋ E2E 9 case（desktop/mobile 各 9/9，mobile 375×812）＋ **HTTP 8/8 情境實測**；DB 361/361、unit 195/195、smoke exit 0、verify:web 全綠。**Gate 6 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #11 — Gate 3 逾期申訴告警／escalation** ✅（2026-08-27）：站內 Admin attention surface 為第一個正式 overdue delivery channel；**單一判準 `OVERDUE_SQL`**（`isOverdue` / `?overdue=1` / dashboard count 三者共用，避免「說 3 件點進去 2 件」）；**有逾期才顯示告警、0 件時整塊消失**；terminal 案件即使期限已過也不告警；**backend overdue policy 零改動、不需要 scheduler**；db 9 case ＋ E2E 8 case ＋ HTTP ＋ 真實瀏覽器 2→1→0 完整回合；DB 347/347、unit 195/195、smoke exit 0、verify:web 全綠。**Gate 3 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #10 — Gate 3 Buyer + Admin Complaint UI** ✅（2026-08-27）：Wave 2 #6 的 complaint backend 終於有了 user-facing flow（實作前前端 complaint UI **零檔案**）；Buyer 三頁 ＋ 訂單 context 入口、Admin 佇列/詳情/處理；**無 frontend-only 狀態**（法定期限與逾期一律讀 backend，`?overdue=1` 是 DB 條件）；**Backend 程式碼零改動**；db 8 case ＋ E2E 15 case（desktop/mobile 各 15/15）＋ HTTP ＋ 真實瀏覽器驗證；DB 338/338、unit 195/195、smoke exit 0、verify:web 全綠。**Gate 3 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #9 — Gate 6 付款期限 ＋ 核帳 SLA 落地** ✅（2026-08-26）：產品拍板 **付款期限 7 個日曆日**／**核帳 SLA 3 個日曆日**（皆日曆日，**不引入國定假日行事曆依賴**）；canonical `utils/paymentTimingPolicy.js`，**末日終了模型**；**舊的 `PAYMENT_DUE_DAYS = 3` 推算完全退場**；**legacy 訂單一律 NULL、不 backfill、不被判定逾期**；買家四處**未經拍板的小時級 SLA 文案已清零**；退件後重新提交會重設審核週期；**本輪刻意未做自動過期**；DB 330/330、unit 195/195、smoke exit 0、verify:web 全綠。**Gate 6 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #8 — Gate 6 人工付款資訊接線** ✅（2026-08-26）：買家可提交結構化匯款申報（四欄選填、canonical validator、**只收末四碼**、**不比對申報金額與訂單金額**因為金額不符是爭議事實）；重新提交**不覆寫舊申報**；Admin 讀得到全部 `reported_*` 並可明確記錄**銀行實際入帳時間**（**不預設 NOW、不抄申報時間、不抄 `paid_at`**）；買家申報與平台查證**兩個事實來源並存**；`paid_at` 與營收查詢**完全未動**；DB 320/320、unit 184/184、smoke exit 0、verify:web 全綠。**Gate 6 維持 `PARTIAL`**。詳見 §2.3 ／ **`SCHEMA-01` activity_logs schema drift 收斂** ✅（2026-08-26，Wave 2 #7）：canonical 對齊實況（`id` TEXT UUID、三欄 NOT NULL、`actor_id` FK）；**`id` 是 identity 不是 time** 寫入 `CLAUDE.md` §4.4；bootstrap 新增 `verifyCriticalSchema()` **fail-closed drift 檢查**；migration 對兩個實際 DB **內容指紋逐位元不變**，並涵蓋 BIGSERIAL 環境的無損升級；DB 312/312、unit 175/175、smoke exit 0。詳見 §2.3 ／ **`P1-09` Wave 2 #6 CORRECTION — 申訴 SLA 日期計算修正** ✅（2026-08-26）：初版 `+16 天` 多算一天且未處理民法 §121 I「末日終止」——正確為**申訴之台灣日曆日 + 15 天、終止於該日台北 23:59:59.999**（8/26 → **9/10**，非 9/11）；日曆日改以 `Asia/Taipei` 判斷（關閉 UTC／主機時區的跨日風險）；**民法 §122 末日展延誠實標為 `NOT IMPLEMENTED`**（無權威假日來源，未加半套邏輯）；unit 4 → 11 case。**Gate 3 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #6 — Gate 3 消費申訴 intake** ✅（2026-08-26）：三表 ＋ 消保法 §43 II 十五日 SLA（單一 policy `utils/complaintSla.js`、DB 逾期偵測）＋ 買家外部證據（新 storage namespace，`N3`：平台紀錄不是唯一證據來源）＋ Admin 受理／回覆／結案 ＋ 稽核；**凍結帳號仍可申訴**；**不自動建立 remedy case、`resolved` ≠ 已退款**；DB 304/304、unit 168/168、smoke exit 0。**Gate 3 `NOT IMPLEMENTED` → `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #5 — 人工銀行退款執行紀錄** ✅（2026-08-26）：`refund_amount` ＋ 五條 DB CHECK；`executeRefund()` 為金錢退款完成的**唯一**入口（狀態與五項證據原子寫入）；**`CASE APPROVED` ≠ `REFUND EXECUTED` ≠ `TAX REVERSED`** 在 DB 層釘死；執行後 `orders.status`／`paid_at`／`payment_received_at`／`entitlement_status`／Creator 營收**全部不變**；買家退款帳戶**刻意未蒐集**；DB 293/293、unit 164/164、smoke exit 0。**Gate 14 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #4 — legal hold ＋ fail-closed 檔案清理** ✅（2026-08-26）：`material_files.legal_hold` ＋ 稽核欄位；**單一 deletion eligibility predicate**（八個阻擋理由，unknown/error → KEEP）；`cleanupOrphans()` 改為「先刪列再刪實體」——修掉兩個 fail-open（資格判斷完全不看依賴；舊順序讓 `ON DELETE RESTRICT` 只保護得了 DB 列）；**`revoked_final` 不等於可以刪**；DB 284/284、unit 164/164、smoke exit 0。**Gate 14 維持 `PARTIAL`**。詳見 §2.3 ／ **`P1-09` Wave 2 #3 — Gate 14 退款／補救案件基礎** ✅（2026-08-26）：`refund_remedy_cases` 表 ＋ 狀態機（**`approved` ≠ 退款完成**，必經 `remedy_pending`）＋ 買家／Admin 端點 ＋ `activity_logs` 歷程；**不改 `orders.status`／`paid_at`、不自動撤銷 entitlement、不含 tax 欄位**；migration 後 0 列未 backfill；DB 272/272、unit 164/164、smoke exit 0。**Gate 14 維持 `PARTIAL`**。詳見 §2.3 ／ **Product Readiness 第二批** ✅（2026-08-25）：`P1-07` 結帳訊息收斂為共用區域（含 `role="alert"`）／`P1-08` 「忘記密碼」誠實移除（**方案 B**，canonical MVP 未要求密碼救援）／`P1-10` 創作者表單改為分類選單＋數值價格＋結構化教材內容（create 與 edit 皆驗證）。`P1-09` **維持 OPEN**。詳見 §2.3 ／ **第一批** ✅（2026-08-25）：`P1-01` 收款帳戶單一來源／`P1-02` Creator cases proxy 403／`P1-03` 可交付性不變條件（三道防線）／`P1-04` 訂單編號收斂為 `orders.id`／`P1-05` 退件原因對買家可見／`P1-06` 評分單一來源／`P2-04` 全站 sticky 失效。詳見 §2.2 ／ `DX-12` scope reconciliation ✅（2026-08-25；改判 `ACCEPTED DEBT`，並建立 reference-hygiene stop rule，**未實作任何 comment 改動**）／`DX-11` `adminOrders.service.js` 裸 `§22` 改為可解析指標 ✅（2026-08-25；測試 14 / 14，行為未變）／`DX-10` `Backend/` stale `§21` → `§22` ✅（2026-08-25；served OpenAPI 實測、smoke 全綠、行為未變）／`DX-08` `mvp_rules.md` 子標題錯號修正 ✅（2026-08-24；重號 3 組 → 0，只改 `docs/`）／`DX-07` Playwright 產物 gitignore ✅（2026-08-24；三個目錄，產物未刪）／`DX-02` E2E `TODO(assert)` 歸零 ✅（2026-08-24，含 `DX-03`；44 → 0，production 0 改動）／`DX-04` session 失效恢復 ✅（2026-08-24，三個外殼皆已接線，完整套件 **440 / 0 / 30**）／`COR-06` main landmark 收斂到外殼一層 ✅（2026-08-24，完整套件 **402 / 0 / 30**）／`COR-07` API 錯誤回應終端契約 ✅（2026-08-24，未授權 stack／絕對路徑外洩關閉，不依賴 `NODE_ENV`）／`COR-05` path 參數 NUL byte 輸入邊界 ✅（2026-08-24，PG `22021` 全程 0 次，frontend 0 改動）／`COR-04` 買家可見面角色稱呼收斂 ✅（2026-08-24，runtime behavior 未變，完整套件 **364 / 0 / 30**）／`COR-02` ＋ `COR-03` 買家訂單 payload／徽章收斂 ✅（2026-08-24，完整套件 **364 / 0 / 30**）／`DX-05` 驗收與 dev server 的 `.next` 隔離 ✅（2026-08-24，不停 3010 連續兩次 exit 0，runtime code 0 改動）／`DX-06` `boxOf()` race 修復 ✅（2026-08-24，先重現 2/5 再修；`--repeat-each=10` **300/0**，production 程式碼 0 改動）／`DX-01` E2E 套件回到全綠 ✅（2026-08-24，**364 / 0 / 30**，production 程式碼 0 改動）／`SEC-02` 教材行銷素材私有儲存 ✅（2026-08-24）／`BUY-01` 買家端檢舉送出 UI ✅（2026-08-24）／`IA-06` Admin Orders 搜尋／分頁／買家 Email ✅／`IA-08` Admin 導覽單一 source of truth ✅／`IA-07` Users／Settings 移出 sidebar ✅／`IA-02` Activity Log meta 人話化 ✅／`IA-03` Entity-centric Activity Entrances ✅（2026-08-23，working tree，**未 commit**；全部於 2026-08-24 settled-tree reconciliation 重新驗收） |
| **Active P1** | **0**（2026-08-24 DX backlog reconciliation 後**已有證據**，不再是假設）—— 唯一的爭議項 `DX-04` 經複測**降為 `P2`**：root cause 仍在，但無安全風險、不阻塞開發或 canonical verification，且常見的 session 過期路徑早已由 middleware 正確處理（JWT 7d vs cookie 1d）。剩餘 actionable：**0** —— `DX-12` 已於 2026-08-25 改判 `ACCEPTED DEBT`（非 actionable）；`DX-02`（含 `DX-03`）、`DX-04`、`DX-07`、`DX-08`、`DX-10` 與 `DX-11` 已完成；`PRE-01`／`PRE-02` 皆 blocked on deployment-platform decision **（2026-08-30 第四次更新：`BUY-03`／`BUY-05`／`BUY-06` **皆已 ✅ DONE**（`BUY-03` 於 `BUY-05` 完成後經 CC (4) 重新驗證才關閉）。連同先前完成的 `BUY-04`，買家外殼的四個 dead affordance **全部收斂**，真實瀏覽器實測四種外殼狀態的 `a[href^="#"]` 皆為空。**Active P1 回到 0** —— 剩餘工程項為 `DX-18`／`DX-15`（皆 `P2`）與 `OPS-05`（`P3`）。**（2026-08-30 `DOC-01` 更新：`DX-18`／`DX-15` 皆已 ✅ DONE；`REL-01`／`DOC-01` 亦已完成。`Active P1` 仍為 **0**，但「剩餘 actionable = 0」**已不成立** —— 本輪以 repository evidence 新增 4 個 SAFE / INDEPENDENT 工程項：`TEST-01`（`P2`）／`DX-19`（`P3`）／`A11Y-01`（`P3`）／`DX-20`（`P3`），另有 `READINESS-01`（`P2`，ACCEPTED INFORMATION LOSS）。現行工程軌順序：`TEST-01` → `DX-19` → `A11Y-01` → `DX-20` → `OPS-05`，見 §2 與 §17。）****這四項都不是 14 個 Gate 的任何一個**，canonical Gate 定義無此條目，**Deployment Readiness 維持 `0 / 14`**。見 §1、§1.4、§10.1。）** **（2026-08-28 第三次更新 —— 含一次狀態更正。****Active P1 ＝ `BUY-03`（`OPEN — PARTIAL`）／`BUY-05`（`OPEN — OWNER DECIDED`）／`BUY-06`（`OPEN — OWNER DECIDED`）；`BUY-04` 為唯一 ✅ DONE 者。**<br>`BUY-03` 先前一度被標為 `DONE`，現**更正為 `OPEN — PARTIAL`**：`#help` 的功能實作已完整（元件刪除、`#help` 歸零、E2E 與 `verify:web` 全綠），但其 **Completion Criteria (4)**（買家外殼不得再有任何 `href="#..."` dead anchor）**尚未滿足** —— `Sidebar.tsx:300`／`:319` 的 `#account` 仍在。**CC (4) 未被縮小或刪除**；`BUY-03` 的唯一 completion blocker 是 **`BUY-05`**，後者 DONE 後須回頭重新驗證 CC (4)。<br>`BUY-05`／`BUY-06` 已由 **Owner Decision Lock Round 5**（`DEC-11`／`DEC-12`，2026-08-28）拍板，**阻塞已解除、可直接實作**，為工程軌 #1／#2。**三者皆不是 14 個 Gate 的任何一個** —— canonical Gate 定義無此條目，既有 Pre-Deployment Product Readiness audit 亦未如此分類，本輪不代為認定；**Deployment Readiness 維持 `0 / 14`**。見 §1 Round 4／Round 5、§1.4。）** |
| **Pre-production** | 4（`PRE-01`／`PRE-02` 維持 blocked on deployment-platform decision；**`PRE-04` 為 2026-08-26 第三輪審查新增** —— 已售教材版本靜默替換，無揭露／無通知／訂單無履約版本紀錄；**`PRE-03` 為 2026-08-26 法規查證新增** —— 平台交易地位定性／第三方支付能量登錄，是 `P1-09` 的上位問題。**同日第二輪排查**：產品端傾向 Phase 1 採 Platform-as-Seller，金流定性可成立但屬**實質認定**，且**新增 5 項風險**（最嚴重：著作權避風港對販售交付段失效）。封版條件已具體化為 6 項） |
| **Product readiness** | 稽核共 38 項；**已修 10**（`P1-01`～`P1-08`、`P1-10`、`P2-04`），**仍 open 28**（`P1-09` ＋ `P2-01`～`P2-03`、`P2-05`～`P2-16`、`P3-01`～`P3-12`）—— **但其中 27 項（`P1-09` 以外）的 canonical 定義已遺失，見 `READINESS-01`；本檔不得再宣稱有完整清單**。**Deployment blocker 11 個中已關閉 10 個**；`P1-09` 是唯一剩下的 —— 見 §2.1／§2.3 |
| **Future** | 7 product capability ＋ 8 technical hardening（`FUT-P7`／`FUT-T7`／`FUT-T8` 為 2026-08-24 `SEC-02` 輪次新增） |
| **Developer experience** | 11 個 ID（`DX-12` 為 2026-08-25 `DX-11` 輪次新增），其中 **0 個仍 open**（`DX-12` 為 `ACCEPTED DEBT`，非 actionable）；`DX-01`／`DX-02`／`DX-04`／`DX-05`／`DX-06`／`DX-07`／`DX-08`／`DX-10`／`DX-11` 已完成，`DX-03` 已於 2026-08-24 併入 `DX-02`，`DX-09` 已於 2026-08-24 併回 `DX-05`（見 §9） |

**Priority 語意**

| 值 | 意思 |
| --- | --- |
| `NOW` | 正在做或下一個明確要做 |
| `P1` | 真實風險或產品缺陷，但不阻擋目前開發 |
| `PRE-PROD` | 本機 MVP 可運作，上線前必須拍板／完成 |
| `FUTURE` | 新增能力，不是目前缺陷 |
| `ACCEPTED DEBT` | 有證據、但**確認不值得修**；不進 actionable backlog，也不再開 successor ID |

**Reference-hygiene stop rule（2026-08-25 `DX-12` reconciliation 建立）**

`DX-08`→`DX-10`→`DX-11`→`DX-12` 這條鏈是「sweep 找到一個 comment 就開一個 ID」的結果。
為避免無限延伸，往後**只有同時滿足三個條件**的 reference 才修，也才可以開新 ID：

1. 指向**目前仍是 canonical 的 active contract**（`docs/` 底下現行的 source of truth）；且
2. 該 pointer **確實錯誤或無法解析**；且
3. 照著它走**可能誤導實作或驗收判斷** —— 也就是它位於
   **非測試的 runtime code**、**會輸出到 API／OpenAPI 的字串**，或**canonical 文件本身**。

**下列情形一律不修、也不開 successor ID：**

- 目標從未存在於 repo，或無法由 git history 還原 → `ACCEPTED DEBT`
- 只出現在**測試 fixture 註解**或**歷史 completion record**
- 唯一可行的修法是 bulk comment rewrite（違反 `CLAUDE.md` §10.4）

> **一次 reference sweep 本身不構成開新項目的理由。** 必須通過上面三條才算。

---

## 1. Current Focus

> **兩軌並行。`P1-09` 已不是「進行中的 implementation」。**
>
> ```text
> EXTERNAL REVIEW TRACK
>   PRE-03 / P1-09
>   READY FOR EXTERNAL REVIEW
>   Awaiting lawyer + accountant joint determination
>
> INDEPENDENT ENGINEERING TRACK
>   PRE-07  ← 下一項（部署設定：Render Free ×2 ＋ Neon ＋ B2 bucket）
>   PRE-08  （備份／還原演練 —— 對象已改為 B2 bucket ＋ Neon）
>            ※ 2026-08-31 官方查證 ✅ DONE，B-2 已解除：
>              Neon Free 無 automated backup、PITR 僅 6 小時
>                → pg_dump 由「選配」升級為「必要」
>              B2 預設 Keep all versions ＋ delete marker
>                → 誤刪可復原（本 repo 的 delete() 不送 versionId）
>            ※ 還原演練 PENDING —— 需要真實資源，依賴 PRE-07
>   ※ 2026-08-31 `PRE-09`（production 環境變數契約）✅ DONE
>     契約見 docs/production-environment-contract.md
>     （儲存章節已由 DEC-16 更新，見該文件檔頭 banner）
>   ※ 2026-08-31 `PRE-13`（generic S3 private storage driver）✅ DONE
>     Backend/storage/s3PrivateFileStorage.js
>     unit 264/264・DB 470/470・smoke exit 0（local 與 s3 各一次）
>     persistence gate：重啟前後皆 11/11 checksum intact
>   ※ REL-03（P3，SMTP 啟動前置檢查）與 PRE-12（P2，URL／設定前置檢查）
>     可與 PRE-07／PRE-08 平行，皆不需真實憑證或網域
>   ※ PRE-10 維持 BLOCKED ON OWNER PRODUCTION DOMAIN
>     （但 DEC-17 已明示 domain 不阻塞 MVP 部署 —— 郵件初期可不啟用）
>
> OWNER DECISION TRACK
>   PRE-01 / O-19 / Production DB
>   OWNER DECISION LOCKED（2026-08-31）
>     PRE-01        → Render          （DEC-13，儲存與 DB 條款已被 Round 7 取代）
>     O-19          → Resend SMTP     （DEC-14）
>     Production DB → FRESH DATABASE  （DEC-15）
>
>   ROUND 7 — NT$0 MVP DEPLOYMENT TARGET（2026-08-31）
>     Deployment target → NT$0        （DEC-17）
>     Object storage    → 提前至 MVP  （DEC-16，撤回 DEC-13 的 post-MVP 條款）
>     Private storage   → Backblaze B2（不需信用卡；fallback = Cloudflare R2）
>     PostgreSQL        → Neon Free   （不用 Render Free Postgres —— 30 天到期）
>     Frontend/Backend  → Render Free Web Service ×2
>     Email             → 初期可不啟用（fails soft）
>     Domain            → provider free URL，不阻塞部署
>     canonical: docs/mvp-nt0-deployment-decision-2026-08-31.md
>   ※ 決策已鎖定；`PRE-13`（storage driver）**已實作完成**，
>     但 deployment configuration NOT DONE / SMTP configuration NOT DONE
>     ——**尚未建立任何 Render service、Neon DB 或 B2 bucket，未綁卡**
>
>   OPS-01
>     CLOSED — NOT AN MVP LAUNCH BLOCKER（DEC-15 之後果）
>
>   PRODUCTION DOMAIN
>     PENDING OWNER DECISION / PURCHASE
>     Frontend hostname: PENDING
>     Backend  hostname: PENDING
>   ※ 決策資料：Round 2 架構方向 docs/owner-decision-packet-2026-08-31.md
>     Round 3 供應商研究 docs/owner-decision-round-3-provider-selection-2026-08-31.md
> ```
>
> **Owner Decision Track 為 2026-08-31 新增的第三軌（decision-prep only，未實作任何選項）。**
> 三項皆已備妥選項比較與 repository evidence，見 `docs/owner-decision-packet-2026-08-31.md`。
> **關鍵發現：`PRE-01` 與 O-19 並不依賴法律審查 —— 反過來，法律審查依賴它們。**
> 《隱私權政策》§5.3（郵件供應商）在等 O-19、§5.4（部署環境受託處理者）在等 O-20／`PRE-01`
> （`docs/legal-drafts/review-handoff.md:78-79`），因此決定這兩項會同時推進工程與法律兩條軌。
> `OPS-01` 只有**技術清理面**可即刻決定；涉及新期限揭露／通知／取消語意者
> 維持 **BLOCKED BY `PRE-03` / `P1-09`**。
>
> **2026-08-31：三項皆已由 Owner 拍板（`DEC-13`／`DEC-14`／`DEC-15`，見下方 Owner Decision Lock — Round 6）。**
> 以下保留 Round 3 的研究結論作為決策依據；**決策已鎖定，實作一律尚未開始**。
>
> **🚩 LAUNCH GUARDRAIL（不得違反）：**
> **在 production Backend hostname 鎖定之前，不得進行任何真實 production 素材上傳。**
> 理由是 `services/materialMedia.service.js:90` 的 `mediaUrl()` 會把**含 host 的絕對 URL**
> 寫進 `cover_image_url` / `detail_images[].image_url` / `demo_video_url`；
> 事後換 host 會讓既有素材的圖失效。**Render 配發的 hostname 不得視為最終 production 素材 host。**
>
> **Round 3（2026-08-31，research-only）的收斂結論**，見 `docs/owner-decision-round-3-provider-selection-2026-08-31.md`：
> `PRE-01` 建議 **Render**（DigitalOcean App Platform 因官方明文不支援 volume 而硬性淘汰；
> Railway 的 Postgres 是自管容器且無內建自動備份；Fly.io 的 Managed Postgres 最低 $38/月，
> 且其「每個 app 至少兩顆 volume」的官方建議與本 repo 的單一寫入者儲存實作衝突）／
> `O-19` 建議 **Resend**（唯一同時具備 465 implicit TLS —— 現有 `secure = (port === 465)`
> 零改動即保證 TLS —— 與 ≥30 天送信紀錄；Postmark 為接近的次選）／
> production 資料庫建議 **FRESH DB**（匯入現有資料會帶進 50–63 個 admin 帳號、
> 99% 以上的合成帳號、九成上架但交付不出的教材，以及零 `consent_records`）。
> **上述三項已於 2026-08-31 由 Owner 拍板；`OPS-01` 隨之關閉為「非 MVP launch blocker」。**
> **但 `PRE-01` 與 `O-19` 的 implementation 皆未開始** —— 拍板解除的是「該選誰」，
> 不是「已經設定好了」。deployment configuration 與 SMTP configuration 兩者都還沒做。
>
> **為什麼不再寫「`P1-09` implementation in progress」（`DOC-01`，2026-08-30）：**
> `P1-09` 的 engineering foundation —— Gate 1～7／14 的 schema、述詞與寫入端、`legal_documents` registry、
> `consent_records`、privacy-request domain、四條 public legal route —— **都已完成，且已於 `REL-01` 進版控**。
> 現在唯一的 blocker 是 **external professional review**（律師＋會計師），以及其下游的條文定稿與發布。
> 把它描述成 implementation 會讓讀者以為工程端還有東西可推 —— 事實上工程端能做的都做完了。
> **Deployment Readiness 仍為 `0 / 14`**，且**不會**因為 packet 進了 Git 而前進：**commit ≠ approval ≠ publication**。
>
> **最新（2026-08-27）：`P1-09` Owner Decision Lock — Round 1 完成。**
> Owner 已就 Owner Review Queue 前三項拍板：`DEC-LEGAL-05`（版本命名 = integer sequence）／
> `DEC-LEGAL-06`（re-consent = `requires_reconsent BOOLEAN`，**enforcement metadata 非法律認定**）／
> `DEC-LEGAL-07`（個資聯絡管道 = dedicated privacy email，MVP 先用 Owner 指定之個人 Email）。
> 那是 decision-only 回合 —— 0 行 production code、0 個 migration、0 個 Gate 狀態變更。
> `DEC-LEGAL-06` 產生的 implementation dependency **`SCHEMA-03` 已於同日完成** ✅
> （`requires_reconsent BOOLEAN NOT NULL`，兩層皆無 default；immutability trigger 白名單同步；
> `verifyCriticalSchema()` fail-closed；DB 432/432、unit 213/213、smoke exit 0）。
> **`SCHEMA-03` 是能力建置，不是 Gate 完成** —— Deployment Readiness 仍為 **0 / 14**。
>
> **Owner Decision Lock — Round 2 已完成（2026-08-27，decision-only）。**
> `DEC-04` CONFIRM／`DEC-LEGAL-08`（PDF upload 非 MVP blocker）／
> `DEC-LEGAL-09`（申訴入口 = 全域 ＋ order-context）／
> `DEC-LEGAL-10`（凍結內部 operating model = single-admin ＋ 標準化 reason ＋ Admin UI）／
> `DEC-06`・`DEC-08` 重新 CONFIRM（**兩者實作皆未完成**）／`O-19` 維持 FACT UNKNOWN。
> **產生兩個新 implementation TODO：`BUY-02`（全域申訴入口）、`OPS-02`（凍結 Admin UI ＋ reason taxonomy），皆 `OPEN`、皆未開始。**
>
> **`DEC-06`（註冊姓名）與 `DEC-08`（browser-local analytics）已於 2026-08-27 完成** ✅ ——
> 兩項 privacy-minimisation 皆為 frontend-only，**backend 與 schema 零改動**。
> **Owner Decision Round 2 的四個實作項已全數完成** ✅（2026-08-27）——
> `DEC-06`（註冊姓名）／`DEC-08`（browser-local analytics）／`BUY-02`（全域申訴入口）／
> `OPS-02`（凍結 Admin UI ＋ reason taxonomy）。
> **這些都是能力建置與產品決策落地，不是 Gate 完成** —— Deployment Readiness 仍為 **0 / 14**。
>
> **Owner Decision Round 3 已於 2026-08-28 完成** ✅（`DEC-LEGAL-11`／`DEC-LEGAL-12`／`DEC-LEGAL-13`）。
> **Owner-ready 的法律相鄰決策至此用盡** —— 不再規劃**法律相鄰**的 Round 4。
> （2026-08-28 實際發生的 Round 4 是**產品／UI 決策**回合，不是法律相鄰決策，見下方。）
> **但「Owner 已無事可決」並不成立**：`OPS-01`（179 筆 legacy `pending_payment` 訂單的一次性營運處置）Status 仍為 `OPEN`，其 Completion Criteria 明載需「產品／營運拍板」，**不依賴律師或會計師**，且它不在 Owner Review Queue 的 `O-*` 編號內，因此先前未被計入 Round 3。**（2026-08-28 tracker reconciliation 更正。）**
>
> **Owner Decision Lock — Round 4 已完成（2026-08-28，decision-only）。**
> 這一輪是**產品／UI 決策**回合，**不產生任何法律結論**，也未觸及 `docs/legal-drafts/` 任何草稿。
> **0 行 production code、0 個 migration、0 個 schema 變更、0 個 Gate 狀態變更。**
>
> | Decision ID | 對應 TODO | Owner 決策（2026-08-28） |
> | --- | --- | --- |
> | **`DEC-09`** | `BUY-03` | **MVP 現階段沒有真實 help／support capability** → **先移除／隱藏** Floating Help affordance。**明確不導向 `/me/complaints`** —— Help／Support 與 Complaint／Dispute 是不同語意，不應把一般求助入口誤導到申訴流程。**不得為此建立完整 Help Center。**未來有真實 support destination 時再重新加入 |
> | **`DEC-10`** | `BUY-04` | **MVP 現階段沒有 notification preference capability** → 從 buyer navigation **移除**「通知設定」。**不建立 notification system**、**不保留 disabled／placeholder item**。未來有真實 capability 時再重新加入 |
>
> **兩項的 Owner confirmation 阻塞至此解除** —— `BUY-03`／`BUY-04` 由「待裁示」轉為**可直接實作**，
> 成為工程軌的 #1／#2（見下方 Next Up 與 §2）。
> **這兩項不是 Deployment Readiness 14 個 Gate 中的任何一個**，既有的 Pre-Deployment Product
> Readiness audit 也**未**把它們列入 §2.1 的 11 個 deployment blocker —— 本輪未做該分類，亦不代為認定。
> **Deployment Readiness 仍為 `0 / 14`；外部關鍵路徑仍是 `PRE-03`（律師＋會計師會同認定）。**
>
> **Owner Decision Lock — Round 5 已完成（2026-08-28，decision-only）。**
> 同樣是**產品／UI 決策**回合，**不產生任何法律結論**，未觸及 `docs/legal-drafts/`。
> **0 行 production code、0 個 migration、0 個 schema 變更、0 個測試、0 個 Gate 狀態變更。**
> 對象是 `BUY-03` 的 dead-anchor audit 在同日新發現的兩個 buyer-facing false affordance。
>
> | Decision ID | 對應 TODO | Owner 決策（2026-08-28） |
> | --- | --- | --- |
> | **`DEC-11`** | `BUY-05` | **MVP 現階段沒有真實 account／profile destination** → 移除 buyer sidebar／footer 的 `#account` affordance，**collapsed rail 與 expanded footer 兩處都移除**。**不建 `/account`、不建 profile／settings page、不用 disabled placeholder 取代、不用其他無關 destination 替代。**avatar 若仍具純識別用途，可保留**非 clickable** 的 presentation —— 但不得留下假的 interactive affordance |
> | **`DEC-12`** | `BUY-06` | **MVP 現階段沒有 notification capability** → 移除 buyer topbar 的通知按鈕**與未讀紅點**。**不建 notification center／dropdown／backend；不保留 disabled notification button，也不保留永遠顯示的假 unread indicator。**未來有真實 notification capability 時再重新加入 |
>
> **`DEC-12` 補齊了 `DEC-10` 的文義缺口** —— `DEC-10` 只處理 buyer **navigation** 的「通知設定」，
> topbar 那顆帶未讀紅點的按鈕不在其射程內，先前刻意未擴張解釋，現由 `DEC-12` 明文涵蓋。
> **兩項的 Owner confirmation 阻塞至此解除**，成為工程軌 #1／#2
> **（此為 2026-08-28 當下的排序；`BUY-05`／`BUY-06` 皆已於 2026-08-30 ✅ DONE。
> 現行工程軌順序見本節下方的「Next Up（工程軌）」與 §2，勿據本句排序 —— `DOC-01`，2026-08-30）**。
> **`BUY-05` 同時是 `BUY-03` 能否關閉的唯一 blocker**（`BUY-03` 的 CC (4) 尚未滿足，見 §1.4）。
> **這兩項仍然不是 Deployment Readiness 14 個 Gate 中的任何一個** —— canonical Gate 定義沒有這樣的條目，
> 既有 Pre-Deployment Product Readiness audit 也未如此分類，本輪不代為認定。
> **Deployment Readiness 維持 `0 / 14`；外部關鍵路徑仍是 `PRE-03`。**
>
> **Owner Decision Lock — Round 6 已完成（2026-08-31，decision-only）。**
> **產品／基礎建設決策回合，不產生任何法律結論**，未變更 `docs/legal-drafts/` 的任何實質法律立場
> （僅就已知事實作 factual update，見 §4 說明與下方 `DEC-14` 註記）。
> **0 行 production code、0 個 migration、0 個 schema 變更、0 個測試、0 個 Gate 狀態變更。**
> **未部署、未建立任何 Render 服務、未建立 production 資料庫、未設定 SMTP、未變更 DNS。**
>
> **編號說明：** 本輪由 Owner 稱為「Owner Decision Lock Round 2（Production Providers + Database）」。
> 本檔既有的 Round 1～5 已被既有的法律／產品決策佔用，為避免編號衝突，
> 此處記為 **Round 6**，Decision ID 沿用 `DEC-nn` 命名空間（既有最大為 `DEC-12`）。
>
> | Decision ID | 對應項目 | Owner 決策（2026-08-31） |
> | --- | --- | --- |
> | **`DEC-13`** | `PRE-01` | **production 部署供應商 ＝ Render。** MVP 架構：Frontend 與 Backend 各一個 Render Web Service（**Backend 單一 instance**）／Database ＝ Render Managed PostgreSQL／私有檔案 ＝ Render Persistent Disk掛載於 `PRIVATE_FILE_STORAGE_PATH`／storage driver 維持 **`local`**、`PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true`。**物件儲存不屬於 MVP** —— S3／R2 遷移維持 post-MVP。**本決策不代表已部署** —— 部署設定（`PRE-07`）尚未開始  **【⚠️ 2026-08-31 PARTIALLY SUPERSEDED BY `DEC-16` / `DEC-17`（Round 7）】** Owner 改採 **NT$0 MVP 部署目標**，本列以下三項**不再是 canonical**：(1)「**物件儲存不屬於 MVP**」——**已撤回**，object storage 提前至 MVP（`DEC-16`）；(2)「私有檔案 ＝ Render Persistent Disk、driver 維持 `local`」——**已取代**，免費方案不提供 persistent volume，production driver 改為 **`s3`**；(3)「Database ＝ Render Managed PostgreSQL」——**已取代**，Render **免費** Postgres 建立 30 天後到期，改用 **Neon Free**。**仍然有效**：Frontend／Backend 各一個 Render Web Service（改用 Free instance）、**Backend 單一 instance**。canonical 見 `docs/mvp-nt0-deployment-decision-2026-08-31.md` |
> | **`DEC-14`** | `O-19` | **production 交易郵件供應商 ＝ Resend。** 整合方式維持 **nodemailer ＋ 通用 SMTP relay**，**不得改用 Resend SDK**。設定方向：`SMTP_HOST=smtp.resend.com`／`SMTP_PORT=465`（implicit TLS，使現有 `secure = (port === 465)` 零改動即生效）／`SMTP_USER=resend`／`SMTP_PASS` 為 production secret／`SMTP_FROM` 待 production 寄件身分確定。**真實憑證不得進入版控**（CLAUDE.md §8）。**DNS 與網域驗證仍為 production 郵件啟用的前置條件**，而網域尚未鎖定。**本決策不代表已設定** —— SMTP 設定（`PRE-10`）尚未開始 |
> | **`DEC-15`** | Production DB ／ `OPS-01` | **production 從全新空資料庫開始。** **不得匯入** `teaching_platform` 或 `teaching_platform_security_test` 的任何內容 —— 包含測試帳號、合成帳號、測試 admin、測試訂單、測試付款憑證、測試評價、測試稽核紀錄、legacy `pending_payment` 列，以及未發布的法律測試資料。provisioning 必須走 **`PRE-05` 已驗證的 fresh-DB 路徑**。**後果：production legacy `pending_payment` ＝ 0，故 `OPS-01` 不是 MVP launch blocker。****不得**為了 production 而遷移、回填、判逾期、關閉或以任何方式修改 dev／test 的 legacy 母體；兩個資料庫維持為開發／測試環境。**不得自行制定任何對消費者的 legacy 訂單政策** |
>
> ### Owner Decision Lock — Round 7（NT$0 MVP Deployment Target，2026-08-31）
>
> **canonical 文件：`docs/mvp-nt0-deployment-decision-2026-08-31.md`。**
> 本輪**有** production code 改動（`PRE-13`，見 §6 該列），但**未部署、未建立任何雲端資源、
> 未綁定信用卡、未購買網域、未輸入任何 production secret**。
>
> | Decision ID | 對應項目 | Owner 決策（2026-08-31） |
> | --- | --- | --- |
> | **`DEC-16`** | `PRE-01` ／ `DEC-13` 儲存條款 | **private object storage 提前至 MVP。** `DEC-13` 的「物件儲存不屬於 MVP」**已撤回**。production storage driver ＝ **`s3`**（generic S3-compatible，**不綁定供應商**）。選定供應商 ＝ **Backblaze B2**（建立帳號**不需信用卡**、可設每日 $ 上限使超額無法產生費用、10 GB 永久免費、private bucket、S3 API ＋ Range）。**已核可的 fallback ＝ Cloudflare R2**，切換只需改五個環境變數、**零行程式碼改動**。**Supabase Storage 硬性淘汰** —— Free 方案單檔上限 50 MB（官方明載不可調高），而本平台既有上限是教材 100 MB／影片 80 MB，採用它等於**縮小產品限制**；另有 7 天無活動即暫停且需人工恢復。**bucket 必須 private，presigned URL 刻意未實作** —— Backend 維持唯一授權入口 |
> | **`DEC-17`** | 部署目標 | **MVP deployment target ＝ NT$0。** Domain ＝ provider free URL（正式 `.com` 待品牌名稱確定，**不得成為 deployment blocker**）／使用者 ＝ 約 10 位封閉測試者／Frontend ＝ Render **Free** Web Service／Backend ＝ Render **Free** Web Service（單一 instance）／PostgreSQL ＝ **Neon Free**（**明確不用** Render Free Postgres —— 建立 30 天後到期）／Private file storage ＝ B2 via `s3` driver／**Email ＝ 初期可不啟用**（`SMTP_*` 留空時 fails soft，匯款帳戶由結帳頁的 `GET /payment/bank-info` 提供，不依賴郵件） |
>
> **LAUNCH GUARDRAIL 已修訂（不是取消）：** MVP 封閉測試期間允許用 Render 配發的 hostname 作為
> `PUBLIC_BACKEND_URL`，但**絕不可留空**（留空會把 `http://localhost:3000` 永久寫進 `cover_image_url` 等欄位）。
> 代價已知並被接受：換正式網域時需要一次性的 `REPLACE()` 資料修補（程序見 canonical 文件 §6），
> 若測試資料本來就要丟棄則改為重建資料庫即可。
>
> **⚠️ 受託處理者由 2 家變 4 家，直接影響 `O-20`：** Render ＋ Resend → Render ＋ **Neon** ＋ **Backblaze** ＋ Resend。
> **付款憑證（含買家姓名、帳號末碼、匯款截圖）將存放於 Backblaze B2（美國）**，屬跨境傳輸事實，
> 《隱私權政策》§5.4 的揭露必須據實反映並與律師確認。**本輪不作任何法律判斷。**
>
> **三項的 Owner 阻塞至此解除，但解除的是「決定」不是「實作」。**
> 新開的實作項為 `PRE-07`／`PRE-08`／`PRE-09`／`PRE-10`／`PRE-11`，全部 **NOT STARTED**（見 §1.4）；
> `REL-03` 的 `BLOCKED ON O-19` 已解除。
> **這三項都不是 Deployment Readiness 14 個 Gate 中的任何一個** —— canonical Gate 定義無此條目，
> 本輪不代為認定。**Deployment Readiness 維持 `0 / 14`；外部關鍵路徑仍是 `PRE-03`。**
> **production 網域仍為 `PENDING OWNER DECISION / PURCHASE`**，且是 `PRE-10`（DNS）與
> `PRE-07` hostname 部分的硬性前置條件。
>
> **剩餘工作分四軌，彼此可平行：**
>
> | 軌道 | 內容 |
> | --- | --- |
> | **Lawyer** | `PRE-03`（關鍵路徑）／`L-04`～`L-06`／`L-07`／`L-08`／`L-09`／`L-10`／`L-12`／`L-13`／`L-14`／`L-15`／`L-17`／`L-20`／`L-21`／`L-22`／`RM-15`／`LEGAL-01`／`PROD-01`／`U-1`～`U-10`；另含 O-3・O-21 的法律側 |
> | **Accountant** | `T-02`／`T-04`～`T-12`／`T-14`；連帶 O-13・O-14 |
> | **Deployment fact** | O-19（production SMTP provider）／O-20 ＋ `PRE-01`／`PRE-02`（hosting／DB／storage） |
> | **Engineering** | **`OPS-03`**／**`OPS-04`** —— 兩者皆 Owner 已拍板、**無外部依賴**，可在等待律師／會計師期間安全執行 |
>
> **`OPS-03` 與 `OPS-04` 皆已於 2026-08-28 完成** ✅ ——
> Owner Decision Round 3 的兩個實作項至此全部落地。
> **Active P1（2026-08-30 起）：0。**
> `BUY-03`／`BUY-04`／`BUY-05`／`BUY-06` **四項全部 ✅ DONE** —— 買家外殼的 dead affordance 已收斂完畢：
> `#help`（`DEC-09`）／`#notifications`（`DEC-10`）／`#account`（`DEC-11`）／topbar 通知鈕＋未讀紅點（`DEC-12`）。
> **`BUY-03` 是在 `BUY-05` 完成後重新執行 anchor audit、確認 CC (4) 達成才關閉的** ——
> 不是因為 `BUY-05` 完成就自動視為完成（狀態歷程完整保留於 §1.4）。
> **Next Up（工程軌，2026-08-30 `DOC-01` 完成後重算）：**
> ~~1. `DX-18` → 2. `DX-15`~~ **兩項皆已 ✅ DONE**（見 §1.4／§10.1）。
> `REL-01` ✅ **DONE**（2026-08-30，5 顆 preservation checkpoint）／`DOC-01` ✅ **DONE**（2026-08-30，本輪）。
> **工程軌（2026-08-31 `PRE-05` 完成後）：`NO ACTIVE P1/P2 SAFE ENGINEERING ITEM`。**
> `READINESS-02` 找出的四個項目（`REL-02`／`DX-21`／`PRE-05`／`BUY-07`）已完成三個，
> 剩下的 open 項目全部是 `P3`（`PRE-06`／`OPS-06`／`BUY-07`／`A11Y-02`／`A11Y-03`／`DX-16`／`SCHEMA-02`），
> 或需要 Owner／外部輸入（`READINESS-01` 需 audit 副本、`OPS-01` 需營運拍板、`PRE-01`／O-19 需部署決策）。
> **不自動升級任何 P3 —— 下一步做什麼由 Owner 決定。**
> 先前寫的 `NO ACTIVE P1/P2 SAFE ENGINEERING ITEM` 是 2026-08-30 當下**依既有 backlog** 的正確結論；`READINESS-02` 以全新盤點找出三個先前未被追蹤的 `P2`，因此該敘述已不成立。
> 其餘 open 項目為 `P3`（`OPS-06`／`A11Y-02`／`A11Y-03`／`BUY-07`／`DX-16`／`SCHEMA-02`），
> 或需要 Owner／外部輸入而非工程判斷（`READINESS-01` 需 audit report 副本、`OPS-01` 需營運拍板）。
> **`A11Y-02`／`A11Y-03` 維持 `P3`，不自動升級** —— 下一步做什麼由 Owner 決定。
> （`TEST-01` 已於 2026-08-30 ✅ **DONE** —— 完整 E2E 由 595 升為 **605 passed / 39 skipped / 0 failed**，skip 數未變）。
> 這四個新項目都是 `DOC-01` 盤點時以 repository evidence 立案的 **SAFE / INDEPENDENT** 工作，
> **完全不依賴律師或會計師的答案**（見 §17）。
> **`OPS-05` 仍排在最後且維持 `P3`**、**不對應 14 個 Gate 中任何一個**、**尚未開始** ——
> 它的工程能力可以做，但**真實法律文件的發布仍 blocked on lawyer approval**，
> **不代表它推進 deployment readiness**。
> `DX-15` 的關閉證據：`/` 的角色導向已移到 `middleware.ts`（server-side，不再依賴 client hydration），
> repeat matrix **0 / 40**、連續兩次完整平行套件 **DX-15 family 0 failures**，
> 且未使用 timeout／retry／serial／`workers=1` 任何 workaround。
> **回歸套件目前僅剩的紅燈全部是 backend :3000 未啟動所致**（`api-proxy` ＋ seeded material），
> 已明確隔離，不屬任何 open 工程項。
> **`PRE-03` 不參與工程排序** —— 它是**外部** critical path，與工程軌平行且互不阻塞。
>
> **External Critical Path：`PRE-03` — packet ready / awaiting joint determination。**
> 2026-08-30 完成事實盤點與會同判定 packet（`docs/legal-drafts/review-handoff.md` §4.1：
> 判定矩陣 9 題、白話問題組 `Q-A`～`Q-H`、單一回覆模板，**Final Answer 全部留白**）。
> **狀態為 `READY FOR EXTERNAL REVIEW`，不是 DONE** —— 等候律師＋會計師會同判定。
> **2026-08-30：freshness reconciliation 已完成** —— 四項 delta 已回寫證據附錄（`INV-2` / `EVD-1` superseded、`EVD-5` 部分 superseded、新增 `EVD-11`），
> 兩份 package 的 evidence 摘要與「不具備能力」表已同步事實更正。
> **packet factual evidence current as of 2026-08-30；awaiting lawyer + accountant joint determination。**
> **2026-08-30 第二階段：`B-6` / `B-5` 能力表已完成完整 re-baseline** —— 13 列全部重新深度驗證並標為 `[CURRENT]` / `[PARTIAL]` / `[NOT EXIST]`，**已無 `[需 re-baseline]` 或 UNKNOWN 列**。
> **PRE-03 — reviewer packet ready to send / awaiting joint determination。**
> **Engineering：`OPS-05` 維持 `P3`，且刻意尚未開始。**
> **Deployment Readiness：`0 / 14`** —— 本輪為 external decision preparation，未推進任何 Gate。
> **Deployment Readiness 維持 `0 / 14`** —— 本輪四項皆不對應任何 canonical Gate。
> **`OPS-05` 維持 `P3`，且不再是工程軌 #0** —— 它不對應 14 個 Gate 中任何一個；
> 它先前排 #0 只是因為當時工程軌沒有其他 Owner 已拍板的項目，那個前提在 Round 4 之後不成立。
> **`BUY-03` 排在 `BUY-04` 之前**的理由：(a) 曝光面較大 —— `fixed z-30`，買家**每一頁**常駐可見，
> 而 `BUY-04` 只在側欄「其他」次要區塊；(b) `BUY-03` 的 Completion Criteria (4) 要求
> 「買家外殼不得再有任何 `href="#..."` 死錨點」，該條**必須與 `BUY-04` 一併驗證** ——
> 先做曝光面大的那個，最後一次驗證同時涵蓋兩者。
> `DX-15`（`P2`，**OPEN — NOT REPRODUCIBLE**）：2026-08-27 專輪 19 次執行全綠、0 檔改動，
> 關閉條件為「下次完整回歸仍全綠即標 DONE」，**不需獨立開輪** ——
> 附掛在 `BUY-03`／`BUY-04` 的驗收回歸上 opportunistic close 即可。
> **其餘進度取決於 Lawyer／Accountant／deployment fact 三軌**（見上方 Round 3 分軌表）。
> **不可先做：** 任何需要已發布法律文件的工作（Gate 5 consent wiring、Gate 13）、
> 保存期間欄位（`retention_until`）、帳號刪除語意（`SCHEMA-02`／O-22）、
> 授權條款相關資料模型 —— 這些都會替尚未取得的外部結論做實質決定。
> **Next Up（決策軌）：** ~~Owner Decision Round 3（剩餘 A/B 類：O-4、O-12、O-15、O-16、O-21…）—— **尚未進入**。~~
> **（2026-08-28 tracker reconciliation：此列為 Round 3 之前的殘留，與上方「Round 3 已於 2026-08-28 完成」直接矛盾，已作廢。）**
> 其中 `O-15`／`O-21` 已由 `DEC-LEGAL-12`／`DEC-LEGAL-13` 解決；`O-4` 已有 `DEC-LEGAL-02` 原則、待 consent activation 才能落地；**`O-12`（創作者資格年齡條件）與 `O-16`（退款案件處理時限）在 handoff 表中未標「併同 `L-xx`」，形式上仍是 Owner 可決項**（`O-16` 若涉法定下限，需先與律師釐清該下限）。決策軌真正的下一個節點是 **`PRE-03`**（律師＋會計師會同認定），非 Owner 單方可決。
> **仍然 blocked：** 律師 `PENDING`／會計師 `PENDING`／`PRE-03`／`PRE-04`／`L-04`／`L-09`／`L-13`／
> `L-17`／`L-21`／`LEGAL-01`／`PROD-01` 法律下限／`T-02`～`T-14`；`O-22`（`SCHEMA-02`）blocked on `L-21`；
> `O-19` 待部署決定。
> **仍然 blocked：** 律師 `PENDING`／會計師 `PENDING`／`PRE-03`／`PRE-04`／`L-04`／`L-09`／`L-13`／
> `L-21`／`L-17`／`LEGAL-01`／`T-02`～`T-14` 全部維持 blocked；`O-22`（`SCHEMA-02`）blocked on `L-21`。
>
> **前一輪：Legal Foundation（法律文件 registry ＋ published-only renderer）已完成（2026-08-27）** ——
> 文件端工程基礎就緒，但**未撰寫任何條文、production consent 未接線**，
> 因此 `P1-09` 維持 `OPEN`；Gate 12 升為 `PARTIAL`，Deployment Readiness 維持 0 / 14。詳見 §2.3。
> 文件階段已 CLOSED，目前逐一實作 Deployment Gate 的後端能力，**一次一個工作單位**。
> 已完成 **Wave 1 #1～#5**（entitlement 欄位／付款時間／同意版本／帳號凍結／教材權利審查）
> 與 **Wave 2 #1～#6**（履約快照寫入端／entitlement suspend-restore／退款補救案件／
> legal hold ＋ fail-closed 檔案清理／人工銀行退款執行紀錄／消費申訴 intake
> ＋ `WAVE 2 #6 CORRECTION` SLA 日期計算修正）
> 與 **Wave 2 #7**（`SCHEMA-01` activity_logs schema drift 收斂 —— 非 Gate scope）
> 與 **Wave 2 #8**（Gate 6 人工付款資訊接線）
> 與 **Gate 6 Product Decision Round ＋ Wave 2 #9**（付款期限 7 日曆日、核帳 SLA 3 日曆日已拍板並落地）
> 與 **Wave 2 #10**（Gate 3 Buyer + Admin Complaint UI）
> 與 **Wave 2 #11**（Gate 3 逾期申訴告警／escalation）
> 與 **Wave 2 #12**（Gate 6 逾期付款 enforcement：Option A + A2）
> 與 **Wave 2 #13**（Gate 4 申訴證據讀取／交付）
> 與平行 **P1-09 Legal Documents / Consent / Privacy session** 的 **`H-1`**（買家端永久下載承諾移除）＋ **`DEC-02R`**（`ip_declaration_accepted` provenance 修正）——
> 完成紀錄與證據見 §2.3 各 Wave 區塊。
> **Deployment Readiness：0 / 14 IMPLEMENTED（Gate 1、2、3、**4**、5、6、7、14 為 PARTIAL）。**
> Gate 4 於 2026-08-27 由 `NOT IMPLEMENTED` 更正為 `PARTIAL` —— **那是文件落後於實作的更正，不是升級**（見 §2.3 Wave 2 #13）。
>
> **Gate 11 重新判定（2026-08-27，unified reconciliation）：`NOT IMPLEMENTED` → `PARTIAL`。**
> 四條 acceptance 中三條已有 evidence：`payment_due_at`（Wave 2 #9）、
> 逾期處理與逾期付款處理（Wave 2 #12 的 Option A + A2 enforcement）。
> **第四條「consent 版本處置（不復活）」= FAIL** —— 判定依據是 repo evidence 而非推測：
> `consent_records` 雖已具備 `order_id` 外鍵與索引，但 **沒有任何 route 引用 `consent.service.js`**、
> `consent_records` 實查 **0 列**、**訂單完全不捕捉 consent 版本**，
> 因此系統裡不存在「訂單當時同意的版本」這個事實，也就無所謂復活與否。
> 此條 **blocked on Gate 5 production consent integration**，而 Gate 5 又 blocked on 正式法律文件。
> **同樣是文件落後於實作的更正，不是升級。**
> **外部驗證：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`。
> `P1-09` 本身**仍為 `OPEN` blocker** —— 這些是能力建置，不是法律條文。

2026-08-25 的 Pre-Deployment UI / UX Readiness Audit 找出 38 項，
其中 **11 項為 deployment blocker**。兩輪修復後 **已關閉 10 項**
（`P1-01`～`P1-08`、`P1-10`、`P2-04`）—— 見 **§2.1／§2.2／§2.3**。

> ### 唯一剩下的 blocker：`P1-09`（條款／隱私權／著作權）
>
> **它不是工程問題。** repo 內沒有任何 approved legal copy；能做的程式工作
> （建立 route、把 checkbox 接上真實連結、consent 持久化）都要等**正式條文存在**才有意義。
> 產生條文等同偽造法律文件，因此**不做**。
> 需要產品／法務提供的 exact artifacts 列在 §2.3 的 `P1-09` 段落。
>
> **在 `P1-09` 關閉之前，最終判定維持 `NOT READY`** —— 即使所有測試全綠。

`PRE-01`／`PRE-02` 維持 blocked on deployment-platform decision，本輪未修改其技術內容，
且 **product readiness 未完成前不啟動**。

**（以下為前一輪的狀態，保留為對照）**

**Active P1（DX/COR/IA 系列）已清空。**
Admin IA 系列（`IA-01`～`IA-08`）、`BUY-01`、`SEC-02`、`DX-01`、`DX-05`、`DX-06`、`COR-02` ＋ `COR-03`、`COR-04`、`COR-05`、`COR-07` 與 **`COR-06`** 已**全數完成**。
**`COR-*` 系列已全數清空。**
**E2E 套件全綠、無已知間歇失敗，且驗收流程不再與 dev server 互相破壞。**
`PRE-01`（production 儲存後端決策）**仍 blocked on deployment-platform decision**，不是可以直接動手的實作項。
**Actionable backlog = 0。** `DX-12` 已於 2026-08-25 的 scope reconciliation 改判 `ACCEPTED DEBT`（非 actionable）——
三個家族的目標都無法還原，且沒有一處通過新建立的 **reference-hygiene stop rule**（見〈Priority 語意〉）。
`PRE-01` 與 `PRE-02` **都** blocked on deployment-platform decision（`PRE-02` 另外相依 `PRE-01`），
不是可以在本機直接動手的實作項。除此之外 `IA-*`／`BUY-*`／`SEC-*`／`COR-*`／`DX-01`～`DX-09` 已全數完成。

> **2026-08-25 `DX-12` scope reconciliation（本輪，未實作）：** 重測得 **47 處 / 17 檔**（上一輪記的 58 / 23 是錯的，已更正）。
> Family A `Epic §N` 18 處指向**從未存在於 repo** 的文件；Family B 測試 fixture 的 `§41`／`§49`～`§71` 27 處
> 對應的編號體系**在 41 個 commit 的歷史中從未出現**；runtime-visible **0 處**（與 `DX-10` 的關鍵差異）。
> 判定 **ACCEPTED DEBT**，並建立 **reference-hygiene stop rule** 終止 `DX-12`→`DX-13`→… 的 successor 鏈。詳見 §9。

> **2026-08-25 `DX-11`：** `adminOrders.service.js` 的裸 `§22` 改成可解析的雙指標 ——
> 契約指 `docs/mvp_rules.md` §19.2（該節逐字寫著同一個 invariant），測試以**斷言名稱**指路。
> 查證中**更正了上一輪的錯誤說法**：`:359` 的 partition 測試**沒有** Case 編號，
> `Case 4` 其實是 `:247` 的另一個 invariant —— 上一輪誤把檔頭主題清單的第 4 項當成 Case 編號。
> `adminOrdersFilter.db.test.js` **14 / 14 全綠**，SQL 與行為未動。
> sweep 另外找到 58 處未指明文件的 `§NN`，同類但規模不同，另立 `DX-12`。詳見 §9。

> **2026-08-25 `DX-10`：** `Backend/` 兩處 stale `§21` → `§22`。以隔離 backend（3001，security test DB）
> 實測 **served** OpenAPI：`/admin/activity-logs` 的 description 已更新、整份 spec 不再出現 `mvp_rules.md §21`，
> 而 `parameters`／`responses`／`paths` 數量完全不變；canonical smoke **全綠**。
> 盤點時發現第三個指不到東西的 `§22`（`adminOrders.service.js:54`），但它**不是** `DX-08` numbering drift 造成的，
> 且目標不明確 —— 依 §10.3 不猜、不擴 scope，另立 `DX-11`。詳見 §9。

> **2026-08-24 `DX-08`：** `mvp_rules.md` 子標題錯號修正。`# 22.` 底下的 `21.*` 五個子標題改為 `22.*`、
> `# 23.` 底下的 `22.1` 改為 `23.1`；`# 21.` 與 `# 21A.` 未動，`§A.1`／`§A.2` 未動。
> 重複 numeric heading **3 組 → 0**，repo-wide dangling reference **0**（96 條可解析）。
> 交叉引用先分類再改：修 6 處、刻意不改 4 類（本來就正確的、renumber 後自動修好的、
> 其他文件自己的章節、以及 `DX-08` 自身 Evidence 這種歷史證據）。
> **只改 `docs/`，runtime 檔案 0**；`Backend/` 內同源的兩處 stale `§21` 另立 `DX-10`。詳見 §9。

> **2026-08-24 `DX-07`（本輪）：** Playwright 產物 gitignore。重新實測發現實際是**三個**目錄而非舊 evidence 的兩個 ——
> 多出的 `frontend/test-results/`（195 筆）來自從 `frontend/` 這一層誤呼叫 playwright；
> `playwright-report/` 則因為**空目錄不會出現在 `git status`** 而一直沒被看見。
> 三條精確規則（app 層兩條帶 `/` 錨點、root 一條完整路徑），`git check-ignore -v` 全部命中，
> 反向確認測試原始碼與 fixtures 未被誤傷。**既有產物一個都沒刪**，重新生成後 `git status` 仍乾淨。
> runtime／config 改動 **0**。詳見 §9。

> **2026-08-24 `DX-02`（本輪，含併入的 `DX-03`）：** 44 處 `TODO(assert)` 逐一 disposition，**repo-wide 歸零**。
> A 補斷言 21／B 已被更強測試覆蓋 12／C 前提已不成立 7／D `DX-03` stale workflow 2／E 說明文字 1／F 補 fixture 6。
> **mark-reviewed 的兩處刪除且未還原 legacy UI。** 順帶發現 `parent.spec.ts` 一直在 `/login` 上通過
> （`DX-04` 探測 401 → 導向，而登入頁自 `COR-06` 起也有 `main`），補上外殼 bootstrap mock 才真的測到目標頁。
> **完整套件 440 / 0 / 30**（持平）、production 檔案 **0** 改動。詳見 §9。

> **2026-08-24 `DX-04`：✅ DONE（分兩輪完成）。**
> 新增 `lib/session.ts` ＋ `apiFetch` 的 `{ authExpiry: "recover" }` **opt-in** 選項；
> 401／403 明確分離（403 永不登出）、三道 guard、無 redirect loop；
> 順帶收斂三份重複的登出清單，並**修掉登入頁一個先前存在的 open redirect**。
> **完整套件 438 / 0 / 30**（baseline 402，+36 為新增測試，skip 數未變）。
> **第二輪（收尾）：** 先接上三個外殼讓阻擋物現形 —— 實際是 **31 支 / 6 個 spec**（非上輪推測的 8 個），
> 單一缺口就是外殼的 `GET auth/me` 未被 mock。修法是把 harness 補完整（共用 helper，避免 4 份 copy-paste），
> **不是**弱化 production recovery。三個外殼各 opt-in 一次：`RoleShell`(creator)／`ParentAppShell`／`AdminShell`。
> **完整套件 440 / 0 / 30**（上輪 438，+2 為新增的 redirect-loop 測試，skip 未變）。詳見 §9。

> **2026-08-24 DX backlog priority reconciliation（本輪，未實作任何 DX）：**
> 先前 §0 寫「Active P1 = 0」而 `DX-04` 標 `P1 + TODO`，兩者矛盾；`DX-02`／`DX-03`／`DX-04`／`DX-07`／`DX-08`
> 也從未完整進入 §14。本輪逐項以**現行 working tree** 複測，不沿用舊 priority：
> - **`DX-04`：`P1` → `P2`。** root cause 仍在（`lib/api-client.ts` 無共用 401/403 helper），但
>   無安全風險（真正邊界在 Backend `requireRole`）、不阻塞開發或 `verify:web`（exit 0）與 E2E（402/0/30）。
>   **決定性數據：JWT 7d vs cookie 1d** —— cookie 先過期，`middleware.ts` 已正確導向 `/login`；
>   未覆蓋的只剩「cookie 仍在但 JWT 被判無效」的窄窗，且有 workaround。
> - **`DX-03` 併入 `DX-02`** —— 那兩條 stale 註解本身就是 `TODO(assert)`，是 `DX-02` 的子集（同檔同次清理）。
> - **`DX-02` 證據更新**：44 處 / 6 個檔案（原記 40+ / 5 個，漏掉 `BUY-01` 新增的 `material-report.spec.ts`）；
>   `DX-03` 的行號由 279/318 更新為 **376/415**。
> - **`DX-07`／`DX-08` 複測仍成立，維持 `P3`。**
> 結果：**Active P1 真正歸零（有證據）**，剩 2 個 `P2` ＋ 2 個 `P3`。詳見 §9 各列與 §14。

> ⚠️ **2026-08-24 `COR-06` 輪次發現的 tracker 不一致，需要使用者裁示，本輪只記錄不自行改判：**
> §9 的 `DX-04`（401/403 protected-area opt-in UX helper）**標記為 `P1` 且 Status 仍是 TODO**，
> 但本表上方與 §0 都寫「Active P1 = 0」。兩者其一是過期的。
> 另外 `DX-02`／`DX-03`／`DX-07`／`DX-08` 也都還是 TODO，卻**從未進入 §14 的執行順序**
> （§14 只收過 `DX-01`／`DX-05`／`DX-06`，三者做完後就沒有 DX 列了）。
> 因此「backlog 已清空」的印象是**錯的** —— 實際還有 5 個 DX 項目。已補進 Next Up 與 §14。

> **2026-08-24 `COR-06`（本輪）：** main landmark 的擁有權收斂到外殼一層。
> 盤點後發現缺陷是**雙向**的：12 條路由各有 2 個巢狀 main，而 `/login`／`/register` 是 **0 個**（原記錄未涵蓋）。
> 選「外殼擁有」是依 repo 現況：**36 條路由本來就沒有 page-level `<main>`**，只有 12 個頁面自己渲染。
> 12 個 page component 的 `<main>` → `<div>`（class/style/testid 原樣保留），
> `RoleShell` 為 auth 頁補上不含 chrome 的 landmark。**版面／spacing／responsive 0 改動。**
> 測試**不靠 `.first()`**：新增 19 條路由 × 2 project 的 `toHaveCount(1)` 斷言，
> 並移除 `public.spec.ts`／`parent.spec.ts` 既有的 `.first()` 迴避。
> **驗證：** `verify:web` exit 0（3010 未停且前後健康）、landmark targeted **38/0**、
> 完整套件 **402 / 0 / 30**（先前 364，+38 恰為新增測試，零回歸）。詳見 §9。

> **2026-08-24 `COR-07`（本輪）：** 未授權即可取得的 stack／絕對路徑外洩已關閉。
> 重現後確認**三種輸入共用同一個 root cause**（app 沒有 terminal handler，全部落到 Express `finalhandler`）：
> 解不開的 percent-encoding、**壞掉的 JSON body**（原記錄未涵蓋）、以及未比對到的 route。
> **實測證明 `NODE_ENV=production` 不足**：那樣只是不再帶 stack，**回應仍是 `text/html`**。
> 因此契約由 app 保證 —— 回歸測試全程在 `NODE_ENV` 未設定下通過；`NODE_ENV` 現在是 defense in depth。
> 只認 `URIError` 與 `entity.parse.failed` 兩類為 400，其餘維持既有 generic 500，**未**把所有 Error 變成 400。
> **驗證：** unit 164/0、db 208/0、smoke exit 0、Postman 129/0、probe 全數 JSON 且 clean、
> `COR-05` 的 NUL 契約未被蓋掉、frontend production 檔案 **0** 改動。詳見 §9。

> **2026-08-24 `COR-05`（本輪）：** path 參數含 NUL byte 的 500 已關閉，改在**所有 router 之前**回 400。
> 先重現才修，並發現受影響面比原記錄更廣：匿名可觸發的是 **5 條**（原記 4 條，多一條
> `/materials/:id/rating-distribution`），另有 4 條需授權 route 在通過 auth 後同樣會倒。
> **修法的關鍵是先覆核識別碼契約**：`materials.id` / `material_media_files.id` 都是 `text`（`mat_*`），
> **不是 UUID** —— 沒有格式可驗，唯一永遠不合法的是 PostgreSQL 裝不下的 NUL byte。
> 沒有 catch PG `22021`、沒有動 auth、沒有建 validation framework。
> **驗證：** unit 153/0、db 208/0、smoke exit 0、Postman 129/0、PG `22021` 全程 **0** 次、
> `verify:web` exit 0（3010 未停且前後健康）、frontend production 檔案 **0** 改動。
> **本輪 security probe 另發現 `COR-07`**（未授權即可取得含絕對路徑的 stack），已立案未修。詳見 §9。

> **2026-08-24 `COR-04`（本輪）：** 買家可見面的系統角色稱呼收斂完成。
> 先立規則再動文案 —— 角色標籤（修）／受眾描述（保留）／內部識別碼（不動）三分法，
> **未把「家長」兩字全清掉**：`register/page.tsx` 的族群列舉依 checklist 的 Allowed Exception 保留。
> `api-repository.ts` 的假作者名**不改成另一個角色名**，而是依 repo 既有 canonical 做法不再捏造身分。
> 另修兩處過期且違規的 canonical 文件（詳情頁回饋區標題）。
> **internal `parent` / `teacher` 契約、DB、API、權限一字未動；runtime behavior 未改變。**
> **驗證：** `verify:web` exit 0（3010 全程未停且前後健康）、targeted E2E 16/0、
> 完整套件 **364 / 0 / 30**（零退步）。詳見 §9。

> **2026-08-24 `COR-02` ＋ `COR-03`（本輪）：** 兩項的 root cause 都在 `buyerOrders.service.js`，同輪收斂。
> `COR-02` 採用 completion criteria 的**選項 (b)** —— 退件備註只在 `order_progress_state = 'rejected'` 時進 payload；
> 不採用 (a) 的硬證據是 `rejected` 但 `rejection_reason IS NULL` 的 legacy 憑證有 42／63 筆，
> 「reason 為 NULL」無法當成 supersede 的結構化標記。
> `COR-03` 把 `cancelled` 加進 canonical 的 `order_progress_state` 並**先於憑證判斷短路**，
> 而不是在前端補 `orders.status` 判斷（那會把徽章來源拆回兩個，推翻 `COR-01`）。
> **驗證：** unit 139/0、db 208/0、smoke exit 0、`verify:web` exit 0（3010 全程未停且前後健康）、
> targeted E2E 46/0、完整套件 **364 / 0 / 30**（零退步）。詳見 §9。

> **2026-08-24 `DX-05`（本輪）：** canonical 驗收改為跑在隔離的 `distDir` 上。
> root cause 是 `.next` 為**無 per-consumer 隔離的共用可變目錄** —— build 覆寫它會讓執行中的
> `next dev` 整站 500，反向則讓 build 倒在 `EPERM .next\trace`（且是寫壞之後才失敗）。
> 機制先前已就位，但 canonical 的 `verify:web` 沒採用，隔離仍靠人記得。
> 本輪把 `verify:web` 三個階段（含 `next typegen`）統一注入 `NEXT_DIST_DIR=.next-verify`，
> production E2E 的 `next start` 由 `playwright.config.ts` 套用**同一個**預設值；
> **`next dev` 維持預設 `.next`，行為不變**，也**未新增第二個 script name**。
> **驗證全程不停 3010**：dev pid 13660 未變、`verify:web` 連續兩次 exit 0、驗收後所有路由仍 200，
> `.next` 始終沒有 `BUILD_ID` 且只有 `*-development` cache，E2E 在**未手動設定環境變數**下 90 passed / 0 failed。
> **application runtime code 0 改動。** 詳見 §9。

> **2026-08-24 `DX-06`（本輪）：** `shell-consistency.spec.ts` 的 `boxOf()` race 修復。
> **先重現再修**：修復前兩 project 併行連跑 5 次有 **2 次**倒在 `element has no bounding box`；
> 拋錯位置是 `spec.ts:64`（`if (!box) throw`），證明 `expect.poll` 已通過、倒下的是**其後那次獨立重讀**。
> 修法是讓 poll 的 callback 把量到的 box 帶出來當回傳值，**poll 之後不再讀第二次** ——
> 無 sleep、無調高 timeout、無改動 sidebar layout、無降低斷言精度，一處修改覆蓋 15 個 call site。
> **驗證：** 修復後同組合 5/5、`--repeat-each=10` **300/0**、幾何 targeted `--repeat-each=12` **228/0**、
> 完整套件 **364 / 0 / 30**（與 `DX-01` baseline 一致，零退步）。**production 程式碼 0 改動。** 詳見 §9。

> **2026-08-24 `DX-01`（本輪）：** 完整 E2E 套件回到全綠 —— **364 passed / 0 failed / 30 skipped**
> （先前 347 / 17 / 30）。四群失敗逐一取得根因，**全部落在測試端**：斷言指向已不存在的文案（第 1 群）、
> selector 未跟上新增的 SSO 佔位按鈕與重複的 `main` landmark、fixture 漏設 cookie（第 2 群）、
> mock 的 `GET /cart` 用了非契約欄位 `qty`（第 3 群，即既有的「cart subtotal = 0」），以及第 4 群的 race。
> **production 程式碼 0 改動。** 順帶新增 `COR-06`（外殼與頁面各有一個 `<main>`）。詳見 §9。

> **2026-08-24 `SEC-02`（本輪）：**
> 教材行銷素材（封面／詳情圖／試看影片）搬離公開 static，改為**條件公開**交付 ——
> 可見性由**所屬教材的 `status`** 決定，因此下架是立即生效的。
> root cause 不是「檔案放錯目錄」，而是三種檔案資產裡**只有素材沒有 metadata 記錄**，
> 交付時無從判斷該不該放行；因此新增 `material_media_files` 表（純 `CREATE TABLE`，
> **無資料搬移** —— 實測兩個 DB 的素材 URL 100% 為外部連結、磁碟 0 個檔案）。
> **未動 BUY-01 的任何 runtime 檔**（`MaterialDetailPage.tsx`／`MaterialReportDialog.tsx`／
> `material-report.spec.ts` 皆零改動）。詳見 §1.3。

> **2026-08-24 `BUY-01`（本輪）：**
> 產品決策已拍板為「**補回買家檢舉 UI**」，理由與規則落在 `docs/mvp_rules.md` §6.5。
> tracker 原本的替代選項（「正式記錄檢舉只由平台內部開案」）**已排除** ——
> `reports.reporter_id` 是 `NOT NULL REFERENCES users(id)`、平台沒有任何 admin 開案端點、
> 且 `mvp_rules.md` §6.4 刻意不對創作者揭露檢舉人身分；選它等於讓整條 workflow 永久零入口。
> 兩個子決策同時定案並寫進規格：**理由欄位維持自由文字**（`reports` 沒有 reason code 欄位，
> 前端不得拼假分類）、**入口對所有訪客可見**（非買家在 dialog 內被擋，不送出請求）。
> 實作只動 2 個 runtime 檔（1 新增 1 修改），**未動 backend、未動 schema**，
> 與 `IA-01`～`IA-08` 的檔案零重疊。詳見 §5。

> **2026-08-24 settled-tree final reconciliation（本輪）：**
> 所有 parallel session 皆已停止，working tree 視為 settled。本輪**未做任何新的 IA 實作**，
> 只在 settled tree 上重建可信的 verification evidence，並據此判定 `IA-06` 與 `IA-08` 為 DONE。
> 逐檔覆核 `IA-01`～`IA-08` 的實作檔（`lib/admin-labels.ts`、`ActivityLogCard.tsx`、
> `AttentionActivityList.tsx`、`AttentionOrdersTable.tsx`、`MaterialFeedbackContext.tsx`、
> `AdminSidebar.tsx`、`RoleShell.tsx`、`lib/admin-nav.ts`、`app/admin/orders/page.tsx`、
> `AdminDashboardPage.tsx`）—— **無覆蓋、無部分實作、無重複實作、無 stale caller、無契約不一致**。
> 本輪 evidence 一律取自 settled tree，**未沿用任何先前 session 的數字**。
> 未動兩個 staged rename，未 commit／push。

> **2026-08-23 final parallel reconciliation（已完成）：**
> 兩個 parallel session 的產出已由單一 session 一次收斂並完整驗收 ——
> `IA-07`（見 §4.3）、`IA-02` ＋ `IA-03`（見 §4.4）**三者皆 DONE**。
> 三組變更在 working tree 中**共存且互相保留**：`AdminSidebar.tsx`（`IA-07` 的 `sections`
> 移除仍在）、`lib/admin-labels.ts`（`IA-05` 的 `describeActivity()`／`activityTargetHref()`
> 與 `IA-02` 新增的 `describeActivityMeta()` 並存）、`app/admin/payment-proofs/page.tsx`／
> `app/admin/reports/page.tsx`（`IA-03` 入口）、`components/admin/ActivityLogCard.tsx`（新檔）
> 與四支 e2e spec 逐一比對，**無任何覆蓋**。
> `IA-07` 輪次延後的最終 repository build 已於本輪在**冷 `.next`** 上補跑並通過。
>
> **該輪為 reconciliation-only session**：未做任何新的 IA 實作，未修 `IA-08`，
> 未動兩個 staged rename（`RecentActivityList` → `AttentionActivityList`、
> `RecentOrdersTable` → `AttentionOrdersTable`），未 commit／push。
>
> **2026-08-23（`IA-08` 輪次）：** `IA-08` 已完成（見 §4.6）。該輪只動 admin 導覽的
> source of truth 與兩支新 E2E，**未碰** `IA-06`／`DX`／`BUY`／`PRE`／`SEC`／`COR`，
> 未動兩個 staged rename，其餘 working-tree 變更全數保留，未 commit／push。

> **2026-08-24 settled-tree final reconciliation ＋ tracker recovery（最新一輪）：**
> 所有 implementation session 皆已停止（實測：無任何專案 `node` 程序，3000／3010 皆未監聽），
> working tree 視為 settled。該輪**未做任何新實作**，只重建 verification evidence；
> 隨後本檔遭遇 truncation 事故並完成受控復原（見檔首 banner 與 §16）。
>
> **重新判定的結論（全部以 settled tree 的實測為準）：**
>
> - `BUY-01` = **DONE**；`SEC-02` = **DONE**；`IA-01`～`IA-08` = **DONE**；`SEC-01` = **DONE**。
> - 兩者檔案零重疊，docs 僅共用不同 section —— **無互相覆蓋**。
> - Backend：unit **139/0**、db **205/0**、smoke **exit 0**、Postman **82 requests / 129 assertions / 0 failed**
>   （isolated `PORT=3001`；以 `pg_stat_activity` 實測確認連線**只在** `teaching_platform_security_test`）。
> - Frontend：未設 `NEXT_DIST_DIR` 的 canonical `verify:web` 在冷 `.next` 上**單次 exit 0**（50 route）。
> - Security E2E **58/0**，其中 `payment-proof-security.spec.ts` 首次在**合格環境**下取得有效結果
>   （**12/12，0 skipped**）—— `BUY-01` 輪次那 6 支「環境不合格」的缺口已關閉。
> - 完整套件 **347 passed / 17 failed / 30 skipped**；17 支失敗**全數**落入既有的 `DX-01`（16）與 `DX-06`（1），
>   **零新增回歸**（分群與 signature 見 §9）。
> - `DX-09` **併回 `DX-05`**；新增 `COR-05`。
>
> 未動兩個 staged rename，未 commit／push。

---

## 1.1 剛完成：`COR-01` — Buyer Order Progress State — Re-upload Alignment ✅

| 欄位 | 內容 |
| --- | --- |
| **ID** | `COR-01` |
| **Priority** | `NOW` |
| **Area** | Buyer / Correctness |
| **Status** | **`DONE`**（2026-08-23，working tree，未 commit） |
| **Why** | 買家重新上傳憑證後仍被告知「請依退件原因重新上傳」—— 看到錯誤狀態並做錯操作 |
| **Dependency** | 無 |

**Root cause（已以查詢重現，非推論）**

`/me/orders` 與 `/me/orders/:orderId` 兩段各自複製的 `CASE` 中，
`EXISTS (review_status = 'rejected')` 排在 `EXISTS (review_status = 'pending')` **之前**，
而且兩個 `EXISTS` 都對**全部歷史憑證**求值。只要這張訂單曾經有一筆被退回的憑證，
之後不論買家重新上傳幾次，買家端永遠回 `rejected`。

同一組 fixture（`pending_payment` ＋ 舊 rejected ＋ 新 pending）在
`teaching_platform_security_test` 上的實測對照：

```text
舊 CASE → order_progress_state = "rejected"     ← 買家被要求再上傳一次
新 SQL  → order_progress_state = "reviewing"    ← 正確
```

**Final canonical precedence**（`Backend/services/buyerOrders.service.js`）

```text
orders.status = 'approved'             → approved         （必須最先短路）
latest proof.review_status = pending   → reviewing
latest proof.review_status = rejected  → rejected
latest proof 存在但非上述               → proof_uploaded
沒有任何憑證                            → pending
```

latest proof 的定義沿用 repo 既有排序，**未新增第三種**：
`ORDER BY COALESCE(uploaded_at, created_at) DESC, id DESC LIMIT 1`，
已抽成 `LATEST_PROOF_ORDER_BY_SQL`（`Backend/utils/paymentProofReview.js`），
buyer 與 admin（`adminOrders.service.js`）**共用同一份常數**。

**改動**

| 項目 | 內容 |
| --- | --- |
| 新的 canonical 定義 | `Backend/services/buyerOrders.service.js`（新檔）—— list 與 detail 共用 `LATEST_PROOF_LATERAL_SQL` ＋ `ORDER_PROGRESS_STATE_SQL`，一次 SQL 取得 latest proof（無 N+1） |
| 兩處重複 SQL 消除 | `Backend/routes/me.js` 的 list／detail 改為呼叫 service；route 只保留授權（404／403）與 items 查詢 |
| 排序常數共用 | `utils/paymentProofReview.js` 新增 `LATEST_PROOF_ORDER_BY_SQL`；`adminOrders.service.js` 改為引用 |
| Buyer UI | `app/orders/page.tsx`（徽章與 CTA 同源、`reviewing` 不給重新上傳、移除 `status === "rejected"` 死分支）、`app/me/orders/[orderId]/page.tsx`（timeline／文案／CTA 全部讀 `order_progress_state`）、`components/orders/OrderFlowMini.tsx`（優先讀進度欄位） |
| 測試 | `Backend/tests/buyerOrderProgress.db.test.js`（新檔，14 個斷言群）、smoke 新增「退件 → 重新上傳」的真實 HTTP 路徑、`frontend/apps/web/tests/e2e/buyer-order-progress.spec.ts`（新檔，5 test × 2 project） |
| 文件 | `docs/mvp_rules.md` §5 新增「Buyer derived state」小節（產品規則、precedence、UI 契約、儲存無關性）、§19 補上與 buyer 共用排序；`docs/teaching-platform-mvp-spec-v1.4.md` §4 改寫 `order_progress_state` 定義 |

**驗收證據（全部在本輪重新執行）**

| 驗證 | 結果 |
| --- | --- |
| `npm run test:unit --prefix Backend` | **124 pass / 0 fail** |
| `npm run test:db --prefix Backend` | **167 pass / 0 fail**（新增 14） |
| `npm run smoke`（對 `teaching_platform_security_test`，`PORT=3001`） | **All smoke checks passed**（exit 0），含 `order_progress_state = reviewing after re-upload (COR-01)` 與 Admin `pending_review` 對齊 |
| `npm run postman:newman`（同上） | **111 assertions / 0 failed** |
| `lint:web` | 0 error（既有 14 個 `no-img-element` warning） |
| `typecheck:web` | exit 0 |
| `build:web`（冷 `.next`） | exit 0，36 條 route |
| `buyer-order-progress.spec.ts`（production build） | **10 passed**（desktop ＋ mobile 各 5） |
| `critical-acceptance.spec.ts`（production build, desktop） | **17 passed / 1 failed** —— 失敗的是 checkout promo `ORDER \| CI \| 6-1`，**已在 `DX-01` 立案**，與本輪無關（新證據見 §9） |

**Completion Criteria（全部達成）**

1. ✅ `pending_payment` ＋ 無憑證 → `pending`
2. ✅ `pending_payment` ＋ pending 憑證 → `reviewing`
3. ✅ `pending_payment` ＋ 最新 rejected → `rejected`
4. ✅ 舊 rejected ＋ 新 pending → `reviewing`（並 explicit assert `!== "rejected"`）
5. ✅ approved 訂單 ＋ supersede 出來的 rejected 憑證 → 仍 `approved`
6. ✅ `uploaded_at IS NULL` ＋ 較新 `created_at` → latest 仍正確
7. ✅ list 與 detail 語意一致（同一段 SQL，且測試逐筆比對）
8. ✅ `reviewing` 時買家端不出現重新上傳 CTA（列表與詳情皆是）

> ⚠️ **`DX-05` 再次發生**：`build:web` 與同時執行中的 `next dev` 共用 `.next`，
> dev server 因此出現 `Cannot find module './vendor-chunks/@tamagui.js'`。
> 處理方式：停掉 dev server → `rm -rf .next` → 重新 build → 跑 E2E。
> **未為此修改任何 `COR-01` 程式碼。**

---

## 1.2 先前完成：`SEC-01` — Payment Proof Private Storage ✅

| 欄位 | 內容 |
| --- | --- |
| **ID** | `SEC-01` |
| **Priority** | `NOW` |
| **Area** | Payment / Security |
| **Status** | **`DONE`**（2026-08-23，working tree，未 commit）—— 後端、schema、legacy 搬移、前端、測試、smoke／Postman **與 E2E closure** 全部完成 |
| **Why** | 付款憑證含買家匯款資訊。搬遷前它們位於 `express.static` 無條件公開的 `uploads/` 樹下，只靠隨機檔名保護（security by obscurity） |
| **Existing Spec** | 有 —— 比照 `docs/material-file-storage-and-delivery.md` 的私有儲存模型；`Backend/services/paymentProof.service.js` 的檔頭已寫明三條不變條件 |
| **Dependency** | 無（可立即繼續） |

**⚠️ 這一份 entry 曾在實作進行中被盤點過**（當時工作目錄正被另一個 session 主動修改）。
下方的「尚未完成」清單**已全部關閉** —— 保留是為了留下缺口與如何被關閉的對照，
不是待辦事項。

#### 已完成（working tree，未 commit）

| 項目 | 證據 |
| --- | --- |
| 型別／大小政策（副檔名＋MIME＋magic bytes 三層） | `Backend/utils/paymentProofPolicy.js`（新檔，176 行） |
| 服務層：儲存、授權、交付 | `Backend/services/paymentProof.service.js`（新檔，334 行） |
| 上傳改走 memoryStorage → 私有儲存 | `Backend/routes/order.js:37-38`（`multer.memoryStorage()`）、`:182-219` |
| 授權讀取端點 | `Backend/routes/order.js:323` `GET /orders/:orderId/payment-proofs/:proofId/file` |
| 憑證清單（metadata，不含位元組） | `Backend/routes/order.js:295` |
| 公開路徑深度防禦封鎖 | `Backend/index.js:41` —— `/uploads/payment-proofs` 掛在 static **之前**直接擋掉 |
| Admin 契約移除 `proof_url` | `Backend/services/adminPaymentProofs.service.js:122`；改回 `proof_storage_status` / `proof_file_available` |
| schema migration（SQL） | `Backend/migrations/20260823_payment_proof_private_storage.sql`（新檔） |
| 私有儲存 driver 與教材本體共用 | `Backend/config/privateFileStorage.js:5`（"教材本體與付款憑證共用"），production fail-closed |

#### 曾經的缺口，以及如何被關閉（**全部已完成**）

下表左半是實作中途盤點到的缺口，右半是關閉它的證據。

| # | 缺口 | 原始證據 |
| --- | --- | --- |
| 1 | **實體檔案搬移腳本不存在** | SQL 檔頭指名 `Backend/scripts/migrate-payment-proofs-to-private.js`，但 `ls Backend/scripts/` 沒有這支檔案 |
| 2 | **legacy 資料一筆都沒搬** | `teaching_platform`：92 筆全部 `storage_status = 'legacy_public'`（read-only 查詢）；`Backend/uploads/payment-proofs/` 仍有 **95 個實體檔案**；`Backend/private-storage/payment-proofs/` **不存在**（0 檔案） |
| 3 | **security test DB 未套用 migration** | `teaching_platform_security_test` 的 `manual_payment_proofs` **沒有** `storage_key` / `storage_status` / `checksum_sha256` / `uploaded_by` 四個欄位（174 筆資料）→ smoke / Postman / db test 會打到舊 schema |
| 4 | **Admin 憑證預覽目前是壞的** | 後端已不回 `proof_url`，但 `frontend/apps/web/app/admin/payment-proofs/page.tsx:485` 仍是 `{proof.proof_url ? <img src={proof.proof_url}> : null}` → 條件恆為 falsy，**整個預覽區塊不再渲染，Admin 看不到任何憑證影像** |
| 5 | **沒有任何測試** | `Backend/tests/` 只有 `adminPaymentProofs.db.test.js`、`paymentProofReview.test.js`（都是舊的審核邏輯測試）；`run-db-tests.js` 只註冊了 `materialFile.db.test.js` / `materialReview.db.test.js`。對照組：教材本體有 3 支測試 |
| 6 | **公開副本未清理** | 見 #2 的 95 個檔案 |
| 7 | **env 範本未更新** | `Backend/.env.example` 只有 `MATERIAL_FILE_STORAGE_*`，沒有 `PRIVATE_FILE_STORAGE_*` 系列 |

#### 缺口關閉證據

| # | 關閉方式 | 驗證 |
| --- | --- | --- |
| 1 | `Backend/scripts/migrate-payment-proofs-to-private.js`（`npm run migrate:payment-proofs`）—— 複製 → 讀回驗 SHA-256 → 更新 DB → **另一步**才刪公開檔 | dry-run / apply / rerun 三種模式都跑過 |
| 2 | 兩個資料庫的 legacy 憑證全部搬完 | `teaching_platform` 13 筆、`teaching_platform_security_test` 95 筆 → `storage_status='private'`；其餘 79 筆是 seed 的外部網址（`https://example.com/…`），平台從來沒有那些檔案 → `legacy_external`。`legacy_public` = 0，`legacy_missing` = 0 |
| 3 | 兩個 DB 都套用了 `20260823_payment_proof_private_storage.sql`；`bootstrapModel.js` 也補上同一組 ALTER（新資料庫自動具備） | db test 全綠（153 pass） |
| 4 | Admin 預覽改為 `PaymentProofPreview`（`apiFetch` 取 blob → object URL → `<img>`，卸載時 revoke） | `frontend/apps/web/app/admin/payment-proofs/page.tsx`、`lib/payment-proof.ts` |
| 5 | 3 支測試：`tests/paymentProofPolicy.test.js`、`tests/privateFileStorage.test.js`、`tests/paymentProofPrivateStorage.db.test.js`（已註冊進 `run-db-tests.js` 與 `test:unit`） | unit 124 pass、db 153 pass（含 23 支憑證測試） |
| 6 | 95 個公開副本在**驗證 byte-identical 之後**刪除；`uploads/payment-proofs/` 現為空目錄 | 搬移腳本 `--delete-public` 報告：`public copies removed: 95`、`public files on disk: 0` |
| 7 | `.env.example` 補上 `PRIVATE_FILE_STORAGE_*` 與 `MAX_PAYMENT_PROOF_BYTES` | — |

#### E2E closure（2026-08-23，production build）

環境：Backend **3021** → `teaching_platform_security_test`；Frontend **3031** = `next start`
（production build，`API_BASE_URL` 指向 3021）。**未動用 3000 / 3010 的其他 session 服務。**

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3031 E2E_BACKEND_URL=http://127.0.0.1:3021 E2E_SERVER=production npx playwright test
```

| 覆蓋項目 | 落點 | 結果 |
| --- | --- | --- |
| Buyer upload payment proof | `critical-acceptance.spec.ts` 8）必填驗證、9）送出成功回饋 | ✅ |
| Buyer 訂單進度顯示 | 同上 9-1）order detail timeline | ✅ |
| **Admin authenticated inline preview** | `admin-operations.spec.ts`「review panel shows the full decision context」斷言 `payment-proof-image` 在真實瀏覽器中可見 —— 即 blob fetch → object URL 的授權預覽實際運作 | ✅ |
| Admin approve | `admin-operations.spec.ts`「approve posts to the approve endpoint」 | ✅ |
| Admin reject（含 reason code / `other` 必填 note） | 同檔 2 支 ＋ `critical-acceptance` 14） | ✅ |
| Admin payment review 可搜尋、決策脈絡完整 | `critical-acceptance` 13） | ✅ |
| 全流程 journey（login → shop → checkout → upload → download → admin review） | `critical-acceptance` 16） | ✅ |
| **anonymous 讀取被拒（401）** | `payment-proof-security.spec.ts`（**新檔**，打真後端不用 mock） | ✅ |
| **non-owner 讀取被拒（403）** | 同上 —— 用 admin 取真實 order/proof id，再以當場註冊的新買家嘗試 | ✅ |
| **legacy 公開 URL 不再供應（404 `payment_proof_not_public`）** | 同上，**直打 Backend origin**（該路徑是 static 直出，不走 proxy） | ✅ |
| 公開教材素材未被一起關掉 | 同上（封鎖僅限 `payment-proofs` 前綴） | ✅ |
| 交付 header（`private, no-store` ＋ `nosniff` ＋ `image/*`） | 同上（admin 讀取時斷言） | ✅ |

`admin-operations.spec.ts -g "Admin payment review"` **7/7 passed**；
`payment-proof-security.spec.ts` **6/6 passed**。
完整套件 **275 passed / 17 failed / 26 skipped** —— **17 個失敗全部與付款憑證無關**，
且在 seed 完整的 dev DB 上同樣失敗（= pre-existing，非本輪造成）。明細見 `DX-01`。

#### Completion Criteria（全部達成）

1. ✅ 搬移腳本存在，且**驗 checksum** 後才改 `storage_status`；無法搬的明確標記為
   `legacy_external` / `legacy_missing`，**不靜默丟棄**。
2. ✅ 兩個資料庫都套用 migration；`teaching_platform` 的 92 筆全部離開 `legacy_public`。
3. ✅ `Backend/uploads/payment-proofs/` 已清空（目錄保留，且該路徑本身已被 404 擋掉）。
4. ✅ Admin 預覽改走授權端點並恢復可見；買家看自己的憑證走**同一支**端點（同一份授權邏輯）。
5. ✅ 任何 API 回應與 log 都不含 `storage_key` / 實體路徑（smoke、Postman、db test 各有斷言）。
6. ✅ 授權矩陣（owner / 他人 / teacher / admin / 未登入）、magic bytes 拒絕、legacy 409、
   搬移冪等性、上傳→安全讀取的 SHA-256 逐 byte 比對，全部有測試。
7. ✅ `npm run smoke --prefix Backend` exit 0；Postman 111 assertions / 0 failed。
8. ✅ `.env.example` 補上 `PRIVATE_FILE_STORAGE_*`。

#### 獨立驗證（2026-08-23，第二個 session 覆核）

實作完成後由另一個 session 重跑，**未採信既有紀錄，全部重新執行**：

| 驗證 | 結果 |
| --- | --- |
| `npm run test:unit --prefix Backend` | **124 pass / 0 fail** |
| `npm run test:db --prefix Backend` | **153 pass / 0 fail** |
| `npm run smoke`（對 `teaching_platform_security_test`） | **All smoke checks passed**（exit 0） |
| `npm run postman`（同上） | **111 assertions / 0 failed**（exit 0） |
| 兩個 DB 的 `storage_status` | `legacy_public` = **0**、`legacy_missing` = **0**（dev 13 private + 79 legacy_external；security test 101 private + 79 legacy_external） |
| `Backend/uploads/payment-proofs/` | **0 個檔案** |
| 未帶授權讀憑證 `GET /orders/:id/payment-proofs/:pid/file` | **401** |
| 舊公開路徑 `/uploads/payment-proofs/<真實舊檔名>` | **404** |
| `bootstrapModel.js` 是否讓新 DB 自動具備欄位與約束 | ✅ `:205-226` 同一組 ALTER + CHECK |
| 搬移腳本的安全性 | ✅ 預設 dry-run；source SHA-256 → 寫入後比對 → **讀回再驗**；`--delete-public` 為獨立旗標且**任一列失敗就拒絕刪除** |
| `npm run verify:web`（三個階段） | **lint ✅ 0 error**（僅既有 14 個 `no-img-element` warning）、**typecheck ✅ exit 0**、**build ✅ exit 0**（36 條 route 全部產生）。三者皆在**目前這棵樹**上通過。⚠️ 但**串接執行的 `verify:web` 本身在本機環境不穩定** —— 見 `DX-05`，與 `SEC-01` 無關 |

**smoke／Postman 的執行方式：** 因為 3000 埠上的既有 server 指向 **dev** DB，
另起一個 `PORT=3001 PGDATABASE=teaching_platform_security_test` 的實例，
以 `API_SMOKE_BASE` / `POSTMAN_BASE_URL` 指向它 —— 符合 CLAUDE.md §7
「smoke / Postman 只能指向 `teaching_platform_security_test`」，且不動既有 server。

#### 一個觀察（**不是缺口，不阻擋收斂**）

授權讀取端點對「訂單擁有者」是成立的（服務層與測試都涵蓋），但**買家端目前沒有
任何 UI 會顯示自己已上傳的憑證** —— `/orders/:id/payment-proof` 只負責上傳。
這**不是** milestone 造成的退步（搬遷前買家同樣看不到），只是能力存在於 API 層而 UI 未使用。
要不要提供「查看我上傳過的憑證」屬產品決策，不在 `SEC-01` 的安全範圍內。

> **保存期限政策不在這一項的範圍內** —— 見 `FUT-P2`。

---

## 1.3 剛完成：`SEC-02` — Material Media Private Storage ✅

| 欄位 | 內容 |
| --- | --- |
| **ID** | `SEC-02` |
| **Priority** | ~~`P1`~~ ✅ |
| **Area** | Material / Security |
| **Status** | **`DONE`**（2026-08-24，working tree，未 commit） |
| **Why** | 封面／詳情圖／試看影片由 `express.static` 無條件公開，未上架與**已下架**教材的素材只靠隨機檔名保護 |
| **Existing Spec** | 有（`docs/mvp_rules.md` §3.1，本輪新增）；設計見 `docs/material-file-storage-and-delivery.md` §24 |
| **Dependency** | 無 |

### Root cause（不是「檔案放錯目錄」）

三種檔案資產裡，行銷素材是**唯一沒有 metadata 記錄**的一種：

| 資產 | metadata 表 | 授權判斷依據 |
| --- | --- | --- |
| 教材本體 | `material_files` | 購買 entitlement／Admin |
| 付款憑證 | `manual_payment_proofs` | `orders.user_id`／Admin |
| **行銷素材** | **無** | **無 —— 只有隨機檔名** |

`cover_image_url` 只是自由文字 URL 欄位（`routes/materials.js` 只驗 `isValidUrl`），
檔案與教材之間**沒有可查詢的關聯**。因此交付時無從判斷「這張圖屬於哪份教材、
那份教材上架了沒」—— 只能整個目錄公開或整個關掉，因為 `express.static` 沒有「條件」這種東西。

實務後果，依嚴重度：

1. **下架撤不回素材。** 上架 → 封面 URL 被爬蟲／分享／快取記下 → 檢舉處置下架 →
   教材頁 403，但封面與試看影片**永久匿名可取**。若下架原因正是侵權或不當內容，
   平台等於仍在供應它。
2. **審核閘門不涵蓋位元組。** `pending_review` 教材的素材在 Admin 看第一眼之前就已公開。
3. **孤兒上傳永久公開**，且無任何清理機制。

### ⚠️ 實作前實測：這是 prospective gap，不是 active leak

```text
Backend/uploads/material-media/                      0 個檔案
cover / demo / detail 的 URL                         兩個 DB 皆 100% 外部連結
指向 /uploads/material-media/ 的資料列                0 筆
```

（2026-08-24 於 `teaching_platform` 與 `teaching_platform_security_test` 唯讀查詢。）

**因此沒有資料搬移腳本** —— 這是與 `SEC-01` 最大的差異（那一輪要搬 95 個實體檔案與
108 筆 legacy 列）。但任何一次真實上傳都會立刻踩到這個 gap。

### 授權規則（canonical：`docs/mvp_rules.md` §3.1）

```text
所屬教材 published                        → 任何人（含匿名；公開商品頁需要）
material_id IS NULL（尚未認領）            → 上傳者 或 Admin
pending_review / changes_requested /
unpublished                               → 教材擁有者 或 Admin
```

匿名回 **401**、已登入但無權回 **403**（與付款憑證交付端點一致）。
**下架立即生效**：`status` 一變，同一條 URL 對匿名訪客就變成 401，不需要搬檔案或換 URL。

### `SEC-01` 重用了什麼、沒重用什麼

| SEC-01 產出 | 結果 |
| --- | --- |
| `storage/privateFileStorage.js`（namespace 化的 put/openReadStream/stat/delete） | ✅ 直接重用（新增 `material-media` namespace） |
| `config/privateFileStorage.js`（driver、production fail-closed） | ✅ 直接重用（第三種資產零改動加入） |
| `utils/fileDownloadResponse.js` | ✅ 重用（新增 optional `cacheControl`，預設值不變） |
| 三層型別驗證的**模式** | ⚙️ 照抄，型別集不同（多 GIF／WebP／MP4／WebM） |
| `lib/payment-proof.ts` 的 blob fetch **模式** | ⚙️ 照抄成 `lib/material-media.ts` ＋ `MediaImage.tsx` |
| **授權模型** | ❌ **不能重用** —— 素材是三者中唯一**條件公開**的資產 |
| legacy 搬移腳本 | ❌ **不需要**（0 檔案 0 列） |

> **原本的預估「重用而非新建，成本最低」只對了一半。** primitives 確實可重用，
> 但素材沒有 metadata 表，因此仍需一次 schema migration 與一支新的交付端點。

### 改動

| 層 | 內容 |
| --- | --- |
| Schema | 新表 `material_media_files`（`Backend/migrations/20260824_material_media_private_storage.sql`，純 `CREATE TABLE IF NOT EXISTS`，**不動任何既有欄位或資料列**）；`bootstrapModel.js` 與 `db/db_schema.sql` 同步 |
| Storage | `storage/privateFileStorage.js` 新增 `material-media` namespace；`openReadStream` 加上 optional range（`<video>` seek 需要） |
| Policy | `utils/materialMediaPolicy.js`（新檔）—— kind 綁型別家族、三層驗證 |
| Service | `services/materialMedia.service.js`（新檔）—— 儲存、認領、授權、交付 |
| Upload | `routes/teacherUpload.js` 改為 streaming 自訂 storage engine（影片 80 MB 不能進記憶體）；kind 不合法**回 400** 而非默默退回 `cover` |
| Claim | `routes/materials.js` 的 create（同一 transaction）與 update（UPDATE 前的獨立 transaction） |
| Delivery | `GET /materials/media/:mediaId`（`optionalAuth`、`inline`、`Range`、依授權切換 cache-control） |
| 舊路徑 | `Backend/index.js` 在 static 之前擋掉 `/uploads/material-media`（404 `material_media_not_public`） |
| Frontend | `lib/material-media.ts` ＋ `components/materials/MediaImage.tsx`（`MediaImage` / `MediaLink`）；接上 `MaterialReviewPanel.tsx` 與 `teacher/MaterialMediaFields.tsx`。**公開商品頁未改動** —— 已上架素材匿名可取，普通 `<img src>` 才有瀏覽器快取 |
| Docs | `mvp_rules.md` §3.1（新增）、MVP spec §4／§11、`materials-detail-spec.md` §7、`material-file-storage-and-delivery.md` §2.1／§19／§23.3／§24（新增）、`swagger.js`、`.env.example`、`docs/postman/README.md` |

### DB migration 安全程序（CLAUDE.md §4）

| 步驟 | 結果 |
| --- | --- |
| 備份 | `pg_dump` 兩個 DB 至**專案外部**的備份目錄（334 KB／1044 KB） |
| 目標 assertion | 執行端（`scripts/apply-migration.js` allowlist）＋ SQL 內建 `current_database()` 兩層 |
| 單一 transaction | `BEGIN … COMMIT` |
| 破壞性檢查 | 事前唯讀確認 `material_media_files` 與相關 constraint 皆**不存在**（兩個 DB 皆 0） |
| 事後比對 | 兩個 DB 的欄位／約束／索引**逐項相同**，資料列皆 0 |

### 驗證（全部在本輪重新執行）

| 驗證 | 結果 |
| --- | --- |
| `npm run test:unit --prefix Backend` | **139 pass / 0 fail**（原 124，新增 `materialMediaPolicy.test.js` 15） |
| `npm run test:db --prefix Backend` | **205 pass / 0 fail**（原 181，新增 `materialMedia.db.test.js` 24） |
| `npm run smoke`（`PORT=3001` + `teaching_platform_security_test`） | **All smoke checks passed**（exit 0） |
| `npm run postman`（同上 base） | **82 requests / 129 assertions / 0 failed**（原 77／119） |
| `verify:web`（**冷隔離 distDir**，見下） | **一次 exit 0** —— lint 0 error（7 個既有 `no-img-element` warning）／typecheck exit 0／build 50 route（`BUILD_ID=jZZ_GGZwS4VHfqEEj5V6I`） |
| `material-media-security.spec.ts`（新檔） | **16 passed / 0 failed**（desktop＋mobile） |
| `payment-proof-security.spec.ts` ＋ `material-review.spec.ts` ＋ `teacher.spec.ts` | **36 passed / 0 failed** |

E2E 的授權矩陣包含**經檢舉處置真實下架**（`POST /reports` → `investigate` → `resolve
{ resolution: "unpublish_material" }`）後的匿名撤回 —— 第一版用 `request-changes` 走捷徑，
但 `published → changes_requested` 不是合法轉移，那條斷言會**靜靜地沒測到**；已改為真實路徑。

### 平行 session 隔離（本輪未干擾 3010）

另一個 session 的 `next dev --port 3010` 全程在跑。為了不重演 `BUY-01` 輪次的
「build 換掉共用 `.next` → dev server 全數 500」：

- `next.config.ts` 新增 **env-gated `distDir`**（`process.env.NEXT_DIST_DIR || ".next"`，
  **未設環境變數時行為完全不變**），驗收 build 一律寫到 `.next-sec02`；
  `.gitignore` 補上 `/.next-*/`。
- 前端驗收跑在隔離的 **3032**（`next start`），後端跑在隔離的 **3001**。
- 3010 的 dev server **未被終止**；本輪結束時 `/`、`/login`、`/materials` 實測皆 **200**
  （本輪未對它做任何修復動作，此為觀察值，非本輪成果）。

> 這**不是** `DX-05` 的修法（那一項講的是 `verify:web` 串接執行本身的不穩定）。
> 已另立 `DX-09` 記錄「驗收 build 需要隔離 distDir」這件事本身。

### Completion Criteria（全部達成）

1. ✅ 「已上架教材的封面本來就該公開」的邊界已定案並寫進 canonical doc（`mvp_rules.md` §3.1）。
2. ✅ 未上架／已下架教材的素材**不得被匿名取得** —— 401，且 db test／smoke／Postman／E2E 各有斷言。
3. ✅ 下架**立即**撤回匿名存取（E2E 走真實檢舉處置路徑驗證）。
4. ✅ 已上架教材的公開商品頁**零改動**且仍匿名可取（byte-identical round-trip）。
5. ✅ 舊的 `/uploads/material-media/*` 一律 404，且封鎖只針對該前綴。
6. ✅ `storage_key` / `checksum_sha256` 不出現在任何 API 回應（smoke／Postman／E2E 各有斷言）。
7. ✅ 認領驗擁有權：跨創作者認領 400，且該素材對攻擊者仍為 403。
8. ✅ 兩個資料庫 schema 一致；`.env.example` 補上兩個新上限變數。

### 已知限制（**刻意，已立案，不是缺口**）

| 項目 | ID |
| --- | --- |
| 已購買的買家看不到**已下架**教材的封面（退回底色） | `FUT-P7` |
| 未認領素材沒有自動清理（對照：教材本體有 `cleanup-material-files.js`） | `FUT-T7` |
| 未上架教材的試看影片走 blob fetch，會整支載進記憶體（上限 80 MB） | `FUT-T8` |

---

## 1.4 本輪新發現（Wave 2 #6，2026-08-26）

| ID | Priority | Area | Task | Why | Evidence | Status | Completion Criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ~~`SCHEMA-01`~~ | `P2` | Schema / DX | `activity_logs` canonical 定義與實際資料庫不一致 | canonical（`db/db_schema.sql`、`bootstrapModel.js`）寫 `id BIGSERIAL`、`target_id` 與 `created_at` 可為 NULL、未記載 `actor_id` FK；**兩個實際資料庫都不是那樣**（`id TEXT` UUID、三欄皆 NOT NULL、有 FK）。`CREATE TABLE IF NOT EXISTS` 不修正既存表 → **新環境與所有既有環境 schema 不同，而兩邊都「看起來正常」** | `information_schema.columns` 於 `teaching_platform`（944 列）與 `teaching_platform_security_test`（4655 列）**兩邊實測完全一致**；無 sequence；`getLogById` 早已用 `id::text` 比對 | ✅ **DONE**（2026-08-26，Wave 2 #7）—— **canonical 對齊實況（TEXT UUID）**，理由：轉 BIGSERIAL 會改寫既有稽核列 identity（違反 `CLAUDE.md` §4.4）、UUID 是本 repo PK 慣例、API 契約早已字串化、跨環境可攜。migration 對兩個實際 DB 為 **no-op（內容指紋逐位元不變）**，並涵蓋 BIGSERIAL 環境的無損升級路徑；`bootstrapModel.verifyCriticalSchema()` 新增 **fail-closed drift 檢查**；唯一真正誤用 `ORDER BY id` 之處（`reportCases.db.test.js`）已改為 `created_at`；`writeActivityLog` 的 `targetId` 改為必填（DB 早已 NOT NULL）。DB 312/312、unit 175/175、smoke exit 0。詳見 §2.3 | （已達成）canonical／既有 DB／bootstrap／queries／tests 四者一致 |
| `SCHEMA-02` | `P3` | Audit / Schema | `activity_logs.actor_id` 的 `ON DELETE SET NULL` 與「不改寫歷史稽核」有張力 | 刪除使用者會把該使用者的**所有歷史稽核列**的 `actor_id` 靜默改為 NULL，等於抹掉「誰做的」——`CLAUDE.md` §4.4 明文要求不得改寫歷史 `activity_logs`。**目前風險低**：repo **沒有任何 production 刪除使用者的路徑**（`DELETE FROM users` 僅出現在測試與維運腳本，admin 無 delete 端點），因此只有人工維運或測試清理會觸發 | `pg_constraint` 實測 `activity_logs_actor_id_fkey ... ON DELETE SET NULL`（兩個 DB 皆同）；`grep router.delete Backend/routes/admin.js` 無結果；`DELETE FROM users` 在 production code 0 命中 | **OPEN** | 決定使用者刪除政策（軟刪除／`ON DELETE RESTRICT`／保留 actor 快照文字），並與個資法 §11 III 的刪除義務調和。**本輪刻意未動** —— 那是刪除政策決定，不是 schema drift |
| ~~`SCHEMA-03`~~ | `P2` | Schema / Legal Consent | **`legal_documents` 缺少 re-consent enforcement metadata** —— 新增 `requires_reconsent BOOLEAN NOT NULL` 並接上 publish flow 與稽核 | 系統目前**無法記錄「這一版是否要求既有使用者重新同意」**。`consent_records.context_type` 雖允許 `reconsent`（記錄「這筆同意是透過重新同意流程產生」），但**沒有任何地方記錄哪一版要求它** —— 亦即 re-consent 無法被強制、也無法被稽核。這是 Gate 5 consent activation 的**上游缺口**：沒有這個旗標，發布新版時只有兩種行為（全部強制重新同意，或全部不要求），兩者都與 Terms §17.2 已載明的原則不符 | 全 repo grep `requires_reconsent` / `change_classification` → **0 hit**（`db/db_schema.sql`、`Backend/`、`frontend/`）；`reconsent` 僅出現於 `db_schema.sql:896`／`903` 與 `consent.service.js:40` 作為 `context_type` 允許值；`legal_documents` 欄位清單（`db_schema.sql:939-985`）無任何對應欄位；`legal_documents` 實查 **0 列** → 新增欄位無 backfill 問題 | ✅ **DONE**（2026-08-27）—— migration `20260827b_legal_document_requires_reconsent.sql`：**兩個資料庫實測皆 0 列 → 明確無 backfill**，內建 row-count assertion（非 0 列直接中止並說明「替既有列挑值＝隱藏 default」，已實測會 abort 且 ROLLBACK 無殘留），重跑為 no-op（實測 NOTICE `already present`）。欄位 `boolean / is_nullable=NO / column_default=null`（兩個 DB 實查）。**`trg_legal_documents_immutable` 是顯式欄位白名單，不會自動涵蓋新欄位** —— 已同步加入 migration 與 `bootstrapModel.js`。`verifyCriticalSchema()` 擴充為同時驗**型別＋NOT NULL＋無 DEFAULT**，三種 drift（nullable／有 DEFAULT／欄位不存在）皆實測可偵測（transaction 內驗證後 ROLLBACK）。service 層 `validateRequiresReconsent()` **只接受真正 boolean**，publish **即使草稿已有值仍必須再次顯式提供**且覆寫之。稽核 meta 帶 `requiresReconsent`，**不含任何法律理由欄位**。db test 32 case（新檔）＋ 既有 `legalDocuments.db.test.js` 13/13 無 regression；**DB 432/432、unit 213/213、smoke exit 0**。**未發布任何法律文件、未寫入任何 `consent_records`、Gate 5 維持 NOT ACTIVATED。** 詳見 §2.3 | **Completion Criteria：** (1) migration 新增 `legal_documents.requires_reconsent BOOLEAN NOT NULL`，並同步 `db/db_schema.sql` 與 `bootstrapModel.js`；(2) publish flow **必須顯式傳入** true／false —— **不得有會掩蓋決策的 implicit default**（未傳入應失敗，不得靜默填值）；(3) 發布後不可改寫，由既有 `trg_legal_documents_immutable` 涵蓋並以測試證明；(4) 設定者／設定時間／理由寫入 `activity_logs`（理由**不入欄位**）；(5) 欄位語意在 canonical doc 明文為 **production enforcement metadata，非法律上「重大變更」之認定**；(6) targeted db tests ＋ smoke 全綠；(7) canonical doc（`mvp_rules.md` §12.3c，已先行記載決定）與 tracker evidence 更新。**Dependency：** 不阻擋於任何外部審閱 —— 欄位形狀本身不需律師意見；但**「什麼變更該設為 true」與「誰有權設定」維持 `DEC-LEGAL-01` LAWYER REVIEW REQUIRED**，本項不得順帶回答。**不得**因本項完成而啟用 production consent wiring（那是 Gate 5，另有依賴） |
| `OPS-01` | `P2` | Operations | 179 筆 legacy `pending_payment` 訂單需要一次性營運處置決定 | 付款期限政策（7 個日曆日）自 2026-08-26 生效，但**只對新訂單**。既有 179 筆 `pending_payment` 訂單的 `payment_due_at` 一律為 NULL（**刻意不 backfill** —— 它們建立時買家沒有被揭露過任何期限），因此系統既不會判定它們逾期、也不會處置它們。這是**營運決策**不是工程缺口，但放著不決定會讓 Admin 佇列永遠帶著一批不會消失的訂單 | **分類實測（`teaching_platform_security_test`，2026-08-26）**：A. `pending_payment` 且 `payment_due_at IS NULL` = **179**；B. 其中已提交付款資訊 = **26**；C. 其中尚未提交 = **153**；D. 已有憑證列（可能有付款證據）= **167**；E. 建立超過 30 天 = **50**（超過 7 天 = 64）；憑證仍 `pending` 待審 = **35**；建立時間範圍 2026-04-16 → 2026-08-26 | **OPEN** | 產品／營運拍板下列各項的處置：(1) B/D 類（有付款證據）**必須先人工核帳**，不得逕行取消；(2) C 類（無任何證據且已很久）可考慮通知後失效，但**需先決定是否通知、如何通知**；(3) 是否為 legacy 訂單補一段「自即日起 N 日內完成付款」的**新揭露**（那是新的承諾，不是 backfill）；(4) 是否引入 `orders.status = 'expired'`。**本輪只產出分類報告，未做任何自動處置**  **（2026-08-27，Wave 2 #12 補充）** enforcement 上線後這 179 筆的實際處境已確定：`payment_due_at IS NULL` → **豁免、可繼續提交付款憑證、不會被判定逾期**。因此本項**不是**「這些訂單會被系統擋住」的緊急問題，而仍然是一次性營運處置決定。  **（2026-08-31 Owner Decision Round 2 — 決策資料已備妥，Status 改為 `OPEN — READY FOR OWNER DECISION`；本輪未修改任何 legacy 訂單。詳見 `docs/owner-decision-packet-2026-08-31.md` §3。）** 新增三項實測證據：**(1) 母體已證明封閉，不會再增加** —— 最後一筆無期限訂單為 `2026-08-26T15:12:16Z`、第一筆有期限訂單為 `2026-08-26T15:42:38Z`，切換後建立的訂單**全部**帶期限，母體只會縮小不會成長。**(2) 179 這個數字是測試資料庫的數字，且其中 129 筆是 2026-08 本月測試跑出來的**（近 7 日就新增 47 筆）；真正政策生效前很久就存在的世代是 **50 筆**（dev 48 筆），與本列原記錄的「建立超過 30 天 = 50」一致。**`teaching_platform` 與 `teaching_platform_security_test` 都不是 production；目前不存在 production 資料庫（`PRE-01` 未決）**，因此本項的實際規模取決於一個尚未回答的 Owner 事實：**production 是從空資料庫開始，還是要匯入現有資料？**若從空庫開始，上線當天 legacy `pending_payment` = 0。**(3) 無 entitlement／下載後果（已驗證）** —— 這些訂單的 `order_items.entitlement_status` 雖為 `active`，但交付授權要求 `orders.status='approved'` **AND** `entitlement_status='active'`（`Backend/services/materialFile.service.js:428-430`），`entitlement_status` 是與 `orders.status` 正交的維度，**未發現任何繞過付款取得商品的路徑**。  **【2026-08-31 CLOSED — NOT AN MVP LAUNCH BLOCKER（`DEC-15`）】** Owner 已拍板 production **從全新空資料庫開始**，因此 **production legacy `pending_payment` ＝ 0，母體由設計上就不存在**，本項不再是 MVP launch blocker。**未做任何資料處置** —— 明確**不**遷移、**不**回填期限、**不**判逾期、**不**關閉、**不**以任何方式修改 dev／test 的 legacy 母體；`teaching_platform` 與 `teaching_platform_security_test` 維持為開發／測試環境，內容原狀保留。**未制定任何對消費者的 legacy 訂單政策** —— 原 Completion Criteria (1)～(4) 因母體不存在而失去適用對象，**未被縮小或刪除，只是無適用情境**；其中 (3)「補一段新的付款期限揭露」原先標註的 `BLOCKED BY PRE-03 / P1-09` 亦因此**不再被觸發**。 |
| ~~`W2-10`~~ | `P2` | Frontend / Gate 3 | **Buyer + Admin Complaint UI** —— 把 Wave 2 #6 的 complaint backend 接到真實 user-facing flow | Wave 2 #6 完成 backend 後，`grep -rn "complaints" frontend/apps/web` **零命中** —— 買家沒有任何地方提得出申訴、Admin 沒有任何地方看得到申訴。Gate 3 的 `N1` 欄位、`N2` SLA、`N3` 證據全部只存在於 API，對使用者等於不存在 | 實作前實測：前端 complaint UI 0 檔案、0 路由；`docs/pending-work-tracker.md:711` 記載本項為「候選、尚未排序」 | ✅ **DONE**（2026-08-27，Wave 2 #10）—— Buyer 三頁 ＋ 訂單入口 ＋ Admin 佇列/詳情；**無 frontend-only 狀態**（法定期限與逾期一律讀 backend）；db test 8 case ＋ E2E 15 case（desktop/mobile 各 15/15）＋ HTTP 實測 ＋ 真實瀏覽器驗證；smoke exit 0、verify:web 全綠。詳見 §2.3 | **Completion Criteria（本輪正式定義，以現有 backend 能力為邊界）：** (1) Buyer 可從訂單 context 發起申訴，且 `orderId` 確實帶入；(2) Buyer 可看到自己的申訴清單與詳情（狀態、法定期限、歷程、證據、處理結果）；(3) Admin 可看到待處理佇列並可依狀態／逾期篩選；(4) Admin 可進入 detail 並看到買家看不到的 `internal_note`；(5) Admin 可執行 backend 已支援的處理 action（transition ＋ link-remedy-case），**不新增 backend feature**；(6) UI 全部使用現有 complaint API 的 canonical state，**不得建立 frontend-only 狀態**；(7) loading／empty／error／permission／terminal 五態齊備；(8) 驗證 Buyer ownership、Admin authorization、non-owner 不可讀取他人 complaint；(9) targeted tests ＋ HTTP verification ＋ browser/E2E ＋ `verify:web` 全綠；(10) tracker evidence 已更新 |
| ~~`W2-11`~~ | `P2` | Frontend / Gate 3 | **Complaint SLA Overdue Alert / Escalation** —— 逾期申訴的第一個正式 delivery channel（站內 Admin attention surface） | Wave 2 #10 讓 Admin **能夠**看申訴，但要先想到去看。消保法 §43 II 的十五日期限超過時，系統**沒有任何主動告知** —— backend 早就有 canonical `overdue` / `daysUntilDue` 與 `?overdue=1`，但**沒有任何 surface 能算出「現在有幾件逾期」**（`/admin/dashboard/summary` 完全不含 complaints） | 實作前實測：`adminDashboard.service.js` 的 7 個 count 查詢無一與 complaints 相關；`/admin` dashboard 無任何申訴資訊；`complaintSla.js:158-162` 的 `isOverdue` 已正確排除 terminal | ✅ **DONE**（2026-08-27，Wave 2 #11）—— 單一判準 `OVERDUE_SQL` ＋ `countOverdue()` ＋ dashboard `overdueComplaintsCount` ＋ 告警區塊（有逾期才顯示）＋ deep link ＋ 佇列／詳情逾期呈現；**backend overdue policy 完全未改**（既有語意已正確，只是沒有 consumer）；db 9 case ＋ E2E 8 case ＋ HTTP ＋ 真實瀏覽器驗證（2→1→0 的完整回合）。詳見 §2.3 | **Completion Criteria（本輪正式定義）：** (1) Admin 可在主要後台 surface 看見 overdue complaint attention；(2) attention count／state 來自 backend canonical overdue truth；(3) 可直接進入 overdue filtered complaint queue；(4) queue／detail 清楚呈現 overdue ＋ canonical deadline；(5) terminal complaints 不造成 actionable overdue alert；(6) frontend 不自行重算 SLA／overdue；(7) targeted backend／frontend tests green；(8) HTTP canonical state transition verification green；(9) desktop ＋ mobile browser verification green；(10) `verify:web` green；(11) tracker／canonical evidence updated |
| ~~`W2-12`~~ | `P2` | Backend + Frontend / Gate 6 | **Payment Overdue Enforcement** —— `orders.payment_due_at` 從「只是顯示」變成真正的寫入閘門 | Wave 2 #9 落地了 7 個日曆日的付款期限並對買家揭露，但**沒有任何 enforcement** —— 期限只是一個被顯示出來的日期。逾期訂單仍可正常提交付款憑證並被核准，等於平台對買家做了一個自己不執行的承諾 | 實作前 HTTP 實測（`teaching_platform_security_test`）：把 `payment_due_at` 推到 3 天前後，`POST /orders/:id/payment-proof` 與 legacy `POST /orders/:id/upload-proof` **兩條路都回 201**、憑證確實落地、`payment_info_submitted_at` 與 `review_due_at` 被寫入，且該逾期訂單隨後仍能被 Admin 核准為 `approved` | ✅ **DONE**（2026-08-27，Wave 2 #12）—— **Option A + A2**：期限治理「第一次有效提交」，逾期且從未提交 → `409 payment_deadline_expired` 且**無 partial write**；期限內提交過者**不因平台審核時間失去補件權**；**未新增 `expired` status／排程／自動狀態轉移**；單一 canonical predicate 於 `utils/paymentTimingPolicy.js`；db 14 case ＋ E2E 9 case（desktop/mobile 各 9/9）＋ HTTP 8/8 情境實測；DB 361/361、unit 195/195、smoke exit 0、verify:web 全綠。詳見 §2.3 | **Completion Criteria（本輪正式定義）：** (1) 逾期且從未在期限內提交過的訂單，付款憑證提交被拒且回應為**確定性錯誤碼**；(2) 拒絕時**不產生任何 partial write**（無憑證列、不動 `payment_info_submitted_at`／`review_due_at`／`orders.status`、private storage 不留檔）；(3) **A2**：曾在期限內提交過者，即使期限已過仍可補件／重傳；(4) 期限內提交、仍在審核中的訂單完全不受影響，Admin 可在期限後正常核准；(5) legacy `payment_due_at IS NULL` 一律豁免且**不 backfill**；(6) enforcement 位於**唯一寫入閘門**，legacy route 無法繞過；(7) **授權先於期限** —— non-owner 不得因 deadline 錯誤得知訂單存在與否；(8) Buyer 與 Admin 都能看到期限／逾期／可否提交，且**由 backend 推導、前端不自算**；(9) **未新增** `orders.status = 'expired'`、排程／cron、自動 DB 狀態轉移、Admin 延期／reopen／bypass、通知管道；(10) targeted tests ＋ HTTP verification ＋ desktop/mobile browser verification ＋ smoke ＋ `verify:web` 全綠；(11) canonical doc（`mvp_rules.md` §12.3a.3）與 tracker evidence 已更新 |
| ~~`W2-13`~~ | `P2` | Backend + Frontend / Gate 4 | **Complaint Evidence Retrieval / Delivery** —— 把 write-only 的申訴證據變成真正讀得到的證據 | Wave 2 #6 把上傳鏈做完了，但 repo 裡**沒有任何路徑能把證據位元組取回來** —— Buyer 與 Admin 的 UI 都只把附件渲染成純文字 `📎 檔名`。結果是 Admin 裁決付款爭議時只剩平台自己的紀錄可看，**恰好是 `R7`（限以企業經營者保存之資料認定）要被 `N3` 打破的狀態** | 實作前實測：repo 全域搜尋 evidence 檔案交付端點 **0 命中**；`consumerComplaint.service.js:511` 的 `listEvidence` 只回 `has_file` boolean；`app/me/complaints/[id]/page.tsx:233` 與 `app/admin/complaints/page.tsx:431` 皆為純文字 `` `📎 ${ev.original_filename}` ``，**不是連結、無 onClick** | ✅ **DONE**（2026-08-27，Wave 2 #13）—— Buyer/Admin 兩條路由共用單一 `resolveEvidenceForAccess()`；ownership 取自 `consumer_complaints.buyer_id`（**非** `orders.user_id`，申訴可無 orderId）；IDOR 同時綁 `id`＋`complaint_id`（Admin 不豁免）；五個確定性錯誤碼；沿用 `fileDownloadResponse`（no-store ＋ nosniff）與 authenticated blob fetch；db 15 case ＋ E2E 9 case（desktop/mobile 各 9/9）＋ **HTTP 18/18** ＋ 真實瀏覽器（Buyer/Admin 皆解出真實影像）；DB 376/376、unit 195/195、smoke exit 0、verify:web 全綠。**Gate 4 維持 `PARTIAL`**（PDF 未決，見 `PROD-01`）。詳見 §2.3 | **Completion Criteria（本輪正式定義）：** (1) Buyer 擁有者可 authenticated 讀取自己申訴的證據；(2) Admin 可讀取；(3) anonymous 拒絕；(4) 非擁有者拒絕且取不到位元組；(5) complaint/evidence IDOR 綁定正確且 Admin 不豁免；(6) `storage_key`／checksum／檔案系統路徑不外洩（API／DOM／log／稽核 meta 皆是）；(7) `private, no-store` ＋ `nosniff` ＋ 正確 `Content-Type`／`Content-Disposition`；(8) inline 為預設、`?download=1` 為 attachment 且**只有下載才寫稽核**；(9) Buyer UI 可真正開啟；(10) Admin UI 可真正開啟；(11) 實體檔案遺失／畸形 key 為確定性安全失敗（503，不 crash、不洩漏路徑）；(12) **MIME 政策未擅自擴張**（仍只有 JPEG/PNG/WebP）；(13) 共用 private-file helper 無 regression（payment-proof 交付）；(14) HTTP 全鏈 ＋ desktop/mobile E2E ＋ smoke ＋ `verify:web` 全綠；(15) Gate 4 canonical criteria 已重新逐條評估；(16) canonical doc 與 tracker evidence 已更新 |
| ~~`H-1`~~ | `P1` | Frontend / Legal-adjacent copy | **買家端「永久下載」無條件承諾移除** —— 平台在 buyer-facing 介面承諾了一個**無保留期限、無服務終止條款支撐**的永久下載權利 | 該承諾在沒有正式條款、沒有保存年限（`RM-15`／`T-14`／`L-21` 皆 `PENDING`）、且平台服務終止計畫（Gate 10）尚未存在的情況下做出，等於對買家做出一個平台無法保證履行的無條件承諾 | 2026-08-27 實測：`grep -rn '永久下載／終身下載／不限期下載／不限次數下載／permanent download／lifetime download'（alternation）frontend/apps/web/{app,components,lib}` → **0 命中**；已核准的 neutral copy 就位於兩個原始承諾點 —— `app/checkout/page.tsx:531`「✔ 完成付款審核後即可下載教材」與 `components/materials/detail/MaterialDetailPurchasePanel.tsx:168`「安全交易 · 完成付款審核後即可下載教材」 | ✅ **DONE**（2026-08-27，平行 P1-09 session）—— 兩個修改點皆已驗證存在。**注意：`P1-09` 本身仍為 `OPEN`** —— 移除一個過度承諾不等於完成條款／隱私權／著作權同意 | **Completion Criteria：** (1) buyer-facing production source 無任何永久／終身／不限期下載措辭；(2) 兩個原始承諾點改為已核准 neutral copy；(3) 不新增任何未經核可的法律語句 |
| `H-4` | `P2` | Legal / Privacy（個資法） | **資料主體權利（查看／更正／刪除／匯出／撤回同意）無任何實作** | 個資法賦予當事人查詢閱覽、製給複製本、補充更正、停止蒐集處理利用、刪除等權利。平台目前**五項全缺**，且沒有任何受理管道 | repo 無 data-subject-request 端點、無自助介面、無人工受理流程紀錄；`consent_records` 雖有 `supersede()` 但**未接線任何流程**（0 列、0 route 引用），因此「撤回同意」在系統層面無從執行 | **OPEN** —— Owner decision `LEGAL-DEC-05 = C`：Phase 1 **自助**提供「查看」「更正」，**人工／後續**處理「刪除」「匯出」「撤回同意」 | **Completion Criteria：** (1) 查看／更正為自助且僅限本人；(2) 匯出、刪除、撤回同意至少有明確的受理管道與處理紀錄；(3) **刪除語意 blocked on retention / legal hold** —— 在保存年限（`RM-15`／`T-14`／`L-21`）與 `legal_hold` 的關係定案前，**不得自行 hard delete、不得假設任何保存期限**；(4) 撤回同意需先有 Gate 5 的正式流程接線；(5) 對外文案待律師（`L-17`） |
| ~~`DEC-06`~~ | `P3` | Frontend / Privacy minimisation | **停止在註冊表單蒐集 `name`** | 註冊表單向使用者要了姓名，但那個值**從未離開瀏覽器** —— 蒐集了不使用、也不保存的個資，是不必要的個資範圍擴大 | 已驗證：`name` 在註冊 UI 蒐集 → **不送 backend** → **DB 不保存** → 僅寫入 localStorage 的 `tp_display_name`；Sidebar 已有 fallback 鏈 `tp_display_name → email local-part → 使用者`，移除後仍有可顯示的名稱。Dependency audit：**SAFE TO REMOVE** | ✅ **DONE**（2026-08-27）—— Owner decision `DEC-06 = A`，Round 2 再次 CONFIRM 後於同日實作完成。**移除項目：** `app/register/page.tsx` 的姓名 `<input id="reg-name">` ＋ 其 `<label>`、zod 規則 `name: z.string().min(1, "請輸入姓名")`、`useState` 表單狀態、`safeParse` 入參，以及 `localStorage.setItem("tp_display_name", name)` 寫入；連帶移除因此不再被引用的 `UserIcon`（否則 lint／typecheck 會紅）。**backend 與 schema 零改動** —— 實查確認 `POST /auth/register` 自始只接受 `email`／`password`／`role`，`users` 表無 `name` 欄位，**沒有欄位可移除**。**未建立任何替代蒐集**：無暱稱、無 display_name 欄位、不由 Email 推導、無替代 localStorage key。**`tp_display_name` writer 實查歸零**（全 frontend grep `setItem("tp_display_name"` → 0 命中）；唯一 reader 位於 `components/dashboard/Sidebar.tsx`，而該檔**目前沒有任何 importer**（未掛載），已標為 `legacy read only — no active writer remains`；`lib/session.ts` 的登出清除**刻意保留**（legacy cleanup，讓既有瀏覽器舊值退場，**不是** active collection）。**驗證：** `verify:web` exit 0（lint＋typecheck＋build）／`public.spec.ts` **7/7**（含新增的兩個 DEC-06 斷言步驟：表單無姓名欄位、空表單首個錯誤改為 Email、成功註冊之 payload key 恰為 `email`＋`password`＋`role` 且不含 `name`／`displayName`、成功後 `tp_display_name` 為 `null` 且無任何含 `name` 的替代 key）／`session-expiry.spec.ts` **19/19**（登出仍清除 legacy key）／`critical-acceptance.spec.ts` **18/18**／smoke exit 0。**首次執行時 `public.spec.ts` 有 3 支失敗，經查為 Backend 未啟動（`connect ECONNREFUSED ::1:3000`）之環境問題，非本輪 regression** —— 啟動 Backend 後同一支檔案 7/7 全綠（失敗點在 `public.spec.ts:44` 的角色導向步驟，與註冊無關） | **Completion Criteria：** (1) 註冊表單移除 `name` 欄位；(2) 顯示名稱 fallback 鏈仍正確（不得出現空白或 `undefined`）；(3) 不新增任何 backend 或 schema 變更（**已確認無 `users.name` 欄位可移除**）；(4) 移除註冊流程的 `tp_display_name` 寫入；(5) **不得**為了保留姓名顯示而建立任何新的姓名蒐集機制；(6) `privacy-policy.draft.md` §2.1 的現況揭露同步縮小。**刻意與 Legal copy implementation 分開立案**，避免混入 `P1-09` 的法律工作 |
| ~~`DEC-08`~~ | `P3` | Frontend / Privacy minimisation | **移除未被使用的 local analytics 蒐集（`tp_analytics_events`）** | 平台在 localStorage 累積使用者行為事件，但**沒有任何消費端** —— 蒐集了永遠不會被讀取的行為資料，同樣是不必要的個資範圍擴大 | 已驗證為 **write-only localStorage sink**：producer 有事件寫入，consumer **0** —— 無 dashboard／Admin reporting／Creator reporting／experiments／telemetry backend／第三方 analytics。Dependency audit：**SAFE TO REMOVE** | ✅ **DONE**（2026-08-27）—— Owner decision `DEC-08 = A`，Round 2 再次 CONFIRM 後於同日實作完成。**刪除 `frontend/apps/web/lib/analytics.ts` 整個模組**（唯一職責就是這套 local event logging，consumer 為 0，**不留 dead wrapper**）＋**移除全部 5 個 producer**：`checkout/page.tsx` 的 `promo_apply_clicked`／`promo_applied`／`order_submit_clicked`，`orders/[orderId]/payment-proof/page.tsx` 的 `proof_upload_clicked`／`proof_uploaded`，連同兩個 import。**business behavior 零改動** —— 只刪除獨立的 `trackEvent(...)` 陳述式，promo 套用、下單、憑證上傳的流程與狀態完全未動。順帶消除模組內的 `console.info("[analytics]", …)` 副作用。**未建立任何替代蒐集**：無新 localStorage key、未改 sessionStorage／IndexedDB／cookie、未改送 backend、未引入任何第三方 analytics SDK。**legacy cleanup：** `tp_analytics_events` 已加入 `lib/session.ts` 的 `SESSION_STORAGE_KEYS`，登出時 `removeItem` 清掉既有瀏覽器殘留值 —— 這是**清除**不是蒐集（active writer 仍為 0）。**backend `activity_logs` 完全未動**（本輪未修改任何 `Backend/` 或 `db/` 檔案，已以 mtime 掃描確認）—— `DEC-08` 移除的是 browser-local 行為事件蒐集，**不是**「平台不再有事件／稽核記錄」。**驗證：** 新增 `tests/e2e/analytics-removal.spec.ts`（4 case 的 source-level guardrail：writer=0、模組與 `trackEvent` 不存在、無替代儲存／無 network egress／無第三方 SDK、登出仍清除 legacy key；並斷言掃描檔數 > 50 以免掃不到檔案時假性通過）；`analytics-removal` ＋ `session-expiry` **23/23**（session-expiry fixture 已加入 `tp_analytics_events` 並驗證被清除）／`checkout-feedback` **3/3**／`payment-deadline-enforcement` ＋ `payment-proof-security` ＋ `parent` **18/18**／`critical-acceptance` **18/18**／`verify:web` exit 0／smoke exit 0。E2E 前已先啟動 Backend，避免 `ECONNREFUSED` 被誤判為 regression | **Completion Criteria：** (1) 移除事件寫入與 `tp_analytics_events` 儲存；(2) 確認移除後無任何讀取端損壞（既有 consumer 為 0）；(3) 若日後真的需要分析，另行以正式的 telemetry 決策立案；(4) **不得**因本項移除或弱化 backend `activity_logs`（server-side audit trail 與 client-side local analytics 是兩件事）；(5) `privacy-policy.draft.md` §2.7 同步刪除 |
| ~~`BUY-02`~~ | `P2` | Frontend / Gate 3 · IA | **全域申訴入口（global complaint entry）** —— 讓使用者不必先進入特定訂單頁也找得到申訴功能 | 申訴功能目前的**唯一**入口是 `/me/orders/[orderId]`，但平台在**四處**告訴使用者「請聯繫客服」，而那個管道並不存在。最嚴重的一處是**帳號凍結回應訊息** —— 該使用者依定義已無法交易，卻最可能需要申訴。未登入使用者完全沒有任何入口，且平台**沒有密碼重設功能**（Terms §2.4） | 實測（2026-08-27）：`grep me/complaints` 於 buyer UI 僅命中 `app/me/orders/[orderId]/page.tsx:169,176`；`RoleShell` 的 buyer（`parent`）與 guest nav 皆無申訴項目；repo **無 footer 元件**；dead 文案四處：`checkout/page.tsx:93`、`checkout/page.tsx:327`、`components/payment/BankTransferInfo.tsx:35`、`Backend/middlewares/accountStatus.js:40`（凍結回應）；complaint 端點**全部** `requireAuth` | ✅ **DONE**（2026-08-27）—— **全域入口放在買家外殼既有的「其他」次要區塊**（`components/dashboard/sidebar-nav-config.ts` 的 `SIDEBAR_NAV_SECTIONS`），文案「**申訴與消費爭議**」→ `/me/complaints`，**有文字標籤（非 icon-only）、有 link 語意、可鍵盤操作**。**未新建 Footer、未重構 buyer navigation、未新建客服中心** —— 買家外殼本來就有這個層級。**order-context CTA 完整保留**：訂單詳情頁的 `order-complaint-link` 仍帶 `orderId`，那是全域入口做不到的事（`DEC-LEGAL-09` 明訂兩者並存）。**登出誠實性**：complaint 端點全部 `requireAuth`，故未對 guest 廣告此功能；`/me` 已在 middleware 的 `LOGIN_REQUIRED_PREFIXES` 中，guest 造訪 `/me/complaints` 會被導向 `/login?redirect=%2Fme%2Fcomplaints`（**沿用既有 redirect 機制，未發明新系統**），**未新增任何匿名申訴能力**。**四處 dead 「客服」文案逐一依 context 處理，未機械式全部換成同一個連結**：(1)(3) 結帳與 `BankTransferInfo` 的收款帳戶未設定 —— 那是**平台端設定缺失**且通常連訂單都不存在，改為誠實等待指示（「請先不要匯款，稍後再試」），**不導向申訴**；(2) 結帳持續性失敗（已登入）→ 改為指向 `/me/complaints` 的真實連結；(4) **`Backend/middlewares/accountStatus.js` 的凍結回應** → 改為指向「申訴與消費爭議」。第 (4) 項之所以誠實，是因為 `routes/complaints.js` **刻意不套 `requireActiveAccount`** —— 凍結帳號仍可登入、讀取並提出申訴；此不變條件已寫入 `mvp_rules.md` §12.2a 並由測試釘住。**未把 privacy email（`DEC-LEGAL-07`）當作消費爭議管道**，**未新增任何主管機關名稱／電話／地址／網址／法定期限**（`L-17` 維持 external validation required）。**驗證：** 新增 `tests/e2e/complaint-global-entry.spec.ts`（6 case：全域入口可達 landing、order-context CTA 保留且仍帶 orderId、登出導向登入且不出現「匿名」、四處死文案已reconcile 且使用者可見文案不再有「客服」、凍結文案與 `requireActiveAccount` 缺席一致、無 email 與無機關事實）；complaint 三支 E2E **32/32**、`parent`＋`checkout-feedback`＋`buyer-order-progress`＋`shell-consistency` **42/43**、`critical-acceptance` **18/18**、`verify:web` exit 0、DB **432/432**、unit **213/213**、smoke exit 0。**唯一失敗為 `shell-consistency.spec.ts:228`（admin 側欄寬度，strict-mode 解到 2 個 admin sidebar）——跨檔次序 flake，非本輪 regression**：該檔單獨執行 **31/31** 全綠，且本輪改動的 `sidebar-nav-config.ts` 只餵買家 `Sidebar`，admin 側欄用的是 `lib/admin-nav.ts`，兩者無交集。**附帶記錄（本輪未處理）：** `components/dashboard/FloatingHelpButton.tsx` 是 icon-only 且指向 `#help` 死錨點；`sidebar-nav-config.ts` 的「通知設定」指向 `#notifications` 亦為死錨點。兩者皆非本輪四處 dead copy 之一，且修它們等於動 Help Center／通知設定，**刻意未擴 scope** | **Completion Criteria：** (1) 新增一個全域、易找到的「申訴／消費爭議」入口，位置由 implementation round **先盤點現有 IA** 後決定；(2) **保留**既有 order-context CTA（它帶 `orderId`，全域入口無法取代）；(3) 需登入才能建立案件時，UI **誠實顯示「登入後提出申訴」**，**不得**呈現為已支援匿名申訴；(4) 四處 dead 「客服」文案改為指向真實存在的 destination；(5) **不得**把 privacy email（`DEC-LEGAL-07`）當作一般消費爭議管道；(6) **不填入任何主管機關名稱、電話、地址或外部申訴資訊**（`L-17` 仍 blocked）；(7) **若目前沒有 Footer，不得為此建立大型 Footer** —— 採最小實作；(8) `verify:web` 全綠。**Dependency：** backend complaint 能力已存在，本項純為 frontend／IA；`L-17` 內容不阻擋版位實作 |
| ~~`BUY-03`~~ | ~~`P1`~~ ✅ | Buyer / Product · UI Honesty | **Floating Help affordance 指向不存在的 destination** —— 買家外殼的每一頁都渲染一顆可操作的「幫助中心」浮動按鈕，但它沒有 target、沒有 route、也沒有任何 help／support capability | Buyer shell 中存在**可操作**的 Floating Help affordance，但 `href="#help"` 沒有對應 target、route 或真實 capability，形成 **dead interaction / false affordance**：點擊後只會在 URL 後面多一個 hash，畫面無任何反應。它是 `fixed bottom-6 right-6 z-30`，**每一個買家頁面都常駐可見**，曝光面比 `IA-07`（僅 Admin 主導覽的兩個 placeholder）更大。平台自身文件亦已承認沒有這條管道：`app/login/page.tsx:185-186` 明載「repo 裡雖然有多處文案提到『平台客服』，但整個 codebase 沒有任何真實的客服 Email、網址或聯絡頁」；`BUY-02` 更刻意不用「客服」字樣（`sidebar-nav-config.ts:88`「平台**沒有**客服系統」）。這顆標示為「幫助中心」的按鈕與那條已確立的誠實路線直接矛盾 | `components/dashboard/FloatingHelpButton.tsx:13` `href="#help"`；同檔 `:16-17` `aria-label`／`title` 皆為「幫助中心」。由 `components/dashboard/ParentAppShell.tsx:135` **無條件**渲染（無 flag、無條件式），涵蓋 `app/(parent)/*`（`dashboard`／`explore`）與 `RoleShell.tsx:293` 的 10 條買家路由（`/materials`／`/cart`／`/checkout`／`/orders`／`/me/orders`／`/downloads`／`/me/materials`／`/my-reviews`／`/favorites`／`/explore`）。**2026-08-28 全 repo 實測：** `id="help"`／`name="help"` = **0 命中**；`app/**` 下 `*help*` route = **0**；`#help` 全 repo = **1**（即該按鈕自己）；`Backend/routes` 下 help／faq／support 端點 = **0**。**首次記錄時間為 2026-08-27**，位於 `BUY-02` 列的「附帶記錄（本輪未處理）」，當時明示「修它們等於動 Help Center／通知設定，**刻意未擴 scope**」—— 該註記**沒有自己的 ID／Priority／Status／Completion Criteria**，且寄生在一列已 DONE 的紀錄裡，任何 active-backlog 掃描都掃不到它；本列即為該觀察的正式立案 | ✅ **DONE**（2026-08-30，經 CC (4) 重新驗證後關閉）—— **狀態歷程（保留，不抹除）：** 2026-08-28 曾一度被標為 `DONE`，隨即**更正為 `OPEN — PARTIAL`** —— 當時 `#help` 的功能實作雖已完成，但 CC (4) 因 `#account` 仍在而未滿足。**CC (4) 自始至終未被縮小、刪除或改寫**，`BUY-05` 的存在當時也未被當成本項已完成的理由。2026-08-30 `BUY-05` 完成後**重新執行完整 anchor audit**，CC (4) 才真正達成，本項於此時關閉。<br>**【已完成的部分 —— `#help` 的功能實作已完整，證據保留】** **採直接移除，不是隱藏**：`components/dashboard/FloatingHelpButton.tsx` **整檔刪除**（移除 `ParentAppShell` 的引用後已無任何其他 consumer），並同步移除 `ParentAppShell.tsx` 的 import 與 render。**沒有**用 `display:none`／feature flag／disabled state／保留不 render 的 dead component —— 那些都會留下一個沒有生產者的元件，正是 `P1-08` 採「方案 B 誠實移除」時避開的形態。**未導向 `/me/complaints`、未建 `/help`、未建 support backend、未新增任何客服 Email、未建 Help Center。**實測歸零：`FloatingHelpButton`／`#help`／`id="help"` 全 repo 命中皆為 **0**。`SIDEBAR_ICON_STROKE` 保留（`Sidebar.tsx` 仍在用，非 unused）。**驗收證據（2026-08-28）：** `npm run verify:web` **全綠**（lint → typecheck → build 三階段皆 exit 0，50 route，產物寫在 `.next-verify`）；新增 `tests/e2e/buyer-shell-dead-affordance.spec.ts`，`E2E_SERVER=production` 下 **4/4 通過**（`chromium-desktop` 2 支 ＋ `chromium-mobile` 2 支，另 4 支為 viewport guard 的正確 skip）。每個 case 都先驗一個**還在的**元素（desktop／mobile 皆驗「申訴與消費爭議」可見、mobile 另驗 topbar「開啟選單」可見）再斷言死錨點不存在 —— 避免整頁沒渲染時「不存在」的斷言安靜通過。<br>**【未完成的部分 —— 本項無法關閉的唯一原因】** **Completion Criteria (4) 未達成。** 該條要求「完成後買家外殼不得再有任何 `href="#..."` dead anchor」，但 2026-08-28 的 dead-anchor audit 確認仍存在**兩處**：`Sidebar.tsx:300`（collapsed rail）與 `Sidebar.tsx:319`（expanded footer），皆為 `<a href="#account">`，全 repo 無 `id="account"`、無 account 路由，desktop 側欄與 mobile drawer 皆會渲染。**CC (4) 維持原文不變** —— 未縮小、未刪除、未改寫。<br>**【關閉條件】** `#help` 的 functional implementation **已完整**；本項剩下的唯一 completion blocker 是 **`BUY-05`**（`#account` dead anchor 的移除）。**`BUY-05` 標 DONE 後，必須回頭重新驗證 `BUY-03` 的 CC (4)**（買家外殼 `href="#..."` 死錨點歸零）**才能判定 `BUY-03` 是否可關閉** —— 不得因為 `BUY-05` 已立案或已完成就自動視為 `BUY-03` 完成。<br>**【CC (4) 重新驗證 —— 2026-08-30，`BUY-05` 完成後執行】** 全 frontend 重新掃描 `href="#`：<br>・`href="#help"` = **0**、`href="#notifications"` = **0**、`href="#account"` = **0**（三者在 `components/`／`app/`／`lib/` 下的 live code 命中皆為 0；`Sidebar.tsx:295` 與本 spec 的剩餘字面是**註解與測試斷言**，非可渲染的 attribute）。<br>・全 frontend 僅存**一個** live `href="#..."`：`MaterialDetailHeroInfo.tsx:28` 的 `#usage-feedback`。**其 target 已重新實測存在**（未沿用上一輪紀錄）：`MaterialDetailBody.tsx:131` `<MaterialDetailSection id="usage-feedback" title="教學回饋">`，且 `MaterialDetailPage.tsx:149` 另有 `getElementById("usage-feedback").scrollIntoView()` 的實際 handler，anchor 本身也 `preventDefault()` 後呼叫該 handler —— 是**合法且可運作的頁內導覽**，非死錨點。<br>・**真實瀏覽器實測**：buyer shell 的四種狀態（desktop 展開／desktop 收合／mobile 關閉抽屜／mobile 開啟抽屜）`a[href^="#"]` **皆為空陣列**。<br>→ **CC (4) 達成**（「買家外殼不得再有任何 `href="#..."` 的死錨點 affordance」），本項關閉。**驗收證據（2026-08-30）：** `npm run verify:web` **全綠**（lint → typecheck → build 皆 exit 0，50 route）；`tests/e2e/buyer-shell-dead-affordance.spec.ts` 擴充為 9 支後 **9/9 通過**（`chromium-desktop` 5 ＋ `chromium-mobile` 4，`E2E_SERVER=production`）；**真實瀏覽器實測**（`npm run dev:web:3010`，以 buyer session 開 `/explore`）四種外殼狀態 —— desktop 展開／desktop 收合／mobile 關閉抽屜／mobile 開啟抽屜 —— `document.querySelectorAll('a[href^="#"]')` **皆為空陣列**，且四種狀態皆無水平溢出。 | **Completion Criteria（capability-first，依序判定）：** (1) **capability 判定已由 Owner 於 `DEC-09` 拍板（2026-08-28）：MVP 現階段沒有真實 help／support capability** → **移除或隱藏該 affordance**。實作時**不需**重新判定，也**不需**再取得 Owner confirmation。（原始的 capability-first 條件保留為判準來源：若未來已有真實且可用的 support destination，才改為導向該 destination。）(2) **不得為了修這顆按鈕自行建立完整 Help Center** —— 不新增 FAQ 頁、客服信箱、工單系統或任何 help capability。(3) **明確不導向 `/me/complaints`（`DEC-09` 已拍板）** —— Help／Support 與 Complaint／Dispute 是不同語意，把一般求助入口導到申訴流程屬於誤導；這正是 `BUY-02` 刻意避開的「客服 ≠ 申訴」混淆（`sidebar-nav-config.ts:88`）。**此點已無裁量空間**，實作者不得自行改採導向。(4) 完成後買家外殼不得再有任何 `href="#..."` 的死錨點 affordance（與 `BUY-04` 一併驗證）。(5) 驗收：`npm run verify:web` 全綠，且 desktop／mobile 各一支 E2E 斷言該 affordance 已不存在、或已指向真實且可達的路由 |
| ~~`BUY-04`~~ | ~~`P1`~~ ✅ | Buyer / Product · UI Honesty | **買家側欄「通知設定」指向不存在的 destination** —— nav item 可點擊，但沒有 route、沒有頁面、也沒有 notification preference capability | Buyer sidebar 的「其他」區塊有一個正式 nav item「通知設定」，`href="#notifications"` 沒有對應 target、route 或真實 capability，形成 **dead interaction / false affordance**。這是 `IA-07` 的**逐點對應**（「誠實的 placeholder，沒有任何 backend capability，卻佔著導覽」），差別在於 `IA-07` 只影響 Admin，本項影響**買家**，且同時出現在 desktop 側欄與 mobile drawer。更直接的矛盾是：它就緊鄰 `BUY-02` 於 2026-08-27 才補上的**真實**項目「申訴與消費爭議」，而 `BUY-02` 的 in-code 註解正是在解釋「為什麼不再指向不存在的管道」。`sidebar-nav-config.ts:104` 的 `isSidebarItemActive()` 還特地寫了 `if (href.startsWith("#")) return false;`，等於把死錨點當成常態納入設計 | `components/dashboard/sidebar-nav-config.ts:97` `{ id: "notifications", href: "#notifications", label: "通知設定", icon: Bell }`。該 `SIDEBAR_NAV_SECTIONS` 由 `components/dashboard/Sidebar.tsx:8-16` 消費，而 `ParentAppShell` 同時渲染 desktop 側欄與 mobile drawer 兩處（`IA-08` 的單一 source of truth）。**2026-08-28 全 repo 實測：** `#notifications` 全 repo = **1**（即該 nav item 自己）；`app/**` 下 `*notif*` route/page = **0**；`db/db_schema.sql` 中 `notification`／`notify`／`preference` = **0 命中**；`Backend/migrations` 無 notification migration；`Backend/{routes,services,models,utils}` 對 `notification` 僅 **2 個檔案**命中且**兩者都是否定陳述** —— `Backend/routes/creatorCases.js:24`「平台沒有 notifications 資料表」、`Backend/services/emailService.js:230`「平台**沒有**站內通知系統，也不打算為了這條流程建一個 notification center」。tracker §15 亦記「沒有 notifications 表」。**首次記錄時間為 2026-08-27**（同 `BUY-03`，`BUY-02` 列的附帶記錄，無 ID／Priority／Status） | ✅ **DONE**（2026-08-28，依 `DEC-10`）—— 從 shared config `sidebar-nav-config.ts` 移除整個 `{ id: "notifications", href: "#notifications", label: "通知設定", icon: Bell }` item，並移除因此 unused 的 `Bell` lucide import（移除後全 repo `Bell` 命中 **0**）。**單一改動點同時作用於 desktop 側欄與 mobile drawer** —— 兩者共用 `SIDEBAR_NAV_SECTIONS`（`IA-08` 的單一 source of truth），且**已由兩個 viewport 的 E2E 各驗一次**，不是只靠實作宣稱。`SIDEBAR_COLLAPSED_SECTIONS` 本來就不含此 item，無需改動。**沒有**留 disabled item／placeholder／replacement item，**也沒有**為了視覺平衡替「其他」區塊補第三個項目 —— 該區塊現在是「申訴與消費爭議」＋「登出」兩項。**未建 notification settings page、未建 preference schema、未建 notification backend。** 實測歸零：`#notifications`／`通知設定` 全 repo 命中皆為 **0**。**驗收證據（2026-08-28）：** `npm run verify:web` **全綠**（lint → typecheck → build 三階段皆 exit 0，50 route，產物寫在 `.next-verify`）；新增 `tests/e2e/buyer-shell-dead-affordance.spec.ts`，`E2E_SERVER=production` 下 **4/4 通過**（`chromium-desktop` 2 支 ＋ `chromium-mobile` 2 支，另 4 支為 viewport guard 的正確 skip）。每個 case 都先驗一個**還在的**元素（desktop／mobile 皆驗「申訴與消費爭議」可見、mobile 另驗 topbar「開啟選單」可見）再斷言死錨點不存在 —— 避免整頁沒渲染時「不存在」的斷言安靜通過。 | **Completion Criteria（capability-first）：** (1) **capability 判定已由 Owner 於 `DEC-10` 拍板（2026-08-28）：MVP 現階段沒有 notification preference capability** → **從 buyer navigation 移除**該 item。買家導覽異動的產品決策**已完成**（對照 `BUY-02` 新增導覽項時走 `DEC-LEGAL-09`，同一 surface 同一規格），實作時**不需**再取得 Owner confirmation。(2) **未來若建立真實的 notification settings capability，再重新加入** —— 本項不預先保留位置、不留 disabled 樣式、不留 tooltip 佔位。(3) **不得為了保留這個 nav item 自行建立 notification system** —— 不新增 `notifications` 表、不新增 notification preference schema、不建站內通知中心；`Backend/services/emailService.js:230` 已明載平台**不打算**為此建 notification center，違反該既定決策需另行提案。(4) 移除必須同時對 **desktop 側欄與 mobile drawer** 生效（兩者共用 `SIDEBAR_NAV_SECTIONS`，符合 `IA-08`）。(5) 若移除後「其他」區塊只剩「申訴與消費爭議」與「登出」，**不得**為了填補視覺空缺而新增任何項目。(6) 驗收：`npm run verify:web` 全綠，且 desktop／mobile 各一支 E2E 斷言買家導覽已無「通知設定」 |
| ~~`BUY-05`~~ | ~~`P1`~~ ✅ | Buyer / Product · UI Honesty | **買家側欄個人資料頁尾指向不存在的 `#account`** —— avatar ＋ 顯示名稱整塊可點，但沒有 target、沒有 route、也沒有帳號設定頁 | 與 `BUY-03`／`BUY-04` **同一缺陷類別**（dead interaction / false affordance），且它是 `BUY-03` Completion Criteria (4)「買家外殼不得再有任何 `href="#..."` 死錨點」**未能達成的唯一原因**。曝光面與 `BUY-04` 相當或更大：它在**側欄頁尾常駐**，collapsed rail 與 expanded 兩種型態各有一個，desktop 側欄與 mobile drawer 皆會渲染。點下去只會在 URL 後面多一個 hash | **2026-08-28 dead-anchor audit 實測**：`Sidebar.tsx:300`（collapsed rail，包在 `NavTooltip label="個人資料"` 內）與 `Sidebar.tsx:319`（expanded footer，avatar ＋ `displayName`）皆為 `<a href="#account">`；全 frontend `id="account"` 命中 **0**、`app/**` 無任何 account／settings 路由。同一次 audit 的另外兩個 `href="#..."` 已分別由 `BUY-03`（`#help`，已移除）與`MaterialDetailHeroInfo.tsx:28`（`#usage-feedback`，**目標存在**於 `MaterialDetailBody.tsx:131`，合法頁內錨點）解釋 | **OPEN — OWNER DECIDED**（立案 2026-08-28；同日 Owner Decision Round 5 拍板 **`DEC-11`**）—— 處置方式已定：**MVP 現階段沒有真實 account／profile destination** → **移除 buyer sidebar／footer 的 `#account` affordance，collapsed rail 與 expanded footer 兩處都移除**。**不建 `/account`、不建 profile／settings page、不用 disabled placeholder 取代、不用其他無關 destination 替代。**若 avatar 本身仍具純識別用途，**可保留非 clickable 的 presentation**，但不得留下假的 interactive affordance。✅ **DONE**（2026-08-30，依 `DEC-11`）—— **採「保留純識別呈現、移除假互動」（`DEC-11` 允許的第二種收尾）**：`Sidebar.tsx` 的 `SidebarProfileFooter` 兩個分支皆由 `<a href="#account">` 改為非互動的 `<div>`。**collapsed rail 與 expanded footer 兩處都處理**。avatar 與顯示名稱**保留**（純識別價值），但承諾性標籤全部移除 —— collapsed 的 `NavTooltip label="個人資料"` 與 expanded 的「個人資料」次行皆刪除。因 `onNavigate` 不再被使用，一併從 `SidebarProfileFooter` 的 props 與呼叫端移除（直接相依清理）。**未導向 `/me`／`/dashboard`／`/settings`，未建 `/account`，未建任何 profile／settings page，未留 disabled placeholder。** `NavTooltip`／`navBtnTone`／`NAV_BTN_BASE`／`NAV_ITEM_SIZE` 皆保留（各有其他 caller，非 unused）。**真實瀏覽器實測**：footer 子元素為 `DIV`、無 `href`、`tabIndex = -1`（不可 keyboard focus）、`cursor: auto`（無 pointer）、`innerHTML` 內無 `<a>`；collapsed 顯示 `P`、expanded／drawer 顯示 `P` ＋ `parent-e2e`。實測歸零：live code `href="#account"` = **0**。**驗收證據（2026-08-30）：** `npm run verify:web` **全綠**（lint → typecheck → build 皆 exit 0，50 route）；`tests/e2e/buyer-shell-dead-affordance.spec.ts` 擴充為 9 支後 **9/9 通過**（`chromium-desktop` 5 ＋ `chromium-mobile` 4，`E2E_SERVER=production`）；**真實瀏覽器實測**（`npm run dev:web:3010`，以 buyer session 開 `/explore`）四種外殼狀態 —— desktop 展開／desktop 收合／mobile 關閉抽屜／mobile 開啟抽屜 —— `document.querySelectorAll('a[href^="#"]')` **皆為空陣列**，且四種狀態皆無水平溢出。 | **Completion Criteria（capability-first）：** (1) **capability 判定已由 Owner 於 `DEC-11` 拍板（2026-08-28）：MVP 現階段沒有真實 account／profile destination** → **移除該 `#account` affordance**。允許的兩種收尾：整塊移除，或**保留 avatar／名稱為非互動的純識別呈現**（不是 `<a>`、不可 focus、無 hover 態）。**不得**導向任何無關 destination，**不得**用 disabled placeholder 取代。實作時**不需**重新判定，也**不需**再取得 Owner confirmation。(2) **不得為了修這塊自行建立帳號設定頁或 profile capability。** (3) 若改為非互動，需一併移除 `NavTooltip`「個人資料」這個**承諾性標籤**，否則仍在暗示有個人資料頁。(4) collapsed rail 與 expanded footer **兩種型態都要處理**。(5) 完成後買家外殼的 `href="#..."` 死錨點歸零 —— 這正是 `BUY-03` CC (4) 的殘餘部分。(6) 驗收：`verify:web` 全綠 ＋ desktop／mobile 各一支 E2E（可擴充 `buyer-shell-dead-affordance.spec.ts`，不另開 suite） |
| ~~`BUY-06`~~ | ~~`P1`~~ ✅ | Buyer / Product · UI Honesty | **買家 Topbar 的「通知」按鈕沒有任何行為，且帶一顆未讀紅點** | 比 `BUY-04` **更進一步的誠實性問題**：`BUY-04` 只是點了沒反應，這一顆**還主動宣稱一個假事實** —— 紅點在視覺語彙上等於「你有未讀通知」，但平台**沒有通知系統**，因此那個紅點永遠不可能為真，也永遠不會消失。`BUY-04` 已把「通知設定」從導覽移除，若這顆留著，買家仍會在**每一頁**的 topbar 看到一個帶未讀標記、點了沒反應的通知鈕 —— 兩者是同一件事的兩個面 | **2026-08-28 實測**：`components/dashboard/Topbar.tsx:94` `<button type="button" className="relative rounded-xl p-2 hover:bg-[#F4F1FF]" aria-label="通知">` —— **沒有 `onClick`**，內含 `<BellIcon />` 與 `<span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#FF6B73]" aria-hidden />`（紅點）。`Topbar` 由 `ParentAppShell.tsx:137` 無條件渲染，涵蓋所有買家路由。capability 面的證據與 `BUY-04` 同一組：`db/db_schema.sql` 無 notification／preference 欄位；`Backend/routes/creatorCases.js:24`「平台沒有 notifications 資料表」；`Backend/services/emailService.js:230`「平台**沒有**站內通知系統，也不打算為了這條流程建一個 notification center」 | **OPEN — OWNER DECIDED**（立案 2026-08-28；同日 Owner Decision Round 5 拍板 **`DEC-12`**）—— 處置方式已定：**MVP 現階段沒有 notification capability** → **移除 buyer topbar 的通知按鈕，並一併移除未讀紅點**。**不建 notification center、不建 notification dropdown、不建 notification backend；不保留 disabled notification button，也不保留永遠顯示的假 unread indicator。**未來有真實 notification capability 時再重新加入。`DEC-12` 補上了 `DEC-10` 文義未涵蓋的部分 —— `DEC-10` 只講 buyer **navigation**，topbar 按鈕當時不在其射程內，現由本決策明文處理。✅ **DONE**（2026-08-30，依 `DEC-12`）—— `Topbar.tsx` 的 `aria-label="通知"` 按鈕**整顆移除**，**未讀紅點隨之移除**（它原本就是那顆按鈕的子元素），並刪除因此 unused 的 `BellIcon` 元件（移除後全 repo `BellIcon` 命中 **0**）。`Topbar` 只有 `ParentAppShell` 一個 consumer，因此 desktop 與 mobile 由**同一處改動**同時涵蓋。**未留 disabled button、未留空的 icon 槽、未建 dropdown／notification center／backend／preference system。**版面：移除後右側動作區只剩購物車，間距仍由既有 flex `gap` 維持，**未新增任何補位元素**（`DEC-12` 禁止用另一個假功能填空）。**真實瀏覽器實測**：topbar 動作區 `children` 恰為 `[A:購物車]`；desktop 下 topbar 內唯一的 `button` 是 `aria-label="開啟選單"` 且 `display: none`（`md:hidden`），mobile 下恰為那一顆可見的漢堡鈕 —— **沒有任何其他 button**。E2E 以此語意結構斷言取代 class-based 斷言（紅點的 `bg-[#FF6B73]` 與購物車數量徽章共用，用 class 抓會誤中合法徽章）；**未為測試在 production 新增任何 test id 或可見行為**。**驗收證據（2026-08-30）：** `npm run verify:web` **全綠**（lint → typecheck → build 皆 exit 0，50 route）；`tests/e2e/buyer-shell-dead-affordance.spec.ts` 擴充為 9 支後 **9/9 通過**（`chromium-desktop` 5 ＋ `chromium-mobile` 4，`E2E_SERVER=production`）；**真實瀏覽器實測**（`npm run dev:web:3010`，以 buyer session 開 `/explore`）四種外殼狀態 —— desktop 展開／desktop 收合／mobile 關閉抽屜／mobile 開啟抽屜 —— `document.querySelectorAll('a[href^="#"]')` **皆為空陣列**，且四種狀態皆無水平溢出。 | **Completion Criteria：** (1) **capability 判定已由 Owner 於 `DEC-12` 拍板（2026-08-28）：MVP 現階段沒有 notification capability** → **移除該按鈕與紅點**。實作時**不需**重新判定，也**不需**再取得 Owner confirmation。(2) **紅點必須與按鈕一起移除** —— 只拿掉 `onClick`（本來就沒有）或只保留 icon 都不夠，留著紅點就是留著那個假陳述。(3) **不得為了保留它自行建立 notification system**（同 `BUY-04` CC (3)：不建 `notifications` 表、不建 preference schema、不建站內通知中心）。(4) 移除後 topbar 右側只剩購物車，**不得**為視覺平衡補新按鈕。(5) 驗收：`verify:web` 全綠 ＋ desktop／mobile E2E 斷言 `aria-label="通知"` 的按鈕不存在 |
| ~~`DX-18`~~ | ~~`P2`~~ ✅ | Testing / Mobile shell | **`complaint-global-entry.spec.ts:33` 在 `chromium-mobile` 上結構性必失敗** —— 該 spec 從未打開 mobile drawer | 這是 `BUY-02` 當輪以 desktop 語意撰寫、未涵蓋 mobile 的遺留：買家外殼在 mobile 上**不會**把側欄放進 DOM 的可及性樹 —— desktop `<aside>` 是 `hidden ... md:block`（`display:none`，因此被排除在 a11y tree 之外，`getByRole` 找不到），mobile drawer 則是 `{mobileSidebarOpen ? … : null}` **條件渲染**，關著時根本不在 DOM。因此 `getByRole("link", { name: "申訴與消費爭議" })` 必然 0 命中。**紅燈的回歸套件會掩蓋真正的 regression**，這正是 `DX-15` 當初被誤判的機制 | **2026-08-28 實測**：全套回歸中 `[chromium-mobile] complaint-global-entry.spec.ts:33` 失敗，錯誤為 `element(s) not found`（**不是** `not visible`）。隔離重跑 `--project=chromium-mobile` → **1 failed / 5 passed**；同檔 `--project=chromium-desktop` → **6/6 全綠**。**與 `BUY-03`／`BUY-04` 無關**：本輪新增的 `buyer-shell-dead-affordance.spec.ts` mobile case 先 `click("開啟選單")` 再斷言，**同一個「申訴與消費爭議」連結可見且 `href="/me/complaints"`** —— 連結本身完好，缺的是 spec 沒開抽屜 | ✅ **DONE**（2026-08-30）—— **test-only fix，production code 0 改動。**<br>**Root cause（已確認，非推測）：** 買家外殼在 mobile 上不把側欄放進 accessibility tree —— desktop `<aside>` 是 `hidden … md:block`（`display:none` → 被排除在 a11y tree 外，`getByRole` 找不到），mobile drawer 是 `{mobileSidebarOpen ? … : null}` **條件渲染**，關著時不在 DOM。原 spec 以 desktop 動線撰寫、**從未按下漢堡鈕**，因此 `getByRole("link", { name: "申訴與消費爭議" })` 必然 0 命中。<br>**Before（本輪動手前隔離重現）：** `--project=chromium-mobile` → **1 failed / 5 passed**；失敗案例 `:33 logged-in buyer reaches the complaint landing from global nav (no order needed)`，locator `getByRole('link', { name: '申訴與消費爭議' }).first()`，錯誤 `element(s) not found`（**不是** `not visible`）於 `toBeVisible()` 5s timeout。<br>**Fix：** 在該 case 內依 viewport 做**最小分支** —— `viewport.width < 1024` 時先`getByRole("button", { name: "開啟選單" })` 確認可見再 `click()` 打開抽屜，之後的斷言 desktop／mobile **完全共用**（可見 → `href="/me/complaints"` → focus → click → `toHaveURL(/\/me\/complaints$/)` → 落地頁「提出申訴」可見）。同時**移除 `.first()`**：`getByRole` 已排除 a11y tree 外的元素，兩個 viewport 都應恰好命中一個，改用 strict locator 讓未來真的出現重複時直接失敗，而不是被 `nth()` 蓋掉。<br>**沒有使用任何 workaround**：無 `skip`、無 `force click`、無 hidden locator、無 `nth()`、未延長 timeout、未改 production code 去迎合測試、未新增 test-only 的 production 行為。`BUY-02` 的產品主張「買家不必先找到訂單就能申訴」**對 mobile 買家同樣被驗證**，斷言未被弱化為「元素不存在」或 source-level 檢查。<br>**After（驗收）：** `complaint-global-entry.spec.ts` 兩個 project **12/12 全綠**（desktop 6 ＋ mobile 6）；`npm run verify:web` 全綠；完整回歸中`complaint-global-entry.spec.ts:33` **已從失敗清單消失** | **Completion Criteria：** (1) `complaint-global-entry.spec.ts` 的瀏覽器 case 在 mobile 上**先開啟 drawer 再斷言**（與 `buyer-shell-dead-affordance.spec.ts` 的 mobile case 同一手法）。(2) **不得**改用 `--project=chromium-desktop` 過濾掉、也不得放寬成 source-level 斷言 —— `BUY-02` 的產品主張是「買家不必先找到訂單就能申訴」，mobile 買家同樣適用。(3) 修好後該 spec 在兩個 project 皆全綠 |
| ~~`OPS-02`~~ | `P2` | Admin / Operations | **帳號凍結 Admin UI ＋ standardized reason taxonomy** —— 把 freeze／unfreeze 從 API-only 變成可操作、可稽核的後台流程 | backend 能力（含必填理由與雙向稽核）在 Gate 1 已完成，但**沒有任何 Admin UI** —— 維運者今天只能手動打 API 才能凍結或解凍帳號。同時 freeze reason 目前是**自由文字**，跨案件無法比較，稽核價值有限 | 實測（2026-08-27）：`POST /admin/users/:id/{freeze,unfreeze}` 存在於 `routes/admin.js:1158,1161`，含 `reason_required`／`cannot_freeze_self`／`cannot_freeze_admin`／`FOR UPDATE`／`account.frozen`｜`account.unfrozen` 稽核；但 `app/admin/users/page.tsx` **無任何凍結控制項**，`app/admin/users/[userId]/` 底下只有 `activity-logs`；frontend 全域 grep `freeze`／`frozen` 於 app／components **無實質命中** | ✅ **DONE**（2026-08-27）—— **Admin UI**：操作面板 `components/admin/AccountFreezePanel.tsx` 掛在**既有的** per-user 頁 `/admin/users/:userId/activity-logs`（平台唯一的「依人查詢」入口）；**未新建使用者管理模組、未改側欄** —— `IA-07` 的判斷不變（平台仍無使用者名冊，`/admin/users` 維持誠實轉介頁，但其過時文案已更新：它先前宣稱「沒有停權欄位、沒有 /admin/users 端點」，兩者現已不成立）。**Standardized taxonomy**：新增 `Backend/utils/accountFreezePolicy.js`，7 個營運分類（`suspected_fraud`／`payment_abuse`／`account_security`／`content_policy`／`repeated_misuse`／`manual_review`／`other`），**刻意全為營運語彙、不含法律認定用語**（測試斷言標籤不得出現「違法」「犯罪」「詐欺成立」）。**Backend validation**：`reasonCode` 必填且須來自 allowlist、`other` 必須附 note、note ≤ 500 字；**舊的自由文字 `{reason}` 不再被接受**（回 `reason_required`）。驗證在 backend，**前端下拉選單不是驗證** —— 測試直打 router 證明之。**零 schema churn**：`users.freeze_reason` 維持人類可讀文字（存合成的 `label：note`），結構化 `reasonCode`／`note` 寫進 `activity_logs.meta`；**歷史自由文字不回填、不假裝有 taxonomy**（無 code 即回 `null`，已測）。新增 **`GET /admin/users/:id/account-status`**（個資最小化：只吐面板需要的欄位，不做名冊／搜尋；`currentReasonCode` 取自最近一筆 `account.frozen` 稽核，**排序用 `created_at` 不用 `id`**，遵 `CLAUDE.md` §4.4）。**單一 Admin 模型維持**，**未導入 two-admin approval／簽核佇列**（測試斷言 UI 不得出現覆核字樣）。guardrail 維持且由 backend 執行：`cannot_freeze_self`／`cannot_freeze_admin`（前端只是 disable，不是授權邊界）。**freeze history 完整保留**：解凍後 `frozen_at`／`frozen_by`／`freeze_reason` 不清空。**`BUY-02` invariant 未被破壞**：`routes/complaints.js` 仍不套 `requireActiveAccount`，凍結帳號仍可申訴（測試釘住）；凍結仍確實擋住受保護的寫入。**UI 文案只描述真實能力** —— 測試斷言不得出現「永久停權」「違法」「犯罪」「已確認詐欺」，且**不得引入任何法定期限**。**驗證：** 新增 `Backend/tests/accountFreezeAdmin.db.test.js`（10 case）＋ `frontend/apps/web/tests/e2e/admin-account-freeze.spec.ts`（6 case）；DB **442/442**、unit **213/213**、smoke exit 0、`verify:web` exit 0、`admin-account-freeze`＋`complaint-global-entry`＋`critical-acceptance` **30/30**。**已知 E2E flakiness（非本輪 regression）：** 本輪期間 `complaint-global-entry`、`admin-operations`、`shell-consistency` 三支曾在**跨檔批次**中各失敗一次，單獨或重跑皆全綠（`admin-operations` 單跑 39/39；`complaint-global-entry` `--repeat-each=5` 30/30）。其中 `complaint-global-entry` 的真因已找到並修好：買家外殼的 `orders/my` session 探測（`DX-04`）在假 token 下會拿到真 401 而正確地導向 `/login`，該 spec 先前漏了 `installShellBootstrapMocks` | **Completion Criteria：** (1) Admin 可於後台 UI 執行 freeze／unfreeze，不再只有 API；(2) **保留 mandatory reason**；(3) 建立**有限且可稽核**的 standardized reason taxonomy／checklist；(4) 需要補充時可另存 free-text note，但**不得以自由文字取代標準 reason**；(5) freeze 與 unfreeze **皆**維持 auditability（既有 `activity_logs` 行為不得 regression）；(6) **不導入 two-admin approval**（admin 只能由 CLI 建立，可能僅一位，強制第二人會造成鎖死風險）；(7) **不得**藉本項定義任何對外申訴期限、法定回覆日數或法律上的正當程序最低標準 —— 那是 Terms §2.5 的 Owner ＋ Lawyer 未決事項；(8) targeted tests ＋ `verify:web` 全綠。**canonical：** `docs/mvp_rules.md` §12.2a〈Operating model〉 |
| ~~`OPS-03`~~ | `P2` | Admin / Legal Ops | **`requires_reconsent` 設定之標準化 internal justification** —— 把「誰按下 true/false、依據什麼」變成可稽核事實 | `SCHEMA-03` 已讓發布時必須顯式決定 `requires_reconsent`，但**沒有任何理由紀錄**：稽核只答得出「誰、何時、設成什麼」，答不出「依據什麼」。權限目前也僅為結構性的 —— 任何能發布的 Admin 都能設定該旗標。`DEC-LEGAL-10`／`OPS-02` 已在帳號凍結上證明「單人權限 ＋ 標準化理由 ＋ 稽核」可行，本項是同一形狀套用到法律文件發布 | 實測（2026-08-28）：`routes/adminLegalDocuments.js:24` 為 `requireAuth + requireRole("admin")`，無更細權限；publish 的 `activity_logs.meta` 只有 `documentType`／`version`／`effectiveDate`／`contentHash`／`requiresReconsent`／`supersededIds`，**無任何 justification 欄位** | ✅ **DONE**（2026-08-28）—— 新增 `Backend/utils/legalDocumentPublishPolicy.js`：7 個**營運**分類（`editorial_update`／`policy_scope_change`／`user_rights_change`／`platform_process_change`／`compliance_review`／`administrative_correction`／`other`），**刻意不含** `material_change`／`non_material`／`legally_required`，標籤亦不得出現「重大變更」「依法必須」（測試逐項斷言）。`reasonCode` 必填且須來自 allowlist、`other` 必附 note、note ≤ 500 字，**驗證在 backend**。**最重要的不變條件：reason 與 boolean 完全獨立** —— `validatePublishJustification()` **不接收也不回傳** `requiresReconsent`，`publish()` 的兩段驗證互不傳參，route 原樣傳遞不做推導；測試證明同一個 `policy_scope_change` 可產生 true 與 false 兩種結果，且 `editorial_update` 也能搭配 true。**零 schema churn** —— `legal_documents` 未新增任何理由欄位（測試斷言 5 個候選欄位名皆不存在）；理由寫入 `activity_logs.meta` 的 `justificationCode`／`justificationNote`。稽核可回答 who／when／document／version／boolean／reasonCode／note，且 meta **不含**法律判定欄位。缺理由 → `400 justification_required`，**無 partial write**（狀態仍為 `approved`、不留稽核）。published 後 `requires_reconsent` 仍由既有 trigger 鎖死（既有測試未 regression）。**維持 single-admin，未引入雙人覆核**；**未定義任何法律上的重大變更判準**。**驗證：** 新增 `tests/legalDocumentPublishJustification.db.test.js`（13 case）；既有 `legalDocuments.db.test.js` ＋ `legalDocumentReconsent.db.test.js` 共 **45/45** 無 regression（僅更新呼叫端以帶入必填 `reasonCode`）；**DB 455/455、unit 213/213、smoke exit 0、`verify:web` exit 0**。**Admin UI 未做** —— 法律文件的 create／approve／publish 目前仍是 **API-only**（`/admin` 底下沒有 legal-document 頁面，前端 0 個呼叫端）。本輪的 Owner 指示為「**若** UI 已存在則加上選單」，實測**不存在**，建立整套 legal-document Admin 模組屬新 scope —— **已另立 `OPS-05` 記錄，未實作** | **Completion Criteria：** (1) 新增有限且可稽核的 justification taxonomy（沿用 `utils/*Policy.js` 形狀），**全部為 operational 語彙**；(2) **backend 驗證**（allowlist；`other` 之類的逃生口必須附說明），前端選單不得取代驗證；(3) 發布時必填，缺值或未知代碼 → 400，且**無 partial write**；(4) 寫入 `activity_logs.meta`，稽核可回答 who／when／document／version／值／justification；(5) **維持 single-admin，不得引入雙人覆核**；(6) **不得**在欄位、標籤或稽核中出現法律認定用語（「違法」「重大變更」等）；(7) targeted tests ＋ smoke 全綠；(8) canonical doc（`mvp_rules.md` §12.3c）與 tracker 同步。**Dependency：** 無外部依賴 —— 機制本身不需律師意見；**但「什麼變更依法必須設為 true」維持 `DEC-LEGAL-01` LAWYER REVIEW REQUIRED**，本項不得順帶回答。**不得**因本項完成而啟用 Gate 5 consent wiring |
| ~~`OPS-04`~~ | `P2` | Privacy / Operations | **個資權利請求之內部受理與追蹤** —— 重用既有案件管理基礎設施，但建立**獨立**的 privacy-request 分類 | `DEC-LEGAL-07` 已定對外管道（Privacy Email），但平台**內部完全沒有**受理、追蹤或結案機制 —— 收到請求後沒有任何系統紀錄能證明「何時收到、如何處理、何時回覆」，這正是該決定當時已標示的稽核缺口 | 實測（2026-08-28）：全 repo grep `privacy.?request` / `data.?subject` / 個資請求 → **0 命中**；但已有完整且已稽核的三件組 `consumer_complaints` ＋ `consumer_complaint_events` ＋ `consumer_complaint_evidence`（8 種 `complaint_type`、5 態生命週期、SLA 計算、授權證據交付） | ✅ **DONE**（2026-08-28）—— **獨立 domain**：新增 `privacy_requests` ＋ `privacy_request_events` 兩張表、獨立 route namespace `/admin/privacy-requests`、獨立狀態集合（`open`／`in_review`／`waiting_for_information`／`completed`／`closed`，與申訴的五態刻意不同）。**未**加 `complaint_type = 'privacy_request'`（測試以 `pg_get_constraintdef` 斷言該 enum 不含 privacy 字樣）；建立個資請求**不產生任何 complaint 列**（測試比對前後筆數）。**taxonomy 直接取自《隱私權政策》草稿 §8.1／§8.2 已揭露之權利**（access／copy／correction／stop_processing／deletion／withdraw_consent／other），未自行增刪法律權利。**無 SLA**：本 domain 沒有任何 deadline 欄位，**不 require `complaintSla`**，只留 `received_at`／`completed_at`（測試以剝除註解後的程式碼斷言，避免誤判說明文字）。**無身分驗證法律標準**：無 `identity_verified` 類欄位或狀態，不蒐集出生日期／身分證／護照／金融資訊；需確認資訊時使用中性的 `waiting_for_information` ＋ 內部註記。**deletion 請求不刪任何東西**：測試證明建立並推進到 `completed` 之後，目標使用者列仍完好；`completed` 明確定義為「平台已處理完請求」而非「資料已刪除」（UI 亦逐字說明）。**資料最小化**：只存 request_type／requester_reference／summary／received_at／source；**刻意不連結 `users`**（綁帳號等於主張已確認本人，而身分驗證標準未決）；稽核 meta **不複製**請求者聯絡資料（測試斷言）。Admin UI 掛在既有「信任與安全」區塊新增一個入口（**未重建 sidebar**），頁面自稱「個資權利請求」並明示與消費申訴不同；**未新增任何 public / anonymous 提交端點**（對外仍是 Privacy Email，測試斷言 `/me/privacy-requests` 不存在、所有端點 admin only）。**驗證：** db 15 case（新檔）＋ E2E 7 case（新檔）；**DB 470/470、unit 213/213、smoke exit 0、`verify:web` exit 0**；complaint＋freeze＋privacy E2E **34/34**；`BUY-02` 凍結帳號仍可申訴之 invariant 由測試釘住。**已知 E2E flakiness（非本輪 regression）：** 105 支跨檔批次中 `critical-acceptance` 2 支與 `shell-consistency` 1 支失敗，兩檔**單獨執行皆全綠**（18/18、31/31），屬既有的跨檔次序 flake（`BUY-02`／`OPS-02` 輪次亦曾出現） | **Completion Criteria：** (1) 個資請求可在平台內被受理、追蹤、結案，並留下 who／when 稽核；(2) **必須是獨立的 privacy-request 分類／domain distinction** —— **消費申訴與個資權利請求不得混為同一法律／產品概念**，資料模型與 UI 皆須可區分；(3) 得重用底層 case lifecycle／event／evidence 基礎設施；(4) **不得**設定任何 statutory response deadline；(5) **不得**定義 identity-verification 的法律標準；(6) Privacy Email 維持為對外入口與**登入不了者的 fallback**（`DEC-LEGAL-07`），站內機制不得取代它；(7) targeted tests ＋ `verify:web` 全綠；(8) `privacy-policy.draft.md` §8.3 與 tracker 同步。**Dependency：** 內部受理模型無外部依賴；**法定回覆期限與身分驗證標準維持 `LAWYER VALIDATION REQUIRED`**（Privacy §8.3），本項不得順帶回答 |
| ~~`OPS-05`~~ | `P3` ✅ | Admin / Legal Ops | **法律文件管理仍是 API-only** —— 建立草稿／核可／發布沒有任何 Admin UI | `SCHEMA-03` 與 `OPS-03` 已把發布契約做得很嚴（顯式 boolean ＋ 標準化理由 ＋ 稽核），但**沒有任何介面能執行它** —— 實際發布法律文件時，維運者必須手動組 JSON 直打 API。這與 `OPS-02` 修掉的凍結「API-only」問題是同一種缺口，只是尚未成為 blocker：目前 `legal_documents` 為 0 列，且發布本身仍 blocked on lawyer approval | 實測（2026-08-28）：`frontend/apps/web/app/admin/` 下無 legal-document 頁面；全前端 grep `admin/legal-documents` **僅 1 命中且在 proxy 註解**；`lib/admin-nav.ts` 無法律文件項目；`routes/adminLegalDocuments.js` 檔頭自述「本輪不提供 Admin UI」 | ✅ **DONE — ENGINEERING CAPABILITY COMPLETE；PRODUCTION PUBLICATION STILL BLOCKED**（2026-08-30）。**⚠️ 本項的 deliverable 於本輪由 Owner 明文改寫，必須連同這段一起讀：** 原 Completion Criteria (1)～(6) 全部是 **Admin UI** 的要求；本輪 Owner 的指示是「**不要因 OPS-05 自動建立大型 CMS**，OPS-05 優先解決 *safe operational publication procedure*」。因此本輪交付的是**營運程序與 fail-closed 前置檢查**，**(1)～(6) 的 Admin UI 並未實作** —— 該缺口未被消滅，已完整移交新條目 **`OPS-06`**，**不得**把本項的 DONE 讀成「法律文件管理已經有後台介面」。**本輪盤點結論：既有 Admin API 已足以完成整條發布路徑（Option A）**，因此**未新增任何 production 端點**：`POST /admin/legal-documents`（draft）→ `PATCH`（改 draft）→ `POST /:id/approve` → `POST /:id/publish`，全部 `requireAuth` + `requireRole("admin")`；`publish()` 在單一 transaction 內先讓舊版轉 `superseded` 再發布新版（順序刻意如此 —— partial UNIQUE index 在每句 UPDATE 結束就檢查）；稽核寫入 `activity_logs.legal_document.published`（who／when／type／version／content_hash／requiresReconsent／justificationCode／supersededIds）。**新增（皆非發布路徑本身）：** `utils/legalPublicationPreflight.js`（純函式前置檢查，**無 I/O、無寫入能力**）、`scripts/legal-publication-preflight.js`（**dry-run only，沒有寫入路徑** —— 不 import `publish()`、不發 POST、對 DB 只有一次唯讀查詢，結尾一律印 `DRY RUN — NO LEGAL DOCUMENT WAS PUBLISHED`）、`npm run legal:preflight --prefix Backend`、`tests/legalPublicationPreflight.test.js`（10 case）、以及 `docs/local-development-and-operations.md` 的完整 runbook（前置條件／dry-run／人工覆核／發布步驟／發布後驗證／**NO AUTOMATED ROLLBACK**）。**核心不變條件：技術檢查與外部核准是兩條永不合併的判定線。** `TECHNICAL VALIDATION: PASSED` 單獨存在時**不代表可以發布**；`readyToPublish` 需兩條線同時成立，而即使成立也只表示「技術齊備 ＋ operator 聲明外部核准存在」，**不是**法律判定。工具**刻意不**把「律師是否真的核准」自動化成 boolean truth，只要求可稽核的參照 ＋ 顯式確認。**最後一道防線：來源檔案若仍帶 `DRAFT — NOT LAWYER APPROVED` / `NOT FOR PRODUCTION PUBLICATION`，一律判 blocked** —— 實測：拿現行 `terms-of-service.draft.md` ＋ 其餘欄位全部填對 ＋ 偽造的 lawyer ref ＋ 勾上確認旗標，仍得到 `TECHNICAL PASSED` / `EXTERNAL APPROVAL UNRESOLVED` / `NOT READY`（exit 1）。單元測試另有一條把四份草稿逐一釘住必須 not ready。**⚠️ 一處最小 production 檔案改動（非發布路徑、非 guard 變更）：** `DOCUMENT_TYPES` 由 `services/legalDocument.service.js` 抽到新的純模組 `utils/legalDocumentTypes.js`，service 改為 require 並**原樣 re-export**（`routes/adminLegalDocuments.js` 等既有呼叫端零改動）。原因：service 會在載入時建立連線池，缺 PG 環境變數即 throw，使得「只想知道合法型別」的純函式被迫要求資料庫設定。抽出後前置檢查與寫入路徑仍共用**同一份** allowlist，不存在漂移空間。**行為零變更**，由 DB 470/470 與 smoke 全綠佐證。**驗證：** unit **223/223**（新增 10）、DB **470/470**、smoke **exit 0**、`TEST-01` 回歸 **10/10**。**發布狀態全程未變：`legal_documents` 與 `consent_records` 在兩個資料庫於本輪前後皆為 0 列；`docs/legal-drafts/` 一字未改。** | **Completion Criteria：** (1) Admin 可於後台完成 create draft → approve → publish 全流程；(2) publish 表單必須**分別**呈現 `requiresReconsent` 與發布理由兩個獨立選擇，**不得**由理由自動切換 boolean；(3) 必須顯示「此為內部營運紀錄，不代表法律上的重大變更判定」之類的明確說明，**不得**出現「此變更依法需要重新同意」這種尚未取得法律判準的文案；(4) `other` 需要 note；(5) reason 選項由 backend 提供，前後端不各維護一份；(6) backend 錯誤誠實呈現；(7) targeted tests ＋ `verify:web` 全綠。**Dependency：** 無外部依賴（機制已完成）；**但發布真實法律文件仍 blocked on lawyer approval**，本項只做操作介面，**不得**因此發布任何文件或啟用 Gate 5。**（2026-08-30 `DOC-01` 補記）`REL-01` 把四份草稿與整個 review packet 納入版控，**不改變**本項的任何分類** —— **commit ≠ approval ≠ publication**。工程能力（Admin 發布介面）仍可實作；真實法律文件的發布仍 blocked on lawyer approval。**不得**因為 packet 已進 Git 就把本項寫成 ready to publish |
| `OPS-06` | `P3` | Admin / Legal Ops | **法律文件管理仍沒有 Admin UI** —— 建立草稿／核可／發布只能直打 API | 這是 `OPS-05` 原 Completion Criteria (1)～(6) 的**未交付部分**。2026-08-30 Owner 在 `OPS-05` 輪次明文指示「不要建立大型 CMS，優先做安全的營運程序」，因此該輪交付 runbook ＋ fail-closed 前置檢查，UI 缺口原樣移交本條目 —— **它沒有被消滅，只是被移動**。目前仍非 blocker：`legal_documents` 為 0 列，且發布本身 blocked on lawyer approval | 2026-08-30 實測：`frontend/apps/web/app/admin/` 下無 legal-document 頁面；全前端 grep `admin/legal-documents` **僅 1 命中且在 proxy 註解**；`lib/admin-nav.ts` 無對應項目；`routes/adminLegalDocuments.js` 檔頭自述「本輪不提供 Admin UI」。`OPS-05` 已證明 API 路徑完整，因此本項純粹是介面工作 | **OPEN — SAFE / INDEPENDENT** | 沿用 `OPS-05` 原 (1)～(6)：(1) Admin 可於後台完成 create draft → approve → publish 全流程；(2) publish 表單必須**分別**呈現 `requiresReconsent` 與發布理由兩個獨立選擇，**不得**由理由自動切換 boolean；(3) 必須顯示「此為內部營運紀錄，不代表法律上的重大變更判定」之類的說明，**不得**出現「此變更依法需要重新同意」這種尚未取得法律判準的文案；(4) `other` 需要 note；(5) reason 選項由 backend 提供，前後端不各維護一份；(6) backend 錯誤誠實呈現；(7) targeted tests ＋ `verify:web` 全綠。**建議沿用 `OPS-05` 的兩條線呈現**（技術前置 vs 外部核准），避免 UI 讓人以為按下去就代表法律核准。**Dependency：** 無外部依賴；**但真實發布仍 blocked on lawyer approval**，本項只做操作介面，**不得**因此發布任何文件或啟用 Gate 5 |
| ~~`DX-15`~~ | ~~`P2`~~ ✅ | Testing / Routing | **`public.spec.ts:7`「home page redirects by role」確定性失敗** | 回歸套件中有一支**穩定重現**的失敗。紅燈的套件會侵蝕之後每一個 Wave 的驗證可信度 —— 驗證結果一旦需要人工解釋「這條本來就是紅的」，回歸就失去了把關能力 | P1-09 verification 期間發現：teacher role 未導向預期的 `/creator/materials`；**重複執行皆確定性重現**，`teaching_platform_security_test` 與 dev DB **均重現**；P1-09 patch **未修改** `app/page.tsx`，亦**未修改** `public.spec.ts`。`app/page.tsx:51-52` 現況確為 `role === "teacher"` 或 `role === "creator"` 時 `router.replace("/creator/materials")` | ✅ **DONE**（2026-08-30，server-side landing redirect）—— **root cause 為 client-hydration race，修法是把 `/` 的角色導向移到 `middleware.ts`。** 完整記錄見本欄末段【修復】；以下保留完整調查歷程（先判 NOT REPRODUCIBLE → 取得游移證據 → 確立 root cause → 修復），不抹除。<br>**（歷史）OPEN — NOT REPRODUCIBLE（2026-08-27 專輪調查）**。本輪**先建立 reproduction baseline 才決定是否修改**，結果是 **19 次執行全綠、無一次重現**：(1) `public.spec.ts` 全檔 `--repeat-each=3` desktop（**backend 未啟動**）→ 目標案例 `:7` **3/3 通過**；同一次執行中失敗的是 `:111` 與 `:196`，原因是 proxy `ECONNREFUSED ::1:3000`（**需要 backend 的別的案例**，非本項）；(2) `--grep "home page redirects by role" --repeat-each=3` desktop ＋ mobile（**backend 已啟動**）→ **6/6 通過**；(3) `public.spec.ts` 全檔 desktop ＋ mobile（backend 已啟動）→ **10/10 通過**。調查期間 `app/page.tsx` 與 `public.spec.ts` 的 **md5 與本輪起始逐位元組相同**，且兩者 mtime（08-27 10:47）**早於**當初回報失敗的時間點 —— 因此**不是有人在期間修好了**，而是同一份程式碼現在通不出那個失敗。**canonical 契約本身三處一致且正確**：`app/page.tsx:51-52`、`app/login/page.tsx:95`（皆為 `/creator/materials`）、`middleware.ts:58-61`（`/teacher/*` → 308 `/creator/*`）—— 測試期望與產品行為**沒有矛盾**，因此**沒有任何一側該被修改**。**本輪未改動任何 production code 或測試**（依指令：不得為了讓 tracker 變綠去改測試）。最可能的解釋是當初觀察到的是**整支 `public.spec.ts` 紅燈**（backend 不可達造成 `:111`／`:196` 失敗）而被歸因到 `:7`，但這是推論、**未經證實**，故本項保持 `OPEN` 而非 DONE。**【2026-08-28 更新 —— 本輪完整回歸中重現，狀態不再是 NOT REPRODUCIBLE】** `BUY-03`／`BUY-04` 收尾時跑的 `E2E_SERVER=production` 完整套件（**546 passed / 14 failed / 62 skipped**）中，`[chromium-mobile] public.spec.ts:7` **失敗**；隔離重跑 `--project=chromium-mobile` **再次失敗**（本輪 2/2 重現）。失敗的是 `buyer role auto-redirect check`：`toHaveURL(/\/dashboard/)` 收到 `http://127.0.0.1:3010/`，即首頁的 client-side `router.replace` 在 5 秒內沒有發生。**與 2026-08-27 調查的差異在環境而非程式碼**：當時的 (2)(3) 兩組 mobile 執行是在 **backend 已啟動**下取得 10/10；本輪 **backend :3000 未啟動**（`netstat` 實測未監聽），`app/page.tsx` 的 `loadPreviewMaterials()` 會經 proxy 打到不可達的上游（WebServer log 滿是 `ECONNREFUSED ::1:3000`／`TypeError: fetch failed`）。因此**新的 reproduction 條件假設為「`chromium-mobile` ＋ backend 未啟動」**，這與原註記「最可能的解釋是整支 spec 紅燈被歸因到 `:7`」不同 —— 本次 `:7` 是**單獨隔離**下失敗的。**本輪未改動 `app/page.tsx` 或 `public.spec.ts`**（md5 未變），亦**未** opportunistically 標 DONE —— 完整回歸並非全綠，且本項自己的測試就在失敗清單裡。下一輪應在 **backend 啟動／未啟動兩種條件**下各跑一次 mobile 以確認假設。**【2026-08-30 追加證據 —— 症狀會在同檔的 sibling test 之間游移】** `BUY-05`／`BUY-06` 收尾的完整回歸（**550 passed / 15 failed / 67 skipped**，backend 仍未啟動）中：`public.spec.ts:7` **這次通過**，但 `public.spec.ts:109`（`root redirect 不產生迴圈（admin 回到首頁不會再被彈到 403）`，即 `DX-17` 的回歸測試）**在兩個 project 都失敗**；隔離重跑 `:109` → desktop 通過、**mobile 失敗**；隔離重跑 `:7` → desktop 通過、**mobile 失敗**。兩者的失敗簽章**完全相同**：`toHaveURL` 期望 `/\/admin/`／`/\/dashboard/`，實得 `"http://127.0.0.1:3010/"` —— 即首頁的 client-side `router.replace` 在 5 秒內沒有發生。→ **本項不應再侷限於 `public.spec.ts:7`**：它是 `app/page.tsx` 首頁角色導向在「`chromium-mobile` ＋ backend 未啟動」下的 timing 問題，會在同檔任一 root-redirect 案例上浮現。**與 `BUY-05`／`BUY-06` 無關**（歸因證據：`app/page.tsx` 未 import 任何本輪改動的元件；`Sidebar.tsx` 與 `Topbar.tsx` 各只有 `ParentAppShell` 一個 consumer，而首頁導向發生在任何外殼渲染之前）。**本輪依指令未修改 `app/page.tsx` 或 `public.spec.ts`**。**【2026-08-30 追加觀察（`DX-18` 輪次，僅記錄，未修）】** 該輪完整回歸（**550 passed / 15 failed / 67 skipped**，backend 仍未啟動）中，`public.spec.ts:7` **這次是 `chromium-desktop` 失敗**（先前紀錄都在 mobile），`public.spec.ts:109` 則 desktop ＋ mobile 皆失敗；但把 `:7 --project=chromium-desktop` **單獨隔離重跑則通過**（4.0s）。→ 症狀**既會在同檔 sibling test 之間游移，也會在 project 之間游移，且平行執行下才浮現** ——與「隔離必失敗」的想像相反。這強化「environment／timing sensitive」的分類，並顯示**單獨重跑不足以作為關閉本項的證據**：關閉條件必須是**完整平行套件**在 backend 啟動／未啟動兩種條件下皆全綠。**與 `DX-18` 的修正無關**（本輪唯一改動是 `complaint-global-entry.spec.ts`，與 `public.spec.ts`／`app/page.tsx` 無共用程式碼）<br>**【2026-08-30 root-cause 調查完成 —— 本項仍 `OPEN`，但已不再是「原因不明」】**<br>**症狀特徵（實測，非推測）：** (1) **不侷限 mobile**，desktop 與 mobile 都會發生；(2) 會在 `public.spec.ts` 的 **sibling case 之間游移** —— `:7` 與 `:109` 交替中獎，失敗簽章完全相同（`toHaveURL` 期望 `/dashboard`／`/admin`，實得 `"http://127.0.0.1:3010/"`）；(3) **隔離重跑常通過**；(4) 平行 `--repeat-each=3`（兩個 project ＝ 每個 case 6 次）的 baseline 約 **4 / 12 失敗**。<br>**關鍵事實：產品沒有壞。** 專用診斷（temporary，已刪除）把 timeout 放寬到 20 秒後量測完整時間軸，**8 / 8 次最終都成功導向**。真正的差異只有一個：**redirect latency 是否超過 5 秒的 assertion budget**（`playwright.config.ts` 的 production `expect.timeout`）。<br>**機制：** `/` 的角色導向寫在 `app/page.tsx` 的 `useEffect` 裡，因此**依賴 client hydration** —— 實測 hydration 需 **1.5–1.9s**，其後 `router.replace` 觸發的 landing RSC 請求再花 **0.03–0.55s**，URL 落定總計 **2.3s（最佳）～ 4.2s（最差）**，對 5 秒門檻幾乎沒有餘裕。而 **N 個 Playwright worker 共用單一 `next start` 行程**，hydration 與 RSC latency 都是負載函數，尾端就會間歇越過門檻 —— 這正是「跨 test／跨 project 游移、隔離就通過」的來源。<br>**次要但真實的耦合：** hydration 完成的同一個 commit 裡，landing 的 RSC 請求與首頁預覽請求（`listMaterialsPreview` → `/api/backend/materials`）**同時發出**，打同一台 server；backend 不可達時後者要 327–594ms 才回 500，且在導航完成時被 `net::ERR_ABORTED`，結果從未被使用。**但它不是主因。**<br>**已回退的實驗：** 依此曾在 `app/page.tsx` 做 preview-fetch 解耦（即將被導走時不發預覽請求）。實測確實把預覽請求移出導航關鍵窗口（mobile 的 RSC 回應 421ms → 28–74ms），**但沒有修好 DX-15** —— 主導成本是 hydration，少一個請求動不了 N-workers-對-1-server 的結構比例。該實驗**已完整回退**（`app/page.tsx` 的 SHA-256 回到實驗前的值）。附帶記錄一個量測陷阱：連續三次跑同一個 matrix cell 得到 4/12 → 8/12 → 10/12，**單調上升且與程式碼無關**（期間反覆執行 build 與完整套件）——**同一台機器上先後取得的 arm 不可直接比較**，日後重測必須控制這一點。<br>**不接受的修法（已明確排除）：** 單純把 timeout 5s 拉長、retry、`skip`、serial mode、`workers=1` —— 這些都只是把負載敏感性藏起來，不是修 root cause。<br>**【修復 —— 2026-08-30，Owner 核准修改 `middleware.ts`】**<br>**改動：** `middleware.ts` 的 `matcher` 加入 **`"/"`（僅站台根，不匹配 `/anything`）**，並在 `/teacher` 正規化之後、`requiresLogin` 判斷之前插入一段：`pathname === "/"` 且同時有 `tp_token` ＋ `tp_role` cookie 時，`NextResponse.redirect` 到 `getLandingRouteForRole(role)`；取不到（未登入或無法辨識的角色）則 `NextResponse.next()`。目的地**直接沿用 `lib/session.ts` 的單一對照**（`DX-17` 的教訓：那份 map 不得出現第三份副本）。<br>**為什麼這不是新的授權邊界：** 它讀的是既有 guard 本來就在讀的、可竄改的 `tp_role` cookie，而且把人送去的路由**隨即會被那些 guard 再檢查一次**。偽造 `tp_role=admin` 會落在一個空的 `/admin` 外殼、所有請求回 403 —— 與今天直接輸入 `/admin` 完全相同。**沒有對 cookie 賦予新的信任。**<br>**`app/page.tsx` 的 client effect 刻意保留、未刪除：** 它**不是**被取代的重複邏輯 —— middleware 觸發於 **cookie**，client effect 觸發於 **localStorage**，兩者可以合法地不一致（cookie `max-age=86400`，JWT 7 天）。cookie 已過期但 localStorage 仍在的使用者對 middleware 是隱形的，仍需 client effect 給他 landing（隨後照舊被彈去 `/login`）。它同時是 `app/register/page.tsx` 的 `router.push("/")` 這條 client-side navigation 的安全網。移除它會靜默改變這些情境，因此不移除 —— 這也符合本輪「只有能證明 middleware 覆蓋同一語意時才移除」的條件。<br>**產品語意零變更：** 未登入者 `/` 仍是公開首頁（實測 `GET /` = 200、無任何 redirect、hero 標題可見）；buyer `/` → `/dashboard`；admin `/` → `/admin`；teacher／creator → `/creator/materials`；無法辨識的角色不導向。login／授權邊界／role permissions／`/403` 邏輯／protected-route policy **全部未動**。<br>**新增測試（`public.spec.ts`，未放寬任何既有斷言）：** 「已登入者的 landing redirect 發生在 server navigation 上（`DX-15`）」—— 驗 `GET /` 的**第一個回應本身就是 3xx**（`response.request().redirectedFrom()` 非 null、起點為 `/`、該回應 status 落在 300–399），亦即瀏覽器在拿到首頁 HTML 之前就已被指去別處。**刻意不驗「幾毫秒內完成」** —— 那只會再造一個負載敏感門檻。另驗訪客 `GET /` = 200、無重導、hero 可見。<br>**Reproduction matrix（before → after，同一組 cell）：** before `--repeat-each=3`（兩 project，每 case 6 次）→ `:7` ＋ `:109` 合計 **4 / 12 失敗**；after `--repeat-each=5` → DX-15 family（`:7` home redirect／`:156` 無迴圈／`:91` 新 server-navigation／`:132` canonical landings）**0 / 40 失敗**。<br>**完整平行套件（backend OFF，未降 workers、未加 retry）：** 連續兩次 —— **554 passed / 13 failed / 67 skipped** 與 **555 passed / 12 failed / 67 skipped**，**兩次的 DX-15 family 皆為 0 failures**。殘餘失敗已隔離且全部與本項無關：`api-proxy.spec.ts` ×4 × 2 project（需真實 Backend）、`public.spec.ts:285`／`:370` × 2 project（seeded material，需 Backend/DB）。`verify:web` 全綠。**未使用 timeout／retry／serial／`workers=1` 任何一種 workaround。**<br>**殘餘觀察（不屬本項，未立案）：** 第一次完整回歸中 `critical-acceptance.spec.ts:62`（`login success stores auth and redirects`）在 `chromium-desktop` 失敗一次，第二次回歸與隔離重跑皆通過。它**不經過 `/`**（`app/login/page.tsx` 直接 `router.push(landing)`），且已被 `installCoreApiMocks` 完全 mock，因此與本修復無因果關係；但它屬於**同一類**負載敏感性（client `router.push` ＋ `toHaveURL` 在平行負載下），只是換到另一條程式路徑。目前僅一次觀察，證據不足以立案 —— **若再次出現應開新 ID**，修法方向與本項相同：讓該導向不依賴 client hydration，而非放寬門檻。 | **Completion Criteria（更新）：** (1) ~~先取得根因~~ → **已執行且無法重現**，根因不存在可修的一側；(2) 不得為了讓測試變綠而修改任一側 —— **已遵守，0 檔改動**；(3) `public.spec.ts` desktop ＋ mobile 全綠 —— **已達成（10/10）**；(4) 不夾帶其他不相關修正 —— **已遵守**（另發現的 admin 首頁導向缺陷另立 `DX-17`，未於本輪修）。**關閉條件：** 若下一次完整回歸（含 backend 可達）仍全綠，即可標記 DONE 並註明「無法重現、非產品缺陷」；若再次出現，**必須先保留失敗當下的 trace／screenshot／實際 URL** 再處理 —— 本輪已證明事後補跑無法還原當時狀態 |
| `DX-16` | `P3` | Data / Migration decision | **既有 mojibake 檔名的回填決策（historical repair）** | `DX-14` 的 forward fix 只阻止**新的**壞值產生。既有列仍是亂碼，買家與 Admin 在清單與下載時看到的仍是無法辨識的檔名 | 2026-08-27 **read-only** 盤點（未執行任何 UPDATE）：`teaching_platform_security_test` → `manual_payment_proofs` **3** 列（2026-05-07）、`material_files` 0、`material_media_files` 0、`consumer_complaint_evidence` 0；`teaching_platform` → `manual_payment_proofs` **3** 列（2026-05-07）、`material_files` **1** 列（2026-08-23）、其餘 0。偵測方式：以 `normalizeMultipartFilename()` 對現值試算，結果不同即計為明顯壞掉。例：`ChatGPT Image 2026å¹´5æ3æ¥ ä¸å11_51_35.png` → 應為 `ChatGPT Image 2026年5月3日 下午11_51_35.png` | **OPEN — HISTORICAL REPAIR: DEFERRED** | 需先決定：(1) 是否回填（`original_filename` 是呈現用 metadata，不影響交付正確性與授權）；(2) 若回填，是否只改能**確定性還原**的列（本輪的偵測法可安全識別），無法還原者一律保留原值 —— **不得猜測**；(3) 是否需要同步處理任何實體物件（**目前不需要** —— `storage_key` 與檔名無關，檔名從不參與儲存路徑）；(4) 是否需要 migration ＋ 備份程序（依 `CLAUDE.md` §4）。**在上述拍板前不得執行任何 UPDATE 或 rename** |
| ~~`DX-17`~~ | `P2` | Frontend / Routing | **Admin 造訪首頁 `/` 會被導到 `/403`** | `app/page.tsx` 的角色導向只分兩類：creator 去 `/creator/materials`，**其餘一律 `router.replace("/dashboard")`** —— 但 `/dashboard` 在 middleware 是 **`parent` 專屬**，因此 admin 一進首頁就被彈到 `/403`。管理員在已登入狀態下打開站台根路徑會看到「無權限」，這是會被當成故障回報的行為 | **2026-08-27 真實瀏覽器實測**（backend :3000 ＋ web :3010，security test DB）：以 admin 帳號登入後導向 `/` → 最終 `location.pathname` 為 **`/403`**；當下 `tp_token` 存在（len 188）、`tp_role=admin`、cookie 正確，**不是 session 問題**。程式證據：`app/page.tsx:53` 的 else 分支 `router.replace("/dashboard")`；`middleware.ts:82` `startsWithPrefix(pathname, "/dashboard") && role !== "parent"` → `redirectToForbidden`。**對照**：`app/login/page.tsx:95` 對 admin 用的是 `/admin`（正確），因此**登入流程正確、首頁流程錯誤**，兩處對 admin 的 canonical 目的地不一致。`public.spec.ts` 的角色導向測試**只涵蓋 guest／teacher／buyer，沒有 admin** —— 這正是它長期未被發現的原因 | ✅ **DONE**（2026-08-27）—— **root cause 為 `DUPLICATED ROLE LANDING MAPPING`**：`app/page.tsx` 與 `app/login/page.tsx` 各寫了一份角色→目的地對照，兩份對 admin 不一致。**修法不是加 admin special-case**，而是把對照收斂成 `lib/session.ts` 的唯一一份（`ROLE_LANDING_ROUTES` ＋ `getLandingRouteForRole()`），兩個呼叫端都改讀它。**未知角色改為回傳 `null`** —— 首頁不導向、登入退回 `/`，取代舊的 `else → /dashboard`（那正是本 bug 的成因）。**pre-fix 實測**：admin 登入後導向 `/` → 最終 `/403`（`h1` 為「403」、body 為「你沒有此操作權限。」）；**post-fix 實測**：同一流程 → **`/admin`**，`h1` 為「歡迎回來，管理員！」。新增三支 E2E：admin root redirect、**四角色 landing 皆可直接進入且不被 middleware 彈開**、**root redirect 無迴圈**。`public.spec.ts` desktop ＋ mobile **14/14**；三支角色導向測試 `--repeat-each=3` **18/18**。`lib/session.ts` 是同一種事故的舊案發地（session key 抄三份造成 redirect loop），因此把這份對照放在那裡，並在註解寫下不變條件：**每個 role 的 landing 必須是該 role 在 `middleware.ts` 進得去的 route** | **Completion Criteria：** (1) 首頁對 admin 的目的地與登入流程一致（`/admin`）；(2) 修正在**共用的角色→目的地對照**，不要在頁面各自打補丁（目前 `app/page.tsx` 與 `app/login/page.tsx` 各寫一份，是同一個對照的兩個副本）；(3) 補上 admin 的角色導向 E2E 斷言（四種身分皆涵蓋：anonymous／buyer／creator／admin）；(4) 確認不產生 redirect loop（`/` → `/admin` → `/`）；(5) `public.spec.ts` desktop ＋ mobile 全綠。**與 `DX-15` 不同 root cause** —— `DX-15` 是 teacher 導向（實測無法重現），本項是 admin 導向（實測必然重現）。**五條全數達成。** 順帶記錄一個**未修**的既有不一致（不在本輪 scope，未立案）：`app/login/page.tsx` 對 `parent` 是 early-return，**會忽略 `?redirect=`**，其他角色則採「`redirect` 優先、否則 landing」 —— 買家被導去登入後回不到原本要去的頁面。本輪只把目的地換成共用對照，**刻意未改動該 early-return 的語意** |
| `DX-14` | `P3` | Backend / Data quality | **上傳檔名的非 ASCII 字元被存成 latin1 亂碼** | multer/busboy 預設以 latin1 解讀 multipart 的 `filename`，因此中文檔名寫進 DB 就已經是亂碼。影響**所有**私有檔案上傳路徑（付款憑證與申訴證據**共用同一種 multer 設定**），使用者在清單與下載時看到的是無法辨識的檔名 | **已有實際壞資料（非假設）**：`teaching_platform_security_test` 的 `manual_payment_proofs` 既有列即含 `ChatGPT Image 2026å¹´5æ3æ¥ ä¸å11_51_35.png`（應為「2026年5月3日 下午11_51_35」）、`è¢å¹æ·åç«é¢ 2026-05-08 012649.png`（應為「螢幕擷取畫面」）—— 皆為 2026-05 上傳，**早於 Wave 2 #13**。Wave 2 #13 的 HTTP 驗證以中文檔名重現：上傳「匯款證明.png」後 `Content-Disposition` 的 `filename*=UTF-8''` 與稽核 meta 皆為 `å¯æ¬¾è­æ.png`。**交付端無錯** —— `utils/fileDownloadResponse.js` 忠實編碼 DB 裡的值；root cause 在上傳邊界（`routes/order.js` 與 `routes/complaints.js` 的 `multer`） | ✅ **DONE — FORWARD FIX**（2026-08-27）—— **新上傳的檔名已保留正確 UTF-8；既有 mojibake 列刻意未動**（見 `DX-16`）。root cause 以真實 multipart 實測確認在 busboy 的 latin1 預設，且 **multer 2.0.2 不轉傳 `defParamCharset`**（只給 `{headers, limits, preservePath}`），故於邊界還原：新增 `utils/multipartFilename.js` 為唯一還原點。**實際受影響的是三條路徑不是兩條** —— tracker 原文只列了付款憑證與申訴證據，盤點發現 `routes/teacherUpload.js`（教材本體 ＋ 教材媒體）同樣讀 `originalname`，且 dev DB 的 `material_files` 確實已有 1 列壞資料，**本輪三條一併修**。還原是**有條件**的（碼點全 ≤ 0xFF ＋ 嚴格 UTF-8 驗證），因此純 ASCII 逐位元組不變、真正的 latin1 文字不被硬轉、且函式冪等。unit 18 case ＋ **真實路由** db 11 case ＋ HTTP 16/16；DB 387/387、unit 213/213、smoke exit 0。canonical 見 `docs/material-file-storage-and-delivery.md` §4.3 | **Completion Criteria（forward fix 部分，已全數達成）：** (1) 三條 production 上傳路徑的新上傳皆保留正確 UTF-8 檔名；(2) 純 ASCII 檔名逐位元組不變（no silent mutation）；(3) 還原冪等且不破壞本來就正確的 Unicode；(4) 真正的 latin1／截斷序列不被硬轉成亂碼；(5) 還原不得產生新的 `/`／`\`／NUL／CR／LF／`..`；(6) MIME allowlist、magic bytes、size limit、storage key 產生、checksum、ownership／Admin 授權、IDOR、`nosniff`、`private, no-store` 全部未弱化；(7) 檔名不影響 storage path；(8) 交付端 `Content-Disposition` 的 `filename*` 可還原正確 Unicode；(9) helper unit coverage ＋ **兩條 route 的真實整合 coverage**（不能只測 helper）；(10) targeted ＋ DB ＋ unit ＋ smoke ＋ 相關 E2E 全綠。**既有壞資料的回填不在本項** —— 已拆出 `DX-16` 獨立追蹤 |
| `PROD-01` | `P2` | Product / Security（Gate 4） | **申訴證據是否開放 PDF** —— 決定後才能判斷 Gate 4 能否升 IMPLEMENTED | `N3` 明文列舉買家得提供「bank transfer proof、ATM receipt、banking screenshot、**金融機構交易證明**」，而**金融機構交易證明最常見的形式就是 PDF**。目前型別 allowlist 只有 JPEG/PNG/WebP，PDF 為**刻意未開放**。Wave 2 #13 完成讀取／交付後，**這是 Gate 4 唯一剩下的未決項** | `utils/paymentProofPolicy.js` 的 `ALLOWED_PROOF_TYPES` 只有三種影像（由 `complaintEvidenceDelivery.db.test.js` 釘住不得擅自擴張）；`routes/complaints.js:40-45` 的註解明載「開放 PDF 是產品與安全決策」；baseline `N3`（`PRE-03_PRE-04_..._v1.8_Full_Baseline.md:975-979`）列舉了「金融機構交易證明」但**未指定格式** | **OPEN — BLOCKED ON PARALLEL LEGAL / PRODUCT DECISION** | 需回答三件事：(1) 法律上是否必須接受 PDF（屬 `L-17` / Legal session，**不由工程決定**）；(2) 若開放，PDF 的 inline 呈現安全模型為何（目前 inline 的安全性靠「只可能是影像」＋ `nosniff` 撐住，PDF 會引入 JS 執行面，需重新評估 `Content-Disposition` 預設值與 CSP）；(3) magic-byte 驗證與大小上限如何延伸。**在 (1) 有答案之前，Gate 4 一律維持 `PARTIAL`，不得自行升級** |
| `LEGAL-01` | `P2` | Legal / Compliance | 消保法 §43 II 十五日期間：**民法 §122 末日展延未實作**，且整組民法期間規則的最終適用與對外文案待律師確認 | **已可直接由法條確認、且已實作**：§43 II 明文十五日／§120 II 始日不算入（Day 1 為次日）／§121 I 以末日之終止為期間終止。→ 末日 ＝ 申訴之台灣日曆日 + 15 天，終止於該日台北 23:59:59.999。**未實作**：§122「末日為星期日、紀念日或其他休息日時，以其次日代之」—— 需要權威國定假日來源（人事行政總處行事曆）。**用詞精確化（2026-08-30，`DOC-01`）：** repo **有**共用的台灣日曆／日期算術 primitive（`Backend/utils/taiwanCalendar.js` —— 只有「哪一天／加 N 天／當日終了」，實測 `holiday`／`休息日`／`人事行政` 命中 **0**），**但沒有**權威的國定假日／休息日資料集，也沒有 §122 展延實作。先前寫成「repo 無任何 holiday / calendar primitive」並不精確 —— 缺的是**假日資料**，不是日期算術。本輪刻意不建立假日資料集。因此 `statutory_due_at` 目前是**最早可能**的法定末日，逾期偵測偏保守（可能早於真正的法定逾期）。**仍需律師確認**：這組民法期間規則對本平台 §43 SLA 的最終適用、以及對外承諾文案怎麼寫（不得直接引用未展延的值） | `Backend/utils/complaintSla.js` 的 `SLA_POLICY.restDayExtension = "NOT_IMPLEMENTED"` 與模組說明；`tests/complaintSla.test.js` 有一條測試把「目前不展延」釘住（2026-09-05 → 末日 2026-09-20 為星期日）；`docs/mvp_rules.md` §12.10.4 同步記載 | **OPEN** | 取得權威假日來源並實作 §122 展延（同步更新 `REST_DAY_EXTENSION` 與該測試）；取得律師意見並回寫 `SLA_POLICY`（單一改動點）。**不新增 `L-` gate**（Scope Freeze），以本 ID 追蹤 |
| ~~`REL-01`~~ | `P1` ✅ | Repo / Version control | **2026-08-22 之後的全部成果未進版控** —— 125 modified ／ 188 untracked ／ 4 deleted ／ 2 staged 只存在於 working tree | 風險**隨時間單調增加，且已實際發生過一次損失**：本檔 2026-08-24 被 patch script 截斷為 0 bytes，因未 commit 而只能做受控復原，§4.1～§4.7 至今標記 `RECONSTRUCTED`。到 2026-08-30 暴露面已從 1 檔擴大到 **319 項**，含 13 個 migration、整套 private storage 授權模型、Gate 1～14 foundation，以及正要交付外部律師的四份草稿與 review packet | Phase A 實測：`git log -1` = `70f77f5`（2026-08-22 18:10），`git diff --stat` = 129 files / +22035 / −2876；`git ls-files --others --exclude-standard` = 188。**額外發現：HEAD 的 ignore 規則保護不了當時的 working tree** —— `Backend/private-storage/`（**923 檔**：payment-proofs 362／material-files 385／material-media 175／complaint-evidence 1）與 `/.next-*/`（`.next-verify` 446 MB ＋ `.next-sec02` 333 MB）在 HEAD 皆**未被 ignore** | ✅ **DONE**（2026-08-30）—— **5 顆 dependency-safe preservation checkpoint**，未偽造逐-ticket 歷史。branch `chore/rel-01-preservation-checkpoint`，base `70f77f5`，final HEAD `91574a1`：`e3230c4`（2 檔 ignore rules，**必須第一顆**）／`c3cf4f6`（142 backend ＋ schema ＋ postman）／`391ed7b`（137 frontend）／`ce5694a`（11 canonical docs）／`91574a1`（26 legal packet）。**318 committed ＋ 1 刻意 untracked（`.claude/launch.json`，Owner 決定）= 319**。驗證全綠：unit **213/213**、DB **470/470**、smoke **exit 0**、Postman **129 assertions / 0 failed**、`verify:web` **exit 0**、E2E **595 passed / 39 skipped / 0 failed**。**No push / no PR / no merge；`main` 全程停在 `70f77f5`。** | （已達成）(1) `git status` 只剩刻意 ignore 的產物與 `.claude/`；(2) 每顆 commit 有明確邊界且不跨 scope；(3) `Backend/.env`／`private-storage/`／`.next*`／`test-results/` **tracked = 0**（逐一實測）；(4) `RecentOrdersTable → AttentionOrdersTable` 的 rename 可由 `git show -M --find-renames=40%` 辨識（實測 `R049`，`git log --follow -M40%` 可追到原始建立 commit `b99f560`）；(5) 未 push |
| `READINESS-01` | `P2` | Docs / Information loss | **28 個 product-readiness 項目的 canonical 定義已不存在於 repo** —— `P2-01`～`P2-03`、`P2-05`～`P2-16`、`P3-01`～`P3-12` | 本檔 §2.1 長期宣稱「稽核報告是唯一完整清單」，但那份 2026-08-25 的 Pre-Deployment UI/UX Readiness Audit **從未進入 repo**。於是本檔一邊把 28 項列為 open，一邊指向一份不存在的文件 —— 讀者無從得知這 28 項是什麼，也無法排序或執行 | **2026-08-30 全 git 歷史搜尋（`DOC-01`）**：`git log --all -S` 對 `P2-05`／`P2-16`／`P3-12` 各**只命中 1 個 commit，且都是 `ce5694a`（本檔自己）**；對 `P3-07`／`P2-13` **0 命中**。`git log --all --diff-filter=D` 與「所有曾被 git 知道的路徑」皆**無** audit／readiness 檔名。`git fsck --lost-found` 的 9 個 dangling object 逐一檢視：4 個 blob 無命中；2 個 dangling stash commit（`aadd9458` 2026-08-27／`6c5e8d9b` 2026-08-22）的 tree 內**只有本檔含 `P2-05`**，且該版本（4509 行）逐字寫著同一句「稽核報告是唯一完整清單」，**同樣未列舉** | **OPEN — ACCEPTED INFORMATION LOSS** —— **（2026-08-31 `READINESS-02` 補記）歷史 28 個 ID 的定義仍然不可復原，本結論不變、本條目不刪除。** 就「目前的上線規劃」這一用途而言，已由 `READINESS-02` 的全新 `R2-xxx` 命名空間取代；**歷史 ID 未被重建、未被猜測、未被沿用**，兩套編號完全分離。本條目續留的意義是保存事故事實本身（以及「若 Owner 手上有副本則以副本為準」的處置路徑）。 | (1) **不得憑記憶重建這 28 項，不得自行猜測 ticket 定義**；(2) 本檔**不得再宣稱「唯一完整清單」存在**（§2.1 已於本輪更正）；(3) 目前僅存的可靠殘餘事實：總數 38、已修 10（`P1-01`～`P1-08`、`P1-10`、`P2-04`）、`P2-04` = 全站 sticky 失效（已 DONE）、`P2-16` = 創作者身分揭露（依原報告指示更新既有 §15.3 U-2，不另開 ID）；(4) 若 Owner 手上另有該報告副本，以**該副本**為準補回，並在此註明來源；(5) 若確定無副本，改以**重跑一次 audit** 產生新編號，且新舊編號不得混用 |
| ~~`READINESS-02`~~ | `P2` ✅ | Readiness / Audit | **以目前 HEAD 重新盤點「現在到底什麼擋住 MVP 上線」** | `READINESS-01` 已確認舊 audit 的 28 個 ID 不可復原，因此上線規劃缺少一份可信的現況清單。本輪不重建歷史編號，改以全新 `R2-xxx` 命名空間重審 16 個 domain | 完整報告見 **`docs/readiness-audit-round-2-2026-08-31.md`**。實測 baseline：unit **223/223**、DB **470/470**、smoke exit 0、Postman **129/0**、`verify:web` exit 0、完整 E2E **610 passed / 39 skipped / 1 failed**（該失敗經隔離 `--repeat-each=5` **5/5 全過**，判定為平行負載間歇性失敗）。唯讀 DB 快照（兩庫）；瀏覽器抽查關鍵流程；Node runtime 實測 unhandled rejection 行為 | ✅ **DONE**（2026-08-31）—— **AUDIT-ONLY，未修任何發現。** 產出 19 個 `R2` 條目：EXTERNAL 4／OWNER DECISION 2／P2 4／P3 5／POST-MVP 1／NOT A GAP 3。**新發現 3 項**（`R2-008` 郵件 fire-and-forget 可終止 process、`R2-009` 完整套件間歇性失敗、`R2-010` fresh-DB provisioning 未端到端驗證）＋ 1 項 P3（`R2-011` 清單不揭露可購買性）。**最高風險項 `R2-017`（付費教材交付授權）查核結果為 NOT A GAP** —— 未發現任何洩漏。**結論：若法律核准今天到位，仍是 `CONDITIONALLY`** —— 尚有兩個與法律無關的硬阻擋（`PRE-01` 無任何部署設定且 production + local driver 會 fail-closed 拒絕啟動；O-19 無 production SMTP provider） | （已達成）(1) 不重建歷史 ID；(2) 每個發現皆附 repository／runtime evidence；(3) 與既有 ticket 明確對應而非重複開單；(4) 產出上線 critical path；(5) 未修改任何 production code／schema／migration／legal wording |
| ~~`REL-02`~~ | `P2` ✅ | Reliability / Backend | **fire-and-forget 郵件在 DB 故障時會終止整個 backend process**（`R2-008`） | 訂單已 commit、HTTP 201 已回傳之後才發生，因此使用者看到成功、服務卻整個掛掉。**若最終部署平台沒有自動重啟機制（`PRE-01` 未定），本項應升為 `P1`** | 2026-08-31 實測：6 個呼叫點皆為 `void sendXxxEmail(...)` 且**無 `.catch()`**（`routes/order.js:72,269`、`routes/admin.js:352,441`、`services/materialReview.service.js:226,268`）；`Backend/index.js` **無** `unhandledRejection`／`uncaughtException` handler（grep 0 命中）；`sendEmailWithLog()` 的 try/catch 只包住 transporter，而 `loadOrderEmailContext()`（`emailService.js:78`）與 `loadMaterialEmailContext()`（`:245`）的 `throw` 在其**之外**。**Runtime 實測：** 以相同呼叫形狀在 Node **v18.20.8** 上，unhandled rejection **直接終止 process** | ✅ **DONE**（2026-08-31）—— **rejection 邊界放在「刻意分離 promise 的那一行」，而不是各自的 sender 內部。** 新增 `utils/bestEffortDispatch.js`（單一 helper，**不是** queue／retry／job worker），六個呼叫點全部改為 `dispatchBestEffort(() => sendXxxEmail(...), { operation, reference })`；再稽核 **裸 `void sendXxxEmail` 歸零**。**盤點時修正了 `R2-008` 的一項細節：實際暴露的是 4 個而非 6 個** —— 兩支教材信（`sendMaterialPublishedEmail`／`sendMaterialChangesRequestedEmail`）本來就把整個函式體包在 try/catch 裡，不會 reject；四支訂單信則一開頭就 `await loadOrderEmailContext()`，而那個 `throw` 在任何 catch 之外。**兩者仍一併改用 helper**，理由是不變條件不該依賴「每個 sender 的作者都記得包 try/catch」—— 現況正好證明那種約定會漏。**收 thunk 而非 promise（§7）：** 六支目前都是 `async function`，同步 throw 本來就會轉成 rejection；但 `dispatchBestEffort(sendX())` 會**先求值**參數，若日後有人把某支改成一般函式，同步例外會在 helper 拿到東西之前逸出。`Promise.resolve().then(task)` 把同步 throw 與非同步 rejection 收斂成同一條路徑，兩者由同一個 `.catch()` 接住。**刻意不加 process 層 `unhandledRejection` handler**（§14）—— 那是全域遮蔽 bug，會改變 process 失敗語意；本項修的是**擁有權邊界**。（inventory：Backend 全域原本也沒有這種 handler。）**日誌用 `console.error`（repo 既有慣例，未引入 logging framework），且刻意不在 helper 內寫 `activity_logs`** —— 觸發這條路徑最典型的原因就是資料庫故障，在那當下再寫一筆稽核多半也會失敗，等於在錯誤處理裡再造一個未接住的 rejection。送達／失敗的稽核仍由 `sendEmailWithLog()` 在它拿得到控制權時負責。只記 operation／reference／error message —— 結構上無從記錄信件內文或個資（有測試釘住）。**Regression（7 case，新檔 `tests/bestEffortDispatch.test.js`，不碰 DB／SMTP，故障為確定性注入）：**非同步 rejection 被接住／**同步 throw** 也被接住／**送信前 context 載入失敗**（模擬 `loadOrderEmailContext` 的 `throw`，即 `R2-008` 的真正路徑，比「transporter reject」更關鍵，因為後者早就被內部接住）／同步回傳且永不 throw（業務結果不被延後或打斷）／傳入非函式也不 throw／不記錄敏感內容／**runtime 子 process 對照**：裸 `void` 的 unhandled rejection 確實終止 process（基準線成立），同樣故障經 `dispatchBestEffort` 後 process 存活並印出 `ALIVE`。**端到端實證（真實呼叫點）：** 以 `SMTP_HOST=smtp.invalid.example` 啟動 backend 後跑 smoke —— **14 次真實寄信失敗**（證明路徑確實被走到）、**smoke 全數通過**（業務流程不受影響）、**backend 存活**（`/health` 200）。**業務語意零變更：** 仍然不 await，仍然非阻斷，HTTP 回應與交易結果完全不變。**驗證：** unit **230/230**（223 + 新增 7）、DB **470/470**、smoke **exit 0**、完整 production E2E **611 passed / 39 skipped / 0 failed**。**未觸碰 SMTP provider 選擇（O-19）、schema、migration、frontend 或 legal wording。** | （全部達成）(1) 6 個呼叫點補 `.catch()`（失敗只記錄，不影響主流程）；(2) `index.js` 加 process 層 `unhandledRejection` handler；(3) 補一支證明「郵件失敗不會終止 process」的回歸測試；(4) **不得**改變任何郵件內容或觸發時機 |
| `REL-03` | `P3` | Reliability / Ops | **SMTP 設定缺失沒有啟動時檢查，production 會靜默不寄信** | `JWT_SECRET` 與私有儲存都 fail-closed，唯獨 `SMTP_*` 不是。未設定時 backend 照常啟動、照常收單，**但一封信都不寄，且沒有明顯訊號** —— 訂單成立通知（含匯款帳戶）與教材退回通知都會消失。`REL-02` 讓寄信失敗不再終止 process，這是正確的；但它也讓「設定根本沒填」與「這次寄信剛好失敗」看起來一模一樣 | 2026-08-31 盤點：`services/emailService.js:33-36` 的 `getTransporter()` 只在**首次寄信**時 throw，而該例外會被 `utils/bestEffortDispatch.js` 接住並只印一行 `console.error`；`Backend/index.js` 的啟動序列（`ensureCoreTables()` → `app.listen`）**不含任何 SMTP 檢查**。既有的 `npm run smtp:check --prefix Backend` 是手動腳本，不在啟動路徑上 | **OPEN — UNBLOCKED**（2026-08-31）—— `O-19` 已拍板 Resend（`DEC-14`），阻塞解除。**Priority 維持 `P3`，本輪未自行升級**（CLAUDE.md §11：不自動升級 P3）。但排序上建議**在 production 郵件啟用之前**完成 —— 未設定 SMTP 的 production 會照常收單卻一封信都不寄。**注意本項不需要真實憑證即可實作與測試**（它驗證的是「設定是否齊備」，不是「能不能連線」），因此**不依賴 `PRE-10`**，兩者可平行。**尚未開始。**  **（2026-08-31 `PRE-09` 補記：本項範圍維持 `SMTP_*`，未擴張。** 同一類「production 關鍵設定卻 fail soft」的其餘四項 —— `PUBLIC_BACKEND_URL`／`PUBLIC_WEB_URL`／`JWT_EXPIRES_IN`／前端 `API_BASE_URL` —— 已另立 **`PRE-12`**，因為它們的失敗是**資料被寫壞**與整站 API 失效，與「信寄不出去」不同類；但兩者修法形狀相同，**建議同一輪一起實作**。）** | O-19 拍板後：啟動時（或以明確的部署前檢查）驗證 SMTP 設定完整性，讓設定缺失在部署當下就顯現；**不得**改變 `REL-02` 建立的 rejection 邊界，也不得讓單次寄信失敗影響業務交易 |
| ~~`DX-21`~~ | `P2` ✅ | Testing / Reliability | **完整回歸套件出現間歇性失敗，baseline 不可重現**（`R2-009`） | 紅燈需要人工解釋，會侵蝕每一輪驗收的可信度 —— 與 `DX-06`／`DX-15`／`DX-18` 同一類問題的殘餘 | 2026-08-31 完整 production E2E **610 / 39 / 1**（baseline 為 611 / 39 / 0）。失敗者：`critical-acceptance.spec.ts:62 AUTH | CI | 2) login success stores auth and redirects`，症狀為登入後 URL 停在 `/login`（10 秒內 14 次輪詢皆同）。**隔離重跑 `--repeat-each=5` → 5/5 全過**，因此非產品缺陷。亦**非資料相依**：該 spec 的 `beforeEach` 已安裝 `installCoreApiMocks`，且 mock 確實攔截 `**/api/auth/login`（`helpers/mock-api.ts:51-52`） | ✅ **DONE**（2026-08-31）—— **根因已確定，且不是產品缺陷：`page.goto()` 之後、React hydration 完成之前送出的點擊會靜默失效。** 按鈕在 SSR HTML 裡已經存在且可見，因此 Playwright 找得到、點得下去、回報成功 —— 但那一刻按鈕上還沒有 React 的 `onClick`（登入頁用的是 `onClick={() => void handleLogin()}`，不是 form submit），於是**連 `/api/auth/login` 請求都不會發出**，測試接著在 `/login` 上等到逾時。**Instrumented 重現（1 / 80，平行負載）**，失敗當下捕捉到的狀態決定性地排除了其他假設：`loginRequests: 0`／`loginResponseStatus: null`／`roleCookie: null`／`localStorageRole: null`／`successBannerVisible: 0`／`consoleErrors: []`／`pageErrors: []` —— **請求從未發出**，因此與 cookie／middleware race、mock 契約、backend、`parent@example.com` 的密碼或資料庫狀態**全部無關**。另以探針確認同一顆按鈕確實會經歷 `{found:true, hydrated:false}` → `{found:true, hydrated:true}` 兩階段。**排除的假設（依 §5／§9／§10／§13 逐一查證）：** route 註冊順序正確（`installCoreApiMocks` 在 `beforeEach`，早於 `goto`）；route 為 page-scoped，測試間不共用、無覆蓋風險；`**/api/auth/login` 與 `**/api/backend/**` 不重疊；請求從未到達真實 backend。**修法：** 新增 `tests/e2e/helpers/hydration.ts`（`waitForHydration` / `clickWhenHydrated`）—— 等待 React 把 props 掛到**那一個** DOM 節點（`__reactProps$`），也就是「這次點擊會不會有效」的直接判準，而不是等一個猜出來的毫秒數。`critical-acceptance.spec.ts` 內 **6 個「goto 之後第一個 React 互動」**的點擊改用它（登入驗證／登入成功／結帳兩處／優惠碼／付款憑證）。**證據：** A/B 在**與重現時完全相同的條件**下（`--repeat-each=40` × 2 project = 80 runs）由 **1 / 80 失敗** 變成 **80 / 80 通過**；單一測試 `--repeat-each=30` 預設平行度 **30 / 30**；新增 `tests/e2e/hydration-guard.spec.ts`（4 case）**釘住機制本身而非重跑會 flake 的流程**：證明「可見但尚未 hydrate」是真實狀態、證明 helper 會關掉該窗口，並反向證明 helper 在節點永遠不被 hydrate 時**會確實逾時**（避免日後 React 換鍵名後靜默退化）。**未使用任何遮蔽手段**：無 `test.skip`／`fixme`／`slow`、無 `waitForTimeout`、未調 retries／timeout／workers、未加 serial、未弱化任何斷言、未新增 skip。**production 程式碼 0 改動** —— 真實使用者不可能比 hydration 更快點擊，且即使點空也會再點一次；這是測試的時序假設問題，不是產品缺陷。**驗證：** `verify:web` exit 0、完整 production E2E **615 passed / 39 skipped / 0 failed**。**殘留（已記錄未修）：** 同檔另有兩處 `setInputFiles` 也是 goto 後的第一個 React 互動，機制相同但未觀察到失敗，本輪依「最小且有證據」原則未動。 | （全部達成）(1) **先穩定重現再修**（例如 `--repeat-each` ＋ 完整平行負載）；(2) 修 root cause，**不得**用 retry／timeout 放寬／serial／`workers=1` 掩蓋；(3) 修復後完整套件連續兩次 **0 failed**；(4) **不得**新增 skip 換綠燈（現有 39 個皆為既有 viewport guard） |
| ~~`PRE-05`~~ | `PRE-PROD` ✅ | DB / Deployment | **全新 production 資料庫的 provisioning 從未端到端驗證**（`R2-010`） | 兩個現有資料庫都是「長期逐步套 migration」形成的，不能證明「空資料庫 → 啟動 Backend → bootstrap 建好」會得到同一份 schema。production 一旦以微妙不同的 schema 啟動，問題會很晚才浮現 | 2026-08-31 實測：40 個 migration 檔但**無 migration ledger**（grep `schema_migrations` 0 命中）；`scripts/apply-migration.js` 檔頭自述 canonical 路徑是 `bootstrapModel.js` 的 idempotent 區塊；`docs/db-backup-and-migration.md` 只涵蓋跨電腦備份／還原，**無**全新資料庫建置程序。**靜態比對：`bootstrapModel.js` 的 `CREATE TABLE IF NOT EXISTS` 涵蓋 26 / 26 個 live table，table 層級完全相符**；`verifyCriticalSchema()` 另有 fail-closed drift 檢查。**未驗證的是 column／constraint／trigger／partial index 層級** | ✅ **DONE**（2026-08-31）—— **驗證擴大是必要的：表數量相同，但功能是壞的。** 完整報告見 **`docs/pre-05-fresh-database-verification-2026-08-31.md`**。**發現並修復一個真實 provisioning 缺陷：** `bootstrapModel.js` 把 `materials.file_key` 建成 `NOT NULL`，而 canonical `db/db_schema.sql` 明載它可為空（「新建教材此欄為 NULL」）。後果只在**全新資料庫**上出現 —— 既有兩個資料庫早就是 nullable，而 `CREATE TABLE IF NOT EXISTS` **不會修改既存表**，因此既有的 DB 470／smoke／E2E **在結構上不可能發現它**。實測：全新庫 `POST /materials` → **500** (`null value in column "file_key" ... violates not-null constraint`)，亦即**全新部署的平台完全無法上架任何教材**。修法為 bootstrap 該欄改回 `TEXT`（與 canonical 一致），**不影響既有資料庫**；修復後以**第三個全新空庫**從零重驗，smoke **73 項全過**。**驗證方法：** 三個可拋棄庫（名稱須符合 `^teaching_platform_pre05_verify_\d+$`，建立前以 `pg_database` 證明不存在，受保護名稱為硬拒絕清單）；空庫 → 啟動 → **26 表 ＋ `/health` 200**、**未 replay 任何 migration**；第二次啟動 idempotent（無重複物件錯誤、sentinel 資料保留）；以 `information_schema` + `pg_catalog` 做**定義層級**（非名稱）比對，涵蓋欄位／型別／預設／可空性／PK／FK／UNIQUE／CHECK／索引／部分索引／trigger／function。**關鍵發現：多數差異其實是「參考庫」的歷史漂移，不是全新庫的缺口** —— 以 `db/db_schema.sql` 裁決後，`materials.price`（NUMERIC）、`order_items.price_snapshot`、`reports.created_at`（TIMESTAMPTZ）、id 無預設、`teacher_id NOT NULL`、`orders.user_id` FK 無 `ON DELETE`、已 DROP 的 legacy `orders` 欄位 —— **全新庫全部正確，參考庫才是漂移的一方**（參考庫甚至有重複 FK：`materials.approved_file_id` ×2、`pending_file_id` ×2、`manual_payment_proofs.reviewed_by` ×2）。**關鍵不變條件逐一確認存在於全新庫：** legal_documents 每型別單一 published 的 partial UNIQUE、已發布內容不可竄改 trigger、consent_records 與 material_rights_reviews 的 append-only trigger、16/16 部分索引、entitlement 四值 CHECK、account_status CHECK。**刻意未執行 DB 套件／Postman／E2E 於全新庫** —— `run-db-tests.js` 與 DX-19 harness 皆硬釘 `teaching_platform_security_test`，那是刻意的安全護欄，**不為 PRE-05 削弱**；全新庫的功能證明改由 smoke 73 項承擔。**驗證：** unit **230/230**、DB **470/470**（既有庫回歸）、smoke（全新庫）**exit 0**。**既有資料庫零變更：** 參考庫結構指紋前後 **byte-identical**（sha256 `c2c8edb2df40aebf`），`legal_documents`／`consent_records` 兩庫皆維持 0；三個可拋棄庫已全部 DROP。 | （全部達成）(1) 在**可拋棄**的資料庫上執行「空庫 → 啟動 Backend → 與 `db_schema.sql` 逐欄比對」；(2) 結果寫進 ops 文件成為正式 provisioning 程序；(3) **不得**為此改動 `teaching_platform` 或 `teaching_platform_security_test`；(4) 若發現落差，先記錄再決定要補 bootstrap 還是補 migration |
| `PRE-06` | `P3` | DB / Provisioning parity | **bootstrap 與 canonical schema 仍有 2 處 parity 缺口，另有 8 個熱路徑索引只存在於既有資料庫** | `PRE-05` 已修掉唯一會造成功能失敗的那一個（`materials.file_key`）。剩下這些**未造成 smoke 失敗**，但會讓全新 production 庫與既有庫在細節上不同 —— 索引缺失屬效能面（`orders(user_id)`／`orders(status)` 等是常態查詢路徑），`DEFAULT`／FK 缺失屬 canonical parity | 2026-08-31（`PRE-05` 定義層級比對，見 `docs/pre-05-fresh-database-verification-2026-08-31.md`）：**(a)** `manual_payment_proofs.review_status` 缺 `DEFAULT 'pending'`（canonical `db_schema.sql:398` 有）；**(b)** `materials.reviewed_by` 缺 `REFERENCES users(id) ON DELETE SET NULL`（canonical 有）；**(c)** 8 個索引只存在於既有庫、且 `db/db_schema.sql` **並未宣告**：`orders(user_id)`／`orders(status)`／`orders(user_id,status)`／`orders(payment_mode)`／`materials(teacher_id)`／`materials(category)`／`order_items(order_id)`／`order_items(material_id)` | **OPEN — SAFE / INDEPENDENT** | (1) (a)(b) 補進 bootstrap 使其與 `db/db_schema.sql` 一致；(2) (c) **先決定 canonical 歸屬** —— 這 8 個索引是應該補進 `db_schema.sql` ＋ bootstrap，還是確認為不需要的歷史產物？**不得只因既有庫有就照抄**；(3) 任何改動只影響 provisioning，**不得** ALTER 既有兩個資料庫；(4) 以可拋棄庫重跑 `PRE-05` 的比對證明收斂 |
| `PRE-07` | `P1` | Infra / Deployment | **Render 部署設定（repo 目前完全沒有任何部署設定）** | `DEC-13` 已選定 Render，但 repo 內**不存在**任何部署描述檔，沒有可重現的方式把這個系統跑起來。沒有它，部署是一次性的手動操作，無法稽核也無法重建 | 2026-08-31 再次確認 `Dockerfile`／`docker-compose.yml`／`Procfile`／`vercel.json`／`render.yaml`／`fly.toml`／`railway.json`／`app.yaml`／`nixpacks.toml`／`captain-definition`／`.github/` **全部不存在**；root `package.json` 的 `start` 為 `node Backend/index.js`；frontend 為 `next start`（**無法 static export**）；health check endpoint 已存在（`Backend/index.js:136` → `{"status":"ok"}`） | **OPEN — CONFIG READY（2026-09-01）／PROVIDER RESOURCES NOT CREATED**。  **Source ／ config readiness ＝ PASS（事實紀錄）：** `DEPLOYMENT_SOURCE_GATE = PASS` —— PR **#3** 已於 2026-09-01 merge 進 `main`（merge commit `e8da6e8`，fast-forward，無衝突，repo 無 CI workflow），`main` **已包含 `PRE-13` 的 s3 driver**（`Backend/storage/s3PrivateFileStorage.js` ＋ `config/privateFileStorage.js` 的 `driver === "s3"` 分支），local `main` 與 `origin/main` 同步。**該 PR 的實際範圍為 22 個 commit ／ 約 350 個檔案**（本輪新增 3 個，其餘 19 個為分支上既有的 REL-01 checkpoint／legal packet／e2e／a11y 工作）—— 記錄為 implementation checkpoint 事實，**不因歷史整潔而回退或重開**。新增部署設定與前置檢查工具（皆已在 `main`）：**`render.yaml`**（兩個 Render Free Web Service／Singapore／`NODE_VERSION=22`／health check `/health`／**無 persistent disk**／所有 secret 為 `sync: false`；刻意不寫 `autoDeployTrigger`，語法未實測，改為 dashboard 手動關閉 Auto-Deploy）、**`Backend/scripts/check-production-db.js`**（唯讀；以 `pg_stat_ssl` **實測**連線加密而非只信 `sslmode` 字串；擋下已知 dev／test 資料庫；必須在 backend 首次啟動**之前**執行，否則 `ensureCoreTables()` 一跑就再也無法證明資料庫原本是空的）、**`Backend/scripts/check-production-storage.js`**（預設唯讀，`--drill` 執行 `PRE-08` 物件儲存還原演練；把 bucket private／Keep all versions／Object Lock off 三項**設定**變成可重複執行的斷言）。兩支腳本皆已以 good 與**刻意設定錯誤**的 bucket／DB 實測，正確情境 exit 0、錯誤情境全部攔截並 exit 1。**PostgreSQL 17 client tools ＝ 17.11**（`pg_dump`／`pg_restore`／`psql` 三者一致），且持久化 User PATH 只含 `C:\Program Files\PostgreSQL\17\bin`（**無 PG13 條目，無 shadowing 風險**）；PG13 server 未被移除或修改。**STEP 2（Neon production database）✅ PASS（2026-09-01）：** Neon Free ／ AWS Singapore ／ **PostgreSQL 17.11** ／ database `neondb` ／ user `neondb_owner`。前置檢查以 `check-production-db.js` 唯讀執行，**RESULT: PASS — 0 problems, 0 warnings**：TLS **TLSv1.3 / TLS_AES_256_GCM_SHA384，伺服器憑證通過驗證（issuer ＝ Let's Encrypt，公開信任鏈）**；`[5] EMPTY database` —— **`DEC-15` 的 fresh-DB 要求已在 bootstrap 之前取得證據**（一旦 `ensureCoreTables()` 跑過就再也無法證明）；client `pg_dump` 17.11 ≥ server 17 → `PG_BACKUP_TOOL_GATE` PASS。**未執行 bootstrap、未建立 admin、未寫入任何資料。**  **同輪修正一個 checker bug（checker-only，不影響 production code）：** `[3]` 原本以 `pg_stat_ssl` 判定加密，那量的是 **PostgreSQL backend 那一段**；Neon 以 SNI 路由、**必須在 proxy 終結 TLS**，因此 backend 永遠看到明文、`pg_stat_ssl.ssl` 恆為 false（同理 Neon 不支援 `sslinfo`），造成 **false negative**。已在本機以「TLS proxy → 明文 PostgreSQL」拓撲**重現**該誤判，並改為量測**本行程自己的 socket**（`client.connection.stream`）：要求 `encrypted` ＋ **憑證通過 CA 驗證（`authorized`）** ＋ 協定 ≥ TLSv1.2，取不到 socket 即 fail-closed。**這是收緊而非放寬** —— 舊判準完全不檢查憑證驗證，`sslmode=no-verify` 連到非 proxy 伺服器時 `pg_stat_ssl.ssl` 為 true 會被舊檢查放行；新檢查以三種情境實測（正確設定 PASS／明文連不上／加密但憑證未驗證 FAIL）。**另記一項未來風險：** `pg` 目前把 `sslmode=require` 當作 `verify-full`，但 **pg v9 / pg-connection-string v3 將改為 libpq 語意（保證較弱）**；屆時 `require` 不再驗憑證。建議 production `DATABASE_URL` 改寫為明示的 **`sslmode=verify-full`**（目前行為完全相同，只是不依賴預設值）。**尚未建立的 provider 資源** —— Render service 與 production secret 仍為 **NOT CREATED**。Dependency：`PRE-09`（環境變數契約須先定案 —— 服務定義本身就要列出環境變數，且 backend 對 `JWT_SECRET`／私有儲存為 fail-closed，設定不齊根本起不來）；hostname 部分另依賴 **production 網域**（`PENDING`） | **【2026-08-31 依 `DEC-16`／`DEC-17` 更新】** (1) Frontend／Backend 兩個 Render **Free** Web Service 與 **Neon Free** PostgreSQL 的設定可重現（**不用** Render Free Postgres —— 30 天到期）；(2) ~~Persistent Disk 掛載於 `PRIVATE_FILE_STORAGE_PATH`~~ → **改為** `PRIVATE_FILE_STORAGE_DRIVER=s3` ＋ 五個 `PRIVATE_FILE_STORAGE_S3_*`，且**確認 bucket 沒有任何 public access**；**（2026-08-31 `PRE-08` 查證後新增三項 bucket 設定要求）** (2a) **維持預設 lifecycle「Keep all versions」——不得設定任何會過期舊版本的 lifecycle rule**，那是誤刪可復原的唯一來源；(2b) **不得啟用 Object Lock**（免費但**啟用後無法關閉**，且會擋掉上傳 rollback 與 `cleanupOrphans` 這兩條合法刪除路徑；誤刪已由 versioning 覆蓋）；(2c) application key **scope 限定單一 bucket、權限 Read & Write**，不得使用 master key；(3) health check 指向 `GET /health`；(4) **Backend 維持單一 instance**（`routes/order.js:27` 的 `uploadIdempotencyCache` 為 process 內狀態；Render disk 本身亦只允許單 instance）；(5) `NODE_ENV=production` 下三條 fail-closed 分支經實測確實如預期；(6) **不得**在 production Backend hostname 鎖定前上傳任何真實素材（見 §1 LAUNCH GUARDRAIL） |
| `PRE-08` | `P1` | Infra / Data safety | **持久化儲存與備份／還原程序（含實際還原演練）** | Render 的 disk 快照與 Postgres 備份是自動的，但**自動備份不等於驗證過能還原**。本平台的私有儲存放的是已售出的教材與人工核帳的唯一證據，還原失敗沒有第二份來源 | Render 官方：persistent disk 每 24 小時自動快照、保留至少 7 天（見 `docs/owner-decision-round-3-provider-selection-2026-08-31.md` §3）；`docs/db-backup-and-migration.md` 目前只寫本機情境；私有資料實測 1,073 檔／5.7 MB | **OPEN — RESEARCH ✅ DONE（2026-08-31）／DRILL PENDING DEPLOYMENT**。Dependency：`PRE-07`（演練需要真實資源）  **官方查證結果（B-2 已解除）：** **Neon Free** —— **無 automated backup**；instant restore（PITR）**僅 6 小時**且上限 1 GB 變更歷史；含 **1 個 manual snapshot**；**支援 `pg_dump` / `pg_restore`**（官方明列為備份途徑之一）；scale-to-zero **只影響運算不影響資料**（官方：「Storage stays allocated」「None of these limits delete your data」）；Free 無到期日；**專案刪除為 irreversible，但有 7 天 deletion recovery 期可經 API/CLI 復原**。**Backblaze B2** —— durability **99.999999999%（11 個 9）**；**bucket 預設 lifecycle ＝「Keep all versions」**，版本保留至明確刪除為止；**S3 `DeleteObject` 不帶 `versionId` 時只插入 delete marker，前一版本仍可復原**（官方明文），帶 `versionId` 才是永久刪除；**本 repo 的 `delete()` 不送 `versionId`**（`storage/s3PrivateFileStorage.js`），故**答案是 A：可透過 version history 恢復**；所有版本**計入儲存量**（因此計入 10 GB 免費額度）；**bucket 只有在不含任何檔案版本時才能刪除**；application key 刪除只移除存取權、**不刪資料**；**Object Lock 免費但啟用後無法關閉**。**結論：6 小時 PITR 不足以覆蓋週末，因此 `pg_dump` 由「選配」升級為「必要」。** | **【2026-08-31 依 `DEC-16` 更新；查證已完成】** ~~(1) 確認 B2 與 Neon Free 各自的備份能力與保留期~~ ✅ **已完成（見左欄）**；(2) **完成一次真實的還原演練**並記錄耗時與結果；~~(3) 更新 `docs/db-backup-and-migration.md` 涵蓋 production 情境~~ ✅ **已完成（2026-08-31，新增 §8「Production（NT$0 MVP）備份與還原」**：含 pg_dump/b2 sync 的固定順序與理由、bucket 必須維持／必須避免的設定、資料庫與物件儲存兩份還原演練腳本、以及本策略明確未涵蓋的四件事）；(4) 明確記載「檔案」與「資料庫」兩者的還原必須一致（storage key 指向不存在的檔案等同資料遺失） |
| ~~`PRE-09`~~ | `P1` ✅ | Infra / Configuration | **production 環境變數契約** | backend 對多項設定是 fail-closed，設定不齊會直接拒絕啟動；另有數項是刻意 fail-soft（設定不齊會安靜地半殘）。沒有一份明確契約，部署時只能靠記憶，而 fail-soft 的那幾項不會有人發現 | fail-closed：`utils/jwt.js:30,38,45`（`JWT_SECRET`）、`config/db.js`、`config/privateFileStorage.js:143-149`（`PRIVATE_FILE_STORAGE_PATH`）、`:150-160`（`ALLOW_LOCAL_IN_PRODUCTION`）、`:132-137`（driver 非 local）。fail-soft：`config/paymentBankInfo.js:26`（四個 `PAYMENT_BANK_*` 缺 → 付款指示顯示「尚未設定」）、`SMTP_*` 缺（→ 照常啟動、照常收單、一封信都不寄，見 `REL-03`） | ✅ **DONE**（2026-08-31）—— 契約產出於 `docs/production-environment-contract.md`，**0 行 production code、0 個 schema／migration**，唯一的檔案變更是 `Backend/.env.example` 的對齊（僅佔位符，無任何真實值）。**普查涵蓋 5 處動態讀取**（`process.env[<name>]`：`config/privateFileStorage.js:64,65,77`、`scripts/api-smoke-test.js:74`、`scripts/run-postman.js:26`）—— 只 grep `process.env.NAME` 會漏掉 `PRIVATE_FILE_STORAGE_DRIVER`／`PATH` 與四個 `MAX_*` 整組。**分類結果：** FAIL CLOSED 5／CURRENTLY FAILS SOFT 11／OPTIONAL 11／DEV-TEST ONLY 14／PLATFORM PROVIDED 2／PENDING OWNER DOMAIN 3（與前列重疊標記）。**失敗行為皆為實測，非推論**：私有儲存 fail-closed 11 種組合逐一注入驗證（含 legacy 別名衝突、`ALLOW` 的 truthy 變體 `yes`／`TRUE`／`1`／`false`）；`readPositiveInt` 對 `"abc"`／`"0"`／`"-5"` 皆 throw；`jwt.sign` 對 `JWT_EXPIRES_IN="abc"`／`"7dd"` throw；`pg-connection-string` 的三種 `sslmode` 解析結果。**三項具體發現：**(1) **資料庫只有一條 production 路徑** —— 離散 `PG*` **無法開啟 TLS**（`config/db.js` 從不設 `ssl` 鍵，`grep -n ssl` 零命中；`pg` 的 `defaults.ssl` 實測為 `false`；本 repo 亦不讀 `PGSSLMODE`），因此 production 必須用帶 `sslmode` 的 `DATABASE_URL`，`PG*` 就 production 而言屬 DEV/TEST；契約刻意**不**把兩者並列為對等路徑。(2) **`PUBLIC_BACKEND_URL` 未設會把錯誤的 host 永久寫進資料庫** —— 回退 `http://localhost:3000` 後，`mediaUrl()` 會把該絕對 URL 寫入 `cover_image_url` 等欄位。這正是 §5 明列的 wrong-host persistence，已另立 **`PRE-12`**（不與 `REL-03` 重複）。(3) **`NEXT_PUBLIC_*` 全 repo 為 0** —— 沒有任何設定會進入瀏覽器 bundle，「secret 經 `NEXT_PUBLIC_*` 外洩」在結構上不存在；契約已把「維持為 0」列為規則。**`.env.example` 對齊**：補上先前**完全缺漏**的 `NODE_ENV` 與 `PUBLIC_WEB_URL`（後者未設時信件連結指向 `localhost:3001`，連 dev 都不對 —— dev 前端是 3010），補上 `DATABASE_URL` 的 `sslmode` 指引、`PUBLIC_BACKEND_URL` 的持久化警告、Resend 的非 secret 參考值（`DEC-14`），並把 `https://api.example.com` 換成明顯佔位符。**未新增第二份 env template**（避免重複來源）。**驗證：** unit **230/230**、`git diff --check` clean、變更檔案的 secret-shape 掃描 clean、`.env.example` 所有已指派值皆為空字串或無害 dev 預設。**未部署、未建立任何 Render 資源、未設定 SMTP、未變更 DNS、未發明 production 網域、未建立 production DB。** | (1) 完整變數清單，逐項標明 fail-closed／fail-soft 與缺漏後果；(2) 與 `Backend/.env.example` 對齊（**不得寫入任何真實值**，CLAUDE.md §8）；(3) 涵蓋 `NODE_ENV`／`PORT`／`DATABASE_URL`（含 `sslmode` 選擇）／`JWT_SECRET`／`PRIVATE_FILE_STORAGE_*`／`PAYMENT_BANK_*`／`SMTP_*`／`PUBLIC_BACKEND_URL`／`PUBLIC_WEB_URL`／`API_BASE_URL`；(4) 提供一份可執行的部署前檢查（與 `REL-03` 的啟動時檢查互補，不重複） |
| `PRE-10` | `P2` | Infra / Email | **Resend SMTP 設定與驗證程序（含 DNS）** | `DEC-14` 已選定 Resend，但寄件網域驗證與 DNS 記錄尚未進行；沒有它，production 的信寄不出去或會進垃圾信 | `services/emailService.js` 為通用 nodemailer SMTP（**不需任何 SDK**）；`SMTP_PORT=465` 會使現有 `secure = (port === 465)` 自動啟用 implicit TLS（零程式碼改動）；既有驗證工具 `npm run smtp:check --prefix Backend`（`scripts/smtp-smoke-test.js`）已存在 | **OPEN — BLOCKED ON PRODUCTION DOMAIN**（`PENDING OWNER DECISION / PURCHASE`）—— SPF／DKIM／DMARC 都必須設在寄件網域上，沒有網域就無法進行 | (1) 寄件網域完成 Resend 驗證；(2) SPF／DKIM（建議加 DMARC）已設定；(3) `SMTP_FROM` 的 production 寄件身分確定；(4) 以 `npm run smtp:check` 實測連線與實寄成功；(5) **真實憑證只存在於部署環境或 git-ignored 的 `Backend/.env`**；(6) **不得**改用 Resend SDK（`DEC-14` 明文維持 nodemailer ＋ 通用 SMTP） |
| `PRE-11` | `P2` | Infra / Release | **production provisioning 與首次發布** | 把前述各項串成一次可重現的上線；provisioning 必須走 `PRE-05` 已驗證的 fresh-DB 路徑 | `PRE-05` 已於 2026-08-31 端到端驗證全新資料庫可用（新庫 smoke **73/73**，見 `docs/pre-05-fresh-database-verification-2026-08-31.md`）；bootstrap 於 `Backend/index.js:161` 失敗即 exit 1 | **OPEN — NOT STARTED**。Dependency：`PRE-07`／`PRE-08`／`PRE-09`／`PRE-10`／`REL-03`；法律文件發布另依賴 `PRE-03` / `P1-09`（外部） | (1) 全新 production 資料庫經 bootstrap 建立並通過健康檢查；(2) **不匯入任何 dev／test 資料**（`DEC-15`）；(3) initial Admin 僅以 `npm run create-admin --prefix Backend` 建立（公開註冊永遠不能建 admin，CLAUDE.md §3）；(4) 上架教材走真實審核流程（`approved_file_id` 只由 Admin 核准路徑寫入）；(5) `PRE-02` 的 `legacy_public` 查核為 0；(6) **法律文件在律師核准前不得發布** |
| `PRE-12` | `P2` | Infra / Configuration · Data integrity | **production URL／設定前置檢查 —— `PUBLIC_BACKEND_URL` 未設會把 `localhost` 永久寫進資料庫** | 這不是「顯示錯了」而是**資料被寫壞**：`utils/publicUrl.js:11` 在 `PUBLIC_BACKEND_URL` 與 `API_PUBLIC_URL` 皆未設時回退 `http://localhost:<PORT>`，而 `services/materialMedia.service.js:90` 的 `mediaUrl()` 會把該**絕對 URL**寫進 `materials.cover_image_url`／`material_images.image_url`／`demo_video_url`。事後修正 `PUBLIC_BACKEND_URL` **不會**回寫既有列 —— 那些素材永久失效。Owner 已明文的 LAUNCH GUARDRAIL（素材上傳前必須鎖定 hostname）目前**只靠人記得**，程式沒有任何防線 | 2026-08-31 `PRE-09` 普查（讀碼 ＋ 實測）：`utils/publicUrl.js:11-16` 回退 localhost 且**不警告**；`materialMedia.service.js:90` `mediaUrl()` ＝ `publicBaseUrl()` ＋ path，回傳值即寫入欄位；`grep -rn` 確認 `publicUrl.js` 無任何 production 檢查。同類 fail-soft 另有三項：`PUBLIC_WEB_URL` 未設 → 所有交易信連結指向 `http://localhost:3001`（`emailService.js:22`；連 dev 都不對，dev 前端為 3010）；`JWT_EXPIRES_IN` 格式錯誤 → 啟動正常但**第一次登入**才 `jwt.sign` throw（實測 `"abc"`／`"7dd"`）；前端 `API_BASE_URL` 未設 → 回退 `http://localhost:3000`，整站 server 端 API 呼叫失效 | **OPEN — NOT STARTED**。**與 `REL-03` 不重複**：`REL-03` 只涵蓋 `SMTP_*`（郵件寄不出去），本項涵蓋 URL 與 auth 設定（**資料被寫壞**與整站 API 失效），兩者失敗類型與影響面不同；但兩者的修法形狀相同，**建議同一輪一起實作**。不需要真實憑證或網域即可實作與測試，故不依賴 `PRE-10` | (1) `NODE_ENV=production` 時 `PUBLIC_BACKEND_URL`（或別名）未設 → **拒絕啟動**（與既有的私有儲存 fail-closed 同一種取捨：寧可起不來，也不要寫壞資料）；(2) 同樣條件下 `PUBLIC_WEB_URL` 未設 → 至少明確失敗或啟動時顯著警示；(3) `JWT_EXPIRES_IN` 若有設，於**啟動時**驗證格式，不要留到第一次登入；(4) 前端 `API_BASE_URL` 於 production 未設時明確失敗，不得靜默退回 localhost；(5) **不得**引入通用設定框架 —— 缺口是具體的四個變數，不是缺少框架；(6) **不得**放寬或移除任何既有的 fail-closed 檢查 |
| ~~`PRE-13`~~ | `P1` ✅ | Infra / Storage | **Generic S3-compatible private file storage driver** | NT$0 部署目標與 `local` driver **互斥**：`config/privateFileStorage.js` 在 production ＋ local 時要求持久化路徑並明示 opt-in，而**所有免費方案都不提供 persistent volume**（Render 官方明文 "Free web services cannot use persistent disks"；Railway／Fly.io／Koyeb／Northflank 同樣沒有）。因此免費方案上只有兩種結局：fail-closed 拒絕啟動（正確），或強行 opt-in 後每次 redeploy／spin-down 都刪光已售教材與付款憑證 | 2026-08-31 實測：`grep "require(\"fs\")" Backend/services Backend/routes` **零命中** —— 檔案操作全部集中在 storage 層，因此換 driver 不需動業務程式碼；六個交付點全部只呼叫 `storage.openReadStream()`；`openReadStream()` 在四個呼叫端都**未被 await**，因此新 driver 必須同步回傳 | ✅ **DONE**（2026-08-31）—— **新增 `Backend/storage/s3PrivateFileStorage.js`，0 行 business logic 改動、0 個 schema／migration。** **generic S3 而非供應商 driver**：B2／R2／Supabase／iDrive e2 走同一支程式碼，換供應商是改五個環境變數（`DEC-16` 的可逆性就靠這個）。**三個設計要點：**(1) `openReadStream()` **同步**回傳 `PassThrough`，非同步的 GetObject 稍後接上 —— 因為四個呼叫端都沒有 await；錯誤轉成 stream 的 `'error'`，`utils/fileDownloadResponse.js` 早就在聽了，**呼叫端零改動**。(2) 用 `AbortController` 處理 `routes/materials.js` 的 **probe open**（先開一次取 `totalBytes` 再立刻 destroy）—— stream 在 GetObject 回來前被 destroy 就中止請求，**位元組從來不會離開供應商**；這是 driver 層最佳化，**未修改該 business logic**。(3) `delete()` 先 HeadObject 才能回傳與 local 一致的布林值（S3 的 DeleteObject 是冪等的），因為 `cleanupOrphans()` 用它計數。**fail-closed：** 五個 `PRIVATE_FILE_STORAGE_S3_*` 缺任一（含空白字串）即拒絕啟動；**既有的 local fail-closed 三條完全未放寬**，且新增測試把它們釘住。**測試（+34）：** `privateFileStorageParity.test.js`（24）以**同一組斷言跑兩個 driver**，涵蓋 upload／stat／exists／full read／range read／delete／missing／invalid key／namespace isolation／checksum，另加空檔案、multipart（> 5 MiB）、probe-then-destroy；fake S3 是**真的 HTTP server**（`tests/helpers/fakeS3Server.js`），走真的 SDK 與 wire format，不是 stub。`privateFileStorageConfig.test.js`（10）釘住整個 driver 選擇與 production fail-closed 矩陣。**回歸全綠：** unit **264/264**（230 + 34）、DB **470/470**、smoke **exit 0 於 local driver**、smoke **exit 0 於 s3 driver**（同一套 73 項檢查跑在物件儲存上）、backend 重啟後 smoke **再次 exit 0**。**Persistence gate（以 DB 記錄的 storage key 逐一重讀並比對 `checksum_sha256`）：重啟前 11/11 intact、重啟後 11/11 intact。** **未部署、未建立任何 bucket、未綁卡、未輸入任何 production secret** —— 全部驗證跑在本機的 fake S3 上 | （全部達成）(1) 沿用既有 `PrivateFileStorage` 抽象，維持 `put`／`openReadStream`／`stat`／`exists`／`delete`；(2) 維持 namespace allowlist、storage key safety、path traversal 防線、SHA-256 語意、MIME 與原始檔名 metadata、HTTP Range、streaming、授權與下載票語意；(3) **不得**把 bucket 改成 public，Backend 維持唯一授權入口；(4) **不得**修改 business authorization semantics；(5) **不得**為了讓測試通過而弱化 production fail-closed |
| `BUY-07` | `P3` | Buyer / Marketplace | **教材清單不揭露可購買性，詳情頁才揭露**（`R2-011`） | 買家在清單上看不出某張卡片其實已暫停販售，要點進詳情頁才知道。**launch impact 低** —— production 無法產生「published 但無可交付檔案」的教材 | 2026-08-31 實測：`routes/materials.js` 的 `MATERIAL_COLUMNS`（:45-49）**不含** `approved_file_id`，`is_purchasable` 只在詳情 handler 計算（:455, :488）；前端 `lib/material-mapper.ts:37` 對清單列預設 `isPurchasable: true`。瀏覽器複驗：`/materials` 40 張卡片**無任何**「暫停販售」標示；詳情頁則完全誠實（停用 CTA ＋「此教材目前沒有可供下載的教材檔案，已暫停販售。」＋「暫停販售」標籤）。**現況只由 legacy 種子資料造成**（建立強制 `fileId`、核准拒絕無檔上架） | **OPEN — SAFE / INDEPENDENT** | (1) 若要修，讓清單投影帶出可購買性並在卡片上誠實標示；(2) **不得**為此在前端猜測（例如以價格或封面推斷）；(3) 需同步 `public.spec.ts` 的清單斷言 |
| ~~`TEST-01`~~ | `P2` ✅ | Testing / Security · Legal routes | **四條 public legal route 的「未發布即 404、絕不洩漏 draft」不變條件無任何 E2E 覆蓋** | 這是**安全與誠實性**不變條件，**與條文內容無關**，因此完全不依賴律師／會計師。它保護的是「使用者以為自己讀過了條款」這個比 404 更危險的狀態。條文一旦核可，這四頁會成為全站最常被閱讀的公開頁 —— 護欄現在寫好，發布時直接生效 | 2026-08-30 實測：`app/terms`／`app/privacy`／`app/refund`／`app/creator-agreement` 的 `page.tsx` **四條 route 皆存在**；以 `goto("/terms"` 等四個字串搜尋 25 支 spec，**0 命中**。backend service 層已由 `legalDocuments.db.test.js` 覆蓋（`getCurrentPublished()` 對 draft／approved 皆回 `null`），**frontend renderer 沒有**；`components/legal/LegalDocumentPage.tsx` 的 `notFound()` 分支目前無測試把關 | ✅ **DONE**（2026-08-30）—— 新增 `frontend/apps/web/tests/e2e/legal-publication-security.spec.ts`（**唯一改動的 production-adjacent 檔案是這支新測試；production code 0 改動**）。**5 個 test × 2 個 project = 10 個 case，全綠。** 四條 route 各一個 parameterized test（Case A 不可用／Case B 無 draft 洩漏／Case C 連「已發布外殼」都不得出現／Case C2 無手寫 placeholder 文案），外加 1 個 backend contract test。**Case A 同時釘住「404，而不是 302 到 `/login`」** —— 四條 route 都不在 `middleware.ts` 的 `LOGIN_REQUIRED_PREFIXES` 與 `matcher` 內（實測），若日後被誤加進去，「訪客看不到草稿」仍成立但理由錯了，且會讓公開條款變成登入才能讀（與 `L-12` 審閱期要求相衝）。**backend contract test 回答了「404 是因為沒發布，不是因為後端連不上」** —— `LegalDocumentPage.fetchPublished()` 對 fetch 失敗一律 `return null`（刻意），因此 backend 未啟動時四條 route **也會**是 404；只靠頁面斷言無法區分兩者，故另斷言 `GET /legal/documents/:type` 回 404 且 `error === "legal_document_not_published"`（該 error code 只有「查得到 DB、但沒有 published 列」才會出現）。**該 case 需要 live backend :3000 —— 屬 `DX-19` 將要明示化的同一類前置條件。** **斷言有效性已用 negative control 證明（非 vacuous）：** 另寫一支拋棄式 spec，把同樣的 5 個斷言構造分別指向會渲染的頁面／確實存在的文字／非 404 的端點，**5 個全部如預期失敗**，證明每一個構造在不變條件被破壞時都會紅；該 scratch spec 已於驗證後刪除，未進版控。**驗證：** focused E2E **10/10 passed**（desktop 5 ＋ mobile 5）；`verify:web` **exit 0**（lint／typecheck／build）；完整 production E2E **605 passed / 39 skipped / 0 failed**（baseline 595 + 新增 10，**skip 數未變 —— 未新增任何 skip 換綠燈**）。**測試前後 `legal_documents` 與 `consent_records` 在兩個 DB 皆維持 0 列**（唯讀複查）；未建立任何 legal document fixture —— 本項驗證的就是 zero-published-document state。 | （全部達成）(1) 無 published 文件時四條 route 皆回 **404**；(2) **draft markdown 永不作為 public fallback 呈現**（斷言頁面不含 `DRAFT`／`NOT LAWYER APPROVED` 等字樣）；(3) desktop ＋ mobile 兩個 project 都覆蓋；(4) `verify:web` 全綠；(5) 相關 E2E 全綠。**External dependency：NONE。Legal assumption impact：NONE** —— 本項驗證的是 **no unpublished-content leak**，**不是**法律條文本身，且**不得**因此發布任何文件或啟用 Gate 5 |
| ~~`DX-19`~~ | `P3` ✅ | Testing / DX | **完整 E2E 對 live backend 的依賴是隱性的** —— backend 未啟動時會產生看起來像 product regression 的紅燈 | 本檔 §1 自承「回歸套件目前僅剩的紅燈全部是 backend :3000 未啟動所致」。需要人工解釋的紅燈會侵蝕每一輪驗收的可信度 —— 這與 `DX-01`／`DX-05`／`DX-06`／`DX-15`／`DX-18` 是同一類問題的殘餘 | 2026-08-30 實測：3 支 spec 需要 live backend —— `api-proxy.spec.ts`（打 `/api/backend/health`）、`payment-proof-security.spec.ts`、`material-media-security.spec.ts`（後兩者用 `E2E_BACKEND_URL`，預設 `http://127.0.0.1:3000`）。`REL-01` 的完整套件在 backend 啟動下為 **595 passed / 39 skipped / 0 failed**，證明紅燈確實來自缺少前置而非產品缺陷 | ✅ **DONE**（2026-08-30）—— 採 **Option A：harness 自己管 backend 生命週期**。`playwright.config.ts` 的 `webServer` 由單一 frontend 條目改為 **[backend, frontend] 陣列**，backend 以 `node Backend/index.js` 啟動並在 **spawn 時寫死 `PGDATABASE=teaching_platform_security_test`** —— 資料庫正確性**由建構保證**，不再依賴任何人記得 export 環境變數。新增 `tests/e2e/global-setup.ts`（Playwright 1.59 **先跑 webServer 再跑 globalSetup**，已用拋棄式 config 實測確認，非推測）與 `tests/e2e/helpers/backend-prerequisite.ts`（單一設定來源，避免兩邊漂移）。**先反覆重現舊行為再修**（2026-08-30 實測，backend 全滅）：**(a) 假紅燈** —— `api-proxy.spec.ts` 報 `Expected: 200 / Received: 500` 與 `SyntaxError: Unexpected end of JSON input`，看起來像 proxy 壞了；真正的 `ECONNREFUSED ::1:3000` 只出現在交錯的 `[WebServer]` stdout。**(b) 假綠燈（更危險）** —— `legal-publication-security` 的四條 public route case **4/4 通過**，因為 `fetchPublished()` 對 fetch 失敗一律 `return null` 而 `notFound()`；頁面「看起來正確」，但證明的是「連不上」而非「沒有發布」。**未修改 `TEST-01` 任何斷言即重現。****三個 scenario 皆已驗證：** **wrong DB** —— `E2E_BACKEND_DB=teaching_platform` 在 **config 載入時**即 throw `E2E DATABASE GUARD — REFUSING TO START`，實測 **0 個 server 啟動、0 個 test 執行、port 3000 仍為 down**，開發資料庫未被觸碰；**backend 前置不成立** —— 以 stub server 模擬「別的服務占用 3000」與「backend 活著但 DB 無 seed」，兩者皆印出 `E2E BACKEND PREREQUISITE NOT SATISFIED` ＋ 具體補救方式，且 **product test 執行數為 0**（舊的假綠燈已結構性不可能發生）；**correct backend + correct DB** —— harness 自行啟動（precheck 確認 3000 為 down），preflight 印出 `✓ E2E backend prerequisite OK … database pinned to teaching_platform_security_test`，`TEST-01` **10/10 passed**，跑完 port 3000 正確釋放。**驗證：** `verify:web` **exit 0**；完整 production E2E **605 passed / 39 skipped / 0 failed**（7.9m）—— **與 `TEST-01` 後的 baseline 完全相同**：harness 層的驗證不是 Playwright test，因此 test count 未變，**skip 數維持 39，一個都沒增加，也未弱化任何既有斷言**。**已知限制（明說，不假裝驗過）：** `E2E_REUSE_BACKEND=1` 重用既有 backend 時，harness **無法**從外部證明對方連的是哪一個資料庫 —— backend 沒有、也**不該**有對外揭露資料庫名稱的 endpoint（那是 production 的資訊洩漏面，`DX-19` 刻意不新增 debug endpoint）。該模式會在所有檢查**之前**印出明確警告；預設路徑不重用，故此限制不影響常態流程。`npm run smoke`／`npm run postman` 不受影響，仍自行啟動 backend。 | （全部達成）(1) 前置條件（backend :3000 ＋ production frontend :3010 ＋ seeded 資料）**明示**於 harness 或 spec；(2) backend-off 狀態**不得偽裝成 product regression**（明確 skip 並說明，或前置檢查後 fail fast）；(3) **不得弱化任何既有斷言**；(4) **不得為了換綠燈新增大範圍 skip** —— 現有 39 個 skip 全部是既有的 viewport guard（desktop-only 在 mobile project 被 skip，反之亦然），每一個都在自己的 project 中通過，不得增加 |
| ~~`A11Y-01`~~ | `P3` ✅ | Frontend / A11y | **7 處互動控制項用 `focus:` 而非 `focus-visible:`**，鍵盤與滑鼠行為不分 | `docs/ui-design-system.md` §10.2 已把它列為「現況，本輪只記錄，不修」。它是**呈現層**問題：焦點樣式在滑鼠點擊時也會出現，與 §10.2 的規則不一致 | 2026-08-30 逐檔複驗，7 處**全部仍成立**：`components/ui/Input.tsx:20`、`components/parent/AgeFilter.tsx:26`、`components/parent/SortDropdown.tsx:30`、`components/parent/ExplorePage.tsx:140`、`components/dashboard/Topbar.tsx:76`、`components/materials/detail/MaterialReportDialog.tsx:189`、`app/me/materials/[id]/feedback/page.tsx:137`。repo-wide `outline-none` = **17**。**每一處都有可見的焦點樣式**（無「完全沒有 focus 指示」的情形），因此是一致性問題而非可及性缺失 | ✅ **DONE**（2026-08-30）—— **7 處全部收斂，另加同檔的 dialog 關閉鈕（token 對齊）共 8 個改動點。** **canonical pattern 取自 repo 現況而非自創**：`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus` —— 全 app 實測 **outline 型 36 次 vs ring 型 5 次**，`outline-ds-focus` 29 次為最大宗；`--ds-focus-ring` = `--color-brand-primary` = `#6c63ff`，與原本硬編碼的 `#6C63FF` **完全相同**，因此是 token／pseudo-class 收斂，**不是顏色變更**。**分類處理，未機械式套用**：文字輸入（`ui/Input`、Topbar 搜尋、兩支 textarea）保留 `focus:` 的背景／邊框「作用中欄位」提示（指標點擊時本來就該有，且 `:focus-visible` 對文字欄位在點擊時也成立），只把**指示器**換成 canonical outline；非文字控制項（兩個 `<select>`、`ExplorePage` 篩選鈕）則全部改為 `focus-visible:`，讓指標點擊不留下持久焦點框。**移除了 `ui/Input` 與 textarea 的自訂 `focus:shadow-[0_0_0_3px_rgba(108,99,255,0.12)]`**（12% alpha，極淡）與 `focus:outline-none`，避免 shadow ＋ outline 疊成 double ring。**真實瀏覽器行為驗證（不是只看 class）：** 鍵盤 Tab → `focus-visible` 成立、outline `2px solid rgb(108,99,255)`；純滑鼠點擊（無先前鍵盤互動）→ `matches(":focus-visible")` **false**、`outline-style: none`，**不留框**。`<select>` 點擊時仍顯示 outline —— 那是規範行為（widget 接受鍵盤輸入），不是缺陷。**double ring：無**（`box-shadow` 僅剩 `shadow-sm`）；**layout shift：無**（outline 不參與 layout，聚焦前後 rect 皆 61×42）。新增 `tests/e2e/focus-visible.spec.ts`（3 test × 2 project = **6 case**），**測行為不測 class 字串** —— 讀 `getComputedStyle` 的實際 outline 寬度，因此換 token／改用 ring 都不會誤紅，而焦點指示消失一定會紅。**斷言有效性經 negative control 證明**（未聚焦元素量到 0；以 `addStyleTag` 在 runtime 拿掉 outline 後量到 0，兩者皆如預期失敗；scratch spec 已刪除未進版控）。**驗證：** focused E2E **6/6**（desktop 3 ＋ mobile 3）、`verify:web` **exit 0**、完整 production E2E **611 passed / 39 skipped / 0 failed**（baseline 605 ＋ 新增 6，**skip 數未變**）。 | （全部達成）(1) 7 處改用 `focus-visible:` ＋ `ring-ds-focus`，offset 一致；(2) `outline-none` 而無替代焦點樣式者維持 **0**；(3) `verify:web` 全綠。**Scope 硬邊界：只動 `focus` / `focus-visible` 的呈現**，**不得**擴成全站 accessibility rewrite，**不得**為此動 business logic、API 契約或權限判斷（`CLAUDE.md` §6） |
| ~~`DX-20`~~ | `P3` ✅ | Repo hygiene / Git | **`core.autocrlf=true` ＋ 無 `.gitattributes`，binary fixture 被當成 text** | git 把三個 synthetic fixture 判為 text（最小 PDF 是純 ASCII，無 NUL），因此 checkout 時會做 CRLF 轉換。**本次 commit 未造成任何損壞**（blob 與 worktree byte-identical），但在 CRLF 平台上做 fresh clone 會得到位元組不同的 fixture | 2026-08-30 實測：`git config core.autocrlf` = **true**；`.gitattributes` **不存在**（tracked = 0）。`git add` 時對 `docs/postman/fixtures/material-a.pdf`／`material-b.pdf` 明確警告 `LF will be replaced by CRLF`。commit 後逐檔驗證：worktree 與 blob 皆 125 B／125 B／69 B 且 `cmp` **IDENTICAL** —— 因 worktree 原本就是 LF，正規化為 no-op | ✅ **DONE**（2026-08-30）—— 新增 repo 根目錄 `.gitattributes`（`*.pdf` / `*.png` / `*.jpg` / `*.ico` → `binary`）。**風險已由實驗證實，不是推論：** 在隔離 repo 設 `core.autocrlf=true` 做 fresh checkout，`material-a.pdf` / `material-b.pdf` 由 **125 bytes 變成 130 bytes**、SHA-256 改變（**位元組毀損**）；`cover-a.png` 不受影響（含 NUL，Git 本來就判為二進位）。加上 `.gitattributes` 後重跑同一實驗，三個 fixture 的 checkout 位元組與 repository blob **完全一致**，且與**真實 repo 的 blob 亦一致**。主 working tree 的 fixture 位元組**全程未變**（五個 fixture 的 HEAD blob vs worktree SHA-256 逐一比對皆 IDENTICAL，`git status -- docs/postman/fixtures/` 全程為空）。**刻意不加 `* text=auto`：** 以 temporary index ＋ temporary attributes file 實測（**未動真 index**），它會讓 `git add --renormalize` 涵蓋 **531 個檔案** —— 那正是本 ticket 明文禁止的 mass renormalization。**刻意不列 `*.svg`**（SVG 是 XML，標 binary 會失去可讀 diff），也不預防性列 repo 內不存在的 zip/woff/mp4。**Sub-note（原 `DX-21`）的前提已由實測更正：** 先前 `REL-01`／`DOC-01` 記載「Git 將 `material-media-security.spec.ts` 視為 binary blob，導致 `git diff` 無法顯示文字差異」—— **該敘述不正確**。Git 的 **diff 偵測**只看前 8000 bytes，而該 NUL 位於 offset **15745**，因此 Git 一直都把它當文字（`git diff --no-index --numstat` 實測回 `2 0`，非 `- -`；`git grep` 與 ripgrep 亦正常）。真正受影響的是**掃描整個檔案**的工具：`file(1)` 回報 `data`、GNU `grep -n` 印 `Binary file ... matches` 而不印命中行。**但同時發現一個更實質、先前未知的後果：** Git 的**轉換層**（與 diff 偵測不同，採 whole-buffer 判定）因為那個 NUL 而把整檔當二進位，於是**跳過 CRLF 正規化** —— 該檔因此以 **CRLF** 存進 repository，成為全 repo 唯一的例外（實測 68 個 `.ts`/`.tsx` blob 中 **67 個是 LF，只有它是 CRLF**）。移除 literal NUL 後該檔恢復為一般文字並正規化為 LF，與其餘 67 個一致；這使該檔的 diff 呈現為整檔重寫（365 / 351），**但那是單一檔案的一次性修正，不是 mass renormalization**（`git status` 全程只有這一個 tracked 檔案異動）。**payload 語意零變更：** 原始碼由內嵌原始位元組改為逸出序列 `"MZ\x90\x00 windows executable"`，Node 實測解碼後皆為 `4d 5a 90 00 20 ...`（DOS/PE 檔頭），`Buffer.equals()` 為 true；以 `git diff -w` 檢視，**唯一的非註解變更就是那一行**，assertions 一字未動。**驗證：** focused `material-media-security.spec.ts` **16/16 passed**（含 magic-byte 拒絕案例，仍回 415 `media_signature_mismatch`）；`verify:web` **exit 0**；完整 production E2E **611 passed / 39 skipped / 0 failed**（與 baseline 相同，**未新增 test、未新增 skip**）。 | （全部達成）(1) 加入**最小**的 `.gitattributes`；(2) 把 binary fixture 標為 `binary`；(3) 保留刻意 LF-sensitive 的資產不被誤轉；(4) 驗證 fresh checkout 不會改動 fixture 位元組。**Sub-note（刻意不另開 ID）：** `frontend/apps/web/tests/e2e/material-media-security.spec.ts` 因 offset 15745 有 **1 個刻意的 NUL**（magic-byte 測試載荷，用來斷言偽裝成 PNG 的 PE 檔會被拒）而被 git 當作 binary blob，`git diff` 因此不顯示文字差異。**併入本項而非開 `DX-21`**，理由有三：(a) 補救措施在**同一個檔案、同一個決策**裡 —— `.gitattributes` 無論如何都必須為這支檔案做決定（強制 `text` 會對含 NUL 的檔案做轉換，風險更高）；(b) 依 `CLAUDE.md` §11.4「同一個問題更新既有 ID，不要開近似的新 ID」，兩者同屬「git 的 text/binary 判定與本 repo 的意圖不一致」；(c) 依 §11.3，目前**沒有實際發生過的維護成本證據**（該檔穩定、未因此產生過 review 障礙）。未來可行方向記錄於此：**以程式建構該 NUL byte，而不是在原始碼中內嵌字面 NUL**。**本輪未修改該測試** |
| `A11Y-02` | `P3` | Frontend / A11y | **`components/ui/Checkbox.tsx` 仍用 `focus:ring-[#6C63FF]/30`，未收斂到 canonical focus-visible** | 與 `A11Y-01` 完全同一類缺陷，且同樣位於 shared `ui/` primitive。`A11Y-01` 的 scope 由 ticket 明列七處，**刻意未擴張**（`CLAUDE.md` §10.3／§10.4）；本項為執行 `A11Y-01` §4 要求的 `components/ui/**` 盤點時發現 | 2026-08-30 實測：`components/ui/Checkbox.tsx:13` `focus:ring-[#6C63FF]/30` —— `focus:`（非 `focus-visible:`）＋ ring 型（repo canonical 為 outline 型，36 vs 5）＋ 硬編碼 hex（非 `ds-focus` token） | **OPEN — SAFE / INDEPENDENT** | (1) 收斂到與 `A11Y-01` 相同的 canonical pattern；(2) 先做 impact inventory（checkbox 的 ring 與 native check 的視覺關係與 input 不同，不得機械式套用）；(3) `verify:web` 全綠。**Scope 硬邊界同 `A11Y-01`：只動 focus 呈現** |
| `A11Y-03` | `P3` | Frontend / A11y · UI | **`/materials` 工具列的焦點框被 `overflow-x-auto` 容器裁掉右側 4px** | `ExplorePage` 的排序 select 與「篩選」按鈕位於 `overflow-x-auto` 容器最右緣，outline 畫在 border box 外 2px、寬 2px，因此右側 4px 落在裁切區外。**焦點指示仍清楚可辨**（其餘三側完整，已於真實瀏覽器確認），故非阻擋項 | 2026-08-30 實測（desktop 1280）：button `right = 1256`、outline 右緣 `1260`、scroller 右緣 `1256` → **裁切 4px**。**這是既存狀況，非 `A11Y-01` 造成**：先前的 `focus:ring-2`（Tailwind ring ＝ box-shadow）同樣被裁，只是 2px；本輪改為 canonical outline 後變 4px。mobile（375）該容器確實會捲動（`scrollWidth 520 > clientWidth 343`），但聚焦時瀏覽器會把元素捲入視野 | **OPEN — COSMETIC** | 需在三者間擇一並說明理由：(1) 該控制項改用負 offset（`-outline-offset-2`，畫在元素內側，永不被裁）—— **但會與其餘 36 處的 offset 不一致**，違反「offset 一致」；(2) 調整該容器的裁切行為 —— **屬 layout 改動**，`A11Y-01` 明文禁止，需獨立評估；(3) 接受現況並記錄。**本輪選 (3)：** `A11Y-01` 的 completion criteria 要求「offset 一致」，就地做一次性偏離會製造 ticket 自己警告的「第三套 focus style」 || ~~`DOC-01`~~ | `P2` ✅ | Docs / Reconciliation | **`REL-01` 前後盤點確認的 6 項文件落差（D1～D6）與新發現尚未回寫 canonical docs** | Phase A／Phase B 的發現當時只存在於對話中，違反 `CLAUDE.md` §11.2（stale API contract、stale canonical doc、sensitive-data 風險皆屬必須入 tracker 的類別）。其中 **D4 是不可逆的資訊遺失，愈晚處理愈難補** | D1 本檔 §0／§1 把 `P1-09` 寫成 implementation in progress；D2 §2 有一列宣稱「`DX` 僅剩 `DX-15`」「`BUY-03`／`BUY-04` 為工程軌 #1／#2」，與同節排序列及 §1 直接矛盾；D3 baseline 的 Gate 4／11／12 落後於本檔；D4 見 `READINESS-01`；D5 `CLAUDE.md` §5 宣稱 spec v1.4 仍寫 `PUT = Full update`，實測 spec §11 已非如此；D6 `ui-design-system.md` §4.3 B9 寫 62 檔，實測 67 檔／694 處 | ✅ **DONE**（2026-08-30）—— **DOCS-ONLY**：0 行 production code、0 個 test、0 個 schema／migration、0 處 legal wording。D1～D6 全部處置，`REL-01` 關閉，新增 `READINESS-01`／`TEST-01`／`DX-19`／`A11Y-01`／`DX-20`，新增 §17 External Review Boundary | （已達成）(1) D1～D6 逐項 RESOLVED 或明確標示為 ACCEPTED LOSS；(2) `REL-01` 四處同步（Status／Current Focus／Next Up／Recently Completed）；(3) 新增項目皆附可複驗的 repository evidence；(4) 未觸及 production code／schema／legal wording |

## 2. Next Up

**明確順序。這不是「都很重要」的清單。**

| 順序 | ID | 理由 |
| --- | --- | --- |
| **—（工程軌）** | **`NO ACTIVE P1/P2 SAFE ENGINEERING ITEM`** | **2026-08-31 `PRE-05` 完成後。** `READINESS-02` 開出的工程項目已完成 `REL-02`／`DX-21`／`PRE-05`。剩餘 open 全為 `P3`：`PRE-06`（`PRE-05` 移交的 parity 殘留）／`OPS-06`／`BUY-07`／`A11Y-02`／`A11Y-03`／`DX-16`／`SCHEMA-02`；`READINESS-01`（`P2`）需 Owner 提供 audit 副本，`OPS-01`（`P2`）需營運拍板 —— 兩者非工程可自行推進。**下一步由 Owner 決定，不自動升級 P3。** **Deployment Readiness 仍為 `0 / 14`**，外部關鍵路徑仍是 `PRE-03`。  **【2026-08-31 Owner Decision Lock Round 6 之後 —— 工程軌不再是空的】** `DEC-13`（Render）／`DEC-14`（Resend）／`DEC-15`（fresh DB）解除了部署與郵件的決策阻塞，新開五個實作項`PRE-07`～`PRE-11`（`P1`×3、`P2`×2），並解除 `REL-03` 的阻塞。**全部尚未開始。** **建議順序（已對照 repo 依賴驗證，非照抄期望順序）：****0.**〔Owner〕鎖定 production 網域 —— 它同時 gate 住 `PRE-10` 的全部 DNS 工作與 `PRE-07` 的 hostname；**1.** `PRE-09` 環境變數契約（**必須在部署設定之前** —— 服務定義本身就要列出環境變數，且 backend 對 `JWT_SECRET`／私有儲存 fail-closed，契約未定就寫不出正確的服務定義）；**2.** `PRE-07` Render 部署設定；**3.** `PRE-08` 儲存與備份／還原演練；**4.** `REL-03` SMTP 啟動前置檢查（**可與 1～3 平行** —— 不需真實憑證）；**5.** `PRE-10` Resend SMTP ＋ DNS（**hard blocked on 網域**）；**6.** O-19／O-20 法律事實交付完成（O-19 事實已知，O-20 待網域）；**7.** 外部律師＋會計師審查（`PRE-03`／`P1-09`，**平行進行中，不阻塞 1～5**）；**8.** 法律文件核准後發布（依賴 7）；**9.** consent／re-consent 接線（依賴 8）；**10.** `PRE-11` provisioning 與首次發布（依賴全部）。**（2026-08-31 更新：步驟 1 的 `PRE-09` 已 ✅ DONE —— 契約見 `docs/production-environment-contract.md`。工程軌下一項為 `PRE-07`，其後 `PRE-08`。`PRE-09` 過程中另發現同類 fail-soft 缺口，已立 **`PRE-12`**（`P2`，與 `REL-03` 不重複），該項與 `REL-03` 皆不需憑證或網域，可與 `PRE-07`／`PRE-08` 平行。`PRE-10` 維持 `BLOCKED ON OWNER PRODUCTION DOMAIN`，未變更。）**  **（2026-08-31 Owner Decision Round 2 更新：`PRE-01`／O-19／`OPS-01` 三項的決策資料已備妥，Status 皆為 `READY FOR OWNER DECISION`，見 `docs/owner-decision-packet-2026-08-31.md`。`PRE-01` 與 O-19 是僅有的兩個**非法律**上線硬阻擋，且法律定稿反過來依賴它們；`OPS-01` 只有技術面可即刻決定。本輪另新增 `REL-03`（`P3`，blocked on O-19）。**本輪為 decision-prep only，未實作任何選項。**）** |
| ~~—~~ | ~~`PRE-05`~~ | ✅ **DONE**（2026-08-31）—— 從零 provisioning 已驗證可行，**但先修掉一個真實缺陷**：bootstrap 的 `materials.file_key NOT NULL` 讓全新庫**完全無法上架教材**。既有庫因早已 nullable ＋ `CREATE TABLE IF NOT EXISTS` 不改既存表而永遠測不到。修後全新庫 smoke 73 項全過；既有兩庫結構指紋 byte-identical。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`DX-21`~~ | ✅ **DONE**（2026-08-31）—— 根因為「goto 之後、hydration 之前的點擊靜默失效」，**非產品缺陷**（失敗當下 `loginRequests: 0`）。以 `clickWhenHydrated` 等待 React 接管該節點；A/B 由 1/80 失敗變 **80/80 通過**，另加釘住機制的 guard spec。**production 程式碼 0 改動、未用任何遮蔽手段。** 見 §1.4，已移出待辦 |
| ~~—~~ | ~~`REL-02`~~ | ✅ **DONE**（2026-08-31）—— rejection 邊界建立在分離點；裸 `void sendXxxEmail` 歸零；runtime 子 process 對照證明 process 存活；以不可達 SMTP 跑 smoke：14 次寄信失敗、smoke 全過、backend 存活。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`OPS-05`~~ | ✅ **DONE**（2026-08-30）—— **ENGINEERING CAPABILITY COMPLETE / PRODUCTION PUBLICATION STILL BLOCKED**。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`READINESS-02`~~ | ✅ **DONE**（2026-08-31）—— audit-only；19 個 `R2` 發現，最高風險的付費教材交付授權查核為 **NOT A GAP**；結論 `CONDITIONALLY`（尚有 `PRE-01`／O-19 兩個非外部硬阻擋）。見 `docs/readiness-audit-round-2-2026-08-31.md` |
| ~~—~~ | ~~`OPS-05`~~ | ✅ **DONE**（2026-08-30）—— **ENGINEERING CAPABILITY COMPLETE / PRODUCTION PUBLICATION STILL BLOCKED**。既有 Admin API 已足夠（未新增 production 端點）；新增 dry-run-only 前置檢查與完整 runbook。Admin UI 部分移交 `OPS-06`。`legal_documents` 全程 0 列。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`DX-20`~~ | ✅ **DONE**（2026-08-30）—— `.gitattributes` 保護二進位 fixture；fresh CRLF checkout 由「PDF 125→130 bytes 毀損」變為位元組一致；literal NUL 移出 TypeScript 原始碼，該檔恢復 LF 並與其餘 67 個 blob 一致。完整套件 **611 / 39 / 0**。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`A11Y-01`~~ | ✅ **DONE**（2026-08-30）—— 7 處 ＋ dialog 關閉鈕收斂到 repo canonical `focus-visible:outline*`；鍵盤有框、指標無框皆以真實瀏覽器驗證；新增 6 個行為型 case，完整套件 **611 / 39 / 0**。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`DX-19`~~ | ✅ **DONE**（2026-08-30）—— harness 接管 backend 生命週期，`PGDATABASE` 於 spawn 時寫死；wrong-DB 在 config 載入時即拒絕（0 server／0 test）；backend 前置不成立時 fail fast 且 product test 執行數為 0。完整套件 **605 / 39 / 0**，與 baseline 相同。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`TEST-01`~~ | ✅ **DONE**（2026-08-30）—— 四條 public legal route 的「未發布即 404、絕不洩漏 draft」護欄已建立；10/10 focused、完整套件 605/39/0；斷言有效性經 negative control 證明。見 §1.4，已移出待辦 | 法律文件管理的 Admin UI。工程能力可做，**但真實發布仍 blocked on lawyer approval** —— `REL-01` 把 packet 納入版控**不改變**這一點。維持 `P3`，不對應 14 個 Gate 中任何一個。 |
| ~~—~~ | ~~`REL-01`~~ | ✅ **DONE**（2026-08-30）—— 5 顆 preservation checkpoint，base `70f77f5` → HEAD `91574a1`；318 committed ＋ 1 刻意 untracked = 319；六套驗證全綠；未 push。見 §1.4 與 §10.1，已移出待辦 |
| ~~—~~ | ~~`DOC-01`~~ | ✅ **DONE**（2026-08-30）—— D1～D6 全部處置，新增 `READINESS-01`／`TEST-01`／`DX-19`／`A11Y-01`／`DX-20` 與 §17。DOCS-ONLY，0 行 production code。見 §1.4，已移出待辦 |
| ~~—~~ | ~~`SEC-01`~~ | ✅ **DONE**（2026-08-23）—— 見 §1.2，已移出待辦 |
| ~~—~~ | ~~`COR-01`~~ | ✅ **DONE**（2026-08-23）—— 見 §1.1，已移出待辦 |
| ~~—~~ | ~~`IA-01`~~ | ✅ **DONE**（2026-08-23）—— 見 §4.1，已移出待辦 |
| ~~—~~ | ~~`IA-04` + `IA-05`~~ | ✅ **DONE**（2026-08-23）—— 見 §4.2，已移出待辦 |
| ~~—~~ | ~~`IA-07`~~ | ✅ **DONE**（2026-08-23）—— 見 §4.3，已移出待辦 |
| ~~—~~ | ~~`IA-02` + `IA-03`~~ | ✅ **DONE**（2026-08-23）—— 見 §4.4，已移出待辦 |
| ~~—~~ | ~~`IA-08`~~ | 套用與 `IA-07` 相同的排序理由（**最低成本的 IA 收斂**）：`RoleShell.tsx` 的 `NAVS.admin` 移除三個已下架入口＋ desktop／mobile 各一支 E2E，不需要 API 改動。它同時是 `IA-01` ＋ `IA-07` 在**第二個 surface** 上的收尾 —— 那兩項現在只在 `/admin/*` 生效（證據見 §4.5）。**排這裡不是因為它最新被發現**，而是因為原本的排序規則就把成本最低、無相依的 IA 收斂放最前面。✅ **DONE**（2026-08-23）—— 見 §4.6，已移出待辦。**實作時未採「只刪三行」**：root cause 是同一份 IA 有兩個定義，因此收斂成單一 source of truth `lib/admin-nav.ts` |
| ~~—~~ | ~~`IA-06`~~ | 需要小幅 API 擴充（`listOrders` 加 `q` ＋分頁），獨立性最高。✅ **DONE**（2026-08-23 實作／2026-08-24 settled-tree 驗收）—— 見 §4.7，已移出待辦 |
| ~~—~~ | ~~`BUY-01`~~ | 排前面是因為它**卡在產品決策**，決策本身可與其他工作平行進行。✅ **DONE**（2026-08-24）—— 決策已拍板（補回買家檢舉 UI），見 §5，已移出待辦 |
| ~~—~~ | ~~`SEC-02`~~ | ✅ **DONE**（2026-08-24）—— 見 §1.3，已移出待辦。**實作規模比原本預估大**：`SEC-01` 的儲存與交付 primitives 確實可重用，但授權模型不行（素材是唯一**條件公開**的資產），且素材原本沒有 metadata 表，因此仍需一次 schema migration |
| ~~—~~ | ~~`DX-01`~~ | ✅ **DONE**（2026-08-24）—— 完整套件 **364 / 0 / 30**，四群全部是測試端過期，production 程式碼 0 改動。見 §9〈`DX-01` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-06`~~ | ✅ **DONE**（2026-08-24）—— 先重現（5 次中 2 次失敗）再修復；修復後 `--repeat-each=10` **300/0**、完整套件 **364 / 0 / 30**。production 程式碼 0 改動。見 §9〈`DX-06` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-05`~~ | ✅ **DONE**（2026-08-24）—— `verify:web` 三階段統一注入 `NEXT_DIST_DIR=.next-verify`，production E2E 套用同一預設值；**不停 3010** 連續驗收兩次皆 exit 0 且 dev 全程健康。見 §9〈`DX-05` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`COR-02` + `COR-03`~~ | ✅ **DONE**（2026-08-24）—— 兩項 root cause 同在 `buyerOrders.service.js`，同輪收斂；完整套件 **364 / 0 / 30**。見 §9〈`COR-02` ＋ `COR-03` 完成紀錄〉，已移出待辦 |
| **1** | **`PRE-01`** | **← 順序上的下一個，但不是可以直接動手的實作項：等部署環境拍板。** 在平台選定前沒有「環境是 ephemeral」的證據可把它升級為 blocker（見 §6 的說明） |
| ~~—~~ | ~~`COR-04`~~ | ✅ **DONE**（2026-08-24）—— 角色標籤／受眾描述／內部識別碼三分法逐一判定；完整套件 **364 / 0 / 30**。見 §9〈`COR-04` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`COR-05`~~ | ✅ **DONE**（2026-08-24）—— 改在所有 router 之前回 400；PG `22021` 全程 0 次，unit 153/0、db 208/0、smoke exit 0、Postman 129/0。見 §9〈`COR-05` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`COR-07`~~ | ✅ **DONE**（2026-08-24）—— 終端 JSON error handler；三種輸入共用的 root cause 一次收斂，probe 全數 JSON 且無 stack／絕對路徑。見 §9〈`COR-07` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`COR-06`~~ | ✅ **DONE**（2026-08-24）—— main landmark 收斂到外殼一層；19 條路由 × 2 project 的 `toHaveCount(1)` 全綠，完整套件 **402 / 0 / 30**。見 §9〈`COR-06` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-04`~~ | ✅ **DONE**（2026-08-24）—— 三個外殼皆已 opt-in、harness 補完、open redirect 封住；完整套件 **440 / 0 / 30**。見 §9〈`DX-04` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-02`~~ | ✅ **DONE**（2026-08-24，含 `DX-03`）—— 44 處逐一 disposition，repo-wide `TODO(assert)` **歸零**；完整套件 **440 / 0 / 30**。見 §9〈`DX-02` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-07`~~ | ✅ **DONE**（2026-08-24）—— 三個產物目錄（比舊 evidence 多一個）精確 ignore，`git check-ignore` 全部命中；產物未刪，重新生成後 `git status` 仍乾淨。見 §9〈`DX-07` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-08`~~ | ✅ **DONE**（2026-08-24）—— 子標題重號 3 組歸零、dangling reference 0；只改 `docs/`。見 §9〈`DX-08` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-10`~~ | ✅ **DONE**（2026-08-25）—— 兩處改為 `§22`；served OpenAPI 實測已更新、契約形狀不變，canonical smoke 全綠。見 §9〈`DX-10` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-11`~~ | ✅ **DONE**（2026-08-25）—— 改成 `mvp_rules.md` §19.2 ＋ 斷言名稱雙指標；`adminOrdersFilter.db.test.js` 14 / 14 全綠，行為未動。見 §9〈`DX-11` 完成紀錄〉，已移出待辦 |
| ~~—~~ | ~~`DX-12`~~ | 🔒 **ACCEPTED DEBT**（2026-08-25 scope reconciliation）—— 47 處 / 17 檔，三個家族目標皆不可還原、runtime-visible 0 處；未通過 reference-hygiene stop rule。**非 actionable，已移出待辦**。見 §9〈`DX-12` scope reconciliation〉 |
| ~~—~~ | ~~`P1-01`～`P1-06` ＋ `P2-04`~~ | ✅ **DONE**（2026-08-25）—— Pre-Deployment Product Readiness 第一批，見 §2.2，已移出待辦 |
| ~~—~~ | ~~`P1-07`／`P1-08`／`P1-10`~~ | ✅ **DONE**（2026-08-25）—— Product Readiness 第二批，見 §2.3，已移出待辦 |
| **0** | **`PRE-03`** | **← 順序上要先於 `P1-09` 拍板**：平台在交易中是「出賣人」還是「居間／代收代付」。這一題決定是否需要第三方支付能量登錄、統一發票由誰開，以及三份條款的當事人結構。非工程項（見 §6 與 `docs/p1-09-legal-compliance-verification-2026-08-26.md` §5.0） |
| **1** | **`P1-09`** | **← 唯一剩下的 deployment blocker。文件規格階段已 CLOSED**（`v1.8 Full Baseline` ＋ `20/20`，見 §2.3）。**後續只走三條軌道**：(1) **Deployment Gate implementation（0/14）**；(2) **Legal Validation（`L-01`～`L-23`）**；(3) **Tax Validation（`T-01`～`T-15`）**。等產品／法務提供正式條文，**不得以 AI 產生的條文或 placeholder 頁面宣告完成**；**不得因 Deployment 未完成而把文件階段重標為未完成** |
| — | — | **⚠️ 本列的前半段已於 2026-08-30 由 `DOC-01` 作廢（D2）** —— 它曾寫「`DX` 僅剩 `DX-15`」與「`BUY-03`／`BUY-04` 現為工程軌 #1／#2」，兩者都已被後續的 DONE 狀態推翻（`DX-15`／`DX-18`／`BUY-03`～`BUY-06` 全部 ✅ DONE），且與本節排序列及 §1 直接矛盾。**現行工程軌順序一律以 §1 Current Focus 與本節排序列為準：**`TEST-01` → `DX-19` → `A11Y-01` → `DX-20` → `OPS-05`；`DX` 尚未完成者為 `DX-16`（deferred）／`DX-19`／`DX-20`。以下為原文，保留供稽核，**不得再據以排序**：～～先前的 `IA`／`COR`／`SEC` backlog 仍為 **0**；`DX` 僅剩 `DX-15`（NOT REPRODUCIBLE，opportunistic close）與 `DX-16`（deferred）。**`BUY` 已不是 0**（2026-08-28 更新）：`BUY-03`／`BUY-04` 兩項 `P1` buyer-facing false affordance 已立案，並經 Owner Decision Round 4（`DEC-09`／`DEC-10`）拍板，現為工程軌 #1／#2。`PRE-01`／`PRE-02` 維持 blocked，且 **product readiness 未完成前不啟動** |
| ~~—~~ | ~~`DX-07`~~（重複列，見上） | `P3`。Playwright 產物未被 gitignore。**成本最低的一項**：當時 working tree 有 100+ 改動檔與 2 個必須保住的 staged rename，誤 `git add -A` 會把產物一起帶進去 |

---

## 2.1 Pre-Deployment Product Readiness

> **這一節的 ID 來自 2026-08-25 的 Pre-Deployment UI / UX Readiness Audit**，
> 沿用該報告的編號（`P1-01`…／`P2-04`），**不另建平行編號**避免同一件事兩個 ID。
> 注意：這裡的 `P1-xx` 是**稽核報告的項次**，與本檔〈Priority 語意〉的 `P1` 優先序值不同；
> 每一列的 Priority 欄另外標示。
>
> 稽核方式：以真實瀏覽器走完 public / buyer / creator / admin 四種情境，
> 1440 / 1280 / 390 三種寬度，並以 DOM 量測與原始碼交叉佐證。

| ID | Priority | Area | Task | Root cause | Status |
| --- | --- | --- | --- | --- | --- |
| `P1-01` | `P1 / DEPLOYMENT BLOCKER` | Payment | 收款帳戶硬編碼且為不存在的佔位帳號 | 三處各自硬編碼（checkout／payment-proof／通知信），無單一來源 | **DONE**（2026-08-25）—— 見 §2.2 |
| `P1-02` | `P1 / DEPLOYMENT BLOCKER` | Creator / Infra | Creator「平台案件」整條 403 | Next proxy `ALLOW_ROOT` 有 `teacher` 但缺 `creator`；Backend 正常 | **DONE**（2026-08-25）—— 見 §2.2 |
| `P1-03` | `P1 / DEPLOYMENT BLOCKER` | Material / Commerce | 可購買但無可交付檔案的教材 | `published` ≠ 有 `approved_file_id`；販售路徑無此不變條件 | **DONE**（2026-08-25）—— 見 §2.2 |
| `P1-04` | `P1 / DEPLOYMENT BLOCKER` | Order / Ops | 買家訂單編號為前端捏造、不唯一、Admin 查不到 | `app/orders/page.tsx` 以日期＋hash 現算 `#O…` | **DONE**（2026-08-25）—— 見 §2.2 |
| `P1-05` | `P1 / DEPLOYMENT BLOCKER` | Payment / Buyer | 付款退件原因買家看不到 | 清單 payload 不帶欄位；詳情頁只讀 `note` 不讀 `reason` | **DONE**（2026-08-25）—— 見 §2.2 |
| `P1-06` | `P1 / DEPLOYMENT BLOCKER` | Material / Data | 卡片評分寫死 `0.0 (0)`，與詳情頁矛盾 | 清單 API 無評分彙總 → mapper 寫死 0；連帶排序與 4★ 篩選失效 | **DONE**（2026-08-25）—— 見 §2.2 |
| `P2-04` | `P2` | Frontend / CSS | 全站 `position: sticky` 失效 | `body { overflow-x: hidden }` 使 `overflow-y` 計算成 `auto` | **DONE**（2026-08-25）—— 見 §2.2 |
| `P1-07` | `P1 / DEPLOYMENT BLOCKER` | Buyer / Checkout | 結帳 Step 1／2 的驗證訊息永遠不顯示 | 共用的 `msg` state 只在 `step === 3` 的區塊裡渲染 | **DONE**（2026-08-25）—— 見 §2.3 |
| `P1-08` | `P1 / DEPLOYMENT BLOCKER` | Auth | 「忘記密碼」是假功能 | `<Link href="/login" onClick={preventDefault}>`；Backend 無任何 reset 能力 | **DONE**（2026-08-25，採**方案 B：誠實移除**）—— 見 §2.3 |
| `P1-09` | `P1 / DEPLOYMENT BLOCKER` | Legal / Compliance | 使用者被要求同意不存在的條款 | repo 內**沒有任何 approved legal copy**；註冊 consent 也未持久化 | **OPEN**（**文件規格階段已於 2026-08-26 CLOSED** —— `v1.8 Full Baseline` ＋ `FULL REGRESSION PASSED (20/20)`；仍卡在 **legal copy ＋ 14 個 Deployment Gate ＋ Legal/Tax Validation**）。見 §2.3 |
| `P1-10` | `P1 / DEPLOYMENT BLOCKER` | Creator / UX | 創作者表單要手打機器格式 | 分類為自由文字（期待 `math`）、教材內容為管線分隔字串、價格為 `type=text` | **DONE**（2026-08-25）—— 見 §2.3 |

**目前仍 open（稽核報告中其餘項目）：** `P1-09`（見下）、`P2-01`～`P2-03`、`P2-05`～`P2-16`、
`P3-01`～`P3-12`。

> ### ⚠️ 這 28 項的定義已經遺失（`READINESS-01`，2026-08-30 `DOC-01` 更正）
>
> 本節原本寫著「**稽核報告是唯一完整清單**」。**該敘述已不成立** ——
> 那份 2026-08-25 的 Pre-Deployment UI / UX Readiness Audit **從未進入 repo**，
> 因此這 28 個 ID 目前**只剩編號，沒有定義**。
>
> **2026-08-30 已做過完整的 git 復原嘗試，結論是不可復原：**
> `git log --all -S` 對 `P2-05`／`P2-16`／`P3-12` 各只命中 **1 個 commit，且都是 `ce5694a`（本檔自己）**；
> 對 `P3-07`／`P2-13` **0 命中**；`--diff-filter=D` 與「所有曾被 git 知道的路徑」皆無 audit／readiness 檔名；
> `git fsck --lost-found` 的 9 個 dangling object 逐一檢視後，
> 唯一相關的是兩個 dangling stash 內的**本檔舊版本（4509 行）**，而它逐字寫著同一句話、同樣未列舉。
>
> **因此：不得憑記憶重建這 28 項，也不得自行猜測 ticket 定義。**
> 目前僅存的可靠殘餘事實是：總數 38、已修 10（`P1-01`～`P1-08`、`P1-10`、`P2-04`）、
> `P2-04` = 全站 sticky 失效（已 DONE）、`P2-16` = 創作者身分揭露（更新既有 §15.3 U-2，不另開 ID）。
> 處置方式見 §1.4 的 **`READINESS-01`**。

> **`P1-09` 是目前唯一擋住 `READY` 的項目。** 它不是工程問題 ——
> 程式面可以做的（route、連結、consent 持久化）都要等**正式條文存在**才有意義。
> 需要產品／法務提供的 artifacts 見 §2.3 的 `P1-09` 段落。
> **不得以 AI 產生的條文或 placeholder 頁面宣告完成。**
其中 `P2-16`（創作者身分揭露）依稽核報告的指示**更新既有的 §15.3 U-2**，不另開 ID。

> **與 `PRE-01` / `PRE-02` 的關係：** 兩者維持 blocked on deployment-platform decision，
> 本輪**未修改其技術內容**。Product readiness 未完成前不啟動它們。

## 2.2 Pre-Deployment Product Readiness — 完成紀錄（2026-08-25）

### `P1-01` 收款帳戶單一來源

**Root cause：** 收款帳戶被硬編碼在**三個地方**且三份都是佔位值 `1234-5678-9012-3456` ——
`app/checkout/page.tsx` 的 `BANK_INFO` 常數、`app/orders/[orderId]/payment-proof/page.tsx`
的另一份、`Backend/services/emailService.js:170` 的信件內文。平台唯一的金流方式是人工轉帳，
所以這是買家真的會照著匯錢的目標。

**修法：** 新增 `Backend/config/paymentBankInfo.js` 為唯一來源（四個 env）；
新增 `GET /payment/bank-info`（`requireAuth`）；前端改用 `lib/payment-bank-info.ts`
＋ `components/payment/BankTransferInfo.tsx`（兩個 surface 共用同一個元件）；
通知信讀 `formatBankInfoLine()`。**前端不保留任何 fallback 常數。**

**Fail safe：** 未設定時回 `configured: false`，前端顯示「付款資訊尚未設定」
並**停用結帳 Step 2 的下一步**（不讓買家建立一張無法付款的訂單）；
通知信不印任何帳號。**已知佔位帳號視同未設定**（與 `JWT_SECRET` 同規則），
連字號與無分隔兩種寫法都擋（實測 `configured:false`）。

**驗證：** 三個 surface 實測顯示同一組值且 repo-wide 已無 live 佔位帳號
（殘留命中僅為 `.env.example` 說明、拒絕清單本身，以及 seed migration 內恰好含相同數字的 bcrypt hash）。
未設定態與已設定態皆於瀏覽器實測。規格落在 `docs/mvp_rules.md` §12.5。

### `P1-02` Creator cases proxy 403

**Root cause：** `frontend/apps/web/app/api/backend/[...path]/route.ts` 的 `ALLOW_ROOT`
是 **transport allowlist**（非授權邊界），其中有 `teacher` 但沒有 `creator`。
Backend 把同一個 router 掛在 `/creator/cases`（canonical）與 `/teacher/cases`（相容別名），
前端呼叫 canonical 路徑，於是**四個呼叫端全部被 proxy 自己擋成 403**：
`app/creator/cases/page.tsx:85/253/277` ＋ `components/layout/RoleShell.tsx:245`（待回覆徽章）。

**重現（修復前）：** 四個端點 proxy 全為 `403 {"message":"not allowed"}`，
同一 token 直連 Backend 為 `200`；`/teacher/cases`（allowlist 內）為 `200` —— 決定性對照。

**修法：** allowlist 加入 `creator`（**保留 `teacher`**，移除會打斷 `teacher/sales`
與 `teacher/uploads/*`）。未擴大任何範圍：比對仍為整段相等。

**驗證：** 四個端點 proxy 回應與直連 Backend **完全一致**（含 404 語意）；
`/creatorx`、`/creators` 仍為 403（證明非 prefix 比對）；
瀏覽器以真實 creator session 走完 list → detail → 送出說明，
案件狀態「等待創作者回覆」→「調查中」、待回覆徽章 1 → 0、空狀態正確。
**授權邊界未變**：匿名 401、buyer 三個端點皆 403，且 buyer 的越權嘗試
**未寫入任何 `report_events`**（DB 實查僅有 admin 要求與 creator 回覆兩筆）。

> **既有 E2E 無法攔到本項**：`admin-operations.spec.ts` 與 `shell-consistency.spec.ts`
> 都以 `page.route("**/api/backend/creator/cases**")` 在瀏覽器層攔截，請求根本不會抵達 proxy。
> 因此新增的回歸測試**不使用 mock**，直接打真實 backend。

### `P1-03` 可交付性不變條件

**Root cause：** `materials.status === 'published'` 只代表通過審核、對外可見，
**不代表交付得出東西**。販售路徑（加入購物車、建立訂單）只檢查 status，
於是買家可以付款、通過付款審核，最後在下載才看到「尚未提供可下載檔案」——
失敗發生在**收款之後**。實測 dev DB：`published` 92 筆中 **91 筆**無 `approved_file_id`。

**修法：** 新增 `Backend/utils/materialDeliverability.js` 為不變條件的唯一定義，
三道防線（縱深，非三選一）：

1. **核准上架** —— **先前即已存在**（`promoteCandidate({ requireCandidate: true })`）。
   實測無檔教材核准回 `409 candidate_required`。本輪**未重複實作**。
2. **`POST /cart/items`** —— 新增，回 409。
3. **`POST /orders`（transaction 內）** —— 新增，回 409；唯一與收款同一 transaction 的檢查點。

買家可見面：`GET /materials/:id` 新增 `is_purchasable` 布林（**不回傳 `approved_file_id` 本身**），
教材詳情頁在**點擊之前**就停用 CTA 並顯示「已暫停販售」。

**legacy 資料不回填**：`status` 是審核軌跡，大量回填會抹掉「曾經通過審核」的事實；
改在販售路徑擋住。**既有 entitlement 不受影響**（§21A.1 第 3 條仍成立）。

**驗證：** 無檔教材加入購物車 409、建立訂單 409 且 **0 筆訂單被建立**（transaction 正確回滾）；
有檔教材加入購物車 200、建立訂單成功、下載回傳 signed URL 與真實檔名；
無檔教材下載仍為誠實的 409。`is_purchasable` 實測 false/true 且無 id 外洩。
規格落在 `docs/mvp_rules.md` §21A.1 第 4 條與 §21A.1.1、CLAUDE.md §5。

### `P1-04` 訂單編號

**Root cause：** `app/orders/page.tsx` 的 `shortOrderLabel()` 以
「建立日期 ＋ `id` hash % 1000」現算 `#O260825676`。它不存在於 DB、每天僅 1000 個可能值
（約 37 筆訂單即過半機率碰撞）、且只出現在清單頁 —— 詳情頁與付款憑證頁顯示的是 `ord_*`。

**修法：** 移除 hash，改為直接顯示 `orders.id`。**未新增 `order_number` 欄位、無 migration** ——
`orders.id` 由 server 產生、唯一、持久化，canonical identifier 早就存在，
缺的只是「前端不要自己再發明一個」。

**驗證：** 清單顯示 `ord_mt8mjcocvrdp5x`，頁面已無 `#O` + 9 位數字的樣式；
以買家看到的同一個編號查 `GET /admin/orders?q=` **命中 1 筆**並帶出買家 Email。
規格落在 `docs/mvp_rules.md` §12.7。

### `P1-05` 退件原因對買家可見

**Root cause：** Admin 退件表單寫著「退回原因（必選，**購買者會看到**）」，
Backend 也一直回傳 `payment_proof_rejected_reason`，但：清單 payload 完全不帶這兩個欄位，
詳情頁只讀 `note` 不讀 `reason`。買家只看到「請重新上傳」，最合理的行為就是把同一張憑證再傳一次。

**修法：** `buyerOrders.service.js` 抽出 `REJECTED_PROOF_COLUMNS_SQL`，**list 與 detail 共用同一段 SQL**
（`COR-02` 的守則原封不動保留：只有 `order_progress_state = 'rejected'` 時才回傳，
避免 Admin 核准時借用 `note` 寫的營運字串外洩）；新增
`frontend/apps/web/lib/payment-rejection.ts` 作為三個買家 surface 的唯一 formatter。
**買家看到的是 code 對應的中文標籤，不是 code 本身。**

**驗證：** 完整走一輪 reject → 買家看到原因 → resubmit → approve。
清單顯示「退件原因：金額不符」、重新上傳頁 timeline 顯示
「金額不符。請依說明修正後重新上傳付款憑證。」；
**`COR-02` 守則實測仍成立**（已核准訂單的 `reason`／`note` 皆為 `null`）。
規格落在 `docs/mvp_rules.md` §12.2。

### `P1-06` 評分單一來源

**Root cause：** `GET /materials`（清單）沒有評分彙總，前端 mapper 只好把
`rating` / `reviewCount` **寫死為 0**。同一份教材因此在 `/materials`／`/explore` 顯示 `0.0 (0)`，
在詳情頁與 `/favorites` 顯示真實值。連帶：「評分」排序無作用；
「4 星以上」篩選（`rating >= 4 && reviewCount >= 3`）對**每一份教材**都回傳空結果。

**修法：** 清單查詢加上 `RATING_AGGREGATE_LATERAL_SQL`，
**與 `repositories/review.repository.js` 的 `ratingStats()` 同一個定義**
（`ROUND(AVG(rating)::numeric, 1)` ＋ `COUNT(*)`），回傳 `average_rating` / `review_count`；
mapper 改讀 API 值。另修 `popular` / `recommended` 排序：先前主鍵是同樣寫死為 0 的
`learners`，**等於預設排序是任意順序**，改用 `reviewCount` → `rating`。

**驗證：** 清單 API 與 canonical `/materials/:id/rating` 皆回 `4.7 / 3`；
`/explore` 卡片顯示 `4.7 (3)`（先前 `0.0 (0)`）；
`?rating=4` 篩選**正確篩出該教材**（先前對所有教材皆為空）。
規格落在 `docs/mvp_rules.md` §12.6。

### `P2-04` 全站 sticky 失效

**Root cause：** `app/globals.css` 的 `body { overflow-x: hidden }`。
依 CSS 規範，`overflow-x: hidden` 搭配 `overflow-y: visible` 時 `overflow-y` 會被
**計算成 `auto`**，使 `<body>` 成為 scroll container；但實際捲動發生在 `<html>` 上，
於是所有 sticky 元素的最近可捲動祖先是一個永遠不捲動的 body。

**修法：** 改用 `overflow-x: clip` —— 一樣裁掉橫向溢出，但不建立 scroll container。
**保留防護而非刪除**：它擋的是個別頁面的橫向溢出，移除會讓那些頁面出現整頁橫向捲軸。

**驗證：** `body` 的 computed `overflow-y` 由 `auto` → `visible`；
教材詳情頁捲動 700px 後兩層 header **固定在 y=0**（修復前為 -700／-636）；
1440 與 390 皆無新增橫向捲軸（`documentElement.scrollWidth === innerWidth`）。

> **已知殘留（不同 root cause，未修）：** 教材詳情頁的購買面板仍不固定 ——
> 它的容器 `hidden lg:block` 高度與卡片相同（351px），sticky 沒有可移動的空間。
> 那是版面問題（容器需要跨越更高的欄），不是本項的 CSS root cause，
> 依 §10.3 未自行擴大 scope。


---

## 2.3 Pre-Deployment Product Readiness — 第二批完成紀錄（2026-08-25）

### `P1-07` 結帳訊息在所在 step 看不見

**Root cause：** `msg` 是**整個結帳流程共用**的一份 state，但只在 `step === 3` 的
JSX 區塊裡被渲染。寫入它的地方遍布三個 step：Step 1 的必填驗證、優惠碼、
以及 `placeOrder()` 的六道前置檢查（未登入／角色不符／Step 1 驗證／發票格式／
購物車為空／後端購物車為空）。結果是使用者在 Step 1 按「下一步」而驗證不通過時，
**畫面完全沒有反應** —— 訊息被設好了，只是沒有任何地方顯示它。

另有一條更隱蔽的路徑：`placeOrder()` 在 Step 1 驗證失敗時會 `setStep(1)`，
把使用者送回 Step 1 —— 也就是**訊息唯一的渲染點以外**的地方。

**修法：**
- 共用訊息區抽到 step 內容正上方，**只有一份**，不論目前在哪一步都看得見；
  帶 `role="alert"` ＋ `aria-live="assertive"`（這些訊息一律是「擋住你繼續」的原因）。
- 新增 `goToStep()`：換 step 一律清掉訊息，避免 Step 1 已修好的錯誤跟著飄到 Step 2／3。
- `placeOrder()` 的 Step 1 bounce **刻意不用** `goToStep()`（它要保留訊息），
  並補上 `scrollTo({ top: 0 })` 與其他錯誤路徑一致。
- Step 2 新增 `step2BlockReason`，與 Step 3 既有的 `submitDisabledReason` 對稱 ——
  停用的按鈕旁邊一定要有原因。

**驗證：** 瀏覽器實測 Step 1 空值 → 訊息可見（viewport 內 y=259）、停在 Step 1、
修正後可繼續且訊息消失。新增 `tests/e2e/checkout-feedback.spec.ts`（3 tests × 2 projects）
涵蓋 Step 1 阻擋、Step 2 收款帳戶不可用（**且不建立訂單**）、Step 3 送單失敗仍顯示原因。

### `P1-08` 「忘記密碼」是假功能 —— **採方案 B：誠實移除**

**Capability inventory（決策依據）：**

| 檢查項 | 結果 |
| --- | --- |
| `forgot-password` / `reset-password` 端點 | **無** |
| reset token 資料表 | **無**（`material_download_tokens` 是教材下載票，與 auth 無關） |
| email 驗證／通用 token service | **無** |
| mail service | 有（`emailService.js`，但只涵蓋訂單／付款／教材審核事件） |
| canonical MVP 是否要求 | **否** —— `docs/teaching-platform-mvp-spec-v1.4.md` §11 的 auth surface 只有 `POST /auth/register`／`POST /auth/login`／`GET /auth/me` |

**決策：** 依「不要為了這個 blocker 臨時擴張成大型 authentication project」，
且 canonical MVP 未要求密碼救援 —— 採**方案 B**，移除該 affordance。

**也沒有改成「聯絡客服」**：repo 內雖有多處文案提到「平台客服」
（`paymentProof.service.js`、`materialFile.service.js`、`BankTransferInfo.tsx` 等），
但整個 codebase **沒有任何真實的客服 Email、網址或聯絡頁**。
放一個同樣不存在的管道只是把死路換個位置。

> **附帶記錄（本輪未處理）：** 上述「請聯絡平台客服」文案目前指向一個不存在的管道，
> 屬同一類誠實性問題，但不在本輪四項 scope 內。

### `P1-09` 條款／隱私權／著作權同意 —— **仍為 OPEN blocker**

> ### ✅ **Legal Foundation 已完成（2026-08-27）—— 但 `P1-09` 仍 `OPEN`**
>
> **完成的是文件端的工程基礎，不是法律文件本身。**
>
> **新增：** `legal_documents` registry（migration `20260827_legal_document_registry.sql`
> ＋ bootstrap parity ＋ `db_schema.sql`）／`services/legalDocument.service.js`
> （canonical current-version resolver）／`routes/legal.js`（public read-only）／
> `routes/adminLegalDocuments.js`（Admin only 寫入）／四條 public route
> `/terms`、`/privacy`、`/refund`、`/creator-agreement`／
> `legalDocuments.db.test.js`（13 case）。規格見 `mvp_rules.md` §12.3c。
>
> **四種型別**（`DEC-04` Owner 拍板）：`terms`／`privacy`／`creator_agreement`／
> **`refund_policy`（獨立文件，非 Terms 章節）**。
> 生命週期 `draft → approved → published → superseded`，
> 三道 DB 層防線：fail-closed publication metadata／
> partial UNIQUE「同型別最多一筆 published」／published 後 immutable trigger。
> 發布 v2 時 v1 於同一 transaction 轉 `superseded`（仍可讀，供稽核）。
>
> **實測驗證：** HTTP 生命週期 20/20（無文件→404／draft→404／approved→404／
> published→200／v2 接棒→v1 superseded 且正文仍可稽核／匿名 401／buyer 403／
> 重複版本 409／竄改已發布 409／缺 body 或 effective_date 不得發布）；
> 瀏覽器四條 route（僅 published 型別渲染 `<article>`，其餘三條真 404 且無
> placeholder 洩漏）；mobile 375×812 無橫向溢位、單一 `<main>` landmark（`COR-06`）。
> DB 400/400、unit 213/213、smoke exit 0、`verify:web` exit 0。
>
> **順帶修掉一個實質缺陷：** `effective_date` 原本直接序列化，
> node-postgres 的 `DATE` → 本地午夜 `Date` → UTC ISO，在台北會**少一天**
> （送 `2026-10-01` 回 `2026-09-30T16:00:00.000Z`）。生效日決定條款何時開始
> 拘束使用者，已在 API 邊界固定為 `YYYY-MM-DD` 並加回歸測試。
>
> **本輪刻意未做（`P1-09` 因此維持 `OPEN`）：**
> **未撰寫任何條文**（registry 實測 **0 列**，這是預期且正確的狀態）／
> 註冊 consent 未接線／結帳 consent 未接線／創作者聲明未繫版本／
> 無 re-consent enforcement／無既有使用者遷移／`consent_records` 仍 **0 列**／
> 未建 Footer legal 連結（`DEC-LEGAL-04`：只有對應文件已 published 才顯示）。
>
> ```text
> Legal foundation implemented.
> No formal legal content published.
> Production consent remains unwired.
> ```
>
> **Gate 影響：** Gate 12 `NOT IMPLEMENTED` → **`PARTIAL`**（讀取／儲存基礎具備，
> 正式條文仍缺，`H6` 可儲存性待正文存在後驗收）。
> **Gate 5 維持 `PARTIAL`**（infra 完備但 production consent 未接線且無條文）、
> **Gate 11 維持 `PARTIAL`**（第 4 條 consent 版本處置仍未接線）、
> **Gate 13 維持 `NOT IMPLEMENTED`**（結帳 consent 未接）。
> **Deployment Readiness 維持 0 / 14。**

> ### 📝 **法律文件草稿已產出（2026-08-27）—— `DRAFT / NOT LAWYER APPROVED`**
>
> **這是草稿，不是法律內容完成。** 四份草稿與審閱清單、交付索引位於
> `docs/legal-drafts/`：`terms-of-service.draft.md`／`privacy-policy.draft.md`／
> `creator-agreement.draft.md`／`refund-cancellation-policy.draft.md`／
> `legal-review-checklist.md`／`review-handoff.md`。
>
> ```text
> Status                        : DRAFT — NOT LAWYER APPROVED
> Production publication status : NOT PUBLISHED
> Lawyer approval status        : PENDING
> Accountant approval status    : PENDING
> legal_documents rows          : 0（實測，兩個 DB）
> consent_records rows          : 0（實測）
> Production consent wiring     : NONE
> ```
>
> **草稿僅依 repo 實際能力撰寫**，未承諾平台不具備之功能；所有未決法律／產品
> 問題以 marker 標示（`LAWYER` 50 處／`OWNER` 22 處／`ACCOUNTANT` 14 處／
> `EXTERNAL AUTHORITY` 3 處），**未自行填答**。
> 待外部回覆的 ID 為 `PRE-03`／`L-04`～`L-22`／`RM-15`／`T-02`～`T-14`／
> `LEGAL-01`／`PROD-01`，逐項對應見 `review-handoff.md`。
>
> **本輪未變更任何 Gate 狀態** —— 草稿不是 published 內容：
> Gate 5 `PARTIAL`／Gate 11 `PARTIAL`／Gate 12 `PARTIAL`／Gate 13 `NOT IMPLEMENTED`；
> **Deployment Readiness 維持 0 / 14**；**`P1-09` 維持 `OPEN`**。

**Inventory 結果：**

| 檢查項 | 結果 |
| --- | --- |
| repo 內的 approved legal copy | **無** |
| `/terms`、`/privacy`、`/legal` 等 route | **無** |
| 註冊 consent 是否送到 Backend | **否** —— `app/register/page.tsx` 驗證 `terms` 後**未放進 request body**；`Backend/routes/auth.js` 完全沒有 `terms` |
| `users` 是否有 consent 欄位／版本 | **無** —— **但這句話容易被誤讀**（`C-3`，2026-08-27 澄清）：`users` 表**不直接保存 consent 狀態**；consent 證據的基礎建設**另外存在於 `consent_records`**（append-only trigger ＋ `supersede()` ＋ `consent.service.js` ＋ db test，Wave 1 #3 建立）。真正缺的是**正式流程接線** —— 註冊／購買／創作者條款的版本化 consent 尚未接上，因為 repo 沒有任何經核可的法律文件。**不要因此把 consent 欄位搬進 `users`，也不需要 schema 變更。** |
| 創作者著作權同意 | `materials.ip_declaration_accepted` / `ip_declaration_at` **有持久化**（每份教材），但同樣沒有可閱讀的條文 |
| 是否有文件說它們是必要的 | 有 —— `idea/teaching-platform-mvp-spec-v1.1.md` §11.2 列「必備文件：服務條款／隱私權政策／退款政策／人工解鎖說明」，但**只列出要求，不含條文** |

**因此本輪未做任何變更**，且**刻意不動註冊頁的 consent UI**：

- 產生條文 = 偽造法律文件（明確禁止）。
- 移除 consent checkbox = 靜默拿掉一個法務可能要求的同意閘門 —— 那是產品／法務決策，不是工程決策。

由於 `P1-09` 維持 blocker，這個狀態不會出貨給任何真實使用者。

**需要產品／法務提供的 exact artifacts：**

1. **服務條款**正式條文（繁中；若需雙語，另附語言版本）
2. **隱私權政策**正式條文
3. **著作權／創作者授權條款**正式條文（對應現有的 `ip_declaration`）
4. **退款政策**正式條文 —— **先裁示是否需要**（見下方「來源可信度」）
5. **version 與 effective date 規則**：條文更新時是否需要重新同意
6. **是否需要持久化 consent**（若要：`users` 需要 consent 欄位＋版本，屬 schema 變更）

上述到齊後，工程面的工作是：建立 route、把 checkbox label 接上真實連結、
（若第 6 點為是）加上 consent 持久化。**在那之前不得宣告完成。**

> **來源可信度（2026-08-26 補正）：** 上一輪把「必備文件」清單直接引自
> `idea/teaching-platform-mvp-spec-v1.1.md` §11.2，**那個引用需要限縮**：
> 該檔是 **v1.1 草稿**，位於 `idea/`，**不在 CLAUDE.md 的 canonical 文件表內**；
> canonical 產品／API 契約是 `docs/teaching-platform-mvp-spec-v1.4.md`。
>
> - **canonical v1.4 對法律文件與 consent 完全沒有要求**（實測 grep：0 命中）。
> - **退款政策特別可疑**：canonical `docs/mvp_rules.md` §18.9 明列
>   `Refund / reversal → 不存在` —— 平台目前沒有退款能力。
>   為一個不存在的能力寫政策是產品決策，不是預設必要項。
>
> 因此「需要哪幾份文件」本身就是一個**待裁示的問題**，不是既定清單。

> **法規查證（2026-08-26，本輪新增；未產生任何條文，`P1-09` 維持 OPEN）：**
> 完整報告見 `docs/p1-09-legal-compliance-verification-2026-08-26.md`。
> 對外部草擬的 A～O 十五個模組逐項比對台灣現行法規原文後，**這一項的範圍比原本記錄的更大**：
>
> - **有三項不是「寫文件」的工作**：
>   `PRE-03` 第三方支付能量登錄（**牌照**）、統一發票開立時點（**營運流程**）、
>   帳號冒用時「立即暫停該帳號所生交易」（**產品功能**，網路交易定型化契約應記載事項第十二點）。
> - **已生效、且有硬性時限的法定義務**：《數位經濟相關產業個人資料檔案安全維護管理辦法》
>   （`K0010162`，112-10-12 發布施行）要求危及正常營運或大量當事人權益之個資事故
>   **72 小時內通報數位發展部**。個資法 §12 的 72 小時修正條文雖已於 114-11-11 公布，
>   但**施行日期由行政院另定，截至 2026-08 尚未施行** —— 兩者不可混為一談。
> - **UI 層有兩個硬約束**：消保法 §11-1 審閱期（條款須於勾選前可完整閱讀，
>   且不得有拋棄審閱權字樣）；消保法 §43（申訴 15 日內妥適處理）。
> - **條款寫法有兩個「不得記載」紅線**：管轄法院不得排除消保法 §47／民訴 §436-9 小額訴訟；
>   個資五項權利不得預先拋棄。
>
> 上述**不改變 `P1-09` 的判定**（仍卡在正式條文），但**擴大了它的完成條件**，
> 且新增了上位依賴 `PRE-03`。**仍不得以 AI 產生的條文或 placeholder 頁面宣告完成。**

> **第三輪審查（2026-08-26，同日）：** 產品端提出 `A～P v1.2` 架構，
> 已吸收前兩輪多數發現。完整審查見 `docs/p1-09-v1.2-review-2026-08-26.md`。
> 仍有 **3 個實質錯誤 ＋ 1 個已定案項目消失 ＋ 逐點對照缺口**：
>
> - **`A5` 把法定應記載事項寫反** —— 應記載事項第十三點是「**企業經營者**應確保系統
>   符合一般可合理期待之安全性」（平台承諾），v1.2 寫成使用者禁令。
> - **`J2` 把「是否開發票」與「何時開」混為一談** —— 是否開由稅務結果決定，
>   但**開立時點是法定的**：營業人開立銷售憑證時限表「發貨前已收之貨款部分應先行開立」，
>   本平台收款在 Admin 核准之前，時點即落在收款。
> - **Content-Handling 安全清單納入 `watermark`／`preview`／`format conversion`** ——
>   這三項正是消保法 §8 II「變更服務內容者視為 §7 之企業經營者」的邊界，
>   且是著作權法上的重製／改作，須在授權範圍逐項明文。
> - **「永久下載退場」在 v1.2 消失** —— 該項曾明文定案並要求不得改回。
> - **不得記載事項 8 條紅線只涵蓋 5 條**，缺「目的外利用」「任意終止／免除賠償」
>   與**「限以企業經營者保存之電子交易資料為認定依據」** ——
>   最後一條對本平台的**人工核帳爭議處理**風險最高：
>   寫「以平台入帳紀錄為準」該條款**無效**（消保法 §17 III），
>   付款爭議流程必須容許買家提出自己的匯款證明。
> - 應記載事項 14 點中，**6 點缺正面記載**（解釋原則／商品資訊為契約一部分／
>   電子文件表示方法／交付方式／付款方式說明／§19 解除權）。
>   §17 II「雖未記載仍構成契約內容」是安全網，但主管機關**得隨時派員查核**。

> **第四輪審查（2026-08-26，同日）：** 產品端提出 `A～P v1.4`，
> 導入 Coverage Matrix ＋ MAND Matrix ＋ Prohibited Clause Matrix ＋ 永久 invariant。
> 完整審查見 `docs/p1-09-v1.4-review-2026-08-26.md`。
>
> - **v1.4 無事實錯誤**（四輪以來第一次），且前三輪發現逐條可對到位置；
>   `R9`／`H-VERSION`／`No Permanent Download` 三個上一輪救回的項目都有獨立段落保護。
> - **仍有 2 項回歸**：(1)「Platform 不得自行實質修改教材內容」的第三層禁令消失
>   —— 該禁令的理由是**消保法 §8 II**「變更服務內容者視為第七條之企業經營者」，
>   一旦平台實質改教材就從經銷者升格為製造者，喪失「已盡相當注意」的免責空間；
>   (2) **消保法 §17 II／III／IV 的效力說明消失** —— 沒有它，
>   MAND Matrix 與 R Matrix 只是兩張自訂清單，讀者不知道為什麼是紅線。
> - **4 項從未涵蓋的缺口**：數位經濟個資辦法 §3 要求的是
>   「安全維護計畫」**與**「**業務終止後個人資料處理方法**」**兩份**，v1.4 只寫前者；
>   **「Platform 自己結束營運」沒有任何模組涵蓋**，但 `E6` 卻把 re-download 的條件
>   之一寫成「Platform 仍營運」，形成結構性空洞；消費爭議的**外部**升級管道
>   （消保官／調解委員會／1950）未揭露，`MAND-14` 只完成一半；
>   **營運主體的公司登記與營業項目**沒有位置，但它是稅籍、統一發票核定，
>   以及（若 `PRE-03` 落回代收代付）能量登錄資格的共同前提。

> **第五輪審查（2026-08-26，同日）：** 產品端提出 `v1.5` 變更集，
> 已吸收第四輪全部 6 項發現。完整審查見 `docs/p1-09-v1.5-review-2026-08-26.md`。
> **v1.5 的法源主張逐條查證後全部正確**（含數位經濟個資辦法 §16 的逐款細節與五年保存期）。
> 新發現 3 項 ＋ 流程問題 1 項：
>
> - **Buyer 端沒有「不得儲值／點數／預付／禮券」的紅線** —— 現有的 `No Wallet`
>   invariant 只管 Creator 端。一旦做 Buyer 點數或禮券，
>   《商品（服務）禮券定型化契約應記載及不得記載事項》立即適用，
>   須提供**自出售日起算至少一年**的履約保障機制（足額履約保證／信託專戶／
>   價金保管／同業連帶擔保 四擇一）—— 那是**銀行成本，不是條款**，且無小規模免除。
>   Phase 1 現行流程不構成禮券，但這個邊界必須先寫下來。
> - **sublicense survival 只處理 Creator 主動停止合作** ——
>   著作權法 §37 II 保護的是「授權不因著作財產權人**嗣後讓與或再授權**而受影響」（對平台有利），
>   但**不處理 head license 本身終止**（Platform 解散、Creator Agreement 被終止）時
>   已授予 Buyer 的 sublicense 是否存續。這使 `M7`（假設 Buyer license 不因關站消失）
>   與 `C6` 目前**不一致**，需明文 survival clause。
> - `INV-1`～`INV-6` 與回歸檢查清單不一致（`R9` 只在後者，Coverage Matrix 兩者皆無）。
> - **v1.5 是 delta 不是完整文件，回歸協議跑不起來** ——
>   無法確認 `A～P`／`MAND 14/14`／`R1～R8` 在全文中是否仍逐列存在，
>   而前四輪掉東西的方式正是「改版時沒重寫的段落靜默消失」。

> **第六輪審查（2026-08-26，同日）：** 產品端提出 `v1.6` 計畫，導入
> **單一 `MASTER REGRESSION MATRIX`（MR-01～MR-18）** 與
> **`REGRESSION-PROTOCOL-01`（delta 不得宣告通過回歸檢查）**。
> 完整審查見 `docs/p1-09-v1.6-review-2026-08-26.md`。
> **法源查證全部成立**；並更正本方第五輪的一處措辭過寬（見下）。
>
> - **`REGRESSION-PROTOCOL-01` 是這六輪最重要的結構決定** ——
>   前五輪的失敗全部是「改版時沒重寫的段落靜默消失」，這是唯一能從流程上封住它的規則。
>   `MR-15`（Coverage Matrix 自己也是被檢查項）的自我指涉也正確。
> - **本方更正：** 第五輪把 Buyer 端紅線寫成「不做儲值、點數、**預付**、禮券」過寬 ——
>   目前「特定訂單 → Buyer 匯款 → Admin 核帳」本來就是預付型態，且必須保留。
>   v1.6 改名為 `BUYER-STORED-VALUE-LIMIT` 正確。
> - **禮券的法定分界線是「無償 vs 有償」，不是「有沒有金額」**：
>   商品（服務）禮券**不包括發行人無償發行之抵用券、折扣（價）券**。
>   → 免費發放的金額型抵用券排除；**有償購買的「點數」即使設計成非金額型仍可能是禮券**。
> - **電支條例 §3「多用途支付使用」** 指儲值款項得用於支付**電子支付機構以外之人**
>   所提供之商品或服務，且明文排除「僅得向發行人所指定之人請求商品或服務之商品（服務）禮券」
>   → 平台單一用途禮券**不當然落入電支**，但**是禮券**（須履約保障機制）。兩層不可混為一談。
> - **新發現 3 項**：`MR-13` 把 Buyer stored-value 列為獨立項，但
>   **Creator 端 payout 紅線（No Wallet／No Withdrawal／退款淨額基礎／Buyer UI 不稱 Creator 為 Seller）
>   沒有任何 MR 編號**，一顯一隱正是 Master Matrix 想消滅的不對稱；
>   `PRE-03.8` 只擋 stored-value，**擋不住「Creator 自主提領」等對第三方支付定性殺傷力更大的紅旗**；
>   `REGRESSION-PROTOCOL-01` 少了「完整文件但缺列」的第三態。

> **`v1.7 Full Baseline` 全文回歸檢查（2026-08-26，同日）：**
> 產品端首次產出**完整 baseline**（非 delta），因此第一次可實際執行
> `MR-01`～`MR-19`。完整報告見 `docs/p1-09-v1.7-full-regression-2026-08-26.md`。
>
> **判定：`FULL REGRESSION — FAILED`（`MR-04`）。18 PASS / 1 FAILED。**
>
> - **`MR-04` 失敗原因不是表格缺列，而是索引指向不存在的內容** ——
>   `MANDATORY CONTRACT MATRIX` 14 列齊全，但 **MAND-02（有利消費者解釋）／
>   MAND-05（確認機制＋確實履約）／MAND-06（數量上限）／MAND-07（交付方式）／
>   MAND-10（法定解除權正面記載）** 在被指派的模組全文中**沒有對應段落**。
>   其中 **MAND-10 最實質**：目前只寫「不提供反悔退款」＋「七日例外」，
>   讀起來像「本平台不適用七日解除權」，接近 `R5` 的邊界。
> - **`MR-11` 通過但內容被弱化**：`K5` 把已查證的
>   「留存記錄**至少五年**」與三類處理（銷毀／移轉／刪除停止利用）的應記載欄位，
>   軟化成「按適用法規保存」—— 把可直接寫進規格的具體數字退回成「去查法規」。
> - **`MR-15` 措辭指向已退役的產物**（Coverage Matrix 已依第五輪建議刻意合併掉，
>   做法正確，但 MR-15 字面仍要求它存在，會讓下一輪開出假 FAILED）。
> - **法源依據流失 2 處**：`CONTENT-LIMIT` 缺消保法 §8 II、`C2` 缺著作權法 §37 I ——
>   規則在、理由不在，未來容易被當成「產品偏好」而放寬。
> - **新發現**：`18+` 被軟化成「**原則上** 18+」，但未定義例外條件與核准流程 ——
>   對一個會在 code 實作成硬性檢查的規則是有害的模糊。
>
> **轉 PASS 的最小修改是 5 項（補 MAND-02／05／06／07／10 的實體段落）**，
> 其餘 6 項不影響 MR 判定但建議同批處理。

> **`v1.8` 修法計畫審查（2026-08-26，同日）：** 11 項全數正確承接，無錯誤無漏項。
> 完整審查見 `docs/p1-09-v1.8-plan-review-2026-08-26.md`。
> **但發現一項五輪以來從未涵蓋的重大遺漏：**
>
> - **消保法 §18 整條缺席。** 歷次 `MAND-01～14` 全部來自
>   「零售業等網路交易定型化契約應記載及不得記載事項」（§17 的授權命令）；
>   **§18 是消保法本文的另一條獨立義務**，並行而不互相取代。
>   其中三款是 MAND 完全沒有的：**付款期日與交付期日**（MAND 只有「方式」沒有「期日」）、
>   **消費者依 §19 解除契約之行使期限及方式**、
>   **排除解除權適用之情形**（且第三、四款須**並列揭露**，不能只揭露排除）。
>   **§18 II** 另要求網路通訊交易的資訊須以「**可供消費者完整查閱、儲存**」之電子方式提供
>   —— v1.7 `H5` 只有「可閱讀、可再次開啟」，**沒有可儲存**。
> - **漏掉的代價是四個月，不是七日。** §19 III：未依 §18 I 3 提供解除權資訊者，
>   七日期間自**補提供之次日**起算，**最長可延伸至四個月**。
>   → 同意流程有瑕疵時的暴露量級改變，`MAND-10` 與 `F` 不是文件完整度問題，是風險量級問題。
> - **建議新增 `MR-20`**（§18 六款 ＋ §18 II），這是本輪唯一需要**新增結構**的項目。
> - **另發現 v1.7 既有缺口：無付款審核 SLA。** 買家已匯款、錢在平台帳戶，
>   但 `payment_approved_at` 沒有任何時限承諾（`N2` 的十五日是**申訴** SLA，不是審核 SLA）。
>   在「平台已收錢、買家什麼都沒拿到」的狀態下，無上限的人工審核窗口同時是
>   `MAND-05`「確實履行契約」的反例與消保法 §12 顯失公平的風險面。

> **`v1.8` 正式範圍確認（2026-08-26，同日）：** 產品端已採納 §18／`MR-20`，
> 範圍全部決定正確。完整審查見 `docs/p1-09-v1.8-scope-confirmation-2026-08-26.md`。
> **新發現 7 項，其中 2 項是 §18 直接推導出的新產品需求：**
>
> - **§18 I(2) 要求揭露「付款期日」—— 買家端付款期限完全沒人處理。**
>   `PAYMENT-REVIEW-SLA` 是**平台端**審核時限；訂單建立後買家何時匯款、
>   逾期是否取消、逾期後才匯款如何處理、教材是否保留 —— 全部未定義。
> - **§18 I(2) 的「交付期日」使 `PAYMENT-REVIEW-SLA` 成為 `MR-20` 的前提**，
>   不是並行項目：SLA 沒定 → 交付期日無法揭露 → `MR-20 §18 I(2)` 不可能 PASS。
> - **§18 I(3) 與 (4) 是並列兩款**，把「先寫權利、再寫例外」從寫作風格
>   **升級為條文強制的順序** —— 只揭露排除情形而不揭露法定解除權的
>   行使期限與方式，本身即違反 §18。
> - **§18 II「可完整查閱、儲存」是產品能力**（可下載／列印／複製全文），
>   應進 Deployment Gates；scroll-locked modal 或圖片化條款不符合。
> - **同意順序需要可驗證的斷言**，不只是欄位：
>   「不得存在 `access_granted_at` 早於或缺少 `consent_accepted_at` 的訂單」。
> - **`review_due_at` 起算點會算錯**：應起算於 `payment_info_submitted_at`
>   （平台被通知的時點），不是 `payment_received_at`（銀行入帳，Admin 查帳時才發現，
>   從它起算會變成回溯）。稅務憑證時點才用 `payment_received_at` —— 兩個時鐘不可互相冒充。
> - **§17 與 §18 的制裁機制不同**：§17 違反依 **§56-1** 限期改正、屆期不改
>   處 3～30 萬，再次 5～50 萬且**得按次處罰**；§56-1 **未涵蓋 §18**，
>   §18 的主要效果是 **§19 III 的四個月解除權暴露**。兩套義務不能互相覆蓋。
> - 另：引用來源第三次錯配（§18 指向公平交易法法規系統），違反 v1.6 自訂的法源引用治理規則。

> **`v1.8` 最終範圍審查（2026-08-26，同日）：** 16 項全部正確，`MR-20` 十三項拆解無誤，
> 引用來源已修正。完整審查見 `docs/p1-09-v1.8-final-scope-review-2026-08-26.md`。
> **但發現一個會擋住 20/20、且不是文件問題的硬缺口：**
>
> - **`MR-20 §18 I(3)` 要求揭露「解除權之行使方式」，但平台完全沒有解除／退款能力。**
>   證據：`docs/mvp_rules.md:1371` 明列 `Refund / reversal → 不存在`；
>   `Backend/routes/`、`Backend/services/`、`db/db_schema.sql` 對 `refund` **皆 0 命中**。
>   **無法揭露一個不存在的行使方式。**
> - **而且不揭露也擋不住法律效果**：§19 IV「消費者…**發出書面**者，**契約視為解除**」
>   —— 不需平台同意、不需平台有按鈕；§19 V「違反本條規定所為之約定，其約定無效」。
>   疊上 §19 III（未揭露 → 期間自補提供次日起算，**最長四個月**），
>   平台會直接進入「契約已解除、但系統無法撤銷授權也無法退款」的狀態。
> - **連帶影響四個模組**：`E5` Remedy（corrupted file／wrong material／duplicate payment）、
>   `M3` IP takedown 的 refund／replacement、`M7` 停業的 unresolved refunds、
>   `P13` Buyer refund liabilities —— **四處都在承諾退款，repo 裡沒有任何退款程式碼**。
>   寫了做不到的條款本身即 `R6`／消保法 §22 的風險面。
> - 建議新增 **Gate 14 `RESCISSION-AND-REMEDY-CAPABILITY`**：
>   撤銷教材存取權 ＋ 退款義務紀錄與狀態機。Phase 1 的退款**可以是人工銀行匯回**
>   （與收款對稱），但必須有紀錄、狀態機與稽核，不能是「沒有這件事」。
> - 另 3 項：Gate 13 的斷言少了「`consent_disclosure_version` 須對應該訂單生效版本」
>   （逾期訂單復活時會產生假 PASS）；`N` 的「responsible information **as applicable**」
>   把無條件要求寫成有條件（應記載事項第一點與 §18 I(1) 都**無條件**要求負責人／代表人）；
>   `MR-20` 第 11 項（§18 I(6) 其他公告事項）應套用 `G3` 第四款的
>   「需實證確認，不能自行假設有或沒有」紀律。

> **`Gate 14` 採納後的下游後果（2026-08-26，同日）：** 產品端已採納
> `Gate 14 RESCISSION-AND-REMEDY-CAPABILITY`（人工銀行退款即可，但必須有紀錄與狀態機）。
> 完整審查見 `docs/p1-09-gate14-downstream-review-2026-08-26.md`。
> **新發現 5 項，其中 2 項有 repo 證據且會造成資料損失或狀態機污染：**
>
> - **`F2` entitlement 目前沒有獨立狀態，revoke 不能靠改訂單狀態實作。**
>   `Backend/services/materialFile.service.js:23`：「授權查詢**不看 `material_files.id`，
>   只看訂單與 `approved_file_id`**」；`material-file-storage-and-delivery.md:315`：
>   「entitlement 綁 order」。→ 目前是**從訂單狀態推導**，沒有可獨立撤銷的記錄。
>   必須明訂**不得以修改 `orders.status` 實作 revoke**（會污染訂單狀態機、對帳與稽核，
>   而 `Gate 14` 要求的正是可稽核）。
> - **`F3` revoke 會與檔案回收指令產生危險交互。**
>   `material-file-storage-and-delivery.md:195`「只要有合法 buyer entitlement 就不得任意實體刪除」、
>   `:362`「只有 `superseded` 且**無任何 entitlement 依賴**的列才由維運指令回收」
>   → revoke 若移除 entitlement，orphan cleanup 可能**實體刪除**該檔案；
>   之後 restore access 或需提供 `PRE-04.1` 履約版本時就沒有檔案了。
>   → `revoke` 語意必須是「**暫停交付**」而非移除 entitlement，
>   回收指令須把 revoked／restorable 視為仍有依賴。
> - **`F1` 退款會產生稅務憑證沖銷，v1.8 只寫了開立。**
>   統一發票使用辦法 §20：開立後發生銷貨退回或折讓，**銷售額已申報者，
>   應取得買受人出具之銷貨退回／折讓證明單**（憑證由**買受人**出具，
>   代表流程要能向 Buyer 索取）。`J` 缺 `tax_document_reversal_*`；
>   具體形式依賴 `P4`（是否使用統一發票）的結果。
> - **`F4` 退款與 Creator 報酬的時序沒有規則** —— 退款發生在該期已結算並已付款之後怎麼辦？
>   `P10` 有 `refund/excluded_transactions` 欄位、v1.7 §3 要求說明「報酬更正方式」，
>   但**規則不存在**。若採「下一期扣除」，實作不當會長得像 clawback →
>   直接觸發 `PRE-03.8` 的 reopen trigger。
> - **`F5`** `mvp_rules.md:1371` 改寫時須帶狀態標記（REQUIRED／尚未實作），
>   否則 canonical doc 會描述不存在的行為；實作時依 CLAUDE.md §9 須同一次 push 更新。

> **`v1.8` Scope Lock 審查（2026-08-26，同日）：**
> 完整審查見 `docs/p1-09-v1.8-scope-lock-review-2026-08-26.md`。
>
> - **本方更正：** 上一輪 `F1` 寫「憑證是買受人出具的，退款流程要能向 Buyer 索取證明單」
>   **過度一般化**。統一發票使用辦法 **§20-1**：電子發票的退回／折讓走
>   **存根檔／收執檔／存證檔**三檔電子流程，非紙本四聯單，且條文本身區分買受人為
>   營業人／非營業人。對方的修正正確。**再精細一層**：`P14` 需三個維度分流 ——
>   憑證型態（紙本 §20／電子 §20-1／小規模免用發票之收據）、
>   **買受人是否為營業人**（本平台買家以個人為主，多數無統編 → 非營業人）、
>   銷售額是否已申報。
> - **`MR-16`／`MR-17`／`MR-18` 語意重定義為「Gate 完整列出且狀態誠實」而非「已完成」——
>   正確，且是必要的**（否則 20/20 在所有 code 寫完前不可能達成）。但需兩個防護：
>   (1) baseline 標頭固定**三條獨立狀態線**（Document Regression／Deployment Readiness／
>   Legal-Tax Validation），`PASSED (20/20)` **不蘊含任何功能存在**；
>   (2) 標為 `IMPLEMENTED` 的 Gate **必須附證據指標**，否則「狀態誠實」沒有牙齒。
>   **現況可一次 grep 驗證**：`db/db_schema.sql` 與 `Backend/` 對
>   `payment_received_at`／`entitlement_status`／`terms_accepted`／`consent_version`／
>   `frozen`／`account_freeze` **全部 0 命中** → Gate 1／5／6／14 皆 `NOT IMPLEMENTED`。
> - **`ENTITLEMENT-RETENTION-INVARIANT` 沒有終止條件，會讓檔案回收永久癱瘓。**
>   「revoked but legally／audit-restorable」若無 retention floor，
>   `material-file-storage-and-delivery.md` §8.5 的回收指令將永遠不回收任何檔案。
>   需取適用期間最大值（消保法 §19 III 四個月／個資辦法 §16 五年／稅務保存／
>   `PRE-04` 履約版本存續）並說明推導。
> - **`PRE-03.8` 的「損害賠償 vs clawback」需要可操作判準**，否則退化成取名字的藝術：
>   判準是**調整的計算基礎**（Buyer 交易款項 → trigger；Platform 所受損害 → 不 trigger），
>   操作性測試是「若 `creator_fault_adjustments` 恆等於退款金額，實質即 clawback」。
>   `P10` 的該欄位須另存**損害計算依據**，不只金額。

> **`RETENTION-MATRIX` 審查（2026-08-26，同日）：**
> 完整審查見 `docs/p1-09-retention-matrix-review-2026-08-26.md`。
>
> - **本方更正：** 上一輪建議的「取所有適用期間的**最大值**當 retention floor」**是錯的**。
>   那四個期間保護的不是同一個對象（消保法 §19 III 四個月＝**解除權窗口**；
>   個資辦法 §16 五年＝業務終止後**處理紀錄**本身，不是個資本體更不是教材 binary；
>   稅務＝憑證帳簿；只有 `PRE-04` 履約版本才是教材檔案）。
>   且**個資法 §11 III**「特定目的消失或期限屆滿時，應…刪除、停止處理或利用，
>   但因**執行職務或業務所必須**或經當事人書面同意者不在此限」——
>   對個資而言**過度保存本身就是風險**，不只是浪費。
>   對方改為 purpose-based 的 `RETENTION-MATRIX` **正確**。
> - **但 Matrix 不完整：`B` 的資料清單有 13 類，Matrix 只覆蓋約 7 類。**
>   缺 `activity_logs`／`report_events`／security logs／complaints＋evidence／
>   Creator tax identity data（與 tax document 是**兩件事**）／基本帳號資料。
>   → 應由 `B` 的清單 **1:1 推導**，完整性檢查掛 `MR-11`（不需 `MR-21`）。
> - **新發現（repo 證據）：`activity_logs` 與個資法 §11 III 直接衝突。**
>   `db/db_schema.sql:356-359` 的 `activity_logs` 有 `actor_id`／`actor_role` → **含個資**；
>   `CLAUDE.md` §4 規則 4 要求**不得改寫歷史 `activity_logs`**（稽核軌跡）。
>   兩者只能靠 §11 III 但書調和 —— 代表「因為是稽核軌跡所以永遠留著」**不是合法預設**，
>   而是必須寫下理由與期限的決定。**且 v1.7 `K5` 的業務終止資料清單也漏了 `activity_logs`**
>   （只有 security records）。未來若要支援當事人刪除請求，
>   「稽核軌跡中的 `actor_id` 如何處理」是 `CLAUDE.md` §4 規則 4 與個資法之間唯一的接縫。
> - **cleanup 判定需 legal hold 一級欄位 ＋ fail-closed**：七條件中有三條是判斷題
>   （pending complaint／IP process／其他保存義務），臨場判斷不可靠。
>   legal hold 應為記錄上的欄位、由流程設定、cleanup 只讀不判斷；
>   本 repo 已有 fail-closed 慣例（`privateFileStorage.js`，見 `PRE-01`）。
> - 對方兩處細化**優於本方原版**：`CREATOR-ADJUSTMENT-SUBSTANCE-TEST` 改為
>   「恆等於是 red flag，應觸發實質複核」而非「就是 clawback」；
>   `STATUS-EVIDENCE` 擴及 `VALIDATED`／`COMPLETED` 而不只 `IMPLEMENTED`。

> ### **`P1-09` FINAL SCOPE RECONCILIATION（2026-08-26）—— SCOPE LOCK RECOMMENDED**
>
> 完整盤點見 `docs/p1-09-final-scope-reconciliation-2026-08-26.md`（A～H 八項交付物）。
> 本輪**不擴張法律研究**，只把十三輪的發現收斂成有限、可驗收、可結案的 scope。
>
> - **Final Scope Register**：`S-01`～`S-24`（既有結構）／`F-01`～`F-11`（`MR-04` 修復）／
>   `G-01`～`G-12`（§18／`MR-20`）／`H-01`～`H-11`（Gate 14）／`J-01`～`J-06`（Retention）／
>   `K-01`～`K-06`（治理），每項含 Phase 1／Deployment／External 需求、repo 狀態與 evidence。
> - **十三輪全部發現已逐條 reconcile，無一遺漏、無一僅存在於對話。**
> - **REJECT**：`PRE-05`／`Q` module／`MR-21`／`Gate 15`／獨立 Coverage Matrix／
>   獨立 `INV` 清單／「retention 取最大值」（本方前輪錯誤）。
> - **DEFER（不新增 Phase 1 Gate/MR/PRE）**：multi-seat license／Buyer stored-value／
>   電子發票 automation／Phase 2 marketplace／信用卡與自動金流／向 Creator 收費。
> - **`H` = 無** —— 沒有已知、屬 Phase 1、且未被 Register 涵蓋的缺口。
>
> **Deployment Readiness：0 / 14 IMPLEMENTED（Gate 2 為 PARTIAL），全部附 repo evidence。**
> 依 `K-04`，這**不影響** `MR-18` 能否 PASS —— `MR-18` 檢查的是
> Gate 是否完整列出、有 acceptance criteria、狀態誠實且附 evidence。
>
> **`P1-09` DOCUMENT CLOSEOUT CRITERIA 十四項**已明訂；目前 **4 項未達成**：
> v1.8 Full Baseline 未產出／MAND 缺 5 項實體段落／`RETENTION-MATRIX` 未建立／
> `MR-01`～`MR-20` 尚未全 PASS（v1.7 為 `FAILED (MR-04)`，`MR-20` 未建立）／
> `mvp_rules.md:1371` 待改為 `REQUIRED — Gate 14 / NOT IMPLEMENTED`。
>
> **結案後只追 Deployment（0/14）、Legal（`L-01`～`L-23`）、Tax（`T-01`～`T-15`）三條狀態線，
> 不得因純理論或 Future Phase 重新開啟 `P1-09`。**

> ### ✅ **`P1-09` DOCUMENT PHASE — CLOSED（2026-08-26）**
>
> **產出：** `docs/PRE-03_PRE-04_P1-09_A-P_v1.8_Full_Baseline.md`（完整 baseline，非 delta；
> `.md` 為 canonical source）
> **回歸：** `docs/p1-09-v1.8-full-regression-2026-08-26.md` ——
> **`FULL REGRESSION — PASSED (20/20)`**，從 `MR-01` 逐列跑到 `MR-20`，未沿用 v1.7 任何結果。
> 執行中發現並修復 1 項（`MR-11` 缺 `B` 清單的 `support` 一列 → 補為 `RM-18`），已揭露。
>
> **CLOSEOUT CRITERIA 14/14 全部達成**（前次 5 項未達成者已全數修復）：
> v1.8 Full Baseline 已產出／`MAND` 14/14 **有實體條款文字**（`A8`、`E2-A`、`E3`、`E4`、`E5`、`E7`、`§2.2` 為本版新建）／
> `RETENTION-MATRIX` 已建立（`RM-01`～`RM-18`，由 `B` 清單 1:1 推導）／`MR-01`～`MR-20` 全 PASS／
> `docs/mvp_rules.md` §18.9 已改為 **`Refund / reversal → REQUIRED — P1-09 Gate 14 / NOT IMPLEMENTED`**
> 並附狀態說明（消除 doc-ahead-of-code 與 doc-behind-code 兩種不一致）。
>
> **四條獨立狀態線（永不合併）：**
>
> ```text
> Document Regression   :  PASSED (20/20)          ← 本輪達成
> Deployment Readiness  :  0 / 14 IMPLEMENTED      ← Gate 2 為 PARTIAL
> Legal Validation      :  PENDING (0 / 22 active)
> Tax  Validation       :  PENDING (0 / 14 active)
> ```
>
> **`P1-09` 本身仍為 `OPEN` deployment blocker** —— 文件階段關閉**不等於**可以上線：
> repo 仍無 approved legal copy、14 個 Deployment Gate 全未實作、Legal/Tax 全未驗證。
>
> **執行規劃（2026-08-26）：** `docs/p1-09-execution-plan-2026-08-26.md`
> —— A～I 九項交付物，含 `PRE-03`／`PRE-04` Resolution Matrix、Gate 1～14 dependency、Wave 0～5。
> **本輪 repo inventory 取得四項改變排序判斷的證據：**
> `INV-1` **`order_items` 已存在且已有 snapshot 慣例**（`title_snapshot`／`price_snapshot`）
> → Gate 7 與 Gate 14 落在**同一張既有表**，可用**單一 migration** 完成，且與 `PRE-03` 答案無關；
> 該表 `UNIQUE (order_id, material_id)` 只擋單筆訂單內重複，**不擋跨訂單**（影響 `E2-A`／`F-03`），
> `quantity` **無 CHECK**，`seller_id` 欄位名內建 Marketplace 模型（需檢查是否外洩到 Buyer UI）。
> `INV-2` **entitlement 完全由 `orders.status` 推導**（`materialFile.service.js:413`）**〔歷史紀錄；已於 2026-08-30 superseded —— `order_items.entitlement_status` 已實作，見證據附錄 `INV-2` Freshness update〕**——
> 但因 `order_items` 已存在，`entitlement_status` 可加在該表，**entitlement 查詢只需多一個 AND**，
> **完全不必碰 `orders.status`**。Gate 14 的 entitlement 部分是**小變更，不是重構**。
> `INV-3` **`orders.paid_at` 的語意是「核准時間」不是「收款時間」**
> （`adminDashboard.service.js:74` 以它作營收認列）→ Gate 6 會觸及營收報表語意，
> 新增 `payment_received_at` 時**不得靜默改變既有 dashboard 計算基礎**；
> 且 `paid_at` **不是**合法的稅務時鐘（`J2`／`P6`）。
> `INV-4` **無結構化匯款辨識欄位**（`last_four`／`bank_name` 等 0 命中）——
> baseline `§2.1` 描述的回填欄位目前只有檔案上傳，併入 **Gate 6** 的 acceptance criteria，不新增 Gate。
>
> **`PRE-04` 不需整體完成，Gate 7／Gate 14 即可開工** —— 資料層與狀態層中性，
> 只有**判準、期限、文案**須等 `L-10`／`L-21`／`T-14`。
>
> **✅ `PRE-03 EXTERNAL VALIDATION PACKAGE` 已產出（2026-08-26）—— READY TO SEND：**
> `docs/pre-03-lawyer-validation-package-2026-08-26.md`（`Q-01`～`Q-20`，對應 `L-01`～`L-22`）
> `docs/pre-03-accountant-validation-package-2026-08-26.md`（`Q-06`～`Q-13`，對應 `T-01`～`T-14`）
> `docs/pre-03-validation-evidence-appendix-2026-08-26.md`（`INV-1`～`INV-4`、`EVD-1`～`EVD-10`、
> Question-to-Gate 依賴矩陣、Engineering-safe 清單、複驗指令）
> 兩份包**均可獨立閱讀，不需接觸原始碼**；已附產品決策樹（若答 A／B 之不同後果）。
> **律師第一題 = `Q-02`（支付定性）；會計師第一題 = `Q-06`（營運主體與營業項目）。**
>
> **NEXT ACTION（原）：`PRE-03 EXTERNAL VALIDATION PACKAGE`** ——
> 理由是它 lead time 最長（數週、外部）且**消耗零工程資源**，
> 而 Wave 1 foundation 隨時可開始。順序不可顛倒。
> 律師第一題 `Q-02`（人工匯款是否構成代收代付）；
> 會計師第一題 **`Q-06`（營業項目／公司登記）**—— 它是 `T-04`／`T-05`／`Gate 9` 的前提。
>
> ### ✅ **Wave 1 #1 完成（2026-08-26）：`order_items` 授權狀態與履約版本 foundation**
>
> **選它的理由：** dependency 最底層（`order_items` **已存在**）、後續共用最多（Gate 7 ＋ Gate 14 ＋ `F-03`）、
> 且**即使 `Q-02` 回覆與假設相反仍有價值** —— Marketplace 模式**更**需要可獨立撤銷的授權狀態。
>
> **改動：** `Backend/migrations/20260826_order_item_entitlement_and_fulfillment.sql`（新）／
> `bootstrapModel.js`（idempotent mirror）／`db/db_schema.sql`／
> `materialFile.service.js`（`hasPurchaseEntitlement` 加 `entitlement_status = 'active'`）／
> `tests/orderItemEntitlement.db.test.js`（新，5 個 case）／`run-db-tests.js`／
> `material-file-storage-and-delivery.md` §7.1、§8。
>
> **純加法 8 欄 ＋ 2 CHECK ＋ 1 部分索引。`orders`（含 `paid_at`）與訂單狀態機完全未動。**
> 套用後 security test DB 的 **286 列全部為 `active`** —— 既有買家下載權零變動。
>
> **驗收：** DB **214 / 214**、unit **164 / 164**、smoke **exit 0（All smoke checks passed）**。
>
> **兩項執行中的發現：**
> (1) migration 首次套用因 `quantity >= 1` 被既有資料擋下並**自動 rollback** ——
> 查明後確認 3 列違反者是**我自己失敗測試留下的 fixture**（`_oie_` 前綴），
> 清掉後重新套用；**真實資料無違反**。順帶確認 DB 中確實存在 `quantity = 2` 與 `= 5` 的列
> （不違反本次約束，但與 `E2-A` 相關，留待 Wave 2）。
> (2) SQL migration 與 `bootstrapModel` 產生的 FK **名稱不一致**（PG 自動命名 vs 手動命名），
> 已統一為 `order_items_fulfilled_version_fkey` 並在 test DB 重新命名。
>
> **Gate 狀態變更：Gate 7 與 Gate 14 由 `NOT IMPLEMENTED` → `PARTIAL`**（僅 foundation，非完成）。
>
> **刻意未做（Wave 2）：** 撤銷／恢復 API、`fulfilled_*` 的寫入端、
> `routes/me.js` 與 `repositories/review.repository.js` 兩處同型查詢的對齊
> （在撤銷能力存在前三者行為完全一致，屆時必須同一批對齊）、
> `E2-A` 跨訂單重複購買檢查。**`teacherSales.service.js` 不得加授權條件** —— 那是營收報表。
>
> ### ✅ **Wave 1 #2 完成（2026-08-26）：`PAYMENT TIMING FOUNDATION`**
>
> **改動：** `Backend/migrations/20260826_payment_timing_foundation.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`paymentProof.service.js`（寫 `payment_info_submitted_at`）／
> `routes/admin.js`（核准可選填 `paymentReceivedAt`）／`tests/paymentTiming.db.test.js`（新，7 case）／
> `run-db-tests.js`／`docs/mvp_rules.md` §12.3（改寫）＋ **新增 §12.3a 四個時間的 canonical 定義**。
>
> **四個時間正式分離**（`orders`）：`payment_due_at`／`payment_info_submitted_at`／
> `review_due_at`／`payment_received_at`。另加 `manual_payment_proofs.reported_*` 四欄
> （**`reported_` 前綴刻意標示為「買家申報」而非「平台查證的事實」** —— 對應不得記載事項第七點）。
>
> **`orders.paid_at` 完全未動** —— 未改名、未改義、未 backfill、未改任何既有 revenue query。
> 它的語意仍是 Admin 核准時間，仍是 adminDashboard／adminTrends／teacherSales 的營收認列依據。
>
> **非回歸證據：** migration 前後 approved 訂單 **129 筆／paid_at 127 筆完全不變**；
> 四個新欄位**全為 NULL**；`status='approved' AND paid_at IS NOT NULL AND payment_received_at IS NOT NULL`
> 的列數為 **0**（未假造歷史入帳時間）。smoke 跑完後 3 筆訂單取得
> `payment_info_submitted_at`，其中一筆同時有 `paid_at` 與 `payment_info_submitted_at`
> 但 `payment_received_at` 仍為 NULL —— **證明三者確實獨立記錄且未預設 `NOW()`**。
>
> **驗收：** DB **222 / 222**、unit **164 / 164**、smoke **exit 0**。
>
> **兩個刻意的克制：**
> (1) **不自行拍板 SLA 與付款期限的數值** —— `payment_due_at`／`review_due_at` 恆為 NULL，
> 標為 `VALUE PENDING PRODUCT DECISION`（baseline §3.1／§7）。
> (2) `payment_received_at` **未提供時保持 NULL，不預設 `NOW()`** ——
> 那正是 `paid_at` 被混用的成因；寧可誠實地「不知道」，也不製造看似精確的猜測值。
>
> **Gate 狀態變更：Gate 6 `NOT IMPLEMENTED` → `PARTIAL`。**
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 2、6、7、14 為 PARTIAL）**。
>
> **刻意未做（下一 Wave）：** `review_due_at` 的計算與逾時偵測、
> 買家申報欄位的 API／UI 接線（`POST /orders/:id/payment-proof` 仍只收檔案）、
> Admin 入帳時間輸入 UI、`payment_due_at` 的逾期處理流程。
>
> ### ✅ **Wave 1 #3 完成（2026-08-26）：`CONSENT VERSIONING FOUNDATION`**
>
> **Inventory 的四個發現：** (1) 註冊 consent **只在前端** —— `register/page.tsx` 有 zod
> 驗證但**未放進 request body**，`routes/auth.js` 只收 `{email, password, role}`；
> (2) `materials.ip_declaration_accepted` 在建立教材時被**寫死為 `true, NOW()`**
> （`routes/materials.js`），**並非讀自請求** —— 它證明的是「教材被建立了」，
> 不是「創作者做出了明示的、有版本的聲明」；
>
> > **Erratum（2026-08-27，superseded factual note）** —— 上面 (2) 的**前半段已不成立**。
> > `DEC-02R` 已把 INSERT 的字面 `true` 改為綁定經驗證的 `ipDeclarationAccepted`，
> > 且 `routes/materials.js` 早有 `ipDeclarationAccepted !== true → 400` 的 guard、
> > Creator UI 預設未同意並需明示切換。因此**現況是創作者的明示行為，不是平台代填**。
> > **後半段仍然成立**：它沒有文件版本與內容雜湊，**不構成版本化的同意證據**。
> > 本段保留原文以維持稽核軌跡；canonical 現況見 `docs/mvp_rules.md` §12.1a／§12.3b
> > 與 `db/db_schema.sql` 的欄位註解。
> > **不得**再以「fake evidence／fabricated consent／使用者從未同意」描述此欄位。
> (3) repo 中 **document version 欄位零命中**；(4) 無 `/terms`／`/privacy`／`/legal` route。
>
> **架構選擇：generic `consent_records` 表 ＋ nullable context 外鍵。**
> 三種情境（使用者／教材／訂單）結構完全相同、只有 context 不同；
> 分開做會讓 `H-VERSION` 不變條件必須實作三次，且無法統一回答「這個使用者同意過什麼」。
>
> **改動：** `migrations/20260826_consent_records_foundation.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`services/consent.service.js`（新）／
> `tests/consentRecords.db.test.js`（新，7 case）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.3b**。
>
> **`H-VERSION` 以 DB trigger 強制**：`accepted_at`／`document_version`／`context_type`
> 等既有事實不得改寫；更正走 `supersede()`（寫新記錄 ＋ 舊列指向它）。
> **刻意只擋 UPDATE、不擋 DELETE** —— 「不得改寫歷史」是 H-VERSION 的要求，
> 「永不刪除」不是（`RM-13`／個資法 §11 III）；若連 DELETE 都擋，
> 等於替尚未拍板的保存期限做了「永久保存」的決定。
>
> **兩個刻意的克制：**
> (1) **不接線任何流程。** repo 沒有任何經核可的法律文件，
> 現在接線會保存**指向不存在版本的假證據** —— 比沒有記錄更糟。
> smoke 跑完後 `consent_records` 仍為 **0 列**，即為證據。
> (2) **不 backfill legacy。** `materials.ip_declaration_*` **原地保留**
> （migration 前後皆 341 列，未動），**不搬移、不編造版本** ——
> 未知的版本就是未知。`document_version` 為 NOT NULL 且不得空白，
> service 與 DB CHECK 雙重擋下，**不提供預設值**。
>
> **驗收：** DB **230 / 230**、unit **164 / 164**、smoke **exit 0**。
>
> **Gate 狀態變更：Gate 5 `NOT IMPLEMENTED` → `PARTIAL`。**
> **Gate 13 維持 `NOT IMPLEMENTED`** —— 本輪只有 storage foundation，
> 無 access gating、無 disclosure version 的實際來源，**不得虛報 PARTIAL**。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 2、5、6、7、14 為 PARTIAL）**。
>
> **刻意未做：** 正式條文、`/terms` 等 route、`H6` 可儲存能力、註冊／教材／結帳的寫入端接線、
> 文件版本生命週期、re-consent 政策、Gate 13 的 access gating。
>
> ### ✅ **Wave 1 #4 完成（2026-08-26）：`ACCOUNT FREEZE FOUNDATION`**
>
> **關鍵架構發現：`requireAuth` 完全不碰 DB**（`req.user` 全部來自 JWT payload），
> 而 **JWT 有效期 7 天** —— 把凍結狀態塞進 token 會讓凍結**延遲至多 7 天生效**，
> 直接違反應記載事項第十二點的「**立即**暫停」。
> → 因此必須**即時查 DB**，且**只掛在敏感寫入路徑**
> （讀取不付出額外成本、保護面明確可稽核、對既有 auth 架構最小改動）。
>
> **改動：** `migrations/20260826_account_freeze_foundation.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`middlewares/accountStatus.js`（新）／
> `routes/{order,materials,teacherUpload,review.routes}.js`（掛閘門）／
> `routes/admin.js`（`POST /admin/users/:id/{freeze,unfreeze}` ＋ activity log）／
> `tests/accountFreeze.db.test.js`（新，6 case）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.2a**。
>
> **保護判準：**「會產生金錢後果、授權後果，或對外不可逆之公開內容的寫入」。
> **擋**：建立訂單／提交付款資訊／建立與修改教材／換檔／重新送審／教材檔案上傳／發表評價。
> **不擋**：購物車與收藏（非「交易」）、檢舉（送往 Admin 的**非公開**通報管道，
> 擋掉可能妨礙正當的安全通報）、登入與所有讀取、Admin 路徑
> （admin 只能由 CLI 建立；鎖住 admin 會讓解凍本身不可能）。
>
> **非回歸與實地證據：** migration 前後 **695 → 695 users 全部 `active`**、
> `frozen_at` 非 NULL 為 **0**（無誤凍結、無假造稽核）。
> **HTTP 實測（繞過前端直打 API）**：凍結前 `POST /orders` 回 400（空車，正常業務錯誤）；
> 凍結後 `POST /orders` 與 `POST /reviews` 皆回 **403 `account_frozen`**；
> **登入仍為 200**；解凍後恢復為 400。
> 守衛驗證：未附理由 → `reason_required`；凍結自己 → `cannot_freeze_self`；
> 凍結其他 admin → `cannot_freeze_admin`。`activity_logs` 有
> `account.frozen`（含 reason）與 `account.unfrozen`。
>
> **驗收：** DB **237 / 237**、unit **164 / 164**、smoke **exit 0**
> （smoke 涵蓋建單、上傳憑證、建教材、評價 —— 全部已在閘門之後，
> 因此它同時證明 **active 使用者行為完全未變**）。
>
> **解凍保留稽核軌跡** —— `frozen_at`／`frozen_by`／`freeze_reason` 於解凍後**不清空**。
> **與 `orders.status` 正交** —— 未動任何訂單狀態（測試明確驗證）。
>
> **Gate 狀態變更：Gate 1 `NOT IMPLEMENTED` → `PARTIAL`。**
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> **刻意未做：** Admin Users 管理 UI、使用者端凍結狀態顯示、解凍申請／客服入口、
> 重新驗證流程、payout 暫停（payout 能力本身尚不存在）。
>
> ### ✅ **Wave 1 #5 完成（2026-08-26）：`MATERIAL RIGHTS REVIEW FOUNDATION`**
>
> **Inventory：** `materials` **已有** `reviewed_by`／`reviewed_at`／`review_reason_code`／`review_note`
> （含 `ip_concern` 原因碼），但 schema 註解明寫這是
> **「Latest review decision snapshot（不是 review history）」**，服務的是上架狀態機；
> `ip_declaration_accepted` 在建立教材時**寫死 `true, NOW()`**；
> `report_cases`／`report_events` 是**上架後**的買家檢舉。
> **既有結構沒有一個是「平台的權利審查」。**
>
> **架構決定：獨立的 append-only `material_rights_reviews` 表。** 三個理由：
> 既有 `reviewed_*` 明文「不是 history」且會被覆寫；
> 合併會讓「核准上架」等同「權利審查通過」——
> **Platform-as-Seller 下平台自身的交付行為不受 ISP 免責事由保護，
> 權利審查是平台自己的防線，不能是狀態機的副作用**；
> resubmit／補件／換檔重審需要累積歷程。
>
> **刻意不掛在 `POST /admin/materials/:id/approve` 上** —— 除語意混淆外，
> 目前沒有輸入 risk flags 與證據的介面，自動寫入只會產生**空 flags、無證據的空殼記錄**，
> **看起來像盡職紀錄、實際什麼都沒審**，比沒有記錄更糟。
> 改為明示端點 `POST /admin/materials/:id/rights-review`。
>
> **改動：** `migrations/20260826_material_rights_review_foundation.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`services/materialRightsReview.service.js`（新）／
> `routes/admin.js`（兩個端點 ＋ activity log）／
> `tests/materialRightsReview.db.test.js`（新，8 case）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.1a**（含四個結構的區分表）。
>
> **非回歸與實地證據：** migration 前後 materials **355 → 355**、
> `ip_declaration=true` **349 → 349**、一般審核 `reviewed_by` **173 → 173**（`materials` 完全未動）；
> `material_rights_reviews` **0 列**（未 backfill）。
> **真實資料本身就佐證了分離**：349 份有 Creator 聲明、173 份有一般審核，而權利審查記錄為 **0**。
> HTTP 實測：對一份**已核准上架**的教材查權利審查 → `latest = null`（**已上架 ≠ 已權利審查**）；
> `needs_evidence` 未附 notes → `notes_required`；非法 flag → `invalid_risk_flags`；
> 兩次審查後歷程 **2 筆、舊結論保留**；activity log 兩筆含 result 與 riskFlags。
>
> **驗收：** DB **246 / 246**、unit **164 / 164**、smoke **exit 0**。
>
> **Gate 2 維持 `PARTIAL`（evidence 大幅擴充，非升級為 IMPLEMENTED）** ——
> 尚缺 Admin 審查 UI、證據檔案儲存流程、Creator 聲明版本化接線、與上架流程的關聯規則。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> ### ✅ **Wave 2 #1 完成（2026-08-26）：`GATE 7 — FULFILLMENT SNAPSHOT WRITE PATH`**
>
> **Inventory：** 買家下載授權在**憑證核准**時成立（`routes/admin.js` 的 **inline transaction**，
> 非 service）；`order_items` 結帳時已存在；下載路徑**動態解析** `materials.approved_file_id`
> （`resolveEntitledFile` 直接 JOIN）；**`first_downloaded_at` 完全不存在**（schema 與 code 皆 0 命中）。
>
> **寫入時點：付款核准的同一個 transaction 內**
> （`orderService.recordFulfillmentSnapshot`）—— 授權成立與履約版本記錄必須原子完成，
> 分開寫會出現「有授權但不知道交付了什麼」的中間狀態。
>
> **三個守衛：** 無 `approved_file_id` **不寫入**（legacy `published` 但無檔的教材確實存在，
> 猜一個版本等於製造假履約證據）／已有快照**不覆寫**（Creator 換版不改動歷史事實）／
> **逐品項各自解析**（多品項訂單各對應各自教材的版本）。
>
> **兩個刻意不做：**
> (1) **下載切換不做。**「Buyer 是否有權取得履約當時版本／平台可否只提供最新版」屬
> `PRE-04.7` 與 **`L-10`（律師 PENDING）** —— 那是政策決定，不由工程自行選擇。
> 但「當初交付了什麼」必須先記下來，否則日後無論政策怎麼定都無從還原。
> (2) **`first_downloaded_at` 不加** —— 不在 Gate 7 acceptance criteria 內，
> 且與履約版本快照是不同關注點；不為湊進度強行納入。
>
> **改動：** `services/orderService.js`（新增 `recordFulfillmentSnapshot`）／
> `routes/admin.js`（核准交易內呼叫）／`tests/fulfillmentSnapshot.db.test.js`（新，7 case）／
> `run-db-tests.js`／`docs/material-file-storage-and-delivery.md` **新增 §7.1a**。
> **無 schema 變更**（Wave 1 #1 已建立欄位）。
>
> **證據：** DB **254 / 254**、unit **164 / 164**、smoke **exit 0**。
> smoke 走完**真實核准流程**後：寫入 1 筆且與 `material.approved_file_id` **一致**；
> 「未核准訂單卻有履約版本」**0 列**；「無 approved 檔卻有履約版本」**0 列**；
> 歷史品項仍有 **300 列為 NULL（未 backfill）**。
> 測試涵蓋：換版後舊快照不變、重複執行 `snapshotted = 0`、多品項各自正確、
> 無檔時保持 NULL 但訂單仍核准成功、rollback 後不留半完成狀態、`paid_at` 語意未變。
>
> **執行中的發現：** schema 有 `uq_material_files_one_approved`（一份教材同時只能有一個
> `approved` 檔），我的 fixture 順序寫反而觸發；已改為與正式 promotion 一致的順序
> （先降級舊版再插入新版）。**production 程式碼未因此改動。**
>
> **Gate 7 維持 `PARTIAL`（evidence 擴充，非升級）** —— 尚缺 `PRE-04.4` 通知欄位與更新分級、
> 下載版本解析（待 `L-10`）、`first_downloaded_at`。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> ### ✅ **Wave 2 #2 完成（2026-08-26）：`GATE 14 — ENTITLEMENT SUSPEND / RESTORE`**
>
> **Consumer 分類（全 repo 盤點）：**
> **A 類**（回答「現在是否有有效使用權」）= 下載授權（Wave 1 #1 已對齊）／
> `GET /me/materials`／評價資格 —— **本輪全數對齊**；
> **B 類**（營收／交易歷史）= `teacherSales`／`adminDashboard`／`adminTrends`／
> `adminOrders`／`buyerOrders` —— **刻意不加條件**；**C 類**（historical/audit）無關。
>
> **`GET /me/materials` 的語意決定：不過濾，改回傳 `entitlementActive` 旗標。**
> 授權暫停不代表購買事實消失；讓教材從列表無聲蒸發會讓買家失去「我買過這個」的可見性。
> 真正的門在下載授權，那裡已經擋住。UI 呈現方式屬後續 wave，後端先誠實提供狀態。
>
> **評價資格的語意決定：要求 `active`。** 發表評價是**產生對外公開且不可逆內容**的新寫入
> （與 Wave 1 #4 帳號凍結同一判準）；**只擋新評價，既有評價不受影響**。
>
> **改動：** `services/entitlement.service.js`（新）／`routes/admin.js`（兩個端點）／
> `routes/me.js`／`repositories/review.repository.js`／
> `tests/entitlementTransition.db.test.js`（新，8 case）／`run-db-tests.js`／
> `docs/material-file-storage-and-delivery.md` **新增 §7.1b**。
> **無 schema 變更**（Wave 1 #1 欄位已足夠；歷程用既有 `activity_logs`，**不另建 event table**）。
>
> **合法轉移：** `active ↔ suspended`、兩者 → `revoked_pending`、
> `revoked_pending → active | revoked_final`，**`revoked_final` 為終態**
> （那正是「final」的意思；若日後需恢復，那是新的產品／法律決定，不應由狀態機默默允許）。
> `reason` **必填**。恢復時保留 `access_suspended_*` 稽核軌跡。
> **只有管理能力，沒有法律判斷** —— 「什麼時候應該撤銷」屬 Gate 14 未完成部分與 External Legal Gate。
>
> **核心 invariant 已實測：** HTTP suspend 後 **訂單仍為 `approved`、`paid_at` 仍在、
> 履約快照仍在**；未附 reason → 400；`active → revoked_final` → **409 `invalid_transition`**
> 並回傳 `allowed`；無 token → 401；歷程 2 筆。
>
> **驗收：** DB **263 / 263**、unit **164 / 164**、smoke **exit 0**。
> 測試另證：營收與創作者成交在授權撤銷後**完全不變**；狀態變更**不刪除**履約快照與 `material_files`。
>
> **執行中的自我更正：** Wave 2 #1 的 `legacy` 測試斷言過寬 ——
> 它假設「全表除自身 fixture 外不得有任何履約快照」，但 smoke 與新測試會**合法地**寫入。
> 已改為三條永遠成立的不變條件（快照必成對／只出現在已核准訂單／必指向真實檔案），
> 任何 backfill 都會違反其中至少一條。**production 程式碼未因此改動。**
>
> **Gate 14 維持 `PARTIAL`（evidence 擴充，非升級）** —— 尚缺退款／補救 case 與 state machine、
> 人工銀行退款紀錄、tax reversal、`legal_hold`、cleanup fail-closed、`P10` ledger、
> 法定解除判斷、post-settlement Creator 處理。`mvp_rules.md` §18.9 仍為 `REQUIRED / NOT IMPLEMENTED`。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> **後續只允許三條軌道：** (1) Deployment Gate implementation；(2) Legal Validation；(3) Tax Validation。
> **不得因 Deployment 未完成而把文件階段重新標為未完成**，
> 也**不得因純理論、Future Phase 或 hypothetical feature 重新開啟 `P1-09` 的 scope discovery**
> —— 僅在 Scope Freeze A～E 五種情形之一成立時才可重開（見 baseline `§0.5`）。

> ### ✅ **Wave 2 #3 完成（2026-08-26）：`GATE 14 — REFUND / REMEDY CASE FOUNDATION`**
>
> **Inventory：** repo 對 `refund` / `reversal` / `adjustment` **零命中**；`orders` 只有
> `cancelled_at` 與 `cancelled` 狀態，**沒有任何記錄退款的能力**；
> `order.js:205` 的 `duplicate` 是**上傳冪等**，與重複付款無關。
>
> **`reports` 不可重用（五點不相容）：** `material_id NOT NULL`（重複付款不指向教材）／
> `UNIQUE (material_id, reporter_id)` 一人一材一次（同訂單需要多個案件）／owner 是檢舉人而非買家／
> resolution 全是 moderation 結果／無金額也無訂單關聯。
> → **獨立表 `refund_remedy_cases`**，兩套流程完全分離。
>
> **改動：** `migrations/20260826_refund_remedy_cases_foundation.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`services/refundRemedy.service.js`（新）／
> `routes/order.js`（買家端建立與查詢）／`routes/admin.js`（列表／詳情＋歷程／轉移）／
> `tests/refundRemedyCase.db.test.js`（新，8 case）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.8** ＋ §18.9 狀態說明改寫。
>
> **核心不變條件：`approved` ≠ 退款完成。**
> 狀態機 `requested → under_review → approved → remedy_pending → completed`
> **刻意不允許** `approved → completed` 直接跳轉，DB 另有
> `rrc_refund_paid_requires_completed` 擋住「未完成卻已有 `refund_paid_at`」。
> 「責任已核准」與「錢真的退了」用同一個狀態表示，帳務與客服會同時失準。
>
> **三個刻意的分離：**
> (1) **不改 `orders.status`／`paid_at`** —— 用 `cancelled` 表示退款會讓已收款訂單在營收報表中憑空消失；
> (2) **不自動執行 entitlement 轉移** —— `entitlement_action` 只記錄意圖，
> 實際轉移仍須經 `entitlement.service.js` 由人明示操作（法律結論未到位前不先做處分）；
> (3) **不含任何 tax 欄位** —— 憑證沖銷屬 `P14`，其決策樹待會計師確認，
> 為形狀未知的流程預留欄位只會猜錯。`related_creator_adjustment_id` 因 `P10` ledger 不存在而**無 FK**。
>
> **非回歸與實地證據：** migration 前後 **orders 302 / reports 198 完全不變**；
> `refund_remedy_cases` 為 **0 列（未 backfill）**。
> **HTTP 實測**：非訂單擁有者建立 → **403**；未附 `note` → **400 `note_required`**；
> `requested → approved` 跳關 → **409**（回傳 `allowed`）；
> **`approved → completed` → 409**；經 `remedy_pending` 後 `completed` → 200 且 `refund_paid_at` 寫入；
> 全程結束後 **訂單 `status` 仍 `approved`、`paid_at` 仍在、`entitlement_status` 仍 `active`**；
> 歷程 5 筆。
>
> **買家端刻意不套 `requireActiveAccount`** —— 提出救濟請求不產生金流、不取得授權、
> 不產生公開內容，且被凍結的帳號**恰恰可能正需要這條申訴管道**；控制點是 Admin 審核而非入口封鎖。
>
> **驗收：** DB **272 / 272**、unit **164 / 164**、smoke **exit 0**。
>
> **與 baseline 規格的命名落差（已知、刻意、已記入 Gate 14 evidence）：**
> `refund_pending / refunded / remedied` 實作為 `remedy_pending / completed`
> （退款與非金錢補救共用完成態，以 `case_type` ＋ `refund_method` 區辨）；
> `approved_at` / `rejected_at` 合併為 `decision_at`；
> `reason` 由 `case_type` ＋ `buyer_statement` 取代；`payment_method` 未複製（在 `orders.payment_mode`）。
>
> **Gate 14 維持 `PARTIAL`（evidence 擴充，非升級）** —— 尚缺 tax reversal 節點、`legal_hold` 欄位、
> cleanup fail-closed、`P10` ledger 與 Creator 報酬回沖、法定解除的實體判斷、
> 退款對 §18 營收／trend 的反映、買家可見的申訴 UI、post-settlement Creator 處理。
> `mvp_rules.md` §18.9 仍為 `REQUIRED / NOT IMPLEMENTED`。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`。

> ### ✅ **Wave 2 #4 完成（2026-08-26）：`LEGAL HOLD ＋ FAIL-CLOSED FILE CLEANUP`**
>
> **Inventory —— production 只有一條實體刪除路徑：** `materialFile.service.js` 的
> `cleanupOrphans()`（由維運 CLI `cleanup-material-files.js` 呼叫）。
> 其餘三處 `storage.delete()` 都是同一個請求內、剛建立的物件的 rollback（沒有第二個人知道那個 key）。
> **沒有** `DELETE /materials/:id` 或任何 admin 刪除端點。
>
> **找到兩個 fail-open（都不是假設，是現行程式碼）：**
> (1) **資格判斷完全不看依賴** —— 只問 `status = 'unattached' AND uploaded_at < NOW() - Nh`；
> `docs/material-file-storage-and-delivery.md` §8.5 白紙黑字的
> 「只要曾經有 approved 訂單含這份教材，永不實體刪除」**沒有任何程式碼在執行**。
> (2) **刪除順序讓 DB 防線失效** —— 舊版 `storage.delete()` 在
> `DELETE FROM material_files` **之前**，因此 Wave 2 #1 建立的
> `order_items.fulfilled_material_version_id ON DELETE RESTRICT`
> **只保護得了 DB 列**：列刪不掉時位元組已經沒了，而且救不回來。
> per-row `try/catch` 又把 DB 錯誤吞成「這筆失敗」而非「停下來」。
>
> **改動：** `migrations/20260826_material_file_legal_hold.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`services/materialFileRetention.service.js`（新）／
> `services/materialFile.service.js`（`cleanupOrphans` 重寫）／
> `scripts/cleanup-material-files.js`（dry-run 改走同一 predicate）／
> `routes/admin.js`（三個 Admin 端點）／`tests/materialFileRetention.db.test.js`（新，12 case）／
> `run-db-tests.js`／`docs/mvp_rules.md` **新增 §12.9**／
> `docs/material-file-storage-and-delivery.md` **新增 §8.6** ＋ §8.2 補註。
>
> **架構選擇：hold 掛在 `material_files`，不建獨立 hold 表。**
> repo 既有 pattern 就是「current snapshot 欄位 ＋ `activity_logs` 歷程」
> （`users.account_status`、`materials.review_*`）。hold 要回答的只有單一當前狀態
> 「這個檔案現在能不能刪」；獨立表要到「一個案件涵蓋多個標的」才划算 ——
> 那屬於被明確排除的完整法務系統。
>
> **單一 predicate `canPhysicallyDeleteMaterialFile()`**，八個阻擋理由：
> `file_not_found`／`dependency_lookup_failed`／`legal_hold`／`status_not_reclaimable`／
> `referenced_by_material_pointer`／`restorable_entitlement_dependency`／
> `fulfillment_snapshot_dependency`／`outstanding_download_token`。
> **fail-closed：unknown / error / 查詢失敗 → KEEP。**
> 所有 cleanup path（含 `--dry-run`）都必須走它，不得自行拼條件。
>
> **`revoked_final` 不等於可以刪。** 它**只移除**「可恢復的授權依賴」一個 blocker；
> 履約快照、legal hold、指標引用照舊。測試明確驗證：
> 品項走到 `revoked_final` 後 `restorableEntitlements = 0`，
> **但履約快照接手擋住**，`deletable` 仍為 `false`。
> 反向亦然 —— 檔案可回收不得推導出可刪授權歷史（兩個 lifecycle 分離）。
>
> **刪除順序改為 fail-closed**：`BEGIN → FOR UPDATE → 重跑 predicate →
> DELETE 列（FK RESTRICT 在位元組還完好時引爆）→ 刪實體 → COMMIT`，
> 任一步失敗即 `ROLLBACK`。最壞情況從「檔案永久消失」變成「檔案還在」。
>
> **刻意不加 `retention_until`。** 保存年限尚無 authoritative source
> （`RM-15`／`T-14`／`L-21` 皆 `PENDING`）。加了只有兩種下場：全部 NULL 而在 fail-closed 下
> 擋掉所有清理（連從未交付的孤兒都清不掉），或把 NULL 當成「無保存義務」——
> 兩者都是用預設值假裝知道答案。同理，`superseded` / `revoked` 的回收路徑**刻意未開放**。
>
> **只做 primitive，不做 orchestration** —— 不假設任何 `refund_remedy_cases` 或
> `report_cases` 一定要 hold，那是尚未做出的產品與法律判斷。
>
> **非回歸與實地證據：** migration 前後 **material_files 210 → 210，
> 各 status 分布完全不變（approved 167 / candidate 31 / unattached 12）**；
> `legal_hold = TRUE` 為 **0**、`hold_set_at` 非 NULL 為 **0**（未 backfill、未誤設）。
> 全套跑完後 **懸空履約快照 0、懸空 `approved_file_id` 指標 0**。
> **HTTP 實測**：buyer／teacher 設 hold **403**、無 token **401**、缺 reason **400**、
> set 200、`GET retention` 回完整 `reasons` 與 `checks`、release 200 且 `hold_reason` **保留**、
> 重複 release **409**、解除後 `deletable` 仍為 **false**（依賴仍在）、歷程 3 筆、不存在的檔案 **404**。
> CLI `--dry-run` 對 security DB 實跑：候選 0、什麼都沒刪。
>
> **驗收：** DB **284 / 284**、unit **164 / 164**、smoke **exit 0**。
>
> **執行中的一個修正：** bootstrap 鏡像最初用了 `pool.query`（該檔案用的是 `db.query`），
> 導致 server 啟動即 `ReferenceError`。**fail-closed 的啟動檢查如預期擋下**
> （`Exiting with code 1: fix DB/migrations first`），未讓錯誤狀態上線。已修正。
>
> **Gate 14 維持 `PARTIAL`（evidence 擴充，非升級）** —— 仍缺 tax reversal、
> `superseded`／`revoked` 回收路徑、任何實際保存年限、`RM-14` entitlement records 的 hold、
> hold 與 remedy／report case 的 orchestration、`P10` ledger 與 Creator 報酬回沖、
> 法定解除的實體判斷、退款對 §18 營收／trend 的反映、買家可見申訴 UI。
> `mvp_rules.md` §18.9 仍為 `REQUIRED / NOT IMPLEMENTED`。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`。

> ### ✅ **Wave 2 #5 完成（2026-08-26）：`GATE 14 — MANUAL BANK REFUND EXECUTION RECORD`**
>
> **Inventory：** repo **沒有任何** financial execution / payout / wallet / balance / clawback
> 結構可重用（全 repo 0 命中），也**沒有任何 tax 欄位**。
> `refund_remedy_cases` 已有 `refund_method` / `refund_reference` / `refund_paid_at` /
> `approved_amount` / `completed_by`，**缺的只有實際退款金額**。
>
> **找到的實際缺口（Wave 2 #3 留下的）：** `transition({ toStatus: 'completed' })`
> 可以在**完全沒有付款證據**的情況下把案件標成完成 —— `refund_reference` 是可選的，
> 而且沒有欄位記錄「實際退了多少」（`approved_amount` 是核准金額，不是執行金額）。
>
> **架構選擇：擴充案件表，不另建 execution table。**
> Phase 1 的人工銀行退款與案件是 **1:1** —— 沒有分期、沒有多筆沖銷、
> 沒有 payment provider 的重試與 webhook。另建表只會讓「這筆退款屬於哪個案件」多一層 join，
> 換不到任何表達力。等真的出現「一個案件多筆退款」或接了金流服務再拆，
> 那時才知道形狀。**執行者沿用既有 `completed_by`，不另造 `executed_by`。**
>
> **改動：** `migrations/20260826_manual_refund_execution.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`services/refundRemedy.service.js`（新增 `executeRefund()`，
> 並收緊 `transition()`）／`routes/admin.js`（`POST /admin/remedy-cases/:id/execute-refund`）／
> `tests/manualRefundExecution.db.test.js`（新，9 case）／
> `tests/refundRemedyCase.db.test.js`（對齊新完成路徑）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.8.6** ＋ §18.9 狀態說明改寫。
>
> **三個事件在 DB 層釘死為不同事件：**
> `CASE APPROVED`（`decision_at`）≠ `REFUND EXECUTED`（`refund_paid_at`）≠
> `TAX DOCUMENT REVERSED`（`P14`，**schema 刻意無 tax 欄位**）。
> **`refund_paid_at` 已填不得被解讀為憑證已沖銷。**
>
> **五條 DB CHECK：** `rrc_refund_amount_positive`／`rrc_refund_within_approved`
> （實退 ≤ 核准；`approved_amount IS NULL` ＝非金錢補救，不得有退款金額）／
> `rrc_refund_method_check`（Phase 1 只有 `manual_bank_transfer`）／
> **`rrc_refund_execution_atomic`（金額／方式／參考／時間四欄全有或全無，且須 completed）**／
> **`rrc_cash_completion_requires_evidence`（已核准金錢退款者不得在無付款證據時 completed）**。
>
> **`executeRefund()` 是金錢退款完成的唯一入口** —— 狀態與五項證據同一個 `UPDATE`
> 原子寫入，失敗即 `ROLLBACK` 且案件保持 `remedy_pending`。
> `transition()` 不再接受任何 refund 欄位，對已核准金錢退款的案件回 `use_execute_refund`。
> **`approved` 也不能直接執行退款** —— 必須先進入 `remedy_pending`。
>
> **執行後仍不變的四件事**（測試與 HTTP 皆驗證）：`orders.status` / `paid_at` /
> `payment_received_at`；`entitlement_status`（`entitlementAction` 只透過
> `pendingEntitlementAction` **回報意圖**，不自動執行）；Creator 營收與成交數
> （無 clawback、無 negative balance）；稅務憑證。
>
> **買家退款收款帳戶：本輪刻意不蒐集。** repo 目前完全沒有這類資料；
> `manual_payment_proofs.reported_*` 是買家申報的**付款來源**且只存末四碼，不得挪用為退款目的地。
> 為退款而蒐集完整銀行帳號會直接擴大個資範圍並產生新的保存義務，而年限未定
> （`RM-03`／`L-21` 皆 `PENDING`）。Phase 1 由 Admin 行外完成，系統只存足以稽核的五項。
> **若確認 Phase 1 必須由系統保存退款帳戶，須先提出最小欄位需求與保存期限再實作。**
>
> **非回歸與實地證據：** migration 前後 **orders 308 / `paid_at` 非 NULL 135 / reports 202
> 完全不變**；`refund_amount` 與 `refund_paid_at` 非 NULL 皆為 **0**（未 backfill）。
> **HTTP 實測**：`approved` 直接執行 **409 `invalid_state`**；buyer **403**、無 token **401**；
> 缺 `paymentReference` **400**；超額 **400**（回傳 `approvedAmount`）；金額 0 **400**；
> 有效執行 **200**（`completed` / `refund_amount=100` / `manual_bank_transfer`），
> 且**訂單仍 `approved`、`paid_at` 與 `payment_received_at` 皆不變、`entitlement_status` 仍 `active`**；
> 重複執行 **409**；`refund.executed` meta 十項齊全。
>
> **驗收：** DB **293 / 293**、unit **164 / 164**、smoke **exit 0**。
>
> **兩個測試期待的修正（production 程式碼未變）：** (1) 二次執行實際回 `invalid_state`
> 而非 `already_executed` —— 狀態檢查先擋，且在現行 CHECK 之下
> 「`remedy_pending` 卻已有 `refund_paid_at`」不可能成立；`already_executed` 保留為第二層防線。
> (2) 單獨寫 `refund_amount` 會先違反更嚴的 `rrc_refund_execution_atomic`，
> 因此測 `rrc_refund_within_approved` 需四欄齊全只讓金額超額。
>
> **Gate 14 維持 `PARTIAL`（evidence 擴充，非升級）** —— 仍缺 tax reversal（`P14`）、
> 退款金額對 §18 營收／trend 的反映（`refund_amount` 目前**完全不進入任何營收查詢**，刻意）、
> 法定解除的實體判斷、`P10` Creator adjustment、買家可見的申訴 UI、
> 買家退款收款帳戶、保存年限與 hold orchestration。
> `mvp_rules.md` §18.9 仍為 `REQUIRED / NOT IMPLEMENTED`。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #6 完成（2026-08-26）：`GATE 3 — CONSUMER COMPLAINT INTAKE FOUNDATION`**
>
> **Inventory：** repo **完全沒有**客服／申訴／爭議案件表（`complaint` / `dispute` /
> `support_ticket` 全 repo 0 命中，命中的都只是註解裡的散文），也沒有任何 contact form。
> `reports` 確認**仍只代表內容檢舉**；`refund_remedy_cases` 是平台建立的**處理案件**，
> 不是買家的 intake。既有 `privateFileStorage` 可安全重用為附件儲存。
>
> **架構：Complaint = 上游 intake，Remedy = 下游處理。**
> 三表 `consumer_complaints` / `consumer_complaint_events` / `consumer_complaint_evidence`。
> **不自動建立 remedy case** —— 是否應退款是個案判斷；自動建立等於替尚未做出的決定先行處分。
> `related_remedy_case_id` 由 `POST /admin/complaints/:id/link-remedy-case` 在人判斷後才寫入，
> 且兩者都綁訂單時必須同一張。**`resolved` ≠ 已退款。**
>
> **改動：** `migrations/20260826_consumer_complaints.sql`（新）／`bootstrapModel.js`／
> `db/db_schema.sql`／`utils/complaintSla.js`（新）／`services/consumerComplaint.service.js`（新）／
> `routes/complaints.js`（新，掛在 `/me/complaints`）／`index.js`／`routes/admin.js`／
> `storage/privateFileStorage.js`（新 namespace `complaint-evidence`）／
> `tests/complaintSla.test.js`（新，4 case）＋ `tests/consumerComplaint.db.test.js`（新，11 case）／
> `package.json`（`test:unit`）／`run-db-tests.js`／`docs/mvp_rules.md` **新增 §12.10**。
>
> **掛在 `/me/complaints` 是刻意的** —— `me` 已在前端 proxy 的 `ALLOW_ROOT` 內，
> 因此**不需要動 `ALLOW_ROOT`**（CLAUDE.md §5：漏加會讓前端拿到 proxy 自產的 403 而 Backend 完全沒被呼叫）。
>
> **十五日 SLA 收斂成單一 policy（`utils/complaintSla.js`）：**
> `statutory_due_at` 建立時寫入後不再改；逾期偵測用 **DB 條件 ＋ partial index**（不是全表過濾）；
> **已結案不再計為逾期**（逾期是待辦告警，不是歷史稽核）。
> **刻意不造第二、第三個 SLA 欄位** —— baseline `N2` 只鎖定一個數字。
>
> ⚠️ **本輪的日期計算有誤（`+16` 天），已於同日的 `WAVE 2 #6 CORRECTION` 修正 —— 見下一節。**
>
> **買家外部證據（`N3`）：** 檔案（新 namespace `complaint-evidence`，
> **沿用** `utils/paymentProofPolicy.js` 的三層驗證含 magic bytes，不另寫 allowlist）
> 或純文字 `externalReference`。`storage_key` / `checksum_sha256` **不外流**。
> **刻意不重用 `manual_payment_proofs`** —— 那張表審核通過會讓訂單核准，
> 把爭議截圖塞進去會讓它進入付款核准佇列。PDF 刻意未開放（與付款憑證一致）。
>
> **凍結帳號仍可申訴** —— 買家端**刻意不套 `requireActiveAccount`**。
> 被凍結的帳號恰恰可能正是帳號遭冒用的當事人；若同一個機制也擋住申訴管道，
> 被害人就失去唯一求助入口。因此申訴可不綁訂單（`account_security`）。
>
> **非回歸與實地證據：** migration 前後 **orders 311 / reports 204 / remedy cases 0 完全不變**；
> 三張新表皆 **0 列（未 backfill）**。
> **HTTP 實測**：他人訂單 **403 `order_not_owned`**、未登入 **401**、
> 夾帶他人 `buyerId` 無效（實際仍是本人）、
> **凍結後 `POST /orders` → 403 `account_frozen` 而 `POST /me/complaints` → 201**（同一帳號、同一時間）、
> buyer 讀 admin 清單 **403**、缺 `message` **400**、`submitted → resolved` 跳關 **409**（回 `allowed`）、
> 缺 `resolutionSummary` **400**、resolved 200；
> 買家看到歷程 **2 筆** vs Admin **3 筆**（內部註記不外流）；
> 結案後訂單仍 `approved`、`paid_at` 仍在、**自動建立的 remedy case = 0**。
>
> **驗收：** DB **304 / 304**、unit **168 / 168**、smoke **exit 0**。
>
> **Gate 狀態變更：Gate 3 `NOT IMPLEMENTED` → `PARTIAL`。**
> Deployment Readiness 變為 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
> **不得標 IMPLEMENTED** —— 仍缺 `N4` 外部管道揭露文案（屬 `L-17`）、Buyer 與 Admin 完整 UI、
> 逾期**告警**的實際送達管道（目前只有可查詢的偵測能力）、PDF 證據型別、`assigned_to` 指派流程。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #6 CORRECTION 完成（2026-08-26）：`COMPLAINT SLA DATE CALCULATION`**
>
> **Scope Freeze E（現行法源與實作存在直接計算錯誤）。不是重開 scope，不改 complaint architecture。**
>
> **Root cause —— 兩個獨立缺陷 ＋ 一個潛在風險：**
>
> 1. **多算一天。** 初版 `submittedAt + 16 × 24h` 把民法 §120 II「始日不算入」
>    誤解成「往後推一天再數 15 天」。正確是**申訴之日曆日 + 15 天**：
>    8/26 提出 → 8/27 是 Day 1 → **9/10** 是 Day 15，不是 9/11。
> 2. **沒有處理民法 §121 I「以期間末日之終止為期間終止」。**
>    直接加毫秒會讓 10:37 提出的申訴在末日 10:37 就到期；正確是**末日終了**
>    （台北 23:59:59.999 ＝ 該日 `15:59:59.999Z`）。
> 3. **時區風險（本輪一併關閉）。** 初版純毫秒運算，隱含「以主機時區判斷日期」。
>    台北 `2026-08-27 00:30` 的 UTC 日是 `08-26` —— 用 UTC 日會少算一天。
>    現在日曆日一律用 `Intl.DateTimeFormat` 取 `Asia/Taipei` 分量
>    （與 `utils/reportingRange.js` 的既有慣例一致），**不用** `toISOString().slice(0,10)`
>    或 `getDate()`。
>
> **Timestamp 語意盤點：** `consumer_complaints.submitted_at` 為 `TIMESTAMP without time zone`；
> node-pg 以**行程本地牆上時間**序列化與解析（本機 DB session TZ 與 Node 皆為 `Asia/Taipei`，
> 實測往返 lossless）。因此**「這件申訴屬於哪個台灣日曆日」必須顯式轉 `Asia/Taipei`**，
> 不得依賴主機本地日或 UTC 日 —— 這正是修正後的作法。
>
> **改動：** `utils/complaintSla.js`（重寫計算，新增
> `taiwanCalendarDate` / `addCalendarDays` / `endOfTaiwanDay` / `statutoryDueDate`）／
> `tests/complaintSla.test.js`（4 → **11 case**）／`tests/consumerComplaint.db.test.js`
> （加上「末日 ＝ 申訴日 + 15 天」與「終止於 `15:59:59.999Z`」兩條斷言）／
> `docs/mvp_rules.md` §12.10.4 改寫（四條法源表 ＋ 逐日展開 ＋ §122 狀態）／
> baseline Gate 3 evidence。**complaint architecture、schema、端點、狀態機皆未改動。**
>
> **民法 §122 末日展延：`REQUIRED / NOT IMPLEMENTED`（誠實標示，不假裝解決）。**
> 盤點確認 repo **沒有任何** holiday / calendar primitive
> （`holiday` / 國定假日 / 行事曆 全 repo 0 命中），本輪**不建立**假日系統。
> `SLA_POLICY.restDayExtension = "NOT_IMPLEMENTED"`，且模組明文說明回傳值是
> **最早可能**的法定末日 —— §122 只會把末日往後推，因此逾期偵測**偏保守**
> （可能早於真正的法定逾期），營運上安全但**不得**當成法律上已逾期的認定。
> 測試以「2026-09-05 提出 → 末日 2026-09-20（星期日）目前不展延」把該行為釘住，
> 日後實作 §122 時該測試會失敗並強迫同步更新狀態常數。
> **未自行加半套 Sunday-only 邏輯** —— 那只涵蓋三類休息日之一，會讓系統宣稱已處理 §122。
>
> **`LEGAL-01` 已精準化**（見 §1.4）：§43 II／§120 II／§121 I 三項**已可由法條直接確認且已實作**，
> 不再籠統標為「未知」；未決的是 §122 展延的實作與這組期間規則對本平台 SLA 的最終適用與對外文案。
>
> **測試涵蓋：** `+16` 誤算的回歸案例（8/26 → 9/10 且明確 `notEqual` 9/11）／
> §121 I 末日終了（末日 23:59:59 未逾期、次日 00:00 逾期）／跨月／跨年／閏年（2028-02-20 → 03-06）／
> **時區邊界**（台北 00:30 與 23:30 只差一小時卻落在不同末日；跨年 UTC 邊界）／
> 台灣無日光節約時間的固定 +8 假設（一月與七月皆驗證）／§122 未實作的釘樁／
> `daysUntilDue` 以台灣日曆日相減（末日當天為 0）。
>
> **`SCHEMA-01` 本輪未動** —— 它是獨立的 schema drift，未阻礙本次修正，維持 `OPEN`。
>
> **驗收：** DB **304 / 304**、unit **175 / 175**、smoke **exit 0**。
>
> **Gate 3 維持 `PARTIAL`（修正計算，非升級）** —— 仍缺 `N4` 外部管道揭露文案（`L-17`）、
> Buyer 與 Admin 完整 UI、逾期告警送達管道、PDF 證據型別、`assigned_to` 指派流程、
> **民法 §122 末日展延**。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #7 完成（2026-08-26）：`SCHEMA-01 — activity_logs schema drift`**
>
> **Drift 比 tracker 原本記錄的更廣 —— 是四處，不是一處：**
>
> | 欄位／物件 | canonical（舊） | 兩個實際資料庫 |
> | --- | --- | --- |
> | `id` | `BIGSERIAL PRIMARY KEY` | `TEXT DEFAULT (gen_random_uuid())::text` |
> | `target_id` | nullable | **NOT NULL** |
> | `created_at` | nullable | **NOT NULL** |
> | `actor_id` FK | 未記載 | `REFERENCES users(id) ON DELETE SET NULL` |
>
> `teaching_platform`（944 列）與 `teaching_platform_security_test`（4655 列）**兩邊完全一致** ——
> 不一致的是文件，不是資料。
>
> **`id` 用法分類（inventory 結果）：**
> **A（opaque identity，無需改）**：`getLogById` 用 `WHERE l.id::text = $1`、前端 React key 與 URL segment、
> Postman `activityLogId` 變數 —— 全部型別無關。
> **B（誤當時序）**：**只有一處** —— `tests/reportCases.db.test.js` 的裸 `ORDER BY id ASC`。
> service 層四處（`adminActivityLogs`／`entitlement`／`materialFileRetention`／`refundRemedy`）
> 皆已是 `ORDER BY created_at …, id …`，`id` 只作 tie-breaker，語意正確。
> **C（pagination cursor）**：**零** —— `listLogs` 是 `LIMIT/OFFSET`，沒有 id cursor。
> **D（API/test 假設型別）**：**零** —— `id::text` 早已把契約字串化。
>
> **Canonical 決定：以既有實況為準（TEXT UUID）。** 七項依據：
> (1) 兩個實際 DB 一致，錯的是文件；
> (2) **轉 BIGSERIAL 會改寫 5599 列稽核事件的 identity** —— 既有 UUID 無自然序可對應，
> 重新編號等於偽造一段從未存在的時序，違反 `CLAUDE.md` §4.4；
> (3) UUID 是本 repo 的 PK 慣例（`reports`／`report_events`／`material_files`／
> `refund_remedy_cases`／`consumer_complaints` 皆是），BIGSERIAL 是唯一例外；
> (4) API 契約早就是字串形狀；
> (5) 無任何 FK 參照 `activity_logs`（低連鎖風險，但這不是「應該轉」的理由）；
> (6) 跨環境可攜性 —— UUID 備援／合併不撞號，sequence 會；
> (7) migration 風險 —— 對齊文件 vs 全表重寫 ＋ identity 變更。
>
> **改動：** `migrations/20260826_activity_logs_schema_reconciliation.sql`（新）／
> `bootstrapModel.js`（canonical 形狀 ＋ **新增 `verifyCriticalSchema()` fail-closed drift 檢查**）／
> `db/db_schema.sql`／`utils/activityLog.js`（`targetId` 改必填 ＋ 排序語意說明）／
> `tests/reportCases.db.test.js`（唯一的 B 類誤用）／`tests/activityLogSchema.db.test.js`（新，8 case）／
> `run-db-tests.js`／`CLAUDE.md` §4.4／`docs/mvp_rules.md` §22／
> `docs/teaching-platform-mvp-spec-v1.4.md`（兩處）／`routes/adminActivityLogs.js`、
> `services/adminActivityLogs.service.js`、兩個測試檔的 stale 註解。
>
> **bootstrap 的責任本輪明訂：** bootstrap **只建立新環境**，schema evolution 一律走
> `Backend/migrations/`；bootstrap 另外負責**發現 drift 就不讓服務起來**
> （偵測到不一致時**不自動修**既存表 —— 自動改正是 drift 難追的成因 —— 而是 fail-closed
> 並指名該跑哪一支 migration）。刻意只驗會造成語意錯誤的欄位，不做全表 schema diff。
>
> **Migration safety evidence（兩個資料庫皆實測）：**
>
> | | `teaching_platform_security_test` | `teaching_platform` |
> | --- | --- | --- |
> | 列數 before → after | 4655 → 4655 | 944 → 944 |
> | PK 唯一 | 4655 distinct | 944 distinct |
> | `created_at` 分佈 | `2026-04-17T09:51:41.151Z` → `2026-08-26T14:41:55.757Z`（不變） | 起點同左 → `2026-08-25T15:47:08.959Z`（不變） |
> | **內容指紋**（action＋target＋actor＋role＋meta＋created_at 全欄 MD5） | `9b8b1eb8…` → `9b8b1eb8…` **逐位元相同** | `d0460665…` → `d0460665…` **逐位元相同** |
> | orphan `actor_id` | 0 → 0 | 0 → 0 |
> | 索引 | 5 個，未減少 | 5 個，未減少 |
>
> **migration 對兩個實際資料庫是 no-op**（它們早已是目標形狀）；它真正處理的是
> **2026-08-26 之前由新版 bootstrap 建立的 BIGSERIAL 環境**。
> 該升級路徑由測試涵蓋：`BIGINT → TEXT` 用 `id::text`，**無損且 identity 不變**
> （`1` → `"1"` 仍指同一列），全欄逐列 `deepEqual` 驗證未改動任何值。
> **沒有 DELETE、沒有 UPDATE、沒有重新產生 `created_at`、沒有重排事件。**
>
> **順帶修正的實際缺陷：** `writeActivityLog` 原有 `targetId ? String(targetId) : null` 一條路徑，
> 在真實資料庫（`target_id NOT NULL`）會直接違反約束 —— 只是從來沒有呼叫端走到。
> 現在明確拒絕並給出可讀錯誤，而不是拋 PG 約束違反。
>
> **驗收：** DB **312 / 312**、unit **175 / 175**、smoke **exit 0**。
> HTTP 實測 `/admin/activity-logs`：id 全為 UUID、`createdAt` 遞減、
> `/:id` 取回同一筆、`page=2` 與 `page=1` 無重疊（確認是 LIMIT/OFFSET 而非 id cursor）。
>
> **本輪新發現（已記錄、刻意未修）：** `SCHEMA-02` —— `actor_id ON DELETE SET NULL`
> 會在刪除使用者時抹掉歷史稽核的 actor，與 §4.4 有張力；目前 repo 無 production 刪除路徑，
> 且那是刪除政策決定而非 schema drift，不在本輪 scope（見 §1.4）。
>
> **`LEGAL-01` 本輪未動**，維持 `OPEN`；§122 維持 `REQUIRED / NOT IMPLEMENTED`。
> **Gate 狀態全部不變** —— 本輪不碰任何 Gate scope。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #8 完成（2026-08-26）：`GATE 6 — MANUAL PAYMENT INFORMATION WIRING`**
>
> **Inventory 的六個答案：**
> (1) `manual_payment_proofs.reported_*` 四欄**完全未接線** —— 實測 **0/338 列**有值，
> 全 repo 只在 schema／bootstrap／測試出現；
> (2) 買家**只能**上傳圖片（`multer.array('proofs')`，handler 不讀 body）；
> (3) Admin **完全看不到** `reported_*`（`PROOF_SELECT` 與 `serializeProof` 都沒有）；
> (4) `payment_received_at` **後端已有** optional write path（Wave 1 #2 留下的），
> 但實測 **0/320 訂單**有值 —— 因為沒有任何 UI 送得出它；
> (5) Admin UI **沒有**入帳時間輸入位置；
> (6) 需同步：`paymentProof.service`（INSERT ＋ publicProofShape ＋ listByOrder SELECT）、
> `routes/order.js`、`adminPaymentProofs.service`（SELECT ＋ serialize）、
> `lib/api-types.ts`、兩個前端頁面。
>
> **改動：** `utils/reportedPayment.js`（新，canonical validator）／
> `services/paymentProof.service.js`／`routes/order.js`／
> `services/adminPaymentProofs.service.js`／`frontend/lib/api-types.ts`／
> `frontend/app/orders/[orderId]/payment-proof/page.tsx`／
> `frontend/app/admin/payment-proofs/page.tsx`／
> `tests/reportedPayment.test.js`（新，9 case）＋ `tests/paymentInfoWiring.db.test.js`（新，8 case）／
> `package.json`／`run-db-tests.js`／`docs/mvp_rules.md` §12.3 改寫 ＋ 新增 §12.3.1、§12.3a.1。
> **schema 零變更** —— 欄位 Wave 1 #2 已備妥，本輪只接線。
>
> **驗證是「只驗格式，不驗真偽」：**
> **不比對申報金額與訂單金額** —— 金額不符是**爭議事實**，不是輸入錯誤；
> 擋掉它等於讓買家無法申報「我少匯了」或「我多匯了」
> （HTTP 實測：訂單 480、申報 400 必須能送出，且確實送得出）。
> 無銀行代碼表、無帳戶所有權驗證、無 KYC。**只收末四碼**，不收完整帳號。
>
> **兩個事實來源並存，永不互相覆寫：**
>
> ```text
> 買家申報（reported_*）          平台查證（payment_received_at）
> 「我 8/26 14:00 匯了 480」      「銀行顯示 8/26 14:03 入帳」
> ```
>
> HTTP 實測同一筆訂單的**四個時間各自不同**：
> 申報匯款 `06:00:00` ／ 平台查證入帳 `06:03:00` ／ 平台收到付款通知 `15:13:17.031` ／
> Admin 核准 `15:13:17.039`。
>
> **重新提交不覆寫舊申報** —— 退件後重傳建立**新列**，舊列的申報內容原地保留
> （實測申報歷程兩筆並存）；`payment_info_submitted_at` 每次提交都更新
> （審核時鐘從新的提交起算，平台不該為買家的延遲被記逾時 —— 這是 Wave 1 #2 已鎖定的語意，
> 本輪只是確認並加測試，**未自行改動**）。
>
> **`payment_received_at` 的三不：** 不預設 `NOW()`、不抄 `reported_transfer_at`、不抄 `paid_at`。
> HTTP 實測：Admin 核准但不填入帳時間 → 訂單 `approved`、`paid_at` 已寫、
> **`payment_received_at` 仍為 `null`**。未來時間 400。
>
> **UI 用語是規則的一部分：** Admin 端每個買家申報欄位都標示為「購買者填寫的…」，
> 區塊標題「購買者申報的匯款資訊」並附「尚未經平台查證」；
> 入帳時間輸入標示「**不確定請留空，不要猜**」。
> Buyer 端明示「平台會再與銀行實際入帳紀錄核對」與「請勿填寫完整帳號」。
>
> **本輪刻意未做的產品決策：**
> `payment_due_at` 與 `review_due_at` 的**數值仍未拍板**，兩欄維持 NULL
> （`VALUE PENDING PRODUCT DECISION`）；
> 「核准前必須有 `payment_received_at`」**未加成硬性要求** ——
> baseline 與現行 workflow 都沒鎖定，且牽涉會計認列時點（External Tax Gate `PENDING`）。
> 後端已能保存它；是否成為核准前提屬產品／會計決策。
>
> **非回歸：** `paid_at` 語意、寫入點、營收查詢**完全未動**；
> 測試明確驗證全表無 `paid_at = payment_received_at` 的列、
> 新欄位不改變任何營收聚合結果、`orders` 表無 `reported_*` 欄位（那是憑證列的事實）。
> 買家沒有任何路徑可寫平台查證欄位（實測夾帶 `paymentReceivedAt`／`paid_at` → 201 但兩欄仍 NULL）；
> 非 Admin 核准 **403**、無 token **401**。
>
> **驗收：** DB **320 / 320**、unit **184 / 184**、smoke **exit 0**、
> `npm run verify:web` **全部通過**。
>
> **一處測試期待的修正（production 程式碼未變）：** 原斷言要求拒絕 `"1e3"`，
> 但驗的是**值**是不是正整數而非字面形式 —— `"1e3"` 正規化後就是 1000，
> 存進 DB 仍是整數，沒有歧義殘留，因此改為斷言它被正規化為 1000。
>
> **Gate 6 維持 `PARTIAL`（evidence 擴充，非升級）** —— 仍缺 SLA／付款期限數值、
> `review_due_at` 計算與逾時偵測、逾時告警送達管道、
> 「核准前須有入帳時間」是否為硬性要求。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> `LEGAL-01` `OPEN`／`SCHEMA-02` `OPEN` `P3`／Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Gate 6 PRODUCT DECISION ROUND 完成（2026-08-26）**
>
> 分析輪，**未修改任何 executable code**。兩個發現改變了決策框架：
>
> 1. **`PAYMENT_DUE_DAYS = 3` 只是 UI 推算** —— 只有 Admin 看得到、不落地、無 enforcement、
>    無自動過期，而且那個 3 從未被拍板。買家**完全看不到**任何付款期限。
> 2. **⚠️ 買家 UI 已在四處承諾小時級審核時間** —— 從未被拍板、沒有任何 backend 追蹤、
>    比任何候選 SLA 都更緊，且事實上已經佔位了 §18 I(2) 的「交付期日」揭露。
>
> **不對稱總結：付款期限 Admin 看得到買家看不到；核帳 SLA 買家看得到 Admin 沒有目標。兩個方向都反了。**
>
> 另一個關鍵耦合：選「工作日」＝ 立刻需要 `LEGAL-01` / 民法 §122 刻意延後的國定假日行事曆。
>
> **產品拍板：Decision A = 7 個日曆日（起算 `orders.created_at`）／
> Decision B = 3 個日曆日（起算 `orders.payment_info_submitted_at`）。**
> 買家文案：「通常 1 個工作日內完成，最遲 3 個日曆日內完成」——
> **前半句只是 expected service level，後半句才是可稽核的 backend deadline。**
>
> ### ✅ **Wave 2 #9 完成（2026-08-26）：`GATE 6 — PAYMENT DEADLINE + REVIEW SLA IMPLEMENTATION`**
>
> **改動：** `utils/taiwanCalendar.js`（新，抽出台灣日曆日算術原語）／
> `utils/paymentTimingPolicy.js`（新，canonical 7 日 ＋ 3 日）／
> `utils/complaintSla.js`（改用共用原語，**15 日常數與法源完全未動**）／
> `services/orderService.js`（建單寫入 `payment_due_at`）／
> `services/paymentProof.service.js`（提交寫入 `review_due_at`）／
> `services/adminPaymentProofs.service.js`（**移除 `PAYMENT_DUE_DAYS`**，改讀實體欄位，
> 新增 `order_review_due_at` 與 `review_overdue`）／`services/buyerOrders.service.js`（回傳三個時間）／
> `frontend/lib/payment-timing.ts`（新，前端文案單一來源）／`frontend/lib/api-types.ts`／
> `frontend/app/orders/[orderId]/payment-proof/page.tsx`／`frontend/app/me/orders/[orderId]/page.tsx`／
> `frontend/app/admin/payment-proofs/page.tsx`／`frontend/app/admin/settings/page.tsx`／
> `tests/paymentTimingPolicy.test.js`（新，11 case）＋ `tests/paymentDeadlines.db.test.js`（新，9 case）／
> `tests/adminPaymentProofs.db.test.js`（對齊實體欄位 ＋ 新增 legacy 斷言）／
> `package.json`／`run-db-tests.js`／`docs/mvp_rules.md` §12.3a.2 新增 ＋ §22 更新。
> **schema 零變更** —— 四個欄位 Wave 1 #2 已備妥。
>
> **期限模型 = 末日終了**（台北 23:59:59.999），不是 `+N×24h`。三個理由：與買家看到的
> 「請於 YYYY/MM/DD 前」一致（一個**日期**）；符合 §18 I(2) 的「付款期日」；
> 永遠不會比 `+N×24h` 更短。附帶結果是它與民法 §120 II ＋ §121 I 算出來完全相同。
>
> **皆為日曆日，不是工作日** —— 因此**不引入國定假日行事曆依賴**，`LEGAL-01` 未被牽動。
>
> **與消費申訴 15 日完全分離。** 唯一共用的是 `utils/taiwanCalendar.js` 的日期算術
> （「怎麼在台灣曆上加天數」），**不共用任何期限數字**。
> 測試明確驗證：同一起點三條軌道算出三個不同末日；申訴的 15 與法源 §43 II 未被動到。
>
> **`PAYMENT_DUE_DAYS = 3` 已完全退場。** Admin 現在讀 `orders.payment_due_at` 實體欄位；
> legacy（NULL）誠實顯示「未設定付款期限（舊訂單）」，**不做任何 fallback 推算**。
>
> **Legacy 鐵規則落實：** 既有訂單 `payment_due_at` / `review_due_at` **一律保持 NULL**，
> 不 backfill、不推算、**不被判定為逾期**（未知 ≠ 違規）——
> 它們建立當下買家根本沒有被揭露過 7 日期限，未揭露的歷史狀態不得事後補成契約事實。
> 測試斷言「2026-08-26 之前建立卻有期限的訂單 = 0」。
>
> **買家可見的舊 SLA 文案已清零。** 先前四處承諾的小時級審核時間全數改為
> `frontend/lib/payment-timing.ts` 的常數；grep 驗證前端已無殘留
> （該檔的歷史說明刻意不重述舊字串，好讓斷言保持有效）。
> 「通常 1 個工作日」實作為**字串常數**（`EXPECTED_REVIEW_COPY_ONLY`），
> 測試斷言 policy 物件裡的數字**只有 7 與 3**，確保它永遠進不了計算。
>
> **退件後重新提交會重設審核週期** —— 舊的（已被退件的）提交不得繼續把它的期限壓在新提交上。
> 測試先把訂單推成逾時、退件、再提交，驗證 `isReviewOverdue` 回到 false 且期限往後移動。
> **核准後不再逾時**，且 `review_due_at` 本身**不被核准動作改寫**（它是歷史事實）。
>
> **本輪刻意未做（Gate 6 因此維持 `PARTIAL`）：** 自動過期
> （**無** `orders.status = 'expired'`、**無**排程、**無**自動取消 —— 訂單狀態集合實測仍是
> `approved / cancelled / pending_payment`）、逾期付款的 enforcement、逾時**告警**送達管道。
> Admin **可以辨識**逾期與逾時，但系統不會自己動手。
> lazy enforcement（提交時即時判斷 `payment_due_at`）的架構已在下方 §Legacy 報告中回報，**未實作**。
>
> **非回歸：** `paid_at` 語意、寫入點、營收查詢**完全未動**；
> 測試驗證新欄位不參與任何營收聚合、`paid_at` 未被任一期限回填、
> `payment_received_at` 未被動到、無訂單被 expired／cancelled。
>
> **驗收：** DB **330 / 330**、unit **195 / 195**、smoke **exit 0**、
> `npm run verify:web` **全部通過**。
>
> **§18 交付期日的產品語意已寫進 `mvp_rules.md` §12.3a.2，並明確標示
> `PRODUCT COPY / PENDING LEGAL WORDING`** —— 正式條文仍待 `L-08`／`L-17`。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> `LEGAL-01` `OPEN`／`SCHEMA-02` `OPEN` `P3`／Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #10 完成（2026-08-27）：`GATE 3 — BUYER + ADMIN COMPLAINT UI`**
>
> **本輪的 scope source 是使用者指令**（tracker 先前只把它列為「候選、尚未排序」，
> 見 §2 順序 0）。正式定義與 Completion Criteria 已回寫 §1.4 的 `W2-10`。
>
> **實作前的實際缺口：** Wave 2 #6 把 complaint backend 做完並測過，
> 但 `grep -rn "complaints" frontend/apps/web` **零命中** ——
> 買家沒有任何地方提得出申訴、Admin 沒有任何地方看得到申訴。
> Gate 3 的 `N1` 欄位、`N2` SLA、`N3` 證據**只存在於 API，對使用者等於不存在**。
> 這不是「只有 UI 沒有 backend」，而是**完全相反**的那一種缺口。
>
> **改動（全部是新增，未動任何 backend 行為）：**
> `frontend/lib/complaint-labels.ts`（新，狀態／類型／轉移對照）／
> `frontend/lib/api-types.ts`（新增 4 個 complaint 形狀）／
> `frontend/app/me/complaints/page.tsx`（新）／`.../new/page.tsx`（新）／`.../[id]/page.tsx`（新）／
> `frontend/app/admin/complaints/page.tsx`（新）／
> `frontend/lib/admin-nav.ts`（「信任與安全」新增入口）／
> `frontend/app/me/orders/[orderId]/page.tsx`（訂單詳情的申訴入口）／
> `Backend/tests/complaintUiContract.db.test.js`（新，8 case）／
> `frontend/tests/e2e/complaint-ui.spec.ts`（新，15 case）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.10.6a**。
> **Backend 程式碼零改動** —— 本輪只消費 Wave 2 #6 已有的能力。
>
> **三條「不得建立 frontend-only 狀態」的落實：**
> (1) 法定期限與逾期一律讀 backend 的 `statutory_due_at` / `overdue` / `daysUntilDue`，
> 前端**不自行推算** —— 那會讓 §43 II 的期限有兩個來源；
> (2) `?overdue=1` 是 **DB 查詢條件**（partial index），不是前端過濾；
> (3) 買家與 Admin 的歷程差異來自 backend 的 `forBuyer` 過濾，前端不做任何過濾。
>
> **前端對照表不得漂移** —— `complaintUiContract.db.test.js` 直接讀
> `lib/complaint-labels.ts` 的原始碼，逐條比對 backend 的 `STATUSES` /
> `COMPLAINT_TYPES` / `TRANSITIONS`。少一個值或轉移表不同就會失敗。
>
> **終態不呈現必定失敗的控制項：** `closed` 之後 backend 拒絕補件與任何轉移，
> 因此 Buyer 端不顯示補件表單、Admin 端不顯示處理表單（各有一條 E2E 鎖住）。
>
> **`resolved` ≠ 已退款** 在 UI 上明寫 —— Admin 詳情的補救案件區塊標示
> 「實際退款由補救案件流程執行」；關聯只寫 linkage，不建立、不退款。
>
> **驗證：**
> targeted db test **8 / 8**｜E2E `complaint-ui.spec.ts` **desktop 15/15、mobile 15/15**｜
> Backend DB **338 / 338**、unit **195 / 195**｜smoke **exit 0**｜`npm run verify:web` **全部通過**。
>
> **HTTP 實測（真實 backend :3001）：** 非訂單擁有者建立 **403 `order_not_owned`**；
> 未登入建立 **401**；夾帶 `buyerId` 無效（實際仍是本人）；
> **他人讀取申訴 403、未登入 401、本人 200**；
> buyer 讀 admin 端點 **403**、無 token **401**；
> `submitted→resolved` 跳關 **409** 並回 `allowed`；缺 message **400**；缺 resolutionSummary **400**；
> **Admin 歷程 3 筆含 `internal_note`、買家歷程 2 筆不含**；
> 結案後買家補件 **409 `complaint_closed`**；
> resolved/closed 後**自動建立的補救案件 = 0、訂單 status 未變**。
>
> **真實瀏覽器驗證（backend :3000 ＋ web :3010，非 mock）：**
> 以真實帳號登入後，Buyer 詳情頁**看不到** `內部：先核對銀行對帳單`，
> Admin 對同一筆申訴**看得到**且標示「買家看不到」；
> Admin 佇列顯示 backend 的「法定處理期限 2026/09/11（剩 15 天）」；
> `responded` 只提供 backend 允許的三個轉移；
> **透過 UI 執行 `resolved` 後，DB canonical state 確實變為
> `status=resolved` ＋ `resolution_summary` ＋ `resolved_at`**（read-back 驗證）；
> mobile 375×812 下 Buyer 詳情與 Admin 佇列／詳情皆**無 horizontal overflow**，
> 窄螢幕有「返回清單」，無小於 40px 的 CTA。
> ⚠️ **screenshot unavailable**（此環境的 Browser pane 未顯示，無法 composite frames）——
> 改以 DOM 讀取與實際互動驗證，如上。
>
> **本輪明確未做（依指令排除）：** complaint overdue alert delivery channel、
> Email / notification infrastructure、payment overdue enforcement / automatic expiration、
> `OPS-01`、`LEGAL-01`、`SCHEMA-02`、refund revenue/trend accounting、
> 與 Complaint UI 無關的 UI redesign / refactor。
>
> **順帶修復（本 session 自己造成的缺陷）：** Wave 2 #9 插入 `OPS-01` 時用了字面上的
> `\n` 而非換行，導致 `OPS-01` 與 `LEGAL-01` 被接在同一物理行（第 703 行，2959 字元），
> **`LEGAL-01` 在 Active TODO 表中實質消失**。已修復為真正的換行，表格恢復四列。
>
> **Gate 3 維持 `PARTIAL`（evidence 擴充，非升級）** —— 仍缺 `N4` 外部管道揭露文案（`L-17`）、
> 逾期**告警**送達管道、PDF 證據型別、`assigned_to` 指派流程、民法 §122 展延。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> `LEGAL-01` `OPEN`／`SCHEMA-02` `OPEN` `P3`／`OPS-01` `OPEN` `P2`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #11 完成（2026-08-27）：`GATE 3 — COMPLAINT SLA OVERDUE ALERT / ESCALATION`**
>
> **產品決策：站內 Admin 佇列／dashboard alert 作為第一個正式 overdue delivery channel。**
> 本輪**不做** Email／SMS／push／notification center —— 那需要新的基礎建設，
> 而站內告警已足以讓營運人員真正看得到並處理。
>
> **Inventory 結論：backend overdue 語意已完全正確，不需要任何 policy 改動。**
>
> | 問題 | 答案 |
> | --- | --- |
> | `overdue` 產生點 | `services/consumerComplaint.service.js:407`（`withSla`）← `utils/complaintSla.js:158` |
> | `daysUntilDue` | 同上 `:408` |
> | canonical deadline | `consumer_complaints.statutory_due_at`（建立時持久化） |
> | 哪些狀態算 overdue | `submitted` / `under_review` / `responded` |
> | terminal 會回 `overdue=true` 嗎 | **不會** —— `complaintSla.js:160` 直接排除 |
> | `?overdue=1` 是誰過濾 | **backend DB WHERE** ＋ partial index `idx_cc_open_due` |
> | 需要 scheduler 嗎 | **不需要** —— 純 read-time 計算 |
>
> **唯一的實際缺口：沒有任何 surface 能算出「現在有幾件逾期」。**
> `/admin/dashboard/summary` 的 7 個 count 查詢完全不含 complaints。
>
> **改動：**
> `Backend/services/consumerComplaint.service.js`（抽出 `OVERDUE_SQL` ＋ 新增 `countOverdue()`；
> `listComplaints` 改用同一個常數）／
> `Backend/services/adminDashboard.service.js`（新增 `overdueComplaintsCount`，**引用 `OVERDUE_SQL`**）／
> `frontend/lib/api-types.ts`／`frontend/components/admin/AdminDashboardPage.tsx`（告警區塊）／
> `frontend/app/admin/complaints/page.tsx`（佇列期限 error 色 ＋ 詳情逾期橫幅 ＋ detail testid）／
> `Backend/tests/complaintOverdueAlert.db.test.js`（新，9 case）／
> `frontend/tests/e2e/complaint-overdue-alert.spec.ts`（新，8 case）／
> `frontend/tests/e2e/admin.spec.ts`（fixture 補 `overdueComplaintsCount: 0`）／`run-db-tests.js`／
> `docs/mvp_rules.md` **新增 §12.10.6b**。
> **backend overdue policy、SLA 天數、狀態機皆零改動。**
>
> **本輪最重要的設計決定：單一 `OVERDUE_SQL`。**
> 告警最容易壞掉的方式不是算錯，而是**兩個地方各算一次** ——
> dashboard 說「3 件」點進去只有 2 件，Admin 就再也不會相信那個數字，告警等於沒有。
> 因此 `isOverdue()` / `?overdue=1` / `countOverdue()` 共用同一個判準，
> 且測試**明文斷言 dashboard 原始碼不得手寫 status 清單**。
>
> **沒有逾期就不顯示告警。** 告警區塊與常駐待辦卡刻意不同：
> 待辦卡是日常佇列（0 也有意義），告警是**已違反法定期限**的例外狀態，
> 常駐顯示「0 件逾期」只會鈍化它。
>
> **前端不做任何日期比較。** E2E 刻意提供「期限已過但 `overdue=false`」的 terminal fixture ——
> 前端若偷偷 `Date.now() > statutoryDueAt`，那條測試就會失敗。
>
> **驗證：**
> db test **9 / 9**｜E2E `complaint-overdue-alert.spec.ts` **8 / 8**｜
> 併跑 `complaint-ui` ＋ `admin.spec` 共 **61 / 61**｜
> Backend DB **347 / 347**、unit **195 / 195**｜smoke **exit 0**｜`npm run verify:web` **全部通過**。
>
> **HTTP 實測（真實 backend :3001）：** 建立 → `overdue=false`、dashboard count 不變；
> 把 `statutory_due_at` 推到過去（**不改系統時間**）→ `overdue=true`、`daysUntilDue=-2`、
> **dashboard count 與 `?overdue=1` 筆數一致**；買家端讀到的 `overdue` 與 Admin 相同；
> 轉 `resolved` → 期限仍在過去但 `overdue=false`、兩者同時歸零；`closed` 亦然；
> 非 Admin 讀 summary **403**、無 token **401**。
>
> **真實瀏覽器驗證（backend :3000 ＋ web :3010，非 mock）：**
> dashboard 顯示「⏰ 逾期申訴 **2 件**已超過消費者保護法規定的十五日處理期限」；
> 點擊 CTA → `/admin/complaints?status=overdue` 且**恰 2 列**，兩列皆顯示
> 「已逾法定期限」＋「法定處理期限：2026/08/25（已逾期 2 天）」；
> 詳情橫幅「已逾法定處理期限 2 天 · 法定期限 2026/08/25（消保法 §43 II）」；
> **透過 UI 結案一筆後：dashboard count 2 → 1、佇列 2 → 1、該案橫幅消失**；
> 兩筆都處理完後**告警整塊消失**（`alertPresent: false`），dashboard 其餘內容正常。
> mobile 375×812：無 horizontal overflow（`scrollWidth = 375`）、CTA 高 **44px**、右緣 149px 未裁切。
> ⚠️ **screenshot unavailable**（此環境的 Browser pane 未顯示，無法 composite frames）——
> 改以 DOM 讀取與實際互動驗證，如上。
>
> **本輪明確未做（依指令排除）：** Email／SMS／push notification、notification center infrastructure、
> cron／scheduler（inventory 已證明 read-time 計算即足夠）、complaint SLA 天數、民法 §122 假日展延、
> PDF evidence、`assigned_to`、payment overdue enforcement、`OPS-01`、`LEGAL-01`、`SCHEMA-02`、
> refund／accounting、與 overdue alert 無關的 dashboard redesign。
>
> **Gate 3 維持 `PARTIAL`（evidence 擴充，非升級）** —— 仍缺 `N4` 外部管道揭露文案（`L-17`）、
> **站外**通知管道（Email／SMS／push）、PDF 證據型別、`assigned_to` 指派流程、民法 §122 展延。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> `LEGAL-01` `OPEN`／`SCHEMA-02` `OPEN` `P3`／`OPS-01` `OPEN` `P2`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #12 完成（2026-08-27）：`GATE 6 — PAYMENT OVERDUE ENFORCEMENT`**
>
> **Domain Decision：Option A + A2（使用者拍板）。**
> `payment_due_at` 治理的是**第一次有效提交**，不是訂單的生死。
>
> **Inventory 先行的三個結論（先證明 repo 真正需要什麼，才動 code）：**
>
> | 問題 | 答案 |
> | --- | --- |
> | 期限目前有沒有 enforcement？ | **完全沒有。** HTTP 實測：逾期 3 天的訂單，兩條 upload 路由**都回 201**，之後仍可被核准為 `approved` |
> | 需要新增 `orders.status = 'expired'` 嗎？ | **不需要。** repo 已有 `order_progress_state`／`operational_status` 兩個**推導狀態**先例；逾期是 `payment_due_at` vs `NOW()` 的推導結果，不是狀態機節點 |
> | 需要 scheduler／cron 嗎？ | **不需要。** enforcement 只發生在寫入當下，read-time 推導即足夠 |
>
> **關鍵資料問題（指令要求先驗證，資料不足就必須停）：**
> 「這筆訂單曾在期限內成功提交過付款憑證嗎？」
>
> `orders.payment_info_submitted_at` **不可用** —— 它會被後續每次提交覆寫
> （安全測試庫實查 **17 筆**已被覆寫過）。
> 唯一可靠證據是 `manual_payment_proofs` 的憑證列：
> `COALESCE(uploaded_at, created_at) <= payment_due_at`。
> **資料充足，因此本輪未觸發 `DATA MODEL DECISION REQUIRED`。**
>
> **實作（單一 canonical predicate，多個 consumer）：**
>
> | 位置 | 內容 |
> | --- | --- |
> | `utils/paymentTimingPolicy.js` | `TIMELY_SUBMISSION_SQL`／`PAYMENT_SUBMISSION_ALLOWED_SQL`／`PAYMENT_DEADLINE_EXPIRED_SQL`／`evaluatePaymentSubmission()`／`PAYMENT_DEADLINE_EXPIRED_CODE` |
> | `services/orderService.js` | `uploadProof()` 內的**唯一寫入閘門**，置於 ownership 檢查**之後** |
> | `routes/order.js` | `409 { error: "payment_deadline_expired" }`；兩條路由共用同一 handler |
> | `services/buyerOrders.service.js` | 回傳 `payment_submission_allowed`／`payment_deadline_expired` |
> | `services/adminPaymentProofs.service.js` | 同上，加 `order_` 前綴 |
> | `lib/payment-timing.ts`／三個前端頁面 | 文案單一來源 ＋ 依 backend 旗標渲染 |
>
> **「期限已過」與「不能提交」是兩個欄位，不是一個。**
> A2 情境下兩者**會不一致**（`expired=true` 但 `allowed=true`）——
> 這正是前端**不得**自行用日期重算 eligibility 的原因。
>
> **HTTP 全鏈實測（`teaching_platform_security_test`，`PORT=3001`，8/8）：**
> S1 期限未到 → 201；
> S2 逾期未提交 → **兩條路由皆 409 `payment_deadline_expired`**，
> 且憑證列 0、`payment_info_submitted_at`／`review_due_at` 皆未寫入、`status` 不變、
> `private-storage/payment-proofs/` 檔案數 **304 → 304**；
> S2b non-owner 對逾期訂單 → **403 `forbidden`**，回應不含任何 deadline 資訊；
> S3 期限內提交 → 把期限推到 5 天前 → Admin 核准仍 **200 → `approved`**；
> S3b 期限內提交 → 退件 → 期限已過 → **補件 201**（A2 核心）；
> 衍生欄位 buyer／admin 皆與 backend 判定一致；
> `orders.status` 值域仍為 `approved / cancelled / pending_payment`（**無 `expired`**）。
>
> **測試：** `Backend/tests/paymentDeadlineEnforcement.db.test.js` **14/14**
> （A2-1～A2-7、`due_at` 大於／等於／小於 `NOW()` 的邊界、授權先於期限的順序、
> no-partial-write、未新增 order status）；
> `tests/e2e/payment-deadline-enforcement.spec.ts` **desktop 9/9、mobile 9/9**
> （mobile 明確設 **375×812** 並驗證兩頁 `scrollWidth <= 375`）。
> ⚠️ **screenshot unavailable**（此環境 Browser pane 未顯示）——
> 改以真實 Chromium 的 DOM 讀取與實際互動驗證。
>
> **本輪明確未做（依指令排除）：** `orders.status = 'expired'`、排程／cron／自動 DB 狀態轉移、
> 自動取消、Admin 延長期限／reopen／bypass 端點、逾期通知（Email／站內信）、
> legacy NULL 的 backfill、`OPS-01` 的營運處置、退款／會計影響。
>
> **Gate 6 維持 `PARTIAL`（evidence 擴充，非升級）** —— 仍缺
> `review_due_at` 逾時的**告警送達**、`payment_received_at` 是否成為核准前提（會計決策）、
> 正式 legal wording（`L-08`／`L-17`）。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED（Gate 1、2、3、5、6、7、14 為 PARTIAL）**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> `LEGAL-01` `OPEN`／`SCHEMA-02` `OPEN` `P3`／`OPS-01` `OPEN` `P2`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

> ### ✅ **Wave 2 #13 完成（2026-08-27）：`GATE 4 — COMPLAINT EVIDENCE RETRIEVAL / DELIVERY`**
>
> **實作前的事實：證據是 write-only。**
>
> | 問題 | 實測答案 |
> | --- | --- |
> | 有沒有 evidence 檔案交付端點？ | **repo 全域 0 命中** |
> | Buyer / Admin 拿得到什麼？ | 只有 metadata ＋ `has_file` boolean |
> | UI 怎麼呈現附件？ | 兩邊都是**純文字** `📎 檔名`，不是連結、無 onClick |
> | 淨結果 | 買家傳了匯款證明，**沒有任何人打得開** —— Admin 裁決時只剩平台自己的紀錄，正是 `R7` 要禁止的狀態 |
>
> **設計：一個 resolver，兩條路由。**
> `GET /me/complaints/:id/evidence/:evidenceId/file` 與
> `GET /admin/complaints/:id/evidence/:evidenceId/file` 都呼叫
> `consumerComplaint.service.js` 的 `resolveEvidenceForAccess()`。
> 授權判斷只有一份，**由測試斷言兩個 route 檔都不得自己下 `FROM consumer_complaint_evidence`**
> （自己查就會繞過 IDOR 綁定）。
>
> **刻意照抄 `paymentProof.service.js` 的三段式**（resolve → authorize → open），
> **不另建第二套 file-delivery framework**；交付、header、檔名編碼、
> 「inline 不寫稽核／`?download=1` 才寫」全部沿用既有 convention。
>
> **唯一真正不同的是 ownership 的來源：**
>
> ```text
> 付款憑證 → orders.user_id
> 申訴證據 → consumer_complaints.buyer_id
> ```
>
> **不得**把訂單擁有者模型套過來 —— 申訴可以完全沒有 `order_id`
> （例如帳號遭冒用），那種案件的證據仍然必須讀得到。
> db test 用「刻意不帶 orderId 的申訴」把這條釘住。
>
> **五個確定性錯誤碼：** 404 `complaint_not_found`／404 `evidence_not_found`／
> 403 `forbidden`／**409 `evidence_file_unavailable`**（本來就只有文字，重試無用）／
> **503 `evidence_object_missing`**（有 key 但實體不見了 —— 資料是對的、基礎設施壞了）。
> 後兩者刻意分開。任何情況**不回退公開路徑**，訊息不含檔案系統路徑；
> 畸形／越界 key 走同一條 503（`storage.stat()` 把 key 形狀例外吞成 `{exists:false}`），
> **不 crash、不洩漏 storage root**。
>
> **HTTP 全鏈實測（`teaching_platform_security_test`，`PORT=3001`）—— 18/18：**
> 擁有者 200 且 **sha256 與原檔位元組相符**；headers `image/png` ＋ `inline` ＋
> `private, no-store` ＋ `nosniff` ＋ RFC 5987 雙 filename；
> anonymous **401**；非擁有者 **403 且取不到位元組**；買家打 admin 路由 **403**；
> Admin **200 且位元組相符**；**IDOR**（A 申訴路由 ＋ B 證據 id）買家與 Admin **皆 404**；
> 純文字證據 **409**；`?download=1` 為 attachment 且稽核 **0→0→1**（inline 不寫、download 才寫）、
> 稽核 meta **不含 storage_key**；路徑遍歷 `..%2F..%2Fetc%2Fpasswd` 與 NUL 皆安全拒絕且不洩漏路徑。
>
> **真實瀏覽器驗證（backend :3000 ＋ web :3010，皆指向 security test DB）：**
> Buyer 詳情 3 列證據 —— 有檔的顯示「查看／下載」＋「image/png · 85 B」，
> **純文字那列不顯示必定失敗的控制項**；點「查看」→ `blob:` object URL、
> **`naturalWidth > 0`（真的解碼出影像，不是壞圖）**；
> 網路請求 **無 token in URL**、`Authorization: Bearer` 走 header；
> DOM 無 `storage_key`／`checksum`／JWT（`private-storage` 命中 0）。
> 另一位**已登入的買家**直打檔案路徑 → **403**；未登入 → **401**，兩者皆無位元組。
> Admin 詳情同樣解出真實影像，且 **只打 admin scope（buyer scope 請求數 0）**。
> mobile 375×812：`scrollWidth = 375` 無 overflow、tap target **44px**、
> 長中文檔名可斷行且右緣 326px 未裁切。
> ⚠️ **screenshot unavailable**（此環境 Browser pane 未顯示）—— 改以 DOM 讀取與實際互動驗證。
>
> **測試：** `Backend/tests/complaintEvidenceDelivery.db.test.js` **15/15**；
> `tests/e2e/complaint-evidence-delivery.spec.ts` **desktop 9/9、mobile 9/9**。
> **Regression：** 申訴 ＋ 付款憑證共 **46/46**（`sendFileDownload` 為共用 helper，
> payment-proof 交付一併回歸）、DB **376/376**、unit **195/195**、smoke **exit 0**、`verify:web` **exit 0**。
>
> **本輪明確未做（依指令排除）：** PDF 型別（`PROD-01`）、MIME 政策擴張、upload pipeline 重寫、
> complaint SLA／狀態機、`assigned_to`、Email／SMS／push、外部申訴管道文案、民法 §122、
> 法律文件撰寫、Gate 5 consent、Gate 11 consent 版本處置、Gate 12 `/terms`／`/privacy`。
>
> **順帶發現但未修（`DX-14`）：** 上傳檔名的非 ASCII 字元被存成 latin1 亂碼。
> **既有壞資料早於本輪**（2026-05 的付款憑證即是），root cause 在上傳邊界的 multer，
> **交付端無錯**。屬 scope 外，已立案未處理。
>
> **Gate 4 `NOT IMPLEMENTED`（實為文件落後）→ `PARTIAL`。**
> 唯一剩下的未決項是 PDF（`PROD-01`），**BLOCKED ON PARALLEL LEGAL / PRODUCT DECISION**。
> Deployment Readiness 維持 **0 / 14 IMPLEMENTED**。
>
> **外部驗證維持：** Lawyer `PENDING`／Accountant `PENDING`／`PRE-04` `L-10` `PENDING`／
> `LEGAL-01` `OPEN`／`SCHEMA-02` `OPEN` `P3`／`OPS-01` `OPEN` `P2`／`PROD-01` `OPEN` `P2`／
> Retention `L-21`／`T-14`／`RM-15` `PENDING`。

### `P1-10` 創作者表單要手打機器格式

**Schema inventory：** `materials.category` 是 `text` 且**沒有 CHECK constraint**；
`price` 是 `integer`；`contents` 是獨立的 `material_contents` 表，
而 Backend 的 API 契約（`normalizeContents()`）**本來就收結構化陣列**
`{ type, name, count, description }[]` —— 管線字串從頭到尾只是 UI 的產物。
**因此本項沒有任何 schema 變更。**

**已經發生的資料損害（不是假設）：** dev DB 的 `materials.category` 實測分布為
`語文`(3) / `math`(3) / `56`(1) / `language`(1) ＋ 空值 ——
八筆裡有四筆是買家**永遠篩不到**的值。

**修法：**
- **分類** → `<select>`。選項來自新的 `lib/material-categories.ts`（唯一來源）：
  畫面顯示中文、送出 canonical 值。先前分類定義散在三處且**彼此不一致**
  （`CategoryChips` 的 `science`＝「科學」vs `MaterialCard`／`detail-utils` 的「自然」），
  一併收斂為以**買家篩選列**的用字為準 —— 創作者選「科學」，那份教材就必須出現在
  買家的「科學」篩選底下。
  **編輯頁保留 legacy 值**：不在清單內的現值會多一個「目前值：X」選項，
  否則打開編輯頁就會把 `語文` 靜默改成第一個選項，創作者一按儲存即被覆寫。
- **價格** → `type="number"` ＋ `min/step` ＋ 明確標示 NT$。Backend 仍是唯一驗證權威。
- **教材內容** → 新元件 `components/teacher/MaterialContentsField.tsx`：
  可新增／可刪除的結構化列（形式／名稱／數量／說明），至少保留一列；
  完全空白的列在送出前丟棄；`count` 空字串代表「沒有數量」而不是 0。
  **新增與編輯兩頁共用同一個元件**。

**驗證（create 與 edit 都做，且以 DB 為準）：**
- **Create**：選「科學」＋價格 250 ＋一列結構化內容 → DB 實查
  `category=science` / `price=250` / `contents=(圖卡, 科學觀察卡, 12, 含解說)`。
- **Edit（audit fixture `mat_mt89lnbo67nold`）**：開啟編輯頁正確 hydrate
  （select＝`math`、price `type=number`＝150、內容列＝`flashcard/測試圖卡/10/稽核用圖卡`），
  修改一項 ＋ 新增一項 → 儲存 → **重新載入後兩列資料完全一致**。
- **Legacy 分類**：暫時把 fixture 的 category 改成 `語文`，編輯頁顯示
  「目前值：語文」且 `value` 維持 `語文`（未被靜默覆寫），驗證後已還原為 `math`。

> **既有的壞資料未清理（刻意）：** 本項只阻止**新的**壞值產生，
> dev DB 既有的 `語文`／`56` 仍在。清理需要逐筆判斷原意（`語文` 應該是 `language`？
> `56` 無從得知），屬資料決策而非工程決策。
> **`materials.category` 在 DB 仍無 CHECK constraint** —— 前端選單是目前唯一的守門員，
> 直接打 API 仍可寫入任意字串。要不要加約束（以及既有列如何處理）需另行決定。

---

## 3. P1 Security & Correctness

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ~~`SEC-01`~~ | ✅ ~~`NOW`~~ | Payment / Security | ~~Payment Proof Private Storage~~ | 憑證含買家匯款資訊，曾位於公開 static 樹 | 見 **§1.1** 完整證據表 | — | 見 **§1.1**（全數達成） | **DONE**（2026-08-23）—— 已移入 §10，保留此列僅為對照 | 有（`docs/mvp_rules.md` §12.4） |
| ~~`SEC-02`~~ | ~~`P1`~~ ✅ | Material / Security | 未上架教材的行銷素材仍在公開 `/uploads` | 封面／詳情圖／試看影片由 `express.static` 無條件公開，**未上架**教材的素材只靠隨機檔名保護 | `Backend/index.js:49` `app.use("/uploads", express.static(...))`；付款憑證已被 `:41` 的 handler 擋掉，**其餘素材沒有** | `SEC-01` 完成後可重用同一套私有儲存與授權模式 | 決定「已上架教材的封面本來就該公開」的邊界；未上架／已下架教材的素材不得被匿名取得 | **DONE**（2026-08-24）—— 已移入 §10（見「`SEC-02` Material Media Private Storage」列）與 §1.3 完整紀錄；保留此列僅為對照。**本輪（2026-08-28）重新確認的 code 證據：**`Backend/index.js:85` 於 `express.static` **之前**攔截 `/uploads/material-media`，回應指向 `GET /materials/media/:mediaId`。**（2026-08-28 tracker reconciliation：本列先前仍寫 `TODO`，與 §1.3 標題、§2 Next Up、§10 三處的 DONE 不一致；依 CLAUDE.md §11.6 以 code 證據更正。）** | 部分 —— 私有儲存機制已存在，授權規則未定 |
| `COR-01` | ~~`P1`~~ ✅ | Buyer / Correctness | Buyer Order Progress State — Re-upload Alignment | 買家重新上傳憑證後仍看到「已退件」，並被要求再次上傳 | 原因與修法見 §1.1 | — | 見 §1.1 | **DONE**（2026-08-23） | 有（`docs/mvp_rules.md` §5「Buyer derived state」，本輪新增） |

### `COR-01` 詳細（已完成 —— 保留為 regression 說明）

**原始重現情境**

```text
order.status            = pending_payment
proof #1 (較舊)         = rejected
proof #2 (較新)         = pending
```

**修正前：** `order_progress_state = 'rejected'`（買家已重新上傳，卻仍被要求重新上傳）
**修正後：** `order_progress_state = 'reviewing'`

**canonical 規則**（正式落在 `docs/mvp_rules.md` §5「Buyer derived state」）

```text
orders.status = approved   → approved（不看任何憑證歷史）
最新一筆憑證 pending        → reviewing（不看歷史 rejected）
最新一筆憑證 rejected       → rejected
最新一筆憑證 approved       → proof_uploaded
沒有憑證                    → pending
```

> 回傳值是 `'approved'`，不是 `'completed'` —— 前端四個頁面都依這個字串判斷，**不要改名**。

**已關閉的缺口**

- 兩段各自複製的 SQL → 收斂到 `Backend/services/buyerOrders.service.js` 一處。
- `order_progress_state` 測試覆蓋由 **0** → `buyerOrderProgress.db.test.js`（14 個斷言群）
  ＋ smoke 的真實 HTTP 路徑 ＋ `buyer-order-progress.spec.ts`（UI 文案與 CTA）。

完整驗收證據見 **§1.1**。

---

## 4. P1 Admin Product / IA

決策來源：`docs/admin-information-architecture.md` §10。**優先序以本檔為準。**

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ~~`IA-01`~~ | ✅ ~~`P1`~~ | Admin / IA | Teaching Feedback Contextualization | 「教學回饋」是 flat read-only timeline，不是 Admin 的日常工作；它該是判斷檢舉／教材時的**脈絡**，不是獨立 workflow | 原始證據見下方 §4.1「修正前」 | 無 | 見下方 Completion Criteria（全數達成） | **DONE**（2026-08-23，working tree，未 commit）—— 詳細見 §4.1 | 有（IA §10 項目 5、IA §8.1） |
| ~~`IA-02`~~ | ✅ ~~`P1`~~ | Admin / IA | Activity Log —— `meta` 人話化與 detail page 遷移 | 全站列表已人話化，但 `meta` 仍是 raw JSON，且 detail page 完全沒用上既有的 formatter | **已完成的部分：** `lib/admin-labels.ts:341` `describeActivity()`、`ACTION_CATALOG`、`TARGET_TYPE_LABEL`、`actorRoleLabel()`；`app/admin/activity-logs/page.tsx:342` raw 欄位已收進第三層摺疊區。**缺口：** 全 repo **沒有** meta formatter（grep `formatMeta`/`describeMeta` 無命中），`activity-logs/page.tsx:374` 仍 `JSON.stringify(log.meta)`；`activity-logs/[id]/page.tsx:50,95` 完全是 raw `<pre>`，未使用 `describeActivity` | 無 | 見下方 Completion Criteria（全數達成） | **DONE**（2026-08-23，working tree，未 commit）—— 詳細見 §4.4 | 有（IA §10 項目 7、12） |
| ~~`IA-03`~~ | ✅ ~~`P1`~~ | Admin / IA | Entity-centric Activity Entrances | 調查一筆付款或檢舉時，無法就地跳到該實體的活動紀錄 | **已有入口：** 教材（`admin/materials/page.tsx:334`、`materials/[materialId]/reports/page.tsx:122`、`MaterialReviewPanel.tsx:584`）、訂單（`admin/orders/page.tsx:155`）。**缺口：** `app/admin/payment-proofs/page.tsx` 與 `app/admin/reports/page.tsx` 對 `activity-logs` 的引用數皆為 **0** | 無（三個 entity 路由都已存在） | 付款審核面板 → 該訂單紀錄；檢舉案件詳情 → 該教材紀錄（全數達成） | **DONE**（2026-08-23，working tree，未 commit）—— 詳細見 §4.4 | 有（IA §10 項目 8） |
| ~~`IA-04`~~ | ✅ ~~`P1`~~ | Admin / Dashboard | Dashboard Attention Orders | Dashboard 應回答「現在需要做什麼」，不是顯示最新 DB rows | 原始證據見下方 §4.2「修正前」 | 無 | 「最近訂單」→「需要注意的訂單」，依 `adminOrders.service.js` **既有的** `operational_status` 挑選，**不自行發明 SLA**（全數達成） | **DONE**（2026-08-23，working tree，未 commit）—— 詳細見 §4.2 | 有（IA §10 項目 6、§11 原則 1；`docs/mvp_rules.md` §14.4） |
| ~~`IA-05`~~ | ✅ ~~`P1`~~ | Admin / Dashboard | Dashboard Important Activity | 「最近活動」顯示 raw event code，Admin 看不懂也點不進去 | 原始證據見下方 §4.2「修正前」 | ~~`IA-02`~~ —— **實測不成立**：`IA-05` 只用已存在的 `describeActivity()` / `ACTION_CATALOG` / `TARGET_TYPE_LABEL` / `actorRoleLabel()`，**不讀 `log.meta`**（`AttentionActivityList.tsx` 只渲染 `describeActivity()` 的 `sentence` / `target` 與 `created_at`；唯一的 `meta` 字樣是 CSS class `text-meta`），而 `IA-02` 的剩餘缺口正是 meta formatter 與 detail page → 兩者無相依 | 改用 allowlist 挑「有 Admin 價值的事件」＋ `describeActivity()` ＋ 可導航（全數達成） | **DONE**（2026-08-23，working tree，未 commit）—— 詳細見 §4.2 | 有（IA §10 項目 6；`docs/mvp_rules.md` §14.4、§22.2.1） |
| ~~`IA-06`~~ | ✅ ~~`P1`~~ | Admin / Orders | Admin Orders Search / Buyer Email Lookup | 客訴進來時只能靠肉眼捲清單 | `Backend/services/adminOrders.service.js:93` `listOrders({ status })` —— **只有** status 一個參數，無 `q`、無 email、無分頁；`routes/admin.js:78` 亦然。前端 `app/admin/orders/page.tsx` 只讀 `status` query | 無 | 加 `q`（訂單 id / 買家 email）＋ 沿用 `Backend/utils/adminQuery.js` 的分頁契約 | **DONE**（實作 2026-08-23／驗收 2026-08-24 settled tree，見 §4.7） | 有（IA §10 項目 10） |
| ~~`IA-07`~~ | ✅ ~~`P1`~~ | Admin / IA | Placeholder Users / Settings 移出 primary Sidebar | 兩頁都是誠實的 placeholder，沒有任何 backend capability，卻佔著主導覽 | 原始證據：`AdminSidebar.tsx:57-59` 曾有 `/admin/users`（用戶管理）與 `/admin/settings`（系統設定）；Backend **完全沒有** `/admin/users` 端點（§15.3 U-1） | 無 | 從 `sections` 移除；route 保留可直達（`/admin/users/:id/activity-logs` 仍是唯一的依人查詢入口，不可斷）（全數達成） | **DONE**（2026-08-23，working tree，未 commit）—— 實作、targeted acceptance 與**最終冷 `.next` build 全數完成**（2026-08-23 final reconciliation 補齊）。詳細見 §4.3 | 有（IA §10 項目 11） |
| ~~`IA-08`~~ | ✅ ~~`P1`~~ | Admin / IA | Admin 在**非 `/admin` 路由**上仍看得到已移除的一級入口 | `IA-01` 與 `IA-07` 只收斂了 `AdminSidebar`；`RoleShell` 另有一份 admin 導覽清單，兩者已分歧。admin 角色瀏覽 `/materials`、`/` 等頁時，側欄仍列出「用戶管理」「系統設定」「教學回饋」——點進去是同樣的死路，等於 IA 收斂在第二個 surface 上沒有生效 | `frontend/apps/web/components/layout/RoleShell.tsx:42-50` 的 `NAVS.admin` 仍含 `/admin/users`（用戶管理）、`/admin/settings`（系統設定）、`/admin/reviews-hub`（教學回饋）。該清單在 `/admin/*` 是 dead（`RoleShell.tsx:254` 對 `/admin` early return），但 `getRoleByPath()`（`RoleShell.tsx:96`）在 `storedRole === "admin"` 時對非 admin 路由也回傳 `admin`，`SimpleNavSidebar` 會渲染它 | 無 | 兩個 surface 的 admin 導覽收斂成單一 source of truth（或明確定義 `RoleShell` 的 admin 清單只是 cross-role 捷徑並移除已下架入口）；desktop 與 mobile 各一支 E2E | **DONE**（2026-08-23，working tree，未 commit）—— 詳細見 §4.6。採 completion criteria 的**第一個選項**：兩個 surface 收斂到單一 source of truth `frontend/apps/web/lib/admin-nav.ts` | 有（IA §2、§3） |

### `IA-01` Completion Criteria

1. 從 `AdminSidebar.tsx` 的「信任與安全」組移除「教學回饋」。
2. `/admin/reviews-hub` route **暫時保留**（compatibility），不從主導覽進入。
3. **檢舉案件詳情**加上該教材的評價脈絡：平均星等、評價則數、低星數量、最新數則
   —— 只用**既有** API 能力（`GET /materials/:id/rating`、`GET /materials/:id/reviews`）。
4. 教材的 Admin context 視需要呈現同一份摘要。
5. **不做 moderation**（隱藏／刪除／標記）—— 見 `FUT-P3`。
6. **不做全平台 Quality Dashboard** —— 見 `FUT-P3`。

> 因為只在 detail 層取單一教材的評價，`reviews-hub` 的 61 請求 N+1 **不會被帶進新位置**。
> 若最終決定保留 `reviews-hub` 頁面本身，N+1 才需要獨立處理（`FUT-T5`）。

> ### ⚠️ §4.1～§4.7 為 recovery 後重建，非原文還原
>
> 這七段原本的 completion prose（約 461 行）在 2026-08-24 的 tracker truncation 事故中遺失，
> **任何 transcript / snapshot 都沒有保存到事故前的最終版本**（部分中間版本存在但長度與最終版不符，
> 逐字拼接會產出「看起來像原文、其實是混版」的東西）。
>
> 因此以下七段**不宣稱是原文**。每一段都標記為
> `Reconstructed after tracker recovery incident, based on settled-tree evidence`，
> 內容只放五件可被證據支撐的事：final status／implementation summary／verification evidence／
> completion date／preserved dependencies。
>
> 事實來源：本檔 §10 Recently Completed 與 §1 Current Focus（**兩者皆為事故前逐字回收**，
> 各 IA 的驗證數字即出自該處）、settled working tree 的實際程式碼，
> 以及 2026-08-24 settled-tree reconciliation 的重跑結果。
> **已遺失的敘述性內文不重造。** 若日後需要更完整的歷史脈絡，
> `docs/admin-information-architecture.md` 仍保有各項的設計決策紀錄。

### 4.1 `IA-01` 完成紀錄（Reconstructed after tracker recovery incident, based on settled-tree evidence）

| 欄位 | 內容 |
| --- | --- |
| **Final status** | **DONE**（2026-08-23，working tree，未 commit） |
| **Completion evidence** | 見本檔 §10 對應列（事故前逐字回收） |
| **Dependency** | 無上游。下游 `FUT-T5`、`FUT-P3` **仍保留**（見 §13） |

**Implementation summary**

「教學回饋」不再是 Admin 一級導覽；它改以**唯讀脈絡**的形式出現在需要它的地方
（檢舉案件詳情、教材的 Admin 檢舉脈絡頁），元件為 `components/admin/MaterialFeedbackContext.tsx`。
只使用**既有** API 能力（`GET /materials/:id/rating`、`GET /materials/:id/reviews`）——
**未新增 API、未做 moderation**（隱藏／刪除／標記一律不做，見 `FUT-P3`）。
`/admin/reviews-hub` route 保留可直達，因此該頁的 61 請求 N+1 **沒有自動消失**（`FUT-T5`）。

**Verification evidence**

lint 0 error／typecheck exit 0／`admin-operations.spec.ts` 64/0（含 2 支新測試）／
sidebar 與 static route 4/4／`shell-consistency.spec.ts` 全數通過。
最終 build 驗收於 2026-08-23 reconciliation 輪次補齊：冷 `.next` 的 `verify:web` exit 0
（lint 0／typecheck 0／build 50 route）＋ production build 上 `admin.spec.ts` 66/0。

**Settled-tree 覆核（2026-08-24）**：`MaterialFeedbackContext.tsx` 存在且被掛載，
`/admin/reviews-hub` 仍可直達，無 stale caller。

---

### 4.2 `IA-04` ＋ `IA-05` 完成紀錄（Reconstructed after tracker recovery incident, based on settled-tree evidence）

| 欄位 | 內容 |
| --- | --- |
| **Final status** | 兩項皆 **DONE**（2026-08-23，working tree，未 commit） |
| **Completion evidence** | 見本檔 §10 對應兩列（事故前逐字回收） |
| **Dependency** | `IA-05` 對 `IA-02` 的相依**實測不成立**，已解除（見 §13） |

**Implementation summary —— `IA-04` Dashboard Attention Orders**

「最近訂單」改為「需要注意的訂單」：只顯示 Backend `operational_status ∈ { payment_rejected,
pending_review }` 的訂單，**篩選在 API 端**，**未新增任何 SLA／逾期規則**。
徽章改用從 `app/admin/orders/page.tsx` 原樣搬出的共用 formatter
（`ADMIN_ORDER_OPERATIONAL_STATUS_LABEL`），**既有 Admin Orders 文案零變更**。
CTA 深連結到既有的付款審核（`?status=all&q=<order id>`——`all` 是必要的，
否則被退回的那一筆會被預設篩選藏起來）。

**Implementation summary —— `IA-05` Dashboard Important Activity**

「最近活動」改為「需要注意的活動」：`ATTENTION_ACTIVITY_ACTIONS` allowlist **送給 API 篩選**
（不抓大 window 再在前端 filter）；文案一律走既有的 `describeActivity()`；
每一列導向既有的 entity 紀錄或檢舉案件入口。
Backend 唯一改動是 `GET /admin/activity-logs` 的 `action` 接受逗號分隔多值：
parameterized `= ANY($n::text[])`、單值語意不變、空值＝不篩選、排序與分頁不變，
**無 schema change、無新 endpoint**。

**Verification evidence**

`IA-04`：`admin.spec.ts` 66/0（production build）、`verify:web` exit 0。
`IA-05`：unit 124/0、db 175/0（含新檔 `adminActivityLogs.db.test.js` 8/0）、
smoke exit 0、Postman 111/0、`admin.spec.ts` 66/0、`verify:web` exit 0。

**Settled-tree 覆核（2026-08-24）**：`AttentionOrdersTable.tsx` 與 `AttentionActivityList.tsx`
（兩者為 staged rename 的目標檔）皆在位並被 `AdminDashboardPage.tsx` 使用。

---

### 4.3 `IA-07` 完成紀錄（Reconstructed after tracker recovery incident, based on settled-tree evidence）

| 欄位 | 內容 |
| --- | --- |
| **Final status** | **DONE**（2026-08-23，working tree，未 commit）——**已無未完成項目** |
| **Completion evidence** | 見本檔 §10 對應列（事故前逐字回收） |
| **Dependency** | 下游 `IA-08`（第二個 surface 的收尾），已完成 |

**Implementation summary**

「用戶管理」與「系統設定」不再是 Admin 一級導覽；desktop 側欄與 mobile drawer 共用同一份
`sections`，兩邊都驗過。`/admin/users`、`/admin/settings` 的 **route 保留可直達**，
並維持誠實的 placeholder（**未實作任何 users／settings workflow**）。
`/admin/users/:userId/activity-logs` 這條依人查詢的入口未被切斷。

**Verification evidence**

lint 0 error／`tsc --noEmit` exit 0／sidebar 2/0／static routes 2/0／drawer 2/0／
`shell-consistency.spec.ts` 28/0／`IA-01` 回歸測試 4/0。
最終 repository build 於 2026-08-23 final reconciliation 補齊：冷 `.next` 的 `verify:web`
**一次通過**（lint 0／typecheck 0／build 51 route），並在 production build 上重跑
`admin.spec.ts` 全套 0 failed 與 drawer／static route targeted 測試。

---

### 4.4 `IA-02` ＋ `IA-03` 完成紀錄（Reconstructed after tracker recovery incident, based on settled-tree evidence）

| 欄位 | 內容 |
| --- | --- |
| **Final status** | 兩項皆 **DONE**（2026-08-23，working tree，未 commit） |
| **Completion evidence** | 見本檔 §10 對應兩列（事故前逐字回收） |
| **Dependency** | 無 |

**Implementation summary —— `IA-02` Activity Log `meta` 人話化與 detail page 遷移**

新增 `describeActivityMeta(log)`：**吃整筆 log**，因此同一個 key 在不同 action 下可以走不同語意
（`to`／`reason`／`status`）；未登記的 key **不丟棄**，落到第三層 raw；
`null`／`{}` 不渲染空區塊；`meta` 非物件時整段退回 raw。
新檔 `components/admin/ActivityLogCard.tsx` 成為五個使用點的**唯一** renderer
（全站列表、單筆詳情，以及 materials／orders／users 三個 entity 頁），
IA §6 的三層齊備且第三層欄位一個未少。
Backend `GET /admin/activity-logs/:id` 改用 service 的 `getLogById()`，與清單共用
`ENRICHED_SELECT`／`serializeRow`，因此詳情頁拿得到 `actor_email`／`target_label`；
**無 schema change、無新 endpoint**，404 與 id 查找語意不變。

**Implementation summary —— `IA-03` Entity-centric Activity Entrances**

付款審核面板 → `/admin/orders/:orderId/activity-logs`；
檢舉案件詳情 → `/admin/materials/:materialId/activity-logs`。
兩個入口都連到**既有** entity 路由，**未新增任何 route、未產生第二套 workflow**。

**Verification evidence**

`IA-02`：unit 124/0、db 178/0（`adminActivityLogs.db.test.js` 11/0，含 `getLogById` 三支）、
smoke exit 0、Postman 111/0、冷 `.next` `verify:web` exit 0、
production build 上 meta humanization 10/0。
`IA-03`：production build 上真實點擊 ＋ URL ＋ timeline 渲染，desktop＋mobile **4/0**。

**Settled-tree 覆核（2026-08-24）**：`lib/admin-labels.ts` 同時存在 `describeActivity()`／
`activityTargetHref()`（`IA-05`）與 `describeActivityMeta()`（`IA-02`）—— **並存未互相覆蓋**；
`ActivityLogCard.tsx` 為唯一 renderer；兩個 `IA-03` 入口皆在位。

---

### 4.5 `IA-08` evidence 覆核（Reconstructed after tracker recovery incident, based on settled-tree evidence）

這一小節原本記錄的是：`IA-01` 與 `IA-07` 的收斂**只在 `/admin/*` 生效**——
admin 角色瀏覽 `/materials`、`/` 等非 `/admin` 路由時，`RoleShell.tsx` 另有一份
獨立抄寫的 admin 導覽清單，仍列出「用戶管理」「系統設定」「教學回饋」三個已下架入口。
該觀察在 2026-08-23 final reconciliation 於執行中的 dev server 上**實地覆核成立**，
並據此把 `IA-08` 排為當時的 Next Up。**該輪未修，只記錄。**

修法與驗收見下方 §4.6。

---

### 4.6 `IA-08` 完成紀錄（Reconstructed after tracker recovery incident, based on settled-tree evidence）

| 欄位 | 內容 |
| --- | --- |
| **Final status** | **DONE**（2026-08-23，working tree，未 commit） |
| **Completion evidence** | 見本檔 §10 對應列（事故前逐字回收） |
| **Dependency** | 上游 `IA-01` ＋ `IA-07`（見 §4.5） |

**Implementation summary**

**未採「只刪三行」的作法。** root cause 是同一份 IA 有兩個定義，因此收斂成單一 source of
truth `lib/admin-nav.ts`：`AdminSidebar` 用 `ADMIN_NAV_SECTIONS`（分組 ＋ icon），
`RoleShell` 用由它 `flatMap` **衍生**的 `ADMIN_NAV_ITEMS`（`SimpleNavSidebar` 沒有分組與 icon）。
**未改任何導覽項目、無 API 改動、無 route 增刪**；三條已下架的 route 保留可直達（實測 200）。

**Verification evidence**

lint 0 error／`tsc --noEmit` exit 0／新增 desktop＋mobile E2E 與 `IA-01`／`IA-07` 既有
drawer 測試 4/0／`shell-consistency.spec.ts` 全套 29/1（唯一失敗為既有的 `DX-06`
`boxOf()` race，單獨重跑 2/2 通過）／`admin.spec.ts` sidebar／static 4/0／
`admin-operations.spec.ts` teaching feedback 4/0。

**Settled-tree 覆核（2026-08-24）**：`lib/admin-nav.ts` 存在；
`RoleShell.tsx` `import { ADMIN_NAV_ITEMS, navPathOf }`、`AdminSidebar.tsx` 由同一支 module 取值，
`ADMIN_NAV_ITEMS` 確實由 `ADMIN_NAV_SECTIONS.flatMap()` 衍生 —— **單一 source of truth 成立**。

---

### 4.7 `IA-06` 完成紀錄（Reconstructed after tracker recovery incident, based on settled-tree evidence）

| 欄位 | 內容 |
| --- | --- |
| **Final status** | **DONE**（實作 2026-08-23；驗收 2026-08-24 settled tree，working tree，未 commit） |
| **Completion evidence** | 見本檔 §10 對應列（事故前逐字回收） |
| **Dependency** | 無下游相依；Dashboard「需要注意的訂單」（`IA-04`）已對齊分頁後的契約 |

**Implementation summary**

`GET /admin/orders` 加上 `q`（訂單編號／買家 Email，`ILIKE` ＋ `%`／`_` 跳脫）與分頁
（沿用 `Backend/utils/adminQuery.js` 的**同一份**契約）；回應新增 `buyer_email` 與 `pagination`。
count 與 list 共用同一份 `WHERE`／`FROM`，排序 `created_at DESC, id DESC` 保證分頁的決定性。
前端改用 `useListQueryState` ＋ `DataToolbar`／`FilterTabs`／`Pagination`；
依 IA §7，此頁**不加重新整理控制項**。

**Verification evidence（settled tree）**

unit 124/0、db 181/0、targeted DB test 14/0（含 wildcard 跳脫與 clamp）、
smoke exit 0、Postman 119 assertions / 0 failed、`IA-06` E2E 10/0。

**Settled-tree 覆核（2026-08-24 本輪）**：smoke 的
`GET /admin/orders?q= / page / limit (IA-06 search + pagination)` 一項通過（exit 0），
Postman 82 requests / 129 assertions / 0 failed。

### `IA-02` Completion Criteria

1. 新增 meta formatter（例如 `describeActivityMeta()`），把常見 key 轉成人話
   （`reason_code` → 退回原因中文、`from`/`to` → 狀態轉移、金額／檔名等）。
2. 未登記的 key **不丟棄**，落到 raw 區。
3. `/admin/activity-logs/[id]` 改用 `describeActivity()` ＋ 新 formatter，raw JSON 收到第三層。
4. 三個 entity 紀錄頁一併對齊（同時處理 IA §10 項目 12 的 ds 遷移與 `admin`/`parent` 字面值違規）。

---

## 5. P1 Buyer Product

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ~~`BUY-01`~~ | ~~`P1`~~ ✅ | Buyer / Product | ~~買家端「檢舉教材」送出 UI 不存在~~ | `POST /reports` 與整套 Admin 檢舉案件流程都在運作，但**平台上沒有任何地方能產生新檢舉**。整條 workflow 沒有真實入口 | 買家／公開頁對「檢舉」的引用數為 **0**：`app/materials/[id]/` 沒有任何 `report` 字樣；全 repo 含「檢舉」的頁面只有 `app/admin/*`、`app/creator/cases`、`app/teacher/materials`。`tests/e2e/public.spec.ts:52` 還留著 `// TODO(assert): submit report form and assert POST /reports behavior` | 無 | ~~需要產品決策~~ → **已拍板：補回買家檢舉 UI**，規則落在 `docs/mvp_rules.md` §6.5 | **DONE**（2026-08-24） | 有（`docs/mvp_rules.md` §6.5、MVP spec §9、`docs/materials-detail-spec.md` §9 第 13 項，**本輪新增**） |

> **這一項是 §12 undocumented TODO 的主要發現。** CLAUDE.md §5 已註記此缺口
> （「buyer 端的檢舉送出 UI 目前不存在」），但舊 tracker §3 寫的是「已接 `POST /reports`」
> —— 兩者矛盾，以 code 為準：**UI 不存在**。CLAUDE.md 該段已於 2026-08-24 改寫為正式規則。

### `BUY-01` 詳細（已完成 —— 保留為決策與 regression 說明）

**產品決策（2026-08-24 拍板）**

| 決策 | 結論 | 為什麼不是另一個選項 |
| --- | --- | --- |
| 主決策 | **補回買家檢舉 UI** | 替代選項「檢舉只由平台內部開案」在 repository 裡沒有立足點：`reports.reporter_id` 是 `NOT NULL REFERENCES users(id)`（`db/db_schema.sql`），且**不存在**任何 admin 建立檢舉的 endpoint（`Backend/routes/admin.js` 只有案件處置）；`mvp_rules.md` §6.4 又刻意不對創作者揭露檢舉人身分 —— 三者都預設「檢舉來自使用者」。選它等於讓整條 workflow 永久零入口，且與 CLAUDE.md §5「Report feature 保留」衝突 |
| 理由欄位 | **自由文字**（必填、trim、上限 500 字） | `reports` 沒有 reason code 欄位，加結構化分類需要 migration ＋ API 契約變更 ＋ admin UI 對應，已超出 `BUY-01`。在前端把假分類拼進同一個 `reason` 字串更糟：`lib/admin-labels.ts` 的 `report_created.reason` 是原文顯示，admin 會看到前端格式而不是檢舉人說的話 |
| 入口可見性 | **所有訪客可見**，非買家於 dialog 內被擋 | 與同一頁「加入購物車」的既有行為一致（`MaterialDetailPage.tsx` 對 `role !== "parent"` 是顯示提示，不是隱藏按鈕）。隱藏會讓未登入訪客不知道平台有檢舉機制 |
| 買家端案件追蹤 | **不做**，並在 `mvp_rules.md` §6.6 明列為「刻意沒有的能力」 | 沒有 buyer 端的 reports 讀取 API；補一支等於新的 API 契約，超出範圍 |

**實作（frontend 專屬 —— backend / schema 零改動）**

| 檔案 | 動作 |
| --- | --- |
| `frontend/apps/web/components/materials/detail/MaterialReportDialog.tsx` | **新增**。dialog（`role="dialog"` / `aria-modal`、Esc 關閉、focus 進出、body scroll lock，沿用 `NavDrawer` 既有模式）；`POST /reports` 走既有的 `apiFetch`；409/401/403/404 各有對應文案 |
| `frontend/apps/web/components/materials/MaterialDetailPage.tsx` | **修改**（+31/-1 行）。頁尾新增低強度的「檢舉這個教材」觸發點 ＋ 掛載 dialog。**未動**購買動線、gallery、feedback 區 |
| `frontend/apps/web/tests/e2e/material-report.spec.ts` | **新增**。送出（斷言真正送出的 body）／重複 409／訪客 gating 且**零次**呼叫 `POST /reports` |
| `frontend/apps/web/tests/e2e/public.spec.ts` | 移除已被覆蓋的 `// TODO(assert): submit report form`（1 行） |
| `docs/mvp_rules.md` | 新增 §6.5（買家端送出入口），原 §6.5 順延為 §6.6 並新增「買家端案件追蹤」一項 |
| `docs/teaching-platform-mvp-spec-v1.4.md` | §9 `POST /reports` 補 UI entry point 子項 |
| `docs/materials-detail-spec.md` | §9 顯示順序新增第 13 項「檢舉這個教材」 |
| `CLAUDE.md` | §5 的「已知缺口」改寫為正式規則 |

**未做（刻意）：** 未新增／修改任何 backend route、service、schema、migration；
未改 `MaterialDetailBody.tsx`／`MaterialDetailGallery.tsx`／`lib/material-mapper.ts`
（`SEC-02` 的可能落點，避免與 parallel session 衝突）；未動 `IA-*` 的任何檔案。

**驗證（2026-08-24）**

| 項目 | 結果 |
| --- | --- |
| `lint:web` | **0 error**（僅既有的 `no-img-element` warning） |
| `typecheck:web`（`next typegen` ＋ `tsc --noEmit`） | **exit 0** |
| `build:web` | **成功**，50 條 route；`/materials/[id]` 13.4 kB。⚠️ 於 scratchpad 的隔離複本上執行，原因見下方 `DX-05` |
| `material-report.spec.ts` | **6/6 passed**（desktop ＋ mobile） |
| 完整 E2E 套件（production build） | **323 passed / 23 failed / 32 skipped** |

**23 個失敗的歸因（無一由 `BUY-01` 造成）**

| 群 | 數量 | 歸屬 | 依據 |
| --- | --- | --- | --- |
| `public.spec.ts` 4 支 | 8 | 既有 `DX-01` 第 1 群 | 失敗 signature 與 §9 baseline **逐字相符**（`getByRole('link', { name: '購物車' })` 找不到、`📦 34 張圖卡`）。決定性反證：`📦` 在 `components/materials/`／`app/materials/` 的出現次數為 **0**，而產出該區塊的 `MaterialDetailBody.tsx` 本輪 `git diff` 為**乾淨**（committed，未修改） |
| `parent.spec.ts` 3 支 | 6 | 既有 `DX-01` 第 2 群 | `locator('main')` 找不到；`/cart`、`/orders` 不 render `MaterialDetailPage` |
| `critical-acceptance.spec.ts` checkout promo | 2 | 既有 `DX-01` 第 3 群 | 同 §9 已記錄的 cart subtotal 根因 |
| `admin-operations.spec.ts:724` | 1（僅 mobile） | 既有 `DX-01` 第 4 群 | 單獨重跑 **1/1 passed** → 4-worker 併行下的 race，非回歸。**IA 成果未受影響** |
| `payment-proof-security.spec.ts` 3 支 | 6 | **環境不合格，未能取得有效結果** | 該 spec 需要指向 `teaching_platform_security_test` 的 Backend ＋ `TEST_ADMIN_*`；本輪環境**兩者皆不符**：3000 上的 Backend 由另一個 session 於 08-23 16:03 啟動，而 `Backend/index.js` 在 08-24 01:16（**本輪執行期間**，非本 session 所改）又被改過 —— 執行中的程序早於現行原始碼；本 session 的 shell 也沒有 `TEST_ADMIN_*`。spec 的 `beforeEach` 只在 backend **不可達**時 skip，因此它照跑並失敗而不是 skip。**本輪不宣稱這 6 支為綠，也不宣稱為回歸** —— `BUY-01` 未觸及任何 backend、憑證或 `/uploads` 程式碼 |

### 2026-08-23（`COR-01` 輪次）新增

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `COR-02` | `P2` | Buyer / Payment | 買家訂單詳情的 payload 帶著內部備註 | `note = 'superseded by approved proof'` 是**寫給營運看的**內部字串，不是給買家的退件理由；它現在會出現在買家自己的 API 回應裡。只要日後有人在 `approved` 分支渲染 `payment_proof_rejected_note`，買家就會直接看到它 | `Backend/routes/admin.js:257-262`（approve 時把其餘 pending 憑證寫成該 note）＋ `Backend/services/buyerOrders.service.js` 的 `payment_proof_rejected_note` 取最新一筆 rejected 憑證的 `note`。買家 UI 目前在 `approved` 分支不渲染 → **只是 payload 洩漏，尚未顯示** **2026-08-24（本項修復輪次）採用選項 (b) 並記錄不採用 (a) 的理由。** 實測兩個 DB 各有 **3 筆** `note = 'superseded by approved proof'` 的憑證，確認外洩為真。**(a) 被排除的硬證據：** `review_status = 'rejected'` 但 `rejection_reason IS NULL` 的憑證在 dev DB 有 **42** 筆、security test DB 有 **63** 筆（legacy 退件資料早於 reason code 導入），因此「`rejection_reason` 為 NULL」**無法**當成 supersede 的結構化標記 —— 走 (a) 必須新增欄位＋migration。(b) 則直接關掉整類外洩（不只 supersede 這一串）且無 schema 變更。 | 無 | 二擇一並記錄：(a) supersede 改用結構化欄位而不是佔用買家可見的 `note`，或 (b) buyer payload 在 `order_progress_state !== 'rejected'` 時不回退件備註 | **DONE**（2026-08-24，採用 (b)）—— 見〈`COR-02` ＋ `COR-03` 完成紀錄〉 | 無 —— **`COR-01` 輪次新發現** |
| `COR-04` | `P3` | Buyer / UI | 買家可見文案仍以「家長」當角色稱呼 | CLAUDE.md §2 與 `docs/ui-role-naming-checklist.md` 明訂 UI 不得用「家長」當主要稱呼（canonical 是「購買者」），但買家動線上仍有面對使用者的字串在這麼寫。這不是美化問題 —— 它是**對既有成文規則的違反**，且會被新程式碼照抄 | `2026-08-24`（`BUY-01` 輪次順帶觀察到）：`components/materials/MaterialDetailPage.tsx:120` 「請先以**家長**帳號登入後再加入購物車」（加入購物車失敗提示）；`components/reviews/ReviewItem.tsx:26` `parent: "家長"`（回饋列的角色徽章）；`lib/api-repository.ts:63` `userName: "家長"`。另有兩處屬**受眾描述**而非角色標籤（`app/register/page.tsx:217`、`components/parent/ParentHomePage.tsx:99`），需先判定是否在規則範圍內 **2026-08-24（本項修復輪次）以最新 repo-wide inventory 重新取證，未沿用舊行號。** 三處角色標籤全部收斂：加入購物車失敗提示改「請先以**購買者**帳號登入後再加入購物車。」（與 `BUY-01` 既有的檢舉提示逐字平行）；`ReviewItem` 的 `roleLabelMap.parent` 由「家長」改「購買者」；`api-repository.ts` 的 `userName: "家長"` **不改成另一個角色名，而是不再捏造身分**（`userName: ""` ＋ 兩個買家 surface 改 `showAuthorName={false}`）—— 這是 repo 內既有的 canonical 做法，`components/admin/MaterialFeedbackContext.tsx` 早已寫明「API 沒有作者身分，任何稱呼都是編造的」。**兩處受眾描述逐一判定：** `register/page.tsx:217` **保留**（checklist 的 Allowed Exception 明文允許 Register 補充說明列舉族群）；`ParentHomePage.tsx:99` 與 reconciliation 補記的 `me/materials/:id/feedback/page.tsx` **修**（兩者列舉的是**買家族群**而非教材受眾，違反 checklist 的「保持平台可擴展：文案不可暗示購買者只可能是家長」）。另修兩處**過期且違規的 canonical 文件**：`materials-detail-spec.md` §12 與 MVP spec §7 仍把詳情頁回饋區寫成「教師與家長回饋」，實作早已是「教學回饋」。 | 無 | 三處角色標籤改用 canonical 稱呼；兩處受眾描述先判定範圍再決定去留。`BUY-01` 本輪新增的 `MaterialReportDialog.tsx` 已直接使用「購買者」 | **DONE**（2026-08-24）—— 見〈`COR-04` 完成紀錄〉 | 有（`docs/ui-role-naming-checklist.md`） |
| `COR-03` | `P2` | Buyer / UI | legacy `cancelled` 訂單的徽章顯示「待付款」 | 同一張已取消的訂單，卡片徽章說「待付款」、分頁卻把它歸在「歷史訂單」，兩者互相矛盾；`cancelled` 是 read-only legacy 列，沒有付款動作可做 | `Backend/services/buyerOrders.service.js` 的 `ELSE 'pending'`（`cancelled` 且無憑證時落此分支）＋ `frontend/apps/web/app/orders/page.tsx:54` `if (p === "pending") return "待付款"`；dev DB 有 **2** 筆 `status = 'cancelled'` 的訂單 **2026-08-24（本項修復輪次）產品處置拍板：`cancelled` 是 read-only 終態，沒有任何付款動作，因此它是買家進度的一個值，而不是「沒有進度」。** 修在 canonical 的 `order_progress_state`（新增 `cancelled` 並**先於憑證判斷短路**），不是在前端補一個 `orders.status === 'cancelled'` 判斷 —— 後者會把徽章的來源又拆回兩個，正好推翻 `COR-01` 的收斂。實測兩個 DB 各 **2 筆** `cancelled` 訂單，修復後 `order_progress_state` 皆為 `cancelled`。**未動 `orders_status_check`、未做 legacy status cleanup**（仍在 scope 外）。 | 需先確認 legacy status 的產品處置 | 徽章顯示「已取消」，且不出現任何付款 CTA（CTA 端已由 `COR-01` 擋掉：非 `pending_payment` 一律不給） | **DONE**（2026-08-24） | 無 —— **`COR-01` 輪次新發現**；`orders_status_check` / legacy status cleanup 明確在 `COR-01` scope 外，故只記錄不修 |

### 2026-08-24（settled-tree reconciliation 輪次）新增

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `COR-05` | `P3` | Backend / Input handling | path 參數含 NUL byte（`%00`）時回 **500** 而不是 404 | 未授權端點上由攻擊者完全控制的輸入會走到 Postgres 並拋錯：對外是通用 500（**無資料外洩**），對內是每次都印一份 stack trace，可被拿來灌 log。它同時讓「真的壞了」與「餵了怪字元」在監控上長得一樣 | `2026-08-24` settled tree，對 isolated backend（`PORT=3001` ＋ `teaching_platform_security_test`）的實測：`/materials/media/%00` → **500**，backend log 為 PG `code: '22021'`（`report_invalid_encoding`）。**同一行為在 committed code 上就存在，屬 repo-wide 而非 `SEC-02` 回歸** —— `/materials/%00`、`/materials/%00/reviews`、`/materials/%00/rating` 皆同樣回 500。對照組：`/materials/media/../../etc/passwd` 與 `%2e%2e%2f…` 回 **404**、`/materials/media/100%` 回 **400**（Express malformed-URI）、未知 UUID 回 **404** —— 也就是**只有** NUL byte 這一條沒被擋下 **2026-08-24（本項修復輪次）先在 isolated backend 重現，並發現受影響面比原記錄更廣。** 原 evidence 記 4 條，實測是 **5 條匿名可觸發**（多一條 `/materials/:id/rating-distribution`）；另外**通過 auth 之後**同樣會倒的至少有 `/materials/:id/reports`、`/download/:materialId`、`/me/orders/:orderId`、`/admin/report-cases/:id`。五處 handler 的 log 全部是 `22021 invalid byte sequence for encoding "UTF8": 0x00`。**識別碼契約覆核（決定修法的關鍵）：** `materials.id` 與 `material_media_files.id` 都是 `text`，值形如 `mat_mt4n1tppwgtnpe` —— **不是 UUID**，沒有可驗證的格式，任何字串都是合法查詢輸入。因此正確的邊界是「拒收 PostgreSQL `text` 裝不下的 NUL byte」，而不是發明格式限制。 | 無 | 在 path 參數進入查詢前拒收含 NUL byte 的值（400 或 404，擇一並記錄），且**不得**只在素材端點修 —— 四條路徑共用同一個缺口 | **DONE**（2026-08-24，選 **400**）—— 見〈`COR-05` 完成紀錄〉 | 無 —— **2026-08-24 settled-tree reconciliation 輪次新發現** |
| `COR-07` | `P2` | Backend / Security | 壞掉的 percent-encoding 會回 Express 預設錯誤頁，**body 內含完整 stack trace 與絕對檔案路徑** | 這是**未授權即可觸發**的資訊外洩：回應直接吐出伺服器上的絕對路徑與相依套件版本，等於免費給攻擊者一份環境指紋。它與 `COR-05` 是**不同的輸入類別**（`COR-05` 是 NUL byte 走到 PG；這一條在 Express 的 router 解碼階段就炸了，從未進到任何 handler），所以修好 `COR-05` **不會**連帶修掉它 | `2026-08-24`（`COR-05` 輪次的 security probe 發現）：對 isolated backend 匿名 `GET /materials/100%` 與 `GET /materials/%C0%80` → **400**，但 body 是 `text/html` 的 Express 預設錯誤頁，內含 `URIError: Failed to decode param '100%'` 加上完整 stack，逐行帶著 `C:\teaching-platform\Backend\node_modules\router\lib\layer.js:225:12` 這類絕對路徑。同一份 stack 也會印進伺服器 log。**成因是 `NODE_ENV` 未設定** —— Express 的 `finalhandler` 只在 非 production 時把 stack 放進 body；repo 目前**沒有任何部署設定**（見 `PRE-01`），因此「上線時會不會記得設 `NODE_ENV=production`」目前沒有任何保障 | 與 `PRE-01` 的部署決策相關，但**不阻塞**：加一個 error handler 不需要等平台拍板 **2026-08-24（本項修復輪次）重現並確認範圍比原記錄更廣，共三種輸入落在同一個 root cause：** （1）解不開的 percent-encoding（`100%`／`%ZZ`／`%C0%80`／不完整多位元組序列）→ HTML ＋ `URIError` ＋ **9 條絕對路徑**；（2）**壞掉的 JSON body** → HTML ＋ `SyntaxError` stack（原記錄未涵蓋）；（3）比對不到 route → `Cannot GET /x` HTML（無 stack，但同樣不符 JSON 契約）。三者共用同一個成因：**app 沒有註冊任何 terminal handler**，全部落到 Express 的 `finalhandler`。**`NODE_ENV=production` 不足以收斂（已實測）：** 同一棵樹以 `NODE_ENV=production` 起在 `PORT=3002`，body 確實不再帶 stack，但**仍是 `text/html`**（`<pre>Bad Request</pre>`）—— 環境變數只擋掉外洩，沒有滿足「API 一律 JSON」，而且它是沒有保障的設定。 | 與 `PRE-01` 的部署決策相關，但**不阻塞**：加一個 error handler 不需要等平台拍板 | 壞掉的 percent-encoding 回既有的 JSON error contract（不得是 HTML），body 不得含 stack、絕對路徑或套件版本；且**不得**靠「記得設 `NODE_ENV`」當作唯一防線 | **DONE**（2026-08-24）—— 見〈`COR-07` 完成紀錄〉 | 無 |
| `COR-06` | `P3` | Frontend / A11y | 非 Admin 路由的外殼與頁面**各渲染一個 `<main>`**，同一份文件出現兩個 main landmark | HTML 規範只允許一個非 hidden 的 `main`；巢狀 `main` 會讓螢幕閱讀器的 landmark 導覽出現重複目標，也讓任何 landmark-based 的選取（測試與輔助技術同理）必須靠 `.first()` 迴避 —— `DX-01` 第 1、2 群的 strict-mode 失敗就是這個結構直接造成的 | `2026-08-24`（`DX-01` 輪次，隔離 production build 實測）：`components/layout/RoleShell.tsx:370` 的 `<main className="min-h-dvh">{children}</main>` 與 `components/dashboard/ParentAppShell.tsx:131` 的 `<main>` 會外包住頁面自己的 `main`（`app/materials/page.tsx:105`、`app/materials/[id]/reviews/page.tsx:66`、`app/cart/page.tsx:106`、`app/checkout/page.tsx:227` 等）。Playwright 錯誤逐字：`strict mode violation: locator('main') resolved to 2 elements` —— desktop 於 `/materials`、mobile 於 `/materials/:id/reviews`。`components/admin/AdminShell.tsx:61` 因 `RoleShell` 對 `/admin` 直接 `return <>{children}</>` 而**不受影響** **2026-08-24（本項修復輪次）repo-wide 盤點後發現缺陷有兩個方向，不只重複：** 全 repo 共 15 個 `<main>`，3 個在外殼（`RoleShell` / `ParentAppShell` / `AdminShell`）、12 個在 page component，而**每一個 page-level `<main>` 都被外殼的 `<main>` 包住** → 12 條路由各有 2 個。**反方向**：`/login` 與 `/register` 因為 `RoleShell` 對 auth 頁 early return，而頁面自己也沒有 `<main>`，是 **0 個** landmark（原記錄未涵蓋）。決定 ownership 的關鍵數據：**36 條路由沒有 page-level `<main>`**（Admin 16／Creator 6／Teacher 6／`(parent)` group 2，加上 `/downloads`、`/favorites`、`/me/materials`、`/me/orders`、`/my-reviews`、`/materials/[id]`、`/orders/[orderId]/upload-proof`、`/login`、`/register`）—— repo 現況本來就是「外殼擁有」，因此選 Option A（外殼擁有、頁面改用 `<div>`）只需改 12 個檔案；選 Option B 得為 36 個檔案補 `<main>`。 | 無 | 外層改為非 landmark 容器（或由頁面端移除自己的 `main`），使每個路由只有一個 `main`；`public.spec.ts`／`parent.spec.ts` 的 `.first()` 迴避可隨之移除 | **DONE**（2026-08-24）—— 見〈`COR-06` 完成紀錄〉 | 無 |

---

## 6. Pre-production

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PRE-01` | `PRE-PROD` | Infra | Production 儲存後端決策（Object Storage driver） | local driver 在 ephemeral filesystem 上會**把已售出的教材與付款憑證一起刪掉**，且無法察覺 | `Backend/config/privateFileStorage.js:114-118` 只實作 `local`，其餘 driver 明確 throw；`:137-141` production + local 時 fail-closed 拒絕啟動（除非明示 opt-in 持久化磁碟） | **部署環境決定** | 決定 production 是持久化磁碟還是物件儲存；若後者，實作 s3/r2 driver ＋ `createSignedUrl()` | **OWNER DECISION LOCKED — Render**（2026-08-31，`DEC-13`）—— **但 implementation 尚未開始。**已拍板架構：Frontend／Backend 各一個 Render Web Service（Backend **單一 instance**）、Render Managed PostgreSQL、Render Persistent Disk 掛載於 `PRIVATE_FILE_STORAGE_PATH`、driver 維持 `local` ＋ `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true`；**物件儲存明確不屬於 MVP**（S3／R2 維持 post-MVP，本項的原始 Completion Criteria 中「若後者，實作 s3/r2 driver」一支**已由 Owner 決定不走**）。後續實作已拆為 `PRE-07`（部署設定）／`PRE-08`（儲存與備份還原）／`PRE-09`（環境變數契約）／`PRE-11`（provisioning 與首次發布），全部 **NOT STARTED**。選項比較與供應商研究見 `docs/owner-decision-round-3-provider-selection-2026-08-31.md`；架構方向見 `docs/owner-decision-packet-2026-08-31.md` §1。**【2026-08-31 第二次更新 —— `DEC-16` / `DEC-17`（Round 7）】** Owner 改採 **NT$0 MVP 部署目標**，本列原本被標為「Owner 決定不走」的那一支 —— **「若後者，實作 s3/r2 driver」—— 現已成為採用的路徑**。`DEC-13` 的「物件儲存不屬於 MVP」已撤回。**driver 已於同輪實作完成**（`PRE-13`，見本表該列）：`Backend/storage/s3PrivateFileStorage.js`，generic S3-compatible，**不綁定供應商**；`createSignedUrl()` **刻意未實作**，交付仍走 backend streaming，§7 的三個授權模型完全未動。供應商 ＝ **Backblaze B2**（不需信用卡），fallback ＝ **Cloudflare R2**（env-only 切換）。**本列的 `PRE-PROD` 決策部分至此關閉**；剩餘工作在 `PRE-07`／`PRE-08`／`PRE-11`。 **本輪未部署、未建立任何 bucket、未綁卡。** 三項補充實測：(1) **必須持久化的只有兩樣** —— PostgreSQL 與 `private-storage/`（實測 1,073 檔／5.7 MB）；整個 Backend 的檔案系統寫入點只有兩處，皆在 `LocalPrivateFileStorage` 內（`storage/privateFileStorage.js:121,168`），無 log 落檔、無 temp 依賴，且 `Backend/uploads/` 實測 **0 檔**、不需持久化。(2) **掛載持久化 volume 是零程式碼改動的選項**（只需 `PRIVATE_FILE_STORAGE_PATH` ＋ `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true`）；物件儲存則**完全未實作** —— `createSignedUrl` 在整個 repo 只出現在註解，且無任何 S3／R2 SDK 依賴。(3) **production 主機名必須在第一筆素材上傳前定案** —— `services/materialMedia.service.js:90` 把含 host 的**絕對 URL** 寫進 `cover_image_url` 等欄位，之後換 host 會讓既有素材的圖失效。另：O-20（Privacy §5.4 受託處理者揭露）在等本項。 | 有（抽象層已預留擴充點） |
| `PRE-02` | `PRE-PROD` | Payment / Infra | `SEC-01` 的 legacy 搬移必須在 production 資料上執行 | 搬移腳本是一次性資料遷移，dev 跑過不等於 production 跑過 | `SEC-01` 缺口 #1/#2 | `SEC-01`、`PRE-01` | production 部署後執行並驗證 checksum；`legacy_public` 歸零 | **TODO — 已由 `DEC-15` 簡化為驗證性工作**（2026-08-31）。production 從**全新資料庫**開始，因此不存在任何 legacy 憑證列可搬移，`legacy_public` **由建構上即為 0**；本項退化為「部署後確認該值確實為 0」的一次性查核，**不再是資料遷移**。（附帶實測：兩個既有資料庫的 `manual_payment_proofs.storage_status` 亦已無 `legacy_public`，dev 為 79 `legacy_external` ＋ 17 `private`，test 為 79 ＋ 351 —— `legacy_external` 屬不同類別，不在本項射程。）Dependency 中的 `PRE-01` 已於 2026-08-31 拍板（`DEC-13` Render） | 隨 `SEC-01` |
| `PRE-03` | `PRE-PROD` | Payment / Legal | **平台交易地位定性 → 第三方支付洗錢防制「服務能量登錄」** | 現行金流是「買家匯款到平台帳戶 → 平台審核 → 平台撥款給創作者」＝**代理收付網路實質交易款項**。《提供第三方支付服務之事業或人員洗錢防制及服務能量登錄辦法》(`J0080063`)：**未完成登錄者不得提供第三方支付服務**，違者 2 年以下有期徒刑或併科 500 萬元以下罰金。**登錄本身沒有金額 de minimis。** 這不是條文撰寫問題，是牌照問題，`P1-09` 的文件補齊也不會解決它 | `docs/p1-09-legal-compliance-verification-2026-08-26.md` §3 `M1`（法源全文已查證）；金流模式見 `docs/mvp_rules.md` §12.4 憑證審核流程與 `Backend/services/orderService.js` | **產品／法務決策**：平台是「出賣人」還是「居間／代收代付」？前者不落入本辦法，後者須登錄。**產品端已於 2026-08-26 傾向 Phase 1 採 Platform-as-Seller**（見下方第二輪排查） | **封版條件已具體化為 6 項**（見 `docs/pre-03-platform-seller-model-verification-2026-08-26.md` §6）：律師確認五項要件成立且六個紅旗未出現／再授權條款滿足著作權法 §37／會計師確認所得定性與扣繳／確認不被認定代銷／稅籍與統一發票核定結果／產品端確認 `N1` 的審核能力已納入規格。若最終仍為代收代付，則須完成能量登錄並建立 KYC、疑似交易申報、紀錄保存 5 年之流程 | **READY FOR EXTERNAL REVIEW**（2026-08-30）—— **仍為外部待決，未 DONE。**<br>**已完成（工程端可做的部分至此用盡）：** (1) **事實盤點完成** —— 交易鏈八個面向（商品與創作者／訂單／金流／履約／退款／創作者款項／發票稅務／爭議處理）逐項標記 `FACT` 或 `UNKNOWN` 並附 source file 與 code path；(2) **會同判定 packet 完成** —— 彙整於 `docs/legal-drafts/review-handoff.md` §4.1，含跨律師／會計師的**單一判定矩陣**（9 個 Issue × Legal／Accounting 提問 × 影響範圍，**Final Answer 全部留白**）、**白話版問題組 `Q-A`～`Q-H`**（一題一判定）與**單一回覆模板**；(3) **既有委託書未重寫** —— 逐題內容仍以 2026-08-26 的 lawyer（702 行）／accountant（474 行）validation package 為準，§4.1 只補它們沒有的三樣東西。<br>**✅ Freshness reconciliation completed（2026-08-30）—— packet 的事實基準日現為 2026-08-30。**<br>四項 delta 已逐一從最新 repo 證據複驗並**正式回寫**證據附錄（`docs/pre-03-validation-evidence-appendix-2026-08-26.md`）：`INV-2`（授權撤銷能力）與 `EVD-1`（退款能力）標為 superseded 並附 Freshness update；`EVD-5` 標為**部分** superseded —— **capability exists ≠ document published**（四條 route ＋ registry ＋ 生命週期 API 已存在，但**尚無任何已發布之條文**）；消費申訴／爭議處理流程新增為 **`EVD-11`**（`INV-5` 已為 `p1-09-execution-plan` 佔用，故取 `EVD` 序列）。**原始 2026-08-26 文字全部保留、既有編號未重排**（避免破壞兩份 validation package 的 cross-reference）。<br>**Cross-reference 同步：** 兩份 package 的 evidence 摘要列（`L-E` / `T-E`）與「平台不具備之能力」表（`B-6` / `B-5`）已做**事實更正**；`Q-01`～`Q-20`、`Q-06`～`Q-13`、Requested Written Conclusions、§4.1-C/D/E 的所有作答欄位**一律未動**。<br>**✅ 能力表 re-baseline 已於 2026-08-30 完成（第二階段）：** 律師 `B-6`（7 列）與會計師 `B-5`（6 列）**每一列**皆重新從 repo 深度驗證並標上分類 —— `[CURRENT]` 4 列（撤銷單一買家存取權、帳號凍結、消費申訴案件管理、結構化匯款辨識欄位）／`[PARTIAL]` 6 列（退款 ×2、版本化同意證據、銀行實際入帳時間 ×2、法律文件頁面）／`[NOT EXIST]` 3 列（payout ledger、創作者稅務資料、發票開立）。**已無 `[需 re-baseline]` 或 UNKNOWN 列。** 每個 `[PARTIAL]` 都寫明 **capability 與 wiring 的區別**：同意紀錄的表與 `recordConsent()` 齊備，但**唯一 caller 是測試**，註冊／結帳／創作者聲明／re-consent 四條流程皆未呼叫，因此**目前無任何實際同意紀錄**；`orders.payment_received_at` 的 schema 語意確為「銀行實際入帳時間」且稅務憑證時點依此，但**寫入路徑唯一且由 Admin 人工填入**，無銀行 API 對帳、歷史列一律 NULL；帳號凍結經確認為**真正的 backend enforcement**（`requireActiveAccount` 回 403 `account_frozen`，套用於 4 個 route 檔，`complaints.js` 刻意豁免），非僅 UI；`reported_*` 四欄位為**買家申報值而非平台查證事實**，無自動對帳。<br>**Requested Conclusions guard：** 兩份 package 的 `Q-01`～`Q-20`、`Q-06`～`Q-13`、`L-F`、`T-F` 經 diff 確認**逐字未變**；差異全部侷限於 `B-6` / `B-5` 區段。<br>**下一個實際動作是「把 packet 寄給外部審閱者」，不是繼續 repo engineering。**<br>**另更正一項本人先前寫入的錯誤事實：** `review-handoff.md` §4.1-B 原寫「`order_items` 無 seller 欄位」，實則 `db/db_schema.sql:339` 有 `seller_id TEXT REFERENCES users(id)`（附錄 `INV-1` 早已記載為早期 Marketplace 設計之遺留）。已更正。<br>**複驗仍成立：** `EVD-6`（發票欄位存在、無開立流程）、`EVD-7`（無 payout／settlement／創作者稅務資料）、**無任何抽成或手續費實作**。<br>**四份 legal draft 未發現與現況矛盾**（Terms §9.4 已引用 `entitlement_status` 四狀態、Refund §8.1、Creator §7.3），因此**無 `REVIEW ISSUE` 需記錄**；落後的只有證據附錄。<br>**等候：律師 ＋ 會計師之會同判定。** 封版條件仍為 `docs/pre-03-platform-seller-model-verification-2026-08-26.md` §6 的 6 項。**本輪未做任何法律或稅務結論，未定稿任何 draft，未指派 version／effective_date，未發布，未啟動 Gate 5。** | 無 |

| `PRE-04` | `PRE-PROD` | Material / Consumer | **已售出教材的檔案版本會在買家不知情下被替換，且無揭露、無通知、無版本紀錄** | Buyer entitlement **綁教材不綁版本**，因此 Admin 核准新版後，既有買家的下載目標會靜默切換到新檔。在 Marketplace 模式下這偏向 Creator 的問題；**在 Platform-as-Seller 下，是「賣家把已售商品換掉」** —— 直接碰到網路交易定型化契約**應記載事項第三點**（商品交易頁面呈現之名稱、價格、內容、規格等**為契約之一部分**）與**不得記載事項第三點**（不得片面變更商品規格且消費者不得異議），以及消保法 §22 廣告義務不得低於廣告內容。**問題不在「不該更新」**（更新通常對買家有利），而在**沒有揭露、沒有通知、且訂單沒有記錄當初是以哪個版本履約** | `docs/material-file-storage-and-delivery.md` §17 情境 D：「Buyer1 之後下載 **B.pdf**（entitlement 綁教材，取得最新已核准版本）」；同檔 §23 對照表「未來版本化」仍為未具備；`docs/p1-09-v1.2-review-2026-08-26.md` §4.1 `MAND-03`／§4.2 `R3` | `PRE-03`（Platform-as-Seller 使其由 Creator 問題升級為平台問題） | 最小修法：(1) 商品頁**事前揭露**更新政策（一經揭露即為契約之一部分，就不是片面變更）；(2) 訂單記錄**履約版本**；(3) 版本更新時通知既有買家。三者皆完成，或由律師確認 (1) 單獨足夠 | TODO | 有（`material_files` 已有 `superseded` 狀態，版本資料存在，只是未對買家揭露） |

> **`PRE-04` 為 2026-08-26 第三輪審查新增**，是本輪唯一「repo 內有證據、且兩份外部草案（v1.2 與其審查回覆）都沒提到」的項目。
> 它不是條款撰寫問題 —— 條款怎麼寫都不能讓「靜默換掉已售商品」變成合法。

> **`PRE-03` 是本輪（2026-08-26）法規查證新增，且它是 `P1-09` 的上位問題。**
> 「平台是不是出賣人」同時決定 `PRE-03` 是否成立、統一發票由誰開、
> 以及服務條款／創作者條款／購買規則三份文件的當事人結構。
> 詳見 `docs/p1-09-legal-compliance-verification-2026-08-26.md` §5.0。

> **第二輪排查（2026-08-26，同日）：產品端提出 Phase 1 採「Platform-as-Seller」
> —— Creator 授權平台，平台以自己名義向買家販售。**
> 完整報告：`docs/pre-03-platform-seller-model-verification-2026-08-26.md`。
>
> - **金流定性：在定義層面確實不落入「代理收付實質交易款項」**
>   （電支條例 §3 的第三要素「將**該實質交易之款項**移轉予**收款方**」被打斷）。
>   但屬**實質認定**，需同時滿足五項要件（自己名義締約／實質定價權／自負盈虧／
>   款項進自有資金不設專戶／報酬非「扣佣後餘額」），
>   且有**六個常見產品設計會把定性拉回去** —— 其中「給 Creator 錢包餘額 ＋ 自主提領」
>   還可能另外碰到電支條例的**收受儲值款項**。
> - **但這是風險換位，不是風險消除。** 新增 5 項風險，最嚴重的是
>   **著作權避風港對「販售與交付」這一段失效**：§90-7 保護的是
>   「對其**使用者**侵害著作權之行為」不負賠償責任，
>   Seller 模式下向買家重製／公開傳輸的是**平台自己**，不在保護範圍。
>   → `materials.ip_declaration_accepted` 只證明「有勾」，**不證明平台盡了注意義務**；
>   這一項**不能用 checkbox 解決**，需要可留存的審核紀錄。
> - 其餘 4 項：著作權法 §37 III **再授權須明文取得**（且 §37 I 約定不明推定未授權）；
>   消保法 §7／§8／§22 責任全落平台（含**廣告真實義務**）；
>   營業稅可能被認定**代銷**（§3 III 5 於勞務準用）＋ Creator 報酬若寫成「權利金」
>   會**失去所得稅法 §4 I 23 的 18 萬免稅額**；定型化契約與七日解除權義務全面適用。
>
> **`PRE-03` 的封版條件已於該報告 §6 具體化為 6 項**，在全部完成前不得標為 DONE。

> **`PRE-01` 目前不是 P1。** repository **沒有任何部署設定**
> —— 無 Dockerfile、無 `.github/`（CI 目錄不存在）、無 vercel / fly / railway / render / Procfile 設定。
> 也就是說 production 環境**尚未決定**，沒有「環境是 ephemeral」的證據可以把它升級為 blocker。
> **若**日後選定的平台是 ephemeral filesystem（Heroku 型、預設的容器 PaaS），
> 它會**立刻變成 pre-production blocker**，因為 fail-closed 檢查會讓 Backend 直接拒絕啟動。

---

## 7. Future Product Capabilities

**不是目前的缺陷。不要因為功能大就排高 priority。**

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FUT-P1` | `FUTURE` | Material | Published Material File Update Review | 已上架教材要換檔時，目前**一律禁止**；長期需要「提案 v2 → 買家仍拿 v1 → Admin 核准 → 買家拿 v2」 | `Backend/utils/materialFilePolicy.js` 與 `mvp_rules.md` §21A.4：`published` / `pending_review` 換檔一律 409 | 無 | 狀態機新增轉移；資料模型（`pending_file_id`）已預留 | FUTURE | 部分（資料模型已備） |
| `FUT-P2` | `FUTURE` | Payment / Compliance | Payment Proof Retention Policy | 憑證含金融資訊，長期保存需要明確的保存期限與刪除政策 | `SEC-01` 只處理「存在哪裡、誰能看」，**不含**保存期限 | `SEC-01` | **需要產品／法務／營運確認保存期限與刪除政策。**（本檔不預設任何年限） | FUTURE | 無 |
| `FUT-P3` | `FUTURE` | Review | Review Moderation ＋ Quality Monitoring Dashboard | Admin 目前只能看 review，不能介入；也沒有全平台品質視圖 | §11 F-1 / F-2 / F-3（`review` 表無 status / hidden / flagged 欄位） | `IA-01` 先確認 contextualize 是否已足夠 | 決定是否真的需要 moderation；若要，用 nullable `hidden_at` + `hidden_by` 並同步決定評分計算口徑 | FUTURE | 有（§11 F-1~F-4） |
| `FUT-P4` | `FUTURE` | Material | Advanced Material Review | 多人審核、assignment、SLA、申訴、comment thread、版本 diff、AI 預審、審核品質分析 | `docs/material-review-workflow.md` §15 升級路徑 | 無 | —— | FUTURE | 有（升級路徑已寫） |
| `FUT-P5` | `FUTURE` | Material | 多檔交付（Multiple Deliverable Files） | 目前一份教材一個交付檔（多檔請打包 ZIP） | `material_files` 結構可擴充，但 UI 與 entitlement 語意未定 | 無 | —— | FUTURE | 部分 |
| `FUT-P6` | `FUTURE` | Users / Reports | 帳號狀態與停權（含 `suspend_user` 處置） | `users` 沒有 status 欄位，因此檢舉處置 allowlist 刻意不含停權 | §11 R-3 / U-3 | 需先定義 `users.status` 狀態機與連動規則 | 定義狀態機後才把 `suspend_user` 加進 `REPORT_RESOLUTIONS` | FUTURE (BLOCKED) | 有（§11 R-3） |
| `FUT-P7` | `FUTURE` | Buyer / Material | 已購買的買家看不到**已下架**教材的封面 | `SEC-02` 的授權矩陣只認 `published` ／ 教材擁有者 ／ Admin，買家不在其中。教材被下架後，`/downloads`、`/checkout` 等頁面的封面會退回底色 | `Backend/services/materialMedia.service.js` 的 `resolveForAccess`；`app/downloads/page.tsx:189`、`app/checkout/page.tsx:354`；買家 UI 皆有底色 fallback，因此是**顯示降級不是錯誤** | `SEC-02` | **需要產品決策**：要不要為「已購買」開一條例外。若要，授權矩陣需加入 entitlement 判斷（`docs/mvp_rules.md` §3.1 一併更新）。若不要，正式記錄「平台下架的教材不再供應其行銷素材」為預期行為 | TODO | 有（`docs/mvp_rules.md` §3.1「已知限制」）—— **`SEC-02` 輪次新發現，刻意未處理** |

---

## 8. Future Technical Hardening

**不是 MVP blocker。**

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FUT-T1` | `FUTURE` | Infra / Security | Antivirus / Malware scanning | 平台接受使用者上傳的檔案 | `material-file-storage-and-delivery.md` §8.2 刻意未做 | `PRE-01` | 要不要掃、誰負責、掃描失敗如何處理 | FUTURE | 無 |
| `FUT-T2` | `FUTURE` | Material | Inline Preview（PDF.js / iframe） | 現況只能下載 | 同上 | `FUT-T1`（掃描政策） | 需另評 CSP | FUTURE | 無 |
| `FUT-T3` | `FUTURE` | Infra | Resumable upload ＋ CDN | 100 MB 上限下單次上傳失敗成本高 | 同上 | `PRE-01` | —— | FUTURE | 無 |
| `FUT-T4` | `FUTURE` | Material | 歷史版本 UI ＋ 完整檔案撤銷流程 | 資料模型支援多版本，但沒有 UI 也沒有撤銷 workflow | `material_files` 保留歷史列 | `FUT-P1` | —— | FUTURE | 部分 |
| `FUT-T5` | `FUTURE` | Admin | `/admin/reviews-hub` 的 61 請求 N+1 | 全站唯一還存在的 N+1 | `app/admin/reviews-hub/page.tsx:66,74-76` | ~~`IA-01`~~ —— `IA-01` 已完成（2026-08-23）：該頁**已不是主入口**，但 route 保留可直達，所以直接開啟時 61 請求**仍會發生**，此項**沒有自動消失**（只是不在主要路徑上） | 若仍需保留，做 `GET /admin/reviews`（分頁＋篩選） | FUTURE | 有（§11 F-4） |
| `FUT-T6` | `FUTURE` | Reports | deprecated `PATCH /admin/reports/:id` 最終移除 | legacy containment 已完成，只剩移除時程 | `Backend/utils/reportWorkflow.js:90` `LEGACY_TERMINAL_STATUSES`；endpoint 保留並回 `Deprecation: true` | **需先確認無外部 caller** | 確認無 caller 後移除；`reports_status_check` 的 `reviewed` **仍應保留**（歷史資料永久保存） | FUTURE | 有（§11 R-4） |
| `FUT-T7` | `FUTURE` | Infra / Storage | 未認領的行銷素材沒有孤兒清理 | 創作者上傳封面後放棄表單，素材會永久留在私有儲存。**對外不可見**（只有上傳者與 Admin 取得），所以不是安全問題，是磁碟成本 | `material_media_files` 有 `material_id IS NULL` 的部分索引 `idx_material_media_files_unclaimed` 就是為此預留；對照組：教材本體有 `Backend/scripts/cleanup-material-files.js` ＋ `materialFile.service.js` 的 `cleanupOrphans()` | `SEC-02` | 比照 `cleanupOrphans()` 加上 TTL 清理（同時刪 DB 列與私有物件），並確認**已認領的素材永遠不是孤兒** | TODO | 有（`docs/material-file-storage-and-delivery.md` §24.5）—— **`SEC-02` 輪次新發現，刻意未處理** |
| `FUT-T8` | `FUTURE` | Material / Delivery | 未上架教材的試看影片無法串流播放 | `MediaLink` 對受保護的素材走 blob fetch，會把整支影片載進記憶體（上限 80 MB）才能開。只有 Admin 審核與創作者自己會走這條路；**已上架影片不受影響**（匿名可取，普通串流 ＋ `Range`） | `frontend/apps/web/components/materials/MediaImage.tsx` 的 `MediaLink`；根因是 `<video src>` 與 `<img src>` 一樣不會帶 `Authorization` header | `SEC-02` | 加一次性 view token（比照 `material_download_tokens`：DB 保存雜湊、短 TTL、綁 userId + mediaId），讓 `<video>` 能直接串流受保護的素材 | TODO | 有（`docs/material-file-storage-and-delivery.md` §24.5）—— **`SEC-02` 輪次新發現，刻意未處理** |

> **`FUT-T6` 不是 P1。** 正式產品 UI 的 writer 已歸零，它不再產生新債；
> 移除只是清理，且移除前需要外部 caller 的確認。

---

## 9. Developer Experience / Cleanup

| ID | Priority | Area | Task | Why | Evidence | Dependency | Completion Criteria | Status | Existing Spec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DX-01` | `P2` | Testing | Buyer / public E2E 規格與現行 UI 已不同步 | 這些 spec 斷言的文案／結構已不存在於目前的 UI，屬**測試過期**而非產品缺陷；但它們會讓每次完整套件執行都是紅的，久了就沒有人再看套件結果 | **2026-08-23 於 production build 取得新 baseline：275 passed / 17 failed / 26 skipped**（詳見下方分群）。17 個失敗全部與 `SEC-01` 無關，且在 seed 完整的 dev DB 上同樣失敗。**2026-08-23（`IA-01` 輪次）於 dev server 補充：** `critical-acceptance.spec.ts` **32 passed / 4 failed** —— `6) checkout creates order`（desktop）、`6-1) checkout promo`（desktop＋mobile）、`16) journey`（mobile，卡在 `/me/materials` 的「下載教材」）。前三支同屬既有的 cart subtotal = 0 根因；四支全部與 `IA-01` 無關（`app/checkout/page.tsx`、`app/cart/page.tsx`、`app/me/materials/page.tsx` 對 `rating`／`reviews` 的引用數皆為 **0**）。**2026-08-23（reconciliation 輪次）於 production build 重測 `critical-acceptance.spec.ts`：34 passed / 2 failed** —— 只剩 `6-1) checkout promo`（desktop＋mobile），即下表第 3 群；先前 dev server 上的 `6) checkout creates order` 與 `16) journey` 兩支在 production build 上**通過**（屬 dev 冷編譯造成的偽失敗）。兩支殘留失敗與 `IA-01`／`IA-04`／`IA-05` 皆無關：checkout / cart 不 import 任何 attention widget 或 `MaterialFeedbackContext`。**2026-08-24（本項修復輪次）四群逐一取得根因並修復，完整套件回到全綠：364 passed / 0 failed / 30 skipped**（隔離 production 環境：`.next-verify` distDir ＋ `next start` 3011 ＋ isolated backend 3001 ＋ `teaching_platform_security_test`）。**產品程式碼改動 0 檔** —— 四群全部證實為測試端過期，逐群根因見下方〈`DX-01` 完成紀錄〉 | 無 | 逐群決定「修測試」或「刪掉過期斷言」，讓完整套件回到全綠 | **DONE**（2026-08-24） | 有（舊 §7.7） |
| `DX-02` | `P2` | Testing | E2E `TODO(assert)` 斷言未寫滿（**已併入 `DX-03`**） | 情境有、斷言空 | **2026-08-24 重新清點：共 44 處**，分布於 **6** 個檔案（原記錄寫 5 個，漏了 `BUY-01` 新增的 `material-report.spec.ts`）：`admin.spec.ts` 12、`parent.spec.ts` 11、`public.spec.ts` 11、`teacher.spec.ts` 6、`api-proxy.spec.ts` 3、`material-report.spec.ts` 1。**併入的 `DX-03` evidence：** `admin.spec.ts` 有兩處 `TODO(assert)` 引用已於 2026-08-23 移除的 mark-reviewed 按鈕 —— 現行行號為 **376**（`reports mark-reviewed button updates row state`）與 **415**（`mark-reviewed state updates and shows feedback`）；原記錄的 `279,318` 已因檔案增長而過期。這兩處**無法「補齊斷言」**（功能已不存在），只能刪除或改寫 **2026-08-24（本項修復輪次）44 處逐一 disposition，repo-wide 歸零。** 分類結果：**A 真的缺斷言 21**（補上）、**B 已被更強的專屬測試覆蓋 12**（刪 TODO 並指向該測試，不重複測）、**C 產品行為已改、原前提不成立 7**（改寫成現行契約，未補假 UI）、**D 併入的 `DX-03` stale workflow 2**（mark-reviewed 已於 2026-08-23 移除，刪除且**未**還原 legacy UI）、**E 非 acceptance gap 的說明文字 1**、**F fixture 不足 6**（補 mock，未弱化斷言）。 | 無 | 逐檔補齊；其中 mark-reviewed 的兩處改為刪除／改寫（原 `DX-03`） | **DONE**（2026-08-24）—— repo-wide `TODO(assert)` = **0**，完整套件 **440 / 0 / 30**。見〈`DX-02` 完成紀錄〉 | 無 |
| ~~`DX-03`~~ | — | Testing | ~~移除引用已刪功能的 stale 測試註解~~ → **已併入 `DX-02`**（2026-08-24） | 與 `DX-02` 是**同一個東西的子集**：那兩條註解本身就是 `TODO(assert)`，已計入 `DX-02` 的 44 處，且落在同一個檔案（`admin.spec.ts`）、由同一次清理處理。依 §11.4「同一個問題更新既有 ID，不要開近似的新 ID」合併 | evidence（含更新後的行號 376／415）已完整搬入 `DX-02`，未丟失 | — | 見 `DX-02` | **MERGED → `DX-02`** | — |
| `DX-05` | **`DX / Tooling`** | Frontend / Tooling | `npm run verify:web` 因 `typecheck`（`next typegen`）與 `build` 共用同一個 `.next` 而不穩定 | 官方驗收指令本身無法穩定單次通過，會讓「驗收失敗」與「程式真的壞了」無法區分 —— 每一個前端任務都會踩到 | **可獨立重現（不牽涉任何 feature code）：** `rm -rf .next && npx next typegen && npx next build` → 於 `Compiled successfully` 之後倒在 `Collecting page data`。失敗訊息在 `.next` 底下**各次不同**：`EPERM: open .next/trace`、`ENOENT: .next/server/pages-manifest.json`、`Cannot find module .next/server/middleware-manifest.json`，另伴隨 webpack cache `ENOENT: ...0.pack_`。**對照組：** 同一棵樹上 `rm -rf .next && npx next build`（冷 `.next`、**不先跑 typegen**）**exit 0**，產出 `BUILD_ID` 與 36 條 route（2026-08-23 連續 3 次成功）。故非程式缺陷，而是 typegen 先寫入 `.next` 之後 build 再開同一批產物的競態／檔案鎖（Defender real-time protection = True 且無專案例外，為可能放大因子）。**2026-08-23 reconciliation 輪次的反例：** 停掉 3010 的 dev server → `rm -rf frontend/apps/web/.next` → `npm run verify:web` **單次 exit 0**（lint / typecheck / build 三階段一次過，50 條 route）。故本問題為**間歇性**，且與「是否有另一個 process 同時持有同一個 `.next`」高度相關 —— 目前仍未收斂出穩定重現條件。**2026-08-23 final reconciliation 新增一個必然發生（非間歇）的同源案例：`next dev` 與 `next build` 共用同一個 `.next`，兩者的產物版面不相容。** 依 repo 目前的驗收流程（停 dev → 冷 build → 還原 dev）還原 dev server 時，`next dev` 起在 production build 的 `.next` 上，立刻噴 `ENOENT: .next\server\pages-manifest.json` / `app-paths-manifest.json` / `routes-manifest.json` 並對每個請求回 **500**。**危險之處是它會假性通過健康檢查** —— 剛啟動時第一個請求仍打到尚未被覆寫的 production 產物而回 200。正確還原方式是**先 `rm -rf .next` 再起 dev**（實測：清空後起 dev，`/`、`/login`、`/materials` 皆 200，`/admin`、`/admin/activity-logs` 依 middleware 正常 307） **2026-08-24：`DX-09` 已併入本項。** `DX-09`（「驗收 build 需要隔離 distDir，否則會打斷別人的 dev server」）與本項是**同一個 root cause 的兩個症狀** —— `.next` 是一個沒有 per-consumer 隔離的共用可變目錄；且 fix domain 完全重疊，而本欄原本就已寫明「獨立 `distDir` 同時解掉 dev↔build 產物互相汙染的案例」。**併入的 `DX-09` evidence（`SEC-02` 輪次）：** `rm -rf apps/web/.next` 遭 3010 的 dev server 持有而 `Permission denied`；`next.config.ts` 已加上 env-gated `distDir`（`process.env.NEXT_DIST_DIR || ".next"`，**未設環境變數時行為完全不變**）＋ `.gitignore` 的 `/.next-*/`。 **2026-08-24 settled-tree 實測（全程無任何其他 Next process）：**（A）**預設行為未變** —— 未設 `NEXT_DIST_DIR` 時跑 canonical 的 `npm run verify:web`（冷 `.next`）**單次 exit 0**，產物寫入 `.next`，`BUILD_ID=90IJ1iQOgD1Yd-32oTrnp`，50 條 route。（B）**隔離行為成立** —— `NEXT_DIST_DIR=.next-recon2 npm run build:web` exit 0 寫入隔離目錄（`BUILD_ID=S8sk_LdSS-1ehnweAA-sd`，50 route），而 `.next` 的 594 個檔案 path+size manifest 雜湊値**一字不差**（`e840bf7e…`）、`BUILD_ID` 仍為 `90IJ1iQ…` → **零汙染**。 ⚠️ **這不代表本項已修好：**（A）只證明「沒有第二個 process 持有 `.next` 時它會過」，而那正是既有 evidence 已知的條件；（B）只證明機制可用。 | 無 | **`npm run verify:web` 可在乾淨 checkout 上可靠地單次通過**，不需要人工 `rm -rf .next`、不需要重跑。（可行方向：為 build 指定獨立 `distDir`、或讓 `verify:web` 在 build 前自行清理、或加 Defender 例外後重測 —— 擇一驗證即可）。**獨立 `distDir` 同時解掉上述 dev↔build 產物互相汙染的案例**，故優先考慮該方向；在修好之前，任何「停 dev → build → 起 dev」的流程都必須在起 dev 前清掉 `.next` **併入 `DX-09` 後新增一條：**「驗收一律用隔離 `distDir`」要麼寫進 `docs/local-development-and-operations.md` 的標準流程，要麼接成 `verify:web:isolated` script。~~**現況：** `frontend/package.json` 尚無此 script，`verify:web` 仍直接用 `.next` —— 機制已就位，流程未採用。~~ **2026-08-24（本項修復輪次）流程已採用：`verify:web` 本身改為跑在隔離 `distDir` 上，不再新增第二個 script name（因此也不會有 `verify:web` 與 `verify:web:isolated` 誰才是 canonical 的歧義）。** 決定性驗證是在**真的有 dev server 正在跑**的情況下做的：3010 的 `next dev`（pid 13660）全程存活，連續兩次 `npm run verify:web` 皆 **exit 0**，之後 `/`、`/login`、`/materials`、`/register` 仍全部 **200**、`/admin` 仍正確 307，**無 500、無 manifest error**。產物分離有硬證據：`.next` 的 webpack cache 只有 `client-development`／`server-development`／`edge-server-development` 且**始終沒有 `BUILD_ID`**，而 `.next-verify` 是 `*-production` cache ＋ 有 `BUILD_ID`（兩次分別為 `fdksk7NnyA4WDoMDaPxJw`、`RBKhpBTlUoCTrCEWQpDHT`）、50 條 route、`server/app` 65 項對 `.next` 的 4 項。run 2 前後 `.next` 的檔案 manifest 差異**逐條檢查後全部是 dev-only**（`*-development` webpack cache、`trace`、HMR hot-update、依請求編譯出來的 middleware），沒有任何一項是 production 產物。 | 無 | **`npm run verify:web` 可在乾淨 checkout 上可靠地單次通過**，不需要人工 `rm -rf .next`、不需要重跑。（可行方向：為 build 指定獨立 `distDir`、或讓 `verify:web` 在 build 前自行清理、或加 Defender 例外後重測 —— 擇一驗證即可）。**獨立 `distDir` 同時解掉上述 dev↔build 產物互相汙染的案例**，故優先考慮該方向；在修好之前，任何「停 dev → build → 起 dev」的流程都必須在起 dev 前清掉 `.next` **併入 `DX-09` 後新增一條：**「驗收一律用隔離 `distDir`」要麼寫進 `docs/local-development-and-operations.md` 的標準流程，要麼接成 `verify:web:isolated` script。 | **DONE**（2026-08-24）—— 見〈`DX-05` 完成紀錄〉 | 無 —— 含已併入的 `DX-09`（`SEC-02` 輪次新增，2026-08-24 併回） |
| `DX-12` | `ACCEPTED DEBT` | Docs / Backend | `Backend/` 內還有一批**沒有指明文件**的 `§NN` 註解指標 | 與 `DX-11` 同類：讀者看到 `§4`／`§57` 無從得知是哪份文件的第幾節。數量大且分屬不同來源，逐一確認原意的成本遠高於 `DX-11` 單一處，因此獨立成項 | `2026-08-25`（`DX-11` 輪次的 reference-quality sweep）：`Backend/**/*.{js,sql}` 內同一行**未指明任何文件**的 `§NN` 共 **58 處 / 23 個檔案**。**⚠️ 2026-08-25 reconciliation 更正這組數字：實際是 47 處 / 17 個檔案。** 上一輪的 sweep script 內含三個寬鬆程度不同的分類器（分別得到 44／58），我引用了其中一個而未先收斂；本輪以單一定義（同一行未出現 `.md`／`docs/`／`*.test.js` 即算未指明）重測 —— Backend 全部 `§NN` 共 88 處，其中**已指明文件 41 處、未指明 47 處 / 17 檔**。兩個主要家族：(1) **`Epic §N`** 15 處（`routes/admin.js`、`services/admin*.service.js`、`migrations/2026082*.sql` 等）—— 指向「Admin Operations UX Closure Epic」，但 `docs/` 底下**沒有這份文件**（只有 `pending-work-tracker.md` 與 `ui-design-system.md` 提到這個名字）；(2) **測試 fixture 註解的 `§41`／`§49`～`§71`** 共 30 餘處（`creatorSales.db.test.js` 16、`dashboardTrends.db.test.js` 6、`dashboardPeriod.db.test.js` 3 等）—— `docs/` 底下**沒有任何文件**有 §41 或 §49～§71 的章節編號。對照組：同一批檔案裡有指明文件的 `§NN`（如 `mvp_rules.md §19.2`、`material-file-storage-and-delivery.md §23.3`）**全部可解析** 無 | （原）每個家族先確認原始出處是否還存在……→ **2026-08-25 reconciliation 後作廢**：三個家族的目標都無法還原，且沒有一處通過 reference-hygiene stop rule 的第 3 條 | **ACCEPTED DEBT**（2026-08-25）—— 非 actionable，不再追蹤，也**不**開 successor ID。Family A（`Epic §N`，18 處）與 Family B（測試 fixture 的 `§41`／`§49`～`§71`，27 處）目標**皆無法還原**；Family C 兩處中 `api-smoke-test.js:803` 實為 Epic §4 的行內簡寫，`reportingRange.js:127` 的 `§10` 雖然確實指錯（`?from=&to=` 契約在 §15.8），但該檔**檔頭已有** `mvp_rules.md §15` 的正確指標、且註解本身已把規則寫清楚，因此**不會**誤導實作 —— 未通過 stop rule 第 3 條。唯一保留的建議：**若日後因其他理由編輯 `utils/reportingRange.js`，順手把 `:127` 的 `§10` 改成 `§15.8`**（不是任務）。見〈`DX-12` scope reconciliation〉 | 無 |
| `DX-11` | `P3` | Docs / Backend | `adminOrders.service.js` 的 `（見 §22 invariant test）` 指不到任何東西 | 裸寫的 `§22` 沒有指明文件；讀者無從查證這個 partition 不變條件的出處 | `2026-08-25`（`DX-10` 輪次的 runtime reference 盤點）：`Backend/services/adminOrders.service.js:54` 寫「五個 bucket 因此必然是 orders 的一個 partition（見 §22 invariant test）」。三個候選目標都對不上 —— `mvp_rules.md §22` 是「Admin activity log search」（無關）；真正的 partition 不變條件敘述在 **`mvp_rules.md:1347`（§19.2 之內）**；真正的測試是 **`Backend/tests/adminOrdersFilter.db.test.js:359`**，而該檔案自己的編號是 **Case 4**（見該檔 `:17`），不是 22。**⚠️ 2026-08-25 `DX-11` 輪次更正上面這一句：** 逐一列出 `t.test()` 後確認，該檔的 `Case N` 是**測試名稱本身**（`Case 1`…`Case 10`，另有 `Case 9.1`），而 `Case 4 (critical)` 是 **`:247` 的「舊 rejected + 新 pending → pending_review」**；`:359` 的 partition 測試**根本沒有 Case 編號**。上一輪誤把檔頭「要鎖住的六件事」那份**主題清單**的第 4 項當成 Case 編號。**注意：這不是 `DX-08`／`DX-10` 的 root cause** —— `DX-08` 只改動 §22／§23 的**子標題**，top-level `# 22.` 從來沒被重編過，所以這是獨立的既有錯誤，不能算進那條 numbering drift 無 | 確認作者原意後改成可解析的指標（`§19.2`、或指向 `adminOrdersFilter.db.test.js` 的該支測試）；**不要**在未確認原意前猜一個編號填上去 | **DONE**（2026-08-25）—— 採 **Option C**：契約指向 `docs/mvp_rules.md` §19.2（該節逐字寫著同一個 invariant），測試以**斷言名稱**指路而非編號（因為它確實沒有編號）。`adminOrdersFilter.db.test.js` **14 / 14 全綠**，SQL 與行為未動。見〈`DX-11` 完成紀錄〉 | 無 |
| `DX-10` | `P3` | Docs / Backend | `Backend/` 內兩處指向 `mvp_rules.md` 的 section 引用是錯的 | 與 `DX-08` 同一個 root cause（子標題錯號讓人把 activity log 章節記成 §21）。swagger 的 `description` 會**實際輸出到 OpenAPI 文件**，讀者照著找會找到「教材上架審核 workflow」而不是 activity log | `2026-08-24`（`DX-08` 輪次）：`Backend/swagger.js:2555` 的 `/admin/activity-logs` 描述寫 `See docs/mvp_rules.md §21.`；`Backend/scripts/api-smoke-test.js:1902` 的註解寫「Activity log 的人類可讀搜尋（docs/mvp_rules.md §21）」。兩者都應指向 **§22**（`# 22. Admin activity log search`）。對照組：`Backend/swagger.js:1637` 的 `§20` 指向 `# 20. Admin material review queue`，**是對的**，不要一起改 `DX-08`（已完成） | 兩處改為 `§22`；`swagger.js` 屬 runtime 檔，需確認是否要在同一輪動 | **DONE**（2026-08-25）—— 兩處皆改為 `§22`，`swagger.js:1637` 的 `§20` 未動。以隔離 backend（3001，`teaching_platform_security_test`）實測 **served** OpenAPI：`/admin/activity-logs` 的 description 由 `§21` 變 `§22`，整份 spec 已不再出現 `mvp_rules.md §21`；parameters／responses／paths 數量不變。canonical smoke **全綠**。見〈`DX-10` 完成紀錄〉 | 無 |
| `DX-08` | `P3` | Docs | `docs/mvp_rules.md` 的章節編號與子標題錯位 | canonical rules 文件的交叉引用會指到錯的地方 —— 已經發生：`docs/teaching-platform-mvp-spec-v1.4.md` 只能寫成「`mvp_rules.md` heading 21.2.1，位於 section 22 之內」這種自我矛盾的指路 | `2026-08-23`：`# 22. Admin activity log search` 底下的子標題是 `## 21.1` / `## 21.2`（`### 21.2.1`）/ `## 21.3` —— 與 `# 21. 教材上架審核 workflow` 底下的 `## 21.1`~`## 21.4` **完全重號**；`# 23. Admin / Creator shell 尺寸` 底下同樣是 `## 22.1`。等於整份文件從 §21 之後子標題比父標題少 1 **2026-08-24（DX backlog reconciliation）複測仍完全成立且逐字相符：** `# 22. Admin activity log search` 底下仍是 `## 21.1`／`## 21.2`／`### 21.2.1`／`### 21.2.2`／`## 21.3`，與 `# 21.` 自己的 `## 21.1`～`## 21.4` **重號**（`grep | sort | uniq -d` 實測重複的正是 `## 21.1`／`21.2`／`21.3`）；`# 23.` 底下仍是 `## 22.1`。交叉引用的自相矛盾也仍在 —— MVP spec **:502** 寫「`mvp_rules.md` heading 21.2.1, inside section 22」，**:504** 寫「heading 21.2.2 (inside section 22)」。**註：** `COR-05`／`COR-07` 新增的 §A.1／§A.2 刻意用字母前綴、不進數字鏈，因此既未加重也未修好本項。**維持 `P3`**（docs consistency，無 runtime 影響） **2026-08-24（本項修復輪次）逐一核對後修正：** `# 22.` 底下的五個子標題（`21.1`／`21.2`／`21.2.1`／`21.2.2`／`21.3`）改為 `22.*`；`# 23.` 底下的 `22.1` 改為 `23.1`。`# 21.` 自己的 `21.1`～`21.4` 與 `# 21A.` 的 `21A.1`～`21A.6` **未動**。重複 numeric heading 由 3 組歸零。 | 無 | 子標題編號與所屬章節對齊，並修正指向它們的交叉引用（含 spec §11 的 `GET /admin/activity-logs` 一列） | **DONE**（2026-08-24）—— heading 重複 **0**、repo-wide dangling reference **0**；本輪只改 `docs/`，runtime 檔案 **0**（`Backend/` 內兩處 stale `§21` 另立 `DX-10`）。見〈`DX-08` 完成紀錄〉 | 無 |
| ~~`DX-09`~~ | — | DX / Tooling | ~~驗收 build 需要隔離的 `distDir`~~ → **已併入 `DX-05`**（2026-08-24） | 與 `DX-05` 是**同一個 root cause 的兩個症狀**：`.next` 是一個沒有 per-consumer 隔離的共用可變目錄。fix domain 也完全重疊（`next.config.ts` 的 `distDir` ＋ `frontend/package.json` 的 script 接線 ＋ `local-development-and-operations.md` 的流程），**沒有任何一個改動只修得好其中一項** | evidence 已完整搬入 `DX-05` 的 Evidence 欄（未丟失）；依 §11.4「同一個問題更新既有 ID，不要開近似的新 ID」合併 | — | 見 `DX-05` | **MERGED → `DX-05`** | — |
| `DX-07` | `P3` | Testing / Repo hygiene | Playwright 產物未被 gitignore | 每次有測試失敗，`git status` 就多出一個未追蹤目錄；它是**每次執行都會變動的產物**，混在 working tree 裡會讓「哪些檔案是這輪真的改動」變難判讀，也有被誤 `git add` 的風險 | `2026-08-23`：`git status --short` 出現 `?? frontend/apps/web/test-results/`；`.gitignore` 對 `test-results` / `playwright-report` 的命中數為 **0**。（該目錄由 `playwright.config.ts` 的預設 `outputDir` 產生，失敗時寫入 `error-context.md`） **2026-08-24（DX backlog reconciliation）複測仍完全成立：** `git check-ignore` 對 `frontend/apps/web/test-results` 與 `playwright-report` **皆未命中**；兩份 `.gitignore` 對 `test-results`／`playwright` 的命中數仍為 **0**；`git status --short` 現在確實出現 `?? frontend/apps/web/test-results/`，目錄也實際存在於磁碟。**維持 `P3`**（hygiene、有 workaround：不要用 `git add -A`），但值得注意的是它是**成本最低**的一項：目前 working tree 有 100+ 個改動檔與 2 個必須保住的 staged rename，一次誤 `git add -A` 就會把產物一起帶進去 **2026-08-24（本項修復輪次）第三次複測，並發現舊 evidence 少列了一個目錄。** 實際存在的 Playwright 產物是**三個**，不是兩個：`frontend/apps/web/test-results/`（config 未設 `outputDir`，預設值相對 config 所在目錄解析）、`frontend/apps/web/playwright-report/`（磁碟上已存在但為空，因此 git 不顯示 —— **空目錄不會出現在 `git status`，一旦跑過 `--reporter=html` 就會冒出來**），以及 `frontend/test-results/`（195 筆；從 `frontend/` 這一層呼叫 playwright 會找不到 config，退回以 cwd 為根的預設值）。 | 無 | `.gitignore` 加上 `test-results/` 與 `playwright-report/`，`git status` 在測試失敗後仍保持乾淨 | **DONE**（2026-08-24）—— 三條精確規則，`git check-ignore -v` 三個路徑全部命中；產物**一個都沒刪**。見〈`DX-07` 完成紀錄〉 | 無 |
| `DX-06` | `P2` | Testing | `shell-consistency.spec.ts`「no admin route overrides the shared sidebar width」間歇失敗 | 這是 shell 幾何的 acceptance 測試；間歇紅燈會讓「外殼真的壞了」與「機器忙」無法區分，直接降低每次前端驗收的可信度 | **2026-08-23 reconciliation 輪次於 production build 量測：** 兩個 project 一起跑整個套件時 **6 次中 2 次失敗**，錯誤一律是 `element has no bounding box`（`tests/e2e/shell-consistency.spec.ts:64` 的 `boxOf()` 收到 `null`）；同一支測試以 `-g` **單獨執行通過**，只跑 `--project=chromium-desktop` 亦 **2/2 通過**。失敗當下的 `error-context.md` page snapshot **看得到 sidebar**（`complementary` 節點存在）→ 元素有渲染，只是量測時尚無 layout box。測試以 `waitUntil: "domcontentloaded"` 導覽後**立即**量測，與 hydration 之間沒有任何 barrier。**2026-08-23 final reconciliation 更新根因：先前建議的緩解措施「先等可見」其實已經在 `boxOf()` 裡（`toBeVisible()` ＋ `expect.poll(() => boundingBox() !== null)`），但仍然失敗** —— 因為 poll 通過之後又做了**第二次** `boundingBox()` 讀取（`shell-consistency.spec.ts:63`），節點若在兩次讀取之間被 client render 換掉，第二次就回 `null`。本輪在 production build 上與 `admin.spec.ts` 併跑時再次重現（`/admin/orders` step，`1 failed / 93 passed`），單獨以 `-g` 重跑 **3/3 通過** **2026-08-24（本項修復輪次）先重現、再修復。** 修復前在隔離 production 環境上以 `shell-consistency.spec.ts` ＋ `admin.spec.ts` 兩個 project 併行連跑 5 次：**5 次中 2 次失敗**（`/admin/users` 與 `/admin/settings` 兩個 step），錯誤逐字為 `element has no bounding box`。**關鍵新證據：拋錯位置是 `spec.ts:64`，也就是 `if (!box) throw`** —— 代表 `:62` 的 `expect.poll(box !== null)` **已經通過**，倒下的是 `:63` 那次獨立的 `boundingBox()` 重讀。這把「poll 之後又讀第二次」從推論升級為**直接證據**。另兩次失敗分別落在 `admin-sidebar-desktop`（`:170`）與 `getByRole("main")`（`:173`），證明缺陷在共用的 `boxOf()` 而非某一個 locator | 無 | 讓量測**只讀一次**（例如把 box 從 poll 內部帶出、或改用 `toHaveCSS`／`toHaveBoundingBox` 這類自動重試的斷言），使該測試在兩個 project 並行時仍穩定通過。**注意：只加 `toBeVisible()` 不夠，那已經有了** | **DONE**（2026-08-24）—— 見〈`DX-06` 完成紀錄〉 | 無 |
| `DX-04` | ~~`P1`~~ → **`P2`**（2026-08-24 重新判定） | Frontend | 401 / 403 protected-area opt-in UX helper | admin / creator 區收到 401/403 時未統一導向 | `local-development-and-operations.md` §12。**2026-08-24（DX backlog reconciliation）以現行 working tree 重新取證：** **root cause 仍在** —— `lib/api-client.ts` 對 401/403 命中數為 **0**（沒有共用 helper），各 surface 自行處理（例如 `components/materials/detail/MaterialReportDialog.tsx:36-37` 逐個 status 寫文案）。**但 `P1` 的門檻不成立：**（a）**無安全風險** —— 真正的授權邊界是 Backend 的 `requireRole`，竄改 `tp_role` 只會得到空的外殼與一連串 403（CLAUDE.md §3、ops §12 皆已明載）；（b）**不阻塞開發或 canonical verification** —— `npm run verify:web` exit 0、完整 E2E **402 / 0 / 30**；（c）**不破壞 working tree／artifacts**；（d）**常見的過期路徑早已被處理** —— 決定性數據：JWT `expiresIn` 預設 **7d**（`Backend/utils/jwt.js:59`），而 `tp_token`／`tp_role` cookie 的 `max-age` 是 **86400（1 天）**（`app/login/page.tsx:74-75`）。**cookie 比 JWT 早 6 天過期**，所以最常發生的是「cookie 沒了」→ `middleware.ts:67` 直接導向 `/login`，**已正確**。DX-04 真正未覆蓋的只剩「cookie 仍在、但 JWT 在這 1 天內被判為無效」（secret 輪替、帳號刪除、手動竄改）這個窄窗，後果是看到頁內錯誤訊息而不是自動導向 —— 有 workaround（重新登入），無資料遺失或外洩 **2026-08-24（實作輪次）helper 已完成並全數驗證，但『接上 surface』被既有測試 fixture 擋住，因此本項為 PARTIAL：** 新增 `lib/session.ts`（`clearClientSession` / `isSafeInternalPath` / `buildLoginUrl` / `isAuthPagePath` / `recoverFromExpiredSession`），`apiFetch` 新增 `{ authExpiry: "recover" }` **opt-in** 選項。**401 與 403 明確分離**：403 永不清 session、永不導向。恢復有三道 guard（無 token 不處理、auth 頁不處理、同頁只恢復一次）。順帶把先前**抄在三個地方**的登出清單（`AdminSidebar` / `dashboard/Sidebar` / `RoleShell`）收斂成同一個 `clearClientSession()` —— 401 恢復與登出對「什麼算已登入」必須是同一個答案，四份各自演化保證不了。**另修一個先前存在的 open redirect**：`app/login/page.tsx` 的 `router.push(redirect || …)` 未驗證，`/login?redirect=https://evil.com` 在登入後會把使用者送到站外（pre-auth 即可觸發）；現以 `isSafeInternalPath()` 擋下。 **⚠️ 尚未完成的部分（需使用者裁示）：** 目前**沒有任何 surface opt-in**，因此「buyer / creator / admin 一致導向」這一條 criteria **未達成**。實測原因：只要在任一外殼接上 session 探測（試過全域預設，也試過三個外殼各探一次），完整套件就出現 **26 支失敗**，分布在 8 個 spec（`admin`／`teacher`／`parent`／`public`／`creator-sales`／`critical-acceptance` 等）。那些 spec 用**假 token ＋ 只 mock 部分端點**，其餘落到真實後端而回 401 —— 它們現在會過，**正是因為 app 會忽略 401**，也就是本項要修的缺陷本身。把那些 fixture 補成完整 mock 是 test-side 的工作，依 §10.3 未自行擴張。 | 無 | 做成 opt-in helper，**不要**全域攔截（會破壞公開頁與 buyer 頁的頁內錯誤態） | **DONE**（2026-08-24）—— 三個外殼皆已 opt-in，harness 補完，完整套件 **440 / 0 / 30**。見〈`DX-04` 完成紀錄〉 | 有（§12） |

### `DX-01` / `DX-05` / `DX-06` — 2026-08-24 settled-tree evidence

本輪在 settled tree ＋ **冷 `.next` production build** 上重跑三支 admin 套件
（`admin.spec.ts`、`admin-operations.spec.ts`、`shell-consistency.spec.ts`）：
**182 passed / 2 failed / 30 skipped**。兩支失敗逐一歸類如下，
**都不是本輪、也不是 `IA-06`／`IA-08` 的回歸**。

| DX | 本輪觀察 | 與既有 evidence 的關係 |
| --- | --- | --- |
| `DX-05` | **2026-08-24（`BUY-01` 輪次）以最嚴重的形式重現，並確認它會破壞其他 session 的環境。** 在 3010 有 `next dev`（pid 13152）執行中的情況下跑官方驗收指令 `npm run verify:web`：lint 與 typecheck 通過，`build` 倒在 `EPERM: open '.next\trace'`；**更嚴重的是 build 在失敗前已寫入共用的 `.next`，於是那個 dev server 從此對每一條 route 回 500**（實測 `/`、`/login`、`/materials` 皆 500，而 `.next` 仍在被 dev 持續改寫 → 程序活著但產物已互相汙染）。這不是「重跑一次就好」：**照 CLAUDE.md §7 執行驗收，就會弄壞另一個 session 正在用的 dev server。** 本輪的繞道方式（不動任何 tracked 檔、不砍別人的 process）是把 `frontend/` 複製到 scratchpad、以 junction 連回 `node_modules`、在複本上 build 並以 `next start --port 3011` 跑 E2E —— 可行但每次都要 6 分鐘且沒有人會記得這樣做。**此案例把既有 completion criteria 中「優先考慮獨立 `distDir`」從偏好升級為必要條件。** |
| `DX-05` | **2026-08-23 本輪未重現。** `rm -rf .next` 後 `npm run verify:web` **一次通過**（lint → typecheck → build 串接，exit 0，`BUILD_ID=xvqA0yJmoKpFyIH8CmGam`，50 條 route、36 個 static page）。本輪全程**沒有**任何 `next dev` 與 build 共用 `.next`（實測 node process 只有 backend 3000 與一支無關的系統服務） | 支持既有判定：`DX-05` 的可靠觸發條件是 **`.next` 被兩個 Next 程序同時使用**。**未因此修改任何 source**，條目維持 TODO |
| `DX-06` | **重現，signature 完全相同。** `shell-consistency.spec.ts:152`「no admin route overrides the shared sidebar width」在 `/admin/users` 倒在 `boxOf()` 收到 `null`（`element has no bounding box`，`spec.ts:64`）；以 `-g` **單獨重跑通過**（1/1） | 與 `DX-06` 既有 evidence 逐字相符（整套一起跑間歇失敗、單獨跑通過、錯誤一律是 bounding box 為 `null`）。歸類為既有 `DX-06`，**非 `IA-08` 回歸** —— 該測試鎖的是側欄寬度幾何，而 `IA-08` 的導覽內容測試本輪 4/4 全綠 |
| `DX-01` | **重現，並取得更精確的根因。** `admin-operations.spec.ts:724`「legacy reviewed cases render as closed」在 desktop **確定性失敗**（單獨重跑仍失敗），mobile 單獨重跑**通過**。根因確認在測試 mock：`page.route("**/api/backend/admin/report-cases**")` **不分 query string**，因此最後一行 `goto("/admin/reports?status=open")` 仍拿到那筆 legacy 案件，而 `/admin/reports` 的篩選完全在 API 端。desktop／mobile 的差異來自最後一句 `toHaveCount(0)` 會在清單尚未渲染時**先行通過** —— 這支測試同時有「mock 不分 query」與「`toHaveCount(0)` 與載入競賽」兩個缺陷 | 修正既有 evidence 的一處措辭：先前記為「間歇」，本輪證實在 desktop production build 上是**確定性失敗**。修法不變（mock 依 `status` 回應，並在最後一步先等清單載入完成再斷言）。屬 `DX-01` 第 4 群，**不是產品缺陷** |

> 本輪**未修改**任何測試或 source 讓上述兩支變綠 —— 依 §10.3 它們不在本輪 scope，只更新 evidence。
> Playwright 產物（`test-results/`、`playwright-report/`）**未刪除**（見 `DX-07`）。
---

### `DX-01` / `DX-05` / `DX-06` — 2026-08-24 settled-tree **完整套件** baseline

上一個完整套件 baseline（275 / 17 / 26）取於 2026-08-23。本輪在 settled tree ＋
**合格的 production 環境**下重新取得：隔離的 `next start` on 3011（產物為隔離 distDir）、
proxy 指向隔離 backend 3001 ＋ `teaching_platform_security_test`、`TEST_ADMIN_*` 已設。

**347 passed / 17 failed / 30 skipped。** 17 支失敗**全數**落入既有分群，零新增：

| 群 | 數量 | 歸屬 | 本輪 signature |
| --- | --- | --- | --- |
| `public.spec.ts` 4 支 × 2 project | 8 | `DX-01` 第 1 群 | 逐字相符：`getByRole('link', { name: '購物車' })` 找不到、`locator('main')` strict-mode 解到 2 個、`📦 34 張圖卡` seed 文案不存在 |
| `parent.spec.ts` 3 支 × 2 project | 6 | `DX-01` 第 2 群 | `locator('main')` 找不到；`/cart` 被導向 `/login?redirect=%2Fcart` |
| `critical-acceptance.spec.ts` checkout promo × 2 | 2 | `DX-01` 第 3 群 | 同既有 cart subtotal = 0 根因 |
| `shell-consistency.spec.ts`「no admin route overrides the shared sidebar width」（desktop） | 1 | `DX-06` | `boxOf()` 收到 `null`；以 `-g` **單獨重跑 1/1 通過** |

**兩項必須記下的變化：**

1. **`payment-proof-security.spec.ts` 本輪 12/12 全綠（desktop＋mobile，0 skipped）。**
   `BUY-01` 輪次那 6 支是「環境不合格，未能取得有效結果」（執行中的 backend 早於現行原始碼、
   shell 無 `TEST_ADMIN_*`）。本輪已放到 spec 要求的環境上重跑，**該缺口關閉**。
2. **`DX-01` 第 4 群（`admin-operations.spec.ts:724`）本輪全套並行與單獨重跑皆通過（2/2）。**
   因此修正上一輪「desktop 確定性失敗」的措辭：它是 **race，不是確定性失敗**。
   根因（mock 不分 query string ＋ `toHaveCount(0)` 與載入競賽）**不變**，修法也不變 ——
   測試缺陷仍在，只是本輪跑贏了那個 race。

> 本輪同樣**未修改**任何測試或 source 讓上述失敗變綠；Playwright 產物未刪除（見 `DX-07`）。

---

### `DX-01` 完成紀錄（2026-08-24）

**結果：完整套件 364 passed / 0 failed / 30 skipped**（先前 baseline 347 / 17 / 30；
總數 394 不變，17 支失敗全部轉為通過，**零新增失敗、零新增 skip**）。

**環境（合格的隔離 production E2E）** —— 未與 3010 的 dev server 共用任何產物：

| 元件 | 設定 |
| --- | --- |
| Web | `NEXT_DIST_DIR=.next-verify` build ＋ `next start --port 3011`（`API_BASE_URL=http://127.0.0.1:3001`） |
| Backend | isolated `PORT=3001`，`PGDATABASE=teaching_platform_security_test`（啟動前印出 assertion） |
| Playwright | `E2E_SERVER=production`、`PLAYWRIGHT_BASE_URL=…:3011`、`E2E_BACKEND_URL=…:3001`、`TEST_ADMIN_*` 取自 git-ignored 的 `Backend/.env` |

> `E2E_BACKEND_URL` 與 `TEST_ADMIN_*` **必須一起設**：漏掉前者會讓
> `payment-proof-security` / `material-media-security` 的 legacy-URL 斷言打向未啟動的 3000（6 支 ECONNREFUSED）；
> 漏掉後者會讓 4 支 admin-gated 測試改走 `test.skip`（skipped 30 → 34）。兩者都不是回歸，是執行環境不完整。

**逐群根因與分類**（B=實作已變／測試過期、C=selector 過期、D=fixture 過期、E=race、F=斷言本身不存在於 canonical product）：

| 群 | 失敗數 | 根因 | 類別 | 修法 |
| --- | --- | --- | --- | --- |
| 1 `public.spec.ts`「home page…entry links」 | 2 | `購物車` 只存在於 `RoleShell` 的 **parent** 導覽，而 `/cart` 是 `middleware.ts` 的 login-required 前綴 → 訪客本來就不該有此入口（desktop signature）；`教材列表` 在 public 導覽裡但 mobile 側欄收在抽屜中不可見（mobile signature）。第二個 step 另有兩處過期：只寫 localStorage（middleware 讀 cookie）＋ 目的地仍寫 legacy `/teacher/materials`（已由 middleware 308 正規化到 `/creator/*`） | F ＋ D | 改斷言頁面本體的兩顆 hero CTA（`開始逛教材`／`登入帳號`，兩個 viewport 皆可見）；redirect step 改用 canonical 的 `signInAs()` 並期待 `/creator/materials` |
| 1 `public.spec.ts`「auth pages…」 | 2 | 登入／註冊頁新增了「以 Google／Facebook 登入（即將開放）」SSO 佔位按鈕，原本的正規表示式各解到 **3** 個元素 → strict-mode violation | C | 改用 `{ name: "登入", exact: true }`／`{ name: "註冊", exact: true }`（與 `critical-acceptance.spec.ts` 既有寫法一致）。**未關閉 strict mode** |
| 1 `public.spec.ts`「materials and detail…」 | 2 | `locator("main")` 解到 **2** 個：`RoleShell` 的 `<main className="min-h-dvh">` 外層包住頁面自己的 `<main>`（desktop 倒在 `/materials`、mobile 倒在 `/materials/:id/reviews`）。**這是產品端的 landmark 重複，已另立 `COR-06`；本輪不改產品 UI** | C（測試端）＋ 另立 `COR-06`（產品端） | selector 收斂為 `.first()` |
| 1 `public.spec.ts`「seeded material detail…」 | 2 | 斷言的 `📦 34 張圖卡`、`⏱ 約 2 堂課`、`👧 4-8 歲`、`🎲 配對遊戲 / 搶答活動`、`創作者與家長回饋`、`依最新排序` 在**現行產品中一個都不存在**（全 repo grep 命中 0）。seed 本身健在（`Backend/migrations/20260508_seed_material_detail_demo.sql`：地點圖卡 4 / 物品圖卡 24 / 任務圖卡 6，已實地查 `teaching_platform_security_test` 確認），現行 `MaterialDetailBody` 逐列渲染「名稱 × 數量」。另 `創作者與家長回饋` 違反 CLAUDE.md §2 的 UI 稱呼規則 | F | **不補假 UI**；改對齊現行 canonical 契約（`地點圖卡 × 4`／`物品圖卡 × 24`／`任務圖卡 × 6`、`使用時間`、`適用：適合 4-8 歲`、`教材特色`、`教學回饋`＋`最新優先`、`查看全部回饋` 為 **link** 非 button） |
| 2 `parent.spec.ts` 3 支 | 6 | `beforeEach` 只寫 localStorage，而 `middleware.ts` 讀 `tp_token`／`tp_role` **cookie**，`PARENT_ROUTES` 全落在 `LOGIN_REQUIRED_PREFIXES` → 每頁被導向 `/login?redirect=…`（登入頁沒有 `<main>`，所以 signature 是「`main` 找不到」）。測到的從來不是目標頁面 | D | 改用 `helpers/auth.ts` 的 `signInAs(page, "parent")`（cookie ＋ localStorage 一起寫）；`main` selector 同步 `.first()`（登入後 `ParentAppShell` 與頁面同樣各有一個 `<main>`） |
| 3 `critical-acceptance.spec.ts` 6-1 checkout promo | 2 | **精確根因確定**：`helpers/mock-api.ts` 的 `GET /cart` 回 `qty`，但 Backend（`Backend/routes/cart.js` 選 `c.quantity`）與 `CartItem` 型別都是 `quantity`。`/cart` 因 `lib/api-repository.ts` 有 `Number(row.quantity ?? 1)` 預設值而看不出來；`/checkout` 直接讀 `item.quantity` → `subtotal = 199 * undefined = NaN` → `JSON.stringify` 送成 `null` → mock 的 `Math.min(100, 0)` = 0 → 畫面顯示 `優惠折扣：-NT$0`。這正是既有 evidence 記的「cart subtotal = 0」 | D | mock 改回 canonical 欄位名 `quantity`（並移除同樣不在契約內的 `subtotal`）。**產品程式碼未動** |
| 4 `admin-operations.spec.ts:724` | 0（本輪未失敗） | 既有 evidence 已定案的兩個測試缺陷仍在：mock 對 `**/admin/report-cases**` **不分 query string**，而 `/admin/reports` 的篩選完全在 API 端；末行 `toHaveCount(0)` 會在清單尚未渲染時先行通過 | E | 依既有 completion criteria 直接修掉（不等它下次再輸掉 race）：mock 依 `status` query 回應（`open` → 空結果集），並在斷言 0 筆之前先等空狀態「沒有符合條件的案件」出現 |

**分群 targeted 驗證（全部在上述隔離環境、`E2E_SERVER=production`）：**

| 範圍 | 結果 |
| --- | --- |
| `public.spec.ts` ＋ `parent.spec.ts`（修復前 baseline） | **4 passed / 14 failed** —— 與既有 evidence 的 8＋6 分群逐字相符 |
| `public.spec.ts` ＋ `parent.spec.ts`（修復後） | **18 passed / 0 failed** |
| `critical-acceptance.spec.ts` | **36 passed / 0 failed**（先前 34 / 2） |
| `admin-operations.spec.ts -g "legacy reviewed cases"` | **4 passed / 0 failed** |
| `next lint` | **0 error**（僅既有 `no-img-element` warning） |
| `tsc --noEmit` | **exit 0** |
| 完整套件 | **364 passed / 0 failed / 30 skipped** |

**本輪改動的檔案（全部是測試端，production runtime 0 檔）：**
`tests/e2e/public.spec.ts`、`tests/e2e/parent.spec.ts`、`tests/e2e/helpers/mock-api.ts`、
`tests/e2e/admin-operations.spec.ts`。

> **`DX-06` 本輪未重現**（`shell-consistency.spec.ts:152` 在完整套件中通過）。
> 它是間歇 race，**不因為這一次跑贏就算修好** —— 條目維持 TODO，根因與修法不變。
> （**後續：`DX-06` 已於 2026-08-24 的專屬輪次重現並修復，見下方〈`DX-06` 完成紀錄〉。**
> 上面這段是 `DX-01` 輪次當下的判斷，保留不改寫 —— 它記錄的是「沒重現不等於修好」這個判準本身。）
> Playwright 產物（`test-results/`）依 `DX-07` 未刪除。

---

### `DX-01` baseline（2026-08-23，production build 完整套件）

**275 passed / 17 failed / 26 skipped**（chromium-desktop + chromium-mobile 兩個 project）。
17 個失敗分成四群，**沒有一群觸及付款憑證**：

| # | 失敗 | 專案 | 實際原因 | 與 `SEC-01` 的關係 |
| --- | --- | --- | --- | --- |
| 1 | `public.spec.ts` 4 支 | desktop + mobile（8） | 斷言的是已不存在的首頁文案與 seed 教材內容（例：`getByRole('link', { name: '購物車' })` 找不到、`📦 34 張圖卡`）。**指向 seed 完整的 dev DB 重跑仍然失敗** → 是 UI 改版後未同步的過期斷言，不是資料問題 | 無 —— 未觸及任何憑證程式碼 |
| 2 | `parent.spec.ts` 3 支 | desktop + mobile（6） | skeleton spec，`locator('main')` 找不到（外殼結構已改／假 token 被真後端拒絕後未渲染） | 無 |
| 3 | `critical-acceptance.spec.ts` `ORDER \| CI \| 6-1` | desktop + mobile（2） | checkout 折扣行 `優惠折扣：-NT$100` 未渲染。**2026-08-23（`COR-01` 輪次）取得根因證據：** 頁面實際渲染的是 `優惠折扣：-NT$0` 與 `✓ 已套用代碼 WELCOME100，折扣 NT$0` → mock 的 `promo/validate` 回 `Math.min(100, subtotal)`，所以 **checkout 送出的 `subtotal` 是 0**，也就是 `setAuthState` 種進 localStorage 的購物車沒有被頁面讀到。屬 checkout / cart 載入範圍，**不是 promo 文案問題** | 無 —— `app/checkout/page.tsx` 兩輪皆未修改 |
| 4 | `admin-operations.spec.ts`「legacy reviewed cases render as closed」 | ~~僅 mobile~~ → **desktop 與 mobile 皆會**（間歇） | **2026-08-23 reconciliation 輪次取得根因：測試本身有 race，不是產品缺陷。** 該測試的 mock 對 `**/api/backend/admin/report-cases**` **不分 query string**，一律回傳那筆 legacy 案件；而 `/admin/reports` 的篩選完全在 API 端（`app/admin/reports/page.tsx:169` 把 `status` 送給後端，頁面只渲染回傳結果）。因此最後一行 `goto("/admin/reports?status=open")` → `expect(admin-report-row).toHaveCount(0)` **只有在斷言早於 fetch 解析時才會通過**。實測：單獨執行必過；整檔並行執行 4 次中 2 次失敗（desktop／mobile 都出現過）。**2026-08-23 final reconciliation 於 production build 再次重現**（`admin-operations.spec.ts` 全套 77 passed / 1 failed，失敗即此支，desktop）。另補一項證據：該斷言**是 working tree 新增的**，`git show HEAD:` 的版本沒有最後那段 `goto("/admin/reports?status=open")` → `toHaveCount(0)`，故它從未在 HEAD 上綠過，**不是本輪或任何 IA 任務造成的回歸** | 無 —— 檢舉流程，非付款 |

判定依據不只是「名字看起來無關」：本輪改動的前端檔案只有
`app/admin/payment-proofs/page.tsx`、`lib/payment-proof.ts`（新檔）、`lib/api-types.ts`（純型別）
與兩支 e2e mock 的憑證欄位；上述四群全部不經過這些檔案，
而付款憑證自己的 13 項 E2E 覆蓋全部通過（見 §1.1）。

> 這四群**不是**永久豁免。它們現在是 `DX-01` 的具體待辦，不是「已知紅燈」。

### `DX-06` 完成紀錄（2026-08-24）

**結果：race 消除，且經重複執行證實。** 產品程式碼 **0 檔改動** —— 側欄幾何本來就是對的。

**根因（本輪取得直接證據，不再是推論）**

`boxOf()` 對同一個 locator 做了**三次各自獨立**的量測：

| # | 呼叫 | 作用 |
| --- | --- | --- |
| 1 | `await expect(locator).toBeVisible()` | 等可見 |
| 2 | `await expect.poll(async () => (await locator.boundingBox()) !== null).toBe(true)` | 等「量得到」 |
| 3 | `const box = await locator.boundingBox()` | **另一次全新的 evaluation**，這一次的值才是回傳結果 |

第 2 步只證明「**某一個瞬間**量得到」；第 3 步會重新解析 locator。
只要 hydration／client render 在第 2 與第 3 步之間把節點換掉，第 3 步就回 `null`，
於是 `:64` 的 `if (!box) throw new Error("element has no bounding box")` 拋錯。

> **本輪的決定性證據：** 修復前的失敗堆疊指向 **`spec.ts:64`**，不是 `:62`。
> poll 是**通過**的 —— 倒下的正是那次多餘的重讀。這正是既有 evidence 推測的機制，
> 現在有了直接的行號佐證。

**修法（只動 test harness）**

讓「等到量得到」與「取得最終結果」成為**同一次讀取**：poll 的 callback 把量到的 box
寫進 holder，成功那一次的值直接作為回傳值，**poll 之後不再讀第二次**。

- ❌ 未加任何 `sleep`
- ❌ 未調高 timeout
- ❌ 未改動 production sidebar layout（`shell-constants.ts` / `AdminShell.tsx` / `RoleShell.tsx` 皆零改動）
- ❌ 未 skip、未 retry、未降低斷言精度 —— 回傳的仍是一次真實完整的 layout box，
  呼叫端 `Math.round(box.width) === 240` 這類斷言一字未改
- ✅ 一處修改覆蓋全部 **15 個 call site**（desktop 幾何與 mobile drawer 共用同一個 `boxOf()`）

**驗證（隔離 production 環境：`.next-verify` distDir ＋ `next start` 3011 ＋ isolated backend 3001 ＋ `teaching_platform_security_test`）**

| 階段 | 結果 |
| --- | --- |
| **修復前**：`shell-consistency` ＋ `admin.spec` 兩 project 併行 × 5 | **5 次中 2 次失敗**（`/admin/users`、`/admin/settings`），皆為 `element has no bounding box` |
| **修復後**：同一組合 × 5 | **5/5 通過**，每次 **106 passed / 0 failed**，`no bounding box` 命中 **0** |
| **修復後**：`shell-consistency.spec.ts --repeat-each=10`（兩 project） | **300 passed / 0 failed** |
| **修復後**：幾何案例 targeted `--repeat-each=12` | **228 passed / 0 failed**；「no admin route overrides」執行 24 列、240px rail 48 列、`shell is correct at` 144 列、drawer 幾何 216 列，`no bounding box` 命中 **0** |
| `shell-consistency.spec.ts` 全套 | **30 passed / 0 failed / 30 skipped** |
| `next lint` ／ `tsc --noEmit` | **0 error** ／ **exit 0** |
| **完整套件** | **364 passed / 0 failed / 30 skipped** —— 與 `DX-01` 輪次的 baseline **完全一致，零退步** |

**本輪改動的檔案：** `tests/e2e/shell-consistency.spec.ts`（僅 `boxOf()` 與其註解）。

> **未一併處理的觀察（刻意，不進 Active TODO）：**
> `admin-operations.spec.ts:348-349,623-624`、`material-review.spec.ts:199-200`、
> `creator-sales.spec.ts:647` 也直接呼叫 `boundingBox()` 並以 `!` 斷言非 null。
> 它們**在結構上**同樣暴露於 null，但**沒有任何失敗證據**（本輪與 `DX-01` 輪次的完整套件皆通過）。
> 依 §11.3，無證據的風險不進 Active TODO —— 僅在此記錄，若日後真的紅了再立案。

---

### `DX-05` 完成紀錄（2026-08-24，含已併入的 `DX-09`）

**結果：canonical 驗收不再與 dev server 共用 `.next`，兩者可同時執行。** application runtime code **0 檔改動**。

**根因**

`.next` 是一個**沒有 per-consumer 隔離的共用可變目錄**。`next dev`／`next typegen`／
`next build`／`next start` 全部預設讀寫它，而 dev 與 production 的產物版面**不相容**：

| 方向 | 後果 |
| --- | --- |
| build 覆寫 dev 的 `.next` | `BUILD_ID` 與 manifest 被整批換掉 → 執行中的 `next dev` 下一個請求起**整站 500**；剛啟動時還會**假性通過健康檢查** |
| dev 持有 `.next` 時跑 build | `EPERM: open '.next\trace'`、`ENOENT: .next/server/pages-manifest.json`、`Cannot find module … middleware-manifest.json`、webpack cache `0.pack_` —— 而且是**寫壞之後才失敗** |

也就是說：**照 CLAUDE.md §7 執行驗收，就會弄壞另一個 session 正在用的 dev server。**
機制（`next.config.ts` 的 env-gated `distDir`）先前已就位，但 canonical 的
`verify:web` 沒有採用 —— 隔離仍靠每個人自己記得，所以問題並未真正關閉。

**`.next` 的消費者盤點**

| 流程 | 指令 | distDir（修復後） | 需要隔離？ |
| --- | --- | --- | --- |
| 本機開發 | `npm run dev:web:3010` | `.next`（**不變**） | 否 —— 它才是 `.next` 的正當擁有者 |
| 驗收 lint | `lint:web` | `.next-verify` | 是（同一條鏈） |
| 驗收 typecheck（含 `next typegen`） | `typecheck:web` | `.next-verify` | 是 —— typegen 會寫入 distDir（實測 types 產在 `.next-verify/types`） |
| 驗收 build | `build:web` | `.next-verify` | 是 |
| Production E2E server | `playwright.config.ts` 的 `webServer` → `npm run start` | `.next-verify` | 是 —— 必須與驗收 build **同一個**目錄 |
| Dev E2E server | 同上（未設 `E2E_SERVER`） | `.next`（**不變**） | 否 |

CI 目錄不存在（無 `.github/`、無 Dockerfile），故無其他消費者。

**修法（最小面積）**

| 檔案 | 改動 |
| --- | --- |
| `frontend/scripts/verify-web.mjs`（新增） | 依序跑 `lint:web` → `typecheck:web` → `build:web`，三個階段都注入 `NEXT_DIST_DIR`（預設 `.next-verify`）；開跑前先印出目標目錄；明確**拒絕** `NEXT_DIST_DIR=.next` |
| `frontend/package.json` | `verify:web` 由 shell 串接改為 `node scripts/verify-web.mjs`（**同一個 script name，不新增第二套 convention**） |
| `frontend/apps/web/playwright.config.ts` | `E2E_SERVER=production` 時，若呼叫端未設 `NEXT_DIST_DIR` 則套用同一個預設值，讓 `next start` 讀到剛驗收過的那份產物 |
| `frontend/apps/web/next.config.ts` | 只改註解 —— 說明這個開關已是 canonical 流程的一部分，不再只是逃生口 |
| `docs/local-development-and-operations.md` §7 | 補上隔離契約與「不需要先停 3010」的說明 |

用 Node wrapper 而不是 `FOO=bar cmd` 的理由：npm 在 Windows 走 cmd.exe，POSIX 的行內環境變數語法會直接失敗；
repo 也沒有 `cross-env`，而 `scripts/*.mjs` 已是既有慣例（`scripts/git-pre-push-docs-check.mjs`）。

**驗證（全程**不**停掉 3010 的 dev server）**

| 項目 | 結果 |
| --- | --- |
| dev server 存活 | pid **13660** 全程未變（run 2 前後同一個 pid，未重啟） |
| `verify:web` × 2（連續） | 兩次皆 **exit 0**，三階段一次過，50 條 route、36 個 static page |
| 驗收後 dev 健康 | `/`、`/login`、`/materials`、`/register` 皆 **200**；`/admin` **307**（middleware 正常）；**無 500、無 manifest error** |
| `.next`（dev 產物） | `BUILD_ID` **始終不存在**；webpack cache 只有 `client-development`／`server-development`／`edge-server-development`；`server/app` **4** 項 |
| `.next-verify`（驗收產物） | `BUILD_ID` 存在且每次更新（`fdksk7NnyA4WDoMDaPxJw` → `RBKhpBTlUoCTrCEWQpDHT`）；webpack cache 為 `*-production`；`routes-manifest` 33 static ＋ 17 dynamic = **50**；`server/app` **65** 項 |
| run 2 前後 `.next` 差異 | 逐條檢查**全部是 dev-only**（`*-development` cache、`trace`、HMR hot-update、依請求編譯的 middleware）；**沒有任何 production 產物** |
| Production E2E（**未手動設定 `NEXT_DIST_DIR`**） | Playwright 自行啟動 `next start` 並成功服務整輪測試：`public` ＋ `shell-consistency` ＋ `payment-proof-security` **52 passed / 0 failed / 30 skipped**；`admin.spec.ts`（desktop）**38 passed / 0 failed** |
| **對照組（決定性）** | 不設 `NEXT_DIST_DIR` 直接 `next start` → `Could not find a production build in the '.next' directory`。`.next` 根本無法服務 production start，故上面那輪 E2E **只可能**是讀了 `.next-verify` |

> **run 1 時 dev server 的 pid 由 13540 變成 13660** —— 那是 `next dev` 偵測到
> `next.config.ts` 被編輯而**自行重啟**（設定檔變更的正常行為），不是產物損毀：
> 重啟後所有路由立即 200。run 2 全程未動任何設定檔，pid 因此完全不變。

**Completion Criteria 對照**

| 條件 | 狀態 |
| --- | --- |
| canonical verify 不再與 dev 共用 `.next` | ✅ |
| dev ＋ verify 可並行 | ✅（連續兩次，dev 全程健康） |
| verify build 成功 | ✅ exit 0 × 2 |
| dev server 前後皆健康 | ✅ 無 500、無 manifest error |
| production E2E 可使用隔離產物 | ✅ 且**不需手動設環境變數** |
| 不需人工停 3010 才能驗證 | ✅ |
| 沒有新的 script ambiguity | ✅ 沿用同一個 `verify:web`，未新增 `verify:web:isolated` |

---

### `COR-02` ＋ `COR-03` 完成紀錄（2026-08-24）

兩項綁在同一輪的理由：**root cause 都落在 `Backend/services/buyerOrders.service.js` 這一個檔案**
（`COR-01` 剛把買家進度收斂進去的那一段），而且 `COR-03` 新增的 `cancelled` 狀態會直接改變
`COR-02` 的判斷條件（非 `rejected` 即不回退件備註）。分兩輪做，第二輪必然要回頭改第一輪的 SQL。

---

#### `COR-02` —— 退件備註只在 `rejected` 時進 buyer payload

**Root cause：** `manual_payment_proofs.note` 是**買家可見**的自由文字，但核准流程借用了同一個欄位
寫入營運字串 —— `routes/admin.js` 在 approve 時把同一張訂單其餘 pending 憑證標成 `rejected` 並寫
`note = 'superseded by approved proof'`。買家的 `GET /me/orders/:orderId` 取「最新一筆 rejected 憑證」的
`note`，於是已核准訂單的 payload 夾帶那串內部字串。買家 UI 目前只在 `rejected` 分支渲染，
所以是 **payload 外洩、尚未顯示**。

**決策：採用 completion criteria 的選項 (b)**（payload 在非 `rejected` 時不回退件備註）。
**(a)（supersede 改用結構化欄位）被排除的硬證據：**

| 資料庫 | `note = 'superseded by approved proof'` | `review_status='rejected'` 且 `rejection_reason IS NULL` |
| --- | --- | --- |
| `teaching_platform` | 3 | **42** |
| `teaching_platform_security_test` | 3 | **63** |

也就是說「`rejection_reason` 為 NULL」**無法**當成 supersede 的結構化標記（大量 legacy 退件資料早於
reason code 導入）。要走 (a) 就得新增欄位＋migration，而那修的是同一個外洩的更遠端；
(b) 直接關掉**整類**外洩（不只 supersede 這一串）且無 schema 變更。

**實作：** `getBuyerOrder()` 把兩個子查詢包進
`CASE WHEN ${ORDER_PROGRESS_STATE_SQL} = 'rejected' THEN … END` ——
條件用的是**同一份**衍生狀態常數，不是另外寫一次判斷，否則「什麼算 rejected」會有第二個定義。
Admin 端不受影響：營運仍在自己的介面看得到那串字。

---

#### `COR-03` —— legacy `cancelled` 訂單的徽章

**Root cause：** `ORDER_PROGRESS_STATE_SQL` 沒有 `cancelled` 分支，已取消且無憑證的訂單落到
`ELSE 'pending'` → 徽章「待付款」，但同一張卡片已被 `isHistoricalOrder()` 歸進「歷史訂單」。

**產品處置拍板：** `cancelled` 是 **read-only 終態，沒有任何付款動作**，因此它的進度不該由憑證推導，
而是買家進度的一個值。**修在 canonical 的衍生欄位**（新增 `cancelled` 並**先於憑證判斷短路**，
與 `approved` 同一層），**不是**在前端補一個 `orders.status === 'cancelled'` 判斷 ——
後者會把徽章的來源又拆回兩個，正好推翻 `COR-01` 的收斂。

**未動** `orders_status_check`，**未做** legacy status cleanup（明確仍在 scope 外）。

---

#### 改動的檔案

| 檔案 | 改動 |
| --- | --- |
| `Backend/services/buyerOrders.service.js` | `ORDER_PROGRESS_STATES` 新增 `cancelled`；`ORDER_PROGRESS_STATE_SQL` 新增 `WHEN o.status = 'cancelled'` 短路；`getBuyerOrder()` 的兩個退件欄位包上 `rejected` 條件 |
| `Backend/tests/buyerOrderProgress.db.test.js` | 新增 fixture J（cancelled 無憑證）／K（cancelled ＋ 歷史 rejected 憑證），以及 3 支 regression 測試 |
| `frontend/apps/web/lib/api-types.ts` | `order_progress_state` union 加上 `"cancelled"` |
| `frontend/apps/web/app/orders/page.tsx` | `statusChipLabel` / `statusChipClass` 新增 `cancelled` 分支（灰階與既有 `status` fallback 同一組） |
| `frontend/apps/web/components/orders/OrderFlowMini.tsx` | 新增 `cancelled` 分支（否則落到通用的「訂單處理中」，與徽章矛盾） |
| `frontend/apps/web/app/me/orders/[orderId]/page.tsx` | timeline 新增 `cancelled` 分支（否則對已取消訂單說「請先完成轉帳」） |
| `frontend/apps/web/app/orders/[orderId]/payment-proof/page.tsx` | 同上 |
| `docs/mvp_rules.md` §5 | 狀態表新增 `cancelled` 列、precedence 補第 2 條、UI 契約補 `COR-02` 的 payload 規則 |
| `docs/teaching-platform-mvp-spec-v1.4.md` §4／§11 | 同步狀態表與 `/me/orders/:orderId` 的欄位條件 |

**CTA 端未改動**：`renderPrimaryAction()` 早已是「非 `pending_payment` 一律不給 CTA」（`COR-01`），
所以 `cancelled` 訂單本來就沒有付款 CTA —— completion criteria 的這一半在進場時已成立。

#### 驗證

| 項目 | 結果 |
| --- | --- |
| Backend unit | **139 / 0** |
| Backend DB | **208 / 0**（含新增 3 支；`buyerOrderProgress.db.test.js` 單獨 **17 / 0**） |
| Backend smoke（isolated `PORT=3001` ＋ `teaching_platform_security_test`） | **All smoke checks passed**（含既有的「rejected 訂單仍看得到 `payment_proof_rejected_reason` / `_note`」斷言） |
| 實際資料覆核 | `cancelled` 訂單 2 筆 → progress `cancelled`；superseded 訂單 → note/reason 皆 `null`；真的被退件的訂單 → note 照常回傳 |
| `npm run verify:web`（`DX-05` 隔離流程，**3010 dev server 全程未停**） | **exit 0**，lint 0 error／typecheck 0／build 50 route |
| 3010 dev server | 驗收前後 `/`、`/login`、`/materials`、`/register` 皆 **200**；`.next` 仍無 `BUILD_ID` |
| targeted E2E | `buyer-order-progress` ＋ `critical-acceptance` **46 / 0** |
| **完整套件** | **364 passed / 0 failed / 30 skipped** —— 與既有 baseline **完全一致，零退步** |

#### Runtime behavior 是否改變

**是，而且是刻意的**（兩項都是 correctness 修正，不是命名整理）：

1. `GET /me/orders` ／ `/me/orders/:orderId` 對 `orders.status = 'cancelled'` 的訂單，
   `order_progress_state` 由 `pending`（或憑證推導值）改為 `cancelled`；買家徽章由「待付款」改為「已取消」。
2. `GET /me/orders/:orderId` 在非 `rejected` 狀態時，`payment_proof_rejected_note` /
   `payment_proof_rejected_reason` 由「可能有值」改為一律 `null`。

兩者都**沒有**放寬任何授權，也沒有改變 `orders.status` 本身或任何寫入路徑。

---

### `COR-04` 完成紀錄（2026-08-24）

**結果：買家可見面已無系統角色稱呼；internal role contract 一律未動。**

#### 先立規則，再動文案

依 `docs/ui-role-naming-checklist.md` 與 CLAUDE.md §2 分成三類，**不是把「家長」兩字全清掉**：

| 類別 | 判準 | 處置 |
| --- | --- | --- |
| **A. Role label** | 描述「這個帳號／使用者是什麼角色」 | **修** —— 改 canonical 稱呼（購買者／創作者） |
| **B. Audience description** | 描述教材適合誰、誰會用 | **保留** —— checklist 明文允許補充說明提及族群 |
| **C. Internal identifier** | DB / API / JWT / 權限 / 程式內 role 常數 | **不動** —— checklist 的 Scope 明文排除 |

額外一類：**列舉買家族群**的文案（「家長與老師…」）。它不是 A（沒有稱呼讀者），也不是 B
（描述的不是教材受眾，而是平台使用者），但違反 checklist 的
**「保持平台可擴展：文案不可暗示『購買者只可能是家長』」** —— 因此修。

#### Repo-wide inventory 與分類（**未沿用舊行號，全部重查**）

| 位置 | 內容 | 類別 | 處置 |
| --- | --- | --- | --- |
| `components/materials/MaterialDetailPage.tsx` | 「請先以**家長**帳號登入後再加入購物車。」 | A | ✅ → 「購買者帳號」 |
| `components/reviews/ReviewItem.tsx` `roleLabelMap` | `parent: "家長"` | A | ✅ → `parent: "購買者"`（**key 未動**） |
| `lib/api-repository.ts` `apiReviewRowToMock` | `userName: "家長"` | A（捏造身分） | ✅ → `userName: ""`，見下方說明 |
| `components/parent/ParentHomePage.tsx` | `subtitle="家長與老師教學回饋最高的教材"` | 買家族群列舉 | ✅ → 「教學回饋評價最高的教材」 |
| `app/me/materials/[id]/feedback/page.tsx` | 「幫助其他**家長與老師**選擇適合教材」 | 買家族群列舉 | ✅ → 「其他使用者」 |
| `app/register/page.tsx` | 「適合家長、教育相關科系學生、在職老師、補教老師與自學使用者」 | B | ⬜ **保留** —— checklist「Allowed Exception：補充說明可提及族群」，且它是 Register 的說明文字而非主標籤 |
| `docs/materials-detail-spec.md` §12 | 標題寫「教師與家長回饋」 | A（**過期的** canonical 文件） | ✅ → 「教學回饋」（對齊實作） |
| `docs/teaching-platform-mvp-spec-v1.4.md` §7 | 同上（英文段落內） | A（過期） | ✅ → 「教學回饋」 |
| `docs/material-features-system-spec-mvp-v1.0.md` ×2 | 「適合家長陪同互動」「需創作者、教師或家長引導進行」 | B | ⬜ 保留 —— 教材特色的**受眾／協助程度**描述 |
| `docs/frontend-ui-architecture.md` | 表格列「家長首頁」對應 `ParentHomePage` | C（架構文件描述元件領域） | ⬜ 保留 —— 非 UI 文案 |
| `tests/e2e/critical-acceptance.spec.ts` ×2 | `getByLabel("姓名").fill("測試家長")` | 表單輸入 fixture | ⬜ 保留 —— 是填進「姓名」欄的測試值，產品不會把它當角色標籤渲染 |
| `tests/e2e/public.spec.ts` 註解 | 說明已移除的舊文案 `創作者與家長回饋` | 歷史說明 | ⬜ 保留 —— 記錄的是當時語境 |
| `lib/view-models.ts` `audienceRole: "parent" \| "teacher"`、`roleBadgeMap` key、`aria-checked={role === "parent"}`、Backend 全部 role 契約 | 內部識別碼 | C | ⬜ **未動** |

#### 為什麼 `userName` 不是改成另一個角色名

`GET /materials/:id/reviews` 只回 `id / rating / comment / created_at / parent_id` ——
**沒有姓名、沒有角色**。舊版對每一則回饋寫死「家長」，那既是憑空捏造的身分，也是用角色當稱呼。
把它換成「購買者」只是換一個捏造的身分，仍然違反同一條規則。
repo 內已有 canonical 做法：`components/admin/MaterialFeedbackContext.tsx` 明文寫著
「不要在這裡臆測作者身分……Admin 端不顯示作者名稱與角色標籤」，並以 `userName: ""` ＋
`showAuthorName={false}` 實作。本輪讓買家端跟上**同一份**做法，而不是發明第二套。

因此 `app/materials/[id]/reviews/page.tsx` 與
`components/materials/detail/MaterialDetailBody.tsx` 兩個 `<ReviewItem>` 加上
`showAuthorName={false}`（`ReviewItem` 本來就會在該情況把頭像字改成「匿」）。
**移除的是捏造內容，不是真實資訊** —— 那個欄位從來沒有承載過任何 API 資料。

#### Runtime behavior 是否改變

**否。** 全部是 buyer-visible copy 與顯示旗標：
沒有改動任何 role enum、authorization、DB schema、API 契約或 migration；
`parent` / `teacher` 在 DB、JWT、`requireRole`、view-model 型別中一字未動。

#### 驗證

| 項目 | 結果 |
| --- | --- |
| repo-wide 複查（`家長`／`老師`／`教師`，runtime 範圍） | 僅餘 4 筆：`register/page.tsx`（刻意保留）＋ 3 條**解釋規則的程式註解** |
| checklist 的 Forbidden Examples（`家長專區`／`Hi，家長` 等） | **0 命中** |
| UI 是否渲染 `parent`/`teacher`/`admin` 字面值 | 僅餘 `aria-checked={role === "parent"}` 與型別註記 —— 皆為內部識別碼 |
| `npm run verify:web`（`DX-05` 隔離流程，**3010 全程未停**） | **exit 0** —— lint 0 error／typecheck 0／build 50 route |
| 3010 dev server | 驗收前後 `/`、`/login`、`/materials` 皆 **200** |
| targeted E2E | `public.spec.ts` ＋ `material-report.spec.ts` **16 / 0**（含新增的命名 regression 斷言） |
| **完整套件**（`ReviewItem` 是 4 個 surface 共用，故跑全套） | **364 passed / 0 failed / 30 skipped** —— 與既有 baseline 一致，零退步 |

新增的斷言放在 `public.spec.ts` 的 seeded 詳情頁測試（該頁**確實渲染 2 則回饋**，
已用 API 覆核，斷言非空轉）：買家可見面 `家長` / `老師` 的出現次數必須為 **0**。
修復前該頁會渲染「— 家長」，所以這條斷言在修復前會失敗。

---

### `COR-05` 完成紀錄（2026-08-24）

**結果：五條匿名可觸發的 500 全部消除，且 auth 之後的同類 route 一併關閉。** frontend production 檔案 **0 改動**。

#### Root cause

URL path 裡的 `%00` 解碼成 NUL byte（`U+0000`）。PostgreSQL 的 `text` **無法**儲存或比對 NUL，
所以任何把它當識別碼送進查詢的 route 都炸在
`22021 invalid byte sequence for encoding "UTF8": 0x00`，對外回通用 500。
沒有資料外洩（body 只有 `{"message":"server error"}`），但每次都在伺服器印一份 stack trace，
而且讓「服務真的壞了」與「有人餵了怪字元」在監控上完全一樣。

#### 重現（修復前，isolated backend `PORT=3001` ＋ `teaching_platform_security_test`）

| Path | 修復前 | 修復後 |
| --- | --- | --- |
| `/materials/%00` | **500** | **400** |
| `/materials/%00/reviews` | **500** | **400** |
| `/materials/%00/rating` | **500** | **400** |
| `/materials/%00/rating-distribution` ⚠️ **原 evidence 未記錄** | **500** | **400** |
| `/materials/media/%00` | **500** | **400** |
| `/materials/%00/reports`（需 admin） | **500** | **400** |
| `/download/%00`（需登入） | **500** | **400** |
| `/me/orders/%00`（需登入） | **500** | **400** |
| `/admin/report-cases/%00`（需 admin） | **500** | **400** |

五處 handler 的 log 皆為 PG `22021`。**匿名可觸發的是前五條**；後四條需先通過 auth，
但同屬一個缺陷類別 —— 這也是為什麼修在共用邊界而不是逐條加判斷。

#### 為什麼是「拒收 NUL」而不是「驗證識別碼格式」

覆核了實際契約：`materials.id` 與 `material_media_files.id` **都是 `text`**，
值形如 `mat_mt4n1tppwgtnpe`（應用層產生）—— **不是 UUID**。
也就是說沒有可以拿來擋的格式，任何字串都是合法的查詢輸入，查不到就是 404
（實測 `/materials/media/not-a-uuid` 本來就正確回 404）。
**唯一**永遠不可能合法的，是 PostgreSQL `text` 根本裝不下的 NUL byte。
若照「對 UUID route 做嚴格 UUID validation」的直覺去做，會把合法的 `mat_*` id 擋在門外。

#### 修法與邊界

新增 `Backend/utils/pathParams.js`（`hasNulByte` / `pathHasNulByte` / `rejectNulBytePathParams`），
在 `Backend/index.js` 掛在**所有 router 之前**。

**明確沒有做的事（對照 completion criteria 的禁止項）：**

- ❌ 沒有把 PG `22021` 統一 catch 成 400 —— 輸入在**進 DB 之前**就被拒絕
- ❌ 沒有在 global error handler 隱藏任何 DB error
- ❌ 沒有特判字串 `"%00"` 之外的東西，也沒有只修素材端點
- ❌ 沒有動 production data、沒有放寬任何 auth（401/403 的順序與結果完全不變）
- ❌ 沒有建立 generic validation framework —— 它只擋一種輸入

擋在一處而不是逐條 route 加判斷的理由：這不是某條 route 的商業規則，
而是「NUL byte 永遠不可能是合法識別碼」這件事本身；逐條加只會漏掉下一條新 route
（本輪就已經在原 evidence 之外多找到 5 條）。

#### HTTP 語意：**400**

| 狀態 | 語意 | 既有用法 |
| --- | --- | --- |
| 404 | 查了，沒有這筆 | `material not found` / `media_not_found` |
| **400** | 這個請求本身不合法 | Express 對壞掉的 percent-encoding 已經回 400 |

NUL byte 不可能識別到任何資源，它是壞掉的請求而不是找不到的資源；
用 404 會讓它與真實的查無資料無法區分 —— 那正是本項抱怨的監控問題。
回應維持既有的 `{ error, message }` 形狀：

```json
{ "error": "invalid_path_parameter", "message": "Path parameters must not contain NUL bytes." }
```

不含 PG 錯誤碼、SQL、stack 或檔案路徑（單元測試逐項斷言）。

#### Security probes（修復後）

| Probe | 結果 |
| --- | --- |
| `%00`（五條匿名 route ＋ 四條需授權 route） | **400**，JSON error contract |
| `%2500`（雙重編碼＝字面 `%00`，合法文字） | **404**（未誤擋） |
| `/materials/%00abc`、`/materials/abc%00` | **400**（不限於獨立出現） |
| `%2e%2e%2f%2e%2e%2fetc%2fpasswd`（materials／media） | **404**（語意不變） |
| `100%` / `%C0%80`（壞掉的 percent-encoding） | **400**（Express 既有行為，未被本輪改動）—— ⚠️ **但 body 帶 stack 與絕對路徑，已另立 `COR-07`** |
| 超長識別碼（600 字元） | **404** |
| **PG `22021` 出現次數**（涵蓋 probes ＋ smoke ＋ Postman 全程） | **0** |

#### 驗證

| 項目 | 結果 |
| --- | --- |
| Backend unit | **153 / 0**（新增 `tests/pathParams.test.js` 14 支，已註冊進 `test:unit`） |
| Backend DB | **208 / 0**（`teaching_platform_security_test`） |
| Backend smoke | **All smoke checks passed**，含新增的 `OK  path params reject NUL bytes (COR-05) without breaking valid identifiers` |
| Postman / Newman | **129 assertions / 0 failed** |
| 正常語意控制組 | 存在教材 → 200、未知教材 → 404、未知 media → 404、匿名需授權 route → 401 —— 全部不變 |
| `npm run verify:web`（`DX-05` 隔離流程，3010 未停） | **exit 0**；3010 前後 `/`、`/login`、`/materials`、`/register` 皆 200 |
| **frontend production 檔案改動** | **0** —— 這是純 backend input-boundary 修正 |

canonical doc 依 CLAUDE.md §9 同步：`docs/mvp_rules.md` 新增 **§A.1 Path 參數的輸入邊界**。
Swagger / Postman collection **未改** —— 這是掛在所有 router 之前的全域輸入守衛，
不是任何單一 endpoint 的契約變更；把它寫進 40 份 endpoint 定義只會稀釋規則。

---

### `COR-07` 完成紀錄（2026-08-24）

**結果：未授權即可取得的 stack／絕對路徑外洩已關閉，API 錯誤回應一律 JSON。**
frontend production 檔案 **0 改動**；`COR-05` 的 NUL 契約未被取代或繞過。

#### Root cause

這個 app **沒有註冊任何 terminal handler**，於是每一個沒被 route 處理掉的請求都落到
Express 的 `finalhandler`，而它回的是 **HTML**。三種輸入共用這一個成因：

| 輸入 | 修復前 | 洩漏內容 |
| --- | --- | --- |
| 解不開的 percent-encoding（`/materials/100%`、`%ZZ`、`%C0%80`、`%E0%A4%A`） | 400 `text/html` | `URIError` ＋ **9 條** `C:\teaching-platform\Backend\node_modules\…` 絕對路徑 ＋ 套件名（`router`、`path-to-regexp`） |
| **壞掉的 JSON body**（原記錄未涵蓋） | 400 `text/html` | `SyntaxError: Unexpected token b in JSON at position 1` ＋ stack |
| 比對不到任何 route | 404 `text/html` | 無 stack，但 `Cannot GET /x`，不符 JSON 契約 |

**這與 `COR-05` 是不同的邊界，兩者都需要：** percent-encoding 解不開時，`URIError` 是在
**router 比對 param 的階段**丟出來的 —— 請求**從未進到任何 handler**，所以掛在 router
之前的 NUL guard 攔不到；反過來 NUL byte 解得開，走不到 error handler。

#### `NODE_ENV` 的結論（實測，非推論）

同一棵樹以 `NODE_ENV=production` 起在 `PORT=3002`：

| | body 含 stack | content-type |
| --- | --- | --- |
| `NODE_ENV` 未設定 | ✅ 有（外洩） | `text/html` |
| `NODE_ENV=production` | ❌ 無 | **仍是 `text/html`** |

也就是說環境變數**只擋掉資訊外洩，沒有滿足「API 一律 JSON」**，而且它是一個沒有任何
保障的設定（repo 沒有部署設定，見 `PRE-01`）。因此契約由 app 自己保證：
**回歸測試全程在 `NODE_ENV` 未設定的情況下執行並通過。**

**Repo 現況 audit：** dev／test／smoke／`npm start` **沒有任何一個流程設定 `NODE_ENV`**；
唯一實際讀它的是 `Backend/config/privateFileStorage.js` 的 production fail-closed 檢查（屬 `PRE-01`）。
本輪**未**改任何 script —— 「production 要設 `NODE_ENV=production`」是部署決策（`PRE-01`），
現在它是 **defense in depth**，不是這條規則的實作方式。已寫進 `docs/mvp_rules.md` §A.2。

#### 修法

新增 `Backend/middlewares/errorResponses.js`，在 `Backend/index.js` 掛在**所有 route 之後**
（順序：`notFoundJson` → `jsonErrorHandler`）。

| 情況 | 狀態 | body |
| --- | --- | --- |
| `URIError`（router 解 path param 失敗） | **400** | `{ "error": "invalid_request", "message": "The request could not be parsed." }` |
| `entity.parse.failed`（`express.json()` 失敗） | **400** | 同上 |
| 比對不到 route | **404** | `{ "error": "not_found", "message": "Route not found." }` |
| 其他未預期錯誤 | **500** | `{ "message": "server error" }`（與 route-level catch 的既有契約相同） |

**明確沒有做的事（對照 completion criteria 的禁止項）：**

- ❌ 沒有只在 `/materials` 特判，也沒有用 regex 擋 `%`
- ❌ 沒有 catch 所有 Error 就回 400 —— **只認**兩類可辨識的 parse 失敗（`URIError`、
  `entity.parse.failed`），其餘一律走既有的 generic 500；單元測試特別鎖住
  「光是帶 `status = 400` 還不夠」這一點
- ❌ 沒有依賴 `NODE_ENV=production`
- ❌ 沒有改 frontend
- ✅ `res.headersSent` 時交還 Express（檔案串流中途失敗不得二次寫入）
- ✅ 回應不含 `err.message`；完整錯誤只印在伺服器端

#### Security probes（修復後，`NODE_ENV` **未設定**）

| Probe | 狀態 | content-type | 洩漏 |
| --- | --- | --- | --- |
| `/materials/100%` | 400 | `application/json` | clean |
| `/materials/%C0%80` | 400 | `application/json` | clean |
| `/materials/%E0%A4%A` | 400 | `application/json` | clean |
| `/materials/%ZZ` | 400 | `application/json` | clean |
| `/materials/%` | 400 | `application/json` | clean |
| `/materials/mat_x%C0%80` | 400 | `application/json` | clean |
| POST 壞掉的 JSON body | 400 | `application/json` | clean |
| `/no-such-route` | 404 | `application/json` | clean |
| **控制組** `/materials/%00`（`COR-05`） | 400 `invalid_path_parameter` | `application/json` | 契約未被蓋掉 |
| **控制組** `/materials/%2500` | 404 | `application/json` | 正常語意 |
| **控制組** `/materials/not-found` | 404 | `application/json` | 正常語意 |
| **控制組** auth-required route | 401 | `application/json` | 未放寬 |
| **控制組** `/uploads/payment-proofs/*`、`/uploads/material-media/*` | 404 | `application/json` | `SEC-01`／`SEC-02` 的擋板未受影響 |

伺服器端 log 現在對這一類只印**一行**（`malformed request rejected: GET /materials/100% (URIError)`），
不再由 Express 印出完整 stack。（log 中殘留的 6 行 stack 來自一次無關的 SMTP 暫時性失敗，僅在伺服器端。）

#### 驗證

| 項目 | 結果 |
| --- | --- |
| Backend unit | **164 / 0**（新增 `tests/errorResponses.test.js` 11 支，已註冊進 `test:unit`） |
| Backend DB | **208 / 0**（`teaching_platform_security_test`） |
| Backend smoke | **All smoke checks passed**，含新增的 `OK  malformed requests return JSON errors without stack/paths (COR-07)` |
| Postman / Newman | **129 assertions / 0 failed** |
| `NODE_ENV=production` 複驗 | 修法在 production 模式下同樣成立（400/404 皆 JSON） |
| `npm run verify:web`（`DX-05` 隔離流程，3010 未停） | **exit 0**；3010 前後 `/`、`/login`、`/materials`、`/register` 皆 200 |
| **frontend production 檔案改動** | **0** |

canonical doc 依 CLAUDE.md §9 同步：`docs/mvp_rules.md` 新增 **§A.2 API 錯誤回應的終端契約**，
並在其中對照 §A.1（`COR-05`）說明兩個邊界為何都必要。

---

### `COR-06` 完成紀錄（2026-08-24）

**結果：代表性路由每頁 exactly one main landmark，且測試不再靠 `.first()` 迴避。**
版面／spacing／responsive 行為 **0 改動**。

#### Root cause（盤點後發現是雙向缺陷）

全 repo 共 **15 個 `<main>`**：

| 層 | 檔案 | 角色 |
| --- | --- | --- |
| 外殼 | `components/layout/RoleShell.tsx` | 非 Admin、非 `(parent)` group 的路由 |
| 外殼 | `components/dashboard/ParentAppShell.tsx` | buyer 外殼與 `(parent)` route group layout |
| 外殼 | `components/admin/AdminShell.tsx` | `/admin/*`（`RoleShell` 對它 early return） |
| 頁面 | 12 個 page component | 全部**被外殼的 `<main>` 包住** |

因此缺陷有兩個方向，原記錄只涵蓋第一個：

1. **重複** —— 12 條路由各有 2 個巢狀 main（`/`、`/materials`、`/materials/:id/reviews`、
   `/cart`、`/checkout`、`/orders`、`/orders/:id/payment-proof`、`/me/orders/:id`、
   `/me/materials/:id/feedback`、`/403`、`not-found`、`error`）。
2. **缺漏（原記錄未涵蓋）** —— `/login` 與 `/register` 是 **0 個**：`RoleShell` 對 auth 頁
   `return <>{children}</>`，而兩個頁面自己也沒有 `<main>`。

#### Canonical ownership rule

> **外殼是 main landmark 的唯一擁有者。page component 一律不得渲染 `<main>`；
> 需要容器就用 `<div>` / `<section>`。**

選 Option A（外殼擁有）而不是 Option B（頁面擁有）的依據是 repo 現況，不是偏好：
**36 條路由沒有 page-level `<main>`**（Admin 16／Creator 6／Teacher 6／`(parent)` group 2，
加上 `/downloads`、`/favorites`、`/me/materials`、`/me/orders`、`/my-reviews`、
`/materials/[id]`、`/orders/[orderId]/upload-proof`、`/login`、`/register`），
只有 12 個頁面自己渲染一個。Option A 改 12 個檔案，Option B 要為 36 個檔案補 landmark ——
而且 Option B 會讓「頁面忘了加」變成一個永遠可能發生的新缺陷類別。

**沒有混用兩種 model**：三個外殼互斥（`/admin` 與 `(parent)` group 在 `RoleShell` 上方 early return），
auth 頁由 `RoleShell` 提供**不含 chrome** 的 `<main>`，仍然是「外殼擁有」。

#### 改動

| 檔案 | 改動 |
| --- | --- |
| 12 個 page component | `<main>` → `<div>`，**class / style / id / testid 一律原樣保留**，只換標籤名 |
| `components/layout/RoleShell.tsx` | auth 頁的 early return 由 `<>{children}</>` 改為 `<main>{children}</main>`（補上缺漏的 landmark，**不加側欄**）；並在外殼的 `<main>` 上寫下 ownership 規則 |

**未改動**：layout spacing、sidebar geometry、responsive behavior、route 結構、business logic、
skip-link／`aria-labelledby`／focus target（本 repo 目前沒有 skip-link）。
三個外殼的 `<main>` class 一字未動，因此 `shell-consistency` 的幾何斷言（240px rail、
main offset）全數不受影響 —— 這也由該檔既有測試證實。

#### Accessibility before / after

| 路由群 | before | after |
| --- | --- | --- |
| `/`、`/materials`、`/materials/:id/reviews`、`/403` | **2** | **1** |
| `/cart`、`/checkout`、`/orders`、`/me/orders`、`/my-reviews`、`/downloads` | **2** | **1** |
| `/login`、`/register` | **0** | **1** |
| `/creator/*`、`/teacher/*`、`(parent)` group | 1 | **1**（未受影響） |
| `/admin/*` | 1 | **1**（未受影響 —— 走 `AdminShell`） |

#### Tests

- `shell-consistency.spec.ts` 新增 `Accessibility — exactly one main landmark`：
  **19 條代表性路由**（public 5／auth 2／buyer 6／creator 2／admin 4）× 2 個 project，
  斷言 `getByRole("main")` **`toHaveCount(1)`**。
  刻意用 `toHaveCount(1)` 而不是 `toBeVisible()` —— 後者在 `.first()` 之下即使有兩個也會過，
  鎖不住這條契約；`toHaveCount(1)` 同時擋住「2 個」與「0 個」兩個方向。
- `public.spec.ts` / `parent.spec.ts`：**移除 `.first()` 迴避**，改回 `getByRole("main")`
  （依本項 completion criteria）。`parent.spec.ts` 的 `locator("main, section")` 也一併收斂 ——
  那個 `, section` 原本就是為了在沒有 main 時仍能通過的退路。

#### 驗證

| 項目 | 結果 |
| --- | --- |
| `npm run verify:web`（`DX-05` 隔離流程，3010 未停） | **exit 0** —— lint 0 error／typecheck 0／build 50 route |
| 3010 dev server | 驗收前後 `/`、`/login`、`/materials` 皆 **200** |
| landmark targeted（19 路由 × 2 project） | **38 / 0** |
| **完整套件** | **402 passed / 0 failed / 30 skipped** —— 先前 baseline 364／0／30，**+38 恰為本輪新增的 landmark 測試**，零回歸 |

> **一項刻意未處理的觀察：** SSR 出來的 HTML 目前 `<main>` 數為 **0** ——
> `RoleShell` 是 client component 且被 `app/layout.tsx` 的 `<Suspense fallback={children}>` 包住，
> 伺服器輸出的是 fallback（沒有外殼）。landmark 在 hydration 之後才出現，
> 因此瀏覽器與輔助技術看到的是正確的 1 個（Playwright 在真實瀏覽器中驗證）。
> 這是**先前就存在**的 Suspense 行為，對所有路由一致，不是 `COR-06` 造成的；
> 修它屬於 SSR/streaming 的另一個題目，依 §10.3 未擴 scope。

---

### `DX-04` 進度紀錄（2026-08-24）—— **PARTIAL**

**已完成：opt-in helper 與所有安全性行為，且完整套件全綠（438 / 0 / 30）。**
**未完成：把它接上 buyer / creator / admin 三個 surface**（原因與最小修法見下）。

#### Root cause

`apiFetch` 只把原始 `Response` 交還呼叫端，**43 個呼叫端各自決定要不要處理 401** ——
實際上只有 `MaterialReportDialog` 有明確分支。token 在 cookie 還活著的期間被撤銷／竄改時
（JWT 7d vs cookie 1d，見本列 evidence），頁面照常渲染外殼、停在自己的空狀態上，
**使用者永遠回不到登入頁**。

#### 401 / 403 盤點

| 呼叫方式 | 數量 | 處理現況 |
| --- | --- | --- |
| 共用的 `apiFetch` | 43 個檔案 | 先前無任何集中處理 |
| 直接 `fetch("/api/auth/*")` | `login` / `register` | **刻意不經過 `apiFetch`** —— 因此結構上不可能被 session 恢復誤傷 |
| 明確處理 401/403 的 surface | 1（`MaterialReportDialog`） | 401 與 403 各自的頁內文案，**兩者語意不同，必須保留** |

**401 ≠ 403**：401 = 認證失效（可恢復），403 = 已驗證但無權限（session 仍有效）。
把 403 當成過期會把合法的權限拒絕變成莫名其妙的登出 —— 因此 403 **永不**清 session、永不導向。

#### 已完成的部分

| 檔案 | 改動 |
| --- | --- |
| `lib/session.ts`（新增） | `clearClientSession()`／`isSafeInternalPath()`／`buildLoginUrl()`／`isAuthPagePath()`／`recoverFromExpiredSession()` |
| `lib/api-client.ts` | 新增 `ApiFetchOptions.authExpiry`（**opt-in**，預設 `"inline"` = 維持既有行為）；401 ＋ 有 token ＋ opt-in 時才恢復 |
| `components/admin/AdminSidebar.tsx`、`components/dashboard/Sidebar.tsx`、`components/layout/RoleShell.tsx` | 三份**逐字相同**的登出清單收斂為 `clearClientSession()`（行為不變） |
| `app/login/page.tsx` | `?redirect=` 以 `isSafeInternalPath()` 驗證 —— 修掉一個先前存在的 **open redirect** |
| `tests/e2e/session-expiry.spec.ts`（新增） | 18 個測試 × 2 project = **36** |

**Session cleanup 範圍**：`tp_token`／`tp_role`／`tp_user_email`／`tp_display_name`（localStorage）
＋ `tp_token`／`tp_role`（cookie，`max-age=0`）。**不動使用者偏好**（測試以 `theme` 為對照組驗證）。
cookie 必須清乾淨，否則 `middleware.ts` 仍判定已登入而彈回來 —— 那就是 redirect loop。

**Return path**：沿用 repo 既有的 `?redirect=` 慣例（`middleware.ts:44` 設、`login/page.tsx` 讀），
**未自創** `next`。只接受單一斜線開頭的站內路徑，擋掉 `https://`、`//host`、`/\host`。

#### ⚠️ 未完成的部分與原因（需裁示）

「representative buyer / creator / admin flows 一致」**未達成** —— 目前沒有任何 surface opt-in。

兩種接法都試過，**都會打破既有測試**：

| 嘗試 | 結果 |
| --- | --- |
| 全域預設恢復（不 opt-in） | 完整套件 **24 支失敗** |
| 三個外殼各一次 session 探測（opt-in） | 完整套件 **26 支失敗** |

失敗集中在 8 個 spec（`admin`／`teacher`／`parent`／`public`／`creator-sales`／`critical-acceptance` 等）。
根因一致：**那些 spec 用假 token ＋ 只 mock 部分端點**，未 mock 的呼叫落到真實後端而回 401，
於是整頁被導向 `/login`。它們現在會過，**正是因為 app 會忽略 401** —— 也就是 `DX-04` 這個缺陷本身。
換句話說：**測試把缺陷當成了規格。**

**最小修法（未執行，依 §10.3 交由使用者決定）：**
為那 8 個 spec 的 mock 補上外殼會呼叫的 session 端點（`auth/me`、`orders/my`），
然後在三個外殼各 opt-in 一次（`RoleShell` 的 creator 分支、`ParentAppShell`、`AdminShell`）。
一個外殼探一次即可覆蓋該區域所有頁面，不必動 43 個呼叫端。

> **本輪一度把預設設成全域恢復，是我判斷錯誤** —— completion criteria 明寫
> 「做成 opt-in helper，**不要**全域攔截」。26 支失敗正是 criteria 擔心的 blast radius 的實證，
> 因此已改回 opt-in 並保留該實測數據作為依據。

#### 驗證

| 項目 | 結果 |
| --- | --- |
| `npm run verify:web`（`DX-05` 隔離流程，3010 未停） | **exit 0**（lint 0 error／typecheck 0／build 50 route） |
| `session-expiry.spec.ts` targeted | **36 / 0**（純函式契約 ＋ 瀏覽器行為） |
| **完整套件** | **438 passed / 0 failed / 30 skipped** —— 先前 baseline 402／0／30，**+36 恰為新增測試**，skip 數未變 |

測試涵蓋：回跳路徑安全（含 4 種 open redirect 寫法）、cleanup 範圍（偏好不被清）、
恢復動作與 latch（只恢復一次）、auth 頁不自我重導、**403 三個角色皆不登出**、
400／409／500 不被誤判、無 token 的 401 不導向。

---

### `DX-04` 完成紀錄（2026-08-24，接續上方進度紀錄）—— **DONE**

上一輪停在 PARTIAL：helper 完成，但一接上外殼就有 26 支測試失敗。本輪把**真正的阻擋物**修掉
（測試 harness），再正式接線，完整套件 **440 passed / 0 failed / 30 skipped**。

#### 阻擋物的實測結果（不沿用上輪的推測名單）

先把三個外殼接上，再讓失敗自己現形 —— 實際是 **31 支失敗 / 6 個 spec**，
不是上輪報告推測的 8 個：

| Spec | 失敗數 | 缺的 bootstrap endpoint | 原本就該 mock 嗎 |
| --- | --- | --- | --- |
| `critical-acceptance.spec.ts` | 10 | `GET auth/me` | 是 —— 它用 `installCoreApiMocks` 宣稱在 mock 環境測 UI |
| `admin.spec.ts` | 7 | `GET auth/me` | 是 —— 它有 catch-all ＋ `route.fallback()` |
| `session-expiry.spec.ts` | 6 | （本輪自己的測試已過期） | — |
| `teacher.spec.ts` | 4 | `GET auth/me` | 是 —— 只 mock 了一條 material route |
| `public.spec.ts` | 2 | `GET auth/me` | 是 —— 該步驟驗的是**角色導向**，不是 session 有效性 |
| `creator-sales.spec.ts` | 2 | `GET auth/me` | 是 —— 自己的 route 只處理 `teacher/sales/*` |

**單一缺口就是 `GET auth/me`。** buyer 的 `orders/my` 共用 helper 早就 mock 了。
這些 spec 用**假 token ＋ 只 mock 部分端點**，未 mock 的呼叫落到真實後端回 401 ——
它們過去會過，正是因為 app 會忽略 401，也就是 `DX-04` 這個缺陷本身。

#### Test-harness 修法（沒有為了測試弱化 production）

| 檔案 | 改動 |
| --- | --- |
| `tests/e2e/helpers/mock-api.ts` | `installCoreApiMocks` 補上 `GET auth/me`（修好 `critical-acceptance` 全部 10 支） |
| `tests/e2e/helpers/shell-bootstrap.ts`（新增） | `installShellBootstrapMocks(page)` —— 只 mock 外殼真正需要的 `auth/me`，其餘一律 `route.fallback()`，各 spec 既有的 route 與行為完全不受影響 |
| `admin` / `teacher` / `creator-sales` / `public` spec | 在既有 `beforeEach`（或該步驟）呼叫上述 helper，**避免 4 份 copy-paste** |
| `session-expiry.spec.ts` | 「尚未 opt-in」那組測試改為驗**真正的恢復行為** |

**明確沒有做：** 沒有改 production code 去遷就假 token、沒有關掉 401 recovery、
沒有在測試裡吞掉 redirect、沒有換成真 token、沒有全域回 200、
沒有改動任何既有 product assertion（`public.spec` 那一步驗的是角色導向，
補 mock 讓它能繼續驗原本的東西，斷言本身未改）。

#### 接線（每個外殼一次）

| 外殼 | 探測請求 | 覆蓋範圍 |
| --- | --- | --- |
| `RoleShell`（creator 分支） | `GET auth/me` | `/creator/*`、`/teacher/*` |
| `ParentAppShell` | `GET orders/my` | buyer 區與 `(parent)` route group |
| `AdminShell` | `GET auth/me`（新增的 `useEffect`） | `/admin/*` |

一個外殼探一次即可覆蓋該區所有頁面，**未在 43 個呼叫端各加一次**，
也未採全域攔截（completion criteria 明訂 opt-in）。

#### 行為

| 情境 | 結果 |
| --- | --- |
| 401 ＋ 有 session（buyer／creator／admin） | 清 session → `/login?redirect=<站內路徑>`，三個角色一致 |
| **403（三個角色）** | **不清 session、不導向** —— 已驗證但無權限 |
| 400 / 409 / 500 | 不清 session、不導向 |
| 匿名（無 token）收到 401 | 不導向 —— 公開頁的頁內錯誤態不受影響 |
| 登入／註冊頁 | 不恢復（且它們走 `/api/auth/*` direct fetch，本來就不經過 `apiFetch`） |
| 並行多個 401 | one-shot latch，只導向一次；停在 `/login` 不再跳走 |

JWT／cookie lifetime 未動，未做 token refresh，backend 契約未動。

#### Open redirect（本輪複驗，未退回）

| 輸入 | 結果 |
| --- | --- |
| `/me/orders`、`/creator/materials?x=1`、`/` | ✅ 允許 |
| `https://evil.com`、`//evil.com`、`javascript:alert(1)`、`%2f%2fevil.com`、`evil.com`、空字串 | ❌ 拒絕 |
| `/\evil.com`（瀏覽器會當成 `//`） | ❌ 拒絕（逐字元覆核 `U+2F U+5C`） |
| `/evil.com` | ✅ 允許 —— 那是**正常的站內路徑**，不是 open redirect |

#### 驗證

| 項目 | 結果 |
| --- | --- |
| `npm run verify:web`（`DX-05` 隔離流程，3010 未停） | **exit 0**（lint 0 error／typecheck 0／build 50 route） |
| 6 個受影響 spec | **219 / 0**（含 `session-expiry`） |
| **完整套件** | **440 passed / 0 failed / 30 skipped** —— 上一輪 baseline 438，**+2** 為 `session-expiry` 新增的 redirect-loop 測試；skip 數未變 |
| 3010 dev server | 全程未停，前後 `/`、`/login`、`/materials` 皆 **200** |

> 過程中 `critical-acceptance` 的「login success」在併行下失敗一次，
> 單獨重跑 **3 次皆 2/2 通過**，且失敗時 URL 是乾淨的 `/login`（沒有 `?redirect=`），
> 與本項的恢復路徑無關 —— 判定為並行 flake，最終完整套件亦為 0 failed。

---

### `DX-12` scope reconciliation（2026-08-25，**未實作**）

**結論：`DX-12` 不值得實作，改判 `ACCEPTED DEBT`；同時建立 reference-hygiene stop rule，終止 successor 鏈。**

#### 重新量測（未沿用上一輪數字，結果不同）

Backend 全部 `§NN` 共 **88 處**：**已指明文件 41**、**未指明 47 / 17 個檔案**。
上一輪記的「58 處 / 23 檔」**是錯的** —— 當時的 script 內含三個寬鬆程度不同的分類器（另外還得到 44），
我引用了其中一個而未先收斂定義。本輪的單一定義是：**同一行未出現 `.md`／`docs/`／`*.test.js` 即算未指明**。

#### 三個家族與可還原性

| 家族 | 數量 | 目標 | 可還原？ |
| --- | --- | --- | --- |
| **A. `Epic §N`**（§2–§8） | 18 / 10 檔 | 「Admin Operations UX Closure Epic」 | ❌ **從未存在於 repo** —— `docs/` 沒有這份文件，41 個 commit 的歷史中也**沒有**被刪掉的同名檔；只在 tracker 與 `ui-design-system.md` 的 changelog 各出現一次**名字** |
| **B. 測試 fixture 的 `§41`／`§49`～`§71`** | 27 / 5 檔 | 不明的編號體系 | ❌ **不可還原** —— 逐一檢查 tracker 的每個歷史版本與所有 `*.md`，**沒有任何文件**曾出現 §40–§71 的章節編號 |
| **C. 其他** | 2 / 2 檔 | 見下 | 部分 |

Family C 兩處：
- `scripts/api-smoke-test.js:803` 的「整個 §4」——上下文是退件原因，實為 **Epic §4 的行內簡寫**，歸 Family A。
- `utils/reportingRange.js:127` 的 `§10` —— **確實指錯**（`mvp_rules.md` §10 是「HTTP API 一覽」，
  `?from=&to=` 契約其實在 **§15.8 URL contract**）。這是全部 47 處裡**唯一**目標可還原且位於非測試 runtime code 的一處。

#### 價值判斷

| 判準 | 結果 |
| --- | --- |
| 會輸出到 runtime metadata（OpenAPI／API 回應）？ | **0 處** —— swagger `description` 內的未指明 `§NN` 數量為 0（對照 `DX-10` 當時**是**runtime-visible，這是關鍵差異） |
| 只存在於測試？ | Family B 全部 27 處在 `Backend/tests/`；其中 23 是註解、**4 是 `t.test()` 名稱**（會出現在測試輸出） |
| 會誤導維護者做出錯誤修改？ | **低** —— 三個家族的註解**都在同一句話裡把規則本身寫清楚**（例：「§58 half-open：台北 8/21 00:00 —— 查 8/20 不得包含」），編號不解析也讀得懂 |
| 有 canonical 替代來源？ | Family A 部分有（`mvp_rules.md` §6／§12.2、`admin-information-architecture.md`），但**逐處對應需要判斷**，對錯一次就製造一個新的錯指標 |
| 修正成本 vs 風險 | 47 處逐一考證；唯一「安全」的批次做法是把編號整批刪掉 —— 那正是 `CLAUDE.md` §10.4 禁止的 broad refactor |

#### 判定

| 家族 | 判定 |
| --- | --- |
| A. `Epic §N` | **Document debt** —— 目標不存在，逐處改寫風險大於收益 |
| B. 測試 fixture `§NN` | **Cannot safely resolve** —— 已證明不可還原；唯一安全修法是批次刪除，屬 broad refactor |
| C. `reportingRange.js:127` | **Remove stale pointer only（機會性）** —— 未通過 stop rule 第 3 條（檔頭已有正確的 §15 指標，註解本身也把規則寫清楚），因此**不列為任務**；若日後因其他理由編輯該檔，順手改成 §15.8 |

**沒有任何一處達到 Fix now。**

#### 這一輪真正的產出：stop rule

見〈Priority 語意〉底下的 **Reference-hygiene stop rule**。
三條同時成立才修、才可以開新 ID；目標不可還原、只在測試 fixture 註解或歷史紀錄、
或只能靠 bulk rewrite 修的，一律 `ACCEPTED DEBT`。
**一次 sweep 本身不構成開新項目的理由。**

---

### `DX-11` 完成紀錄（2026-08-25）

**結果：`adminOrders.service.js` 的裸 `§22` 換成可解析的雙指標；SQL 與行為未動；`adminOrdersFilter.db.test.js` 14 / 14 全綠。**

#### 這個 comment 到底在講什麼（用程式本身重新命名，不沿用舊 comment）

它修飾的是 `OPERATIONAL_STATUS_SQL` 這個 `CASE`。因為最後有 `ELSE 'awaiting_payment'`，
`CASE` 是 **total function**；又因為 `CASE` 由上而下取第一個命中，五個 bucket **互斥**。
兩者合起來 ＝ **五個 operational bucket 是 `orders` 這張表的一個 partition（互斥且涵蓋全部）**。

它**不是**在講 pending vs reviewed 的憑證分組、不是付款憑證的 partition、
不是 `orders.status` 的排除條件，也不是分頁／篩選。

#### 候選 target 逐一查證

| 候選 | 查證結果 |
| --- | --- |
| **A. `docs/mvp_rules.md` §19.2** | ✅ **成立**。`:1347` 逐字寫著「CASE 是 total function：每筆訂單恰好落在一個 bucket，五個 bucket 因此是 `orders` 的一個 **partition**（`Σ bucket = COUNT(*) FROM orders`，已由測試斷言）」——與 code comment 同一個 invariant |
| **B. `adminOrdersFilter.db.test.js` 的 partition 測試** | ✅ **成立**（`:359`），但**沒有 Case 編號** |
| **B'. 「Case 4」** | ❌ **不成立** —— `Case 4 (critical)` 是 `:247` 的「舊 rejected + 新 pending → pending_review」，是**另一個** invariant |
| **C. 其他** | 無更精確的目標 |

> **更正上一輪（`DX-10`）的紀錄。** 當時寫「真正的測試是 `:359`，該檔自己的編號是 Case 4」。
> 逐一列出 `t.test()` 後確認**這是錯的**：該檔的 `Case N` 就是測試名稱（`Case 1`…`Case 10`，另有 `Case 9.1`），
> `:359` 的 partition 測試不在編號序列內。上一輪誤把檔頭「要鎖住的六件事」那份**主題清單**的第 4 項當成 Case 編號。
> 這也正好說明 completion criteria 為什麼要求「不要在未確認原意前猜一個編號填上去」。

#### 最終決定（Option C：doc 定義契約、test 驗證契約）

```
- 五個 bucket 因此必然是 orders 的一個 partition（見 §22 invariant test）。
+ 五個 bucket 因此必然是 orders 的一個 partition（互斥且涵蓋全部）——
+ 契約見 `docs/mvp_rules.md` §19.2，由 `tests/adminOrdersFilter.db.test.js` 的
+「五個 bucket 是 orders 的一個 partition（互斥且涵蓋全部）」斷言鎖住
+（該支測試沒有 Case 編號，因此以斷言名稱指路）。
```

**測試刻意以斷言名稱指路而不是行號或編號**：行號會漂移，而編號根本不存在 —— 補一個等於再造一次 stale reference。
同檔 `:36` 既有的「`tests/adminOrdersFilter.db.test.js` Case 4」**是正確的**（那句講的正是 `Case 4`），未動。

#### 驗證

| 項目 | 結果 |
| --- | --- |
| `Backend/` 內 `§22 invariant` / `invariant test` 出現次數 | **0** |
| 新指標可解析 | `mvp_rules.md` §19.2 存在；斷言名稱在 `:359` 唯一命中 |
| `node --check` | 通過 |
| `adminOrdersFilter.db.test.js`（`teaching_platform_security_test`，連線後斷言 `current_database()`） | **14 tests / 14 pass / 0 fail**，含 partition 那支（subtest 12） |
| SQL／filter／API／test logic | **未動** |

#### 本輪 sweep 發現但未修

`Backend/` 內還有 **58 處未指明文件的 `§NN`**（`Epic §N` 15 處指向 `docs/` 不存在的文件；
測試 fixture 的 `§41`／`§49`～`§71` 30 餘處對不到任何文件章節）。同類問題但規模不同，
依本輪 §8「只記 evidence、不擴成 repo-wide comment cleanup」另立 `DX-12`。

---

### `DX-10` 完成紀錄（2026-08-25）

**結果：兩處 stale `§21` 改為 `§22`；**served** OpenAPI 實測已更新；canonical smoke 全綠；application behaviour 未變。**

#### 盤點（不只修已知的兩個）

先把 `docs/` 以外**所有** `§20`～`§23` 形式的引用列出來，再逐一分類：

| 位置 | 內容 | 分類 |
| --- | --- | --- |
| `Backend/swagger.js:2555` | `/admin/activity-logs` 的 `description` 寫 `§21` | **stale**（`DX-08` numbering drift）→ 改 |
| `Backend/scripts/api-smoke-test.js:1902` | 註解寫 `§21` | **stale**（同上）→ 改 |
| `Backend/swagger.js:1637` | `/admin/materials` 寫 `§20` | **正確**（`# 20. Admin material review queue`）→ 不動 |
| `Backend/index.js:56` | `material-file-storage-and-delivery.md §23.3` | 其他文件的章節 → 不動 |
| `Backend/services/adminOrders.service.js:54` | 裸寫的 `（見 §22 invariant test）` | **指不到東西，但不是同一個 root cause** → 另立 `DX-11` |

再用 `DX-08` 的 resolver 掃全 repo 的 `mvp_rules` 引用：**Backend 內 23 條全部可解析**。

#### 第三個 reference 為什麼不算同一個 root cause

`DX-08` 改的是 §22／§23 的**子標題**；top-level `# 22.` 本身從未被重編。
因此 `adminOrders.service.js:54` 的 `§22` **不是**被 `DX-08` 帶壞的，是獨立的既有錯誤。
它的三個候選目標也都對不上（`mvp_rules §22` 無關、內容其實在 `§19.2`、測試在
`adminOrdersFilter.db.test.js:359` 但編號是 Case 4）。目標不明確，因此**不猜**，記為 `DX-11`。

#### 改了什麼

只換 section 編號，`description` 與註解的其他文字**一字未動**：

```
Backend/swagger.js:2555          "See docs/mvp_rules.md §21."  ->  "See docs/mvp_rules.md §22."
Backend/scripts/api-smoke-test.js:1902   （docs/mvp_rules.md §21）  ->  （docs/mvp_rules.md §22）
```

#### 驗證 —— 不是只 grep source

隔離 backend：**port 3001**，`PGDATABASE=teaching_platform_security_test`（連線後以
`select current_database()` 斷言，確認 649 users）。3000 未啟動、3010 全程未動。

| 檢查 | 修改前 | 修改後 |
| --- | --- | --- |
| served `/admin/activity-logs` GET `description` 結尾 | `See docs/mvp_rules.md §21.` | `See docs/mvp_rules.md §22.` |
| served `/admin/materials` GET（對照組） | `§20` | `§20`（未變） |
| 整份 served spec 是否還有 `mvp_rules.md §21` | 有 | **無** |
| `/admin/activity-logs` 的 `parameters` | `actor_id, actor_role, action, target_type, target_id, q, from, to, page, limit` | 完全相同 |
| `responses` | `200, 401, 403, 500` | 完全相同 |
| `paths` 總數 | 58 | 58 |

canonical smoke（`API_SMOKE_BASE=http://127.0.0.1:3001`）：**All smoke checks passed**，
其中就包含註解被改動的那一支 `GET /admin/activity-logs (human-readable search + date range + filters)`。

#### Runtime impact

| 項目 | 變更 |
| --- | --- |
| application behaviour | **No** |
| API contract（path／params／response schema） | **No** |
| OpenAPI **descriptive metadata** | **Yes**（本項的重點） |
| smoke behaviour | **No**（純註解） |

---

### `DX-08` 完成紀錄（2026-08-24）

**結果：`docs/mvp_rules.md` 重複 numeric heading 由 3 組歸零；repo-wide dangling cross reference 0；只改 `docs/`。**

#### 修改前的 heading map（§20～§23）

| 章節 | 子標題 | 判定 |
| --- | --- | --- |
| `# 20. Admin material review queue` | `20.1`～`20.4` | 正確 |
| `# 21. 教材上架審核 workflow` | `21.1`～`21.4` | 正確 |
| `# 21A. 教材本體檔案與安全交付` | `21A.1`～`21A.6` | 正確（字母後綴的插入節，與 `§A.1`／`§A.2` 同樣刻意不進數字鏈） |
| `# 22. Admin activity log search` | `21.1`／`21.2`／`21.2.1`／`21.2.2`／`21.3` | **錯**——與 `# 21.` 完全重號 |
| `# 23. Admin / Creator shell 尺寸` | `22.1` | **錯**——parent/child 不一致 |

頂層鏈本身沒有跳號（`0`…`21`、`21A`、`22`、`23`），問題**只在子標題**。

#### 修正後

`# 22.` → `22.1`／`22.2`／`22.2.1`／`22.2.2`／`22.3`（sibling 連續）；`# 23.` → `23.1`。
**標題文字、章節內容、章節順序一律未動**，`§A.1`／`§A.2`／`§21A.*` 亦未動。

#### 交叉引用（先分類再改，未做批量 replace）

| 位置 | 原文 | 處置 |
| --- | --- | --- |
| `mvp_rules.md:589` | 見 §22 21.2.2 | → `§22.2.2`（自我矛盾的指路） |
| `mvp_rules.md:831` | 見 §22.2 | **不改** —— 這一處早就照「正確」編號寫，原本是 dangling，renumber 後自動指得到 |
| MVP spec `:502` | heading 21.2.1, inside section 22 | → `section 22.2.1`（criteria 明確點名的那一列） |
| MVP spec `:504` | heading 21.2.2 (inside section 22) | → `section 22.2.2` |
| MVP spec `:477`／`:502` 句尾 | section 20 ／ section 22 | **不改** —— 本來就正確 |
| `admin-information-architecture.md:167` | §22 21.3 | → `§22.3` |
| `ui-design-system.md:420` | §22.1 | → `§23.1` —— 讀上下文確認它講的是「側欄可捲動區的 `min-h-0`」，也就是搬到 `23.1` 的那一節 |
| tracker `:703`（`IA-05` 完成紀錄的 Existing Spec 欄） | §14.4、§21.2.1 | → `§22.2.1` —— 這一欄是**活的 spec 指標**而不是「當時狀態」的陳述，因此更新；完成紀錄的其他文字未動 |
| tracker `:1077`（`DX-08` 自己的 Evidence） | 引用了壞掉的編號 | **刻意保留逐字** —— 那是問題當時的證據，不是活的指標 |
| `material-file-storage-and-delivery.md` 的 `21.1`／`23.1`～`23.3` | 該文件自己的章節 | **不相關**，未動 |
| `ui-design-system.md:33` 的 `§11.8` | 指向**該文件自己**的 `### 11.8` | **不相關**（初判為 dangling，讀過上下文後確認可解析） |

#### 驗證

| 項目 | 結果 |
| --- | --- |
| `docs/mvp_rules.md` 重複 numeric heading | **0**（修正前為 `21.1`／`21.2`／`21.3` 三組） |
| parent/child 一致性 | §20／§21／§21A／§22／§23 全部一致，sibling 連續無跳號 |
| repo-wide `mvp_rules` 子章節引用解析 | 96 條可解析、**0 條 dangling**（唯二剩下的舊編號在 `DX-08` 自己的 Evidence 裡，屬歷史證據） |
| `git diff --check` | 本輪改動 0 問題（spec `:48`／`:54`／`:56` 的行尾空白是既有的 markdown 硬換行，非本輪產生，未順手清理） |
| runtime 檔案改動 | **0** |

未跑 backend tests／E2E／`verify:web` —— 本輪只有 `docs/`，completion criteria 也未要求。

#### 本輪發現但未修

`Backend/swagger.js:2555` 與 `Backend/scripts/api-smoke-test.js:1902` 也把 activity log 章節寫成 `§21`
（同一個 root cause）。因為本輪明確禁止 runtime code change，依 §10.3 **記錄後回到原任務**，另立 `DX-10`。

---

### `DX-07` 完成紀錄（2026-08-24）

**結果：三個 Playwright 產物目錄全部精確 ignore；既有產物一個都沒刪；新產生的產物不再污染 `git status`。**

#### 重新實測（未沿用舊 evidence），舊 evidence 少列了一個目錄

| 路徑 | 由什麼產生 | 修復前狀態 |
| --- | --- | --- |
| `frontend/apps/web/test-results/` | `playwright.config.ts` **未設 `outputDir`**，預設值相對 **config 所在目錄**解析 | `??` 出現在 `git status` |
| `frontend/apps/web/playwright-report/` | `--reporter=html`（config 預設 reporter 只有 `list`） | 目錄存在但**為空**，因此 git 不顯示 —— 空目錄不會出現在 `git status`，跑一次 html reporter 就會冒出來 |
| `frontend/test-results/` | 從 `frontend/` 這一層呼叫 playwright 會**找不到 config**，退回「以 cwd 為根」的預設值 | `??` 出現在 `git status`（195 筆） |

第三個目錄是舊 evidence 沒有記到的。它不是 canonical config 會產生的路徑，
但**確實存在、確實是產物、確實在污染 status**，因此一併 ignore 並在規則旁註明來由。

`blob-report/` **刻意不加**：沒有任何 script 使用 `--reporter=blob`，磁碟上也不存在該目錄 ——
沒有證據就不加 pattern。

#### ignore 規則放在哪

| 檔案 | 規則 | 理由 |
| --- | --- | --- |
| `frontend/apps/web/.gitignore` | `/test-results/`、`/playwright-report/` | `playwright.config.ts` 就在這一層，產物歸該 app 的 `.gitignore` 管（它已經在管 `/.next/`、`/.next-*/`、`/out/`、`/coverage`）。**前置 `/`** 讓規則只匹配 app 根目錄，不會誤傷 `tests/` 底下任何同名資料夾或未來的 snapshot 目錄 |
| repo root `.gitignore` | `frontend/test-results/` | `frontend/` 這一層**沒有** `.gitignore`；為了一個誤呼叫產生的目錄新開一個檔案太重，而 root 本來就用 `frontend/…` 這種完整路徑（`frontend/node_modules/`） |

**未使用**裸 `test-results/` / `report/` / `results/` 這類無錨點的廣泛 pattern。

#### 驗證

```
git check-ignore -v <path>
frontend/apps/web/test-results        -> frontend/apps/web/.gitignore:22:/test-results/
frontend/apps/web/playwright-report   -> frontend/apps/web/.gitignore:23:/playwright-report/
frontend/test-results                 -> .gitignore:18:frontend/test-results/
```

反向確認**沒有**誤傷：`tests/e2e/admin.spec.ts`、`tests/e2e/helpers/mock-api.ts`、
`docs/postman/fixtures/cover-a.png`、`docs/pending-work-tracker.md` 皆**未**被 ignore。
`git ls-files` 對三個產物路徑的命中數為 **0** —— 沒有任何產物是 tracked，
因此**不需要**（也沒有執行）`git rm --cached`。

#### 產物保留與重新生成

既有產物**一個都沒刪**（`frontend/test-results/` 的 195 筆原樣保留）。
接著實際跑一次最小測試讓 Playwright **重新寫入**產物：

```
PLAYWRIGHT_HTML_OPEN=never npx playwright test session-expiry.spec.ts
  --project=chromium-desktop -g "isAuthPagePath|buildLoginUrl" --trace=on --reporter=html
-> 2 passed (3.4s)
```

刻意加上 `--trace=on` 與 `--reporter=html`，因為**全綠的一般執行只會寫一個 `.last-run.json`**，
證明不了規則有效。結果兩個目錄都被填滿（trace 目錄、525 KB 的 `index.html`），
而 `git status` **完全沒有出現任何產物條目**。

本輪 runtime／config 檔案改動：**0**（只有兩個 `.gitignore`）。因此未跑 `verify:web` 與完整 E2E ——
completion criteria 也未要求。3010 dev server 全程未停。

---

### `DX-02` 完成紀錄（2026-08-24，含併入的 `DX-03`）

**結果：repo-wide `TODO(assert)` 由 44 歸零，完整套件 440 / 0 / 30（baseline 持平）。**

#### 起始盤點（重新 grep，未沿用舊數字）

`admin.spec.ts` 12、`parent.spec.ts` 11、`public.spec.ts` 11、`teacher.spec.ts` 6、
`api-proxy.spec.ts` 3、`material-report.spec.ts` 1 —— 合計 **44**。

#### 分類與處置

| 類別 | 數量 | 處置 |
| --- | --- | --- |
| **A** 真的缺斷言 | 21 | 補上以**使用者可見結果／URL／API 請求**為主的斷言 |
| **B** 已被更強的專屬測試覆蓋 | 12 | 刪 TODO 並在原地註明由哪一支覆蓋，不重複測 |
| **C** 產品行為已改、原前提不成立 | 7 | 改寫成現行 canonical 契約；**不補假 UI** |
| **D** 併入的 `DX-03` stale workflow | 2 | 刪除；**未**還原 legacy UI |
| **E** 非 acceptance gap 的說明文字 | 1 | 改寫敘述，不再包含 `TODO(assert)` 字樣 |
| **F** fixture 不足才驗不了 | 6 | **補 mock**，不弱化斷言 |

#### 併入的 `DX-03`（兩處，必須明確交代）

原記錄的行號 `279 / 318` 早已位移到 `376 / 415`，內容是
`reports mark-reviewed button updates row state` 與 `mark-reviewed state updates and shows feedback`。
該按鈕已於 **2026-08-23** 隨檢舉案件 workflow 收斂而移除（legacy `reviewed` 現為唯讀終態）。
兩處**一律刪除**，並在原地寫明「不得為了這條待補斷言把舊 UI 加回來」，
同時指向現行正確行為的覆蓋：`admin-operations.spec.ts` 的
「legacy reviewed cases render as closed, not as broken rows」與
「legacy reviewed cases are shown as legacy, not as a normal resolution」。

#### 逐檔

| 檔案 | 起始 | 處置摘要 |
| --- | --- | --- |
| `material-report.spec.ts` | 1 | E —— 檔頭說明引用舊字串，改寫敘述 |
| `api-proxy.spec.ts` | 3 | A ×3 —— health 回 `{status:"ok"}`；登入 401 回 `invalid credentials` 且**不得**帶 token／cookie；註冊缺 `role` 固定 400，且 proxy **不得**發 redirect 或寫 cookie |
| `teacher.spec.ts` | 6 | A ×4 ＋ F ×2 —— 狀態篩選與分頁（補 12 筆 fixture 才驗得出來）、空表單必填、著作權聲明 gate、儲存成功／500 失敗 |
| `admin.spec.ts` | 12 | B ×7、C ×2、D ×2、**A ×1** —— activity-log **分頁先前完全沒有覆蓋**，就地補上（`page=2` 真的送到 API 且內容換頁） |
| `parent.spec.ts` | 11 | A ×5、B ×4、C ×2 —— 購物車加減數量／取消勾選改變總金額、空購物車、憑證必選、下載 signed URL 失敗訊息、my-reviews 空狀態 |
| `public.spec.ts` | 11 | A ×7、C ×3、B ×1 —— hero 文案、buyer 導向 `/dashboard`（原 TODO 寫的 `/materials` 是舊行為）、登入／註冊驗證、清單 fixture、訪客加入購物車不被靜默帶進購買流程、回饋空狀態 |

#### 順帶發現的**真實測試缺陷**（非 production bug）

`parent.spec.ts` **一直在 `/login` 上通過**。`ParentAppShell` 的 `DX-04` session 探測
（`orders/my`）用假 token 打到真後端而回 401 → 導向 `/login`；
而登入頁自 `COR-06` 起也有 `main` landmark，於是「`main` 可見」這種斷言安靜地通過。
補上外殼 bootstrap mock 後才真的測到目標頁。
共用 helper `installShellBootstrapMocks` 因此擴充為同時涵蓋 `auth/me` 與 `orders/my`。

#### 驗證

| 項目 | 結果 |
| --- | --- |
| repo-wide `TODO(assert)` | **0**（另檢查 `TODO: assert` / `TODO assert` / `FIXME(assert)` 等規避寫法，皆 **0**） |
| 六個檔案 targeted | 全部 0 failed |
| `npm run verify:web`（`DX-05` 隔離流程，3010 未停） | **exit 0** |
| **完整套件** | **440 passed / 0 failed / 30 skipped** —— 與 baseline 一致（本輪只補斷言，未新增 test case） |

**production 檔案改動：0。** 全部是測試與 fixture。

---

### 已從 active backlog 移除：dev server 重複 render Admin shell

全 repo **沒有任何**關於此現象的紀錄（`docs/`、`frontend/` 對「重複 render」／`double render`
／「重複渲染」的 grep 皆無命中），也沒有 ticket。無證據、不可重現 → **移出 active TODO**。
若日後再次觀察到，先確認 production build 與 Playwright 是否同樣重現，再決定是否立案。

---

## 10. Recently Completed

**保留這一節是為了防止未來的 audit 把它們重新提出來。**
每一項都在本輪（2026-08-23）以 code / schema / tests 重新確認。

| 項目 | 完成日 | 驗證證據 |
| --- | --- | --- |
| **`IA-01` Teaching Feedback Contextualization** | 2026-08-23 | 「教學回饋」已不是 Admin 一級導覽（desktop 側欄與 mobile drawer 同時驗證）；唯讀脈絡 `components/admin/MaterialFeedbackContext.tsx` 掛在檢舉案件詳情與教材檢舉脈絡頁，只用既有的 `/materials/:id/rating` 與 `/reviews`，**未新增 API、未做 moderation**；`/admin/reviews-hub` route 保留可直達。**驗證：** lint 0 error、typecheck exit 0、`admin-operations.spec.ts` 64/0（含 2 支新測試）、sidebar／static route 4/4、`shell-consistency.spec.ts` 全數通過（2 支冷編譯逾時重跑後通過）。**最終 build 驗收已於 2026-08-23 reconciliation 輪次補齊**：冷 `.next` 的 `verify:web` exit 0（lint 0 / typecheck 0 / build 50 route）＋ production build 上 `admin.spec.ts` 66/0。完整證據見 **§4.1** |
| **`IA-04` Dashboard Attention Orders** | 2026-08-23 | 「最近訂單」→「需要注意的訂單」：只顯示 Backend `operational_status ∈ { payment_rejected, pending_review }` 的訂單，**篩選在 API 端**、**未新增任何 SLA／逾期規則**；徽章改用從 `admin/orders/page.tsx` 原樣搬出的共用 formatter（`ADMIN_ORDER_OPERATIONAL_STATUS_LABEL`），**既有 Admin Orders 文案零變更**；CTA 深連結到既有的付款審核（`?status=all&q=<order id>`，`all` 是必要的，否則被退回那筆會被預設篩選藏起來）。**驗證：** `admin.spec.ts` 66/0（production build）、`verify:web` exit 0。完整證據見 **§4.2** |
| **`IA-05` Dashboard Important Activity** | 2026-08-23 | 「最近活動」→「需要注意的活動」：`ATTENTION_ACTIVITY_ACTIONS` allowlist 送給 API 篩選（**不抓大 window 再前端 filter**）、文案一律走既有的 `describeActivity()`、每列導向既有 entity 紀錄或檢舉案件入口。Backend 唯一改動是 `GET /admin/activity-logs` 的 `action` 接受逗號分隔多值：parameterized `= ANY($n::text[])`、單值語意不變、空值 = 不篩選、排序／分頁不變、**無 schema change、無新 endpoint**。**驗證：** unit 124/0、db 175/0（含新檔 `adminActivityLogs.db.test.js` 8/0）、smoke exit 0、Postman 111/0、`admin.spec.ts` 66/0、`verify:web` exit 0。完整證據見 **§4.2** |
| **`IA-07` Placeholder Users / Settings 移出 primary Sidebar** | 2026-08-23 | 「用戶管理」與「系統設定」已不是 Admin 一級導覽（desktop 側欄與 mobile drawer 共用同一份 `sections`，兩邊都驗）；`/admin/users`、`/admin/settings` **route 保留可直達**且維持誠實的 placeholder（**未實作任何 users／settings workflow**），`/admin/users/:userId/activity-logs` 這條依人查詢入口未斷。**驗證：** lint 0 error、`tsc --noEmit` exit 0、sidebar 2/0、static routes 2/0、drawer 2/0、`shell-consistency.spec.ts` 28/0、`IA-01` 回歸測試 4/0。**最終 repository build 已於 2026-08-23 final reconciliation 補齊**：冷 `.next` 的 `verify:web` 一次通過（lint 0／typecheck 0／build 51 route），並在 production build 上重跑 `admin.spec.ts` 全套 0 failed 與 drawer／static route targeted 測試。**已無未完成項目。** 完整證據見 **§4.3** |
| **`IA-02` Activity Log meta 人話化與 detail page 遷移** | 2026-08-23 | 新增 `describeActivityMeta(log)`：**吃整筆 log**，同一個 key 在不同 action 下走不同語意（`to`／`reason`／`status`），未登記的 key **不丟棄**（落到第三層 raw），null／`{}` 不渲染空區塊，`meta` 非物件時整段退回 raw。新檔 `components/admin/ActivityLogCard.tsx` 成為五個使用點（全站列表、單筆詳情、materials／orders／users 三個 entity 頁）的**唯一** renderer，IA §6 三層齊備且第三層欄位一個未少。Backend `GET /admin/activity-logs/:id` 改用 service `getLogById()`，與清單共用 `ENRICHED_SELECT`／`serializeRow` → 詳情頁拿得到 `actor_email`／`target_label`；**無 schema change、無新 endpoint、404 與 id 查找語意不變**。**驗證：** unit 124/0、db 178/0（`adminActivityLogs.db.test.js` 11/0，含 `getLogById` 三支）、smoke exit 0、Postman 111/0、冷 `.next` `verify:web` exit 0、production build 上 meta humanization 10/0。完整證據見 **§4.4** |
| **`IA-08` Admin 導覽單一 source of truth** | 2026-08-23 | Admin 在**非** `/admin` 路由（`/materials`、`/` 等）看到的側欄與抽屜，先前是 `RoleShell.tsx` 獨立抄寫的第二份清單，仍列出 `/admin/users`／`/admin/settings`／`/admin/reviews-hub` 三個已下架入口 —— `IA-01` 與 `IA-07` 的收斂只在 `/admin/*` 生效。改為新檔 `lib/admin-nav.ts` 作為**唯一** source of truth：`AdminSidebar` 用 `ADMIN_NAV_SECTIONS`（分組 ＋ icon），`RoleShell` 用由它 `flatMap` **衍生**的 `ADMIN_NAV_ITEMS`。**未改任何導覽項目、無 API 改動、無 route 增刪**；三條下架 route 保留可直達（實測 200）。**驗證：** lint 0 error、`tsc --noEmit` exit 0、新增 desktop＋mobile E2E 與 `IA-01`／`IA-07` 既有 drawer 測試 4/0、`shell-consistency.spec.ts` 全套 29/1（唯一失敗為既有的 `DX-06` `boxOf()` race，單獨重跑 2/2 通過）、`admin.spec.ts` sidebar／static 4/0、`admin-operations.spec.ts` teaching feedback 4/0。完整證據見 **§4.6** |
| **`IA-06` Admin Orders Search / Buyer Email Lookup** | 2026-08-23（實作）／2026-08-24（settled-tree 驗收） | `GET /admin/orders` 加上 `q`（訂單編號／買家 Email，`ILIKE` ＋ `%`/`_` 跳脫）與分頁（`utils/adminQuery.js` **同一份**契約），回應新增 `buyer_email` 與 `pagination`，count 與 list 共用同一份 `WHERE`／`FROM`，排序 `created_at DESC, id DESC` 保證分頁決定性；前端改用 `useListQueryState` ＋ `DataToolbar`／`FilterTabs`／`Pagination`，依 IA §7 不加重新整理。**驗證（settled tree）：** unit 124/0、db 181/0、targeted DB test 14/0（含 wildcard 跳脫與 clamp）、smoke exit 0、Postman 119 assertions/0 failed、`IA-06` E2E 10/0。詳見 §4.7 |
| **`IA-03` Entity-centric Activity Entrances** | 2026-08-23 | 付款審核面板 → `/admin/orders/:orderId/activity-logs`；檢舉案件詳情 → `/admin/materials/:materialId/activity-logs`。兩個入口都連到**既有** entity 路由，**未新增任何 route、未產生第二套 workflow**。**驗證：** production build 上真實點擊 ＋ URL ＋ timeline 渲染，desktop＋mobile **4/0**。完整證據見 **§4.4** |
| **`SEC-02` Material Media Private Storage** | 2026-08-24 | 教材行銷素材（封面／詳情圖／試看影片）搬離公開 `express.static`，改為**條件公開**交付：可見性由**所屬教材的 `status`** 決定，因此下架立即生效。root cause 是三種檔案資產裡只有素材**沒有 metadata 記錄**，交付時無從判斷該不該放行 → 新增 `material_media_files` 表（純 `CREATE TABLE`，**無資料搬移** —— 實測兩個 DB 素材 URL 100% 為外部連結、磁碟 0 檔案）。新增 `GET /materials/media/:mediaId`（`optionalAuth`，公開素材匿名可取且可快取，其餘 401/403）；舊路徑 `/uploads/material-media/*` → 404。**驗證：** unit **139/0**、db **205/0**、smoke exit 0、Postman **129 assertions / 0 failed**、冷隔離 distDir 的 `verify:web` **一次 exit 0**（50 route）、`material-media-security.spec.ts` **16/0**（含經檢舉處置真實下架後的匿名撤回）、相鄰三支 E2E **36/0**。完整證據見 **§1.3** |
| **`BUY-01` 買家端檢舉送出 UI** | 2026-08-24 | 產品決策拍板為「補回買家檢舉 UI」（替代選項在 schema 與既有端點上無立足點，見 §5）。教材詳情頁 `/materials/:id` 頁尾新增「檢舉這個教材」＋ 檢舉 dialog，成為平台**唯一**能產生新檢舉的入口；理由維持**自由文字**、入口對所有訪客可見、非買家在 dialog 內被擋且**不送出請求**。**backend / schema / migration 零改動**，只動 2 個 runtime 檔（`MaterialReportDialog.tsx` 新增、`MaterialDetailPage.tsx` +31/-1 行），與 `IA-01`～`IA-08` 及 `SEC-02` 的可能落點檔案零重疊。規格同步落在 `mvp_rules.md` §6.5／§6.6、MVP spec §9、`materials-detail-spec.md` §9 第 13 項、CLAUDE.md §5。**驗證：** lint 0 error、typecheck exit 0、build 成功（50 route）、`material-report.spec.ts` **6/6**（desktop＋mobile）、完整套件 **323 passed / 23 failed / 32 skipped**（23 支失敗逐群歸因於既有 `DX-01`，另 6 支因環境不合格未取得有效結果 —— 逐項依據見 §5）。完整證據見 **§5「`BUY-01` 詳細」** |
| **`DX-05` 驗收流程與 dev server 的 `.next` 隔離**（含已併入的 `DX-09`） | 2026-08-24 | root cause 是 `.next` 為**沒有 per-consumer 隔離的共用可變目錄**：build 會換掉 `BUILD_ID` 與 manifest，讓同一棵樹上執行中的 `next dev` **整站回 500**（且剛啟動時假性通過健康檢查）；反向則讓 build 倒在 `EPERM: open '.next\trace'`，而且是**寫壞之後才失敗**。機制（`next.config.ts` 的 env-gated `distDir`）先前已就位，但 canonical 的 `verify:web` 未採用 —— 隔離靠人記得，所以問題沒真正關閉。**本輪把流程接上：** 新增 `frontend/scripts/verify-web.mjs`，三個階段（`lint:web` → `typecheck:web` → `build:web`，含 `next typegen`）統一注入 `NEXT_DIST_DIR=.next-verify` 並拒絕 `.next`；`frontend/package.json` 的 `verify:web` 改指向它（**同一個 script name，未新增 `verify:web:isolated` 這類第二套 convention**）；`playwright.config.ts` 在 `E2E_SERVER=production` 時套用同一個預設值，讓 `next start` 讀到剛驗收的產物。用 Node wrapper 而非行內環境變數，是因為 npm 在 Windows 走 cmd.exe 且 repo 無 `cross-env`。**`next dev` 維持預設 `.next`，行為完全不變；application runtime code 0 檔改動。** **驗證（全程不停 3010 的 dev server）：** dev pid **13660 未變**、`verify:web` 連續 **2 次 exit 0**（50 route）、驗收後 `/`／`/login`／`/materials`／`/register` 皆 **200**、`/admin` **307**、無 500 無 manifest error；`.next` **始終無 `BUILD_ID`** 且只有 `*-development` webpack cache，`.next-verify` 為 `*-production` ＋ 有 `BUILD_ID`；run 2 前後 `.next` 的差異逐條檢查**全部是 dev-only**。production E2E 在**未手動設定 `NEXT_DIST_DIR`** 下由 Playwright 自行啟動 `next start`：`public`＋`shell-consistency`＋`payment-proof-security` **52/0**、`admin.spec.ts` desktop **38/0**；對照組 `next start` 不設變數 → `Could not find a production build in the '.next' directory`（決定性）。完整證據見 **§9〈`DX-05` 完成紀錄〉** |
| **`DX-06` `shell-consistency` `boxOf()` race** | 2026-08-24 | **先重現再修，產品程式碼 0 檔改動。** 根因取得直接證據：`boxOf()` 對同一個 locator 做三次獨立量測，`expect.poll` 只證明「某一瞬間量得到」，其後**第三次** `boundingBox()` 是全新 evaluation —— hydration／client render 在兩次讀取之間換掉節點就回 `null`。修復前的失敗堆疊指向 `spec.ts:64`（`if (!box) throw`）而非 `:62`，證明 poll 是通過的、倒下的正是那次多餘重讀。修法：poll 的 callback 把量到的 box 寫進 holder，成功那一次即回傳值，**poll 之後不再讀第二次**；**無 sleep、無調高 timeout、無改 sidebar layout、無降低斷言精度**，一處修改覆蓋全部 15 個 call site（desktop 幾何與 mobile drawer 共用）。**驗證（隔離 production：`.next-verify` ＋ 3011 ＋ isolated backend 3001 ＋ `teaching_platform_security_test`）：** 修復前兩 project 併行 × 5 → **2 次失敗**；修復後同組合 × 5 → **5/5（每次 106/0）**、`shell-consistency --repeat-each=10` → **300/0**、幾何 targeted `--repeat-each=12` → **228/0**、`shell-consistency` 全套 **30/0/30**、lint 0 error、typecheck exit 0、完整套件 **364 passed / 0 failed / 30 skipped**（與 `DX-01` baseline 一致，零退步）。完整證據見 **§9〈`DX-06` 完成紀錄〉** |
| **`DX-01` Buyer / public E2E 套件回到全綠** | 2026-08-24 | 四群失敗逐一取得根因，**全部是測試端過期，production runtime 0 檔改動**：(1) `public.spec.ts` 斷言訪客首頁的 `購物車` 連結（只存在於 parent 導覽，且 `/cart` 是 login-required）與 mobile 抽屜內的 `教材列表`，以及 seed 詳情頁一整套已不存在的 emoji 摘要文案（`📦 34 張圖卡` 等，全 repo grep 命中 0）；(2) `parent.spec.ts` 只寫 localStorage，middleware 讀 cookie → 每頁被導向 `/login`；(3) `helpers/mock-api.ts` 的 `GET /cart` 回非契約欄位 `qty`（Backend 與型別皆為 `quantity`）→ checkout `subtotal` 變 `NaN`→`null` → 折扣算成 0，即既有的「cart subtotal = 0」；(4) legacy-reviewed 案件的 mock 不分 query string ＋ `toHaveCount(0)` 與載入競賽。另有兩個測試端 selector 過期：登入／註冊頁新增 SSO 佔位按鈕造成 strict-mode 3 元素、外殼與頁面各有一個 `<main>` 造成 strict-mode 2 元素（後者已另立 **`COR-06`**，產品端未改）。**驗證（隔離 production 環境：`.next-verify` ＋ 3011 ＋ isolated backend 3001 ＋ `teaching_platform_security_test`）：** lint 0 error、typecheck exit 0、targeted `public`＋`parent` **18/0**（修復前 4/14）、`critical-acceptance.spec.ts` **36/0**（先前 34/2）、legacy-reviewed **4/0**、完整套件 **364 passed / 0 failed / 30 skipped**。完整證據見 **§9〈`DX-01` 完成紀錄〉** |
| **`COR-01` Buyer Order Progress State — Re-upload Alignment** | 2026-08-23 | 買家進度改為 **latest-proof 語意**，canonical 定義收斂到 `Backend/services/buyerOrders.service.js`（list 與 detail 共用同一段 SQL）；latest-proof 排序抽成 `LATEST_PROOF_ORDER_BY_SQL` 與 admin 共用。**驗證：** unit **124/0**、db **167/0**（新增 14）、smoke exit 0（含退件→重新上傳的真實 HTTP 路徑與 Admin `pending_review` 對齊）、Postman **111/0**、`lint`/`typecheck`/冷 `.next` `build` 皆 exit 0、`buyer-order-progress.spec.ts` **10/10**（desktop＋mobile）。完整證據見 **§1.1** |
| **`SEC-01` Payment Proof Private Storage** | 2026-08-23 | 憑證移入 `private-storage/payment-proofs/`；公開路徑由 `Backend/index.js:41` 於 static **之前**擋掉；授權讀取 `GET /orders/:orderId/payment-proofs/:proofId/file`（Admin 或訂單擁有者）。**獨立覆核：** unit **124/0**、db **153/0**、smoke exit 0、Postman **111 assertions / 0 failed**；兩個 DB `legacy_public` = **0**、`legacy_missing` = **0**；`uploads/payment-proofs/` **0 檔案**；未授權讀取 **401**、舊公開路徑 **404**；`verify:web` 三階段（lint 0 error／typecheck 0／build 0，36 route）皆通過；**E2E closure** 於 production build 上完成 —— payment review 7/7、新增的 `payment-proof-security.spec.ts` 6/6，涵蓋 buyer upload、admin inline preview、approve、reject、anonymous 401、non-owner 403、legacy 公開 URL 404。完整證據見 **§1.2** |
| **Material Review Workflow（Q1–Q9）** | 2026-08-23 | `Backend/utils/materialWorkflow.js:68` `ALLOWED_TRANSITIONS`（四狀態齊備）、`:63` `CREATOR_ACTION_STATUSES`；`db/db_schema.sql:61-64` review snapshot 欄位（`review_reason_code` / `review_note` / `reviewed_by` / `reviewed_at`）；`materialReview.db.test.js` 已註冊於 `run-db-tests.js:28`；`MaterialReviewPanel.tsx`、`AdminReviewWorkspace.tsx` 存在 |
| **Legacy `reviewed` containment** | 2026-08-23 | `reportWorkflow.js:90` `LEGACY_TERMINAL_STATUSES`、`:121` 註解、`:127` `reviewed: []`（不可再轉移）；`admin-labels.ts:39` `LEGACY_REPORT_STATUSES`；`/admin/materials/[id]/reports` 已無處置動作；Postman 正式流程改用 `investigate → resolve`；歷史資料未回填 |
| **Dashboard actionable report count** | 2026-08-23 | `adminDashboard.service.js:151-154`（`pending` + `investigating`，`awaiting_creator` 刻意不計）、`:239-242` `actionableReportsCount` |
| **Material File Upload & Secure Delivery（P0）** | 2026-08-23 | `db_schema.sql:54-55` `approved_file_id` / `pending_file_id` ＋ `:115-120` FK/index；`services/materialFile.service.js`、`utils/materialFilePolicy.js`、`config/privateFileStorage.js`（production fail-closed）；3 支測試（`materialFile.db.test.js` / `materialFilePolicy.test.js` / `materialFileStorage.test.js`）；`file_key` 已移出 public payload |
| **Admin IA Audit** | 2026-08-23 | `docs/admin-information-architecture.md`（audit 本身已完成落盤；其中未實作項目 → 本檔 §4） |
| **Refresh / Queue UX** | 2026-08-23 | `components/ds/RefreshControl.tsx` ＋ 三個佇列頁全部落實（`admin/materials`、`admin/payment-proofs`、`admin/reports`）；非佇列頁刻意不提供 |
| **Review Workspace 共用高度／捲動** | 2026-08-23 | `components/admin/AdminReviewWorkspace.tsx` |
| **Ghost draft 選項移除（Creator UI）** | 2026-08-23 | `lib/material-status.ts` ＋ Creator 教材頁 |
| **`/admin/materials/[id]/reports` 降為 contextual read-only** | 2026-08-23 | 該頁已無「標記已處理」按鈕 |
| **Activity Log 全站列表人話化** | 2026-08-23 | `lib/admin-labels.ts:341` `describeActivity()` ＋ `ACTION_CATALOG` / `TARGET_TYPE_LABEL` / `actorRoleLabel()`；`activity-logs/page.tsx:342` raw 收進第三層。**注意：** `meta` 本身與 detail page 仍未處理 → `IA-02` |
| **Entity activity-log 路由** | 2026-08-23 | `/admin/{materials/[materialId],orders/[orderId],users/[userId]}/activity-logs` 三條路由都存在；教材與訂單的入口已補（付款／檢舉未補 → `IA-03`） |
| **Admin Orders operational filter** | 2026-08-23 | `adminOrders.service.js:75` `parseOperationalStatusQuery()`；非法值回 400 而非靜默空清單。**搜尋／Email／分頁已由 `IA-06` 補齊**（2026-08-24 驗收，見 §4.7） |

> **2026-08-24 settled-tree 重驗（本節數字未改寫，僅補充）：**
> 上表各列的驗證數字取自各自的實作輪次。本輪在 settled tree 上重跑後的整體數字為 ——
> unit **139/0**、db **205/0**、smoke **exit 0**、Postman **82 requests / 129 assertions / 0 failed**、
> 冷 `.next` 的 canonical `verify:web` **單次 exit 0**（50 route）、
> security E2E **58/0**（含 `payment-proof-security` **12/12**）、完整套件 **347 / 17 / 30**。
> 上表所有標記 DONE 的項目在 settled tree 上**逐檔覆核仍然成立**，無覆蓋、無 stale caller。

### 10.1 後續完成（2026-08-24 之後）

> **2026-08-28 tracker reconciliation 補記。** 上表最後更新停在 2026-08-24，其後完成的項目
> 只同步了 Status、Current Focus 與 Next Up 三處，**未回填本節**，違反 CLAUDE.md §11.5
> 「完成時必須同步四處」。本節依各項既有的 Status 欄與完成紀錄補齊，**完成日與證據皆取自
> 各項當輪的紀錄，未重新執行任何測試**；詳細證據留在原處，不在此重複。

| 項目 | 完成日 | 驗證證據所在 |
| --- | --- | --- |
| `COR-02`（採用 (b)）／`COR-03`／`COR-04` | 2026-08-24 | §5 各自的〈完成紀錄〉 |
| `COR-05`（選 400）／`COR-06`／`COR-07` | 2026-08-24 | §5 各自的〈完成紀錄〉 |
| `DX-02`（含已併入的 `DX-03`）：repo-wide `TODO(assert)` = 0 | 2026-08-24 | §9 |
| `DX-04` 三個外殼皆已 opt-in | 2026-08-24 | §9 |
| `DX-07` 三條精確規則 | 2026-08-24 | §9 |
| `DX-08` heading 重複 = 0 | 2026-08-24 | §9 |
| `DX-10`／`DX-11`（採 Option C：契約指向） | 2026-08-25 | §9 |
| `P1-01`～`P1-06`、`P1-07`、`P1-08`、`P1-10`、`P2-04` | 2026-08-25 | §2.2（完成紀錄）／§2.3（第二批完成紀錄） |
| `SCHEMA-01` canonical 對齊實況（TEXT UUID） | 2026-08-26（Wave 2 #7） | §1.4 |
| `SCHEMA-03` migration `20260827b_legal_document_requires_reconsent.sql` | 2026-08-27 | §1.4 |
| `W2-10`／`W2-11`／`W2-12`／`W2-13` | 2026-08-27（Wave 2 #10～#13） | §1.4、§2.3 |
| `H-1`（平行 P1-09 session） | 2026-08-27 | §1.4 |
| `DEC-06`（註冊姓名）／`DEC-08`（browser-local analytics） | 2026-08-27 | §1.4 |
| `BUY-02` 全域申訴入口 | 2026-08-27 | §1.4 |
| `OPS-02` 凍結 Admin UI ＋ reason taxonomy | 2026-08-27 | §1.4 |
| `DX-14` forward fix（既有壞資料回填拆為 `DX-16`） | 2026-08-27 | §1.4 |
| `DX-17` duplicated role landing mapping | 2026-08-27 | §1.4 |
| `OPS-03` `legalDocumentPublishPolicy.js`（7 個營運理由碼） | 2026-08-28 | §1.4 |
| `OPS-04` privacy-request domain（獨立兩表 ＋ route namespace） | 2026-08-28 | §1.4 |
| `BUY-04` 買家導覽「通知設定」dead nav item 移除（`DEC-10`；desktop ＋ mobile 單一 config） | 2026-08-28 | §1.4；`tests/e2e/buyer-shell-dead-affordance.spec.ts` |
| `BUY-05` 側欄頁尾 `#account` 假互動移除，改為純識別呈現（`DEC-11`；collapsed rail ＋ expanded footer） | 2026-08-30 | §1.4；同上 spec |
| `BUY-06` Topbar 通知鈕 ＋ 未讀紅點移除（`DEC-12`；`BellIcon` 一併刪除） | 2026-08-30 | §1.4；同上 spec |
| `BUY-03` Floating Help dead affordance 移除（`DEC-09`）—— **先 partial，後經 CC (4) 重新驗證通過才關閉** | 2026-08-28 實作／**2026-08-30 關閉** | §1.4；同上 spec |
| `DX-18` `complaint-global-entry.spec.ts` mobile 結構性失敗修正（**test-only，production code 0 改動**） | 2026-08-30 | §1.4；`tests/e2e/complaint-global-entry.spec.ts` 兩個 project 12/12 |
| `DX-15` `/` 角色導向改為 **server-side middleware redirect**，解除 client-hydration race | 2026-08-30 | §1.4；`middleware.ts` ＋ `public.spec.ts`；repeat matrix 0/40，連續兩次完整平行套件 DX-15 family 0 failures |
| `REL-01` working tree preservation checkpoint（5 顆 commit，318 檔進版控） | 2026-08-30 | §1.4 `REL-01`；branch `chore/rel-01-preservation-checkpoint`，`70f77f5` → `91574a1`；unit 213/213、DB 470/470、smoke exit 0、Postman 129/0、`verify:web` exit 0、E2E 595/39/0 |
| `DOC-01` post-`REL-01` canonical documentation reconciliation（D1～D6） | 2026-08-30 | §1.4 `DOC-01`；本檔 §0／§1／§2／§2.1／§17、`CLAUDE.md` §5、`docs/mvp_rules.md` §4、baseline Gate 表、`ui-design-system.md` §4.3 |
| `TEST-01` public legal route 404 / no-draft-leak 回歸護欄（4 route × 2 project ＋ backend contract） | 2026-08-30 | §1.4 `TEST-01`；`tests/e2e/legal-publication-security.spec.ts`；focused 10/10、完整套件 605 passed / 39 skipped / 0 failed、`verify:web` exit 0；`legal_documents` 測試前後皆 0 列 |
| `DX-19` E2E live-backend 前置條件明示化（harness 接管 backend 生命週期 ＋ 資料庫 guard） | 2026-08-30 | §1.4 `DX-19`；`playwright.config.ts`、`tests/e2e/global-setup.ts`、`tests/e2e/helpers/backend-prerequisite.ts`；三個 scenario 實測；完整套件 605 / 39 / 0（與 baseline 相同）、`verify:web` exit 0 |
| `A11Y-01` keyboard focus-visible 收斂（7 處 ＋ dialog 關閉鈕，收斂到 repo canonical outline pattern） | 2026-08-30 | §1.4 `A11Y-01`；`tests/e2e/focus-visible.spec.ts`；真實瀏覽器鍵盤／指標雙向驗證；focused 6/6、完整套件 611 / 39 / 0、`verify:web` exit 0 |
| `DX-20` Git text/binary 分類正規化（`.gitattributes` ＋ 移除原始碼 literal NUL） | 2026-08-30 | §1.4 `DX-20`；`.gitattributes`、`tests/e2e/material-media-security.spec.ts`；fresh CRLF checkout 位元組一致性實驗；fixture SHA-256 未變；focused 16/16、完整套件 611 / 39 / 0、`verify:web` exit 0 |
| `OPS-05` 法律文件發布之營運就緒（dry-run-only 前置檢查 ＋ runbook；**未發布任何文件**） | 2026-08-30 | §1.4 `OPS-05`；`utils/legalPublicationPreflight.js`、`scripts/legal-publication-preflight.js`、`tests/legalPublicationPreflight.test.js`、`docs/local-development-and-operations.md` runbook；unit 223/223、DB 470/470、smoke exit 0、TEST-01 10/10；`legal_documents` 前後皆 0 列 |
| `READINESS-02` fresh MVP launch readiness re-audit（audit-only，未修任何發現） | 2026-08-31 | §1.4 `READINESS-02`；`docs/readiness-audit-round-2-2026-08-31.md`；unit 223/223、DB 470/470、smoke exit 0、Postman 129/0、`verify:web` exit 0、E2E 610/39/1（該失敗隔離 5/5 全過） |
| `REL-02` detached 通知 promise 的 rejection 邊界（`R2-008`） | 2026-08-31 | §1.4 `REL-02`；`utils/bestEffortDispatch.js`、`tests/bestEffortDispatch.test.js`（7 case，含 runtime 子 process 對照）；unit 230/230、DB 470/470、smoke exit 0（另以不可達 SMTP 重跑一次仍全過）、E2E 611 passed / 39 skipped / 0 failed |
| `DX-21` 完整套件間歇性登入失敗的根因修正（`R2-009`） | 2026-08-31 | §1.4 `DX-21`；`tests/e2e/helpers/hydration.ts`、`tests/e2e/hydration-guard.spec.ts`；A/B 1/80 → **80/80**；`verify:web` exit 0；E2E 615 passed / 39 skipped / 0 failed；production 程式碼 0 改動 |
| `PRE-05` 全新資料庫 provisioning 驗證（含修復 `materials.file_key` provisioning 缺陷） | 2026-08-31 | §1.4 `PRE-05`；`docs/pre-05-fresh-database-verification-2026-08-31.md`；三個可拋棄庫、定義層級結構比對、idempotency、smoke 73 項；unit 230/230、DB 470/470；既有兩庫指紋 byte-identical |

> **`BUY-03` 的狀態歷程（保留，不抹除）：** 它曾於 2026-08-28 被列入本表，隨後**更正為 `OPEN — PARTIAL`** 並**從本節整列撤下** —— `#help` 的功能實作確實完成，然而其 Completion Criteria (4)（買家外殼不得再有任何 `href="#..."` dead anchor）尚未滿足（`Sidebar.tsx:300`／`:319` 的 `#account` 仍在，blocker = `BUY-05`）。依 CLAUDE.md §11，未完成項不得留在 Recently Completed，故當時整列移除而非改寫為部分完成。**2026-08-30 `BUY-05` 完成後重新執行完整 anchor audit，CC (4) 確認達成，本項才重新加回本表**（完成日欄位同時記載實作日與關閉日）。**CC (4) 全程未被縮小或刪除。**
>
> **這一批完成項沒有讓 Deployment Readiness 前進。** 它們是能力建置與產品決策落地；
> Readiness 仍為 **0 / 14**，唯一上游是 `PRE-03`（見 §1、§6、§13）。

---

## 11. Stale TODOs removed（文件說待辦，code 已完成）

本輪的重要產出之一：以下項目**曾列在文件的 active backlog，但 code 已經完成**，
本次已從 active 清單移除，避免它們再被當成待辦提出。

| 舊條目（位置） | 舊敘述 | 實際現況 |
| --- | --- | --- |
| 舊 §2「購買流程技術債」 | 結帳頁購物車來自 **mock**（`edu-api-mock`） | **已完成** —— `app/checkout/page.tsx:49,174` 呼叫 `apiFetch("cart")` |
| 舊 §2「購買流程技術債」 | 成立訂單**未呼叫** `POST /orders`，用 `ord_mock_${...}` | **已完成** —— `app/checkout/page.tsx:187-188` `apiFetch("orders", { method: "POST" })` |
| 舊 §5 | 上傳憑證：規格有 drag & drop，現況**僅憑證網址輸入** | **已完成** —— `app/orders/[orderId]/payment-proof/page.tsx:228` `onDragOver` ＋ `:238` `type="file"`。已無網址輸入 |
| 舊 §3 | 「檢舉教材：**已接** `POST /reports`」 | **敘述錯誤（反向）** —— 買家端 UI **不存在**。已改列為 `BUY-01` |
| 舊 §10 P0 | 移除 `/admin/materials/[id]/reports`「標記已處理」按鈕 | **已完成**（見 §10） |
| 舊 §10 P1 | Refresh 規則落地 | **已完成**（見 §10） |
| 舊 §10 P1 | 活動紀錄 `meta` 人話化，raw 收到第三層 | **部分完成** —— raw 已收第三層、列表已人話化；`meta` 本身與 detail page 未做 → 範圍已縮小為 `IA-02` |
| 舊 §10 P1 | entity activity-log 入口補強 | **部分完成** —— 教材／訂單已有；付款／檢舉未有 → 範圍已縮小為 `IA-03` |
| 舊 §7.7 / §12 | 6-1 checkout promo CTA 為已知失敗，根因是 cookie 未設 | **根因已不成立** —— `setAuthState` 已設 cookie，mock 亦齊備 → 改列 `DX-01`（需重新測定） |
| 舊 §8.3 | 付款憑證仍在公開 `uploads/`（**83 個檔案**） | **部分完成且進行中** —— 公開路徑已被 `index.js:41` 封鎖、新上傳已走私有儲存；但實體檔案仍有 **95 個**、DB 92 筆全為 `legacy_public` → `SEC-01` |

---

## 12. Undocumented TODOs added（code 有證據，文件沒寫）

| ID | 發現 | 證據 |
| --- | --- | --- |
| `BUY-01` | 買家端檢舉送出 UI 完全不存在，但 `POST /reports` 與整套 Admin 案件流程都在運作 | 見 §5 |
| `SEC-01` #4 | **Admin 憑證預覽目前是壞的** —— 後端已移除 `proof_url`，前端仍依賴它 | `adminPaymentProofs.service.js:122` vs `app/admin/payment-proofs/page.tsx:485` |
| `SEC-01` #3 | security test DB **未套用** payment proof migration，兩個資料庫 schema 已不一致 | read-only DB 查詢（違反 CLAUDE.md §4「兩者 schema 一致」） |
| `SEC-01` #5 | payment proof 私有儲存**零測試覆蓋**（對照：教材本體有 3 支） | `Backend/tests/` ＋ `run-db-tests.js:28-29` |
| ~~`COR-01`~~ ✅ | `order_progress_state` **零測試覆蓋**，兩處 SQL 各自複製 | 已關閉（2026-08-23）—— SQL 收斂到 `services/buyerOrders.service.js`，覆蓋見 §1.1 |
| ~~`DX-03`~~ | E2E 註解引用已移除的 mark-reviewed 按鈕 —— **已於 2026-08-24 併入 `DX-02`** | 現行行號為 `admin.spec.ts:376,415`（原記的 `279,318` 已因檔案增長而過期）；兩處本身就是 `TODO(assert)`，屬 `DX-02` 的子集 |
| ~~`COR-02`~~ ✅ | `/me/orders/:orderId` 可能把**內部備註**回給買家 —— **已關閉（2026-08-24）**：payload 在非 `rejected` 時不回退件備註 | `Backend/services/buyerOrders.service.js` 的 `payment_proof_rejected_note` 取「最新一筆 rejected 憑證」的 `note`；核准訂單時 `routes/admin.js:260` 會把其餘 pending 憑證寫成 `note = 'superseded by approved proof'` → 已核准訂單的 buyer detail payload 會帶著這串內部字串（目前買家 UI 在 `approved` 分支不渲染它，所以只是 payload 洩漏，尚未顯示）。詳見 §5 |
| ~~`COR-03`~~ ✅ | legacy `cancelled` 訂單的買家徽章顯示「待付款」 —— **已關閉（2026-08-24）**：`cancelled` 成為 `order_progress_state` 的終態值 | `orders.status = 'cancelled'` 且無憑證時 `order_progress_state` 落在 `pending`（`buyerOrders.service.js` 的 `ELSE` 分支），`app/orders/page.tsx:54` 因此顯示「待付款」；該訂單同時被 `isHistoricalOrder()` 歸入「歷史訂單」分頁，兩者互相矛盾。**本輪刻意未處理** —— legacy status cleanup 明確在 scope 外。詳見 §5 |

---

## 13. Dependency chain

```text
SEC-01 Payment Proof Private Storage   ← DONE (2026-08-23)
  ├─→ PRE-02  legacy 搬移在 production 執行
  ├─→ FUT-P2  Payment Proof Retention Policy
  └─→ SEC-02  其餘 /uploads 素材  ← DONE (2026-08-24)
             儲存／交付 primitives 確實重用；**授權模型未重用**（素材是條件公開）

COR-01 Buyer Order Progress Alignment   ← DONE (2026-08-23)
  ├─→ COR-02  buyer payload 的內部備註（同一段 buyer detail 查詢）
  └─→ COR-03  legacy cancelled 訂單的徽章（需 legacy status 產品處置）

IA-01 Teaching Feedback Contextualize   ← DONE (2026-08-23)
  ├─→ FUT-T5  reviews-hub N+1（route 保留可直達，故此項未自動消失）
  └─→ FUT-P3  Review Moderation / Quality Dashboard

IA-04 Dashboard Attention Orders        ← DONE (2026-08-23)
IA-05 Dashboard Important Activity      ← DONE (2026-08-23)
  └─ 與 IA-02 無相依（實測）：IA-05 只用已存在的 describeActivity()／ACTION_CATALOG，
     不讀 log.meta；IA-02 的剩餘缺口是 meta formatter 與 detail page

IA-07 Users/Settings sidebar cleanup    ← DONE (2026-08-23，含最終冷 .next build)
  └─→ IA-08  RoleShell 的第二份 admin 導覽清單  ← DONE (2026-08-23)
             兩個 surface 已收斂到單一 source of truth lib/admin-nav.ts（§4.6）

IA-02 Activity Log meta 人話化          ← DONE (2026-08-23)
IA-03 Entity-centric Activity Entrances ← DONE (2026-08-23)

PRE-01 Production 儲存決策 ─→ FUT-T1 / FUT-T3

FUT-P6 users.status 狀態機 ─→ 檢舉的 suspend_user 處置

IA-06 Admin Orders Search / Buyer Email  ← DONE (2026-08-23 實作 / 2026-08-24 驗收)
  └─ 無下游相依；Dashboard「需要注意的訂單」已對齊分頁後的契約（§4.7）

SEC-02 教材行銷素材私有儲存           ← DONE (2026-08-24)
  ├─→ FUT-P7  已購買買家看不到已下架教材的封面（產品決策）
  ├─→ FUT-T7  未認領素材的孤兒清理
  └─→ FUT-T8  未上架試看影片的串流播放（需一次性 view token）

BUY-01 / DX-*：無相依

COR-05 path 參數 NUL byte → 500        ← repo-wide，先於 SEC-02 就存在
  └─ 無上游相依；與 SEC-02 無因果關係（committed code 上即可重現）

DX-05 .next 共用可變目錄（含已併入的 DX-09）
  └─ env-gated NEXT_DIST_DIR 機制已就位並驗證可隔離產物，
     但 canonical 的 verify:web 尚未採用 → 條目仍為 TODO
```

---

## 14. 建議執行順序

| # | ID | 一句話原因 |
| --- | --- | --- |
| ~~—~~ | ~~`SEC-01`~~ | ✅ DONE（2026-08-23）—— 見 §1.2 |
| ~~—~~ | ~~`COR-01`~~ | ✅ DONE（2026-08-23）—— 見 §1.1 |
| ~~—~~ | ~~`IA-01`~~ | ✅ DONE（2026-08-23）—— 見 §4.1 |
| ~~—~~ | ~~`IA-04` + `IA-05`~~ | ✅ DONE（2026-08-23）—— 見 §4.2 |
| ~~—~~ | ~~`IA-07`~~ | ✅ DONE（2026-08-23）—— 見 §4.3 |
| ~~—~~ | ~~`IA-02` + `IA-03`~~ | ✅ DONE（2026-08-23）—— 見 §4.4 |
| ~~—~~ | ~~`IA-08`~~ | ✅ DONE（2026-08-23）—— 見 §4.6 |
| ~~—~~ | ~~`IA-06`~~ | ✅ DONE（2026-08-23 實作 / 2026-08-24 settled-tree 驗收）—— 見 §4.7 |
| ~~—~~ | ~~`BUY-01`~~ | ✅ DONE（2026-08-24）—— 見 §5 |
| ~~—~~ | ~~`SEC-02`~~ | ✅ DONE（2026-08-24）—— 見 §1.3 |
| ~~—~~ | ~~`DX-01`~~ | ✅ DONE（2026-08-24）—— 完整套件 **364 / 0 / 30**。見 §9 |
| ~~—~~ | ~~`DX-06`~~ | ✅ DONE（2026-08-24）—— 修復後 `--repeat-each=10` **300/0**、完整套件 **364 / 0 / 30**。見 §9 |
| ~~—~~ | ~~`DX-05`~~ | ✅ DONE（2026-08-24）—— `verify:web` 三階段統一隔離 distDir；不停 3010 連續兩次 exit 0，dev 全程健康。見 §9 |
| ~~—~~ | ~~`COR-02` + `COR-03`~~ | ✅ DONE（2026-08-24）—— 同在 `buyerOrders.service.js`，同輪收斂；完整套件 **364 / 0 / 30**。見 §9 |
| ~~—~~ | ~~`COR-04`~~ | ✅ DONE（2026-08-24）—— 角色標籤／受眾描述／內部識別碼三分法；完整套件 **364 / 0 / 30**。見 §9 |
| ~~—~~ | ~~`COR-05`~~ | ✅ DONE（2026-08-24）—— 全域輸入守衛回 400；PG `22021` 全程 0 次。見 §9 |
| **1** | **`PRE-01`** | **← 順序上的下一個，但等部署環境拍板**（非實作項） |
| ~~—~~ | ~~`COR-07`~~ | ✅ DONE（2026-08-24）—— 終端 JSON error handler；不依賴 `NODE_ENV`。見 §9 |
| ~~—~~ | ~~`COR-06`~~ | ✅ DONE（2026-08-24）—— main landmark 收斂到外殼一層。見 §9 |
| ~~—~~ | ~~`DX-04`~~ | ✅ DONE（2026-08-24）—— 三個外殼 opt-in ＋ harness 補完；完整套件 **440 / 0 / 30**。見 §9 |
| ~~—~~ | ~~`DX-02`~~ | ✅ DONE（2026-08-24，含 `DX-03`）—— repo-wide `TODO(assert)` 歸零；完整套件 **440 / 0 / 30**。見 §9 |
| ~~—~~ | ~~`DX-07`~~ | ✅ DONE（2026-08-24）—— 三個產物目錄精確 ignore；產物未刪。見 §9 |
| ~~—~~ | ~~`DX-08`~~ | ✅ DONE（2026-08-24）—— 子標題重號歸零；只改 `docs/`。見 §9 |
| ~~—~~ | ~~`DX-10`~~ | ✅ DONE（2026-08-25）—— 兩處改為 `§22`；served OpenAPI 實測、smoke 全綠。見 §9 |
| ~~—~~ | ~~`DX-11`~~ | ✅ DONE（2026-08-25）—— §19.2 ＋ 斷言名稱雙指標；測試 14 / 14。見 §9 |
| ~~—~~ | ~~`DX-12`~~ | 🔒 ACCEPTED DEBT（2026-08-25）—— 目標不可還原、runtime-visible 0；非 actionable。見 §9 |
| ~~—~~ | ~~`P1-01`～`P1-06` ＋ `P2-04`~~ | ✅ DONE（2026-08-25）—— Pre-Deployment Product Readiness 第一批。見 §2.2 |
| ~~—~~ | ~~`P1-07`／`P1-08`／`P1-10`~~ | ✅ DONE（2026-08-25）—— 見 §2.3。production E2E **448 / 0 / 34** |
| **1** | **`P1-09`** | 唯一剩下的 deployment blocker；**blocked on 產品／法務提供正式條文**，非工程項 |
| — | — | 舊的 `IA`／`COR`／`DX` 執行順序已清空；`PRE-01`／`PRE-02` 維持 blocked |

> **執行順序於 2026-08-24 tracker recovery 後重新計算**（上方已完成的列為逐字回收）。
> 舊表曾同時出現兩列 `DX-01`（#1 與 #3）且編號有跳號；一併收斂，並補上 `COR-04`、`COR-05` 與 `DX-05`。
> `FUT-*` 維持 `FUTURE`，不進執行順序。
> **2026-08-24（`COR-06` 輪次）補列 `DX-02`／`DX-03`／`DX-04`／`DX-07`／`DX-08`** ——
> 這五項一直是 TODO，卻從未進入本表（本表只收過 `DX-01`／`DX-05`／`DX-06`），
> 於是它們做完之後看起來像「backlog 已清空」。
> **2026-08-24（DX backlog priority reconciliation 輪次）逐項以現行 working tree 複測後定案：**
> `DX-04` 由 `P1` **降為 `P2`**（evidence 見 §9 該列）、`DX-03` **併入 `DX-02`**，
> 因此本表由 5 列收斂為 4 列，**Active P1 歸零且有證據**。`PRE-01` 維持 blocked，
> **但它 blocked 不代表整條順序停住** —— 下方的 `DX-*` 都可以直接動手。

---

## 15. 附錄：已 deferred 的產品決策（原 §7，保留）

以下每一項都是**已經調查確認、但刻意不實作**的工作 —— 不是遺漏，是範圍決定。
格式固定四行：**現況限制** / **延後原因** / **需要的決策或相依** / **建議下一階段**。

> 這一節是**決策紀錄**，不是 active backlog。真正要做的事已經升級到 §3–§9 並給了 ID。

### 15.1 Reports（檢舉案件）

#### R-1 創作者補充說明的附件上傳
- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `reports` 與 `report_events` 都沒有附件欄位。創作者在 `/creator/cases` 只能提交純文字。
- **延後原因:** 需要新 schema、新上傳端點、儲存位置與保存期限政策，以及檔案掃描決策。
- **需要的決策或相依:** 允許的型別與大小；儲存位置（現在已有 `SEC-01` 的私有儲存可重用）；是否需掃描；Admin 是否也能上傳。
- **建議下一階段:** 附件掛在 `report_events` 上而不是 `reports`；**改用 `SEC-01` 建立的私有儲存**，不要再走 multer 直寫磁碟的舊慣例。

#### R-2 案件通知（email vs in-app）
- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** 沒有 notifications 表；`emailService.js` 只涵蓋訂單／付款／教材審核結果事件。
- **延後原因:** 「email 還是站內通知」是產品決策，兩條路的 schema 與維運成本完全不同。
- **需要的決策或相依:** email vs in-app vs 並行；哪些 case event 值得通知。
- **建議下一階段:** 先做 email，事件限定 `creator_response_requested` 與 `resolution`。

#### R-3 使用者停權 / 更強的 moderation action
- **Status:** `BLOCKED — schema does not exist` → 已升級為 `FUT-P6`
- **現況限制:** `users` 沒有 status 欄位，處置 allowlist 因此刻意只有 `dismissed / warning / request_changes / unpublish_material`。
- **延後原因:** 停權牽動既有訂單、已上架教材、登入流程與下載授權。
- **需要的決策或相依:** 停權後教材與訂單如何處理；下載權是否仍有效；期限與自動復權；申訴流程。
- **建議下一階段:** 先定義 `users.status` 狀態機，再把 `suspend_user` 加進 `REPORT_RESOLUTIONS`。

#### R-4 Legacy `reviewed`
- **Status:** `DONE（2026-08-23）` —— 見 §10。**剩餘**：deprecated endpoint 最終移除時程 → `FUT-T6`。
- **歷史資料:** **不回填、不刪除**（`teaching_platform` 30 筆、`teaching_platform_security_test` 63 筆）。
  回填成 `resolved` 會抹掉「當時只是標記已讀」與「當時真的做了處置」的差別 —— 那是稽核語意的損失，不是資料清理。

### 15.2 Payments

#### P-1 買家付款申報欄位
- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `POST /orders/:id/payment-proof` 只收檔案。`manual_payment_proofs` 沒有付款日期／匯款金額／帳號末碼／付款人姓名，Admin 面板因此不顯示「使用者付款申報」區塊（不編造不存在的資料）。
- **延後原因:** 這些欄位要加在**買家端上傳流程**，屬 buyer surface 改動。
- **需要的決策或相依:** 哪些必填；帳號末碼幾碼（個資最小化）；與 U-2 的姓名欄位關係；舊資料如何呈現「沒有值」。
- **建議下一階段:** 先加「匯款金額」與「付款日期」，兩者可直接與 `orders.total_amount` / `orders.created_at` 比對。

### 15.3 User Management

`/admin/users` 目前是**誠實的 placeholder**：說明功能未開放、指向可用的替代入口，並列出開放前必須先回答的問題。**沒有假表格、沒有假按鈕。**（移出 sidebar 的工作 → `IA-07`）

- **U-1 Admin user list API** — Backend 完全沒有 `/admin/users` 端點。端點形狀取決於 U-2~U-5，先寫只會寫錯。建議先做唯讀清單（搜尋＋分頁＋角色篩選），沿用 `Backend/utils/adminQuery.js` 分頁契約。
- **U-2 顯示身分策略** — `users` 沒有 name / display_name，全後台以 email 為唯一人類可讀識別。建議加 nullable `display_name`，顯示 `display_name ?? email`，不強制既有帳號補值。
- **U-3 帳號狀態 / 停權模型** — 與 R-3 同一依賴（`FUT-P6`）。不要分兩次改 `users` schema。
- **U-4 Admin 可見的個資範圍** — 目前無明文規範。這是政策問題，先寫進 `docs/mvp_rules.md` 的角色邊界章節。
- **U-5 Admin 查閱行為的稽核** — `activity_logs` 只記錄**寫入**行為。若確定需要讀取稽核，用獨立的 `access_logs` 表，**不要**混進 `activity_logs`（後者是業務稽核軌跡，混入讀取事件會把它稀釋掉）。

### 15.4 Teaching Feedback

**先釐清 domain：** `/admin/reviews-hub` 管理的是 `review` 表 ——
`(material_id, parent_id, rating 1–5, comment, created_at)`，每位買家每份教材限一則。
也就是**買家撰寫的商品評價**，不是老師的教學心得，也與 `reports` 無關聯。
UI 沿用「教學回饋」的稱呼，但資料模型是 review。**討論範圍時請用 review 的語意。**

- **F-1 Review moderation 範圍** — 沒有任何 moderation API。先確認是否真的需要；若只是「出事時查得到」，唯讀檢視 ＋ 檢舉流程可能就夠了。→ `FUT-P3`
- **F-2 隱藏 / 標記能力** — `review` 沒有 status / hidden / flagged。若要做，用 nullable `hidden_at` + `hidden_by`，並同步決定評分計算口徑（會影響 `GET /materials/:id/rating`）。→ `FUT-P3`
- **F-3 與 reports 的關聯** — `reports` 沒有指向 review 的欄位。若要開放檢舉評價，新增獨立表比改 `reports` 成 polymorphic 安全。→ `FUT-P3`
- **F-4 彙總 API（移除 61 請求 N+1）** — → `FUT-T5`（**若 `IA-01` 後該頁不再是主入口，此項自動消失**）

### 15.5 System Settings

`/admin/settings` 目前是**誠實的 placeholder**：直接列出 audit 結果 —— 哪些常數寫在程式碼裡（附 canonical 檔案位置），哪些設定刻意不從 UI 暴露。**沒有做任何假的設定表單。**（移出 sidebar → `IA-07`）

- **S-1 判定哪些業務常數該由 Admin 調整** — `AUDITED — no item currently qualifies`。目前**零**項合格：

  | 常數 | 位置 |
  | --- | --- |
  | 付款期限（訂單建立後 3 天） | `Backend/services/adminPaymentProofs.service.js` |
  | 每張訂單憑證上限（3 張 / 單張 10MB） | `Backend/routes/order.js` |
  | Admin 清單分頁上限（每頁最多 100） | `Backend/utils/adminQuery.js` |
  | 檢舉處置選項 | `Backend/utils/reportWorkflow.js` |
  | 付款退件原因選項 | `Backend/utils/paymentProofReview.js` |

  為了讓設定頁看起來有內容而暴露這些值，只會增加誤設風險。等第一個真實需求出現再做。
- **S-2 DB-backed config model** — 在 S-1 選出項目前做通用 config 表是過度設計。若最終只有 1–2 項，用具名欄位的單列設定表，不要做 key-value 通用 config（會失去型別與 CHECK 約束）。
- **S-3 設定變更的稽核軌跡** — 任何一項設定變成 Admin 可改的**同時**，就必須寫 `activity_logs`（`target_type = 'setting'`，meta 記錄前後值）—— 這不該是第二階段的事。

### 15.6 Materials

#### M-1 `/admin/materials` 的預設篩選
- **Status:** `DECIDED — keep 'all'（可再議）`
- **現況限制:** 直接開 `/admin/materials`（不帶 query）時預設「全部」。側欄入口帶的是 `?status=pending_review`，filter chip 上也有待審數量。
- **延後原因:** 既有 `tests/e2e/helpers/routes.ts` 與 `admin.spec.ts` 以無參數路徑開啟此頁並期待看到所有 fixture；改預設值會改動既有 product contract 與測試。
- **建議下一階段:** 若要改，同一個 PR 內改 `defaultFilter`、更新 `admin.spec.ts` 期待，並確認 `ADMIN_ROUTES` 煙霧測試仍合理。

### 15.7 前端計畫文件的手動 QA 回填

`frontend/daily-frontend-development-plan.md` 中仍為 `[ ]` 的驗證項目，屬**手動 QA 證據尚未回填**，而非程式必定未做：三種版面（mobile / tablet / desktop）、loading / empty / error 三態、表單四態、角色權限、API 錯誤碼提示、公開頁 metadata 與 a11y。
另有 **效能與分析追蹤**（Web Vitals / 分析 / 錯誤追蹤）尚未選型 —— 屬 `FUTURE`，本輪不排入 active backlog。

### 15.8 其他 MVP 占位

- **第三方註冊／登入**：Google、Facebook 按鈕仍為 disabled「即將開放」。
- **`apps/mobile`**：多為 README / package 層級，非可發佈之完整行動 App。

---

## 16. Recovery map（2026-08-24 tracker recovery incident）

**保留這一節是為了讓任何人都能判斷「這一段可不可以當原文引用」。**
分級定義見檔首 banner。

| Section | 事故前行數 | 分級 | 來源 |
| --- | --- | --- | --- |
| 檔首 ＋ §0 ＋ §1 ＋ §1.1 | 1–175 | **EXACT** | 本 session transcript，`sed -n '1,200p'`，事故前、patch 前 |
| §1.2 `SEC-01` | 176–307 | **EXACT-VERIFIED** | 176–200 逐字；201–307 取自 2026-08-23T11:01Z 全檔 snapshot。行數 132 = 132、7 個 `####` 子標題偏移全等、25 行重疊區逐字相同 |
| §1.3 `SEC-02` ＋ §2 | 308–478 | **EXACT** | 本 session transcript，`sed -n '308,480p'` |
| §3 | 479–521 | **EXACT-VERIFIED** | 標題行逐字；內文取自 2026-08-23T15:44Z snapshot。行數 43 = 43、子標題偏移全等，並與 11:01Z snapshot 互相佐證 |
| §4 標題 ＋ IA 表 ＋ `IA-01` Completion Criteria | 522–549 | **STALE-SKELETON** | 2026-08-23T15:44Z snapshot（行數相符）。**`IA-06` 的 Status 已依 settled-tree 證據更新為 DONE**，其餘列未改 |
| §4.1～§4.7 | 550–1009 | **RECONSTRUCTED** | 原文（約 461 行）**無任何 snapshot 保存**。依 §10／§1 的逐字回收內容 ＋ settled working tree ＋ 2026-08-24 重跑結果重建，逐段標記 |
| `IA-02` Completion Criteria | 1010–1019 | **STALE（行數相符）** | 2026-08-23T15:44Z snapshot |
| §5 ～ §9 | 1020–1198 | **EXACT** | 本 session 的 `sed -n '1020,1200p'` 持久化輸出（36,172 bytes），並與 `sed -n '1040,1090p'`／`'1100,1200p'` 兩次獨立讀取**逐行相符** |
| §10 | 1199–1232 | **EXACT** | 本 session transcript，`sed -n '1199,1235p'` |
| §11 ＋ §12 | 1233–1267 | **EXACT-VERIFIED** | 1233–1235 逐字；其餘取自 11:01Z snapshot。行數 35 = 35、子標題偏移全等 |
| §13 ＋ §14 | 1268–1334 | **EXACT** | 本 session transcript，`sed -n '1268,1340p'` |
| §15 | 1335–1438 | **EXACT-VERIFIED** | 1335–1340 逐字；其餘取自 11:01Z snapshot。行數 104 = 104、15 個子標題偏移全等 |
| 更新紀錄 | 1439–1461 | **PARTIAL** | 最新 4 列逐字（含 `SEC-02`／`BUY-01`／settled-tree reconciliation／final parallel reconciliation）；較舊 13 列取自 11:01Z snapshot；**少數中間輪次列無法回收，已就地標記**；另有 1 列在 snapshot 擷取時本身即被換行破壞，未收錄 |
| §16（本節） | — | **新增** | 2026-08-24 recovery |

**已排除的復原來源與原因**

| 來源 | 結果 |
| --- | --- |
| git `HEAD`（`70f77f5`） | 只有 commit 版本，缺整個未 commit 的工作成果；**僅作歷史基底，未採用** |
| Volume Shadow Copy / 系統還原 | 無 |
| OneDrive / File History | 未涵蓋此路徑 |
| VS Code / Cursor local history | 此檔從未在編輯器中開啟，無紀錄 |
| §4.x 的中間版本 snapshot | **刻意未逐字採用** —— §4.1／§4.3／§4.6 的舊版行數與最終版不符（如 §4.6 為 69 vs 81），拼接會產出「看起來像原文、實則混版」的內容。原始檔仍在 session tool-result 中，需要時可查 |

---

## 17. External Review Boundary（等待律師／會計師期間可以做什麼）

> **這一節是 operational summary，不是第二份 source of truth。**
> 每一項的完整 Evidence、Status 與 Completion Criteria 一律以 §1.4 / §2 / §6 的既有條目為準；
> 這裡只回答一個問題：**在 external review 回來之前，工程端可以安全推進什麼？**
>
> 新增於 2026-08-30（`DOC-01`）。分類依據是「**這件事的正確性是否取決於尚未取得的法律／稅務判斷**」，
> 不是依據它有多重要。

### HARD BLOCKED —— 必須等律師／會計師

| 項目 | 卡在誰 |
| --- | --- |
| `PRE-03` 平台交易地位定性（出賣人／居間／代理收付） | **律師 ＋ 會計師會同**，且是整條 critical path 的上游 |
| `PRE-04` 已售教材版本靜默替換的法律處置 | `PRE-03` |
| `P1-09` 的**條文定稿與發布**（不含已完成的 engineering foundation） | 律師核可 |
| `LEGAL-01` 民法 §122 末日展延 | 律師 ＋ 權威國定假日資料來源 |
| `PROD-01` 申訴證據是否必須接受 PDF（法律側） | 律師 |
| `SCHEMA-02` 帳號刪除語意 | `L-21`（保存理由與期限） |
| `H-4` 的**刪除／匯出／撤回同意**部分 | `L-21`／`L-22`／`RM-15` |
| `L-*`（授權鏈、解除權、審閱期、管轄、保存依據…） | 律師 |
| `T-*`（代銷認定、發票、憑證時點、扣繳、保存年限…） | 會計師 |
| `RM-15` 教材檔案保存期間 | `L-22` |

> **另有一組不是律師、但也不是工程能決定的：** `PRE-01`／`PRE-02`／O-19（SMTP provider）／O-20 ——
> 這些等的是**部署平台拍板**，不是專業意見。
>
> **2026-08-31 更新：`PRE-01` 與 O-19 的拍板已完成**（`DEC-13` Render／`DEC-14` Resend），
> 因此兩者**離開本表** —— 它們現在是**工程實作項**（`PRE-07`～`PRE-11`），不再是等待輸入的項目。
> `PRE-02` 亦隨 `DEC-15`（fresh DB）簡化為**驗證性工作**（`legacy_public` 由建構上即為 0）。
> **O-20 仍未完全解除** —— 基礎建設供應商事實已知（Render），但 production 網域仍 `PENDING`，
> 故 Privacy §5.4 所需事實尚未齊備。
>
> **【2026-08-31 `DEC-16` / `DEC-17` 更新 —— O-20 的揭露範圍變大了，不只是「還缺網域」】**
> NT$0 架構把受託處理者從 **2 家變成 4 家**：
>
> | | `DEC-13`（付費 Render） | `DEC-16`／`DEC-17`（NT$0） |
> | --- | --- | --- |
> | 應用程式主機 | Render | Render |
> | 資料庫 | Render（同一家） | **Neon**（新增） |
> | 私有檔案（**含付款憑證**） | Render（同一家） | **Backblaze**（新增） |
> | 交易郵件 | Resend | Resend（MVP 初期可不啟用） |
>
> **關鍵事實：付款憑證（含買家姓名、帳號末碼、匯款截圖）將存放於 Backblaze B2（美國）**，
> 而 Backblaze **無亞太 region**。這是**跨境傳輸**，不只是多一個供應商名字。
> Privacy §5.4 的揭露必須據實反映，且應與律師確認跨境傳輸的告知／同意要求。
> **本輪不作任何法律判斷，只提供事實。**
>
> 因此 O-20 現在缺的是**兩件事**：production 網域（未變），
> **以及新增兩家受託處理者與跨境傳輸的法律處理方式**（新增）。
>
> **【2026-08-31 `PRE-08` 補充 —— 第三件事：備份副本本身是個資的新存放位置】**
> Neon Free **沒有 automated backup**，PITR **只有 6 小時**，因此 NT$0 策略**必須**
> 依賴 Owner 手動執行的 `pg_dump`。那份 dump 檔含 `users`、`orders`、
> `manual_payment_proofs` 等全部個資，且會存放在 **Owner 自己的機器上**（不在任何供應商）。
> 這在《隱私權政策》上是一個**新的個資存放位置與保管責任**，
> 不是受託處理者（Owner 是控制者本人），但**保存期限、加密與銷毀方式仍需交代**。
> 同理，B2 的**版本歷史會保留已刪除物件**（預設 Keep all versions），
> 因此「刪除」在技術上並非立即永久刪除 —— 這與個資刪除權（`H-4`／`OPS-04`）的
> 承諾用語必須一致。**本輪不作任何法律判斷，只提供事實。**

### CONDITIONAL —— 可以建能力，不能封版

| 項目 | 可以先做 | 不能做 |
| --- | --- | --- |
| `OPS-05` 法律文件管理 Admin UI | create draft → approve → publish 的操作介面；`requiresReconsent` 與發布理由兩個**獨立**選擇 | **不得發布任何真實文件**、不得啟用 Gate 5、不得寫「此變更依法需要重新同意」這類尚未取得判準的文案 |
| Gate 12 read & save 能力 | 下載／列印／複製全文的機制 | **不得**因此把 Gate 12 標為 `IMPLEMENTED` —— 沒有已發布文件就無法完成 production acceptance |
| `H-4` Phase 1 | 「查看／更正」自助（僅限本人） | 刪除／匯出／撤回同意一律 blocked；**不得 hard delete、不得假設任何保存期限** |
| ~~`OPS-01` 179 筆 legacy `pending_payment`~~ **（2026-08-31 `DEC-15` 後本列已不適用：****production 從全新資料庫開始，legacy 母體 ＝ 0，不做任何處置；dev／test 母體維持原狀不動。****下列原文保留供稽核）** | (1)(2)(4) 的營運處置由產品／營運拍板 | (3)「補一段新的付款期限揭露」是**對消費者的新承諾**，建議併律師確認文案 |
| `DX-16` mojibake 檔名回填 | migration 腳本與 backup 程序草稿 | **拍板前不得執行任何 `UPDATE` 或 rename** |

### SAFE / INDEPENDENT —— 完全不依賴 external opinion

| 項目 | 狀態 |
| --- | --- |
| `REL-01` working tree preservation | ✅ **DONE**（2026-08-30） |
| `DOC-01` canonical docs reconciliation | ✅ **DONE**（2026-08-30） |
| `TEST-01` legal route 404 / no-draft-leak E2E | ✅ **DONE**（2026-08-30） |
| `DX-19` E2E live-backend 依賴明示化 | ✅ **DONE**（2026-08-30） |
| `A11Y-01` `focus-visible` 收斂 | ✅ **DONE**（2026-08-30） |
| `DX-20` `.gitattributes` binary/text 判定 | ✅ **DONE**（2026-08-30） |
| `OPS-05` 的**工程實作部分** | ✅ **DONE**（2026-08-30）—— 發布仍 blocked，見 CONDITIONAL |
| `OPS-06` 法律文件管理 Admin UI（`OPS-05` 移交） | **OPEN — `P3`**（發布仍 blocked） |
| `READINESS-01` 遺失定義的處置 | **OPEN — ACCEPTED INFORMATION LOSS**（需 Owner 提供副本或重跑 audit） |

> **`TEST-01` 為什麼算 SAFE 而不是 CONDITIONAL：**
> 它驗證的是「**沒有已發布文件時不得洩漏任何內容**」——
> 這個不變條件的正確性**不因為條文最後寫成什麼而改變**，
> 因此它不依賴、也不預設任何法律結論。

> **一個反覆出現的誤讀，在此明確否定：**
> `REL-01` 把四份草稿與整個 review packet 納入版本控制，
> **不代表** approval，**不代表** publication，**不改變**上表任何一項的分類。
> **commit ≠ approval ≠ publication。**
> 實測（2026-08-30）：`legal_documents` 與 `consent_records` 在兩個資料庫皆為 **0 列**，
> 四條 public legal route 全部回 404，律師與會計師狀態皆為 `PENDING`。

---

## 更新紀錄

| 日期 | 說明 |
|------|------|
| **2026-08-31（`PRE-09`）** | **production 環境變數契約完成（0 行 production code、0 個 schema／migration）。** 產出 `docs/production-environment-contract.md`；唯一的檔案變更是 `Backend/.env.example` 的對齊（僅佔位符）。**普查刻意涵蓋動態讀取**（5 處 `process.env[<name>]`）—— 只 grep `process.env.NAME` 會整組漏掉 `PRIVATE_FILE_STORAGE_*` 與四個 `MAX_*`。分類：FAIL CLOSED 5／FAILS SOFT 11／OPTIONAL 11／DEV-TEST 14／PLATFORM 2／PENDING DOMAIN 3。**所有失敗行為皆實測**（私有儲存 11 種組合、`readPositiveInt` 邊界、`jwt.sign` 的 `JWT_EXPIRES_IN`、`pg-connection-string` 的 `sslmode`）。**三項發現：**（1）**資料庫只有一條 production 路徑** —— 離散 `PG*` 無法開啟 TLS（`config/db.js` 從不設 `ssl`，`pg` 的 `defaults.ssl` 實測 `false`，本 repo 不讀 `PGSSLMODE`），故 production 必用帶 `sslmode` 的 `DATABASE_URL`；契約不把兩者並列為對等。（2）**`PUBLIC_BACKEND_URL` 未設 ＝ 把 `localhost` 永久寫進資料庫** —— `mediaUrl()` 會把絕對 URL 寫入 `cover_image_url` 等欄位，事後改設定不回寫既有列；Owner 的 LAUNCH GUARDRAIL 目前只靠人記得。已立 **`PRE-12`**（`P2`），**明確與 `REL-03` 區隔**（後者只管 `SMTP_*`／信寄不出去，前者是資料寫壞與整站 API 失效）。（3）**全 repo `NEXT_PUBLIC_*` ＝ 0** —— 沒有任何設定進入瀏覽器 bundle，契約已將「維持為 0」列為規則。**`.env.example` 補上先前完全缺漏的 `NODE_ENV` 與 `PUBLIC_WEB_URL`**（後者未設時信件連結指向 `localhost:3001` —— 連 dev 都不對，dev 前端是 3010），加上 `sslmode` 指引與持久化警告，並把 `example.com` 換成佔位符；**未新增第二份 env template**。**`PRE-09` → DONE；工程軌 Current Focus → `PRE-07`（其後 `PRE-08`）。** `REL-03` 維持 `P3`**未升級**（僅補上與 `PRE-12` 的交叉引用）；`PRE-10` 維持 `BLOCKED ON OWNER PRODUCTION DOMAIN` 未動；External 維持 `PRE-03` / `P1-09`。**驗證：** unit **230/230**、`git diff --check` clean、secret-shape 掃描 clean。**未部署、未建立 Render 資源、未設定 SMTP、未變更 DNS、未發明 production 網域、未建立 production DB、未修改 business logic／schema／migration。** |
| **2026-08-31（`PRE-08` backup/restore 官方查證）** | **RESEARCH-ONLY —— 0 行 production code、0 個 schema／migration、0 個設定變更、未建立任何帳號或資源。** 解除 `READY_FOR_FREE_DEPLOYMENT` 報告中的 **B-2**（B2 與 Neon Free 備份能力未查證）。**Neon Free：無 automated backup；instant restore（PITR）僅 6 小時且上限 1 GB 變更歷史；1 個 manual snapshot；支援 `pg_dump`／`pg_restore`；scale-to-zero 不影響資料（官方：Storage stays allocated／None of these limits delete your data）；Free 無到期日；專案刪除 irreversible 但有 7 天 deletion recovery 期。** **Backblaze B2：durability 11 個 9；bucket 預設 lifecycle ＝ Keep all versions；`DeleteObject` 不帶 `versionId` 只插入 delete marker、前一版本可復原（官方明文），帶 `versionId` 才永久刪除；所有版本計入儲存量；bucket 需先清空所有版本才能刪除；application key 刪除只移除存取權不刪資料；Object Lock 免費但啟用後無法關閉。** **關鍵判定（未假設，逐條對照 repo）：本 repo 的 `delete()` 呼叫 `DeleteObjectCommand({Bucket, Key})`，**不送 `versionId`** → 在 B2 上是 **A：可透過 version history 恢復**，不是永久刪除。 **另一項 repo 事實：production 沒有任何自動刪除路徑** —— 五個 `storage.delete()` 呼叫點中四個是「上傳失敗的補償刪除」（物件幾秒前才寫入），唯一的真實刪除是 `cleanupOrphans()`，而它**只由維運 CLI 觸發**（`scripts/cleanup-material-files.js`），無排程、無 endpoint。DB 側亦無任何 route/service 會刪除 `users`／`orders`／`order_items`／`manual_payment_proofs`／`materials`；且 `orders.user_id` 為 NO ACTION、`order_items.fulfilled_material_version_id` 為 ON DELETE RESTRICT，**已售出教材與其買家在 DB 層即無法被刪除**。 **結論：6 小時 PITR 不足以覆蓋週末，`pg_dump` 由選配升級為必要。** **`PRE-07` 新增三項 bucket 設定要求**（維持預設 Keep all versions／**不得啟用 Object Lock**／app key 限定單一 bucket）。**`O-20` 新增第三項待處理事實**：`pg_dump` 副本是個資的新存放位置（在 Owner 機器上，非受託處理者），且 B2 版本歷史使「刪除」在技術上並非立即永久刪除 —— 與個資刪除權的承諾用語必須一致。**`DEC-16`／`DEC-17` 未變更，未建立任何新 decision。** |
| **2026-08-31（Owner Decision Lock — Round 7 ＋ `PRE-13`）** | **NT$0 MVP 部署目標鎖定，且 object storage driver 已實作完成。** **`DEC-17` deployment target ＝ NT$0**（Domain ＝ provider free URL 且**不得成為 blocker**／約 10 位封閉測試者／Frontend ＋ Backend ＝ Render **Free** Web Service ×2／PostgreSQL ＝ **Neon Free**，**明確不用** Render Free Postgres 因其建立 30 天後到期／Email 初期可不啟用）。**`DEC-16` object storage 提前至 MVP —— 明文撤回 `DEC-13` 的「物件儲存不屬於 MVP」。** 理由是一條硬約束而非偏好：**所有免費方案都不提供 persistent volume**（Render 官方明文 Free web services cannot use persistent disks；Railway／Fly.io／Koyeb／Northflank 同樣沒有），因此 NT$0 與 `local` driver **互斥**。供應商 ＝ **Backblaze B2**（**建立帳號不需信用卡**、可設每日 $ 上限使超額無法產生費用、10 GB 永久免費、private bucket、S3 API ＋ Range），fallback ＝ **Cloudflare R2**（env-only 切換）。**Supabase Storage 硬性淘汰** —— Free 單檔上限 50 MB（官方明載不可調高）而本平台既有上限為教材 100 MB／影片 80 MB，採用它等於**縮小產品限制**；另有 7 天無活動即暫停且需人工恢復。**`PRE-13` 實作：** 新增 `Backend/storage/s3PrivateFileStorage.js`（generic S3，**不綁定供應商**）＋ `config/privateFileStorage.js` 的 driver 分支；**0 行 business logic、0 個 schema／migration、0 個授權模型改動**；`createSignedUrl()` **刻意未實作**，交付維持 backend streaming。**既有的 local fail-closed 三條完全未放寬**，並新增測試釘住。**測試 +34：** parity（24，同一組斷言跑兩個 driver，fake S3 是真的 HTTP server 而非 stub）＋ config 矩陣（10）。**回歸：** unit **264/264**、DB **470/470**、smoke **exit 0（local）**、smoke **exit 0（s3）**、重啟後 smoke **exit 0**；**persistence gate 重啟前後皆 11/11 checksum intact**。**⚠️ 受託處理者由 2 家變 4 家（Render／Neon／Backblaze／Resend），付款憑證將存放於美國且 Backblaze 無亞太 region —— 屬跨境傳輸，`O-20` 的揭露範圍因此擴大，需與律師確認；本輪不作任何法律判斷。** **LAUNCH GUARDRAIL 修訂（非取消）：** 封閉測試允許使用 provider hostname，但 `PUBLIC_BACKEND_URL` **絕不可留空**；換正式網域時以一次性 `REPLACE()` 修補既有素材 URL。**文件 reconciliation：** 新增 `docs/mvp-nt0-deployment-decision-2026-08-31.md`（canonical）；`owner-decision-round-3` 加 PARTIALLY SUPERSEDED banner；`production-environment-contract.md` 加儲存章節更新 banner；`material-file-storage-and-delivery.md` 新增 §20.2 並更正 §6.2／Future 清單；`mvp_rules.md` §21A.2 對齊；`.env.example` 新增佔位符。**未部署、未建立任何 Render service／Neon DB／B2 bucket、未綁定信用卡、未購買網域、未輸入任何 production secret** —— 所有驗證跑在本機 fake S3 上。**未 push／PR／merge。** |
| **2026-08-31（Owner Decision Lock — Round 6）** | **三項 Owner 決策鎖定（DECISION-ONLY，0 行 production code）。** **`DEC-13` `PRE-01` ＝ Render**（Frontend／Backend 各一個 Web Service、Backend **單一 instance**、Managed PostgreSQL、Persistent Disk 掛載於 `PRIVATE_FILE_STORAGE_PATH`、driver 維持 `local` ＋ `ALLOW_LOCAL_IN_PRODUCTION=true`；**物件儲存不屬於 MVP**）／**`DEC-14` `O-19` ＝ Resend**（維持 nodemailer ＋ 通用 SMTP relay，**不得改用 SDK**；`SMTP_PORT=465` 使現有 `secure = (port === 465)` 零改動即啟用 implicit TLS；真實憑證不得進版控）／**`DEC-15` production DB ＝ FRESH DATABASE**（不得匯入 `teaching_platform` 或 `teaching_platform_security_test` 的任何內容，provisioning 走 `PRE-05` 已驗證路徑）。**關鍵區分：鎖定的是「該選誰」，不是「已經設定好了」** —— deployment configuration 與 SMTP configuration **兩者都尚未開始**，本輪未部署、未建立任何 Render 服務、未建立 production 資料庫、未設定 SMTP、未變更 DNS。**`OPS-01` 隨 `DEC-15` 關閉為「非 MVP launch blocker」** —— production legacy `pending_payment` 由設計上即為 0；**未對 dev／test 的 legacy 母體做任何處置**（不遷移／不回填／不判逾期／不關閉），兩庫維持為開發測試環境；**未制定任何對消費者的 legacy 訂單政策**，原 CC (3) 的 `BLOCKED BY PRE-03 / P1-09` 因無適用對象而不再被觸發。**`REL-03` 的 `BLOCKED ON O-19` 解除**（Priority 維持 `P3`，未自行升級），並確認它**不需要真實憑證**即可實作，故不依賴 `PRE-10`。**`PRE-02` 由資料遷移退化為驗證性工作**（fresh DB 上 `legacy_public` 由建構上即為 0；實測兩個既有資料庫該值亦已為 0）。**新開五個實作項 `PRE-07`～`PRE-11`，全部 NOT STARTED。****排序更正（對照 repo 依賴驗證，非照抄期望順序）：`PRE-09` 環境變數契約必須排在 `PRE-07` 部署設定之前**（服務定義本身即包含環境變數，且 backend 對 `JWT_SECRET`／私有儲存 fail-closed）；**`REL-03` 可與部署工作平行**（不需憑證）；**`PRE-10` hard blocked on production 網域**。**production 網域仍 `PENDING OWNER DECISION / PURCHASE`**，並新增明文 **LAUNCH GUARDRAIL**：**在 Backend production hostname 鎖定前不得進行任何真實素材上傳**（`materialMedia.service.js:90` 會把含 host 的絕對 URL 寫進資料列）。法律側僅作 **factual update**（`review-handoff.md` 的 O-19／O-20 事實列與 O-19 未解決事實區塊、隱私權政策草稿 §5.3／§5.4 的**狀態註記**）—— **未改任何條文本文、未作任何法律結論**，一律標記 `LEGAL SUFFICIENCY: PENDING LAWYER REVIEW`。**Deployment Readiness 維持 `0 / 14`；外部關鍵路徑仍是 `PRE-03`。** **未修改 production code／schema／migration／資料庫；未 push／PR／merge。** |
| **2026-08-31（Owner Decision Round 3）** | **部署與郵件供應商研究（RESEARCH-ONLY，0 行 production code）。** 產出 `docs/owner-decision-round-3-provider-selection-2026-08-31.md`，research date 2026-08-31，所有供應商事實皆附官方來源 URL，無法自官方來源取得者一律標記 `CURRENT PRICE NOT VERIFIED`（未猜測）。**未部署、未設定 SMTP、未註冊任何服務、未建立 production 資料庫、未匯入資料、未啟動 `REL-03`。****部署：** DigitalOcean App Platform **硬性淘汰**（官方明文 "App Platform does not support volumes"，本機檔案系統於部署後永久遺失 —— 正是 `config/privateFileStorage.js` fail-closed 拒絕的情境）。shortlist 為 Render／Railway／Fly.io，三家的 volume **都不需要改任何程式碼**，且**都強制單一 instance** —— 與 `routes/order.js:27` 的 process 內 `uploadIdempotencyCache` 前提恰好吻合。**建議 Render**：三家中唯一同時具備 fully managed Postgres 與「每 24 小時自動快照、保留 ≥ 7 天」且兩者都不需 Owner 記得啟用；Singapore region；約 $21–25/月。Railway 次之 —— 其 Postgres **不是受管服務**（官方文件自述為從 image 部署的容器、無內建自動備份）；Fly.io 第三 —— Managed Postgres 最低 **$38/月**，且官方「每個 app 至少配置兩顆 volume」的建議與 `LocalPrivateFileStorage` 的單一寫入者模型衝突。**郵件：** shortlist 為 Resend／Postmark／Mailgun；**Brevo 未納入**，理由如實記錄 —— 其 SMTP 說明頁 403、定價頁為 JS 渲染，本輪無法自官方來源驗證，依證據標準不放入比較表。**建議 Resend**：唯一同時具備 **465 implicit TLS**（現有 `secure = (port === 465)` 零改動即保證 TLS，不必等 `REL-03`）與 ≥30 天送信紀錄，Free 3,000 封/月可做上線前完整演練、Pro $20/月 50,000 封。Postmark 為接近的次選（45 天紀錄保留更佳，但僅 STARTTLS）；Mailgun 第三（Free／Basic 僅 **1 天** log 保留，而本平台自身的郵件可觀測性只有 `REL-02` 的 `console.error` ＋ `activity_logs`）。**production 資料庫：建議 FRESH DB。** 唯讀體檢兩個現有資料庫：dev 217 個帳號中 **215 個為合成 email**、**50 個 admin**、93 個 published 教材中**只有 2 個有 `approved_file_id`**；security-test 為 958／956／63／326 中 271。兩庫 `consent_records` 皆為 **0**、`legal_documents` 皆為 **0**、憑證 `storage_status = legacy_public` 皆為 **0**。匯入會一次繞過 CLAUDE.md §3 的 admin 建立控制、在 production 製造不存在的人及其個資、並讓九成商品上架卻交付不出（第四條不變條件，銷售路徑回 409）。**若 production 從空庫開始，`OPS-01` 即不再是 MVP launch blocker**（legacy 母體 = 0，且付款期限對每一筆新訂單皆生效），降級為文件性關閉；`PRE-02` 亦同步簡化。另記錄一項時序限制：**production 網域必須在第一筆真實素材上傳前定案**（`materialMedia.service.js:90` 會把含 host 的絕對 URL 寫進資料列）。**`PRE-01`／`O-19`／`OPS-01` 三項狀態維持 `READY FOR OWNER DECISION`，未標 DONE。****未修改 production code／schema／migration／legal wording；未 push／PR／merge。** |
| **2026-08-31（Owner Decision Round 2）** | **三項 Owner／營運決策的決策資料備妥（DECISION-PREP ONLY，0 行 production code）。** 產出 `docs/owner-decision-packet-2026-08-31.md`，涵蓋 `PRE-01`（部署平台 ＋ 持久化私有儲存）／O-19（production SMTP 供應商）／`OPS-01`（legacy `pending_payment` 處置），各三個選項並附工程成本與風險比較。**未選定任何供應商、未註冊服務、未部署、未設定 SMTP、未搬移資料、未修改任何 legacy 訂單。****四項新證據：**（1）**必須持久化的只有 PostgreSQL 與 `private-storage/`**（實測 1,073 檔／5.7 MB）—— 整個 Backend 的檔案系統寫入點只有兩處且都在 storage 層內，`Backend/uploads/` 實測 0 檔；（2）**物件儲存完全未實作** —— `createSignedUrl` 只存在於註解、無 S3／R2 SDK 依賴，因此「換個 driver 就好」的部署方案不成立，掛載 volume 才是零改動選項；（3）**`PRE-01` 與 O-19 不依賴法律審查，是法律審查依賴它們** —— Privacy §5.3 在等 O-19、§5.4 在等 O-20／`PRE-01`；（4）**`OPS-01` 的母體已證明封閉**（無期限訂單止於 `2026-08-26T15:12Z`、有期限訂單始於同日 `15:42Z`），且 179 是測試庫數字（其中 129 筆為本月測試產生），**目前不存在 production 資料庫**，因此其實際規模取決於「production 是否從空庫開始」這個尚未回答的 Owner 事實；另複驗這些訂單**無 entitlement／下載後果**（交付要求 `orders.status='approved'`）。新增 **`REL-03`**（`P3`，blocked on O-19）：`SMTP_*` 缺失無啟動時檢查，production 會靜默不寄信。`PRE-01`／O-19／`OPS-01` 三項 Status 改為 `READY FOR OWNER DECISION`，§1 新增 **Owner Decision Track**。**未修改 production code／schema／migration／legal wording；未 push／PR／merge。** |
| **2026-08-31（`PRE-05`）** | **全新資料庫 provisioning 已實測可行 —— 但先修掉一個真實缺陷。** `READINESS-02` 只驗到「26/26 張表」，本輪擴到欄位／型別／預設／可空性／PK／FK／UNIQUE／CHECK／索引／部分索引／trigger／function，並實際啟動 Backend、跑 canonical seed 與 smoke。**發現：** `bootstrapModel.js` 把 `materials.file_key` 建成 `NOT NULL`，與 canonical `db/db_schema.sql`（明載可為空）不符；後果只在全新庫出現（既有庫早已 nullable，且 `CREATE TABLE IF NOT EXISTS` 不改既存表），實測 `POST /materials` → **500**，**全新部署的平台完全無法上架教材**。修法為改回 `TEXT`，不影響既有庫；以第三個全新空庫從零重驗，**smoke 73 項全過**。**另一個重要結論：多數結構差異其實是「既有參考庫」的歷史漂移**（含重複 FK），以 `db_schema.sql` 裁決後全新庫反而更接近 canonical。**刻意未於全新庫執行 DB 套件／Postman／E2E** —— 它們硬釘 security test DB，那是刻意護欄，不為本輪削弱。殘留 2 處 parity 缺口 ＋ 8 個熱路徑索引歸屬問題已另立 **`PRE-06`**（`P3`）。unit **230/230**、DB **470/470**；既有兩庫結構指紋 **byte-identical**，`legal_documents`／`consent_records` 維持 0；三個可拋棄庫已全部 DROP。 |
| **2026-08-31（`DX-21`）** | **完整套件的間歇性登入失敗已定位並修正 —— 不是產品缺陷。** 根因：`page.goto()` 之後、React hydration 完成之前送出的點擊會**靜默失效** —— 按鈕在 SSR HTML 中已可見，Playwright 點得下去且回報成功，但那一刻還沒有 `onClick`，因此**連登入請求都沒發出**。instrumented 重現 1/80，失敗當下 `loginRequests: 0`、無 console/page error，決定性排除了 cookie／middleware race、mock 契約、backend 與帳號密碼等假設。修法為新增 `helpers/hydration.ts`，等待 React 把 props 掛到該節點（`__reactProps$`），`critical-acceptance.spec.ts` 中 6 個「goto 後第一個 React 互動」改用 `clickWhenHydrated`。**A/B 在完全相同條件下由 1/80 失敗變 80/80 通過**；另加 `hydration-guard.spec.ts` 釘住機制本身（含反向證明 helper 會確實逾時而非靜默通過）。**未用 skip／fixme／waitForTimeout／retries／timeout 放寬／workers 調降／serial，未弱化任何斷言。** **production 程式碼 0 改動。** `verify:web` exit 0、完整 E2E **615 passed / 39 skipped / 0 failed**。 |
| **2026-08-31（`REL-02`）** | **刻意 detached 的通知 promise 現在有明確的 rejection 邊界。** 新增 `utils/bestEffortDispatch.js`，六個 `void sendXxxEmail(...)` 呼叫點全部改為 `dispatchBestEffort(() => ..., { operation, reference })`；裸 `void sendXxxEmail` 歸零。**收 thunk 而非 promise**，讓同步 throw 與非同步 rejection 走同一條被接住的路徑。**刻意不加 process 層 handler**（那是全域遮蔽，非擁有權修正），**刻意不在 helper 內寫 `activity_logs`**（資料庫故障正是觸發原因，會再造一個未接住的 rejection）。**盤點修正：`R2-008` 實際暴露的是 4 個而非 6 個** —— 兩支教材信本來就自帶 try/catch；兩者仍一併收斂，因為不變條件不該依賴各 sender 的內部寫法。**證據：** 7 個新測試（含 runtime 子 process 對照：裸 `void` 確實終止 process，經 helper 後存活）＋ 端到端以 `SMTP_HOST=smtp.invalid.example` 跑 smoke → **14 次真實寄信失敗、smoke 全過、backend 存活**。**業務語意零變更**（仍不 await、HTTP 回應不變）。unit **230/230**、DB **470/470**、smoke exit 0、E2E **611 passed / 39 skipped / 0 failed**。**未觸碰 O-19 SMTP provider 選擇、schema、migration、frontend 或 legal wording。** |
| **2026-08-31（`READINESS-02`）** | **以目前 HEAD 重新盤點 MVP 上線阻擋（audit-only，未修任何發現）。** 不重建 `READINESS-01` 遺失的 28 個歷史 ID，改用全新 `R2-xxx` 命名空間重審 16 個 domain。產出 19 個發現：EXTERNAL 4／OWNER DECISION 2／P2 4／P3 5／POST-MVP 1／NOT A GAP 3。**新增四個先前未被追蹤的條目：`REL-02`**（郵件 fire-and-forget 可終止 process，Node v18 實測）／**`DX-21`**（完整套件間歇性失敗，本輪 610/39/1、隔離 5/5 全過）／**`PRE-05`**（fresh-DB provisioning 未端到端驗證；table 層級已確認 26/26 相符）／**`BUY-07`**（清單不揭露可購買性，`P3`）。**最高風險的付費教材交付授權查核為 NOT A GAP** —— entitlement ＋ 一次性雜湊 token ＋ 短 TTL，且既有測試已完整覆蓋。**結論：即使法律核准今天到位仍是 `CONDITIONALLY`** —— `PRE-01`（無任何部署設定，且 production + local driver 會 fail-closed 拒絕啟動）與 O-19（無 production SMTP provider）是兩個與法律無關的硬阻擋。`READINESS-01` 保留不刪，僅補記「就上線規劃而言由本輪取代，歷史 ID 未被重建」。**未修改任何 production code／schema／migration／legal wording；`legal_documents` 與 `consent_records` 前後皆 0 列。** |
| **2026-08-30（`OPS-05`）** | **法律文件發布的營運就緒 —— 但沒有發布任何東西。** 盤點確認既有 Admin API 已足以完成 draft → approve → publish 全路徑（Option A），因此**未新增任何 production 端點**。新增 dry-run-only 前置檢查（`utils/legalPublicationPreflight.js` 純函式 ＋ `scripts/legal-publication-preflight.js` CLI，**沒有寫入路徑**）、10 個單元測試，以及 runbook（含 **NO AUTOMATED ROLLBACK**）。**核心不變條件：技術檢查與外部核准是兩條永不合併的判定線**；來源仍帶草稿標記時一律 blocked（實測：現行 terms 草稿 ＋ 其餘全填對 ＋ 偽造 lawyer ref ＋ 確認旗標 → 仍 NOT READY）。**⚠️ Scope 更正必須明說：** 原 Completion Criteria (1)～(6) 是 **Admin UI**，本輪 Owner 明文指示不要建 CMS，故 UI **未實作**，缺口原樣移交新條目 **`OPS-06`**（`P3`）—— **`OPS-05` DONE 不等於「已有法律文件後台介面」**。一處最小 production 改動：`DOCUMENT_TYPES` 抽到純模組 `utils/legalDocumentTypes.js`，service 原樣 re-export，行為零變更（DB 470/470、smoke exit 0 佐證）。unit 223/223、TEST-01 10/10。**Lawyer PENDING／Accountant PENDING／NOT PUBLISHED／`legal_documents` 0 列 全部維持不變。** |
| **2026-08-30（`DX-20`）** | **Git text/binary 分類正規化（repository hygiene）。** 新增根目錄 `.gitattributes`：`*.pdf` / `*.png` / `*.jpg` / `*.ico` → `binary`。**風險實測而非推論** —— 隔離 repo ＋ `core.autocrlf=true` 的 fresh checkout 會把兩個合成 PDF fixture 由 **125 bytes 變成 130 bytes**（SHA-256 改變）；加上 `.gitattributes` 後位元組與 blob 完全一致。**刻意不加 `* text=auto`**（實測會涵蓋 **531 個檔案**），**刻意不列 `*.svg`**（XML，屬文字）。同輪把 `material-media-security.spec.ts` 的 literal NUL 改為逸出序列：payload 位元組不變（`4d 5a 90 00 ...`，`Buffer.equals()` true），assertions 一字未動。**同時更正 `REL-01`／`DOC-01` 的一項錯誤記載** —— 先前寫「Git 把該檔當 binary，diff 不可讀」並不正確（Git 的 diff 偵測只看前 8000 bytes，NUL 在 offset 15745）；真正受影響的是 `file(1)` 與 GNU `grep -n`。**但實測發現一個更實質的後果**：Git 的轉換層採 whole-buffer 判定，因該 NUL 跳過 CRLF 正規化，使該檔成為全 repo 唯一以 CRLF 存放的 `.ts` blob（68 個中 67 個為 LF）；移除後已恢復一致。完整套件 **611 passed / 39 skipped / 0 failed**（未新增 test、未新增 skip），fixture 位元組全程未變。**未修改任何 production 行為、schema、migration 或 legal wording。** |
| **2026-08-30（`A11Y-01`）** | **keyboard focus 呈現收斂（presentation-only）。** 七個已具證據的控制項 ＋ 同檔 dialog 關閉鈕，全部收斂到 repo 既有的 canonical pattern `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus`（依實測選定：outline 型 36 次 vs ring 型 5 次；`--ds-focus-ring` 與原硬編碼 `#6C63FF` **同值**，非顏色變更）。文字欄位保留 `focus:` 的作用中提示、只換指示器；非文字控制項全部改 `focus-visible:`。移除自訂 12%-alpha shadow 與 `focus:outline-none`，避免 double ring。**真實瀏覽器驗證：** 鍵盤 Tab → outline `2px solid rgb(108,99,255)`；純滑鼠點擊 → `matches(":focus-visible")` false、`outline-style: none`。無 double ring、無 layout shift。新增 `tests/e2e/focus-visible.spec.ts`（**測行為不測 class**，6 case），斷言有效性經 negative control 證明。完整套件 **611 passed / 39 skipped / 0 failed**（baseline 605 ＋ 6，**skip 數未變**）。**新增兩筆已具證據的 follow-up：`A11Y-02`**（`ui/Checkbox.tsx` 同類缺陷，刻意未擴 scope）／**`A11Y-03`**（`/materials` 工具列焦點框被 `overflow-x-auto` 裁 4px，**既存狀況**，先前 ring 型也被裁 2px；本輪選擇「接受並記錄」以維持 offset 一致）。**未修改任何 business logic、API、backend、schema、migration 或 legal wording。** |
| **2026-08-30（`DX-19`）** | **E2E 的 live-backend 前置條件由「人工」改為「harness 保證且 fail-fast」（testing-only）。** `playwright.config.ts` 的 `webServer` 改為 **[backend, frontend] 陣列**，backend 由 harness 啟動並在 spawn 時**寫死** `PGDATABASE=teaching_platform_security_test`；新增 `tests/e2e/global-setup.ts`（可達性／身分／DB 連通性＋seed 三道檢查，失敗印 `E2E BACKEND PREREQUISITE NOT SATISFIED`）與 `helpers/backend-prerequisite.ts`（單一設定來源）。**先重現再修：** backend 全滅時舊行為為 (a) `api-proxy` 假紅燈（`Expected: 200 / Received: 500`）與 (b) `legal-publication-security` 四條 public route **假綠燈 4/4**（`fetchPublished()` 吞掉連線失敗）。**三個 scenario 皆驗證：** wrong DB 於 config 載入時即拒絕（**0 server／0 test**，port 3000 仍 down）；backend 前置不成立時 fail fast 且 **product test 執行數為 0**；正確環境下 `TEST-01` 10/10、完整套件 **605 passed / 39 skipped / 0 failed**（與 baseline 相同，**test count 與 skip 數皆未變，未弱化任何斷言**）。**已知限制明說：** `E2E_REUSE_BACKEND=1` 重用時無法從外部證明資料庫身分（刻意不新增 debug endpoint），該模式會先印警告；預設不重用。**未修改任何 production backend／frontend 行為、schema、migration 或 legal wording。** |
| **2026-08-30（`TEST-01`）** | **四條 public legal route 的 no-draft-leak 回歸護欄建立（testing-only）。** 新增 `tests/e2e/legal-publication-security.spec.ts`：4 條 route 各一個 parameterized test （404 且**不是** `/login` 轉址／不得出現 `DRAFT — NOT LAWYER APPROVED` 等草稿標記與該份草稿標題／連「已發布外殼」的 `<article>`、標題、版本·生效日 meta 都不得出現／無手寫 placeholder 文案），外加 1 個 backend contract test 證明 404 來自「沒有 published 列」而非「後端連不上」。**斷言有效性以拋棄式 negative control 證明（5 個構造全部如預期失敗），該 scratch spec 已刪除未進版控。** focused 10/10（desktop 5 ＋ mobile 5）、`verify:web` exit 0、完整 production E2E **605 passed / 39 skipped / 0 failed**（baseline 595 + 10，**skip 數未變**）。**未修改任何 legal draft、production route、schema 或 migration；`legal_documents` 與 `consent_records` 測試前後皆 0 列。** |
| **2026-08-30（`REL-01`）** | **working tree preservation checkpoint 完成。** 2026-08-22 之後的 319 項成果（125 modified／188 untracked／4 deleted／2 staged）以 **5 顆 dependency-safe checkpoint** 進版控於 `chore/rel-01-preservation-checkpoint`（`70f77f5` → `91574a1`）：`e3230c4` ignore rules（**必須第一顆** —— HEAD 的規則不涵蓋 `Backend/private-storage/` 的 923 個敏感檔與 779 MB build 產物）／`c3cf4f6` backend 142／`391ed7b` frontend 137／`ce5694a` canonical docs 11／`91574a1` legal packet 26。**318 committed ＋ 1 刻意 untracked（`.claude/launch.json`）= 319。** 六套驗證全綠（unit 213/213、DB 470/470、smoke exit 0、Postman 129/0、`verify:web` exit 0、E2E 595/39/0）。**未偽造逐-ticket 歷史；未 push；`main` 全程停在 `70f77f5`。** |
| **2026-08-30（`DOC-01`）** | **`REL-01` 之後的 canonical documentation reconciliation（DOCS-ONLY）。** D1 Current Focus 改為 External Review Track ／ Independent Engineering Track 兩軌，**不再把 `P1-09` 描述為 implementation in progress**（engineering foundation 已完成並進版控，現在的 blocker 是 external professional review）；D2 作廢 §2 中「`DX` 僅剩 `DX-15`」「`BUY-03`／`BUY-04` 為工程軌 #1／#2」的過期敘述（原文保留供稽核）；D3 baseline 的 Gate 11／12 由 `NOT IMPLEMENTED` 更正為 `PARTIAL`（**文件落後於實作的更正，非升級**），readiness 摘要行補上先前漏列的 Gate 4／11／12，`IMPLEMENTED` 仍為 **0**；D4 §2.1 不再宣稱「稽核報告是唯一完整清單」，並立案 **`READINESS-01`**（28 項定義經完整 git 復原嘗試確認**不可復原**，明令不得憑記憶重建）；D5 `PUT`／`PATCH` 三份文件對齊（實作一直是 partial update，**未改任何 API 行為**）；D6 B9 重新量測為 67 檔／694 處。`REL-01` 關閉並四處同步；新增 `TEST-01`／`DX-19`／`A11Y-01`／`DX-20`／`READINESS-01`；新增 **§17 External Review Boundary**。`LEGAL-01` 用詞精確化（repo 有日期算術 primitive、無假日資料集），**狀態維持 BLOCKED**。`OPS-05` 補記 **commit ≠ approval ≠ publication**。**0 行 production code、0 個 test、0 個 schema／migration、0 處 legal wording。** |
| **2026-08-24（tracker recovery：受控復原）** | **只處理 `docs/pending-work-tracker.md` 的復原，未動任何 runtime code、未跑 build／E2E。** 本檔先前於一次 patch 中被截斷為 0 bytes（`open(path, "w")` 先截斷、隨後 `UnicodeEncodeError` 使寫入未發生）。復原來源依序為：本 session transcript 的逐字片段、其他 session transcript 與 tool-result snapshot、以及 git `HEAD`（僅作歷史基底）。**§0／§1／§1.1／§1.3／§2／§5～§10／§13／§14 為逐字回收；§1.2／§3／§11／§12／§15 取自較舊 snapshot 但已用「行數＋子標題偏移＋重疊區逐字比對」三重驗證；§4.1～§4.7 原文（約 461 行）無任何 snapshot 保存，已依 settled-tree 證據重建並逐段標記為 `Reconstructed after tracker recovery incident`；更新紀錄有少數輪次列無法回收，已就地標記。** 同時完成事故前未落地的收斂：`DX-09` **併回 `DX-05`**（root cause 與 fix domain 相同）、新增 `COR-05`（path 參數 NUL byte → 500，repo-wide 且先於 `SEC-02`）、`DX-01`／`DX-06` 補上 settled-tree 完整套件 baseline（347 / 17 / 30，零新增回歸）。寫入採 temp file ＋ 驗證 ＋ atomic replace，未再直接以 `"w"` 開啟目標檔。未動兩個 staged rename，未 commit／push。 |
| **2026-08-24（`SEC-02`：教材行銷素材私有儲存）** | **只做 `SEC-02`。** 教材行銷素材（封面／詳情圖／試看影片）搬離公開 `express.static`，改為**條件公開**交付：可見性由**所屬教材的 `status`** 決定，下架立即生效。**root cause 不是「檔案放錯目錄」** —— 三種檔案資產裡只有素材沒有 metadata 記錄，交付時無從判斷該不該放行；因此新增 `material_media_files` 表。**Migration 為純 `CREATE TABLE IF NOT EXISTS`，不動任何既有欄位或資料列，且無資料搬移** —— 實作前唯讀實測兩個 DB 的素材 URL 100% 為外部連結、`uploads/material-media/` 0 個檔案（= prospective gap 而非 active leak）。兩個 DB 皆已備份（專案外部）並套用，事後欄位／約束／索引逐項比對相同。新增 `GET /materials/media/:mediaId`（`optionalAuth`、`inline`、`Range`、依授權切換 cache-control）；舊路徑 `/uploads/material-media/*` → 404。**驗證：** unit **139/0**、db **205/0**、smoke exit 0、Postman **82 requests / 129 assertions / 0 failed**、冷隔離 distDir 的 `verify:web` **一次 exit 0**（50 route）、`material-media-security.spec.ts` **16/0**、相鄰三支 E2E（payment-proof-security／material-review／teacher）**36/0**。E2E 的下架撤回改走**真實檢舉處置路徑** —— 第一版用 `request-changes` 走捷徑，但 `published → changes_requested` 不是合法轉移，那條斷言會靜靜地沒測到。**新增 `FUT-P7`／`FUT-T7`／`FUT-T8`／`DX-09`**（皆為記錄，未修）。**未動 `BUY-01` 的任何 runtime 檔**（`MaterialDetailPage.tsx`／`MaterialReportDialog.tsx`／`material-report.spec.ts` 零改動）、未動兩個 staged rename、未 commit／push。**平行 session 隔離：** 依指示未使用 3010 作為測試環境、未在共用 `.next` 上執行 build（改用 env-gated `NEXT_DIST_DIR=.next-sec02` ＋ 隔離 port 3032／3001），3010 的 dev server 全程未被終止，本輪結束時實測 `/`、`/login`、`/materials` 皆 200（**未對它做任何修復動作**，此為觀察值）。 |
| **2026-08-24（`BUY-01`：買家端檢舉送出 UI）** | **只做 `BUY-01`。** 產品決策拍板為「補回買家檢舉 UI」；理由欄位維持自由文字、入口對所有訪客可見（非買家在 dialog 內被擋且不送出請求）。實作僅 2 個 runtime 檔（`MaterialReportDialog.tsx` 新增、`MaterialDetailPage.tsx` +31/-1 行）＋ 1 支新 E2E，**backend / schema / migration 零改動**。規格同步：`mvp_rules.md` §6.5／§6.6（原 §6.5 順延）、MVP spec §9、`materials-detail-spec.md` §9 第 13 項、CLAUDE.md §5。驗證：lint 0 error、typecheck exit 0、build 成功（50 route）、`material-report.spec.ts` 6/6、完整套件 323 passed / 23 failed / 32 skipped（歸因見 §5）。**新記錄未修：** `COR-04`（「家長」角色稱呼違反命名規則）、`DX-05` 新增一筆最嚴重的重現 evidence。**未動**兩個 staged rename、未動任何 `IA-*` 檔案、未碰 `SEC-02` 的落點檔案、未 commit／push。⚠️ **本輪造成的環境副作用：** 依 CLAUDE.md §7 執行 `verify:web` 時，build 與另一個 session 在 3010 執行中的 `next dev` 共用 `.next`，導致該 dev server 對每條 route 回 500（即 `DX-05`）。**未擅自終止該程序**，待使用者決定；復原方式為停掉它、`rm -rf frontend/apps/web/.next`、重新 `npm run dev:web:3010`。 |
| **2026-08-24（settled-tree final reconciliation：`IA-06` ＋ `IA-08`）** | **唯一一次 settled-tree 收斂：`IA-06` 標記 DONE、`IA-08` 的 verification evidence 換成本輪數字。** 所有 parallel session 已停止，working tree 視為 settled。逐檔覆核 `IA-01`～`IA-08` 全數保留（無覆蓋／部分實作／重複實作／stale caller／契約不一致）。evidence 全部在 settled tree 重建，**未沿用任何先前 session 的數字**：unit **124/0**、db **181/0**（`teaching_platform_security_test`）、targeted `adminOrdersFilter.db.test.js` **14/0**、smoke **exit 0** 與 Postman **119 assertions / 0 failed**（isolated `PORT=3001`，backend 3000 未動）、冷 `.next` `verify:web` **一次通過**（`BUILD_ID=xvqA0yJmoKpFyIH8CmGam`，50 條 route）、production build 三支 admin 套件 **182 passed / 2 failed / 30 skipped**（兩支失敗歸類為既有 `DX-06` 與 `DX-01`，見 §9）。canonical docs（`mvp_rules.md` §19、MVP spec §11、`admin-information-architecture.md` §3.1／§10）覆核後與實作一致，**未修改**。Next Up 重算為 `BUY-01` → `SEC-02`。本輪**未做任何新的 IA 實作**、未動兩個 staged rename、未刪 Playwright 產物、未 commit／push。 |
| **2026-08-23（final parallel reconciliation：`IA-07` ＋ `IA-02` ＋ `IA-03`）** | **三個 parallel 產出一次收斂，全部標記 DONE。** 本輪為 reconciliation-only —— **未做任何新的 IA 實作、未修 `IA-08`**。**Parallel integrity：** `AdminSidebar.tsx`（`IA-07` 的 `sections` 移除仍在，四組導覽只剩活動紀錄在「平台管理」）、`lib/admin-labels.ts`（`IA-05` 的 `describeActivity()`／`activityTargetHref()` 與 `IA-02` 新增的 `describeActivityMeta()` 並存）、`ActivityLogCard.tsx`（新檔，五個使用點全部改用）、`payment-proofs`／`reports` 兩個 `IA-03` 入口、四支 e2e spec —— 逐一比對**無覆蓋**；兩個 staged rename（`RecentActivityList` → `AttentionActivityList`、`RecentOrdersTable` → `AttentionOrdersTable`）**未動**（無 reset／restore／unstage／clean／stash）。**最終驗收：** unit **124/0**、db **178/0**（`adminActivityLogs.db.test.js` 11/0，含 `getLogById` 三支）、smoke **exit 0**、Postman **73 requests / 111 assertions / 0 failed**（皆對獨立的 `PORT=3001` ＋ `teaching_platform_security_test` instance，**未使用 3000**）、停掉 3010 dev server 後冷 `.next` 的 `verify:web` **一次 exit 0**（lint 0／typecheck 0／build 51 route）、production build 上 `admin.spec.ts` 全套 **0 failed**、`admin-operations.spec.ts` **77/1**、`shell-consistency.spec.ts` **93/1**、targeted：`IA-02` meta humanization **10/0**、`IA-03` entity 入口 **4/0**、`IA-05` dashboard attention **8/0**。**兩支失敗皆為既有且已立案的測試缺陷，非產品回歸：** `DX-06`（`boxOf()` 在 poll 之後又讀第二次 → `element has no bounding box`；單獨重跑 3/3 通過）與 `DX-01` 第 4 群（legacy-reviewed 的 mock 不分 query string；經 `git show HEAD:` 比對，該斷言是 working tree 新增的，**從未在 HEAD 上綠過**）—— 兩者 evidence 皆已更新。**`IA-08` evidence 於執行中的 dev server 實地覆核成立**（`/materials` 上 `NAVS.admin` 實際渲染出「用戶管理／教學回饋／系統設定」，`aside` 240×720、連結 box 215×40 可見可點），保留並排為 **Next Up #1**（理由是原有的「成本最低、無相依的 IA 收斂優先」規則，**不是因為它最新被發現**）。dev server 3010 已於驗收後還原為 `next dev --port 3010`（**第一次還原失敗**：直接把 dev 起在 production build 的 `.next` 上 → manifest ENOENT ＋ 全數 500 並隨後退出；清掉 `.next` 後重起才正常，此案例已補進 `DX-05` evidence）。**未 commit、未 push、未 merge。** |
| _（此處有紀錄遺失）_ | **2026-08-24 recovery 註記：** `IA-01`／`IA-04`＋`IA-05`／`IA-07`／`IA-08` 等輪次的更新紀錄列，在 truncation 事故中遺失且**任何 snapshot 都沒有保存到**。上下兩側的列皆為逐字回收。這幾輪的實際成果與驗證證據並未遺失 —— 見 §4.1～§4.7 與 §10。**此列為缺口標記，不是原文。** |
| **2026-08-23（`COR-01`）** | **`COR-01` 完成並標記 DONE。** Buyer `order_progress_state` 由「歷史 `EXISTS`」改為 **latest-proof 語意**，canonical 定義收斂到新的 `Backend/services/buyerOrders.service.js`（`/me/orders` 與 `/me/orders/:orderId` 共用同一段 SQL，一次 LATERAL 取得最新憑證，無 N+1）；latest-proof 排序抽成 `LATEST_PROOF_ORDER_BY_SQL` 並與 admin `operational_status` 共用，**未新增第三種排序**。買家 UI 的徽章／CTA／timeline 全部改讀同一個欄位，`reviewing` 不再出現重新上傳 CTA，並移除 `orders.status === "rejected"` 這個永遠不成立的死分支。**驗證：** unit 124/0、db 167/0、smoke exit 0、Postman 111/0、lint 0 error、typecheck 0、冷 `.next` build 0、新增 E2E 10/10。同步更新 `docs/mvp_rules.md` §5／§19 與 `docs/teaching-platform-mvp-spec-v1.4.md` §4。**新增 `COR-02`／`COR-03`**（見 §5、§12），並為 `DX-01` 的 checkout promo 失敗補上根因證據（subtotal 送出為 0）。Current Focus 移交 `IA-07`（**未開始**）。`DX-05` 於本輪再次發生（build 與 dev server 共用 `.next`），依指示未修改任何 feature code 迎合環境。順帶把本檔被前一輪寫壞的行尾（`⟪…snapshot 擷取時此處遺失數個字元…⟫`）正規化回 LF，內容未變。 |
| 2026-04-27 | 初版：依程式與計畫文件檢視整理 |
| 2026-05-03 | 同步規格：`GET /materials` 品質分排序、query 忽略與前端補位；檢舉改為已接 API |
| 2026-05-06 | 同步購物車前端現況：高密度卡片、層級排版、左右對齊、空購物車 CTA、徽章動態與本地持久化 |
| 2026-08-22 | 新增 Admin Operations UX Closure Epic 的 deferred 項目與待產品決策 |
| 2026-08-23 | 新增 Material File Upload & Secure Delivery、教材審核 Future、Admin IA Audit 待辦 |
| 2026-08-23 | Legacy `reviewed` 技術債收斂：正式產品 UI writer 歸零、endpoint 標 deprecated、Postman 正式流程改用案件端點 |
| **2026-08-23（E2E closure）** | **`SEC-01` 的最後一道驗收完成。** 於 production build 上跑完整 Playwright 套件：payment review **7/7**、新增的 `payment-proof-security.spec.ts` **6/6**（anonymous 401、non-owner 403、legacy 公開 URL 404 `payment_proof_not_public`、公開素材未被誤擋、`no-store`/`nosniff`/`image/*` header）；buyer upload、admin inline preview、approve、reject、全流程 journey 皆通過。完整套件 **275 passed / 17 failed / 26 skipped**，**17 個失敗經逐一判定與 `SEC-01` 無關**（於 seed 完整的 dev DB 上同樣失敗）→ 已收進 `DX-01` 成為具體待辦，未擴張本輪 scope。**未修改任何 Payment Proof 實作**；唯一新增的是測試檔。`DX-05` 依指示調整為 `DX / Tooling`（不升 P0/P1），補上可獨立重現指令 `rm -rf .next && npx next typegen && npx next build` 與新的 Completion Criteria。Current Focus 維持 `COR-01`（**尚未開始實作**）。 |
| **2026-08-23** | **`SEC-01` 收斂完成並正式標記 DONE。** Current Focus 移交 `COR-01`（尚未開始）；`SEC-01` 移入 §10 Recently Completed。獨立覆核：unit 124/0、db 153/0、smoke exit 0、Postman 111/0、兩 DB `legacy_public`=0、公開副本 0 檔、未授權 401 / 舊路徑 404、`verify:web` 三階段皆通過。同步更新 `docs/mvp_rules.md` §12（移除已不存在的 `proof_url` 契約、新增 §12.4 私有儲存與交付）與 `Backend/.env.example`（`PRIVATE_FILE_STORAGE_*`、`MAX_PAYMENT_PROOF_BYTES`）。**新增 `DX-05`**：`npm run verify:web` 串接執行在本機不穩定（5/5 失敗於 `.next` 不同產物；單獨 `build:web` 於冷 `.next` exit 0），已確認為環境干擾而非程式缺陷。 |
| **2026-08-23** | **Pending Work Consolidation / Master TODO Audit：全檔重寫為唯一 active backlog source of truth。** 以 code / tests / schema / read-only DB 交叉驗證所有既有條目；為每一項配上穩定 ID、Evidence、Dependency、Completion Criteria；移除 10 項 stale TODO（結帳已接真實 API、drag & drop 已實作等，見 §11）；新增 6 項 undocumented TODO（買家檢舉 UI 不存在、Admin 憑證預覽已壞、security test DB schema 不一致等，見 §12）。確認 `SEC-01` 付款憑證私有儲存為 **IN PROGRESS 而非未開始**。 |
