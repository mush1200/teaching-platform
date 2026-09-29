import Link from "next/link";
import { PageContainer } from "../../components/ds/PageContainer";

/*
 * `UI-REV-A`：先前以 inline `padding: 16` 寫死 gutter，不隨斷點放大（`/403` 實測 16／16／16）。
 * 改由 `PageContainer` 供應 canonical gutter；置中版面與文字不變。
 */
export default function ForbiddenPage() {
  return (
    <PageContainer width="none" className="grid min-h-screen place-items-center">
      <section className="max-w-[520px] text-center">
        <h1>403</h1>
        <p className="mb-3">你沒有此操作權限。</p>
        <Link href="/" className="underline">
          返回首頁
        </Link>
      </section>
    </PageContainer>
  );
}
