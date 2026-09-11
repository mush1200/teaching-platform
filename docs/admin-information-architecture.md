# Admin Information Architecture / Job-to-be-done

**狀態：** Audit 完成於 2026-08-23，決策已定案；實作分批進行（見 §10 P0/P1/P2）
**相關文件：** `docs/material-review-workflow.md`（教材審核細節）、`docs/pending-work-tracker.md`（未處理項目）、`docs/ui-design-system.md`（UI 工作規則）

這份文件回答的不是「這頁現在有什麼功能」，而是 **「Admin 為什麼需要這頁」**。
新增 Admin 頁面或改動導覽前，先讀這份。

---

## 1. Audit 結論摘要

1. **只有審核佇列型頁面真正具備完整 JTBD 閉環**：教材審核（Phase 1 已補上）、付款審核、檢舉管理。
2. **Dashboard 的兩個 widget（最近訂單／最近活動）沒有行動價值**：顯示不可點的內部 id 與 raw action code。
3. **Admin 的問題是 entity-centric，產品卻把 event-centric 的全域事件流放在 sidebar**。
4. **檢舉曾有兩個 source of truth 並行**：`/admin/reports`（案件流程）與 `/admin/materials/[id]/reports`（legacy 標記已讀）。
5. **教學回饋總覽解決不了任何真實 JTBD**：不能搜尋、不能篩星等、不能依教材彙總。
6. **`/admin/users` 與 `/admin/settings` 是誠實的 placeholder**，但佔了一級 sidebar 入口。
7. **重新整理按鈕是預設模式而非設計決定**，且沒有任何頁面顯示「最後更新」。

---

## 2. Page responsibility matrix

| Page | Primary JTBD | Page Type | Primary Action | Source of Truth | Recommendation |
| --- | --- | --- | --- | --- | --- |
| 營運總覽 `/admin` | 知道今天有多少事要處理、有無異常 | Overview / Analytics | 進入正確佇列 | 待辦數在各佇列 | **Keep + Refocus** |
| 教材審核 `/admin/materials` | 審核待上架教材並核准／退回 | Review Workspace / Queue | 核准上架／退回修改 | **教材狀態** | **Keep**（Phase 1 已重建） |
| 付款審核 `/admin/payment-proofs` | 核帳並核准／退回付款 | Review Workspace / Queue | 核准／退回 | **付款決定** | **Keep** |
| 訂單管理 `/admin/orders` | 查某張訂單卡在哪 | Reference / Investigation | 無（查詢） | **訂單狀態查詢** | **Keep + Refocus** |
| 檢舉管理 `/admin/reports` | 跑完檢舉案件流程並處置 | Review Workspace / Investigation | 判定與處置 | **檢舉案件** | **Keep** |
| 退款／補救案件 `/admin/remedy-cases` | 處置消費者救濟案件，並記錄行外已完成的退款 | Review Workspace / Queue | 狀態轉移／建立案件／記錄退款執行 | **`refund_remedy_cases`**（狀態機在 `Backend/services/refundRemedy.service.js`） | ✅ **已完成**（2026-09-12，`IA-10`；見 §12） |
| 教學回饋 `/admin/reviews-hub` | 無明確 JTBD | Reference | 無 | 資料層在 reviews API | **Contextualize / Remove from Sidebar** |
| 活動紀錄 `/admin/activity-logs` | 稽核、追責、客訴調查 | Audit / Investigation | 收斂到正確紀錄 | **稽核軌跡** | **Keep + Refocus** |
| 用戶管理 `/admin/users` | 無法達成（無 API／無欄位） | Reference | 無 | — | **Remove from Sidebar** |
| 系統設定 `/admin/settings` | 無可調設定 | Reference | 無 | — | **Remove from Sidebar** |
| `/admin/materials/[id]/reports` | 看某教材的檢舉脈絡 | Reference（contextual read-only） | **無**（處置一律回 `/admin/reports`） | 檢舉在 `/admin/reports` | ✅ **已完成**（2026-08-23 移除「標記已處理」） |
| entity activity-logs（訂單／使用者／教材） | 這個對象發生過什麼 | Investigation | 無 | 稽核軌跡 | **Keep + Refocus**（應為主入口） |

---

## 3. Sidebar IA（建議）

依「Admin 的工作模式」分組（有沒有待辦、要不要做決定），不依資料表：

| Group | Page | 為什麼放這組 |
| --- | --- | --- |
| **總覽** | 營運總覽 | 唯一的入口與分流點 |
| **待審核**（有佇列、要做決定） | 教材審核 / 付款審核 / 檢舉管理 | 有一疊東西等我處理完 |
| **查詢與調查**（無待辦） | 訂單管理 / 活動紀錄 | 客訴、對帳、稽核時才進來 |
| ~~教學回饋~~ | — | 沒有 JTBD、沒有 action → 摘要下放到檢舉案件與教材詳情 |
| ~~用戶管理／系統設定~~ | — | 0 能力的一級入口，每次點擊都是死路 |

**明確結論：**
- **教材管理與教材審核不分開** —— 平台上 Admin 對教材只有「審核上架」與「下架」兩種操作，一頁足夠。
- **付款審核與訂單管理都留，但分到不同組** —— 前者是佇列（有待辦），後者是查詢（無待辦）。
- **活動紀錄留 sidebar**，但角色是「全域搜尋／稽核入口」，日常調查應從對象頁進入。

### 3.1 這份 IA 只有一份定義（`IA-08`，2026-08-23）

Admin 導覽在程式中曾有**兩份互不相關的清單**：
`components/admin/AdminSidebar.tsx` 的 `sections`（`/admin/*` 的側欄與抽屜），以及
`components/layout/RoleShell.tsx` 的 `NAVS.admin`（Admin 逛**非** `/admin` 路由時的側欄）。
§8 的「教學回饋移出側欄」與上表的「用戶管理／系統設定移出側欄」只收斂了前者，
於是 Admin 打開 `/materials` 或 `/` 時，那三個已下架的一級入口仍然可見可點。

**現在只有一份定義：`frontend/apps/web/lib/admin-nav.ts`。**

| Surface | 取用 | 說明 |
| --- | --- | --- |
| `AdminSidebar`（`/admin/*` 桌機側欄＋抽屜） | `ADMIN_NAV_SECTIONS` | 完整分組 ＋ icon |
| `RoleShell`（非 `/admin` 路由的桌機側欄＋抽屜） | `ADMIN_NAV_ITEMS` | 由前者 `flatMap` **衍生**；`SimpleNavSidebar` 沒有分組與 icon |

`RoleShell` 的那一份的定位是**回到 Admin 主控台的 cross-role 捷徑**，不是第二套 IA ——
因此它不得自行增刪項目。任何導覽調整只改 `lib/admin-nav.ts`；兩個 surface 的目的地
由 `tests/e2e/shell-consistency.spec.ts` 逐一比對，單獨改動任一邊都會讓測試失敗。

---

## 4. Dashboard responsibility

**Admin 登入後 10 秒內應該知道：** ① 今天有多少事等我處理 ② 有沒有異常 ③ 本期營運是否正常。

| 應該做 | 不應該做 |
| --- | --- |
| 計數、異常、趨勢、**分流到佇列** | 呈現「最近的資料」、重複佇列頁的清單、任何處理動作 |

| 區塊 | 決策 |
| --- | --- |
| KPI + 趨勢圖 | **保留** |
| 目前待處理（3 卡） | **保留** —— 這頁唯一有行動價值的區塊；維持「計數 + 入口」，不長出處理動作 |
| 最近訂單 | **改成「需要注意的訂單」**（待審核／被退回／逾期，可點）或移除 |
| 最近活動 | **改成「需要注意的活動」**（以 action allowlist 篩異常，套用中文句子並可點）或移除 |

**責任切分：** Dashboard 回答「有沒有事」；佇列頁回答「做這件事」；活動紀錄回答「發生過什麼事」。

### 4.1 Dashboard Actionable Counts（正式定義）

> **Dashboard 的「目前待處理」只顯示現在需要 Admin 主動執行下一步的工作，
> 不等同於所有 non-terminal records。**

判斷標準只有一個：**球現在是不是在 Admin／平台手上。**
等待對方回覆的東西不是我方待辦 —— 把它算進去，「今天還有多少事」這個數字永遠降不下來，
Admin 也就不再相信它。

| 卡片 | 計數狀態 | 排除 | canonical 定義 |
| --- | --- | --- | --- |
| 待審核教材 | `pending_review` | `changes_requested`（球在創作者）、`published`、`unpublished` | `materialWorkflow.ADMIN_BACKLOG_STATUSES` |
| 待審核付款憑證 | `manual_payment_proofs.review_status = 'pending'` | `approved` / `rejected`（已決定） | `adminDashboard.service`（憑證只有三態，`pending` 就是等 Admin） |
| 待處理檢舉 | `pending` + `investigating` | **`awaiting_creator`**（球在創作者）、`resolved` / `dismissed` / legacy `reviewed` | `reportWorkflow.ADMIN_ACTIONABLE_REPORT_STATUSES` |

**「未結案」與「待處理」是兩個不同的集合**，必須分開命名、分開計算：

```text
open（未結案）      = pending + investigating + awaiting_creator
adminActionable（待辦）= pending + investigating
open = adminActionable + awaiting_creator
terminal            = resolved + dismissed + reviewed(legacy)
```

**規則：**
1. 每個待辦數字都必須由 **canonical workflow module** 的狀態分組算出，
   不得在 Dashboard 或頁面各自手寫一組 status array —— 那正是這兩個數字曾經對不起來的成因。
2. 計數在 **backend**（`GET /admin/dashboard/summary`）產生，前端不做加總。
3. **API 欄位名稱必須與內容相符**：`pendingReportsCount` 維持字面上的 `status='pending'`，
   待辦改用新欄位 `actionableReportsCount`，不讓名字與語意永久矛盾。
4. 卡片的 CTA deep link 必須讓「點進去看到的清單」＝「卡片上的數字」
   （檢舉卡連 `?status=actionable`，不是 `?status=open`）。

---

## 5. Review Workspace pattern

`components/admin/AdminReviewWorkspace` 是 Admin 的正式 design pattern：**Queue → Decision**。

**適用條件（三者全部成立）：**
1. 有一疊同類待辦，Admin 要逐一清空；
2. 每一筆都需要看完脈絡後做出一個決定；
3. 決定會改變該筆的狀態，做完就離開這一筆。

| Page | 適用 | 理由 |
| --- | --- | --- |
| 教材審核 | ✅ | Phase 1 已採用 |
| 付款審核 | ✅ | 典型的逐筆決定 |
| 檢舉管理 | ✅ | 逐案處理 |
| 訂單管理 | ❌ | 沒有「決定」——是查詢頁 |
| 活動紀錄 | ❌ | 調查需要全寬時間軸與長文本 |
| 教學回饋 | ❌ | 沒有動作 |

**版型：** `xl` 以上固定高度工作區、左右各自捲動、兩欄等高；`xl` 以下單欄切換 + 返回鈕。
**界線：只共用版面，不共用 workflow。** 三個 domain 的決策邏輯差異很大，硬抽成同一個抽象會做出誰都不合身的東西。

---

## 6. Activity Log 定位

**是稽核／追責／客訴調查工具，不是「一般活動瀏覽器」。**

- Admin 的問題是 **entity-centric**（這張訂單／這個人／這份教材發生過什麼），不是「今天平台上發生了什麼」。
- 全域 Activity Log 的合理角色是**當你還不知道要看哪個對象時的搜尋入口** —— 找到第一筆，然後跳進 entity 時間軸。
- Orders / Users / Materials **應提供明確的「查看活動紀錄」入口**（三條 route 與後端端點都已存在）。

**資訊分層：**

| 層 | 內容 |
| --- | --- |
| 第一層 | 人話句子（誰、做了什麼、對象是誰）+ 時間 |
| 第二層 | `meta` 的**人話版**（金額、品項數、收件者、狀態 from→to）—— canonical formatter 為 `lib/admin-labels.ts` 的 `describeActivityMeta()`（見 `docs/mvp_rules.md` §22.3） |
| 第三層 | raw `action` / `log id` / `actor_id` / `target_id` / 原始 JSON（預設收合） |

未登記的 action 顯示為「其他（原始 code）」，不裸露 code，也不編造中文。

---

## 7. Refresh rule（Admin 統一規則）

1. **只有 Queue／Inbox 型頁面**提供手動重新整理（教材審核、付款審核、檢舉管理）。
   Reference / Audit / Investigation 型頁面（訂單、活動紀錄、教學回饋）**不提供**。
2. **有重新整理就必須有「最後更新 hh:mm」** —— 沒有時間戳的按鈕，使用者無從判斷是否該按。
3. **錯誤重試不算重新整理**：由 `ErrorState` 負責，頁首不再放一顆。
4. **操作後的資料更新由系統負責**，不得要求使用者手動刷新。
5. **樣式**：次要動作 —— icon + 時間戳（`components/ds/RefreshControl`），不與主要動作競爭視覺權重。
6. **未來**可由輪詢或 revalidate-on-focus 取代按鈕；屆時時間戳留下。

---

## 8. Teaching Feedback 決策

**Contextualize —— 移除 sidebar 入口，把評價摘要下放到 Admin 做決策的當下。**

- Admin 真正需要的是**單一教材的回饋脈絡**（處理檢舉／客訴時），不是全平台 timeline。
- 目前 `/admin/reviews-hub` 不支援搜尋／篩星等／依教材彙總／排序，且是 61 個請求的 N+1。
- 正確落點：**檢舉案件詳情**與（未來的）教材詳情顯示「平均 X 分・N 則・其中 M 則 ≤2 星・最新 3 則」，
  使用既有的 `GET /materials/:id/reviews` 與 `/rating`，不需要新 API。
- 「教材品質監控頁」（依教材彙總、可排序）列為 **Future**，需要 admin 彙總 API 與足夠的評價量。

> Phase 1 **未**改動 reviews-hub；此決策待排程。

### 8.1 實作現況（2026-08-23，`IA-01`）—— 上面是決策原文，這裡是已落地的事實

| 項目 | 現況 |
| --- | --- |
| Sidebar | **已移除**「教學回饋」一級入口（`components/admin/AdminSidebar.tsx`，「信任與安全」組現在只剩檢舉管理）。desktop 與 mobile drawer render 同一份 `sections`，兩邊同時生效 |
| 落點 | `components/admin/MaterialFeedbackContext.tsx`（唯讀）顯示「平均 X 分・N 則・其中 M 則 2 星以下・最新 3 則」，掛在 **`/admin/reports` 的案件詳情**與 **`/admin/materials/:id/reports`** 兩處 |
| API | 只用既有的 `GET /materials/:id/rating` 與 `GET /materials/:id/reviews`，**未新增任何端點**；單一教材固定 2 個請求 |
| `/admin/reviews-hub` | **route 保留**為相容入口（直接開仍正常渲染、維持唯讀），但不再是主導覽 destination，頁面上也明說脈絡已下放 |
| Moderation | **未實作**（隱藏／刪除／標記／評分重算皆無）——仍是 `FUT-P3` |
| N+1 | reviews-hub 的 61 請求**仍在**（該頁未改造），但已不在任何主要路徑上 —— 仍是 `FUT-T5` |

---

## 9. Reports 是檢舉的 source of truth

`/admin/reports` 是檢舉案件流程的**唯一** source of truth，也是**唯一**的正式下架入口
（`unpublish_material` 處置）。

- `/admin/materials` **不得**提供下架按鈕（理由見 `docs/material-review-workflow.md` §9）。
- `/admin/materials/[id]/reports` 是 **contextual read-only view**：它回答「這份教材被檢舉過什麼」，
  **不得**執行任何案件處置（mark reviewed / resolve / dismiss / unpublish 全部不行），
  也**不得**複製一套新版 workflow 到那一頁（那會變成第二套案件處理器，兩邊的稽核軌跡遲早分歧）。
  每一筆案件用「查看案件」深連回 `/admin/reports?status=all&case=<id>`。

  > ✅ 2026-08-23 完成：legacy「標記已處理」按鈕已移除，該頁改寫為 contextual read-only。

### 9.0 Reports 第一層命名：「未結案」不是「待處理」

`/admin/reports` 第一層是**案件範圍**（生命週期在哪一段），不是「誰的待辦」：

| chip | 集合 | 意義 |
| --- | --- | --- |
| **未結案** | `pending + investigating + awaiting_creator` | 案件還沒結束（含在等創作者回覆的） |
| **已結案** | `resolved + dismissed + reviewed(legacy)` | 終態 |
| **全部** | 兩者相加 | 查詢逃生口 |

原本叫「待處理中」，但它包含 `awaiting_creator` —— 那些案件的球在創作者手上。
名字說「待處理」、內容卻含「等別人回」，正是它與 Dashboard 待辦數字對不起來的原因。

「現在我要處理什麼」由**第二層的「待我處理」**（`pending + investigating`）回答，
它與 Dashboard 待辦卡是同一個定義，也是 Dashboard `?status=actionable` deep link 的落點。

`awaiting_creator` **不隱藏**：它在第二層照常可見，並附一句說明「正在等創作者回覆，
不計入待我處理與 Dashboard 待辦；創作者回覆後會自動回到調查中」。

### 9.1 legacy `reviewed`（已於 2026-08-23 收斂）

`reviewed` 的正式定位：**legacy closed status，唯讀相容，正式產品 UI 不再產生。**

| 面向 | 決策 |
| --- | --- |
| 狀態機 | **不是**任何合法轉移的目標 —— 不在 `ALLOWED_TRANSITIONS` 的任何一列，也不會出現在 `allowedTransitions` 回傳值（`Backend/utils/reportWorkflow.js` 的 `LEGACY_TERMINAL_STATUSES`） |
| 產品 UI writer | **0**。`/admin/materials/[id]/reports` 的「標記已處理」已移除 |
| Backend endpoint | `PATCH /admin/reports/:id` **保留但 deprecated**（回應帶 `Deprecation: true`），僅為既有外部 caller 的向後相容 |
| Postman | 正式 happy path 改用 `investigate → resolve`；legacy 只剩 `09 Legacy compatibility (deprecated)` 裡**不寫入資料**的 401/403/400 負向測試 |
| 歷史資料 | **保留、不回填、不刪除**。既有列反映「當時只做了標記已讀」，改成 `resolved` 會製造不存在的歷史事實 |
| UI 顯示 | 標籤為「**舊版已處理**」（不是「已處理」），詳情補一句「此案件使用舊版『標記已處理』流程結案，沒有新版案件的處置紀錄」 |
| IA 歸類 | 歸入「已結案」（`closed = resolved + dismissed + reviewed`），**不**給它自己的第二層 chip —— 它不是任何人的工作狀態 |

**歷史資料量（2026-08-23 唯讀盤點，未修改）：**
`teaching_platform` 30 筆（2026-04-19 ～ 2026-05-08）、
`teaching_platform_security_test` 63 筆（2026-04-19 ～ 2026-08-23，多為過去的 Postman 回歸所產生）。

**驗證：** 修改後跑一次完整 Postman regression，`reviewed` 筆數不變（63 → 63）。

---

## 10. 優先序

### P0（直接影響 Admin 能不能完成工作）
1. ✅ **教材審核補上審核能力**（Material Review MVP Phase 1，2026-08-23 完成）
2. ✅ **移除 `/admin/materials/[id]/reports` 的「標記已處理」按鈕**（2026-08-23 完成；該頁改為 contextual read-only，legacy endpoint 標記 deprecated）
3. ✅ 檢舉兩層篩選的視覺層級與 label 正名
4. ✅ Review Workspace 高度／捲動修正

### P1（導航理解、資訊層級、重複 workflow）
5. 教學回饋移出 sidebar，評價摘要放進檢舉案件詳情
6. Dashboard 兩個 widget 改成「需要注意的…」或移除
7. 活動紀錄資訊分層（`meta` 人話化，raw 收到第三層）
8. entity activity-log 入口補強（付款面板 → 訂單紀錄；檢舉詳情 → 教材紀錄）
9. ✅ Refresh 規則落地（佇列頁保留 + 最後更新時間；其餘移除）
10. 訂單管理補搜尋與買家 Email（需小幅 API 擴充）
11. 用戶管理／系統設定移出 sidebar

### P2（債務清理）
12. `/admin/activity-logs/[id]` 與三個 entity 紀錄頁遷移到 ds（含 `admin`/`parent` 字面值違規）
13. `/admin/orders` 由 legacy slate/indigo 樣式遷移到 ds
14. `reviews-hub` 的 N+1（若該頁改造才需要）

---

### Implementation status（2026-08-23 盤點；上面的清單是 audit 當時的原文，不修改）

**執行狀態與優先序以 `docs/pending-work-tracker.md` 為準。** 本節只做對照。

| 上表項目 | 現況 | Tracker ID |
| --- | --- | --- |
| 1–4（P0） | ✅ DONE | tracker §10 |
| 5 教學回饋移出 sidebar | ✅ **DONE**（2026-08-23）—— sidebar 已無「教學回饋」；摘要下放到檢舉案件詳情與教材檢舉脈絡頁，見 §8.1 | `IA-01` |
| 6 Dashboard 兩個 widget | ✅ **DONE**（2026-08-23）—— 兩張卡由 latest-N feed 改為 **exception feed**：訂單依 Backend 既有的 `operational_status ∈ { payment_rejected, pending_review }`（**未新增 SLA**），活動依 `ATTENTION_ACTIVITY_ACTIONS` allowlist ＋ `describeActivity()` ＋ 可導航。兩者的挑選都在 API 端完成。規則見 `docs/mvp_rules.md` §14.4 | `IA-04`（訂單）／`IA-05`（活動） |
| 7 活動紀錄資訊分層 | ✅ **DONE**（2026-08-23）—— 三層落地：第一層 `describeActivity()`、第二層新的 `describeActivityMeta()`（action-scoped，未登記的 key 不丟棄）、第三層 raw ＋ 原始 JSON。全站列表、`/admin/activity-logs/[id]` 與三個 entity 紀錄頁共用 `components/admin/ActivityLogCard` | `IA-02` |
| 8 entity activity-log 入口 | ✅ **DONE**（2026-08-23）—— 付款審核面板 →「查看此訂單的活動紀錄」、檢舉案件詳情 →「查看此教材的活動紀錄」，兩者都指向**既有** entity route，未新增 route 或 API | `IA-03` |
| 9 Refresh 規則 | ✅ DONE | tracker §10 |
| 10 訂單管理搜尋／Email | ✅ **DONE**（2026-08-23）—— `GET /admin/orders` 加上 `q`（訂單編號／買家 Email，`ILIKE` ＋ `%`/`_` 跳脫）與分頁（`utils/adminQuery.js` 同一份契約），回應新增 `buyer_email` 與 `pagination`；前端改用 `useListQueryState` ＋ `DataToolbar`／`FilterTabs`／`Pagination`。**未新增** SLA、未改動 operational state 定義 | `IA-06` |
| 11 用戶管理／系統設定移出 sidebar | ✅ **DONE**（2026-08-23）—— 兩者已不在側欄（desktop 與 mobile drawer 共用同一份 `sections`）；`/admin/users`、`/admin/settings` **route 保留可直達**（誠實的 placeholder，並註明「這一頁不在側欄裡」），`/admin/users/:userId/activity-logs` 這條依人查詢的入口不受影響。「平台管理」分組保留，目前只剩活動紀錄 | `IA-07` |
| 12 ds 遷移（含字面值違規） | ✅ **DONE**（2026-08-23，隨 `IA-02`）—— `/admin/activity-logs/[id]` 與三個 entity 紀錄頁由 legacy slate/indigo ＋ `@teaching-platform/ui` 改用 `components/ds`；raw `action` 與 `角色：{actor_role}`（`admin` / `parent` 字面值）不再是主要描述 | `IA-02` |
| 13 `/admin/orders` ds 遷移 | ✅ **DONE**（2026-08-23，隨 `IA-06`）—— 由 legacy slate/indigo ＋ 原生 `<select>` 改用 `components/ds` 的 `PageHeader`／`DataToolbar`／`FilterTabs`／`SurfaceCard`／`StatusPill`／`Pagination`；徽章沿用既有的 `ADMIN_ORDER_OPERATIONAL_STATUS_LABEL`／`_TONE`，Admin Orders 既有文案零變更。依 §7 這頁**不加**重新整理（Reference / Investigation 型） | `IA-06` |
| 5／11 的第二個 surface | ✅ **DONE**（2026-08-23）—— `RoleShell` 的 admin 清單原本是獨立的第二份定義，`IA-01`／`IA-07` 的收斂只在 `/admin/*` 生效。現已收斂到單一 source of truth `lib/admin-nav.ts`，見 §3.1 | `IA-08` |
| 14 `reviews-hub` N+1 | 仍存在（61 請求）。`IA-01` 後該頁已不是主入口，但 route 保留可直達，因此 N+1 **沒有自動消失**，只是不在主要路徑上 | `FUT-T5` |

---

## 11. Admin Design Principles

1. **Dashboard 只呈現需要注意與可行動的資訊**，不展示單純「最近資料」。
2. **Queue 型頁面才提供 refresh，且必須附「最後更新」**；其他頁型不提供。
3. **技術欄位不得成為主要資訊層** —— raw id / action code / JSON 一律收到展開後的第三層。
4. **相同 domain action 只存在一個 source of truth**（上架只在教材審核、下架只在檢舉處置）。
5. **Contextual information 優先放在 Admin 做決策的當下**，而不是為每種資料開一個 sidebar 頁。
6. **待辦計數只計「球在 Admin 手上」的狀態**；等待對方的狀態不得混入。
7. **狀態轉移規則集中在 canonical workflow module**（`reportWorkflow` / `paymentProofReview` / `materialWorkflow`），
   route 與 UI 都不自行推論。
8. **不做假的能力**：沒有資料模型支撐的按鈕、表格、狀態一律不做；能力邊界要在 UI 上誠實說明。
9. **同一個狀態可以有兩份文案**（Admin 視角 vs Creator 視角），但只能有一份狀態定義。
10. **mutation 成功不自動把畫面跳走** —— 先顯示結果，讓使用者確認自己做了什麼。

---

## 12. 退款／補救案件（`IA-10`，2026-09-12）

`/admin/remedy-cases`。backend 能力自 Gate 14 起就完整，但前台沒有入口 ——
上線後若依法或依契約必須退款，維運者只能直打 API。這一頁把那條路徑變成產品內可操作、
可稽核的流程。

### 12.1 為什麼它自成一個一級入口，不併進「檢舉管理」

「信任與安全」這一組現在有四件事，它們的**結論**各自不同：

| 入口 | 法律／規則基礎 | 結論是什麼 |
| --- | --- | --- |
| 檢舉管理 `/admin/reports` | 平台內容政策 | 教材下架／警告 |
| 消費申訴 `/admin/complaints` | 消保法 §43 | 申訴處理與回覆期限 |
| 個資權利請求 `/admin/privacy-requests` | 個人資料保護法 | 個資權利的實現 |
| **退款／補救案件** `/admin/remedy-cases` | 契約／`mvp_rules.md` §12.8 | **退多少錢、何時退、由誰執行** |

把任何兩者合併，都會讓「已處理」同時代表兩種不同的事實。四者刻意並列。

**刻意不帶 `status` query** —— 其餘三個的預設過濾是「待辦」，但補救案件的常見需求包含
查已完成案件的退款紀錄（對帳），預設看全部才合理。

### 12.2 這一頁有五項能力，少一項都走不完一個案件

1. 瀏覽佇列（`GET /admin/remedy-cases`）
2. 開啟詳情與稽核歷程（`GET /admin/remedy-cases/:id`）
3. 狀態轉移（`POST /admin/remedy-cases/:id/transition`）
4. **建立案件**（`POST /orders/:orderId/remedy-cases`）
5. **記錄退款執行**（`POST /admin/remedy-cases/:id/execute-refund`）

(5) 是 `remedy_pending → completed` 的**唯一**路徑 —— `refundRemedy.service.js` 明文禁止
用一般 transition 把有核准金額的案件標成 completed，因為那會產生一段
「宣稱已退款但拿不出憑據」的期間。少了 (5)，案件會永遠卡在「待執行補救」。

(4) 與 §9 的「沒有 Admin 代開檢舉案件的端點」**不衝突**：那條規則講的是內容檢舉。
補救案件的來路包含電話與 email 申訴，`Backend/routes/order.js` 本來就允許 admin
代訂單擁有者開案；`buyer_id` 由 backend 從訂單推得，**不是**前端指定的。

### 12.3 前端沒有狀態機

狀態轉移的合法性一律由 backend 裁決。被拒絕時 backend 回 409 ＋ `from` ＋ `allowed`，
UI **照實把 `allowed` 列出來**。好處不只是少寫一份 enum ——
而是前端永遠不可能與 backend 的狀態機不一致，因為它根本沒有自己的版本。
代價是使用者可能先選到一個非法轉移，但錯誤訊息會直接告訴他此刻允許哪些，
比灰掉一個沒有解釋的選項更有用。這條對應 §11 原則 7。

同理，金額上限（`amount_exceeds_approved`）、金錢／非金錢（`non_cash_remedy`）、
重複執行（`already_executed`）、案件類型 allowlist（`invalid_case_type`）
也都不在前端複製一份。前端只擋「必填欄位空白」。

### 12.4 文案必須守住三段式語意

```text
approved（已核准）  ≠  completed（案件完成）  ≠  退款已實際執行
```

平台沒有串接金流。execute-refund 表單記錄的是**已經在行外完成**的一筆匯款，
因此該區塊必須明講「平台不會轉帳，送出這張表單不會把錢匯給任何人」。
誤解這一點的人會在錢還沒匯出時就把案件結掉。這條對應 §11 原則 8。

### 12.5 動作結果不得被 refetch 洗掉（§11 原則 10 的具體實作）

詳情面板在**還沒有該案件的資料**時才整塊換成 loading；
動作成功後的 refetch 期間保留現有內容、原地更新。
最初的實作在 refetch 時把整個詳情換成 loading，導致
「狀態已更新」／「已記錄退款執行」在同一瞬間消失 ——
做完一個涉及金錢的動作卻沒有任何回饋留在畫面上。由 E2E 回歸鎖住。

切換案件時詳情整棵重新掛載（`key` ＝ case id）：少了它，
處置理由／退款金額／交易參考會跨案件殘留，
等於「在 A 案打的字可能被送到 B 案」。
