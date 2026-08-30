/**
 * API 的終端錯誤回應（`COR-07`）。
 *
 * ## 問題
 *
 * 這個 app **沒有**註冊任何 terminal handler，所以每一個沒被 route 處理掉的請求
 * 最後都落到 Express 的 `finalhandler`，而它回的是 **HTML**：
 *
 *   - 壞掉的 percent-encoding（`/materials/100%`、`%C0%80`、`%ZZ`、不完整的多位元組序列）
 *     會在 router 解碼 param 時丟 `URIError` —— 請求**從未進到任何 handler**，
 *     因此 `COR-05` 的 NUL guard 也攔不到（它是在更後面的 routing 階段才炸）。
 *   - 壞掉的 JSON body 會由 `express.json()` 丟 `SyntaxError`。
 *   - 比對不到任何 route 的路徑會得到 `Cannot GET /x`。
 *
 * 前兩者在 `NODE_ENV` 未設定時，body 會夾帶**完整 stack trace 與絕對檔案路徑**
 * （實測 `GET /materials/100%` 匿名可取得 9 條 `C:\...\node_modules\...` 路徑
 * 以及相依套件名稱）—— 等於免費送出一份環境指紋。
 *
 * ## 為什麼不能只設 `NODE_ENV=production`
 *
 * 實測（同一棵樹、`PORT=3002`、`NODE_ENV=production`）：body 確實不再帶 stack，
 * 但**仍然是 `text/html`**（`<pre>Bad Request</pre>`）。也就是說環境變數只擋掉了
 * 「資訊外洩」，沒有滿足「API 一律回 JSON error contract」這件事。
 * 而且它是一個沒有任何保障的環境設定 —— repo 目前沒有部署設定（見 `PRE-01`），
 * 「上線時會不會記得設」不能當成唯一防線。因此契約必須由 app 自己保證。
 *
 * `NODE_ENV=production` 仍然值得設，但它現在是 **defense in depth**，不是修法。
 */

/** 既有的 generic 500 契約（`routes/*.js` 各處自己 catch 時用的也是這一句）。 */
const GENERIC_SERVER_ERROR = { message: "server error" };

/**
 * 比對不到任何 route。
 *
 * 掛在**所有 router 之後、error handler 之前**。回 JSON 而不是 Express 預設的
 * `Cannot GET /x` HTML —— 那句話本身沒有外洩，但它讓 API 的錯誤格式不一致。
 */
function notFoundJson(_req, res) {
  return res.status(404).json({
    error: "not_found",
    message: "Route not found.",
  });
}

/**
 * 這個 error 是不是「請求本身壞掉」而不是「伺服器出事」。
 *
 * 只認**明確可辨識**的兩類，不做「凡是 4xx 都當 client error」的寬鬆推斷：
 *   - `URIError`：router 解碼 path param 失敗（壞掉的 percent-encoding）
 *   - `entity.parse.failed`：`express.json()` 解析 body 失敗
 *
 * 其餘一律走 500 —— 這裡**不得**變成「把所有 Error 都回 400」的萬用出口。
 */
function isMalformedRequest(err) {
  if (err instanceof URIError) return true;
  if (err && err.type === "entity.parse.failed") return true;
  return false;
}

/**
 * 終端 error handler。必須是**最後**一個 `app.use`，且必須保留四個參數
 * —— Express 是用 arity 判斷 error middleware 的。
 *
 * 回應**只有兩種**，都不帶 `err.message`（那正是 stack／路徑外洩的來源）：
 *   - 400 `invalid_request` —— 請求壞掉
 *   - 500 `{ message: "server error" }` —— 與既有 route-level catch 的契約一致
 *
 * 完整錯誤仍然印在**伺服器端**：可觀測性不該靠把 stack 送給呼叫端換來。
 */
function jsonErrorHandler(err, req, res, next) {
  /*
   * 已經開始送回應就不要再蓋一次（例如檔案串流到一半失敗）。
   * 交回 Express 預設行為讓它把連線收掉，硬寫會變成 ERR_HTTP_HEADERS_SENT。
   */
  if (res.headersSent) return next(err);

  if (isMalformedRequest(err)) {
    console.error(`malformed request rejected: ${req.method} ${req.originalUrl} (${err.name})`);
    return res.status(400).json({
      error: "invalid_request",
      message: "The request could not be parsed.",
    });
  }

  console.error("unhandled server error:", err);
  return res.status(500).json(GENERIC_SERVER_ERROR);
}

module.exports = {
  notFoundJson,
  jsonErrorHandler,
  isMalformedRequest,
};
