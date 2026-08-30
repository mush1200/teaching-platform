export type MockMaterial = {
  id: string;
  title: string;
  ageLabel: string;
  category: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewCount: number;
  /**
   * 這份教材目前買不買得到（後端 `is_purchasable`）。
   * `false` 代表沒有可交付的教材檔案 —— 見 `Backend/utils/materialDeliverability.js`。
   * 清單 API 目前不回這個欄位，因此 mapper 預設 `true`，只有教材詳情會拿到真實值。
   */
  isPurchasable: boolean;
  coverGradient: string;
  coverImageUrl?: string;
  demoVideoUrl?: string;
  detailImages?: Array<{ image_url: string; alt_text?: string | null; sort_order?: number | null }>;
  durationHours: number;
  units: number;
  learners: number;
  description: string;
  outline: string[];
  learnPoints: string[];
  teachingObjective?: string;
  teachingMethods?: string[];
  usageDuration?: string;
  activitySteps?: string;
  extensionValue?: string;
  shortDescription?: string;
  materialFeatures?: string[];
  contents?: Array<{
    type: string;
    name: string;
    count?: number | null;
    description?: string | null;
  }>;
  publishedAt?: string;
};

export type MockCartItem = {
  id: string;
  materialId: string;
  title: string;
  ageLabel: string;
  price: number;
  quantity: number;
  coverGradient: string;
};

export type MockReview = {
  id: string;
  materialId: string;
  userName: string;
  audienceRole: "parent" | "teacher";
  avatarAccent: "violet" | "coral" | "emerald" | "amber";
  rating: number;
  date: string;
  content: string;
  likes: number;
};
