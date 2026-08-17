import { redirect } from "next/navigation";

export default async function LegacyUploadProofPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  redirect(`/orders/${encodeURIComponent(orderId)}/payment-proof`);
}
