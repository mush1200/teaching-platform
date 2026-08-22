# 未完成／待補項目紀錄

本檔記錄截至目前「規劃或規格中有，但尚未完成或僅部分完成」之事項，來源包含：`frontend/daily-frontend-development-plan.md`、程式現況檢視、以及先前設計／PR 討論之對照。

---

## 1. 計畫文件（daily plan）尚未勾選者

### §5 品質補強

- [ ] **效能與分析追蹤**（例如 Web Vitals、分析工具、或錯誤追蹤）

### 「每次開發都要做的前端驗證」與文末 Checklist

下列多數在文件中仍為 `[ ]`，屬 **手動 QA／證據尚未回填**，而非程式必定未做：

- [ ] 手動驗證三種版面：mobile / tablet / desktop  
- [ ] 驗證 loading / empty / error 三態  
- [ ] 驗證表單：必填、格式錯誤、送出失敗、送出成功  
- [ ] 驗證角色權限（public / parent / teacher / admin）  
- [ ] 驗證 API 錯誤碼（至少 401 / 403 / 404 / 500）有可理解提示  
- [ ] 驗證公開頁 metadata（title / description / OG）與基本 a11y  

（計畫內備註：lint / typecheck / build 已通過；其餘待瀏覽器實測後勾選。）

---

## 2. 購買流程技術債（與後端契約一致性）

| 項目 | 現況 | 預期 |
|------|------|------|
| 結帳頁購物車明細 | `getCartItems()` 來自 **mock**（`edu-api-mock`） | 應改為後端 **`GET /cart`**（或專案約定之同源 API），與真實購物車一致 |
| 成立訂單 | **未呼叫** `POST /orders`，使用 **`ord_mock_${...}`** 導向 `upload-proof` | 應呼叫 **`POST /orders`**，以回傳之 **真實 `order.id`** 導向 `/orders/[id]/upload-proof` |
| 訂單／憑證閉環 | 與規格文件中「清空購物車、真實訂單編號」敘述可能不一致 | 接上真實建單後再行回歸測試 |

相關檔案（檢視點）：`frontend/apps/web/app/checkout/page.tsx`。

---

## 2.1 購物車前端體驗（本次已更新）

以下為近期已落地的前端行為，建議視為目前基準：

- **購物車卡片改為高密度橫向排列**：固定欄位對齊（checkbox / 圖片 / 文字 / 價格 / 數量 / 刪除），價格、數量、刪除同水平線。  
- **Typography 層級強化**：頁面標題、商品標題/小標、價格、訂單摘要、CTA 已做明確字級與權重分層。  
- **桌機左右區塊對齊**：購物車列表與訂單摘要採同一 grid container（`1fr + 360px`、`align-items: start`），並完成上緣視覺平行調整。  
- **空購物車例外入口**：空態保留 `前往探索教材` CTA，非空購物車頁面則維持結帳導向。  
- **購物車刪除/數量調整可持久化**：重進頁面不會回復成初始 mock 清單。  
- **徽章數字動態化**：Sidebar/Topbar 的購物車與訂單徽章改為依實際資料同步更新。  
- **Buyer Sidebar UI spec**：展開／收合行為已文件化，見 `docs/buyer-sidebar-ui-spec.md`（2026-05-09）。

---

## 3. 產品功能：MVP 占位／未接後端

- **檢舉教材**（教材詳情）：已接 **`POST /reports`**（家長登入後填寫原因送出）；下列仍屬其他未完成項。  
- **第三方註冊／登入**：Google、Facebook 按鈕仍為 disabled「即將開放」。  
- **`apps/mobile`**：多為 **README / package** 層級，非可發佈之完整行動 App（與「建置 apps/mobile」之完整產品目標仍有落差）。

---

## 4. 自動化測試：E2E 尚未補齊之断言

以下檔案中仍有大量 `// TODO(assert): ...`，代表 **情境與断言未寫滿**：

- `frontend/apps/web/tests/e2e/parent.spec.ts`  
- `frontend/apps/web/tests/e2e/public.spec.ts`  
- `frontend/apps/web/tests/e2e/teacher.spec.ts`  
- `frontend/apps/web/tests/e2e/api-proxy.spec.ts`  

---

## 5. 設計／改版 roadmap 中可能仍不完整之處（非逐頁稽核）

下列為 **高層級** 待辦；若需與 `docs/page-token-usage-mapping-v1.1.md` 或設計長文 **逐頁對照**，應另開一次專門盤點：

- 教材列表／詳情與 **真實資料源**、購物車／下單 **全流程** 一致化。  
- 上傳憑證：**規格中的 drag & drop 區** vs 現況 **僅憑證網址輸入**。  
- Admin：**檢舉 severity 分級**、**教學回饋管理進階操作**、**營運時間軸** 等進階頁仍未做。
  （檢舉的「調查 → 與創作者往返 → 判定 → 處置 → 稽核」案件流程已於 2026-08-22 完成，見 §7；
  severity 分級與教學回饋的 moderation 能力**不在**該輪範圍內。）  

---

## 6. 建議優先順序（延續先前結論）

1. **結帳改接真實購物車 + `POST /orders`**，以真 `order.id` 走後續憑證與訂單列表（對 MVP 正確性影響最大）。  
2. **手動驗證**並回填 `daily-frontend-development-plan.md` 勾選（或於本檔附連結／日期註記）。  
3. **效能／分析**：至少一種最小埋點或監控策略。  
4. 依商業優先：**第三方登入／Admin 即時 KPI／E2E 断言** 等分期處理（檢舉已接後端，見 §3）。

---

## 7. Admin Operations UX Closure — Deferred / Product Decisions

**來源：** 2026-08-22 Admin Operations UX Closure Epic。
以下每一項都是該輪**已經調查確認、但刻意不實作**的工作 —— 不是遺漏，是範圍決定。

實作範圍與已完成的部分見 `docs/mvp_rules.md` §6、§12、§20–§22 與
`docs/teaching-platform-mvp-spec-v1.4.md` §9。

> 格式：每一項固定四行 —— **現況限制** / **延後原因** / **需要的決策或相依** / **建議下一階段**。
> 不要在這裡寫「TODO: 之後改善」這種沒有資訊的條目。

---

### 7.1 Reports（檢舉案件）

#### R-1 創作者補充說明的附件上傳

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `reports` 與 `report_events` 都沒有附件欄位。創作者在 `/creator/cases`
  只能提交純文字；UI 已明白告知「若需提供檔案佐證，請在說明中留下可存取的連結」。
  全平台唯一的上傳管線是付款憑證（`Backend/routes/order.js` 的 multer + 本機磁碟）。
- **延後原因:** 需要新的 schema、新的上傳端點、儲存位置與保存期限政策，以及檔案掃描決策。
  那是一個獨立功能，不是 UX 收斂。
- **需要的決策或相依:** 允許的檔案型別與大小上限；儲存在哪裡（沿用本機磁碟或改物件儲存）；
  是否需要病毒／內容掃描；Admin 端是否也要能上傳。
- **建議下一階段:** 沿用 payment-proof 的 multer 慣例先做「創作者單向上傳、Admin 唯讀」的最小版本，
  附件掛在 `report_events` 上而不是 `reports`。

#### R-2 案件通知（email vs in-app）

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** 平台沒有 notifications 資料表；`Backend/services/emailService.js` 只涵蓋
  訂單／付款事件。創作者是**主動**到 `/creator/cases` 查看，側欄以
  `actionRequiredCount` 徽章提示待回覆數量。
- **延後原因:** 「用 email 還是站內通知」是產品決策，兩條路的 schema 與維運成本完全不同。
- **需要的決策或相依:** email（沿用 SMTP，無新 schema，但無法追蹤已讀）vs
  in-app（需 notifications 表 + 已讀狀態 + 清單 UI）vs 兩者並行；
  以及哪些 case event 值得通知（只有「要求補充說明」，還是包含最終處置）。
- **建議下一階段:** 先做 email，事件限定在 `creator_response_requested` 與 `resolution` 兩種；
  in-app 通知等到有第二個通知來源時再一起做。

#### R-3 使用者停權 / 更強的 moderation action

- **Status:** `BLOCKED — schema does not exist`
- **現況限制:** `users` 只有 `id / email / password_hash / role / created_at`，
  **沒有 status 或 suspension 欄位**。因此 `utils/reportWorkflow.js` 的處置 allowlist
  刻意只有 `dismissed / warning / request_changes / unpublish_material`；
  「停權」沒有被放進去，以免做出一顆什麼都不會發生的按鈕。
- **延後原因:** 停權會牽動既有訂單、已上架教材、登入流程與下載授權，不是加一個欄位就結束。
- **需要的決策或相依:** 停權後該創作者已上架的教材如何處理（一併下架？保留但不可購買？）；
  已成立的訂單與下載權是否仍有效；是否需要停權期限與自動復權；申訴流程。
- **建議下一階段:** 先定義 `users.status` 的狀態機與上述連動規則，再回頭把
  `suspend_user` 加進 `REPORT_RESOLUTIONS`。

#### R-4 Legacy `reviewed` 資料遷移決策

- **Status:** `DECIDED — do not backfill（可再議）`
- **現況限制:** `reports.status` 保留 legacy 值 `reviewed`（舊版「標記已讀」的終態），
  既有列**未回填**。新 UI 顯示「已標記處理（舊版）」，只能在「全部」篩選下看到，
  詳情可讀但沒有任何可執行動作（`allowedTransitions = []`，所有新動作回 409）。
- **延後原因:** 回填成 `resolved` 會抹掉「當時只是標記已讀」與「當時真的做了處置」的差別，
  那是稽核語意的損失，不是資料清理。
- **需要的決策或相依:** 若要回填，必須先決定這些歷史案件該對應到哪一種 `resolution`
  （目前它們沒有 resolution，因為當時的流程根本不記錄處置）。
- **建議下一階段:** 維持現狀。等到 legacy 列在 UI 上真的造成困擾時，
  再考慮加一個「歷史案件」篩選頁籤，而不是改資料。

---

### 7.2 Payments（付款審核）

#### P-1 買家付款申報欄位

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `POST /orders/:id/payment-proof` 只收檔案（`multer.array('proofs')`）。
  `manual_payment_proofs` 沒有下列任何一個欄位，Admin 審核面板因此**不顯示**
  「使用者付款申報」區塊（不編造不存在的資料）：
  - 付款日期（payment date）
  - 匯款金額（remitted amount）
  - 帳號末碼（account last digits）
  - 付款人姓名（payer name）
- **延後原因:** 這些欄位要加在**買家端的上傳流程**上，屬於 buyer surface 的改動；
  本輪的範圍是 Admin 營運閉環，不動買家流程。
- **需要的決策或相依:** 哪些欄位必填、哪些選填；帳號末碼要幾碼（個資最小化）；
  付款人姓名與 `users` 目前沒有姓名欄位的關係（見 U-2）；
  既有的 proof 列沒有這些值，Admin UI 要如何呈現「舊資料沒有」。
- **建議下一階段:** 先加「匯款金額」與「付款日期」兩個欄位即可大幅提升可判斷性，
  兩者都能與 `orders.total_amount` / `orders.created_at` 直接比對。

---

### 7.3 User Management（用戶管理）

`/admin/users` 目前是**誠實的 placeholder**：說明功能未開放、指向可用的替代入口
（活動紀錄依 Email 搜尋），並列出開放前必須先回答的問題。**沒有假表格、沒有假按鈕。**

#### U-1 Admin user list API

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** Backend **完全沒有** `/admin/users` 端點。
- **延後原因:** 端點形狀取決於 U-2 ~ U-5 的答案，先寫 API 只會寫錯。
- **需要的決策或相依:** U-2、U-3、U-4。
- **建議下一階段:** 先做唯讀清單（搜尋 + 分頁 + 角色篩選），沿用
  `Backend/utils/adminQuery.js` 的分頁契約，不含任何寫入動作。

#### U-2 顯示身分策略（目前只有 email）

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `users` 沒有 name / display_name。整個後台（檢舉、付款、活動紀錄）
  都以 **email 當作唯一的人類可讀識別**。付款審核也因此**無法**用「購買者姓名」搜尋。
- **延後原因:** 加姓名欄位牽涉註冊流程、既有資料的補值，以及個資範圍。
- **需要的決策或相依:** 是否新增 `display_name`；註冊時必填或選填；既有帳號如何補；
  Admin 後台顯示 email 還是姓名（或兩者）。
- **建議下一階段:** 加一個 nullable `display_name`，後台顯示 `display_name ?? email`，
  不強制既有帳號補值。

#### U-3 帳號狀態 / 停權模型

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** 沒有 `users.status`。與 R-3 是同一個依賴。
- **延後原因:** 見 R-3。
- **需要的決策或相依:** 見 R-3。
- **建議下一階段:** 與 R-3 一起做，不要分兩次改 `users` 的 schema。

#### U-4 Admin 可見的個資範圍

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** 目前沒有明文規範。Admin 在檢舉、付款、活動紀錄各頁都看得到 email。
- **延後原因:** 這是政策問題，不是實作問題。
- **需要的決策或相依:** Admin 可以看到哪些欄位；是否需要遮罩（例如 email 部分隱藏）；
  不同 admin 是否應有不同權限層級（目前 admin 是單一角色，沒有細分）。
- **建議下一階段:** 先寫進 `docs/mvp_rules.md` 的角色邊界章節，再談實作。

#### U-5 Admin 查閱行為的稽核

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `activity_logs` 只記錄**寫入**行為（核准、退回、處置、上下架）。
  Admin **讀取**個資（開啟用戶詳情、搜尋 email）不留紀錄。
- **延後原因:** 讀取稽核會大幅增加 `activity_logs` 的寫入量，需要先確定保存期限與查詢需求。
- **需要的決策或相依:** 是否需要（法遵要求？）；若需要，記錄粒度（每次查詢 vs 每次開啟詳情）；
  保存期限與清理策略。
- **建議下一階段:** 若確定需要，用獨立的 `access_logs` 表，不要混進 `activity_logs`
  ——後者是業務稽核軌跡，混入讀取事件會把它稀釋掉。

---

### 7.4 Teaching Feedback（教學回饋管理）

`/admin/reviews-hub` 目前是**唯讀檢視**：頁面已明說「目前沒有下架或隱藏單筆回饋的 API」。

**先釐清 domain：** 這一頁管理的是 `review` 表 ——
`(material_id, parent_id, rating 1–5, comment, created_at)`，每位買家每份教材限一則。
也就是**買家撰寫的商品評價（星等 + 文字）**，不是老師的教學心得，也與 `reports` 無關聯。
UI 沿用「教學回饋」的稱呼，但資料模型是 review。**討論範圍時請用 review 的語意。**

#### F-1 Review moderation 範圍

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** 沒有任何 moderation API。Admin 只能看。
- **延後原因:** 在確認 domain（見上）之前開發一整套評論管理後台，很可能做錯對象。
- **需要的決策或相依:** Admin 到底需要對 review 做什麼 —— 只是查看脈絡，還是要能介入內容。
- **建議下一階段:** 先確認是否真的需要 moderation；若只是「出事時查得到」，
  目前的唯讀檢視 + 檢舉流程可能就夠了。

#### F-2 隱藏 / 標記能力

- **Status:** `NOT STARTED — depends on F-1`
- **現況限制:** `review` 沒有 status / hidden / flagged 欄位。
- **延後原因:** 見 F-1。
- **需要的決策或相依:** 隱藏是軟刪除還是狀態欄位；作者看不看得到自己被隱藏；
  隱藏後教材評分平均是否重算（會影響 `GET /materials/:id/rating`）。
- **建議下一階段:** 若要做，用 nullable `hidden_at` + `hidden_by`，並同步決定評分計算口徑。

#### F-3 與 reports 的關聯

- **Status:** `NOT STARTED — needs product decision`
- **現況限制:** `reports.material_id` 指向教材，**沒有**指向 review 的欄位。
  目前無法檢舉一則評價，只能檢舉教材。
- **延後原因:** 需要先決定 review 是否為可檢舉對象。
- **需要的決策或相依:** 是否開放買家／創作者檢舉不當評價；若開放，
  `reports` 要改成 polymorphic target 還是新增獨立的 `review_reports`。
- **建議下一階段:** 若要做，新增獨立表比改 `reports` 成 polymorphic 安全
  ——後者會動到已經穩定的檢舉案件流程。

#### F-4 彙總 API（移除目前的 60 筆 N+1）

- **Status:** `KNOWN LIMITATION — deferred with F-1`
- **現況限制:** `/admin/reviews-hub` 先取 `GET /admin/materials?limit=60`，
  再對每一份教材各發一次 `GET /materials/:id/reviews` —— 最多 61 個請求，
  且只涵蓋前 60 份教材。這是全站唯一還存在的 N+1，頁面上已明白標示此限制。
- **延後原因:** 修它需要一支 admin 端的彙總端點，而端點形狀取決於 F-1 / F-2
  （要不要回傳 hidden 狀態、要不要支援 moderation 篩選）。
  在範圍未定前先做端點，等於再做一次。
- **需要的決策或相依:** F-1。
- **建議下一階段:** 做 `GET /admin/reviews`（分頁 + 搜尋 + 依教材／評分篩選），
  沿用 `Backend/utils/adminQuery.js` 的分頁契約，一併移除 60 筆上限與 N+1。

---

### 7.5 System Settings（系統設定）

`/admin/settings` 目前是**誠實的 placeholder**：頁面直接列出 audit 結果
——哪些常數寫在程式碼裡（附 canonical 檔案位置），哪些設定刻意不從 UI 暴露。
**沒有做任何假的設定表單。**

#### S-1 判定哪些業務常數真的該由 Admin 調整

- **Status:** `AUDITED — no item currently qualifies`
- **現況限制:** audit 結論是目前**零**項適合放進 Admin UI。可調的東西不是部署環境變數
  （DB 連線、`JWT_SECRET`、SMTP 憑證、admin 建立），就是有明確 canonical 位置的程式常數：

  | 常數 | 位置 |
  | --- | --- |
  | 付款期限（訂單建立後 3 天） | `Backend/services/adminPaymentProofs.service.js` |
  | 每張訂單憑證上限（3 張 / 單張 10MB） | `Backend/routes/order.js` |
  | Admin 清單分頁上限（每頁最多 100） | `Backend/utils/adminQuery.js` |
  | 檢舉處置選項 | `Backend/utils/reportWorkflow.js` |
  | 付款退件原因選項 | `Backend/utils/paymentProofReview.js` |

- **延後原因:** 沒有任何一項有明確的「營運需要在不發版的情況下改它」的需求。
  為了讓設定頁看起來有內容而暴露這些值，只會增加誤設風險。
- **需要的決策或相依:** 上表哪幾項營運真的會想自己改。
- **建議下一階段:** 等到出現第一個真實需求再做，不要預先建設。

#### S-2 DB-backed config model

- **Status:** `NOT STARTED — depends on S-1`
- **現況限制:** 沒有 config 資料表；所有值都是程式常數或環境變數。
- **延後原因:** 在 S-1 選出項目之前，做通用 config 表是過度設計。
- **需要的決策或相依:** S-1。
- **建議下一階段:** 若最終只有 1–2 項，用具名欄位的單列設定表即可，
  不要做 key-value 通用 config（那會失去型別與 CHECK 約束）。

#### S-3 設定變更的稽核軌跡

- **Status:** `NOT STARTED — depends on S-2`
- **現況限制:** 不適用（目前沒有可從 UI 變更的設定）。
- **延後原因:** 見 S-2。
- **需要的決策或相依:** S-2。
- **建議下一階段:** 任何一項設定變成 Admin 可改的同時，就必須寫
  `activity_logs`（`target_type = 'setting'`，meta 記錄前後值）——這不該是第二階段的事。

---

### 7.6 Materials（教材審核）

#### M-1 `/admin/materials` 的預設篩選

- **Status:** `DECIDED — keep `all`（可再議）`
- **現況限制:** 直接開 `/admin/materials`（不帶 query）時預設「全部」，不是「待審核」。
  側欄入口帶的是 `?status=pending_review`，filter chip 上也有待審數量。
- **延後原因:** 既有的 `tests/e2e/helpers/routes.ts` 與 `admin.spec.ts` 以無參數路徑開啟此頁
  並期待看到所有 fixture；改預設值會改動既有 product contract 與測試。
- **需要的決策或相依:** 產品是否希望「打開教材審核就只看到待審」。
- **建議下一階段:** 若要改，同一個 PR 內把 `defaultFilter` 改成 `pending_review`、
  更新 `admin.spec.ts` 的期待，並確認 `ADMIN_ROUTES` 的煙霧測試仍合理。

---

### 7.7 Testing / Platform

#### T-1 Buyer / public E2E 規格缺陷（阻擋 full production E2E 全綠）

- **Status:** `OPEN — pre-existing, not caused by the Epic`
- **現況限制:** 在 production build 上跑完整套件為
  **228 passed / 18 failed / 26 skipped（exit 1）**。18 個失敗全部落在
  `tests/e2e/public.spec.ts`（4 × 2 projects）、`tests/e2e/parent.spec.ts`（3 × 2）與
  `critical-acceptance.spec.ts` 的 `ORDER | CI | 6-1`、`JOURNEY | NIGHTLY | 16`（各 × 2）。
  **Admin / Creator / shell 相關的 spec 全數通過。**

  已用實測建立 baseline：把 `RoleShell.tsx` 還原成 `HEAD` 後重新 build 並重跑，
  `public.spec.ts` + `parent.spec.ts` 得到 **完全相同的 4 passed / 14 failed**。
  因此這些失敗與本輪改動無關。

  已定位的成因之一：`parent.spec.ts` 只設 `localStorage`、不設 cookie，
  而 `middleware.ts` 是讀 cookie 的，於是每一條路由都被導向 `/login`，
  `<main>` 自然不存在。repo 自己的 `tests/e2e/helpers/auth.ts` 註解就寫著這個陷阱。
- **延後原因:** 屬 buyer surface 的既有測試缺陷，不在 Admin Operations 的範圍內；
  在本輪順手改會混淆 Epic 的 diff 邊界。
- **需要的決策或相依:** 無產品決策，純工程修復。
- **建議下一階段:** `parent.spec.ts` 改用既有的 `signInAs()`（同時設 cookie 與 localStorage）；
  `public.spec.ts` 與那兩個 buyer check 需個別診斷。修完後 full production E2E 應可 exit 0。

---

## 更新紀錄

| 日期 | 說明 |
|------|------|
| 2026-04-27 | 初版：依程式與計畫文件檢視整理 |
| 2026-05-03 | 同步規格：`GET /materials` 品質分排序、query 忽略與前端補位；**檢舉**改為已接 API（更新 §3、§6） |
| 2026-05-06 | 同步購物車前端現況：高密度卡片、層級排版、左右對齊、空購物車 CTA、徽章動態與本地持久化（新增 §2.1） |
| 2026-08-22 | 新增 §7：Admin Operations UX Closure Epic 的 deferred 項目與待產品決策（Reports / Payments / User Management / Teaching Feedback / System Settings / Materials / Testing）。同步移除 §3 已不存在的 `OPS_OVERVIEW` mock 項目，並收斂 §5 的 Admin 進階頁描述（檢舉案件流程已完成，severity 與教學回饋 moderation 仍未做）。 |
