-- 個資權利請求（Privacy Rights Request）—— `OPS-04` / `DEC-LEGAL-13`
--
-- ## 為什麼是**獨立的 domain**，而不是 consumer_complaints 的一種類型
--
-- Owner（Round 3）明訂：**consumer complaint ≠ privacy rights request**。
-- 兩者的法律基礎不同（消保法 §43 vs 個人資料保護法），處理義務不同，
-- 期限來源也不同。把它塞進 `consumer_complaints.complaint_type` 會讓
-- 「這件事受哪一套規則拘束」永久消失在一個 enum 值裡。
--
-- 重用的是**模式**（case lifecycle、event history、稽核、Admin UI primitives），
-- 不是 table。
--
-- ## 這裡**刻意沒有**的東西
--
--   * **沒有任何 deadline / SLA 欄位。** `consumer_complaints.statutory_due_at`
--     背後是消保法 §43 II 的十五日，那是有法源的數字；個資請求的法定回覆期限
--     **尚未取得律師結論**（Privacy §8.3）。只留 `received_at` / `completed_at`，
--     等結論出來後足以往回計算，而現在不對外承諾任何天數。
--   * **沒有身分驗證欄位。** identity-verification 的法律標準同樣未決 ——
--     不建立 `identity_verified` 這類看起來像法律結論的欄位，
--     也不蒐集出生日期、身分證、護照、政府證件或金融資訊。
--   * **沒有刪除執行欄位。** 本表只記錄「使用者提出了刪除請求」。
--     帳號刪除語意仍卡在 `SCHEMA-02` / `O-22`（`L-21` 保存期限未決，
--     且 `users` 有 38 個 FK 分屬 CASCADE / SET NULL / RESTRICT）。
--     `status = 'completed'` 的意思是「平台已處理完這個請求」，
--     **不等於**「資料已全部刪除」。
--   * **沒有 evidence 表。** 對外入口是 Privacy Email（`DEC-LEGAL-07`），
--     附件本來就留在信箱；在沒有請求者端 UI 的情況下開一個 private storage
--     namespace 會做出一個沒有生產者的上傳面。需要時再另立項目。
--
-- ## 資料最小化
--
-- 只存回覆這個請求真正需要的欄位。`requester_reference` 是請求者寄件的
-- 聯絡識別（通常是 Email）—— 少了它就無法回覆。**刻意不連結 `users`**：
-- 把請求綁到某個帳號等於主張「已確認這是本人」，而身分驗證標準未決。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- 直接對應《隱私權政策》草稿 §8.1／§8.2 已揭露的權利，不自行增刪。
  request_type TEXT NOT NULL,

  -- 純處理進度，**不描述法律結論**。
  status TEXT NOT NULL DEFAULT 'open',

  -- 請求者的聯絡識別（通常是寄件 Email）。回覆所必需。
  requester_reference TEXT NOT NULL,

  summary TEXT NOT NULL,

  -- **實際收到請求的時間**，不是建案時間 —— 兩者可能差好幾天。
  received_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,

  -- 目前唯一來源是 Privacy Email（`DEC-LEGAL-07`）。
  source TEXT NOT NULL DEFAULT 'privacy_email',

  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT pr_type_check CHECK (request_type IN (
    'access', 'copy', 'correction', 'stop_processing',
    'deletion', 'withdraw_consent', 'other'
  )),
  CONSTRAINT pr_status_check CHECK (status IN (
    'open', 'in_review', 'waiting_for_information', 'completed', 'closed'
  )),
  CONSTRAINT pr_source_check CHECK (source IN ('privacy_email')),
  CONSTRAINT pr_reference_not_blank CHECK (btrim(requester_reference) <> ''),
  CONSTRAINT pr_summary_not_blank CHECK (btrim(summary) <> ''),
  -- 「已處理完成」必須說得出何時完成；但**這不代表資料已刪除**。
  CONSTRAINT pr_completed_requires_timestamp CHECK (
    status <> 'completed' OR completed_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_received
  ON privacy_requests (status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_received
  ON privacy_requests (received_at DESC);

-- ---------------------------------------------------------------------------
-- 案件歷程
-- ---------------------------------------------------------------------------
-- 與 `consumer_complaint_events` 同一形狀（append-only 事件流），
-- 但**指向不同的 domain**，不共用 table。

CREATE TABLE IF NOT EXISTS privacy_request_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  request_id TEXT NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pre_type_check CHECK (event_type IN (
    'created', 'status_changed', 'internal_note'
  ))
);

CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request
  ON privacy_request_events (request_id, created_at DESC);

COMMENT ON TABLE privacy_requests IS
  'Privacy rights requests (OPS-04 / DEC-LEGAL-13). A DISTINCT domain from consumer_complaints: different legal basis, different obligations. No statutory deadline, no identity-verification standard, no deletion execution — all three remain lawyer-blocked.';

COMMIT;

-- 驗證（執行後）：
--   SELECT COUNT(*) FROM privacy_requests;         -->  0
--   SELECT COUNT(*) FROM privacy_request_events;   -->  0
--
-- 本 migration **不啟用 Gate 5 consent wiring、不發布任何法律文件、
-- 不執行任何帳號刪除**。
