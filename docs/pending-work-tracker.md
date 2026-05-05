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

## 3. 產品功能：MVP 占位／未接後端

- **檢舉教材**（教材詳情）：已接 **`POST /reports`**（家長登入後填寫原因送出）；下列仍屬其他未完成項。  
- **第三方註冊／登入**：Google、Facebook 按鈕仍為 disabled「即將開放」。  
- **Admin 儀表板「今日營運」**：`OPS_OVERVIEW` 為 **前端常數 mock**，未接即時 API／報表。  
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
- Admin：檢舉 severity、評論管理進階操作、儀表板圖表與「營運時間軸」等 **進階頁** — 多數 **未做或只做局部**。  

---

## 6. 建議優先順序（延續先前結論）

1. **結帳改接真實購物車 + `POST /orders`**，以真 `order.id` 走後續憑證與訂單列表（對 MVP 正確性影響最大）。  
2. **手動驗證**並回填 `daily-frontend-development-plan.md` 勾選（或於本檔附連結／日期註記）。  
3. **效能／分析**：至少一種最小埋點或監控策略。  
4. 依商業優先：**第三方登入／Admin 即時 KPI／E2E 断言** 等分期處理（檢舉已接後端，見 §3）。

---

## 更新紀錄

| 日期 | 說明 |
|------|------|
| 2026-04-27 | 初版：依程式與計畫文件檢視整理 |
| 2026-05-03 | 同步規格：`GET /materials` 品質分排序、query 忽略與前端補位；**檢舉**改為已接 API（更新 §3、§6） |
