import type { Metadata } from "next";
import MaterialDetailClient from "./MaterialDetailClient";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/materials/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { title: "教材 | Teaching Platform", description: "教材詳情" };
    }
    const m = (await res.json()) as { title?: string; description?: string };
    const title = typeof m.title === "string" ? m.title : "教材";
    const desc =
      typeof m.description === "string" && m.description.length > 0 ? m.description.slice(0, 160) : "教材詳情與購買資訊。";
    return {
      title: `${title} | Teaching Platform`,
      description: desc,
      openGraph: {
        title: `${title} | Teaching Platform`,
        description: desc,
      },
    };
  } catch {
    return { title: "教材 | Teaching Platform" };
  }
}

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialDetailClient materialId={id} />;
}
