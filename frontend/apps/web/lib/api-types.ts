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
  /**
   * Admin operational state（僅 `GET /admin/orders` 回傳）。
   * 由 `orders.status` + `manual_payment_proofs.review_status` 在 Backend 衍生，
   * 是 Admin 篩選與列徽章的 canonical 依據 —— 不要改用 `status` 自行判讀。
   *
   * 與 buyer 的 `order_progress_state` 刻意分開：那是買家視角的進度
   * （待付款／審核中／審核未通過），這是 admin 視角的處理佇列。
   */
  operational_status?: "awaiting_payment" | "pending_review" | "payment_rejected" | "approved" | "cancelled" | string;
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

/**
 * `GET /admin/dashboard/summary` 的回應。
 *
 * 兩類數字語意不同，**不得混用**（見 docs/mvp_rules.md §15）：
 *   - period：`periodRevenueAmount` / `new*Count` —— 只計入所選期間內發生的事件
 *   - snapshot / all-time：`*Count` / `revenueAmount` / `pending*Count` —— 不受期間影響
 *
 * `period*` metadata 是 Backend **實際查詢**的期間；UI 顯示區間文字時應以此為準，
 * 不要在前端自行推算。
 */
export type AdminDashboardSummary = {
  periodFrom: string;
  periodTo: string;
  periodTimezone: string;
  periodPreset: string;

  /** Period metrics — 受所選期間控制 */
  periodRevenueAmount: number;
  newOrdersCount: number;
  newUsersCount: number;
  newMaterialsCount: number;
  newReviewsCount: number;

  /**
   * 比較基準期：緊鄰前一個等長期間（`this_month` 為上月同期）。
   * 由 Backend 解析，前端**不得**自行推算。
   */
  previousPeriodFrom: string;
  previousPeriodTo: string;
  previousPeriodRevenueAmount: number;
  previousNewOrdersCount: number;
  previousNewUsersCount: number;
  previousNewMaterialsCount: number;
  previousNewReviewsCount: number;

  /**
   * Canonical 成長率（整數百分比，可為負）。
   * **`null` = previous 為 0 且 current > 0** —— 百分比無有限值，UI 顯示「新增」。
   * 前端只負責顯示，不得自行代換成 100 或重算。
   */
  revenueDeltaPercent: number | null;
  newOrdersDeltaPercent: number | null;
  newUsersDeltaPercent: number | null;
  newMaterialsDeltaPercent: number | null;
  newReviewsDeltaPercent: number | null;

  /** Snapshot / all-time — 不受所選期間影響 */
  materialsCount: number;
  ordersCount: number;
  /** All-time 已核准營收。保留供既有 caller 使用；Dashboard UI 改顯示 `periodRevenueAmount`。 */
  revenueAmount: number;
  reviewsCount: number;
  usersCount: number;
  pendingProofsCount: number;
  pendingReportsCount: number;
  /**
   * @deprecated 舊的 7 天滾動指標，已由 `newReviewsDeltaPercent` 取代。
   * 沒有任何 caller；保留欄位僅為避免 breaking change。它把「從 0 成長」硬編成 100%，
   * 與 canonical 的 zero-denominator 規則（回 `null`）不一致，不得使用。
   */
  wowReviewDeltaPercent: number;
};

/** Trend chart 的 bucket 粒度，由期間長度決定（單日→hour、2–90 天→day、91 天以上→month）。 */
export type TrendGranularity = "hour" | "day" | "month";

/**
 * 一個 bucket。`key` 是 machine-friendly 識別碼，不是顯示用 label：
 * `2026-08-20T14`（hour）／`2026-08-20`（day）／`2026-08`（month）。
 */
export type TrendPoint = {
  key: string;
  value: number;
};

/**
 * `GET /admin/dashboard/trends` 的回應。
 *
 * 兩條序列的事件不同：`revenue` 依 `orders.paid_at`（核准），
 * `orders` 依 `orders.created_at`（建立、不分狀態）。
 * 沒有資料的 bucket 一律補 `0` —— `0` 是有效資料，與載入失敗是兩回事。
 */
export type AdminDashboardTrends = {
  periodFrom: string;
  periodTo: string;
  periodTimezone: string;
  periodPreset: string;
  granularity: TrendGranularity;
  revenue: TrendPoint[];
  orders: TrendPoint[];
};

/** 期間 metadata：Creator sales 三支 endpoint 都會回傳，UI 應以此顯示區間。 */
export type CreatorSalesPeriodMeta = {
  periodFrom: string;
  periodTo: string;
  periodTimezone: string;
  periodPreset: string;
};

/**
 * Creator 銷售趨勢的一個 bucket。
 *
 * `key` 是 machine-friendly 識別碼（`YYYY-MM-DD` / `...THH` / `YYYY-MM`），
 * **不是** PostgreSQL 的 date 物件 —— 舊版把 PG date 直接送到前端再 `toISOString()`，
 * 導致每個點的日期都早一天。前端一律用字串解析格式化，不要再轉成 `Date`。
 */
export type CreatorSalesTrendPoint = {
  key: string;
  salesAmount: number;
  soldUnits: number;
  /** @deprecated `key` 的別名。 */
  day: string;
  /** @deprecated `salesAmount` 的別名。 */
  revenue: number;
};

/**
 * `GET /teacher/sales/summary` 的回應。
 *
 * **Creator Gross Sales** —— 已成交（`orders.status = 'approved'`）的創作者商品行金額，
 * **折扣前**（`SUM(order_items.subtotal)`），認列於 `orders.paid_at`。
 *
 * 與 Admin 的 recognized revenue 刻意只差在金額基準（Admin 用折扣後的 `orders.total_amount`）；
 * 兩者涵蓋完全相同的一組訂單與日期。詳見 docs/mvp_rules.md §18。
 */
export type CreatorSalesSummary = CreatorSalesPeriodMeta & {
  granularity: TrendGranularity;
  totalSoldUnits: number;
  /** Canonical：Creator Gross Sales（折扣前）。 */
  totalSalesAmount: number;
  /** @deprecated 與 `totalSalesAmount` 同值；名稱誤導（不是 revenue），保留僅為相容。 */
  totalRevenue: number;
  totalOrders: number;
  materialsCount: number;
  trend: CreatorSalesTrendPoint[];
};

export type CreatorSalesByMaterial = {
  materialId: string;
  title: string;
  soldUnits: number;
  /** Canonical：該教材在所選期間的 Gross Sales（折扣前）。 */
  salesAmount: number;
  /** @deprecated `salesAmount` 的別名。 */
  revenue: number;
  /** 最近**成交**時間（`MAX(orders.paid_at)`），不是最近下單時間。 */
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

export type CreatorSalesListResponse<T> = CreatorSalesPeriodMeta & {
  items: T[];
  pagination?: PaginationMeta;
};

/** Backward-compatible aliases */
export type TeacherSalesSummary = CreatorSalesSummary;
export type TeacherSalesByMaterial = CreatorSalesByMaterial;
export type TeacherSalesRecord = CreatorSalesRecord;
export type TeacherSalesListResponse<T> = CreatorSalesListResponse<T>;

/* ---------------------------------------------------------------------------
 * Admin Operations（Epic：檢舉案件 / 付款審核 / 教材審核佇列 / 活動紀錄）
 * 對齊 Backend/utils/reportWorkflow.js、utils/paymentProofReview.js、
 * services/adminMaterials.service.js、services/adminActivityLogs.service.js
 * ------------------------------------------------------------------------- */

/**
 * 檢舉案件狀態。`reviewed` 是 legacy 終態（舊的「標記已讀」），
 * 仍會出現在既有資料中，新流程不再產生。
 */
export type ReportCaseStatus =
  | "pending"
  | "investigating"
  | "awaiting_creator"
  | "resolved"
  | "dismissed"
  | "reviewed";

/** 最終處置。只含平台真的做得到的動作（沒有使用者停權 —— users 沒有 status 欄位）。 */
export type ReportResolution = "dismissed" | "warning" | "request_changes" | "unpublish_material";

export type ReportEventType =
  | "status_changed"
  | "admin_note"
  | "creator_response_requested"
  | "creator_response"
  | "resolution";

export type ReportCase = {
  id: string;
  material_id: string;
  reporter_id?: string;
  reason?: string;
  status: ReportCaseStatus;
  resolution?: ReportResolution | null;
  resolution_note?: string | null;
  created_at?: string;
  updated_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  /** Enriched：教材／創作者／檢舉人的可讀資訊（Backend JOIN，前端不再自行查） */
  material_title?: string | null;
  material_status?: string | null;
  creator_id?: string | null;
  creator_email?: string | null;
  reporter_email?: string | null;
  reviewed_by_email?: string | null;
  event_count?: number;
  last_event_at?: string | null;
};

export type ReportEvent = {
  id: string;
  report_id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  actor_email?: string | null;
  event_type: ReportEventType;
  message?: string | null;
  meta?: Record<string, unknown>;
  created_at: string;
};

export type ReportCasesResponse = {
  items: ReportCase[];
  pagination: PaginationMeta;
  /** 全表計數（不受篩選／分頁影響），供 filter chip 顯示待辦數量。 */
  statusCounts: Partial<Record<ReportCaseStatus, number>>;
};

export type ReportCaseDetailResponse = {
  report: ReportCase;
  events: ReportEvent[];
  availableResolutions: ReportResolution[];
  allowedTransitions: ReportCaseStatus[];
};

/** Creator 端案件（刻意不含檢舉人身分）。 */
export type CreatorCase = {
  id: string;
  material_id: string;
  material_title?: string | null;
  material_status?: string | null;
  status: ReportCaseStatus;
  resolution?: ReportResolution | null;
  resolution_note?: string | null;
  created_at?: string;
  updated_at?: string | null;
  latest_request_message?: string | null;
  latest_request_at?: string | null;
};

export type CreatorCasesResponse = {
  items: CreatorCase[];
  pagination: PaginationMeta;
  /** 待回覆案件的**全表**數量；側欄徽章讀這個，不要用 items.length。 */
  actionRequiredCount: number;
};

export type CreatorCaseDetailResponse = {
  case: CreatorCase;
  events: ReportEvent[];
  canRespond: boolean;
};

/** 付款憑證退件原因 code。文案對照在 lib/paymentProofReasons.ts。 */
export type PaymentRejectionReason =
  | "amount_mismatch"
  | "unreadable"
  | "payment_not_found"
  | "invalid_proof"
  | "other";

/** `GET /admin/payment-proofs` 的一列 —— 含判斷所需的訂單 context。 */
export type AdminPaymentProofRow = AdminPaymentProof & {
  buyer_email?: string | null;
  order_total_amount?: number | null;
  order_total_price?: number | null;
  order_discount_amount?: number | null;
  order_promo_code?: string | null;
  order_payment_mode?: string | null;
  order_created_at?: string | null;
  order_paid_at?: string | null;
  /** 衍生值（訂單建立 + PAYMENT_DUE_DAYS），不是資料庫欄位。 */
  order_payment_due_at?: string | null;
  order_proof_count?: number | null;
  reviewed_by_email?: string | null;
  rejection_reason?: PaymentRejectionReason | null;
};

export type AdminPaymentProofsListResponse = {
  items: AdminPaymentProofRow[];
  pagination: PaginationMeta;
  statusCounts: { total: number; pending: number; approved: number; rejected: number };
};

export type AdminPaymentProofDetailResponse = {
  proof: AdminPaymentProofRow;
  orderItems: OrderItemRow[];
  /**
   * 同一張訂單的其他憑證。買家在被退回後會重新上傳，
   * Admin 必須看得到上一次的退回理由才不會用同樣理由再退一次。
   */
  otherProofs: Array<{
    id: string;
    review_status: string;
    note?: string | null;
    rejection_reason?: PaymentRejectionReason | null;
    proof_url?: string | null;
    original_filename?: string | null;
    uploaded_at?: string | null;
    reviewed_at?: string | null;
  }>;
};

/** `materials.status` 的真實 allowlist —— 沒有 draft / rejected / needs_revision。 */
export type MaterialReviewStatus = "pending_review" | "published" | "unpublished";

export type AdminMaterialRow = Material & {
  creator_email?: string | null;
  /** 未結案（pending / investigating / awaiting_creator）的檢舉數。 */
  open_report_count?: number;
};

export type AdminMaterialsListResponse = {
  items: AdminMaterialRow[];
  pagination: PaginationMeta;
  /** 全表計數；Dashboard 的教材 KPI 讀這裡，不要抓一頁再 filter().length。 */
  statusCounts: { total: number } & Record<MaterialReviewStatus, number>;
};

export type ActivityLogRow = ActivityLog & {
  actor_email?: string | null;
  /** 目標的可讀名稱（教材標題 / 對象 email / 訂單編號）。 */
  target_label?: string | null;
  order_buyer_email?: string | null;
};

export type ActivityLogsListResponse = {
  items: ActivityLogRow[];
  pagination?: PaginationMeta;
};

export type ActivityLogFiltersResponse = {
  actions: Array<{ action: string; count: number }>;
  actorRoles: Array<{ actor_role: string; count: number }>;
};
