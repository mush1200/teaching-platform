import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <section style={{ textAlign: "center", maxWidth: 520 }}>
        <h1>403</h1>
        <p style={{ marginBottom: 12 }}>你沒有此操作權限。</p>
        <Link href="/" style={{ textDecoration: "underline" }}>
          返回首頁
        </Link>
      </section>
    </div>
  );
}

