import type { Metadata } from "next";
import { LegalDocumentPage } from "../../components/legal/LegalDocumentPage";

/**
 * 固定的 route → document type mapping（P1-09 Legal Foundation §19）。
 * public path 是 canonical 的；不提供 `/legal?type=...` 這種可由使用者
 * 指定任意型別的入口。沒有 published 版本時 renderer 會 `notFound()`。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "服務條款 | EduMarket",
};

export default function Page() {
  return <LegalDocumentPage type="terms" />;
}
