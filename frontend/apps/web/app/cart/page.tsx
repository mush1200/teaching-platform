"use client";

import { EmptyState, ErrorState, LoadingState } from "@teaching-platform/ui";

export default function CartPage() {
  const items: string[] = [];
  const isLoading = false;
  const isError = false;

  return (
    <main style={{ minHeight: "100vh", padding: 20 }}>
      <h1>購物車</h1>
      {isLoading ? <LoadingState title="資料載入中..." /> : null}
      {!isLoading && isError ? <ErrorState description="讀取失敗，請稍後再試。" errorCode={500} /> : null}
      {!isLoading && !isError && items.length === 0 ? (
        <EmptyState title="目前沒有資料（empty state）。" description="先去教材列表加入想購買的項目。" />
      ) : null}
    </main>
  );
}

