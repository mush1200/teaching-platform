/**
 * Path 參數的輸入邊界（`COR-05`）。
 *
 * ## 問題
 *
 * URL path 裡的 `%00` 會被解碼成 NUL byte（`U+0000`）。PostgreSQL 的 `text` 欄位
 * **無法**儲存或比對 NUL，因此任何把它當成識別碼送進查詢的 route 都會炸在
 * `22021 invalid byte sequence for encoding "UTF8": 0x00`，對外回一個通用 500。
 *
 * 沒有資料外洩（回應只有 `{"message":"server error"}`），但：
 *
 *   - 未授權端點上、由攻擊者完全控制的輸入，每次都會在伺服器印一份 stack trace，
 *     可以拿來灌 log；
 *   - 「服務真的壞了」與「有人餵了怪字元」在監控上長得一模一樣。
 *
 * ## 為什麼是「拒收 NUL」而不是「驗證識別碼格式」
 *
 * 這個 repo 的識別碼**不是 UUID**：`materials.id` 與 `material_media_files.id`
 * 都是 `text`，值長得像 `mat_mt4n1tppwgtnpe`（應用層產生）。也就是說沒有一個
 * 可以拿來擋的格式 —— 任何字串都是合法的查詢輸入，查不到就是 404。
 *
 * **唯一**永遠不可能合法的，是 PostgreSQL 的 `text` 型別根本裝不下的 NUL byte。
 * 因此這裡只擋那一件事，不發明額外的格式限制（那會把合法的 id 擋在門外）。
 *
 * ## 為什麼擋在這裡，而不是 catch `22021`
 *
 * 把 PG 的錯誤碼統一轉成 400 等於讓「輸入不合法」與「資料庫真的出事」共用同一條
 * 路徑，也會把未來其他來源的 encoding 錯誤一起吞掉。輸入要在**進 DB 之前**被拒絕。
 */

/** URL path 裡唯一能解出 NUL byte 的編碼。`%2500` 解出來是字面的 `%00`，是合法文字。 */
const ENCODED_NUL_PATTERN = /%00/i;
// 原始碼裡不放字面上的 NUL byte（不可見、容易在重排／複製時遺失）。
const NUL = String.fromCharCode(0);

/** 任何字串值是否含 NUL byte。 */
function hasNulByte(value) {
  return typeof value === "string" && value.includes(NUL);
}

/**
 * 這條 request 的 path 解碼後是否會產生 NUL byte。
 *
 * 只看 path，不看 query string：query 由 `express.query` 解析，且既有 route 對
 * query 的處理已各自有 allowlist / 型別轉換。這裡處理的是 `COR-05` 實際重現的那一類。
 *
 * 遇到本來就壞掉的 percent-encoding（例如 `/materials/100%`）**不介入** ——
 * Express 自己已經回 400，這裡不要再蓋掉它的行為。
 */
function pathHasNulByte(rawPath) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  if (rawPath.includes(NUL)) return true;
  return ENCODED_NUL_PATTERN.test(rawPath);
}

/**
 * Express middleware：掛在所有 router **之前**，讓非法識別碼在碰到任何 handler
 * （以及任何 DB 查詢）之前就被擋下。
 *
 * 回 **400** 而不是 404，理由是與 repo 既有語意一致：
 *   - 404 = 「查了，沒有這筆」（`material not found` / `media_not_found`）
 *   - 400 = 「這個請求本身不合法」—— Express 對壞掉的 percent-encoding 已經回 400
 * NUL byte 不可能識別到任何資源，它是壞掉的請求，不是找不到的資源。
 * 用 404 反而會讓它與真實的查無資料無法區分，正是 `COR-05` 抱怨的監控問題。
 *
 * 回應維持既有的 `{ error, message }` 形狀，且**不得**帶 PG 錯誤碼、SQL、stack
 * 或檔案路徑。
 */
function rejectNulBytePathParams(req, res, next) {
  if (pathHasNulByte(req.path)) {
    return res.status(400).json({
      error: "invalid_path_parameter",
      message: "Path parameters must not contain NUL bytes.",
    });
  }
  return next();
}

module.exports = {
  hasNulByte,
  pathHasNulByte,
  rejectNulBytePathParams,
};
