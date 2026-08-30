import type {
  MaterialReviewReasonCode,
  MaterialReviewStatus,
  PaymentRejectionReason,
  ReportCaseStatus,
  ReportEventType,
  ReportResolution,
} from "./api-types";

/**
 * Admin / Creator 後台的 **文案對照表**。
 *
 * 每一組都由 Backend 的 code 驅動（`utils/reportWorkflow.js`、
 * `utils/paymentProofReview.js`、`services/adminMaterials.service.js`）。
 * 文案在這裡本地化，語意在 Backend 定義 —— 兩邊不會分歧。
 *
 * 角色文案遵循 `docs/ui-role-naming-checklist.md`：
 * `teacher` 顯示為「創作者」，`parent` / `buyer` 顯示為「購買者」，
 * 不出現英文 role 字面值。
 */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const REPORT_STATUS_LABEL: Record<ReportCaseStatus, string> = {
  pending: "待處理",
  investigating: "調查中",
  awaiting_creator: "等待創作者回覆",
  resolved: "已處理",
  dismissed: "已駁回",
  /*
   * Legacy 終態。刻意**不**叫「已處理」—— 它與 `resolved` 不是同一件事：
   * 沒有處置、沒有說明、沒有案件歷程，只是舊版有人按過「標記已處理」。
   * 讓兩者看起來一樣，就等於在畫面上宣稱一段不存在的處理紀錄。
   */
  reviewed: "舊版已處理",
};

/** 只存在於歷史資料的狀態；與 Backend `reportWorkflow.LEGACY_TERMINAL_STATUSES` 對齊。 */
export const LEGACY_REPORT_STATUSES: ReportCaseStatus[] = ["reviewed"];

export function isLegacyReportStatus(status?: string | null): boolean {
  return LEGACY_REPORT_STATUSES.includes(String(status ?? "") as ReportCaseStatus);
}

/** legacy 案件在詳情頁的說明。避免每個使用點各寫一句略有出入的文案。 */
export const LEGACY_REPORT_STATUS_HINT =
  "此案件使用舊版「標記已處理」流程結案，沒有新版案件的處置紀錄。";

export const REPORT_STATUS_TONE: Record<ReportCaseStatus, Tone> = {
  pending: "warning",
  investigating: "info",
  awaiting_creator: "info",
  resolved: "success",
  dismissed: "neutral",
  reviewed: "neutral",
};

export const REPORT_RESOLUTION_LABEL: Record<ReportResolution, string> = {
  dismissed: "檢舉不成立",
  warning: "對創作者發出警告",
  request_changes: "要求創作者修改教材",
  unpublish_material: "下架教材",
};

/** 處置的實際後果；選擇前要讓 Admin 看得到，尤其是唯一會改動平台資料的那一個。 */
export const REPORT_RESOLUTION_HINT: Record<ReportResolution, string> = {
  dismissed: "結案為不成立，不對創作者或教材採取任何動作。",
  warning: "留下警告紀錄並通知創作者；教材維持現狀。",
  request_changes: "留下要求修改的紀錄；教材維持現狀，需由創作者自行更新。",
  unpublish_material: "立即將教材下架（狀態改為已下架），買家將無法再購買。",
};

export const REPORT_EVENT_LABEL: Record<ReportEventType, string> = {
  status_changed: "狀態變更",
  admin_note: "內部筆記",
  creator_response_requested: "要求創作者補充說明",
  creator_response: "創作者回覆",
  resolution: "最終處置",
};

/**
 * 教材狀態的 Admin 文案。
 *
 * `changes_requested` 在 Admin 端讀作「等待創作者」而不是「需修改」——
 * 對 Admin 而言重點是「球不在我這裡」；「需修改」是**創作者端**的說法
 * （見 `lib/material-status.ts`）。同一個狀態、兩個視角、兩份文案。
 */
export const MATERIAL_STATUS_LABEL: Record<MaterialReviewStatus, string> = {
  pending_review: "待審核",
  published: "已上架",
  changes_requested: "等待創作者",
  unpublished: "已下架",
};

export const MATERIAL_STATUS_TONE: Record<MaterialReviewStatus, Tone> = {
  pending_review: "warning",
  published: "success",
  // 刻意用中性色：這不是 Admin 的待辦，不該和待審核搶注意力。
  changes_requested: "neutral",
  unpublished: "neutral",
};

/**
 * 退回原因代碼 → 文案。值域由 Backend `utils/materialWorkflow.js` 定義，
 * 這裡只做顯示；新增原因時兩邊都要改（後端是 canonical）。
 */
export const MATERIAL_REVIEW_REASON_LABEL: Record<MaterialReviewReasonCode, string> = {
  incomplete_info: "教材資訊不完整或不清楚",
  media_quality: "封面或圖片不符合要求",
  features_mismatch: "教材特色標註與內容不符",
  file_problem: "教材檔案有問題或無法使用",
  ip_concern: "內容或版權疑慮",
  other: "其他",
};

/** 選單順序。`other` 一律殿後。 */
export const MATERIAL_REVIEW_REASONS: MaterialReviewReasonCode[] = [
  "incomplete_info",
  "media_quality",
  "features_mismatch",
  "file_problem",
  "ip_concern",
  "other",
];

/** 與 Backend `REVIEW_NOTE_MIN_LENGTH` 一致；前端先擋是為了不送出必敗的請求。 */
export const MATERIAL_REVIEW_NOTE_MIN_LENGTH = 10;

export const PAYMENT_REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已退回",
};

export const PAYMENT_REVIEW_STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

/** 與 `Backend/utils/paymentProofReview.js` 的 `REJECTION_REASON_TEXT` 對齊。 */
export const PAYMENT_REJECTION_REASON_LABEL: Record<PaymentRejectionReason, string> = {
  amount_mismatch: "金額不符",
  unreadable: "無法辨識付款資訊",
  payment_not_found: "查無款項",
  invalid_proof: "憑證無效",
  other: "其他",
};

/** 選單順序；`other` 永遠在最後，因為它需要額外填寫說明。 */
export const PAYMENT_REJECTION_REASONS: PaymentRejectionReason[] = [
  "amount_mismatch",
  "unreadable",
  "payment_not_found",
  "invalid_proof",
  "other",
];

export const REASON_REQUIRING_NOTE: PaymentRejectionReason = "other";

/**
 * `activity_logs.actor_role` → 顯示文案。
 *
 * `parent` 是歷史列裡真實存在的值（role 遷移**不回填** activity_logs），
 * 顯示成「購買者」是文案層的轉換，不是資料改寫。
 */
export const ACTOR_ROLE_LABEL: Record<string, string> = {
  admin: "管理員",
  teacher: "創作者",
  buyer: "購買者",
  parent: "購買者",
};

export function actorRoleLabel(role?: string | null): string {
  if (!role) return "系統";
  return ACTOR_ROLE_LABEL[role] ?? role;
}

export const TARGET_TYPE_LABEL: Record<string, string> = {
  order: "訂單",
  material: "教材",
  report: "檢舉",
  user: "使用者",
};

/**
 * `activity_logs.action` 的**唯一** catalog（Epic §8）。
 *
 * 一個 action 只在這裡登記一次，同時提供：
 *   `phrase`  動詞片語 —— 組成清單那一句話（「管理員 admin@x 核准了付款」）
 *   `label`   名詞化短標籤 —— 篩選選單用（「核准付款」）
 *   `group`   篩選選單的分組
 *
 * 兩個顯示情境共用同一列資料，**不會**出現「清單看得懂、選單看不懂」這種
 * 兩份 mapping 各自漂移的狀況。查無對照時 UI 顯示「其他（原始 code）」，
 * 不裸露 code，也不編造中文。
 */
export type ActionGroup = "payment" | "order" | "material" | "download" | "cart" | "report" | "review" | "other";

export const ACTION_GROUP_LABEL: Record<ActionGroup, string> = {
  payment: "付款",
  order: "訂單",
  material: "教材",
  download: "下載",
  cart: "購物車",
  report: "檢舉",
  review: "教學回饋",
  other: "其他",
};

/** 選單分組的顯示順序（依 Admin 的處理頻率，不是字母序）。 */
export const ACTION_GROUP_ORDER: ActionGroup[] = [
  "payment",
  "order",
  "material",
  "report",
  "review",
  "download",
  "cart",
  "other",
];

type ActionMeta = { phrase: string; label: string; group: ActionGroup };

const ACTION_CATALOG: Record<string, ActionMeta> = {
  // 付款
  "payment_proof.approved": { phrase: "核准了付款", label: "核准付款", group: "payment" },
  "payment_proof.rejected": { phrase: "退回了付款憑證", label: "退回付款憑證", group: "payment" },
  payment_proof_uploaded: { phrase: "上傳了付款憑證", label: "上傳付款憑證", group: "payment" },

  // 訂單
  order_created: { phrase: "建立了訂單", label: "建立訂單", group: "order" },
  order_email_sent: { phrase: "寄出了訂單通知信", label: "訂單通知信寄出", group: "order" },
  order_email_failed: { phrase: "寄送訂單通知信失敗", label: "訂單通知信寄送失敗", group: "order" },

  // 教材
  "material.published": { phrase: "上架了教材", label: "上架教材", group: "material" },
  "material.unpublished": { phrase: "下架了教材", label: "下架教材", group: "material" },
  "material.created": { phrase: "建立了教材", label: "建立教材", group: "material" },
  material_created: { phrase: "建立了教材", label: "建立教材", group: "material" },
  material_updated: { phrase: "更新了教材", label: "更新教材", group: "material" },
  "material.changes_requested": { phrase: "退回了教材", label: "退回教材修改", group: "material" },
  "material.resubmitted": { phrase: "重新送審了教材", label: "重新送審教材", group: "material" },
  // 教材本體檔案（Material File Upload & Secure Delivery）。
  // 「上傳」與「核准為交付版本」是兩件事：前者是創作者交件，後者才決定買家拿到什麼。
  "material.file_uploaded": { phrase: "上傳了教材檔案", label: "上傳教材檔案", group: "material" },
  "material.file_approved": { phrase: "核准了教材檔案", label: "核准教材檔案", group: "material" },
  "admin.material_file_downloaded": {
    phrase: "下載了教材檔案進行審閱",
    label: "審閱下載教材檔案",
    group: "material",
  },

  // 檢舉
  report_created: { phrase: "檢舉了教材", label: "送出檢舉", group: "report" },
  report_reviewed: { phrase: "標記檢舉為已處理", label: "標記檢舉為已處理（舊版）", group: "report" },
  "report.investigation_started": { phrase: "開始調查檢舉案件", label: "開始調查檢舉", group: "report" },
  "report.creator_response_requested": { phrase: "要求創作者補充說明", label: "要求創作者說明", group: "report" },
  "report.creator_responded": { phrase: "回覆了平台案件", label: "創作者回覆案件", group: "report" },
  "report.resolved": { phrase: "完成了檢舉案件的處置", label: "檢舉結案處置", group: "report" },

  // 教學回饋
  review_created: { phrase: "留下了教學回饋", label: "留下教學回饋", group: "review" },

  // 下載
  "download.allowed": { phrase: "下載了教材", label: "下載教材", group: "download" },
  "download.attempted": { phrase: "嘗試下載教材", label: "嘗試下載教材", group: "download" },
  "download.denied": { phrase: "被拒絕下載教材", label: "下載遭拒", group: "download" },

  // 購物車
  "cart.added": { phrase: "把教材加入購物車", label: "加入購物車", group: "cart" },
  "cart.removed": { phrase: "把教材移出購物車", label: "移出購物車", group: "cart" },

  /*
   * 歷史寫法（點號版）。
   *
   * 現在的 Backend **不再寫入**這些值，但既有的 `activity_logs` 裡有 —— 而
   * 操作類型下拉是從「實際出現過的值」（`GET /admin/activity-logs/filters`）長出來的，
   * 少了對照就會在選單裡露出一排 code。稽核紀錄不回填，因此對照要補在顯示層。
   */
  "order.created": { phrase: "建立了訂單", label: "建立訂單（舊寫法）", group: "order" },
  "order.approved": { phrase: "核准了訂單", label: "核准訂單（舊寫法）", group: "order" },
  "order.rejected": { phrase: "退回了訂單", label: "退回訂單（舊寫法）", group: "order" },
  "order.proof_uploaded": { phrase: "上傳了付款憑證", label: "上傳付款憑證（舊寫法）", group: "payment" },
  "report.created": { phrase: "檢舉了教材", label: "送出檢舉（舊寫法）", group: "report" },
  "review.created": { phrase: "留下了教學回饋", label: "留下教學回饋（舊寫法）", group: "review" },
};

/**
 * 篩選選單用的短標籤。未登記的 action 顯示成「其他（原始 code）」——
 * 只給裸 code 等於把 DB 欄位丟到使用者臉上，只給「其他」又查不出是哪一種。
 */
export function actionLabel(action?: string | null): string {
  const code = String(action ?? "").trim();
  if (!code) return "未知操作";
  return ACTION_CATALOG[code]?.label ?? `其他（${code}）`;
}

/** 未登記的 action 一律歸入「其他」。 */
export function actionGroup(action?: string | null): ActionGroup {
  const code = String(action ?? "").trim();
  return ACTION_CATALOG[code]?.group ?? "other";
}

/**
 * 把 action 清單依 group 整理成選單分組（`<optgroup>` 用）。
 * 空的分組不會出現 —— 選單只反映**實際出現過**的 action（來自 filters API）。
 */
export function groupActions<T extends { action: string }>(
  rows: readonly T[]
): Array<{ group: ActionGroup; label: string; rows: T[] }> {
  const buckets = new Map<ActionGroup, T[]>();
  for (const row of rows) {
    const group = actionGroup(row.action);
    const bucket = buckets.get(group);
    if (bucket) bucket.push(row);
    else buckets.set(group, [row]);
  }
  return ACTION_GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    label: ACTION_GROUP_LABEL[group],
    rows: buckets.get(group) ?? [],
  }));
}

export type ActivityDescription = {
  /** 自然語言的一句話，例如「管理員 admin@x 核准了付款」。 */
  sentence: string;
  /** 目標的可讀描述，例如「訂單 #ord_123」；沒有目標時為 null。 */
  target: string | null;
  /** 沒有對照文案時為 true —— UI 可據此改用等寬字型顯示原始 code。 */
  raw: boolean;
};

/**
 * 把一筆活動紀錄描述成人看得懂的句子。
 *
 * 技術欄位（actor_id / target_id / meta）**不會**被丟掉，只是降級到詳細資訊區 ——
 * 稽核能力不減，只是不再是畫面上最顯眼的東西。
 */
export function describeActivity(log: {
  action?: string;
  actor_role?: string | null;
  actor_email?: string | null;
  actor_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_label?: string | null;
}): ActivityDescription {
  const actorName = log.actor_email ?? log.actor_id ?? null;
  const actor = actorName
    ? `${actorRoleLabel(log.actor_role)} ${actorName}`
    : actorRoleLabel(log.actor_role);

  const phrase = log.action ? ACTION_CATALOG[log.action]?.phrase : undefined;
  const targetTypeLabel = log.target_type ? (TARGET_TYPE_LABEL[log.target_type] ?? log.target_type) : null;
  const targetName = log.target_label ?? log.target_id ?? null;
  const target = targetTypeLabel && targetName ? `${targetTypeLabel}：${targetName}` : null;

  if (!phrase) {
    // catalog 沒有登記時同樣走「其他（原始 code）」，與篩選選單一致；
    // `raw` 仍為 true，UI 會改用等寬字型提示這是原始值。
    return { sentence: `${actor} · ${actionLabel(log.action)}`, target, raw: true };
  }
  return { sentence: `${actor}${phrase}`, target, raw: false };
}

/**
 * Admin operational order state → 文案。
 *
 * 值域的 canonical source 是 Backend `services/adminOrders.service.js` 的
 * `OPERATIONAL_STATUSES`；UI 篩選值 = API `?status=` token = 這裡的 key，三者 1:1。
 *
 * 這份 mapping 原本是 `app/admin/orders/page.tsx` 內的 local function。Dashboard 的
 * 「需要注意的訂單」要顯示同一組徽章，若在那裡再寫一次 `if/else`，同一個
 * operational state 就會有兩份文案，遲早漂移（這正是 `orders.status` 與
 * `operational_status` 曾經分歧的成因）。搬到這裡之後只有一份。
 *
 * **文案與語意都沿用原本的版本，一個字都沒改。**
 * Admin 用「已核准」而非「已完成」：人工轉帳流程裡 admin 只核准了憑證，
 * 「完成」是買家視角的用語（buyer `/orders` 維持「已完成」）。
 */
export const ADMIN_ORDER_OPERATIONAL_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "待付款",
  pending_review: "待審核",
  payment_rejected: "付款被退回",
  approved: "已核准",
  cancelled: "已取消",
};

/**
 * 同一組狀態的 `StatusPill` tone。
 *
 * Orders 清單頁目前是純文字、沒有徽章，因此這份 tone **不改變任何既有畫面**；
 * 它只服務 Dashboard 的「需要注意的訂單」。分組沿用 `RecentOrdersTable` 原本對
 * `orders.status` 的著色意圖：核准為 success、取消為中性、待付款為 warning，
 * 被退回是唯一的 danger —— 那是這張訂單真正卡住的地方。
 */
export const ADMIN_ORDER_OPERATIONAL_STATUS_TONE: Record<string, Tone> = {
  awaiting_payment: "warning",
  pending_review: "warning",
  payment_rejected: "danger",
  approved: "success",
  cancelled: "neutral",
};

/**
 * 列徽章一律讀 Backend 的 `operational_status`，不自行判讀 `orders.status`。
 * Backend 永遠回五個值之一；真的落到 fallback 代表 API 契約壞了，
 * 顯示原值比顯示錯的中文安全。
 */
export function adminOrderOperationalStatusLabel(status?: string | null): string {
  if (!status) return "－";
  return ADMIN_ORDER_OPERATIONAL_STATUS_LABEL[status] ?? status;
}

export function adminOrderOperationalStatusTone(status?: string | null): Tone {
  return ADMIN_ORDER_OPERATIONAL_STATUS_TONE[String(status ?? "")] ?? "neutral";
}

/**
 * Dashboard「需要注意的訂單」的挑選條件（IA-04）。
 *
 * **完全由 Backend 既有的 `operational_status` 定義，不新增任何 SLA 或衍生狀態。**
 * 這兩個值就是 IA §4 表格列出的「待審核／被退回」；「逾期」不在其中 ——
 * 平台沒有 canonical 的逾期定義，自己發明一個等於在 Dashboard 上造出
 * 一份沒人維護的 business rule。
 *
 * 為什麼是這兩個：`awaiting_payment` 的球在買家、`approved` 已結束、
 * `cancelled` 是 legacy 唯讀列 —— 三者都不需要 Admin 現在做任何事。
 *
 * 順序即顯示與查詢順序，不是隨意排列：被退回的訂單卡得比待審核更久。
 */
export const ATTENTION_ORDER_STATUSES = ["payment_rejected", "pending_review"] as const;

/**
 * Dashboard「需要注意的活動」的 action allowlist（IA-05）。
 *
 * ## 挑選標準（新增項目前請先對照）
 *
 * 一個 action 要進這份清單，必須**同時**滿足：
 *
 *   1. 它代表**異常**（有人被擋住、東西沒送到、商品被移除），不是平台正常運轉；
 *   2. 它**不會**被「目前待處理」三張卡的任何一個計數涵蓋。
 *
 * 第 2 條是這份清單真正的價值所在。待辦計數已經回答「有幾件事等我做」
 * （IA §4.1），所以 `payment_proof_uploaded`、`report_created`、
 * `material.resubmitted` 這類「進佇列」事件放進來只是把同一件事講兩次。
 * Dashboard 缺的是**不會進任何佇列、但確實出事了**的訊號。
 *
 * ## 因此刻意排除
 *
 * 高頻常態流量（`cart.*`、`download.allowed`、`order_created`、`review_created`、
 * `material.created` / `material_updated`）、已被待辦卡計數的進佇列事件，
 * 以及 `payment_proof.approved` / `material.published` / `report.resolved`
 * 這類「事情順利結束了」的終態。
 *
 * 每一個值都必須是 `ACTION_CATALOG` 已登記的 code —— 沒登記就沒有中文句子可用，
 * `describeActivity()` 會退回「其他（原始 code）」，等於把 raw code 放回第一層。
 */
export const ATTENTION_ACTIVITY_ACTIONS = [
  /** 付款憑證被退回：訂單就此卡住，且**不計入**任何待辦卡（球在買家手上）。 */
  "payment_proof.rejected",
  /** 同上的歷史寫法。稽核紀錄不回填，因此對照要補在顯示層。 */
  "order.rejected",
  /** 買家付了錢卻拿不到檔案 —— 授權或檔案出了問題，沒有任何佇列會顯示它。 */
  "download.denied",
  /** 訂單通知信沒寄出去：買家不知道下一步，客訴通常從這裡開始。 */
  "order_email_failed",
  /** 教材被下架（目前唯一來源是檢舉處置）：已售商品的可見性被移除，屬終態但影響大。 */
  "material.unpublished",
] as const;

/** 送給 `GET /admin/activity-logs?action=` 的多值參數（Backend 接受逗號分隔）。 */
export const ATTENTION_ACTIVITY_ACTION_QUERY = ATTENTION_ACTIVITY_ACTIONS.join(",");

/**
 * 一筆活動 → 可導航的目的地（IA-05 的「可導航」）。
 *
 * 目的地一律是**既有**的 operational / investigation surface，Dashboard 不長出
 * 自己的詳情頁，也不複製任何 workflow：
 *
 *   material / order / user → 該對象的活動紀錄（IA §6：entity-centric 才是主入口）
 *   report                  → 檢舉案件的正式入口 `/admin/reports`（IA §9：唯一 source of truth）
 *
 * 沒有 `target_id` 時回 `null`，該列就只是純文字 —— 寧可不可點，也不要給一條
 * 會落在 404 或空白頁的連結。
 */
export function activityTargetHref(log: {
  target_type?: string | null;
  target_id?: string | null;
}): string | null {
  const id = log.target_id ? String(log.target_id) : "";
  if (!id) return null;
  const encoded = encodeURIComponent(id);
  switch (log.target_type) {
    case "material":
      return `/admin/materials/${encoded}/activity-logs`;
    case "order":
      return `/admin/orders/${encoded}/activity-logs`;
    case "user":
      return `/admin/users/${encoded}/activity-logs`;
    /* 檢舉沒有 entity 活動紀錄路由；案件本身的正式入口是 `/admin/reports?case=`。 */
    case "report":
      return `/admin/reports?status=all&case=${encoded}`;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------- *
 * activity_logs.meta 的人話化（IA-02）
 * ------------------------------------------------------------------------- */

/** 一列人話化後的 meta。`key` 只用來當 React key 與測試定位，不顯示。 */
export type ActivityMetaItem = { key: string; label: string; value: string };

export type ActivityMetaDescription = {
  /** 第二層：已登記且能安全轉成人話的欄位。 */
  items: ActivityMetaItem[];
  /** 未登記（或值的型別不如預期）的 key —— **不丟棄**，由第三層 raw 區負責。 */
  unknownKeys: string[];
  /** `meta` 是否有任何內容；為 false 時第三層不必渲染 meta 區塊。 */
  hasRaw: boolean;
};

/** 一個 meta 欄位的顯示規則。回 `null` 代表「這個值我看不懂」→ 退回 raw 區。 */
type MetaEntry = { label: string; format: (value: unknown) => string | null };

const EMPTY_META: ActivityMetaDescription = { items: [], unknownKeys: [], hasRaw: false };

function metaText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function metaBool(yes: string, no: string) {
  return (value: unknown) => (typeof value === "boolean" ? (value ? yes : no) : null);
}

function metaCount(suffix: string) {
  return (value: unknown) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? `${n}${suffix}` : null;
  };
}

/** 對照表查表；查不到就當成看不懂（回 null），**不要**把 code 當中文丟出去。 */
function metaLookup(table: Record<string, string>) {
  return (value: unknown) => {
    const code = typeof value === "string" ? value : "";
    return code && table[code] ? table[code] : null;
  };
}

function metaMoney(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
}

function metaFileSize(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** `download.denied` 的 `reason`；值域是 `services/materialFile.service.js` 的失敗碼。 */
const DOWNLOAD_DENY_REASON_LABEL: Record<string, string> = {
  not_entitled: "沒有已核准的訂單（尚未購買，或訂單未通過審核）",
  material_file_unavailable: "教材目前沒有可交付的檔案",
};

/** `order_email_*` 的 `type`；值域是 `services/emailService.js` 的 `metaType`。 */
const ORDER_EMAIL_TYPE_LABEL: Record<string, string> = {
  order_created: "訂單成立通知",
  proof_uploaded: "付款憑證已送出",
  payment_approved: "付款審核通過",
  payment_rejected: "付款審核未通過",
  material_published: "教材已上架通知",
  material_changes_requested: "教材需修改通知",
};

/** 教材檔案的 slot；值域是 `Backend/routes/admin.js` 的 `?slot=`。 */
const MATERIAL_FILE_SLOT_LABEL: Record<string, string> = {
  pending: "待審版本",
  approved: "交付版本",
};

/**
 * 跨 action 語意唯一的 meta key。
 *
 * **只登記語意欄位**（金額、品項數、收件者、原因、檔名、狀態），不登記內部識別碼 ——
 * `proofId` / `fileId` / `cartItemId` / `reviewedBy` 這類 id 對 Admin 沒有可讀語意，
 * 它們屬於 IA §6 的第三層。不登記**不等於**丟棄：它們會出現在 `unknownKeys`，
 * 而第三層仍原樣顯示完整 JSON。
 */
const META_KEY_CATALOG: Record<string, MetaEntry> = {
  rejectionReason: { label: "退回原因", format: metaLookup(PAYMENT_REJECTION_REASON_LABEL) },
  reasonCode: { label: "退回原因", format: metaLookup(MATERIAL_REVIEW_REASON_LABEL) },
  previousReviewReasonCode: {
    label: "上次退回原因",
    format: metaLookup(MATERIAL_REVIEW_REASON_LABEL),
  },
  note: { label: "說明", format: metaText },
  originalFilename: { label: "檔案名稱", format: metaText },
  sizeBytes: { label: "檔案大小", format: metaFileSize },
  mimeType: { label: "檔案類型", format: metaText },
  slot: { label: "檔案版本", format: metaLookup(MATERIAL_FILE_SLOT_LABEL) },
  materialStatus: { label: "教材當時狀態", format: metaLookup(MATERIAL_STATUS_LABEL) },
  replacement: { label: "是否為換檔", format: metaBool("是（替換既有檔案）", "否") },
  firstPublish: { label: "是否首次上架", format: metaBool("是", "否（重新上架）") },
  total_amount: { label: "訂單金額", format: metaMoney },
  order_item_count: { label: "品項數", format: metaCount(" 項") },
  quantity: { label: "數量", format: metaCount("") },
  rating: { label: "評分", format: metaCount(" 星") },
  uploadedCount: { label: "本次上傳張數", format: metaCount(" 張") },
  totalProofCountAfterUpload: { label: "上傳後憑證張數", format: metaCount(" 張") },
  resolution: { label: "最終處置", format: metaLookup(REPORT_RESOLUTION_LABEL) },
  materialUnpublished: {
    label: "教材是否被下架",
    format: metaBool("是", "否（教材原本就不是已上架）"),
  },
  orderId: { label: "訂單編號", format: metaText },
  reportId: { label: "來源檢舉案件", format: metaText },
  error: { label: "錯誤訊息", format: metaText },
};

/**
 * 同名但**語意依 action 而異**的 key。
 *
 * 這些 key 不能放進上面的全域表：
 *   `reason` —— `download.denied` 是失敗碼，`report_created` 是檢舉人自由輸入的文字
 *   `to`     —— `order_email_*` 是收件者 email，`report.*` 是狀態轉移的目標
 *   `status` —— `material.created` 是教材狀態，`report_reviewed` 是案件狀態
 *   `type`   —— 只有 `order_email_*` 用它，指信件種類
 *
 * 查不到對應 action 時**維持未登記**（落到 raw 區）。猜一個語意出來，
 * 等於在稽核畫面上顯示一句後端沒有說過的話。
 */
const META_ACTION_OVERRIDES: Record<string, Record<string, MetaEntry>> = {
  "download.denied": {
    reason: { label: "拒絕原因", format: metaLookup(DOWNLOAD_DENY_REASON_LABEL) },
  },
  report_created: { reason: { label: "檢舉理由", format: metaText } },
  "report.created": { reason: { label: "檢舉理由", format: metaText } },
  order_email_sent: {
    to: { label: "收件者", format: metaText },
    type: { label: "信件類型", format: metaLookup(ORDER_EMAIL_TYPE_LABEL) },
  },
  order_email_failed: {
    to: { label: "收件者", format: metaText },
    type: { label: "信件類型", format: metaLookup(ORDER_EMAIL_TYPE_LABEL) },
  },
  "material.created": { status: { label: "教材狀態", format: metaLookup(MATERIAL_STATUS_LABEL) } },
  material_created: { status: { label: "教材狀態", format: metaLookup(MATERIAL_STATUS_LABEL) } },
  report_reviewed: { status: { label: "案件狀態", format: metaLookup(REPORT_STATUS_LABEL) } },
};

/** 寫入 `{ from, to }` 案件狀態轉移的 action（`services/reportAdmin.service.js` 的 `runTransition`）。 */
const REPORT_TRANSITION_ACTIONS = new Set([
  "report.investigation_started",
  "report.creator_response_requested",
  "report.creator_responded",
  "report.resolved",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 把 `activity_logs.meta` 描述成人看得懂的欄位（IA-02；IA §6 的第二層）。
 *
 * ## 為什麼吃整筆 log 而不是只吃 `meta`
 *
 * 同一個 key 在不同 action 下是不同的東西 —— `to` 可能是收件者 email，也可能是
 * 案件狀態；`reason` 可能是下載失敗碼，也可能是檢舉人打的字。只看 `meta` 無從分辨，
 * 而分辨錯的後果是**在稽核畫面上顯示一件沒有發生的事**。因此判讀一律以 action 為準。
 *
 * ## 契約
 *
 *   - 已登記且值可安全轉換 → `items`（第二層）
 *   - 未登記、或值的型別不如預期 → `unknownKeys`（第三層 raw 區，**不丟棄**）
 *   - `meta` 為 null / undefined / `{}` → 全空，`hasRaw = false`
 *   - `meta` 不是物件（契約壞掉）→ 不解讀，`hasRaw = true`，交給 raw 區原樣顯示
 *
 * 這裡**不做任何推論**：只翻譯後端寫下的欄位，不從中推導後端沒說過的結論。
 * 也**不改寫 audit event schema** —— 純顯示層，`meta` 本身原封不動。
 */
export function describeActivityMeta(log: {
  action?: string | null;
  meta?: unknown;
}): ActivityMetaDescription {
  const meta = log.meta;
  if (meta == null) return EMPTY_META;
  if (!isPlainObject(meta)) return { items: [], unknownKeys: [], hasRaw: true };

  const keys = Object.keys(meta);
  if (keys.length === 0) return EMPTY_META;

  const action = String(log.action ?? "").trim();
  const overrides = META_ACTION_OVERRIDES[action] ?? {};
  const items: ActivityMetaItem[] = [];
  const unknownKeys: string[] = [];
  const consumed = new Set<string>();

  /** 狀態轉移：兩個 key 合成一列「A → B」，比拆成兩列更接近 Admin 心裡的問題。 */
  const addTransition = (
    fromKey: string,
    toKey: string,
    label: string,
    table: Record<string, string>
  ) => {
    if (!(fromKey in meta) && !(toKey in meta)) return;
    const from = metaLookup(table)(meta[fromKey]);
    const to = metaLookup(table)(meta[toKey]);
    // 兩端都看得懂才組句；只認得一端時整組退回 raw，不顯示「? → 已上架」。
    if (from && to) {
      items.push({ key: `${fromKey}->${toKey}`, label, value: `${from} → ${to}` });
      consumed.add(fromKey);
      consumed.add(toKey);
    }
  };

  addTransition("oldStatus", "newStatus", "狀態變更", MATERIAL_STATUS_LABEL);
  if (REPORT_TRANSITION_ACTIONS.has(action)) {
    addTransition("from", "to", "案件狀態變更", REPORT_STATUS_LABEL);
  }

  for (const key of keys) {
    if (consumed.has(key)) continue;
    const entry = overrides[key] ?? META_KEY_CATALOG[key];
    const value = entry ? entry.format(meta[key]) : null;
    if (entry && value) items.push({ key, label: entry.label, value });
    else unknownKeys.push(key);
  }

  return { items, unknownKeys, hasRaw: true };
}
