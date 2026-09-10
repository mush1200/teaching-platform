/** Keep `teacher` for backend compatibility; prefer `creator` in UI naming. */
export type UserRole = "parent" | "teacher" | "creator" | "admin";

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    created_at: string;
  };
};

/**
 * `REL-04` —— gateway 類狀態碼：請求**還沒有到達應用程式**。
 *
 * 這些情況下 upstream 的 body 不是應用程式產生的（Render 的 HTML 錯誤頁），
 * 而兩個 auth proxy route 在 `response.json()` 失敗時會合成
 * `{ message: "invalid response payload" }`。任何「優先顯示 server message」的
 * 錯誤擷取器若不排除這些狀態碼，就會把那串**內部字串直接顯示給使用者** ——
 * 比通用文案更糟。因此這裡集中定義一次，供文案對應與擷取器共用。
 */
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

export function isGatewayStatus(status: number): boolean {
  return GATEWAY_STATUSES.has(status);
}

export function mapStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return "請確認輸入資料格式。";
    case 401:
      return "帳號或密碼錯誤，請重新登入。";
    case 403:
      return "你沒有此操作權限。";
    case 404:
      return "找不到服務或資料。";
    case 409:
      return "資料與伺服器狀態衝突（可能重複註冊或狀態已變更）。";
    case 500:
      return "系統忙碌中，請稍後再試。";
    /*
     * `REL-04` —— gateway 類狀態碼必須與「帳密錯誤」明確分開。
     *
     * 這三個碼代表**還沒有到達應用程式**（上游未回應、暫時不可用、逾時），
     * 使用者什麼都沒做錯。先前它們落到 default 的「操作失敗，請稍後再試。」，
     * 在登入頁會被讀成「我打錯帳密了」——而 401 早就有自己的文案，
     * 所以看到這一句反而**代表不是憑證問題**。
     *
     * 三個碼共用同一句：對使用者而言它們無法區分，分開寫只會製造假精確度。
     * 文案刻意**不揭露**任何基礎設施細節（供應商、backend、proxy、逾時秒數）——
     * 那是營運資訊，不是使用者需要知道的事。
     */
    case 502:
    case 503:
    case 504:
      return "服務正在啟動或暫時無法連線，請稍候幾分鐘再試一次。";
    default:
      return "操作失敗，請稍後再試。";
  }
}

