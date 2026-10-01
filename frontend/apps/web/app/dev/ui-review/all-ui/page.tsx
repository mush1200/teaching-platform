import Link from "next/link";
import { notFound } from "next/navigation";
import data from "../../../../tests/ui-review/all-ui.json";
import manifest from "../../../../tests/ui-review/routes.json";

/**
 * Owner UI Review Index —— 全專案 UI 連結總表（**dev-only**，2026-10-01）。
 *
 * 唯一資料來源是 `tests/ui-review/all-ui.json`（同一份清單也由驗證腳本逐條檢查）。
 * 這一頁**只有連結**：不寫任何瀏覽器儲存、不發 API、不簽 token；
 * 切換角色請用 fixture 帳號從 `/login` 正常登入（密碼在 git-ignored 的 `Backend/.ui-review-credentials.txt`，不在頁面上）。
 *
 * ## Production 護欄
 *
 * 與 `/dev/ui-review` 相同的兩個條件（AND，NODE_ENV 在前），由
 * `tests/e2e/ui-review-dev-guard.spec.ts` 掃描 `app/dev/**` 自動納管。
 */

type Item = {
  name: string;
  path: string;
  role: string;
  fixture: boolean;
  status: string;
  check: string;
  duplicate?: boolean;
};

type Section = { key: string; title: string; note?: string; items: Item[] };

const ROLE_LABEL: Record<string, { label: string; cls: string }> = {
  public: { label: "不需登入", cls: "bg-[#F3F4F6] text-ds-heading" },
  buyer: { label: "購買者", cls: "bg-[#EEF0FF] text-ds-textAccent" },
  buyerEmpty: { label: "購買者（空）", cls: "bg-[#EEF0FF] text-ds-textAccent" },
  creator: { label: "創作者", cls: "bg-status-approvedBg text-status-approvedText" },
  creatorEmpty: { label: "創作者（空）", cls: "bg-status-approvedBg text-status-approvedText" },
  admin: { label: "管理員", cls: "bg-status-pendingReviewBg text-status-pendingReviewText" },
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "正式",
  REVIEW: "請留意",
  HISTORICAL: "歷史紀錄",
  DEPRECATED: "舊網址",
  FIXTURE: "驗證用",
};

const ACCOUNTS = manifest.accounts as Record<string, string>;

function RoleBadge({ role }: { role: string }) {
  const r = ROLE_LABEL[role] ?? { label: role, cls: "bg-[#F3F4F6] text-ds-heading" };
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${r.cls}`}>{r.label}</span>;
}

export default function AllUiIndexPage() {
  // 兩個條件是 AND，且 production 優先 —— 旗標設錯也救不回來。
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_UI_REVIEW_MODE !== "1") notFound();

  const sections = data.sections as Section[];
  const unique = new Set(sections.flatMap((s) => s.items.filter((i) => !i.duplicate).map((i) => `${i.role}:${i.path}`)));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-page-mobile py-8 sm:px-page-tablet lg:px-page-desktop">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wider text-ds-textAccent">DEV ONLY · OWNER UI REVIEW INDEX</p>
        <h1 className="mt-1 text-2xl font-bold text-ds-heading">全部 UI 連結</h1>
        <p className="mt-2 max-w-3xl text-sm text-ds-body">
          點「開啟」會在新分頁打開頁面，這一頁會留著。共 {unique.size} 個連結（不含「商業配色」區的重複連結），
          清單更新日 {data.coverageDate}。
        </p>
        <p className="mt-1 text-sm">
          <Link href="/dev/ui-review" className="text-ds-textAccent underline">
            ← UI Review 索引（fixture 帳號列表）
          </Link>
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">先看這裡：要用哪個身分？</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <RoleBadge role="public" /> 不需登入就能看。若已登入，部分頁面會導到該角色的首頁（例如購買者打開教材列表會到「探索教材」）。
          </li>
          <li>
            <RoleBadge role="buyer" /> 請先到 <Link href="/login" className="underline">/login</Link> 以 <code>{ACCOUNTS.buyer}</code> 登入；
            「購買者（空）」用 <code>{ACCOUNTS.buyerEmpty}</code>（沒有訂單、收藏的帳號）。
          </li>
          <li>
            <RoleBadge role="creator" /> 以 <code>{ACCOUNTS.creator}</code> 登入；「創作者（空）」用 <code>{ACCOUNTS.creatorEmpty}</code>。
          </li>
          <li>
            <RoleBadge role="admin" /> 以 <code>{ACCOUNTS.admin}</code> 登入。
          </li>
        </ul>
        <p className="mt-2">
          所有 fixture 帳號共用同一組密碼，存在本機 <code>Backend/.ui-review-credentials.txt</code>（不進版控，也不顯示在這裡）。
          換身分前請先登出。資料是本機 UI Review 的假資料（<code>teaching_platform_ui_review</code>），不會影響 production。
        </p>
      </section>

      {sections.map((s) => (
        <section key={s.key} className="mb-8">
          <h2 className="text-title text-ds-heading">{s.title}</h2>
          {s.note ? <p className="mt-1 max-w-3xl text-sm text-ds-body">{s.note}</p> : null}
          <ul className="mt-3 divide-y divide-black/[0.05] overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
            {s.items.map((i) => (
              <li key={`${s.key}-${i.role}-${i.path}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-semibold text-ds-heading">
                    {i.name}
                    {i.status !== "ACTIVE" ? (
                      <span className="ml-2 rounded bg-[#F3F4F6] px-1.5 py-0.5 text-xs font-medium text-ds-body">
                        {STATUS_LABEL[i.status] ?? i.status}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-meta text-ds-body">{i.check}</p>
                  <p className="font-mono text-xs text-ds-textMuted">{i.path}</p>
                </div>
                <RoleBadge role={i.role} />
                <a
                  href={i.path}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-xl border border-ds-border px-4 text-sm font-semibold text-ds-textAccent hover:bg-edu-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
                >
                  開啟 ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mb-8 rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">390／768／1440 必看清單</h2>
        <p className="mt-1">
          用瀏覽器的開發者工具切換寬度（或直接縮放視窗），這幾頁在三種寬度都看一次即可；其他頁面看一種寬度就好。
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {data.responsive.map((r) => (
            <li key={r.path}>
              <a href={r.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-ds-border px-3 py-1.5 text-sm text-ds-heading hover:bg-edu-page">
                {r.name} <RoleBadge role={r.role} />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-black/[0.06] bg-white p-5 text-sm text-ds-body">
        <h2 className="text-title text-ds-heading">沒有連結的頁面（以及原因）</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {data.noFixture.map((n) => (
            <li key={n.path}>
              <code>{n.path}</code> —— {n.reason}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
