/**
 * 一般客服聯絡方式 —— **前端唯一來源**（`PRE-14`）。
 *
 * ## 這是什麼、不是什麼
 *
 * 這裡解析的是「一般客服」的聯絡地址：登入／帳號操作、教材下載操作、
 * 網站功能使用等**一般平台操作問題**的求助管道。
 *
 * 它**不是** case system 的一部分。消費申訴（`/me/complaints`）、教材檢舉
 * （教材詳情頁）與個資權利請求（隱私權政策所載之個資聯絡方式）各有各的
 * 法律基礎、提出者與期限來源，**不得**被這個 Email 取代，也不得反過來
 * 承接一般客服 —— 邊界的 canonical source 是 `docs/mvp_rules.md` §12.12。
 *
 * ## Fail honest，不 fail placeholder
 *
 * 未設定時**不編造地址、不沿用任何預設值**，而是回 `null`，由呼叫端顯示
 * 誠實的「尚未設定」文案。這與 `Backend/config/paymentBankInfo.js` 是同一個
 * 原則：缺設定時要看得見地壞掉，不要安靜地錯。
 *
 * 對客服而言「安靜地錯」特別糟 —— 一個看起來能點、寄出去卻沒人收的地址，
 * 比誠實地說「尚未設定」更傷，因為使用者會以為自己已經求助過了。
 * 這也正是 `BUY-03`（`href="#help"` 的「幫助中心」）當初被移除的理由。
 *
 * ## 為什麼有 placeholder 清單
 *
 * 沿用 `paymentBankInfo.js` 對佔位帳號、以及 CLAUDE.md §8 對 `JWT_SECRET`
 * 佔位值的同一條規則：**把佔位字串貼進 env 不算設定完成**。少了這道檢查，
 * 本項最可能的迴歸就是有人把文件裡的示意值原封不動搬進部署環境，
 * 於是頁面「成功地」顯示一個不存在的信箱。
 */

export type SupportContact = {
  /** 顯示用的地址。 */
  email: string;
  /** `mailto:` href。 */
  mailto: string;
};

/**
 * 已知佔位／示意值 —— 一律視同「未設定」。
 *
 * 比對前先 `trim()` ＋ 轉小寫。`docs/production-environment-contract.md` 只寫
 * `support@<production-domain>` 這種**明顯**的佔位符（角括號無法通過下方的
 * 格式檢查），這份清單擋的是「看起來像真的」那一類。
 */
const PLACEHOLDER_EMAILS = new Set([
  "support@example.com",
  "support@example.org",
  "contact@example.com",
  "test@example.com",
  "you@example.com",
  "support@localhost",
  "support@production-domain",
  "support@your-domain.com",
]);

/**
 * 刻意寬鬆的地址檢查。
 *
 * 這裡的職責是「擋掉明顯不是地址的字串」（空白、角括號佔位符、沒有 `@`），
 * **不是**驗證信箱是否真的收得到信 —— 那件事沒有任何前端檢查做得到，
 * 而過度嚴格的 regex 只會把合法但少見的地址擋在門外。
 */
const EMAIL_SHAPE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/**
 * 從原始 env 值解析聯絡方式。
 *
 * **純函式，不讀 `process.env`** —— 兩個分支才測得起來（見
 * `tests/e2e/support-entry.spec.ts`）。
 */
export function resolveSupportContact(raw: string | null | undefined): SupportContact | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (!EMAIL_SHAPE.test(value)) return null;
  if (PLACEHOLDER_EMAILS.has(value.toLowerCase())) return null;
  return { email: value, mailto: `mailto:${value}` };
}

/**
 * 讀取部署環境設定的一般客服信箱。
 *
 * `NEXT_PUBLIC_SUPPORT_EMAIL` **刻意是 public 值** —— 它就是要印在一個匿名
 * 可讀的頁面上給人抄下來的東西，因此不存在「經由 `NEXT_PUBLIC_*` 外洩」的
 * 問題（`docs/production-environment-contract.md` §5 規則 3 已同輪更新）。
 * 它**不得**與個資權利請求信箱共用同一條設定：兩者在法律上是不同的受理管道。
 */
export function getSupportContact(): SupportContact | null {
  return resolveSupportContact(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
}
