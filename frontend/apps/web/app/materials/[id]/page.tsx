import type { Metadata } from "next";
import { MaterialDetailPage } from "../../../components/materials/MaterialDetailPage";
import type { Material } from "../../../lib/api-types";
import { getServerApiBaseUrl } from "../../../lib/server-api-base-url";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  let m: Material | null = null;
  try {
    const baseUrl = getServerApiBaseUrl();
    const res = await fetch(`${baseUrl}/materials/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      m = (await res.json()) as Material;
    }
  } catch {
    m = null;
  }
  return {
    title: m ? `${m.title} | EduMarket` : "教材 | EduMarket",
    description: m?.description?.slice(0, 160) ?? "教材詳情",
  };
}

export default async function MaterialDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialDetailPage materialId={id} />;
}
