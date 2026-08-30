/**
 * 「這份教材真的交付得出東西嗎？」—— 付費商品的可交付性不變條件。
 *
 * ## 為什麼需要這個模組
 *
 * 先前系統只檢查 `materials.status === 'published'` 就允許加入購物車、建立訂單。
 * 但 `published` 只代表「通過審核、對外可見」，**不代表有檔案可以下載**。
 * 兩者脫鉤的後果是買家付了錢、通過付款審核之後，在「我的教材」按下下載才看到
 * 「此教材目前尚未提供可下載檔案」—— 失敗發生在**收款之後**，而且沒有自助補救路徑。
 *
 * 因此把它升級成一條 server 端的不變條件：
 *
 *   **一份教材若沒有 `approved_file_id`，就不得成為可購買的付費商品。**
 *
 * ## 三道防線（縱深，不是三選一）
 *
 * 1. **核准上架時拒絕**（`POST /admin/materials/:id/approve`）—— 阻止新的違反產生。
 * 2. **加入購物車時拒絕** —— legacy 已上架資料仍可能違反，這裡是買家最早撞到的地方。
 * 3. **建立訂單時拒絕**（在既有 transaction 內）—— 最後一道；購物車可能停留很久，
 *    期間教材的檔案狀態可能改變，而這是**唯一**與收款同一個 transaction 的檢查點。
 *
 * 只做第 1 道不夠（legacy 資料已經違反了）；只做第 3 道也不夠
 * （買家會在結帳最後一步才被擋，體驗上等同於白填一輪）。
 *
 * ## legacy 資料刻意不改
 *
 * 現存已上架但無檔案的教材**不下架、不改 DB**：`status` 是審核軌跡的一部分，
 * 大量回填會抹掉「它曾經通過審核」這件事實。改成在**販售路徑**上擋住，
 * 並讓前台明確顯示「暫停販售」。
 *
 * **既有 entitlement 不受影響**：本模組只在購買路徑使用，
 * 完全不碰 `download` 的授權判斷 —— 已經買到的人該拿得到什麼，
 * 由 `materialFile.service.js` 依 `approved_file_id` 自行決定，語意未變
 * （CLAUDE.md §5：買家授權綁定教材而非版本，且不看 `materials.status`）。
 */

/** 買家可見的統一文案。三道防線與前台共用同一句，避免同一件事出現三種說法。 */
const MATERIAL_NOT_DELIVERABLE_MESSAGE = "此教材目前沒有可供下載的教材檔案，已暫停販售。";

/** Admin 核准上架被擋下時的說明 —— 對象是管理員，講的是「怎麼解」。 */
const MATERIAL_NOT_DELIVERABLE_ADMIN_MESSAGE =
  "此教材沒有可交付的教材檔案，不能核准上架。請退回並要求創作者上傳教材檔案。";

/**
 * @param {{approved_file_id?: unknown} | null | undefined} material
 * @returns {boolean} 是否具備可交付給買家的檔案
 */
function isDeliverable(material) {
  if (!material) return false;
  const id = material.approved_file_id;
  return id !== null && id !== undefined && String(id).length > 0;
}

/** `isDeliverable` 的否定形式，讓呼叫端的 if 讀起來是正面敘述。 */
function isNotDeliverable(material) {
  return !isDeliverable(material);
}

module.exports = {
  MATERIAL_NOT_DELIVERABLE_MESSAGE,
  MATERIAL_NOT_DELIVERABLE_ADMIN_MESSAGE,
  isDeliverable,
  isNotDeliverable,
};
