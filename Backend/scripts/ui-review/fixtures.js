"use strict";

/**
 * UI Review 的 **deterministic fixture 定義**。
 *
 * ## 規則
 *
 * 1. **不得產生無效的商業狀態。** 價格遵守 `DEC-34`（整數 TWD）與 `DEC-39`（下限 NT$30）；
 *    教材狀態只用 workflow 真的存在的四個值；不為了視覺壓力測試而捏造 NT$0 上架品。
 * 2. **全部 deterministic** —— id 與內容皆為固定字串，不含 `Math.random()` 或 `Date.now()`，
 *    因此 reset → seed 兩次會得到逐欄相同的資料，截圖才比較得出差異。
 * 3. **時間以「相對於 seed 執行時刻」的固定偏移**表示（見 `seed.js` 的 `at()`），
 *    這樣「三天前的訂單」在任何一天執行都仍然是三天前，而不會變成 2026 年的死日期。
 *
 * 教材狀態（canonical：`Backend/utils/materialWorkflow.js`）：
 *   `pending_review` ／ `published` ／ `changes_requested` ／ `unpublished`
 * **沒有 `draft`** —— Owner 指示裡的「draft」在本 repo 對應 `pending_review`
 * （尚未上架、創作者已送審），以及 `changes_requested`（被退回待修改）。
 */

/** 極長標題壓力測試 —— 繁中。 */
const LONG_TITLE_ZH =
  "國小中年級跨領域主題式統整課程教學設計與實作手冊：從在地社區文化探究出發，" +
  "結合自然科學觀察、社會領域田野調查、語文表達與藝術創作的十二週完整教案、" +
  "學習單、評量規準與親師溝通指引全套資源包";

/** 極長標題壓力測試 —— 英文（無 CJK 斷行點，最容易撐破容器）。 */
const LONG_TITLE_EN =
  "Comprehensive Interdisciplinary Project-Based Learning Curriculum Framework " +
  "and Implementation Handbook for Upper Elementary Classrooms Including Weekly " +
  "Lesson Plans Formative Assessment Rubrics and Parent Communication Templates";

/** 中英混排。 */
const LONG_TITLE_MIXED =
  "STEAM 跨領域教學 Project-Based Learning 實作指南：Scratch 程式設計 × 自然觀察 × " +
  "Design Thinking 設計思考完整十週課程";

const LONG_DESCRIPTION_ZH =
  "本教材以「社區即教室」為核心理念，設計十二週的跨領域統整課程。" +
  "第一階段（第 1–3 週）帶領學生以五感觀察方式認識社區環境，" +
  "透過拍照紀錄、聲音地圖與氣味筆記建立初步的地方感。" +
  "第二階段（第 4–7 週）進入田野調查，學生分組訪談在地店家與耆老，" +
  "練習擬定訪綱、逐字稿整理與資料分類。" +
  "第三階段（第 8–10 週）結合自然科學觀察，記錄社區內的植物相與物候變化，" +
  "並以簡易統計圖表呈現。第四階段（第 11–12 週）為成果整合與公開發表，" +
  "學生以策展形式向家長與社區居民呈現學習歷程。" +
  "全套資源包含逐週教案、學習單、評量規準、親師溝通信件範本，" +
  "以及教師實施時常見問題的處理建議。";

const LONG_CREATOR_NAME = "王大明老師的跨領域課程設計研究工作室（教學實驗與師資培育中心）";

/** 密碼以外的使用者定義。`password` 由 `seed.js` 統一注入。 */
const USERS = [
  {
    key: "buyer",
    id: "uir_user_buyer_main",
    email: "buyer@ui-review.local",
    role: "buyer",
    label: "購買者（有訂單、有收藏、有已購教材）",
  },
  {
    key: "buyerEmpty",
    id: "uir_user_buyer_empty",
    email: "buyer-empty@ui-review.local",
    role: "buyer",
    label: "購買者（完全空白 —— 用來看所有 empty state）",
  },
  {
    key: "creator",
    id: "uir_user_creator_main",
    email: "creator@ui-review.local",
    role: "teacher",
    label: "創作者（多筆教材、四種狀態、有銷售）",
    displayName: LONG_CREATOR_NAME,
  },
  {
    key: "creatorEmpty",
    id: "uir_user_creator_empty",
    email: "creator-empty@ui-review.local",
    role: "teacher",
    label: "創作者（尚無教材 —— 用來看 empty state）",
  },
  {
    key: "admin",
    id: "uir_user_admin",
    email: "admin@ui-review.local",
    role: "admin",
    label: "管理員",
  },
];

/**
 * 教材 fixture。
 *
 * `deliverable: true` 會額外建立 `material_files` 列並設定 `approved_file_id` ——
 * 這是 `docs/mvp_rules.md` §21A.1.1 要求「published 付費商品必須交付得出東西」的條件。
 * 只有 `published` 且 `deliverable` 的教材才進得了購物車／訂單。
 */
const MATERIALS = [
  // ---- 正常基準品（視覺基準線） ----
  {
    id: "uir_mat_baseline",
    title: "小一數學加減法練習單（20 以內）",
    shortDescription: "適合國小一年級的基礎加減法練習，共 30 頁。",
    description: "涵蓋 20 以內的加法與減法，含情境應用題與自我檢核表。",
    price: 120,
    status: "published",
    deliverable: true,
    cover: "cover-baseline.svg",
    category: "數學",
    ageRange: "6-8歲",
    tags: ["數學", "練習單", "低年級"],
    creator: "creator",
  },

  // ---- 標題／文字壓力 ----
  {
    id: "uir_mat_long_title_zh",
    title: LONG_TITLE_ZH,
    shortDescription:
      "十二週跨領域統整課程完整資源包，含逐週教案、學習單、評量規準與親師溝通範本。",
    description: LONG_DESCRIPTION_ZH,
    price: 880,
    status: "published",
    deliverable: true,
    cover: "cover-long.svg",
    category: "跨領域",
    ageRange: "9-12歲",
    tags: ["跨領域", "主題式教學", "田野調查", "社區探究", "十二週課程", "評量規準"],
    creator: "creator",
  },
  {
    id: "uir_mat_long_title_en",
    title: LONG_TITLE_EN,
    shortDescription:
      "A complete project-based learning framework with weekly plans and rubrics.",
    description:
      "This resource pack contains twelve weeks of lesson plans, printable student " +
      "worksheets, formative assessment rubrics, and editable parent communication " +
      "templates for upper elementary interdisciplinary teaching.",
    price: 950,
    status: "published",
    deliverable: true,
    cover: null,
    category: "跨領域",
    ageRange: "9-12歲",
    tags: ["project-based-learning", "interdisciplinary", "assessment"],
    creator: "creator",
  },
  {
    id: "uir_mat_mixed_lang",
    title: LONG_TITLE_MIXED,
    shortDescription: "STEAM × PBL 十週課程，含 Scratch 專案範例與設計思考工作單。",
    description:
      "結合 Scratch 程式設計、自然觀察與 Design Thinking 的十週 STEAM 課程。" +
      "Each week includes a teacher guide, a student worksheet, and a reflection prompt.",
    price: 680,
    status: "published",
    deliverable: true,
    cover: "cover-steam.svg",
    category: "自然科學",
    ageRange: "9-12歲",
    tags: ["STEAM", "Scratch", "設計思考", "程式設計"],
    creator: "creator",
  },

  // ---- 極端長的單一標籤 ----
  {
    id: "uir_mat_long_tag",
    title: "幼兒園大班注音符號綜合練習",
    shortDescription: "注音符號認讀、書寫與拼音綜合練習。",
    description: "涵蓋 37 個注音符號的認讀與書寫，並包含結合韻的拼讀練習。",
    price: 90,
    status: "published",
    deliverable: true,
    cover: "cover-phonics.svg",
    category: "語文",
    ageRange: "3-6歲",
    tags: ["幼兒園大班升小一銜接課程注音符號認讀書寫拼音綜合練習教材", "注音"],
    creator: "creator",
  },

  // ---- 無圖片 ----
  {
    id: "uir_mat_no_image",
    title: "自然科學觀察紀錄表（通用版）",
    shortDescription: "可重複使用的觀察紀錄表，適用各種自然觀察活動。",
    description: "提供時間、天氣、觀察對象、圖繪與文字描述欄位。",
    price: 60,
    status: "published",
    deliverable: true,
    cover: null,
    category: "自然科學",
    ageRange: "6-8歲",
    tags: ["觀察", "紀錄表"],
    creator: "creator",
  },

  // ---- 無標籤 ----
  {
    id: "uir_mat_no_tags",
    title: "課堂經營小卡組",
    shortDescription: "40 張課堂指令小卡，可直接列印使用。",
    description: "包含常用課堂指令、分組提示與獎勵卡。",
    price: 45,
    status: "published",
    deliverable: true,
    cover: "cover-cards.svg",
    category: "班級經營",
    ageRange: "6-8歲",
    tags: [],
    creator: "creator",
  },

  // ---- 高價（仍為合法整數 TWD） ----
  {
    id: "uir_mat_high_price",
    title: "全學年國語文教學資源總集（一至六年級）",
    shortDescription: "六個年級、完整學年的國語文教學資源。",
    description: "含教案、學習單、評量卷與補救教學材料，適合校內共備使用。",
    price: 4800,
    status: "published",
    deliverable: true,
    cover: "cover-bundle.svg",
    category: "語文",
    ageRange: "6-12歲",
    tags: ["國語文", "全學年", "共備"],
    creator: "creator",
  },

  // ---- 最低價（DEC-39 下限，合法） ----
  {
    id: "uir_mat_min_price",
    title: "每日一句英語短語卡",
    shortDescription: "30 張英語短語卡，適合晨間活動。",
    description: "每張卡片含一個日常短語、音標與情境例句。",
    price: 30,
    status: "published",
    deliverable: true,
    cover: "cover-english.svg",
    category: "語文",
    ageRange: "6-8歲",
    tags: ["英語", "短語"],
    creator: "creator",
  },

  // ---- 待審（Owner 指示的「draft」在本 repo 的對應狀態） ----
  {
    id: "uir_mat_pending",
    title: "社會領域台灣地理主題教案（待審核）",
    shortDescription: "台灣地形、氣候與人文地理的six週主題教案。",
    description: "以台灣本島與離島為範圍，設計六週的地理主題課程。",
    price: 320,
    status: "pending_review",
    deliverable: false,
    cover: "cover-geo.svg",
    category: "社會",
    ageRange: "9-12歲",
    tags: ["社會", "地理", "台灣"],
    creator: "creator",
  },

  // ---- 退回修改 ----
  {
    id: "uir_mat_changes_requested",
    title: "健康與體育課程活動設計（待修改）",
    shortDescription: "十週體適能與健康知識整合課程。",
    description: "結合體適能檢測與健康飲食知識的整合型課程設計。",
    price: 260,
    status: "changes_requested",
    deliverable: false,
    cover: null,
    category: "健康與體育",
    ageRange: "9-12歲",
    tags: ["健體", "體適能"],
    creator: "creator",
    reviewReasonCode: "incomplete_info",
    reviewNote: "教案第 3–5 週的活動步驟過於簡略，請補充實際操作流程與所需器材清單。",
  },

  // ---- 已下架（目前實際存在的不可購買狀態） ----
  {
    id: "uir_mat_unpublished",
    title: "藝術與人文版畫創作課程（已下架）",
    shortDescription: "六週版畫創作課程，含版材準備與印製技巧。",
    description: "從紙版畫入門到橡膠版畫的六週創作課程。",
    price: 380,
    status: "unpublished",
    deliverable: true,
    cover: "cover-art.svg",
    category: "藝術與人文",
    ageRange: "9-12歲",
    tags: ["藝術", "版畫"],
    creator: "creator",
  },
];

/**
 * 清單密度壓力：另外產生 24 筆一般教材，讓 `/materials` 有分頁與 grid 壓力。
 *
 * 內容以 index 決定，仍然 deterministic。
 */
function bulkMaterials() {
  const subjects = [
    ["國語文", "語文", "6-8歲"],
    ["數學", "數學", "6-8歲"],
    ["自然科學", "自然科學", "9-12歲"],
    ["社會", "社會", "9-12歲"],
    ["英語", "語文", "6-8歲"],
    ["生活課程", "綜合", "3-6歲"],
  ];
  const kinds = ["學習單", "教案", "評量卷", "闖關活動"];
  const out = [];
  for (let i = 0; i < 24; i += 1) {
    const [subject, category, ageRange] = subjects[i % subjects.length];
    const kind = kinds[Math.floor(i / subjects.length) % kinds.length];
    out.push({
      id: `uir_mat_bulk_${String(i + 1).padStart(2, "0")}`,
      title: `${subject}${kind}（第 ${i + 1} 單元）`,
      shortDescription: `${subject}第 ${i + 1} 單元的${kind}，可直接列印使用。`,
      description: `本${kind}對應${subject}第 ${i + 1} 單元的學習目標，含解答與教學提示。`,
      // 30–490，皆為合法整數 TWD 且 >= DEC-39 下限
      price: 30 + i * 20,
      status: "published",
      deliverable: true,
      cover: i % 3 === 0 ? null : `cover-bulk-${(i % 5) + 1}.svg`,
      category,
      ageRange,
      tags: i % 7 === 0 ? [] : [subject, kind],
      creator: "creator",
    });
  }
  return out;
}

module.exports = {
  USERS,
  MATERIALS: [...MATERIALS, ...bulkMaterials()],
  LONG_CREATOR_NAME,
};
