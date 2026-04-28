/** Aligned with Backend/swagger.js components.schemas */

export type UserRole = "parent" | "teacher" | "admin";

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
  created_at?: string;
  updated_at?: string;
};

export type MaterialsListResponse = {
  items: Material[];
};

export type CartItem = {
  id: string;
  user_id?: string;
  material_id: string;
  quantity: number;
  title?: string;
  price?: number;
  status?: string;
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
  paid_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Uploaded proofs awaiting admin review (manual_payment_proofs.review_status = pending) */
  payment_proof_pending_review_count?: number;
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

export type TeacherSalesSummary = {
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

export type TeacherSalesByMaterial = {
  materialId: string;
  title: string;
  soldUnits: number;
  revenue: number;
  lastSoldAt?: string | null;
};

export type TeacherSalesRecord = {
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

export type TeacherSalesListResponse<T> = {
  items: T[];
  pagination?: PaginationMeta;
};
