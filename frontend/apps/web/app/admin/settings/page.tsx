import { PageHeader } from "../../../components/ds";

/**
 * 系統設定 —— **尚未實作**，且刻意維持如此。
 *
 * 本輪（Epic §9）做的是 config audit：把目前實際存在的設定分成
 * 「應該由 Admin 調整」與「不該從 UI 暴露」兩類。結論是目前**沒有**任何一項
 * 屬於前者 —— 平台可調的東西全部是連線字串、金鑰與寄信憑證，
 * 那些只能存在於部署環境（`Backend/.env`），不該做成一個網頁表單。
 *
 * 少數看起來像「業務設定」的常數（付款期限、每張訂單的憑證上限、
 * 教材特色 allowlist、分頁上限）目前寫在程式碼裡，且都有明確的 canonical 位置。
 * 要不要把它們變成可調設定，是產品決策，不是這一輪的 UI 工作。
 *
 * 因此這一頁只誠實說明現況，不做一個什麼都改不動的假設定頁。
 */
export const metadata = {
  title: "系統設定 | EduMarket",
};

const CONFIGURABLE_IN_CODE = [
  { label: "付款期限（訂單建立後 3 天）", where: "Backend/services/adminPaymentProofs.service.js" },
  { label: "每張訂單的付款憑證上限（3 張、單張 10MB）", where: "Backend/routes/order.js" },
  { label: "Admin 清單分頁上限（每頁最多 100 筆）", where: "Backend/utils/adminQuery.js" },
  { label: "檢舉處置選項", where: "Backend/utils/reportWorkflow.js" },
  { label: "付款退件原因選項", where: "Backend/utils/paymentProofReview.js" },
];

const NOT_FOR_UI = [
  "資料庫連線（PGHOST / PGDATABASE / PGUSER / PGPASSWORD）",
  "JWT_SECRET（無 fallback；未設定或過短時 Backend 拒絕啟動）",
  "SMTP 寄信憑證",
  "管理員帳號建立（僅維運 CLI，公開註冊永遠不能建立 admin）",
];

export default function AdminSettingsPlaceholderPage() {
  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="系統設定"
        description="目前沒有適合由管理後台調整的設定。平台可調項目不是部署環境變數，就是有明確 canonical 位置的程式常數。"
      />

      <article className="space-y-4 rounded-ds-card border border-ds-border bg-ds-surface p-5 shadow-ds-card-soft">
        <div>
          <h2 className="text-title text-ds-heading">目前寫在程式碼中的業務常數</h2>
          <p className="mt-1 text-body text-ds-textMuted">
            這些值有可能值得變成可調設定，但需要先確認由誰負責、變更後如何稽核。
          </p>
          <ul className="mt-2 space-y-1 text-body text-ds-textMuted">
            {CONFIGURABLE_IN_CODE.map((item) => (
              <li key={item.label}>
                <span className="text-ds-heading">{item.label}</span>
                <span className="ml-2 font-mono text-caption text-ds-textSubtle">{item.where}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-ds-borderMuted pt-4">
          <h2 className="text-title text-ds-heading">不會出現在這裡的設定</h2>
          <p className="mt-1 text-body text-ds-textMuted">
            安全性、金流與權限相關設定只存在於部署環境，不會為了做出一個設定頁而暴露。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ds-textMuted">
            {NOT_FOR_UI.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </article>
    </section>
  );
}
