-- Payment proof rejection reason (Admin Operations UX Closure Epic §4)
--
-- 既有的 `note` 是自由文字，同時承載「核准備註」與「拒絕原因」，
-- 無法統計、無法在買家端做穩定的文案對應。這裡加上結構化的 reason code，
-- `note` 保留為選填的補充說明（語意不變，既有列不動）。
--
-- 只做加法；沒有欄位被刪除，沒有既有資料被改寫。

DO $$ BEGIN
  IF current_database() NOT IN ('teaching_platform', 'teaching_platform_security_test') THEN
    RAISE EXCEPTION 'ABORT: unexpected database (%)', current_database();
  END IF;
END $$;

BEGIN;

ALTER TABLE manual_payment_proofs ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE manual_payment_proofs DROP CONSTRAINT IF EXISTS mpp_rejection_reason_check;
ALTER TABLE manual_payment_proofs ADD CONSTRAINT mpp_rejection_reason_check
  CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'amount_mismatch', 'unreadable', 'payment_not_found', 'invalid_proof', 'other'
  ));

COMMIT;
