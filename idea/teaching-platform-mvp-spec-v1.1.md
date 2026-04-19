# 教材平台 — MVP 規格書

**版本：** MVP v1.1  
**付款策略：** 方案 B（人工解鎖）  
**資料庫：** PostgreSQL  
**架構優先：** 後端優先（Backend-first）  

---

## 1. 專案目標

建立一個平台，使：

- 教師可上傳教材。
- 家長可瀏覽教材。
- 家長可將項目加入購物車。
- 家長可於單一訂單中申請多筆教材。
- 平台透過**人工確認付款**解鎖下載權限。
- 所有行為可追溯（符合法遵）。
- 架構日後可升級為自動金流（方案 C）。

---

## 2. MVP 範圍

### 2.1 核心功能

#### 教師

- 註冊／登入
- 上傳教材
- 編輯教材資訊（metadata）
- 勾選智慧財產權聲明
- 查看教材狀態

#### 家長

- 註冊／登入
- 瀏覽教材
- 搜尋教材
- 加入購物車
- 從購物車建立訂單
- 上傳付款憑證
- 查看訂單狀態
- 下載已核准之教材
- 評論教材

#### 管理員

- 審核教材
- 審核付款憑證
- 核准訂單
- 拒絕訂單
- 下架教材
- 查看日誌（log）
- 查看檢舉

### 2.2 MVP 不包含

- 自動金流
- 電子發票
- 推播通知
- AI 推薦
- 學習地圖
- 離線下載
- 社群功能
- 多語系介面

---

## 3. 系統角色

| 角色   | 說明       |
|--------|------------|
| Teacher | 教材提供者 |
| Parent  | 教材使用者 |
| Admin   | 平台營運者 |

---

## 4. 核心流程

### 4.1 教材上架

**教師：** 登入 → 建立教材 → 填寫資訊 → 同意智財聲明 → 上傳檔案 → `status = pending_review`

**管理員：** 審核教材 → `status = published`

### 4.2 購物車

**家長：** 瀏覽 → 加入購物車 → 查看購物車 → 建立訂單

### 4.3 人工付款（方案 B）

**家長：** 建立訂單 → 顯示付款說明 → 上傳憑證 → `status = proof_uploaded`

**管理員：** 查看憑證 → 確認付款 → `status = approved`

**系統：** 若訂單為 `approved`，該訂單內所有教材皆可下載。

### 4.4 下載

**家長：** 我的教材 → 下載

**系統：** 檢查權限 → 產生簽章 URL → 回傳 URL

---

## 5. 系統架構

### 5.1 技術堆疊

| 層級   | 選型              |
|--------|-------------------|
| 後端   | Node.js + Express |
| 資料庫 | PostgreSQL        |
| ORM    | Prisma 或 Sequelize |
| 儲存   | S3／Cloudflare R2 |
| 網頁   | React             |
| 行動端 | React Native      |

### 5.2 原則

- 後端為授權判斷的**唯一真實來源**。
- 前端不得單獨決定下載權限。
- 狀態機**僅**存在於後端。
- 所有下載皆須經過後端。

---

## 6. 資料模型（PostgreSQL）

### 6.1 User（使用者）

| 欄位           | 型別      |
|----------------|-----------|
| id             | uuid      |
| email          | text      |
| password_hash  | text      |
| role           | enum      |
| created_at     | timestamp |

### 6.2 Material（教材）

| 欄位                     | 型別      |
|--------------------------|-----------|
| id                       | uuid      |
| title                    | text      |
| description              | text      |
| category                 | text      |
| age_range                | text      |
| price                    | numeric   |
| teacher_id               | uuid（FK User） |
| status                   | 列舉：`pending_review`、`published`、`unpublished` |
| file_key                 | text      |
| ip_declaration_accepted  | boolean   |
| ip_declaration_at        | timestamp |
| created_at               | timestamp |

### 6.3 Cart（購物車）

| 欄位       | 型別      |
|------------|-----------|
| id         | uuid      |
| user_id    | uuid      |
| created_at | timestamp |

### 6.4 CartItem（購物車項目）

| 欄位         | 型別      |
|--------------|-----------|
| id           | uuid      |
| cart_id      | uuid      |
| material_id  | uuid      |
| created_at   | timestamp |

### 6.5 Order（訂單，取代舊版 Purchase）

一筆訂單可包含多筆教材。

| 欄位            | 型別      |
|-----------------|-----------|
| id              | uuid      |
| user_id         | uuid      |
| status          | 列舉：`pending`、`proof_uploaded`、`approved`、`rejected` |
| total_price     | numeric   |
| payment_method  | text      |
| proof_url       | text      |
| rejected_reason | text      |
| approved_by     | uuid（可為 null） |
| approved_at     | timestamp |
| created_at      | timestamp |

### 6.6 OrderItem（訂單項目）

| 欄位           | 型別      |
|----------------|-----------|
| id             | uuid      |
| order_id       | uuid      |
| material_id    | uuid      |
| price_snapshot | numeric   |
| created_at     | timestamp |

### 6.7 Review（評論）

| 欄位         | 型別      |
|--------------|-----------|
| id           | uuid      |
| user_id      | uuid      |
| material_id  | uuid      |
| rating       | int       |
| comment      | text      |
| created_at   | timestamp |

**限制：** 僅已購買該教材者可評論。

### 6.8 Report（檢舉）

| 欄位         | 型別      |
|--------------|-----------|
| id           | uuid      |
| user_id      | uuid      |
| material_id  | uuid      |
| reason       | text      |
| created_at   | timestamp |

### 6.9 ActivityLog（活動日誌）

| 欄位         | 型別      |
|--------------|-----------|
| id           | uuid      |
| actor_id     | uuid      |
| actor_role   | text      |
| target_type  | text      |
| target_id    | uuid      |
| action       | text      |
| meta         | jsonb     |
| created_at   | timestamp |

---

## 7. 狀態機

### 7.1 Material（教材）

```
pending_review → published → unpublished
```

### 7.2 Order（訂單）

```
pending → proof_uploaded → approved
                        → rejected
```

不可跳階（略過中間狀態）。

---

## 8. 權限邏輯

### 8.1 下載

```text
可下載 =
  order.status === "approved"
  且該教材存在於該訂單的 OrderItem 中
```

### 8.2 評論

```text
可評論 =
  使用者已購買該教材
  且 order.status === "approved"
```

### 8.3 瀏覽

```text
可見教材 ⇔ material.status === "published"
```

---

## 9. API 設計

### 9.1 認證

| 方法   | 路徑              |
|--------|-------------------|
| POST   | `/auth/register`  |
| POST   | `/auth/login`     |
| GET    | `/me`             |

### 9.2 教材

| 方法   | 路徑               | 備註   |
|--------|--------------------|--------|
| GET    | `/materials`       |        |
| GET    | `/materials/:id`   |        |
| POST   | `/materials`       | 教師   |
| PUT    | `/materials/:id`   |        |

### 9.3 購物車

| 方法   | 路徑                    |
|--------|-------------------------|
| GET    | `/cart`                 |
| POST   | `/cart/items`           |
| DELETE | `/cart/items/:id`       |

### 9.4 訂單

| 方法   | 路徑                      | 備註     |
|--------|---------------------------|----------|
| POST   | `/orders`                 |          |
| GET    | `/orders/my`              |          |
| POST   | `/orders/:id/proof`       |          |
| POST   | `/orders/:id/approve`     | 管理員   |
| POST   | `/orders/:id/reject`      | 管理員   |

### 9.5 下載

| 方法   | 路徑                    |
|--------|-------------------------|
| GET    | `/download/:materialId` |

### 9.6 評論

| 方法   | 路徑                        |
|--------|-----------------------------|
| POST   | `/reviews`                  |
| GET    | `/materials/:id/reviews`    |

### 9.7 管理後台

| 方法   | 路徑                 |
|--------|----------------------|
| GET    | `/admin/materials`   |
| GET    | `/admin/orders`      |
| GET    | `/admin/logs`        |

---

## 10. 檔案下載策略

- 每次下載皆由後端驗證。

**流程：** 用戶端請求下載 → 後端檢查訂單／權利 → 後端產生**短效、單次使用之簽章 URL** → 回傳 URL 給用戶端。

**目標：** 防止未付款下載、URL 外洩與重放、暴力嘗試下載、越權存取；並減輕重複建立訂單等濫用（詳見安全設計）。

---

## 11. 法律與合規

### 11.1 平台角色

- 平台為中介角色。
- 教材責任歸教師。
- 平台得下架教材。

### 11.2 必備文件

- 服務條款  
- 隱私權政策  
- 退款政策  
- 人工解鎖／付款說明  

### 11.3 智慧財產權

教師須同意：

- 內容為原創或合法授權。
- 侵權責任由教師承擔。
- 平台得移除內容。

---

## 12. 安全設計

### 12.1 必須防止

- 未付款下載
- URL 外洩／重放
- 暴力嘗試下載
- 重複建立訂單等濫用（適用處）
- 水平／垂直越權

### 12.2 必須記錄日誌

- 教材建立  
- 教材上架  
- 加入購物車  
- 建立訂單  
- 上傳憑證  
- 核准訂單  
- 拒絕訂單  
- 下載嘗試  
- 下載成功  
- 下載失敗  

---

## 13. 未來擴充

- 自動金流  
- 電子發票  
- 教師收入分潤  
- 優惠券  
- 推薦系統  
- 學習地圖  
- 團體購買  
- API 流量限制  
- 多語系介面  

---

## 14. MVP 成功條件

- 教師可上傳教材。
- 家長可使用購物車。
- 家長可建立訂單。
- 管理員可核准訂單。
- 家長可下載具權限之教材。
- 核心流程具完整稽核軌跡。

---

## 15. 開發階段

| 階段    | 重點 |
|---------|------|
| 第一階段 | 訂單狀態機、權限系統、下載保護、法律稽核日誌 |
| 第二階段 | 網頁教師端、網頁家長端、購物車 UI |
| 第三階段 | React Native App |

---
