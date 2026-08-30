import { notFound } from "next/navigation";

/**
 * 法律文件的 public renderer（P1-09 Legal Foundation）。
 *
 * ## 為什麼是 plain text，不是 Markdown / HTML
 *
 * repo **沒有任何 HTML sanitizer 或 markdown renderer 相依**
 * （實測 package.json：無 dompurify / marked / remark / mdx）。
 * 為了法律頁面引入 raw HTML 會直接開一個 XSS 面，而這些內容
 * 未來會被 Admin 寫入 —— 一個被入侵的 admin 帳號就能在全站
 * 最常被閱讀的公開頁面注入腳本。
 *
 * 因此正文以**保留段落的純文字**呈現：`whitespace-pre-wrap` 讓換行與空行
 * 忠實顯示，而 React 的預設轉義確保任何標記都只是字元。
 * 需要 rich text 時應先引入受信任的 sanitizer，而不是在這裡開洞。
 *
 * ## 沒有 published 版本就 404
 *
 * **不顯示 placeholder、不顯示空殼卡片、不 fallback 到 draft。**
 * 「看起來像法律頁面但沒有內容」比誠實的 404 更危險 ——
 * 前者會讓使用者以為自己讀過了條款。
 */

export type LegalDocumentType = "terms" | "privacy" | "creator_agreement" | "refund_policy";

type LegalDocument = {
  documentType: LegalDocumentType;
  version: string;
  body: string;
  contentHash: string;
  effectiveDate: string | null;
  publishedAt: string | null;
};

/** route path → canonical document type。**固定 mapping，不接受任意查詢字串。** */
export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentType, string> = {
  terms: "服務條款",
  privacy: "隱私權政策",
  creator_agreement: "創作者條款",
  refund_policy: "退款與取消政策",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  // `effective_date` 是 DATE，序列化後可能帶時間；只取日期部分即可。
  const iso = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

async function fetchPublished(type: LegalDocumentType): Promise<LegalDocument | null> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/legal/documents/${encodeURIComponent(type)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalDocument;
  } catch {
    // Backend 不可用時同樣不得顯示任何替代內容。
    return null;
  }
}

export async function LegalDocumentPage({ type }: { type: LegalDocumentType }) {
  const doc = await fetchPublished(type);
  if (!doc || !doc.body) notFound();

  const effectiveDate = formatDate(doc.effectiveDate);

  return (
    // `RoleShell` 已提供唯一的 <main> landmark（`COR-06`）；這裡再包一層
    // 會產生巢狀 landmark，因此用 <div>。
    <div className="mx-auto w-full max-w-[820px] px-5 py-10 md:py-14">
      <article>
        <h1 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
          {LEGAL_DOCUMENT_TITLES[type]}
        </h1>

        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[#64748B]">
          <div className="flex gap-1.5">
            <dt>版本</dt>
            <dd className="font-medium text-[#334155]">{doc.version}</dd>
          </div>
          {effectiveDate ? (
            <div className="flex gap-1.5">
              <dt>生效日</dt>
              <dd className="font-medium text-[#334155]">
                <time dateTime={effectiveDate}>{effectiveDate}</time>
              </dd>
            </div>
          ) : null}
        </dl>

        {/*
         * `whitespace-pre-wrap` 保留段落與換行；`break-words` 讓長字串
         * （網址、條號）在窄螢幕折行而不撐破版面造成橫向捲動。
         */}
        <div className="mt-8 whitespace-pre-wrap break-words text-[15px] leading-[1.9] text-[#1F2937]">
          {doc.body}
        </div>
      </article>
    </div>
  );
}
