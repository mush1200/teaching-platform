import type { UserRole } from "./api-types";
import { mapStatusMessage } from "./auth";
import { recoverFromExpiredSession } from "./session";

const STORAGE_TOKEN = "tp_token";

/**
 * Authorization source of truth is the JWT below, sent as `Authorization: Bearer` and
 * verified by the Backend. The `tp_role` cookie/localStorage value is only a UX hint used
 * by middleware.ts and the shells to pick which chrome to render — it is client-writable
 * and must never be treated as a permission.
 */

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_TOKEN);
}

export function getStoredRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  const r = localStorage.getItem("tp_role");
  if (r === "parent" || r === "teacher" || r === "admin") return r;
  return null;
}

/**
 * `apiFetch` 的行為選項（`DX-04`）。
 *
 * `authExpiry` 決定收到 **401** 時要不要走 session 恢復：
 *   - `"inline"`（**預設**）：不導向，把 401 原樣交還呼叫端自己顯示頁內訊息
 *   - `"recover"`：清掉 client session 並導回 `/login?redirect=…`
 */
export type ApiFetchOptions = {
  authExpiry?: "recover" | "inline";
};

/**
 * Proxied backend call: GET/POST/DELETE `/api/backend/<path>`
 *
 * ## 401 的集中處理（`DX-04`）
 *
 * 先前這裡只回傳原始 `Response`，於是 43 個呼叫端各自決定要不要處理 401 ——
 * 實際上幾乎沒有人處理。token 在 cookie 還活著的期間被撤銷／竄改時，
 * 頁面會照常渲染外殼、然後停在自己的空狀態或錯誤訊息上，**使用者永遠回不到登入頁**。
 *
 * 恢復動作是 **opt-in**：呼叫端傳 `{ authExpiry: "recover" }` 才會導向，
 * 預設維持既有行為（把 401 交還呼叫端）。這是 completion criteria 明訂的
 * 「做成 opt-in helper，**不要**全域攔截」——
 * 全域攔截會讓**任何**一次 401 把整頁換掉，破壞公開頁與 buyer 頁的頁內錯誤態。
 *
 * > 這一點是實測換來的：先前把預設設成全域恢復，完整套件出現 **24 支失敗**，
 * > 分布在 8 個 spec —— 頁面只 mock 了部分端點、其餘落到真實後端而回 401，
 * > 於是整頁被導走。那正是 criteria 擔心的 blast radius。
 *
 * 即使 opt-in，恢復本身仍有三道 guard（見 `lib/session.ts`）：
 *
 * 1. **沒有 token 時不處理** —— 匿名呼叫受保護端點本來就會 401，那不是「session 過期」。
 * 2. **auth 頁上不處理** —— 登入／註冊頁的 401 是帳密錯誤（它們本來就走
 *    `/api/auth/*` 的 direct fetch，不經過這裡）。
 * 3. **同一頁只恢復一次** —— 多個並行請求一起回 401 時不會觸發多次導向。
 *
 * **403 一律不處理**，不論 opt-in 與否。403 是「已驗證但無權限」，session 仍然有效；
 * 把它當成過期會把合法的權限拒絕變成莫名其妙的登出。
 *
 * 目前 opt-in 的是**三個外殼各自的 session 探測呼叫**（見 `RoleShell` / `ParentAppShell`）——
 * 一個外殼一次，就能對該區域的所有頁面給出一致的過期行為，
 * 不必在 43 個呼叫端各加一次、也不必承擔全域攔截的風險。
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (init?.body instanceof FormData) {
    headers.delete("Content-Type");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const body = init?.body;
  if (body != null && !headers.has("Content-Type")) {
    if (typeof body === "string") {
      headers.set("Content-Type", "application/json; charset=utf-8");
    } else if (body instanceof URLSearchParams) {
      headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
  }

  const url = `/api/backend/${path.replace(/^\//, "")}`;
  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  /*
   * 只有「帶著 token 卻被判為未認證」才算 session 失效。
   * 回應仍原樣交還呼叫端 —— 導向是非同步發生的，呼叫端既有的錯誤處理不會被打斷。
   */
  if (response.status === 401 && token && options?.authExpiry === "recover") {
    recoverFromExpiredSession();
  }

  return response;
}

export async function parseApiErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (data.message && typeof data.message === "string") {
      return data.message;
    }
  } catch {
    /* ignore */
  }
  return mapStatusMessage(response.status);
}
