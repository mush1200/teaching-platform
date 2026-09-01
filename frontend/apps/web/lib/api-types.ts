/** Aligned with Backend/swagger.js components.schemas */

/** Keep `teacher` for backend compatibility; prefer `creator` in UI naming. */
export type UserRole = "parent" | "teacher" | "creator" | "admin";

/** 見 `lib/material-file.ts`；型別在此重述，讓 API 契約集中在一處可讀。 */
export type MaterialFileInfo = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status?: string;
  uploadedAt?: string | null;
  approvedAt?: string | null;
};

export type MaterialFileSummary = {
  approvedFile: MaterialFileInfo | null;
  pendingFile: MaterialFileInfo | null;
};

export type Material = {
  id: string;
  title: string;
  description?: string;
  price: number;
  category?: string;
  age_range?: string;
  teacher_id?: string;
  status?: string;
  /**
   * LEGACY placeholder。教材本體的 canonical 來源是 `material_file`；
   * 這個欄位**已不在任何公開 / 買家 API 回應中**，新建教材也不再寫入。
   * 型別保留只為了讀取 milestone 之前建立的舊資料。
   */
  file_key?: string;
  /**
   * 教材本體檔案。**只有 Admin 與教材擁有者**拿得到（公開讀取不含此欄位）。
   * `pendingFile` 是待審候選檔，買家永遠取不到；`approvedFile` 才是實際交付的版本。
   */
  material_file?: MaterialFileSummary | null;
  teaching_objective?: string;
  teaching_methods?: string[];
  usage_duration?: string;
  activity_steps?: string;
  extension_value?: string;
  short_description?: string;
  material_features?: string[];
  cover_image_url?: string;
  /** 評分彙總（清單 API 提供；與 `GET /materials/:id/rating` 同源）。 */
  average_rating?: number | null;
  review_count?: number | null;
  demo_video_url?: string;
  detail_images?: MaterialImage[];
  contents?: MaterialContent[];
  created_at?: string;
  updated_at?: string;
  ip_declaration_accepted?: boolean;
  ip_declaration_at?: string | null;
  /**
   * 最近一次審核決定的快照。Admin 與**教材擁有者**讀得到；
   * 一般公開讀者只會拿到 published 教材，且回應不含這些欄位。
   */
  review_reason_code?: MaterialReviewReasonCode | null;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
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
  /**
   * 付款期限（`orders.created_at` + 7 個日曆日的末日終了）。
   *
   * **實體欄位，不是前端推算** —— 期限是對買家揭露過的承諾（消保法 §18 I(2)），
   * 政策日後調整時既有訂單必須維持當初的期限。
   * **legacy 訂單為 `null`：它們從未被揭露過期限，UI 必須誠實顯示「未設定」，
   * 絕不可在前端自行補算。**
   */
  payment_due_at?: string | null;
  /**
   * **買家現在是否還能提交付款憑證** —— backend canonical 判準（Wave 2 #12）。
   *
   * 前端**不得**自行用日期判斷。特別是逾期但曾在期限內提交過的訂單仍為 `true`
   * （退件後可重傳）—— 純看日期會把它誤判成不可提交，與 backend enforcement 分家。
   */
  payment_submission_allowed?: boolean;
  /** 付款期限是否已過。legacy（無期限）一律 `false`。**與能否提交是兩件事。** */
  payment_deadline_expired?: boolean;
  /** 平台何時被告知買家已付款（人工核帳期限的起算點）。 */
  payment_info_submitted_at?: string | null;
  /** 人工核帳期限（`payment_info_submitted_at` + 3 個日曆日的末日終了）。 */
  review_due_at?: string | null;
  /** Uploaded proofs awaiting admin review (manual_payment_proofs.review_status = pending) */
  payment_proof_pending_review_count?: number;
  payment_proof_uploaded_count?: number;
  payment_proof_latest_status?: "pending" | "approved" | "rejected" | string | null;
  payment_proof_latest_uploaded_at?: string | null;
  payment_proof_latest_reviewed_at?: string | null;
  payment_proof_rejected_note?: string | null;
  /**
   * 結構化的退件原因代碼（`amount_mismatch` 等）。Backend 早就回傳它，
   * 但買家端先前完全沒有渲染 —— 而 Admin 的退件表單寫的是「退回原因（必選，購買者會看到）」。
   * 對照表：`PAYMENT_REJECTION_REASON_LABEL`。
   */
  payment_proof_rejected_reason?: string | null;
  /**
   * Buyer 視角的訂單進度（僅 `/me/orders` 與 `/me/orders/:orderId` 回傳）。
   * 由 Backend 衍生，**不是** DB column（`Backend/services/buyerOrders.service.js`）。
   *
   * 語意：**最新一筆付款憑證**走到哪一步，而不是歷史上曾出現過哪些憑證。
   * 因此「舊憑證被退回 → 買家重新上傳」時，這裡是 `reviewing` 而不是 `rejected`。
   * 已核准的訂單永遠是 `approved`，不會因為 supersede 出來的 rejected 憑證倒退。
   *
   * 進度文案、CTA、timeline 一律讀這個欄位，**不要**再自行從 `status` 或
   * `payment_proof_latest_status` 推導一次。
   */
  order_progress_state?: "pending" | "proof_uploaded" | "reviewing" | "approved" | "rejected" | "cancelled" | string;
  /**
   * Admin operational state（僅 `GET /admin/orders` 回傳）。
   * 由 `orders.status` + `manual_payment_proofs.review_status` 在 Backend 衍生，
   * 是 Admin 篩選與列徽章的 canonical 依據 —— 不要改用 `status` 自行判讀。
   *
   * 與 buyer 的 `order_progress_state` 刻意分開：那是買家視角的進度
   * （待付款／審核中／審核未通過），這是 admin 視角的處理佇列。
   */
  operational_status?: "awaiting_payment" | "pending_review" | "payment_rejected" | "approved" | "cancelled" | string;
  /**
   * 訂單擁有者的 Email（僅 `GET /admin/orders` 回傳，`IA-06`）。
   *
   * 它同時是 `?q=` 的搜尋面之一 —— 客訴進來時 Admin 手上就是一個 Email 或一組訂單編號。
   * 搜尋得到卻看不到，Admin 無從確認自己找對了人，所以它必須是列上顯示的欄位而不只是索引。
   */
  buyer_email?: string | null;
};

export type OrdersListResponse = {
  items: Order[];
  /** `GET /admin/orders` 自 `IA-06` 起分頁；買家端的 `/me/orders` 不帶這個欄位。 */
  pagination?: PaginationMeta;
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

/**
 * `GET /download/:materialId` 的授權回應。
 *
 * `signedUrl` 是一張**一次性下載票**（短命、單次、綁定使用者），而不是檔案的位址 ——
 * 它直接指向 Backend 而非 `/api/backend` proxy，因為瀏覽器的下載導航帶不了
 * `Authorization` header。
 */
export type DownloadLinkResponse = {
  materialId: string;
  signedUrl: string;
  expiresInSeconds?: number;
  /** 原始檔名（給 UI 顯示；實際存檔名由 Content-Disposition 決定）。 */
  filename?: string;
  sizeBytes?: number;
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
  /**
   * 憑證影像的**受保護**讀取路徑（`/orders/:orderId/payment-proofs/:proofId/file`）。
   *
   * 取代了舊契約的 `proof_url` —— 那是一條指向 Backend `/uploads/payment-proofs/`
   * 的公開網址，任何拿到它的人都能看到別人的匯款畫面。現在讀取仍需 Admin 或
   * 訂單擁有者身分，因此必須用 `apiFetch` 帶 `Authorization` 取回位元組
   * （見 `lib/payment-proof.ts`），不能直接放進 `<img src>`。
   */
  proof_file_path?: string;
  /** 有沒有可顯示的影像。legacy 未搬移／檔案遺失的憑證是 false。 */
  proof_file_available?: boolean;
  proof_storage_status?: "private" | "legacy_public" | "legacy_external" | "legacy_missing" | string | null;
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
  /**
   * @deprecated 字面上的 `reports.status = 'pending'`（新進、尚未有人接手）。
   * Dashboard 待辦卡請用 `actionableReportsCount` —— 待辦的定義是「球在 Admin 手上」，
   * 不是「案件還沒結束」。
   */
  pendingReportsCount: number;
  /**
   * 現在需要 Admin 執行下一步的檢舉數（`pending` + `investigating`）。
   * canonical 定義在 Backend `utils/reportWorkflow.js` 的 `ADMIN_ACTIONABLE_REPORT_STATUSES`；
   * `awaiting_creator` 不計（球在創作者手上）。
   */
  actionableReportsCount: number;
  /**
   * 已逾消保法 §43 II 十五日期限、**且仍需處理**的申訴數（`P1-09` Gate 3 / Wave 2 #11）。
   *
   * **backend canonical truth** —— 判準是 `consumerComplaint.service.js` 的 `OVERDUE_SQL`，
   * 與 `/admin/complaints?overdue=1` 回傳的集合必定一致。
   * `resolved` / `closed` 已排除：已處理完的案件不是待辦告警。
   *
   * **前端不得用 `Date.now() > statutoryDueAt` 自行重算** —— 那會產生第二套 SLA。
   */
  overdueComplaintsCount: number;
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
 * 檢舉案件狀態。
 *
 * `reviewed` 是 **legacy terminal**（舊的「標記已讀」）：仍會出現在既有資料中，
 * 但**不是**任何合法轉移的目標，正式產品 UI 也不再產生新的。
 * UI 一律顯示成「舊版已處理」而不是「已處理」—— 它沒有處置紀錄。
 * 見 `Backend/utils/reportWorkflow.js` 與 `docs/admin-information-architecture.md` §9.1。
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
  /** 付款期限。2026-08-26 起為 `orders.payment_due_at` **實體欄位**；legacy 為 null。 */
  order_payment_due_at?: string | null;
  /** 人工核帳期限（實體欄位）。legacy 為 null。 */
  order_review_due_at?: string | null;
  /** 付款期限是否已過（legacy 一律 false）。 */
  order_payment_deadline_expired?: boolean;
  /**
   * 買家現在是否還能提交付款憑證 —— **backend canonical 判準**（Wave 2 #12）。
   * Admin 需要知道這件事，否則會叫買家重傳而 backend 拒絕。
   */
  order_payment_submission_allowed?: boolean;
  /** 人工核帳是否已逾時。核准後為 false；legacy（無期限）亦為 false。 */
  review_overdue?: boolean;
  /** 平台何時被告知買家已付款（人工審核時鐘的起算點）。 */
  order_payment_info_submitted_at?: string | null;
  /** 平台在銀行帳戶**實際觀察到**的入帳時間。由 Admin 明確填寫；不知道就是 null。 */
  order_payment_received_at?: string | null;
  /*
   * **買家申報值 —— 不是平台查證的事實。**
   * `reported_transfer_at` ≠ `order_payment_received_at`；
   * `reported_amount` ≠ 平台已確認的入帳金額。UI 必須照此標示。
   */
  reported_bank_name?: string | null;
  reported_account_last4?: string | null;
  reported_amount?: number | null;
  reported_transfer_at?: string | null;
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
    order_id?: string;
    review_status: string;
    note?: string | null;
    rejection_reason?: PaymentRejectionReason | null;
    proof_file_path?: string;
    proof_file_available?: boolean;
    original_filename?: string | null;
    uploaded_at?: string | null;
    reviewed_at?: string | null;
  }>;
};

/** `materials.status` 的真實 allowlist —— 沒有 draft / rejected / needs_revision。 */
/**
 * 教材狀態。與 Backend 的 `utils/materialWorkflow.js` 與 DB 的 `materials_status_check`
 * 一致（見 docs/material-review-workflow.md）。
 *
 * `changes_requested`（需修改）與 `unpublished`（已下架）刻意分開：
 * 前者從未公開過、球在創作者手上；後者曾經上架、由檢舉處置下架。
 */
export type MaterialReviewStatus =
  | "pending_review"
  | "published"
  | "changes_requested"
  | "unpublished";

/** 退回原因代碼。值域由 Backend `utils/materialWorkflow.js` 定義。 */
export type MaterialReviewReasonCode =
  | "incomplete_info"
  | "media_quality"
  | "features_mismatch"
  | "file_problem"
  | "ip_concern"
  | "other";

/**
 * 最近一次審核決定的快照（**不是**完整歷史）。
 * 完整歷史在 `activity_logs`：`GET /admin/materials/:id/activity-logs`。
 */
export type MaterialReviewSnapshot = {
  review_reason_code?: MaterialReviewReasonCode | null;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  /** **首次**成功公開的時間；之後的重新公開時間由 `material.published` 事件保存。 */
  published_at?: string | null;
};

/** 審核端點的回應：`POST /admin/materials/:id/approve`、`/request-changes`、`POST /materials/:id/resubmit`。 */
export type MaterialReviewActionResponse = {
  material: Material;
  /** approve 專用：這一次是否為首次公開。 */
  firstPublish?: boolean;
};

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

/* -------------------------------------------------------------------------- */
/* 消費申訴（P1-09 Gate 3）                                                    */
/* -------------------------------------------------------------------------- */
/*
 * 形狀直接對應 Backend `services/consumerComplaint.service.js` 的回傳。
 * `overdue` / `daysUntilDue` 是 backend 由 `statutory_due_at` 衍生的欄位
 * （`utils/complaintSla.js`）—— **前端不得自行計算法定期限**。
 */

export type ComplaintRow = {
  id: string;
  buyer_id: string;
  order_id?: string | null;
  order_item_id?: string | null;
  complaint_type: string;
  subject: string;
  statement: string;
  status: string;
  submitted_at?: string | null;
  review_started_at?: string | null;
  responded_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  /** 消保法 §43 II 的法定處理期限。由 backend 計算並持久化。 */
  statutory_due_at?: string | null;
  assigned_to?: string | null;
  reviewed_by?: string | null;
  resolution_summary?: string | null;
  related_remedy_case_id?: string | null;
  created_at?: string | null;
  /** backend 衍生：未結案且已過法定期限。**前端不得自行推算。** */
  overdue?: boolean;
  /** backend 衍生：距離法定末日的台灣日曆日數（負數 = 已逾期）。 */
  daysUntilDue?: number | null;
};

export type ComplaintEvent = {
  id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  event_type: string;
  message?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
};

/** 證據 metadata。**永遠不含 `storage_key` 與 `checksum_sha256`。** */
export type ComplaintEvidence = {
  id: string;
  complaint_id: string;
  uploaded_by: string;
  original_filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  external_reference?: string | null;
  note?: string | null;
  created_at?: string | null;
  has_file?: boolean;
};

export type ComplaintListResponse = { items: ComplaintRow[] };
export type ComplaintDetailResponse = {
  complaint: ComplaintRow;
  events: ComplaintEvent[];
  evidence: ComplaintEvidence[];
};
