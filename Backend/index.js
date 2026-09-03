const fs = require("fs");
const path = require("path");
const envPath =
  [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")].find((p) => fs.existsSync(p)) ??
  path.join(__dirname, ".env");
require("dotenv").config({ path: envPath });
const express = require("express");
const app = express();

const authRouter = require("./routes/auth");
const downloadRouter = require("./routes/download");
const materialsRouter = require("./routes/materials");
const cartRouter = require("./routes/cart");
const orderRouter = require("./routes/order");
const reviewRoutes = require("./routes/review.routes");
const meRouter = require("./routes/me");
const complaintsRouter = require("./routes/complaints");
const reportsRouter = require("./routes/reports");
const adminRouter = require("./routes/admin");
const adminActivityLogsRouter = require("./routes/adminActivityLogs");
const adminLegalDocumentsRouter = require("./routes/adminLegalDocuments");
const adminPrivacyRequestsRouter = require("./routes/adminPrivacyRequests");
const legalRouter = require("./routes/legal");
const teacherSalesRouter = require("./routes/teacherSales");
const teacherUploadRouter = require("./routes/teacherUpload");
const creatorCasesRouter = require("./routes/creatorCases");
const paymentRouter = require("./routes/payment");
const { ensureCoreTables } = require("./models/bootstrapModel");
const { assertProductionConfigContract } = require("./config/productionUrlContract");
const { assertProductionSmtpContract } = require("./config/smtpContract");
const { rejectNulBytePathParams } = require("./utils/pathParams");
const { notFoundJson, jsonErrorHandler } = require("./middlewares/errorResponses");
const { setupSwagger } = require("./swagger");
app.use(express.json());
setupSwagger(app);

/*
 * Path 參數的輸入邊界（`COR-05`）—— 必須掛在**所有** router 之前。
 *
 * `%00` 解碼後是 NUL byte，而 PostgreSQL 的 `text` 裝不下它：任何把它當識別碼
 * 送進查詢的 route 都會炸在 `22021 invalid byte sequence` 並回一個通用 500。
 * 實測受影響的不只素材端點 —— `/materials/:id`、`/:id/reviews`、`/:id/rating`、
 * `/:id/rating-distribution`、`/materials/media/:mediaId` 全部匿名可觸發，
 * 另有數條需登入的 route（`/download/:materialId`、`/me/orders/:orderId`、
 * `/admin/report-cases/:id`…）在通過 auth 之後同樣會倒。
 *
 * 擋在這一層而不是每條 route 各加一次判斷，理由是：這不是某個 route 的商業規則，
 * 而是「NUL byte 永遠不可能是合法識別碼」這件事本身；逐條加只會漏掉下一條新 route。
 * 這**不是** generic 的 validation framework，也**不是** catch PG 錯誤碼 ——
 * 它只擋一種輸入，而且擋在進 DB 之前（理由與 400 的選擇見 `utils/pathParams.js`）。
 */
app.use(rejectNulBytePathParams);

/*
 * `/uploads` 曾經是**所有**產品素材的公開靜態目錄。兩輪 security 收斂之後，
 * 平台自己產生的檔案**沒有任何一種**還留在這裡：
 *
 *   付款憑證     → private-storage/payment-proofs/   （SEC-01）
 *   教材本體     → private-storage/material-files/   （從一開始就沒進來過）
 *   行銷素材     → private-storage/material-media/   （SEC-02）
 *
 * static 仍然掛著，是因為它服務的是與這三者無關的既有靜態檔；新的上傳能力
 * **不得**再寫進這個 tree（見 docs/material-file-storage-and-delivery.md §23.3 分類表）。
 *
 * 下面兩個 handler 掛在 static 之前，是**深度防禦**：即使有人日後把檔案放回那些
 * 目錄、或搬移腳本漏了一個檔，這兩條路徑也不會再吐出任何位元組。
 * 不是 410 而是 404 —— 這些路徑對外從此就是不存在，沒有必要承認它們曾經存在。
 */
app.use("/uploads/payment-proofs", (_req, res) => {
  res.status(404).json({
    error: "payment_proof_not_public",
    message:
      "Payment proofs are not public assets. Use GET /orders/:orderId/payment-proofs/:proofId/file.",
  });
});

/*
 * 行銷素材（封面／詳情圖／試看影片）不再由 static 無條件供應。
 *
 * 它們**大多數確實是公開的** —— 已上架教材的封面本來就要給匿名訪客看。問題在於
 * `express.static` 沒有「條件」：未上架與已下架教材的素材同樣被吐出來，只靠 12 個
 * hex 的隨機檔名保護。而 URL 一旦被爬蟲、分享或快取記下，下架就再也撤不回來 ——
 * 這正是 SEC-02 的 root cause，也是為什麼「反正大部分要公開」不能當作留在 static 的理由。
 *
 * 現在一律走 `GET /materials/media/:mediaId`，可見性由所屬教材的 status 決定。
 */
app.use("/uploads/material-media", (_req, res) => {
  res.status(404).json({
    error: "material_media_not_public",
    message:
      "Material media is no longer served from /uploads. Use GET /materials/media/:mediaId.",
  });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/auth", authRouter);
app.use("/download", downloadRouter);
app.use("/materials", materialsRouter);
app.use("/cart", cartRouter);
app.use("/orders", orderRouter);
app.use("/reviews", reviewRoutes);
// 消費申訴掛在 /me 之下（P1-09 Gate 3）—— 刻意不開新的 root prefix，
// 因為 `me` 已在前端 proxy 的 ALLOW_ROOT 內（CLAUDE.md §5）。
// 必須掛在 meRouter 之前：後者有 `/:...` 形式的路由會先吃掉 /me/complaints。
app.use("/me/complaints", complaintsRouter);
app.use("/me", meRouter);
app.use("/reports", reportsRouter);
/*
 * 人工轉帳的收款帳戶。唯一持有者是 `config/paymentBankInfo.js` ——
 * 結帳頁、付款憑證頁與訂單成立通知信先前各自硬編碼一份（三份都是佔位帳號）。
 */
app.use("/payment", paymentRouter);
app.use("/admin", adminRouter);
app.use("/admin", adminActivityLogsRouter);
app.use("/admin", adminLegalDocumentsRouter);
// 個資權利請求（`OPS-04`）—— **獨立於 /admin/complaints 的 domain**，
// 不是消費申訴的一種類型（`DEC-LEGAL-13`）。
app.use("/admin", adminPrivacyRequestsRouter);
/*
 * 法律文件的 public 讀取。**刻意沒有 requireAuth** —— 條款必須讓尚未註冊的人
 * 在同意之前就能完整閱讀（消保法 §11-1 審閱期的前提）。只吐 published 版本。
 */
app.use("/legal", legalRouter);
app.use("/teacher/sales", teacherSalesRouter);
/*
 * Creator 端的平台案件（檢舉）介面。掛在兩個路徑上：`/creator/cases` 是 canonical，
 * `/teacher/cases` 是相容別名 —— 技術角色仍叫 teacher，Web 的 `/teacher/*` 也還在
 * 308 導向 `/creator/*` 的過渡期。兩者是同一個 router，行為不會分歧。
 *
 * 必須掛在 `teacherUploadRouter` 之前：後者用 `app.use("/teacher", ...)` 這種寬前綴，
 * 順序顛倒時 `/teacher/cases` 會先落到它身上。
 */
app.use("/creator/cases", creatorCasesRouter);
app.use("/teacher/cases", creatorCasesRouter);
app.use("/teacher", teacherUploadRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/*
 * 終端處理（`COR-07`）—— 必須掛在**所有 route 之後**，且順序不可調換。
 *
 * 這個 app 先前沒有註冊任何 terminal handler，於是所有沒被 route 處理掉的請求都落到
 * Express 的 `finalhandler`，回的是 HTML；壞掉的 percent-encoding（`/materials/100%`）
 * 與壞掉的 JSON body 更會在 body 裡夾帶**完整 stack 與絕對檔案路徑**，且**未授權即可觸發**。
 *
 * 注意這與 `COR-05` 的 NUL guard 是**不同的邊界**，兩者都需要：
 *   - `COR-05`（router 之前）：合法解碼、但 PostgreSQL 裝不下的 NUL byte
 *   - `COR-07`（router 之後）：**根本解不開**的 percent-encoding —— 它在 router 比對
 *     param 時就丟 `URIError`，請求從未進到任何 handler，前面的 guard 攔不到
 *
 * 只設 `NODE_ENV=production` **不算修好**：實測那樣仍回 `text/html`，
 * 只是不再帶 stack。契約要由 app 自己保證，不是靠記得設環境變數。
 */
app.use(notFoundJson);
app.use(jsonErrorHandler);

const rawPort = Number.parseInt(String(process.env.PORT ?? "3000"), 10);
const listenPort =
  Number.isFinite(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 3000;
/*
 * `PRE-12`：對外 URL 契約必須在**任何**啟動步驟之前確立。
 *
 * 放在 `ensureCoreTables()` 之前是刻意的 —— 設定缺漏時不該先去動資料庫，
 * 更不該讓服務進入「可接受請求」的狀態。`PUBLIC_BACKEND_URL` 缺漏的代價是
 * **把 localhost 絕對網址永久寫進資料列**，那無法靠事後補設定修復。
 *
 * 這裡不把錯誤降級成警告：印出可行動的訊息之後 **exit 1**，
 * 與 `JWT_SECRET`／私有儲存的 fail-closed 是同一種取捨。
 */
/*
 * `REL-03`：SMTP 設定契約，與上面同一個時機、同一種取捨。
 *
 * **條件式**（Owner decision，2026-09-03）：五個 `SMTP_*` 全不存在時允許啟動
 * （`DEC-17` 明示 MVP 初期不啟用郵件，現行 production 正是如此）；
 * 但只要有人設了其中任何一個，就代表**打算啟用**，此時整份契約必須成立 ——
 * 半套設定會讓服務照常收單卻一封信都不寄，那是部署錯誤，應該當場顯現。
 */
try {
  assertProductionConfigContract();
  assertProductionSmtpContract();
} catch (err) {
  console.error(`production configuration contract failed: ${err.message}`);
  console.error(
    "Exiting with code 1: fix the environment before starting " +
      "(see docs/production-environment-contract.md and Backend/config/productionUrlContract.js)."
  );
  process.exit(1);
}

ensureCoreTables()
  .then(() => {
    // Do not pass a callback to app.listen: Express 5 registers that fn with
    // server.once("error", ...), so EADDRINUSE can still invoke the "success" callback
    // and the process exits when the bind actually failed.
    const server = app.listen(listenPort);
    server.once("listening", () => {
      console.log(`Server running on port ${listenPort}`);
    });
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${listenPort} is already in use (PID on Windows: check netstat -ano). Stop that process, or set PORT in .env / environment.`
        );
      } else {
        console.error("HTTP server failed to start:", err.message || err);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("database bootstrap failed:", err);
    console.error(
      "Exiting with code 1: fix DB/migrations first (see Backend/models/bootstrapModel.js)."
    );
    process.exit(1);
  });
