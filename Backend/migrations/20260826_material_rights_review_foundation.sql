-- 教材權利審查記錄（P1-09 Wave 1 #5 foundation — Gate 2 / D5）
--
-- 目標：讓「平台對這份教材的**權利風險**做過什麼審查、發現什麼、依據什麼證據」
-- 成為可稽核、可累積、不可事後改寫的記錄。
--
-- 為什麼需要獨立的表（而不是加欄位到 materials）：
--
--   1. `materials.reviewed_by` / `reviewed_at` / `review_reason_code` / `review_note`
--      的 schema 註解已明寫：「**Latest review decision snapshot（不是 review history）**」。
--      它服務的是**一般內容審核**的狀態機（pending_review → published / changes_requested），
--      每次審核會**覆寫**。權利審查需要的是**累積的歷史**。
--
--   2. **一般內容審核 ≠ 法律權利審查。**
--      若把兩者塞進同一組欄位，「核准上架」就會等同於「權利審查通過」——
--      那正是 Platform-as-Seller 模式下最危險的假設：
--      平台自身的交付行為不受 ISP 免責事由保護，權利審查是平台自己的防線，
--      不能是狀態機的副作用。
--
--   3. 一份教材會被審查多次：退回後 resubmit、補件、換檔後重審、事後複查。
--      每一次都是獨立的決定，不得互相覆寫。
--
-- 與既有結構的關係：
--   `materials.ip_declaration_accepted` / `ip_declaration_at`
--     = **Creator 的聲明**（且目前是建立教材時寫死的 legacy 值，無版本）
--   `material_rights_reviews`
--     = **Platform 的審查**
--   兩者是不同主體做的不同行為，**不得互相代表**。
--   `report_cases` / `report_events` 是**買家檢舉**（上架後），與上架前審查無關。
--
-- 安全性：
--   * 只做加法（CREATE TABLE / INDEX / TRIGGER），沒有任何既有欄位或列被更動。
--   * **`materials` 完全不動** —— 含 `ip_declaration_*`、`reviewed_*`、狀態機。
--   * **不做任何 backfill。** 既有教材**沒有**權利審查記錄，那是事實。
--     為既有教材寫入一筆「已審查」會製造**假的盡職證據** —— 在平台需要
--     證明自己盡了注意義務的場合，那比沒有記錄更糟。
--
-- 對應的 idempotent 版本在 Backend/models/bootstrapModel.js。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS material_rights_reviews (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- 權利審查是教材的附屬記錄；教材不存在時審查失去主體。
  -- 註：production flow 是「下架」（unpublish）而非刪除教材；
  -- 若日後教材保存政策改變，此處需重新評估。
  -- 稽核軌跡另有 `activity_logs`（target_type = 'material'，無 FK，不隨教材消失）。
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

  reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by TEXT NOT NULL REFERENCES users(id),

  -- 審查結論。刻意保持四個值 —— 不建立 future workflow 的狀態機。
  --   pending         已建立記錄但尚未做出結論（例如指派後待審）
  --   approved        權利面通過
  --   rejected        權利面不通過
  --   needs_evidence  需要 Creator 補權利證明
  review_result TEXT NOT NULL,

  -- 可同時存在多個風險。對應 baseline `D6` 的高風險檢查點。
  risk_flags TEXT[] NOT NULL DEFAULT '{}',

  notes TEXT,

  -- Creator 聲明的版本。**可為 NULL** —— 目前沒有任何經核可的聲明文字與版本，
  -- 既有教材的聲明是 legacy、無版本。硬填會製造假證據。
  declaration_version TEXT,

  -- 未來把 Creator 聲明接到 `consent_records` 後的關聯點。
  -- 現在必為 NULL（`consent_records` 尚未接線任何流程）。
  declaration_consent_id TEXT REFERENCES consent_records(id) ON DELETE SET NULL,

  -- 權利證明的參照（例如授權書的私有儲存 key、案件編號、外部憑證編號）。
  -- 刻意保持 TEXT：本輪不建立證據檔案的儲存流程。
  evidence_reference TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT mrr_result_check CHECK (
    review_result IN ('pending', 'approved', 'rejected', 'needs_evidence')
  ),

  -- 風險標記必須來自允許集合。`<@` 是「陣列被包含於」。
  CONSTRAINT mrr_risk_flags_check CHECK (
    risk_flags <@ ARRAY[
      'famous_character',   -- 知名角色
      'trademark_logo',     -- 商標／Logo
      'stock_image',        -- 圖庫素材
      'font_license',       -- 字型授權
      'scanned_book',       -- 掃描書籍
      'music_audio',        -- 音樂／音訊
      'portrait',           -- 人物肖像
      'child_identity',     -- 兒少身分資訊（baseline D7）
      'ai_imitation',       -- AI 仿知名角色／風格
      'third_party_work',   -- 其他第三方著作
      'other'
    ]::text[]
  ),

  -- `needs_evidence` 必須說明需要什麼，否則對 Creator 是無法行動的結論。
  CONSTRAINT mrr_needs_evidence_requires_notes CHECK (
    review_result <> 'needs_evidence' OR (notes IS NOT NULL AND TRIM(notes) <> '')
  )
);

-- 「這份教材最近一次權利審查的結論是什麼」與「完整審查歷程」。
CREATE INDEX IF NOT EXISTS idx_mrr_material_reviewed_at
  ON material_rights_reviews (material_id, reviewed_at DESC);
-- 「目前有哪些教材卡在待補證據」。
CREATE INDEX IF NOT EXISTS idx_mrr_result_open
  ON material_rights_reviews (review_result)
  WHERE review_result IN ('pending', 'needs_evidence');

-- ---------------------------------------------------------------------------
-- append-only：一次審查就是一個時間點上的決定，不得事後改寫
-- ---------------------------------------------------------------------------
-- 需要改變結論時的正確做法是**寫一筆新的審查記錄**（歷史因此完整可讀）。
-- 與 `consent_records` 相同的理由，但這裡更嚴格：連 notes 都不得修改，
-- 因為「當時審查者寫了什麼」本身就是盡職證據的一部分。
--
-- **只擋 UPDATE，不擋 DELETE** —— 「不得改寫」是稽核要求，
-- 「永不刪除」是保存期限問題，屬 RETENTION-MATRIX，尚未拍板。

CREATE OR REPLACE FUNCTION material_rights_reviews_reject_rewrite()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'material_rights_reviews is append-only: record a new review instead of rewriting an existing one';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mrr_reject_rewrite ON material_rights_reviews;
CREATE TRIGGER trg_mrr_reject_rewrite
  BEFORE UPDATE ON material_rights_reviews
  FOR EACH ROW EXECUTE FUNCTION material_rights_reviews_reject_rewrite();

COMMIT;
