export default function CartPage() {
  const items: string[] = [];
  const isLoading = false;
  const isError = false;

  return (
    <main style={{ minHeight: "100vh", padding: 20 }}>
      <h1>購物車</h1>
      {isLoading ? <p>資料載入中...</p> : null}
      {!isLoading && isError ? <p>讀取失敗，請稍後再試。</p> : null}
      {!isLoading && !isError && items.length === 0 ? <p>目前沒有資料（empty state）。</p> : null}
    </main>
  );
}

