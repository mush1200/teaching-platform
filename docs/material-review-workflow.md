# 教材上架審核 Workflow（Material Review）

**狀態：** MVP Phase 1 已實作（2026-08-23）
**Canonical code：** `Backend/utils/materialWorkflow.js`（狀態機與退回原因）、`Backend/services/materialReview.service.js`（轉移執行）
**相關文件：** `docs/mvp_rules.md` §21、`docs/teaching-platform-mvp-spec-v1.4.md` §3、`docs/admin-information-architecture.md`、`docs/pending-work-tracker.md`（active backlog 的唯一 source of truth）

這份文件是「創作者送出教材 → Admin 審核 → 上架／退回 → 創作者修改 → 再送審」這條流程的
**唯一規格落點**。狀態、轉移、退回原因、稽核事件、通知策略都以這裡與上述 canonical code 為準。

---

## 1. 為什麼有這一輪（實作前的實際狀態）

Phase 1 之前，這條流程在產品上是**斷的**：

| 問題 | 實際狀況 |
| --- | --- |
| Admin 無法審核 | `/admin/materials` 是唯讀清單，沒有任何審核動作，也沒有教材詳情頁。唯一能上架教材的方式是拿 API client 打 `PUT /materials/:id { status }` |
| 沒有「退回」這個狀態 | `materials.status` 只有 `pending_review` / `published` / `unpublished` |
| 沒有地方存退回原因 | `materials` 上沒有任何 review 欄位 |
| 創作者不知道被退回 | 沒有原因顯示、沒有重新送審動作；編輯頁的說明文字宣稱「可重新送審」但沒有那個按鈕 |
| 稽核不完整 | 只有 `material.published` / `material.unpublished` 會寫 activity log；任何回到 `pending_review` 的轉移完全沒有紀錄 |
| 幽靈狀態 | Creator UI 有 `draft` 篩選與統計卡，但 DB / API 都沒有這個值 —— 永遠 0 筆 |

---

## 2. MVP 狀態機

```text
  ┌──────────────────┐
  │  pending_review  │  待審核（創作者送出／重新送出）
  └───┬──────────┬───┘
      │          │
  核准 │          │ 退回修改（原因 + 說明必填）
      ▼          ▼
┌───────────┐  ┌────────────────────┐
│ published │  │ changes_requested  │  需修改（從未公開過，球在創作者手上）
└─────┬─────┘  └─────────┬──────────┘
      │                  │
      │ 檢舉處置          │ 創作者修改後重新送審
      │ unpublish_material│
      ▼                  │
┌──────────────┐         │
│ unpublished  │─────────┴──────────▶ pending_review
└──────────────┘
   曾經上架、被平台下架
```

### 2.1 四個狀態的語意

| 狀態 | 意義 | 對買家 | 球在誰手上 |
| --- | --- | --- | --- |
| `pending_review` | 待審核（初次送出或重新送出） | 看不到 | **Admin** |
| `published` | 已上架 | 看得到、可購買 | — |
| `changes_requested` | 需修改，**從未公開過** | 看不到 | **Creator** |
| `unpublished` | 已下架，**曾經公開過** | 看不到 | Creator（可修改後重送） |

`changes_requested` 與 `unpublished` **刻意分開**：對創作者的意義不同（「還沒上架過」vs「曾經上架被下架」）、
對買家資料的關聯不同（後者可能已有訂單／評價）、稽核來源不同（後者必然關聯一個檢舉案件）。

命名上刻意**不用 `rejected`**：平台沒有永久拒絕的商業行為，退回的目的是讓創作者修好後回來；
`rejected` 會讓創作者直接放棄，與產品目標相反。

### 2.2 Transition matrix

| From \ To | pending_review | published | changes_requested | unpublished |
| --- | --- | --- | --- | --- |
| **pending_review** | — | ✅ Admin 核准 | ✅ Admin 退回 | ❌ |
| **published** | ❌ | — | ❌ | ✅ **僅**檢舉處置 |
| **changes_requested** | ✅ Creator 重新送審 | ❌ | — | ❌ |
| **unpublished** | ✅ Creator 重新送審 | ❌ | ❌ | — |

**明確禁止（不得繞過正式審核）：**
`changes_requested → published`、`unpublished → published`、`published → changes_requested`。
同狀態轉移（`x → x`）一律視為非法（回 409）。

### 2.3 誰可以做哪個轉移

| 轉移 | 執行者 | 入口 |
| --- | --- | --- |
| （新建）→ `pending_review` | Creator | `POST /materials` |
| `pending_review → published` | Admin | `POST /admin/materials/:id/approve` |
| `pending_review → changes_requested` | Admin | `POST /admin/materials/:id/request-changes` |
| `changes_requested\|unpublished → pending_review` | Creator（**擁有者**） | `POST /materials/:id/resubmit` |
| `published → unpublished` | Admin（檢舉處置） | `POST /admin/report-cases/:id/resolve`（`unpublish_material`） |

**`PUT/PATCH /materials/:id` 不再接受 `status`**：帶了會回 **400** `status_not_updatable_here`。
教材狀態一律由審核 workflow 管理 —— 允許一支部分更新端點順手改 status，等於讓同一個結果有兩條路徑，
其中一條什麼副作用都不做（沒有 reviewer、沒有 `published_at`、沒有稽核、不寄信）。

---

## 3. Review snapshot 欄位語意

`materials` 上的四個欄位是 **latest review decision snapshot**，**不是** review history：

| 欄位 | 意義 |
| --- | --- |
| `review_reason_code` | 最近一次退回的結構化原因（allowlist 見 §5） |
| `review_note` | 最近一次退回的補充說明 |
| `reviewed_by` | 最近一次審核決定的 admin |
| `reviewed_at` | 最近一次審核決定的時間 |

**每一次新的審核決定都會覆寫它們。**
**完整歷史的 canonical source 是 `activity_logs`**（`target_type = 'material'`，見 §8）：

- **Creator 看最近一次**（snapshot，顯示在教材列表與編輯頁）
- **Admin 稽核看完整歷史**（`GET /admin/materials/:id/activity-logs`）

核准時會**清掉** `review_reason_code` / `review_note`：已上架的教材不該還掛著「需修改原因」。
歷史沒有遺失 —— 它在 activity_logs 裡。

### 3.1 `published_at` = **首次**成功公開時間

```text
第一次 pending_review → published   → 設定 published_at
之後 unpublished → pending_review → published → **不覆寫** published_at
```

第二次、第三次的重新公開時間由 `material.published` 事件保存（`meta.firstPublish = false`）。
**`published_at` 不是 last_published_at。**

**Backfill 策略（migration `20260823_material_review_workflow.sql`）：**
只從 `activity_logs` 中最早的一筆 `material.published` 推導。
`updated_at` **不可用** —— 它會被任何一次編輯覆寫，拿它假裝首次上架時間會產生看似精確、實際錯誤的資料。
查不到事件的既有 published 教材**保留 NULL**，UI 必須容忍 NULL（顯示「—」）。
（實際結果：dev 95 筆中 86 筆可推導、security_test 155 筆中 146 筆可推導。）

---

## 4. Admin JTBD

> **從待審教材佇列中逐筆檢視創作者提交的完整內容與風險背景，決定是否允許上架；
> 若不通過，給出創作者能據以實際修改的具體原因，並讓這份教材回到創作者手上。**

| 項目 | 定義 |
| --- | --- |
| Entry trigger | 日常巡檢／Dashboard「待審核教材」卡片／創作者重新送審後 |
| Primary action | **核准上架** / **退回修改**（二選一、互斥） |
| Completion condition | 該筆離開 `pending_review`，且創作者能得知結果 |
| Next item | **不自動跳下一筆**；顯示結果 + 提供「下一筆待審」按鈕 |

---

## 5. Request Changes flow（退回修改）

### 5.1 原因與說明都是必填

| 欄位 | 規則 |
| --- | --- |
| `reasonCode` | 必填，值域見下表；非法值 → 400 |
| `note` | 必填，**trim 後至少 10 字**（以 code point 計，中文一字算一字）；上限 1000 字 |

前後端一致驗證（前端 `lib/admin-labels.ts` 的 `MATERIAL_REVIEW_NOTE_MIN_LENGTH`
對齊後端 `REVIEW_NOTE_MIN_LENGTH`）。前端先擋只是為了不送出必敗的請求，**邊界在後端**。

理由：結構化原因讓創作者知道要改**哪一區**，必填說明讓他知道**具體是哪裡**。
一個沒有說明的退回等於把教材永久卡死在創作者手上。

### 5.2 原因 allowlist

| code | 文案 | 對應的實際欄位 |
| --- | --- | --- |
| `incomplete_info` | 教材資訊不完整或不清楚 | `teaching_objective` / `activity_steps` / `usage_duration` / `short_description` / `contents` |
| `media_quality` | 封面或圖片不符合要求 | `cover_image_url` / `material_images` |
| `features_mismatch` | 教材特色標註與內容不符 | `material_features` |
| `file_problem` | 教材檔案有問題或無法使用 | `materials.pending_file_id` 指向的候選檔 —— **見 §5.3** |
| `ip_concern` | 內容或版權疑慮 | `ip_declaration_accepted` 與內容本身 |
| `other` | 其他 | — |

### 5.3 `file_problem` 的能力邊界（已於 File milestone 解除）

自 **Material File Upload & Secure Delivery** 起，教材本體是真的檔案：
Admin 可以在審核面板按「下載審閱」把候選檔取下來實際打開
（`GET /admin/materials/:id/file?slot=pending`，每次下載寫
`admin.material_file_downloaded`）。因此 `file_problem` 現在真的代表**檔案內容有問題**，
UI 也可以正當地說「已檢視教材檔案」。

`utils/materialWorkflow.js` 的 `FILE_REVIEW_ENABLED` 已改為 `true`。

**例外：legacy 教材。** milestone 之前建立的教材沒有 `approved_file_id`
（`file_key` 只是字串）。審核面板對這些教材顯示「這份教材沒有教材檔案」並提示不應核准；
判斷依據是 `pending_file_id` / `approved_file_id` 是否存在，**不是** `FILE_REVIEW_ENABLED`。

**首次核准必須有候選檔**：教材還沒有 `approved_file_id` 時核准會回 409
`candidate_required` —— 平台不會上架一份買家下載不到東西的商品。
詳見 `docs/material-file-storage-and-delivery.md`。

### 5.4 流程

1. Admin 選原因 + 填說明 → `POST /admin/materials/:id/request-changes`
2. `status → changes_requested`；寫入四個 snapshot 欄位
3. 寫 `material.changes_requested`（meta 含 `reasonCode` / `note`）
4. 寄「教材需要修改」email 給創作者
5. 教材離開 Admin 佇列，出現在創作者的「需修改」清單

---

## 6. Approve flow（核准上架）

1. `POST /admin/materials/:id/approve`（body 可選 `{ note }` —— 內部備註，只進 activity log，不寄給創作者）
2. `status → published`；`reviewed_by` / `reviewed_at` 寫入；`review_reason_code` / `review_note` 清空
3. `published_at` 只在為 NULL 時寫入（首次公開）
4. 寫 `material.published`（meta 含 `firstPublish`）
5. 寄「教材已上架」email 給創作者
6. **立即**出現在 Explore / 教材列表 —— `GET /materials` 以 `status='published'` 即時查詢，**沒有快取層**
7. **不需要二次確認**：核准可逆（可經檢舉下架），且有 email 與 activity log 留痕

---

## 7. Creator resubmit flow

- **同一份教材繼續 lifecycle**（同一個 `materials.id`），**不建立新教材** ——
  新建會讓訂單、購物車、評價、檢舉的外鍵關聯全部斷裂。
- 只有**擁有者**可以重送；不是自己的教材一律 **404**（回 403 會洩漏「這個 id 存在」）。
- 只允許 `changes_requested | unpublished → pending_review`。
- review snapshot **不清空**：創作者在等待審核期間仍應看得到上一次的退回原因。
- 寫 `material.resubmitted`（meta 含 `oldStatus` / `newStatus` / `previousReviewReasonCode`）。
- **一般儲存不會送審**：`PUT /materials/:id` 只存內容。送審是**明確的意圖**，
  由創作者按「儲存並重新送審」觸發（該按鈕會先儲存再送審 —— 只送審不儲存，
  Admin 會看到創作者「已經修好」的舊內容）。

### 7.1 曾因檢舉下架的教材

允許修改後重新送審，但**必須重新經過完整審核**（`unpublished → pending_review → published`），
不得直接復架。審核面板會在「品質與風險背景」顯示「曾因檢舉下架」與退回歷史，讓 Admin 帶著脈絡決定。

（目前檢舉處置沒有嚴重度分級，因此不區分「可復出」與「永久下架」；若未來引入 severity，
再針對最嚴重的處置關閉復出路徑 —— 屬 Future。）

---

## 8. Activity / Audit events

`target_type = 'material'`，全部由 workflow 寫入（**不再**由 generic update 端點寫）：

| Action | 觸發 | meta |
| --- | --- | --- |
| `material.created` | 創作者送出新教材 | `{ status: "pending_review" }` |
| `material.published` | Admin 核准 | `{ oldStatus, newStatus, reviewedBy, firstPublish, note? }` |
| `material.changes_requested` | Admin 退回 | `{ oldStatus, newStatus, reasonCode, note, reviewedBy }` |
| `material.resubmitted` | 創作者重新送審 | `{ oldStatus, newStatus, previousReviewReasonCode? }` |
| `material.unpublished` | 檢舉處置下架 | `{ oldStatus, newStatus, reportId }` |

每一筆都能回答：誰（`actor_id` + `actor_role`）／何時（`created_at`）／哪份教材（`target_id`）／
做了什麼（`action`）／從什麼狀態到什麼狀態（`meta`）／原因（`meta.reasonCode` + `meta.note`）。

`activity_logs` 寫在 transaction **之外**（COMMIT 之後），沿用 repo 既有慣例：
稽核記錄失敗不應回滾已經成立的業務操作。

---

## 9. Reports boundary（與檢舉 workflow 的責任切分）

| 能力 | 教材審核 `/admin/materials` | 檢舉管理 `/admin/reports` |
| --- | --- | --- |
| 處理的問題 | 「這份**尚未公開**的教材是否符合上架要求？」 | 「這份**已在平台上**的教材是否因違規需要處置？」 |
| **publish** | ✅ **唯一來源** | ❌ |
| **request changes** | ✅ **唯一來源**（只作用於 `pending_review`） | ⚠️ 檢舉的 `request_changes` 處置**只寫紀錄、不改教材狀態**；UI 文案必須區分（審核＝「退回修改」／檢舉＝「要求創作者修改」） |
| **unpublish** | ❌ **不得提供** | ✅ **唯一來源**（必然關聯 `reportId`） |

**硬性規則：`/admin/materials` 不得出現「下架」按鈕。**
檢舉路徑的下架必然帶著 `reportId` 與案件歷程；教材頁若也能下架，會產生一批「沒有原因、沒有案件」
的下架事件，而兩者在 `activity_logs` 裡是同一個 action name，事後無法區分。
若未來需要「非檢舉來源的主動下架」，正確做法是由 Admin 開一張內部檢舉案件（Future）。

---

## 10. Admin Review Workspace spec

沿用共用的 `components/admin/AdminReviewWorkspace`（只共用 layout，不共用 domain logic）。

**桌機（`xl` 以上）：** 固定高度工作區，左佇列／右詳情**各自捲動**，兩欄等高。
**`xl` 以下：** 單欄流程，選取後詳情取代清單，頂部有「返回教材清單」。

### 10.1 佇列列顯示

教材名稱、創作者 Email、售價、送出時間、更新時間、狀態徽章、未結檢舉數（>0 才顯示）、
`ID`（列尾 metadata）。**不顯示**「第 N 次送審」除非資料真的算得出來。

### 10.2 詳情資訊架構（由上而下）

1. 標題與提交資訊（狀態徽章、創作者、送出／更新時間）
2. 視覺內容（封面 → 細節圖 → 示範影片）
3. 基本資料（售價／年齡／分類／首次上架時間、簡述、完整描述）
4. 教學設計（教學目標、教學方式 chips、使用時長、活動步驟、延伸價值）
5. 教材內容清單（`contents[]`）
6. 教材特色（依既有五組分類呈現）
7. **教材檔案（可下載審閱：待審候選檔 / 目前交付中的檔案，兩個 slot 分開呈現）**
8. 著作權聲明
9. 品質與風險背景（未結檢舉／曾因檢舉下架／過去被退回次數／重新送審次數／最近一次審核結果）
10. 審核紀錄（來自 activity_logs）
11. 技術資訊（**預設收合**）
12. 審核決定（**sticky footer**）

### 10.3 決定區行為

- sticky 在詳情欄底部，不遮住內容，鍵盤可達。
- 「退回修改」**不跳 modal**，就地展開原因 + 說明表單 —— 填原因時仍需對照上方教材內容。
- 完成後**不自動跳下一筆**：顯示「已核准上架」／「已退回修改」，佇列即時更新，
  另外提供「下一筆待審 →」讓 Admin 自己決定何時前進。
- 非 `pending_review` 的教材：不顯示任何審核按鈕，並說明下一步（已上架 → 走檢舉處置）。

---

## 11. Creator UX

| 狀態 | 創作者看到 | 提供的動作 |
| --- | --- | --- |
| `pending_review` | 審核中 | — |
| `changes_requested` | **需修改** + 原因標籤 + Admin 說明 + 審核時間 | 「修改教材」→ 編輯頁 →「儲存並重新送審」 |
| `published` | 已上架 | 編輯 |
| `unpublished` | 已下架 + 說明與下一步 + 平台案件連結 | 「修改教材」→「儲存並重新送審」 |

- **沒有 `draft`**：幽靈狀態已從 Creator UI 移除（篩選與統計卡）。要做草稿需要 schema 決策，不在本輪。
- Creator 端**不顯示** `reviewed_by` 等內部識別碼。
- 狀態文案是**創作者視角**（`lib/material-status.ts`），與 Admin 視角（`lib/admin-labels.ts`）
  刻意不同：`changes_requested` 對 Admin 是「等待創作者」，對 Creator 是「需修改」。

---

## 12. Notifications

平台**沒有**站內通知系統，本輪也不建 notification center。只寄兩封（都給創作者）：

| 事件 | 寄信 | 內容 |
| --- | --- | --- |
| 送審成功 | ❌ | 創作者剛按下送出，畫面已確認 |
| **核准上架** | ✅ | 教材名稱、結果、教材頁連結 |
| **退回修改** | ✅ **必寄** | 教材名稱、退回原因、Admin 說明、編輯頁 CTA |

`services/emailService.js` 的 `sendEmailWithLog` 已泛化成接受 `targetType` / `targetId`
（`orderId` 保持完全相容）。稽核 action 沿用 `order_email_sent` / `order_email_failed`，
信件屬於哪個領域由 `target_type` 與 `meta.type` 表達 —— 避免「平台寄過哪些信」要查兩個地方。

---

## 13. Security（本輪確認）

| 項目 | 狀態 |
| --- | --- |
| Admin 端點有 admin middleware | ✅ `/admin` router 全域 `requireAuth + requireRole("admin")` |
| Creator 只能重送自己的教材 | ✅ service 層 owner 檢查，非擁有者回 404 |
| Creator 不能核准／退回 | ✅ 403（admin router） |
| 未公開教材不會被公開讀取 | ✅ `GET /materials/:id` 對非 published 只允許 admin 或 owner；列表以 `status='published'` 過濾 |
| review snapshot 是否外洩 | ✅ 只有 admin 與**教材擁有者**讀得到（沿用既有的 detail 授權）；一般讀者只拿得到 published 教材 |

### 13.1 已知安全缺口

**已由 Material File Upload & Secure Delivery 解決：**

- ~~`file_key` 出現在公開回應中~~ → 已從 `MATERIAL_COLUMNS` 移除；
  教材檔案摘要只給 admin 與擁有者，`storage_key` / `checksum` / `uploaded_by` 永不外流。
- ~~`GET /download/:materialId` 回傳 mock URL~~ → 改為一次性下載票 + 後端串流交付。

**仍未解決（不屬教材本體，屬行銷素材與付款憑證）：**

- `/uploads` 靜態目錄沒有任何認證（未上架教材的封面／細節圖、以及**付款憑證**
  只靠隨機檔名保護）。教材**本體**已不在這個目錄底下
  （`Backend/private-storage/`，不被 static serving 覆蓋），
  但付款憑證的處置是獨立項目（`SEC-01`，2026-08-23 起 IN PROGRESS），見 `docs/pending-work-tracker.md`。

---

## 14. Milestone 邊界

**本輪（Phase 1）包含：** 狀態機、snapshot 欄位、Admin 審核 API 與 Workspace、Creator resubmit 與需修改 UX、
稽核事件、兩封通知信、Dashboard／佇列計數對齊、移除幽靈 `draft`、文件落盤。

**Phase 1 不包含，但已由後續的 Material File Upload & Secure Delivery 完成：**
真實教材檔案上傳、private storage、Admin 安全審閱下載、買家安全下載、
`file_key` 移出公開 payload、MIME/size allowlist（含 magic bytes）。

**至今仍未做：** `/uploads` 認證（行銷素材與付款憑證）、病毒掃描、inline preview、
多檔交付、`published` 教材的合法換檔重審路徑。

**Future（非 MVP）：** 多人審核與 assignment、SLA 與逾時提醒、申訴流程、多輪 comment thread
（`material_review_events`）、版本 diff、審核品質分析、AI 預審、`draft` 草稿狀態、
非檢舉來源的主動下架、review moderation。

---

## 15. 為什麼**不**新增 `material_reviews` 歷史表

比較過三個方案，選了 B（`status` + 5 個欄位）：

| 方案 | 判斷 |
| --- | --- |
| A：只用 status + activity log | ❌ 創作者必須看到退回原因，而 activity_logs 是 admin-only 端點 |
| **B：status + 5 個 review 欄位** | ✅ 支援無限次重送；最近一次給創作者看，完整歷史在 activity_logs；一次 migration、無新表 |
| C：完整 `material_reviews` 表 | ❌ 多輪審核歷史**已經有 canonical 的家**（activity_logs），再建一張表就是兩份真相；C 的價值在多人審核／多輪 comment，那是 Future |

**升級路徑：** 未來若要多輪 comment thread，比照 `report_events` 新增 `material_review_events`，
`materials` 上的五個欄位退化為「最近一次」的快取欄位，不需要資料遷移。
