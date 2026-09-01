/**
 * Backend 對外可達的 base URL。
 *
 * 需要它的場合有一個共同點：**產生的 URL 要交給瀏覽器直接打，不能經過 Next proxy**。
 *   - 上傳後回傳的素材 URL
 *   - 教材下載連結（`/api/backend/[...path]` 會把回應當文字讀，二進位會壞掉）
 *
 * 部署時以 `PUBLIC_BACKEND_URL` 明確指定；本機開發退回 `http://localhost:<PORT>`。
 */
function publicBaseUrl() {
  const explicit = process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL;
  if (explicit && String(explicit).trim()) {
    return String(explicit).replace(/\/$/, "");
  }
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

module.exports = { publicBaseUrl };
