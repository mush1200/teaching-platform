# Teaching Platform — Material Features System Spec (MVP)

Version: MVP v1.0  
Scope: Material Features / Chips Metadata System  
Architecture: Backend-first  
Frontend: React + Next.js + Tamagui  
Database: PostgreSQL

---

# 1. Feature Goal

建立教材特色 Chips 系統（Material Features System）。

此系統為平台教材 Metadata 核心結構，
用於：

- 教材 Detail 頁
- Explore Filter
- 搜尋
- AI 推薦
- 相似教材推薦
- SEO Metadata

平台需提供固定教材特色 Chips，
讓創作者（Creator）於教材上架時勾選。

MVP 階段：

- 不開放自由輸入
- 不建立 feature CRUD 後台
- 不做 AI 自動 Tag
- 不做排序分析

---

# 2. Domain Naming

平台角色命名：

| 舊名稱 | 新名稱 |
|---|---|
| teacher | creator |
| 教師 | 創作者 |

系統中：

- UI 文案
- Component 命名
- Type 命名
- Upload 頁

皆須統一使用：

Creator / 創作者

不得再出現：

Teacher / 教師

---

# 3. Database Schema

MVP 不建立 feature tables。

直接於 materials table 新增：

```sql
ALTER TABLE materials
ADD COLUMN material_features TEXT[] DEFAULT '{}';
```

---

# 4. Material Features Structure

material_features 為 flatten string array。

範例：

```json
[
  "PDF教材",
  "教案",
  "角色扮演",
  "語言表達",
  "小組課",
  "需成人協助"
]
```

---

# 5. Feature Groups

平台需建立固定 Feature Config。

建立：

```txt
src/constants/materialFeatures.ts
```

結構：

```ts
export const MATERIAL_FEATURE_GROUPS = {
  material_format: [],
  teaching_methods: [],
  learning_goals: [],
  teaching_format: [],
  support_level: [],
}
```

---

# 6. Material Format

Key:

```txt
material_format
```

Items:

```ts
[
  "PDF教材",
  "圖卡教材",
  "練習單",
  "教案"
]
```

Definition:

| Feature | Description    |
| ------- | -------------- |
| PDF教材   | 以 PDF 檔案提供之教材  |
| 圖卡教材    | 主要內容為圖卡、卡牌、操作卡 |
| 練習單     | 孩子可直接完成之練習內容   |
| 教案      | 含教學流程、教學引導之教材  |

---

# 7. Teaching Methods

Key:

```txt
teaching_methods
```

Items:

```ts
[
  "配對遊戲",
  "分類活動",
  "排序活動",
  "搶答活動",
  "角色扮演",
  "分組活動",
  "桌遊玩法",
  "問答互動",
  "任務闖關",
  "口語互動",
  "動手操作",
  "拼圖操作",
  "剪貼操作"
]
```

Definition:

| Feature | Description   |
| ------- | ------------- |
| 配對遊戲    | 透過配對方式完成活動    |
| 分類活動    | 將物品進行分類與歸納    |
| 排序活動    | 進行順序、大小、流程排列  |
| 搶答活動    | 以快速回答方式進行     |
| 角色扮演    | 透過情境與角色互動進行   |
| 分組活動    | 適合多人分組進行      |
| 桌遊玩法    | 具規則與回合互動之遊戲形式 |
| 問答互動    | 以提問與回答進行互動    |
| 任務闖關    | 透過任務流程完成活動    |
| 口語互動    | 以口語表達與對話進行    |
| 動手操作    | 需實際操作教材素材     |
| 拼圖操作    | 透過拼圖或圖形組合完成   |
| 剪貼操作    | 需剪下、貼上素材進行活動  |

---

# 8. Learning Goals

Key:

```txt
learning_goals
```

---

## 基礎認知

```ts
[
  "顏色認識",
  "形狀認識",
  "數字概念",
  "數量概念",
  "大小比較",
  "分類能力",
  "順序概念",
  "空間概念"
]
```

---

## 語言相關

```ts
[
  "語言表達",
  "語言理解",
  "詞彙理解",
  "社交溝通"
]
```

---

## 專注與操作

```ts
[
  "專注力",
  "觀察能力",
  "視覺辨識",
  "手眼協調",
  "精細動作"
]
```

Definition:

| Feature | Description   |
| ------- | ------------- |
| 顏色認識    | 辨識與學習顏色       |
| 形狀認識    | 辨識與理解形狀       |
| 數字概念    | 數字符號與基礎數學概念   |
| 數量概念    | 理解多少與數量       |
| 大小比較    | 理解大小、高低、長短等概念 |
| 分類能力    | 練習分類與歸納       |
| 順序概念    | 理解先後與排列順序     |
| 空間概念    | 理解位置與空間關係     |
| 語言表達    | 使用語言表達想法      |
| 語言理解    | 理解他人語句與內容     |
| 詞彙理解    | 學習與理解詞彙       |
| 社交溝通    | 練習互動與溝通能力     |
| 專注力     | 練習持續注意與專心     |
| 觀察能力    | 練習觀察細節與差異     |
| 視覺辨識    | 辨識圖像與視覺資訊     |
| 手眼協調    | 練習手部與視覺協調     |
| 精細動作    | 練習手部小肌肉操作     |

---

# 9. Teaching Format

Key:

```txt
teaching_format
```

Items:

```ts
[
  "個別課",
  "小組課",
  "團體課程",
  "親子共學"
]
```

Definition:

| Feature | Description |
| ------- | ----------- |
| 個別課     | 適合一對一教學     |
| 小組課     | 適合少人數小組活動   |
| 團體課程    | 適合多人課堂教學    |
| 親子共學    | 適合家長陪同互動    |

---

# 10. Support Level

Key:

```txt
support_level
```

Items:

```ts
[
  "可獨立完成",
  "需成人協助"
]
```

Definition:

| Feature | Description    |
| ------- | -------------- |
| 可獨立完成   | 孩子可自行完成主要內容    |
| 需成人協助   | 需創作者、教師或家長引導進行 |

---

# 11. Creator Upload UI

教材上架頁需新增：

# 教材特色

區塊。

UI Requirements:

* 分組式 Chips Selector
* 可多選
* 可取消
* 使用 tag/chip UI
* 每個 group 要有 title
* mobile 自動換行

Example:

```txt
教材形式
[PDF教材] [圖卡教材] [練習單]

教學玩法
[配對遊戲] [角色扮演]

能力培養
[語言表達] [專注力]
```

---

# 12. Material Detail UI

教材 Detail 頁需新增：

# 教材特色

區塊。

依 group 顯示。

Example:

```txt
教材形式
[PDF教材] [教案]

教學玩法
[角色扮演] [任務闖關]

能力培養
[語言表達] [社交溝通]

適用形式
[小組課]

協助需求
[需成人協助]
```

---

# 13. UI Design Rules

**工程實作對照：** `components/ui/Chip.tsx`、`components/materials/MaterialFeaturesSelector.tsx`；全域 token／卡片約定見 `docs/frontend-ui-architecture.md`、`docs/design-tokens-v1.1.md`。

Chips UI：

* 柔和教育風格
* pill style
* rounded full
* selected state clearly visible
* hover interaction
* 淡紫 / 淡藍 / 淡綠色系
* group spacing clear
* RWD support

---

# 14. Validation Rules

Backend 必須驗證：

material_features 內所有值，
皆存在於：

```ts
MATERIAL_FEATURE_GROUPS
```

若存在非法 feature：

回傳：

```json
{
  "message": "invalid material feature"
}
```

HTTP Status:

```txt
400 Bad Request
```

---

# 15. API Requirements

需同步更新：

* create material API
* update material API
* material response DTO
* material validation schema
* admin material response
* creator upload form

---

# 16. TypeScript Requirements

需建立：

```ts
MaterialFeature
MaterialFeatureGroup
```

相關 types。

所有 Feature Key 必須型別安全。

禁止 magic string。

---

# 17. Future Expansion (Reserved)

此系統未來將接：

* Explore Filters
* Search
* AI Recommendation
* Similar Materials
* SEO Keywords
* AI Tag Suggestion

因此：

Feature Key 不可隨意變更。

---

# 18. MVP Restrictions

MVP 階段禁止：

* 自由輸入 tags
* custom tags
* AI auto tags
* feature CRUD 後台
* feature analytics
* feature sorting system

以上皆不屬於 MVP Scope。
