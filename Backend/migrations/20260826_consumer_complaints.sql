-- 消費申訴（P1-09 Wave 2 #6 / Gate 3）。
--
-- 消保法 §43 II：企業經營者對於消費者之申訴，應於申訴之日起**十五日內妥適處理之**。
-- repo 在此之前**完全沒有**消費申訴的承接處（全 repo `complaint` / `dispute` /
-- `support_ticket` 皆 0 命中；命中的都只是註解裡的散文）。
--
-- ## 三種 case 不得互相取代
--
-- | | 對象 | 提出者 | 結論 |
-- | --- | --- | --- | --- |
-- | `reports`（內容檢舉） | **教材** | 任何人（可能不是買家） | moderation 處置 |
-- | `consumer_complaints`（本表） | **買家自己的交易** | **該訂單的買家** | 妥適處理 ＋ 回覆 |
-- | `refund_remedy_cases` | 平台對某筆交易的補救 | 平台建立 | 金額／退款執行 |
--
-- `reports` 結構上就承接不了消費申訴：`material_id NOT NULL`（付款爭議不指向教材）、
-- `UNIQUE (material_id, reporter_id)` 一人一材一次、resolution 全是 moderation 結果、
-- 無訂單關聯、無 SLA。
--
-- ## Complaint 是上游，Remedy 是下游
--
--   Buyer complaint → Admin 受理與回覆 → **若**需要退款／補救 → 另建 `refund_remedy_case`
--
-- **本輪不自動建立 remedy case** —— 是否應退款是個案判斷，
-- 自動建立等於讓系統替尚未做出的決定先行處分。只保留 `related_remedy_case_id`
-- 讓 linkage 在人做出判斷後才寫入。
--
-- **`resolved` ≠ 已退款。** 申訴已妥適處理與錢已退回是兩件事；
-- 後者的唯一來源是 `refund_remedy_cases.refund_paid_at`（§12.8.6）。

DO $$ BEGIN
  IF current_database() <> 'teaching_platform_security_test'
     AND current_database() <> 'teaching_platform' THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS consumer_complaints (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  -- 申訴人**永遠**是提出者本人。指定訂單時另行驗證是本人的訂單。
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- 可選：帳號層級的爭議（例如「我的帳號被冒用」）不指向任何訂單。
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,

  complaint_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',

  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  review_started_at TIMESTAMP,
  responded_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,

  -- 消保法 §43 II 的十五日期限。**由 `utils/complaintSla.js` 單一計算**，
  -- 不在多處各自算；建立時寫入，之後不再改（改了就不是「申訴之日起」了）。
  statutory_due_at TIMESTAMP NOT NULL,

  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_summary TEXT,

  -- 下游補救的 linkage。**不自動建立** —— 由人判斷後才寫入。
  related_remedy_case_id TEXT REFERENCES refund_remedy_cases(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT cc_type_check CHECK (complaint_type IN (
    'payment', 'delivery', 'download', 'material_mismatch',
    'duplicate_payment', 'refund_request', 'account_security', 'other'
  )),
  CONSTRAINT cc_status_check CHECK (status IN (
    'submitted', 'under_review', 'responded', 'resolved', 'closed'
  )),
  CONSTRAINT cc_item_requires_order CHECK (order_item_id IS NULL OR order_id IS NOT NULL),
  CONSTRAINT cc_subject_not_blank CHECK (btrim(subject) <> ''),
  CONSTRAINT cc_statement_not_blank CHECK (btrim(statement) <> ''),
  -- 結案必須說得出處理結果 —— 一個沒有結論的「已處理」無法證明「妥適處理」。
  CONSTRAINT cc_resolved_requires_summary CHECK (
    status NOT IN ('resolved', 'closed')
    OR (resolution_summary IS NOT NULL AND btrim(resolution_summary) <> '')
  ),
  CONSTRAINT cc_resolved_requires_timestamp CHECK (
    status <> 'resolved' OR resolved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_cc_buyer ON consumer_complaints (buyer_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_order ON consumer_complaints (order_id, submitted_at DESC);
-- 逾期偵測：未結案且已過法定期限，一句 SQL。
CREATE INDEX IF NOT EXISTS idx_cc_open_due ON consumer_complaints (statutory_due_at)
  WHERE status IN ('submitted', 'under_review', 'responded');

-- ---------------------------------------------------------------------------
-- 申訴歷程（案件內容 / 溝通串）
-- ---------------------------------------------------------------------------
-- 與 `activity_logs` 分工同 `report_events`：`activity_logs` 是全平台稽核軌跡，
-- 這裡是**會顯示給申訴人看的**案件內容。`internal_note` 由 Buyer 端 API 過濾。
CREATE TABLE IF NOT EXISTS consumer_complaint_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  complaint_id TEXT NOT NULL REFERENCES consumer_complaints(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cce_type_check CHECK (event_type IN (
    'submitted', 'status_changed', 'internal_note', 'response_to_buyer',
    'buyer_message', 'evidence_added', 'resolution'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cce_complaint ON consumer_complaint_events (complaint_id, created_at);

-- ---------------------------------------------------------------------------
-- 買家提供的外部證據（`N3`）
-- ---------------------------------------------------------------------------
-- **付款爭議不得只以平台自己的紀錄為唯一認定依據**（`R7`／網路交易定型化契約
-- 不得記載事項第七點）。買家必須能提出匯款截圖、ATM 明細、金融機構交易證明。
--
-- **共用 `storage/privateFileStorage.js` 的 filesystem primitives，但不共用授權模型。**
-- 這裡刻意**不重用** `manual_payment_proofs`：那張表的語意是
-- 「這筆訂單的付款憑證，審核通過會讓訂單核准」——
-- 把申訴附件塞進去會讓一張爭議截圖進入付款核准佇列。
--
-- `storage_key` / `checksum_sha256` **不得出現在任何 API 回應或 log**
-- （與教材檔案、付款憑證同規則）。
CREATE TABLE IF NOT EXISTS consumer_complaint_evidence (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  complaint_id TEXT NOT NULL REFERENCES consumer_complaints(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- 二選一：實際附件（`storage_key`）或純文字外部參照
  -- （例如「已於 2026-08-20 向 XX 市消費者服務中心申訴，案號 …」）。
  storage_key TEXT UNIQUE,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum_sha256 TEXT,
  external_reference TEXT,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cce_evidence_has_content CHECK (
    storage_key IS NOT NULL
    OR (external_reference IS NOT NULL AND btrim(external_reference) <> '')
  ),
  -- 有 key 就必須有完整的檔案 metadata，否則會產生「看起來有附件、實際讀不到」的列。
  CONSTRAINT cce_evidence_file_complete CHECK (
    storage_key IS NULL
    OR (original_filename IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL AND size_bytes > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_cce_evidence_complaint
  ON consumer_complaint_evidence (complaint_id, created_at);

COMMIT;

-- **刻意沒有加的東西：**
--
--   * `response_due_at` / `resolution_due_at` 兩個額外 SLA —— baseline (`N2`) 只鎖定
--     消保法 §43 II 的**十五日**一個數字。再造兩個欄位就必須填兩個沒有法源的期限，
--     那是自行決定 SLA。`statutory_due_at` 一欄即足以表達法定期限與逾期偵測。
--   * 自動建立 `refund_remedy_case` —— 是否應退款是個案判斷（見表頭說明）。
--   * 任何 §19 法定解除的自動判定。
