import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

/**
 * 收款帳戶資訊的前端取用點。
 *
 * **前端不持有任何預設值。** 先前 `checkout/page.tsx` 有一份 `BANK_INFO` 常數、
 * `orders/[orderId]/payment-proof/page.tsx` 又抄了一份、通知信裡還有第三份，
 * 三份都是佔位帳號。唯一來源現在是 Backend 的 `config/paymentBankInfo.js`
 * （`GET /payment/bank-info`）—— 這裡刻意**不提供 fallback 常數**：
 * 有 fallback 就等於又多一份 source of truth，而且會在設定缺失時安靜地顯示錯的帳號。
 */
export type PaymentBankInfo = {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
};

/** `loading` 與 `unavailable` 是兩個不同的畫面狀態，不可合併。 */
export type PaymentBankInfoState =
  | { status: "loading" }
  | { status: "ready"; info: PaymentBankInfo }
  | { status: "unavailable" };

type BankInfoResponse = {
  configured?: boolean;
  bank_name?: string;
  bank_code?: string;
  account_number?: string;
  account_name?: string;
};

export function usePaymentBankInfo(): PaymentBankInfoState {
  const [state, setState] = useState<PaymentBankInfoState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch("payment/bank-info");
        if (!res.ok) {
          if (active) setState({ status: "unavailable" });
          return;
        }
        const payload = (await res.json()) as BankInfoResponse;
        if (!active) return;
        /*
         * 只有四個欄位都拿到才算 ready。`configured: true` 但欄位是空字串的組合
         * 不該被當成「有帳號」——那正是本項要防的安靜錯誤。
         */
        if (
          payload.configured === true &&
          payload.bank_name &&
          payload.bank_code &&
          payload.account_number &&
          payload.account_name
        ) {
          setState({
            status: "ready",
            info: {
              bankName: payload.bank_name,
              bankCode: payload.bank_code,
              accountNumber: payload.account_number,
              accountName: payload.account_name,
            },
          });
          return;
        }
        setState({ status: "unavailable" });
      } catch {
        if (active) setState({ status: "unavailable" });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
