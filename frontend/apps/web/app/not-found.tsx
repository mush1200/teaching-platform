import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <section style={{ textAlign: "center", maxWidth: 520 }}>
        <h1 style={{ fontSize: 48, marginBottom: 12 }}>404</h1>
        <p style={{ marginBottom: 16 }}>找不到你要前往的頁面，可能已移動或網址有誤。</p>
        <Link href="/" style={{ textDecoration: "underline" }}>
          返回首頁
        </Link>
      </section>
    </main>
  );
}
