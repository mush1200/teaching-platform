import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * UI Review 的路由索引頁（**dev-only**）。
 *
 * ## 這一頁**不做**的事
 *
 * - **沒有任何登入繞道。** 這裡只有 `<Link>`，不發 token、不寫 cookie、不呼叫 API。
 *   角色切換一律走正式的 `/login`（fixture 帳號見 `Backend/.ui-review-credentials.txt`）。
 *   `docs/mvp_rules.md` 的授權邊界完全不受本頁影響。
 * - **不宣稱不存在的路由。** 下面每一條都對應 app 目錄下實際存在的 `page.tsx`。
 *
 * ## Production 護欄（三層，fail-closed）
 *
 * 1. `NODE_ENV === "production"` → `notFound()`。**即使**旗標被設了也一樣。
 * 2. `NEXT_PUBLIC_UI_REVIEW_MODE !== "1"` → `notFound()`。旗標只由
 *    `frontend/scripts/ui-review-dev.mjs` 注入，`render.yaml` 不宣告它。
 * 3. `tests/e2e/ui-review-dev-guard.spec.ts` 以 source scan 釘住 `render.yaml`
 *    永遠不得宣告該旗標 —— 與 `production-url-guard.spec.ts` 同一套作法。
 *
 * 兩個執行期條件是 **AND**：production 缺一不可地拿不到這一頁。
 */

type RouteGroup = { title: string; note?: string; routes: { href: string; label: string }[] };

const GROUPS: RouteGroup[] = [
  {
    title: "公開（不需登入）",
    routes: [
      { href: "/", label: "首頁" },
      { href: "/materials", label: "教材列表" },
      { href: "/materials/uir_mat_baseline", label: "教材詳情 — 一般基準" },
      { href: "/materials/uir_mat_long_title_zh", label: "教材詳情 — 超長中文標題" },
      { href: "/materials/uir_mat_long_title_en", label: "教材詳情 — 超長英文標題／無封面" },
      { href: "/materials/uir_mat_no_tags", label: "教材詳情 — 無標籤" },
      { href: "/materials/uir_mat_high_price", label: "教材詳情 — 高價" },
      { href: "/materials/uir_mat_baseline/reviews", label: "教材的教學回饋列表" },
      { href: "/login", label: "登入" },
      { href: "/register", label: "註冊" },
      { href: "/support", label: "聯絡平台" },
      { href: "/terms", label: "服務條款" },
      { href: "/privacy", label: "隱私權政策" },
      { href: "/refund", label: "退款政策" },
      { href: "/creator-agreement", label: "創作者合約" },
      { href: "/403", label: "403 權限不足" },
    ],
  },
  {
    title: "購買者",
    note: "以 buyer@ui-review.local 登入；空白狀態請改用 buyer-empty@ui-review.local",
    routes: [
      { href: "/explore", label: "探索教材" },
      { href: "/dashboard", label: "購買者總覽" },
      { href: "/favorites", label: "收藏清單" },
      { href: "/cart", label: "購物車" },
      { href: "/checkout", label: "結帳" },
      { href: "/me/orders", label: "我的訂單" },
      { href: "/me/orders/uir_ord_approved", label: "訂單詳情 — 已核准" },
      { href: "/me/orders/uir_ord_pending_payment", label: "訂單詳情 — 待付款" },
      { href: "/me/orders/uir_ord_pending_review", label: "訂單詳情 — 待審核" },
      { href: "/me/orders/uir_ord_rejected", label: "訂單詳情 — 已退回" },
      { href: "/orders/uir_ord_pending_payment/upload-proof", label: "上傳付款憑證" },
      { href: "/orders/uir_ord_pending_review/payment-proof", label: "付款憑證檢視" },
      { href: "/me/materials", label: "我的教材（已購買）" },
      { href: "/downloads", label: "下載" },
      { href: "/my-reviews", label: "我的教學回饋" },
      { href: "/me/complaints", label: "我的申訴" },
      { href: "/me/complaints/new", label: "新增申訴" },
    ],
  },
  {
    title: "創作者",
    note: "以 creator@ui-review.local 登入；空白狀態請改用 creator-empty@ui-review.local",
    routes: [
      { href: "/creator/materials", label: "教材管理" },
      { href: "/creator/materials/new", label: "新增教材" },
      { href: "/creator/materials/uir_mat_changes_requested/edit", label: "編輯教材 — 退回修改中" },
      { href: "/creator/materials/uir_mat_baseline/reviews", label: "教材的教學回饋" },
      { href: "/creator/sales", label: "我的銷售" },
      { href: "/creator/cases", label: "我的案件" },
    ],
  },
  {
    title: "管理員",
    note: "以 admin@ui-review.local 登入",
    routes: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/materials", label: "教材審核" },
      { href: "/admin/orders", label: "訂單管理" },
      { href: "/admin/payment-proofs", label: "付款憑證審核" },
      { href: "/admin/reports", label: "檢舉案件" },
      { href: "/admin/remedy-cases", label: "退款／補救案件" },
      { href: "/admin/complaints", label: "消費爭議" },
      { href: "/admin/reviews-hub", label: "審核中心" },
      { href: "/admin/users", label: "用戶管理" },
      { href: "/admin/privacy-requests", label: "隱私權請求" },
      { href: "/admin/activity-logs", label: "活動紀錄" },
      { href: "/admin/settings", label: "系統設定" },
    ],
  },
];

const ACCOUNTS = [
  ["buyer@ui-review.local", "購買者", "有訂單、收藏、購物車、已購教材、教學回饋"],
  ["buyer-empty@ui-review.local", "購買者", "完全空白 —— 用來看所有 empty state"],
  ["creator@ui-review.local", "創作者", "36 筆教材、四種狀態、有銷售"],
  ["creator-empty@ui-review.local", "創作者", "尚無教材 —— empty state"],
  ["admin@ui-review.local", "管理員", "審核、訂單、憑證、檢舉"],
];

export default function UiReviewIndexPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-8">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">
          DEV ONLY
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">UI Review 路由索引</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          這一頁只有連結，<strong>沒有任何登入繞道</strong>。切換角色請用下方帳號從{" "}
          <Link href="/login" className="underline">
            /login
          </Link>{" "}
          正常登入。密碼在 <code>Backend/.ui-review-credentials.txt</code>（未進版控）。
        </p>
      </header>

      <section className="mb-10 rounded-2xl border border-black/[0.06] bg-white/70 p-5">
        <h2 className="mb-3 text-lg font-bold text-ds-heading">Fixture 帳號</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-ds-textAccent">
                <th className="py-2 pr-4 font-semibold">Email</th>
                <th className="py-2 pr-4 font-semibold">角色</th>
                <th className="py-2 font-semibold">內容</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNTS.map(([email, role, note]) => (
                <tr key={email} className="border-b border-black/[0.04] last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{email}</td>
                  <td className="py-2 pr-4">{role}</td>
                  <td className="py-2 text-ds-body">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} className="rounded-2xl border border-black/[0.06] bg-white/70 p-5">
            <h2 className="text-lg font-bold text-ds-heading">{group.title}</h2>
            {group.note ? <p className="mt-1 text-xs text-ds-body">{group.note}</p> : null}
            <ul className="mt-3 space-y-1">
              {group.routes.map((route) => (
                <li key={route.href}>
                  <Link
                    href={route.href}
                    className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1.5 text-sm hover:bg-edu-page"
                  >
                    <span className="text-ds-heading">{route.label}</span>
                    <code className="text-xs text-ds-textAccent">{route.href}</code>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
