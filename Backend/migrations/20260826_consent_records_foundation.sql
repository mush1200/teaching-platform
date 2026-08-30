-- 可版本化的同意證據基礎設施（P1-09 Wave 1 #3 foundation — Gate 5）
--
-- 目標：讓「誰、在什麼情境、對哪一份文件的哪一個版本、在什麼時候表示同意」
-- 成為**可稽核、不可事後改寫**的記錄。
--
-- 為什麼需要：
--   目前系統中**沒有任何 document version 欄位**（全 repo 零命中），且：
--     * 註冊頁的「我同意服務條款與隱私權政策」**只存在前端** ——
--       `register/page.tsx` 驗證後未放進 request body，`routes/auth.js` 也不收該欄位。
--       也就是說：**目前沒有任何註冊同意被保存下來。**
--     * `materials.ip_declaration_accepted` 在建立教材時被**寫死為 `true, NOW()`**
--       （`routes/materials.js`），並非讀自請求。它實際證明的是「這筆教材被建立了」，
--       **不是「創作者做出了一個明示的、有版本的聲明」**，且沒有任何版本資訊。
--
-- 為什麼用單一 generic table 而不是各自加欄位：
--   三種情境（使用者層 / 教材層 / 訂單層）的**結構完全相同**
--   （誰、哪份文件、哪一版、何時、什麼情境），只有 context 不同。
--   分開做會讓 H-VERSION 不變條件必須實作三次，且無法統一回答
--   「這個使用者同意過什麼」。
--
-- 安全性：
--   * 只做加法（CREATE TABLE / INDEX / TRIGGER），沒有任何既有欄位或列被更動。
--   * **`materials.ip_declaration_accepted` / `ip_declaration_at` 原地不動、不搬移、不刪除。**
--   * **不做任何 backfill。** 既有教材的聲明**沒有版本**，那是事實 ——
--     為了填滿欄位而寫入 `document_version = 'v1'` 會製造**假的同意證據**，
--     比沒有記錄更糟。既有資料維持 legacy / unversioned 狀態。
--   * 本次**不接線任何流程**（註冊、教材建立、結帳都不寫入）。
--     原因見下方「為什麼先不接線」。
--
-- 為什麼先不接線：
--   目前 repo 中**沒有任何經核可的法律文件**（無 `/terms`、無 `/privacy`、無條文）。
--   若現在就把註冊 checkbox 接上這張表，會保存一筆
--   **指向不存在文件版本的同意記錄** —— 那是更糟的證據狀態：
--   系統宣稱「使用者同意了 v1.0」，但 v1.0 從未存在過。
--   接線必須等 `P1-09` 的正式條文到位（該項仍為 OPEN blocker）。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- 誰同意的。ON DELETE RESTRICT 是刻意的：刪除使用者前必須先依
  -- RETENTION-MATRIX（`RM-01` / `RM-13`）決定同意證據如何處理，
  -- 不得由 CASCADE 靜默銷毀證據。**這不是在替保存期限拍板** ——
  -- 只是要求刪除前必須經過那個決定。
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- 同意的是哪一份文件的哪一個版本。
  -- **兩者皆為 NOT NULL** —— 沒有版本的「同意」不構成可用的證據。
  -- 正因如此，既有的 legacy 資料**不搬進來**（見上方說明）。
  document_type TEXT NOT NULL,
  document_version TEXT NOT NULL,

  -- 文件本身的生效日與內容雜湊。
  -- `document_content_hash` 是 H4 要求的「內容快照」的最小形式：
  -- 即使版本標籤日後被誤用，雜湊仍能證明當時同意的**實際文字**。
  -- 兩者皆可為 NULL —— 正式文件尚未存在時，硬填只會製造假精確。
  document_effective_date DATE,
  document_content_hash TEXT,

  -- 何時同意。這是證據的核心，**永不得被改寫**（見下方 trigger）。
  accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- 在什麼情境下同意。對應 v1.8 baseline 的 Consent UI 結構。
  -- 新增情境需要另一次 migration —— 情境是產品／法務決策，不是自由文字。
  context_type TEXT NOT NULL,

  -- 情境關聯。三者互斥使用，依 context_type 決定哪一個應該有值。
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  material_id TEXT REFERENCES materials(id) ON DELETE RESTRICT,

  -- 更正機制：**不改舊列**，而是寫一筆新記錄並讓舊列指向它。
  -- 這樣「當初同意的是什麼」與「後來如何被更正」兩件事都保得住。
  superseded_by_id TEXT REFERENCES consent_records(id) ON DELETE RESTRICT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT consent_records_context_type_check CHECK (context_type IN (
    'registration',                -- 註冊：服務條款 ＋ 隱私權政策
    'creator_agreement',           -- 首次成為創作者：創作者內容授權與合作條款
    'material_declaration',        -- 每份教材：合法權利與內容聲明
    'checkout_purchase_rules',     -- 結帳：購買、使用授權與爭議處理規則
    'checkout_rescission_notice',  -- 結帳：數位內容解除權重要確認（獨立於上一項）
    'reconsent'                    -- 文件重大變更後的重新同意
  )),

  -- 版本字串不得是空白 —— 那等同於沒有版本。
  CONSTRAINT consent_records_version_not_blank_check CHECK (TRIM(document_version) <> ''),
  CONSTRAINT consent_records_type_not_blank_check CHECK (TRIM(document_type) <> ''),

  -- 情境與關聯必須一致：教材層的同意必須指向教材，結帳層必須指向訂單。
  CONSTRAINT consent_records_context_link_check CHECK (
    (context_type = 'material_declaration' AND material_id IS NOT NULL)
    OR (context_type IN ('checkout_purchase_rules', 'checkout_rescission_notice') AND order_id IS NOT NULL)
    OR (context_type IN ('registration', 'creator_agreement', 'reconsent'))
  )
);

-- 「這個使用者同意過什麼」與「這份文件有誰同意過」。
CREATE INDEX IF NOT EXISTS idx_consent_records_user_document
  ON consent_records (user_id, document_type, document_version);
-- Gate 13 未來要問「這筆訂單有沒有取得該版本的同意」。
CREATE INDEX IF NOT EXISTS idx_consent_records_order
  ON consent_records (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consent_records_material
  ON consent_records (material_id) WHERE material_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- H-VERSION 不變條件：同意證據不得被改寫
-- ---------------------------------------------------------------------------
-- 唯一的例外是 `superseded_by_id` —— 那是「這筆記錄後來被某筆新記錄取代」的指標，
-- 它**新增資訊而不竄改既有事實**（誰、哪一版、何時同意，全部維持原狀）。
--
-- 刻意**只擋 UPDATE，不擋 DELETE**：
--   「不得改寫歷史」是 H-VERSION 的要求；「永不刪除」不是。
--   RETENTION-MATRIX 的 `RM-13` 明訂同意證據有其保存期限，期滿後應刪除
--   （個資法 §11 III：目的消失或期限屆滿時應刪除、停止處理或利用）。
--   若在此擋住 DELETE，等於替尚未拍板的保存期限做了「永久保存」的決定。

CREATE OR REPLACE FUNCTION consent_records_reject_rewrite()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.document_version IS DISTINCT FROM OLD.document_version
     OR NEW.document_effective_date IS DISTINCT FROM OLD.document_effective_date
     OR NEW.document_content_hash IS DISTINCT FROM OLD.document_content_hash
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.context_type IS DISTINCT FROM OLD.context_type
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.material_id IS DISTINCT FROM OLD.material_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'consent_records is append-only: consent evidence must not be rewritten (only superseded_by_id may be set)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consent_records_reject_rewrite ON consent_records;
CREATE TRIGGER trg_consent_records_reject_rewrite
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION consent_records_reject_rewrite();

COMMIT;
