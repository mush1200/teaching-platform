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
file_key
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
| file_key           | 教材檔案        |
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
```

---

| 欄位                | 說明         |
| ----------------- | ---------- |
| age_range         | 適用年齡       |
| extension_value   | 延伸活動 / 練習單 |
| short_description | 簡短介紹       |

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
ADD COLUMN short_description TEXT;
```

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

# 7. API Spec

---

## POST /materials

```json
{
  "title": "地點物品配對教材",
  "price": 300,
  "file_key": "materials/file.pdf",

  "teaching_objective": "幫助學生認識地點與物品並完成配對",

  "teaching_methods": [
    "配對遊戲",
    "搶答遊戲"
  ],

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
file_key 不可為空
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

# 9. 商品 Detail 頁

---

## 顯示順序

### 1️⃣ 第一屏

```text
封面
標題
價格
購買按鈕
```

---

### 2️⃣ 簡短介紹（有才顯示）

---

### 3️⃣ 一句話價值

```text
可使用約 2 堂課，透過配對遊戲學習地點與物品
```

---

### 4️⃣ 教材內容

```text
地點圖卡 × 4
物品圖卡 × 24
```

---

### 5️⃣ 教學目標

---

### 6️⃣ 教學玩法（array 顯示）

```text
• 配對遊戲
• 搶答遊戲
```

---

### 7️⃣ 教學步驟

---

### 8️⃣ 使用時間

---

### 9️⃣ 其他（有才顯示）

```text
適用年齡
延伸活動
```

---

# 10. 排序機制（MVP）

---

```text
+2 teaching_methods >= 2
+1 有 usage_duration
+1 有 activity_steps
+1 有 contents
+1 有 short_description
```

---
