/**
 * 把一個檔案串流成 HTTP 下載回應。
 *
 * Admin 審閱下載與買家下載共用這一份 —— 兩邊的**授權**完全不同，
 * 但「怎麼把位元組交出去」必須一致，否則會出現一邊檔名正確、另一邊亂碼的狀況。
 */

/**
 * 組 `Content-Disposition`。
 *
 * 兩個 filename 參數是**刻意**都給的（RFC 6266 / RFC 5987）：
 *   - `filename=`  ASCII fallback，給不懂 `filename*` 的舊 client
 *   - `filename*=` UTF-8 百分比編碼，中文檔名靠它才不會變成問號
 *
 * 只留 ASCII fallback 會讓「三年級數學練習.pdf」下載成 `_____.pdf`；
 * 只留 `filename*` 則某些舊環境會退回用 URL 尾段當檔名。
 */
function contentDisposition(originalFilename, disposition = "attachment") {
  const type = disposition === "inline" ? "inline" : "attachment";
  const name = String(originalFilename || "download");
  // 引號與反斜線會破壞 header 語法；控制字元與路徑分隔符則是 header injection 的來源。
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\/\r\n]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * 串流一個教材檔案給 client。
 *
 * `Content-Length` 取自實際的 stat 而不是 DB 的 `size_bytes`：兩者不一致代表
 * 儲存後端出了事，此時應該讓瀏覽器看到真實長度而不是一個對不上的宣告值
 * （對不上的 Content-Length 會讓下載看起來成功、檔案其實是壞的）。
 *
 * 快取**預設**關掉：教材本體與付款憑證是付費內容或敏感交易檔案，經過的任何 proxy
 * 都不該留下副本。唯一的例外由呼叫端明示 `cacheControl` —— 已上架教材的封面本來
 * 就是公開行銷素材（`services/materialMedia.service.js`），對它套 `no-store` 只會
 * 讓每一次商品頁瀏覽都重新下載一次圖。預設值維持保守，要放寬必須寫出來。
 *
 * ## `disposition`
 *
 * 預設 `attachment`（教材本體：使用者要的是一個檔案）。付款憑證的 Admin 審核需要
 * **inline** —— 審核者要看的是影像本身，強迫每次先下載到電腦再開，等於把一個
 * 每天要做幾十次的動作變成三個步驟。inline 的風險由兩件事壓住：`X-Content-Type-Options:
 * nosniff` 與「憑證只可能是 JPEG/PNG/WebP」（型別在上傳時已由 magic bytes 驗過，
 * 且 `Content-Type` 用的是平台的 canonical 值，不是 client 宣告值）。
 *
 * @param {import("express").Response} res
 * @param {{file: object, stream: import("stream").Readable, sizeBytes: number,
 *          disposition?: "attachment"|"inline", cacheControl?: string}} args
 */
function sendFileDownload(
  res,
  { file, stream, sizeBytes, disposition = "attachment", cacheControl = "private, no-store" }
) {
  res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", contentDisposition(file.original_filename, disposition));
  res.setHeader("Content-Length", String(sizeBytes));
  res.setHeader("Cache-Control", cacheControl);
  // 讓瀏覽器不要對 Content-Type 做嗅探 —— 教材檔案沒有理由被當成別的東西執行。
  res.setHeader("X-Content-Type-Options", "nosniff");

  stream.on("error", (err) => {
    console.error("private file stream failed:", err.message);
    // header 已經送出就不能再改 status；直接切斷連線讓 client 知道下載不完整。
    if (!res.headersSent) res.status(503).json({ message: "file temporarily unavailable" });
    else res.destroy(err);
  });

  // client 中途取消時要主動關掉檔案句柄，否則長時間下載會累積洩漏。
  res.on("close", () => stream.destroy());

  stream.pipe(res);
}

module.exports = { contentDisposition, sendFileDownload };
