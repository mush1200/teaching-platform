import { ReviewItem } from "../../../components/reviews/ReviewItem";
import { mockReviews } from "../../../lib/mock-data";

export default function AdminReviewsHubPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1F2937]">評論管理</h1>
        <p className="mt-1 text-sm text-[#6B7280]">彙總 mock 評論列表（實務上可依教材篩選）。</p>
      </div>
      <div className="space-y-3">
        {mockReviews.map((r) => (
          <ReviewItem key={r.id} review={r} />
        ))}
      </div>
    </div>
  );
}
