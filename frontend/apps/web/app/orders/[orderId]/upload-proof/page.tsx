import { redirect } from "next/navigation";

export default function LegacyUploadProofPage({ params }: { params: { orderId: string } }) {
  redirect(`/orders/${encodeURIComponent(params.orderId)}/payment-proof`);
}
