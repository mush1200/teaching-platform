/**
 * Client-side session state 與失效恢復（`DX-04`）。
 *
 * ## 這一層負責什麼
 *
 * 瀏覽器端「看起來已登入」的所有痕跡，以及**當後端說 session 已失效時要怎麼收拾**。
 *
 * 真正的授權邊界永遠在 Backend（`requireRole` 驗簽 JWT）。這裡的 `tp_token` /
 * `tp_role` 只是 UX hint —— `middleware.ts` 用它決定渲染哪個外殼，
 * 竄改它只會得到一個空殼與一連串 403（CLAUDE.md §3）。
 *
 * ## 為什麼需要這個檔案
 *
 * 登出時要清的那組 key 先前**在三個地方各抄了一份**
 * （`AdminSidebar.tsx`、`dashboard/Sidebar.tsx`、`layout/RoleShell.tsx`），
 * 內容完全相同。401 恢復必須清得**至少一樣乾淨**，否則 `middleware.ts` 仍看得到
 * cookie、`RoleShell` 仍看得到 role，導向 `/login` 之後又被判定為已登入而彈回來 ——
 * 也就是 redirect loop。四份各自演化的清單保證不了這件事，因此收斂成一份。
 */

/**
 * 登出時要清掉的 localStorage key。
 *
 * **只列 session 標記與已退役的 key**：使用者偏好、草稿、通知等一律不動
 * （`DX-04` 的範圍是 session 失效恢復，不是「清空瀏覽器」）。
 *
 * ## 後兩個 key 已無任何 writer —— legacy cleanup，不是 active collection
 *
 *   - `tp_display_name`     —— `DEC-06`（2026-08-27）：註冊不再蒐集姓名。
 *   - `tp_analytics_events` —— `DEC-08`（2026-08-27）：browser-local analytics 已整套移除
 *                              （`lib/analytics.ts` 已刪除，5 個 producer 歸零）。
 *
 * 兩者留在清單裡是為了把**既有瀏覽器內的殘留舊值**清掉，讓它們真的退場；
 * 這**不違反**上面「不清使用者偏好」的原則 —— 已退役的蒐集資料不是使用者偏好。
 *
 * **不得**把任何一個重新變成 active writer，也不得新增替代的 analytics key。
 */
const SESSION_STORAGE_KEYS = [
  "tp_token",
  "tp_role",
  "tp_user_email",
  "tp_display_name",
  "tp_analytics_events",
] as const;

/** `middleware.ts` 讀得到的 cookie。少清任何一個都會造成 redirect loop。 */
const SESSION_COOKIES = ["tp_token", "tp_role"] as const;

/**
 * 角色 → **canonical landing route**（`DX-17`）。
 *
 * ## 為什麼要有這一份
 *
 * 這個對照先前在 `app/page.tsx` 與 `app/login/page.tsx` **各寫了一份**，
 * 而且兩份不一致：登入把 admin 送到 `/admin`（對），首頁卻把「非 creator 的一律」
 * 送到 `/dashboard`（錯）—— 但 `/dashboard` 在 `middleware.ts` 是 `parent` 專屬，
 * 於是 admin 一進首頁就被彈到 `/403`。
 *
 * 這與本檔開頭記載的 session key 事故是**同一種**失敗：同一份事實抄成很多份，
 * 各自演化之後就對不起來。因此這裡是唯一的一份。
 *
 * ## 不變條件
 *
 * **每個 role 的 landing route 必須是該 role 在 `middleware.ts` 中有權存取的 route。**
 * 破壞它就會產生「導過去、立刻被彈回來」的迴圈。對照如下：
 *
 * ```text
 * parent  → /dashboard          middleware: /dashboard 僅 parent
 * teacher → /creator/materials  middleware: /creator 允許 teacher / creator / admin
 * creator → /creator/materials  同上
 * admin   → /admin              middleware: /admin 僅 admin
 * ```
 *
 * 這條不變條件由 E2E（四種身分的 root redirect ＋ 直接導覽）把關。
 *
 * ## 角色值的來源
 *
 * client 端看得到的 role 只有 `parent` / `teacher` / `creator` / `admin`
 * —— API 回應層會把 `buyer` 轉回 `parent`（CLAUDE.md §2 的 `normalizeRoleForClient`），
 * 因此**這裡不新增 `buyer` 條目**，也不藉本輪擴張角色模型。
 */
const ROLE_LANDING_ROUTES = {
  parent: "/dashboard",
  teacher: "/creator/materials",
  creator: "/creator/materials",
  admin: "/admin",
} as const;

export type LandingRole = keyof typeof ROLE_LANDING_ROUTES;

/**
 * 取得某個角色登入後該去的地方。
 *
 * **無法辨識的角色回傳 `null`**，而不是猜一個目的地 —— 舊的 `else → /dashboard`
 * 正是這個 bug 的成因。呼叫端據此決定：首頁**不導向**（留在公開首頁），
 * 登入頁退回 `/`。兩者都不會產生迴圈。
 */
export function getLandingRouteForRole(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_LANDING_ROUTES[role as LandingRole] ?? null;
}

/** 測試與不變條件檢查用：完整的角色→路由對照。 */
export function landingRouteEntries(): ReadonlyArray<readonly [string, string]> {
  return Object.entries(ROLE_LANDING_ROUTES);
}

/** 登入頁自己的請求失敗**不算** session 失效 —— 那是帳密錯誤。 */
const AUTH_PAGE_PREFIXES = ["/login", "/register"] as const;

/**
 * 清掉所有 client-side 的登入痕跡。
 *
 * 登出與 401 恢復共用同一份實作 —— 兩者對「什麼算已登入」必須有相同的答案。
 */
export function clearClientSession(): void {
  if (typeof window === "undefined") return;
  for (const key of SESSION_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  for (const name of SESSION_COOKIES) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  }
}

/**
 * 這個字串是否為安全的「站內回跳路徑」。
 *
 * 只接受單一斜線開頭的相對路徑。要擋掉的是 open redirect：
 *   - `https://evil.com`、`//evil.com`   → 跨站
 *   - `/\evil.com`                        → 瀏覽器會把 `\` 當 `/`，等同 `//evil.com`
 *   - 不以 `/` 開頭者                     → 相對路徑，語意不明確
 */
export function isSafeInternalPath(value: string | null | undefined): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}

/**
 * 組出帶安全回跳參數的登入網址。
 *
 * 參數名沿用 repo 既有慣例 **`redirect`** —— `middleware.ts:44` 就是這樣設的，
 * `app/login/page.tsx` 也是讀這個 key。**不要**另外發明 `next`。
 * 目標路徑不安全（或沒有）時就退回乾淨的 `/login`，不夾帶任何東西。
 */
export function buildLoginUrl(targetPath?: string | null): string {
  if (!isSafeInternalPath(targetPath)) return "/login";
  return `/login?redirect=${encodeURIComponent(targetPath as string)}`;
}

/** 目前這條路徑是不是 auth 頁本身。 */
export function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * 同一個頁面生命週期內只恢復一次。
 *
 * 一頁常常同時發出好幾個請求；token 失效時它們會**一起**回 401。
 * 沒有這個 latch 的話，每一個都會觸發一次導向。
 */
let recovering = false;

/** 測試用：重置 latch。production code 不應呼叫。 */
export function resetSessionRecoveryForTests(): void {
  recovering = false;
}

/**
 * 後端說 session 已失效（401）時的恢復動作。
 *
 * 清掉 client session，然後導回登入頁並帶上安全的回跳路徑。
 * 用 `location.replace` 而不是 `push`：**不留下歷史紀錄**，
 * 否則使用者按上一頁又回到那個已經沒有 session 的頁面，再被彈一次。
 *
 * @returns 是否真的執行了恢復（已在恢復中、或在 auth 頁上時回 `false`）
 */
export function recoverFromExpiredSession(): boolean {
  if (typeof window === "undefined") return false;
  if (recovering) return false;

  const { pathname, search } = window.location;
  // 登入／註冊頁的 401 是帳密錯誤，不是 session 失效 —— 在這裡導向會變成自我重導。
  if (isAuthPagePath(pathname)) return false;

  recovering = true;
  clearClientSession();
  window.location.replace(buildLoginUrl(`${pathname}${search}`));
  return true;
}
