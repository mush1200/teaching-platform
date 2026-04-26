import type { Metadata } from "next";
import { mockMaterials } from "../../../lib/mock-data";
import { MaterialDetailPage } from "../../../components/materials/MaterialDetailPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = mockMaterials.find((x) => x.id === id);
  return {
    title: m ? `${m.title} | EduMarket` : "教材 | EduMarket",
    description: m?.description?.slice(0, 160) ?? "教材詳情",
  };
}

export default async function MaterialDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialDetailPage materialId={id} />;
}
