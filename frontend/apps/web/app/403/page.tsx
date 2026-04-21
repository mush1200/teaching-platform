export default function ForbiddenPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <section style={{ textAlign: "center" }}>
        <h1>403</h1>
        <p>你沒有此操作權限。</p>
      </section>
    </main>
  );
}

