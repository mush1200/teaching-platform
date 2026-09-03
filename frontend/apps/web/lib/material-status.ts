import type { MaterialReviewStatus } from "./api-types";

/**
 * 教材狀態的**創作者視角**文案。
 *
 * 與 `lib/admin-labels.ts` 的 `MATERIAL_STATUS_LABEL` 是同一組狀態、不同視角：
 *
 *   狀態                Admin 看到      Creator 看到
 *   pending_review      待審核          審核中
 *   changes_requested   等待創作者      需修改      ← 球在誰手上，兩邊的說法本來就不同
 *   published           已上架          已上架
 *   unpublished         已下架          已下架
 *
 * **沒有 `draft`。** 資料庫沒有這個值（`materials_status_check` 只有四個），
 * 舊版 Creator UI 的「草稿」篩選與統計卡是一個永遠為 0 的幽靈選項，已移除。
 * 要做草稿需要 schema 決策，不在本輪範圍。
 */
export const CREATOR_MATERIAL_STATUS_LABEL: Record<MaterialReviewStatus, string> = {
  pending_review: "審核中",
  changes_requested: "需修改",
  published: "已上架",
  unpublished: "已下架",
};

export type CreatorStatusTone = "info" | "success" | "warning" | "error";

export const CREATOR_MATERIAL_STATUS_TONE: Record<MaterialReviewStatus, CreatorStatusTone> = {
  pending_review: "info",
  // 需修改是**創作者要行動**的狀態，用 warning 讓它在清單中跳出來。
  changes_requested: "warning",
  published: "success",
  unpublished: "error",
};

/** 選單／篩選順序：先看要動作的，再看等待中，最後是歷史。 */
export const CREATOR_MATERIAL_STATUSES: MaterialReviewStatus[] = [
  "changes_requested",
  "pending_review",
  "published",
  "unpublished",
];

export function creatorStatusLabel(status?: string | null): string {
  const key = String(status ?? "") as MaterialReviewStatus;
  return CREATOR_MATERIAL_STATUS_LABEL[key] ?? String(status ?? "—");
}

export function creatorStatusTone(status?: string | null): CreatorStatusTone {
  const key = String(status ?? "") as MaterialReviewStatus;
  return CREATOR_MATERIAL_STATUS_TONE[key] ?? "info";
}

/**
 * 這個狀態能不能由創作者重新送審。
 * 與 Backend `utils/materialWorkflow.js` 的 `RESUBMITTABLE_STATUSES` 一致 ——
 * 前端只負責決定要不要顯示按鈕，真正的邊界在後端。
 */
export function canResubmit(status?: string | null): boolean {
  return status === "changes_requested" || status === "unpublished";
}

/**
 * 這個狀態能不能由創作者更換教材本體檔案。
 * 與 Backend `materialWorkflow.canReplaceFile()` 一致。
 *
 * `published` 不可換 —— 那等於在買家背後偷換已售出的商品；
 * `pending_review` 不可換 —— 會讓 Admin 正在審的東西在腳下改變。
 * 兩者都不是「還沒做」，是刻意不做，因此 UI 要說明原因而不是只把按鈕灰掉。
 */
export function canReplaceMaterialFile(status?: string | null): boolean {
  return status === "changes_requested" || status === "unpublished";
}

/** 不能更換教材檔案時，要告訴創作者的原因。 */
export function materialFileLockReason(status?: string | null): string {
  if (status === "published") {
    /*
     * `PRE-14`：原本只寫「請聯絡平台」，而 repo 裡沒有任何管道可以照做。
     * 前端知道路由，因此這裡用 Owner 核准的 URL 版文案；Backend 的對應訊息
     * （`routes/materials.js`）拿不到可靠的前端路由，用的是「頁面名稱」版。
     */
    return "已上架的教材無法更換教材檔案。買家已經購買了目前這個版本；如需更換內容，請至「聯絡平台」（/support）查看聯絡方式，或另建新教材。";
  }
  if (status === "pending_review") {
    return "教材審核中，無法更換教材檔案。請等待審核結果後再調整。";
  }
  return "目前狀態無法更換教材檔案。";
}

/** 需要創作者採取行動的狀態（清單排序與提示用）。 */
export function needsCreatorAction(status?: string | null): boolean {
  return canResubmit(status);
}
