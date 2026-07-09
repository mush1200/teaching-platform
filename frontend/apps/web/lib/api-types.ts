/** Aligned with Backend/swagger.js components.schemas */

/** Keep `teacher` for backend compatibility; prefer `creator` in UI naming. */
export type UserRole = "parent" | "teacher" | "creator" | "admin";

export type Material = {
  id: string;
  title: string;
  description?: string;
  price: number;
  category?: string;
  age_range?: string;
  teacher_id?: string;
  status?: string;
  file_key?: string;
  teaching_objective?: string;
  teaching_methods?: string[];
  usage_duration?: string;
  activity_steps?: string;
  extension_value?: string;
  short_description?: string;
  material_features?: string[];
  cover_image_url?: string;
  demo_video_url?: string;
  detail_images?: MaterialImage[];
  contents?: MaterialContent[];
  created_at?: string;
  updated_at?: string;
};

export type MaterialContent = {
  type: string;
  name: string;
  count?: number | null;
  description?: string | null;
};

export type MaterialImage = {
  image_url: string;
  alt_text?: string | null;
  sort_order?: number | null;
};

export type MaterialsPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type MaterialsListResponse = {
  items: Material[];
  pagination?: MaterialsPagination;
};

export type CartItem = {
  id: string;
  user_id?: string;
  material_id: string;
  quantity: number;
  title?: string;
  price?: number;
  status?: string;
  age_range?: string;
  cover_image_url?: string | null;
  material_features?: string[] | null;
  created_at?: string;
  updated_at?: string;
};

export type CartResponse = {
  items: CartItem[];
};

export type Order = {
  id: string;
  user_id?: string;
  status: string;
  payment_mode?: string | null;
  total_amount?: number;
  total_price?: number;
  promo_code?: string | null;
  discount_amount?: number;
  invoice_type?: "none" | "carrier" | string;
  invoice_carrier?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Uploaded proofs awaiting admin review (manual_payment_proofs.review_status = pending) */
  payment_proof_pending_review_count?: number;
  payment_proof_uploaded_count?: number;
  payment_proof_latest_status?: "pending" | "approved" | "rejected" | string | null;
  payment_proof_latest_uploaded_at?: string | null;
  payment_proof_latest_reviewed_at?: string | null;
  payment_proof_rejected_note?: string | null;
  order_progress_state?: "pending" | "proof_uploaded" | "reviewing" | "approved" | "rejected" | string;
};

export type OrdersListResponse = {
  items: Order[];
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  material_id: string;
  material_title?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
};

export type CreateOrderResponse = {
  message?: string;
  data?: {
    order: Order;
    items: OrderItemRow[];
  };
};

export type OrderDetailResponse = {
  order: Order;
  items: OrderItemRow[];
};

export type DownloadLinkResponse = {
  materialId: string;
  signedUrl: string;
  expiresInSeconds?: number;
};

export type MyLibraryItem = {
  materialId: string;
  title: string;
  coverImageUrl?: string | null;
  materialUpdatedAt?: string | null;
  purchasedAt?: string | null;
  authorName?: string | null;
};

export type MyLibraryResponse = {
  items: MyLibraryItem[];
};

export type Report = {
  id: string;
  material_id?: string;
  reporter_id?: string;
  reason?: string;
  status?: "pending" | "reviewed" | string;
  created_at?: string;
  updated_at?: string;
};

export type ActivityLog = {
  id: string;
  actor_id?: string;
  actor_role?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ActivityLogsResponse = {
  items: ActivityLog[];
  pagination?: PaginationMeta;
};

export type AdminPaymentProof = {
  id: string;
  order_id: string;
  user_id?: string;
  order_status?: string;
  proof_url?: string;
  proof_mime_type?: string | null;
  proof_size_bytes?: number | null;
  original_filename?: string | null;
  review_status: "pending" | "approved" | "rejected" | string;
  uploaded_at?: string;
  created_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  note?: string | null;
};

export type AdminPaymentProofsResponse = {
  items: AdminPaymentProof[];
  pagination?: PaginationMeta;
};

export type Review = {
  id: string;
  parent_id?: string;
  material_id: string;
  rating: number;
  comment?: string | null;
  created_at?: string;
};

export type MaterialRatingStats = {
  average: number | null;
  count: number;
};

export type MaterialRatingDistribution = {
  total: number;
  items: Array<{
    star: number;
    count: number;
    percent: number;
  }>;
};

export type AdminDashboardSummary = {
  materialsCount: number;
  ordersCount: number;
  revenueAmount: number;
  reviewsCount: number;
  usersCount: number;
  pendingProofsCount: number;
  pendingReportsCount: number;
  wowReviewDeltaPercent: number;
};

export type CreatorSalesSummary = {
  totalSoldUnits: number;
  totalRevenue: number;
  totalOrders: number;
  materialsCount: number;
  trend: Array<{
    day: string;
    soldUnits: number;
    revenue: number;
  }>;
};

export type CreatorSalesByMaterial = {
  materialId: string;
  title: string;
  soldUnits: number;
  revenue: number;
  lastSoldAt?: string | null;
};

export type CreatorSalesRecord = {
  orderId: string;
  orderItemId: string;
  materialId: string;
  materialTitle: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  buyerId?: string;
  orderStatus: string;
  createdAt?: string;
  paidAt?: string | null;
};

export type CreatorSalesListResponse<T> = {
  items: T[];
  pagination?: PaginationMeta;
};

/** Backward-compatible aliases */
export type TeacherSalesSummary = CreatorSalesSummary;
export type TeacherSalesByMaterial = CreatorSalesByMaterial;
export type TeacherSalesRecord = CreatorSalesRecord;
export type TeacherSalesListResponse<T> = CreatorSalesListResponse<T>;
