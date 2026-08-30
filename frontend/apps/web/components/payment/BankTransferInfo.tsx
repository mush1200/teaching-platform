"use client";

import type { PaymentBankInfoState } from "../../lib/payment-bank-info";

/**
 * 匯款帳戶資訊的**唯一**渲染元件。
 *
 * 結帳 Step 2 與付款憑證頁先前各自寫死一份版面與一組數字；兩處合併到這裡之後，
 * 「買家在哪一頁看到的匯款資訊」不可能再分歧。
 *
 * 三個狀態都要能渲染 —— `unavailable` 是本項的重點：設定缺失時**明確說出來**，
 * 而不是留白或顯示佔位帳號。
 */
export function BankTransferInfo({ state }: { state: PaymentBankInfoState }) {
  if (state.status === "loading") {
    return (
      <div
        className="rounded-2xl border border-dashed border-[#D8D2FF] bg-[#FAF8FF] p-4 text-sm text-[#6B7280]"
        data-testid="bank-info-loading"
      >
        載入匯款資訊…
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"
        data-testid="bank-info-unavailable"
      >
        <p className="font-semibold">付款資訊尚未設定</p>
        {/*
          這是**平台端的設定缺失**，不是消費爭議 —— 此時通常連訂單都還不存在，
          把使用者導去申訴流程只會讓他提出一個無標的的案件。
          因此這裡給的是誠實的等待指示，而**不是**指向任何不存在的客服管道
          （`BUY-02` dead-copy reconciliation，2026-08-27）。
        */}
        <p className="mt-1">
          平台的收款帳戶目前無法取得，因此暫時無法提供匯款指示。請先不要匯款，稍後再試。
        </p>
      </div>
    );
  }

  const { bankName, bankCode, accountNumber, accountName } = state.info;
  return (
    <div
      className="rounded-2xl border border-dashed border-[#D8D2FF] bg-[#FAF8FF] p-4 text-sm text-[#4B5563]"
      data-testid="bank-info"
    >
      <p>銀行名稱：{bankName}</p>
      <p>銀行代碼：{bankCode}</p>
      <p>匯款帳號：{accountNumber}</p>
      <p>戶名：{accountName}</p>
    </div>
  );
}
