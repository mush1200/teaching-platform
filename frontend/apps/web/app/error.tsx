"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <section style={{ textAlign: "center", maxWidth: 560 }}>
        <h1 style={{ fontSize: 40, marginBottom: 12 }}>500</h1>
        <p style={{ marginBottom: 16 }}>系統發生未預期錯誤，請稍後再試。</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ padding: "8px 14px", border: "1px solid #999", borderRadius: 8, cursor: "pointer" }}
        >
          重新嘗試
        </button>
      </section>
    </main>
  );
}
