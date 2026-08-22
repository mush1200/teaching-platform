import type {
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
  reviewed: "已標記處理（舊版）",
};

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

export const MATERIAL_STATUS_LABEL: Record<MaterialReviewStatus, string> = {
  pending_review: "待審核",
  published: "已上架",
  unpublished: "已下架",
};

export const MATERIAL_STATUS_TONE: Record<MaterialReviewStatus, Tone> = {
  pending_review: "warning",
  published: "success",
  unpublished: "neutral",
};

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
 * `activity_logs.action` → 自然語言動作（Epic §8）。
 *
 * 這裡刻意只做**動詞片語**，主詞與受詞由 `describeActivity` 組合，
 * 這樣新增 action 時不必重寫整句。查無對照時回傳 `null`，
 * 呼叫端會退回顯示原始 action code —— 顯示原值比顯示錯的中文安全。
 */
const ACTION_PHRASE: Record<string, string> = {
  "payment_proof.approved": "核准了付款",
  "payment_proof.rejected": "退回了付款憑證",
  payment_proof_uploaded: "上傳了付款憑證",
  order_created: "建立了訂單",
  "material.published": "上架了教材",
  "material.unpublished": "下架了教材",
  "material.created": "建立了教材",
  material_created: "建立了教材",
  material_updated: "更新了教材",
  report_created: "檢舉了教材",
  report_reviewed: "標記檢舉為已處理",
  "report.investigation_started": "開始調查檢舉案件",
  "report.creator_response_requested": "要求創作者補充說明",
  "report.creator_responded": "回覆了平台案件",
  "report.resolved": "完成了檢舉案件的處置",
};

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

  const phrase = log.action ? ACTION_PHRASE[log.action] : undefined;
  const targetTypeLabel = log.target_type ? (TARGET_TYPE_LABEL[log.target_type] ?? log.target_type) : null;
  const targetName = log.target_label ?? log.target_id ?? null;
  const target = targetTypeLabel && targetName ? `${targetTypeLabel}：${targetName}` : null;

  if (!phrase) {
    return { sentence: `${actor} · ${log.action ?? "未知操作"}`, target, raw: true };
  }
  return { sentence: `${actor}${phrase}`, target, raw: false };
}
