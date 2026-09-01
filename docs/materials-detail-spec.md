# 📘 教材上架與商品 Detail Spec

---

# 1. 目標

將教材從「單純電子檔」升級成：

👉 **可被理解、可被購買、可被拿去教學的商品**

---

# 2. 建立教材時必填欄位

```text
title
price
fileId
cover_image_url
teaching_objective
teaching_methods（array，至少 1 個）
usage_duration
activity_steps
contents（至少 1 筆）
```

---

## 欄位說明

| 欄位                 | 說明          |
| ------------------ | ----------- |
| title              | 教材標題        |
| price              | 價格          |
| fileId             | 教材本體檔案。先呼叫 **POST /teacher/uploads/material-file** 上傳取得，**不是** URL 也不是路徑。見 `docs/material-file-storage-and-delivery.md` |
| cover_image_url    | 封面照（教材列表主圖 / Detail 第一屏 / 分享預覽）；建議透過 **POST /teacher/uploads/material-media** 上傳後取得 URL 再填入。也可直接填外部 CDN 連結 |
| teaching_objective | 教學目標        |
| teaching_methods   | 教學玩法（array） |
| usage_duration     | 使用時間        |
| activity_steps     | 教學步驟        |
| contents           | 教材內容清單      |

---

# 3. 建議填寫但不強制

```text
age_range
extension_value
short_description
detail_images
demo_video_url
```

---

| 欄位                | 說明         |
| ----------------- | ---------- |
| age_range         | 適用年齡       |
| extension_value   | 延伸活動 / 練習單 |
| short_description | 簡短介紹       |
| detail_images     | 細節照片（多張，選填） |
| demo_video_url    | 教學玩法影片 URL（選填，MVP 單一連結） |

---

# 4. teaching_methods（重點設計）

---

## 資料型態

```json
"teaching_methods": [
  "配對遊戲",
  "搶答遊戲",
  "分組競賽"
]
```

---

## 規則

```text
至少 1 筆（必填）
最多 4 筆（前端限制）
每筆不可為空字串
```

---

# 5. 教材內容設計（contents）

---

## 資料結構

```json
"contents": [
  {
    "type": "flashcard",
    "name": "地點圖卡",
    "count": 4,
    "description": "醫院 / 消防局 / 警察局 / 玩具店"
  }
]
```

---

## 欄位

| 欄位          | 必填 |
| ----------- | -- |
| type        | ✅  |
| name        | ✅  |
| count       | ❌  |
| description | ❌  |

---

## 驗證

```text
至少 1 筆
type 必填
name 必填
count 若存在必須 > 0
```

---

# 6. Schema 設計

---

## 6.1 materials table

```sql
ALTER TABLE materials
ADD COLUMN teaching_objective TEXT,
ADD COLUMN teaching_methods JSONB,
ADD COLUMN usage_duration TEXT,
ADD COLUMN activity_steps TEXT,
ADD COLUMN age_range TEXT,
ADD COLUMN extension_value TEXT,
ADD COLUMN short_description TEXT,
ADD COLUMN cover_image_url TEXT,
ADD COLUMN demo_video_url TEXT;
```

### 審核相關欄位（Material Review MVP Phase 1）

```sql
ALTER TABLE materials
ADD COLUMN review_reason_code TEXT,   -- 最近一次退回的結構化原因
ADD COLUMN review_note TEXT,          -- 最近一次退回的補充說明
ADD COLUMN reviewed_by TEXT,          -- 最近一次審核決定的 admin
ADD COLUMN reviewed_at TIMESTAMP,     -- 最近一次審核決定的時間
ADD COLUMN published_at TIMESTAMP;    -- **首次**成功公開的時間（不是 last_published_at）
```

前四個欄位是 **latest review decision snapshot**，每次新的審核決定都會覆寫；
**完整歷史的 canonical source 是 `activity_logs`**（`target_type = 'material'`）。
狀態機、退回原因 allowlist、轉移規則見 **`docs/material-review-workflow.md`**。

`materials.status` 的四個值：`pending_review` / `published` / `changes_requested` / `unpublished`
（DB constraint：`materials_status_check`）。

> **教材本體檔案已是真實檔案。** 建立教材必須帶 `fileId`（上傳後取得），檔案存在私有目錄、
> 不被 static serving 公開；Admin 審核時可以實際下載審閱，買家憑一次性下載票取得。
> `materials.file_key` 是 **legacy placeholder**，新建教材為 `NULL`，且**不出現在公開／買家回應**中。
> 完整規格見 `docs/material-file-storage-and-delivery.md`。

---

## 欄位說明

| 欄位                 | 必填       |
| ------------------ | -------- |
| teaching_objective | ✅        |
| teaching_methods   | ✅（array） |
| usage_duration     | ✅        |
| activity_steps     | ✅        |
| age_range          | ❌        |
| extension_value    | ❌        |
| short_description  | ❌        |
| cover_image_url    | ✅（建立教材必填） |
| demo_video_url     | ❌        |

---

## 6.2 material_contents table

```sql
CREATE TABLE IF NOT EXISTS material_contents (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

  type TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER CHECK (count > 0),
  description TEXT,

  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6.3 material_images table（細節照片）

```sql
CREATE TABLE IF NOT EXISTS material_images (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

說明：
- `materials.cover_image_url`：封面照（固定單張、必填）。
- `material_images`：細節照片（多張、選填）。
- `materials.demo_video_url`：教學玩法影片（選填、MVP 單一 URL）。

---

# 7. API Spec

---

## POST /teacher/uploads/material-media

- **權限**：`Authorization: Bearer <teacher JWT>`
- **Content-Type**：`multipart/form-data`
- **欄位**：`file`（單一檔案）
- **Query**：`kind` = `cover` | `detail` | `demo`（預設 `cover`；**不合法的值回 400**，不會默默退回 `cover`）
  - `cover` / `detail`：僅允許 **JPEG、PNG、GIF、WebP**，單檔最大 **10MB**
  - `demo`：僅允許 **MP4、WebM**，單檔最大 **80MB**
  - 型別驗證有三層：副檔名 + 宣告 MIME + **magic bytes**。改了副檔名的檔案回 **415**
- **回應 `201`**：`{ "url": "<絕對網址>", "mediaId": "...", "kind": "cover", "filename": "<原始檔名>", "mimeType": "...", "sizeBytes": 0 }`
  - 將 **`url`** 填入建立／更新教材時的 `cover_image_url`、`detail_images[].image_url` 或 `demo_video_url`（資料庫仍只存 URL 字串）。
  - `filename` 是**原始檔名**；私有儲存的物件名是 UUID，永不外流。
  - 正式環境請設定 **`PUBLIC_BACKEND_URL`**（或 `API_PUBLIC_URL`），讓回傳的 `url` 與對外公開的 API 網域一致。

---

## GET /materials/media/:mediaId

素材檔案的位元組。**這不是 static 檔案** —— 每一次請求都會做一次授權判斷。

- **權限**：`Authorization` **選用**。可見性由**所屬教材的 `status`** 決定：

  | 所屬教材 | 誰能取得 |
  | --- | --- |
  | `published` | 任何人，含未登入（公開商品頁的 `<img src>` 需要） |
  | 尚未認領（剛上傳、還沒存進教材） | 上傳者或 admin |
  | `pending_review` / `changes_requested` / `unpublished` | 教材擁有者或 admin |

- **回應**：`inline`、`X-Content-Type-Options: nosniff`、`Accept-Ranges: bytes`（試看影片可拖曳進度條）。
  公開素材 `Cache-Control: public, max-age=300`；受保護的素材 `private, no-store`。
- **錯誤**：`401`（匿名且素材未公開）／`403`（已登入但無權）／`404`（不存在）／`503`（儲存後端）。
- 舊的公開路徑 `GET /uploads/material-media/<filename>` 已一律 **404**（`material_media_not_public`）。

> 前端注意：`<img>` 不會帶 `Authorization` header。公開商品頁用普通 `<img src>` 即可；
> 創作者表單與 Admin 審核面板要顯示**尚未上架**的素材時，必須走
> `components/materials/MediaImage.tsx` 的授權 blob fetch。

---

## POST /materials

```json
{
  "title": "地點物品配對教材",
  "price": 300,
  "fileId": "6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",

  "teaching_objective": "幫助學生認識地點與物品並完成配對",

  "teaching_methods": [
    "配對遊戲",
    "搶答遊戲"
  ],
  "cover_image_url": "https://cdn.example.com/materials/mat_001/cover.jpg",
  "detail_images": [
    {
      "image_url": "https://cdn.example.com/materials/mat_001/detail-1.jpg",
      "alt_text": "教材卡片與操作步驟"
    }
  ],
  "demo_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",

  "usage_duration": "約 2 堂課，每堂 30 分鐘",

  "activity_steps": "1. 展示圖卡\n2. 學生配對\n3. 口語表達",

  "age_range": "小一～小三",
  "extension_value": "可作為回家作業延伸",
  "short_description": "透過配對遊戲學習地點與物品",

  "contents": [
    {
      "type": "flashcard",
      "name": "地點圖卡",
      "count": 4
    },
    {
      "type": "flashcard",
      "name": "物品圖卡",
      "count": 24
    }
  ]
}
```

---

# 8. 驗證規則

---

## 必填

```text
title 不可為空
price > 0
fileId 不可為空（必須是自己上傳、尚未被認領的檔案）
cover_image_url 不可為空且必須為合法 URL
teaching_objective 不可為空
usage_duration 不可為空
activity_steps 不可為空
```

---

## teaching_methods

```text
必須存在
長度 >= 1
每個值不可為空
```

---

## contents

```text
至少 1 筆
每筆需有 type + name
count 若存在需 > 0
```

---

## detail_images / demo_video_url

```text
detail_images 為選填
detail_images 若有填，每筆 image_url 不可為空且需為合法 URL
demo_video_url 為選填
demo_video_url 若有填需為合法 URL（可為 YouTube 或一般影片連結）
```

---

# 9. 商品 Detail 頁

---

## 9.0 定位原則（重要）

```text
Detail 頁是教材商品頁（展示與轉換），不是討論區。
Detail 頁只展示教學回饋（social proof），不提供回饋填寫。
```

---

## 顯示順序

### 1️⃣ 第一屏（封面照）

```text
封面照（cover_image_url）
標題
價格
購買按鈕
```

---

### 2️⃣ 教學玩法影片（有才顯示）

```text
demo_video_url 有值才顯示
可顯示影片播放器或播放按鈕
```

---

### 3️⃣ 細節照片（有才顯示）

```text
detail_images 有值才顯示
用於展示教材細節
```

---
### 4️⃣ 簡短介紹（有才顯示）

---

### 5️⃣ 一句話價值

```text
可使用約 2 堂課，透過配對遊戲學習地點與物品
```

---

### 6️⃣ 教材內容

```text
地點圖卡 × 4
物品圖卡 × 24
```

---

### 7️⃣ 教學目標

---

### 8️⃣ 教學玩法（array 顯示）

```text
• 配對遊戲
• 搶答遊戲
```

---

### 9️⃣ 教學步驟

---

### 🔟 使用時間

---

### 11) 其他（有才顯示）

```text
適用年齡
延伸活動
```

---

### 12) 教學回饋（展示型區塊）

```text
顯示平均評分與回饋數
顯示 2~3 則精選教學回饋（角色、星級、內容）
顯示「查看全部回饋」次要按鈕（outline / secondary style）
```

```text
不要在 Detail 頁顯示：
- textarea
- 星級輸入控制
- 撰寫評論／新增評論等表單
```

---

### 13) 檢舉這個教材（頁尾，低強度）

```text
位置：回饋區之後、頁尾分隔線下方
樣式：文字按鈕（非 CTA），不與購買動線競爭
可見性：所有訪客都看得到，包含未登入者
```

點擊開啟檢舉 dialog：買家看到自由文字的「檢舉原因」欄位（必填、上限 500 字）；
非買家看到「請先以購買者帳號登入」與登入連結，**不會**送出請求。

這是平台**唯一**能產生新檢舉的入口。詳細規則（授權邊界、重複檢舉 409、
為什麼不做結構化 reason code、為什麼買家看不到案件狀態）見 `docs/mvp_rules.md` §6.5。

```text
不要在 Detail 頁的檢舉入口做：
- 案件狀態查詢（沒有 buyer 端讀取 API）
- 檢舉分類下拉（reports 沒有 reason code 欄位）
- 附件上傳（reports / report_events 沒有附件欄位）
```

---

## 9.1 全部回饋頁（/materials/:id/reviews）

```text
用途：完整展示該教材教學回饋列表
內容：平均評分、回饋數、全部回饋（星級/內容/角色/建立時間）
```

```text
本頁不提供回饋填寫表單（僅展示）。
排序／篩選僅保留未來擴充入口。
```

---

## 9.2 回饋填寫入口（移至我的教材）

```text
回饋填寫不在 Detail 頁與 /materials/:id/reviews。
改由「我的教材」每張卡片的「分享教學回饋」入口進入填寫頁。
```

```text
填寫頁（目前）：/me/materials/:id/feedback
欄位：1~5 星、回饋文字 textarea、送出按鈕
```

---

## 9.3 命名規範

```text
UI 一律使用「教學回饋」
避免混用「評論 / 評價 / Reviews」字樣
```

---

# 10. 排序機制（MVP）

後端 **`GET /materials`** 之預設排序使用下列規則計算「品質分」（score）：**分數高者在前**；同分則依 **`created_at` 新到舊**。

「有 contents」在實作上以 **`material_contents` 是否存在至少一筆**（`EXISTS` 子查詢）判定，與前端表單 `contents` 陣列語意一致。

**前端補充：** Web 探索頁若附帶搜尋、篩選、排序等 query，後端目前**不**解析；可在取得 `items` 後於瀏覽器端再篩選或重排（例如「熱門」「評分」僅能基於已載入之資料運算，除非另接批次 rating API 或擴充後端）。

---

計分（與 `Backend/routes/materials.js` 列表查詢一致）：

```text
+2 teaching_methods（JSON 陣列長度 >= 2）
+1 有 usage_duration（非空白）
+1 有 activity_steps（非空白）
+1 有 material_contents 列
+1 有 short_description（非空白）
```

---
